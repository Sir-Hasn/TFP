import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { User } from "../models/user.models.js";

const router = express.Router();

// Create a new user account.
router.post("/register", (req, res) => {
  // Steps: validate input, check for duplicate email, hash password, save user, and return a token.

  const { username, email, password } = req.body;

  // Make sure all required fields are present.
  if (!username || !email || !password) {
    return res.status(400).json({ message: "All fields are required" });
  }
  // Make sure the email looks valid.
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: "Invalid email format" });
  }
  // Require a stronger password.
  if (password.length < 6 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
    return res.status(400).json({ message: "Password must be at least 6 characters long and contain uppercase, lowercase, and a number" });
  }

    // Stop if this email is already registered.
  User.findOne({ email }).then((existingUser) => {
    if (existingUser) {
      return res.status(400).json({ message: "Email already in use" });
    }
    else {
      // Hash the password before storing it.
      bcrypt.hash(password, 10).then((hashedPassword) => {
        const newUser = new User({ username, email, password: hashedPassword }); // Create a new user with a hashed password.
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
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
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
router.get("/me", (req, res) => {
  // TODO: Replace this manual token check with shared auth middleware.

  // Read the token from the Authorization header.
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Authorization header missing or malformed" });
    }
    const token = authHeader.split(" ")[1];

    // Verify that the token is valid.
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        console.error("Error verifying token:", err);
        return res.status(401).json({ message: "Invalid or expired token" });
      }

      // Use the token data to find the user record.
      User.findById(decoded.userId).select("-password").then((user) => {
        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }
        res.json({ user }); // Return user data without the password.
      }).catch((err) => {
        console.error("error finding user:", err);
        res.status(500).json({ message: "Error finding user" });
      });
    });
  }); 
export default router;