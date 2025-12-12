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
  CONSULTANT: "gemma-3-27b-it",       // Pre-curriculum chat
  CURRICULUM: "gemini-robotics-er-1.5-preview",       // Curriculum structure generation
  CONTENT: "gemini-robotics-er-1.5-preview", //gemini-robotics-er-1.5-preview,          // Slide content generation
  CHAT: "gemma-3-27b-it",             // Learning view chat assistant
  IMAGE_ANALYSIS: "gemma-3-12b-it",   // Image selection
  ANSWER_EVAL: "gemma-3-12b-it",      // User answer evaluation
  TTS: "gemini-2.5-flash-preview-tts" // Text-to-speech
};


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

/** Convert image URL to Base64 with comprehensive logging and error handling */
async function urlToBase64Part(url: string, retries = 2): Promise<any> {
  const startTime = Date.now();
  const urlShort = url.slice(-50);

  try {
    console.log(`      [Fetch] ${urlShort}`);

    // 1. Fetch with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

    const response = await fetch(url, {
      signal: controller.signal,
      mode: 'cors',
      cache: 'default'
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // 2. Validate content type
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      throw new Error(`Invalid content-type: ${contentType}`);
    }

    // 3. Download image data
    const arrayBuffer = await response.arrayBuffer();
    const sizeKB = (arrayBuffer.byteLength / 1024).toFixed(1);
    console.log(`      [Convert] ${sizeKB}KB → base64`);

    if (arrayBuffer.byteLength < 500) {
      throw new Error(`Image too small: ${arrayBuffer.byteLength} bytes`);
    }

    // 4. Convert to base64 (chunked for large images)
    let base64: string;
    if (typeof Buffer !== 'undefined') {
      // Node.js
      base64 = Buffer.from(arrayBuffer).toString('base64');
    } else {
      // Browser - use chunked conversion for large images to avoid call stack size exceeded
      const bytes = new Uint8Array(arrayBuffer);
      if (bytes.length > 100000) {
        // > 100KB: chunk into smaller pieces to avoid stack overflow
        const chunks: string[] = [];
        const chunkSize = 50000; // 50KB chunks
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.slice(i, i + chunkSize);
          chunks.push(String.fromCharCode.apply(null, Array.from(chunk)));
        }
        base64 = btoa(chunks.join(''));
      } else {
        base64 = btoa(String.fromCharCode(...bytes));
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`      [Success] ${elapsed}s`);

    return {
      inlineData: {
        data: base64,
        mimeType: contentType.split(';')[0]
      }
    };

  } catch (error: any) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    // Detailed error classification
    let errorType = 'Error';
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      errorType = 'Timeout';
    } else if (error.message?.includes('HTTP')) {
      errorType = 'HTTP';
    } else if (error.message?.includes('content-type')) {
      errorType = 'InvalidType';
    }

    console.warn(`      [${errorType}] ${elapsed}s - ${error.message}`);

    // Retry with exponential backoff
    if (retries > 0 && errorType !== 'InvalidType') {
      const backoffMs = (3 - retries) * 1500; // 0ms, 1500ms, 3000ms
      if (backoffMs > 0) {
        console.log(`      [Retry] Waiting ${backoffMs}ms (${3 - retries}/2)`);
        await new Promise(r => setTimeout(r, backoffMs));
      }
      return urlToBase64Part(url, retries - 1);
    }

    return null;
  }
}

// ============================================
// IMAGE HANDLING
// ============================================

/** Fetch images from Wikimedia Commons (primary source) - optimized for reliability */
async function fetchFromWikimedia(keywords: string, count = 5): Promise<string[]> {
  try {
    console.log(`\n   🔎 Wikimedia search: "${keywords}"`);

    // Clean keywords (remove quotes from AI suggested keywords)
    const cleanKeywords = keywords.replace(/["']+/g, '').trim();

    const params = new URLSearchParams({
      origin: '*',
      action: 'query',
      generator: 'search',
      gsrsearch: `${cleanKeywords} filetype:bitmap -fileres:0 `, // Curated images with 'depicts' metadata
      gsrnamespace: '6', // File namespace
      gsrlimit: String(Math.min(count + 5, 10)), // Fewer candidates needed
      prop: 'imageinfo',
      iiprop: 'url|mime|size|mediatype', // Get full metadata
      iiurlwidth: '400', // Medium thumbnails for good detail (~30-80KB)
      format: 'json'
    });

    const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`);
    const data = await res.json();

    if (!data.query?.pages) {
      console.log(`      ℹ️ No results from Wikimedia`);
      return [];
    }

    const urls: string[] = [];
    const pages = Object.values(data.query.pages) as any[];

    console.log(`      📋 Found ${pages.length} candidates, filtering...`);

    for (const page of pages) {
      const info = page.imageinfo?.[0];
      if (!info) continue;

      // Filter 1: MIME type - only accept actual image formats
      const mime = info.mime || '';
      if (!mime.startsWith('image/')) {
        continue; // Silent skip for non-images
      }

      // Get URL - prefer sized thumbnail
      const imageUrl = info.thumburl || info.url;
      if (!imageUrl) continue;

      const width = info.width || 0;
      const height = info.height || 0;
      const sizeKB = ((info.size || 0) / 1024).toFixed(0);
      console.log(`      ✓ ${width}x${height}, ${sizeKB}KB`);
      urls.push(imageUrl);

      if (urls.length >= count) break;
    }

    console.log(`      → Returning ${urls.length} URLs`);
    return urls;

  } catch (e: any) {
    console.warn(`      ⚠️ Wikimedia fetch error: ${e.message}`);
    return [];
  }
}

/** Pixabay image with dual URLs */
interface PixabayImage {
  analysisUrl: string;  // previewURL - low res for AI
  displayUrl: string;   // webformatURL - high res for frontend
}

/** Fetch images from Pixabay with dual URLs for analysis/display */
async function fetchFromPixabay(keywords: string, count = 3): Promise<PixabayImage[]> {
  try {
    const query = keywords.replace(/[^a-zA-Z0-9\s]/g, '').trim().split(/\s+/).slice(0, 3).join('+');
    const url = `https://pixabay.com/api/?key=${PIXABAY_KEY}&q=${query}&orientation=horizontal&per_page=${count + 3}&safesearch=true`;

    const res = await fetch(url);
    const data = await res.json();

    if (data.hits?.length > 0) {
      return data.hits.slice(0, count).map((h: any) => ({
        analysisUrl: h.previewURL,    // Small URL for AI analysis
        displayUrl: h.webformatURL    // Large URL for frontend display
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
export async function fetchImageCandidates(keywords: string, count = 4): Promise<string[]> {
  const wiki = await fetchFromWikimedia(keywords, count);
  if (wiki.length > 0) return wiki;

  const pixabay = await fetchFromPixabay(keywords, 3);
  if (pixabay.length > 0) return pixabay.map(p => p.displayUrl);

  return [`https://placehold.co/800x450/27272a/71717a?text=${encodeURIComponent(keywords.slice(0, 20))}`];
}

/** Result from AI image analysis */
interface ImageSelectionResult {
  selectedIndex: number | null;  // null = none appropriate
  suggestedKeyword?: string;     // alternate keyword to try
  selectedUrl?: string;          // URL for display
}

/** Analyze images with AI and get selection or alternate keyword suggestion */
async function analyzeImagesWithAI(
  imageUrls: string[],
  displayUrls: string[],  // Separate array for actual display URLs
  slideTitle: string,
  slideContext: string,
  keywords: string,
  allowKeywordSuggestion: boolean = true
): Promise<ImageSelectionResult> {
  console.log(`\n   🔍 Image Selection for: "${slideTitle.slice(0, 40)}..."`);
  console.log(`      Keywords: "${keywords}"`);
  console.log(`      Candidates: ${imageUrls.length} images`);

  if (imageUrls.length === 0) {
    return { selectedIndex: null };
  }

  if (imageUrls.length === 1) {
    console.log(`      → Using only available image`);
    return { selectedIndex: 0, selectedUrl: displayUrls[0] };
  }

  try {
    // Convert URLs to Base64 parts sequentially
    const validParts: { part: any; displayUrl: string; index: number }[] = [];
    const conversionStart = Date.now();

    console.log(`\n      Starting sequential image conversion...`);

    for (let i = 0; i < imageUrls.length; i++) {
      console.log(`\n      [${i + 1}/${imageUrls.length}] Processing...`);

      const part = await urlToBase64Part(imageUrls[i]);
      if (part) {
        validParts.push({ part, displayUrl: displayUrls[i], index: i });
      }

      // Small delay between fetches
      if (i < imageUrls.length - 1) {
        await new Promise(r => setTimeout(r, 50));
      }
    }

    const conversionTime = ((Date.now() - conversionStart) / 1000).toFixed(1);
    console.log(`\n      📊 Conversion complete in ${conversionTime}s: ${validParts.length}/${imageUrls.length}`);

    if (validParts.length === 0) {
      console.log(`      → Failed to load any images`);
      return { selectedIndex: null, suggestedKeyword: allowKeywordSuggestion ? keywords : undefined };
    }

    // Build multimodal content
    const contents: any[] = [
      { text: `You are selecting the best image for an educational slide.

SLIDE TOPIC: "${slideTitle}"
SEARCH KEYWORDS: "${keywords}"
CONTEXT: ${slideContext || 'General educational content'}

I have ${validParts.length} candidate images. Analyze each one.

` }
    ];

    validParts.forEach((item, i) => {
      contents.push({ text: `Image ${i + 1}: ` });
      contents.push(item.part);
      contents.push({ text: '\n\n' });
    });

    if (allowKeywordSuggestion) {
      contents.push({
        text: `TASK: Select the BEST image for this educational slide.

For EACH image, describe what you see (1 sentence).
Then decide: Is ANY image appropriate for the topic "${slideTitle}"?

RESPOND IN THIS EXACT FORMAT:
Image 1: [what you see]
Image 2: [what you see]
...
DECISION: [SELECTED or NONE]
SELECTED_NUMBER: [number if selected, or 0 if none]
ALT_KEYWORD: [if NONE, suggest a better 2-4 word search keyword, otherwise leave empty]`
      });
    } else {
      contents.push({
        text: `TASK: Select the BEST image for this educational slide.
Pick the best one, even if not perfect.

RESPOND IN THIS EXACT FORMAT:
SELECTED: [number] because [brief reason]`
      });
    }

    await rateLimitImageAnalysis();

    const response = await ai.models.generateContent({
      model: MODELS.IMAGE_ANALYSIS,
      contents: contents
    });

    const responseText = response.text || "";

    // Log the AI's analysis for debugging
    console.log(`      📝 AI Response:`);
    responseText.split('\n').slice(0, 10).forEach(line => {
      if (line.trim()) console.log(`         ${line.trim()}`);
    });

    // Parse response
    if (allowKeywordSuggestion) {
      const decisionMatch = responseText.match(/DECISION:\s*(SELECTED|NONE)/i);
      const selectedMatch = responseText.match(/SELECTED_NUMBER:\s*(\d+)/i);
      const altKeywordMatch = responseText.match(/ALT_KEYWORD:\s*([^\n]+)/i);

      if (decisionMatch?.[1]?.toUpperCase() === 'NONE') {
        let suggestedKeyword = altKeywordMatch?.[1]?.trim()?.replace(/^["']+|["']+$/g, '');
        if (suggestedKeyword && suggestedKeyword.length > 0 && suggestedKeyword.toLowerCase() !== 'empty') {
          console.log(`      🔄 No suitable image. AI suggests: "${suggestedKeyword}"`);
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
    console.log(`      → Defaulting to first loaded image`);
    return { selectedIndex: validParts[0].index, selectedUrl: validParts[0].displayUrl };

  } catch (e) {
    console.warn(`      ⚠️ AI selection failed:`, e);
    return { selectedIndex: 0, selectedUrl: displayUrls[0] };
  }
}

/** Get placeholder image URL */
function getPlaceholderUrl(keywords: string): string {
  return `https://placehold.co/800x450/27272a/71717a?text=${encodeURIComponent(keywords.slice(0, 20))}`;
}

/**
 * Select the best image with Wikimedia-priority flow.
 *
 * STANDARD FLOW:
 * 1. Wikimedia 5 images → AI analysis
 * 2. If rejected → Wikimedia 5 with AI-suggested keyword
 * 3. If still rejected → Wikimedia 5 (3rd keyword) + Pixabay 3 backup
 *
 * NATURE/ANIMAL TOPICS:
 * After 1st Wikimedia try, immediately include Pixabay
 */
export async function selectBestImage(
  slideTitle: string,
  slideContext: string,
  keywords: string = ""
): Promise<string> {
  console.log(`\n📷 Image Selection for: "${slideTitle}"`);
  console.log(`   Keywords: "${keywords}"`);

  const isNature = isNatureTopic(keywords);
  let suggestedKeyword = keywords;
  let attempt = 0;

  // ATTEMPT 1: Wikimedia with original keywords
  attempt++;
  console.log(`\n   🔍 Attempt ${attempt}: Wikimedia (${keywords})`);
  const wiki1 = await fetchFromWikimedia(keywords, 5);

  if (wiki1.length > 0) {
    const result = await analyzeImagesWithAI(wiki1, wiki1, slideTitle, slideContext, keywords, true);
    if (result.selectedUrl) {
      console.log(`   ✅ Selected from Wikimedia attempt 1`);
      return result.selectedUrl;
    }
    if (result.suggestedKeyword) {
      suggestedKeyword = result.suggestedKeyword;
      console.log(`   💡 AI suggests: "${suggestedKeyword}"`);
    }
  }

  // For NATURE topics: Try Pixabay immediately after first Wikimedia failure
  if (isNature) {
    attempt++;
    console.log(`\n   � Attempt ${attempt}: Pixabay for nature topic (${keywords})`);
    const pixabay1 = await fetchFromPixabay(keywords, 3);

    if (pixabay1.length > 0) {
      const result = await analyzeImagesWithAI(
        pixabay1.map(p => p.analysisUrl),
        pixabay1.map(p => p.displayUrl),
        slideTitle, slideContext, keywords, true
      );
      if (result.selectedUrl) {
        console.log(`   ✅ Selected from Pixabay (nature topic)`);
        return result.selectedUrl;
      }
      if (result.suggestedKeyword) {
        suggestedKeyword = result.suggestedKeyword;
      }
    }
  }

  // ATTEMPT 2: Wikimedia with alternate keyword
  if (suggestedKeyword && suggestedKeyword !== keywords) {
    attempt++;
    console.log(`\n   � Attempt ${attempt}: Wikimedia (${suggestedKeyword})`);
    const wiki2 = await fetchFromWikimedia(suggestedKeyword, 5);

    if (wiki2.length > 0) {
      const result = await analyzeImagesWithAI(wiki2, wiki2, slideTitle, slideContext, suggestedKeyword, true);
      if (result.selectedUrl) {
        console.log(`   ✅ Selected from Wikimedia attempt 2`);
        return result.selectedUrl;
      }
      if (result.suggestedKeyword && result.suggestedKeyword !== suggestedKeyword) {
        suggestedKeyword = result.suggestedKeyword;
        console.log(`   💡 AI suggests: "${suggestedKeyword}"`);
      }
    }
  }

  // ATTEMPT 3: Wikimedia with 3rd keyword + Pixabay backup
  attempt++;
  console.log(`\n   🔍 Attempt ${attempt}: Wikimedia + Pixabay backup (${suggestedKeyword})`);

  const [wiki3, pixabay3] = await Promise.all([
    fetchFromWikimedia(suggestedKeyword, 5),
    fetchFromPixabay(suggestedKeyword, 3)
  ]);

  // Try Wikimedia first
  if (wiki3.length > 0) {
    const result = await analyzeImagesWithAI(wiki3, wiki3, slideTitle, slideContext, suggestedKeyword, false);
    if (result.selectedUrl) {
      console.log(`   ✅ Selected from Wikimedia attempt 3`);
      return result.selectedUrl;
    }
  }

  // Try Pixabay backup
  if (pixabay3.length > 0) {
    const result = await analyzeImagesWithAI(
      pixabay3.map(p => p.analysisUrl),
      pixabay3.map(p => p.displayUrl),
      slideTitle, slideContext, suggestedKeyword, false
    );
    if (result.selectedUrl) {
      console.log(`   ✅ Selected from Pixabay backup`);
      return result.selectedUrl;
    }
  }

  // Final fallback: Return first available image or placeholder
  console.log(`   ⚠️ No suitable image found, using fallback`);
  return wiki1[0] || wiki3[0] || pixabay3[0]?.displayUrl || getPlaceholderUrl(keywords);
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
        thinkingConfig: { thinkingBudget: 0 }
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
{ "type": "image", "keywords": "elephant africa", "caption": "African elephant in savanna", "position": "hero" }
- keywords: EXACTLY 2 words, real photographable subjects (see IMAGE KEYWORDS section)
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

=== IMAGE KEYWORDS (CRITICAL FOR SEARCH) ===
Keywords are used to search Wikimedia Commons. Use REAL, PHOTOGRAPHABLE subjects.

✅ GOOD KEYWORDS (specific, searchable):
- "solar panel" (not "renewable energy concept")
- "python snake" (not "programming language")
- "DNA helix" (not "genetics illustration")
- "factory assembly" (not "manufacturing process")
- "brain scan" (not "thinking concept")
- "coffee beans" (not "morning routine")
- "circuit board" (not "technology background")

❌ BAD KEYWORDS (abstract, unsearchable):
- "AI concept", "digital transformation", "learning journey"
- "success mindset", "growth illustration", "innovation idea"
- Any word ending in: concept, illustration, abstract, background

RULE: If you can't photograph it in real life, don't use it as a keyword.

=== SLIDE STRUCTURE (${totalSlides} SLIDES TOTAL) ===

**SLIDE 1: "${moduleTitle}" (MODULE INTRO)**
A welcoming introduction slide with:
- One hero image representing the module topic
- Text explaining what this module will cover
- Why it matters and what the learner will gain

**SLIDES 2-${slideTitles.length + 1}: CONTENT SLIDES**
${slidesList}
Each content slide should have:
- 2-4 text blocks with educational content
- 1-2 images with position "hero" or "intro"
- Optional: 1 fun_fact, quiz, or table per 2 slides

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
        thinkingConfig: { thinkingBudget: 0 }
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

export async function generateConsultantReply(
  history: { role: string; parts: { text: string }[] }[],
  message: string,
  isInitialMessage = false
): Promise<ConsultantResult> {
  const turnCount = history.length;

  // Check if user is confirming curriculum generation
  const lowerMessage = message.toLowerCase();
  const confirmationPhrases = ['yes', 'sure', 'go ahead', 'generate', 'create it', 'create the', 'okay', 'ok', 'yep', 'yeah', 'let\'s go', 'do it', 'sounds good', 'perfect', 'ready', 'go for it', 'make it', 'start', 'yo', 'cool'];
  const isConfirmation = confirmationPhrases.some(phrase => lowerMessage.includes(phrase));

  // If we previously asked for permission and user confirms
  const lastModelMessage = history.filter(h => h.role === 'model').pop()?.parts[0]?.text || '';
  const askedPermission = lastModelMessage.toLowerCase().includes('shall i') ||
                          lastModelMessage.toLowerCase().includes('want me to') ||
                          lastModelMessage.toLowerCase().includes('ready to generate') ||
                          lastModelMessage.toLowerCase().includes('create your curriculum');

  if (isConfirmation && askedPermission) {
    return {
      text: "", // No text - triggers curriculum generation
      shouldGenerateCurriculum: true
    };
  }

  // Simple, natural consultant prompt
  const systemPrompt = `You are a professional learning and curicculum consultant. Help the user figure out what they want to learn.

=== HOW TO TALK ===
- Talk normally, like a helpful friend
- Keep it brief (1-3 sentences usually)
- Don't be over-enthusiastic or theatrical
- If they're vague, ask one simple question to clarify
- If you have enough info, offer to create their curriculum

${isInitialMessage ? `
User said: "${message}"
Respond naturally. You might ask what aspect interests them, or what they're hoping to do with this knowledge.
` : turnCount < 6 ? `
Continue the conversation. When you understand roughly what they want, offer to generate their curriculum.
Don't interrogate - one question at a time, and only if needed.
` : `
You've chatted enough. Summarize and offer to create the curriculum.
`}

=== WHEN READY ===
When offering to generate, use phrases like:
- "Shall I put together a curriculum for you?"
- "Want me to create your learning path?"
- "Ready to generate it?"

Keep it natural and conversational.`;



  const contents = [
    { role: "user", parts: [{ text: systemPrompt }] },
    ...history,
    { role: "user", parts: [{ text: message }] }
  ];

  const response = await ai.models.generateContent({
    model: MODELS.CONSULTANT,
    contents,
    config: {}
  });

  let text = response.text || "";

  // Strip any markdown formatting the model might still use
  text = text.replace(/\*\*/g, '').replace(/\*/g, '').replace(/_/g, '').replace(/^[-•]\s*/gm, '').trim();

  return { text, shouldGenerateCurriculum: false };
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
