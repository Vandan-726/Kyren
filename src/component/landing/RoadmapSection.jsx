import React from "react";
import { motion } from "framer-motion";
import { Check, Circle, AlertCircle, Lock } from "lucide-react";
import { SectionHeader } from "./ProblemSection";

const NODES = [
    { label: "Variables", status: "done" },
    { label: "Conditions", status: "done" },
    { label: "Loops", status: "done" },
    { label: "Functions", status: "done" },
    { label: "Arrays", status: "partial" },
    { label: "Pointers", status: "missing" },
    { label: "OOP", status: "blocked" },
    { label: "DSA", status: "blocked" },
];

const STATUS_MAP = {
    done: { icon: Check, color: "text-primary", bg: "bg-primary", border: "border-primary/30" },
    partial: { icon: Circle, color: "text-primary/60", bg: "bg-primary/10", border: "border-primary/20" },
    missing: { icon: AlertCircle, color: "text-primary", bg: "bg-primary/10", border: "border-primary/30" },
    blocked: { icon: Lock, color: "text-muted-foreground", bg: "bg-muted", border: "border-border" },
};

export default function RoadmapSection() {
    return (
        <section id="roadmap" className="relative py-32 px-6 bg-secondary/50">
            <div className="max-w-6xl mx-auto">
                <SectionHeader
                    index={4}
                    label="Roadmap"
                    title="Your personalized"
                    italic="path."
                    subtitle="KYREN maps your current knowledge, identifies gaps, and builds a prerequisite-ordered path to your goal."
                />
                <div className="sf-card rounded-2xl p-8 md:p-10">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <div className="sf-label text-text-secondary text-xs">Goal</div>
                            <div className="sf-display text-xl text-foreground">Become a DSA Developer</div>
                        </div>
                        <div className="sf-chip rounded-full px-4 py-1.5 text-xs">4 of 8 skills</div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {NODES.map((node, i) => {
                            const S = STATUS_MAP[node.status];
                            const Icon = S.icon;
                            return (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, y: 16 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: i * 0.08, duration: 0.6 }}
                                    className={`rounded-xl border ${S.border} bg-card p-5`}
                                >
                                    <div className={`w-8 h-8 rounded-lg ${S.bg} flex items-center justify-center mb-3`}>
                                        <Icon className={`w-4 h-4 ${S.color}`} />
                                    </div>
                                    <div className="sf-display text-sm text-foreground">{node.label}</div>
                                    <div className="sf-label text-[9px] mt-1 capitalize" style={{ color: 'inherit' }}>
                                        <span className={S.color}>{node.status}</span>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </section>
    );
}   