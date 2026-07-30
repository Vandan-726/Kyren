import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

export default function FinalCTA() {
    return (
        <section className="relative py-32 px-6">
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.7, ease: "easeOut" }}
                className="relative max-w-3xl mx-auto text-center sf-card rounded-container p-12 md:p-16 overflow-hidden"
            >
                <div className="absolute inset-0 sf-atmosphere pointer-events-none" />
                <div className="relative">
                    <div className="inline-flex items-center gap-2 sf-chip rounded-full px-4 py-1.5 mb-8 text-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-glow" />
                        Free to start / No card required
                    </div>
                    <h2 className="sf-display text-4xl md:text-5xl mb-6 leading-[1.1] text-foreground">
                        Stop learning everything.<br />
                        <span className="sf-serif text-primary">Start learning what you need.</span>
                    </h2>
                    <p className="text-lg text-text-secondary mb-9 max-w-lg mx-auto leading-relaxed">
                        Your personalized learning path is one conversation away.
                    </p>
                    <Link
                        to="/login"
                        className="bg-primary text-primary-foreground inline-flex items-center gap-2 rounded-full h-14 px-8 font-medium shadow-[0_14px_28px_-12px_rgba(227,74,50,0.6)] hover:shadow-[0_18px_36px_-12px_rgba(227,74,50,0.75)] hover:scale-[1.02] transition-all"
                    >
                        Build my learning path
                        <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>
            </motion.div>
        </section>
    );
}