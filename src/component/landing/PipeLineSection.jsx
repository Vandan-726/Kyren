import React from "react";
import { motion } from "framer-motion";
import { MessageSquare, Search, Workflow, BookOpen, RefreshCw } from "lucide-react";
import { SectionHeader } from "./ProblemSection";

const STEPS = [
    { icon: MessageSquare, title: "Talk", desc: "Converse with the AI companion in your language — tell it what you want to learn." },
    { icon: Search, title: "Discover", desc: "The Learning Gap Agent analyzes your input against the skill dependency graph." },
    { icon: Workflow, title: "Build", desc: "Task Planning Agent converts gaps into a prioritized learning path." },
    { icon: BookOpen, title: "Learn", desc: "Course Architect generates modules, lessons, videos, and quizzes for each task." },
    { icon: RefreshCw, title: "Adapt", desc: "Your path updates in real-time as you progress and new gaps are detected." },
];

export default function PipelineSection() {
    return (
        <section id="pipeline" className="relative py-32 px-6 bg-secondary/50">
            <div className="max-w-6xl mx-auto">
                <SectionHeader
                    index={2}
                    label="The Pipeline"
                    title="How KYREN"
                    italic="works."
                    subtitle="An end-to-end adaptive loop: conversation → gap detection → task reordering → course generation → mastery assessment."
                />
                <div className="grid md:grid-cols-5 gap-4">
                    {STEPS.map((step, i) => {
                        const Icon = step.icon;
                        return (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 16 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, margin: "-60px" }}
                                transition={{ delay: i * 0.1, duration: 0.7, ease: "easeOut" }}
                                className="sf-card sf-lift rounded-2xl p-6 relative"
                            >
                                <div className="sf-label text-primary/50 text-xs mb-4">0{i + 1}</div>
                                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                                    <Icon className="w-5 h-5 text-primary" />
                                </div>
                                <h3 className="sf-display text-lg text-foreground mb-2">{step.title}</h3>
                                <p className="text-text-secondary text-sm leading-relaxed">{step.desc}</p>
                            </motion.div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}