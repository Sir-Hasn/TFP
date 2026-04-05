const API_BASE_URL = window.location.protocol === "file:"
    ? "http://localhost:3000/api"
    : `${window.location.origin}/api`;
let latestBookmarks = [];

const COOKING_METHOD_KEYWORDS = {
    adobo: ["adobo"],
    bake: ["bake", "baked", "oven"],
    binagoongan: ["binagoongan", "bagoong"],
    binalot: ["binalot", "banana leaves", "pandan"],
    binanlian: ["binanlian", "blanch", "blanched"],
    binuro: ["binuro"],
    boil: ["boil", "boiled", "nilaga", "tinola", "pinangat"],
    braise: ["braise", "braised"],
    busal: ["busal"],
    chicharon: ["chicharon"],
    dinaing: ["dinaing"],
    fry: ["fry", "fried", "prito", "crispy", "pinirito"],
    ginataan: ["ginataan", "gata", "guinataan"],
    grill: ["grill", "grilled", "ihaw", "inasal", "inihaw"],
    halabos: ["halabos"],
    hinurno: ["hinurno", "hurno"],
    kinilaw: ["kinilaw", "kilawin", "ceviche"],
    lechon: ["lechon", "nilechon"],
    lumpia: ["lumpia", "turon"],
    minatamis: ["minatamis"],
    nilasing: ["nilasing"],
    paksiw: ["paksiw", "pinaksiw"],
    pinakbet: ["pinakbet"],
    pinatisan: ["pinatisan"],
    pinikpikan: ["pinikpikan"],
    relleno: ["relleno", "stuffed"],
    roast: ["roast", "roasted"],
    sarciado: ["sarciado"],
    sariwa: ["sariwa"],
    saute: ["saute", "sauteed", "gisa", "ginisa", "sinangag"],
    simmer: ["simmer", "slow cook", "sinigang"],
    steam: ["steam", "steamed"],
    stew: ["stew", "caldereta", "kaldereta", "menudo", "afritada"],
    tapa: ["tapa", "tinapa"],
    tostado: ["tostado"],
    torta: ["torta"],
    totso: ["totso"]
};

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

function setStatus(message, isError = false) {
    const status = document.getElementById("bookmark-status");
    if (!status) {
        return;
    }

    status.textContent = message || "";
    status.classList.toggle("error", Boolean(isError));
}

function inferCookingMethodFromRecipe(recipe) {
    const providedMethod = String(recipe?.cooking_method || "").trim().toLowerCase();
    if (providedMethod && providedMethod !== "unknown" && providedMethod !== "n/a") {
        return providedMethod;
    }

    const haystack = [
        String(recipe?.recipe_name || recipe?.title || ""),
        String(recipe?.description || ""),
        String(recipe?.instructions || "")
    ].join(" ").toLowerCase();

    for (const [method, keywords] of Object.entries(COOKING_METHOD_KEYWORDS)) {
        if (keywords.some((keyword) => haystack.includes(keyword))) {
            return method;
        }
    }

    return "unknown";
}

function toTitleCase(value) {
    const text = String(value || "").trim();
    if (!text) return "Unknown method";
    return text
        .split(/\s+/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(" ");
}

async function fetchRecipes(query = "", limit = 10, page = 1) {
    const params = new URLSearchParams();
    if (query.trim()) {
        params.set("q", query.trim());
    }
    params.set("num", String(limit));
    params.set("page", String(page));

    const response = await fetch(`${API_BASE_URL}/recipes?${params.toString()}`);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.message || "Failed to fetch recipes");
    }

    return data;
}

function isAiBookmark(bookmark) {
    const source = String(bookmark?.source || "").trim().toLowerCase();
    const recipeId = String(bookmark?.recipe_id || "").trim().toLowerCase();
    return source === "ai" || recipeId.startsWith("ai-");
}

function getBookmarkSourceLabel(bookmark) {
    if (isAiBookmark(bookmark)) {
        return "AI Kitchen Assistant";
    }

    return "Panlasang Pinoy";
}

function buildDetailFromBookmark(bookmark) {
    const title = String(bookmark?.recipe_name || "Recipe").trim() || "Recipe";
    const ingredients = Array.isArray(bookmark?.ingredients)
        ? bookmark.ingredients.map((item) => String(item || "").trim()).filter(Boolean)
        : [];

    return {
        title,
        source: isAiBookmark(bookmark) ? "ai" : "bookmark",
        description: String(bookmark?.description || "").trim() || "Saved recipe from your bookmark list.",
        ingredients,
        instructions: String(bookmark?.instructions || "").trim(),
        link: String(bookmark?.link || "").trim()
    };
}

function formatIngredients(ingredients) {
    if (!Array.isArray(ingredients) || ingredients.length === 0) {
        return ["No ingredients provided."];
    }
    return ingredients.map((item) => String(item || "").trim()).filter(Boolean);
}

function formatInstructionSteps(instructions) {
    const text = String(instructions || "").trim();
    if (!text) {
        return ["No instructions provided."];
    }

    const byLine = text
        .split(/\r?\n+/)
        .map((line) => line.replace(/^\s*\d+[.)-]?\s*/, "").trim())
        .filter(Boolean);

    if (byLine.length > 1) {
        return byLine;
    }

    return text
        .split(/(?<=[.!?])\s+/)
        .map((step) => step.trim())
        .filter(Boolean);
}

async function addCookingHistoryEntry(recipe) {
    const token = getToken();
    if (!token) {
        throw new Error("Please log in first so we can track your cooked recipes.");
    }

    const method = inferCookingMethodFromRecipe(recipe);
    const response = await fetch(`${API_BASE_URL}/cooking-history`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
            recipe_id: String(recipe.recipe_id || recipe._id || recipe.recipe_name || "unknown"),
            recipe_name: recipe.recipe_name || "Untitled recipe",
            cooking_method: method,
            cooked_at: new Date().toISOString()
        })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.message || "Failed to log cooking history");
    }

    return data;
}

async function resolveRecipeDetail(bookmark) {
    if (isAiBookmark(bookmark)) {
        return buildDetailFromBookmark(bookmark);
    }

    try {
        const result = await fetchRecipes(bookmark.recipe_name || "", 12, 1);
        const recipes = Array.isArray(result.recipes) ? result.recipes : [];
        if (!recipes.length) {
            return null;
        }

        const normalizedTarget = String(bookmark.recipe_name || "").trim().toLowerCase();
        const exact = recipes.find((item) => String(item?.title || "").trim().toLowerCase() === normalizedTarget);
        return exact || recipes[0];
    } catch (_error) {
        return null;
    }
}

function showRecipeDetails(recipe, fallbackBookmark) {
    const modal = document.getElementById("recipe-detail-modal");
    const title = document.getElementById("recipe-detail-title");
    const source = document.getElementById("recipe-detail-source");
    const description = document.getElementById("recipe-detail-description");
    const ingredients = document.getElementById("recipe-detail-ingredients");
    const steps = document.getElementById("recipe-detail-steps");
    const link = document.getElementById("recipe-detail-link");

    if (!modal || !title || !source || !description || !ingredients || !steps || !link) {
        return;
    }

    const displayRecipe = recipe || {
        title: fallbackBookmark?.recipe_name || "Recipe",
        description: "Details unavailable for this bookmark.",
        ingredients: [],
        instructions: "",
        link: ""
    };

    title.textContent = displayRecipe.title || fallbackBookmark?.recipe_name || "Recipe";
    if (displayRecipe.source === "ai") {
        source.textContent = "AI Kitchen Assistant";
    } else if (displayRecipe.source === "admin") {
        source.textContent = "Admin Recipe";
    } else {
        source.textContent = "Panlasang Pinoy";
    }
    description.textContent = displayRecipe.description || "No description available.";

    ingredients.innerHTML = formatIngredients(displayRecipe.ingredients)
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join("");

    steps.innerHTML = formatInstructionSteps(displayRecipe.instructions)
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join("");

    if (displayRecipe.link) {
        link.href = displayRecipe.link;
        link.classList.remove("hidden");
    } else {
        link.removeAttribute("href");
        link.classList.add("hidden");
    }

    modal.classList.remove("hidden");
    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
}

function hideRecipeDetails() {
    const modal = document.getElementById("recipe-detail-modal");
    if (!modal) {
        return;
    }

    modal.style.display = "none";
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
}

function getFallbackImage(name) {
    const initials = String(name || "TFP")
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0] || "")
        .join("")
        .toUpperCase() || "TFP";

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><rect width="320" height="200" fill="#b7a998"/><text x="50%" y="53%" text-anchor="middle" dominant-baseline="middle" font-family="Poppins, Arial" font-size="54" font-weight="700" fill="#fff8ef">${initials}</text></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

async function fetchBookmarks() {
    if (!window.BookmarkService || typeof window.BookmarkService.getBookmarks !== "function") {
        throw new Error("Bookmark service is unavailable.");
    }

    if (!getToken()) {
        throw new Error("Please log in first to view your bookmarks.");
    }

    return window.BookmarkService.getBookmarks();
}

async function deleteBookmark(bookmarkId) {
    if (!window.BookmarkService || typeof window.BookmarkService.removeBookmark !== "function") {
        throw new Error("Bookmark service is unavailable.");
    }

    if (!getToken()) {
        throw new Error("Please log in first to manage bookmarks.");
    }

    await window.BookmarkService.removeBookmark(bookmarkId);
}

function renderBookmarks(bookmarks) {
    const grid = document.querySelector(".bookmark-grid");
    const emptyState = document.querySelector(".empty-state");

    if (!grid || !emptyState) {
        return;
    }

    latestBookmarks = Array.isArray(bookmarks) ? bookmarks : [];

    if (!latestBookmarks.length) {
        grid.innerHTML = "";
        emptyState.hidden = false;
        return;
    }

    emptyState.hidden = true;

    grid.innerHTML = latestBookmarks
        .map((bookmark, index) => {
            const id = escapeHtml(bookmark._id || "");
            const name = escapeHtml(bookmark.recipe_name || "Untitled recipe");
            const image = bookmark.recipe_image ? escapeHtml(bookmark.recipe_image) : getFallbackImage(bookmark.recipe_name);
            const method = escapeHtml(toTitleCase(inferCookingMethodFromRecipe(bookmark)));
            const sourceLabel = escapeHtml(getBookmarkSourceLabel(bookmark));
            const fallbackDescription = escapeHtml(String(bookmark.description || "Saved recipe from your bookmark list."));

            return `
                <article class="bookmark-card" data-id="${id}">
                    <img src="${image}" alt="${name}" loading="lazy" decoding="async">
                    <div class="bookmark-body">
                        <h3>${name}</h3>
                        <p class="source-pill">${sourceLabel}</p>
                        <p class="bookmark-description">${fallbackDescription}</p>
                        <span class="method-chip">${method}</span>
                        <div class="card-actions">
                            <button type="button" class="view-details-btn" data-view-index="${index}">View details</button>
                            <button type="button" class="secondary-btn cooked-btn" data-cooked-index="${index}" title="Log as cooked">Cooked this</button>
                            <button type="button" class="bookmark-btn is-bookmarked" data-remove-id="${id}" title="Remove bookmark" aria-label="Remove bookmark" aria-pressed="true">
                                <i class="fas fa-bookmark" aria-hidden="true"></i>
                            </button>
                        </div>
                    </div>
                </article>
            `;
        })
        .join("");
}

function registerRemoveHandler() {
    const grid = document.querySelector(".bookmark-grid");
    if (!grid) {
        return;
    }

    grid.addEventListener("click", async (event) => {
        const viewButton = event.target.closest("[data-view-index]");
        if (viewButton) {
            const index = Number.parseInt(viewButton.getAttribute("data-view-index") || "-1", 10);
            if (!Number.isNaN(index) && index >= 0) {
                const bookmark = latestBookmarks[index];
                if (bookmark) {
                    setStatus("Loading recipe details...");
                    const detail = await resolveRecipeDetail(bookmark);
                    showRecipeDetails(detail, bookmark);
                    setStatus("Recipe details loaded.");
                }
            }
            return;
        }

        const cookedButton = event.target.closest("[data-cooked-index]");
        if (cookedButton) {
            const index = Number.parseInt(cookedButton.getAttribute("data-cooked-index") || "-1", 10);
            if (!Number.isNaN(index) && index >= 0) {
                const bookmark = latestBookmarks[index];
                if (!bookmark) {
                    return;
                }

                cookedButton.disabled = true;
                cookedButton.classList.add("is-saving");
                setStatus("Logging cooked recipe...");

                try {
                    await addCookingHistoryEntry(bookmark);
                    setStatus(`Logged '${bookmark.recipe_name || "Recipe"}' as cooked.`);
                } catch (error) {
                    const message = String(error.message || "");
                    if (message.toLowerCase().includes("already logged as cooked for today")) {
                        setStatus(`'${bookmark.recipe_name || "Recipe"}' is already logged for today.`, true);
                    } else {
                        setStatus(message || "Could not save cooking history.", true);
                    }
                } finally {
                    cookedButton.disabled = false;
                    cookedButton.classList.remove("is-saving");
                }
            }
            return;
        }

        const button = event.target.closest("[data-remove-id]");
        if (!button) {
            return;
        }

        const bookmarkId = button.getAttribute("data-remove-id");
        if (!bookmarkId) {
            return;
        }

        const confirmed = window.confirm("Remove this recipe from your bookmarks?");
        if (!confirmed) {
            return;
        }

        button.disabled = true;
        setStatus("Removing bookmark...");

        try {
            await deleteBookmark(bookmarkId);
            const card = button.closest(".bookmark-card");
            if (card) {
                card.remove();
            }

            const remainingCards = grid.querySelectorAll(".bookmark-card");
            const emptyState = document.querySelector(".empty-state");
            if (emptyState && remainingCards.length === 0) {
                emptyState.hidden = false;
            }

            setStatus("Bookmark removed.");
        } catch (error) {
            setStatus(error.message || "Could not remove bookmark.", true);
            button.disabled = false;
        }
    });
}

function registerModalHandlers() {
    const closeButton = document.getElementById("close-recipe-modal");
    const modal = document.getElementById("recipe-detail-modal");

    if (closeButton) {
        closeButton.addEventListener("click", hideRecipeDetails);
    }

    if (modal) {
        modal.addEventListener("click", (event) => {
            if (event.target === modal) {
                hideRecipeDetails();
            }
        });
    }
}

async function initializeBookmarkPage() {
    registerRemoveHandler();
    registerModalHandlers();
    setStatus("Loading your bookmarks...");

    try {
        const bookmarks = await fetchBookmarks();
        renderBookmarks(bookmarks);
        setStatus(bookmarks.length ? `Loaded ${bookmarks.length} bookmark(s).` : "No bookmarks yet.");
    } catch (error) {
        renderBookmarks([]);
        setStatus(error.message || "Failed to load bookmarks.", true);
    }
}

document.addEventListener("DOMContentLoaded", initializeBookmarkPage);
