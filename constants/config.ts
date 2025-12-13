/**
 * Application Configuration Constants
 * Centralized configuration to avoid magic numbers and improve maintainability
 */

// ============================================
// API CONFIGURATION
// ============================================
export const API_CONFIG = {
  GEMINI_API_KEY: process.env.API_KEY || "",
  PIXABAY_API_KEY: process.env.PIXABAY_KEY || "",
} as const;

// ============================================
// AI MODEL CONFIGURATION
// ============================================
export const AI_MODELS = {
  CONSULTANT: "gemini-robotics-er-1.5-preview",
  CURRICULUM: "gemini-robotics-er-1.5-preview",
  CONTENT: "gemini-robotics-er-1.5-preview",
  CHAT: "gemma-3-27b-it",
  IMAGE_ANALYSIS: "gemma-3-27b-it",
  ANSWER_EVAL: "gemma-3-12b-it",
  TTS: "gemini-2.5-flash-preview-tts",
  LIVE_VOICE: "gemini-2.5-flash-native-audio-preview-12-2025",
} as const;

// ============================================
// RATE LIMITING & PERFORMANCE
// ============================================
export const RATE_LIMITS = {
  IMAGE_ANALYSIS_INTERVAL_MS: 3000,  // 3 seconds between AI image analysis calls
  MODULE_GENERATION_DELAY_MS: 5000,  // 5 seconds between module generations
  IMAGE_FETCH_TIMEOUT_MS: 8000,      // 8 second timeout for image fetches
  HEAD_REQUEST_TIMEOUT_MS: 3000,     // 3 second timeout for HEAD requests
} as const;

export const IMAGE_CONFIG = {
  MAX_SELECTION_ATTEMPTS: 4,         // Max retries for image selection
  WIKIMEDIA_FETCH_COUNT: 3,          // Images to fetch from Wikimedia (reduced from 5)
  PIXABAY_FETCH_COUNT: 2,            // Images to fetch from Pixabay
  MAX_IMAGE_SIZE_BYTES: 8000000,     // 8MB max image size
  MIN_IMAGE_SIZE_BYTES: 500,         // Minimum valid image size
  DISPLAY_WIDTH_PX: 600,             // Display image width
  ANALYSIS_WIDTH_PX: 200,            // AI analysis image width
  POST_SELECTION_COOLDOWN_MS: 3000,  // 3s cooldown after each image selection
} as const;

// ============================================
// CONVERSATION & HISTORY
// ============================================
export const CONVERSATION_CONFIG = {
  MAX_HISTORY_MESSAGES: 10,          // Max messages to keep in consultant history
  MAX_COURSE_HISTORY: 10,            // Max courses in localStorage history
  MAX_TTS_TEXT_LENGTH: 5000,         // Max characters for TTS
  MAX_SPEECH_TEXT_LENGTH: 2000,      // Max characters for speech generation
} as const;

// ============================================
// UI CONFIGURATION
// ============================================
export const UI_CONFIG = {
  LOCALSTORAGE_DEBOUNCE_MS: 2000,    // Debounce time for localStorage writes
  DEFAULT_SIDEBAR_WIDTH: 280,        // Default curriculum sidebar width
  DEFAULT_CHAT_PANE_WIDTH: 350,      // Default chat pane width
} as const;

// ============================================
// AUDIO CONFIGURATION
// ============================================
export const AUDIO_CONFIG = {
  INPUT_SAMPLE_RATE: 16000,
  OUTPUT_SAMPLE_RATE: 24000,
  SCRIPT_PROCESSOR_BUFFER_SIZE: 4096,
} as const;

// ============================================
// NATURE KEYWORDS (for Pixabay preference)
// ============================================
export const NATURE_KEYWORDS = [
  'nature', 'wildlife', 'animal', 'forest', 'ocean',
  'mountain', 'landscape', 'flower', 'bird', 'tree',
  'sunset', 'sky'
] as const;
