import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Sparkles, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
    { href: "#problem", label: "Problem" },
    { href: "#pipeline", label: "Pipeline" },
    { href: "#languages", label: "Languages" },
    { href: "#roadmap", label: "Roadmap" },
    { href: "#analytics", label: "Analytics" },
];

export default function LandingNav() {
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 24);
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    return (
        <nav className="fixed top-5 left-1/2 -translate-x-1/2 z-50 w-[94%] max-w-5xl">
            <div
                className={cn(
                    "sf-nav rounded-full h-14 flex items-center justify-between px-3 transition-all duration-500",
                    scrolled && "shadow-[0_14px_36px_-14px_rgba(35,36,39,0.35)]"
                )}
            >
                <Link to="/" className="flex items-center gap-2.5 group">
                    <div className="w-8 h-8 rounded-lg bg-brand-black flex items-center justify-center">
                        <Sparkles className="w-4 h-4 text-primary" />
                    </div>
                    <span className="sf-display text-sm text-foreground">Kyren</span>
                </Link>

                <div className="hidden md:flex items-center gap-1">
                    {LINKS.map((l) => (
                        <a
                            key={l.href}
                            href={l.href}
                            className="px-4 py-2 rounded-full text-sm text-text-secondary hover:text-foreground hover:bg-black/[0.04] transition-colors"
                        >
                            {l.label}
                        </a>
                    ))}
                </div>

                <Link
                    to="/login"
                    className="bg-brand-black text-white rounded-full h-9 px-5 flex items-center gap-1.5 text-sm font-medium sf-lift"
                >
                    Start
                    <ArrowRight className="w-3.5 h-3.5" />
                </Link>
            </div>
        </nav>
    );
}
