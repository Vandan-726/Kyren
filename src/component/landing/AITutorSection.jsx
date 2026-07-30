import React from "react";
import { motion } from "framer-motion";
import { Mic, Check } from "lucide-react";
import { SectionHeader } from "./ProblemSection";

const POINTS = [
    "Context-aware: knows your lesson, videos, and mistakes",
    "Socratic style: guides before answering",
    "Adapts to your mastery level in real time",
    "Speaks your language — voice and text",
];

function ChatBubble({ side, children }) {
    const isUser = side === "user";
    return (
        <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
            <div
                className={`px-4 py-3 rounded-2xl text-sm max-w-[82%] leading-relaxed ${isUser
                        ? "bg-brand-black text-white rounded-tr-sm"
                        : "bg-muted text-foreground rounded-tl-sm border border-border"
                    }`}
            >
                {children}
            </div>
        </div>
    );
}

export default function AITutorSection() {
    return (
        <section className="relative py-32 px-6 bg-secondary/50">
            <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-14 items-center">
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, margin: "-80px" }}
                    transition={{ duration: 0.7, ease: "easeOut" }}
                >
                    <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                        <Mic className="w-6 h-6 text-primary" />
                    </div>
                    <div className="flex items-center gap-3 mb-4">
                        <span className="sf-label text-primary text-xs">06</span>
                        <span className="w-8 h-px bg-primary/30" />
                        <span className="sf-label text-text-secondary text-xs">AI Tutor</span>
                    </div>
                    <h2 className="sf-display text-4xl text-foreground mb-6 leading-[1.1]">
                        Lesson-scoped <span className="sf-serif text-primary">AI tutor.</span>
                    </h2>
                    <p className="text-lg text-text-secondary leading-relaxed mb-7">
                        Not a generic chatbot. KYREN's tutor knows the lesson's objectives, the videos you watched, your current mastery, and your past quiz mistakes. It uses the Socratic method — guiding you to the answer before giving it.
                    </p>
                    <div className="space-y-3.5">
                        {POINTS.map((item, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, x: -10 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.08 }}
                                className="flex items-center gap-3"
                            >
                                <div className="w-5 h-5 rounded-lg bg-primary/10 flex items-center justify-center">
                                    <Check className="w-3 h-3 text-primary" />
                                </div>
                                <span className="text-text-secondary">{item}</span>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, margin: "-80px" }}
                    transition={{ duration: 0.7, ease: "easeOut" }}
                    className="sf-card rounded-2xl p-6"
                >
                    <div className="flex items-center justify-between mb-5">
                        <span className="sf-label text-text-secondary text-[9px]">Tutor Session / Lesson 04</span>
                        <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-glow" />
                            <span className="sf-label text-primary text-[9px]">Live</span>
                        </div>
                    </div>
                    <div className="space-y-4">
                        <ChatBubble side="user">I don't understand what a pointer actually does</ChatBubble>
                        <ChatBubble side="ai">
                            Good question! Before I explain — think of a pointer like a house address. Just as an address tells you where a house is, a pointer tells the computer where data is stored. Can you think of why knowing the address might be useful?
                        </ChatBubble>
                        <ChatBubble side="user">So you can find the data without copying it?</ChatBubble>
                        <ChatBubble side="ai">
                            Exactly! That's the key insight. Pointers let you access and modify data efficiently without duplicating it — crucial when you work with arrays and functions…
                        </ChatBubble>
                    </div>
                </motion.div>
            </div>
        </section>
    );
}