import React, { useState, useEffect, useCallback } from "react";
import { kyren } from "@/api/kyrenClient";
import { useAuth } from "@/lib/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    GraduationCap, TrendingUp, Flame, Brain, Trophy, Plus, X, Sparkles, Mail,
} from "lucide-react";
import { generateAnalyticsInsights } from "@/lib/aiAgents";
import { cn } from "@/lib/utils";

export default function ParentPortal() {
    const { user } = useAuth();
    const [linkedStudentIds, setLinkedStudentIds] = useState([]);
    const [students, setStudents] = useState({});
    const [insights, setInsights] = useState({});
    const [loading, setLoading] = useState(true);
    const [showLinkDialog, setShowLinkDialog] = useState(false);
    const [linkCode, setLinkCode] = useState("");
    const [generatingInsight, setGeneratingInsight] = useState(null);

    const loadData = useCallback(async () => {
        if (!user?.id) return;
        const ids = user.linked_student_ids || [];
        setLinkedStudentIds(ids);
        if (ids.length === 0) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const studentData = {};
            for (const sid of ids) {
                const [mastery, quizzes, gaps] = await Promise.all([
                    kyren.entities.MasteryScore.filter({ user_id: sid }).catch(() => []),
                    kyren.entities.QuizAttempt.filter({ user_id: sid }, "-created_date", 10).catch(() => []),
                    kyren.entities.LearningGap.filter({ user_id: sid, resolved: false }).catch(() => []),
                ]);
                const mastered = mastery.filter((m) => m.status === "Mastered").length;
                const avgMastery = mastery.length > 0
                    ? Math.round(mastery.reduce((sum, m) => sum + (m.percentage || 0), 0) / mastery.length)
                    : 0;
                studentData[sid] = { mastery, quizzes, gaps, mastered, avgMastery };
            }
            setStudents(studentData);
        } catch (e) { /* silent */ }
        setLoading(false);
    }, [user?.id]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleLinkStudent = async () => {
        if (!linkCode) return;
        try {
            // linkCode is a student's user ID for demo purposes
            const updated = [...new Set([...(user.linked_student_ids || []), linkCode])];
            await kyren.auth.updateMe({ linked_student_ids: updated });
            setLinkedStudentIds(updated);
            setLinkCode("");
            setShowLinkDialog(false);
            loadData();
        } catch (e) {
            console.error("Link failed:", e);
        }
    };

    const handleUnlink = async (sid) => {
        try {
            const updated = linkedStudentIds.filter((id) => id !== sid);
            await kyren.auth.updateMe({ linked_student_ids: updated });
            setLinkedStudentIds(updated);
            const newStudents = { ...students };
            delete newStudents[sid];
            setStudents(newStudents);
        } catch (e) {
            console.error("Unlink failed:", e);
        }
    };

    const generateInsight = async (sid) => {
        setGeneratingInsight(sid);
        try {
            const data = students[sid];
            const result = await generateAnalyticsInsights({
                masteryScores: data.mastery,
                quizAttempts: data.quizzes,
                learningGaps: data.gaps,
            });
            setInsights({ ...insights, [sid]: result });
        } catch (e) {
            setInsights({ ...insights, [sid]: { summary: "Unable to generate insight at this time.", recommendations: [] } });
        }
        setGeneratingInsight(null);
    };

    return (
        <div className="p-6 lg:p-10 max-w-5xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
                <div>
                    <span className="mono-label text-primary">// Parent Portal</span>
                    <h1 className="text-3xl font-heading font-semibold mt-2">
                        Your child's <span className="font-display italic">progress</span>
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Read-only weekly snapshots — mastery, streaks, and AI insights for your linked students.
                    </p>
                </div>
                <Button onClick={() => setShowLinkDialog(true)} variant="outline" className="gap-2">
                    <Plus className="w-4 h-4" />
                    Link student
                </Button>
            </div>

            {loading ? (
                <Card className="p-12 text-center text-muted-foreground">Loading student data…</Card>
            ) : linkedStudentIds.length === 0 ? (
                <Card className="p-12 text-center">
                    <GraduationCap className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                    <h2 className="text-xl font-heading font-semibold mb-2">No students linked yet</h2>
                    <p className="text-muted-foreground mb-6">
                        Link your child's account using their student ID to see their progress, mastery snapshot, and weekly AI insights.
                    </p>
                    <Button onClick={() => setShowLinkDialog(true)} className="btn-glow text-white border-0 gap-2">
                        <Plus className="w-4 h-4" />
                        Link a student
                    </Button>
                </Card>
            ) : (
                <div className="space-y-6">
                    {linkedStudentIds.map((sid, idx) => {
                        const data = students[sid];
                        if (!data) return null;
                        const insight = insights[sid];
                        return (
                            <Card key={sid} className="p-6">
                                <div className="flex items-center justify-between mb-6">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-brand-black flex items-center justify-center text-white font-semibold">
                                            S{idx + 1}
                                        </div>
                                        <div>
                                            <h2 className="text-lg font-heading font-semibold">Student {idx + 1}</h2>
                                            <span className="mono-label text-muted-foreground/50">{sid.slice(-8)}</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleUnlink(sid)}
                                        className="text-xs text-muted-foreground hover:text-red-500 transition"
                                    >
                                        Unlink
                                    </button>
                                </div>

                                {/* Stats */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                                    <div className="rounded-xl bg-muted/20 p-4">
                                        <TrendingUp className="w-5 h-5 text-primary mb-2" />
                                        <div className="text-2xl font-heading font-bold">{data.avgMastery}%</div>
                                        <div className="mono-label text-muted-foreground">Avg Mastery</div>
                                    </div>
                                    <div className="rounded-xl bg-muted/20 p-4">
                                        <Trophy className="w-5 h-5 text-amber-500 mb-2" />
                                        <div className="text-2xl font-heading font-bold">{data.mastered}</div>
                                        <div className="mono-label text-muted-foreground">Skills Mastered</div>
                                    </div>
                                    <div className="rounded-xl bg-muted/20 p-4">
                                        <Brain className="w-5 h-5 text-red-500 mb-2" />
                                        <div className="text-2xl font-heading font-bold">{data.gaps.length}</div>
                                        <div className="mono-label text-muted-foreground">Open Gaps</div>
                                    </div>
                                    <div className="rounded-xl bg-muted/20 p-4">
                                        <Flame className="w-5 h-5 text-primary mb-2" />
                                        <div className="text-2xl font-heading font-bold">{data.quizzes.length}</div>
                                        <div className="mono-label text-muted-foreground">Recent Quizzes</div>
                                    </div>
                                </div>

                                {/* Skill breakdown */}
                                {data.mastery.length > 0 && (
                                    <div className="mb-6">
                                        <h3 className="text-sm font-medium mb-3">Skill Mastery Breakdown</h3>
                                        <div className="space-y-2">
                                            {data.mastery.slice(0, 8).map((m) => (
                                                <div key={m.id} className="flex items-center gap-3">
                                                    <span className="text-sm text-muted-foreground w-32 truncate">{m.skill_name}</span>
                                                    <div className="flex-1 h-2 rounded-full bg-muted/30 overflow-hidden">
                                                        <div
                                                            className={cn(
                                                                "h-full rounded-full",
                                                                m.percentage >= 80 ? "bg-emerald-500" :
                                                                    m.percentage >= 60 ? "bg-primary" :
                                                                        m.percentage >= 30 ? "bg-amber-500" : "bg-red-500"
                                                            )}
                                                            style={{ width: `${m.percentage}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-xs text-muted-foreground w-10 text-right">{m.percentage}%</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* AI Insight */}
                                {insight ? (
                                    <div className="rounded-xl bg-primary/5 border border-primary/10 p-4">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Sparkles className="w-4 h-4 text-primary" />
                                            <span className="text-sm font-medium">Weekly AI Insight</span>
                                        </div>
                                        <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                                            {insight.summary || (typeof insight === "string" ? insight : "Insight generated.")}
                                        </p>
                                        {insight.recommendations?.length > 0 && (
                                            <div className="space-y-1">
                                                {insight.recommendations.slice(0, 3).map((r, i) => (
                                                    <div key={i} className="text-sm text-muted-foreground flex gap-2">
                                                        <span className="text-primary">→</span>
                                                        <span>{typeof r === "string" ? r : r.action || r.recommendation || JSON.stringify(r)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <Button
                                        onClick={() => generateInsight(sid)}
                                        disabled={generatingInsight === sid}
                                        variant="outline"
                                        className="gap-2 w-full"
                                    >
                                        {generatingInsight === sid ? (
                                            <>Generating insight…</>
                                        ) : (
                                            <>
                                                <Mail className="w-4 h-4" />
                                                Generate weekly insight
                                            </>
                                        )}
                                    </Button>
                                )}
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* Link Dialog */}
            {showLinkDialog && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowLinkDialog(false)}>
                    <div className="glass-card rounded-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-heading font-semibold">Link a student</h3>
                            <button onClick={() => setShowLinkDialog(false)} className="text-muted-foreground hover:text-foreground">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <p className="text-sm text-muted-foreground mb-4">
                            Enter your child's student ID (or invite code) to link their account. You'll see read-only progress snapshots.
                        </p>
                        <div className="space-y-3">
                            <div>
                                <Label className="mb-1.5 block">Student ID</Label>
                                <Input
                                    value={linkCode}
                                    onChange={(e) => setLinkCode(e.target.value)}
                                    placeholder="Paste student ID or invite code"
                                />
                            </div>
                        </div>
                        <div className="flex gap-2 mt-4">
                            <Button variant="outline" onClick={() => setShowLinkDialog(false)} className="flex-1">Cancel</Button>
                            <Button onClick={handleLinkStudent} className="btn-glow text-white border-0 flex-1" disabled={!linkCode}>
                                Link student
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}