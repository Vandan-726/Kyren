import React from "react";
import { useSearchParams } from "react-router-dom";
import { MessageSquare, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import Companion from "@/pages/Companion";
import DoubtSolver from "@/pages/DoubtSolver";

export default function AITutor() {
    const [params, setParams] = useSearchParams();
    const tab = params.get("tab") || "plan";

    return (
        <div>
            <div className="sticky top-14 lg:top-0 z-20 bg-background/80 backdrop-blur-md px-6 md:px-10 pt-4 pb-3 border-b border-border/50">
                <div className="flex gap-1 p-1 bg-muted rounded-full w-fit">
                    <button
                        onClick={() => setParams({ tab: "plan" })}
                        className={cn(
                            "flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium transition",
                            tab === "plan" ? "bg-primary text-primary-foreground shadow-sm" : "text-text-secondary hover:text-foreground"
                        )}
                    >
                        <MessageSquare className="w-4 h-4" />
                        Plan My Path
                    </button>
                    <button
                        onClick={() => setParams({ tab: "ask" })}
                        className={cn(
                            "flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium transition",
                            tab === "ask" ? "bg-primary text-primary-foreground shadow-sm" : "text-text-secondary hover:text-foreground"
                        )}
                    >
                        <HelpCircle className="w-4 h-4" />
                        Ask a Question
                    </button>
                </div>
            </div>
            <div style={{ display: tab === "plan" ? "block" : "none" }}>
                <Companion />
            </div>
            <div style={{ display: tab === "ask" ? "block" : "none" }}>
                <DoubtSolver />
            </div>
        </div>
    );
}