// // Run with: node test-image-analysis.js

import { GoogleGenAI } from "@google/genai";
// Ensure 'Buffer' is available for Node.js environments
import { Buffer } from 'buffer';

// --- Configuration (Replace with your actual values) ---
// NOTE: Make sure to replace these placeholders with your actual keys
const API_KEY = "AIzaSyBxFFJjJXFAP_x5DbJnYyIT6nPXuRoCrl8";
const PIXABAY_KEY = "53631556-267a3b1b6dca0533d6b8fe2fa";
const MODEL_NAME = "gemma-3-27b-it";

// --- 1. Utility: Fetch URL and Convert to Base64 Part (Node.js Logic) ---

/**
 * Fetches an external image URL, converts its binary data to a Base64 string
 * using Node.js's Buffer, and packages it into the correct GenerativePart format.
 * * @param {string} url - The external image URL.
 * @param {string} mimeType - The MIME type (e.g., 'image/jpeg').
 * @returns {Promise<{inlineData: {data: string, mimeType: string}}>} The image Part object.
 */
async function urlToGenerativePart(url, mimeType) {
    console.log(`Fetching image from: ${url}`);

    // 1. Fetch the raw image data
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch image: HTTP status ${response.status}`);
    }

    // Get the raw bytes as an ArrayBuffer
    const arrayBuffer = await response.arrayBuffer();

    // 2. *** KEY: Use Node.js Buffer for conversion ***
    const base64Data = Buffer.from(arrayBuffer).toString("base64");

    // 3. Create and return the Part object
    return {
        inlineData: {
            data: base64Data,
            mimeType,
        },
    };
}

// --- 2. Pixabay Fetcher (Stays similar) ---

async function fetchImage(query) {
    const url = `https://pixabay.com/api/?key=${PIXABAY_KEY}&q=${encodeURIComponent(query)}&orientation=horizontal&per_page=3&safesearch=true`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.hits && data.hits.length > 0) {
        // Return a good quality URL
        return data.hits[0].webformatURL;
    }
    return null;
}

// --- 3. Main Execution Function ---

async function main() {
    if (API_KEY === "YOUR_GEMINI_API_KEY" || PIXABAY_KEY === "YOUR_PIXABAY_API_KEY") {
        console.error("❌ Please set your API and Pixabay keys before running the script.");
        return;
    }

    console.log(`\n🧪 Starting AI Image Analysis Test with ${MODEL_NAME}\n`);

    // --- 3.1 Fetch UNRELATED image URLs ---
    console.log("📥 Fetching 3 image URLs from Pixabay...\n");
    const image1Url = await fetchImage("football soccer ball");
    const image2Url = await fetchImage("cat cute kitten");
    const image3Url = await fetchImage("mountain landscape snow");

    if (!image1Url || !image2Url || !image3Url) {
        console.error("❌ Failed to fetch all image URLs from Pixabay API.");
        return;
    }

    // --- 3.2 Convert URLs to Generative Parts ---
    try {
        const mimeType = 'image/jpeg'; // Assuming common image type for Pixabay links
        console.log("🔄 Converting URLs to Base64 data parts (Node.js Buffer method)...\n");

        const imagePart1 = await urlToGenerativePart(image1Url, mimeType);
        const imagePart2 = await urlToGenerativePart(image2Url, mimeType);
        const imagePart3 = await urlToGenerativePart(image3Url, mimeType);

        // --- 3.3 Construct the Multimodal Request ---
        const ai = new GoogleGenAI({ apiKey: API_KEY });

        const contents = [
            // Prompt part 1 (Text)
            { text: `I have 3 images from Pixabay. I'm telling you what keywords I SEARCHED for, but I want you to DESCRIBE what you actually SEE in each image.\n\n` },

            // Image 1 and its text description
            { text: `Image 1 (searched: "apple fruit red"): ` },
            imagePart1,

            // Image 2 and its text description
            { text: `\nImage 2 (searched: "car vehicle automobile"): ` },
            imagePart2,

            // Image 3 and its text description
            { text: `\nImage 3 (searched: "book library reading"): ` },
            imagePart3,

            // Final task instructions
            { text: `\n\nTASK:
1. For each image, describe what you ACTUALLY SEE in the image (not what the keywords suggest).
2. Tell me if the actual image matches the search keywords I gave you.
3. Which image shows a FOOTBALL/SOCCER BALL?

Be honest - can you actually see and analyze these image URLs, or are you just guessing based on the keywords?` }
        ];

        console.log("📤 Sending multimodal request to Gemma-3-27b-it...\n" + "=".repeat(60) + "\n");

        // --- 3.4 Call the API ---
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: contents, // Array of text and image Parts
        });

        console.log("📥 AI Response:\n");
        console.log(response.text);

    } catch (e) {
        console.error("An error occurred during image fetching or API call:", e);
    }
}

main().catch(console.error);