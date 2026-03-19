import express from "express";
import { verifyToken } from "../middleware/auth.middleware.js";
import { User } from "../models/user.models.js";

const router = express.Router();

// Get the logged-in user's allergen list.

router.get("/allergens", verifyToken, async (req, res) => {
  try {
    const userId = req.userId; // Set by auth middleware after token check.
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized: No user ID found in token" });
    }

    const user = await User.findById(userId).select("allergens");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({ allergens: user.allergens || [] });

  } catch (err) {
    console.error("Error fetching allergens:", err.message);
    return res.status(500).json({ message: "Error fetching allergens", error: err.message });
  }
});

// Update the logged-in user's allergen list.
router.put("/allergens", verifyToken, async (req, res) => {
  try {
    const userId = req.userId; // Set by auth middleware after token check.
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized: No user ID found in token" });
    }
    const { allergens } = req.body;
    if (!Array.isArray(allergens)) {
      return res.status(400).json({ message: "Allergens must be an array" });
    }

    // Normalize values so the frontend always receives clean data.
    const normalizedAllergens = [...new Set(
      allergens
        .map((item) => String(item || "").trim())
        .filter((item) => item.length > 0)
    )];

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { allergens: normalizedAllergens },
      { new: true, runValidators: true }
    ).select("allergens");

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({
      message: "Allergens updated",
      allergens: updatedUser.allergens || []
    });
  } catch (err) {
    console.error("Error updating allergens:", err.message);
    return res.status(500).json({ message: "Error updating allergens", error: err.message });
  }
});

export default router;
