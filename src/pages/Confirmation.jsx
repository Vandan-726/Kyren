import React, { useState, useEffect, useCallback } from "react";
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
import { architectCourse, generateLessonContent, generateQuiz, planLearningTasks } from "@/lib/aiAgents";
import { getSkillById, getDirectPrerequisites } from "@/lib/skillsGraph";
import { cn } from "@/lib/utils";

export default function Confirmation() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { learningTasks, masteryScores, refreshAll, loading } = useAppData();
    const [editMode, setEditMode] = useState(false);
    const [tasks, setTasks] = useState(() => {
        if (typeof window === "undefined") return [];
        const userId = user?.id;
        if (!userId) return [];
        try {
            const cached = JSON.parse(localStorage.getItem(`kyren-review-plan-${userId}`) || "null");
            if (Array.isArray(cached?.tasks) && cached.tasks.length > 0) {
                return cached.tasks.sort((a, b) => (a.priority || 0) - (b.priority || 0));
            }
        } catch (error) {
            console.error("Failed to seed cached tasks", error);
        }
        return [];
    });
    const [generating, setGenerating] = useState(false);
    const [generatingStep, setGeneratingStep] = useState("");
    const [restoringPlan, setRestoringPlan] = useState(false);
    const [planBuilding, setPlanBuilding] = useState(() => {
        if (typeof window === "undefined") return false;
        const userId = user?.id;
        if (!userId) return false;
        try {
            const cached = JSON.parse(localStorage.getItem(`kyren-review-plan-${userId}`) || "null");
            return cached?.status === "building" && !(Array.isArray(cached?.tasks) && cached.tasks.length > 0);
        } catch (error) {
            console.error("Failed to seed plan building state", error);
            return false;
        }
    });

    const userId = user?.id;
    const reviewKey = userId ? `kyren-review-plan-${userId}` : null;
    const detectedTasks = learningTasks.filter(t => t.status === "Detected" || t.status === "Suggested" || t.status === "Approved").sort((a, b) => (a.priority || 0) - (b.priority || 0));
    const visibleTasks = tasks.length > 0 ? tasks : detectedTasks;

    const readCachedReviewPlan = useCallback(() => {
        if (!reviewKey) return null;
        try {
            return JSON.parse(localStorage.getItem(reviewKey) || "null");
        } catch (error) {
            console.error("Failed to read cached review plan", error);
            return null;
        }
    }, [reviewKey]);

    useEffect(() => {
        if (detectedTasks.length > 0) {
            setTasks(detectedTasks);
            setPlanBuilding(false);
        }
    }, [detectedTasks]);

    useEffect(() => {
        const cached = readCachedReviewPlan();
        if (Array.isArray(cached?.tasks) && cached.tasks.length > 0) {
            setTasks(cached.tasks.sort((a, b) => (a.priority || 0) - (b.priority || 0)));
            setPlanBuilding(false);
        } else if (cached?.status === "building") {
            setPlanBuilding(true);
        }
    }, [readCachedReviewPlan]);

    const restorePlanFromCache = useCallback(async () => {
        if (!reviewKey || restoringPlan) return;
        const cached = readCachedReviewPlan();
        if (Array.isArray(cached?.tasks) && cached.tasks.length > 0) {
            const cachedTasks = cached.tasks.sort((a, b) => (a.priority || 0) - (b.priority || 0));
            setTasks(cachedTasks);
            setPlanBuilding(false);
            return cachedTasks;
        }
        if (cached?.status === "building") {
            setPlanBuilding(true);
            return [];
        }
        if (!cached?.gaps?.length) return [];

        setRestoringPlan(true);
        try {
            const planned = await planLearningTasks({
                detectedGaps: cached.gaps,
                masteryScores,
                userGoal: cached.userGoal || user?.learning_goal || "",
            });

            const plannedTasks = planned.tasks || [];
            if (plannedTasks.length === 0) return [];

            const existingTasks = await kyren.entities.LearningTask.filter({ user_id: userId });
            const existingSkillIds = new Set(existingTasks.map((task) => task.skill_id));

            for (let index = 0; index < plannedTasks.length; index += 1) {
                const task = plannedTasks[index];
                if (task.skill_id && existingSkillIds.has(task.skill_id)) continue;

                const created = await kyren.entities.LearningTask.create({
                    user_id: userId,
                    title: task.title,
                    description: task.description,
                    reason: task.reason,
                    skill_id: task.skill_id,
                    skill_name: task.skill_name || getSkillById(task.skill_id)?.name || task.skill_id,
                    difficulty: task.difficulty,
                    priority: task.priority ?? index + 1,
                    estimated_time: task.estimated_time,
                    status: "Suggested",
                });
            }

            await refreshAll();
            const refreshedTasks = await kyren.entities.LearningTask.filter({ user_id: userId }, "priority");
            const visibleRefreshedTasks = refreshedTasks
                .filter((task) => ["Detected", "Suggested", "Approved"].includes(task.status))
                .sort((a, b) => (a.priority || 0) - (b.priority || 0));
            setTasks(visibleRefreshedTasks);
            localStorage.setItem(reviewKey, JSON.stringify({
                ...cached,
                tasks: visibleRefreshedTasks,
                updatedAt: new Date().toISOString(),
            }));
            return visibleRefreshedTasks;
        } catch (error) {
            console.error("Failed to restore cached learning plan", error);
            return [];
        } finally {
            setRestoringPlan(false);
        }
    }, [masteryScores, readCachedReviewPlan, refreshAll, restoringPlan, reviewKey, user?.learning_goal, userId]);

    useEffect(() => {
        if (loading || detectedTasks.length > 0) return;
        restorePlanFromCache();
    }, [loading, detectedTasks.length, restorePlanFromCache]);

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
        let currentTasks = tasks;
        if (currentTasks.length === 0) {
            currentTasks = await restorePlanFromCache();
            if (!currentTasks || currentTasks.length === 0) {
                currentTasks = await kyren.entities.LearningTask.filter({ user_id: userId }, "priority");
                currentTasks = currentTasks.filter(t => t.status === "Detected" || t.status === "Suggested" || t.status === "Approved")
                    .sort((a, b) => (a.priority || 0) - (b.priority || 0));
            }
        }

        const approvedTasks = currentTasks.filter(t => t.status === "Approved");
        if (approvedTasks.length === 0) {
            // Auto-approve all if none approved
            for (const t of currentTasks) {
                await kyren.entities.LearningTask.update(t.id, { status: "Approved" });
            }
        }

        setGenerating(true);
        const firstTask = currentTasks.find(t => t.status === "Approved") || currentTasks[0];

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
            if (reviewKey) {
                localStorage.removeItem(reviewKey);
            }
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

    if (visibleTasks.length === 0 && !restoringPlan && !planBuilding && !generating) {
        return (
            <div className="p-6 md:p-8 max-w-3xl mx-auto">
                <div className="text-center py-16">
                    <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                        <Network className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h2 className="text-xl font-semibold mb-2">No Learning Tasks Detected Yet</h2>
                    <p className="text-muted-foreground mb-6">
                        Talk to KYREN to discover what you need to learn, or return after a chat and KYREN will rebuild the plan automatically.
                    </p>
                    <Button onClick={() => navigate("/ai-tutor")} className="bg-primary">
                        <MessageSquare className="w-4 h-4 mr-2" />
                        Talk to KYREN
                    </Button>
                </div>
            </div>
        );
    }

    if (restoringPlan || planBuilding) {
        return (
            <div className="p-6 md:p-8 max-w-3xl mx-auto">
                <div className="text-center py-16">
                    <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
                    <h2 className="text-xl font-semibold mb-2">Restoring Your Learning Plan</h2>
                    <p className="text-muted-foreground">KYREN is rebuilding the detected gaps into a plan now.</p>
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
                        Proposed Learning Path ({visibleTasks.length} steps)
                    </h2>
                    <Button variant="outline" size="sm" onClick={() => setEditMode(!editMode)}>
                        {editMode ? <><Check className="w-3.5 h-3.5 mr-1" /> Done</> : <><Edit className="w-3.5 h-3.5 mr-1" /> Edit My Path</>}
                    </Button>
                </div>

                {visibleTasks.map((task, i) => {
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
                                    <div className="text-2xl text-muted-foreground shrink-0">{i < visibleTasks.length - 1 ? "↓" : ""}</div>
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
