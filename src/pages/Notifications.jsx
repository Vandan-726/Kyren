import React, { useState, useEffect } from "react";
import { kyren } from "@/api/kyrenClient";
import { useAuth } from "@/lib/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, Brain, Network, Sparkles, TrendingUp, ClipboardList, Flame, Zap, Mail, Users, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

const ICON_MAP = {
    gap_detected: Brain,
    task_reordered: Network,
    micro_module_ready: Sparkles,
    weekly_insight: TrendingUp,
    teacher_assignment: ClipboardList,
    streak_risk: Flame,
    usage_limit: Zap,
    parent_digest: Mail,
    peer_answer: Users,
};

const TYPE_FILTERS = [
    { value: "all", label: "All" },
    { value: "gap_detected", label: "Gaps" },
    { value: "teacher_assignment", label: "Assignments" },
    { value: "weekly_insight", label: "Insights" },
    { value: "streak_risk", label: "Streaks" },
];

export default function Notifications() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("all");

    const fetchAll = async () => {
        if (!user?.id) return;
        setLoading(true);
        try {
            const notifs = await kyren.entities.Notification.filter(
                { user_id: user.id },
                "-created_date",
                100
            );
            setNotifications(notifs);
        } catch (e) {
            /* silent */
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchAll();
    }, [user?.id]);

    const markAllRead = async () => {
        try {
            const unread = notifications.filter((n) => !n.read);
            await kyren.entities.Notification.bulkUpdate(
                unread.map((n) => ({ id: n.id, read: true }))
            );
            fetchAll();
        } catch (e) {
            /* silent */
        }
    };

    const toggleRead = async (notif) => {
        try {
            await kyren.entities.Notification.update(notif.id, { read: !notif.read });
            fetchAll();
        } catch (e) {
            /* silent */
        }
    };

    const handleNotificationClick = (n) => {
        if (!n.read) toggleRead(n);
        try {
            const payload = typeof n.payload === "string" ? JSON.parse(n.payload) : n.payload;
            if (payload?.route) {
                navigate(payload.route);
            }
        } catch (e) {
            console.error("Failed to parse notification payload", e);
        }
    };

    const filtered = filter === "all" ? notifications : notifications.filter((n) => n.type === filter);
    const unreadCount = notifications.filter((n) => !n.read).length;

    return (
        <div className="p-6 lg:p-10 max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
                <div>
                    <span className="mono-label text-primary">// Notifications</span>
                    <h1 className="text-3xl font-heading font-semibold mt-2">
                        Your <span className="font-display italic">notifications</span>
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {unreadCount} unread of {notifications.length} total
                    </p>
                </div>
                {unreadCount > 0 && (
                    <Button variant="outline" onClick={markAllRead} className="gap-2">
                        <Check className="w-4 h-4" />
                        Mark all read
                    </Button>
                )}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-2 mb-6">
                {TYPE_FILTERS.map((f) => (
                    <button
                        key={f.value}
                        onClick={() => setFilter(f.value)}
                        className={cn(
                            "px-4 py-2 rounded-full text-sm font-medium transition",
                            filter === f.value
                                ? "glass-nav text-foreground border-primary/30"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                        )}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {/* List */}
            <div className="space-y-3">
                {loading ? (
                    <Card className="p-8 text-center text-muted-foreground">Loading…</Card>
                ) : filtered.length === 0 ? (
                    <Card className="p-12 text-center">
                        <Bell className="w-10 h-10 text-muted-foreground/30 mx-auto mb-4" />
                        <p className="text-muted-foreground">No notifications in this category.</p>
                    </Card>
                ) : (
                    filtered.map((n) => {
                        const Icon = ICON_MAP[n.type] || Bell;
                        return (
                            <Card
                                key={n.id}
                                className={cn("p-4 cursor-pointer hover:border-primary/20 transition", !n.read && "border-primary/20")}
                                onClick={() => handleNotificationClick(n)}
                            >
                                <div className="flex gap-4">
                                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", !n.read ? "bg-primary/10" : "bg-muted/30")}>
                                        <Icon className={cn("w-5 h-5", !n.read ? "text-primary" : "text-muted-foreground")} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-medium">{n.title}</span>
                                            {!n.read && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                                        </div>
                                        <p className="text-sm text-muted-foreground leading-relaxed">{n.message}</p>
                                        <span className="mono-label text-muted-foreground/50 mt-2 block">
                                            {new Date(n.created_date).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                                        </span>
                                    </div>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); toggleRead(n); }}
                                        className="text-xs text-muted-foreground hover:text-foreground transition shrink-0"
                                    >
                                        {n.read ? "Mark unread" : "Mark read"}
                                    </button>
                                </div>
                            </Card>
                        );
                    })
                )}
            </div>
        </div>
    );
}