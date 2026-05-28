export enum KLevel {
  K1 = "K1: Remember",
  K2 = "K2: Understand",
  K3 = "K3: Apply",
  K4 = "K4: Analyse",
  K5 = "K5: Evaluate",
  K6 = "K6: Create",
}

export enum Difficulty {
  EASY = "Easy",
  MEDIUM = "Medium",
  HARD = "Hard",
}

export interface Section {
  id: string;
  name: string;
  questionCount: number;
  marksPerQuestion: number;
  type: 'theory' | 'mcq';
}

export interface ExamPattern {
  sections: Section[];
}

export interface DifficultyWeightage {
  easy: number;
  medium: number;
  hard: number;
}

export interface KWeightage {
  k1: number;
  k2: number;
  k3: number;
  k4: number;
  k5: number;
  k6: number;
}

export interface Question {
  id: string;
  sectionId?: string;
  text: string;
  options?: string[];
  correctAnswer: string;
  rationale: string;
  kLevel: KLevel;
  difficulty: Difficulty;
  topic: string;
  co: string; // Course Outcome (CO1-CO6)
  marks: number;
  qualityScore: number;
}

export interface ExamSet {
  id: string;
  setName: string; // Set A, Set B, etc.
  questions: Question[];
  totalMarks: number;
  durationMinutes: number;
}

export interface ExamSession {
  id: string;
  courseName: string;
  subjectCode: string;
  modules: string[];
  cos: string[];
  sets: ExamSet[];
  createdAt: string;
}

export interface SyllabusData {
  courseName: string;
  subjectCode: string;
  topics: string[];
  cos: string[];
}
