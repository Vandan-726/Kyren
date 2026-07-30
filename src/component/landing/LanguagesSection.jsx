import React from "react";
import { motion } from "framer-motion";
import { Network } from "lucide-react";
import { SectionHeader } from "./ProblemSection";
import { INDIAN_LANGUAGES } from "@/lib/skillsGraph";

export default function LanguagesSection() {
    return (
        <section id="languages" className="relative py-32 px-6">
            <div className="max-w-6xl mx-auto">
                <SectionHeader
                    index={3}
                    label="Vernacular"
                    title="Learn in your"
                    italic="language."
                    subtitle="Voice and text support across 12 Indian languages. STEM education shouldn't require English fluency."
                />
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {INDIAN_LANGUAGES.map((lang, i) => (
                        <motion.div
                            key={lang.code}
                            initial={{ opacity: 0, y: 16 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-40px" }}
                            transition={{ delay: (i % 6) * 0.08, duration: 0.7, ease: "easeOut" }}
                            className="sf-card sf-lift rounded-2xl p-5 text-center group"
                        >
                            <div className="sf-serif text-2xl text-primary mb-2 group-hover:scale-105 transition-transform">
                                {lang.native}
                            </div>
                            <div className="sf-label text-text-secondary text-[10px]">{lang.name}</div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}