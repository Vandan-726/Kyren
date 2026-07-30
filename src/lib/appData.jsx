import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { kyren } from "@/api/kyrenClient";
import { useAuth } from "@/lib/AuthContext";

const AppDataContext = createContext();

export const AppDataProvider = ({ children }) => {
    const { user } = useAuth();
    const [masteryScores, setMasteryScores] = useState([]);
    const [learningTasks, setLearningTasks] = useState([]);
    const [activityLogs, setActivityLogs] = useState([]);
    const [learningGaps, setLearningGaps] = useState([]);
    const [courses, setCourses] = useState([]);
    const [recommendations, setRecommendations] = useState([]);
    const [loading, setLoading] = useState(true);

    const userId = user?.id;

    const refreshMastery = useCallback(async () => {
        if (!userId) return;
        try {
            const scores = await kyren.entities.MasteryScore.filter({ user_id: userId });
            setMasteryScores(scores);
        } catch (e) { /* silent */ }
    }, [userId]);

    const refreshTasks = useCallback(async () => {
        if (!userId) return;
        try {
            const tasks = await kyren.entities.LearningTask.filter({ user_id: userId }, "priority");
            setLearningTasks(tasks);
        } catch (e) { /* silent */ }
    }, [userId]);

    const refreshLogs = useCallback(async () => {
        if (!userId) return;
        try {
            const logs = await kyren.entities.TaskActivityLog.filter({ user_id: userId }, "-created_date", 50);
            setActivityLogs(logs);
        } catch (e) { /* silent */ }
    }, [userId]);

    const refreshGaps = useCallback(async () => {
        if (!userId) return;
        try {
            const gaps = await kyren.entities.LearningGap.filter({ user_id: userId });
            setLearningGaps(gaps);
        } catch (e) { /* silent */ }
    }, [userId]);

    const refreshCourses = useCallback(async () => {
        if (!userId) return;
        try {
            const crs = await kyren.entities.Course.filter({ user_id: userId }, "-created_date");
            setCourses(crs);
        } catch (e) { /* silent */ }
    }, [userId]);

    const refreshRecommendations = useCallback(async () => {
        if (!userId) return;
        try {
            const recs = await kyren.entities.Recommendation.filter({ user_id: userId }, "-created_date");
            setRecommendations(recs);
        } catch (e) { /* silent */ }
    }, [userId]);

    const refreshAll = useCallback(async () => {
        setLoading(true);
        await Promise.all([refreshMastery(), refreshTasks(), refreshLogs(), refreshGaps(), refreshCourses(), refreshRecommendations()]);
        setLoading(false);
    }, [refreshMastery, refreshTasks, refreshLogs, refreshGaps, refreshCourses, refreshRecommendations]);

    useEffect(() => {
        if (userId) {
            refreshAll();
        } else {
            setLoading(false);
        }
    }, [userId, refreshAll]);

    useEffect(() => {
        if (!userId) return;
        const unsub = kyren.entities.LearningTask.subscribe(() => {
            refreshTasks();
            refreshLogs();
        });
        return unsub;
    }, [userId, refreshTasks, refreshLogs]);

    return (
        <AppDataContext.Provider
            value={{
                masteryScores, refreshMastery,
                learningTasks, refreshTasks, setLearningTasks,
                activityLogs, refreshLogs,
                learningGaps, refreshGaps,
                courses, refreshCourses,
                recommendations, refreshRecommendations,
                loading, refreshAll,
            }}
        >
            {children}
        </AppDataContext.Provider>
    );
};

export const useAppData = () => {
    const context = useContext(AppDataContext);
    if (!context) {
        return {
            masteryScores: [], learningTasks: [], activityLogs: [], learningGaps: [],
            courses: [], recommendations: [], loading: false,
            refreshAll: async () => { }, refreshMastery: async () => { }, refreshTasks: async () => { },
            refreshLogs: async () => { }, refreshGaps: async () => { }, refreshCourses: async () => { },
            refreshRecommendations: async () => { }, setLearningTasks: () => { },
        };
    }
    return context;
};
