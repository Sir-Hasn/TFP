import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { body } from "express-validator";
import { User } from "../models/user.models.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import { validateRequest } from "../middleware/requestValidation.middleware.js";
import { sendPasswordChangedEmail, sendPasswordResetCodeEmail } from "../services/email.services.js";

const router = express.Router();

const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 5;
const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const loginAttemptsByIdentity = new Map();
const RESET_CODE_TTL_MS = 10 * 60 * 1000;
const RESET_CODE_MAX_ATTEMPTS = 5;
const RESET_CODE_COOLDOWN_MS = 60 * 1000;

function getAttemptKey(email) {
  return String(email || "").trim().toLowerCase();
}

function getAttemptState(key) {
  const now = Date.now();
  const existing = loginAttemptsByIdentity.get(key);

  if (!existing || now - existing.firstAttemptAt > LOGIN_RATE_LIMIT_WINDOW_MS) {
    const fresh = { count: 0, firstAttemptAt: now };
    loginAttemptsByIdentity.set(key, fresh);
    return fresh;
  }

  return existing;
}

function isRateLimited(key) {
  return getAttemptState(key).count >= LOGIN_RATE_LIMIT_MAX_ATTEMPTS;
}

function incrementFailedAttempts(key) {
  const state = getAttemptState(key);
  state.count += 1;
  loginAttemptsByIdentity.set(key, state);
  return state.count;
}

function resetFailedAttempts(key) {
  loginAttemptsByIdentity.delete(key);
}

function getRetryAfterSeconds(key) {
  const state = getAttemptState(key);
  const elapsedMs = Date.now() - state.firstAttemptAt;
  const remainingMs = Math.max(0, LOGIN_RATE_LIMIT_WINDOW_MS - elapsedMs);
  return Math.max(1, Math.ceil(remainingMs / 1000));
}

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function isStrongPassword(password) {
  return String(password || "").length >= 6
    && /[A-Z]/.test(password)
    && /[a-z]/.test(password)
    && /\d/.test(password);
}

function isValidAllergenName(value) {
  return /^[A-Za-z ]+$/.test(String(value || "").trim());
}

function generateResetCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashResetCode(code) {
  return crypto.createHash("sha256").update(String(code || "")).digest("hex");
}

// Create a new user account.
router.post(
  "/register",
  validateRequest([
    body("username").trim().notEmpty().withMessage("Username is required"),
    body("email").trim().notEmpty().withMessage("Email is required").isEmail().withMessage("Invalid email format"),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters long")
      .matches(/[A-Z]/)
      .withMessage("Password must contain an uppercase letter")
      .matches(/[a-z]/)
      .withMessage("Password must contain a lowercase letter")
      .matches(/\d/)
      .withMessage("Password must contain a number"),
    body("allergens").optional().isArray().withMessage("Allergens must be an array"),
    body("allergens.*")
      .optional()
      .isString()
      .matches(/^[A-Za-z ]+$/)
      .withMessage("Each allergen can only contain letters and spaces")
  ]),
  (req, res) => {
  // Steps: validate input, check for duplicate email, hash password, save user, and return a token.

  const { username, email, password, allergens } = req.body;

  // Make sure all required fields are present.
  if (!username || !email || !password) {
    return res.status(400).json({ message: "All fields are required" });
  }
  // Make sure the email looks valid.
  if (!isValidEmail(email)) {
    return res.status(400).json({ message: "Invalid email format" });
  }
  // Require a stronger password.
  if (password.length < 6 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
    return res.status(400).json({ message: "Password must be at least 6 characters long and contain uppercase, lowercase, and a number" });
  }

  // Normalize allergens if provided (optional).
  let normalizedAllergens = [];
  if (allergens && Array.isArray(allergens)) {
    normalizedAllergens = [...new Set(
      allergens
        .map((item) => String(item || "").trim())
        .filter((item) => item.length > 0)
    )];

    const hasInvalidAllergens = normalizedAllergens.some((item) => !isValidAllergenName(item));
    if (hasInvalidAllergens) {
      return res.status(400).json({ message: "Allergens can only contain letters, spaces, and commas" });
    }
  }

    // Stop if this email is already registered.
  User.findOne({ email }).then((existingUser) => {
    if (existingUser) {
      return res.status(400).json({ message: "Email already in use" });
    }
    else {
      // Hash the password before storing it.
      bcrypt.hash(password, 10).then((hashedPassword) => {
        const newUser = new User({ username, email, allergens: normalizedAllergens, password: hashedPassword }); // Create a new user with a hashed password.
        newUser.save().then((savedUser) => {
          const token = jwt.sign({ userId: savedUser._id }, process.env.JWT_SECRET, { expiresIn: "1h" }); // Create a login token for the new user.
          res.json({ token });
        }).catch((err) => {
          console.error("Error saving user:", err.message);
          res.status(500).json({ message: "Error saving user", error: err.message });
        });
      }).catch((err) => {
        console.error("Error hashing password:", err);
        res.status(500).json({ message: "Error hashing password" });
      });
    }
}).catch((err) => {
    console.error("Error checking existing user:", err);
    res.status(500).json({ message: "Error checking existing user" });
  });
});

// Log in an existing user.
router.post(
  "/login",
  validateRequest([
    body("email").trim().notEmpty().withMessage("Email is required").isEmail().withMessage("Invalid email format"),
    body("password").notEmpty().withMessage("Password is required")
  ]),
  (req, res) => {
  // Steps: validate input, find user, check password, and return a token.
    const { email, password } = req.body;
  // Make sure email and password are provided.
  if (!email || !password) {
    return res.status(400).json({message: "Email and password fields are required"});
  }
  // Make sure the email looks valid.
  if (!isValidEmail(email)) {
    return res.status(400).json({ message: "Invalid email format" });
  }

  const attemptKey = getAttemptKey(email);
  if (isRateLimited(attemptKey)) {
    return res.status(429).json({
      message: "Too many login attempts. Please try again later.",
      retryAfterSeconds: getRetryAfterSeconds(attemptKey)
    });
  }

  // Find the account by email.
  User.findOne({ email }).then((user) => {
    if (!user) {
      incrementFailedAttempts(attemptKey);
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Check if the password matches.
    bcrypt.compare(password, user.password, (err, isMatch) => {
      if (err) {
        console.error("Error on password comparison:", err);
        return res.status(500).json({ message: "Error on password comparison" });
      }
      if (!isMatch) {
        incrementFailedAttempts(attemptKey);
        if (isRateLimited(attemptKey)) {
          return res.status(429).json({
            message: "Too many login attempts. Please try again later.",
            retryAfterSeconds: getRetryAfterSeconds(attemptKey)
          });
        }
        return res.status(400).json({ message: "Invalid email or password" });
      }

      resetFailedAttempts(attemptKey);
      // Password is correct, so create a login token.
      const token =jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "1h" });
      res.json({
        token,
        role: user.role,
        user: {
          _id: user._id,
          username: user.username,
          full_name: user.full_name || "",
          email: user.email,
          avatar: user.avatar || "",
          role: user.role,
          status: user.status,
          allergens: user.allergens || []
        }
      });
    });
  }).catch((err) => {
    console.error("Error:", err);
    res.status(500).json({ message: "Error" });
  });
});

// Get the current logged-in user.
router.get("/me", verifyToken, (req, res) => {
  const user = {
    _id: req.user._id,
    username: req.user.username,
    full_name: req.user.full_name || "",
    email: req.user.email,
    avatar: req.user.avatar || "",
    role: req.user.role,
    status: req.user.status,
    allergens: req.user.allergens || []
  };

  return res.json({ user });
});

router.post(
  "/forgot-password",
  validateRequest([
    body("email").trim().notEmpty().withMessage("Email is required").isEmail().withMessage("Invalid email format")
  ]),
  async (req, res) => {
    const genericMessage = "If an account with that email exists, we sent a password reset code.";
    const email = String(req.body?.email || "").trim().toLowerCase();

    try {
      const user = await User.findOne({ email });
      if (!user || user.status !== "active") {
        return res.json({ message: genericMessage });
      }

      const now = Date.now();
      const lastRequestedAt = user.password_reset_requested_at ? new Date(user.password_reset_requested_at).getTime() : 0;
      if (lastRequestedAt && (now - lastRequestedAt) < RESET_CODE_COOLDOWN_MS) {
        return res.json({ message: genericMessage });
      }

      const code = generateResetCode();
      user.password_reset_code_hash = hashResetCode(code);
      user.password_reset_code_expires_at = new Date(now + RESET_CODE_TTL_MS);
      user.password_reset_code_attempts = 0;
      user.password_reset_requested_at = new Date(now);
      await user.save();

      await sendPasswordResetCodeEmail({
        userEmail: user.email,
        userName: user.full_name || user.username,
        code,
        expiresInMinutes: Math.floor(RESET_CODE_TTL_MS / 60000)
      });

      return res.json({ message: genericMessage });
    } catch (error) {
      console.error("Forgot password error:", error.message);
      return res.json({ message: genericMessage });
    }
  }
);

router.post(
  "/reset-password",
  validateRequest([
    body("email").trim().notEmpty().withMessage("Email is required").isEmail().withMessage("Invalid email format"),
    body("code").trim().isLength({ min: 6, max: 6 }).withMessage("Code must be 6 digits"),
    body("newPassword")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters long")
      .matches(/[A-Z]/)
      .withMessage("Password must contain an uppercase letter")
      .matches(/[a-z]/)
      .withMessage("Password must contain a lowercase letter")
      .matches(/\d/)
      .withMessage("Password must contain a number")
  ]),
  async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const code = String(req.body?.code || "").trim();
    const newPassword = String(req.body?.newPassword || "");

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        message: "Password must be at least 6 characters and include an uppercase letter, a lowercase letter, and a number."
      });
    }

    try {
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(400).json({ message: "Invalid or expired reset code." });
      }

      if (!user.password_reset_code_hash || !user.password_reset_code_expires_at) {
        return res.status(400).json({ message: "Invalid or expired reset code." });
      }

      const expiresAt = new Date(user.password_reset_code_expires_at).getTime();
      if (!expiresAt || Date.now() > expiresAt) {
        user.password_reset_code_hash = "";
        user.password_reset_code_expires_at = null;
        user.password_reset_code_attempts = 0;
        await user.save();
        return res.status(400).json({ message: "Reset code expired. Please request a new one." });
      }

      const attempts = Number.parseInt(user.password_reset_code_attempts || 0, 10);
      if (attempts >= RESET_CODE_MAX_ATTEMPTS) {
        return res.status(429).json({ message: "Too many incorrect attempts. Please request a new reset code." });
      }

      const inputHash = hashResetCode(code);
      if (inputHash !== user.password_reset_code_hash) {
        user.password_reset_code_attempts = attempts + 1;
        await user.save();
        return res.status(400).json({ message: "Invalid or expired reset code." });
      }

      user.password = await bcrypt.hash(newPassword, 10);
      user.password_reset_code_hash = "";
      user.password_reset_code_expires_at = null;
      user.password_reset_code_attempts = 0;
      user.password_reset_requested_at = null;
      await user.save();

      await sendPasswordChangedEmail({
        userEmail: user.email,
        userName: user.full_name || user.username,
        changedAt: new Date(),
        actorEmail: "self-service password reset"
      });

      return res.json({ message: "Password reset successful. You can now log in with your new password." });
    } catch (error) {
      console.error("Reset password error:", error.message);
      return res.status(500).json({ message: "Could not reset password right now. Please try again." });
    }
  }
);

export default router;