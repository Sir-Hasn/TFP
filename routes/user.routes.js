import express from "express";

const router = express.Router();

// Get the logged-in user's allergen list.
router.get("/allergens", (req, res) => {
  // TODO: Add token check middleware so only logged-in users can access this route.
  res.json({ allergens: [] });
});

// Update the logged-in user's allergen list.
router.put("/allergens", (req, res) => {
  // TODO: Add token check middleware so only logged-in users can update this route.
  res.json({ message: "Allergens updated" });
});

export default router;
