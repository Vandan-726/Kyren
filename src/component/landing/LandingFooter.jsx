import React from "react";
import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";

const COLUMNS = [
    { title: "Product", links: ["How it works", "Languages", "Roadmap", "Analytics"] },
    { title: "For", links: ["Students", "Teachers", "Parents", "Institutions"] },
    { title: "Company", links: ["About", "Mission", "Careers", "Contact"] },
];

export default function LandingFooter() {
    return (
        <footer className="relative py-20 px-6">
            <div className="max-w-6xl mx-auto sf-shell rounded-container p-10 md:p-12">
                <div className="grid md:grid-cols-5 gap-10 mb-12">
                    <div className="md:col-span-2">
                        <Link to="/" className="flex items-center gap-2.5 mb-4">
                            <div className="w-8 h-8 rounded-lg bg-brand-black flex items-center justify-center">
                                <Sparkles className="w-4 h-4 text-primary" />
                            </div>
                            <span className="sf-display text-sm text-foreground">Kyren</span>
                        </Link>
                        <p className="text-sm text-text-secondary max-w-xs leading-relaxed">
                            Adaptive Vernacular STEM Learning OS — finding your gaps and building your path.
                        </p>
                    </div>
                    {COLUMNS.map((col) => (
                        <div key={col.title}>
                            <div className="sf-label text-primary text-xs mb-4">{col.title}</div>
                            <ul className="space-y-2.5">
                                {col.links.map((l) => (
                                    <li key={l}>
                                        <a href="#" className="text-sm text-text-secondary hover:text-foreground transition-colors">
                                            {l}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
                <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-8 border-t border-border">
                    <p className="sf-label text-muted-foreground text-[10px]">Adaptive Vernacular STEM Learning OS</p>
                    <p className="text-xs text-muted-foreground">© 2026 KYREN. Built for every learner.</p>
                </div>
            </div>
        </footer>
    );
}