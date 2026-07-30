import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";
import { kyren } from "@/api/kyrenClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
    Send, Bot, User as UserIcon, Sparkles, Loader2,
    HelpCircle, Plus
} from "lucide-react";
import { solveDoubt } from "@/lib/aiAgents";
import { getSkillById } from "@/lib/skillsGraph";
import { cn } from "@/lib/utils";

export default function DoubtSolver() {
    const { user } = useAuth();
    const [conversation, setConversation] = useState(null);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [pendingGap, setPendingGap] = useState(null);
    const endRef = useRef(null);
    const userId = user?.id;
    const selectedLang = localStorage.getItem("kyren-language") || "en";

    useEffect(() => {
        loadConversation();
    }, [userId]);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const loadConversation = async () => {
        try {
            let conv = await kyren.entities.Conversation.filter({
                user_id: userId,
                context_type: "doubt_solver",
            }, "-created_date", 1);

            if (conv.length === 0) {
                conv = await kyren.entities.Conversation.create({
                    user_id: userId,
                    context_type: "doubt_solver",
                    title: "Doubt Solver",
                    detected_language: selectedLang,
                });
                setConversation(conv);
                const welcome = await kyren.entities.Message.create({
                    conversation_id: conv.id,
                    user_id: userId,
                    role: "ai",
                    content: "Hi! I'm your AI Doubt Solver. Ask me any STEM question — I'll explain it simply, give an example, and help you practice. What's your question?",
                    detected_language: selectedLang,
                });
                setMessages([welcome]);
            } else {
                setConversation(conv[0]);
                const msgs = await kyren.entities.Message.filter({ conversation_id: conv[0].id }, "created_date");
                setMessages(msgs);
            }
        } catch (e) {
            console.error("Failed to load doubt solver", e);
        }
    };

    const handleSend = async (text) => {
        if (!text.trim() || loading) return;
        setLoading(true);
        setInput("");

        const userMsg = await kyren.entities.Message.create({
            conversation_id: conversation.id,
            user_id: userId,
            role: "student",
            content: text,
            detected_language: selectedLang,
        });
        setMessages(prev => [...prev, userMsg]);

        try {
            const result = await solveDoubt({ userMessage: text, language: selectedLang });

            let responseText = `**Explanation:**\n${result.explanation}\n\n**Example:**\n${result.example}`;
            if (result.mini_question) {
                responseText += `\n\n**Try this:** ${result.mini_question}`;
            }

            const aiMsg = await kyren.entities.Message.create({
                conversation_id: conversation.id,
                user_id: userId,
                role: "ai",
                content: responseText,
                detected_language: selectedLang,
            });
            setMessages(prev => [...prev, aiMsg]);

            if (result.potential_gap && result.gap_skill) {
                setPendingGap(result);
            }
        } catch (e) {
            console.error("DoubtSolver error", e);
            const isLimitError = e?.message?.toLowerCase().includes("limit");
            const errorText = isLimitError
                ? "I've reached the monthly AI usage limit for this plan. Please try again next month or contact support to upgrade."
                : "I couldn't process your question right now. Could you try again?";
            const errorMsg = await kyren.entities.Message.create({
                conversation_id: conversation.id,
                user_id: userId,
                role: "ai",
                content: errorText,
                detected_language: selectedLang,
            });
            setMessages(prev => [...prev, errorMsg]);
            toast.error(isLimitError ? "AI usage limit reached for this month." : "Failed to get response.");
        } finally {
            setLoading(false);
        }
    };

    const handleAddAsTask = async () => {
        if (!pendingGap) return;
        try {
            // Create learning gap
            const gap = await kyren.entities.LearningGap.create({
                user_id: userId,
                skill_id: pendingGap.gap_skill,
                skill_name: getSkillById(pendingGap.gap_skill)?.name || pendingGap.gap_skill,
                detected_from: "doubt",
                severity: "moderate",
                resolved: false,
            });

            // Create learning task
            const skill = getSkillById(pendingGap.gap_skill);
            const task = await kyren.entities.LearningTask.create({
                user_id: userId,
                title: `Learn ${skill?.name || pendingGap.gap_skill}`,
                description: `Detected from doubt solver: ${pendingGap.gap_skill}`,
                reason: "You asked a question that revealed a knowledge gap in this area.",
                skill_id: pendingGap.gap_skill,
                skill_name: skill?.name || pendingGap.gap_skill,
                difficulty: skill?.difficulty_level || "beginner",
                priority: 99,
                estimated_time: "30 min",
                status: "Detected",
            });

            await kyren.entities.TaskActivityLog.create({
                user_id: userId,
                task_id: task.id,
                task_title: task.title,
                event_type: "gap_detected",
                message: `New gap detected from doubt solver: ${task.title}`,
            });

            toast.success("Added as a learning task! Check your Learning Tasks.");
            setPendingGap(null);
        } catch (e) {
            toast.error("Failed to add task.");
        }
    };

    return (
        <div className="flex flex-col h-full min-h-screen">
            <div className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-10">
                <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-black flex items-center justify-center">
                        <HelpCircle className="w-5 h-5 text-brand-black-foreground" />
                    </div>
                    <div>
                        <h1 className="font-semibold">AI Doubt Solver</h1>
                        <p className="text-xs text-muted-foreground">Ask any STEM question. Get simple explanations in your language.</p>
                    </div>
                </div>
            </div>

            <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full px-6 py-6 overflow-hidden">
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
                                    <Bot className="w-4 h-4 text-brand-black-foreground" />
                                </div>
                            )}
                            <div className={cn("max-w-[75%] px-4 py-3 rounded-2xl", msg.role === "student" ? "rounded-tr-sm bg-brand-black text-brand-black-foreground" : "rounded-tl-sm bg-muted text-foreground")}>
                                <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
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
                                <Bot className="w-4 h-4 text-brand-black-foreground" />
                            </div>
                            <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-muted">
                                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                            </div>
                        </div>
                    )}

                    {/* Gap suggestion banner */}
                    {pendingGap && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/5"
                        >
                            <div className="flex items-center gap-2 mb-2">
                                <Sparkles className="w-4 h-4 text-amber-500" />
                                <span className="text-sm font-medium">I detected a potential learning gap: {pendingGap.gap_skill}</span>
                            </div>
                            <p className="text-sm text-muted-foreground mb-3">Would you like me to add this as a learning task so you can master it?</p>
                            <div className="flex gap-2">
                                <Button onClick={handleAddAsTask} size="sm" className="bg-primary">
                                    <Plus className="w-3.5 h-3.5 mr-1" /> Yes, Add as Task
                                </Button>
                                <Button onClick={() => setPendingGap(null)} size="sm" variant="outline">
                                    No, Thanks
                                </Button>
                            </div>
                        </motion.div>
                    )}
                    <div ref={endRef} />
                </div>

                <div className="flex items-end gap-2 pt-2 border-t border-border">
                    <Textarea
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(input); } }}
                        placeholder="Ask any STEM question..."
                        className="flex-1 resize-none min-h-[44px] max-h-32"
                        disabled={loading}
                    />
                    <Button onClick={() => handleSend(input)} size="icon" disabled={loading || !input.trim()} className="rounded-xl h-11 w-11 bg-primary">
                        <Send className="w-4 h-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
