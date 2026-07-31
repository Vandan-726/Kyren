import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";
import { useAppData } from "@/lib/appData";
import { kyren } from "@/api/kyrenClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BookOpen, Sparkles, Clock, ChevronRight, Layers, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function Courses() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { courses, refreshCourses } = useAppData();

    // Deduplicate courses by title to prevent duplicate cards
    const uniqueCourses = useMemo(() => {
        const seen = new Set();
        const list = [];
        for (const course of courses) {
            const key = (course.title || "").trim().toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                list.push(course);
            }
        }
        return list;
    }, [courses]);

    const handleDeleteCourse = async (e, courseId, title) => {
        e.stopPropagation();
        try {
            await kyren.entities.Course.delete(courseId);
            toast.success(`Deleted "${title}"`);
            if (refreshCourses) await refreshCourses();
        } catch (err) {
            toast.error("Failed to delete course");
        }
    };

    const getProgressColor = (progress) => {
        if (progress >= 80) return "bg-green-500";
        if (progress >= 50) return "bg-primary";
        if (progress > 0) return "bg-amber-500";
        return "bg-muted";
    };

    return (
        <div className="p-6 md:p-8 max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold mb-2">My Courses</h1>
                    <p className="text-muted-foreground">Personalized courses generated from your learning path.</p>
                </div>
                <Button onClick={() => navigate("/companion")} className="bg-primary">
                    <Sparkles className="w-4 h-4 mr-2" />
                    New Course
                </Button>
            </div>

            {uniqueCourses.length === 0 ? (
                <div className="text-center py-16">
                    <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                        <BookOpen className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h2 className="text-xl font-semibold mb-2">No Courses Yet</h2>
                    <p className="text-muted-foreground mb-6">Talk to KYREN to generate your first personalized course.</p>
                    <Button onClick={() => navigate("/companion")} className="bg-primary">
                        <Sparkles className="w-4 h-4 mr-2" />
                        Talk to KYREN
                    </Button>
                </div>
            ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {uniqueCourses.map((course, i) => (
                        <motion.div
                            key={course.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.1 }}
                        >
                            <Card
                                className="p-5 cursor-pointer hover:shadow-lg transition group relative"
                                onClick={() => navigate(`/courses/${course.id}`)}
                            >
                                <div className="flex items-center justify-between mb-4">
                                    <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center">
                                        <Layers className="w-6 h-6 text-primary" />
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-muted-foreground hover:text-red-500 transition opacity-70 group-hover:opacity-100"
                                        onClick={(e) => handleDeleteCourse(e, course.id, course.title)}
                                        title="Delete Course"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                                <h3 className="font-semibold mb-1 group-hover:text-primary transition">{course.title}</h3>
                                <p className="text-sm text-muted-foreground line-clamp-2 mb-4">{course.description}</p>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {course.estimated_duration || "Self-paced"}</span>
                                    <span>·</span>
                                    <span className="capitalize">{course.difficulty}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                        <div className={cn("h-full rounded-full transition-all", getProgressColor(course.progress || 0))} style={{ width: `${course.progress || 0}%` }} />
                                    </div>
                                    <span className="text-xs text-muted-foreground">{course.progress || 0}%</span>
                                </div>
                                <div className="mt-4 flex items-center justify-end text-sm text-primary group-hover:gap-2 transition-all gap-1">
                                    Open Course <ChevronRight className="w-4 h-4" />
                                </div>
                            </Card>
                        </motion.div>
                    ))}
                </div>
            )}
        </div>
    );
}