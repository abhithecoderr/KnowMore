/**
 * KnowMore - TTS Service
 * Handles text-to-speech generation for slides and modules
 */

import { GoogleGenAI } from "@google/genai";
import { AI_MODELS } from "../constants/config";

// ============================================
// CONFIGURATION
// ============================================
const MODELS = AI_MODELS;

// Toggle TTS generation on/off (set to false to disable TTS and save API calls)
export const TTS_ENABLED = false;

// Shared AI instance (will be set from main service)
let ai: GoogleGenAI;

export function initializeTTSService(aiInstance: GoogleGenAI) {
  ai = aiInstance;
}

// ============================================
// TYPES
// ============================================

/** WAV conversion options */
interface WavOptions {
  numChannels: number;
  sampleRate: number;
  bitsPerSample: number;
}

/** Slide for TTS extraction */
interface SlideForTTS {
  title: string;
  blocks: any[];
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/** Extract readable text from a slide's blocks for TTS */
function extractTextFromSlide(slide: SlideForTTS): string {
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

  return parts.join('. ').replace(/\.\./g, '.').slice(0, 5000);
}

/** Parse MIME type to get WAV options */
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
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
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

// ============================================
// PUBLIC API
// ============================================

/** Generate raw speech audio (base64) from text */
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

/** Generate TTS audio for a single slide */
export async function generateTTSForSlide(
  slide: SlideForTTS
): Promise<string | null> {
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
  slides: SlideForTTS[]
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
