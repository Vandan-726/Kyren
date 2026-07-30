import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
    Compass, ArrowRight, Code, Calculator,
    FlaskConical, Cpu, Database, Atom, Network
} from "lucide-react";
import { SKILLS_GRAPH } from "@/lib/skillsGraph";
import { cn } from "@/lib/utils";
import PathSimulator from "@/pages/PathSimulator";

const CATEGORIES = [
    { label: "Programming", icon: Code, skills: ["prog_fundamentals", "variables", "conditions", "loops", "functions", "arrays", "pointers", "cpp_basics", "oop", "dsa", "python_basics"] },
    { label: "Data Science", icon: Database, skills: ["data_analysis", "statistics"] },
    { label: "AI/ML", icon: Cpu, skills: ["machine_learning", "linear_algebra"] },
    { label: "Mathematics", icon: Calculator, skills: ["calculus", "linear_algebra", "statistics"] },
    { label: "Physics", icon: Atom, skills: ["physics_mechanics"] },
    { label: "Chemistry", icon: FlaskConical, skills: ["chemistry_basics"] },
];

function ExploreContent() {
    const navigate = useNavigate();
    const [selectedCategory, setSelectedCategory] = useState(null);

    return (
        <div className="p-6 md:p-8 max-w-6xl mx-auto">
            <div className="mb-6">
                <h1 className="text-2xl md:text-3xl font-bold mb-2">Discover</h1>
                <p className="text-muted-foreground">Explore STEM skills and start learning what interests you.</p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                {CATEGORIES.map((cat, i) => {
                    const Icon = cat.icon;
                    return (
                        <motion.div key={cat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
                            <Card
                                className="p-5 cursor-pointer hover:shadow-lg transition group"
                                onClick={() => setSelectedCategory(selectedCategory === cat.label ? null : cat.label)}
                            >
                                <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center mb-3">
                                    <Icon className="w-6 h-6 text-primary" />
                                </div>
                                <h3 className="font-semibold mb-1 group-hover:text-primary transition">{cat.label}</h3>
                                <p className="text-xs text-muted-foreground">{cat.skills.length} skills</p>
                            </Card>
                        </motion.div>
                    );
                })}
            </div>

            {selectedCategory && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                    <h2 className="font-semibold mb-4">
                        {selectedCategory} Skills
                    </h2>
                    {CATEGORIES.find(c => c.label === selectedCategory)?.skills.map((skillId, i) => {
                        const skill = SKILLS_GRAPH.find(s => s.id === skillId);
                        if (!skill) return null;
                        return (
                            <motion.div
                                key={skillId}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.05 }}
                                className="p-4 rounded-2xl border border-border bg-card flex items-center justify-between"
                            >
                                <div>
                                    <h3 className="font-medium">{skill.name}</h3>
                                    <p className="text-sm text-muted-foreground">{skill.description}</p>
                                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                                        <span className="capitalize">{skill.difficulty_level}</span>
                                        <span>·</span>
                                        <span>{skill.subject_area}</span>
                                    </div>
                                </div>
                                <Button onClick={() => navigate("/ai-tutor")} size="sm" className="bg-primary">
                                    Learn <ArrowRight className="w-3.5 h-3.5 ml-1" />
                                </Button>
                            </motion.div>
                        );
                    })}
                </motion.div>
            )}

            {!selectedCategory && (
                <div className="text-center py-12">
                    <Compass className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground">Select a category to explore available skills.</p>
                </div>
            )}
        </div>
    );
}

export default function Discover() {
    const [params, setParams] = useSearchParams();
    const tab = params.get("tab") || "explore";

    return (
        <div>
            <div className="sticky top-14 lg:top-0 z-20 bg-background/80 backdrop-blur-md px-6 md:px-10 pt-4 pb-3 border-b border-border/50">
                <div className="flex gap-1 p-1 bg-muted rounded-full w-fit">
                    <button
                        onClick={() => setParams({ tab: "explore" })}
                        className={cn(
                            "flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium transition",
                            tab === "explore" ? "bg-primary text-primary-foreground shadow-sm" : "text-text-secondary hover:text-foreground"
                        )}
                    >
                        <Compass className="w-4 h-4" />
                        Explore Skills
                    </button>
                    <button
                        onClick={() => setParams({ tab: "simulator" })}
                        className={cn(
                            "flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium transition",
                            tab === "simulator" ? "bg-primary text-primary-foreground shadow-sm" : "text-text-secondary hover:text-foreground"
                        )}
                    >
                        <Network className="w-4 h-4" />
                        Path Simulator
                    </button>
                </div>
            </div>
            {tab === "simulator" ? <PathSimulator /> : <ExploreContent />}
        </div>
    );
}