import express from "express";
import axios from "axios";

const router = express.Router();

// Base API endpoint for Panlasang Pinoy posts.
const PANLASANG_PINOY_API = "https://www.panlasangpinoy.com/wp-json/wp/v2/posts";

// Cache Filipino recipe results for 24 hours.
let filipinoRecipeCache = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

function clampNumber(value, min, max, fallback) {
	const parsed = Number.parseInt(value, 10);
	if (Number.isNaN(parsed)) {
		return fallback;
	}
	return Math.max(min, Math.min(max, parsed));
}

function isFilipinoQuery(query) {
	const lowerQuery = String(query || "").toLowerCase();
	return lowerQuery.includes("filipino") || lowerQuery.includes("philippine") || lowerQuery.includes("tagalog") || !query;
}

async function fetchFromPanlasangPinoy(searchTerm, page = 1, perPage = 20) {
	try {
		const response = await axios.get(PANLASANG_PINOY_API, {
			params: {
				search: searchTerm,
				per_page: perPage,
				page,
				_fields: "id,title,excerpt,link,featured_media,content"
			},
			timeout: 10000
		});

		return response.data || [];
	} catch (error) {
		console.warn(`Error fetching from Panlasang Pinoy: ${error.message}`);
		return [];
	}
}

async function fetchFeaturedImage(mediaId) {
	if (!mediaId) return null;
	try {
		const response = await axios.get(`https://www.panlasangpinoy.com/wp-json/wp/v2/media/${mediaId}`, {
			timeout: 5000,
			validateStatus: () => true // Return the response even when media is missing (404).
		});
		if (response.status === 200 && response.data?.source_url) {
			return response.data.source_url;
		}
		return null;
	} catch (error) {
		return null;
	}
}

function extractIngredientsAndInstructions(htmlContent) {
	if (!htmlContent) return { ingredients: [], instructions: "" };
	
	try {
		const html = htmlContent;
		
		// Convert common HTML entities into readable text.
		const decodeHtml = (text) => {
			const map = {
				'&amp;': '&',
				'&lt;': '<',
				'&gt;': '>',
				'&quot;': '"',
				'&#39;': "'",
				'&nbsp;': ' ',
				'&#x25a2;': '',
				'&#32;': ' '
			};
			let result = text;
			Object.entries(map).forEach(([entity, char]) => {
				result = result.replace(new RegExp(entity, 'g'), char);
			});
			// Remove numeric entities like &#160; and &#x25a2;.
			result = result.replace(/&#x[0-9a-f]+;/gi, '');
			result = result.replace(/&#\d+;/g, ' ');
			return result.replace(/\s+/g, ' ').trim();
		};
		
		// Find the ingredients section and read the list items.
		const ingredientsRegex = /<h[2-3][^>]*>Ingredients?<\/h[2-3]>([\s\S]*?)(?=<h[2-3]|$)/i;
		let ingredients = [];
		const ingredientsMatch = html.match(ingredientsRegex);
		
		if (ingredientsMatch) {
			// Pull out each ingredient from list items.
			const listItems = ingredientsMatch[1].match(/<li[^>]*>([\s\S]*?)<\/li>/gi) || [];
			ingredients = listItems
				.map(item => {
					// Remove tags and decode entities.
					return decodeHtml(item.replace(/<[^>]*>/g, " "));
				})
				.filter(item => item.length > 2 && item.length < 200)
				.slice(0, 50); // Keep the first 50 items at most.
		}
		
		// Find the cooking steps section.
		const instructionsRegex = /<h[2-3][^>]*>(?:Directions?|How to Cook|Instructions?|Procedures?|Steps?)<\/h[2-3]>([\s\S]*?)(?=<h[2-3]|$)/i;
		let instructions = "";
		const instructionsMatch = html.match(instructionsRegex);
		
		if (instructionsMatch) {
			// Pull out each step from list items.
			const listItems = instructionsMatch[1].match(/<li[^>]*>([\s\S]*?)<\/li>/gi) || [];
			const steps = listItems
				.map(item => {
					// Remove tags and decode entities.
					return decodeHtml(item.replace(/<[^>]*>/g, " "));
				})
				.filter(item => item.length > 2)
				.slice(0, 20); // Keep the first 20 steps at most.
			
			instructions = steps.join("\n");
		}
		
		return { ingredients, instructions };
	} catch (error) {
		return { ingredients: [], instructions: "" };
	}
}


function mapPanlasangPinoyRecipe(item, imageUrl = null, recipeData = {}) {
	const excerpt = item?.excerpt?.rendered || item?.excerpt || "";
	// Clean HTML and shorten the summary text.
	const cleanExcerpt = excerpt
		.replace(/<[^>]*>/g, "")
		.replace(/&[a-z]+;/g, "") // Remove basic HTML entities.
		.substring(0, 150)
		.trim();
	
	return {
		id: item?.id || null,
		title: (item?.title?.rendered || item?.title || "").replace(/<[^>]*>/g, ""),
		description: cleanExcerpt || "Filipino recipe from Panlasang Pinoy",
		ingredients: recipeData?.ingredients || [],
		instructions: recipeData?.instructions || "",
		image: imageUrl,
		link: item?.link || null
	};
}

async function fetchMultipleFilipinoRecipes(pages = 5, perPage = 50) {
	const allRecipes = new Map();
	
	for (let page = 1; page <= pages; page++) {
		try {
			const recipes = await fetchFromPanlasangPinoy("", page, perPage);
			for (const recipe of recipes) {
				if (recipe?.id && !allRecipes.has(recipe.id)) {
					// Get the featured image for this recipe.
					const imageUrl = await fetchFeaturedImage(recipe.featured_media);
					// Extract ingredients and instructions from recipe content.
					const recipeData = extractIngredientsAndInstructions(recipe.content?.rendered || recipe.content || "");
					const mappedRecipe = mapPanlasangPinoyRecipe(recipe, imageUrl, recipeData);
					allRecipes.set(recipe.id, mappedRecipe);
				}
			}
		} catch (error) {
			console.warn(`Error fetching page ${page}:`, error.message);
		}
	}
	
	return Array.from(allRecipes.values());
}


export async function initRecipes() {
	console.log("Panlasang Pinoy recipe integration is ready.");
}

router.get("/", async (req, res) => {
	const q = String(req.query.q || "");
	const num = clampNumber(req.query.num, 1, 100, 10);
	const page = clampNumber(req.query.page, 1, 100, 1);
	const isFilipinoSearch = isFilipinoQuery(q);

	try {
		let recipes;
		let totalResults;
		let displayQuery;

		if (isFilipinoSearch) {
			// Use cached Filipino recipes if the cache is still fresh.
			const now = Date.now();
			if (filipinoRecipeCache && (now - cacheTimestamp) < CACHE_DURATION) {
				// Return recipes from cache.
				recipes = filipinoRecipeCache.slice((page - 1) * num, page * num);
				totalResults = filipinoRecipeCache.length;
				displayQuery = "Filipino recipes (cached - Panlasang Pinoy)";
			} else {
				// Fetch fresh Filipino recipes from Panlasang Pinoy.
				const freshRecipes = await fetchMultipleFilipinoRecipes(1, 50);
				filipinoRecipeCache = freshRecipes;
				cacheTimestamp = now;
				
				recipes = freshRecipes.slice((page - 1) * num, page * num);
				totalResults = freshRecipes.length;
				displayQuery = "Filipino recipes (Panlasang Pinoy)";
			}
		} else {
			// Run a direct search on Panlasang Pinoy.
			const results = await fetchFromPanlasangPinoy(q, page, num);
			recipes = await Promise.all(
				results.map(async (recipe) => {
					const imageUrl = await fetchFeaturedImage(recipe.featured_media);
					const recipeData = extractIngredientsAndInstructions(recipe.content?.rendered || recipe.content || "");
					return mapPanlasangPinoyRecipe(recipe, imageUrl, recipeData);
				})
			);
			totalResults = results.length > 0 ? recipes.length : 0;
			displayQuery = q;
		}

		return res.json({
			query: displayQuery,
			count: recipes.length,
			page,
			pageSize: num,
			totalResults,
			recipes
		});
	} catch (error) {
		const status = error.response?.status || 500;
		const details = error.response?.data || error.message;
		return res.status(status).json({
			message: "Failed to fetch recipes from Panlasang Pinoy.",
			details
		});
	}
});



export default router; 
