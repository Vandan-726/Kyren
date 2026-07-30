import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
    ChevronLeft, ChevronRight, CalendarDays, Clock,
    CheckCircle2, AlertCircle, BookOpen
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

function toYMD(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function parseTimeToMinutes(timeStr) {
    if (!timeStr) return 30;
    const match = timeStr.match(/(\d+)\s*(min|hour|hr)/i);
    if (!match) return 30;
    const val = parseInt(match[1], 10);
    return /hour|hr/i.test(match[2]) ? val * 60 : val;
}

export default function StudyCalendar({ learningTasks, masteryScores }) {
    const navigate = useNavigate();
    const today = new Date();
    const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
    const [selectedDate, setSelectedDate] = useState(toYMD(today));

    // Auto-schedule tasks and assessments across days
    const scheduledEvents = useMemo(() => {
        const events = {};
        const addEvent = (dateKey, event) => {
            if (!events[dateKey]) events[dateKey] = [];
            events[dateKey].push(event);
        };

        // Schedule active learning tasks — 1-2 per day by priority, starting today
        const activeTasks = learningTasks
            .filter(t => t.status !== "Completed" && t.status !== "Mastered")
            .sort((a, b) => (a.priority || 99) - (b.priority || 99));

        let dayOffset = 0;
        let dayMinutes = 0;
        const MAX_MINUTES_PER_DAY = 90;

        activeTasks.forEach((task) => {
            const minutes = parseTimeToMinutes(task.estimated_time);
            if (dayMinutes + minutes > MAX_MINUTES_PER_DAY && dayMinutes > 0) {
                dayOffset++;
                dayMinutes = 0;
            }
            const date = new Date(today);
            date.setDate(today.getDate() + dayOffset);
            const key = toYMD(date);
            addEvent(key, {
                type: "task",
                title: task.title,
                time: task.estimated_time || "30 min",
                difficulty: task.difficulty,
                status: task.status,
                onClick: () => navigate("/tasks"),
            });
            dayMinutes += minutes;
        });

        // Schedule mastery assessments — skills needing review or improving need quiz retakes
        const assessments = masteryScores.filter(
            (s) => s.status === "Needs Review" || (s.status === "Improving" && s.percentage < 80)
        );

        assessments.forEach((score, i) => {
            const date = new Date(today);
            date.setDate(today.getDate() + i + 1);
            const key = toYMD(date);
            addEvent(key, {
                type: "assessment",
                title: `${score.skill_name} Assessment`,
                time: "~20 min",
                status: score.status,
                percentage: score.percentage,
                onClick: () => navigate("/courses"),
            });
        });

        return events;
    }, [learningTasks, masteryScores, navigate, today]);

    const calendarDays = useMemo(() => {
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startWeekday = firstDay.getDay();
        const daysInMonth = lastDay.getDate();

        const cells = [];
        // Previous month padding
        const prevMonthDays = new Date(year, month, 0).getDate();
        for (let i = startWeekday - 1; i >= 0; i--) {
            cells.push({
                day: prevMonthDays - i,
                date: new Date(year, month - 1, prevMonthDays - i),
                isCurrentMonth: false,
            });
        }
        // Current month
        for (let d = 1; d <= daysInMonth; d++) {
            cells.push({
                day: d,
                date: new Date(year, month, d),
                isCurrentMonth: true,
            });
        }
        // Next month padding
        const remaining = 42 - cells.length;
        for (let d = 1; d <= remaining; d++) {
            cells.push({
                day: d,
                date: new Date(year, month + 1, d),
                isCurrentMonth: false,
            });
        }
        return cells;
    }, [viewDate]);

    const prevMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
    const nextMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
    const goToday = () => {
        setViewDate(new Date(today.getFullYear(), today.getMonth(), 1));
        setSelectedDate(toYMD(today));
    };

    const selectedEvents = scheduledEvents[selectedDate] || [];
    const todayKey = toYMD(today);

    const getEventColor = (event) => {
        if (event.type === "task") {
            return "bg-primary";
        }
        return "bg-amber-500";
    };

    const getEventTextColor = (event) => {
        if (event.type === "task") {
            return "text-primary";
        }
        return "text-amber-400";
    };

    return (
        <Card className="p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                    <CalendarDays className="w-5 h-5 text-primary" />
                    <h2 className="font-semibold">Study Calendar</h2>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-muted transition">
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button onClick={goToday} className="text-sm font-medium px-3 hover:text-primary transition">
                        {MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}
                    </button>
                    <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-muted transition">
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            </div>

            <div className="grid lg:grid-cols-5 gap-5">
                {/* Calendar Grid */}
                <div className="lg:col-span-3">
                    {/* Weekday headers */}
                    <div className="grid grid-cols-7 gap-1 mb-1">
                        {DAYS.map((d) => (
                            <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">
                                {d}
                            </div>
                        ))}
                    </div>
                    {/* Day cells */}
                    <div className="grid grid-cols-7 gap-1">
                        {calendarDays.map((cell, i) => {
                            const key = toYMD(cell.date);
                            const events = scheduledEvents[key] || [];
                            const isToday = key === todayKey;
                            const isSelected = key === selectedDate;
                            return (
                                <button
                                    key={i}
                                    onClick={() => setSelectedDate(key)}
                                    className={cn(
                                        "min-h-[60px] sm:min-h-[72px] p-1.5 rounded-lg border text-left transition relative flex flex-col",
                                        cell.isCurrentMonth ? "border-border" : "border-transparent opacity-40",
                                        isSelected ? "ring-2 ring-primary bg-primary/5" : "hover:bg-muted/50",
                                        isToday && !isSelected && "border-primary/50 bg-primary/5"
                                    )}
                                >
                                    <span className={cn(
                                        "text-xs font-medium",
                                        isToday ? "text-primary" : "text-foreground"
                                    )}>
                                        {cell.day}
                                    </span>
                                    <div className="flex-1 mt-1 space-y-0.5 overflow-hidden">
                                        {events.slice(0, 2).map((event, j) => (
                                            <div
                                                key={j}
                                                className={cn(
                                                    "text-[10px] leading-tight px-1 py-0.5 rounded truncate",
                                                    event.type === "task" ? "bg-primary/15 text-primary" : "bg-amber-500/15 text-amber-400"
                                                )}
                                            >
                                                {event.title}
                                            </div>
                                        ))}
                                        {events.length > 2 && (
                                            <div className="text-[10px] text-muted-foreground px-1">
                                                +{events.length - 2} more
                                            </div>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Selected Day Detail */}
                <div className="lg:col-span-2 border-l border-border pl-5 lg:min-h-[300px]">
                    <h3 className="text-sm font-semibold mb-3">
                        {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", {
                            weekday: "long", month: "short", day: "numeric"
                        })}
                    </h3>
                    <AnimatePresence mode="wait">
                        {selectedEvents.length > 0 ? (
                            <motion.div
                                key={selectedDate}
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                className="space-y-2"
                            >
                                {selectedEvents.map((event, i) => (
                                    <div
                                        key={i}
                                        onClick={event.onClick}
                                        className="p-3 rounded-xl border border-border hover:bg-muted/50 transition cursor-pointer group"
                                    >
                                        <div className="flex items-start gap-2">
                                            <div className={cn("w-2 h-2 rounded-full mt-1.5 shrink-0", getEventColor(event))} />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    {event.type === "task" ? (
                                                        <BookOpen className="w-3 h-3 text-primary shrink-0" />
                                                    ) : (
                                                        <AlertCircle className="w-3 h-3 text-amber-400 shrink-0" />
                                                    )}
                                                    <span className="text-sm font-medium truncate">{event.title}</span>
                                                </div>
                                                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="w-3 h-3" /> {event.time}
                                                    </span>
                                                    {event.type === "assessment" && (
                                                        <span className={getEventTextColor(event)}>
                                                            {event.percentage}% → retake
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                <div className="pt-2 text-xs text-muted-foreground flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    Total: {selectedEvents.reduce((sum, e) => sum + parseTimeToMinutes(e.time), 0)} min study time
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div
                                key={selectedDate + "-empty"}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="flex flex-col items-center justify-center h-32 text-center"
                            >
                                <CheckCircle2 className="w-8 h-8 text-muted-foreground/30 mb-2" />
                                <p className="text-sm text-muted-foreground">Nothing scheduled</p>
                                <p className="text-xs text-muted-foreground/60">Enjoy a break or add tasks!</p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Learning Task
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Mastery Assessment
                </span>
            </div>
        </Card>
    );
}