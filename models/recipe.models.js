import mongoose from "mongoose";

const recipeSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    ingredients: [{ type: String }],
    instructions: { type: String, default: "" },
    image: { type: String, default: null },
    cooking_method: { type: String, default: null },
    is_published: { type: Boolean, default: true },
    created_by_user_id: { type: String, required: true },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});

recipeSchema.pre("save", function saveHook() {
    this.updated_at = new Date();
});

const Recipe = mongoose.model("Recipe", recipeSchema);

export { Recipe };
