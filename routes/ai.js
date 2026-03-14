import express from "express";

const router = express.Router();

// Return an AI-based recipe suggestion.
router.post("/suggest", (req, res) => {
  // TODO: Connect this route to OpenAI or Gemini.
  res.json({ suggestion: "AI suggestion placeholder" });
});

export default router;