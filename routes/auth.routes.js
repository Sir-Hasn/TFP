import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { User } from "../models/user.models.js";
import { verifyToken } from "../middleware/auth.middleware.js";

const router = express.Router();

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Create a new user account.
router.post("/register", (req, res) => {
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
router.post("/login", (req, res) => {
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

  // Find the account by email.
  User.findOne({ email }).then((user) => {
    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Check if the password matches.
    bcrypt.compare(password, user.password, (err, isMatch) => {
      if (err) {
        console.error("Error on password comparison:", err);
        return res.status(500).json({ message: "Error on password comparison" });
      }
      if (!isMatch) {
        return res.status(400).json({ message: "Invalid email or password" });
      }

      // Password is correct, so create a login token.
      const token =jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "1h" });
      res.json({ token });
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
    email: req.user.email,
    role: req.user.role,
    status: req.user.status,
    allergens: req.user.allergens || []
  };

  return res.json({ user });
});

export default router;