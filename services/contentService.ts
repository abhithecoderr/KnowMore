/**
 * KnowMore - Content Service
 * Handles module content generation with slide blocks
 */

import { GoogleGenAI } from "@google/genai";
import { AI_MODELS } from "../constants/config";
import { selectBestImage, getPlaceholderUrl } from "./imageService";

// ============================================
// CONFIGURATION
// ============================================
const MODELS = AI_MODELS;

// Shared AI instance (will be set from main service)
let ai: GoogleGenAI;

export function initializeContentService(aiInstance: GoogleGenAI) {
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
// TYPES
// ============================================

export interface SlideBlock {
  type: "text" | "image" | "quiz" | "fun_fact" | "table"
      | "fill_blank" | "short_answer" | "assertion_reason"
      | "match_following" | "image_recognition" | "reflection"
      | "activity" | "notes_summary";
  content?: string;
  keywords?: string;
  caption?: string;
  imageUrl?: string | null;
  position?: "hero" | "intro" | "grid";
  question?: string;
  options?: { text: string; isCorrect: boolean }[];
  explanation?: string;
  fact?: string;
  markdown?: string;
  sentence?: string;
  answer?: string;
  expectedAnswer?: string;
  assertion?: string;
  reason?: string;
  correctOption?: string;
  pairs?: { left: string; right: string }[];
  imageKeywords?: string;
  prompt?: string;
  instruction?: string;
  points?: string[];
  summary?: string;
}

export interface SlideData {
  id: string;
  title: string;
  blocks: SlideBlock[];
}

export interface ModuleContent {
  moduleId: string;
  slides: SlideData[];
}

// ============================================
// PROMPTS
// ============================================

const SCHEMA_DEFINITIONS = `
=== STRICT BLOCK SCHEMAS ===
You MUST follow these exact schemas. Any deviation will break the app.

TEXT_BLOCK:
{ "type": "text", "content": "Your educational text here..." }

IMAGE_BLOCK:
{ "type": "image", "keywords": "pokemon trading cards", "caption": "Pokemon card collection", "position": "hero" }
- keywords: ONE phrase, 2-4 words, NO COMMAS (e.g. "video streaming screen" not "streaming, digital, video")
- position: "hero" (centered) | "intro" (left-aligned at start) | "grid" (in a row)

QUIZ_BLOCK (REQUIRED FIELDS - ALL MUST BE PRESENT):
{
  "type": "quiz",
  "question": "What is the capital of France?",
  "options": [
    { "text": "London", "isCorrect": false },
    { "text": "Paris", "isCorrect": true },
    { "text": "Berlin", "isCorrect": false },
    { "text": "Madrid", "isCorrect": false }
  ],
  "explanation": "Paris has been the capital of France since the 10th century."
}
- MUST have exactly 4 options
- MUST have exactly ONE option with isCorrect: true
- MUST have question, options, and explanation fields

MATCH_FOLLOWING_BLOCK (REQUIRED FIELDS):
{
  "type": "match_following",
  "pairs": [
    { "left": "H2O", "right": "Water" },
    { "left": "NaCl", "right": "Salt" },
    { "left": "CO2", "right": "Carbon Dioxide" }
  ]
}
- MUST have 3-5 pairs
- Each pair MUST have "left" and "right" string fields

FILL_BLANK_BLOCK:
{ "type": "fill_blank", "sentence": "The ___ is the powerhouse of the cell.", "answer": "mitochondria", "explanation": "..." }

SHORT_ANSWER_BLOCK:
{ "type": "short_answer", "question": "...", "expectedAnswer": "...", "explanation": "..." }

FUN_FACT_BLOCK:
{ "type": "fun_fact", "fact": "Honey never spoils - archaeologists found 3000-year-old honey in Egyptian tombs!" }

NOTES_SUMMARY_BLOCK:
{ "type": "notes_summary", "summary": "This module covered X, Y, and Z...", "points": ["Point 1", "Point 2", "Point 3"] }
- summary: 2-3 sentence paragraph
- points: 6-10 bullet points
`;

// ============================================
// PUBLIC API
// ============================================

export async function generateModuleContent(
  courseTitle: string,
  moduleTitle: string,
  moduleDescription: string,
  slideTitles: string[],
  previousContext = "",
  onImageReady?: (slideIndex: number, blockIndex: number, imageUrl: string) => void,
  skipImageSelection = false
): Promise<ModuleContent> {
  console.log(`\n🎯 Generating: "${moduleTitle}" (${slideTitles.length} slides)...`);
  const startTime = performance.now();

  const slidesList = slideTitles.map((t, i) => `${i + 1}. ${t}`).join('\n');
  const totalSlides = slideTitles.length + 3;

  const prompt = `Generate slide content for a learning module.

COURSE: "${courseTitle}"
MODULE: "${moduleTitle}" - ${moduleDescription}

CONTENT SLIDES TO CREATE (after intro):
${slidesList}

${previousContext ? `PREVIOUS MODULES:\n${previousContext}\n` : ""}
${SCHEMA_DEFINITIONS}

=== WRITING APPROACH ===
Write as if explaining to a curious friend over coffee. Each piece of information should make them lean in and want to know what comes next.

Avoid: "Let's explore...", "Now we'll learn...", "As we discussed..."
Instead: Jump straight into the interesting part. Start with the detail that made YOU curious.

VARIED OPENINGS (never repeat the same pattern twice in a row):
- A surprising fact or counter-intuitive truth
- A "what if" or "imagine" scenario
- A specific detail that reveals something larger
- A contrast or paradox
- A moment in history or a real person's experience

Each slide's last paragraph should leave something unresolved or hint at something fascinating ahead.

=== IMAGE KEYWORDS (CRITICAL) ===
Include 2-3 images per content slide. Show specific, real things - not abstract concepts.
Keywords format: ONE phrase, 2-4 words, NO COMMAS.

✅ CORRECT: "video streaming laptop", "computer chip closeup", "DNA helix model"
❌ WRONG: "concept, illustration, technology" ← HAS COMMAS

=== SLIDE STRUCTURE (${totalSlides} SLIDES TOTAL) ===

**SLIDE 1: "${moduleTitle}" (MODULE INTRO)**
- One hero image that captures the essence
- Open with the most intriguing aspect of this topic
- Make the reader feel like they're about to discover something worth knowing

**SLIDES 2-${slideTitles.length + 1}: CONTENT SLIDES**
${slidesList}
Each content slide:
- 2-4 text blocks (mix of explanation, examples, and specific details)
- 2-3 images showing real objects/scenes mentioned in text
- Optional: 1 fun_fact, quiz, or table per 2 slides
- End each slide with something that naturally pulls toward the next topic

**SLIDE ${slideTitles.length + 2}: "Notes & Summary"**
Single block: notes_summary with summary paragraph + 6-10 bullet points

**SLIDE ${slideTitles.length + 3}: "Module Exercise"**
8-12 interactive questions using this MIX:
- 2-3 quiz blocks (MCQ - follow exact schema above!)
- 1-2 match_following blocks (follow exact schema above!)
- 2-3 fill_blank or short_answer blocks
- 1 reflection block

=== OUTPUT FORMAT ===
{
  "slides": [
    {
      "title": "${moduleTitle}",
      "blocks": [
        {"type": "image", "keywords": "specific subject", "caption": "...", "position": "hero"},
        {"type": "text", "content": "Welcome to this module..."},
        {"type": "text", "content": "In this module, you will learn..."}
      ]
    },
    {
      "title": "Content Slide Title",
      "blocks": [
        {"type": "text", "content": "Educational content..."},
        {"type": "image", "keywords": "real object", "caption": "...", "position": "hero"},
        {"type": "text", "content": "More explanation..."},
        {"type": "fun_fact", "fact": "Did you know..."}
      ]
    },
    {
      "title": "Notes & Summary",
      "blocks": [
        {"type": "notes_summary", "summary": "This module covered...", "points": ["Key point 1", "Key point 2", "Key point 3"]}
      ]
    },
    {
      "title": "Module Exercise",
      "blocks": [
        {"type": "quiz", "question": "...", "options": [{"text": "A", "isCorrect": false}, {"text": "B", "isCorrect": true}, {"text": "C", "isCorrect": false}, {"text": "D", "isCorrect": false}], "explanation": "..."},
        {"type": "match_following", "pairs": [{"left": "Term1", "right": "Def1"}, {"left": "Term2", "right": "Def2"}, {"left": "Term3", "right": "Def3"}]},
        {"type": "fill_blank", "sentence": "The ___ is...", "answer": "...", "explanation": "..."}
      ]
    }
  ]
}

Generate exactly ${totalSlides} slides. Return ONLY valid JSON.`;

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: MODELS.CONTENT,
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 0 },
        tools: [{ googleSearch: {} }]
      }
    });

    if (!response.text) throw new Error("No content generated");

    let data = JSON.parse(cleanJsonResponse(response.text));

    if (Array.isArray(data)) {
      data = data[0]?.blocks ? { slides: data } : { slides: [] };
    }

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
    console.log(`📝 Content generated (${elapsed}s): ${data.slides?.length || 0} slides`);

    // Build slides structure first with null imageUrls (loading state)
    const processedSlides: SlideData[] = [];
    const imageBlocks: { slideIdx: number; blockIdx: number; keywords: string; slideTitle: string; slideContext: string }[] = [];

    for (let slideIdx = 0; slideIdx < (data.slides || []).length; slideIdx++) {
      const slide = data.slides[slideIdx];
      const slideContext = (slide.blocks || [])
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.content)
        .join(' ')
        .slice(0, 200);

      const processedBlocks: SlideBlock[] = [];

      for (let blockIdx = 0; blockIdx < (slide.blocks || []).length; blockIdx++) {
        const block = slide.blocks[blockIdx];

        if (block?.type === 'image' && block.keywords) {
          const imageBlock = { ...block, imageUrl: null as string | null };
          processedBlocks.push(imageBlock);

          imageBlocks.push({
            slideIdx,
            blockIdx,
            keywords: block.keywords,
            slideTitle: slide.title || '',
            slideContext
          });
        } else if (block?.type) {
          processedBlocks.push(block);
        }
      }

      processedSlides.push({
        id: `slide-${slideIdx}`,
        title: slide.title || `Slide ${slideIdx + 1}`,
        blocks: processedBlocks
      });

      console.log(`   └─ Slide ${slideIdx + 1}: "${slide.title}" (${processedBlocks.length} blocks)`);
    }

    // Skip image selection if flag is set (for on-demand loading)
    if (skipImageSelection) {
      console.log(`   📷 Skipping image selection (on-demand loading enabled)`);
      return { moduleId: "", slides: processedSlides };
    }

    // If no callback provided, process images synchronously (blocking mode)
    if (!onImageReady) {
      for (const imgBlock of imageBlocks) {
        const imageUrl = await selectBestImage(imgBlock.slideTitle, imgBlock.slideContext, imgBlock.keywords);

        const slide = processedSlides[imgBlock.slideIdx];
        if (slide && slide.blocks[imgBlock.blockIdx]) {
          (slide.blocks[imgBlock.blockIdx] as any).imageUrl = imageUrl;
        }
      }
    } else {
      // Process images in background and notify via callback
      (async () => {
        for (const imgBlock of imageBlocks) {
          try {
            const imageUrl = await selectBestImage(imgBlock.slideTitle, imgBlock.slideContext, imgBlock.keywords);
            onImageReady(imgBlock.slideIdx, imgBlock.blockIdx, imageUrl);
          } catch (err) {
            console.warn(`Failed to load image for slide ${imgBlock.slideIdx}:`, err);
            onImageReady(imgBlock.slideIdx, imgBlock.blockIdx, getPlaceholderUrl(imgBlock.keywords));
          }
        }
      })();
    }

    return { moduleId: "", slides: processedSlides };
  });
}
