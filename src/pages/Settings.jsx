import React, { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { useTheme } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Moon, Sun, Languages, Globe, Shield, LogOut } from "lucide-react";
import { INDIAN_LANGUAGES } from "@/lib/skillsGraph";
import { cn } from "@/lib/utils";

export default function Settings() {
    const { user, logout } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const [selectedLang, setSelectedLang] = useState(localStorage.getItem("kyren-language") || "en");
    const [tourCompleted, setTourCompleted] = useState(localStorage.getItem("kyren-tour-complete") === "true");

    const handleLangChange = (code) => {
        setSelectedLang(code);
        localStorage.setItem("kyren-language", code);
    };

    const handleToggleTour = () => {
        const newVal = !tourCompleted;
        setTourCompleted(newVal);
        localStorage.setItem("kyren-tour-complete", newVal);
    };

    const handleLogout = () => {
        logout(false);
        window.location.href = "/";
    };

    return (
        <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
            <h1 className="text-2xl md:text-3xl font-bold mb-6">Settings</h1>

            {/* Appearance */}
            <Card className="p-6">
                <h2 className="font-semibold mb-4">Appearance</h2>
                <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30">
                    <div className="flex items-center gap-3">
                        {theme === "dark" ? <Moon className="w-5 h-5 text-primary" /> : <Sun className="w-5 h-5 text-amber-500" />}
                        <div>
                            <div className="font-medium text-sm">Theme</div>
                            <div className="text-xs text-muted-foreground">Toggle between dark and light mode</div>
                        </div>
                    </div>
                    <Button onClick={toggleTheme} variant="outline" size="sm">
                        {theme === "dark" ? "Switch to Light" : "Switch to Dark"}
                    </Button>
                </div>
            </Card>

            {/* Language */}
            <Card className="p-6">
                <h2 className="font-semibold flex items-center gap-2 mb-4">
                    <Languages className="w-4 h-4 text-primary" />
                    Language Preference
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {INDIAN_LANGUAGES.map(lang => (
                        <button
                            key={lang.code}
                            onClick={() => handleLangChange(lang.code)}
                            className={cn(
                                "p-3 rounded-xl border text-left transition",
                                selectedLang === lang.code
                                    ? "border-primary bg-primary/10"
                                    : "border-border hover:border-slate-400"
                            )}
                        >
                            <div className="text-sm font-medium">{lang.native}</div>
                            <div className="text-xs text-muted-foreground">{lang.name}</div>
                        </button>
                    ))}
                </div>
            </Card>

            {/* Product Tour */}
            <Card className="p-6">
                <h2 className="font-semibold flex items-center gap-2 mb-4">
                    <Globe className="w-4 h-4 text-primary" />
                    Product Tour
                </h2>
                <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30">
                    <div>
                        <div className="font-medium text-sm">Guided Tour</div>
                        <div className="text-xs text-muted-foreground">{tourCompleted ? "Completed" : "Not completed"}</div>
                    </div>
                    <Button onClick={handleToggleTour} variant="outline" size="sm">
                        {tourCompleted ? "Replay Tour" : "Mark Complete"}
                    </Button>
                </div>
            </Card>

            {/* Account */}
            <Card className="p-6">
                <h2 className="font-semibold flex items-center gap-2 mb-4">
                    <Shield className="w-4 h-4 text-green-500" />
                    Account
                </h2>
                <div className="space-y-2">
                    <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30">
                        <div>
                            <div className="font-medium text-sm">Email</div>
                            <div className="text-xs text-muted-foreground">{user?.email}</div>
                        </div>
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30">
                        <div>
                            <div className="font-medium text-sm">Role</div>
                            <div className="text-xs text-muted-foreground capitalize">{user?.role || "student"}</div>
                        </div>
                    </div>
                    <Button onClick={handleLogout} variant="outline" className="w-full text-destructive hover:bg-destructive/10">
                        <LogOut className="w-4 h-4 mr-2" />
                        Logout
                    </Button>
                </div>
            </Card>
        </div>
    );
}