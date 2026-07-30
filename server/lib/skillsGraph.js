// KYREN Skills Graph — defines the prerequisite chain used for adaptive learning
// The DSA chain: Variables → Conditions → Loops → Functions → Arrays → Pointers → C++ → OOP → DSA

export const SKILLS_GRAPH = [
    { id: "prog_fundamentals", name: "Programming Fundamentals", subject_area: "CS Basics", difficulty: "beginner", description: "Core concepts: what is a program, compilation, execution flow." },
    { id: "variables", name: "Variables", subject_area: "C Fundamentals", difficulty: "beginner", description: "Declaring, initializing, and using variables in C — int, float, char, etc." },
    { id: "conditions", name: "Conditions", subject_area: "C Fundamentals", difficulty: "beginner", description: "if, else if, else, switch — decision making in code." },
    { id: "loops", name: "Loops", subject_area: "C Fundamentals", difficulty: "beginner", description: "for, while, do-while — repeating operations efficiently." },
    { id: "functions", name: "Functions", subject_area: "C Fundamentals", difficulty: "beginner", description: "Defining functions, parameters, return values, scope, recursion." },
    { id: "arrays", name: "Arrays", subject_area: "C Fundamentals", difficulty: "beginner", description: "1D and 2D arrays, indexing, iteration, memory layout." },
    { id: "pointers", name: "Pointers", subject_area: "C Fundamentals", difficulty: "intermediate", description: "Memory addresses, pointer arithmetic, pointers and arrays." },
    { id: "cpp_basics", name: "C++ Basics", subject_area: "C++", difficulty: "intermediate", description: "Transitioning from C to C++ — namespaces, references, templates intro." },
    { id: "oop", name: "Object-Oriented Programming", subject_area: "C++", difficulty: "intermediate", description: "Classes, objects, inheritance, polymorphism, encapsulation." },
    { id: "dsa", name: "Data Structures & Algorithms", subject_area: "DSA", difficulty: "advanced", description: "Arrays, linked lists, trees, graphs, sorting, searching, complexity analysis." },
    { id: "python_basics", name: "Python Basics", subject_area: "Python", difficulty: "beginner", description: "Variables, loops, functions, lists in Python." },
    { id: "data_analysis", name: "Data Analysis", subject_area: "Data Science", difficulty: "intermediate", description: "Pandas, NumPy, data cleaning, visualization." },
    { id: "machine_learning", name: "Machine Learning Fundamentals", subject_area: "AI/ML", difficulty: "advanced", description: "Supervised/unsupervised learning, model training, evaluation." },
    { id: "calculus", name: "Calculus", subject_area: "Mathematics", difficulty: "intermediate", description: "Limits, derivatives, integrals — the math behind ML and physics." },
    { id: "linear_algebra", name: "Linear Algebra", subject_area: "Mathematics", difficulty: "intermediate", description: "Vectors, matrices, eigenvalues — foundational for ML and graphics." },
    { id: "statistics", name: "Statistics", subject_area: "Mathematics", difficulty: "intermediate", description: "Probability, distributions, hypothesis testing." },
    { id: "physics_mechanics", name: "Physics: Mechanics", subject_area: "Physics", difficulty: "intermediate", description: "Kinematics, Newton's laws, energy, momentum." },
    { id: "chemistry_basics", name: "Chemistry Fundamentals", subject_area: "Chemistry", difficulty: "beginner", description: "Atomic structure, bonding, reactions, stoichiometry." },
];

export const SKILL_DEPENDENCIES = [
    { skill_id: "variables", prerequisite_skill_id: "prog_fundamentals" },
    { skill_id: "conditions", prerequisite_skill_id: "variables" },
    { skill_id: "loops", prerequisite_skill_id: "conditions" },
    { skill_id: "functions", prerequisite_skill_id: "loops" },
    { skill_id: "arrays", prerequisite_skill_id: "loops" },
    { skill_id: "pointers", prerequisite_skill_id: "arrays" },
    { skill_id: "pointers", prerequisite_skill_id: "functions" },
    { skill_id: "cpp_basics", prerequisite_skill_id: "pointers" },
    { skill_id: "oop", prerequisite_skill_id: "cpp_basics" },
    { skill_id: "dsa", prerequisite_skill_id: "oop" },
    { skill_id: "dsa", prerequisite_skill_id: "arrays" },
    { skill_id: "dsa", prerequisite_skill_id: "pointers" },
    { skill_id: "python_basics", prerequisite_skill_id: "prog_fundamentals" },
    { skill_id: "data_analysis", prerequisite_skill_id: "python_basics" },
    { skill_id: "data_analysis", prerequisite_skill_id: "statistics" },
    { skill_id: "machine_learning", prerequisite_skill_id: "linear_algebra" },
    { skill_id: "machine_learning", prerequisite_skill_id: "calculus" },
    { skill_id: "machine_learning", prerequisite_skill_id: "data_analysis" },
    { skill_id: "statistics", prerequisite_skill_id: "calculus" },
    { skill_id: "linear_algebra", prerequisite_skill_id: "calculus" },
];

// Get all prerequisites (transitive closure) for a skill
export function getAllPrerequisites(skillId, deps = SKILL_DEPENDENCIES) {
    const visited = new Set();
    const queue = [skillId];
    while (queue.length > 0) {
        const current = queue.shift();
        const directDeps = deps.filter(d => d.skill_id === current);
        for (const dep of directDeps) {
            if (!visited.has(dep.prerequisite_skill_id)) {
                visited.add(dep.prerequisite_skill_id);
                queue.push(dep.prerequisite_skill_id);
            }
        }
    }
    return Array.from(visited);
}

// Get the ordered prerequisite chain for a skill (topological order from roots to skill)
export function getPrerequisiteChain(skillId, deps = SKILL_DEPENDENCIES) {
    const allPrereqs = getAllPrerequisites(skillId, deps);
    const chain = [];
    const inChain = new Set();

    // Build a subgraph of just the prerequisites + target
    const relevant = [...allPrereqs, skillId];
    const subDeps = deps.filter(d => relevant.includes(d.skill_id) && relevant.includes(d.prerequisite_skill_id));

    // Topological sort using Kahn's algorithm
    const inDegree = {};
    relevant.forEach(s => { inDegree[s] = 0; });
    subDeps.forEach(d => { inDegree[d.skill_id] = (inDegree[d.skill_id] || 0) + 1; });

    const queue = relevant.filter(s => inDegree[s] === 0);
    while (queue.length > 0) {
        const node = queue.shift();
        if (node !== skillId || inChain.size === allPrereqs.length) {
            chain.push(node);
            inChain.add(node);
        } else if (allPrereqs.length === 0) {
            chain.push(node);
        }
        const outgoing = subDeps.filter(d => d.prerequisite_skill_id === node);
        for (const d of outgoing) {
            inDegree[d.skill_id]--;
            if (inDegree[d.skill_id] === 0) {
                queue.push(d.skill_id);
            }
        }
    }

    // Ensure target is last
    const result = chain.filter(s => s !== skillId);
    result.push(skillId);
    return result;
}

// Get direct prerequisites for a skill
export function getDirectPrerequisites(skillId, deps = SKILL_DEPENDENCIES) {
    return deps.filter(d => d.skill_id === skillId).map(d => d.prerequisite_skill_id);
}

// Get skills that depend on a given skill (what unlocks when you master this)
export function getDependentSkills(skillId, deps = SKILL_DEPENDENCIES) {
    return deps.filter(d => d.prerequisite_skill_id === skillId).map(d => d.skill_id);
}

// Check if a skill is unlocked given the user's mastery scores
export function isSkillUnlocked(skillId, masteryScores) {
    const directPrereqs = getDirectPrerequisites(skillId);
    if (directPrereqs.length === 0) return true;
    return directPrereqs.every(prereqId => {
        const score = masteryScores.find(m => m.skill_id === prereqId);
        return score && score.status === "Mastered";
    });
}

// Compute missing prerequisites for a skill based on mastery
export function getMissingPrerequisites(skillId, masteryScores) {
    const allPrereqs = getAllPrerequisites(skillId);
    return allPrereqs.filter(prereqId => {
        const score = masteryScores.find(m => m.skill_id === prereqId);
        return !score || score.status !== "Mastered";
    });
}

// Get skill by id
export function getSkillById(id) {
    return SKILLS_GRAPH.find(s => s.id === id);
}

// Get skill name by id
export function getSkillName(id) {
    const skill = getSkillById(id);
    return skill ? skill.name : id;
}

// Generate ordered task list from a set of missing prerequisites + target skill
export function orderTasksByPriority(skillIds, masteryScores, deps = SKILL_DEPENDENCIES) {
    // Topological sort of the given skills
    const skillSet = new Set(skillIds);
    const subDeps = deps.filter(d => skillSet.has(d.skill_id) && skillSet.has(d.prerequisite_skill_id));
    const inDegree = {};
    skillIds.forEach(s => { inDegree[s] = 0; });
    subDeps.forEach(d => { inDegree[d.skill_id] = (inDegree[d.skill_id] || 0) + 1; });

    const result = [];
    const queue = skillIds.filter(s => inDegree[s] === 0).sort();
    while (queue.length > 0) {
        const node = queue.shift();
        result.push(node);
        const outgoing = subDeps.filter(d => d.prerequisite_skill_id === node);
        for (const d of outgoing) {
            inDegree[d.skill_id]--;
            if (inDegree[d.skill_id] === 0) {
                // Insert in sorted order to keep deterministic
                const insertIdx = queue.findIndex(s => s > d.skill_id);
                if (insertIdx === -1) queue.push(d.skill_id);
                else queue.splice(insertIdx, 0, d.skill_id);
            }
        }
    }
    // Add any remaining skills not reached by topo sort (shouldn't happen in valid DAG)
    skillIds.forEach(s => { if (!result.includes(s)) result.push(s); });
    return result;
}

export const INDIAN_LANGUAGES = [
    { code: "en", name: "English", native: "English" },
    { code: "hi", name: "Hindi", native: "हिन्दी" },
    { code: "gu", name: "Gujarati", native: "ગુજરાતી" },
    { code: "mr", name: "Marathi", native: "मराठी" },
    { code: "bn", name: "Bengali", native: "বাংলা" },
    { code: "ta", name: "Tamil", native: "தமிழ்" },
    { code: "te", name: "Telugu", native: "తెలుగు" },
    { code: "kn", name: "Kannada", native: "ಕನ್ನಡ" },
    { code: "ml", name: "Malayalam", native: "മലയാളം" },
    { code: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ" },
    { code: "or", name: "Odia", native: "ଓଡ଼ିଆ" },
    { code: "as", name: "Assamese", native: "অসমীয়া" },
];