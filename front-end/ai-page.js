const AI_API_BASE_URL = window.location.protocol === "file:"
    ? "http://localhost:3000/api"
    : `${window.location.origin}/api`;

let currentAiBookmarkPayload = null;
const savedAiRecipeIds = new Set();

function getToken() {
    return localStorage.getItem("token");
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function stripSimpleMarkdown(value) {
    return String(value || "")
        .replace(/^\s*[*-]\s+/gm, "")
        .replace(/^\s*\d+[.)]\s+/gm, "")
        .replace(/[*_`#]/g, "")
        .trim();
}

function isNoiseLine(value) {
    const line = String(value || "").trim();
    if (!line) {
        return true;
    }

    return /^[-_=*~]{3,}$/.test(line) || /^\.{3,}$/.test(line);
}

function truncateText(value, maxChars) {
    const text = String(value || "").trim();
    if (text.length <= maxChars) {
        return text;
    }

    return `${text.slice(0, Math.max(1, maxChars - 1)).trimEnd()}...`;
}

function cleanupSingleLineText(value, maxChars = 140) {
    const cleaned = stripSimpleMarkdown(value)
        .replace(/\s*[-_=*~]{3,}\s*/g, " ")
        .replace(/\s*`{3,}\s*/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    if (!cleaned || isNoiseLine(cleaned)) {
        return "";
    }

    return truncateText(cleaned, maxChars);
}

function cleanupList(lines, { maxItems, maxChars }) {
    const cleaned = (Array.isArray(lines) ? lines : [])
        .map((line) => cleanupSingleLineText(line, maxChars))
        .filter(Boolean)
        .slice(0, maxItems);

    return cleaned;
}

function toCanonicalSectionKey(label) {
    const normalized = String(label || "")
        .toLowerCase()
        .replace(/[^a-z\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    if (["recipe name", "recipe", "dish name", "title"].includes(normalized)) {
        return "recipe name";
    }
    if (["why it fits", "why this fits", "why it works", "why this works"].includes(normalized)) {
        return "why it fits";
    }
    if (["main ingredients", "ingredients"].includes(normalized)) {
        return "main ingredients";
    }
    if (["steps", "instructions", "procedure", "method"].includes(normalized)) {
        return "steps";
    }
    if (["time estimate", "time", "cooking time", "estimated time"].includes(normalized)) {
        return "time estimate";
    }
    if (["nutrition", "nutrition estimate", "nutritional info", "nutritional information"].includes(normalized)) {
        return "nutrition";
    }
    if (["tip", "pro tip", "serving tip"].includes(normalized)) {
        return "tip";
    }

    return "";
}

function parseSectionBlock(sectionText) {
    const lines = String(sectionText || "")
        .split(/\n+/)
        .map((line) => line.trim())
        .filter((line) => !isNoiseLine(line));

    return lines;
}

function parseStructuredSuggestion(rawText) {
    const text = String(rawText || "").trim();
    if (!text) {
        return null;
    }

    const lines = text.split(/\n/);
    const sections = {};
    let currentKey = "";

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
            continue;
        }

        const headerMatch = line.match(/^\s*[#>*\-\s]*\*{0,2}(Recipe Name|Recipe|Dish Name|Title|Why it fits|Why this fits|Why it works|Main Ingredients|Ingredients|Steps|Instructions|Procedure|Method|Time Estimate|Time|Cooking Time|Estimated Time|Nutrition|Nutrition Estimate|Nutritional Info|Nutritional Information|Tip|Pro Tip|Serving Tip)\*{0,2}\s*:?\s*(.*)$/i);

        if (headerMatch) {
            const key = toCanonicalSectionKey(headerMatch[1]);
            if (!key) {
                continue;
            }

            currentKey = key;
            if (!sections[currentKey]) {
                sections[currentKey] = [];
            }

            const remainder = stripSimpleMarkdown(headerMatch[2] || "");
            if (remainder) {
                sections[currentKey].push(remainder);
            }
            continue;
        }

        if (currentKey) {
            sections[currentKey].push(line);
        }
    }

    if (Object.keys(sections).length === 0) {
        return null;
    }

    for (const key of Object.keys(sections)) {
        sections[key] = sections[key].join("\n");
    }

    let recipeName = stripSimpleMarkdown(sections["recipe name"] || "");

    if (!recipeName) {
        const firstUsefulLine = lines
            .map((line) => stripSimpleMarkdown(line))
            .find((line) => {
                if (!line) {
                    return false;
                }
                const normalized = toCanonicalSectionKey(line.replace(/:$/, ""));
                return !normalized && line.length <= 90;
            });
        recipeName = firstUsefulLine || "Suggested Recipe";
    }

    const whyItFits = stripSimpleMarkdown(sections["why it fits"] || "");
    const ingredientsLines = parseSectionBlock(sections["main ingredients"] || "");
    const stepLines = parseSectionBlock(sections.steps || "");
    const timeEstimate = stripSimpleMarkdown(sections["time estimate"] || "");
    const nutrition = parseSectionBlock(sections.nutrition || "");
    const tip = stripSimpleMarkdown(sections.tip || "");

    return {
        recipeName,
        whyItFits,
        ingredientsLines,
        stepLines,
        timeEstimate,
        nutrition,
        tip,
        fallbackText: text
    };
}

function renderListItems(lines) {
    return lines
    .map((line) => cleanupSingleLineText(line, 180))
    .filter((line) => line && !isNoiseLine(line))
        .map((line) => `<li>${escapeHtml(line)}</li>`)
        .join("");
}

function buildResultSection(title, bodyHtml) {
    if (!bodyHtml) {
        return "";
    }

    return `
        <section class="result-section">
            <h3>${title}</h3>
            ${bodyHtml}
        </section>
    `;
}

function renderFallbackText(text) {
    const safeText = escapeHtml(text).trim();
    return safeText
        .split(/\n{2,}/)
        .map((block) => `<p>${block.replace(/\n/g, "<br>")}</p>`)
        .join("");
}

function setResultsMarkup(html) {
    const resultsArea = document.getElementById("results-area");
    if (!resultsArea) {
        return;
    }

    resultsArea.innerHTML = html;
    resultsArea.scrollTop = 0;
}

function renderIdleState() {
    setResultsMarkup(`
        <div class="empty-state" id="empty-state">
            <i class="fas fa-robot"></i>
            <h3>Ready to Cook!</h3>
            <p>Enter your ingredients on the left and hit generate.</p>
        </div>
    `);
}

function renderLoadingState() {
    setResultsMarkup(`
        <div class="result-card loading-state">
            <div class="status-banner">Generating recipe suggestion...</div>
            <p>Checking your ingredients, time preference, and saved allergens.</p>
        </div>
    `);
}

function renderErrorState(message) {
    setResultsMarkup(`
        <div class="result-card error-state">
            <div class="status-banner error">Unable to generate a recipe</div>
            <p>${escapeHtml(message || "Something went wrong.")}</p>
        </div>
    `);
}

function renderSuggestion(response, formValues) {
    const ingredientList = formValues.ingredients
        .split(/[,\n;]/)
        .map((item) => item.trim())
        .filter(Boolean);
    const parsed = parseStructuredSuggestion(response.suggestion || "");

    const promptSummary = [
        formValues.timeLabel ? `Time preference: ${formValues.timeLabel}` : "",
        formValues.useSavedAllergens ? "Saved allergen filters applied" : "Saved allergen filters not applied"
    ].filter(Boolean);

    const cleanedWhy = cleanupSingleLineText(parsed?.whyItFits || "", 1000);
    const cleanedTime = cleanupSingleLineText(parsed?.timeEstimate || "", 200);
    const cleanedTip = cleanupSingleLineText(parsed?.tip || "", 1000);

    const cleanedIngredients = cleanupList(parsed?.ingredientsLines || [], { maxItems: 50, maxChars: 320 });
    const cleanedSteps = cleanupList(parsed?.stepLines || [], { maxItems: 40, maxChars: 500 });
    const cleanedNutrition = cleanupList(parsed?.nutrition || [], { maxItems: 20, maxChars: 240 });

    currentAiBookmarkPayload = buildAiBookmarkPayload({
        recipeName: parsed?.recipeName || "",
        ingredients: cleanedIngredients,
        steps: cleanedSteps,
        whyItFits: cleanedWhy,
        timeEstimate: cleanedTime,
        suggestion: response.suggestion || ""
    });

    const isAlreadySaved = savedAiRecipeIds.has(currentAiBookmarkPayload.recipe_id);

    const ingredientsHtml = cleanedIngredients.length
        ? `<ul class="section-list">${renderListItems(cleanedIngredients)}</ul>`
        : "";

    const stepsHtml = cleanedSteps.length
        ? `<ol class="section-list ordered">${renderListItems(cleanedSteps)}</ol>`
        : "";

    const nutritionHtml = cleanedNutrition.length
        ? `<ul class="section-list nutrition-list">${renderListItems(cleanedNutrition)}</ul>`
        : "";

    const whyHtml = cleanedWhy ? `<p>${escapeHtml(cleanedWhy)}</p>` : "";
    const timeHtml = cleanedTime ? `<p>${escapeHtml(cleanedTime)}</p>` : "";
    const tipHtml = cleanedTip ? `<p>${escapeHtml(cleanedTip)}</p>` : "";

    setResultsMarkup(`
        <article class="result-card">
            <div class="status-banner success">Recipe suggestion ready</div>
            <h2>${escapeHtml(parsed?.recipeName || "Suggested Recipe")}</h2>
            <div class="result-meta">
                ${promptSummary.map((item) => `<span class="meta-chip">${escapeHtml(item)}</span>`).join("")}
            </div>
            ${getAiBookmarkActionMarkup(currentAiBookmarkPayload.recipe_id, isAlreadySaved)}
            ${ingredientList.length > 0 ? `
                <section class="result-section">
                    <h3>Your Ingredients</h3>
                    <p>${ingredientList.map((item) => escapeHtml(item)).join(", ")}</p>
                </section>
            ` : ""}
            ${buildResultSection("Why It Fits", whyHtml)}
            ${buildResultSection("Main Ingredients", ingredientsHtml)}
            ${buildResultSection("Steps", stepsHtml)}
            ${buildResultSection("Time Estimate", timeHtml)}
            ${buildResultSection("Nutrition", nutritionHtml)}
            ${buildResultSection("Tip", tipHtml)}
            ${parsed ? "" : `
            <section class="result-section">
                <h3>Full Suggestion</h3>
                <div class="suggestion-text">${renderFallbackText(response.suggestion || "No suggestion returned.")}</div>
            </section>
            `}
        </article>
    `);
}

async function fetchSuggestion(payload) {
    const token = getToken();
    if (!token) {
        throw new Error("Please sign in to use the AI Kitchen Assistant.");
    }

    const response = await fetch(`${AI_API_BASE_URL}/ai/suggest`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.message || "Failed to generate recipe suggestion.");
    }

    return data;
}

function getTimeLabel(value) {
    switch (String(value || "any")) {
        case "15":
            return "Under 15 minutes";
        case "30":
            return "Under 30 minutes";
        case "60":
            return "Under 1 hour";
        case "slow":
            return "Slow cook / 1+ hours";
        default:
            return "Any amount of time";
    }
}

function slugify(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 64);
}

function hashString(value) {
    let hash = 0;
    const text = String(value || "");
    for (let i = 0; i < text.length; i += 1) {
        hash = ((hash << 5) - hash) + text.charCodeAt(i);
        hash |= 0;
    }

    return Math.abs(hash).toString(16);
}

function inferAiCookingMethod(text) {
    const haystack = String(text || "").toLowerCase();

    const methodByKeywords = [
        { method: "adobo", keywords: ["adobo"] },
        { method: "boil", keywords: ["boil", "nilaga", "tinola", "simmer"] },
        { method: "fry", keywords: ["fry", "fried", "prito", "crispy"] },
        { method: "grill", keywords: ["grill", "ihaw", "inasal", "inihaw"] },
        { method: "saute", keywords: ["saute", "sauteed", "gisa", "ginisa"] },
        { method: "stew", keywords: ["stew", "caldereta", "kaldereta", "menudo", "afritada"] },
        { method: "steam", keywords: ["steam", "steamed"] },
        { method: "bake", keywords: ["bake", "baked", "oven"] },
        { method: "roast", keywords: ["roast", "roasted"] }
    ];

    const match = methodByKeywords.find((entry) => entry.keywords.some((keyword) => haystack.includes(keyword)));
    return match ? match.method : "unknown";
}

function buildAiBookmarkPayload({ recipeName, ingredients, steps, whyItFits, timeEstimate, suggestion }) {
    const cleanedName = cleanupSingleLineText(recipeName, 120) || "AI Suggested Recipe";
    const compactIngredients = cleanupList(ingredients || [], { maxItems: 10, maxChars: 80 }).join(", ");
    const compactTime = cleanupSingleLineText(timeEstimate || "", 80);
    const sourceText = [cleanedName, compactIngredients, compactTime].filter(Boolean).join("|");
    const stableId = `ai-${slugify(cleanedName) || "recipe"}-${hashString(sourceText || suggestion)}`;

    const method = inferAiCookingMethod([
        cleanedName,
        cleanupSingleLineText(whyItFits || "", 300),
        cleanupList(steps || [], { maxItems: 8, maxChars: 120 }).join(" ")
    ].join(" "));

    return {
        recipe_id: stableId,
        recipe_name: cleanedName,
        recipe_image: null,
        cooking_method: method,
        source: "ai",
        description: cleanupSingleLineText(whyItFits || "", 1000),
        ingredients: cleanupList(ingredients || [], { maxItems: 50, maxChars: 320 }),
        instructions: cleanupList(steps || [], { maxItems: 40, maxChars: 500 }).join("\n"),
        link: "",
        suggestion: String(suggestion || "")
    };
}

async function hydrateExistingAiBookmarks() {
    if (!window.BookmarkService || typeof window.BookmarkService.getBookmarks !== "function") {
        return;
    }

    const bookmarks = await window.BookmarkService.getBookmarks();
    bookmarks.forEach((bookmark) => {
        const recipeId = String(bookmark?.recipe_id || "").trim();
        if (recipeId.startsWith("ai-")) {
            savedAiRecipeIds.add(recipeId);
        }
    });
}

function setAiBookmarkStatus(message, isError = false) {
    const status = document.getElementById("bookmark-ai-status");
    if (!status) {
        return;
    }

    status.textContent = message || "";
    status.classList.toggle("error", Boolean(isError));
}

function getAiBookmarkActionMarkup(recipeId, isSaved) {
    return `
        <div class="result-actions">
            <button type="button" class="bookmark-ai-btn" data-ai-bookmark-id="${escapeHtml(recipeId)}" ${isSaved ? "disabled" : ""}>
                <i class="fas fa-bookmark" aria-hidden="true"></i>
                ${isSaved ? "Saved to Bookmarks" : "Save to Bookmarks"}
            </button>
            <p id="bookmark-ai-status" class="bookmark-ai-status">${isSaved ? "This AI recipe is already in your bookmarks." : ""}</p>
        </div>
    `;
}

async function handleAiBookmarkClick(event) {
    const button = event.target.closest(".bookmark-ai-btn");
    if (!button) {
        return;
    }

    const recipeId = String(button.getAttribute("data-ai-bookmark-id") || "").trim();
    if (!recipeId || !currentAiBookmarkPayload || currentAiBookmarkPayload.recipe_id !== recipeId) {
        setAiBookmarkStatus("No generated recipe is available to save right now.", true);
        return;
    }

    if (savedAiRecipeIds.has(recipeId)) {
        button.disabled = true;
        setAiBookmarkStatus("This AI recipe is already in your bookmarks.", false);
        return;
    }

    button.disabled = true;
    setAiBookmarkStatus("Saving recipe to bookmarks...", false);

    try {
        if (!window.BookmarkService || typeof window.BookmarkService.addBookmark !== "function") {
            throw new Error("Bookmark service is not available on this page.");
        }

        await window.BookmarkService.addBookmark({
            recipe_id: currentAiBookmarkPayload.recipe_id,
            recipe_name: currentAiBookmarkPayload.recipe_name,
            recipe_image: currentAiBookmarkPayload.recipe_image || "",
            cooking_method: currentAiBookmarkPayload.cooking_method || "unknown",
            source: currentAiBookmarkPayload.source || "ai",
            description: currentAiBookmarkPayload.description || "",
            ingredients: Array.isArray(currentAiBookmarkPayload.ingredients) ? currentAiBookmarkPayload.ingredients : [],
            instructions: currentAiBookmarkPayload.instructions || "",
            link: currentAiBookmarkPayload.link || ""
        });
        savedAiRecipeIds.add(recipeId);
        button.innerHTML = '<i class="fas fa-bookmark" aria-hidden="true"></i> Saved to Bookmarks';
        setAiBookmarkStatus("Recipe saved to your bookmarks.", false);
    } catch (error) {
        button.disabled = false;
        setAiBookmarkStatus(error.message || "Could not save this recipe right now.", true);
    }
}

function containsPromptInjectionIndicators(value) {
    const text = String(value || "").toLowerCase();
    const patterns = [
        /ignore\s+(all\s+)?(previous|prior)\s+instructions?/i,
        /ignore\s+the\s+above\s+instructions?/i,
        /system\s+prompt/i,
        /developer\s+mode/i,
        /jailbreak/i,
        /act\s+as\s+/i,
        /reveal\s+(your\s+)?prompt/i,
        /bypass\s+(rules|safety|guardrails)/i
    ];

    return patterns.some((pattern) => pattern.test(text));
}

function validateIngredientsInput(value) {
    const text = String(value || "").trim();
    if (!text) {
        return "Add at least one ingredient before generating a recipe.";
    }

    if (text.length > 320) {
        return "Please keep your ingredient list shorter and focused.";
    }

    if (containsPromptInjectionIndicators(text)) {
        return "Sorry, your ingredient input seems invalid. Please enter ingredients like: chicken, garlic, onion.";
    }

    if (!/^[a-zA-Z0-9\s,.'\-\/()&]+$/.test(text)) {
        return "Sorry, your ingredient input seems invalid. Please enter ingredients like: chicken, garlic, onion.";
    }

    const letterCount = (text.match(/[a-zA-Z]/g) || []).length;
    if (letterCount < 3 || !/[a-zA-Z]{2,}/.test(text)) {
        return "Sorry, your ingredient input seems invalid. Please enter ingredients like: chicken, garlic, onion.";
    }

    const items = text
        .split(/[,\n;]/)
        .map((item) => item.trim())
        .filter(Boolean);

    if (items.length === 0) {
        return "Add at least one ingredient before generating a recipe.";
    }

    if (items.length > 40) {
        return "Too many ingredients provided. Please shorten your list.";
    }

    return "";
}

function initializeAiPage() {
    const form = document.getElementById("ai-form");
    const ingredientsInput = document.getElementById("ingredients");
    const timeInput = document.getElementById("time");
    const useAllergensInput = document.getElementById("use-allergens");
    const resultsArea = document.getElementById("results-area");

    if (!form || !ingredientsInput || !timeInput || !useAllergensInput || !resultsArea) {
        return;
    }

    renderIdleState();
    hydrateExistingAiBookmarks().catch(() => {});
    resultsArea.addEventListener("click", (event) => {
        handleAiBookmarkClick(event).catch(() => {});
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const ingredients = ingredientsInput.value.trim();
        const validationError = validateIngredientsInput(ingredients);
        if (validationError) {
            renderErrorState(validationError);
            return;
        }

        const payload = {
            ingredients,
            time: timeInput.value,
            useSavedAllergens: useAllergensInput.checked
        };

        try {
            renderLoadingState();
            const data = await fetchSuggestion(payload);
            renderSuggestion(data, {
                ingredients,
                timeLabel: getTimeLabel(timeInput.value),
                useSavedAllergens: useAllergensInput.checked
            });
        } catch (error) {
            renderErrorState(error.message);
        }
    });
}

document.addEventListener("DOMContentLoaded", initializeAiPage);