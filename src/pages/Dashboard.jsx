import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";
import { useAppData } from "@/lib/appData";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
    Play, ArrowRight, TrendingUp, Target, Zap, Clock,
    Sparkles, ListChecks, ChevronRight, BookOpen, Cpu, RotateCcw
} from "lucide-react";
import { generateAnalyticsInsights } from "@/lib/aiAgents";
import { cn } from "@/lib/utils";
import StudyCalendar from "@/components/dashboard/StudyCalendar";
import MasteryTrendChart from "@/components/dashboard/MasteryTrendChart";
import SubjectMasteryTracker from "@/components/dashboard/SubjectMasteryTracker";
import MorningCheckIn from "@/components/dashboard/MorningCheckIn";

export default function Dashboard() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { masteryScores, learningTasks, courses, recommendations, loading } = useAppData();
    const [insights, setInsights] = useState([]);
    const [loadingInsights, setLoadingInsights] = useState(false);

    const userName = user?.full_name?.split(" ")[0] || "Student";

    useEffect(() => {
        if (masteryScores.length > 0 && insights.length === 0) {
            setLoadingInsights(true);
            generateAnalyticsInsights({
                masteryScores,
                quizAttempts: [],
                tasksCompleted: learningTasks.filter(t => t.status === "Completed" || t.status === "Mastered").length,
                learningTime: 120,
                streak: 7,
            })
                .then((result) => setInsights(result.insights || []))
                .catch(() => { })
                .finally(() => setLoadingInsights(false));
        }
    }, [masteryScores, learningTasks]);

    const today = new Date().toISOString().split("T")[0];
    const dueReviewSkills = masteryScores.filter(m =>
        m.next_review_date && m.next_review_date <= today && m.status !== "Locked"
    );
    const currentCourse = courses.find(c => c.progress < 100) || courses[0];
    const nextTask = learningTasks.find(t => t.status === "Detected" || t.status === "Suggested" || t.status === "Approved");
    const inProgressTasks = learningTasks.filter(t => t.status === "In Progress" || t.status === "Detected" || t.status === "Suggested" || t.status === "Approved").slice(0, 5);

    const getMasteryColor = (status) => {
        switch (status) {
            case "Mastered": return "text-emerald-600 bg-emerald-500/10";
            case "Improving": return "text-primary bg-primary/10";
            case "Needs Review": return "text-amber-600 bg-amber-500/10";
            default: return "text-muted-foreground bg-muted";
        }
    };

    const getProgressColor = (percentage) => {
        if (percentage >= 80) return "bg-emerald-500";
        if (percentage >= 50) return "bg-primary";
        if (percentage > 0) return "bg-amber-500";
        return "bg-muted-foreground/40";
    };

    return (
        <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6 relative">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <span className="sf-label text-text-secondary text-xs">Dashboard / Overview</span>
                    <h1 className="text-3xl md:text-4xl sf-display tracking-tight mt-2 text-foreground">
                        Welcome back, <span className="sf-serif text-primary">{userName}</span>
                    </h1>
                    <p className="text-text-secondary mt-1.5 text-sm">Where am I? What should I learn next? Let's find out.</p>
                </div>
                <Button variant="primary" onClick={() => navigate("/ai-tutor")} className="rounded-full px-5">
                    <Sparkles className="w-4 h-4 mr-2" />
                    Talk to AI
                </Button>
            </div>

            <MorningCheckIn />

            {/* Due for Review Banner */}
            {dueReviewSkills.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <Link to="/review">
                        <Card className="rounded-2xl p-5 border-amber-500/20 bg-amber-500/[0.03] flex items-center gap-4 cursor-pointer hover:border-amber-500/40 transition">
                            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                                <RotateCcw className="w-5 h-5 text-amber-500" />
                            </div>
                            <div className="flex-1">
                                <h3 className="sf-display text-sm text-foreground">
                                    {dueReviewSkills.length} skill{dueReviewSkills.length > 1 ? "s" : ""} due for review
                                </h3>
                                <p className="text-xs text-text-secondary mt-0.5">
                                    Spaced repetition scheduled these to keep your memory sharp. Review now →
                                </p>
                            </div>
                            <ChevronRight className="w-5 h-5 text-amber-500 shrink-0" />
                        </Card>
                    </Link>
                </motion.div>
            )}

            {/* AI Insight Banner */}
            {(insights.length > 0 || loadingInsights) && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="sf-card rounded-2xl p-5 border-primary/20"
                >
                    <div className="flex items-center gap-2 mb-3">
                        <div className="w-7 h-7 rounded-lg badge-ai flex items-center justify-center">
                            <Cpu className="w-4 h-4" />
                        </div>
                        <h3 className="sf-display text-sm text-foreground">AI Insight Engine</h3>
                        <span className="sf-label text-text-secondary ml-auto text-[10px]">live</span>
                    </div>
                    {loadingInsights ? (
                        <div className="space-y-2">
                            <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
                            <div className="h-4 bg-muted rounded animate-pulse w-1/2" />
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {insights.map((insight, i) => (
                                <p key={i} className="text-sm text-text-secondary leading-relaxed">{insight}</p>
                            ))}
                        </div>
                    )}
                </motion.div>
            )}

            <div className="grid lg:grid-cols-3 gap-6">
                {/* Continue Learning */}
                <Card className="rounded-2xl p-6 col-span-1 lg:col-span-2 border-0">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="sf-display flex items-center gap-2 text-sm text-foreground">
                            <Play className="w-4 h-4 text-primary" />
                            Continue Learning
                        </h2>
                        <Link to="/courses" className="sf-label text-primary hover:opacity-70 transition text-[10px]">View all →</Link>
                    </div>
                    {currentCourse ? (
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                                <BookOpen className="w-7 h-7 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-medium truncate text-foreground">{currentCourse.title}</h3>
                                <p className="text-sm text-text-secondary truncate mt-0.5">{currentCourse.description}</p>
                                <div className="mt-3 flex items-center gap-3">
                                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                        <div className={cn("h-full rounded-full transition-all", getProgressColor(currentCourse.progress || 0))} style={{ width: `${currentCourse.progress || 0}%` }} />
                                    </div>
                                    <span className="sf-label text-text-secondary text-[10px]">{currentCourse.progress || 0}%</span>
                                </div>
                            </div>
                            <Button variant="primary" size="sm" onClick={() => navigate(`/courses/${currentCourse.id}`)} className="rounded-full">
                                Resume <ArrowRight className="w-3.5 h-3.5 ml-1" />
                            </Button>
                        </div>
                    ) : (
                        <div className="text-center py-8">
                            <p className="text-text-secondary text-sm mb-3">No courses yet. Start by talking to KYREN.</p>
                            <Button variant="primary" onClick={() => navigate("/ai-tutor")} size="sm" className="rounded-full">
                                <Sparkles className="w-4 h-4 mr-2" />
                                Start Learning
                            </Button>
                        </div>
                    )}
                </Card>

                {/* Today's Focus */}
                <Card className="rounded-2xl p-6 border-0">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="sf-display flex items-center gap-2 text-sm text-foreground">
                            <Target className="w-4 h-4 text-amber-500" />
                            Today's Focus
                        </h2>
                        <span className="sf-label text-text-secondary text-[10px]">01</span>
                    </div>
                    {nextTask ? (
                        <div>
                            <div className="p-4 rounded-2xl bg-amber-500/[0.05] border border-amber-500/20">
                                <h3 className="font-medium mb-1 text-foreground">{nextTask.title}</h3>
                                <div className="flex items-center gap-3 text-xs text-text-secondary mb-3">
                                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {nextTask.estimated_time || "30 min"}</span>
                                    <span className="sf-label capitalize text-[10px]">{nextTask.difficulty}</span>
                                </div>
                                <p className="text-xs text-text-secondary bg-muted rounded-xl p-2.5 italic leading-relaxed">
                                    "{nextTask.reason || "Recommended based on your learning progress."}"
                                </p>
                            </div>
                            <Button onClick={() => navigate("/learning-plan")} variant="outline" size="sm" className="w-full mt-3 rounded-full">
                                View Task <ChevronRight className="w-3.5 h-3.5 ml-1" />
                            </Button>
                        </div>
                    ) : (
                        <p className="text-text-secondary text-sm text-center py-4">No tasks detected yet.</p>
                    )}
                </Card>
            </div>

            <MasteryTrendChart />

            <SubjectMasteryTracker />

            <div className="grid lg:grid-cols-2 gap-6">
                {/* Skill Mastery */}
                <Card className="rounded-2xl p-6 border-0">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="sf-display flex items-center gap-2 text-sm text-foreground">
                            <Zap className="w-4 h-4 text-primary" />
                            Skill Mastery
                        </h2>
                        <span className="sf-label text-text-secondary text-[10px]">{masteryScores.length} skills</span>
                    </div>
                    {masteryScores.length > 0 ? (
                        <div className="space-y-4">
                            {masteryScores.slice(0, 6).map((score) => (
                                <div key={score.id}>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="text-sm font-medium text-foreground">{score.skill_name}</span>
                                        <span className={cn("sf-label px-2 py-0.5 rounded-full text-[10px]", getMasteryColor(score.status))}>
                                            {score.percentage}%
                                        </span>
                                    </div>
                                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${score.percentage}%` }}
                                            transition={{ duration: 0.8, ease: "easeOut" }}
                                            className={cn("h-full rounded-full", getProgressColor(score.percentage))}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8">
                            <p className="text-text-secondary text-sm">No mastery data yet. Complete a quiz to see progress.</p>
                        </div>
                    )}
                </Card>

                {/* Learning Tasks */}
                <Card className="rounded-2xl p-6 border-0">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="sf-display flex items-center gap-2 text-sm text-foreground">
                            <ListChecks className="w-4 h-4 text-primary" />
                            Learning Tasks
                        </h2>
                        <Link to="/learning-plan" className="sf-label text-primary hover:opacity-70 transition text-[10px]">View all →</Link>
                    </div>
                    {inProgressTasks.length > 0 ? (
                        <div className="space-y-2">
                            {inProgressTasks.map((task, i) => (
                                <div key={task.id} className="flex items-center gap-3 p-3 rounded-2xl border border-border hover:bg-muted hover:border-primary/20 transition cursor-pointer group" onClick={() => navigate("/learning-plan")}>
                                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary sf-label flex items-center justify-center shrink-0 border border-primary/20">
                                        {String(task.priority || i + 1).padStart(2, "0")}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium truncate text-foreground">{task.title}</div>
                                        <div className="sf-label text-text-secondary truncate text-[10px]">{task.estimated_time || "30 min"} · {task.status}</div>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition shrink-0" />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8">
                            <p className="text-text-secondary text-sm mb-3">No tasks yet. KYREN will detect what you need.</p>
                            <Button onClick={() => navigate("/ai-tutor")} size="sm" variant="outline" className="rounded-full">
                                <Sparkles className="w-4 h-4 mr-2" />
                                Talk to KYREN
                            </Button>
                        </div>
                    )}
                </Card>
            </div>

            <StudyCalendar learningTasks={learningTasks} masteryScores={masteryScores} />

            {/* Recommendations */}
            {recommendations.length > 0 && (
                <Card className="rounded-2xl p-6 border-0">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="sf-display flex items-center gap-2 text-sm text-foreground">
                            <TrendingUp className="w-4 h-4 text-emerald-500" />
                            Recommended Next
                        </h2>
                        <span className="sf-label text-text-secondary text-[10px]">{recommendations.length} paths</span>
                    </div>
                    <div className="space-y-2">
                        {recommendations.slice(0, 3).map((rec) => (
                            <div key={rec.id} className="p-4 rounded-2xl border border-border bg-muted/50">
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="font-medium text-foreground">{rec.recommended_title}</h3>
                                    <span className="sf-label px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 text-[10px]">{rec.type}</span>
                                </div>
                                <p className="text-sm text-text-secondary italic leading-relaxed">"{rec.reason}"</p>
                            </div>
                        ))}
                    </div>
                </Card>
            )}
        </div>
    );
}