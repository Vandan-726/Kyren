import React, { useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";
import { useAppData } from "@/lib/appData";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import {
    Compass, Loader2, ArrowRight, CheckCircle2,
    Target, Clock, Flag, Sparkles
} from "lucide-react";
import { simulatePath } from "@/lib/aiAgents";
import { SKILLS_GRAPH } from "@/lib/skillsGraph";
import { cn } from "@/lib/utils";

export default function PathSimulator() {
    const { user } = useAuth();
    const { masteryScores } = useAppData();
    const [selectedSkill, setSelectedSkill] = useState(null);
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleSimulate = async () => {
        if (!selectedSkill) return;
        setLoading(true);
        try {
            const simResult = await simulatePath({
                targetSkill: selectedSkill,
                masteryScores,
                userGoal: user?.learning_goal,
            });
            setResult(simResult);
        } catch (e) {
            toast.error("Failed to simulate path.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-6 md:p-8 max-w-4xl mx-auto">
            <div className="mb-6">
                <h1 className="text-2xl md:text-3xl font-bold mb-2">Learning Path Simulator</h1>
                <p className="text-muted-foreground">What if you wanted to learn X? See your estimated path before committing.</p>
            </div>

            {/* Skill selector */}
            <Card className="p-6 mb-6">
                <h3 className="font-semibold mb-4">Choose a target skill</h3>
                <div className="flex flex-wrap gap-2">
                    {SKILLS_GRAPH.map(skill => (
                        <button
                            key={skill.id}
                            onClick={() => setSelectedSkill(skill.id)}
                            className={cn(
                                "px-4 py-2 rounded-full border text-sm font-medium transition",
                                selectedSkill === skill.id
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-border hover:border-slate-400"
                            )}
                        >
                            {skill.name}
                        </button>
                    ))}
                </div>
                {selectedSkill && (
                    <Button onClick={handleSimulate} disabled={loading} className="mt-4 bg-primary">
                        {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Simulating...</> : <><Compass className="w-4 h-4 mr-2" /> Simulate Path</>}
                    </Button>
                )}
            </Card>

            {/* Results */}
            {result && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                    {/* Current skills */}
                    {result.current_skills && result.current_skills.length > 0 && (
                        <Card className="p-6">
                            <h3 className="font-semibold flex items-center gap-2 mb-4">
                                <CheckCircle2 className="w-5 h-5 text-green-500" />
                                Your Current Skills
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {result.current_skills.map((skill, i) => (
                                    <span key={i} className="px-3 py-1.5 rounded-full bg-green-500/10 text-green-500 text-sm">
                                        {skill}
                                    </span>
                                ))}
                            </div>
                        </Card>
                    )}

                    {/* Path */}
                    {result.missing_prerequisites && result.missing_prerequisites.length > 0 && (
                        <Card className="p-6">
                            <h3 className="font-semibold flex items-center gap-2 mb-4">
                                <Target className="w-5 h-5 text-amber-500" />
                                Learning Path ({result.total_estimated_time})
                            </h3>
                            <div className="space-y-3">
                                {result.missing_prerequisites.map((step, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.1 }}
                                        className="flex items-center gap-4 p-4 rounded-xl border border-border"
                                    >
                                        <div className="w-8 h-8 rounded-full bg-amber-500/10 text-amber-500 text-sm font-bold flex items-center justify-center shrink-0">
                                            {i + 1}
                                        </div>
                                        <div className="flex-1">
                                            <div className="font-medium text-sm">{step.skill_name}</div>
                                            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                                <Clock className="w-3 h-3" /> {step.estimated_time}
                                            </div>
                                        </div>
                                        {i < result.missing_prerequisites.length - 1 && <ArrowRight className="w-4 h-4 text-muted-foreground" />}
                                    </motion.div>
                                ))}
                            </div>
                        </Card>
                    )}

                    {/* Milestones */}
                    {result.milestones && result.milestones.length > 0 && (
                        <Card className="p-6">
                            <h3 className="font-semibold flex items-center gap-2 mb-4">
                                <Flag className="w-5 h-5 text-primary" />
                                Milestones
                            </h3>
                            <ul className="space-y-2">
                                {result.milestones.map((milestone, i) => (
                                    <li key={i} className="flex items-start gap-2 text-sm">
                                        <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                                        {milestone}
                                    </li>
                                ))}
                            </ul>
                        </Card>
                    )}
                </motion.div>
            )}

            {!result && !loading && selectedSkill && (
                <div className="text-center py-8 text-muted-foreground">
                    Click "Simulate Path" to see your estimated learning journey.
                </div>
            )}
        </div>
    );
}