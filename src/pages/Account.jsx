import React from "react";
import { useSearchParams } from "react-router-dom";
import { User, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import Profile from "@/pages/Profile";
import SettingsPage from "@/pages/Settings";

export default function Account() {
    const [params, setParams] = useSearchParams();
    const tab = params.get("tab") || "profile";

    return (
        <div>
            <div className="sticky top-14 lg:top-0 z-20 bg-background/80 backdrop-blur-md px-6 md:px-10 pt-4 pb-3 border-b border-border/50">
                <div className="flex gap-1 p-1 bg-muted rounded-full w-fit">
                    <button
                        onClick={() => setParams({ tab: "profile" })}
                        className={cn(
                            "flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium transition",
                            tab === "profile" ? "bg-primary text-primary-foreground shadow-sm" : "text-text-secondary hover:text-foreground"
                        )}
                    >
                        <User className="w-4 h-4" />
                        Profile
                    </button>
                    <button
                        onClick={() => setParams({ tab: "settings" })}
                        className={cn(
                            "flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium transition",
                            tab === "settings" ? "bg-primary text-primary-foreground shadow-sm" : "text-text-secondary hover:text-foreground"
                        )}
                    >
                        <Settings className="w-4 h-4" />
                        Settings
                    </button>
                </div>
            </div>
            <div style={{ display: tab === "profile" ? "block" : "none" }}>
                <Profile />
            </div>
            <div style={{ display: tab === "settings" ? "block" : "none" }}>
                <SettingsPage />
            </div>
        </div>
    );
}