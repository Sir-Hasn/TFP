import mongoose from "mongoose";

const User = mongoose.model("User", new mongoose.Schema({
        username: { type: String, unique: true, required: true},
        email: { type: String, unique: true, required: true },
    password: { type: String, required: true }, // Save only a hashed password, never plain text.
        allergens: [String],
        created_at: { type: Date, default: Date.now }
    }));
export { User };