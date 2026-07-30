import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";
import { useAppData } from "@/lib/appData";
import { kyren } from "@/api/kyrenClient";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
    CheckCircle2, Circle, Clock, ArrowRight, Sparkles,
    ListChecks, AlertCircle, ChevronRight, Loader2
} from "lucide-react";
import { architectCourse } from "@/lib/aiAgents";
import { cn } from "@/lib/utils";

const STATUS_CONFIG = {
    "Detected": { color: "text-amber-500 bg-amber-500/10", icon: AlertCircle },
    "Suggested": { color: "text-primary bg-primary/10", icon: Circle },
    "Approved": { color: "text-primary bg-primary/10", icon: CheckCircle2 },
    "In Progress": { color: "text-primary bg-primary/10", icon: Loader2 },
    "Completed": { color: "text-green-500 bg-green-500/10", icon: CheckCircle2 },
    "Mastered": { color: "text-green-500 bg-green-500/10", icon: CheckCircle2 },
};

export default function LearningTasks() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { learningTasks, activityLogs, refreshAll, refreshTasks } = useAppData();
    const [generating, setGenerating] = useState(null);

    const sortedTasks = [...learningTasks].sort((a, b) => (a.priority || 999) - (b.priority || 999));

    const handleStartLearning = async (task) => {
        setGenerating(task.id);
        try {
            const courseStructure = await architectCourse({
                task,
                userLanguage: localStorage.getItem("kyren-language") || "en",
                userGoal: user?.learning_goal || task.title,
            });

            const course = await kyren.entities.Course.create({
                user_id: user.id,
                title: courseStructure.course.title,
                description: courseStructure.course.description,
                difficulty: courseStructure.course.difficulty || task.difficulty,
                estimated_duration: courseStructure.course.estimated_duration,
                learning_objectives: courseStructure.course.learning_objectives || [],
                language: localStorage.getItem("kyren-language") || "en",
                generated_from_task_id: task.id,
                status: "published",
                progress: 0,
            });

            await kyren.entities.LearningTask.update(task.id, {
                status: "In Progress",
                course_id: course.id,
            });

            // Create modules
            for (let mi = 0; mi < courseStructure.modules.length; mi++) {
                const mod = courseStructure.modules[mi];
                const moduleRecord = await kyren.entities.Module.create({
                    course_id: course.id,
                    title: mod.title,
                    objective: mod.objective,
                    mastery_threshold: mod.mastery_threshold || 80,
                    order_index: mi,
                });
                for (const lesson of mod.lessons) {
                    await kyren.entities.Lesson.create({
                        module_id: moduleRecord.id,
                        course_id: course.id,
                        title: lesson.title,
                        description: lesson.description,
                        order_index: lesson.order_index || 0,
                        completed: false,
                        skill_id: task.skill_id,
                        skill_name: task.skill_name,
                    });
                }
            }

            await kyren.entities.TaskActivityLog.create({
                user_id: user.id,
                task_id: task.id,
                task_title: task.title,
                event_type: "status_changed",
                before_state: task.status,
                after_state: "In Progress",
                message: `${task.title} started`,
            });

            toast.success("Course generated! Redirecting...");
            await refreshAll();
            navigate(`/courses/${course.id}`);
        } catch (e) {
            console.error(e);
            toast.error("Failed to generate course.");
        } finally {
            setGenerating(null);
        }
    };

    return (
        <div className="p-6 md:p-8 max-w-5xl mx-auto">
            <div className="mb-6">
                <h1 className="text-2xl md:text-3xl font-bold mb-2">My Learning Tasks</h1>
                <p className="text-muted-foreground">Your dynamic learning path. Tasks are automatically reordered as KYREN detects new gaps.</p>
            </div>

            {/* Activity Timeline */}
            {activityLogs.length > 0 && (
                <div className="mb-6 p-4 rounded-2xl border border-border bg-muted/30">
                    <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                        <ListChecks className="w-4 h-4 text-primary" />
                        Activity Timeline
                    </h3>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                        {activityLogs.slice(0, 10).map((log, i) => (
                            <motion.div
                                key={log.id || i}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.05 }}
                                className="flex items-center gap-3 text-sm"
                            >
                                <div className={cn(
                                    "w-2 h-2 rounded-full shrink-0",
                                    log.event_type === "gap_detected" ? "bg-amber-500" :
                                        log.event_type === "reordered" ? "bg-primary" :
                                            log.event_type === "completed" ? "bg-green-500" : "bg-slate-400"
                                )} />
                                <span className="text-muted-foreground">{log.message}</span>
                                <span className="text-xs text-muted-foreground/60 ml-auto">
                                    {new Date(log.created_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                </span>
                            </motion.div>
                        ))}
                    </div>
                </div>
            )}

            {/* Tasks */}
            {sortedTasks.length === 0 ? (
                <div className="text-center py-16">
                    <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                        <ListChecks className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h2 className="text-xl font-semibold mb-2">No Learning Tasks Yet</h2>
                    <p className="text-muted-foreground mb-6">Talk to KYREN to discover what you need to learn.</p>
                    <Button onClick={() => navigate("/companion")} className="bg-primary">
                        <Sparkles className="w-4 h-4 mr-2" />
                        Talk to KYREN
                    </Button>
                </div>
            ) : (
                <div className="space-y-3">
                    {sortedTasks.map((task, i) => {
                        const config = STATUS_CONFIG[task.status] || STATUS_CONFIG["Detected"];
                        const StatusIcon = config.icon;
                        const canStart = task.status === "Approved" || task.status === "Detected" || task.status === "Suggested";

                        return (
                            <motion.div
                                key={task.id}
                                layout
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="p-5 rounded-2xl border border-border bg-card hover:shadow-md transition group"
                            >
                                <div className="flex items-start gap-4">
                                    <div className="flex flex-col items-center gap-1 shrink-0">
                                        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary font-bold flex items-center justify-center">
                                            {task.priority || i + 1}
                                        </div>
                                        {i < sortedTasks.length - 1 && <div className="w-0.5 h-6 bg-border" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="font-medium">{task.title}</h3>
                                            <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1", config.color)}>
                                                <StatusIcon className="w-3 h-3" /> {task.status}
                                            </span>
                                        </div>
                                        <p className="text-sm text-muted-foreground mb-2">{task.description}</p>
                                        <div className="text-xs text-muted-foreground italic mb-2">Why: {task.reason}</div>
                                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {task.estimated_time || "30 min"}</span>
                                            <span>·</span>
                                            <span className="capitalize">{task.difficulty}</span>
                                        </div>
                                    </div>
                                    <div className="shrink-0">
                                        {canStart && (
                                            <Button
                                                size="sm"
                                                onClick={() => handleStartLearning(task)}
                                                disabled={generating === task.id}
                                                className="bg-primary"
                                            >
                                                {generating === task.id ? (
                                                    <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Generating...</>
                                                ) : (
                                                    <>Start Learning <ArrowRight className="w-3.5 h-3.5 ml-1" /></>
                                                )}
                                            </Button>
                                        )}
                                        {task.status === "In Progress" && task.course_id && (
                                            <Button size="sm" variant="outline" onClick={() => navigate(`/courses/${task.course_id}`)}>
                                                Continue <ChevronRight className="w-3.5 h-3.5 ml-1" />
                                            </Button>
                                        )}
                                        {(task.status === "Completed" || task.status === "Mastered") && (
                                            <span className="text-xs text-green-500 flex items-center gap-1">
                                                <CheckCircle2 className="w-4 h-4" /> Done
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
