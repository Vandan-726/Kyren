import React from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Sparkles, ArrowRight, Activity, Target, Zap } from "lucide-react";

export default function Hero() {
    return (
        <section className="relative pt-36 pb-20 px-6 overflow-hidden">
            {/* Atmosphere */}
            <div className="absolute inset-0 sf-atmosphere pointer-events-none" />
            <div className="absolute top-0 right-1/4 w-[500px] h-[500px] rounded-full bg-primary/[0.05] blur-[120px] pointer-events-none sf-drift" />

            <div className="max-w-6xl mx-auto text-center relative">
                {/* Status chip */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, ease: "easeOut" }}
                    className="inline-flex items-center gap-2 sf-chip rounded-full px-4 py-1.5 mb-8 text-xs"
                >
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-glow" />
                    Adaptive Vernacular STEM Learning OS
                </motion.div>

                {/* Headline */}
                <motion.h1
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.1, ease: "easeOut" }}
                    className="sf-display text-5xl md:text-7xl text-foreground leading-[1.05] max-w-4xl mx-auto mb-6"
                >
                    Stop learning everything.<br />
                    Start learning <span className="sf-serif text-primary">what you need.</span>
                </motion.h1>

                {/* Subhead */}
                <motion.p
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, delay: 0.25, ease: "easeOut" }}
                    className="text-lg md:text-xl text-text-secondary max-w-xl mx-auto mb-10 leading-relaxed"
                >
                    KYREN diagnoses your knowledge gaps through conversation and builds a personalized, dynamically-updated learning path — in your language.
                </motion.p>

                {/* CTAs */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, delay: 0.4, ease: "easeOut" }}
                    className="flex flex-col sm:flex-row items-center justify-center gap-4"
                >
                    <Link
                        to="/login"
                        className="bg-primary text-primary-foreground rounded-full h-12 px-7 flex items-center gap-2 font-medium shadow-[0_14px_28px_-12px_rgba(227,74,50,0.6)] hover:shadow-[0_18px_36px_-12px_rgba(227,74,50,0.75)] hover:scale-[1.02] transition-all"
                    >
                        Build my learning path
                        <ArrowRight className="w-4 h-4" />
                    </Link>
                    <Link
                        to="/login"
                        className="bg-card text-foreground rounded-full h-12 px-7 flex items-center gap-2 font-medium border border-border shadow-[0_8px_20px_-14px_rgba(35,36,39,0.2)] hover:bg-muted transition-all"
                    >
                        See how it works
                    </Link>
                </motion.div>

                {/* Stats strip */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, delay: 0.55, ease: "easeOut" }}
                    className="grid grid-cols-3 gap-4 max-w-2xl mx-auto mt-20"
                >
                    {[
                        { icon: Activity, value: "50+", label: "STEM Skills mapped" },
                        { icon: Target, value: "12", label: "Indian languages" },
                        { icon: Zap, value: "Real-time", label: "Path adaptation" },
                    ].map((s, i) => {
                        const Icon = s.icon;
                        return (
                            <div key={i} className="sf-card rounded-2xl p-6 text-center">
                                <Icon className="w-5 h-5 text-primary mx-auto mb-3" />
                                <div className="sf-display text-3xl text-foreground">{s.value}</div>
                                <div className="sf-label text-text-secondary text-[10px] mt-1">{s.label}</div>
                            </div>
                        );
                    })}
                </motion.div>
            </div>
        </section>
    );
}