import React, { useState, useEffect, useCallback } from "react";
import { kyren } from "@/api/kyrenClient";
import { useAuth } from "@/lib/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
    Users, Plus, GraduationCap, Activity, Brain, ClipboardList, TrendingUp,
} from "lucide-react";
import { SKILLS_GRAPH } from "@/lib/skillsGraph";
import { createNotification } from "@/lib/notifications";
import { cn } from "@/lib/utils";

const masteryColor = (pct) => {
    if (!pct || pct === 0) return "bg-muted/30 text-muted-foreground";
    if (pct < 30) return "bg-red-500/15 text-red-400";
    if (pct < 60) return "bg-amber-500/15 text-amber-500";
    if (pct < 80) return "bg-primary/15 text-primary";
    return "bg-emerald-500/15 text-emerald-500";
};

function generateInviteCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export default function TeacherDashboard() {
    const { user } = useAuth();
    const [classrooms, setClassrooms] = useState([]);
    const [selectedClassroom, setSelectedClassroom] = useState(null);
    const [studentMastery, setStudentMastery] = useState({});
    const [studentGaps, setStudentGaps] = useState([]);
    const [activityFeed, setActivityFeed] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [showAssignDialog, setShowAssignDialog] = useState(false);
    const [drillDownStudent, setDrillDownStudent] = useState(null);
    const [newClassroom, setNewClassroom] = useState({ name: "", subject_focus: "", description: "" });
    const [assignTask, setAssignTask] = useState({ title: "", description: "", skill_id: "", difficulty: "beginner", selectedStudents: [] });
    const [assigning, setAssigning] = useState(false);

    const fetchClassrooms = useCallback(async () => {
        if (!user?.id) return;
        try {
            const rooms = await kyren.entities.Classroom.filter({ teacher_id: user.id }, "-created_date");
            setClassrooms(rooms);
            if (rooms.length > 0 && !selectedClassroom) {
                setSelectedClassroom(rooms[0]);
            }
        } catch (e) { /* silent */ }
    }, [user?.id]);

    const loadClassroomData = useCallback(async (classroom) => {
        if (!classroom?.enrolled_student_ids?.length) {
            setStudentMastery({});
            setStudentGaps([]);
            setActivityFeed([]);
            return;
        }
        setLoading(true);
        try {
            const studentIds = classroom.enrolled_student_ids;
            const [allMastery, allGaps, allLogs] = await Promise.all([
                Promise.all(studentIds.map((sid) =>
                    kyren.entities.MasteryScore.filter({ user_id: sid }).catch(() => [])
                )),
                Promise.all(studentIds.map((sid) =>
                    kyren.entities.LearningGap.filter({ user_id: sid }).catch(() => [])
                )),
                Promise.all(studentIds.map((sid) =>
                    kyren.entities.TaskActivityLog.filter({ user_id: sid }, "-created_date", 20).catch(() => [])
                )),
            ]);

            // Build mastery map: { studentId: { skill_id: score } }
            const masteryMap = {};
            studentIds.forEach((sid, i) => {
                masteryMap[sid] = allMastery[i] || [];
            });
            setStudentMastery(masteryMap);

            // Aggregate gaps
            const gapAgg = {};
            (allGaps.flat() || []).forEach((g) => {
                const key = g.skill_id || g.skill_name;
                if (!gapAgg[key]) gapAgg[key] = { skill_id: g.skill_id, skill_name: g.skill_name, count: 0, severity: g.severity };
                gapAgg[key].count++;
            });
            setStudentGaps(Object.values(gapAgg).sort((a, b) => b.count - a.count));

            // Aggregate activity
            const logs = (allLogs.flat() || []).sort((a, b) =>
                new Date(b.created_date) - new Date(a.created_date)
            ).slice(0, 25);
            setActivityFeed(logs);
        } catch (e) { /* silent */ }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchClassrooms();
    }, [fetchClassrooms]);

    useEffect(() => {
        if (selectedClassroom) loadClassroomData(selectedClassroom);
    }, [selectedClassroom]);

    const handleCreateClassroom = async () => {
        if (!newClassroom.name) return;
        try {
            const room = await kyren.entities.Classroom.create({
                teacher_id: user.id,
                teacher_name: user.full_name || user.email,
                name: newClassroom.name,
                subject_focus: newClassroom.subject_focus,
                description: newClassroom.description,
                invite_code: generateInviteCode(),
                enrolled_student_ids: [user.id], // self-enroll for demo
                enrolled_student_count: 1,
            });
            setClassrooms([room, ...classrooms]);
            setSelectedClassroom(room);
            setShowCreateDialog(false);
            setNewClassroom({ name: "", subject_focus: "", description: "" });
        } catch (e) {
            console.error("Failed to create classroom:", e);
        }
    };

    const handleAssign = async () => {
        if (!assignTask.title || !selectedClassroom) return;
        setAssigning(true);
        const students = assignTask.selectedStudents.length > 0
            ? assignTask.selectedStudents
            : selectedClassroom.enrolled_student_ids;
        const skill = SKILLS_GRAPH.find((s) => s.id === assignTask.skill_id);

        try {
            const tasks = students.map((sid) => ({
                user_id: sid,
                title: assignTask.title,
                description: assignTask.description || "",
                reason: `Assigned by your teacher (${user.full_name || user.email})`,
                skill_id: assignTask.skill_id || "",
                skill_name: skill?.name || "",
                difficulty: assignTask.difficulty,
                priority: 5,
                status: "Approved",
                estimated_time: "45 min",
            }));
            await kyren.entities.LearningTask.bulkCreate(tasks);

            // Notify each student
            await Promise.all(students.map((sid) =>
                createNotification(sid, "teacher_assignment", "New Assignment",
                    `Your teacher assigned: "${assignTask.title}"`)
            ));

            // Log activity
            await kyren.entities.TaskActivityLog.bulkCreate(
                students.map((sid) => ({
                    user_id: sid,
                    task_title: assignTask.title,
                    event_type: "created",
                    message: `Teacher assigned: ${assignTask.title}`,
                }))
            );

            setShowAssignDialog(false);
            setAssignTask({ title: "", description: "", skill_id: "", difficulty: "beginner", selectedStudents: [] });
            loadClassroomData(selectedClassroom);
        } catch (e) {
            console.error("Assignment failed:", e);
        }
        setAssigning(false);
    };

    const enrolledStudents = selectedClassroom?.enrolled_student_ids || [];
    const heatmapSkills = SKILLS_GRAPH.slice(0, 10);

    return (
        <div className="p-6 lg:p-10 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
                <div>
                    <span className="mono-label text-primary">// Teacher Dashboard</span>
                    <h1 className="text-3xl font-heading font-semibold mt-2">
                        Your <span className="font-display italic">classrooms</span>
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Monitor class mastery, assign tasks, and spot learning gaps at scale.
                    </p>
                </div>
                <Button onClick={() => setShowCreateDialog(true)} className="btn-glow text-white border-0 gap-2">
                    <Plus className="w-4 h-4" />
                    New Classroom
                </Button>
            </div>

            {/* Classroom tabs */}
            {classrooms.length === 0 ? (
                <Card className="p-12 text-center">
                    <GraduationCap className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                    <h2 className="text-xl font-heading font-semibold mb-2">No classrooms yet</h2>
                    <p className="text-muted-foreground mb-6">Create your first classroom to start tracking student progress.</p>
                    <Button onClick={() => setShowCreateDialog(true)} className="btn-glow text-white border-0 gap-2">
                        <Plus className="w-4 h-4" />
                        Create classroom
                    </Button>
                </Card>
            ) : (
                <>
                    <div className="flex flex-wrap gap-2 mb-6">
                        {classrooms.map((room) => (
                            <button
                                key={room.id}
                                onClick={() => setSelectedClassroom(room)}
                                className={cn(
                                    "px-4 py-2.5 rounded-full text-sm font-medium transition flex items-center gap-2",
                                    selectedClassroom?.id === room.id
                                        ? "glass-nav text-foreground border-primary/30"
                                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                )}
                            >
                                <Users className="w-4 h-4" />
                                {room.name}
                                <span className="mono-label text-muted-foreground/50">{room.enrolled_student_count || room.enrolled_student_ids?.length || 0}</span>
                            </button>
                        ))}
                    </div>

                    {selectedClassroom && (
                        <>
                            {/* Classroom info */}
                            <div className="grid md:grid-cols-4 gap-4 mb-8">
                                <Card className="p-5">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                            <Users className="w-5 h-5 text-primary" />
                                        </div>
                                        <div>
                                            <div className="text-2xl font-heading font-bold">{enrolledStudents.length}</div>
                                            <div className="mono-label text-muted-foreground">Students</div>
                                        </div>
                                    </div>
                                </Card>
                                <Card className="p-5">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                                            <Brain className="w-5 h-5 text-amber-500" />
                                        </div>
                                        <div>
                                            <div className="text-2xl font-heading font-bold">{studentGaps.length}</div>
                                            <div className="mono-label text-muted-foreground">Class Gaps</div>
                                        </div>
                                    </div>
                                </Card>
                                <Card className="p-5">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                                            <Activity className="w-5 h-5 text-emerald-500" />
                                        </div>
                                        <div>
                                            <div className="text-2xl font-heading font-bold">{activityFeed.length}</div>
                                            <div className="mono-label text-muted-foreground">Recent Events</div>
                                        </div>
                                    </div>
                                </Card>
                                <Card className="p-5">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                            <ClipboardList className="w-5 h-5 text-primary" />
                                        </div>
                                        <div>
                                            <div className="text-xs text-muted-foreground">Invite Code</div>
                                            <div className="text-lg font-mono font-bold tracking-wider">{selectedClassroom.invite_code}</div>
                                        </div>
                                    </div>
                                </Card>
                            </div>

                            {/* Assign button */}
                            <div className="flex justify-end mb-4">
                                <Button onClick={() => setShowAssignDialog(true)} className="btn-glow text-white border-0 gap-2">
                                    <ClipboardList className="w-4 h-4" />
                                    Assign Task to Class
                                </Button>
                            </div>

                            <div className="grid lg:grid-cols-3 gap-6">
                                {/* Mastery heatmap */}
                                <div className="lg:col-span-2">
                                    <Card className="p-6">
                                        <div className="flex items-center gap-2 mb-4">
                                            <TrendingUp className="w-5 h-5 text-primary" />
                                            <h2 className="text-lg font-heading font-semibold">Class Mastery Heatmap</h2>
                                        </div>
                                        {loading ? (
                                            <div className="text-center text-muted-foreground py-8">Loading mastery data…</div>
                                        ) : enrolledStudents.length === 0 ? (
                                            <div className="text-center text-muted-foreground py-8">No students enrolled yet.</div>
                                        ) : (
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-sm">
                                                    <thead>
                                                        <tr>
                                                            <th className="text-left py-2 px-2 mono-label text-muted-foreground sticky left-0 bg-card">Skill</th>
                                                            {enrolledStudents.map((sid, i) => (
                                                                <th key={sid} className="py-2 px-2 text-center mono-label text-muted-foreground">
                                                                    S{i + 1}
                                                                </th>
                                                            ))}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {heatmapSkills.map((skill) => (
                                                            <tr key={skill.id} className="border-t border-border">
                                                                <td className="py-2 px-2 text-xs text-muted-foreground sticky left-0 bg-card">{skill.name}</td>
                                                                {enrolledStudents.map((sid) => {
                                                                    const score = studentMastery[sid]?.find((m) => m.skill_id === skill.id);
                                                                    const pct = score?.percentage || 0;
                                                                    return (
                                                                        <td key={sid} className="py-1.5 px-1.5 text-center">
                                                                            <div className={cn("w-10 h-8 rounded-md flex items-center justify-center text-xs font-medium cursor-pointer hover:ring-1 hover:ring-primary/30 transition", masteryColor(pct))}>
                                                                                {pct > 0 ? `${pct}%` : "—"}
                                                                            </div>
                                                                        </td>
                                                                    );
                                                                })}
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                                <div className="flex items-center gap-3 mt-4 text-xs text-muted-foreground">
                                                    <span>Legend:</span>
                                                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500/15" /> &lt;30%</span>
                                                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-500/15" /> &lt;60%</span>
                                                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-primary/15" /> &lt;80%</span>
                                                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500/15" /> ≥80%</span>
                                                </div>
                                            </div>
                                        )}
                                    </Card>
                                </div>

                                {/* Class gaps + activity */}
                                <div className="space-y-6">
                                    <Card className="p-6">
                                        <div className="flex items-center gap-2 mb-4">
                                            <Brain className="w-5 h-5 text-amber-500" />
                                            <h2 className="text-lg font-heading font-semibold">Top Class Gaps</h2>
                                        </div>
                                        {studentGaps.length === 0 ? (
                                            <p className="text-sm text-muted-foreground py-4">No gaps detected yet.</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {studentGaps.slice(0, 6).map((g, i) => (
                                                    <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/20">
                                                        <span className="text-sm truncate">{g.skill_name}</span>
                                                        <span className="mono-label text-amber-500 shrink-0">{g.count} students</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </Card>

                                    <Card className="p-6">
                                        <div className="flex items-center gap-2 mb-4">
                                            <Activity className="w-5 h-5 text-emerald-500" />
                                            <h2 className="text-lg font-heading font-semibold">Activity Feed</h2>
                                        </div>
                                        {activityFeed.length === 0 ? (
                                            <p className="text-sm text-muted-foreground py-4">No recent activity.</p>
                                        ) : (
                                            <div className="space-y-2 max-h-64 overflow-y-auto">
                                                {activityFeed.slice(0, 15).map((log, i) => (
                                                    <div key={log.id || i} className="text-xs flex gap-2 py-1.5 border-b border-border last:border-0">
                                                        <span className="mono-label text-muted-foreground/50 shrink-0">
                                                            {new Date(log.created_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                                                        </span>
                                                        <span className="text-muted-foreground">{log.message || log.event_type}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </Card>
                                </div>
                            </div>
                        </>
                    )}
                </>
            )}

            {/* Create Classroom Dialog */}
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogContent className="glass-card max-w-md">
                    <DialogHeader>
                        <DialogTitle>Create a new classroom</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div>
                            <Label className="mb-1.5 block">Classroom name</Label>
                            <Input
                                value={newClassroom.name}
                                onChange={(e) => setNewClassroom({ ...newClassroom, name: e.target.value })}
                                placeholder="e.g. CS Fundamentals 2026"
                            />
                        </div>
                        <div>
                            <Label className="mb-1.5 block">Subject focus</Label>
                            <Input
                                value={newClassroom.subject_focus}
                                onChange={(e) => setNewClassroom({ ...newClassroom, subject_focus: e.target.value })}
                                placeholder="e.g. Programming, Physics, Mathematics"
                            />
                        </div>
                        <div>
                            <Label className="mb-1.5 block">Description (optional)</Label>
                            <Input
                                value={newClassroom.description}
                                onChange={(e) => setNewClassroom({ ...newClassroom, description: e.target.value })}
                                placeholder="Brief description for your students"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
                        <Button onClick={handleCreateClassroom} className="btn-glow text-white border-0" disabled={!newClassroom.name}>
                            Create classroom
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Assign Task Dialog */}
            <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
                <DialogContent className="glass-card max-w-md">
                    <DialogHeader>
                        <DialogTitle>Assign task to {selectedClassroom?.name}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div>
                            <Label className="mb-1.5 block">Task title</Label>
                            <Input
                                value={assignTask.title}
                                onChange={(e) => setAssignTask({ ...assignTask, title: e.target.value })}
                                placeholder="e.g. Complete Arrays practice set"
                            />
                        </div>
                        <div>
                            <Label className="mb-1.5 block">Description (optional)</Label>
                            <Input
                                value={assignTask.description}
                                onChange={(e) => setAssignTask({ ...assignTask, description: e.target.value })}
                                placeholder="What should students do?"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label className="mb-1.5 block">Related skill</Label>
                                <select
                                    value={assignTask.skill_id}
                                    onChange={(e) => setAssignTask({ ...assignTask, skill_id: e.target.value })}
                                    className="w-full h-9 rounded-full bg-muted/30 border border-border px-3 text-sm"
                                >
                                    <option value="">None</option>
                                    {SKILLS_GRAPH.map((s) => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <Label className="mb-1.5 block">Difficulty</Label>
                                <select
                                    value={assignTask.difficulty}
                                    onChange={(e) => setAssignTask({ ...assignTask, difficulty: e.target.value })}
                                    className="w-full h-9 rounded-full bg-muted/30 border border-border px-3 text-sm"
                                >
                                    <option value="beginner">Beginner</option>
                                    <option value="intermediate">Intermediate</option>
                                    <option value="advanced">Advanced</option>
                                </select>
                            </div>
                        </div>
                        <div className="text-sm text-muted-foreground">
                            This will create a real learning task for all {enrolledStudents.length} enrolled student(s).
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowAssignDialog(false)}>Cancel</Button>
                        <Button onClick={handleAssign} className="btn-glow text-white border-0" disabled={!assignTask.title || assigning}>
                            {assigning ? "Assigning…" : `Assign to ${enrolledStudents.length} students`}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}