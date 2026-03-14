import mongoose from "mongoose";

const Bookmark = mongoose.model("Bookmark", new mongoose.Schema({
    user_id: { type: String, required: true }, // Stores the user ID.
    recipe_id: { type: String, required: true }, // Stores the recipe ID from the API.
        recipe_name: { type: String, required: true },
        recipe_image: String,
        cooking_method: String,
        bookmarked_at: { type: Date, default: Date.now }
    }));
export { Bookmark };