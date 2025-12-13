// ============================================
// Core Types for KnowMore
// ============================================

// Chat message type
export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

// Learning mode selection
export type LearningMode = 'curriculum' | 'article' | 'presentation';

// App view states
export type ViewState = 'HOME' | 'CLARIFICATION' | 'CURRICULUM_REVIEW' | 'PLANNER' | 'LEARNING' | 'ARTICLE' | 'PRESENTATION';

// Learning preferences for personalization
export interface LearningPreferences {
  knowledgeLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  preferredDepth: 'quick' | 'standard' | 'deep' | 'comprehensive';
  customInstructions: string;
}

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
  imageUrl?: string | null; // null = loading, undefined = not yet fetched
  position?: 'hero' | 'intro' | 'grid'; // hero=centered, intro=left at start, grid=row of images
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

// New block types for Exercise slides
export interface FillBlankBlock {
  type: 'fill_blank';
  sentence: string;       // Sentence with ___ for blanks
  answer: string;         // Correct answer
  explanation?: string;
}

export interface ShortAnswerBlock {
  type: 'short_answer';
  question: string;
  expectedAnswer: string; // For AI evaluation
  explanation?: string;
}

export interface AssertionReasonBlock {
  type: 'assertion_reason';
  assertion: string;
  reason: string;
  correctOption: 'both_true_reason_correct' | 'both_true_reason_incorrect' | 'assertion_true_reason_false' | 'assertion_false_reason_true' | 'both_false';
  explanation: string;
}

export interface MatchFollowingBlock {
  type: 'match_following';
  pairs: { left: string; right: string }[];
}

export interface ImageRecognitionBlock {
  type: 'image_recognition';
  imageKeywords: string;
  imageUrl?: string | null;
  question: string;
  answer: string;
}

export interface ReflectionBlock {
  type: 'reflection';
  prompt: string;         // Open-ended reflection question
}

export interface ActivityBlock {
  type: 'activity';
  instruction: string;    // Outside/practical activity task
}

// Notes & Summary block
export interface NotesSummaryBlock {
  type: 'notes_summary';
  summary?: string;       // Summary paragraph introducing the key points
  points: string[];       // Bullet points of key takeaways
}

export type ContentBlock =
  | TextBlock | ImageBlock | QuizBlock | FunFactBlock | TableBlock
  | FillBlankBlock | ShortAnswerBlock | AssertionReasonBlock
  | MatchFollowingBlock | ImageRecognitionBlock | ReflectionBlock
  | ActivityBlock | NotesSummaryBlock;

// ============================================
// Slide & Module Types
// ============================================

export interface Slide {
  id: string;
  title: string;
  blocks: ContentBlock[];
  audioUrl?: string;       // TTS audio blob URL
  audioLoading?: boolean;  // Whether TTS is being generated
}

export interface Module {
  id: string;
  title: string;
  description: string;
  slides: Slide[];
  isLoaded: boolean;       // Whether full content has been generated
  ttsGenerated?: boolean;  // Whether TTS audio has been generated for this module
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

// ============================================
// Article Mode Types
// ============================================

export interface ArticleSection {
  id: string;
  title: string;
  content: string;           // Paragraph content
  imageKeywords?: string;    // For Wikimedia image fetch
  imageUrl?: string | null;
}

export interface Article {
  id: string;
  topic: string;
  title: string;
  overview: string;
  sections: ArticleSection[];
  createdAt: number;
}

// ============================================
// Presentation Mode Types
// ============================================

export interface PresentationSlide {
  id: string;
  title: string;
  points: string[];          // Key points/bullet points
  imageKeywords: string;     // Single image keyword per slide
  imageUrls?: (string | null)[];
  speakerNotes?: string;     // For voice intro
}

export interface Presentation {
  id: string;
  topic: string;
  title: string;
  totalSlides: number;
  slides: PresentationSlide[];
  createdAt: number;
}