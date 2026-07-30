import React, { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { useAppData } from "@/lib/appData";
import { kyren } from "@/api/kyrenClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { User, Mail, Target, Save, Loader2 } from "lucide-react";

export default function Profile() {
    const { user } = useAuth();
    const { masteryScores, learningTasks, courses } = useAppData();
    const [saving, setSaving] = useState(false);
    const [name, setName] = useState(user?.full_name || "");
    const [learningGoal, setLearningGoal] = useState(user?.learning_goal || "");

    const handleSave = async () => {
        setSaving(true);
        try {
            await kyren.auth.updateMe({ full_name: name, learning_goal: learningGoal });
            toast.success("Profile updated!");
        } catch (e) {
            toast.error("Failed to update profile.");
        } finally {
            setSaving(false);
        }
    };

    const masteredCount = masteryScores.filter(m => m.status === "Mastered").length;
    const initials = (user?.full_name || user?.email || "S").charAt(0).toUpperCase();

    return (
        <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
            <h1 className="text-2xl md:text-3xl font-bold mb-6">Profile</h1>

            {/* Profile card */}
            <div className="p-6 rounded-2xl border border-border bg-card">
                <div className="flex items-center gap-4 mb-6">
                    <Avatar className="w-20 h-20">
                        <AvatarFallback className="bg-brand-black text-white text-2xl">{initials}</AvatarFallback>
                    </Avatar>
                    <div>
                        <h2 className="text-xl font-semibold">{user?.full_name || "Student"}</h2>
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <Mail className="w-3.5 h-3.5" /> {user?.email}
                        </p>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3">
                    <div className="p-4 rounded-xl bg-muted/30 text-center">
                        <div className="text-2xl font-bold">{masteryScores.length}</div>
                        <div className="text-xs text-muted-foreground">Skills</div>
                    </div>
                    <div className="p-4 rounded-xl bg-muted/30 text-center">
                        <div className="text-2xl font-bold">{masteredCount}</div>
                        <div className="text-xs text-muted-foreground">Mastered</div>
                    </div>
                    <div className="p-4 rounded-xl bg-muted/30 text-center">
                        <div className="text-2xl font-bold">{courses.length}</div>
                        <div className="text-xs text-muted-foreground">Courses</div>
                    </div>
                </div>
            </div>

            {/* Edit form */}
            <div className="p-6 rounded-2xl border border-border bg-card space-y-4">
                <h3 className="font-semibold flex items-center gap-2">
                    <User className="w-4 h-4 text-primary" /> Edit Profile
                </h3>
                <div className="space-y-2">
                    <Label>Name</Label>
                    <Input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
                </div>
                <div className="space-y-2">
                    <Label>Email</Label>
                    <Input value={user?.email || ""} disabled className="bg-muted/50" />
                </div>
                <div className="space-y-2">
                    <Label className="flex items-center gap-1"><Target className="w-3.5 h-3.5" /> Learning Goal</Label>
                    <textarea
                        value={learningGoal}
                        onChange={e => setLearningGoal(e.target.value)}
                        placeholder="What do you want to achieve?"
                        className="w-full p-3 rounded-xl border border-input bg-background min-h-[80px] resize-none focus:outline-none focus:border-primary"
                    />
                </div>
                <Button onClick={handleSave} disabled={saving} className="bg-primary">
                    {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    Save Changes
                </Button>
            </div>
        </div>
    );
}