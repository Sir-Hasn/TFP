import mongoose from "mongoose";
import { User } from "./models/user.models.js";
import { Bookmark } from "./models/bookmark.models.js";
import { CookingHistory } from "./models/cookingHistory.models.js";
import bookmarkRoutes from "./routes/bookmarks.routes.js";
import cookingHistoryRoutes from "./routes/cookingHistory.routes.js";
import recipeRoutes, { initRecipes } from "./routes/recipe.js";
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import aiRoutes from "./routes/ai.js";
import adminRoutes from "./routes/admin.routes.js";
import cors from "cors";
import express from "express";
import dotenv from "dotenv";
// Use `net stop MongoDB` to stop the MongoDB service.
// Use `net start MongoDB` to start the MongoDB service.
// In MongoDB, data is stored in collections (similar to tables).

// Press Ctrl + C to stop the server.
// Run `node server.js` to start the server.
//to cache something in git: git rm --cached "the file name"
// Load values from the .env file.
dotenv.config();

// Create the Express app.
const app = express();

// Set up shared middleware.
const allowedOrigins = new Set([
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser tools and file:// origin during local development.
    if (!origin || origin === "null" || allowedOrigins.has(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Not allowed by CORS"));
  }
}));
app.use(express.json());

// Register API route groups.
app.use("/api/auth", authRoutes);
app.use("/api/recipes", recipeRoutes);
app.use("/api/bookmarks", bookmarkRoutes);
app.use("/api/user", userRoutes);
app.use("/api/cooking-history", cookingHistoryRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/admin", adminRoutes);

// Connect to MongoDB.
mongoose
    .connect("mongodb://127.0.0.1:27017/filipino_plate")
    .then(() => console.log("Connected to MongoDB"))
    .catch((err) => console.error("Could not connect to MongoDB", err));

// Initialize recipe setup, then start the server.
async function startServer() {
  await initRecipes();
  
  app.listen(3000, () => {
    console.log("Server is running on port 3000");
  });
}

startServer();