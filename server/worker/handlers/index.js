/**
 * Handler barrel.
 *
 * Importing this module registers every job handler with the registry. The
 * runner imports it for that side effect only.
 */
import "./courseGeneration.js"
import "./roadmapGeneration.js"
import "./quizGeneration.js"
import "./courseContentHandler.js"

export {}
