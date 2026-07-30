import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { kyren } from "@/api/kyrenClient";
import { useAuth } from "@/lib/AuthContext";
import { Bell, Brain, Network, Sparkles, TrendingUp, ClipboardList, Flame, Zap, Mail, Users } from "lucide-react";
import { cn } from "@/lib/utils";

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

export default function NotificationBell() {
    const { user } = useAuth();
    const [open, setOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const ref = useRef(null);

    const fetchNotifications = async () => {
        if (!user?.id) return;
        setLoading(true);
        try {
            const notifs = await kyren.entities.Notification.filter(
                { user_id: user.id },
                "-created_date",
                10
            );
            setNotifications(notifs);
            setUnreadCount(notifs.filter((n) => !n.read).length);
        } catch (e) {
            /* silent */
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 30000);
        return () => clearInterval(interval);
    }, [user?.id]);

    useEffect(() => {
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const markAllRead = async () => {
        try {
            const unread = notifications.filter((n) => !n.read);
            await kyren.entities.Notification.bulkUpdate(
                unread.map((n) => ({ id: n.id, read: true }))
            );
            fetchNotifications();
        } catch (e) {
            /* silent */
        }
    };

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => {
                    setOpen(!open);
                    if (!open) fetchNotifications();
                }}
                className="relative p-2 rounded-full glass-nav hover:border-primary/30 transition"
            >
                <Bell className="w-5 h-5 text-muted-foreground" />
                {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center shadow-[0_0_8px_rgba(227,74,50,0.5)]">
                        {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 top-full mt-2 w-80 max-h-[480px] glass-card rounded-2xl overflow-hidden z-50 flex flex-col">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                        <span className="font-heading font-semibold text-sm">Notifications</span>
                        {unreadCount > 0 && (
                            <button
                                onClick={markAllRead}
                                className="text-xs text-primary hover:text-primary transition"
                            >
                                Mark all read
                            </button>
                        )}
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {loading ? (
                            <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
                        ) : notifications.length === 0 ? (
                            <div className="p-8 text-center">
                                <Bell className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                                <p className="text-sm text-muted-foreground">No notifications yet</p>
                            </div>
                        ) : (
                            notifications.map((n) => {
                                const Icon = ICON_MAP[n.type] || Bell;
                                return (
                                    <div
                                        key={n.id}
                                        className={cn(
                                            "px-4 py-3 border-b border-border hover:bg-muted/20 transition cursor-pointer",
                                            !n.read && "bg-primary/5"
                                        )}
                                    >
                                        <div className="flex gap-3">
                                            <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center shrink-0", !n.read ? "bg-primary/10" : "bg-muted/30")}>
                                                <Icon className={cn("w-4 h-4", !n.read ? "text-primary" : "text-muted-foreground")} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-medium truncate">{n.title}</span>
                                                    {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                                                </div>
                                                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.message}</p>
                                                <span className="mono-label text-muted-foreground/50 mt-1 block">
                                                    {new Date(n.created_date).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                    <Link
                        to="/notifications"
                        onClick={() => setOpen(false)}
                        className="px-4 py-3 text-center text-sm text-primary hover:text-primary hover:bg-muted/20 transition border-t border-border"
                    >
                        View all notifications
                    </Link>
                </div>
            )}
        </div>
    );
}
