import express from "express";
import { Bookmark } from "../models/bookmark.models.js";
import { verifyToken } from "../middleware/auth.middleware.js";

const router = express.Router();

// Add a recipe bookmark for the logged-in user.
router.post("/add", verifyToken, async (req, res) => {
    try {
        const { recipe_id, recipe_name, recipe_image, cooking_method } = req.body;

        // Make sure required fields are included.
        if (!recipe_id || !recipe_name) {
            return res.status(400).json({ message: "recipe_id and recipe_name are required" });
        }

        // Save a bookmark that belongs to the logged-in user.
        const newBookmark = new Bookmark({
            user_id: req.userId, // Set by auth middleware after token check.
            recipe_id,
            recipe_name,
            recipe_image: recipe_image || null,
            cooking_method: cooking_method || null
        });

        const savedBookmark = await newBookmark.save();
        res.status(201).json({ message: "Bookmark added successfully", bookmark: savedBookmark });
    } catch (err) {
        console.error("Error adding bookmark:", err.message);
        res.status(500).json({ message: "Error adding bookmark", error: err.message });
    }
});

// Get all bookmarks for the logged-in user.
router.get("/", verifyToken, async (req, res) => {
    try {
        const bookmarks = await Bookmark.find({ user_id: req.userId }).sort({ bookmarked_at: -1 });
        res.json({ bookmarks, count: bookmarks.length });
    } catch (err) {
        console.error("Error fetching bookmarks:", err.message);
        res.status(500).json({ message: "Error fetching bookmarks", error: err.message });
    }
});

// Delete a bookmark only if it belongs to the logged-in user.
router.delete("/:id", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;

        // Check that the bookmark exists and belongs to this user.
        const bookmark = await Bookmark.findById(id);
        if (!bookmark) {
            return res.status(404).json({ message: "Bookmark not found" });
        }

        if (bookmark.user_id !== req.userId) {
            return res.status(403).json({ message: "You can only delete your own bookmarks" });
        }

        await Bookmark.findByIdAndDelete(id);
        res.json({ message: "Bookmark deleted successfully" });
    } catch (err) {
        console.error("Error deleting bookmark:", err.message);
        res.status(500).json({ message: "Error deleting bookmark", error: err.message });
    }
});

export default router;