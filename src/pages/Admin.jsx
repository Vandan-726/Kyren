import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { kyren } from "@/api/kyrenClient";
import { Card } from "@/components/ui/card";
import {
    LayoutDashboard, Users, BookOpen, ListChecks, Brain,
    BarChart3, Activity, FileText,
    Server, AlertTriangle
} from "lucide-react";
import { cn } from "@/lib/utils";

const ADMIN_SECTIONS = [
    { key: "overview", label: "Overview", icon: LayoutDashboard },
    { key: "users", label: "Users", icon: Users },
    { key: "courses", label: "Courses", icon: BookOpen },
    { key: "tasks", label: "Learning Tasks", icon: ListChecks },
    { key: "conversations", label: "AI Conversations", icon: Brain },
    { key: "gaps", label: "Learning Gaps", icon: AlertTriangle },
    { key: "analytics", label: "Analytics", icon: BarChart3 },
    { key: "ai_usage", label: "AI Usage", icon: Server },
    { key: "content", label: "Content Management", icon: FileText },
];

export default function Admin() {
    const { user } = useAuth();
    const [activeSection, setActiveSection] = useState("overview");
    const [stats, setStats] = useState({});
    const [users, setUsers] = useState([]);
    const [courses, setCourses] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [gaps, setGaps] = useState([]);
    const [aiLogs, setAILogs] = useState([]);
    const [loading, setLoading] = useState(true);

    const isAdmin = user?.role === "admin";

    useEffect(() => {
        if (isAdmin) loadAdminData();
        else setLoading(false);
    }, [isAdmin]);

    const loadAdminData = async () => {
        setLoading(true);
        try {
            const [usersData, coursesData, tasksData, gapsData, aiLogsData, quizAttempts, masteryData] = await Promise.all([
                kyren.entities.User.list(),
                kyren.entities.Course.list(),
                kyren.entities.LearningTask.list(),
                kyren.entities.LearningGap.list(),
                kyren.entities.AIUsageLog.list(),
                kyren.entities.QuizAttempt.list(),
                kyren.entities.MasteryScore.list(),
            ]);
            setUsers(usersData);
            setCourses(coursesData);
            setTasks(tasksData);
            setGaps(gapsData);
            setAILogs(aiLogsData);

            setStats({
                totalUsers: usersData.length,
                totalCourses: coursesData.length,
                totalTasks: tasksData.length,
                totalGaps: gapsData.length,
                totalQuizAttempts: quizAttempts.length,
                avgMastery: masteryData.length > 0 ? Math.round(masteryData.reduce((a, m) => a + m.percentage, 0) / masteryData.length) : 0,
                aiRequests: aiLogsData.length,
            });
        } catch (e) {
            console.error("Admin data load failed", e);
        } finally {
            setLoading(false);
        }
    };

    if (!isAdmin) {
        return (
            <div className="p-8 text-center">
                <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
                    <AlertTriangle className="w-8 h-8 text-destructive" />
                </div>
                <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
                <p className="text-muted-foreground">You need admin privileges to view this page.</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
            </div>
        );
    }

    // AI usage by provider
    const aiByProvider = aiLogs.reduce((acc, log) => {
        acc[log.provider] = (acc[log.provider] || 0) + 1;
        return acc;
    }, {});

    // Top gaps
    const gapCounts = gaps.reduce((acc, gap) => {
        acc[gap.skill_name] = (acc[gap.skill_name] || 0) + 1;
        return acc;
    }, {});
    const topGaps = Object.entries(gapCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);

    return (
        <div className="flex min-h-screen">
            {/* Admin sidebar */}
            <aside className="w-56 border-r border-border bg-muted/30 p-4 space-y-1 hidden md:block">
                <div className="mb-4 px-3">
                    <h2 className="text-sm font-bold text-muted-foreground uppercase">Admin Panel</h2>
                </div>
                {ADMIN_SECTIONS.map(s => {
                    const Icon = s.icon;
                    return (
                        <button
                            key={s.key}
                            onClick={() => setActiveSection(s.key)}
                            className={cn(
                                "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition",
                                activeSection === s.key
                                    ? "bg-primary/10 text-primary font-medium"
                                    : "text-muted-foreground hover:bg-muted"
                            )}
                        >
                            <Icon className="w-4 h-4" />
                            {s.label}
                        </button>
                    );
                })}
            </aside>

            {/* Content */}
            <main className="flex-1 p-6 md:p-8 overflow-y-auto">
                {/* Mobile section selector */}
                <div className="md:hidden mb-4 flex gap-2 overflow-x-auto pb-2">
                    {ADMIN_SECTIONS.map(s => (
                        <button
                            key={s.key}
                            onClick={() => setActiveSection(s.key)}
                            className={cn("px-3 py-1.5 rounded-full text-xs whitespace-nowrap", activeSection === s.key ? "bg-primary text-white" : "bg-muted")}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>

                {activeSection === "overview" && (
                    <div className="space-y-6">
                        <h1 className="text-2xl font-bold">Admin Overview</h1>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {[
                                { label: "Total Users", value: stats.totalUsers, icon: Users, color: "text-primary" },
                                { label: "Courses", value: stats.totalCourses, icon: BookOpen, color: "text-primary" },
                                { label: "Quiz Attempts", value: stats.totalQuizAttempts, icon: Activity, color: "text-green-500" },
                                { label: "Avg Mastery", value: `${stats.avgMastery}%`, icon: BarChart3, color: "text-amber-500" },
                            ].map((stat, i) => {
                                const Icon = stat.icon;
                                return (
                                    <Card key={i} className="p-5">
                                        <Icon className={cn("w-6 h-6 mb-2", stat.color)} />
                                        <div className="text-2xl font-bold">{stat.value}</div>
                                        <div className="text-xs text-muted-foreground">{stat.label}</div>
                                    </Card>
                                );
                            })}
                        </div>
                        <div className="grid md:grid-cols-2 gap-4">
                            <Card className="p-6">
                                <h3 className="font-semibold mb-4">Top Learning Gaps</h3>
                                {topGaps.length > 0 ? (
                                    <div className="space-y-2">
                                        {topGaps.map(([skill, count], i) => (
                                            <div key={skill} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                                                <span className="text-sm">{skill}</span>
                                                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500">{count} students</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : <p className="text-sm text-muted-foreground">No gaps detected yet.</p>}
                            </Card>
                            <Card className="p-6">
                                <h3 className="font-semibold mb-4">AI Usage by Provider</h3>
                                {Object.keys(aiByProvider).length > 0 ? (
                                    <div className="space-y-2">
                                        {Object.entries(aiByProvider).map(([provider, count]) => (
                                            <div key={provider} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                                                <span className="text-sm">{provider}</span>
                                                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">{count} requests</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : <p className="text-sm text-muted-foreground">No AI usage recorded yet.</p>}
                            </Card>
                        </div>
                    </div>
                )}

                {activeSection === "users" && (
                    <div>
                        <h1 className="text-2xl font-bold mb-6">Users</h1>
                        <div className="space-y-2">
                            {users.map(u => (
                                <Card key={u.id} className="p-4 flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center">
                                        {(u.full_name || u.email || "U").charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex-1">
                                        <div className="font-medium text-sm">{u.full_name || "Unknown"}</div>
                                        <div className="text-xs text-muted-foreground">{u.email}</div>
                                    </div>
                                    <span className={cn("text-xs px-2 py-1 rounded-full", u.role === "admin" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                                        {u.role || "student"}
                                    </span>
                                </Card>
                            ))}
                        </div>
                    </div>
                )}

                {activeSection === "courses" && (
                    <div>
                        <h1 className="text-2xl font-bold mb-6">Courses</h1>
                        <div className="space-y-2">
                            {courses.map(c => (
                                <Card key={c.id} className="p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="font-medium">{c.title}</h3>
                                        <span className={cn("text-xs px-2 py-0.5 rounded-full", c.is_approved ? "bg-green-500/10 text-green-500" : "bg-amber-500/10 text-amber-500")}>
                                            {c.is_approved ? "Approved" : "Pending"}
                                        </span>
                                    </div>
                                    <p className="text-sm text-muted-foreground">{c.description}</p>
                                </Card>
                            ))}
                        </div>
                    </div>
                )}

                {activeSection === "gaps" && (
                    <div>
                        <h1 className="text-2xl font-bold mb-6">Learning Gaps</h1>
                        <div className="space-y-2">
                            {gaps.map(g => (
                                <Card key={g.id} className="p-4 flex items-center justify-between">
                                    <div>
                                        <div className="font-medium text-sm">{g.skill_name}</div>
                                        <div className="text-xs text-muted-foreground">Detected from: {g.detected_from}</div>
                                    </div>
                                    <span className={cn("text-xs px-2 py-1 rounded-full", g.severity === "critical" ? "bg-red-500/10 text-red-500" : g.severity === "moderate" ? "bg-amber-500/10 text-amber-500" : "bg-primary/10 text-primary")}>
                                        {g.severity}
                                    </span>
                                </Card>
                            ))}
                            {gaps.length === 0 && <p className="text-sm text-muted-foreground">No gaps recorded.</p>}
                        </div>
                    </div>
                )}

                {activeSection === "ai_usage" && (
                    <div>
                        <h1 className="text-2xl font-bold mb-6">AI Usage Monitoring</h1>
                        <div className="space-y-2">
                            {aiLogs.slice(0, 50).map(log => (
                                <Card key={log.id} className="p-4 flex items-center justify-between">
                                    <div>
                                        <div className="font-medium text-sm">{log.agent_name}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {log.provider} · {log.latency_ms}ms · {log.success ? "Success" : "Failed"}
                                        </div>
                                    </div>
                                    <span className="text-xs text-muted-foreground">{new Date(log.created_date).toLocaleString()}</span>
                                </Card>
                            ))}
                            {aiLogs.length === 0 && <p className="text-sm text-muted-foreground">No AI requests logged.</p>}
                        </div>
                    </div>
                )}

                {activeSection === "tasks" && (
                    <div>
                        <h1 className="text-2xl font-bold mb-6">Learning Tasks</h1>
                        <div className="space-y-2">
                            {tasks.slice(0, 50).map(t => (
                                <Card key={t.id} className="p-4 flex items-center justify-between">
                                    <div>
                                        <div className="font-medium text-sm">{t.title}</div>
                                        <div className="text-xs text-muted-foreground">Priority {t.priority} · {t.status}</div>
                                    </div>
                                    <span className="text-xs text-muted-foreground">{t.difficulty}</span>
                                </Card>
                            ))}
                            {tasks.length === 0 && <p className="text-sm text-muted-foreground">No tasks recorded.</p>}
                        </div>
                    </div>
                )}

                {["conversations", "analytics", "content"].includes(activeSection) && (
                    <div>
                        <h1 className="text-2xl font-bold mb-6">{ADMIN_SECTIONS.find(s => s.key === activeSection)?.label}</h1>
                        <Card className="p-8 text-center">
                            <p className="text-muted-foreground">This section aggregates data from across the platform. Detailed analytics are available in the overview.</p>
                        </Card>
                    </div>
                )}
            </main>
        </div>
    );
}
