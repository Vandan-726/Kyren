import React from "react";
import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";

export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12 relative overflow-hidden">
            {/* Atmosphere blooms */}
            <div className="absolute inset-0 sf-atmosphere pointer-events-none" />
            <div className="absolute top-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-primary/[0.04] blur-[100px] sf-drift pointer-events-none" />

            <div className="relative w-full max-w-md sf-rise">
                {/* Brand */}
                <div className="flex flex-col items-center text-center mb-8">
                    <Link to="/" className="inline-flex items-center gap-2.5 mb-6 group">
                        <div className="w-10 h-10 rounded-xl bg-brand-black flex items-center justify-center sf-lift">
                            <Sparkles className="w-5 h-5 text-primary" />
                        </div>
                        <span className="sf-display text-xl text-foreground">Kyren</span>
                    </Link>
                    {Icon && (
                        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary mb-4 shadow-[0_14px_28px_-12px_rgba(227,74,50,0.6)]">
                            <Icon className="w-7 h-7 text-primary-foreground" aria-hidden="true" />
                        </div>
                    )}
                    <h1 className="text-3xl sf-display text-foreground">{title}</h1>
                    {subtitle && <p className="text-text-secondary mt-2 text-sm">{subtitle}</p>}
                </div>

                {/* Card */}
                <div className="sf-card-inset rounded-2xl p-8">
                    {children}
                </div>

                {footer && (
                    <p className="text-center text-sm text-text-secondary mt-6">{footer}</p>
                )}
            </div>
        </div>
    );
}