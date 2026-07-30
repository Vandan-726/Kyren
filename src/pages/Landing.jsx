import React from "react";
import LandingNav from "@/components/landing/LandingNav";
import Hero from "@/components/landing/Hero";
import ProblemSection from "@/components/landing/ProblemSection";
import PipelineSection from "@/components/landing/PipelineSection";
import LanguagesSection from "@/components/landing/LanguagesSection";
import RoadmapSection from "@/components/landing/RoadmapSection";
import CoursesSection from "@/components/landing/CoursesSection";
import AITutorSection from "@/components/landing/AITutorSection";
import AnalyticsSection from "@/components/landing/AnalyticsSection";
import FinalCTA from "@/components/landing/FinalCTA";
import LandingFooter from "@/components/landing/LandingFooter";

export default function Landing() {
    return (
        <div className="min-h-screen bg-background text-foreground overflow-x-hidden relative">
            <div className="fixed inset-0 sf-atmosphere pointer-events-none z-0" />
            <LandingNav />
            <main className="relative z-10">
                <Hero />
                <ProblemSection />
                <PipelineSection />
                <LanguagesSection />
                <RoadmapSection />
                <CoursesSection />
                <AITutorSection />
                <AnalyticsSection />
                <FinalCTA />
            </main>
            <LandingFooter />
        </div>
    );
}