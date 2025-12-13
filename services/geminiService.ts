/**
 * KnowMore - Gemini Service
 * Main orchestration layer that initializes and re-exports all AI services
 */

import { GoogleGenAI } from "@google/genai";
import { API_CONFIG } from "../constants/config";

// Initialize AI instance
const ai = new GoogleGenAI({ apiKey: API_CONFIG.GEMINI_API_KEY });

// ============================================
// INITIALIZE ALL SUB-SERVICES
// ============================================
import { initializeImageService } from "./imageService";
import { initializeTTSService, TTS_ENABLED } from "./ttsService";
import { initializeChatService } from "./chatService";
import { initializeCurriculumService } from "./curriculumService";
import { initializeContentService } from "./contentService";
import { initializeArticleService } from "./articleService";

initializeImageService(ai);
initializeTTSService(ai);
initializeChatService(ai);
initializeCurriculumService(ai);
initializeContentService(ai);
initializeArticleService(ai);

// ============================================
// CONFIGURATION EXPORTS
// ============================================
export { TTS_ENABLED };
export const LIVE_VOICE_ENABLED = true;

// ============================================
// RE-EXPORT FROM IMAGE SERVICE
// ============================================
export {
  fetchImageCandidates,
  selectBestImage,
  extractImageBlocksFromModule,
  selectImagesForModule,
  getPlaceholderUrl,
  clearImageCache
} from "./imageService";

export type {
  DualImage,
  ImageSelectionResult,
  ImageBlockInfo
} from "./imageService";

// ============================================
// RE-EXPORT FROM TTS SERVICE
// ============================================
export {
  generateSpeech,
  generateTTSForSlide,
  generateTTSForModule
} from "./ttsService";

// ============================================
// RE-EXPORT FROM CHAT SERVICE
// ============================================
export {
  generateConsultantReply,
  generateChatResponse,
  evaluateUserAnswer
} from "./chatService";

export type {
  ConsultantResult,
  AnswerEvaluation
} from "./chatService";

// ============================================
// RE-EXPORT FROM CURRICULUM SERVICE
// ============================================
export {
  generateCurriculum,
  refineCurriculum,
  adjustCurriculum,
  CURRICULUM_SCHEMA
} from "./curriculumService";

// ============================================
// RE-EXPORT FROM CONTENT SERVICE
// ============================================
export {
  generateModuleContent
} from "./contentService";

export type {
  SlideBlock,
  SlideData,
  ModuleContent
} from "./contentService";

// ============================================
// RE-EXPORT FROM ARTICLE SERVICE
// ============================================
export {
  generateArticle,
  fetchArticleImages,
  generatePresentation,
  generatePresentationSlide,
  fetchPresentationImages
} from "./articleService";

export type {
  ArticleSectionRaw,
  ArticleRaw,
  PresentationSlideRaw,
  PresentationRaw
} from "./articleService";

// ============================================
// RE-EXPORT TYPES FROM TYPES.TS
// ============================================
export type {
  CurriculumData,
  CurriculumModule,
  CurriculumSlide
} from "../types";
