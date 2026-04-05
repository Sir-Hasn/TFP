import express from "express";
import { body, param } from "express-validator";
import { Bookmark } from "../models/bookmark.models.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import { validateRequest } from "../middleware/requestValidation.middleware.js";

const router = express.Router();

// Add a recipe bookmark for the logged-in user.
router.post(
    "/add",
    verifyToken,
    validateRequest([
        body("recipe_id").trim().notEmpty().withMessage("recipe_id is required"),
        body("recipe_name").trim().notEmpty().withMessage("recipe_name is required"),
        body("recipe_image").optional({ values: "falsy" }).isString().withMessage("recipe_image must be a string"),
        body("cooking_method").optional({ values: "falsy" }).isString().withMessage("cooking_method must be a string"),
        body("source").optional({ values: "falsy" }).isString().withMessage("source must be a string"),
        body("description").optional({ values: "falsy" }).isString().withMessage("description must be a string"),
        body("ingredients").optional().isArray().withMessage("ingredients must be an array"),
        body("ingredients.*").optional({ values: "falsy" }).isString().withMessage("each ingredient must be a string"),
        body("instructions").optional({ values: "falsy" }).isString().withMessage("instructions must be a string"),
        body("tip").optional({ values: "falsy" }).isString().withMessage("tip must be a string"),
        body("link").optional({ values: "falsy" }).isString().withMessage("link must be a string")
    ]),
    async (req, res) => {
    try {
        const { recipe_id, recipe_name, recipe_image, cooking_method, source, description, ingredients, instructions, tip, link } = req.body;

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
            cooking_method: cooking_method || null,
            source: source || null,
            description: description || null,
            ingredients: Array.isArray(ingredients)
                ? ingredients.map((item) => String(item || "").trim()).filter(Boolean)
                : [],
            instructions: instructions || "",
            tip: tip || "",
            link: link || ""
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
router.delete(
    "/:id",
    verifyToken,
    validateRequest([param("id").isMongoId().withMessage("Invalid bookmark id")]),
    async (req, res) => {
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