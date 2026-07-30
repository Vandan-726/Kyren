import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/lib/AuthContext";
import { useAppData } from "@/lib/appData";
import { kyren } from "@/api/kyrenClient";
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    Legend, ResponsiveContainer
} from "recharts";
import { Card } from "@/components/ui/card";
import { TrendingUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const LINE_COLORS = [
    "#E34A32", "#22C55E", "#F59E0B", "#EF4444",
    "#A78BFA", "#EC4899", "#14B8A6", "#F97316",
];

const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
};

export default function MasteryTrendChart() {
    const { user } = useAuth();
    const { masteryScores } = useAppData();
    const [quizAttempts, setQuizAttempts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user?.id) return;
        kyren.entities.QuizAttempt.filter({ user_id: user.id }, "created_date")
            .then(setQuizAttempts)
            .catch(() => { })
            .finally(() => setLoading(false));
    }, [user?.id]);

    // Build trend data: for each unique date, a data point with each skill's latest score up to that date
    const { chartData, skills } = useMemo(() => {
        if (quizAttempts.length === 0) return { chartData: [], skills: [] };

        // Group attempts by skill, sorted by date
        const bySkill = {};
        quizAttempts.forEach((attempt) => {
            const skillKey = attempt.skill_id || attempt.skill_name || "Unknown";
            const skillName = attempt.skill_name || bySkill[skillKey]?.name || skillKey;
            if (!bySkill[skillKey]) {
                bySkill[skillKey] = { name: skillName, attempts: [] };
            }
            bySkill[skillKey].name = skillName || bySkill[skillKey].name;
            bySkill[skillKey].attempts.push({
                date: attempt.created_date,
                score: attempt.score,
            });
        });

        const skillKeys = Object.keys(bySkill);
        const skillList = skillKeys.map((k) => ({
            id: k,
            name: bySkill[k].name,
            color: LINE_COLORS[skillKeys.indexOf(k) % LINE_COLORS.length],
        }));

        // Build cumulative data: for each attempt date, record each skill's most recent score up to that point
        const allDates = [...new Set(quizAttempts.map((a) => a.created_date))].sort();

        const data = allDates.map((date) => {
            const point = { date: formatDate(date) };
            skillKeys.forEach((sk) => {
                const attemptsUpTo = bySkill[sk].attempts.filter((a) => a.date <= date);
                if (attemptsUpTo.length > 0) {
                    point[bySkill[sk].name] = attemptsUpTo[attemptsUpTo.length - 1].score;
                }
            });
            return point;
        });

        return { chartData: data, skills: skillList };
    }, [quizAttempts]);

    const hasData = chartData.length > 0 && skills.length > 0;

    return (
        <Card className="p-6">
            <div className="flex items-center justify-between mb-5">
                <h2 className="font-semibold flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-primary" />
                    Mastery Trends Over Time
                </h2>
                {hasData && (
                    <span className="text-xs text-muted-foreground">
                        {skills.length} skill{skills.length !== 1 ? "s" : ""} tracked
                    </span>
                )}
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-[320px]">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            ) : hasData ? (
                <ResponsiveContainer width="100%" height={320}>
                    <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: "hsl(var(--card))",
                                border: "1px solid hsl(var(--border))",
                                borderRadius: "0.75rem",
                                fontSize: "13px",
                            }}
                        />
                        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                        {skills.map((skill) => (
                            <Line
                                key={skill.id}
                                type="monotone"
                                dataKey={skill.name}
                                stroke={skill.color}
                                strokeWidth={2}
                                dot={{ r: 3 }}
                                activeDot={{ r: 5 }}
                                connectNulls
                            />
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            ) : (
                <div className="flex flex-col items-center justify-center h-[320px] text-center">
                    <TrendingUp className="w-10 h-10 text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground">No quiz attempts yet</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                        Complete quizzes to see your mastery trends over time
                    </p>
                </div>
            )}

            {/* Current mastery summary chips */}
            {hasData && masteryScores.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border">
                    {skills.map((skill) => {
                        const mastery = masteryScores.find((m) => m.skill_id === skill.id || m.skill_name === skill.name);
                        const pct = mastery?.percentage ?? 0;
                        return (
                            <div
                                key={skill.id}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 text-xs"
                            >
                                <span className={cn("w-2 h-2 rounded-full")} style={{ backgroundColor: skill.color }} />
                                <span className="font-medium">{skill.name}</span>
                                <span className="text-muted-foreground">{pct}%</span>
                            </div>
                        );
                    })}
                </div>
            )}
        </Card>
    );
}
