/**
 * KnowMore - Image Service
 * Handles image fetching, AI analysis, and selection for slides
 */

import { GoogleGenAI } from "@google/genai";
import {
  API_CONFIG,
  AI_MODELS,
  RATE_LIMITS,
  IMAGE_CONFIG,
  NATURE_KEYWORDS
} from "../constants/config";

// ============================================
// CONFIGURATION
// ============================================
const MODELS = AI_MODELS;
const PIXABAY_KEY = API_CONFIG.PIXABAY_API_KEY || "53631556-267a3b1b6dca0533d6b8fe2fa";

// Shared AI instance (will be set from main service)
let ai: GoogleGenAI;

export function initializeImageService(aiInstance: GoogleGenAI) {
  ai = aiInstance;
}

// Rate limiting for AI image analysis calls
let lastImageAnalysisTime = 0;

async function rateLimitImageAnalysis(): Promise<void> {
  const now = Date.now();
  const timeSinceLastCall = now - lastImageAnalysisTime;

  if (timeSinceLastCall < RATE_LIMITS.IMAGE_ANALYSIS_INTERVAL_MS) {
    const waitTime = RATE_LIMITS.IMAGE_ANALYSIS_INTERVAL_MS - timeSinceLastCall;
    console.log(`      ⏳ Rate limit: waiting ${(waitTime/1000).toFixed(1)}s`);
    await new Promise(r => setTimeout(r, waitTime));
  }

  lastImageAnalysisTime = Date.now();
}

// ============================================
// TYPES
// ============================================

/** Image with dual URLs for analysis/display */
export interface DualImage {
  analysisUrl: string;  // Low-res for AI analysis
  displayUrl: string;   // High-res for frontend display
}

/** Result from AI image analysis */
export interface ImageSelectionResult {
  selectedIndex: number | null;  // null = none appropriate
  suggestedKeyword?: string;     // alternate keyword to try
  selectedUrl?: string;          // URL for display
}

/** Image block info for on-demand selection */
export interface ImageBlockInfo {
  slideIndex: number;
  blockIndex: number;
  keywords: string;
  slideTitle: string;
  slideContext: string;
}

/** Slide block type for image extraction */
export interface SlideBlock {
  type: string;
  content?: string;
  keywords?: string;
  imageUrl?: string | null;
}

/** Slide data type for image extraction */
export interface SlideData {
  id: string;
  title: string;
  blocks: SlideBlock[];
}

// ============================================
// URL VALIDATION & CONVERSION
// ============================================

/** Pre-flight check to validate URL accessibility without downloading full image */
async function validateUrlAccessible(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      mode: 'cors'
    });
    clearTimeout(timeoutId);

    if (!response.ok) return false;

    const contentType = response.headers.get('content-type');
    const contentLength = parseInt(response.headers.get('content-length') || '0');

    const isImage = contentType?.startsWith('image/');
    const sizeOk = contentLength > 0 && contentLength < 8000000;

    return isImage && sizeOk;
  } catch {
    return false;
  }
}

/** Convert image URL to Base64 - NO RETRIES for faster parallel processing */
async function urlToBase64Part(url: string): Promise<any> {
  const startTime = Date.now();
  const urlShort = url.slice(-50);

  try {
    console.log(`      [Fetch] ${urlShort}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

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
    if (arrayBuffer.byteLength < 500) return null;

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
    return null;
  }
}

// ============================================
// IMAGE FETCHING
// ============================================

/** Simple in-memory cache for image selections */
const imageCache = new Map<string, string>();

/** Fetch images from Wikimedia Commons with DUAL URLs (200px AI, 600px display) */
async function fetchFromWikimedia(keywords: string, count = 3): Promise<DualImage[]> {
  try {
    console.log(`\n   🔎 Wikimedia search: "${keywords}"`);

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
      iiurlwidth: '200',
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

/** Fetch images from Pixabay with dual URLs */
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
  const wiki = await fetchFromWikimedia(keywords, count);
  if (wiki.length > 0) return wiki.map(w => w.displayUrl);

  return [`https://placehold.co/800x450/27272a/71717a?text=${encodeURIComponent(keywords.slice(0, 20))}`];
}

// ============================================
// AI IMAGE ANALYSIS
// ============================================

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
    // PARALLEL Base64 conversion
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
        text: `\nWhich image best matches "${slideTitle}"?
Current search: "${keywords}"

RESPOND WITH ONLY ONE OF:
• A number (1-${validParts.length}) - pick the most relevant image for the topic/slide/keyword
• "NONE: [different 2-4 word search term]" - ONLY if nothing is remotely relevant

IMPORTANT: If you say NONE, you must suggest a DIFFERENT keyword than "${keywords}".
Good examples: "atom diagram", "neural network visualization", "database schema"
DO NOT repeat the current keyword. DO NOT explain. Just number or NONE with new keyword.`
      });
    } else {
      contents.push({
        text: `\nBest image? Reply with ONLY a number (1-${validParts.length}):`
      });
    }

    await rateLimitImageAnalysis();

    const response = await ai.models.generateContent({
      model: MODELS.IMAGE_ANALYSIS,
      contents: contents
    });

    const responseText = response.text?.trim() || "";
    console.log(`      📝 AI: ${responseText}`);

    // Parse simplified response
    if (allowKeywordSuggestion) {
      const noneMatch = responseText.match(/NONE:\s*(.+)/i);
      if (noneMatch) {
        const suggestedKeyword = noneMatch[1].trim().replace(/^["']+|["']+$/g, '');
        const wordCount = suggestedKeyword.split(/\s+/).length;

        if (suggestedKeyword.length > 0 && suggestedKeyword.length <= 50 && wordCount <= 5) {
          console.log(`      🔄 No match. AI suggests: "${suggestedKeyword}"`);
          return { selectedIndex: null, suggestedKeyword };
        } else {
          console.log(`      ⚠️ AI gave explanation instead of keyword, using first image`);
        }
      }

      const numMatch = responseText.match(/(\d+)/);
      const idx = numMatch ? parseInt(numMatch[1], 10) - 1 : -1;
      if (idx >= 0 && idx < validParts.length) {
        console.log(`      ✅ Selected image ${idx + 1}`);
        return { selectedIndex: validParts[idx].index, selectedUrl: validParts[idx].displayUrl };
      }
    } else {
      const match = responseText.match(/(\d+)/);
      const idx = match ? parseInt(match[1], 10) - 1 : 0;
      if (idx >= 0 && idx < validParts.length) {
        console.log(`      ✅ Selected image ${idx + 1}`);
        return { selectedIndex: validParts[idx].index, selectedUrl: validParts[idx].displayUrl };
      }
    }

    console.log(`      → Using first available image`);
    return { selectedIndex: validParts[0].index, selectedUrl: validParts[0].displayUrl };

  } catch (e) {
    console.warn(`      ⚠️ AI selection failed:`, e);
    return { selectedIndex: 0, selectedUrl: images[0].displayUrl };
  }
}

// ============================================
// PUBLIC API
// ============================================

/** Get placeholder image URL */
export function getPlaceholderUrl(keywords: string): string {
  return `https://placehold.co/800x450/27272a/71717a?text=${encodeURIComponent(keywords.slice(0, 20))}`;
}

/**
 * OPTIMIZED image selection with parallel fetching and caching.
 */
export async function selectBestImage(
  slideTitle: string,
  slideContext: string,
  keywords: string = ""
): Promise<string> {
  const cacheKey = `${keywords.toLowerCase().trim()}`;

  if (imageCache.has(cacheKey)) {
    console.log(`📷 Cache hit for: "${keywords}"`);
    return imageCache.get(cacheKey)!;
  }

  console.log(`\n📷 Image Selection for: "${slideTitle}"`);
  console.log(`   Keywords: "${keywords}"`);

  let currentKeywords = keywords;
  const failedKeywords: string[] = [];

  for (let attempt = 1; attempt <= 4; attempt++) {
    console.log(`\n   🔍 Attempt ${attempt}: (${currentKeywords})`);

    const wikiImages = await fetchFromWikimedia(currentKeywords, IMAGE_CONFIG.WIKIMEDIA_FETCH_COUNT);

    const allImages: DualImage[] = [...wikiImages];
    console.log(`   📋 Total candidates: ${allImages.length} (Wikimedia only)`);

    if (allImages.length === 0) {
      console.log(`   ⚠️ No images found for "${currentKeywords}"`);
      failedKeywords.push(currentKeywords);

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

    const result = await analyzeImagesWithAI(
      allImages,
      slideTitle,
      slideContext,
      currentKeywords,
      attempt === 1
    );

    if (result.selectedUrl) {
      console.log(`   ✅ Selected image!`);
      imageCache.set(cacheKey, result.selectedUrl);
      return result.selectedUrl;
    }

    if (result.suggestedKeyword && result.suggestedKeyword !== currentKeywords) {
      console.log(`   💡 Retrying with: "${result.suggestedKeyword}"`);
      currentKeywords = result.suggestedKeyword;
    } else {
      break;
    }
  }

  console.log(`   ⚠️ Using placeholder`);
  const placeholder = getPlaceholderUrl(keywords);
  imageCache.set(cacheKey, placeholder);
  return placeholder;
}

/**
 * Extract all image blocks from a module's slides that need image selection.
 */
export function extractImageBlocksFromModule(
  slides: SlideData[]
): ImageBlockInfo[] {
  const imageBlocks: ImageBlockInfo[] = [];

  slides.forEach((slide, slideIdx) => {
    const slideContext = slide.blocks
      .filter(b => b.type === 'text')
      .map(b => b.content || '')
      .join(' ')
      .slice(0, 200);

    slide.blocks.forEach((block, blockIdx) => {
      if (block.type === 'image' && block.keywords && !block.imageUrl) {
        imageBlocks.push({
          slideIndex: slideIdx,
          blockIndex: blockIdx,
          keywords: block.keywords,
          slideTitle: slide.title,
          slideContext
        });
      }
    });
  });

  return imageBlocks;
}

/**
 * Select images for a module on-demand.
 */
export async function selectImagesForModule(
  slides: SlideData[],
  onImageReady: (slideIndex: number, blockIndex: number, imageUrl: string) => void
): Promise<void> {
  const imageBlocks = extractImageBlocksFromModule(slides);

  if (imageBlocks.length === 0) {
    console.log('📷 No images to select for this module');
    return;
  }

  console.log(`\n📷 On-demand image selection: ${imageBlocks.length} images`);

  for (let i = 0; i < imageBlocks.length; i++) {
    const imgBlock = imageBlocks[i];

    if (i > 0) {
      console.log(`   ⏳ Cooldown: waiting 3s before next image...`);
      await new Promise(r => setTimeout(r, IMAGE_CONFIG.POST_SELECTION_COOLDOWN_MS));
    }

    try {
      const imageUrl = await selectBestImage(
        imgBlock.slideTitle,
        imgBlock.slideContext,
        imgBlock.keywords
      );
      onImageReady(imgBlock.slideIndex, imgBlock.blockIndex, imageUrl);
    } catch (err) {
      console.warn(`Failed to load image for slide ${imgBlock.slideIndex}:`, err);
      onImageReady(
        imgBlock.slideIndex,
        imgBlock.blockIndex,
        getPlaceholderUrl(imgBlock.keywords)
      );
    }
  }

  console.log('✅ Module image selection complete');
}

/** Clear the image cache */
export function clearImageCache(): void {
  imageCache.clear();
}
