import React from "react";
import { useSearchParams } from "react-router-dom";
import { ListChecks, Network } from "lucide-react";
import { cn } from "@/lib/utils";
import LearningTasks from "@/pages/LearningTasks";
import Roadmap from "@/pages/Roadmap";

export default function LearningPlan() {
    const [params, setParams] = useSearchParams();
    const view = params.get("view") || "list";

    return (
        <div>
            <div className="sticky top-14 lg:top-0 z-20 bg-background/80 backdrop-blur-md px-6 md:px-10 pt-4 pb-3 border-b border-border/50">
                <div className="flex gap-1 p-1 bg-muted rounded-full w-fit">
                    <button
                        onClick={() => setParams({ view: "list" })}
                        className={cn(
                            "flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium transition",
                            view === "list" ? "bg-primary text-primary-foreground shadow-sm" : "text-text-secondary hover:text-foreground"
                        )}
                    >
                        <ListChecks className="w-4 h-4" />
                        Task List
                    </button>
                    <button
                        onClick={() => setParams({ view: "roadmap" })}
                        className={cn(
                            "flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium transition",
                            view === "roadmap" ? "bg-primary text-primary-foreground shadow-sm" : "text-text-secondary hover:text-foreground"
                        )}
                    >
                        <Network className="w-4 h-4" />
                        Roadmap View
                    </button>
                </div>
            </div>
            {view === "list" ? <LearningTasks /> : <Roadmap />}
        </div>
    );
}