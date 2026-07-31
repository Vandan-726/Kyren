import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAppData } from "@/lib/appData";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import {
    Lock, CheckCircle2, Loader2, Target, Sparkles,
    Circle, X, Clock, TrendingUp, BookOpen
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
    SKILLS_GRAPH,
    SKILL_DEPENDENCIES,
    getDirectPrerequisites,
    isSkillUnlocked,
} from "@/lib/skillsGraph";

/* ─────────────────────── Status Config ─────────────────────── */
const STATUS_CONFIG = {
    mastered:     { color: "border-green-500 bg-green-500/10",  icon: CheckCircle2, iconColor: "text-green-500",          label: "Mastered",      badgeBg: "bg-green-500/15 text-green-600" },
    in_progress:  { color: "border-primary bg-primary/10",      icon: Loader2,      iconColor: "text-primary",            label: "In Progress",   badgeBg: "bg-primary/15 text-primary" },
    recommended:  { color: "border-amber-500 bg-amber-500/10",  icon: Target,       iconColor: "text-amber-500",          label: "Recommended",   badgeBg: "bg-amber-500/15 text-amber-600" },
    locked:       { color: "border-muted bg-muted/30 opacity-60", icon: Lock,       iconColor: "text-muted-foreground",   label: "Locked",        badgeBg: "bg-muted text-muted-foreground" },
};

/* ──────────── Compute level (depth) for each skill ──────────── */
function computeSkillLevels(skills, deps) {
    const levels = {};
    const skillIds = new Set(skills.map(s => s.id));

    // Initialize all skills at level 0
    skills.forEach(s => { levels[s.id] = 0; });

    // BFS: compute max depth from roots
    let changed = true;
    while (changed) {
        changed = false;
        for (const dep of deps) {
            if (!skillIds.has(dep.skill_id) || !skillIds.has(dep.prerequisite_skill_id)) continue;
            const newLevel = levels[dep.prerequisite_skill_id] + 1;
            if (newLevel > levels[dep.skill_id]) {
                levels[dep.skill_id] = newLevel;
                changed = true;
            }
        }
    }

    return levels;
}

/* ──────────── Determine skill status ──────────── */
function getSkillStatus(skillId, learningTasks, masteryScores) {
    // Check mastery scores first
    const score = masteryScores.find(m => m.skill_id === skillId);
    if (score) {
        const level = (score.mastery_level || score.status || "").toLowerCase();
        if (level === "mastered" || level === "proficient") return "mastered";
        if (level === "learning" || level === "in_progress") return "in_progress";
    }

    // Check learning tasks
    const task = learningTasks.find(t => t.skill_id === skillId);
    if (task) {
        const s = (task.status || "").toLowerCase();
        if (s === "completed" || s === "mastered") return "mastered";
        if (s === "in_progress" || s === "in progress") return "in_progress";
        if (s === "detected" || s === "suggested" || s === "approved") return "recommended";
    }

    // Check if unlocked via prerequisites
    if (isSkillUnlocked(skillId, masteryScores)) return "recommended";

    return "locked";
}

/* ──────────── Skill Card ──────────── */
function SkillCard({ skill, status, score, isSelected, onClick }) {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.locked;
    const Icon = config.icon;

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.03, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={onClick}
            className={cn(
                "relative w-full p-4 rounded-2xl border-2 cursor-pointer transition-all duration-200",
                config.color,
                isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background shadow-lg",
                status !== "locked" && "hover:shadow-md"
            )}
        >
            {/* Status Icon */}
            <div className="flex items-center justify-between mb-3">
                <div className={cn(
                    "w-8 h-8 rounded-xl flex items-center justify-center",
                    status === "mastered" ? "bg-green-500/20" :
                    status === "in_progress" ? "bg-primary/20" :
                    status === "recommended" ? "bg-amber-500/20" :
                    "bg-muted/50"
                )}>
                    <Icon className={cn(
                        "w-4 h-4",
                        config.iconColor,
                        status === "in_progress" && "animate-spin"
                    )} />
                </div>
                {score && score.mastery_percentage > 0 && (
                    <span className="text-xs font-bold tabular-nums">{Math.round(score.mastery_percentage || score.percentage || 0)}%</span>
                )}
            </div>

            {/* Title */}
            <h3 className="font-semibold text-sm leading-tight mb-1">{skill.name}</h3>

            {/* Subject Area */}
            <p className="text-[11px] text-muted-foreground font-medium">{skill.subject_area}</p>

            {/* Progress bar for in-progress */}
            {status === "in_progress" && score && (
                <div className="mt-3 w-full h-1.5 rounded-full bg-muted/50 overflow-hidden">
                    <div
                        className="h-full rounded-full bg-primary transition-all duration-500"
                        style={{ width: `${Math.round(score.mastery_percentage || score.percentage || 20)}%` }}
                    />
                </div>
            )}

            {/* Mastered check overlay */}
            {status === "mastered" && (
                <div className="absolute top-2 right-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                </div>
            )}
        </motion.div>
    );
}

/* ──────────── Main Component ──────────── */
export default function Roadmap() {
    const navigate = useNavigate();
    const { learningTasks, masteryScores } = useAppData();
    const { user } = useAuth();
    const [selectedSkill, setSelectedSkill] = useState(null);

    // Check if the AI is currently building the plan
    const reviewKey = user?.id ? `kyren-review-plan-${user.id}` : null;
    const reviewState = reviewKey ? JSON.parse(localStorage.getItem(reviewKey) || "{}") : {};
    const isBuilding = reviewState.status === "building";

    // Compute levels and organize skills
    const { levelColumns, maxLevel } = useMemo(() => {
        const levels = computeSkillLevels(SKILLS_GRAPH, SKILL_DEPENDENCIES);
        const max = Math.max(...Object.values(levels), 0);
        const columns = [];

        for (let lvl = 0; lvl <= max; lvl++) {
            const skillsAtLevel = SKILLS_GRAPH
                .filter(s => levels[s.id] === lvl)
                .sort((a, b) => a.name.localeCompare(b.name));
            columns.push(skillsAtLevel);
        }

        return { levelColumns: columns, maxLevel: max };
    }, []);

    // Compute status for each skill
    const skillStatuses = useMemo(() => {
        const statuses = {};
        SKILLS_GRAPH.forEach(skill => {
            statuses[skill.id] = getSkillStatus(skill.id, learningTasks, masteryScores);
        });
        return statuses;
    }, [learningTasks, masteryScores]);

    // Stats
    const stats = useMemo(() => {
        const total = SKILLS_GRAPH.length;
        const mastered = Object.values(skillStatuses).filter(s => s === "mastered").length;
        const inProgress = Object.values(skillStatuses).filter(s => s === "in_progress").length;
        const recommended = Object.values(skillStatuses).filter(s => s === "recommended").length;
        return { total, mastered, inProgress, recommended };
    }, [skillStatuses]);

    const handleCardClick = (skill) => {
        const status = skillStatuses[skill.id];
        const score = masteryScores.find(m => m.skill_id === skill.id);
        const task = learningTasks.find(t => t.skill_id === skill.id);
        const prereqs = getDirectPrerequisites(skill.id)
            .map(pid => SKILLS_GRAPH.find(s => s.id === pid))
            .filter(Boolean);

        setSelectedSkill({
            ...skill,
            computedStatus: status,
            score,
            task,
            prereqs,
        });
    };

    return (
        <div className="p-6 md:p-8 max-w-[1400px] mx-auto">
            {/* Header */}
            <div className="mb-2">
                <h1 className="text-2xl md:text-3xl font-bold">Learning Roadmap</h1>
                <p className="text-muted-foreground mt-1">Your skill dependency graph. Master prerequisites to unlock new skills.</p>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-5 mb-6 text-xs">
                {Object.entries(STATUS_CONFIG).map(([key, config]) => {
                    const Icon = config.icon;
                    return (
                        <div key={key} className="flex items-center gap-1.5">
                            <Icon className={cn("w-3.5 h-3.5", config.iconColor)} />
                            <span className="text-muted-foreground">{config.label}</span>
                        </div>
                    );
                })}
            </div>

            {isBuilding ? (
                <div className="text-center py-16">
                    <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                        <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    </div>
                    <h2 className="text-xl font-semibold mb-2">Generating Your Roadmap...</h2>
                    <p className="text-muted-foreground mb-6">KYREN is analyzing your gaps and building a custom learning path.</p>
                </div>
            ) : (
                <>
                    {/* Level Grid */}
                    <div className="overflow-x-auto pb-4">
                        <div className="min-w-max">
                            {/* Level Headers */}
                            <div className="grid gap-4 mb-4" style={{ gridTemplateColumns: `repeat(${maxLevel + 1}, minmax(170px, 1fr))` }}>
                                {levelColumns.map((_, lvl) => (
                                    <div key={lvl} className="text-center">
                                        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                            Level {lvl + 1}
                                        </span>
                                    </div>
                                ))}
                            </div>

                            {/* Skill Cards Grid */}
                            <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${maxLevel + 1}, minmax(170px, 1fr))` }}>
                                {levelColumns.map((skills, lvl) => (
                                    <div key={lvl} className="flex flex-col gap-3">
                                        {skills.map((skill, idx) => {
                                            const status = skillStatuses[skill.id];
                                            const score = masteryScores.find(m => m.skill_id === skill.id);
                                            return (
                                                <SkillCard
                                                    key={skill.id}
                                                    skill={skill}
                                                    status={status}
                                                    score={score}
                                                    isSelected={selectedSkill?.id === skill.id}
                                                    onClick={() => handleCardClick(skill)}
                                                />
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Detail Panel */}
                    <AnimatePresence>
                        {selectedSkill && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 20 }}
                                className="mt-6 p-6 rounded-2xl border border-border bg-card shadow-sm"
                            >
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-1">
                                            <h2 className="text-xl font-semibold">{selectedSkill.name}</h2>
                                            <span className={cn(
                                                "text-[11px] font-semibold px-2.5 py-0.5 rounded-full",
                                                STATUS_CONFIG[selectedSkill.computedStatus]?.badgeBg
                                            )}>
                                                {STATUS_CONFIG[selectedSkill.computedStatus]?.label}
                                            </span>
                                        </div>
                                        <p className="text-sm text-muted-foreground">{selectedSkill.description}</p>
                                    </div>
                                    <button
                                        onClick={() => setSelectedSkill(null)}
                                        className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                    {/* Mastery */}
                                    <div className="p-4 rounded-xl bg-muted/30 border border-border/30">
                                        <div className="flex items-center gap-2 mb-2">
                                            <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
                                            <span className="text-xs font-medium text-muted-foreground">Mastery</span>
                                        </div>
                                        {selectedSkill.score ? (
                                            <div>
                                                <div className="text-2xl font-bold">{Math.round(selectedSkill.score.mastery_percentage || selectedSkill.score.percentage || 0)}%</div>
                                                <div className="w-full h-2 rounded-full bg-muted mt-2 overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full bg-primary transition-all"
                                                        style={{ width: `${Math.round(selectedSkill.score.mastery_percentage || selectedSkill.score.percentage || 0)}%` }}
                                                    />
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-2xl font-bold text-muted-foreground">—</div>
                                        )}
                                    </div>

                                    {/* Details */}
                                    <div className="p-4 rounded-xl bg-muted/30 border border-border/30">
                                        <div className="flex items-center gap-2 mb-2">
                                            <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
                                            <span className="text-xs font-medium text-muted-foreground">Details</span>
                                        </div>
                                        <div className="space-y-1.5">
                                            <div className="text-sm">
                                                <span className="text-muted-foreground">Subject: </span>
                                                <span className="font-medium">{selectedSkill.subject_area}</span>
                                            </div>
                                            <div className="text-sm">
                                                <span className="text-muted-foreground">Difficulty: </span>
                                                <span className="font-medium capitalize">{selectedSkill.difficulty || "Beginner"}</span>
                                            </div>
                                            {selectedSkill.task?.estimated_time && (
                                                <div className="text-sm flex items-center gap-1">
                                                    <Clock className="w-3 h-3 text-muted-foreground" />
                                                    <span>{selectedSkill.task.estimated_time}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Prerequisites */}
                                    <div className="p-4 rounded-xl bg-muted/30 border border-border/30">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                                            <span className="text-xs font-medium text-muted-foreground">Prerequisites</span>
                                        </div>
                                        {selectedSkill.prereqs.length === 0 ? (
                                            <p className="text-sm text-muted-foreground italic">No prerequisites — start here!</p>
                                        ) : (
                                            <div className="flex flex-wrap gap-1.5">
                                                {selectedSkill.prereqs.map(p => {
                                                    const pStatus = skillStatuses[p.id];
                                                    return (
                                                        <span
                                                            key={p.id}
                                                            className={cn(
                                                                "text-[11px] px-2 py-0.5 rounded-full font-medium",
                                                                pStatus === "mastered" ? "bg-green-500/15 text-green-600" :
                                                                pStatus === "in_progress" ? "bg-primary/15 text-primary" :
                                                                "bg-muted text-muted-foreground"
                                                            )}
                                                        >
                                                            {pStatus === "mastered" && "✓ "}{p.name}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                {(selectedSkill.computedStatus === "recommended" || selectedSkill.computedStatus === "in_progress") && (
                                    <Button onClick={() => navigate("/learning-plan?view=list")} className="bg-primary">
                                        <Sparkles className="w-4 h-4 mr-2" />
                                        {selectedSkill.computedStatus === "in_progress" ? "Continue Learning" : "Start Learning"}
                                    </Button>
                                )}
                                {selectedSkill.computedStatus === "locked" && (
                                    <div className="p-3 rounded-xl bg-amber-500/10 text-amber-600 text-sm flex items-center gap-2">
                                        <Lock className="w-4 h-4 shrink-0" />
                                        Master the prerequisites above to unlock this skill.
                                    </div>
                                )}
                                {selectedSkill.computedStatus === "mastered" && (
                                    <div className="p-3 rounded-xl bg-green-500/10 text-green-600 text-sm flex items-center gap-2">
                                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                                        You've mastered this skill! Great work.
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </>
            )}
        </div>
    );
}