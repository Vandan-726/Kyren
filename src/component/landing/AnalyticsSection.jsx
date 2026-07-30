import React from "react";
import { motion } from "framer-motion";
import { Trophy, Zap, Target, TrendingUp } from "lucide-react";
import { SectionHeader } from "./ProblemSection";

const STATS = [
    { label: "Mastery Score", value: "78", suffix: "%", icon: Trophy },
    { label: "Learning Streak", value: "12", suffix: "d", icon: Zap },
    { label: "Quiz Accuracy", value: "84", suffix: "%", icon: Target },
    { label: "Skill Growth", value: "+18", suffix: "%", icon: TrendingUp },
];

export default function AnalyticsSection() {
    return (
        <section id="analytics" className="relative py-32 px-6">
            <div className="max-w-6xl mx-auto">
                <SectionHeader
                    index={7}
                    label="Analytics"
                    title="Analytics that"
                    italic="matter."
                    subtitle="Mastery, weak skills, streaks, quiz performance, skill growth — all driven by real data, not vanity metrics."
                />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    {STATS.map((stat, i) => {
                        const Icon = stat.icon;
                        return (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 16 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, margin: "-60px" }}
                                transition={{ delay: i * 0.1, duration: 0.7, ease: "easeOut" }}
                                className="sf-card sf-lift rounded-2xl p-7 text-center group"
                            >
                                <div className="w-12 h-12 rounded-xl bg-primary/10 mx-auto mb-5 flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
                                    <Icon className="w-5 h-5 text-primary" />
                                </div>
                                <div className="sf-display text-4xl text-foreground leading-none mb-2">
                                    {stat.value}<span className="text-2xl text-text-secondary">{stat.suffix}</span>
                                </div>
                                <div className="sf-label text-text-secondary text-[10px]">{stat.label}</div>
                            </motion.div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}