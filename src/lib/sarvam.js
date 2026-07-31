import { kyren } from "@/api/kyrenClient";

// KYREN language code → Sarvam BCP-47 language code
const SARVAM_LANG_MAP = {
    en: "en-IN",
    hi: "hi-IN",
    bn: "bn-IN",
    gu: "gu-IN",
    kn: "kn-IN",
    ml: "ml-IN",
    mr: "mr-IN",
    or: "od-IN",
    od: "od-IN",
    pa: "pa-IN",
    ta: "ta-IN",
    te: "te-IN",
    as: "as-IN",
};

export function toSarvamLang(code) {
    return SARVAM_LANG_MAP[code] || "en-IN";
}

/**
 * Check if voice service is configured on backend.
 */
export async function getVoiceStatus() {
    try {
        const res = await kyren.request("/voice/status", { method: "GET" });
        return res?.configured ?? false;
    } catch {
        return false;
    }
}

/**
 * Speech-to-Text: Send an audio Blob/File to Sarvam via Express server.
 * @param {Blob|File} audioFile - recorded audio
 * @param {string} langCode - KYREN language code (e.g. "hi")
 * @returns {Promise<{transcript: string, language_code: string}>}
 */
export async function speechToText(audioFile, langCode = "en") {
    const formData = new FormData();
    formData.append("audio", audioFile, "audio.webm");
    if (langCode) {
        formData.append("language", langCode);
    }

    const data = await kyren.requestFormData("/voice/transcribe", formData);
    return data;
}

/**
 * Text-to-Speech: Convert text to speech via Express server, return a playable audio Blob.
 * @param {string} text - the text to speak
 * @param {string} langCode - KYREN language code
 * @param {string} [speaker] - optional speaker voice
 * @returns {Promise<Blob>} audio blob (wav)
 */
export async function textToSpeech(text, langCode = "en", speaker) {
    const data = await kyren.request("/voice/speak", {
        method: "POST",
        body: JSON.stringify({
            text,
            language: langCode === "od" ? "or" : langCode,
            speaker,
        }),
    });

    if (data?.audio) {
        return base64ToBlob(data.audio, data.mimeType || "audio/wav");
    }
    throw new Error(data?.error || "TTS returned no audio");
}

/**
 * Play TTS audio in the browser. Returns the HTML5 Audio element.
 */
export async function speakText(text, langCode = "en", speaker) {
    const audioBlob = await textToSpeech(text, langCode, speaker);
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    audio.onended = () => URL.revokeObjectURL(audioUrl);
    await audio.play();
    return audio;
}

/**
 * Translation: Translate text between languages via Sarvam.
 * @returns {Promise<string>} translated text
 */
export async function translateText(
    text,
    targetLangCode = "en",
    sourceLangCode = "auto"
) {
    const data = await kyren.request("/voice/translate", {
        method: "POST",
        body: JSON.stringify({
            text,
            targetLanguage: targetLangCode === "od" ? "or" : targetLangCode,
            sourceLanguage: sourceLangCode === "od" ? "or" : sourceLangCode,
        }),
    });

    if (data?.translation) {
        return data.translation;
    }
    throw new Error(data?.error || "Translation returned no result");
}

// --- Helpers ---

function base64ToBlob(base64, mimeType) {
    const byteCharacters = atob(base64);
    const byteArrays = [];
    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
        const slice = byteCharacters.slice(offset, offset + 512);
        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
            byteNumbers[i] = slice.charCodeAt(i);
        }
        byteArrays.push(new Uint8Array(byteNumbers));
    }
    return new Blob(byteArrays, { type: mimeType });
}
