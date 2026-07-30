import React from "react";
import { useSearchParams } from "react-router-dom";
import { BarChart3, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import Analytics from "@/pages/Analytics";
import Achievements from "@/pages/Achievements";

export default function Progress() {
    const [params, setParams] = useSearchParams();
    const tab = params.get("tab") || "analytics";

    return (
        <div>
            <div className="sticky top-14 lg:top-0 z-20 bg-background/80 backdrop-blur-md px-6 md:px-10 pt-4 pb-3 border-b border-border/50">
                <div className="flex gap-1 p-1 bg-muted rounded-full w-fit">
                    <button
                        onClick={() => setParams({ tab: "analytics" })}
                        className={cn(
                            "flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium transition",
                            tab === "analytics" ? "bg-primary text-primary-foreground shadow-sm" : "text-text-secondary hover:text-foreground"
                        )}
                    >
                        <BarChart3 className="w-4 h-4" />
                        Analytics
                    </button>
                    <button
                        onClick={() => setParams({ tab: "achievements" })}
                        className={cn(
                            "flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium transition",
                            tab === "achievements" ? "bg-primary text-primary-foreground shadow-sm" : "text-text-secondary hover:text-foreground"
                        )}
                    >
                        <Trophy className="w-4 h-4" />
                        Achievements
                    </button>
                </div>
            </div>
            {tab === "analytics" ? <Analytics /> : <Achievements />}
        </div>
    );
}