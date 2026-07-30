import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { useAppData } from "@/lib/appData";
import { kyren } from "@/api/kyrenClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import {
    Sunrise, Loader2, CheckCircle2, XCircle, Sparkles,
    ChevronRight, Trophy, RefreshCw
} from "lucide-react";
import { generateSkillCheckIn } from "@/lib/aiAgents";
import { getSkillById } from "@/lib/skillsGraph";
import { cn } from "@/lib/utils";

function getTodayKey() {
    const d = new Date();
    return `kyren-morning-checkin-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function MorningCheckIn() {
    const { user } = useAuth();
    const { masteryScores, refreshMastery } = useAppData();
    const navigate = useNavigate();

    const [dismissed, setDismissed] = useState(false);
    const [questions, setQuestions] = useState(null);
    const [loading, setLoading] = useState(false);
    const [answers, setAnswers] = useState({});
    const [result, setResult] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    const todayKey = getTodayKey();

    // Find weakest skill (lowest mastery that isn't Locked)
    const weakestSkill = useMemo(() => {
        const active = masteryScores
            .filter((m) => m.status !== "Locked")
            .sort((a, b) => (a.percentage || 0) - (b.percentage || 0));
        return active[0] || null;
    }, [masteryScores]);

    // Don't render if already done today, dismissed, or no weakest skill
    const alreadyDone = localStorage.getItem(todayKey) === "done";

    if (alreadyDone || dismissed || !weakestSkill) return null;

    const skillMeta = getSkillById(weakestSkill.skill_id);

    const generateQuestions = async () => {
        setLoading(true);
        try {
            const response = await generateSkillCheckIn({
                skillName: weakestSkill.skill_name,
                skillDescription: skillMeta?.description || weakestSkill.skill_name,
                difficulty: skillMeta?.difficulty_level || "beginner",
                currentMastery: weakestSkill.percentage,
            });
            setQuestions(response.questions || []);
        } catch (e) {
            toast.error("Couldn't generate check-in questions. Try again later.");
            setDismissed(true);
        } finally {
            setLoading(false);
        }
    };

    const handleAnswer = (qIndex, answer) => {
        setAnswers((prev) => ({ ...prev, [qIndex]: answer }));
    };

    const handleSubmit = async () => {
        if (Object.keys(answers).length < questions.length) {
            toast.error("Please answer all 3 questions.");
            return;
        }
        setSubmitting(true);
        try {
            let correct = 0;
            const answerLog = questions.map((q, i) => {
                const isCorrect = answers[i] === q.correct_answer;
                if (isCorrect) correct++;
                return {
                    question_text: q.question_text,
                    selected: answers[i],
                    correct_answer: q.correct_answer,
                    correct: isCorrect,
                };
            });

            const score = Math.round((correct / questions.length) * 100);

            // Save quiz attempt (no lesson/quiz entity — standalone check-in)
            await kyren.entities.QuizAttempt.create({
                user_id: user.id,
                quiz_id: `checkin-${todayKey}`,
                skill_id: weakestSkill.skill_id,
                score,
                total_questions: questions.length,
                answers: answerLog,
                passed: score >= 50,
            });

            // Update mastery score (blend with existing)
            const existingScore = weakestSkill;
            const newPercentage = Math.round((existingScore.percentage + score) / 2);
            const newStatus = newPercentage >= 80 ? "Mastered" : newPercentage >= 50 ? "Improving" : "Needs Review";
            await kyren.entities.MasteryScore.update(existingScore.id, {
                percentage: newPercentage,
                status: newStatus,
                last_updated: new Date().toISOString(),
            });

            await refreshMastery();

            setResult({ score, correct, total: questions.length, newPercentage, newStatus });
            localStorage.setItem(todayKey, "done");
        } catch (e) {
            toast.error("Failed to submit check-in.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleSnooze = () => {
        setDismissed(true);
    };

    // Result screen
    if (result) {
        return (
            <Card className="p-6 border-amber-500/30 bg-gradient-to-r from-amber-500/5 to-orange-500/5">
                <div className="flex items-center gap-2 mb-4">
                    <Trophy className="w-5 h-5 text-amber-500" />
                    <h2 className="font-semibold">Morning Check-In Complete!</h2>
                </div>
                <div className="flex items-center gap-6 mb-4">
                    <div className="text-center">
                        <div className={cn(
                            "text-3xl font-bold",
                            result.score >= 67 ? "text-green-500" : result.score >= 33 ? "text-blue-500" : "text-amber-500"
                        )}>
                            {result.correct}/{result.total}
                        </div>
                        <div className="text-xs text-muted-foreground">correct</div>
                    </div>
                    <div className="flex-1">
                        <p className="text-sm font-medium">{weakestSkill.skill_name}</p>
                        <p className="text-sm text-muted-foreground mt-1">
                            Mastery updated: <span className={cn("font-medium", result.newPercentage >= 80 ? "text-green-500" : result.newPercentage >= 50 ? "text-blue-500" : "text-amber-500")}>{result.newPercentage}%</span> ({result.newStatus})
                        </p>
                    </div>
                </div>
                <div className="space-y-2 mb-4">
                    {questions.map((q, i) => {
                        const isCorrect = answers[i] === q.correct_answer;
                        return (
                            <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-muted/30">
                                {isCorrect ? (
                                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                                ) : (
                                    <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                                )}
                                <div className="text-sm">
                                    <p className="text-foreground/90">{q.question_text}</p>
                                    {!isCorrect && (
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Answer: <span className="text-green-500">{q.correct_answer}</span>
                                        </p>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
                <Button onClick={() => setDismissed(true)} variant="outline" size="sm">
                    Got it
                </Button>
            </Card>
        );
    }

    // Intro screen (before questions generated)
    if (!questions && !loading) {
        return (
            <Card className="p-6 border-amber-500/30 bg-gradient-to-r from-amber-500/5 to-orange-500/5">
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
                        <Sunrise className="w-6 h-6 text-amber-500" />
                    </div>
                    <div className="flex-1">
                        <h2 className="font-semibold mb-1">Daily Mastery Check-In</h2>
                        <p className="text-sm text-muted-foreground mb-3">
                            3 quick questions on your weakest skill to keep your knowledge sharp.
                            Today's focus: <span className="font-medium text-foreground">{weakestSkill.skill_name}</span> ({weakestSkill.percentage}% mastery)
                        </p>
                        <div className="flex items-center gap-2">
                            <Button onClick={generateQuestions} size="sm" variant="primary">
                                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                                Start Check-In
                            </Button>
                            <Button onClick={handleSnooze} size="sm" variant="ghost">
                                Maybe later
                            </Button>
                        </div>
                    </div>
                </div>
            </Card>
        );
    }

    // Loading
    if (loading) {
        return (
            <Card className="p-6 border-amber-500/30 bg-gradient-to-r from-amber-500/5 to-orange-500/5">
                <div className="flex items-center gap-3">
                    <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
                    <p className="text-sm text-muted-foreground">Generating 3 questions for {weakestSkill.skill_name}...</p>
                </div>
            </Card>
        );
    }

    // Quiz screen
    return (
        <Card className="p-6 border-amber-500/30 bg-gradient-to-r from-amber-500/5 to-orange-500/5">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Sunrise className="w-5 h-5 text-amber-500" />
                    <h2 className="font-semibold">Morning Check-In</h2>
                </div>
                <span className="text-xs text-muted-foreground">{weakestSkill.skill_name}</span>
            </div>

            <div className="space-y-4">
                {questions.map((q, i) => (
                    <div key={i}>
                        <p className="text-sm font-medium mb-2">
                            <span className="text-amber-500">Q{i + 1}.</span> {q.question_text}
                        </p>
                        <div className="grid grid-cols-1 gap-2">
                            {q.options.map((opt, j) => (
                                <button
                                    key={j}
                                    onClick={() => handleAnswer(i, opt)}
                                    className={cn(
                                        "text-left text-sm px-3 py-2 rounded-xl border transition",
                                        answers[i] === opt
                                            ? "border-amber-500 bg-amber-500/10 text-foreground"
                                            : "border-border hover:bg-muted/50 text-muted-foreground"
                                    )}
                                >
                                    {opt}
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <div className="flex items-center justify-between mt-5">
                <span className="text-xs text-muted-foreground">
                    {Object.keys(answers).length}/{questions.length} answered
                </span>
                <Button
                    onClick={handleSubmit}
                    disabled={submitting || Object.keys(answers).length < questions.length}
                    size="sm"
                    variant="primary"
                >
                    {submitting ? (
                        <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Submitting...</>
                    ) : (
                        <>Submit <ChevronRight className="w-3.5 h-3.5 ml-1" /></>
                    )}
                </Button>
            </div>
        </Card>
    );
}
