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
    od: "od-IN",
    pa: "pa-IN",
    ta: "ta-IN",
    te: "te-IN",
};

export function toSarvamLang(code) {
    return SARVAM_LANG_MAP[code] || "en-IN";
}

/**
 * Speech-to-Text: Send an audio Blob/File to Sarvam, get a transcript back.
 * @param {Blob|File} audioFile - recorded audio
 * @param {string} langCode - KYREN language code (e.g. "hi")
 * @returns {Promise<{transcript: string, language_code: string}>}
 */
export async function speechToText(audioFile, langCode = "en") {
    const formData = new FormData();
    formData.append("file", audioFile, "audio.webm");
    if (langCode && langCode !== "en") {
        formData.append("language_code", toSarvamLang(langCode));
    }

    const res = await kyren.functions.invoke("sarvam-stt", formData);
    return res.data;
}

/**
 * Text-to-Speech: Convert text to speech, return a playable audio Blob.
 * @param {string} text - the text to speak
 * @param {string} langCode - KYREN language code
 * @returns {Promise<Blob>} audio blob (wav)
 */
export async function textToSpeech(text, langCode = "en") {
    const res = await kyren.functions.invoke("sarvam-tts", {
        text,
        target_language_code: toSarvamLang(langCode),
    });
    const data = res.data;
    if (data?.audios?.[0]) {
        return base64ToBlob(data.audios[0], "audio/wav");
    }
    throw new Error(data?.error || "TTS returned no audio");
}

/**
 * Play TTS audio in the browser. Returns the Audio element.
 */
export async function speakText(text, langCode = "en") {
    const audioBlob = await textToSpeech(text, langCode);
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
    const res = await kyren.functions.invoke("sarvam-translate", {
        text,
        source_language_code: sourceLangCode === "auto" ? "auto" : toSarvamLang(sourceLangCode),
        target_language_code: toSarvamLang(targetLangCode),
    });
    const data = res.data;
    if (data?.translations?.[0]) {
        return data.translations[0];
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
