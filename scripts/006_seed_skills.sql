-- =====================================================
-- KYREN 006: Seed the skills graph
-- =====================================================
-- Mirrors src/lib/skillsGraph.js. Idempotent: re-running refreshes
-- names/descriptions/prerequisites without duplicating rows.
--
-- The canonical DSA chain:
--   Programming Fundamentals -> Variables -> Conditions -> Loops
--   -> Functions / Arrays -> Pointers -> C++ Basics -> OOP -> DSA

insert into skills (
  skill_code, skill_name, skill_category, difficulty_level,
  description, prerequisite_skill_codes, estimated_learning_hours
) values
  ('prog_fundamentals', 'Programming Fundamentals', 'CS Basics', 'beginner',
   'Core concepts: what is a program, compilation, execution flow.',
   '{}', 6),

  ('variables', 'Variables', 'C Fundamentals', 'beginner',
   'Declaring, initializing, and using variables in C — int, float, char, etc.',
   '{prog_fundamentals}', 4),

  ('conditions', 'Conditions', 'C Fundamentals', 'beginner',
   'if, else if, else, switch — decision making in code.',
   '{variables}', 4),

  ('loops', 'Loops', 'C Fundamentals', 'beginner',
   'for, while, do-while — repeating operations efficiently.',
   '{conditions}', 6),

  ('functions', 'Functions', 'C Fundamentals', 'beginner',
   'Defining functions, parameters, return values, scope, recursion.',
   '{loops}', 8),

  ('arrays', 'Arrays', 'C Fundamentals', 'beginner',
   '1D and 2D arrays, indexing, iteration, memory layout.',
   '{loops}', 8),

  ('pointers', 'Pointers', 'C Fundamentals', 'intermediate',
   'Memory addresses, pointer arithmetic, pointers and arrays.',
   '{arrays,functions}', 12),

  ('cpp_basics', 'C++ Basics', 'C++', 'intermediate',
   'Transitioning from C to C++ — namespaces, references, templates intro.',
   '{pointers}', 10),

  ('oop', 'Object-Oriented Programming', 'C++', 'intermediate',
   'Classes, objects, inheritance, polymorphism, encapsulation.',
   '{cpp_basics}', 14),

  ('dsa', 'Data Structures & Algorithms', 'DSA', 'advanced',
   'Arrays, linked lists, trees, graphs, sorting, searching, complexity analysis.',
   '{oop,arrays,pointers}', 40),

  ('python_basics', 'Python Basics', 'Python', 'beginner',
   'Variables, loops, functions, lists in Python.',
   '{prog_fundamentals}', 8),

  ('data_analysis', 'Data Analysis', 'Data Science', 'intermediate',
   'Pandas, NumPy, data cleaning, visualization.',
   '{python_basics,statistics}', 20),

  ('machine_learning', 'Machine Learning Fundamentals', 'AI/ML', 'advanced',
   'Supervised/unsupervised learning, model training, evaluation.',
   '{linear_algebra,calculus,data_analysis}', 36),

  ('calculus', 'Calculus', 'Mathematics', 'intermediate',
   'Limits, derivatives, integrals — the math behind ML and physics.',
   '{}', 24),

  ('linear_algebra', 'Linear Algebra', 'Mathematics', 'intermediate',
   'Vectors, matrices, eigenvalues — foundational for ML and graphics.',
   '{calculus}', 20),

  ('statistics', 'Statistics', 'Mathematics', 'intermediate',
   'Probability, distributions, hypothesis testing.',
   '{calculus}', 20),

  ('physics_mechanics', 'Physics: Mechanics', 'Physics', 'intermediate',
   'Kinematics, Newton''s laws, energy, momentum.',
   '{}', 24),

  ('chemistry_basics', 'Chemistry Fundamentals', 'Chemistry', 'beginner',
   'Atomic structure, bonding, reactions, stoichiometry.',
   '{}', 18)

on conflict (skill_code) do update set
  skill_name = excluded.skill_name,
  skill_category = excluded.skill_category,
  difficulty_level = excluded.difficulty_level,
  description = excluded.description,
  prerequisite_skill_codes = excluded.prerequisite_skill_codes,
  estimated_learning_hours = excluded.estimated_learning_hours;
