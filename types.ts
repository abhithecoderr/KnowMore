// ============================================
// Core Types for OmniLearn AI
// ============================================

// Chat message type
export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

// App view states
export type ViewState = 'HOME' | 'CLARIFICATION' | 'CURRICULUM_REVIEW' | 'PLANNER' | 'LEARNING';

// ============================================
// Curriculum Types (for two-phase generation)
// ============================================

export interface CurriculumSlide {
  id: string;
  title: string;
  description: string; // What this subtopic covers
}

export interface CurriculumModule {
  id: string;
  title: string;
  description: string;
  slides: CurriculumSlide[];
}

export interface CurriculumData {
  title: string;
  overview: string;           // What this curriculum covers
  learningGoals: string[];    // What the learner will achieve
  description: string;        // Brief course description
  modules: CurriculumModule[];
}

// ============================================
// Content Block Types
// ============================================

export interface TextBlock {
  type: 'text';
  content: string;
}

export interface ImageBlock {
  type: 'image';
  keywords: string;
  caption?: string;
  imageUrl?: string;
  position?: 'center' | 'left' | 'right' | 'inline';
}

export interface QuizOption {
  text: string;
  isCorrect: boolean;
}

export interface QuizBlock {
  type: 'quiz';
  question: string;
  options: QuizOption[];
  explanation: string;
}

export interface FunFactBlock {
  type: 'fun_fact';
  fact: string;
}

export interface TableBlock {
  type: 'table';
  markdown: string;
}

export type ContentBlock = TextBlock | ImageBlock | QuizBlock | FunFactBlock | TableBlock;

// ============================================
// Slide & Module Types
// ============================================

export interface Slide {
  id: string;
  title: string;
  blocks: ContentBlock[];
}

export interface Module {
  id: string;
  title: string;
  description: string;
  slides: Slide[];
  isLoaded: boolean;  // Whether full content has been generated
}

// ============================================
// Course Type (Main State)
// ============================================

export interface Course {
  id: string;
  topic: string;
  title: string;
  description: string;
  modules: Module[];
  createdAt: number;
  lastAccessed: number;
}