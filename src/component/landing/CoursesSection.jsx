import React from "react";
import { motion } from "framer-motion";
import { BookOpen, Layers, PlayCircle, FileQuestion } from "lucide-react";
import { SectionHeader } from "./ProblemSection";

const STEPS = [
    { icon: BookOpen, label: "Course", desc: "Course Architect designs the structure" },
    { icon: Layers, label: "Modules", desc: "2-4 modules with mastery thresholds" },
    { icon: PlayCircle, label: "Lessons", desc: "AI summaries + curated YouTube videos" },
    { icon: FileQuestion, label: "Quizzes", desc: "Calibrated to difficulty level" },
];

export default function CoursesSection() {
    return (
        <section className="relative py-32 px-6">
            <div className="max-w-6xl mx-auto">
                <SectionHeader
                    index={5}
                    label="Courses"
                    title="Generated for"
                    italic="you."
                    subtitle="When you approve a task, the Course Architect builds a complete course — modules, lessons, videos, and quizzes — tailored to your level."
                />
                <div className="flex flex-col md:flex-row items-stretch gap-4">
                    {STEPS.map((step, i) => {
                        const Icon = step.icon;
                        return (
                            <div key={i} className="flex items-center gap-4 md:flex-1">
                                <motion.div
                                    initial={{ opacity: 0, y: 16 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true, margin: "-60px" }}
                                    transition={{ delay: i * 0.1, duration: 0.7, ease: "easeOut" }}
                                    className="sf-card sf-lift rounded-2xl p-7 flex-1 text-center"
                                >
                                    <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                                        <Icon className="w-6 h-6 text-primary" />
                                    </div>
                                    <div className="sf-display text-lg text-foreground mb-1">{step.label}</div>
                                    <p className="text-text-secondary text-sm">{step.desc}</p>
                                </motion.div>
                                {i < STEPS.length - 1 && (
                                    <div className="hidden md:block text-muted-foreground text-2xl">→</div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}