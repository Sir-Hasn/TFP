import express from "express";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import { body, param, query } from "express-validator";
import { verifyToken } from "../middleware/auth.middleware.js";
import { requireAdmin } from "../middleware/roleCheck.middleware.js";
import { validateRequest } from "../middleware/requestValidation.middleware.js";
import { User } from "../models/user.models.js";
import { AuditLog } from "../models/auditLog.models.js";
import { Recipe } from "../models/recipe.models.js";
import { buildUserSnapshot, writeAuditLog } from "../services/auditLog.services.js";
import { sendPasswordChangedEmail } from "../services/email.services.js";

const router = express.Router();

function isValidObjectId(value) {
    return mongoose.Types.ObjectId.isValid(value);
}

async function getActiveAdminCount() {
    return User.countDocuments({ role: "admin", status: "active" });
}

function isLastActiveAdmin(activeAdminCount, targetUser) {
    return targetUser.role === "admin" && targetUser.status === "active" && activeAdminCount <= 1;
}

function clampNumber(value, min, max, fallback) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) {
        return fallback;
    }
    return Math.max(min, Math.min(max, parsed));
}

function normalizeString(value) {
    return String(value || "").trim();
}

function normalizeIngredients(ingredients) {
    if (!Array.isArray(ingredients)) {
        return [];
    }

    return ingredients
        .map((item) => normalizeString(item))
        .filter((item) => item.length > 0);
}

function isStrongPassword(value) {
    const password = String(value || "");
    return password.length >= 6 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password);
}

// Admin health check endpoint.
router.get("/health", verifyToken, requireAdmin, (req, res) => {
    return res.json({ message: "Admin routes are available" });
});

// List users for admin management views.
router.get("/users", verifyToken, requireAdmin, async (req, res) => {
    try {
        const users = await User.find({}).select("username email role status created_at").sort({ created_at: -1 });
        return res.json({ users, count: users.length });
    } catch (err) {
        console.error("Error fetching users for admin:", err.message);
        return res.status(500).json({ message: "Error fetching users", error: err.message });
    }
});

// List recent admin audit logs.
router.get(
    "/logs",
    verifyToken,
    requireAdmin,
    validateRequest([
        query("page").optional().isInt({ min: 1 }).withMessage("page must be a positive integer"),
        query("pageSize").optional().isInt({ min: 1, max: 100 }).withMessage("pageSize must be 1 to 100")
    ]),
    async (req, res) => {
    try {
        const page = clampNumber(req.query.page, 1, 100000, 1);
        const pageSize = clampNumber(req.query.pageSize, 1, 100, 20);
        const skip = (page - 1) * pageSize;

        const [logs, total] = await Promise.all([
            AuditLog.find({}).sort({ created_at: -1 }).skip(skip).limit(pageSize),
            AuditLog.countDocuments({})
        ]);

        return res.json({
            logs,
            pagination: {
                page,
                pageSize,
                total,
                totalPages: Math.ceil(total / pageSize)
            }
        });
    } catch (err) {
        console.error("Error fetching audit logs:", err.message);
        return res.status(500).json({ message: "Error fetching audit logs", error: err.message });
    }
});

// List internal recipes managed by admins.
router.get(
    "/recipes",
    verifyToken,
    requireAdmin,
    validateRequest([query("q").optional().isString().withMessage("q must be a string")]),
    async (req, res) => {
    try {
        const q = normalizeString(req.query.q).toLowerCase();
        const filter = {};

        if (q) {
            filter.$or = [
                { title: { $regex: q, $options: "i" } },
                { description: { $regex: q, $options: "i" } },
                { cooking_method: { $regex: q, $options: "i" } }
            ];
        }

        const recipes = await Recipe.find(filter).sort({ created_at: -1 });
        return res.json({ recipes, count: recipes.length });
    } catch (err) {
        console.error("Error fetching admin recipes:", err.message);
        return res.status(500).json({ message: "Error fetching recipes", error: err.message });
    }
});

// Create an internal recipe.
router.post(
    "/recipes",
    verifyToken,
    requireAdmin,
    validateRequest([
        body("title").trim().notEmpty().withMessage("Recipe title is required"),
        body("description").optional().isString().withMessage("description must be a string"),
        body("instructions").optional().isString().withMessage("instructions must be a string"),
        body("image").optional({ values: "falsy" }).isString().withMessage("image must be a string"),
        body("cooking_method").optional({ values: "falsy" }).isString().withMessage("cooking_method must be a string"),
        body("ingredients").optional().isArray().withMessage("ingredients must be an array"),
        body("is_published").optional().isBoolean().withMessage("is_published must be boolean")
    ]),
    async (req, res) => {
    try {
        const title = normalizeString(req.body.title);
        const description = normalizeString(req.body.description);
        const instructions = normalizeString(req.body.instructions);
        const image = normalizeString(req.body.image) || null;
        const cookingMethod = normalizeString(req.body.cooking_method) || null;
        const ingredients = normalizeIngredients(req.body.ingredients);
        const isPublished = req.body.is_published !== false;

        if (!title) {
            return res.status(400).json({ message: "Recipe title is required" });
        }

        const recipe = await Recipe.create({
            title,
            description,
            ingredients,
            instructions,
            image,
            cooking_method: cookingMethod,
            is_published: isPublished,
            created_by_user_id: String(req.userId)
        });

        await writeAuditLog({
            actorUser: req.user,
            action: "recipe_created",
            targetModel: "Recipe",
            targetId: recipe._id,
            targetSummary: { title: recipe.title },
            before: null,
            after: {
                _id: String(recipe._id),
                title: recipe.title,
                is_published: recipe.is_published,
                cooking_method: recipe.cooking_method
            }
        });

        return res.status(201).json({ message: "Recipe created", recipe });
    } catch (err) {
        console.error("Error creating recipe:", err.message);
        return res.status(500).json({ message: "Error creating recipe", error: err.message });
    }
});

// Update an internal recipe.
router.put(
    "/recipes/:id",
    verifyToken,
    requireAdmin,
    validateRequest([
        param("id").isMongoId().withMessage("Invalid recipe id"),
        body("title").optional().isString().withMessage("title must be a string"),
        body("description").optional().isString().withMessage("description must be a string"),
        body("instructions").optional().isString().withMessage("instructions must be a string"),
        body("image").optional({ values: "falsy" }).isString().withMessage("image must be a string"),
        body("cooking_method").optional({ values: "falsy" }).isString().withMessage("cooking_method must be a string"),
        body("ingredients").optional().isArray().withMessage("ingredients must be an array"),
        body("is_published").optional().isBoolean().withMessage("is_published must be boolean")
    ]),
    async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({ message: "Invalid recipe id" });
        }

        const recipe = await Recipe.findById(id);
        if (!recipe) {
            return res.status(404).json({ message: "Recipe not found" });
        }

        const before = {
            _id: String(recipe._id),
            title: recipe.title,
            description: recipe.description,
            ingredients: recipe.ingredients,
            instructions: recipe.instructions,
            image: recipe.image,
            cooking_method: recipe.cooking_method,
            is_published: recipe.is_published
        };

        if (req.body.title !== undefined) recipe.title = normalizeString(req.body.title);
        if (req.body.description !== undefined) recipe.description = normalizeString(req.body.description);
        if (req.body.instructions !== undefined) recipe.instructions = normalizeString(req.body.instructions);
        if (req.body.image !== undefined) recipe.image = normalizeString(req.body.image) || null;
        if (req.body.cooking_method !== undefined) recipe.cooking_method = normalizeString(req.body.cooking_method) || null;
        if (req.body.ingredients !== undefined) recipe.ingredients = normalizeIngredients(req.body.ingredients);
        if (req.body.is_published !== undefined) recipe.is_published = Boolean(req.body.is_published);

        if (!recipe.title) {
            return res.status(400).json({ message: "Recipe title is required" });
        }

        await recipe.save();

        await writeAuditLog({
            actorUser: req.user,
            action: "recipe_updated",
            targetModel: "Recipe",
            targetId: recipe._id,
            targetSummary: { title: recipe.title },
            before,
            after: {
                _id: String(recipe._id),
                title: recipe.title,
                description: recipe.description,
                ingredients: recipe.ingredients,
                instructions: recipe.instructions,
                image: recipe.image,
                cooking_method: recipe.cooking_method,
                is_published: recipe.is_published
            }
        });

        return res.json({ message: "Recipe updated", recipe });
    } catch (err) {
        console.error("Error updating recipe:", err.message);
        return res.status(500).json({ message: "Error updating recipe", error: err.message });
    }
});

// Delete an internal recipe.
router.delete(
    "/recipes/:id",
    verifyToken,
    requireAdmin,
    validateRequest([param("id").isMongoId().withMessage("Invalid recipe id")]),
    async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({ message: "Invalid recipe id" });
        }

        const recipe = await Recipe.findById(id);
        if (!recipe) {
            return res.status(404).json({ message: "Recipe not found" });
        }

        const before = {
            _id: String(recipe._id),
            title: recipe.title,
            is_published: recipe.is_published,
            cooking_method: recipe.cooking_method
        };

        await Recipe.deleteOne({ _id: recipe._id });

        await writeAuditLog({
            actorUser: req.user,
            action: "recipe_deleted",
            targetModel: "Recipe",
            targetId: recipe._id,
            targetSummary: { title: recipe.title },
            before,
            after: null
        });

        return res.json({ message: "Recipe deleted" });
    } catch (err) {
        console.error("Error deleting recipe:", err.message);
        return res.status(500).json({ message: "Error deleting recipe", error: err.message });
    }
});

// Change a user's role (admin or user).
router.put(
    "/users/:id/role",
    verifyToken,
    requireAdmin,
    validateRequest([
        param("id").isMongoId().withMessage("Invalid user id"),
        body("role").isIn(["user", "admin"]).withMessage("Role must be 'user' or 'admin'")
    ]),
    async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.body;

        if (!isValidObjectId(id)) {
            return res.status(400).json({ message: "Invalid user id" });
        }

        if (!["user", "admin"].includes(role)) {
            return res.status(400).json({ message: "Role must be 'user' or 'admin'" });
        }

        const targetUser = await User.findById(id);
        if (!targetUser) {
            return res.status(404).json({ message: "User not found" });
        }

        if (String(req.userId) === String(targetUser._id) && role !== "admin") {
            return res.status(400).json({ message: "You cannot demote your own admin account" });
        }

        if (role !== "admin") {
            const activeAdminCount = await getActiveAdminCount();
            if (isLastActiveAdmin(activeAdminCount, targetUser)) {
                return res.status(409).json({ message: "Cannot remove the last active admin" });
            }
        }

        const before = buildUserSnapshot(targetUser);
        targetUser.role = role;
        const updatedUser = await targetUser.save();

        await writeAuditLog({
            actorUser: req.user,
            action: "user_role_updated",
            targetModel: "User",
            targetId: updatedUser._id,
            targetSummary: {
                username: updatedUser.username,
                email: updatedUser.email
            },
            before,
            after: buildUserSnapshot(updatedUser)
        });

        return res.json({
            message: "User role updated",
            user: {
                _id: updatedUser._id,
                username: updatedUser.username,
                email: updatedUser.email,
                role: updatedUser.role,
                status: updatedUser.status
            }
        });
    } catch (err) {
        console.error("Error updating user role:", err.message);
        return res.status(500).json({ message: "Error updating user role", error: err.message });
    }
});

// Update a user's profile details (username, email, password).
router.put(
    "/users/:id/profile",
    verifyToken,
    requireAdmin,
    validateRequest([
        param("id").isMongoId().withMessage("Invalid user id"),
        body("username").optional().isString().withMessage("username must be a string"),
        body("email").optional().isEmail().withMessage("Invalid email format"),
        body("password").optional().isString().withMessage("password must be a string")
    ]),
    async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({ message: "Invalid user id" });
        }

        const targetUser = await User.findById(id);
        if (!targetUser) {
            return res.status(404).json({ message: "User not found" });
        }

        const hasUsername = Object.prototype.hasOwnProperty.call(req.body, "username");
        const hasEmail = Object.prototype.hasOwnProperty.call(req.body, "email");
        const hasPassword = Object.prototype.hasOwnProperty.call(req.body, "password") && normalizeString(req.body.password).length > 0;

        if (!hasUsername && !hasEmail && !hasPassword) {
            return res.status(400).json({ message: "Provide at least one field to update" });
        }

        const nextUsername = hasUsername ? normalizeString(req.body.username) : targetUser.username;
        const nextEmail = hasEmail ? normalizeString(req.body.email).toLowerCase() : targetUser.email;

        if (!nextUsername) {
            return res.status(400).json({ message: "Username cannot be empty" });
        }

        if (!nextEmail) {
            return res.status(400).json({ message: "Email cannot be empty" });
        }

        if (hasPassword && !isStrongPassword(req.body.password)) {
            return res.status(400).json({ message: "Password must be at least 6 characters long and contain uppercase, lowercase, and a number" });
        }

        const usernameTaken = await User.findOne({ username: nextUsername, _id: { $ne: targetUser._id } }).select("_id");
        if (usernameTaken) {
            return res.status(409).json({ message: "Username already in use" });
        }

        const emailTaken = await User.findOne({ email: nextEmail, _id: { $ne: targetUser._id } }).select("_id");
        if (emailTaken) {
            return res.status(409).json({ message: "Email already in use" });
        }

        const before = buildUserSnapshot(targetUser);

        targetUser.username = nextUsername;
        targetUser.email = nextEmail;

        if (hasPassword) {
            targetUser.password = await bcrypt.hash(String(req.body.password), 10);
        }

        const updatedUser = await targetUser.save();

        await writeAuditLog({
            actorUser: req.user,
            action: "user_profile_updated",
            targetModel: "User",
            targetId: updatedUser._id,
            targetSummary: {
                username: updatedUser.username,
                email: updatedUser.email
            },
            before,
            after: buildUserSnapshot(updatedUser)
        });

        let notificationMessage = "";
        if (hasPassword) {
            try {
                const result = await sendPasswordChangedEmail({
                    userEmail: updatedUser.email,
                    userName: updatedUser.username,
                    changedAt: new Date(),
                    actorEmail: req.user?.email
                });

                if (!result.sent) {
                    notificationMessage = " Password updated but email notification is not configured.";
                }
            } catch (mailErr) {
                console.error("Error sending password-change email:", mailErr.message);
                notificationMessage = " Password updated but email notification failed to send.";
            }
        }

        return res.json({
            message: `User profile updated.${notificationMessage}`,
            user: {
                _id: updatedUser._id,
                username: updatedUser.username,
                email: updatedUser.email,
                role: updatedUser.role,
                status: updatedUser.status
            }
        });
    } catch (err) {
        console.error("Error updating user profile:", err.message);
        return res.status(500).json({ message: "Error updating user profile", error: err.message });
    }
});

// Change a user's account status (active or suspended).
router.put(
    "/users/:id/status",
    verifyToken,
    requireAdmin,
    validateRequest([
        param("id").isMongoId().withMessage("Invalid user id"),
        body("status").isIn(["active", "suspended"]).withMessage("Status must be 'active' or 'suspended'")
    ]),
    async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!isValidObjectId(id)) {
            return res.status(400).json({ message: "Invalid user id" });
        }

        if (!["active", "suspended"].includes(status)) {
            return res.status(400).json({ message: "Status must be 'active' or 'suspended'" });
        }

        const targetUser = await User.findById(id);
        if (!targetUser) {
            return res.status(404).json({ message: "User not found" });
        }

        if (String(req.userId) === String(targetUser._id) && status !== "active") {
            return res.status(400).json({ message: "You cannot suspend your own admin account" });
        }

        if (status !== "active") {
            const activeAdminCount = await getActiveAdminCount();
            if (isLastActiveAdmin(activeAdminCount, targetUser)) {
                return res.status(409).json({ message: "Cannot suspend the last active admin" });
            }
        }

        const before = buildUserSnapshot(targetUser);
        targetUser.status = status;
        const updatedUser = await targetUser.save();

        await writeAuditLog({
            actorUser: req.user,
            action: "user_status_updated",
            targetModel: "User",
            targetId: updatedUser._id,
            targetSummary: {
                username: updatedUser.username,
                email: updatedUser.email
            },
            before,
            after: buildUserSnapshot(updatedUser)
        });

        return res.json({
            message: "User status updated",
            user: {
                _id: updatedUser._id,
                username: updatedUser.username,
                email: updatedUser.email,
                role: updatedUser.role,
                status: updatedUser.status
            }
        });
    } catch (err) {
        console.error("Error updating user status:", err.message);
        return res.status(500).json({ message: "Error updating user status", error: err.message });
    }
});

// Delete a user account.
router.delete(
    "/users/:id",
    verifyToken,
    requireAdmin,
    validateRequest([param("id").isMongoId().withMessage("Invalid user id")]),
    async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({ message: "Invalid user id" });
        }

        const targetUser = await User.findById(id);
        if (!targetUser) {
            return res.status(404).json({ message: "User not found" });
        }

        if (String(req.userId) === String(targetUser._id)) {
            return res.status(400).json({ message: "You cannot delete your own admin account" });
        }

        const activeAdminCount = await getActiveAdminCount();
        if (isLastActiveAdmin(activeAdminCount, targetUser)) {
            return res.status(409).json({ message: "Cannot delete the last active admin" });
        }

        const before = buildUserSnapshot(targetUser);
        await User.deleteOne({ _id: targetUser._id });

        await writeAuditLog({
            actorUser: req.user,
            action: "user_deleted",
            targetModel: "User",
            targetId: targetUser._id,
            targetSummary: {
                username: targetUser.username,
                email: targetUser.email
            },
            before,
            after: null
        });

        return res.json({ message: "User deleted" });
    } catch (err) {
        console.error("Error deleting user:", err.message);
        return res.status(500).json({ message: "Error deleting user", error: err.message });
    }
});

export default router;