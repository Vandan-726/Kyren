/**
 * SM-2 Spaced Repetition Algorithm
 * (SuperMemo 2 — standard algorithm for flashcard scheduling)
 *
 * Quality scale: 0-5
 *   0-2: complete fail — reset repetitions, show again soon
 *   3: barely passed — don't advance interval
 *   4: correct — advance normally
 *   5: perfect — advance with bonus
 *
 * Returns: { next_review_date, ease_factor, interval_days, repetitions }
 */

export function sm2(review, quality) {
    let { ease_factor = 2.5, interval_days = 1, repetitions = 0 } = review || {};

    if (quality < 3) {
        // Failed — start over
        repetitions = 0;
        interval_days = 1;
    } else {
        // Passed — advance
        if (repetitions === 0) {
            interval_days = 1;
        } else if (repetitions === 1) {
            interval_days = 3;
        } else {
            interval_days = Math.round(interval_days * ease_factor);
        }
        repetitions += 1;
    }

    // Update ease factor (never below 1.3)
    ease_factor = ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    if (ease_factor < 1.3) ease_factor = 1.3;

    // Compute next review date
    const next = new Date();
    next.setDate(next.getDate() + interval_days);
    const next_review_date = next.toISOString().split("T")[0]; // YYYY-MM-DD

    return {
        next_review_date,
        ease_factor: Math.round(ease_factor * 100) / 100,
        interval_days,
        repetitions,
        last_reviewed: new Date().toISOString(),
    };
}

/**
 * Get all flashcards due for review today or earlier.
 */
export function getDueReviews(reviews) {
    const today = new Date().toISOString().split("T")[0];
    return reviews.filter((r) => r.next_review_date <= today);
}

/**
 * Map a quiz score (0-100) to an SM-2 quality rating (0-5) and compute
 * the next review schedule for a skill. Accepts an existing MasteryScore
 * record (to continue the interval/ease chain) or null for the first review.
 *
 * Quality mapping:
 *   <30 → 0 (blackout)   <50 → 2 (fail)   <70 → 3 (barely)
 *   <90 → 4 (good)       ≥90 → 5 (perfect)
 *
 * Returns the same shape as sm2(): { next_review_date, ease_factor, interval_days, repetitions, last_reviewed }
 */
export function scheduleSkillReview(masteryScore, quizScore) {
    let quality;
    if (quizScore < 30) quality = 0;
    else if (quizScore < 50) quality = 2;
    else if (quizScore < 70) quality = 3;
    else if (quizScore < 90) quality = 4;
    else quality = 5;

    return sm2(
        {
            ease_factor: masteryScore?.ease_factor,
            interval_days: masteryScore?.interval_days,
            repetitions: masteryScore?.repetitions,
        },
        quality
    );
}

/**
 * Batch-generate flashcards from a lesson's key_concepts using the LLM.
 * Returns an array of { concept, front, back } objects.
 */
export async function generateFlashcardsForLesson(lesson, callLLM) {
    if (!lesson?.key_concepts || lesson.key_concepts.length === 0) return [];

    const prompt = `Create flashcards for the following lesson's key concepts.
Lesson: ${lesson.title}
Description: ${lesson.description || ""}
Key Concepts: ${lesson.key_concepts.join(", ")}

For each key concept, create a flashcard with:
- "concept": the concept name
- "front": a concise question or prompt
- "back": a clear, student-friendly answer (2-3 sentences)

Return a JSON object: { "flashcards": [{ "concept": "...", "front": "...", "back": "..." }] }
Create one flashcard per key concept.`;

    try {
        const result = await callLLM(prompt, {
            response_json_schema: {
                type: "object",
                properties: {
                    flashcards: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                concept: { type: "string" },
                                front: { type: "string" },
                                back: { type: "string" },
                            },
                        },
                    },
                },
            },
        });
        return result?.flashcards || [];
    } catch (e) {
        console.error("Flashcard generation failed:", e);
        return [];
    }
}