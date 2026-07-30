import { useState, useEffect } from "react";

// Module-level store so AppLayout and LessonDetail can share focus state
// without prop drilling or a context provider.
let focusMode = false;
const listeners = new Set();

export function setFocusMode(val) {
    focusMode = val;
    listeners.forEach((l) => l());
}

export function toggleFocusMode() {
    setFocusMode(!focusMode);
}

export function useFocusMode() {
    const [mode, setMode] = useState(focusMode);
    useEffect(() => {
        const listener = () => setMode(focusMode);
        listeners.add(listener);
        return () => listeners.delete(listener);
    }, []);
    return mode;
}