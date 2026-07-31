import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";
import { useAppData } from "@/lib/appData";
import { kyren } from "@/api/kyrenClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import {
    Send, Mic, Sparkles, Brain, ArrowRight,
    Loader2, Bot, User as UserIcon, Activity,
    Trash2, Plus, Edit2, Network, Target, History
} from "lucide-react";
import { createNotification } from "@/lib/notifications";
import {
    detectLearningGaps,
    planLearningTasks,
} from "@/lib/aiAgents";
import {
    getSkillById,
    getAllPrerequisites,
} from "@/lib/skillsGraph";

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
    const { masteryScores, activityLogs, refreshAll } = useAppData();
    const [conversation, setConversation] = useState(null);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [showGapBanner, setShowGapBanner] = useState(false);
    const [recentLogs, setRecentLogs] = useState([]);
    const [editingMsgIndex, setEditingMsgIndex] = useState(null);
    const [editContent, setEditContent] = useState("");
    const messagesEndRef = useRef(null);
    const loadConversationGuardRef = useRef(null);
    const userId = user?.id;
    const selectedLang = localStorage.getItem("kyren-language") || "en";
    const storageKey = userId ? `kyren-companion-${userId}` : null;
    const reviewKey = userId ? `kyren-review-plan-${userId}` : null;

    const mergeUniqueMessages = useCallback((messageList = []) => {
        const seen = new Set();
        return [...messageList]
            .sort((left, right) => {
                const leftTime = new Date(left.created_at || left.created_date || 0).getTime();
                const rightTime = new Date(right.created_at || right.created_date || 0).getTime();
                return leftTime - rightTime;
            })
            .filter((message, index) => {
                const fallbackKey = `${message?.role || "unknown"}:${message?.content || ""}`;
                const key = message?.id || fallbackKey;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
    }, []);

    const persistConversationState = useCallback((conversationData, messageList) => {
        if (!storageKey || !conversationData) return;
        const payload = {
            conversation: {
                id: conversationData.id,
                user_id: conversationData.user_id,
                context_type: conversationData.context_type,
                title: conversationData.title,
                detected_language: conversationData.detected_language,
            },
            messages: (messageList || []).map((msg) => ({
                id: msg.id,
                role: msg.role,
                content: msg.content,
                created_at: msg.created_at || new Date().toISOString(),
                linked_gap_ids: msg.linked_gap_ids || [],
            })),
        };
        localStorage.setItem(storageKey, JSON.stringify(payload));
    }, [storageKey]);

    const persistReviewState = useCallback((payload) => {
        if (!reviewKey || !payload) return;
        localStorage.setItem(reviewKey, JSON.stringify(payload));
    }, [reviewKey]);

    useEffect(() => {
        if (!userId) return;
        if (loadConversationGuardRef.current === userId) return;
        loadConversationGuardRef.current = userId;
        loadConversation();
    }, [userId]);

    useEffect(() => {
        if (conversation && messages.length > 0) {
            persistConversationState(conversation, messages);
        }
    }, [conversation, messages, persistConversationState]);

    useEffect(() => {
        setRecentLogs(activityLogs.slice(0, 5));
    }, [activityLogs]);

    const handleEditSend = async (index, newContent) => {
        if (!newContent.trim()) return;
        setEditingMsgIndex(null);
        
        const msgsToKeep = messages.slice(0, index);
        const msgsToDelete = messages.slice(index);
        
        setMessages(msgsToKeep);
        
        for (const m of msgsToDelete) {
            if (m.id) {
                await kyren.entities.Message.delete(m.id).catch(() => {});
            }
        }
        
        handleSend(newContent);
    };

    const loadConversation = async () => {
        try {
            let conv = await kyren.entities.Conversation.filter({
                conversation_type: "companion",
            }, "-created_at");
            console.log("DEBUG CONV:", conv);

            if (conv.length === 0) {
                conv = await kyren.entities.Conversation.create({
                    user_id: userId,
                    conversation_type: "companion",
                    title: "Learning Companion",
                    detected_language: selectedLang,
                });
                setConversation(conv);
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
                const msgs = await kyren.entities.Message.filter({ conversation_id: conv[0].id }, "created_at");
                console.log("DEBUG LOAD MSGS:", msgs);
                setMessages(mergeUniqueMessages(msgs));
            }
        } catch (e) {
            console.error("Failed to load conversation", e);
        }
    };

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const processGapsAndTasks = useCallback(async (gaps, userGoal) => {
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

        const taskPlan = await planLearningTasks({
            detectedGaps: gaps,
            masteryScores,
            userGoal,
        });

        const oldTasks = await kyren.entities.LearningTask.filter({ user_id: userId }, "priority");
        const plannedTasks = taskPlan.tasks || [];
        const newSkillIds = plannedTasks.map((t) => t.skill_id);
        const toDelete = oldTasks.filter((t) =>
            (t.status === "Detected" || t.status === "Suggested") && !newSkillIds.includes(t.skill_id)
        );
        for (const t of toDelete) {
            await kyren.entities.LearningTask.delete(t.id);
        }

        for (let i = 0; i < plannedTasks.length; i++) {
            const task = plannedTasks[i];
            const existing = oldTasks.find((t) => t.skill_id === task.skill_id);
            if (existing) {
                if (existing.priority !== task.priority) {
                    await kyren.entities.LearningTask.update(existing.id, {
                        priority: task.priority,
                        status: existing.status === "Detected" ? "Suggested" : existing.status,
                    });
                }
            } else {
                await kyren.entities.LearningTask.create({
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
            }
        }

        setShowGapBanner(true);
        await refreshAll();
    }, [refreshAll, masteryScores, userId]);

    const handleSend = async (text) => {
        if (!text.trim() || !conversation || loading) return;
        setLoading(true);
        setInput("");
        const conversationHistory = messages.slice(-6).map((msg) => ({
            role: msg.role,
            content: msg.content,
        }));

        try {
            const userMsg = await kyren.entities.Message.create({
                conversation_id: conversation.id,
                user_id: userId,
                role: "user",
                content: text,
                detected_language: selectedLang,
            });
            setMessages((prev) => mergeUniqueMessages([...prev, userMsg]));
            
            const existingGaps = await kyren.entities.LearningGap.filter({ user_id: userId });
            const gapResult = await detectLearningGaps({
                userMessage: text,
                context: "AI Learning Companion conversation",
                conversationHistory,
                masteryScores,
                existingGaps,
            });

            let aiResponseText = "";
            let detectedNewGaps = [];

            if (gapResult.detected_gaps && gapResult.detected_gaps.length > 0) {
                detectedNewGaps = gapResult.detected_gaps;
                if (gapResult.should_ask_followup && gapResult.followup_question) {
                    aiResponseText = `${gapResult.followup_question}\n\nI can already see these likely gap areas: ${gapResult.detected_gaps.map((g) => g.skill_name).join(", ")}.`;
                } else {
                    processGapsAndTasks(gapResult.detected_gaps, text).catch(console.error);
                    aiResponseText = `I've analyzed what you told me and found ${gapResult.detected_gaps.length} learning gap(s) you need to address:\n\n${gapResult.detected_gaps.map((g, i) => `${i + 1}. **${g.skill_name}** (${g.severity})`).join("\n")}\n\n${gapResult.reasoning}\n\nI'm building your prioritized learning path now.`;
                }
            } else {
                aiResponseText = gapResult.reasoning || gapResult.followup_question || `Interesting! Tell me more about what you want to learn.`;
                if (gapResult.is_out_of_scope) {
                    aiResponseText += `\n\n__OUT_OF_SCOPE__`;
                }
            }

            const aiMsg = await kyren.entities.Message.create({
                conversation_id: conversation.id,
                user_id: userId,
                role: "ai",
                content: aiResponseText,
                detected_language: selectedLang,
                linked_gap_ids: detectedNewGaps.map((g) => g.skill_id),
            });
            setMessages((prev) => mergeUniqueMessages([...prev, aiMsg]));
        } catch (err) {
            console.error("Companion error", err);
            toast.error("Something went wrong.");
        } finally {
            setLoading(false);
        }
    };

    const handleMic = () => {
        if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) return;
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.lang = selectedLang === "en" ? "en-US" : selectedLang;
        recognition.onresult = (event) => setInput(event.results[0][0].transcript);
        recognition.start();
    };

    const clearChat = async () => {
        if (!conversation) return;
        const msgs = await kyren.entities.Message.filter({ conversation_id: conversation.id });
        for (const m of msgs) await kyren.entities.Message.delete(m.id).catch(() => {});
        localStorage.removeItem(storageKey);
        localStorage.removeItem(reviewKey);
        
        const welcome = await kyren.entities.Message.create({
            conversation_id: conversation.id,
            user_id: userId,
            role: "ai",
            content: `Hi! I'm KYREN, your AI learning companion. Tell me what you want to learn — and I'll find out what you already know and what you're missing. What's your learning goal?`,
            detected_language: selectedLang,
        });
        setMessages([welcome]);
        toast.success("Chat cleared.");
    };

    const userInitials = user?.full_name ? user.full_name.charAt(0).toUpperCase() : (user?.email ? user.email.charAt(0).toUpperCase() : "U");

    const lastUserMsgIndex = messages.findLastIndex(m => {
        const r = m.role?.toLowerCase() || "";
        return r === "user" || r === "student";
    });

    return (
        <div className="flex flex-col flex-1 h-full relative overflow-hidden">
            <div className="flex shrink-0 items-center justify-between px-6 py-3 border-b border-border bg-background/95 backdrop-blur-md z-50">
                <div className="flex items-center gap-3">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <span className="font-semibold text-sm">Learning Companion</span>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                    <Button variant="ghost" size="sm" onClick={clearChat} className="h-8 gap-1.5 px-2 sm:px-3 text-destructive hover:text-destructive hover:bg-destructive/10">
                        <Trash2 className="w-4 h-4 shrink-0" />
                        <span className="hidden sm:inline whitespace-nowrap text-xs font-medium">Delete</span>
                    </Button>
                </div>
            </div>

            <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full px-6 py-4 overflow-hidden">
                <div className="flex-1 overflow-y-auto space-y-5 pb-4">
                    {messages.map((msg, i) => {
                        const roleStr = msg.role?.toLowerCase() || "";
                        const isUser = roleStr === "user" || roleStr === "student";
                        const isAi = !isUser;
                        const hasPlanTrigger = msg.linked_gap_ids?.length > 0 || msg.content?.includes("click below to review") || msg.content?.includes("prioritized learning path");
                        
                        return (
                        <motion.div
                            key={msg.id || i}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}
                        >
                            <div className={cn("flex items-end gap-3 max-w-[88%]", isUser ? "flex-row-reverse" : "flex-row")}>
                                <Avatar className="w-10 h-10 shrink-0 shadow-sm">
                                    {isUser ? (
                                        <AvatarFallback className="bg-brand-black text-primary font-bold text-sm">
                                            {userInitials}
                                        </AvatarFallback>
                                    ) : (
                                        <div className="w-full h-full bg-brand-black flex items-center justify-center rounded-full">
                                            <Sparkles className="w-5 h-5 text-primary" />
                                        </div>
                                    )}
                                </Avatar>

                                <div className={cn(
                                    "px-4 py-3 rounded-2xl shadow-sm relative group",
                                    isUser
                                        ? "bg-primary text-primary-foreground rounded-br-sm"
                                        : "bg-card text-foreground border border-border/50 rounded-bl-sm"
                                )}>
                                    {isUser && i === lastUserMsgIndex && editingMsgIndex !== i && (
                                        <div className="absolute top-1 -left-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button 
                                                onClick={() => { setEditingMsgIndex(i); setEditContent(msg.content); }} 
                                                className="p-1.5 bg-muted rounded-full text-muted-foreground hover:text-foreground shadow-sm"
                                                title="Edit prompt"
                                            >
                                                <Edit2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                    )}
                                    {editingMsgIndex === i ? (
                                        <div className="flex flex-col gap-2 min-w-[200px] sm:min-w-[300px]">
                                            <Textarea
                                                value={editContent}
                                                onChange={(e) => setEditContent(e.target.value)}
                                                className="text-sm min-h-[60px] text-foreground bg-background"
                                                autoFocus
                                            />
                                            <div className="flex justify-end gap-2 mt-1">
                                                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingMsgIndex(null)}>Cancel</Button>
                                                <Button size="sm" className="h-7 text-xs" onClick={() => handleEditSend(i, editContent)}>Send</Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            {isAi && (
                                                <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                                                    <Sparkles className="w-3 h-3" /> KYREN AI
                                                </div>
                                            )}
                                            <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content.replace("\\n\\n__OUT_OF_SCOPE__", "")}</p>
                                        </>
                                    )}
                                    {msg.content?.includes("__OUT_OF_SCOPE__") && (
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {SAMPLE_STARTERS.map((s, idx) => (
                                                <button
                                                    key={idx}
                                                    onClick={() => handleSend(s)}
                                                    className="text-[11px] px-2.5 py-1 rounded-full border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors text-primary font-medium"
                                                >
                                                    {s}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    {msg.linked_gap_ids && msg.linked_gap_ids.length > 0 && (
                                        <div className="mt-3 flex flex-wrap gap-1.5">
                                            {msg.linked_gap_ids.map((gid) => (
                                                <span key={gid} className="text-xs px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 font-medium flex items-center gap-1">
                                                    <Target className="w-3.5 h-3.5" /> Gap: {gid}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    {isAi && hasPlanTrigger && (
                                        <div className="mt-4 flex justify-end">
                                            <Button
                                                onClick={() => navigate("/learning-plan?view=roadmap")}
                                                size="sm"
                                                className="rounded-full bg-primary text-primary-foreground shadow-md hover:shadow-lg transition-all"
                                            >
                                                <Network className="w-3.5 h-3.5 mr-2" />
                                                View Learning Roadmap
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    )})}

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
