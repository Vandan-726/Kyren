import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";
import { useAppData } from "@/lib/appData";
import { kyren } from "@/api/kyrenClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
    Send, Mic, Sparkles, Brain, ArrowRight,
    Loader2, Bot, User as UserIcon, Activity
} from "lucide-react";
import {
    detectLearningGaps,
    planLearningTasks,
} from "@/lib/aiAgents";
import {
    getSkillById,
    getAllPrerequisites,
} from "@/lib/skillsGraph";
import { createNotification } from "@/lib/notifications";
import { cn } from "@/lib/utils";

const SAMPLE_STARTERS = [
    "I want to learn DSA but I don't understand DSA",
    "Teach me machine learning from scratch",
    "I want to learn Python for data science",
    "I'm struggling with calculus concepts",
];

export default function Companion() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { masteryScores, learningTasks, activityLogs, refreshTasks, refreshLogs, refreshGaps, refreshAll } = useAppData();
    const [conversation, setConversation] = useState(null);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [detectedGaps, setDetectedGaps] = useState([]);
    const [showGapBanner, setShowGapBanner] = useState(false);
    const [recentLogs, setRecentLogs] = useState([]);
    const messagesEndRef = useRef(null);
    const userId = user?.id;
    const selectedLang = localStorage.getItem("kyren-language") || "en";

    // Load or create conversation
    useEffect(() => {
        if (!userId) return;
        loadConversation();
    }, [userId]);

    // Update recent logs
    useEffect(() => {
        setRecentLogs(activityLogs.slice(0, 5));
    }, [activityLogs]);

    const loadConversation = async () => {
        try {
            let conv = await kyren.entities.Conversation.filter({
                user_id: userId,
                context_type: "companion",
            }, "-created_date", 1);

            if (conv.length === 0) {
                conv = await kyren.entities.Conversation.create({
                    user_id: userId,
                    context_type: "companion",
                    title: "Learning Companion",
                    detected_language: selectedLang,
                });
                setConversation(conv);
                setMessages([]);
                // Welcome message
                const welcome = await kyren.entities.Message.create({
                    conversation_id: conv.id,
                    user_id: userId,
                    role: "ai",
                    content: `Hi! I'm KYREN, your AI learning companion. Tell me what you want to learn — and I'll find out what you already know and what you're missing. What's your learning goal?`,
                    detected_language: selectedLang,
                });
                setMessages([welcome]);
            } else {
                setConversation(conv[0]);
                const msgs = await kyren.entities.Message.filter({ conversation_id: conv[0].id }, "created_date");
                setMessages(msgs);
            }
        } catch (e) {
            console.error("Failed to load conversation", e);
        }
    };

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const processGapsAndTasks = useCallback(async (gaps, userGoal) => {
        // 1. Create LearningGap records
        const gapRecords = [];
        for (const gap of gaps) {
            const gapRecord = await kyren.entities.LearningGap.create({
                user_id: userId,
                skill_id: gap.skill_id,
                skill_name: gap.skill_name,
                detected_from: "conversation",
                severity: gap.severity,
                resolved: false,
            });
            gapRecords.push(gapRecord);
        }
        setDetectedGaps(gapRecords);

        // Notify user of detected gaps
        if (gapRecords.length > 0) {
            await createNotification(userId, "gap_detected", "Learning Gaps Detected",
                `KYREN found ${gapRecords.length} gap${gapRecords.length > 1 ? "s" : ""} in your knowledge. Your roadmap has been updated.`);
        }

        // 2. Get the full prerequisite chain for each detected gap
        const allNeededSkills = new Set();
        gaps.forEach((g) => {
            allNeededSkills.add(g.skill_id);
            const prereqs = getAllPrerequisites(g.skill_id);
            prereqs.forEach((p) => allNeededSkills.add(p));
        });

        // Filter out already mastered skills
        const missingSkills = Array.from(allNeededSkills).filter((skillId) => {
            const score = masteryScores.find((m) => m.skill_id === skillId);
            return !score || score.status !== "Mastered";
        });

        // 3. Use Task Planning Agent to create ordered tasks
        const taskPlan = await planLearningTasks({
            detectedGaps: gaps,
            masteryScores,
            userGoal,
        });

        // 4. Determine old task ordering for comparison
        const oldTasks = await kyren.entities.LearningTask.filter({ user_id: userId }, "priority");
        const oldOrder = oldTasks.map((t) => ({ id: t.id, title: t.title, priority: t.priority }));

        // 5. Create or update LearningTask records
        const plannedTasks = taskPlan.tasks || [];
        // Remove old detected/suggested tasks that aren't in the new plan
        const newSkillIds = plannedTasks.map((t) => t.skill_id);
        const toDelete = oldTasks.filter((t) =>
            (t.status === "Detected" || t.status === "Suggested") && !newSkillIds.includes(t.skill_id)
        );
        for (const t of toDelete) {
            await kyren.entities.LearningTask.delete(t.id);
        }

        // Create new tasks
        for (let i = 0; i < plannedTasks.length; i++) {
            const task = plannedTasks[i];
            const existing = oldTasks.find((t) => t.skill_id === task.skill_id);
            if (existing) {
                // Update priority if changed
                if (existing.priority !== task.priority) {
                    await kyren.entities.LearningTask.update(existing.id, {
                        priority: task.priority,
                        title: task.title,
                        description: task.description,
                        reason: task.reason,
                        status: existing.status === "Detected" ? "Suggested" : existing.status,
                    });
                    // Log reorder
                    await kyren.entities.TaskActivityLog.create({
                        user_id: userId,
                        task_id: existing.id,
                        task_title: existing.title,
                        event_type: "reordered",
                        before_state: `Priority ${existing.priority}`,
                        after_state: `Priority ${task.priority}`,
                        message: `${existing.title} moved from #${existing.priority} → #${task.priority}`,
                    });
                    await createNotification(userId, "task_reordered", "Roadmap Updated",
                        `"${existing.title}" reprioritized from #${existing.priority} to #${task.priority} based on your learning gaps.`);
                }
            } else {
                const newTask = await kyren.entities.LearningTask.create({
                    user_id: userId,
                    title: task.title,
                    description: task.description,
                    reason: task.reason,
                    skill_id: task.skill_id,
                    skill_name: task.skill_name || getSkillById(task.skill_id)?.name || task.skill_id,
                    difficulty: task.difficulty,
                    priority: task.priority,
                    estimated_time: task.estimated_time,
                    status: "Detected",
                });
                // Log creation
                await kyren.entities.TaskActivityLog.create({
                    user_id: userId,
                    task_id: newTask.id,
                    task_title: task.title,
                    event_type: "gap_detected",
                    after_state: `Priority ${task.priority}`,
                    message: `New learning task detected: ${task.title}`,
                });
            }
        }

        // 6. Show toast notifications for visible feedback
        if (toDelete.length > 0 || plannedTasks.length > 0) {
            setShowGapBanner(true);
            toast.success("Roadmap updated!", {
                description: `${plannedTasks.length} tasks detected and ordered. Check your Learning Tasks.`,
                duration: 5000,
            });
        }

        // 7. Refresh data
        await refreshAll();
    }, [userId, masteryScores, refreshAll]);

    const handleSend = async (text) => {
        if (!text.trim() || !conversation || loading) return;
        setLoading(true);
        setInput("");

        // Save user message
        const userMsg = await kyren.entities.Message.create({
            conversation_id: conversation.id,
            user_id: userId,
            role: "student",
            content: text,
            detected_language: selectedLang,
        });
        setMessages((prev) => [...prev, userMsg]);

        try {
            // Run Learning Gap Agent
            const existingGaps = await kyren.entities.LearningGap.filter({ user_id: userId });
            const gapResult = await detectLearningGaps({
                userMessage: text,
                context: "AI Learning Companion conversation",
                masteryScores,
                existingGaps,
            });

            let aiResponseText = "";
            let detectedNewGaps = [];

            if (gapResult.detected_gaps && gapResult.detected_gaps.length > 0) {
                detectedNewGaps = gapResult.detected_gaps;

                // If the agent wants to ask a follow-up, do that first
                if (gapResult.should_ask_followup && gapResult.followup_question) {
                    aiResponseText = `${gapResult.followup_question}\n\n_(I detected some potential gaps: ${gapResult.detected_gaps.map((g) => g.skill_name).join(", ")}. Let me confirm before building your path.)_`;
                } else {
                    // Process gaps and create tasks
                    await processGapsAndTasks(gapResult.detected_gaps, text);
                    aiResponseText = `I've analyzed what you told me and found ${gapResult.detected_gaps.length} learning gap(s) you need to address:\n\n${gapResult.detected_gaps.map((g, i) => `${i + 1}. **${g.skill_name}** (${g.severity})`).join("\n")}\n\n${gapResult.reasoning}\n\nI've built a prioritized learning path for you. Check your Learning Tasks, or click below to review and confirm your learning plan.`;
                }
            } else {
                // No gaps detected — respond conversationally
                aiResponseText = gapResult.reasoning || `Interesting! Tell me more about what you want to learn. What's your current comfort level with the basics?`;
            }

            // Save AI message
            const aiMsg = await kyren.entities.Message.create({
                conversation_id: conversation.id,
                user_id: userId,
                role: "ai",
                content: aiResponseText,
                detected_language: selectedLang,
                linked_gap_ids: detectedNewGaps.map((g) => g.skill_id),
            });
            setMessages((prev) => [...prev, aiMsg]);
        } catch (err) {
            console.error("Companion error", err);
            const isLimitError = err?.message?.toLowerCase().includes("limit");
            const errorText = isLimitError
                ? "I've reached the monthly AI usage limit for this plan. Please try again next month or contact support to upgrade. In the meantime, you can still browse your courses and review saved notes."
                : "I'm having trouble processing that right now. Could you try again?";
            const errorMsg = await kyren.entities.Message.create({
                conversation_id: conversation.id,
                user_id: userId,
                role: "ai",
                content: errorText,
                detected_language: selectedLang,
            });
            setMessages((prev) => [...prev, errorMsg]);
            toast.error(isLimitError ? "AI usage limit reached for this month." : "Something went wrong. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const handleMic = () => {
        // Use browser Speech Recognition as a basic STT fallback
        if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
            toast.error("Voice input not supported in this browser. Please use text.");
            return;
        }
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.lang = selectedLang === "en" ? "en-US" : selectedLang;
        recognition.continuous = false;
        recognition.interimResults = false;
        toast.info("Listening... Speak now.");
        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            setInput(transcript);
        };
        recognition.onerror = () => toast.error("Could not capture audio. Try again.");
        recognition.start();
    };

    return (
        <div className="flex flex-col h-full min-h-screen">
            {/* Header */}
            <div className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-10">
                <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-brand-black flex items-center justify-center">
                            <Sparkles className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <h1 className="font-semibold">AI Learning Companion</h1>
                            <p className="text-xs text-muted-foreground">Tell me what you want to learn — I'll find what you don't know.</p>
                        </div>
                    </div>
                    {detectedGaps.length > 0 && (
                        <Button onClick={() => navigate("/confirmation")} size="sm" variant="primary">
                            Review Learning Plan <ArrowRight className="w-3.5 h-3.5 ml-1" />
                        </Button>
                    )}
                </div>
            </div>

            <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full px-6 py-6 overflow-hidden">
                {/* Messages */}
                <div className="flex-1 overflow-y-auto space-y-6 pb-4">
                    {messages.map((msg, i) => (
                        <motion.div
                            key={msg.id || i}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={cn("flex gap-3", msg.role === "student" ? "justify-end" : "justify-start")}
                        >
                            {msg.role === "ai" && (
                                <div className="w-8 h-8 rounded-lg bg-brand-black flex items-center justify-center shrink-0">
                                    <Bot className="w-4 h-4 text-primary" />
                                </div>
                            )}
                            <div className={cn(
                                "max-w-[75%] px-4 py-3 rounded-2xl",
                                msg.role === "student"
                                    ? "rounded-tr-sm bg-brand-black text-brand-black-foreground"
                                    : "rounded-tl-sm bg-muted text-foreground"
                            )}>
                                <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                                {msg.linked_gap_ids && msg.linked_gap_ids.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        {msg.linked_gap_ids.map((gid) => (
                                            <span key={gid} className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 flex items-center gap-1">
                                                <Brain className="w-3 h-3" /> Gap: {gid}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {msg.role === "student" && (
                                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                                    <UserIcon className="w-4 h-4 text-muted-foreground" />
                                </div>
                            )}
                        </motion.div>
                    ))}

                    {loading && (
                        <div className="flex gap-3">
                            <div className="w-8 h-8 rounded-lg bg-brand-black flex items-center justify-center shrink-0">
                                <Bot className="w-4 h-4 text-primary" />
                            </div>
                            <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-muted">
                                <div className="flex items-center gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                                    <span className="text-sm text-muted-foreground">Analyzing your learning gaps...</span>
                                </div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Activity Timeline (shows when gaps are detected) */}
                {recentLogs.length > 0 && (
                    <div className="mb-4 p-3 rounded-xl border border-border bg-muted/30 max-h-32 overflow-y-auto">
                        <div className="flex items-center gap-2 mb-2">
                            <Activity className="w-3.5 h-3.5 text-primary" />
                            <span className="text-xs font-medium text-muted-foreground">Activity Timeline</span>
                        </div>
                        <div className="space-y-1">
                            {recentLogs.map((log, i) => (
                                <div key={log.id || i} className="flex items-center gap-2 text-xs">
                                    <span className={cn(
                                        "w-1.5 h-1.5 rounded-full",
                                        log.event_type === "gap_detected" ? "bg-amber-500" :
                                            log.event_type === "reordered" ? "bg-blue-500" :
                                                log.event_type === "completed" ? "bg-green-500" : "bg-slate-400"
                                    )} />
                                    <span className="text-muted-foreground">{log.message}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Sample starters */}
                {messages.length <= 1 && !loading && (
                    <div className="mb-4 flex flex-wrap gap-2">
                        {SAMPLE_STARTERS.map((s, i) => (
                            <button
                                key={i}
                                onClick={() => handleSend(s)}
                                className="px-3 py-2 rounded-full border border-border bg-muted/30 text-sm text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-foreground transition"
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                )}

                {/* Input */}
                <div className="flex items-end gap-2 pt-2 border-t border-border">
                    <Button
                        onClick={handleMic}
                        size="icon"
                        variant="outline"
                        className="rounded-xl h-11 w-11 shrink-0"
                        title="Voice input"
                    >
                        <Mic className="w-4 h-4" />
                    </Button>
                    <Textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleSend(input);
                            }
                        }}
                        placeholder="Tell me what you want to learn..."
                        className="flex-1 resize-none min-h-[44px] max-h-32"
                        disabled={loading}
                    />
                    <Button
                        onClick={() => handleSend(input)}
                        size="icon"
                        disabled={loading || !input.trim()}
                        className="rounded-xl h-11 w-11 shrink-0"
                    >
                        <Send className="w-4 h-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
