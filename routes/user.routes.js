import express from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { body } from "express-validator";
import { verifyToken } from "../middleware/auth.middleware.js";
import { validateRequest } from "../middleware/requestValidation.middleware.js";
import { CookingHistory } from "../models/cookingHistory.models.js";
import { User } from "../models/user.models.js";
import { sendEmailChangeCodeEmail, sendPasswordChangedEmail } from "../services/email.services.js";

const router = express.Router();

const FILIPINO_COOKING_METHODS = [
  "adobo",
  "bake",
  "binagoongan",
  "binalot",
  "binanlian",
  "binuro",
  "boil",
  "braise",
  "busal",
  "chicharon",
  "dinaing",
  "fry",
  "ginataan",
  "grill",
  "halabos",
  "hinurno",
  "kinilaw",
  "lechon",
  "lumpia",
  "minatamis",
  "nilasing",
  "paksiw",
  "pinakbet",
  "pinatisan",
  "pinikpikan",
  "relleno",
  "roast",
  "sarciado",
  "sariwa",
  "saute",
  "simmer",
  "steam",
  "stew",
  "tapa",
  "tostado",
  "torta",
  "totso"
];

const EMAIL_CHANGE_CODE_TTL_MS = 10 * 60 * 1000;
const EMAIL_CHANGE_CODE_MAX_ATTEMPTS = 5;
const EMAIL_CHANGE_CODE_COOLDOWN_MS = 60 * 1000;

function normalizeString(value) {
  return String(value ?? "").trim();
}

function normalizeEmail(value) {
  return normalizeString(value).toLowerCase();
}

function isValidAllergenName(value) {
  return /^[A-Za-z ]+$/.test(normalizeString(value));
}

function normalizeAllergens(allergens) {
  if (!Array.isArray(allergens)) {
    return [];
  }

  return [...new Set(
    allergens
      .map((item) => normalizeString(item))
      .filter((item) => item.length > 0)
  )];
}

function isStrongPassword(value) {
  const password = String(value || "");
  return password.length >= 6 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password);
}

function generateVerificationCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashVerificationCode(code) {
  return crypto.createHash("sha256").update(String(code || "")).digest("hex");
}

function normalizeMethod(method) {
  const cleaned = normalizeString(method).toLowerCase();
  return cleaned.length > 0 ? cleaned : null;
}

function buildProfileResponse(userDoc) {
  return {
    _id: String(userDoc._id),
    full_name: userDoc.full_name || "",
    username: userDoc.username,
    email: userDoc.email,
    avatar: userDoc.avatar || "",
    role: userDoc.role,
    status: userDoc.status,
    allergens: userDoc.allergens || [],
    created_at: userDoc.created_at || null
  };
}

function buildCookingStats(historyItems) {
  const methodCountMap = {};

  for (const item of historyItems) {
    const normalizedMethod = normalizeMethod(item?.cooking_method);
    if (!normalizedMethod) {
      continue;
    }

    methodCountMap[normalizedMethod] = (methodCountMap[normalizedMethod] || 0) + 1;
  }

  const countByMethod = Object.entries(methodCountMap)
    .sort((a, b) => b[1] - a[1])
    .map(([method, count]) => ({ method, count }));

  const totalCooked = historyItems.length;
  const uniqueMethods = countByMethod.length;
  const diversityScore = totalCooked === 0 ? 0 : Number((uniqueMethods / totalCooked).toFixed(2));
  const neverUsedMethods = FILIPINO_COOKING_METHODS.filter((method) => !methodCountMap[method]);

  return {
    totalCooked,
    uniqueMethods,
    diversityScore,
    mostCookedMethod: countByMethod[0]?.method || null,
    leastCookedMethod: countByMethod[countByMethod.length - 1]?.method || null,
    neverUsedMethods,
    countByMethod
  };
}

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

// Get the logged-in user's profile.
router.get("/profile", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({ user: buildProfileResponse(user) });
  } catch (err) {
    console.error("Error fetching profile:", err.message);
    return res.status(500).json({ message: "Error fetching profile", error: err.message });
  }
});

// Get the logged-in user's cooking stats.
router.get("/stats", verifyToken, async (req, res) => {
  try {
    const history = await CookingHistory.find({ user_id: req.userId })
      .select("recipe_name cooking_method cooked_at")
      .sort({ cooked_at: -1 })
      .lean();

    return res.json({
      message: "Cooking stats retrieved",
      stats: buildCookingStats(history),
      recentHistory: history.slice(0, 5)
    });
  } catch (err) {
    console.error("Error fetching cooking stats:", err.message);
    return res.status(500).json({ message: "Error fetching cooking stats", error: err.message });
  }
});

router.post(
  "/email-change/request",
  verifyToken,
  validateRequest([
    body("new_email").trim().isEmail().withMessage("Invalid email format")
  ]),
  async (req, res) => {
    try {
      const user = await User.findById(req.userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const newEmail = normalizeEmail(req.body.new_email);
      if (!newEmail) {
        return res.status(400).json({ message: "New email is required" });
      }

      if (newEmail === normalizeEmail(user.email)) {
        return res.status(400).json({ message: "New email must be different from your current email" });
      }

      const emailTaken = await User.findOne({ email: newEmail, _id: { $ne: user._id } }).select("_id");
      if (emailTaken) {
        return res.status(409).json({ message: "Email already in use" });
      }

      const now = Date.now();
      const lastRequestedAt = user.email_change_requested_at ? new Date(user.email_change_requested_at).getTime() : 0;
      if (
        user.pending_email
        && normalizeEmail(user.pending_email) === newEmail
        && lastRequestedAt
        && (now - lastRequestedAt) < EMAIL_CHANGE_CODE_COOLDOWN_MS
      ) {
        return res.status(429).json({
          message: "Please wait before requesting another code.",
          retryAfterSeconds: Math.ceil((EMAIL_CHANGE_CODE_COOLDOWN_MS - (now - lastRequestedAt)) / 1000)
        });
      }

      const code = generateVerificationCode();
      user.pending_email = newEmail;
      user.email_change_code_hash = hashVerificationCode(code);
      user.email_change_code_expires_at = new Date(now + EMAIL_CHANGE_CODE_TTL_MS);
      user.email_change_code_attempts = 0;
      user.email_change_requested_at = new Date(now);
      await user.save();

      const mailResult = await sendEmailChangeCodeEmail({
        userEmail: newEmail,
        userName: user.full_name || user.username,
        code,
        expiresInMinutes: Math.floor(EMAIL_CHANGE_CODE_TTL_MS / 60000)
      });

      if (!mailResult.sent) {
        return res.status(500).json({ message: "Could not send verification code right now. Please try again." });
      }

      return res.json({
        message: "Verification code sent to your new email.",
        expiresInSeconds: Math.floor(EMAIL_CHANGE_CODE_TTL_MS / 1000)
      });
    } catch (err) {
      console.error("Error requesting email change code:", err.message);
      return res.status(500).json({ message: "Error requesting email change code", error: err.message });
    }
  }
);

router.post(
  "/email-change/verify",
  verifyToken,
  validateRequest([
    body("new_email").trim().isEmail().withMessage("Invalid email format"),
    body("code").trim().isLength({ min: 6, max: 6 }).withMessage("Code must be 6 digits")
  ]),
  async (req, res) => {
    try {
      const user = await User.findById(req.userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const newEmail = normalizeEmail(req.body.new_email);
      const code = normalizeString(req.body.code);

      if (!user.pending_email || normalizeEmail(user.pending_email) !== newEmail) {
        return res.status(400).json({ message: "No pending verification was found for that email." });
      }

      if (!user.email_change_code_hash || !user.email_change_code_expires_at) {
        return res.status(400).json({ message: "Please request a new verification code." });
      }

      const expiresAt = new Date(user.email_change_code_expires_at).getTime();
      if (!expiresAt || Date.now() > expiresAt) {
        user.pending_email = "";
        user.email_change_code_hash = "";
        user.email_change_code_expires_at = null;
        user.email_change_code_attempts = 0;
        user.email_change_requested_at = null;
        await user.save();
        return res.status(400).json({ message: "Verification code expired. Please request a new one." });
      }

      const attempts = Number.parseInt(user.email_change_code_attempts || 0, 10);
      if (attempts >= EMAIL_CHANGE_CODE_MAX_ATTEMPTS) {
        return res.status(429).json({ message: "Too many incorrect attempts. Please request a new code." });
      }

      const inputHash = hashVerificationCode(code);
      if (inputHash !== user.email_change_code_hash) {
        user.email_change_code_attempts = attempts + 1;
        await user.save();
        return res.status(400).json({ message: "Invalid verification code." });
      }

      const emailTaken = await User.findOne({ email: newEmail, _id: { $ne: user._id } }).select("_id");
      if (emailTaken) {
        return res.status(409).json({ message: "Email already in use" });
      }

      user.email = newEmail;
      user.pending_email = "";
      user.email_change_code_hash = "";
      user.email_change_code_expires_at = null;
      user.email_change_code_attempts = 0;
      user.email_change_requested_at = null;
      const updatedUser = await user.save();

      return res.json({
        message: "Email verified and updated successfully.",
        user: buildProfileResponse(updatedUser)
      });
    } catch (err) {
      if (err?.code === 11000) {
        return res.status(409).json({ message: "Email already in use" });
      }

      console.error("Error verifying email change code:", err.message);
      return res.status(500).json({ message: "Error verifying email change code", error: err.message });
    }
  }
);

// Update the logged-in user's profile.
router.put(
  "/profile",
  verifyToken,
  validateRequest([
    body("full_name").optional().isString().withMessage("full_name must be a string"),
    body("username").optional().isString().withMessage("username must be a string"),
    body("email").optional().isEmail().withMessage("Invalid email format"),
    body("password").optional().isString().withMessage("password must be a string"),
    body("allergens").optional().isArray().withMessage("allergens must be an array"),
    body("allergens.*")
      .optional()
      .isString()
      .matches(/^[A-Za-z ]+$/)
      .withMessage("Each allergen can only contain letters and spaces"),
    body("avatar").optional().isString().withMessage("avatar must be a string")
  ]),
  async (req, res) => {
    try {
      const user = await User.findById(req.userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const hasFullName = Object.prototype.hasOwnProperty.call(req.body, "full_name");
      const hasUsername = Object.prototype.hasOwnProperty.call(req.body, "username");
      const hasEmail = Object.prototype.hasOwnProperty.call(req.body, "email");
      const hasPassword = Object.prototype.hasOwnProperty.call(req.body, "password") && normalizeString(req.body.password).length > 0;
      const hasAllergens = Object.prototype.hasOwnProperty.call(req.body, "allergens");
      const hasAvatar = Object.prototype.hasOwnProperty.call(req.body, "avatar") && normalizeString(req.body.avatar).length > 0;

      if (!hasFullName && !hasUsername && !hasEmail && !hasPassword && !hasAllergens && !hasAvatar) {
        return res.status(400).json({ message: "Provide at least one field to update" });
      }

      const nextFullName = hasFullName ? normalizeString(req.body.full_name) : user.full_name || "";
      const nextUsername = hasUsername ? normalizeString(req.body.username) : user.username;
      const nextEmail = hasEmail ? normalizeEmail(req.body.email) : user.email;
      const nextAllergens = hasAllergens ? normalizeAllergens(req.body.allergens) : user.allergens || [];

      if (hasAllergens && nextAllergens.some((item) => !isValidAllergenName(item))) {
        return res.status(400).json({ message: "Allergens can only contain letters, spaces, and commas" });
      }

      if (hasFullName && !nextFullName) {
        return res.status(400).json({ message: "Full name cannot be empty" });
      }

      if (hasUsername && !nextUsername) {
        return res.status(400).json({ message: "Username cannot be empty" });
      }

      if (hasEmail && !nextEmail) {
        return res.status(400).json({ message: "Email cannot be empty" });
      }

      if (hasPassword && !isStrongPassword(req.body.password)) {
        return res.status(400).json({ message: "Password must be at least 6 characters long and contain uppercase, lowercase, and a number" });
      }

      const usernameTaken = hasUsername
        ? await User.findOne({ username: nextUsername, _id: { $ne: user._id } }).select("_id")
        : null;
      if (usernameTaken) {
        return res.status(409).json({ message: "Username already in use" });
      }

      const emailTaken = hasEmail
        ? await User.findOne({ email: nextEmail, _id: { $ne: user._id } }).select("_id")
        : null;
      if (emailTaken) {
        return res.status(409).json({ message: "Email already in use" });
      }

      user.full_name = nextFullName;
      user.username = nextUsername;
      user.email = nextEmail;
      user.allergens = nextAllergens;

      if (hasPassword) {
        user.password = await bcrypt.hash(String(req.body.password), 10);
      }

      if (hasAvatar) {
        user.avatar = normalizeString(req.body.avatar);
      }

      const updatedUser = await user.save();

      let notificationMessage = "";
      if (hasPassword) {
        try {
          const result = await sendPasswordChangedEmail({
            userEmail: updatedUser.email,
            userName: updatedUser.full_name || updatedUser.username,
            changedAt: new Date(),
            actorEmail: updatedUser.email
          });

          if (!result.sent) {
            notificationMessage = " Password updated but email notification is not configured.";
          }
        } catch (mailErr) {
          console.error("Error sending self password-change email:", mailErr.message);
          notificationMessage = " Password updated but email notification failed to send.";
        }
      }

      return res.json({
        message: `Profile updated successfully.${notificationMessage}`,
        user: buildProfileResponse(updatedUser)
      });
    } catch (err) {
      if (err?.code === 11000) {
        const fieldName = Object.keys(err.keyPattern || {})[0] || "field";
        return res.status(409).json({ message: `${fieldName} already in use` });
      }

      console.error("Error updating profile:", err.message);
      return res.status(500).json({ message: "Error updating profile", error: err.message });
    }
  }
);

// Update the logged-in user's allergen list.
router.put(
  "/allergens",
  verifyToken,
  validateRequest([
    body("allergens").isArray().withMessage("Allergens must be an array"),
    body("allergens.*")
      .optional()
      .isString()
      .matches(/^[A-Za-z ]+$/)
      .withMessage("Each allergen can only contain letters and spaces")
  ]),
  async (req, res) => {
  try {
    const userId = req.userId; // Set by auth middleware after token check.
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized: No user ID found in token" });
    }
    const { allergens } = req.body;

    // Normalize values so the frontend always receives clean data.
    const normalizedAllergens = [...new Set(
      allergens
        .map((item) => String(item || "").trim())
        .filter((item) => item.length > 0)
    )];

    if (normalizedAllergens.some((item) => !isValidAllergenName(item))) {
      return res.status(400).json({ message: "Allergens can only contain letters, spaces, and commas" });
    }

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
