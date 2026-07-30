import React, { useState, useEffect, useCallback } from "react";
import { kyren } from "@/api/kyrenClient";
import { useAuth } from "@/lib/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Building2, Users, GraduationCap, Brain, Plus, X, Mail, Server,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function InstitutionConsole() {
    const { user } = useAuth();
    const [org, setOrg] = useState(null);
    const [classrooms, setClassrooms] = useState([]);
    const [orgGaps, setOrgGaps] = useState([]);
    const [aiHealth, setAiHealth] = useState({ total: 0, success: 0, failed: 0 });
    const [loading, setLoading] = useState(true);
    const [showInviteDialog, setShowInviteDialog] = useState(false);
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviting, setInviting] = useState(false);

    const loadData = useCallback(async () => {
        if (!user?.id) return;
        setLoading(true);
        try {
            // Find org where user is an admin
            let orgRecord = null;
            if (user.org_id) {
                try {
                    orgRecord = await kyren.entities.Organization.get(user.org_id);
                } catch (e) { /* not found */ }
            }
            if (!orgRecord) {
                // Try finding by admin_ids containing user id
                const orgs = await kyren.entities.Organization.filter({}, "-created_date", 50);
                orgRecord = orgs.find((o) => o.admin_ids?.includes(user.id)) || orgs[0] || null;
            }
            setOrg(orgRecord);

            if (orgRecord) {
                // Fetch classrooms in this org
                const rooms = await kyren.entities.Classroom.filter(
                    { org_id: orgRecord.id },
                    "-created_date"
                ).catch(() => []);
                setClassrooms(rooms);

                // Aggregate gaps across all students in all classrooms
                const allStudentIds = rooms.flatMap((r) => r.enrolled_student_ids || []);
                if (allStudentIds.length > 0) {
                    const gapResults = await Promise.all(
                        allStudentIds.map((sid) =>
                            kyren.entities.LearningGap.filter({ user_id: sid, resolved: false }).catch(() => [])
                        )
                    );
                    const gapAgg = {};
                    gapResults.flat().forEach((g) => {
                        const key = g.skill_id || g.skill_name;
                        if (!gapAgg[key]) gapAgg[key] = { skill_name: g.skill_name, count: 0, severity: g.severity };
                        gapAgg[key].count++;
                    });
                    setOrgGaps(Object.values(gapAgg).sort((a, b) => b.count - a.count).slice(0, 10));
                }

                // AI health from AIUsageLog
                const logs = await kyren.entities.AIUsageLog.filter({}, "-created_date", 100).catch(() => []);
                const success = logs.filter((l) => l.success).length;
                setAiHealth({ total: logs.length, success, failed: logs.length - success });
            }
        } catch (e) { /* silent */ }
        setLoading(false);
    }, [user?.id, user?.org_id]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleCreateOrg = async () => {
        try {
            const newOrg = await kyren.entities.Organization.create({
                name: `${user.full_name || user.email}'s Institution`,
                plan_tier: "institution",
                seat_count: 50,
                seats_used: 1,
                admin_ids: [user.id],
                teacher_ids: [],
                classroom_ids: [],
                subscription_status: "active",
            });
            await kyren.auth.updateMe({ org_id: newOrg.id });
            setOrg(newOrg);
            loadData();
        } catch (e) {
            console.error("Failed to create org:", e);
        }
    };

    const handleInviteTeacher = async () => {
        if (!inviteEmail || !org) return;
        setInviting(true);
        try {
            await kyren.users.inviteUser(inviteEmail, "teacher");
            // Add to org's teacher_ids
            await kyren.entities.Organization.update(org.id, {
                teacher_ids: [...(org.teacher_ids || []), inviteEmail],
                seats_used: (org.seats_used || 0) + 1,
            });
            setShowInviteDialog(false);
            setInviteEmail("");
            loadData();
        } catch (e) {
            console.error("Invite failed:", e);
        }
        setInviting(false);
    };

    const seatUsagePct = org ? Math.round(((org.seats_used || 0) / (org.seat_count || 1)) * 100) : 0;
    const totalStudents = classrooms.reduce((sum, r) => sum + (r.enrolled_student_ids?.length || 0), 0);
    const uptimePct = aiHealth.total > 0 ? Math.round((aiHealth.success / aiHealth.total) * 100) : 100;

    if (loading) {
        return (
            <div className="p-6 lg:p-10 max-w-6xl mx-auto">
                <Card className="p-12 text-center text-muted-foreground">Loading institution data…</Card>
            </div>
        );
    }

    if (!org) {
        return (
            <div className="p-6 lg:p-10 max-w-6xl mx-auto">
                <Card className="p-12 text-center">
                    <Building2 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                    <h2 className="text-xl font-heading font-semibold mb-2">No institution linked</h2>
                    <p className="text-muted-foreground mb-6">
                        Create your institution to manage teachers, classrooms, seat usage, and org-wide analytics.
                    </p>
                    <Button onClick={handleCreateOrg} className="btn-glow text-white border-0 gap-2">
                        <Plus className="w-4 h-4" />
                        Create institution
                    </Button>
                </Card>
            </div>
        );
    }

    return (
        <div className="p-6 lg:p-10 max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
                <div>
                    <span className="mono-label text-primary">// Institution Console</span>
                    <h1 className="text-3xl font-heading font-semibold mt-2">{org.name}</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Plan: <span className="text-primary capitalize">{org.plan_tier}</span> · Status:{" "}
                        <span className={cn("capitalize", org.subscription_status === "active" ? "text-emerald-500" : "text-amber-500")}>
                            {org.subscription_status}
                        </span>
                    </p>
                </div>
                <Button onClick={() => setShowInviteDialog(true)} className="btn-glow text-white border-0 gap-2">
                    <Mail className="w-4 h-4" />
                    Invite teacher
                </Button>
            </div>

            {/* Key metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <Card className="p-5">
                    <div className="flex items-center gap-3 mb-2">
                        <Users className="w-5 h-5 text-primary" />
                        <span className="mono-label text-muted-foreground">Teachers</span>
                    </div>
                    <div className="text-2xl font-heading font-bold">{org.teacher_ids?.length || 0}</div>
                </Card>
                <Card className="p-5">
                    <div className="flex items-center gap-3 mb-2">
                        <GraduationCap className="w-5 h-5 text-primary" />
                        <span className="mono-label text-muted-foreground">Classrooms</span>
                    </div>
                    <div className="text-2xl font-heading font-bold">{classrooms.length}</div>
                </Card>
                <Card className="p-5">
                    <div className="flex items-center gap-3 mb-2">
                        <Building2 className="w-5 h-5 text-emerald-500" />
                        <span className="mono-label text-muted-foreground">Students</span>
                    </div>
                    <div className="text-2xl font-heading font-bold">{totalStudents}</div>
                </Card>
                <Card className="p-5">
                    <div className="flex items-center gap-3 mb-2">
                        <Server className="w-5 h-5 text-amber-500" />
                        <span className="mono-label text-muted-foreground">AI Uptime</span>
                    </div>
                    <div className="text-2xl font-heading font-bold">{uptimePct}%</div>
                </Card>
            </div>

            {/* Seat usage */}
            <Card className="p-6 mb-6">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Users className="w-5 h-5 text-primary" />
                        <h2 className="text-lg font-heading font-semibold">Seat Usage</h2>
                    </div>
                    <span className="text-sm text-muted-foreground">
                        {org.seats_used || 0} / {org.seat_count || 0} seats used
                    </span>
                </div>
                <div className="w-full h-3 rounded-full bg-muted/30 overflow-hidden">
                    <div
                        className={cn(
                            "h-full rounded-full transition-all",
                            seatUsagePct > 90 ? "bg-red-500" : seatUsagePct > 70 ? "bg-amber-500" : "bg-primary"
                        )}
                        style={{ width: `${seatUsagePct}%` }}
                    />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                    {org.seat_count - (org.seats_used || 0)} seats remaining. Invite teachers and students to fill them.
                </p>
            </Card>

            <div className="grid lg:grid-cols-2 gap-6">
                {/* Classrooms list */}
                <Card className="p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <GraduationCap className="w-5 h-5 text-primary" />
                        <h2 className="text-lg font-heading font-semibold">Classrooms</h2>
                    </div>
                    {classrooms.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4">No classrooms created yet. Your teachers can create classrooms under this institution.</p>
                    ) : (
                        <div className="space-y-3">
                            {classrooms.map((room) => (
                                <div key={room.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/20">
                                    <div>
                                        <div className="font-medium text-sm">{room.name}</div>
                                        <div className="mono-label text-muted-foreground">{room.subject_focus || "General"}</div>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Users className="w-4 h-4" />
                                        {room.enrolled_student_ids?.length || 0}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>

                {/* Org-wide gaps */}
                <Card className="p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <Brain className="w-5 h-5 text-amber-500" />
                        <h2 className="text-lg font-heading font-semibold">Org-Wide Learning Gaps</h2>
                    </div>
                    {orgGaps.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4">No gaps detected across your classrooms yet.</p>
                    ) : (
                        <div className="space-y-2">
                            {orgGaps.map((g, i) => (
                                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/20">
                                    <span className="text-sm truncate">{g.skill_name}</span>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className="mono-label text-amber-500">{g.count} students</span>
                                        <span className={cn(
                                            "text-xs px-2 py-0.5 rounded-full",
                                            g.severity === "critical" ? "bg-red-500/15 text-red-600" :
                                                g.severity === "moderate" ? "bg-amber-500/15 text-amber-500" :
                                                    "bg-primary/15 text-primary"
                                        )}>
                                            {g.severity}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
            </div>

            {/* Invite Dialog */}
            {showInviteDialog && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowInviteDialog(false)}>
                    <div className="glass-card rounded-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-heading font-semibold">Invite a teacher</h3>
                            <button onClick={() => setShowInviteDialog(false)} className="text-muted-foreground hover:text-foreground">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <p className="text-sm text-muted-foreground mb-4">
                            Invite a teacher by email. They'll join your institution with a teacher role and can create classrooms.
                        </p>
                        <div>
                            <Label className="mb-1.5 block">Teacher's email</Label>
                            <Input
                                type="email"
                                value={inviteEmail}
                                onChange={(e) => setInviteEmail(e.target.value)}
                                placeholder="teacher@school.edu"
                            />
                        </div>
                        <div className="flex gap-2 mt-4">
                            <Button variant="outline" onClick={() => setShowInviteDialog(false)} className="flex-1">Cancel</Button>
                            <Button onClick={handleInviteTeacher} className="btn-glow text-white border-0 flex-1" disabled={!inviteEmail || inviting}>
                                {inviting ? "Inviting…" : "Send invite"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
