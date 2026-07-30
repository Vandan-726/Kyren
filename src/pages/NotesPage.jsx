import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";
import { kyren } from "@/api/kyrenClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
    StickyNote, Plus, Pin, Trash2, Search,
    Sparkles, Loader2, Send
} from "lucide-react";
import { askMyNotes, summarizeNotes } from "@/lib/aiAgents";
import { cn } from "@/lib/utils";

export default function NotesPage() {
    const { user } = useAuth();
    const [notes, setNotes] = useState([]);
    const [courses, setCourses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(null);
    const [newNote, setNewNote] = useState({ title: "", content: "" });
    const [showNew, setShowNew] = useState(false);
    const [askMode, setAskMode] = useState(false);
    const [askQuestion, setAskQuestion] = useState("");
    const [askAnswer, setAskAnswer] = useState(null);
    const [asking, setAsking] = useState(false);

    const userId = user?.id;

    useEffect(() => {
        loadNotes();
        loadCourses();
    }, [userId]);

    const loadNotes = async () => {
        try {
            setLoading(true);
            const data = await kyren.entities.Note.filter({ user_id: userId }, "-created_date");
            setNotes(data);
        } catch (e) { /* */ }
        finally { setLoading(false); }
    };

    const loadCourses = async () => {
        try {
            const data = await kyren.entities.Course.filter({ user_id: userId }, "-created_date");
            setCourses(data);
        } catch (e) { /* */ }
    };

    const handleCreateNote = async () => {
        if (!newNote.content.trim()) return;
        try {
            const note = await kyren.entities.Note.create({
                user_id: userId,
                title: newNote.title || "Untitled Note",
                content: newNote.content,
                pinned: false,
            });
            setNotes(prev => [note, ...prev]);
            setNewNote({ title: "", content: "" });
            setShowNew(false);
            toast.success("Note created!");
        } catch (e) {
            toast.error("Failed to create note.");
        }
    };

    const handleUpdateNote = async (id, data) => {
        try {
            const updated = await kyren.entities.Note.update(id, data);
            setNotes(prev => prev.map(n => n.id === id ? { ...n, ...updated } : n));
            toast.success("Note updated!");
        } catch (e) {
            toast.error("Failed to update note.");
        }
    };

    const handleDeleteNote = async (id) => {
        try {
            await kyren.entities.Note.delete(id);
            setNotes(prev => prev.filter(n => n.id !== id));
            toast.success("Note deleted.");
        } catch (e) {
            toast.error("Failed to delete note.");
        }
    };

    const handleTogglePin = async (note) => {
        await handleUpdateNote(note.id, { pinned: !note.pinned });
    };

    const handleAskNotes = async () => {
        if (!askQuestion.trim() || notes.length === 0) return;
        setAsking(true);
        try {
            const result = await askMyNotes({ question: askQuestion, notes });
            setAskAnswer(result);
        } catch (e) {
            toast.error("Failed to search notes.");
        } finally {
            setAsking(false);
        }
    };

    const handleSummarize = async () => {
        if (notes.length === 0) return;
        setAsking(true);
        try {
            const summary = await summarizeNotes({ notes });
            setAskAnswer({ answer: summary, source_notes: [] });
        } catch (e) {
            toast.error("Failed to summarize.");
        } finally {
            setAsking(false);
        }
    };

    const sortedNotes = [...notes].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

    return (
        <div className="p-6 md:p-8 max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold mb-2">My Notes</h1>
                    <p className="text-muted-foreground">Create, pin, and ask questions from your saved notes.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setAskMode(!askMode)}>
                        <Search className="w-4 h-4 mr-2" />
                        Ask My Notes
                    </Button>
                    <Button onClick={() => setShowNew(!showNew)} className="bg-primary">
                        <Plus className="w-4 h-4 mr-2" />
                        New Note
                    </Button>
                </div>
            </div>

            {/* Ask My Notes */}
            {askMode && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 p-6 rounded-2xl border border-primary/30 bg-primary/5">
                    <h3 className="font-semibold flex items-center gap-2 mb-4">
                        <Search className="w-4 h-4 text-primary" />
                        Ask My Notes — Retrieval-Based Q&A
                    </h3>
                    <div className="flex items-end gap-2 mb-3">
                        <Textarea
                            value={askQuestion}
                            onChange={e => setAskQuestion(e.target.value)}
                            placeholder="Ask a question about your notes..."
                            className="flex-1 resize-none min-h-[40px] max-h-24"
                        />
                        <Button onClick={handleAskNotes} disabled={asking || !askQuestion.trim()} className="bg-primary h-10">
                            {asking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        </Button>
                    </div>
                    <Button onClick={handleSummarize} disabled={asking || notes.length === 0} variant="outline" size="sm">
                        <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Summarize All My Notes
                    </Button>
                    {askAnswer && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 p-4 rounded-xl bg-muted/50">
                            <p className="text-sm whitespace-pre-wrap">{askAnswer.answer}</p>
                            {askAnswer.source_notes && askAnswer.source_notes.length > 0 && (
                                <p className="text-xs text-muted-foreground mt-2">Based on notes: {askAnswer.source_notes.map(i => i + 1).join(", ")}</p>
                            )}
                        </motion.div>
                    )}
                </motion.div>
            )}

            {/* New Note Form */}
            {showNew && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 p-6 rounded-2xl border border-border bg-card">
                    <input
                        value={newNote.title}
                        onChange={e => setNewNote({ ...newNote, title: e.target.value })}
                        placeholder="Note title..."
                        className="w-full bg-transparent text-lg font-medium mb-3 focus:outline-none"
                    />
                    <Textarea
                        value={newNote.content}
                        onChange={e => setNewNote({ ...newNote, content: e.target.value })}
                        placeholder="Write your note..."
                        className="min-h-[120px] resize-none"
                    />
                    <div className="flex justify-end gap-2 mt-3">
                        <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
                        <Button onClick={handleCreateNote} className="bg-primary">Save Note</Button>
                    </div>
                </motion.div>
            )}

            {/* Notes List */}
            {loading ? (
                <div className="flex items-center justify-center h-40">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            ) : notes.length === 0 ? (
                <div className="text-center py-16">
                    <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                        <StickyNote className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h2 className="text-xl font-semibold mb-2">No Notes Yet</h2>
                    <p className="text-muted-foreground mb-6">Create your first note to start building your knowledge base.</p>
                </div>
            ) : (
                <div className="grid md:grid-cols-2 gap-4">
                    {sortedNotes.map((note, i) => (
                        <motion.div
                            key={note.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className={cn("p-5 rounded-2xl border bg-card", note.pinned && "border-amber-500/30")}
                        >
                            <div className="flex items-start justify-between mb-2">
                                <h3 className="font-medium">{note.title}</h3>
                                <div className="flex gap-1">
                                    <button onClick={() => handleTogglePin(note)} className={cn("p-1.5 rounded-lg hover:bg-muted", note.pinned ? "text-amber-500" : "text-muted-foreground")}>
                                        <Pin className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={() => handleDeleteNote(note.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive">
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-4">{note.content}</p>
                            <div className="text-xs text-muted-foreground/60 mt-3">
                                {new Date(note.created_date).toLocaleDateString()}
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}
        </div>
    );
}