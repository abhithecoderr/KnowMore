/**
 * OmniLearn AI - Gemini Service
 * Clean, modular service for AI-powered curriculum and content generation
 */

import { GoogleGenAI, Type } from "@google/genai";

// ============================================
// CONFIGURATION
// ============================================
const API_KEY = process.env.API_KEY || "";
const PIXABAY_KEY = "53631556-267a3b1b6dca0533d6b8fe2fa";

// Model configuration - customize models for each role
const MODELS = {
  CONSULTANT: "gemini-robotics-er-1.5-preview",       // Pre-curriculum chat
  CURRICULUM: "gemini-robotics-er-1.5-preview",       // Curriculum structure generation
  CONTENT: "gemini-robotics-er-1.5-preview", //gemini-robotics-er-1.5-preview,          // Slide content generation
  CHAT: "gemma-3-27b-it",             // Learning view chat assistant
  IMAGE_ANALYSIS: "gemma-3-27b-it",   // Image selection
  ANSWER_EVAL: "gemma-3-12b-it",      // User answer evaluation
  TTS: "gemini-2.5-flash-preview-tts" // Text-to-speech
};

// Toggle TTS generation on/off (set to false to disable TTS and save API calls)
export const TTS_ENABLED = false;


const ai = new GoogleGenAI({ apiKey: API_KEY });

// Rate limiting for AI image analysis calls (20 per minute = 3s between calls)
let lastImageAnalysisTime = 0;
const MIN_ANALYSIS_INTERVAL_MS = 3000; // 3 seconds = 20 per minute

async function rateLimitImageAnalysis(): Promise<void> {
  const now = Date.now();
  const timeSinceLastCall = now - lastImageAnalysisTime;

  if (timeSinceLastCall < MIN_ANALYSIS_INTERVAL_MS) {
    const waitTime = MIN_ANALYSIS_INTERVAL_MS - timeSinceLastCall;
    console.log(`      ⏳ Rate limit: waiting ${(waitTime/1000).toFixed(1)}s`);
    await new Promise(r => setTimeout(r, waitTime));
  }

  lastImageAnalysisTime = Date.now();
}

// Nature/wildlife keywords that work better with Pixabay
const NATURE_KEYWORDS = ['nature', 'wildlife', 'animal', 'forest', 'ocean', 'mountain', 'landscape', 'flower', 'bird', 'tree', 'sunset', 'sky'];

// ============================================
// TYPES
// ============================================

// Curriculum types
export interface CurriculumSlide {
  id: string;
  title: string;
  description: string;
}

export interface CurriculumModule {
  id: string;
  title: string;
  description: string;
  slides: CurriculumSlide[];
}

export interface CurriculumData {
  title: string;
  overview: string;
  learningGoals: string[];
  description: string;
  modules: CurriculumModule[];
}

// Slide content types - matches ContentBlock in types.ts
export interface SlideBlock {
  type: "text" | "image" | "quiz" | "fun_fact" | "table"
      | "fill_blank" | "short_answer" | "assertion_reason"
      | "match_following" | "image_recognition" | "reflection"
      | "activity" | "notes_summary";
  content?: string;
  keywords?: string;
  caption?: string;
  imageUrl?: string | null;  // null = loading in progress
  position?: "hero" | "intro" | "grid";
  question?: string;
  options?: { text: string; isCorrect: boolean }[];
  explanation?: string;
  fact?: string;
  markdown?: string;
  // New fields for Exercise blocks
  sentence?: string;         // fill_blank
  answer?: string;           // fill_blank, image_recognition
  expectedAnswer?: string;   // short_answer
  assertion?: string;        // assertion_reason
  reason?: string;           // assertion_reason
  correctOption?: string;    // assertion_reason
  pairs?: { left: string; right: string }[];  // match_following
  imageKeywords?: string;    // image_recognition
  prompt?: string;           // reflection
  instruction?: string;      // activity
  points?: string[];         // notes_summary
  summary?: string;          // notes_summary - summary paragraph
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

export interface ConsultantResult {
  text: string;
  shouldGenerateCurriculum: boolean;
  curriculumContext?: {
    topic: string;
    interests?: string[];
    knowledgeLevel?: string;
    goals?: string;
  };
}

// ============================================
// UTILITY HELPERS
// ============================================

/** Clean markdown fences and extract valid JSON */
function cleanJsonResponse(text: string): string {
  let cleaned = text.trim();

  // Remove markdown fences
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7).trim();
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3).trim();
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3).trim();
  }

  // Find JSON boundaries
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
// URL VALIDATION & CONVERSION
// ============================================

/** Pre-flight check to validate URL accessibility without downloading full image */
async function validateUrlAccessible(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout for HEAD

    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      mode: 'cors'
    });
    clearTimeout(timeoutId);

    if (!response.ok) return false;

    const contentType = response.headers.get('content-type');
    const contentLength = parseInt(response.headers.get('content-length') || '0');

    // Validate it's an image and not too large
    const isImage = contentType?.startsWith('image/');
    const sizeOk = contentLength > 0 && contentLength < 8000000; // < 8MB

    return isImage && sizeOk;
  } catch {
    return false; // Assume inaccessible on any error
  }
}

/** Convert image URL to Base64 - NO RETRIES for faster parallel processing */
async function urlToBase64Part(url: string): Promise<any> {
  const startTime = Date.now();
  const urlShort = url.slice(-50);

  try {
    console.log(`      [Fetch] ${urlShort}`);

    // Fetch with short timeout for parallel speed
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

    const response = await fetch(url, {
      signal: controller.signal,
      mode: 'cors',
      cache: 'default'
    });
    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) return null;

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength < 500) return null; // Too small, skip

    // Convert to base64
    let base64: string;
    if (typeof Buffer !== 'undefined') {
      base64 = Buffer.from(arrayBuffer).toString('base64');
    } else {
      const bytes = new Uint8Array(arrayBuffer);
      if (bytes.length > 100000) {
        const chunks: string[] = [];
        const chunkSize = 50000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.slice(i, i + chunkSize);
          chunks.push(String.fromCharCode.apply(null, Array.from(chunk)));
        }
        base64 = btoa(chunks.join(''));
      } else {
        base64 = btoa(String.fromCharCode(...bytes));
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`      [OK] ${(arrayBuffer.byteLength/1024).toFixed(0)}KB, ${elapsed}s`);

    return {
      inlineData: {
        data: base64,
        mimeType: contentType.split(';')[0]
      }
    };

  } catch (e) {
    return null; // Fail fast, no retries - other parallel images will succeed
  }
}

// ============================================
// IMAGE HANDLING (OPTIMIZED)
// ============================================

/** Image with dual URLs for analysis/display */
interface DualImage {
  analysisUrl: string;  // Low-res for AI analysis
  displayUrl: string;   // High-res for frontend display
}

/** Simple in-memory cache for image selections */
const imageCache = new Map<string, string>();

/** Fetch images from Wikimedia Commons with DUAL URLs (200px AI, 600px display) */
async function fetchFromWikimedia(keywords: string, count = 3): Promise<DualImage[]> {
  try {
    console.log(`\n   🔎 Wikimedia search: "${keywords}"`);

    // Clean keywords (remove quotes from AI suggested keywords)
    const cleanKeywords = keywords.replace(/["']+/g, '').trim();

    const params = new URLSearchParams({
      origin: '*',
      action: 'query',
      generator: 'search',
      gsrsearch: `${cleanKeywords} filetype:bitmap -fileres:0`,
      gsrnamespace: '6',
      gsrlimit: String(Math.min(count + 3, 8)),
      prop: 'imageinfo',
      iiprop: 'url|mime|size|mediatype',
      iiurlwidth: '200', // Small for AI analysis
      format: 'json'
    });

    const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`);
    const data = await res.json();

    if (!data.query?.pages) {
      console.log(`      ℹ️ No results from Wikimedia`);
      return [];
    }

    const images: DualImage[] = [];
    const pages = Object.values(data.query.pages) as any[];

    console.log(`      📋 Found ${pages.length} candidates`);

    for (const page of pages) {
      const info = page.imageinfo?.[0];
      if (!info) continue;

      const mime = info.mime || '';
      if (!mime.startsWith('image/')) continue;

      const analysisUrl = info.thumburl || info.url;
      if (!analysisUrl) continue;

      // Create 600px display URL from thumburl pattern
      const displayUrl = analysisUrl.replace(/\/(\d+)px-/, '/600px-');

      const sizeKB = ((info.size || 0) / 1024).toFixed(0);
      console.log(`      ✓ ${sizeKB}KB`);

      images.push({ analysisUrl, displayUrl });
      if (images.length >= count) break;
    }

    console.log(`      → Returning ${images.length} dual-URL images`);
    return images;

  } catch (e: any) {
    console.warn(`      ⚠️ Wikimedia fetch error: ${e.message}`);
    return [];
  }
}

/** Fetch images from Pixabay with dual URLs (preview for AI, webformat for display) */
async function fetchFromPixabay(keywords: string, count = 2): Promise<DualImage[]> {
  try {
    const query = keywords.replace(/[^a-zA-Z0-9\s]/g, '').trim().split(/\s+/).slice(0, 5).join('+');
    const url = `https://pixabay.com/api/?key=${PIXABAY_KEY}&q=${query}&orientation=horizontal&per_page=${count + 2}&safesearch=true`;

    const res = await fetch(url);
    const data = await res.json();

    if (data.hits?.length > 0) {
      return data.hits.slice(0, count).map((h: any) => ({
        analysisUrl: h.previewURL,
        displayUrl: h.webformatURL
      }));
    }
  } catch (e) {
    console.warn("Pixabay fetch failed:", e);
  }
  return [];
}

/** Check if keywords suggest nature/wildlife content */
function isNatureTopic(keywords: string): boolean {
  const lower = keywords.toLowerCase();
  return NATURE_KEYWORDS.some(k => lower.includes(k));
}


/** Legacy function for backward compatibility */
export async function fetchImageCandidates(keywords: string, count = 5): Promise<string[]> {
  // NOTE: Pixabay disabled - using only Wikimedia for more accurate images
  const wiki = await fetchFromWikimedia(keywords, count);
  if (wiki.length > 0) return wiki.map(w => w.displayUrl);

  return [`https://placehold.co/800x450/27272a/71717a?text=${encodeURIComponent(keywords.slice(0, 20))}`];
}

/** Result from AI image analysis */
interface ImageSelectionResult {
  selectedIndex: number | null;  // null = none appropriate
  suggestedKeyword?: string;     // alternate keyword to try
  selectedUrl?: string;          // URL for display
}

/** Analyze images with AI using PARALLEL Base64 conversion */
async function analyzeImagesWithAI(
  images: DualImage[],
  slideTitle: string,
  slideContext: string,
  keywords: string,
  allowKeywordSuggestion: boolean = true
): Promise<ImageSelectionResult> {
  console.log(`\n   🔍 AI Analysis for: "${slideTitle.slice(0, 40)}..."`);
  console.log(`      Candidates: ${images.length} images`);

  if (images.length === 0) {
    return { selectedIndex: null };
  }

  try {
    // PARALLEL Base64 conversion - major speed improvement
    const conversionStart = Date.now();
    console.log(`      ⚡ Starting PARALLEL image conversion...`);

    const results = await Promise.allSettled(
      images.map(img => urlToBase64Part(img.analysisUrl))
    );

    const validParts: { part: any; displayUrl: string; index: number }[] = [];
    results.forEach((result, i) => {
      if (result.status === 'fulfilled' && result.value) {
        validParts.push({ part: result.value, displayUrl: images[i].displayUrl, index: i });
      }
    });

    const conversionTime = ((Date.now() - conversionStart) / 1000).toFixed(1);
    console.log(`      📊 Parallel conversion: ${conversionTime}s (${validParts.length}/${images.length} success)`);

    if (validParts.length === 0) {
      console.log(`      → Failed to load any images`);
      return { selectedIndex: null, suggestedKeyword: allowKeywordSuggestion ? keywords : undefined };
    }

    // Build multimodal content
    const contents: any[] = [
      { text: `Select the best image for an educational slide about: "${slideTitle}"
Keywords: "${keywords}"

` }
    ];

    validParts.forEach((item, i) => {
      contents.push({ text: `Image ${i + 1}: ` });
      contents.push(item.part);
      contents.push({ text: '\n' });
    });

    if (allowKeywordSuggestion) {
      contents.push({
        text: `\nWhich image best represents "${slideTitle}"?
RESPOND:
DECISION: SELECTED or NONE
SELECTED_NUMBER: [1-${validParts.length}] or 0
ALT_KEYWORD: [if NONE, 3-5 word search term]`
      });
    } else {
      contents.push({
        text: `\nPick the best image (even if imperfect).
SELECTED: [number]`
      });
    }

    await rateLimitImageAnalysis();

    const response = await ai.models.generateContent({
      model: MODELS.IMAGE_ANALYSIS,
      contents: contents
    });

    const responseText = response.text || "";
    console.log(`      📝 AI: ${responseText.split('\n')[0]}`);

    // Parse response
    if (allowKeywordSuggestion) {
      const decisionMatch = responseText.match(/DECISION:\s*(SELECTED|NONE)/i);
      const selectedMatch = responseText.match(/SELECTED_NUMBER:\s*(\d+)/i);
      const altKeywordMatch = responseText.match(/ALT_KEYWORD:\s*([^\n]+)/i);

      if (decisionMatch?.[1]?.toUpperCase() === 'NONE') {
        const suggestedKeyword = altKeywordMatch?.[1]?.trim()?.replace(/^["']+|["']+$/g, '');
        if (suggestedKeyword && suggestedKeyword.length > 0 && suggestedKeyword.toLowerCase() !== 'empty') {
          console.log(`      🔄 No match. AI suggests: "${suggestedKeyword}"`);
          return { selectedIndex: null, suggestedKeyword };
        }
      }

      const idx = selectedMatch ? parseInt(selectedMatch[1], 10) - 1 : -1;
      if (idx >= 0 && idx < validParts.length) {
        console.log(`      ✅ Selected image ${idx + 1}`);
        return { selectedIndex: validParts[idx].index, selectedUrl: validParts[idx].displayUrl };
      }
    } else {
      const match = responseText.match(/SELECTED:\s*(\d)/i);
      const idx = match ? parseInt(match[1], 10) - 1 : 0;
      if (idx >= 0 && idx < validParts.length) {
        console.log(`      ✅ Selected image ${idx + 1}`);
        return { selectedIndex: validParts[idx].index, selectedUrl: validParts[idx].displayUrl };
      }
    }

    // Fallback: first image
    console.log(`      → Using first available image`);
    return { selectedIndex: validParts[0].index, selectedUrl: validParts[0].displayUrl };

  } catch (e) {
    console.warn(`      ⚠️ AI selection failed:`, e);
    return { selectedIndex: 0, selectedUrl: images[0].displayUrl };
  }
}

/** Get placeholder image URL */
function getPlaceholderUrl(keywords: string): string {
  return `https://placehold.co/800x450/27272a/71717a?text=${encodeURIComponent(keywords.slice(0, 20))}`;
}

/**
 * OPTIMIZED image selection with parallel fetching and caching.
 *
 * Flow:
 * 1. Check cache first
 * 2. Fetch Wikimedia + Pixabay IN PARALLEL (3+2 images)
 * 3. AI analyzes all candidates at once
 * 4. If rejected, retry with AI-suggested keyword (1 retry max)
 */
export async function selectBestImage(
  slideTitle: string,
  slideContext: string,
  keywords: string = ""
): Promise<string> {
  const cacheKey = `${keywords.toLowerCase().trim()}`;

  // Check cache first
  if (imageCache.has(cacheKey)) {
    console.log(`📷 Cache hit for: "${keywords}"`);
    return imageCache.get(cacheKey)!;
  }

  console.log(`\n📷 Image Selection for: "${slideTitle}"`);
  console.log(`   Keywords: "${keywords}"`);

  let currentKeywords = keywords;
  const failedKeywords: string[] = []; // Track what didn't work

  // Up to 4 attempts (original + 3 retries with AI-suggested keywords)
  for (let attempt = 1; attempt <= 4; attempt++) {
    console.log(`\n   🔍 Attempt ${attempt}: (${currentKeywords})`);


    // PARALLEL fetch from both sources
    // NOTE: Pixabay disabled - using only Wikimedia for more accurate images
    const wikiImages = await fetchFromWikimedia(currentKeywords, 5);

    // All candidates from Wikimedia only
    const allImages: DualImage[] = [...wikiImages];
    console.log(`   📋 Total candidates: ${allImages.length} (Wikimedia only)`);

    if (allImages.length === 0) {
      console.log(`   ⚠️ No images found for "${currentKeywords}"`);
      failedKeywords.push(currentKeywords);

      // Ask AI to suggest alternative keywords (with context of what already failed)
      if (attempt < 4) {
        try {
          const failedList = failedKeywords.join('", "');
          const suggestionResponse = await ai.models.generateContent({
            model: MODELS.CONSULTANT,
            contents: `Finding images from Wikimedia Commons for: ${slideTitle}
Context: ${slideContext.slice(0, 200)}

FAILED SEARCHES (returned 0 results): "${failedList}"

These keywords didn't work. Suggest ONE different search phrase (2-4 words, no commas).
Try a more specific real object, historical photo, or well-known visual.
Reply with ONLY the search phrase, nothing else.`,
            config: { thinkingConfig: { thinkingBudget: 0 } }
          });
          const suggestion = suggestionResponse.text?.trim();
          if (suggestion && !failedKeywords.includes(suggestion) && !suggestion.includes(',')) {
            console.log(`   💡 AI suggests: "${suggestion}"`);
            currentKeywords = suggestion;
          }
        } catch (e) {
          console.log(`   ⚠️ Could not get AI suggestion`);
        }
      }
      continue;
    }

    // AI analysis with parallel Base64 conversion
    const result = await analyzeImagesWithAI(
      allImages,
      slideTitle,
      slideContext,
      currentKeywords,
      attempt === 1  // Allow keyword suggestion only on first attempt
    );

    if (result.selectedUrl) {
      console.log(`   ✅ Selected image!`);
      imageCache.set(cacheKey, result.selectedUrl);  // Cache the result
      return result.selectedUrl;
    }

    // Use AI-suggested keyword for retry
    if (result.suggestedKeyword && result.suggestedKeyword !== currentKeywords) {
      console.log(`   💡 Retrying with: "${result.suggestedKeyword}"`);
      currentKeywords = result.suggestedKeyword;
    } else {
      break;  // No new keyword, stop retrying
    }
  }

  // Fallback to placeholder
  console.log(`   ⚠️ Using placeholder`);
  const placeholder = getPlaceholderUrl(keywords);
  imageCache.set(cacheKey, placeholder);
  return placeholder;
}

// ============================================
// 1. CURRICULUM GENERATION
// ============================================

const CURRICULUM_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    overview: { type: Type.STRING },
    description: { type: Type.STRING },
    learningGoals: { type: Type.ARRAY, items: { type: Type.STRING } },
    modules: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          slides: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                title: { type: Type.STRING },
                description: { type: Type.STRING }
              },
              required: ["id", "title", "description"]
            }
          }
        },
        required: ["id", "title", "description", "slides"]
      }
    }
  },
  required: ["title", "overview", "description", "learningGoals", "modules"]
};

export async function generateCurriculum(
  topic: string,
  additionalContext = "",
  preferences?: { knowledgeLevel?: string; preferredDepth?: string; customInstructions?: string }
): Promise<CurriculumData> {
  console.log(`\n📚 Generating curriculum for: "${topic}"...`);
  const startTime = performance.now();

  // Build personalization section from preferences
  const depthMapping: Record<string, number> = {
    'quick': 3,
    'standard': 4,
    'deep': 5,
    'comprehensive': 6
  };

  const targetModules = preferences?.preferredDepth ? depthMapping[preferences.preferredDepth] || 4 : null;

  const personalizationSection = preferences ? `
=== LEARNER PREFERENCES ===
Knowledge Level: ${preferences.knowledgeLevel || 'intermediate'}
${targetModules ? `Preferred Depth: ${targetModules} modules (${preferences.preferredDepth})` : ''}
${preferences.customInstructions ? `Special Instructions: ${preferences.customInstructions}` : ''}

Adapt the content complexity and language to match their knowledge level.
` : '';

  const prompt = `Create a curriculum for learning about: "${topic}"

${additionalContext ? `User context: ${additionalContext}\n` : ""}
${personalizationSection}
=== STRUCTURE ===
${targetModules ? `Create exactly ${targetModules} modules based on user preference.` : `Decide the appropriate DEPTH based on topic complexity and user context:
- 3 modules: Quick overview, simple curiosity
- 4 modules: Standard learning
- 5 modules: In-depth study
- 6 modules: Comprehensive mastery`}

MINIMUM: 3 modules | MAXIMUM: 6 modules
Each module: 3-5 slides covering focused concepts

=== PHILOSOPHY ===
Create a genuine learning journey:
- Build understanding progressively
- Connect concepts naturally
- Make each module feel purposeful
- Let the topic guide the structure (no forced formulas)

=== OUTPUT FORMAT ===
{
  "title": "Engaging course title",
  "overview": "2-3 sentences describing what the learner will achieve",
  "description": "Brief tagline",
  "learningGoals": ["Goal 1", "Goal 2", "Goal 3", "Goal 4", "Goal 5"],
  "modules": [
    {
      "id": "m1",
      "title": "Module Title",
      "description": "What this module covers and why it matters",
      "slides": [
        {"id": "m1s1", "title": "Slide Title", "description": "What this slide teaches"}
      ]
    }
  ]
}

Return ONLY valid JSON.`;

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: MODELS.CURRICULUM,
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 0 },
        // Enable Google Search grounding for up-to-date information
        tools: [{ googleSearch: {} }]
      }
    });

    if (!response.text) throw new Error("No curriculum generated");

    const data = JSON.parse(cleanJsonResponse(response.text)) as CurriculumData;
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);

    console.log(`✅ CURRICULUM (${elapsed}s): "${data.title}"`);
    console.log(`   ${data.modules.length} modules, ${data.learningGoals?.length || 0} goals`);

    return data;
  });
}

export async function refineCurriculum(
  currentCurriculum: CurriculumData,
  userFeedback: string,
  conversationHistory: { role: string; parts: { text: string }[] }[] = []
): Promise<{ curriculum: CurriculumData; response: string }> {
  const prompt = `You are refining an educational curriculum based on user feedback.

Current curriculum: ${JSON.stringify(currentCurriculum, null, 2)}

User feedback: "${userFeedback}"

Either update the curriculum based on feedback, or explain why the current structure is already optimal.

Return JSON:
{
  "response": "Your conversational response to the user",
  "curriculum": { /* updated curriculum or null if no changes */ }
}`;

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: MODELS.CONTENT,
      contents: prompt,
      config: {}
    });

    const data = JSON.parse(cleanJsonResponse(response.text || "{}"));
    return {
      curriculum: data.curriculum || currentCurriculum,
      response: data.response || "I've reviewed your feedback."
    };
  });
}

export async function adjustCurriculum(
  currentCurriculum: CurriculumData,
  adjustmentPrompt: string
): Promise<CurriculumData> {
  const prompt = `Adjust this curriculum based on the request.

Current: ${JSON.stringify(currentCurriculum, null, 2)}

Request: "${adjustmentPrompt}"

Return the updated curriculum as JSON with same structure.`;

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: MODELS.CONTENT,
      contents: prompt,
      config: {}
    });

    return JSON.parse(cleanJsonResponse(response.text || "{}")) as CurriculumData;
  });
}

// ============================================
// 2. MODULE CONTENT GENERATION
// ============================================

export async function generateModuleContent(
  courseTitle: string,
  moduleTitle: string,
  moduleDescription: string,
  slideTitles: string[],
  previousContext = "",
  onImageReady?: (slideIndex: number, blockIndex: number, imageUrl: string) => void
): Promise<ModuleContent> {
  console.log(`\n🎯 Generating: "${moduleTitle}" (${slideTitles.length} slides)...`);
  const startTime = performance.now();

  const slidesList = slideTitles.map((t, i) => `${i + 1}. ${t}`).join('\n');
  const totalSlides = slideTitles.length + 3; // Module Intro + Content slides + Summary + Exercise

  // Define strict schemas for each block type
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

Each slide's last paragraph should leave something unresolved or hint at something fascinating ahead - not by saying "next we'll see" but by genuinely leaving the reader wanting more.

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
        // Enable Google Search grounding for up-to-date information
        tools: [{ googleSearch: {} }]
      }
    });

    if (!response.text) throw new Error("No content generated");

    let data = JSON.parse(cleanJsonResponse(response.text));

    // Handle array response
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
          // Add image block with null imageUrl (loading state)
          const imageBlock = { ...block, imageUrl: null as string | null };
          processedBlocks.push(imageBlock);

          // Track for background processing
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

    // If no callback provided, process images synchronously (blocking mode)
    if (!onImageReady) {
      for (const imgBlock of imageBlocks) {
        // selectBestImage now handles tiered Wikimedia→Pixabay fetching internally
        const imageUrl = await selectBestImage(imgBlock.slideTitle, imgBlock.slideContext, imgBlock.keywords);

        // Update the block in processedSlides
        const slide = processedSlides[imgBlock.slideIdx];
        if (slide && slide.blocks[imgBlock.blockIdx]) {
          (slide.blocks[imgBlock.blockIdx] as any).imageUrl = imageUrl;
        }
      }
    } else {
      // Process images in background and notify via callback
      // Don't await - let it run async
      (async () => {
        for (const imgBlock of imageBlocks) {
          try {
            // selectBestImage now handles tiered Wikimedia→Pixabay fetching internally
            const imageUrl = await selectBestImage(imgBlock.slideTitle, imgBlock.slideContext, imgBlock.keywords);

            // Notify caller that image is ready
            onImageReady(imgBlock.slideIdx, imgBlock.blockIdx, imageUrl);
          } catch (err) {
            console.warn(`Failed to load image for slide ${imgBlock.slideIdx}:`, err);
            // Return placeholder on error
            onImageReady(imgBlock.slideIdx, imgBlock.blockIdx, getPlaceholderUrl(imgBlock.keywords));
          }
        }
      })();
    }

    return { moduleId: "", slides: processedSlides };
  });
}

// ============================================
// 3. TEXT-TO-SPEECH
// ============================================

export async function generateSpeech(text: string): Promise<string> {
  const cleanText = text.slice(0, 2000).replace(/[#*_`]/g, '');

  const response = await ai.models.generateContent({
    model: MODELS.TTS,
    contents: [{ parts: [{ text: cleanText }] }],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } }
      }
    }
  });

  const audioPart = response.candidates?.[0]?.content?.parts?.find(
    (p: any) => p.inlineData?.mimeType?.startsWith("audio/")
  );

  if (!audioPart?.inlineData?.data) throw new Error("No audio generated");
  return audioPart.inlineData.data;
}

// ============================================
// 4. CONSULTANT & CHAT
// ============================================

/**
 * Generate consultant reply with streaming support.
 * AI decides when to trigger curriculum generation (no hardcoded phrases).
 */
export async function generateConsultantReply(
  history: { role: string; parts: { text: string }[] }[],
  message: string,
  isInitialMessage = false,
  onStream?: (chunk: string) => void
): Promise<ConsultantResult> {
  const turnCount = history.length;

  // Consultant prompt - AI decides when ready to generate
  const systemPrompt = `You are a friendly curriculum consultant helping users figure out what they want to learn.

=== YOUR STYLE ===
- Brief and natural (1-3 sentences usually)
- Ask clarifying questions only when needed
- When you understand their needs, offer to create their curriculum

=== RESPONSE FORMAT ===
You MUST respond in valid JSON:
{
  "message": "Your natural response to the user",
  "ready_to_generate": false
}

When the user confirms they want the curriculum generated (yes, sure, ok, etc.) OR when you feel ready and they agree:
{
  "message": "Great! Let me create that for you.",
  "ready_to_generate": true,
  "context": {
    "topic": "Main topic they want to learn",
    "interests": ["specific subtopics or aspects they mentioned"],
    "level": "beginner/intermediate/advanced (based on conversation)",
    "goals": "What they want to achieve with this knowledge"
  }
}

${isInitialMessage ? `
This is their first message. Respond warmly and ask what specifically interests them about this topic.
` : turnCount < 8 ? `
Continue naturally. Only set ready_to_generate: true when they explicitly confirm.
` : `
You've been chatting a while. Summarize and offer to generate.
`}`;

  const contents = [
    { role: "user", parts: [{ text: systemPrompt }] },
    ...history,
    { role: "user", parts: [{ text: message }] }
  ];

  try {
    // Use streaming if callback provided
    if (onStream) {
      let fullText = '';

      const streamResponse = await ai.models.generateContentStream({
        model: MODELS.CONSULTANT,
        contents,
        config: {}
      });

      for await (const chunk of streamResponse) {
        const chunkText = chunk.text || '';
        fullText += chunkText;
        onStream(chunkText);
      }

      return parseConsultantResponse(fullText);
    } else {
      // Non-streaming fallback
      const response = await ai.models.generateContent({
        model: MODELS.CONSULTANT,
        contents,
        config: {}
      });

      return parseConsultantResponse(response.text || '');
    }
  } catch (e) {
    console.error('Consultant error:', e);
    return { text: "Sorry, I had trouble responding. Could you try again?", shouldGenerateCurriculum: false };
  }
}

/** Parse JSON response from consultant */
function parseConsultantResponse(rawText: string): ConsultantResult {
  try {
    // Try to extract JSON from response
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);

      return {
        text: parsed.message || parsed.response || rawText,
        shouldGenerateCurriculum: parsed.ready_to_generate === true,
        curriculumContext: parsed.context ? {
          topic: parsed.context.topic || '',
          interests: parsed.context.interests,
          knowledgeLevel: parsed.context.level,
          goals: parsed.context.goals
        } : undefined
      };
    }
  } catch (e) {
    // JSON parsing failed, use raw text
  }

  // Fallback: return raw text as message
  const cleanText = rawText.replace(/\*\*/g, '').replace(/\*/g, '').replace(/_/g, '').trim();
  return { text: cleanText, shouldGenerateCurriculum: false };
}

export async function generateChatResponse(
  history: { role: string; parts: { text: string }[] }[],
  message: string
): Promise<string> {
  const contents = [
    {
      role: "user",
      parts: [{ text: "You are a helpful tutor. Answer questions clearly and concisely. If asked about the current topic, use context from the conversation." }]
    },
    ...history,
    { role: "user", parts: [{ text: message }] }
  ];

  const response = await ai.models.generateContent({
    model: MODELS.CHAT,
    contents,
    config: {}
  });

  return response.text || "I'm not sure how to answer that.";
}

// ============================================
// 5. USER ANSWER EVALUATION
// ============================================

export interface AnswerEvaluation {
  isCorrect: boolean;
  score: number;        // 0-100
  feedback: string;
}

/**
 * Evaluate a user's answer to an open-ended question using AI.
 * Used for short_answer, reflection, and activity type questions.
 */
export async function evaluateUserAnswer(
  context: string,      // Slide/module context
  question: string,     // The question asked
  userAnswer: string,   // User's response
  expectedAnswer?: string // Expected answer if any
): Promise<AnswerEvaluation> {
  const prompt = `Evaluate this student's answer.

CONTEXT: ${context}
QUESTION: ${question}
STUDENT'S ANSWER: ${userAnswer}
${expectedAnswer ? `EXPECTED ANSWER: ${expectedAnswer}` : ''}

=== EVALUATION ===
Judge the answer on:
1. Correctness - Is the core understanding right?
2. Completeness - Did they address the question fully?
3. Understanding - Do they demonstrate genuine comprehension?

For reflection/open-ended questions, be generous - there's no single right answer.
For factual questions, be accurate but encouraging.

Respond in JSON:
{
  "isCorrect": true/false,
  "score": 0-100,
  "feedback": "Brief, constructive feedback (2-3 sentences max)"
}

Return ONLY valid JSON.`;

  try {
    const response = await ai.models.generateContent({
      model: MODELS.ANSWER_EVAL,
      contents: prompt,
      config: {}
    });

    const data = JSON.parse(cleanJsonResponse(response.text || '{}'));
    return {
      isCorrect: data.isCorrect ?? false,
      score: data.score ?? 0,
      feedback: data.feedback ?? 'Unable to evaluate your answer.'
    };
  } catch (error) {
    console.error('Answer evaluation failed:', error);
    return {
      isCorrect: false,
      score: 50,
      feedback: 'Your answer was recorded. Keep exploring this topic!'
    };
  }
}

// ============================================
// 6. TEXT-TO-SPEECH GENERATION
// ============================================

/** Extract readable text from a slide's blocks for TTS */
function extractTextFromSlide(slide: { title: string; blocks: any[] }): string {
  const parts: string[] = [slide.title];

  for (const block of slide.blocks) {
    switch (block.type) {
      case 'text':
        parts.push(block.content);
        break;
      case 'fun_fact':
        parts.push(`Here's an interesting fact: ${block.fact}`);
        break;
      case 'notes_summary':
        if (block.summary) parts.push(block.summary);
        if (block.points?.length) {
          parts.push('Key points to remember:');
          parts.push(...block.points);
        }
        break;
      case 'image':
        if (block.caption) parts.push(block.caption);
        break;
      // Skip quiz, fill_blank, and other interactive blocks for TTS
    }
  }

  return parts.join('. ').replace(/\.\./g, '.').slice(0, 5000); // Limit to 5000 chars
}

/** Convert WAV options from MIME type */
interface WavOptions {
  numChannels: number;
  sampleRate: number;
  bitsPerSample: number;
}

function parseMimeType(mimeType: string): WavOptions {
  const [fileType, ...params] = mimeType.split(';').map(s => s.trim());
  const [, format] = fileType.split('/');

  const options: Partial<WavOptions> = { numChannels: 1 };

  if (format && format.startsWith('L')) {
    const bits = parseInt(format.slice(1), 10);
    if (!isNaN(bits)) options.bitsPerSample = bits;
  }

  for (const param of params) {
    const [key, value] = param.split('=').map(s => s.trim());
    if (key === 'rate') options.sampleRate = parseInt(value, 10);
  }

  return options as WavOptions;
}

/** Create WAV header for raw audio data */
function createWavHeader(dataLength: number, options: WavOptions): Uint8Array {
  const { numChannels, sampleRate, bitsPerSample } = options;
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);

  // RIFF header
  new TextEncoder().encode('RIFF').forEach((b, i) => view.setUint8(i, b));
  view.setUint32(4, 36 + dataLength, true);
  new TextEncoder().encode('WAVE').forEach((b, i) => view.setUint8(8 + i, b));

  // fmt subchunk
  new TextEncoder().encode('fmt ').forEach((b, i) => view.setUint8(12 + i, b));
  view.setUint32(16, 16, true); // Subchunk1Size
  view.setUint16(20, 1, true);  // AudioFormat (PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data subchunk
  new TextEncoder().encode('data').forEach((b, i) => view.setUint8(36 + i, b));
  view.setUint32(40, dataLength, true);

  return new Uint8Array(buffer);
}

/** Convert base64 audio data to WAV blob URL */
function convertToWavBlobUrl(rawData: string, mimeType: string): string {
  const options = parseMimeType(mimeType);
  const rawBytes = Uint8Array.from(atob(rawData), c => c.charCodeAt(0));
  const wavHeader = createWavHeader(rawBytes.length, options);

  const wavData = new Uint8Array(wavHeader.length + rawBytes.length);
  wavData.set(wavHeader, 0);
  wavData.set(rawBytes, wavHeader.length);

  const blob = new Blob([wavData], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

/** Generate TTS audio for a single slide */
export async function generateTTSForSlide(
  slide: { title: string; blocks: any[] }
): Promise<string | null> {
  // Skip if TTS is disabled
  if (!TTS_ENABLED) return null;

  const text = extractTextFromSlide(slide);
  if (!text || text.length < 10) return null;

  console.log(`🔊 Generating TTS for: "${slide.title.slice(0, 40)}..."`);

  try {
    const response = await ai.models.generateContentStream({
      model: MODELS.TTS,
      config: {
        responseModalities: ['audio'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: 'Charon'
            }
          }
        }
      },
      contents: [{ role: 'user', parts: [{ text }] }]
    });

    // Collect all audio chunks
    const audioChunks: string[] = [];
    let mimeType = 'audio/L16;rate=24000';

    for await (const chunk of response) {
      const inlineData = chunk.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (inlineData?.data) {
        audioChunks.push(inlineData.data);
        if (inlineData.mimeType) mimeType = inlineData.mimeType;
      }
    }

    if (audioChunks.length === 0) {
      console.warn(`   ⚠️ No audio generated for: ${slide.title}`);
      return null;
    }

    // Combine all chunks and convert to WAV blob URL
    const combinedData = audioChunks.join('');
    const blobUrl = convertToWavBlobUrl(combinedData, mimeType);
    console.log(`   ✅ TTS ready for: ${slide.title.slice(0, 30)}...`);
    return blobUrl;

  } catch (error) {
    console.error(`TTS generation failed for ${slide.title}:`, error);
    return null;
  }
}

/** Generate TTS for all slides in a module (parallel) */
export async function generateTTSForModule(
  slides: { title: string; blocks: any[] }[]
): Promise<(string | null)[]> {
  console.log(`🔊 Generating TTS for ${slides.length} slides...`);
  const startTime = performance.now();

  const results = await Promise.all(
    slides.map(slide => generateTTSForSlide(slide))
  );

  const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
  const successCount = results.filter(r => r !== null).length;
  console.log(`✅ TTS complete: ${successCount}/${slides.length} slides (${elapsed}s)`);

  return results;
}

