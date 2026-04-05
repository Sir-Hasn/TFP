import mongoose from "mongoose";

const User = mongoose.model("User", new mongoose.Schema({
        username: { type: String, unique: true, required: true},
        email: { type: String, unique: true, required: true },
    full_name: { type: String, default: "" },
    avatar: { type: String, default: "" },
    password: { type: String, required: true }, // Save only a hashed password, never plain text.
        role: { type: String, enum: ["user", "admin"], default: "user" },
        status: { type: String, enum: ["active", "suspended"], default: "active" },
        allergens: [String],
        password_reset_code_hash: { type: String, default: "" },
        password_reset_code_expires_at: { type: Date, default: null },
        password_reset_code_attempts: { type: Number, default: 0 },
        password_reset_requested_at: { type: Date, default: null },
        pending_email: { type: String, default: "" },
        email_change_code_hash: { type: String, default: "" },
        email_change_code_expires_at: { type: Date, default: null },
        email_change_code_attempts: { type: Number, default: 0 },
        email_change_requested_at: { type: Date, default: null },
        created_at: { type: Date, default: Date.now }
    }));
export { User };