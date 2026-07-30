import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";
import { useAppData } from "@/lib/appData";
import { kyren } from "@/api/kyrenClient";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
    Check, ArrowLeft, Sparkles, Network,
    Loader2, Edit, Trash2, MessageSquare
} from "lucide-react";
import { architectCourse, generateLessonContent, generateQuiz } from "@/lib/aiAgents";
import { getSkillById, getDirectPrerequisites } from "@/lib/skillsGraph";
import { cn } from "@/lib/utils";

export default function Confirmation() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { learningTasks, masteryScores, refreshAll } = useAppData();
    const [editMode, setEditMode] = useState(false);
    const [tasks, setTasks] = useState([]);
    const [generating, setGenerating] = useState(false);
    const [generatingStep, setGeneratingStep] = useState("");

    const userId = user?.id;
    const detectedTasks = learningTasks.filter(t => t.status === "Detected" || t.status === "Suggested" || t.status === "Approved").sort((a, b) => (a.priority || 0) - (b.priority || 0));

    useEffect(() => {
        setTasks(detectedTasks);
    }, [learningTasks]);

    const handleRemoveTask = async (taskId) => {
        try {
            await kyren.entities.LearningTask.delete(taskId);
            setTasks(tasks.filter(t => t.id !== taskId));
            toast.success("Task removed from your path.");
        } catch (e) {
            toast.error("Failed to remove task.");
        }
    };

    const handleApproveTask = async (taskId) => {
        try {
            await kyren.entities.LearningTask.update(taskId, { status: "Approved" });
            setTasks(tasks.map(t => t.id === taskId ? { ...t, status: "Approved" } : t));
            toast.success("Task approved!");
        } catch (e) {
            toast.error("Failed to approve task.");
        }
    };

    const handleGeneratePlan = async () => {
        const approvedTasks = tasks.filter(t => t.status === "Approved");
        if (approvedTasks.length === 0) {
            // Auto-approve all if none approved
            for (const t of tasks) {
                await kyren.entities.LearningTask.update(t.id, { status: "Approved" });
            }
        }

        setGenerating(true);
        const firstTask = tasks.find(t => t.status === "Approved") || tasks[0];

        try {
            // Step 1: Course Architecture
            setGeneratingStep("Designing course structure...");
            const courseStructure = await architectCourse({
                task: firstTask,
                userLanguage: localStorage.getItem("kyren-language") || "en",
                userGoal: user?.learning_goal || firstTask.title,
            });

            // Create Course
            const course = await kyren.entities.Course.create({
                user_id: userId,
                title: courseStructure.course.title,
                description: courseStructure.course.description,
                difficulty: courseStructure.course.difficulty || firstTask.difficulty,
                estimated_duration: courseStructure.course.estimated_duration,
                learning_objectives: courseStructure.course.learning_objectives || [],
                prerequisite_skill_ids: [],
                language: localStorage.getItem("kyren-language") || "en",
                generated_from_task_id: firstTask.id,
                status: "published",
                progress: 0,
                is_approved: true,
            });

            // Update task status
            await kyren.entities.LearningTask.update(firstTask.id, {
                status: "In Progress",
                course_id: course.id,
            });

            // Step 2: Create Modules
            for (let mi = 0; mi < courseStructure.modules.length; mi++) {
                const mod = courseStructure.modules[mi];
                setGeneratingStep(`Creating module ${mi + 1}: ${mod.title}...`);
                const moduleRecord = await kyren.entities.Module.create({
                    course_id: course.id,
                    title: mod.title,
                    objective: mod.objective,
                    mastery_threshold: mod.mastery_threshold || 80,
                    order_index: mi,
                });

                // Step 3: Create Lessons with content
                for (let li = 0; li < mod.lessons.length; li++) {
                    const lesson = mod.lessons[li];
                    setGeneratingStep(`Generating content for: ${lesson.title}...`);

                    const content = await generateLessonContent({
                        lesson,
                        courseTitle: course.title,
                        moduleTitle: mod.title,
                        difficulty: firstTask.difficulty,
                        language: localStorage.getItem("kyren-language") || "en",
                    });

                    const lessonRecord = await kyren.entities.Lesson.create({
                        module_id: moduleRecord.id,
                        course_id: course.id,
                        title: lesson.title,
                        description: lesson.description,
                        key_concepts: content.key_concepts || [],
                        ai_summary: content.ai_summary || "",
                        order_index: li,
                        completed: false,
                        skill_id: firstTask.skill_id,
                        skill_name: firstTask.skill_name,
                    });

                    // Step 4: Generate quiz for this lesson
                    setGeneratingStep(`Generating quiz for: ${lesson.title}...`);
                    const quizResult = await generateQuiz({
                        lesson: { ...lessonRecord, ...content },
                        courseTitle: course.title,
                        moduleTitle: mod.title,
                        difficulty: firstTask.difficulty,
                        numQuestions: 5,
                    });

                    if (quizResult.questions && quizResult.questions.length > 0) {
                        const quiz = await kyren.entities.Quiz.create({
                            lesson_id: lessonRecord.id,
                            module_id: moduleRecord.id,
                            title: `${lesson.title} Quiz`,
                            difficulty: firstTask.difficulty,
                        });

                        for (const q of quizResult.questions) {
                            await kyren.entities.QuizQuestion.create({
                                quiz_id: quiz.id,
                                question_text: q.question_text,
                                options: q.options,
                                correct_answer: q.correct_answer,
                                difficulty: q.difficulty || firstTask.difficulty,
                            });
                        }
                    }
                }
            }

            toast.success("Your learning plan is ready!");
            await refreshAll();
            navigate(`/courses/${course.id}`);
        } catch (e) {
            console.error("Course generation failed", e);
            toast.error("Failed to generate course. Please try again.");
        } finally {
            setGenerating(false);
            setGeneratingStep("");
        }
    };

    if (detectedTasks.length === 0 && !generating) {
        return (
            <div className="p-6 md:p-8 max-w-3xl mx-auto">
                <div className="text-center py-16">
                    <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                        <Network className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h2 className="text-xl font-semibold mb-2">No Learning Tasks Detected Yet</h2>
                    <p className="text-muted-foreground mb-6">Talk to KYREN to discover what you need to learn.</p>
                    <Button onClick={() => navigate("/ai-tutor")} className="bg-primary">
                        <MessageSquare className="w-4 h-4 mr-2" />
                        Talk to KYREN
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 md:p-8 max-w-4xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-2xl md:text-3xl font-bold mb-2">Here's What We Think You Need to Learn</h1>
                <p className="text-muted-foreground">Review your detected gaps, prerequisite relationships, and recommended sequence. Edit your path or generate your learning plan.</p>
            </div>

            {generating && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center"
                >
                    <div className="text-center max-w-md">
                        <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
                        <h3 className="text-xl font-semibold mb-2">Generating Your Learning Plan</h3>
                        <p className="text-muted-foreground">{generatingStep}</p>
                    </div>
                </motion.div>
            )}

            {/* Task List */}
            <div className="space-y-3 mb-6">
                <div className="flex items-center justify-between">
                    <h2 className="font-semibold flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-primary" />
                        Proposed Learning Path ({tasks.length} steps)
                    </h2>
                    <Button variant="outline" size="sm" onClick={() => setEditMode(!editMode)}>
                        {editMode ? <><Check className="w-3.5 h-3.5 mr-1" /> Done</> : <><Edit className="w-3.5 h-3.5 mr-1" /> Edit My Path</>}
                    </Button>
                </div>

                {tasks.map((task, i) => {
                    const prereqs = getDirectPrerequisites(task.skill_id);
                    return (
                        <motion.div
                            key={task.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className={cn(
                                "p-5 rounded-2xl border transition",
                                task.status === "Approved"
                                    ? "border-green-500/30 bg-green-500/5"
                                    : "border-border bg-muted/30"
                            )}
                        >
                            <div className="flex items-start gap-4">
                                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary text-sm font-bold flex items-center justify-center shrink-0">
                                    {task.priority || i + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className="font-medium">{task.title}</h3>
                                        {task.status === "Approved" && (
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-500">Approved</span>
                                        )}
                                    </div>
                                    <p className="text-sm text-muted-foreground mb-2">{task.description}</p>
                                    <div className="flex items-start gap-2 text-xs text-muted-foreground">
                                        <span className="text-amber-500">Why:</span>
                                        <span className="italic">{task.reason}</span>
                                    </div>
                                    <div className="flex items-center gap-3 mt-3 text-xs">
                                        <span className="text-muted-foreground">{task.estimated_time || "30 min"}</span>
                                        <span className="text-muted-foreground">·</span>
                                        <span className="capitalize text-muted-foreground">{task.difficulty}</span>
                                        {prereqs.length > 0 && (
                                            <>
                                                <span className="text-muted-foreground">·</span>
                                                <span className="text-muted-foreground">Prerequisites: {prereqs.map(p => getSkillById(p)?.name).join(", ")}</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                                {editMode ? (
                                    <div className="flex gap-1">
                                        <button onClick={() => handleApproveTask(task.id)} className="p-2 rounded-lg hover:bg-green-500/10 text-green-500" title="Approve">
                                            <Check className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => handleRemoveTask(task.id)} className="p-2 rounded-lg hover:bg-destructive/10 text-destructive" title="Remove">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="text-2xl text-muted-foreground shrink-0">{i < tasks.length - 1 ? "↓" : ""}</div>
                                )}
                            </div>
                        </motion.div>
                    );
                })}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-3 pt-6 border-t border-border">
                <Button onClick={handleGeneratePlan} disabled={generating} className="bg-primary">
                    {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                    Generate My Learning Plan
                </Button>
                <Button variant="outline" onClick={() => navigate("/companion")}>
                    <MessageSquare className="w-4 h-4 mr-2" />
                    Tell AI More
                </Button>
                <Button variant="ghost" onClick={() => navigate("/dashboard")}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Dashboard
                </Button>
            </div>
        </div>
    );
}
