import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";
import { kyren } from "@/api/kyrenClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
    Send, Sparkles, Loader2,
    HelpCircle, Plus, Mic, Volume2
} from "lucide-react";
import { speakText, speechToText } from "@/lib/sarvam";
import { solveDoubt } from "@/lib/aiAgents";
import { getSkillById } from "@/lib/skillsGraph";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const SAMPLE_QUESTIONS = [
    "How does a CPU work?",
    "Explain Newton's laws of motion",
    "What is the difference between DNA and RNA?"
];

export default function DoubtSolver() {
    const { user } = useAuth();
    const [conversation, setConversation] = useState(null);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [speakingMsgId, setSpeakingMsgId] = useState(null);
    const [recording, setRecording] = useState(false);

    const handleSpeak = async (msgId, text) => {
        try {
            setSpeakingMsgId(msgId);
            await speakText(text.replace(/__OUT_OF_SCOPE__/g, ""), selectedLang);
        } catch (e) {
            toast.error("Speech synthesis failed: " + (e.message || "Unknown error"));
        } finally {
            setSpeakingMsgId(null);
        }
    };

    const handleMic = async () => {
        if (recording) return;
        try {
            if (navigator.mediaDevices && window.MediaRecorder) {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                const mediaRecorder = new MediaRecorder(stream);
                const audioChunks = [];

                mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
                mediaRecorder.onstop = async () => {
                    stream.getTracks().forEach((track) => track.stop());
                    const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
                    setRecording(false);
                    toast.info("Transcribing audio via Sarvam AI...");
                    try {
                        const result = await speechToText(audioBlob, selectedLang);
                        if (result?.transcript) {
                            setInput(result.transcript);
                            toast.success("Voice transcribed successfully!");
                        }
                    } catch (err) {
                        console.error("STT error", err);
                        toast.error("Sarvam STT failed: " + (err.message || "Failed"));
                    }
                };

                setRecording(true);
                mediaRecorder.start();
                toast.info("Listening... Speak now (recording for 5 seconds)");
                setTimeout(() => {
                    if (mediaRecorder.state === "recording") {
                        mediaRecorder.stop();
                    }
                }, 5000);
                return;
            }
        } catch (e) {
            console.warn("MediaRecorder permission or browser issue, falling back to WebSpeech", e);
        }

        if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
            toast.error("Voice input is not supported in this browser.");
            return;
        }
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.lang = selectedLang === "en" ? "en-US" : selectedLang;
        recognition.onresult = (event) => setInput(event.results[0][0].transcript);
        recognition.start();
    };
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
                conversation_type: "doubt_solver",
            }, "-created_at");

            if (conv.length === 0) {
                conv = await kyren.entities.Conversation.create({
                    user_id: userId,
                    conversation_type: "doubt_solver",
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
                const msgs = await kyren.entities.Message.filter({ conversation_id: conv[0].id }, "created_at");
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

        try {
            const userMsg = await kyren.entities.Message.create({
                conversation_id: conversation.id,
                user_id: userId,
                role: "user",
                content: text,
                detected_language: selectedLang,
            });
            setMessages(prev => [...prev, userMsg]);
            const result = await solveDoubt({ userMessage: text, language: selectedLang });

            let responseText = result.explanation;
            if (!result.is_out_of_scope) {
                responseText = `**Explanation:**\n${result.explanation}\n\n**Example:**\n${result.example}`;
                if (result.mini_question) {
                    responseText += `\n\n**Try this:** ${result.mini_question}`;
                }
            } else {
                responseText = result.explanation || result.reasoning || result.followup_question || `I can only help with STEM questions.`;
                responseText += `\n\n__OUT_OF_SCOPE__`;
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
        <div className="flex flex-col flex-1 h-full relative overflow-hidden">
            <div className="border-b border-border bg-background/95 backdrop-blur-md shrink-0 z-50">
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
                <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden space-y-5 pb-4" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
                    {messages.map((msg, i) => {
                        const roleStr = msg.role?.toLowerCase() || "";
                        const isUser = roleStr === "user" || roleStr === "student";
                        const isAi = !isUser;
                        const userInitials = user?.full_name ? user.full_name.charAt(0).toUpperCase() : (user?.email ? user.email.charAt(0).toUpperCase() : "U");
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
                                    {isAi && (
                                        <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-primary flex items-center justify-between gap-1.5">
                                            <div className="flex items-center gap-1.5">
                                                <Sparkles className="w-3 h-3" /> KYREN AI
                                            </div>
                                            <button
                                                onClick={() => handleSpeak(msg.id || i, msg.content)}
                                                disabled={speakingMsgId === (msg.id || i)}
                                                className="text-muted-foreground hover:text-primary transition-colors p-1 rounded-full hover:bg-primary/10"
                                                title="Listen in your language"
                                            >
                                                {speakingMsgId === (msg.id || i) ? (
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                ) : (
                                                    <Volume2 className="w-3.5 h-3.5" />
                                                )}
                                            </button>
                                        </div>
                                    )}
                                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content.replace("\\n\\n__OUT_OF_SCOPE__", "")}</p>
                                    {msg.content?.includes("__OUT_OF_SCOPE__") && (
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {SAMPLE_QUESTIONS.map((s, idx) => (
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
                                </div>
                            </div>
                        </motion.div>
                    )})}

                    {loading && (
                        <div className="flex w-full justify-start">
                            <div className="flex items-end gap-3 max-w-[88%] flex-row">
                                <Avatar className="w-10 h-10 shrink-0 shadow-sm">
                                    <div className="w-full h-full bg-brand-black flex items-center justify-center rounded-full">
                                        <Sparkles className="w-5 h-5 text-primary" />
                                    </div>
                                </Avatar>
                                <div className="px-4 py-3 rounded-2xl shadow-sm bg-card text-foreground border border-border/50 rounded-bl-sm">
                                    <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                                        <Sparkles className="w-3 h-3" /> KYREN AI
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Loader2 className="w-4 h-4 animate-spin" /> Thinking...
                                    </div>
                                </div>
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
                    <Button
                        onClick={handleMic}
                        size="icon"
                        variant="outline"
                        type="button"
                        className={cn("rounded-xl h-11 w-11 shrink-0", recording && "bg-destructive/10 text-destructive border-destructive animate-pulse")}
                        title="Voice Input via Sarvam AI"
                        disabled={loading}
                    >
                        <Mic className="w-4 h-4" />
                    </Button>
                    <Button onClick={() => handleSend(input)} size="icon" disabled={loading || !input.trim()} className="rounded-xl h-11 w-11 bg-primary shrink-0">
                        <Send className="w-4 h-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
