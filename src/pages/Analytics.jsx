import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";
import { useAppData } from "@/lib/appData";
import { kyren } from "@/api/kyrenClient";
import {
    BarChart, Bar, LineChart, Line, RadarChart, PolarGrid,
    PolarAngleAxis, PolarRadiusAxis, Radar, XAxis, YAxis,
    Tooltip, ResponsiveContainer, Cell
} from "recharts";
import { Card } from "@/components/ui/card";
import { Brain, Zap, Target, AlertCircle, TrendingUp } from "lucide-react";
import { generateAnalyticsInsights } from "@/lib/aiAgents";
import { cn } from "@/lib/utils";

const COLORS = ["#E34A32", "#22C55E", "#F59E0B", "#EF4444", "#6C9EFF", "#A78BFA"];

export default function Analytics() {
    const { user } = useAuth();
    const { masteryScores, learningTasks, courses } = useAppData();
    const [quizAttempts, setQuizAttempts] = useState([]);
    const [insights, setInsights] = useState([]);
    const [loadingInsights, setLoadingInsights] = useState(false);
    const [selectedGap, setSelectedGap] = useState(null);

    const userId = user?.id;

    useEffect(() => {
        loadQuizAttempts();
    }, [userId]);

    useEffect(() => {
        if (masteryScores.length > 0 && insights.length === 0) {
            setLoadingInsights(true);
            generateAnalyticsInsights({
                masteryScores,
                quizAttempts,
                tasksCompleted: learningTasks.filter(t => t.status === "Completed" || t.status === "Mastered").length,
                learningTime: 180,
                streak: 7,
            })
                .then(r => setInsights(r.insights || []))
                .catch(() => { })
                .finally(() => setLoadingInsights(false));
        }
    }, [masteryScores, quizAttempts, learningTasks]);

    const loadQuizAttempts = async () => {
        try {
            const attempts = await kyren.entities.QuizAttempt.filter({ user_id: userId }, "-created_date");
            setQuizAttempts(attempts);
        } catch (e) { /* */ }
    };

    // Chart data
    const masteryData = masteryScores.map(m => ({ skill: m.skill_name, score: m.percentage }));
    const avgScore = quizAttempts.length > 0 ? Math.round(quizAttempts.reduce((a, q) => a + q.score, 0) / quizAttempts.length) : 0;
    const completedTasks = learningTasks.filter(t => t.status === "Completed" || t.status === "Mastered").length;
    const completedLessons = courses.reduce((acc, c) => acc + (c.progress > 0 ? 1 : 0), 0);

    // Gap Radar data
    const gapData = masteryScores.map(m => {
        let category = "Mastered";
        if (m.status === "Needs Review") category = "Critical";
        else if (m.status === "Improving" && m.percentage < 50) category = "Prerequisite";
        else if (m.status === "Improving") category = "Improving";
        return { skill: m.skill_name, value: m.percentage, category };
    });

    const gapCategories = {
        Critical: { color: "text-red-500 bg-red-500/10", dot: "bg-red-500" },
        Prerequisite: { color: "text-amber-500 bg-amber-500/10", dot: "bg-amber-500" },
        Improving: { color: "text-primary bg-primary/10", dot: "bg-primary" },
        Mastered: { color: "text-green-500 bg-green-500/10", dot: "bg-green-500" },
    };

    return (
        <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
            <div className="mb-6">
                <h1 className="text-2xl md:text-3xl font-bold mb-2">Analytics & AI Insights</h1>
                <p className="text-muted-foreground">Your learning progress, mastery trends, and AI-generated insights.</p>
            </div>

            {/* AI Insights */}
            <Card className="p-6">
                <h2 className="font-semibold flex items-center gap-2 mb-4">
                    <Brain className="w-5 h-5 text-primary" />
                    Weekly AI Insights
                </h2>
                {loadingInsights ? (
                    <div className="space-y-2">
                        <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
                        <div className="h-4 bg-muted rounded animate-pulse w-1/2" />
                    </div>
                ) : insights.length > 0 ? (
                    <div className="space-y-3">
                        {insights.map((insight, i) => (
                            <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }} className="flex items-start gap-3 p-3 rounded-xl bg-muted/30">
                                <TrendingUp className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                                <p className="text-sm">{insight}</p>
                            </motion.div>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">Complete more quizzes to generate AI insights.</p>
                )}
            </Card>

            {/* Stats grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: "Tasks Completed", value: completedTasks, icon: Zap, color: "text-primary" },
                    { label: "Courses Started", value: courses.length, icon: Target, color: "text-purple-500" },
                    { label: "Quiz Accuracy", value: `${avgScore}%`, icon: Brain, color: "text-green-500" },
                    { label: "Skills Tracked", value: masteryScores.length, icon: TrendingUp, color: "text-amber-500" },
                ].map((stat, i) => {
                    const Icon = stat.icon;
                    return (
                        <Card key={i} className="p-5 text-center">
                            <Icon className={cn("w-6 h-6 mx-auto mb-2", stat.color)} />
                            <div className="text-2xl font-bold">{stat.value}</div>
                            <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
                        </Card>
                    );
                })}
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
                {/* Mastery Chart */}
                {masteryData.length > 0 && (
                    <Card className="p-6">
                        <h2 className="font-semibold mb-4">Skill Mastery</h2>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={masteryData}>
                                <XAxis dataKey="skill" angle={-30} textAnchor="end" height={70} tick={{ fontSize: 11 }} />
                                <YAxis domain={[0, 100]} />
                                <Tooltip />
                                <Bar dataKey="score" radius={[8, 8, 0, 0]}>
                                    {masteryData.map((entry, i) => (
                                        <Cell key={i} fill={entry.score >= 80 ? "#22C55E" : entry.score >= 50 ? "#E34A32" : "#F59E0B"} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </Card>
                )}

                {/* Quiz Score Trend */}
                {quizAttempts.length > 0 && (
                    <Card className="p-6">
                        <h2 className="font-semibold mb-4">Quiz Score Trend</h2>
                        <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={quizAttempts.slice(0, 10).reverse().map((q, i) => ({ attempt: i + 1, score: q.score }))}>
                                <XAxis dataKey="attempt" />
                                <YAxis domain={[0, 100]} />
                                <Tooltip />
                                <Line type="monotone" dataKey="score" stroke="#E34A32" strokeWidth={2} dot={{ r: 4 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </Card>
                )}
            </div>

            {/* Gap Radar */}
            {gapData.length > 0 && (
                <Card className="p-6">
                    <h2 className="font-semibold flex items-center gap-2 mb-4">
                        <AlertCircle className="w-5 h-5 text-amber-500" />
                        Gap Radar
                    </h2>
                    <div className="grid md:grid-cols-2 gap-6 items-center">
                        <ResponsiveContainer width="100%" height={300}>
                            {gapData.length >= 3 ? (
                                <RadarChart data={gapData}>
                                    <PolarGrid />
                                    <PolarAngleAxis dataKey="skill" tick={{ fontSize: 11 }} />
                                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
                                    <Radar name="Mastery" dataKey="value" stroke="#E34A32" fill="#E34A32" fillOpacity={0.3} />
                                </RadarChart>
                            ) : (
                                <BarChart data={gapData} layout="vertical" margin={{ top: 20, right: 30, left: 40, bottom: 20 }}>
                                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                                    <YAxis type="category" dataKey="skill" width={90} tick={{ fontSize: 11 }} />
                                    <Tooltip formatter={(val) => [`${val}%`, "Mastery"]} />
                                    <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                                        {gapData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            )}
                        </ResponsiveContainer>
                        <div className="space-y-2">
                            {gapData.map((gap, i) => {
                                const config = gapCategories[gap.category] || gapCategories.Mastered;
                                return (
                                    <button
                                        key={i}
                                        onClick={() => setSelectedGap(gap)}
                                        className={cn("w-full flex items-center gap-3 p-3 rounded-xl border text-left transition hover:bg-muted/30", selectedGap?.skill === gap.skill && "ring-2 ring-primary/30")}
                                    >
                                        <div className={cn("w-2 h-2 rounded-full", config.dot)} />
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium truncate">{gap.skill}</div>
                                            <div className="text-xs text-muted-foreground">{gap.category} · {gap.value}%</div>
                                        </div>
                                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", config.color)}>{gap.category}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Gap detail */}
                    {selectedGap && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 p-4 rounded-xl bg-muted/30">
                            <h3 className="font-medium mb-2">{selectedGap.skill} — Why It Matters</h3>
                            <p className="text-sm text-muted-foreground">
                                This skill is currently at <strong>{selectedGap.value}%</strong> mastery ({selectedGap.category}).
                                {" "}It is a prerequisite for other skills in your roadmap. Improving it will unlock new learning paths.
                            </p>
                            <p className="text-sm text-muted-foreground mt-2">
                                <strong>Recommended:</strong> Review this skill's lesson, take the quiz, and if you score below 50%, KYREN will generate a quick micro-module to help you master it.
                            </p>
                        </motion.div>
                    )}
                </Card>
            )}

            {masteryScores.length === 0 && quizAttempts.length === 0 && (
                <div className="text-center py-16">
                    <Brain className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <h2 className="text-xl font-semibold mb-2">No Analytics Yet</h2>
                    <p className="text-muted-foreground">Complete quizzes and lessons to generate your analytics.</p>
                </div>
            )}
        </div>
    );
}
