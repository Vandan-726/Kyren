import React from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";
import { useAppData } from "@/lib/appData";
import {
    Trophy, Zap, Flame, Star, Award,
    BookOpen, CheckCircle2, Lock
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function Achievements() {
    const { user } = useAuth();
    const { masteryScores, learningTasks, courses } = useAppData();

    const masteredSkills = masteryScores.filter(m => m.status === "Mastered");
    const completedTasks = learningTasks.filter(t => t.status === "Completed" || t.status === "Mastered");
    const completedCourses = courses.filter(c => c.progress >= 100);

    // XP calculation
    const xp = masteredSkills.length * 100 + completedTasks.length * 50 + completedCourses.length * 200;
    const level = Math.floor(xp / 500) + 1;
    const xpToNext = (level * 500) - xp;

    const badges = [
        { id: "first_step", name: "First Step", desc: "Complete your first learning task", icon: Star, unlocked: completedTasks.length >= 1, color: "text-primary" },
        { id: "gap_finder", name: "Gap Finder", desc: "Detect 3 learning gaps", icon: Zap, unlocked: learningTasks.length >= 3, color: "text-amber-500" },
        { id: "skill_master", name: "Skill Master", desc: "Master your first skill", icon: Trophy, unlocked: masteredSkills.length >= 1, color: "text-green-500" },
        { id: "course_hero", name: "Course Hero", desc: "Complete a full course", icon: Award, unlocked: completedCourses.length >= 1, color: "text-purple-500" },
        { id: "polyglot", name: "Polyglot", desc: "Master 3 different skills", icon: BookOpen, unlocked: masteredSkills.length >= 3, color: "text-orange-500" },
        { id: "scholar", name: "Scholar", desc: "Reach 1000 XP", icon: Flame, unlocked: xp >= 1000, color: "text-red-500" },
    ];

    return (
        <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
            <div className="mb-6">
                <h1 className="text-2xl md:text-3xl font-bold mb-2">Achievements</h1>
                <p className="text-muted-foreground">Your learning milestones and progress.</p>
            </div>

            {/* XP & Level */}
            <Card className="p-6">
                <div className="flex items-center gap-4">
                    <div className="w-20 h-20 rounded-2xl bg-brand-black flex items-center justify-center">
                        <span className="text-2xl font-bold text-white">L{level}</span>
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                            <h2 className="font-semibold">Level {level}</h2>
                            <span className="text-sm text-muted-foreground">{xp} XP · {xpToNext} XP to Level {level + 1}</span>
                        </div>
                        <div className="h-3 bg-muted rounded-full overflow-hidden">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${(xp % 500) / 500 * 100}%` }}
                                transition={{ duration: 0.8 }}
                                className="h-full rounded-full bg-primary"
                            />
                        </div>
                    </div>
                </div>
            </Card>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: "Skills Mastered", value: masteredSkills.length, icon: Trophy, color: "text-green-500" },
                    { label: "Tasks Completed", value: completedTasks.length, icon: CheckCircle2, color: "text-primary" },
                    { label: "Courses Done", value: completedCourses.length, icon: BookOpen, color: "text-purple-500" },
                    { label: "Total XP", value: xp, icon: Flame, color: "text-amber-500" },
                ].map((stat, i) => {
                    const Icon = stat.icon;
                    return (
                        <Card key={i} className="p-5 text-center">
                            <Icon className={cn("w-6 h-6 mx-auto mb-2", stat.color)} />
                            <div className="text-2xl font-bold">{stat.value}</div>
                            <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
                        </Card>
                    );
                })}
            </div>

            {/* Badges */}
            <Card className="p-6">
                <h2 className="font-semibold flex items-center gap-2 mb-4">
                    <Award className="w-5 h-5 text-amber-500" />
                    Badges
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {badges.map((badge, i) => {
                        const Icon = badge.icon;
                        return (
                            <motion.div
                                key={badge.id}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: i * 0.1 }}
                                className={cn("p-5 rounded-2xl border text-center transition", badge.unlocked ? "border-amber-500/30 bg-amber-500/5" : "border-border bg-muted/30 opacity-60")}
                            >
                                <div className={cn("w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center", badge.unlocked ? "bg-amber-500/10" : "bg-muted")}>
                                    {badge.unlocked ? <Icon className={cn("w-7 h-7", badge.color)} /> : <Lock className="w-6 h-6 text-muted-foreground" />}
                                </div>
                                <h3 className="font-medium text-sm">{badge.name}</h3>
                                <p className="text-xs text-muted-foreground mt-1">{badge.desc}</p>
                            </motion.div>
                        );
                    })}
                </div>
            </Card>
        </div>
    );
}