import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function SectionHeader({ index, label, title, italic, subtitle, align = "center" }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className={cn("mb-16", align === "center" ? "text-center max-w-2xl mx-auto" : "max-w-2xl")}
        >
            <div className={cn("flex items-center gap-3 mb-5", align === "center" && "justify-center")}>
                <span className="sf-label text-primary text-xs">{String(index).padStart(2, "0")}</span>
                <span className="w-8 h-px bg-primary/30" />
                <span className="sf-label text-text-secondary text-xs">{label}</span>
            </div>
            <h2 className="sf-display text-4xl md:text-5xl text-foreground leading-[1.1]">
                {title} {italic && <span className="sf-serif text-primary">{italic}</span>}
            </h2>
            {subtitle && (
                <p className="text-lg text-text-secondary mt-5 leading-relaxed">{subtitle}</p>
            )}
        </motion.div>
    );
}

const FRICTIONS = [
    {
        title: "Static curriculum",
        desc: "Everyone gets the same path regardless of what they already know. Wasted time re-learning, frustration with gaps.",
    },
    {
        title: "Hidden prerequisites",
        desc: "You try to learn DSA but can't — because you're missing Pointers. Nobody tells you what's actually blocking you.",
    },
    {
        title: "No adaptivity",
        desc: "The system doesn't react to your mistakes, your pace, or your goals. It teaches the same way to everyone.",
    },
];

export default function ProblemSection() {
    return (
        <section id="problem" className="relative py-32 px-6">
            <div className="max-w-6xl mx-auto">
                <SectionHeader
                    index={1}
                    label="The Problem"
                    title="Learning platforms don't"
                    italic="adapt to you."
                    subtitle="Current tools teach a fixed curriculum to everyone. KYREN diagnoses what you're missing and builds the path forward."
                />
                <div className="grid md:grid-cols-3 gap-6">
                    {FRICTIONS.map((f, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 16 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-60px" }}
                            transition={{ delay: i * 0.1, duration: 0.7, ease: "easeOut" }}
                            className="sf-card sf-lift rounded-2xl p-8"
                        >
                            <div className="sf-label text-primary/60 text-xs mb-4">0{i + 1}</div>
                            <h3 className="sf-display text-xl text-foreground mb-3">{f.title}</h3>
                            <p className="text-text-secondary text-sm leading-relaxed">{f.desc}</p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}