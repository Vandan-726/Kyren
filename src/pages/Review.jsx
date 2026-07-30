import React, { useState, useEffect, useCallback } from "react";
import { kyren } from "@/api/kyrenClient";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { useAppData } from "@/lib/appData";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Brain, RotateCcw, Check, X, Zap, Sparkles, Trophy, AlertCircle, ArrowRight } from "lucide-react";
import { sm2 } from "@/lib/spacedRepetition";
import { cn } from "@/lib/utils";

export default function Review() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { masteryScores, refreshMastery } = useAppData();
    const [flashcards, setFlashcards] = useState([]);
    const [reviews, setReviews] = useState([]);
    const [dueQueue, setDueQueue] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [showAnswer, setShowAnswer] = useState(false);
    const [loading, setLoading] = useState(true);
    const [sessionStats, setSessionStats] = useState({ reviewed: 0, correct: 0, failed: 0 });
    const [sessionComplete, setSessionComplete] = useState(false);
    const [skillLessons, setSkillLessons] = useState({});

    const today = new Date().toISOString().split("T")[0];

    // Skills due for review (SM-2 scheduled via MasteryScore.next_review_date)
    const dueSkills = masteryScores.filter((m) =>
        m.next_review_date && m.next_review_date <= today && m.status !== "Locked"
    );

    const loadData = useCallback(async () => {
        if (!user?.id) return;
        setLoading(true);
        try {
            const [cards, revs] = await Promise.all([
                kyren.entities.Flashcard.filter({ user_id: user.id }),
                kyren.entities.SpacedReview.filter({ user_id: user.id }),
            ]);
            setFlashcards(cards);
            setReviews(revs);

            // Build due queue: flashcards whose next_review_date <= today
            const reviewMap = {};
            revs.forEach((r) => { reviewMap[r.flashcard_id] = r; });

            const due = cards.filter((card) => {
                const r = reviewMap[card.id];
                if (!r) return true; // never reviewed = due
                return r.next_review_date <= today;
            });

            setDueQueue(due);
        } catch (e) {
            /* silent */
        }
        setLoading(false);
    }, [user?.id, today]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Load a lesson for each due skill so the user can jump straight to review
    useEffect(() => {
        if (dueSkills.length === 0) {
            setSkillLessons({});
            return;
        }
        let cancelled = false;
        (async () => {
            const map = {};
            for (const skill of dueSkills) {
                if (skill.skill_id && !map[skill.skill_id]) {
                    try {
                        const lessons = await kyren.entities.Lesson.filter({ skill_id: skill.skill_id });
                        if (lessons.length > 0) map[skill.skill_id] = lessons[0];
                    } catch (e) { /* silent */ }
                }
            }
            if (!cancelled) setSkillLessons(map);
        })();
        return () => { cancelled = true; };
    }, [dueSkills.length]);

    const currentCard = dueQueue[currentIndex];
    const currentReview = reviews.find((r) => r.flashcard_id === currentCard?.id);

    const handleReview = async (quality) => {
        if (!currentCard) return;
        const updated = sm2(currentReview, quality);
        try {
            if (currentReview) {
                await kyren.entities.SpacedReview.update(currentReview.id, updated);
            } else {
                await kyren.entities.SpacedReview.create({
                    user_id: user.id,
                    flashcard_id: currentCard.id,
                    ...updated,
                });
            }
        } catch (e) {
            /* silent */
        }

        setSessionStats((s) => ({
            reviewed: s.reviewed + 1,
            correct: quality >= 3 ? s.correct + 1 : s.correct,
            failed: quality < 3 ? s.failed + 1 : s.failed,
        }));

        if (currentIndex + 1 >= dueQueue.length) {
            setSessionComplete(true);
            refreshMastery();
        } else {
            setCurrentIndex(currentIndex + 1);
            setShowAnswer(false);
        }
    };

    const totalCards = flashcards.length;
    const dueCount = dueQueue.length;
    const reviewedCount = reviews.length;

    if (loading) {
        return (
            <div className="p-6 lg:p-10 max-w-4xl mx-auto">
                <Card className="p-12 text-center text-muted-foreground">Loading your review deck…</Card>
            </div>
        );
    }

    return (
        <div className="p-6 lg:p-10 max-w-4xl mx-auto">
            <div className="mb-8">
                <span className="mono-label text-primary">// Spaced Repetition</span>
                <h1 className="text-3xl font-heading font-semibold mt-2">
                    Review & <span className="font-display italic">retain</span>
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Concepts resurface right before you'd forget them — powered by the SM-2 algorithm.
                </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-8">
                <Card className="p-5 text-center">
                    <Brain className="w-6 h-6 text-primary mx-auto mb-2" />
                    <div className="text-2xl font-heading font-bold">{totalCards}</div>
                    <div className="mono-label text-muted-foreground">Total Cards</div>
                </Card>
                <Card className="p-5 text-center">
                    <Zap className="w-6 h-6 text-amber-500 mx-auto mb-2" />
                    <div className="text-2xl font-heading font-bold">{dueCount}</div>
                    <div className="mono-label text-muted-foreground">Due Today</div>
                </Card>
                <Card className="p-5 text-center">
                    <Check className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
                    <div className="text-2xl font-heading font-bold">{reviewedCount}</div>
                    <div className="mono-label text-muted-foreground">Reviewed</div>
                </Card>
            </div>

            {/* Skills Due for Review (spaced repetition) */}
            {dueSkills.length > 0 && (
                <div className="mb-8">
                    <div className="flex items-center gap-2 mb-4">
                        <AlertCircle className="w-5 h-5 text-amber-500" />
                        <h2 className="text-lg font-heading font-semibold">Skills Due for Review</h2>
                        <span className="mono-label text-muted-foreground ml-auto">{dueSkills.length} due</span>
                    </div>
                    <div className="space-y-2">
                        {dueSkills.map((skill) => {
                            const lesson = skillLessons[skill.skill_id];
                            return (
                                <Card key={skill.id} className="p-4 flex items-center gap-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium truncate">{skill.skill_name || skill.skill_id}</div>
                                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                            <span>Mastery: {skill.percentage}%</span>
                                            <span className={cn("px-2 py-0.5 rounded-full", skill.status === "Needs Review" ? "bg-amber-500/10 text-amber-600" : "bg-primary/10 text-primary")}>
                                                {skill.status}
                                            </span>
                                        </div>
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => lesson ? navigate(`/courses/${lesson.course_id}/lessons/${lesson.id}`) : navigate("/courses")}
                                    >
                                        Review <ArrowRight className="w-3.5 h-3.5 ml-1" />
                                    </Button>
                                </Card>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Review session */}
            {sessionComplete ? (
                <Card className="p-12 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
                        <Trophy className="w-8 h-8 text-emerald-500" />
                    </div>
                    <h2 className="text-2xl font-heading font-semibold mb-2">Session complete!</h2>
                    <p className="text-muted-foreground mb-6">
                        You reviewed {sessionStats.reviewed} cards — {sessionStats.correct} correct, {sessionStats.failed} to revisit.
                    </p>
                    <Button onClick={loadData} className="btn-glow text-white border-0 gap-2">
                        <RotateCcw className="w-4 h-4" />
                        Load next batch
                    </Button>
                </Card>
            ) : dueQueue.length === 0 ? (
                <Card className="p-12 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                        <Sparkles className="w-8 h-8 text-primary" />
                    </div>
                    <h2 className="text-2xl font-heading font-semibold mb-2">All caught up!</h2>
                    <p className="text-muted-foreground mb-2">
                        No cards due for review. Complete lessons to generate more flashcards — they'll appear here automatically.
                    </p>
                    <p className="text-sm text-muted-foreground/60">
                        Cards are auto-generated from each lesson's key concepts and scheduled using spaced repetition.
                    </p>
                </Card>
            ) : currentCard ? (
                <div>
                    {/* Progress */}
                    <div className="flex items-center justify-between mb-4">
                        <span className="mono-label text-muted-foreground">
                            Card {currentIndex + 1} of {dueQueue.length}
                        </span>
                        <span className="mono-label text-muted-foreground">
                            {currentCard.skill_name || currentCard.concept || "Review"}
                        </span>
                    </div>
                    <div className="w-full h-1 bg-border rounded-full mb-6 overflow-hidden">
                        <div
                            className="h-full bg-primary transition-all"
                            style={{ width: `${((currentIndex) / dueQueue.length) * 100}%` }}
                        />
                    </div>

                    {/* Flashcard */}
                    <Card className="p-8 min-h-[280px] flex flex-col items-center justify-center text-center mb-6">
                        <span className="mono-label text-primary mb-4">{currentCard.concept}</span>
                        <p className="text-xl font-medium mb-6 leading-relaxed">{currentCard.front}</p>
                        {showAnswer && (
                            <div className="w-full pt-6 border-t border-border">
                                <span className="mono-label text-emerald-500 block mb-2">Answer</span>
                                <p className="text-lg text-muted-foreground leading-relaxed">{currentCard.back}</p>
                            </div>
                        )}
                    </Card>

                    {/* Actions */}
                    {!showAnswer ? (
                        <Button
                            onClick={() => setShowAnswer(true)}
                            className="btn-glow text-white border-0 w-full h-12 text-base"
                        >
                            Reveal answer
                        </Button>
                    ) : (
                        <div>
                            <p className="text-center text-sm text-muted-foreground mb-3">How well did you recall this?</p>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <Button
                                    variant="outline"
                                    onClick={() => handleReview(0)}
                                    className="border-red-500/30 hover:bg-red-500/10 hover:text-red-400 h-12"
                                >
                                    <X className="w-4 h-4 mr-1" />
                                    Blackout
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => handleReview(2)}
                                    className="border-orange-500/30 hover:bg-orange-500/10 hover:text-orange-400 h-12"
                                >
                                    Hard
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => handleReview(4)}
                                    className="border-amber-500/30 hover:bg-amber-500/10 hover:text-amber-500 h-12"
                                >
                                    Good
                                </Button>
                                <Button
                                    onClick={() => handleReview(5)}
                                    className="btn-glow text-white border-0 h-12"
                                >
                                    <Check className="w-4 h-4 mr-1" />
                                    Perfect
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            ) : null}
        </div>
    );
}