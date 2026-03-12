import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { User } from "../models/user.models.js";

const router = express.Router();

// Register endpoint
router.post("/register", (req, res) => {
  // TODO: Implement registration logic (Week 2)
  // 1. Validate input: username, email, password (non-empty, valid email format, password strength)
  // 2. Check if user already exists: User.findOne({ email })
  // 3. Hash password: bcrypt.hash(password, saltRounds), jwt.sign({ userId: user._id }, secretKey, { expiresIn: "1h" })
  // 4. Save user to database: const newUser = new User({ username, email, password: hashedPassword });

  const { username, email, password } = req.body;

   // Basic validation
  if (!username || !email || !password) {
    return res.status(400).json({ message: "All fields are required" });
  }
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: "Invalid email format" });
  }
  // Validate password strength (at least 6 characters, contains upper case and lowercase + numbers)
  if (password.length < 6 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
    return res.status(400).json({ message: "Password must be at least 6 characters long and contain uppercase, lowercase, and a number" });
  }

    // Check if user already exists
  User.findOne({ email }).then((existingUser) => {
    if (existingUser) {
      return res.status(400).json({ message: "Email already in use" });
    }
    else {
      // Hash password and save user
      bcrypt.hash(password, 10).then((hashedPassword) => {
        const newUser = new User({ username, email, password: hashedPassword }); // Create new user instance with hashed password
        newUser.save().then((savedUser) => {
          const token = jwt.sign({ userId: savedUser._id }, process.env.JWT_SECRET, { expiresIn: "1h" }); // Generate JWT token
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

// Login endpoint
router.post("/login", (req, res) => {
  // TODO: Implement login logic (Week 2)

  // 1. Validate input: email, password (non-empty, valid email format)
  // 2. Find user by email: User.find
  // 3. Compare password: bcrypt.compare(password, user.password)
  // 4. Generate JWT token: jwt.sign({ userId: user._id }, secretKey, { expiresIn: "1h" })
    const { email, password } = req.body;
  // Basic validation
  if (!email || !password) {
    return res.status(400).json({message: "Email and password fields are required"});
  }
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: "Invalid email format" });
  }

  // Find user by email
  User.findOne({ email }).then((user) => {
    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Compare password
    bcrypt.compare(password, user.password, (err, isMatch) => {
      if (err) {
        console.error("Error on password comparison:", err);
        return res.status(500).json({ message: "Error on password comparison" });
      }
      if (!isMatch) {
        return res.status(400).json({ message: "Invalid email or password" });
      }

      // Password match - generate token
      const token =jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "1h" });
      res.json({ token });
    });
  }).catch((err) => {
    console.error("Error:", err);
    res.status(500).json({ message: "Error" });
  });
});

// Get current user (protected)
router.get("/me", (req, res) => {
    // TODO: Implement with auth middleware (Week 2)

    // 1. Extract token from Authorization header
    // 2. Verify token: jwt.verify(token, secretKey)
    // 3. Find user by ID from token payload: User.findById(decoded.userId).select("-password")

    // 1. Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Authorization header missing or malformed" });
    }
    const token = authHeader.split(" ")[1];

    // 2. Verify token
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        console.error("Error verifying token:", err);
        return res.status(401).json({ message: "Invalid or expired token" });
      }

      // 3. Find user by ID from token payload
      User.findById(decoded.userId).select("-password").then((user) => {
        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }
        res.json({ user }); // Return user data (excluding password)
      }).catch((err) => {
        console.error("error finding user:", err);
        res.status(500).json({ message: "Error finding user" });
      });
    });
  }); 
export default router;