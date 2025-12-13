/**
 * KnowMore - Curriculum Service
 * Handles curriculum generation, refinement, and adjustment
 */

import { GoogleGenAI, Type } from "@google/genai";
import { AI_MODELS } from "../constants/config";
import type { CurriculumData } from "../types";

// ============================================
// CONFIGURATION
// ============================================
const MODELS = AI_MODELS;

// Shared AI instance (will be set from main service)
let ai: GoogleGenAI;

export function initializeCurriculumService(aiInstance: GoogleGenAI) {
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
// SCHEMA
// ============================================

export const CURRICULUM_SCHEMA = {
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

// ============================================
// PUBLIC API
// ============================================

export async function generateCurriculum(
  topic: string,
  additionalContext = "",
  preferences?: { knowledgeLevel?: string; preferredDepth?: string; customInstructions?: string }
): Promise<CurriculumData> {
  console.log(`\n📚 Generating curriculum for: "${topic}"...`);
  const startTime = performance.now();

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
