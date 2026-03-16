import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function main() {
  console.log("Using API Key:", process.env.GEMINI_API_KEY ? "Present" : "Missing");
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: "Say 'Hello from Gemini!'",
    });
    console.log("Success:", response.text);
  } catch (err) {
    console.error("Test Failed:");
    console.error("Message:", err.message);
    console.error("Stack contains 'default credentials'?:", err.message.includes("default credentials"));
  }
}

main();
