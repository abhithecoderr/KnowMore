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
const MODEL = "gemma-3-27b-it";
const SPEECH_MODEL = "gemini-2.5-flash-preview-tts";
const CHAT_MODEL = "gemma-3-27b-it";

const ai = new GoogleGenAI({ apiKey: API_KEY });

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

// Slide content types
export interface SlideBlock {
  type: "text" | "image" | "quiz" | "fun_fact" | "table";
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
      gsrsearch: `${cleanKeywords} filetype:bitmap -fileres:0`, // Only bitmap images, exclude tiny
      gsrnamespace: '6', // File namespace
      gsrlimit: String(Math.min(count + 5, 10)), // Fewer candidates needed
      prop: 'imageinfo',
      iiprop: 'url|mime|size|mediatype', // Get full metadata
      iiurlwidth: '200', // TINY thumbnails for fast conversion (~15-40KB)
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

/** Fetch images from Pixabay (fallback for nature/abstract topics) */
async function fetchFromPixabay(keywords: string, count = 5): Promise<string[]> {
  try {
    const query = keywords.replace(/[^a-zA-Z0-9\s]/g, '').trim().split(/\s+/).slice(0, 3).join('+');
    const url = `https://pixabay.com/api/?key=${PIXABAY_KEY}&q=${query}&orientation=horizontal&per_page=${count + 3}&safesearch=true`;

    const res = await fetch(url);
    const data = await res.json();

    if (data.hits?.length > 0) {
      return data.hits.slice(0, count).map((h: any) => h.webformatURL);
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

/** Fetch image candidates from appropriate source */
export async function fetchImageCandidates(keywords: string, count = 3): Promise<string[]> {
  // Use Pixabay for nature topics, Wikimedia for educational content
  if (isNatureTopic(keywords)) {
    const pixabay = await fetchFromPixabay(keywords, count);
    if (pixabay.length > 0) return pixabay;
  }

  // Try Wikimedia first for educational content
  const wiki = await fetchFromWikimedia(keywords, count);
  if (wiki.length > 0) return wiki;

  // Fallback to Pixabay
  const pixabay = await fetchFromPixabay(keywords, count);
  if (pixabay.length > 0) return pixabay;

  // Placeholder if nothing found
  return [`https://placehold.co/800x450/27272a/71717a?text=${encodeURIComponent(keywords.slice(0, 20))}`];
}

/** Result from AI image analysis */
interface ImageSelectionResult {
  selectedIndex: number | null;  // null = none appropriate
  suggestedKeyword?: string;     // alternate keyword to try
  selectedUrl?: string;
}

/** Analyze images with AI and get selection or alternate keyword suggestion */
async function analyzeImagesWithAI(
  imageUrls: string[],
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
    return { selectedIndex: 0, selectedUrl: imageUrls[0] };
  }

  try {
    // Convert URLs to Base64 parts sequentially with progressive backoff
    const validParts: { part: any; url: string; index: number }[] = [];
    const conversionStart = Date.now();

    console.log(`\\n      Starting sequential image conversion...`);

    for (let i = 0; i < imageUrls.length; i++) {
      console.log(`\\n      [${i + 1}/${imageUrls.length}] Processing...`);

      const part = await urlToBase64Part(imageUrls[i]);
      if (part) {
        validParts.push({ part, url: imageUrls[i], index: i });
      }

      // Small delay between fetches (50ms) to prevent rate limiting
      if (i < imageUrls.length - 1) {
        await new Promise(r => setTimeout(r, 50));
      }
    }

    const conversionTime = ((Date.now() - conversionStart) / 1000).toFixed(1);
    console.log(`\\n      📊 Conversion complete in ${conversionTime}s:`);
    console.log(`         - Successful: ${validParts.length}/${imageUrls.length}`);
    console.log(`         - Failed: ${imageUrls.length - validParts.length}`);

    if (validParts.length === 0) {
      console.log(`      → Failed to load any images`);
      return { selectedIndex: null, suggestedKeyword: allowKeywordSuggestion ? keywords : undefined };
    }

    // Limit to max 3 images for AI analysis to prevent overwhelming
    if (validParts.length > 3) {
      console.log(`      ⚙️ Limiting ${validParts.length} → 3 images (using smallest by base64 size)`);
      // Sort by base64 size (smaller = faster for AI) and take top 3
      validParts.sort((a, b) => a.part.inlineData.data.length - b.part.inlineData.data.length);
      validParts.splice(3); // Keep only first 3
      console.log(`      → Selected images: indices ${validParts.map(p => p.index + 1).join(', ')}`);
    }

    // Build multimodal content with structured output request
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

    // Different prompt based on whether we allow keyword suggestion
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

For EACH image, describe what you see (1 sentence).
Then pick the best one, even if not perfect.

RESPOND IN THIS EXACT FORMAT:
Image 1: [what you see]
Image 2: [what you see]
...
SELECTED: [number] because [brief reason]`
      });
    }

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: contents
    });

    const responseText = response.text || "";

    // Log the AI's full reasoning
    console.log(`      📝 AI Analysis:`);
    responseText.split('\n').forEach(line => {
      if (line.trim()) console.log(`         ${line.trim()}`);
    });

    // Parse response for keyword suggestion mode
    if (allowKeywordSuggestion) {
      const decisionMatch = responseText.match(/DECISION:\s*(SELECTED|NONE)/i);
      const selectedMatch = responseText.match(/SELECTED_NUMBER:\s*(\d+)/i);
      const altKeywordMatch = responseText.match(/ALT_KEYWORD:\s*([^\n]+)/i);

      if (decisionMatch?.[1]?.toUpperCase() === 'NONE') {
        let suggestedKeyword = altKeywordMatch?.[1]?.trim();
        // Strip surrounding quotes from AI response
        if (suggestedKeyword) {
          suggestedKeyword = suggestedKeyword.replace(/^["']+|["']+$/g, '').trim();
        }
        if (suggestedKeyword && suggestedKeyword.length > 0 && suggestedKeyword.toLowerCase() !== 'empty') {
          console.log(`      🔄 No suitable image found. AI suggests: "${suggestedKeyword}"`);
          return { selectedIndex: null, suggestedKeyword };
        }
      }

      const idx = selectedMatch ? parseInt(selectedMatch[1], 10) - 1 : -1;
      if (idx >= 0 && idx < validParts.length) {
        console.log(`      ✅ Selected image ${idx + 1}`);
        return { selectedIndex: validParts[idx].index, selectedUrl: validParts[idx].url };
      }
    } else {
      // Simple selection mode
      const match = responseText.match(/SELECTED:\s*(\d)/i);
      const idx = match ? parseInt(match[1], 10) - 1 : 0;
      if (idx >= 0 && idx < validParts.length) {
        console.log(`      ✅ Selected image ${idx + 1}`);
        return { selectedIndex: validParts[idx].index, selectedUrl: validParts[idx].url };
      }
    }

    // Fallback: use first image
    console.log(`      → Defaulting to first loaded image`);
    return { selectedIndex: validParts[0].index, selectedUrl: validParts[0].url };

  } catch (e) {
    console.warn(`      ⚠️ AI selection failed:`, e);
    return { selectedIndex: 0, selectedUrl: imageUrls[0] };
  }
}

/** Get placeholder image URL */
function getPlaceholderUrl(keywords: string): string {
  return `https://placehold.co/800x450/27272a/71717a?text=${encodeURIComponent(keywords.slice(0, 20))}`;
}

/**
 * Select the best image with fallback keyword retry.
 * If AI rejects all images, it can suggest alternate keywords and retry once.
 */
export async function selectBestImage(
  imageUrls: string[],
  slideTitle: string,
  slideContext: string,
  keywords: string = ""
): Promise<string> {
  // First attempt with original images
  let result = await analyzeImagesWithAI(imageUrls, slideTitle, slideContext, keywords, true);

  // If we got a selection, return it
  if (result.selectedUrl) {
    return result.selectedUrl;
  }

  // If AI suggested an alternate keyword, retry with new images
  if (result.suggestedKeyword && result.suggestedKeyword !== keywords) {
    console.log(`\n   🔄 Retrying with alternate keyword: "${result.suggestedKeyword}"`);

    const altCandidates = await fetchImageCandidates(result.suggestedKeyword, 3);
    if (altCandidates.length > 0 && !altCandidates[0].includes('placehold.co')) {
      // Second attempt - no more keyword suggestions allowed
      result = await analyzeImagesWithAI(altCandidates, slideTitle, slideContext, result.suggestedKeyword, false);

      if (result.selectedUrl) {
        return result.selectedUrl;
      }
    }
  }

  // Final fallback: use first original image or placeholder
  console.log(`      → Using fallback image`);
  return imageUrls[0] || getPlaceholderUrl(keywords);
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
  additionalContext = ""
): Promise<CurriculumData> {
  console.log(`\n📚 Generating curriculum for: "${topic}"...`);
  const startTime = performance.now();

  const prompt = `Create a comprehensive, well-structured curriculum for learning about: "${topic}"

${additionalContext ? `Additional context: ${additionalContext}\n` : ""}

Design a COMPLETE learning journey that:
- Builds understanding progressively from foundations to mastery
- Creates meaningful connections between concepts
- Ensures each module reinforces and extends previous learning
- Results in genuine, lasting comprehension

Generate 4-6 modules with 3-5 slides each. Each slide should cover one focused concept.

Return JSON with this structure:
{
  "title": "Engaging course title",
  "overview": "2-3 sentences describing the learning journey",
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
}`;

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {}
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
      model: MODEL,
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
      model: MODEL,
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

  const prompt = `You are creating rich, educational slide content that forms a CONNECTED learning experience.

COURSE: "${courseTitle}"
MODULE: "${moduleTitle}" - ${moduleDescription}

SLIDES TO CREATE:
${slidesList}

${previousContext ? `PREVIOUS CONTEXT:\n${previousContext}\n` : ""}

=== CONTENT PHILOSOPHY ===
Create content that builds GENUINE UNDERSTANDING:
- Each paragraph should flow naturally into the next
- Use analogies and real-world examples
- Connect new concepts to what was learned before
- Help the learner see the "big picture"

=== STRUCTURE PER SLIDE ===
- 2-4 text blocks with substantial explanations (4-6 sentences each)
- 2-4 images to visualize concepts
- Optional: 1 quiz, fun_fact, or table if it genuinely helps learning

=== IMAGE POSITIONS ===
- "hero": Centered single image, standalone section
- "intro": Left-aligned image with text flowing beside it on right
- "grid": 2-3 images side by side (for galleries/comparisons)

=== CRITICAL IMAGE PLACEMENT RULES ===
Images can ONLY appear in two places:

1. AT THE START of a slide:
   - Either "hero" (single centered image, no text beside it)
   - OR "intro" (single image on left, with the FIRST text paragraph flowing beside it on right)

2. IN THE MIDDLE between text blocks:
   - Single image ("hero") or grid of images - but MUST have text paragraphs BEFORE and AFTER

NEVER put images at the END of a slide. Every slide MUST end with a text block.

Correct structure examples:
✓ [hero image] → [text] → [text]
✓ [intro image + text] → [text] → [hero image] → [text]
✓ [text] → [grid images] → [text]
✗ [text] → [hero image] (WRONG - ends with image)
✗ [grid image] → [text] (WRONG - grid at start)

=== IMAGE KEYWORDS (CRITICAL) ===
Keywords are for searching Wikimedia. Keep to MAX 5 WORDS.
Add "diagram", "graph", "map" at end when appropriate.

GOOD: "cell membrane diagram", "classroom students", "neural network graph"
BAD: "a detailed scientific diagram showing the structure" (too long!)

=== OUTPUT FORMAT ===
{
  "slides": [
    {
      "title": "Slide Title",
      "blocks": [
        {"type": "image", "keywords": "visual concept", "caption": "...", "position": "hero"},
        {"type": "text", "content": "Detailed explanation that teaches..."},
        {"type": "text", "content": "Building on the previous point..."}
      ]
    }
  ]
}

Generate ${slideTitles.length} comprehensive slides. Return ONLY valid JSON.`;

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {}
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
        const candidates = await fetchImageCandidates(imgBlock.keywords, 5);
        const imageUrl = await selectBestImage(candidates, imgBlock.slideTitle, imgBlock.slideContext, imgBlock.keywords);

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
            const candidates = await fetchImageCandidates(imgBlock.keywords, 5);
            const imageUrl = await selectBestImage(candidates, imgBlock.slideTitle, imgBlock.slideContext, imgBlock.keywords);

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
    model: SPEECH_MODEL,
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
  const confirmationPhrases = ['yes', 'sure', 'go ahead', 'generate', 'create it', 'create the', 'okay', 'ok', 'yep', 'yeah', 'let\'s go', 'do it', 'sounds good', 'perfect', 'ready', 'go for it', 'make it', 'start'];
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

  // Comprehensive system prompt that defines the consultant's role and behavior
  const systemPrompt = `You are a learning consultant for OmniLearn, an AI-powered educational platform. Your role is to understand what the user wants to learn and gather enough context to create a personalized curriculum for them.

=== YOUR PERSONALITY ===
- Direct and thoughtful, not overly enthusiastic or fake
- Speak like a knowledgeable colleague, not a cheerleader or salesperson
- Brief and purposeful - don't ramble or over-explain
- Curious but not intrusive

=== CONVERSATION FLOW ===
${isInitialMessage ? `
This is the START of the conversation. The user wants to learn about: "${message}"

Your job in this first message:
1. Acknowledge their topic briefly (no excessive praise)
2. Ask ONE focused question to understand their goal or context

Good example: "Got it. What's driving your interest - is this for work, a project, or general curiosity?"
Bad example: "Wow, that's such an exciting topic! I'd love to help you on this amazing learning journey!"
` : turnCount < 6 ? `
You're in the MIDDLE of gathering context. Based on what the user just said:
1. If you have a follow-up question, ask it directly
2. If you have enough information (know their goal + context), move to the confirmation step

Don't drag out the conversation unnecessarily. 2-3 exchanges is usually enough.
` : `
You should have enough context by now. Summarize what you understand and ask for permission to generate.

Example: "So you're looking to learn X for Y purpose, focusing on Z. Shall I create your curriculum?"
`}

=== TRIGGERING CURRICULUM GENERATION ===
When you have gathered sufficient context (typically after 2-3 exchanges), you MUST:
1. Briefly summarize your understanding of what they want
2. Ask explicit permission to generate the curriculum

Use phrases like:
- "Shall I create your curriculum now?"
- "Want me to generate a learning path for this?"
- "Ready to generate your curriculum?"

The user will then confirm, and curriculum generation will begin automatically.

=== FORMATTING RULES ===
- NO asterisks, bullet points, or markdown formatting
- Keep responses to 1-3 sentences max
- Be direct - skip filler phrases like "Great question!" or "That's interesting!"`;

  const contents = [
    { role: "user", parts: [{ text: systemPrompt }] },
    ...history,
    { role: "user", parts: [{ text: message }] }
  ];

  const response = await ai.models.generateContent({
    model: MODEL,
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
    model: CHAT_MODEL,
    contents,
    config: {}
  });

  return response.text || "I'm not sure how to answer that.";
}
