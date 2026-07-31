import { kyren } from "@/api/kyrenClient";

/**
 * Invokes the specified AI agent in the backend.
 */
async function callBackendAgent(agentName, args = {}) {
    const token = kyren.getAuthToken();
    const headers = {};
    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }
    return await kyren.request(`/agents/${agentName}`, {
        method: "POST",
        headers,
        body: JSON.stringify(args),
    });
}

export async function detectLearningGaps(args) {
    return callBackendAgent("detectLearningGaps", args);
}

export async function planLearningTasks(args) {
    return callBackendAgent("planLearningTasks", args);
}

export async function architectCourse(args) {
    return callBackendAgent("architectCourse", args);
}

export async function generateLessonContent(args) {
    return callBackendAgent("generateLessonContent", args);
}

export async function generateVideoSuggestions(args) {
    return callBackendAgent("generateVideoSuggestions", args);
}

export async function generateQuiz(args) {
    return callBackendAgent("generateQuiz", args);
}

export async function generateSkillCheckIn(args) {
    return callBackendAgent("generateSkillCheckIn", args);
}

export async function tutorRespond(args) {
    return callBackendAgent("tutorRespond", args);
}

export async function recommendNextSkill(args) {
    return callBackendAgent("recommendNextSkill", args);
}

export async function generateAnalyticsInsights(args) {
    return callBackendAgent("generateAnalyticsInsights", args);
}

export async function solveDoubt(args) {
    return callBackendAgent("solveDoubt", args);
}

export async function generateMicroModule(args) {
    return callBackendAgent("generateMicroModule", args);
}

export async function simulatePath(args) {
    return callBackendAgent("simulatePath", args);
}

export async function askMyNotes(args) {
    return callBackendAgent("askMyNotes", args);
}

export async function generateNotesFromLesson(args) {
    return callBackendAgent("generateNotesFromLesson", args);
}

export async function summarizeNotes(args) {
    return callBackendAgent("summarizeNotes", args);
}

export async function generateFlashcards(args) {
    return callBackendAgent("generateFlashcards", args);
}
