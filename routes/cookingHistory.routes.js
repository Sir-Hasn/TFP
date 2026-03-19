import express from "express";
import { CookingHistory } from "../models/cookingHistory.models.js";
import { Bookmark } from "../models/bookmark.models.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import axios from "axios";

const router = express.Router();

const PANLASANG_PINOY_API = "https://www.panlasangpinoy.com/wp-json/wp/v2/posts";

// Catalog used for identifying methods the user has never tried.
const FILIPINO_COOKING_METHODS = [
    "adobo",
    "bake",
    "boil",
    "braise",
    "fry",
    "grill",
    "kinilaw",
    "roast",
    "saute",
    "simmer",
    "steam",
    "stew"
];

const METHOD_KEYWORDS = {
    adobo: ["adobo"],
    bake: ["bake", "baked", "oven"],
    boil: ["boil", "boiled"],
    braise: ["braise", "braised"],
    fry: ["fry", "fried", "deep fry", "pan fry"],
    grill: ["grill", "grilled", "ihaw", "inasal"],
    kinilaw: ["kinilaw", "kilawin", "ceviche"],
    roast: ["roast", "roasted"],
    saute: ["saute", "sauteed", "gisa"],
    simmer: ["simmer", "slow cook"],
    steam: ["steam", "steamed"],
    stew: ["stew", "nilaga", "sinigang"]
};

function clampNumber(value, min, max, fallback) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) {
        return fallback;
    }
    return Math.max(min, Math.min(max, parsed));
}

function normalizeMethod(method) {
    if (!method) return null;
    const cleaned = String(method).trim().toLowerCase();
    return cleaned.length > 0 ? cleaned : null;
}

function toSortedMethodCounts(methodCountMap) {
    return Object.entries(methodCountMap)
        .sort((a, b) => b[1] - a[1])
        .map(([method, count]) => ({ method, count }));
}

function getNeverUsedMethods(methodCountMap) {
    return FILIPINO_COOKING_METHODS.filter((method) => !methodCountMap[method]);
}

async function getUserMethodStats(userId) {
    const [cookingHistory, bookmarks] = await Promise.all([
        CookingHistory.find({ user_id: userId }).select("cooking_method").lean(),
        Bookmark.find({ user_id: userId }).select("cooking_method").lean()
    ]);

    const methodCountMap = {};

    for (const item of [...cookingHistory, ...bookmarks]) {
        const normalizedMethod = normalizeMethod(item?.cooking_method);
        if (!normalizedMethod) continue;
        methodCountMap[normalizedMethod] = (methodCountMap[normalizedMethod] || 0) + 1;
    }

    const totalInteractions = Object.values(methodCountMap).reduce((sum, count) => sum + count, 0);
    const countByMethod = toSortedMethodCounts(methodCountMap);
    const uniqueMethods = countByMethod.length;
    const diversityScore = totalInteractions === 0 ? 0 : Number((uniqueMethods / totalInteractions).toFixed(2));
    const neverUsedMethods = getNeverUsedMethods(methodCountMap);

    return {
        methodCountMap,
        countByMethod,
        totalInteractions,
        uniqueMethods,
        diversityScore,
        mostUsedMethod: countByMethod[0]?.method || null,
        leastUsedMethod: countByMethod[countByMethod.length - 1]?.method || null,
        neverUsedMethods
    };
}

async function fetchVarietyRecipes(page = 1, perPage = 50) {
    const response = await axios.get(PANLASANG_PINOY_API, {
        params: {
            page,
            per_page: perPage,
            _embed: true
        },
        timeout: 10000
    });

    return response.data || [];
}

function stripHtml(value) {
    return String(value || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/&[a-z]+;/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function getRecipeText(recipe) {
    const title = stripHtml(recipe?.title?.rendered || recipe?.title || "");
    const excerpt = stripHtml(recipe?.excerpt?.rendered || recipe?.excerpt || "");
    const content = stripHtml(recipe?.content?.rendered || recipe?.content || "");
    return `${title} ${excerpt} ${content}`.toLowerCase();
}

function findMethodMatch(recipeText, targetMethods) {
    for (const method of targetMethods) {
        const keywords = METHOD_KEYWORDS[method] || [method];
        if (keywords.some((keyword) => recipeText.includes(keyword))) {
            return method;
        }
    }
    return null;
}

function mapSuggestionRecipe(item, matchedMethod, isFallback) {
    const title = stripHtml(item?.title?.rendered || item?.title || "");
    const description = stripHtml(item?.excerpt?.rendered || item?.excerpt || "").slice(0, 180);
    const image = item?._embedded?.["wp:featuredmedia"]?.[0]?.source_url || null;

    return {
        recipe: {
            id: item?.id || null,
            title,
            description: description || "Filipino recipe from Panlasang Pinoy",
            image,
            link: item?.link || null
        },
        method: matchedMethod,
        reason: isFallback
            ? "No strong method match found, but this is a Filipino recipe to add variety."
            : `Matches an underused cooking method: ${matchedMethod}.`
    };
}



// Add cooking history entry for the logged-in user.
router.post("/", verifyToken, async (req, res) => {
    try {
        const { recipe_id, recipe_name, cooking_method, cooked_at } = req.body;

        // Make sure required fields are included.
        if (!recipe_id || !recipe_name || !cooking_method) {
            return res.status(400).json({ message: "recipe_id, recipe_name, and cooking_method are required" });
        }

        // Save this cooking history item under the current user.
        const newHistory = new CookingHistory({
            user_id: req.userId, // Set by auth middleware after token check.
            recipe_id,
            recipe_name,
            cooking_method,
            cooked_at: cooked_at || new Date() // Use the provided date, or use now if none is given.
        });

        const savedHistory = await newHistory.save();
        res.status(201).json({ message: "Cooking history logged successfully", history: savedHistory });
    } catch (err) {
        console.error("Error logging cooking history:", err.message);
        res.status(500).json({ message: "Error logging cooking history", error: err.message });
    }
});

// Get all cooking history entries for the logged-in user.
router.get("/", verifyToken, async (req, res) => {
    try {
        const cookingHistory = await CookingHistory.find({ user_id: req.userId }).sort({ cooked_at: -1 });
        res.json({ cookingHistory, count: cookingHistory.length });
    } catch (err) {
        console.error("Error fetching cooking history:", err.message);
        res.status(500).json({ message: "Error fetching cooking history", error: err.message });
    }
});

router.get("/diversity", verifyToken, async (req, res) => {
    try {
        const stats = await getUserMethodStats(req.userId);

        return res.json({
            message: "Diversity stats retrieved",
            diversity: {
                totalInteractions: stats.totalInteractions,
                uniqueMethods: stats.uniqueMethods,
                diversityScore: stats.diversityScore,
                mostUsedMethod: stats.mostUsedMethod,
                leastUsedMethod: stats.leastUsedMethod,
                neverUsedMethods: stats.neverUsedMethods,
                countByMethod: stats.countByMethod
            }
        });
    } catch (err) {
        console.error("Error calculating diversity:", err.message);
        res.status(500).json({ message: "Error calculating diversity", error: err.message });
    }
});

router.get("/suggestions/variety", verifyToken, async (req, res) => {
    try {
        const limit = clampNumber(req.query.limit, 1, 10, 3);
        const stats = await getUserMethodStats(req.userId);

        const targetMethods = stats.neverUsedMethods.length > 0
            ? stats.neverUsedMethods
            : stats.countByMethod.slice(-3).map((item) => item.method);

        const recipes = await fetchVarietyRecipes(1, 50);

        const usedIds = new Set();
        const matchedSuggestions = [];
        const fallbackSuggestions = [];

        for (const recipe of recipes) {
            if (!recipe?.id || usedIds.has(recipe.id)) continue;

            const recipeText = getRecipeText(recipe);
            const matchedMethod = findMethodMatch(recipeText, targetMethods);

            if (matchedMethod) {
                matchedSuggestions.push(mapSuggestionRecipe(recipe, matchedMethod, false));
                usedIds.add(recipe.id);
            } else {
                fallbackSuggestions.push(mapSuggestionRecipe(recipe, null, true));
                usedIds.add(recipe.id);
            }

            if (matchedSuggestions.length >= limit) {
                break;
            }
        }

        const suggestions = [
            ...matchedSuggestions,
            ...fallbackSuggestions.slice(0, Math.max(0, limit - matchedSuggestions.length))
        ].slice(0, limit);

        return res.json({
            message: "Variety suggestions generated",
            targets: targetMethods,
            count: suggestions.length,
            suggestions
        });
    } catch (err) {
        console.error("Error generating variety suggestions:", err.message);
        res.status(500).json({ message: "Error generating variety suggestions", error: err.message });
    }
});
    
export default router;