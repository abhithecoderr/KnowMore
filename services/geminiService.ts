import { GoogleGenAI, Type, Schema, Modality } from "@google/genai";

// Initialize client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Pixabay API key for image URLs
const PIXABAY_KEY = "53631556-267a3b1b6dca0533d6b8fe2fa";

// Helper: Build Pixabay URL from keywords
export const buildImageUrl = (keywords: string): string => {
  if (!keywords || typeof keywords !== "string") return "";
  const query = keywords
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join("+");
  return `https://pixabay.com/api/?key=${PIXABAY_KEY}&q=${query}&image_type=photo&per_page=5&safesearch=true`;
};

// Helper: Fetch actual image URL from Pixabay
export const fetchImageFromPixabay = async (
  keywords: string
): Promise<string> => {
  if (!keywords) return `https://placehold.co/800x450/27272a/71717a?text=Image`;

  try {
    const apiUrl = buildImageUrl(keywords);
    const res = await fetch(apiUrl);
    const data = await res.json();

    if (data.hits && data.hits.length > 0) {
      const randomIndex = Math.floor(
        Math.random() * Math.min(data.hits.length, 5)
      );
      return data.hits[randomIndex].webformatURL;
    }
  } catch (error) {
    console.error("Pixabay fetch failed:", error);
  }

  return `https://placehold.co/800x450/27272a/71717a?text=${encodeURIComponent(
    keywords.slice(0, 15)
  )}`;
};

// Retry Helper
async function withRetry<T>(
  operation: () => Promise<T>,
  retries = 3,
  delay = 2000
): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    const isOverloaded =
      error.message?.includes("overloaded") || error.code === 503;
    if (retries > 0 && isOverloaded) {
      console.warn(`Model overloaded. Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return withRetry(operation, retries - 1, delay * 2);
    }
    throw error;
  }
}

// ============================================
// 1. CURRICULUM GENERATION (Structure Only) - ENHANCED
// ============================================
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

export const generateCurriculum = async (
  topic: string,
  additionalContext: string = ""
): Promise<CurriculumData> => {
  const model = "gemma-3-27b-it";

  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING, description: "Course title" },
      overview: {
        type: Type.STRING,
        description: "A comprehensive paragraph explaining what this curriculum covers, the scope of topics, and who it's designed for",
      },
      learningGoals: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "3-5 specific, actionable learning goals the learner will achieve",
      },
      description: {
        type: Type.STRING,
        description: "Brief course overview (2-3 sentences)",
      },
      modules: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            title: { type: Type.STRING },
            description: {
              type: Type.STRING,
              description: "What this module covers and why it matters",
            },
            slides: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  title: { type: Type.STRING },
                  description: {
                    type: Type.STRING,
                    description: "Brief explanation of what this subtopic covers (1-2 sentences)",
                  },
                },
                required: ["id", "title", "description"],
              },
            },
          },
          required: ["id", "title", "description", "slides"],
        },
      },
    },
    required: ["title", "overview", "learningGoals", "description", "modules"],
  };

  const prompt = `You are an expert curriculum designer focused on creating clear, logical learning paths. Your task is to create a comprehensive learning curriculum structure for: "${topic}"

${additionalContext ? `User context and preferences:\n${additionalContext}\n` : ""}

REQUIREMENTS:
1. Create 3-5 logical modules that build upon each other
2. Each module has 3-5 slide titles with descriptions
3. Structure: Introduction → Core concepts → Details → Applications → Summary
4. Slide titles should be engaging and specific
5. Keep it digestible - focus on genuine understanding

IMPORTANT - For each element provide:
- **Overview**: A comprehensive paragraph explaining the full scope of what will be learned
- **Learning Goals**: 3-5 specific outcomes like "Understand the fundamentals of X" or "Be able to implement Y"
- **Module descriptions**: What the module covers and its importance
- **Slide descriptions**: 1-2 sentences explaining what each subtopic teaches

**OUTPUT INSTRUCTIONS: Generate ONLY the raw JSON object that conforms to the required structure, without any additional text, markdown, or comments, and do NOT wrap the JSON in markdown fences (like \`\`\`json):**
${JSON.stringify(schema, null, 2)}`;

  const startTime = performance.now();

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {},
    });

    if (!response.text) throw new Error("No curriculum generated");

    let cleanedJsonText = response.text.trim();

    if (cleanedJsonText.startsWith("```json")) {
      cleanedJsonText = cleanedJsonText.substring("```json".length).trim();
    } else if (cleanedJsonText.startsWith("```")) {
      cleanedJsonText = cleanedJsonText.substring("```".length).trim();
    }

    if (cleanedJsonText.endsWith("```")) {
      cleanedJsonText = cleanedJsonText
        .substring(0, cleanedJsonText.length - "```".length)
        .trim();
    }

    const data = JSON.parse(cleanedJsonText);

    console.log(
      `\n📚 CURRICULUM (${((performance.now() - startTime) / 1000).toFixed(
        1
      )}s): "${data.title}"`
    );
    console.log(`   Overview: ${data.overview?.substring(0, 80)}...`);
    console.log(`   Goals: ${data.learningGoals?.length || 0} learning goals`);
    console.log(`   ${data.modules?.length || 0} modules`);
    data.modules?.forEach((m: any, i: number) => {
      console.log(
        `   └─ M${i + 1}: ${m.title} (${m.slides?.length || 0} slides)`
      );
    });

    return data;
  });
};

// ============================================
// 1b. CURRICULUM REFINEMENT (for chat mode)
// ============================================
export const refineCurriculum = async (
  currentCurriculum: CurriculumData,
  userFeedback: string,
  conversationHistory: { role: string; parts: { text: string }[] }[] = []
): Promise<{ curriculum: CurriculumData; response: string }> => {
  const model = "gemma-3-27b-it";

  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      response: {
        type: Type.STRING,
        description: "Friendly response acknowledging the changes made",
      },
      curriculum: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          overview: { type: Type.STRING },
          learningGoals: { type: Type.ARRAY, items: { type: Type.STRING } },
          description: { type: Type.STRING },
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
                      description: { type: Type.STRING },
                    },
                    required: ["id", "title", "description"],
                  },
                },
              },
              required: ["id", "title", "description", "slides"],
            },
          },
        },
        required: ["title", "overview", "learningGoals", "description", "modules"],
      },
    },
    required: ["response", "curriculum"],
  };

  const prompt = `You are a curriculum design assistant. The user has a curriculum they want to refine based on their feedback.

CURRENT CURRICULUM:
${JSON.stringify(currentCurriculum, null, 2)}

USER FEEDBACK: "${userFeedback}"

Your task:
1. Understand what changes the user wants
2. Apply those changes to the curriculum (add/remove/modify modules, slides, goals, etc.)
3. Provide a brief, friendly response explaining what you changed

**OUTPUT INSTRUCTIONS: Generate ONLY the raw JSON object with both "response" and "curriculum" fields, without any markdown fences:**
${JSON.stringify(schema, null, 2)}`;

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {},
    });

    if (!response.text) throw new Error("No refinement generated");

    let cleanedJsonText = response.text.trim();
    if (cleanedJsonText.startsWith("```json")) {
      cleanedJsonText = cleanedJsonText.substring("```json".length).trim();
    } else if (cleanedJsonText.startsWith("```")) {
      cleanedJsonText = cleanedJsonText.substring("```".length).trim();
    }
    if (cleanedJsonText.endsWith("```")) {
      cleanedJsonText = cleanedJsonText.substring(0, cleanedJsonText.length - "```".length).trim();
    }

    const data = JSON.parse(cleanedJsonText);
    console.log(`\n✏️ CURRICULUM REFINED: ${data.response?.substring(0, 50)}...`);
    return data;
  });
};

// ============================================
// 1c. CURRICULUM ADJUSTMENT (for direct mode - no conversation)
// ============================================
export const adjustCurriculum = async (
  currentCurriculum: CurriculumData,
  adjustmentPrompt: string
): Promise<CurriculumData> => {
  const model = "gemma-3-27b-it";

  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      overview: { type: Type.STRING },
      learningGoals: { type: Type.ARRAY, items: { type: Type.STRING } },
      description: { type: Type.STRING },
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
                  description: { type: Type.STRING },
                },
                required: ["id", "title", "description"],
              },
            },
          },
          required: ["id", "title", "description", "slides"],
        },
      },
    },
    required: ["title", "overview", "learningGoals", "description", "modules"],
  };

  const prompt = `You are a curriculum designer. Modify the following curriculum based on the adjustment request.

CURRENT CURRICULUM:
${JSON.stringify(currentCurriculum, null, 2)}

ADJUSTMENT REQUEST: "${adjustmentPrompt}"

Apply the requested changes and return the updated curriculum. Maintain the same structure but incorporate the adjustments.

**OUTPUT INSTRUCTIONS: Generate ONLY the raw JSON object that conforms to the curriculum structure, without any additional text or markdown fences:**
${JSON.stringify(schema, null, 2)}`;

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {},
    });

    if (!response.text) throw new Error("No adjustment generated");

    let cleanedJsonText = response.text.trim();
    if (cleanedJsonText.startsWith("```json")) {
      cleanedJsonText = cleanedJsonText.substring("```json".length).trim();
    } else if (cleanedJsonText.startsWith("```")) {
      cleanedJsonText = cleanedJsonText.substring("```".length).trim();
    }
    if (cleanedJsonText.endsWith("```")) {
      cleanedJsonText = cleanedJsonText.substring(0, cleanedJsonText.length - "```".length).trim();
    }

    const data = JSON.parse(cleanedJsonText);
    console.log(`\n🔧 CURRICULUM ADJUSTED: "${data.title}"`);
    return data;
  });
};

// ============================================
// 2. MODULE CONTENT GENERATION (Full Slides) - FIX APPLIED
// ============================================
export interface SlideBlock {
  type: "text" | "image" | "quiz" | "fun_fact" | "table";
  content?: string; // For text blocks
  keywords?: string; // For image blocks
  caption?: string; // For image blocks
  imageUrl?: string; // Populated after fetching
  position?: "center" | "left" | "right" | "inline"; // Image position
  question?: string; // For quiz
  options?: { text: string; isCorrect: boolean }[];
  explanation?: string; // For quiz
  fact?: string; // For fun_fact
  markdown?: string; // For table
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

export const generateModuleContent = async (
  courseTitle: string,
  moduleTitle: string,
  moduleDescription: string,
  slideTitles: string[],
  previousContext: string = ""
): Promise<ModuleContent> => {
  const model = "gemma-3-27b-it";

  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      slides: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            blocks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: {
                    type: Type.STRING,
                    description:
                      "Block type: 'text', 'image', 'quiz', 'fun_fact', or 'table'",
                  },
                  content: {
                    type: Type.STRING,
                    description: "For text: markdown content",
                  },
                  keywords: {
                    type: Type.STRING,
                    description:
                      "For image: 1-3 simple words for Pixabay search",
                  },
                  caption: {
                    type: Type.STRING,
                    description: "For image: brief caption",
                  },
                  position: {
                    type: Type.STRING,
                    description:
                      "For image: 'center', 'left', 'right', or 'inline'",
                  },
                  question: {
                    type: Type.STRING,
                    description: "For quiz: the question",
                  },
                  options: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        text: { type: Type.STRING },
                        isCorrect: { type: Type.BOOLEAN },
                      },
                      required: ["text", "isCorrect"],
                    },
                  },
                  explanation: {
                    type: Type.STRING,
                    description: "For quiz: explanation of correct answer",
                  },
                  fact: {
                    type: Type.STRING,
                    description: "For fun_fact: the interesting fact",
                  },
                  markdown: {
                    type: Type.STRING,
                    description: "For table: markdown table",
                  },
                },
                required: ["type"],
              },
            },
          },
          required: ["title", "blocks"],
        },
      },
    },
    required: ["slides"],
  };

  const slideTitlesList = slideTitles
    .map((t, i) => `${i + 1}. ${t}`)
    .join("\n"); // --- UPDATED PROMPT ---

  const prompt = `Generate complete content for all slides in this module.

COURSE: "${courseTitle}"
MODULE: "${moduleTitle}" - ${moduleDescription}

SLIDES TO CREATE:
${slideTitlesList}

${
  previousContext
    ? `CONTEXT FROM PREVIOUS MODULES (for coherence):\n${previousContext}\n`
    : ""
}

CONTENT GUIDELINES:

**Tone & Style:**
- Serious and inquisitive - aim to make the reader truly understand
- Light and digestible - no dense walls of text
- Build naturally from one slide to the next
- Reference previous slides when relevant ("As we saw...", "Building on...")

**Per Slide Structure:**
- 1-3 paragraphs of clear, focused text (varies by topic complexity)
- 1-2 relevant images positioned thoughtfully:
  - 'center' = hero image at top before text
  - 'left'/'right' = image floats beside text
  - 'inline' = image between paragraphs
- Quiz, fun_fact, or table ONLY when they genuinely enhance understanding (not forced)

**Image Keywords:**
- Use 1-3 simple English words for Pixabay stock photo search
- Example: "airplane cockpit", "newton apple", "car engine"

**Quality:**
- Each slide should feel complete but connected to the whole
- Explanations should be clear enough for a curious beginner
- End the module with a sense of closure

**OUTPUT INSTRUCTIONS: Generate ONLY the raw JSON object that conforms to the required structure, without any additional text, markdown, or comments, and do NOT wrap the JSON in markdown fences (like \`\`\`json):**
${JSON.stringify(schema, null, 2)}`; // ------------------------
  const startTime = performance.now();
  console.log(
    `\n🎯 Generating module: "${moduleTitle}" (${slideTitles.length} slides)...`
  );

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        // JSON mode config removed
      },
    });

    if (!response.text) throw new Error("No module content generated");

    // --- NEW CLEANUP LOGIC ---
    let cleanedJsonText = response.text.trim(); // Remove leading ```json and trailing ``` (in case the model ignores the instruction)

    if (cleanedJsonText.startsWith("```json")) {
      cleanedJsonText = cleanedJsonText.substring("```json".length).trim();
    } else if (cleanedJsonText.startsWith("```")) {
      // Handle case where language specifier is omitted
      cleanedJsonText = cleanedJsonText.substring("```".length).trim();
    }

    if (cleanedJsonText.endsWith("```")) {
      cleanedJsonText = cleanedJsonText
        .substring(0, cleanedJsonText.length - "```".length)
        .trim();
    }
    // --- END NEW CLEANUP LOGIC ---

    const data = JSON.parse(cleanedJsonText);

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
    console.log(`\n📝 MODULE CONTENT (${elapsed}s): "${moduleTitle}"`); // Process slides: validate and fetch images

    const processedSlides: SlideData[] = await Promise.all(
      (data.slides || []).map(async (slide: any, slideIndex: number) => {
        const blocks = await Promise.all(
          (slide.blocks || [])
            .filter((b: any) => b && b.type)
            .map(async (block: any) => {
              if (block.type === "image" && block.keywords) {
                const imageUrl = await fetchImageFromPixabay(block.keywords);
                return { ...block, imageUrl };
              }
              return block;
            })
        );

        console.log(
          `   └─ Slide ${slideIndex + 1}: "${slide.title}" (${
            blocks.length
          } blocks)`
        );

        return {
          id: `slide-${slideIndex}`,
          title: slide.title || `Slide ${slideIndex + 1}`,
          blocks,
        };
      })
    );

    return {
      moduleId: "",
      slides: processedSlides,
    };
  });
};

// ============================================
// 3. TEXT-TO-SPEECH (Unchanged)
// ============================================
export const generateSpeech = async (text: string): Promise<string> => {
  const model = "gemini-2.5-flash-preview-tts";
  const speechText = text.replace(/[*#]/g, "").substring(0, 400);

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model,
      contents: { parts: [{ text: speechText }] },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
        },
      },
    });

    const base64Audio =
      response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("No audio generated");
    return base64Audio;
  });
};

// ============================================
// 4. CHAT FUNCTIONS - CONSULTANT WITH PROMPT-BASED TRIGGER
// ============================================

export interface ConsultantResult {
  text: string;
  shouldGenerateCurriculum: boolean;
}

export const generateConsultantReply = async (
  history: { role: string; parts: { text: string }[] }[],
  message: string,
  isInitialMessage: boolean = false
): Promise<ConsultantResult> => {
  const model = "gemma-3-27b-it";

  return withRetry(async () => {
    const conversationLength = history.length;

    // Shorter, more conversational prompts with trigger instruction
    let systemInstruction: string;

    if (isInitialMessage || conversationLength === 0) {
      systemInstruction = `You are a friendly learning consultant. Keep responses SHORT (2-3 sentences max).

Your FIRST response should:
1. Briefly acknowledge their topic with enthusiasm (1 sentence)
2. Mention 2-3 key areas within this topic they might explore
3. Ask ONE simple question about their experience level or specific interest

Do NOT write long paragraphs or bullet lists. Be conversational and concise.`;
    } else if (conversationLength >= 4) {
      systemInstruction = `You are a friendly learning consultant. Keep responses SHORT.

You've chatted enough - offer to create the curriculum!
Say something like: "Great, I think I understand what you need! Ready for me to create your curriculum?"

If the user says yes, agrees, or asks you to generate/create, include the exact tag [GENERATE_CURRICULUM] at the END of your response.
Keep your response to 1-2 sentences max.`;
    } else {
      systemInstruction = `You are a friendly learning consultant. Keep responses SHORT (2-3 sentences max).

Continue the conversation naturally:
- Respond briefly to their answer
- Ask ONE follow-up question OR suggest you're ready to create a curriculum

Do NOT give long explanations. Stay conversational and brief.
If the user explicitly asks you to generate/create/make the curriculum, include [GENERATE_CURRICULUM] at the END of your response.`;
    }

    const fullMessage = isInitialMessage
      ? `${systemInstruction}\n\nUser's topic: ${message}`
      : `${systemInstruction}\n\nUser: ${message}`;

    const chat = ai.chats.create({
      model,
      history,
    });
    const result = await chat.sendMessage({ message: fullMessage });
    let responseText = result.text || "I'd be happy to help you learn! What specific area interests you most?";

    // Check for trigger tag in response
    const shouldGenerate = responseText.includes('[GENERATE_CURRICULUM]');

    // Remove the tag from displayed text
    responseText = responseText.replace('[GENERATE_CURRICULUM]', '').trim();

    if (shouldGenerate) {
      console.log('🎯 Consultant triggered curriculum generation via prompt tag');
    }

    return {
      text: responseText,
      shouldGenerateCurriculum: shouldGenerate
    };
  });
};

export const generateChatResponse = async (
  history: { role: string; parts: { text: string }[] }[],
  message: string
): Promise<string> => {
  const model = "gemini-flash-lite-latest";

  return withRetry(async () => {
    const chat = ai.chats.create({
      model,
      history,
      config: { tools: [{ googleSearch: {} }] },
    });

    const result = await chat.sendMessage({ message });
    let text = result.text;

    const chunks = result.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks?.length > 0) {
      text += "\n\n**Sources:**\n";
      chunks.forEach((chunk: any) => {
        if (chunk.web?.uri) {
          text += `- [${chunk.web.title}](${chunk.web.uri})\n`;
        }
      });
    }

    return text;
  });
};
