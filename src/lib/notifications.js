import { kyren } from "@/api/kyrenClient";

/**
 * Creates a real Notification record for a user.
 * Used across the app to fire in-app notifications for adaptive events.
 */
export async function createNotification(userId, type, title, message, payload = {}) {
    if (!userId) return null;
    try {
        return await kyren.entities.Notification.create({
            user_id: userId,
            type,
            title,
            message,
            payload: JSON.stringify(payload),
        });
    } catch (e) {
        console.error("Failed to create notification:", e);
        return null;
    }
}

export const NOTIFICATION_ICONS = {
    gap_detected: "Brain",
    task_reordered: "Network",
    micro_module_ready: "Sparkles",
    weekly_insight: "TrendingUp",
    teacher_assignment: "ClipboardList",
    streak_risk: "Flame",
    usage_limit: "Zap",
    parent_digest: "Mail",
    peer_answer: "Users",
};

export const NOTIFICATION_LABELS = {
    gap_detected: "Gap Detected",
    task_reordered: "Roadmap Updated",
    micro_module_ready: "Micro-Module Ready",
    weekly_insight: "Weekly Insight",
    teacher_assignment: "New Assignment",
    streak_risk: "Streak at Risk",
    usage_limit: "Usage Limit",
    parent_digest: "Parent Digest",
    peer_answer: "Peer Answer",
};
