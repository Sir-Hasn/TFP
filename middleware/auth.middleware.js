import express from "express";
import jwt from "jsonwebtoken";
import { User } from "../models/user.models.js";

const router = express.Router();

export function verifyToken(req, res, next) {
    const authHeader = req.headers["authorization"];
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Authorization header missing or malformed" });
    }

    const token = authHeader.split(" ")[1];
    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
        if (err) {
            console.error("Error verifying token:", err);
            return res.status(401).json({ message: "Invalid or expired token" });
        }

        try {
            const user = await User.findById(decoded.userId).select("-password");
            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }

            req.userId = decoded.userId;
            req.user = user; // Attach user data to the request for later route handlers.
            next();
        } catch (err) {
            console.error("Error finding user:", err);
            return res.status(500).json({ message: "Error finding user" });
        }
    });
}

export default router;