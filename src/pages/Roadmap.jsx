import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAppData } from "@/lib/appData";
import { Button } from "@/components/ui/button";
import {
    Lock, CheckCircle2, Loader2, Target, Sparkles
} from "lucide-react";
import {
    SKILLS_GRAPH,
    SKILL_DEPENDENCIES,
    getSkillById,
    getDirectPrerequisites,
    getDependentSkills,
    isSkillUnlocked,
} from "@/lib/skillsGraph";
import { cn } from "@/lib/utils";

export default function Roadmap() {
    const navigate = useNavigate();
    const { masteryScores } = useAppData();
    const [selectedNode, setSelectedNode] = useState(null);

    const getNodeStatus = (skillId) => {
        const score = masteryScores.find(m => m.skill_id === skillId);
        if (score?.status === "Mastered") return "Mastered";
        if (score && score.percentage > 0) return "InProgress";
        const unlocked = isSkillUnlocked(skillId, masteryScores);
        return unlocked ? "Available" : "Locked";
    };

    // Group skills by "level" (depth from root)
    const getLevel = (skillId) => {
        const deps = SKILL_DEPENDENCIES.filter(d => d.skill_id === skillId);
        if (deps.length === 0) return 0;
        return Math.max(...deps.map(d => getLevel(d.prerequisite_skill_id))) + 1;
    };

    const maxLevel = Math.max(...SKILLS_GRAPH.map(s => getLevel(s.id)));
    const levels = Array.from({ length: maxLevel + 1 }, (_, i) => i);
    const skillsByLevel = levels.map(level =>
        SKILLS_GRAPH.filter(s => getLevel(s.id) === level)
    );

    const getStatusConfig = (status) => {
        switch (status) {
            case "Mastered": return { color: "border-green-500 bg-green-500/10", icon: CheckCircle2, iconColor: "text-green-500", label: "Mastered" };
            case "InProgress": return { color: "border-primary bg-primary/10", icon: Loader2, iconColor: "text-primary", label: "In Progress" };
            case "Available": return { color: "border-amber-500 bg-amber-500/10", icon: Target, iconColor: "text-amber-500", label: "Recommended" };
            case "Locked": return { color: "border-muted bg-muted/30 opacity-60", icon: Lock, iconColor: "text-muted-foreground", label: "Locked" };
        }
    };

    return (
        <div className="p-6 md:p-8 max-w-7xl mx-auto">
            <div className="mb-6">
                <h1 className="text-2xl md:text-3xl font-bold mb-2">Learning Roadmap</h1>
                <p className="text-muted-foreground">Your skill dependency graph. Master prerequisites to unlock new skills.</p>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-4 mb-8 text-xs">
                {["Mastered", "InProgress", "Available", "Locked"].map(status => {
                    const config = getStatusConfig(status);
                    const Icon = config.icon;
                    return (
                        <div key={status} className="flex items-center gap-1.5">
                            <Icon className={cn("w-3.5 h-3.5", config.iconColor)} />
                            <span className="text-muted-foreground">{config.label}</span>
                        </div>
                    );
                })}
            </div>

            {/* Graph */}
            <div className="overflow-x-auto pb-6">
                <div className="flex gap-8 min-w-max">
                    {skillsByLevel.map((skills, levelIdx) => (
                        <div key={levelIdx} className="flex flex-col gap-6 items-center">
                            <div className="text-xs font-medium text-muted-foreground">Level {levelIdx + 1}</div>
                            {skills.map(skill => {
                                const status = getNodeStatus(skill.id);
                                const config = getStatusConfig(status);
                                const Icon = config.icon;
                                const prereqs = getDirectPrerequisites(skill.id);
                                const dependents = getDependentSkills(skill.id);
                                const score = masteryScores.find(m => m.skill_id === skill.id);

                                return (
                                    <motion.div
                                        key={skill.id}
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: levelIdx * 0.1 }}
                                        whileHover={{ scale: 1.05 }}
                                        onClick={() => setSelectedNode({ ...skill, status, prereqs, dependents, score })}
                                        className={cn(
                                            "relative w-48 p-4 rounded-2xl border-2 cursor-pointer transition-all",
                                            config.color,
                                            selectedNode?.id === skill.id && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                                        )}
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <Icon className={cn("w-5 h-5", config.iconColor, status === "InProgress" && "animate-spin")} />
                                            {score && <span className="text-xs font-bold">{score.percentage}%</span>}
                                        </div>
                                        <h3 className="font-medium text-sm mb-1">{skill.name}</h3>
                                        <p className="text-xs text-muted-foreground truncate">{skill.subject_area}</p>
                                    </motion.div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>

            {/* Node detail panel */}
            <AnimatePresence>
                {selectedNode && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="mt-6 p-6 rounded-2xl border border-border bg-card"
                    >
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <h2 className="text-xl font-semibold">{selectedNode.name}</h2>
                                <p className="text-sm text-muted-foreground mt-1">{selectedNode.description}</p>
                            </div>
                            <button onClick={() => setSelectedNode(null)} className="text-muted-foreground hover:text-foreground">
                                ✕
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="p-3 rounded-xl bg-muted/30">
                                <div className="text-xs font-medium text-muted-foreground mb-2">Status</div>
                                <div className="flex items-center gap-2">
                                    {(() => { const c = getStatusConfig(selectedNode.status); const I = c.icon; return <I className={cn("w-4 h-4", c.iconColor)} />; })()}
                                    <span className="text-sm">{getStatusConfig(selectedNode.status).label}</span>
                                </div>
                                {selectedNode.score && <div className="text-2xl font-bold mt-2">{selectedNode.score.percentage}%</div>}
                            </div>

                            <div className="p-3 rounded-xl bg-muted/30">
                                <div className="text-xs font-medium text-muted-foreground mb-2">Prerequisites</div>
                                {selectedNode.prereqs.length === 0 ? (
                                    <span className="text-sm text-muted-foreground">None — start here!</span>
                                ) : (
                                    <div className="space-y-1">
                                        {selectedNode.prereqs.map(id => {
                                            const skill = getSkillById(id);
                                            const prereqScore = masteryScores.find(m => m.skill_id === id);
                                            return (
                                                <div key={id} className="flex items-center gap-1.5 text-sm">
                                                    {prereqScore?.status === "Mastered" ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
                                                    {skill?.name || id}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            <div className="p-3 rounded-xl bg-muted/30">
                                <div className="text-xs font-medium text-muted-foreground mb-2">Unlocks</div>
                                {selectedNode.dependents.length === 0 ? (
                                    <span className="text-sm text-muted-foreground">Terminal skill</span>
                                ) : (
                                    <div className="space-y-1">
                                        {selectedNode.dependents.map(id => {
                                            const skill = getSkillById(id);
                                            return <div key={id} className="text-sm">{skill?.name || id}</div>;
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>

                        {(selectedNode.status === "Available" || selectedNode.status === "InProgress") && (
                            <Button onClick={() => navigate("/companion")} className="mt-4 bg-primary">
                                <Sparkles className="w-4 h-4 mr-2" />
                                Start Learning This Skill
                            </Button>
                        )}
                        {selectedNode.status === "Locked" && (
                            <div className="mt-4 p-3 rounded-lg bg-amber-500/10 text-amber-600 text-sm flex items-center gap-2">
                                <Lock className="w-4 h-4" />
                                Master all prerequisites to unlock this skill.
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}