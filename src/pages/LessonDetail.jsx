import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { kyren } from "@/api/kyrenClient";
import { useAuth } from "@/lib/AuthContext";
import { useAppData } from "@/lib/appData";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
    ArrowLeft, BookOpen, Play, KeyRound, Bot, Send,
    CheckCircle2, Loader2, Sparkles, Video,
    Trophy, RotateCcw, AlertCircle, Zap, Maximize2, Minimize2
} from "lucide-react";
import { tutorRespond, generateLessonContent, generateQuiz, generateMicroModule, generateFlashcards } from "@/lib/aiAgents";
import { getSkillById } from "@/lib/skillsGraph";
import { scheduleSkillReview } from "@/lib/spacedRepetition";
import { createNotification } from "@/lib/notifications";
import { cn } from "@/lib/utils";
import { useFocusMode, toggleFocusMode, setFocusMode } from "@/lib/focusMode";

export default function LessonDetail() {
    const { courseId, lessonId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { masteryScores, refreshMastery, refreshAll } = useAppData();
    const [lesson, setLesson] = useState(null);
    const [course, setCourse] = useState(null);
    const [module, setModule] = useState(null);
    const [videos, setVideos] = useState([]);
    const [quiz, setQuiz] = useState(null);
    const [quizQuestions, setQuizQuestions] = useState([]);
    const [tutorMessages, setTutorMessages] = useState([]);
    const [tutorInput, setTutorInput] = useState("");
    const [tutorLoading, setTutorLoading] = useState(false);
    const [contentLoading, setContentLoading] = useState(false);
    const [quizMode, setQuizMode] = useState(false);
    const [quizAnswers, setQuizAnswers] = useState({});
    const [quizResult, setQuizResult] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [microModule, setMicroModule] = useState(null);
    const [generatingMicro, setGeneratingMicro] = useState(false);
    const [activeTab, setActiveTab] = useState("content");
    const focusMode = useFocusMode();
    const tutorEndRef = useRef(null);

    const userId = user?.id;
    const selectedLang = localStorage.getItem("kyren-language") || "en";

    useEffect(() => {
        loadLessonData();
    }, [lessonId]);

    useEffect(() => {
        tutorEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [tutorMessages]);

    // Exit focus mode automatically when leaving the lesson
    useEffect(() => {
        return () => setFocusMode(false);
    }, []);

    const loadLessonData = async () => {
        try {
            setContentLoading(true);
            const lessonData = await kyren.entities.Lesson.get(lessonId);
            setLesson(lessonData);

            const courseData = await kyren.entities.Course.get(courseId);
            setCourse(courseData);

            if (lessonData.module_id) {
                const moduleData = await kyren.entities.Module.get(lessonData.module_id);
                setModule(moduleData);
            }

            // Load existing quiz
            const quizzes = await kyren.entities.Quiz.filter({ lesson_id: lessonId });
            if (quizzes.length > 0) {
                setQuiz(quizzes[0]);
                const questions = await kyren.entities.QuizQuestion.filter({ quiz_id: quizzes[0].id });
                setQuizQuestions(questions);
            }

            // Load existing tutor messages
            const existingTutor = await kyren.entities.Conversation.filter({
                user_id: userId,
                context_type: "tutor",
                context_ref_id: lessonId,
            }, "-created_date", 1);
            if (existingTutor.length > 0) {
                const msgs = await kyren.entities.Message.filter({ conversation_id: existingTutor[0].id }, "created_date");
                setTutorMessages(msgs);
            }
        } catch (e) {
            console.error("Failed to load lesson", e);
        } finally {
            setContentLoading(false);
        }
    };

    const handleGenerateContent = async () => {
        setContentLoading(true);
        try {
            const content = await generateLessonContent({
                lesson,
                courseTitle: course?.title,
                moduleTitle: module?.title,
                difficulty: course?.difficulty || "beginner",
                language: selectedLang,
            });

            const updated = await kyren.entities.Lesson.update(lessonId, {
                ai_summary: content.ai_summary,
                key_concepts: content.key_concepts,
            });
            setLesson({ ...lesson, ...updated });

            // Also generate quiz if none exists
            if (!quiz) {
                await handleGenerateQuiz(updated);
            }

            // Auto-generate flashcards for spaced repetition
            try {
                const existingCards = await kyren.entities.Flashcard.filter({ user_id: userId, lesson_id: lessonId });
                if (existingCards.length === 0 && updated.key_concepts?.length > 0) {
                    const cardResult = await generateFlashcards({ lesson: updated, courseTitle: course?.title });
                    const cards = cardResult?.flashcards || [];
                    if (cards.length > 0) {
                        const today = new Date().toISOString().split("T")[0];
                        const flashcardRecords = cards.map((c) => ({
                            user_id: userId,
                            lesson_id: lessonId,
                            skill_id: updated.skill_id || "",
                            skill_name: updated.skill_name || "",
                            concept: c.concept || "",
                            front: c.front,
                            back: c.back,
                        }));
                        await kyren.entities.Flashcard.bulkCreate(flashcardRecords);
                        // Create initial review records (due today)
                        const createdCards = await kyren.entities.Flashcard.filter({ user_id: userId, lesson_id: lessonId });
                        const reviewRecords = createdCards.map((c) => ({
                            user_id: userId,
                            flashcard_id: c.id,
                            next_review_date: today,
                            ease_factor: 2.5,
                            interval_days: 0,
                            repetitions: 0,
                        }));
                        await kyren.entities.SpacedReview.bulkCreate(reviewRecords);
                        await createNotification(userId, "micro_module_ready", "Flashcards Ready",
                            `${cards.length} review flashcards generated for "${lesson.title}".`);
                    }
                }
            } catch (e) {
                // Flashcard generation failure should not block lesson content
                console.error("Flashcard generation failed:", e);
            }

            toast.success("Lesson content generated!");
        } catch (e) {
            toast.error("Failed to generate content.");
        } finally {
            setContentLoading(false);
        }
    };

    const handleGenerateQuiz = async (lessonData) => {
        try {
            const quizResult = await generateQuiz({
                lesson: lessonData || lesson,
                courseTitle: course?.title,
                moduleTitle: module?.title,
                difficulty: course?.difficulty || "beginner",
                numQuestions: 5,
            });

            const newQuiz = await kyren.entities.Quiz.create({
                lesson_id: lessonId,
                module_id: lesson?.module_id,
                title: `${lesson.title} Quiz`,
                difficulty: course?.difficulty || "beginner",
            });
            setQuiz(newQuiz);

            for (const q of quizResult.questions) {
                await kyren.entities.QuizQuestion.create({
                    quiz_id: newQuiz.id,
                    question_text: q.question_text,
                    options: q.options,
                    correct_answer: q.correct_answer,
                    difficulty: q.difficulty || "beginner",
                });
            }

            const questions = await kyren.entities.QuizQuestion.filter({ quiz_id: newQuiz.id });
            setQuizQuestions(questions);
            toast.success("Quiz generated!");
        } catch (e) {
            toast.error("Failed to generate quiz.");
        }
    };

    const handleSendTutor = async () => {
        if (!tutorInput.trim() || tutorLoading) return;
        const text = tutorInput;
        setTutorInput("");
        setTutorLoading(true);

        // Get or create tutor conversation
        let conv = await kyren.entities.Conversation.filter({
            conversation_type: "tutor",
            context_ref_id: lessonId,
        }, "-created_at");
        if (conv.length === 0) {
            conv = await kyren.entities.Conversation.create({
                user_id: userId,
                conversation_type: "tutor",
                context_ref_id: lessonId,
                title: `Tutor: ${lesson.title}`,
            });
            conv = [conv];
        }

        // Save student message
        const userMsg = await kyren.entities.Message.create({
            conversation_id: conv[0].id,
            user_id: userId,
            role: "student",
            content: text,
        });
        setTutorMessages(prev => [...prev, userMsg]);

        try {
            // Get past mistakes
            const attempts = await kyren.entities.QuizAttempt.filter({ user_id: userId, lesson_id: lessonId });
            const mistakes = [];
            for (const attempt of attempts) {
                if (attempt.answers) {
                    attempt.answers.forEach(a => {
                        if (!a.correct && a.question_text) mistakes.push(a.question_text);
                    });
                }
            }

            const skillScore = masteryScores.find(m => m.skill_id === lesson.skill_id);
            const response = await tutorRespond({
                userMessage: text,
                lesson: lesson,
                courseTitle: course?.title,
                moduleTitle: module?.title,
                masteryScore: skillScore?.percentage,
                pastMistakes: mistakes,
                language: selectedLang,
            });

            const aiMsg = await kyren.entities.Message.create({
                conversation_id: conv[0].id,
                user_id: userId,
                role: "ai",
                content: typeof response === "string" ? response : JSON.stringify(response),
            });
            setTutorMessages(prev => [...prev, aiMsg]);
        } catch (e) {
            toast.error("Tutor unavailable. Try again.");
        } finally {
            setTutorLoading(false);
        }
    };

    const handleAnswerSelect = (questionId, answer) => {
        setQuizAnswers(prev => ({ ...prev, [questionId]: answer }));
    };

    const handleSubmitQuiz = async () => {
        if (Object.keys(quizAnswers).length < quizQuestions.length) {
            toast.error("Please answer all questions.");
            return;
        }
        setSubmitting(true);
        try {
            let correct = 0;
            const answers = quizQuestions.map(q => {
                const isCorrect = quizAnswers[q.id] === q.correct_answer;
                if (isCorrect) correct++;
                return {
                    question_text: q.question_text,
                    selected: quizAnswers[q.id],
                    correct_answer: q.correct_answer,
                    correct: isCorrect,
                };
            });
            const score = Math.round((correct / quizQuestions.length) * 100);
            const passed = score >= 50;

            // Create quiz attempt
            await kyren.entities.QuizAttempt.create({
                user_id: userId,
                quiz_id: quiz.id,
                lesson_id: lessonId,
                skill_id: lesson.skill_id,
                score,
                total_questions: quizQuestions.length,
                answers,
                passed,
            });

            // Update mastery score + SM-2 spaced repetition scheduling
            const newStatus = score >= 80 ? "Mastered" : score >= 50 ? "Improving" : "Needs Review";
            const skillIdCandidate = lesson?.skill_id || course?.title || lesson?.title || "General Learning";
            const skillNameCandidate = lesson?.skill_name || course?.title || lesson?.title || "General Learning";
            const existingScore = masteryScores.find(m => m.skill_id === skillIdCandidate || m.skill_id === lesson?.skill_id);
            const reviewSchedule = scheduleSkillReview(existingScore, score);
            if (existingScore) {
                const newPercentage = Math.round((existingScore.percentage + score) / 2);
                await kyren.entities.MasteryScore.update(existingScore.id, {
                    percentage: newPercentage,
                    status: newPercentage >= 80 ? "Mastered" : newPercentage >= 50 ? "Improving" : "Needs Review",
                    last_updated: new Date().toISOString(),
                    next_review_date: reviewSchedule.next_review_date,
                    ease_factor: reviewSchedule.ease_factor,
                    interval_days: reviewSchedule.interval_days,
                    repetitions: reviewSchedule.repetitions,
                });
            } else {
                await kyren.entities.MasteryScore.create({
                    user_id: userId,
                    skill_id: skillIdCandidate,
                    skill_name: skillNameCandidate,
                    percentage: score,
                    status: newStatus,
                    last_updated: new Date().toISOString(),
                    next_review_date: reviewSchedule.next_review_date,
                    ease_factor: reviewSchedule.ease_factor,
                    interval_days: reviewSchedule.interval_days,
                    repetitions: reviewSchedule.repetitions,
                });
            }

            // Mark lesson as completed
            await kyren.entities.Lesson.update(lessonId, { completed: true });

            setQuizResult({ score, correct, total: quizQuestions.length, answers, passed });
            await refreshMastery();

            if (score < 50) {
                toast.error("You scored below 50%. Let's review with a quick micro-module.");
                await handleTriggerMicroModule();
            } else if (score >= 80) {
                toast.success(`Excellent! You scored ${score}%. Skill mastered!`);
            } else {
                toast.success(`Good progress! You scored ${score}%.`);
            }

            await refreshAll();
        } catch (e) {
            console.error(e);
            toast.error("Failed to submit quiz.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleTriggerMicroModule = async () => {
        setGeneratingMicro(true);
        try {
            const skill = getSkillById(lesson.skill_id) || { name: lesson.skill_name, description: lesson.description };
            const microContent = await generateMicroModule({
                skill,
                triggerReason: `Quiz failure on lesson: ${lesson.title}`,
                language: selectedLang,
            });

            const micro = await kyren.entities.MicroModule.create({
                user_id: userId,
                skill_id: lesson.skill_id,
                skill_name: skill.name,
                trigger_reason: `Quiz failure on ${lesson.title}`,
                title: microContent.title || `${skill.name} in 5 Minutes`,
                explanation: microContent.explanation,
                analogy: microContent.analogy,
                example: microContent.example,
                interactive_question: microContent.interactive_question,
                mini_quiz_question: microContent.mini_quiz_question,
                mini_quiz_options: microContent.mini_quiz_options || [],
                mini_quiz_answer: microContent.mini_quiz_answer,
                status: "generated",
            });
            setMicroModule(micro);
        } catch (e) {
            toast.error("Failed to generate micro-module.");
        } finally {
            setGeneratingMicro(false);
        }
    };

    const handleRetakeQuiz = () => {
        setQuizMode(true);
        setQuizAnswers({});
        setQuizResult(null);
    };

    if (contentLoading && !lesson) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!lesson) {
        return <div className="p-8 text-center text-muted-foreground">Lesson not found.</div>;
    }

    const hasContent = lesson.ai_summary && lesson.ai_summary.length > 0;

    return (
        <div className="p-6 md:p-8 max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-4">
                <button onClick={() => navigate(`/courses/${courseId}`)} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
                    <ArrowLeft className="w-4 h-4" /> Back to Course
                </button>
                <Button variant="outline" size="sm" onClick={toggleFocusMode}>
                    {focusMode ? (
                        <><Minimize2 className="w-4 h-4 mr-1.5" /> Exit Focus</>
                    ) : (
                        <><Maximize2 className="w-4 h-4 mr-1.5" /> Focus Mode</>
                    )}
                </Button>
            </div>

            {/* Lesson Header */}
            <div className="mb-6">
                <h1 className="text-2xl md:text-3xl font-bold mb-2">{lesson.title}</h1>
                <p className="text-muted-foreground">{lesson.description}</p>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-6 border-b border-border">
                {[
                    { key: "content", label: "Content", icon: BookOpen },
                    { key: "tutor", label: "AI Tutor", icon: Bot },
                    { key: "quiz", label: "Quiz", icon: Trophy },
                ].map(tab => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={cn(
                                "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition",
                                activeTab === tab.key
                                    ? "border-blue-500 text-primary"
                                    : "border-transparent text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <Icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Content Tab */}
            {activeTab === "content" && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                    {!hasContent && !contentLoading && (
                        <div className="text-center py-12">
                            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                                <Sparkles className="w-8 h-8 text-primary" />
                            </div>
                            <h3 className="text-lg font-semibold mb-2">Content Not Generated Yet</h3>
                            <p className="text-muted-foreground mb-4">Let KYREN's AI generate your lesson content.</p>
                            <Button onClick={handleGenerateContent} disabled={contentLoading} className="bg-primary">
                                {contentLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</> : <><Sparkles className="w-4 h-4 mr-2" /> Generate Content</>}
                            </Button>
                        </div>
                    )}

                    {hasContent && (
                        <>
                            {/* AI Summary */}
                            <div className="p-6 rounded-2xl border border-border bg-card">
                                <h3 className="font-semibold flex items-center gap-2 mb-4">
                                    <BookOpen className="w-4 h-4 text-primary" />
                                    Lesson Summary
                                </h3>
                                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{lesson.ai_summary}</p>
                            </div>

                            {/* Key Concepts */}
                            {lesson.key_concepts && lesson.key_concepts.length > 0 && (
                                <div className="p-6 rounded-2xl border border-border bg-card">
                                    <h3 className="font-semibold flex items-center gap-2 mb-4">
                                        <KeyRound className="w-4 h-4 text-amber-500" />
                                        Key Takeaways
                                    </h3>
                                    <ul className="space-y-3">
                                        {lesson.key_concepts.map((concept, i) => (
                                            <motion.li
                                                key={i}
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: i * 0.1 }}
                                                className="flex items-start gap-3"
                                            >
                                                <div className="w-6 h-6 rounded-full bg-amber-500/10 text-amber-500 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                                                    {i + 1}
                                                </div>
                                                <span className="text-sm">{concept}</span>
                                            </motion.li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Videos placeholder */}
                            <div className="p-6 rounded-2xl border border-border bg-card">
                                <h3 className="font-semibold flex items-center gap-2 mb-4">
                                    <Video className="w-4 h-4 text-primary" />
                                    Recommended Videos
                                </h3>
                                <div className="grid md:grid-cols-2 gap-4">
                                    {videos.length > 0 ? (
                                        videos.map(v => (
                                            <div key={v.id} className="p-4 rounded-xl border border-border">
                                                <div className="aspect-video rounded-lg bg-muted flex items-center justify-center mb-3">
                                                    <Play className="w-8 h-8 text-muted-foreground" />
                                                </div>
                                                <h4 className="text-sm font-medium">{v.title}</h4>
                                                <div className="text-xs text-muted-foreground mt-1">{v.duration} · {v.difficulty_level}</div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="col-span-2 text-center py-8">
                                            <p className="text-sm text-muted-foreground">Videos are selected based on your lesson content. Search YouTube for related tutorials.</p>
                                            <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(lesson.title + " tutorial")}`} target="_blank" rel="noopener noreferrer" className="inline-block mt-3">
                                                <Button variant="outline" size="sm">
                                                    <Video className="w-3.5 h-3.5 mr-1.5" /> Search on YouTube
                                                </Button>
                                            </a>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </motion.div>
            )}

            {/* Tutor Tab */}
            {activeTab === "tutor" && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-[500px]">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-8 h-8 rounded-lg bg-brand-black flex items-center justify-center">
                            <Bot className="w-4 h-4 text-white" />
                        </div>
                        <div>
                            <h3 className="font-medium text-sm">Lesson-Scoped AI Tutor</h3>
                            <p className="text-xs text-muted-foreground">Context: {lesson.title}</p>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-4 p-4 rounded-2xl border border-border bg-muted/30">
                        {tutorMessages.length === 0 && (
                            <div className="text-center text-sm text-muted-foreground py-8">
                                Ask me anything about this lesson. I know your learning objectives, videos, and your past quiz mistakes.
                            </div>
                        )}
                        {tutorMessages.map((msg, i) => (
                            <div key={msg.id || i} className={cn("flex gap-2", msg.role === "student" ? "justify-end" : "justify-start")}>
                                {msg.role === "ai" && <Bot className="w-6 h-6 text-primary shrink-0" />}
                                <div className={cn("max-w-[75%] px-3 py-2 rounded-xl text-sm", msg.role === "student" ? "bg-brand-black text-white" : "bg-card border border-border")}>
                                    {msg.content}
                                </div>
                                {msg.role === "student" && <Sparkles className="w-6 h-6 text-muted-foreground shrink-0" />}
                            </div>
                        ))}
                        {tutorLoading && (
                            <div className="flex gap-2">
                                <Bot className="w-6 h-6 text-primary" />
                                <div className="px-3 py-2 rounded-xl bg-card border border-border">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                </div>
                            </div>
                        )}
                        <div ref={tutorEndRef} />
                    </div>
                    <div className="flex items-end gap-2 mt-3">
                        <Textarea
                            value={tutorInput}
                            onChange={e => setTutorInput(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendTutor(); } }}
                            placeholder="Ask about this lesson..."
                            className="flex-1 resize-none min-h-[40px] max-h-24"
                        />
                        <Button onClick={handleSendTutor} disabled={tutorLoading || !tutorInput.trim()} size="icon" className="bg-primary h-10 w-10">
                            <Send className="w-4 h-4" />
                        </Button>
                    </div>
                </motion.div>
            )}

            {/* Quiz Tab */}
            {activeTab === "quiz" && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                    {quizResult && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className={cn(
                                "p-6 rounded-2xl border text-center",
                                quizResult.score >= 80 ? "border-green-500/30 bg-green-500/10" :
                                    quizResult.score >= 50 ? "border-primary/30 bg-primary/10" :
                                        "border-amber-500/30 bg-amber-500/10"
                            )}
                        >
                            <div className={cn("w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center",
                                quizResult.score >= 80 ? "bg-green-500/20" : quizResult.score >= 50 ? "bg-primary/20" : "bg-amber-500/20"
                            )}>
                                {quizResult.score >= 50 ? <Trophy className="w-8 h-8 text-green-500" /> : <AlertCircle className="w-8 h-8 text-amber-500" />}
                            </div>
                            <h3 className="text-2xl font-bold">{quizResult.score}%</h3>
                            <p className="text-sm text-muted-foreground mt-1">{quizResult.correct} out of {quizResult.total} correct</p>
                            <p className="text-sm mt-2">
                                {quizResult.score >= 80 ? "Mastered! This skill is unlocked." :
                                    quizResult.score >= 50 ? "Improving. Keep practicing." :
                                        "Needs review. Check the micro-module below."}
                            </p>
                            <Button onClick={handleRetakeQuiz} variant="outline" size="sm" className="mt-4">
                                <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Retake Quiz
                            </Button>
                        </motion.div>
                    )}

                    {/* Micro Module for failed quizzes */}
                    {microModule && (
                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="p-6 rounded-2xl border border-amber-500/30 bg-amber-500/5">
                            <div className="flex items-center gap-2 mb-4">
                                <Zap className="w-5 h-5 text-amber-500" />
                                <h3 className="font-semibold">{microModule.title}</h3>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <div className="text-xs font-medium text-muted-foreground mb-1">Explanation</div>
                                    <p className="text-sm">{microModule.explanation}</p>
                                </div>
                                <div>
                                    <div className="text-xs font-medium text-muted-foreground mb-1">Analogy</div>
                                    <p className="text-sm italic">{microModule.analogy}</p>
                                </div>
                                <div>
                                    <div className="text-xs font-medium text-muted-foreground mb-1">Example</div>
                                    <p className="text-sm font-mono bg-muted/50 p-3 rounded-lg">{microModule.example}</p>
                                </div>
                                {microModule.mini_quiz_question && (
                                    <div className="p-4 rounded-xl bg-muted/30">
                                        <div className="text-xs font-medium text-muted-foreground mb-2">Quick Check</div>
                                        <p className="text-sm font-medium mb-3">{microModule.mini_quiz_question}</p>
                                        <div className="space-y-2">
                                            {(microModule.mini_quiz_options || []).map((opt, i) => (
                                                <div key={i} className={cn("p-3 rounded-lg text-sm border", opt === microModule.mini_quiz_answer ? "border-green-500/30 bg-green-500/10" : "border-border")}>
                                                    {opt} {opt === microModule.mini_quiz_answer && <CheckCircle2 className="w-4 h-4 text-green-500 inline ml-2" />}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}

                    {generatingMicro && (
                        <div className="flex items-center justify-center p-8">
                            <Loader2 className="w-6 h-6 animate-spin text-amber-500 mr-2" />
                            <span className="text-sm text-muted-foreground">Generating your personalized micro-module...</span>
                        </div>
                    )}

                    {/* Quiz Questions */}
                    {!quizResult && quizQuestions.length > 0 && (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <h3 className="font-semibold">{quiz?.title || "Quiz"}</h3>
                                <span className="text-sm text-muted-foreground">{quizQuestions.length} questions</span>
                            </div>
                            {quizQuestions.map((q, i) => (
                                <div key={q.id} className="p-6 rounded-2xl border border-border bg-card">
                                    <div className="flex items-start gap-3 mb-4">
                                        <div className="w-7 h-7 rounded-full bg-primary/10 text-primary text-sm font-bold flex items-center justify-center shrink-0">
                                            {i + 1}
                                        </div>
                                        <p className="font-medium">{q.question_text}</p>
                                    </div>
                                    <div className="space-y-2 ml-10">
                                        {q.options.map((opt, oi) => (
                                            <button
                                                key={oi}
                                                onClick={() => handleAnswerSelect(q.id, opt)}
                                                className={cn(
                                                    "w-full text-left p-3 rounded-xl border text-sm transition",
                                                    quizAnswers[q.id] === opt
                                                        ? "border-primary bg-primary/10"
                                                        : "border-border hover:border-slate-400"
                                                )}
                                            >
                                                {opt}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                            <Button onClick={handleSubmitQuiz} disabled={submitting} className="w-full bg-primary">
                                {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting...</> : "Submit Quiz"}
                            </Button>
                        </div>
                    )}

                    {!quizResult && quizQuestions.length === 0 && !contentLoading && (
                        <div className="text-center py-12">
                            <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                            <p className="text-muted-foreground mb-4">No quiz generated yet.</p>
                            <Button onClick={() => handleGenerateQuiz(lesson)} variant="outline">
                                <Sparkles className="w-4 h-4 mr-2" /> Generate Quiz
                            </Button>
                        </div>
                    )}
                </motion.div>
            )}
        </div>
    );
}
