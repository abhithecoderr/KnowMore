/**
 * KnowMore - Article & Presentation Service
 * Handles article and presentation generation modes
 */

import { GoogleGenAI } from "@google/genai";
import { AI_MODELS } from "../constants/config";
import { selectBestImage } from "./imageService";

// ============================================
// CONFIGURATION
// ============================================
const MODELS = AI_MODELS;

// Shared AI instance (will be set from main service)
let ai: GoogleGenAI;

export function initializeArticleService(aiInstance: GoogleGenAI) {
  ai = aiInstance;
}

// Clean markdown fences and extract valid JSON
function cleanJsonResponse(text: string): string {
  let cleaned = text.trim();

  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7).trim();
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3).trim();
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3).trim();
  }

  const start = Math.min(
    cleaned.indexOf('{') >= 0 ? cleaned.indexOf('{') : Infinity,
    cleaned.indexOf('[') >= 0 ? cleaned.indexOf('[') : Infinity
  );
  if (start === Infinity) return cleaned;

  cleaned = cleaned.slice(start);
  const lastBrace = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
  if (lastBrace > 0) cleaned = cleaned.slice(0, lastBrace + 1);

  return cleaned;
}

/** Retry wrapper for API calls */
async function withRetry<T>(fn: () => Promise<T>, retries = 2, delay = 2000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    if (retries > 0 && (error.message?.includes("overloaded") || error.code === 503)) {
      console.warn(`Retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
      return withRetry(fn, retries - 1, delay * 1.5);
    }
    throw error;
  }
}

// ============================================
// ARTICLE TYPES
// ============================================

export interface ArticleSectionRaw {
  id: string;
  title: string;
  content: string;
  imageKeywords?: string;
}

export interface ArticleRaw {
  title: string;
  overview: string;
  sections: ArticleSectionRaw[];
}

// ============================================
// PRESENTATION TYPES
// ============================================

export interface PresentationSlideRaw {
  id: string;
  title: string;
  points: string[];
  imageKeywords: string;
  speakerNotes: string;
}

export interface PresentationRaw {
  title: string;
  totalSlides: number;
  slides: PresentationSlideRaw[];
}

// ============================================
// ARTICLE FUNCTIONS
// ============================================

/** Generate article content for a topic */
export async function generateArticle(
  topic: string,
  context: string = ''
): Promise<ArticleRaw> {
  const prompt = `Write an engaging, educational article about "${topic}".
${context ? `Context: ${context}` : ''}

Write exactly 4 flowing paragraphs that read like a cohesive article (not separate sections).
Each paragraph should:
- Be 60-80 words
- Flow naturally into the next
- Explain concepts clearly with examples
- Be engaging and educational

Return as JSON:
{
  "title": "Engaging Article Title",
  "overview": "One compelling sentence hook",
  "sections": [
    {"id": "p1", "title": "Introduction", "content": "Opening paragraph introducing the topic..."},
    {"id": "p2", "title": "Key Concepts", "content": "Explanation with examples...", "imageKeywords": "relevant visual keyword"},
    {"id": "p3", "title": "Deeper Exploration", "content": "More detail and context..."},
    {"id": "p4", "title": "Conclusion", "content": "Wrapping up with key takeaways..."}
  ]
}

Write like a quality blog post - engaging, clear, and educational.`;

  return withRetry(async () => {
    const result = await ai.models.generateContent({
      model: MODELS.CONTENT,
      contents: prompt,
      config: {}
    });

    const json = cleanJsonResponse(result.text || '');
    try {
      return JSON.parse(json);
    } catch (e) {
      console.error('Article parse error:', result.text?.slice(0, 300));
      throw new Error('Invalid article response');
    }
  }, 2, 1000);
}

/** Fetch images for article sections */
export async function fetchArticleImages(
  sections: ArticleSectionRaw[]
): Promise<{ [sectionId: string]: string | null }> {
  const imageMap: { [sectionId: string]: string | null } = {};

  const sectionsWithImages = sections.filter(s => s.imageKeywords);

  await Promise.all(
    sectionsWithImages.map(async (section) => {
      if (section.imageKeywords) {
        const url = await selectBestImage(section.imageKeywords, `Educational image for article section: ${section.title}`);
        imageMap[section.id] = url;
      }
    })
  );

  return imageMap;
}

// ============================================
// PRESENTATION FUNCTIONS
// ============================================

/** Generate presentation with all slides at once */
export async function generatePresentation(
  topic: string,
  context: string = ''
): Promise<PresentationRaw> {
  const prompt = `Create an educational 10-slide presentation about "${topic}".
${context ? `Context: ${context}` : ''}

Each slide needs:
- A clear, descriptive title
- 3-4 bullet points that are EXPLANATORY (12-20 words each, like a real presentation)
- UNIQUE imageKeywords for each slide (specific to that slide's content, different per slide)
- speakerNotes with 2-3 sentences explaining the slide content conversationally

Return JSON:
{
  "title": "Presentation Title",
  "totalSlides": 10,
  "slides": [
    {"id": "slide-1", "title": "Intro Title", "points": ["Detailed point 1 with explanation", "Detailed point 2 with context"], "imageKeywords": "specific unique keyword for this slide", "speakerNotes": "Two to three sentences that explain this slide conversationally..."}
  ]
}

IMPORTANT: Each slide's imageKeywords MUST be different and specific to that slide's topic.`;

  return withRetry(async () => {
    const result = await ai.models.generateContent({
      model: MODELS.CONTENT,
      contents: prompt,
      config: {}
    });

    const json = cleanJsonResponse(result.text || '');
    try {
      const data = JSON.parse(json);
      if (!data.slides) data.slides = [];
      data.totalSlides = data.slides.length;
      return data;
    } catch (e) {
      console.error('Presentation parse error:', result.text?.slice(0, 300));
      throw new Error('Invalid presentation response');
    }
  }, 2, 1000);
}

/** Generate a single presentation slide on demand */
export async function generatePresentationSlide(
  topic: string,
  slideIndex: number,
  totalSlides: number,
  previousSlides: PresentationSlideRaw[]
): Promise<PresentationSlideRaw> {
  const prevContext = previousSlides.slice(-2).map(s => `- ${s.title}: ${s.points.slice(0, 2).join(', ')}`).join('\n');

  const prompt = `Generate slide ${slideIndex + 1} of ${totalSlides} for a presentation about "${topic}".

Previous slides covered:
${prevContext || 'This is the first content slide'}

Return JSON for ONE slide:
{"id": "slide-${slideIndex + 1}", "title": "Slide Title", "points": ["Point 1", "Point 2", "Point 3", "Point 4"], "imageKeywords": ["keyword1", "keyword2"], "speakerNotes": "Notes..."}`;

  return withRetry(async () => {
    const result = await ai.models.generateContent({
      model: MODELS.CONTENT,
      contents: prompt,
      config: {}
    });

    const json = cleanJsonResponse(result.text || '');
    return JSON.parse(json);
  }, 2, 1000);
}

/** Fetch images for presentation slides (1 per slide) */
export async function fetchPresentationImages(
  slides: PresentationSlideRaw[]
): Promise<{ [slideId: string]: (string | null)[] }> {
  const imageMap: { [slideId: string]: (string | null)[] } = {};

  await Promise.all(
    slides.map(async (slide) => {
      if (slide.imageKeywords) {
        const url = await selectBestImage(slide.imageKeywords, `Visual for: ${slide.title}`);
        imageMap[slide.id] = [url];
      } else {
        imageMap[slide.id] = [];
      }
    })
  );

  return imageMap;
}
