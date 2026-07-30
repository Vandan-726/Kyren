import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { kyren } from "@/api/kyrenClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import {
    BookOpen, ChevronRight, CheckCircle2, Circle,
    Layers, Clock, Target, ArrowLeft, Sparkles
} from "lucide-react";

export default function CourseDetail() {
    const { courseId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [course, setCourse] = useState(null);
    const [modules, setModules] = useState([]);
    const [lessons, setLessons] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadCourseData();
    }, [courseId]);

    const loadCourseData = async () => {
        try {
            setLoading(true);
            const courseData = await kyren.entities.Course.get(courseId);
            setCourse(courseData);
            const moduleData = await kyren.entities.Module.filter({ course_id: courseId }, "order_index");
            setModules(moduleData);
            const allLessons = [];
            for (const mod of moduleData) {
                const modLessons = await kyren.entities.Lesson.filter({ module_id: mod.id }, "order_index");
                allLessons.push(...modLessons);
            }
            setLessons(allLessons);
        } catch (e) {
            console.error("Failed to load course", e);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
            </div>
        );
    }

    if (!course) {
        return <div className="p-8 text-center text-muted-foreground">Course not found.</div>;
    }

    const completedLessons = lessons.filter(l => l.completed).length;
    const totalLessons = lessons.length;
    const progress = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

    const firstIncompleteLesson = lessons.find(l => !l.completed);

    return (
        <div className="p-6 md:p-8 max-w-5xl mx-auto">
            <button onClick={() => navigate("/courses")} className="text-sm text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1">
                <ArrowLeft className="w-4 h-4" /> Back to Courses
            </button>

            {/* Course Header */}
            <div className="mb-8">
                <div className="flex items-start gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
                        <BookOpen className="w-8 h-8 text-primary" />
                    </div>
                    <div className="flex-1">
                        <h1 className="text-2xl md:text-3xl font-bold mb-2">{course.title}</h1>
                        <p className="text-muted-foreground">{course.description}</p>
                        <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {course.estimated_duration || "Self-paced"}</span>
                            <span>·</span>
                            <span className="capitalize">{course.difficulty}</span>
                            <span>·</span>
                            <span>{completedLessons}/{totalLessons} lessons</span>
                        </div>
                    </div>
                </div>

                {/* Progress bar */}
                <div className="mt-6">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Course Progress</span>
                        <span className="text-sm text-muted-foreground">{progress}%</span>
                    </div>
                    <div className="h-3 bg-muted rounded-full overflow-hidden">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ duration: 0.8 }}
                            className="h-full rounded-full bg-primary"
                        />
                    </div>
                </div>

                {/* Learning objectives */}
                {course.learning_objectives && course.learning_objectives.length > 0 && (
                    <div className="mt-6 p-4 rounded-2xl border border-border bg-muted/30">
                        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                            <Target className="w-4 h-4 text-primary" />
                            Learning Objectives
                        </h3>
                        <ul className="space-y-2">
                            {course.learning_objectives.map((obj, i) => (
                                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                                    <span className="text-primary mt-0.5">•</span> {obj}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {firstIncompleteLesson && (
                    <Button
                        onClick={() => navigate(`/courses/${courseId}/lessons/${firstIncompleteLesson.id}`)}
                        className="mt-6 bg-primary"
                    >
                        <Sparkles className="w-4 h-4 mr-2" />
                        Continue Learning
                    </Button>
                )}
            </div>

            {/* Modules and Lessons */}
            <div className="space-y-6">
                {modules.map((mod, mi) => {
                    const modLessons = lessons.filter(l => l.module_id === mod.id);
                    const modCompleted = modLessons.filter(l => l.completed).length;
                    return (
                        <motion.div
                            key={mod.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: mi * 0.1 }}
                        >
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="font-semibold flex items-center gap-2">
                                    <Layers className="w-4 h-4 text-primary" />
                                    Module {mi + 1}: {mod.title}
                                </h2>
                                <span className="text-xs text-muted-foreground">{modCompleted}/{modLessons.length} complete</span>
                            </div>
                            <p className="text-sm text-muted-foreground mb-4">{mod.objective}</p>
                            <div className="space-y-2">
                                {modLessons.map((lesson, li) => (
                                    <div
                                        key={lesson.id}
                                        onClick={() => navigate(`/courses/${courseId}/lessons/${lesson.id}`)}
                                        className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:bg-muted/30 cursor-pointer transition group"
                                    >
                                        {lesson.completed ? (
                                            <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                                        ) : (
                                            <Circle className="w-5 h-5 text-muted-foreground shrink-0" />
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-sm">{lesson.title}</div>
                                            <div className="text-xs text-muted-foreground truncate">{lesson.description}</div>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition shrink-0" />
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
