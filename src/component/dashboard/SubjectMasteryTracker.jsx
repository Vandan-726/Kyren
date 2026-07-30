import React, { useState, useMemo } from "react";
import { useAppData } from "@/lib/appData";
import { getSkillById } from "@/lib/skillsGraph";
import {
    RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    Radar, ResponsiveContainer, Tooltip
} from "recharts";
import { Card } from "@/components/ui/card";
import { Target, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const MASTERY_COLORS = {
    high: "#22C55E", // >= 80 Mastered
    mid: "#E34A32",  // >= 50 Improving
    low: "#F59E0B",  // < 50 Needs Review
};

function getMasteryColor(pct) {
    if (pct >= 80) return MASTERY_COLORS.high;
    if (pct >= 50) return MASTERY_COLORS.mid;
    return MASTERY_COLORS.low;
}

function getBadgeClass(pct) {
    if (pct >= 80) return "bg-emerald-500/10 text-emerald-600";
    if (pct >= 50) return "bg-primary/10 text-primary";
    return "bg-amber-500/10 text-amber-600";
}

export default function SubjectMasteryTracker() {
    const { masteryScores } = useAppData();
    const [selectedSubject, setSelectedSubject] = useState(null);

    // Group mastery scores by subject area and compute average mastery per subject
    const subjectData = useMemo(() => {
        const bySubject = {};
        masteryScores.forEach((score) => {
            const skill = getSkillById(score.skill_id);
            const subject = skill?.subject_area || "Other";
            if (!bySubject[subject]) {
                bySubject[subject] = { name: subject, skills: [], total: 0 };
            }
            bySubject[subject].skills.push({
                id: score.skill_id,
                name: score.skill_name || skill?.name || score.skill_id,
                percentage: score.percentage || 0,
                status: score.status,
            });
            bySubject[subject].total += score.percentage || 0;
        });

        return Object.values(bySubject)
            .map((s) => ({
                subject: s.name,
                mastery: Math.round(s.total / s.skills.length),
                skillCount: s.skills.length,
                skills: s.skills.sort((a, b) => b.percentage - a.percentage),
            }))
            .sort((a, b) => b.mastery - a.mastery);
    }, [masteryScores]);

    const hasData = subjectData.length > 0;
    const overallMastery = hasData
        ? Math.round(subjectData.reduce((sum, s) => sum + s.mastery, 0) / subjectData.length)
        : 0;

    return (
        <Card className="p-6">
            <div className="flex items-center justify-between mb-5">
                <h2 className="sf-display flex items-center gap-2 text-sm text-foreground">
                    <Target className="w-4 h-4 text-primary" />
                    Subject Mastery Tracker
                </h2>
                {hasData && (
                    <span className="sf-label text-text-secondary text-[10px]">
                        {subjectData.length} subjects · {overallMastery}% avg
                    </span>
                )}
            </div>

            {hasData ? (
                <div className="grid lg:grid-cols-2 gap-6">
                    {/* Interactive Radar Chart */}
                    <div>
                        <ResponsiveContainer width="100%" height={300}>
                            <RadarChart data={subjectData} outerRadius="72%">
                                <PolarGrid stroke="hsl(var(--border))" />
                                <PolarAngleAxis
                                    dataKey="subject"
                                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                                />
                                <PolarRadiusAxis
                                    domain={[0, 100]}
                                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                                    angle={90}
                                />
                                <Radar
                                    name="Mastery"
                                    dataKey="mastery"
                                    stroke="#E34A32"
                                    fill="#E34A32"
                                    fillOpacity={0.18}
                                    strokeWidth={2}
                                    onMouseEnter={(payload) => {
                                        if (payload?.subject && selectedSubject !== payload.subject) {
                                            setSelectedSubject(payload.subject);
                                        }
                                    }}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: "hsl(var(--card))",
                                        border: "1px solid hsl(var(--border))",
                                        borderRadius: "0.75rem",
                                        fontSize: "13px",
                                    }}
                                    formatter={(value, name, props) => [
                                        `${value}% mastery · ${props.payload.skillCount} skill${props.payload.skillCount !== 1 ? "s" : ""}`,
                                        props.payload.subject,
                                    ]}
                                />
                            </RadarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Expandable Subject List */}
                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                        {subjectData.map((subj) => (
                            <div key={subj.subject}>
                                <button
                                    onClick={() =>
                                        setSelectedSubject(selectedSubject === subj.subject ? null : subj.subject)
                                    }
                                    className={cn(
                                        "w-full flex items-center gap-3 p-3 rounded-2xl border transition text-left",
                                        selectedSubject === subj.subject
                                            ? "border-primary/30 bg-primary/5"
                                            : "border-border hover:bg-muted"
                                    )}
                                >
                                    <div
                                        className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold"
                                        style={{
                                            backgroundColor: `${getMasteryColor(subj.mastery)}15`,
                                            color: getMasteryColor(subj.mastery),
                                        }}
                                    >
                                        {subj.mastery}%
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-foreground truncate">{subj.subject}</div>
                                        <div className="text-xs text-text-secondary">
                                            {subj.skillCount} skill{subj.skillCount !== 1 ? "s" : ""}
                                        </div>
                                    </div>
                                    <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden hidden sm:block">
                                        <div
                                            className="h-full rounded-full transition-all"
                                            style={{ width: `${subj.mastery}%`, backgroundColor: getMasteryColor(subj.mastery) }}
                                        />
                                    </div>
                                    <ChevronDown
                                        className={cn(
                                            "w-4 h-4 text-muted-foreground transition-transform shrink-0",
                                            selectedSubject === subj.subject && "rotate-180"
                                        )}
                                    />
                                </button>
                                {selectedSubject === subj.subject && (
                                    <div className="mt-1.5 ml-4 pl-4 border-l-2 border-border space-y-1.5">
                                        {subj.skills.map((skill) => (
                                            <div key={skill.id} className="flex items-center justify-between py-1.5 px-2 text-xs">
                                                <span className="text-foreground truncate flex-1">{skill.name}</span>
                                                <span className={cn("ml-2 px-2 py-0.5 rounded-full font-medium shrink-0", getBadgeClass(skill.percentage))}>
                                                    {skill.percentage}%
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center h-[300px] text-center">
                    <Target className="w-10 h-10 text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground">No mastery data yet</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                        Complete quizzes to see your subject mastery levels
                    </p>
                </div>
            )}
        </Card>
    );
}