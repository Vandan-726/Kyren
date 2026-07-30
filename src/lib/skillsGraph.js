// KYREN Skills Graph — defines the prerequisite chain used for adaptive learning.
// The DSA chain: Variables → Conditions → Loops → Functions → Arrays → Pointers → C++ → OOP → DSA
//
// This graph is consumed in three places: the frontend (rendering the
// prerequisite tree), the AI agents (grounding gap detection and path planning),
// and the `skills` table seed. It therefore lives in server/lib as the single
// canonical copy and is re-exported here, so the browser and the server can
// never disagree about what depends on what.
//
// It is pure data plus pure functions with no dependencies, so pulling it into
// the client bundle is safe.
export * from "../../server/lib/skillsGraph.js"
