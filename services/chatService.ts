/**
 * KnowMore - Chat Service
 * Handles consultant conversations and chat responses
 */

import { GoogleGenAI } from "@google/genai";
import { AI_MODELS, CONVERSATION_CONFIG } from "../constants/config";

// ============================================
// CONFIGURATION
// ============================================
const MODELS = AI_MODELS;

// Shared AI instance (will be set from main service)
let ai: GoogleGenAI;

export function initializeChatService(aiInstance: GoogleGenAI) {
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

// ============================================
// TYPES
// ============================================

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

export interface AnswerEvaluation {
  isCorrect: boolean;
  score: number;        // 0-100
  feedback: string;
}

// ============================================
// CONSULTANT CONVERSATION
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
    ...history.slice(-CONVERSATION_CONFIG.MAX_HISTORY_MESSAGES),
    { role: "user", parts: [{ text: message }] }
  ];

  try {
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

  const cleanText = rawText.replace(/\*\*/g, '').replace(/\*/g, '').replace(/_/g, '').trim();
  return { text: cleanText, shouldGenerateCurriculum: false };
}

// ============================================
// CHAT RESPONSE
// ============================================

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
// ANSWER EVALUATION
// ============================================

/**
 * Evaluate a user's answer to an open-ended question using AI.
 */
export async function evaluateUserAnswer(
  context: string,
  question: string,
  userAnswer: string,
  expectedAnswer?: string
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
