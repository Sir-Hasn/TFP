const API_BASE_URL = window.ApiClient && typeof window.ApiClient.getApiBaseUrl === "function"
    ? window.ApiClient.getApiBaseUrl()
    : (window.location.protocol === "file:"
        ? "http://localhost:3000/api"
        : `${window.location.origin}/api`);


//Signup and Login are included in guest-home html since they are only relevant to guests.
// Once logged in, the user will be redirected to home.html where they can access the full features of the app;
// including bookmarks and cooking history. The script.js file is shared between both pages for common functionality
// like fetching recipes and rendering them on the page.

// Sign up a new user.

async function signUp(username, email, password, allergens = []) {
    if (!window.AuthService || typeof window.AuthService.signUp !== "function") {
        throw new Error("Auth service is unavailable.");
    }

    return window.AuthService.signUp(username, email, password, allergens);
}

// Login existing user/admin and get a token for authenticated requests.
async function login(email, password) {
    if (!window.AuthService || typeof window.AuthService.login !== "function") {
        throw new Error("Auth service is unavailable.");
    }

    return window.AuthService.login(email, password);
}

async function requestPasswordResetCode(email) {
    if (!window.AuthService || typeof window.AuthService.requestPasswordResetCode !== "function") {
        throw new Error("Auth service is unavailable.");
    }

    return window.AuthService.requestPasswordResetCode(email);
}

async function resetPasswordWithCode(email, code, newPassword) {
    if (!window.AuthService || typeof window.AuthService.resetPasswordWithCode !== "function") {
        throw new Error("Auth service is unavailable.");
    }

    return window.AuthService.resetPasswordWithCode(email, code, newPassword);
}

async function fetchRecipes(query = "", limit = 20, page = 1) {
    if (!window.RecipeService || typeof window.RecipeService.fetchRecipes !== "function") {
        throw new Error("Recipe service is unavailable.");
    }

    return window.RecipeService.fetchRecipes(query, limit, page);
}

async function fetchRecipesAcrossPages(query = "", pageSize = 20, maxPages = 5) {
    if (!window.RecipeService || typeof window.RecipeService.fetchRecipesAcrossPages !== "function") {
        throw new Error("Recipe service is unavailable.");
    }

    return window.RecipeService.fetchRecipesAcrossPages(query, pageSize, maxPages);
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

let latestRenderedRecipes = [];
let latestAllRecipes = [];
let bookmarkedRecipeIds = new Set();
let bookmarkIdByRecipeId = new Map();
let forgotPasswordEmail = "";
const ALLERGEN_ALLOWED_CHARACTERS = /^[A-Za-z, ]*$/;

function sanitizeAllergenText(value) {
    return String(value || "")
        .replace(/[^A-Za-z, ]/g, "")
        .replace(/ +, +/g, ", ")
        .replace(/ {2,}/g, " ");
}

function parseAllergenList(value) {
    return sanitizeAllergenText(value)
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
}

function hasInvalidAllergenCharacters(value) {
    return !ALLERGEN_ALLOWED_CHARACTERS.test(String(value || ""));
}

function getForgotModalElements() {
    return {
        modal: document.getElementById("forgotModal"),
        emailInput: document.getElementById("forgot-email"),
        forgotForm: document.getElementById("forgot-form"),
        resetPanel: document.getElementById("forgot-reset-panel"),
        resetForm: document.getElementById("reset-form"),
        resetButton: document.getElementById("reset-password-button"),
        codeInput: document.getElementById("reset-code"),
        passwordInput: document.getElementById("reset-new-password")
    };
}

function resetForgotPasswordModalState() {
    const { emailInput, resetForm, resetButton, codeInput, passwordInput } = getForgotModalElements();

    forgotPasswordEmail = "";

    if (emailInput) {
        emailInput.readOnly = false;
        emailInput.value = "";
    }

    if (resetForm) {
        resetForm.reset();
    }

    if (resetButton) {
        resetButton.disabled = true;
    }

    if (codeInput) {
        codeInput.value = "";
    }

    if (passwordInput) {
        passwordInput.value = "";
    }
}

function showForgotResetStep(email) {
    const { emailInput, resetButton, codeInput, passwordInput } = getForgotModalElements();

    forgotPasswordEmail = String(email || "").trim();

    if (emailInput) {
        emailInput.value = forgotPasswordEmail;
        emailInput.readOnly = true;
    }

    if (codeInput) {
        codeInput.value = "";
    }

    if (passwordInput) {
        passwordInput.value = "";
    }

    if (resetButton) {
        resetButton.disabled = false;
    }

    if (codeInput) {
        codeInput.focus();
    } else if (passwordInput) {
        passwordInput.focus();
    }
}

function returnToForgotEmailStep() {
    const { emailInput, resetForm, resetButton } = getForgotModalElements();

    if (resetForm) {
        resetForm.reset();
    }

    if (resetButton) {
        resetButton.disabled = true;
    }

    if (emailInput) {
        emailInput.readOnly = false;
        emailInput.focus();
    }

    setAuthMessage("Enter your email again if you want to send a new code.", false);
}

async function resendForgotCode() {
    const { emailInput } = getForgotModalElements();
    const email = String(emailInput?.value || forgotPasswordEmail || "").trim();

    if (!isValidEmail(email)) {
        setAuthMessage("Please check your email address and try again.");
        return;
    }

    setAuthMessage("Resending reset code...", false);

    try {
        const data = await requestPasswordResetCode(email);
        forgotPasswordEmail = email;
        setAuthMessage(data.message || "If an account exists, a new reset code has been sent to your email.", false);
        showForgotResetStep(email);
    } catch (error) {
        setAuthMessage(toFriendlyAuthError(error, "Could not resend reset code right now. Please try again."));
    }
}

function getAuthToken() {
    return localStorage.getItem("token") || "";
}

async function fetchUserAllergens() {
    const token = getAuthToken();
    if (!token) {
        return [];
    }

    try {
        const response = await fetch(`${API_BASE_URL}/auth/me`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!response.ok) {
            return [];
        }

        const data = await response.json();
        return Array.isArray(data.user?.allergens) ? data.user.allergens : [];
    } catch (error) {
        return [];
    }
}



async function hasValidUserSession() {
    const token = getAuthToken();
    if (!token) {
        return false;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/auth/me`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!response.ok) {
            localStorage.removeItem("token");
            return false;
        }

        return true;
    } catch (error) {
        return false;
    }
}

async function redirectAuthenticatedUserFromGuestLanding() {
    const pathName = String(window.location.pathname || "").toLowerCase();
    const isGuestLandingRoute = pathName === "/" || pathName.endsWith("/guest-home.html");

    if (!isGuestLandingRoute) {
        return;
    }

    const token = getAuthToken();
    if (!token) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/auth/me`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!response.ok) {
            localStorage.removeItem("token");
            return;
        }

        const data = await response.json().catch(() => ({}));
        const role = String(data?.user?.role || "").toLowerCase();
        const nextPath = role === "admin" ? "../admin.html" : "user-home.html";
        window.location.replace(nextPath);
    } catch (_error) {
        // Keep user on guest landing when session validation is temporarily unavailable.
    }
}

async function fetchUserProfile() {
    const token = getAuthToken();
    if (!token) {
        return null;
    }

    const response = await fetch(`${API_BASE_URL}/user/profile`, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.message || "Failed to load user profile");
    }

    return data && data.user ? data.user : null;
}

function setHeaderProfileAvatar(link, avatarUrl) {
    if (!link || !avatarUrl) {
        return;
    }

    const safeAvatarUrl = String(avatarUrl || "").trim();
    if (!safeAvatarUrl) {
        return;
    }

    const fallbackMarkup = link.innerHTML;
    const image = new Image();

    image.onload = () => {
        link.innerHTML = "";
        const avatar = document.createElement("img");
        avatar.src = safeAvatarUrl;
        avatar.alt = "My Profile";
        avatar.className = "header-avatar";
        link.appendChild(avatar);
    };

    image.onerror = () => {
        link.innerHTML = fallbackMarkup;
    };

    image.src = safeAvatarUrl;
}

async function initHeaderProfileAvatar() {
    const profileLinks = Array.from(document.querySelectorAll("a.profile-link"));
    if (!profileLinks.length) {
        return;
    }

    if (!(await hasValidUserSession())) {
        return;
    }

    try {
        const user = await fetchUserProfile();
        const avatarUrl = user && user.avatar ? user.avatar : "";
        if (!avatarUrl) {
            return;
        }

        profileLinks.forEach((link) => setHeaderProfileAvatar(link, avatarUrl));
    } catch (_error) {
        // Keep default hardcoded icon as fallback when profile fetch fails.
    }
}

function normalizeRecipeId(recipe) {
    const rawId = recipe && (recipe.recipe_id || recipe.id || recipe._id);
    if (rawId) {
        return String(rawId);
    }

    return String(recipe && recipe.title ? recipe.title : "unknown")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-");
}

function applyRecipeFilters(recipes) {
    const methodFilter = document.getElementById("method-filter")?.value || "";
    const timeFilter = Number.parseInt(document.getElementById("time-filter")?.value || "0", 10);
    const allergenInput = document.getElementById("allergen-filter")?.value || "";
    const allergenFilter = parseAllergenList(allergenInput)
        .map((item) => item.toLowerCase());

    return recipes.filter((recipe) => {
        // Infer cooking method if not present
        const recipeMethod = recipe.cooking_method 
            ? String(recipe.cooking_method).toLowerCase() 
            : inferCookingMethodFromRecipe(recipe);

        // Method filter
        if (methodFilter) {
            if (recipeMethod !== methodFilter.toLowerCase()) {
                return false;
            }
        }

        // Time filter (recipes without a known time should not pass when a max limit is set)
        if (timeFilter > 0) {
            const recipeTime = Number.parseInt(recipe.cooking_time, 10);
            if (Number.isNaN(recipeTime) || recipeTime > timeFilter) {
                return false;
            }
        }

        // Allergen filter (check if recipe ingredients contain allergens)
        if (allergenFilter.length > 0 && Array.isArray(recipe.ingredients)) {
            const ingredientsText = recipe.ingredients.join(" ").toLowerCase();
            const hasAllergen = allergenFilter.some((allergen) => ingredientsText.includes(allergen));
            if (hasAllergen) {
                return false;
            }
        }

        return true;
    });
}

function hasActiveRecipeFilters() {
    const methodFilter = document.getElementById("method-filter")?.value || "";
    const timeFilter = document.getElementById("time-filter")?.value || "";
    const allergenFilter = sanitizeAllergenText(document.getElementById("allergen-filter")?.value || "");

    return Boolean(methodFilter.trim() || timeFilter.trim() || allergenFilter.trim());
}

function getEffectiveRecipeSearchQuery(query = "") {
    const trimmedQuery = String(query || "").trim();
    if (trimmedQuery.length > 0) {
        return trimmedQuery;
    }

    const methodFilter = document.getElementById("method-filter")?.value || "";
    return methodFilter.trim();
}

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

function inferCookingMethodFromRecipe(recipe) {
    const providedMethod = String(recipe?.cooking_method || "").trim().toLowerCase();
    if (providedMethod && providedMethod !== "unknown" && providedMethod !== "n/a") {
        return providedMethod;
    }

    const haystack = [
        String(recipe?.title || ""),
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

function setRecipeMetaMessage(message, isError = false) {
    const meta = document.getElementById("recipe-search-meta");
    if (!meta) {
        return;
    }

    meta.textContent = message;
    meta.style.color = isError ? "#8b1e1e" : "";
}

async function fetchUserBookmarks() {
    if (!window.BookmarkService || typeof window.BookmarkService.getBookmarks !== "function") {
        throw new Error("Bookmark service is unavailable.");
    }

    return window.BookmarkService.getBookmarks();
}

async function addRecipeBookmark(recipe) {
    const payload = {
        recipe_id: normalizeRecipeId(recipe),
        recipe_name: recipe.title || "Untitled recipe",
        recipe_image: recipe.image || "",
        cooking_method: recipe.cooking_method || inferCookingMethodFromRecipe(recipe),
        source: String(recipe.source || "").trim() || undefined
    };

    if (!window.BookmarkService || typeof window.BookmarkService.addBookmark !== "function") {
        throw new Error("Bookmark service is unavailable.");
    }

    return window.BookmarkService.addBookmark(payload);
}

async function addCookingHistoryEntry(recipe) {
    const token = getAuthToken();
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
            recipe_id: normalizeRecipeId(recipe),
            recipe_name: recipe.title || "Untitled recipe",
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

async function removeRecipeBookmark(bookmarkId) {
    if (!window.BookmarkService || typeof window.BookmarkService.removeBookmark !== "function") {
        throw new Error("Bookmark service is unavailable.");
    }

    return window.BookmarkService.removeBookmark(bookmarkId);
}

function updateBookmarkButtonState(button, isBookmarked) {
    if (!button) {
        return;
    }

    const icon = button.querySelector("i");
    button.classList.toggle("is-bookmarked", isBookmarked);
    button.setAttribute("aria-pressed", isBookmarked ? "true" : "false");
    button.title = isBookmarked ? "Bookmarked" : "Save to bookmarks";

    if (icon) {
        icon.className = `${isBookmarked ? "fas" : "far"} fa-bookmark`;
    }
}

async function loadBookmarkedRecipeIds() {
    try {
        const bookmarks = await fetchUserBookmarks();
        bookmarkIdByRecipeId = new Map(
            bookmarks
                .filter((item) => item && item.recipe_id && item._id)
                .map((item) => [String(item.recipe_id).trim(), String(item._id).trim()])
        );
        bookmarkedRecipeIds = new Set(
            bookmarks
                .map((item) => String(item.recipe_id || "").trim())
                .filter((item) => item.length > 0)
        );
    } catch (error) {
        bookmarkIdByRecipeId = new Map();
        bookmarkedRecipeIds = new Set();
    }
}

async function handleBookmarkByIndex(index, button) {
    const recipe = latestRenderedRecipes[index];
    if (!recipe || !button) {
        return;
    }

    const recipeId = normalizeRecipeId(recipe);
    if (bookmarkedRecipeIds.has(recipeId)) {
        const bookmarkId = bookmarkIdByRecipeId.get(recipeId);
        if (!bookmarkId) {
            setRecipeMetaMessage("Bookmark reference not found. Refreshing bookmarks...", true);
            await loadBookmarkedRecipeIds();
        }

        const resolvedBookmarkId = bookmarkIdByRecipeId.get(recipeId);
        if (!resolvedBookmarkId) {
            setRecipeMetaMessage("Could not remove bookmark. Please refresh and try again.", true);
            updateBookmarkButtonState(button, true);
            return;
        }

        button.disabled = true;
        button.classList.add("is-saving");

        try {
            await removeRecipeBookmark(resolvedBookmarkId);
            bookmarkedRecipeIds.delete(recipeId);
            bookmarkIdByRecipeId.delete(recipeId);
            updateBookmarkButtonState(button, false);
            setRecipeMetaMessage(`Removed '${recipe.title || "Recipe"}' from bookmarks.`);
        } catch (error) {
            setRecipeMetaMessage(error.message || "Could not remove bookmark.", true);
            updateBookmarkButtonState(button, true);
        } finally {
            button.disabled = false;
            button.classList.remove("is-saving");
        }

        return;
    }

    button.disabled = true;
    button.classList.add("is-saving");

    try {
        const result = await addRecipeBookmark(recipe);
        const bookmark = result && result.bookmark ? result.bookmark : null;
        bookmarkedRecipeIds.add(recipeId);
        if (bookmark && bookmark._id) {
            bookmarkIdByRecipeId.set(recipeId, String(bookmark._id));
        }
        updateBookmarkButtonState(button, true);
        setRecipeMetaMessage(`Saved '${recipe.title || "Recipe"}' to bookmarks.`);
    } catch (error) {
        setRecipeMetaMessage(error.message || "Could not save bookmark.", true);
    } finally {
        button.disabled = false;
        button.classList.remove("is-saving");
    }
}

async function handleCookedByIndex(index, button) {
    const recipe = latestRenderedRecipes[index];
    if (!recipe || !button) {
        return;
    }

    button.disabled = true;
    button.classList.add("is-saving");

    try {
        await addCookingHistoryEntry(recipe);
        setRecipeMetaMessage(`Logged '${recipe.title || "Recipe"}' as cooked.`);
    } catch (error) {
        const message = String(error.message || "");
        if (message.toLowerCase().includes("already logged as cooked for today")) {
            setRecipeMetaMessage(`'${recipe.title || "Recipe"}' is already logged for today.`, true);
        } else {
            setRecipeMetaMessage(message || "Could not save cooking history.", true);
        }
    } finally {
        button.disabled = false;
        button.classList.remove("is-saving");
    }
}

function getSourceLabel(recipe) {
    return recipe.source === "admin" ? "Admin Recipe" : "Panlasang Pinoy";
}

function formatIngredients(ingredients) {
    if (!Array.isArray(ingredients) || !ingredients.length) {
        return ["No ingredients provided."];
    }

    return ingredients
        .map((item) => String(item || "").trim())
        .filter((item) => item.length > 0);
}

function formatInstructionSteps(instructions) {
    const text = String(instructions || "").trim();
    if (!text) {
        return ["No instructions provided."];
    }

    const byLine = text
        .split(/\r?\n+/)
        .map((line) => line.replace(/^\s*\d+[.)-]?\s*/, "").trim())
        .filter((line) => line.length > 0);

    if (byLine.length > 1) {
        return byLine;
    }

    return text
        .split(/(?<=[.!?])\s+/)
        .map((step) => step.trim())
        .filter((step) => step.length > 0);
}

function renderRecipeLoading() {
    const container = document.getElementById("recipe-list");
    if (!container) {
        return;
    }

    container.innerHTML = `
        <div class="recipe-loader" role="status" aria-live="polite" aria-label="Loading recipes">
            <div class="recipe-loader-stage" aria-hidden="true">
                <span class="steam steam-1"></span>
                <span class="steam steam-2"></span>
                <span class="steam steam-3"></span>
                <span class="pot-lid"></span>
                <span class="pot-body"></span>
                <span class="pot-shadow"></span>
            </div>
            <p class="recipe-loader-text">Simmering recipe ideas...</p>
        </div>
    `;
}

function renderRecipes(recipes) {
    const container = document.getElementById("recipe-list");
    
    // Store all recipes and then apply filters
    latestAllRecipes = Array.isArray(recipes) ? recipes : [];
    latestRenderedRecipes = applyRecipeFilters(latestAllRecipes);

    if (!latestRenderedRecipes.length) {
        container.innerHTML = "<p>No recipes found.</p>";
        return 0;
    }

    container.innerHTML = latestRenderedRecipes.map((recipe, index) => {
        const sourceLabel = getSourceLabel(recipe);
        const recipeId = normalizeRecipeId(recipe);
        const isBookmarked = bookmarkedRecipeIds.has(recipeId);
        const imageTag = recipe.image
            ? `<img src="${escapeHtml(recipe.image)}" alt="${escapeHtml(recipe.title)}" class="recipe-image">`
            : "";
        const sourceLink = recipe.link
            ? `<a class="button-link secondary-btn" href="${escapeHtml(recipe.link)}" target="_blank" rel="noopener noreferrer">Open source</a>`
            : "";
        const bookmarkIconClass = isBookmarked ? "fas" : "far";

        return `
            <article class="card recipe-card">
                ${imageTag}
                <h3>${escapeHtml(recipe.title)}</h3>
                <p class="source-pill">${escapeHtml(sourceLabel)}</p>
                <p>${escapeHtml(recipe.description || "No description")}</p>
                <div class="card-actions">
                    <button type="button" class="view-details-btn" data-index="${index}">View details</button>
                    <button type="button" class="secondary-btn cooked-btn" data-index="${index}" title="Log as cooked">
                        Cooked this
                    </button>
                    <button
                        type="button"
                        class="bookmark-btn ${isBookmarked ? "is-bookmarked" : ""}"
                        data-index="${index}"
                        title="${isBookmarked ? "Bookmarked" : "Save to bookmarks"}"
                        aria-label="Save recipe to bookmarks"
                        aria-pressed="${isBookmarked ? "true" : "false"}"
                    >
                        <i class="${bookmarkIconClass} fa-bookmark" aria-hidden="true"></i>
                    </button>
                    ${sourceLink}
                </div>
            </article>
        `;
    }).join("");

    return latestRenderedRecipes.length;
}

function showRecipeDetailsByIndex(index) {
    const recipe = latestRenderedRecipes[index];
    if (!recipe) {
        return;
    }

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

    title.textContent = recipe.title || "Recipe";
    source.textContent = getSourceLabel(recipe);
    description.textContent = recipe.description || "No description available.";

    const safeIngredients = formatIngredients(recipe.ingredients);
    ingredients.innerHTML = safeIngredients
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join("");

    const instructionSteps = formatInstructionSteps(recipe.instructions);
    steps.innerHTML = instructionSteps
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join("");

    if (recipe.link) {
        link.href = recipe.link;
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

async function runSearch(query = "") {
    const meta = document.getElementById("recipe-search-meta");

    if (!meta) {
        return;
    }

    setRecipeMetaMessage("Loading recipes...");
    renderRecipeLoading();

    try {
        const effectiveQuery = getEffectiveRecipeSearchQuery(query);
        const hasFilters = hasActiveRecipeFilters();
        const result = hasFilters
            ? await fetchRecipesAcrossPages(effectiveQuery, 20, 5)
            : await fetchRecipes(effectiveQuery, 20, 1);
        const renderedCount = renderRecipes(result.recipes || []);
        setRecipeMetaMessage(`${renderedCount || 0} recipes shown for '${result.query || "all"}'.`);
    } catch (err) {
        setRecipeMetaMessage(err.message, true);
        const list = document.getElementById("recipe-list");
        if (list) {
            list.innerHTML = "";
        }
    }
}

function initRecipeSearch() {
    const recipeSearchForm = document.getElementById("recipe-search-form");
    const recipeList = document.getElementById("recipe-list");
    const methodFilter = document.getElementById("method-filter");
    const timeFilter = document.getElementById("time-filter");
    const allergenFilter = document.getElementById("allergen-filter");
    const resetFilterBtn = document.getElementById("filter-reset-btn");
    const filtersToggleBtn = document.getElementById("filters-toggle-btn");
    const filtersContent = document.getElementById("filters-content");

    // Filter toggle handler
    if (filtersToggleBtn && filtersContent) {
        filtersToggleBtn.addEventListener("click", () => {
            filtersContent.classList.toggle("hidden");
            filtersToggleBtn.classList.toggle("active");
            
            // Update button text
            const isOpen = !filtersContent.classList.contains("hidden");
            filtersToggleBtn.textContent = isOpen ? " Hide Filters" : " Show Filters";
            filtersToggleBtn.innerHTML = `<i class="fas fa-filter"></i>${isOpen ? " Hide Filters" : " Show Filters"}`;
        });
    }

    // Filter change handlers
    const handleFilterChange = () => {
        latestRenderedRecipes = applyRecipeFilters(latestAllRecipes);
        renderRecipes(latestAllRecipes);
    };

    if (methodFilter) {
        methodFilter.addEventListener("change", handleFilterChange);
    }
    if (timeFilter) {
        timeFilter.addEventListener("input", handleFilterChange);
    }
    if (allergenFilter) {
        allergenFilter.addEventListener("input", () => {
            const sanitized = sanitizeAllergenText(allergenFilter.value);
            if (sanitized !== allergenFilter.value) {
                allergenFilter.value = sanitized;
            }
            handleFilterChange();
        });
        allergenFilter.addEventListener("change", handleFilterChange);
    }
    if (resetFilterBtn) {
        resetFilterBtn.addEventListener("click", () => {
            if (methodFilter) methodFilter.value = "";
            if (timeFilter) timeFilter.value = "";
            if (allergenFilter) allergenFilter.value = "";
            handleFilterChange();
        });
    }

    if (recipeList) {
        recipeList.addEventListener("click", async (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) {
                return;
            }

            const bookmarkButton = target.closest(".bookmark-btn");
            if (bookmarkButton) {
                const index = Number.parseInt(bookmarkButton.getAttribute("data-index") || "-1", 10);
                if (!Number.isNaN(index) && index >= 0) {
                    await handleBookmarkByIndex(index, bookmarkButton);
                }
                return;
            }

            const detailsButton = target.closest(".view-details-btn");
            const cookedButton = target.closest(".cooked-btn");

            if (cookedButton) {
                const index = Number.parseInt(cookedButton.getAttribute("data-index") || "-1", 10);
                if (!Number.isNaN(index) && index >= 0) {
                    await handleCookedByIndex(index, cookedButton);
                }
                return;
            }

            if (!detailsButton) {
                return;
            }

            const index = Number.parseInt(detailsButton.getAttribute("data-index") || "-1", 10);
            if (!Number.isNaN(index) && index >= 0) {
                showRecipeDetailsByIndex(index);
            }
        });
    }

    if (!recipeSearchForm) {
        return;
    }

    recipeSearchForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const queryInput = document.getElementById("recipe-query");
        const query = queryInput ? queryInput.value : "";
        runSearch(query);
    });

    loadBookmarkedRecipeIds().finally(() => {
        // Load user allergens if logged in
        fetchUserAllergens().then((userAllergens) => {
            if (userAllergens.length > 0 && allergenFilter) {
                allergenFilter.value = sanitizeAllergenText(userAllergens.join(", "));
            }
            if (userAllergens.length > 0 && filtersContent) {
                filtersContent.classList.remove("hidden");
                if (filtersToggleBtn) {
                    filtersToggleBtn.classList.add("active");
                    filtersToggleBtn.innerHTML = '<i class="fas fa-filter"></i> Hide Filters';
                }
            }
            runSearch("");
        });
    });
}

function setAuthMessage(message, isError = true) {
    const loginModal = document.getElementById("loginModal");
    const signupModal = document.getElementById("signupModal");
    const forgotModal = document.getElementById("forgotModal");

    let authMessage = null;
    if (loginModal && loginModal.style.display === "flex") {
        authMessage = document.getElementById("login-message");
    } else if (signupModal && signupModal.style.display === "flex") {
        authMessage = document.getElementById("signup-message");
    } else if (forgotModal && forgotModal.style.display === "flex") {
        authMessage = document.getElementById("forgot-message");
    } else {
        authMessage = document.getElementById("login-message") || document.getElementById("signup-message") || document.getElementById("forgot-message") || document.getElementById("auth-message");
    }

    if (!authMessage) {
        return;
    }

    authMessage.textContent = message;
    authMessage.style.color = isError ? "#b00020" : "#0b7d3b";
}

function clearAuthMessage() {
    const ids = ["login-message", "signup-message", "forgot-message", "auth-message"];
    ids.forEach((id) => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = "";
        }
    });
}

function validateResetCodeInput(code, password) {
    const sanitizedCode = String(code || "").trim();
    if (!/^\d{6}$/.test(sanitizedCode)) {
        return "Please enter the 6-digit reset code sent to your email.";
    }

    if (password.length < 6 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
        return "Password must be at least 6 characters and include an uppercase letter, a lowercase letter, and a number.";
    }

    return "";
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateLoginInput(email, password) {
    if (!email || !password) {
        return "Please enter both your email and password.";
    }
    if (!isValidEmail(email)) {
        return "Please check your email address and try again.";
    }
    return "";
}

function validateSignupInput(username, email, password) {
    if (!username || !email || !password) {
        return "Please fill in your username, email, and password.";
    }
    if (username.length < 3) {
        return "Your username is too short. Please use at least 3 characters.";
    }
    if (!isValidEmail(email)) {
        return "Please check your email address and try again.";
    }
    if (password.length < 6 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
        return "Password must be at least 6 characters and include an uppercase letter, a lowercase letter, and a number.";
    }
    return "";
}

function toFriendlyAuthError(error, fallbackMessage) {
    const serverMessage = error && error.message ? String(error.message).trim() : "";

    if (serverMessage === "Failed to fetch") {
        return "We cannot connect right now. Please check your internet and try again.";
    }

    if (!serverMessage) {
        return fallbackMessage || "Something went wrong. Please try again.";
    }

    const rawMessage = serverMessage.toLowerCase();

    // Hide internal server diagnostics from end users.
    if (rawMessage.startsWith("error ")) {
        return "Something went wrong on our side. Please try again in a moment.";
    }

    if (rawMessage.includes("invalid email format")) {
        return "Please check your email address and try again.";
    }

    if (rawMessage.includes("email already in use")) {
        return "This email is already registered. Try logging in instead.";
    }

    if (rawMessage.includes("invalid email or password")) {
        return "Your email or password is not correct. Please try again.";
    }

    if (rawMessage.includes("all fields are required")) {
        return "Please complete all required fields.";
    }

    if (rawMessage.includes("password must be")) {
        return "Please use a stronger password with uppercase, lowercase, and a number.";
    }

    if (rawMessage.includes("reset code expired") || rawMessage.includes("invalid or expired reset code")) {
        return "The reset code is invalid or expired. Request a new code and try again.";
    }

    if (rawMessage.includes("too many incorrect attempts")) {
        return "You have tried the wrong code too many times. Request a new reset code and try again.";
    }

    if (rawMessage.includes("please request a new reset code")) {
        return "Your reset code is no longer usable. Request a new one and try again.";
    }

    // Default behavior: show backend message directly.
    return serverMessage;
}

async function handleLoginSubmit(event) {
    event.preventDefault();
    const submitButton = event.submitter || event.target.querySelector('button[type="submit"]');

    if (submitButton) {
        submitButton.disabled = true;
    }

    const emailInput = document.getElementById("login-email");
    const passwordInput = document.getElementById("login-password");
    const email = emailInput ? emailInput.value.trim() : "";
    const password = passwordInput ? passwordInput.value : "";
    const validationError = validateLoginInput(email, password);

    if (validationError) {
        setAuthMessage(validationError);
        if (submitButton) {
            submitButton.disabled = false;
        }
        return;
    }

    setAuthMessage("Signing you in...", false);

    try {
        const data = await login(email, password);
        if (data.token) {
            localStorage.setItem("token", data.token);
        }
        setAuthMessage("Login successful. Redirecting...", false);
        const nextPath = data.role === "admin" ? "../admin.html" : "user-home.html";
        window.location.href = nextPath;
    } catch (error) {
        setAuthMessage(toFriendlyAuthError(error, "We could not sign you in right now. Please try again."));
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
        }
    }
}

async function handleSignupSubmit(event) {
    event.preventDefault();
    const submitButton = event.submitter || event.target.querySelector('button[type="submit"]');

    if (submitButton) {
        submitButton.disabled = true;
    }

    clearAuthMessage();

    const usernameInput = document.getElementById("signup-username");
    const emailInput = document.getElementById("signup-email");
    const passwordInput = document.getElementById("signup-password");
    const username = usernameInput ? usernameInput.value.trim() : "";
    const email = emailInput ? emailInput.value.trim() : "";
    const password = passwordInput ? passwordInput.value : "";
    const allergensInput = document.getElementById("allergens");
    const rawAllergens = allergensInput ? allergensInput.value : "";

    if (hasInvalidAllergenCharacters(rawAllergens)) {
        setAuthMessage("Allergens can only contain letters, spaces, and commas.");
        if (submitButton) {
            submitButton.disabled = false;
        }
        return;
    }

    const allergens = parseAllergenList(rawAllergens);
    const validationError = validateSignupInput(username, email, password);

    if (validationError) {
        setAuthMessage(validationError);
        if (submitButton) {
            submitButton.disabled = false;
        }
        return;
    }

    setAuthMessage("Creating your account...", false);

    try {
        const data = await signUp(username, email, password, allergens);
        if (data.token) {
            localStorage.setItem("token", data.token);
        }
        setAuthMessage("Sign up successful. Redirecting...", false);
        window.location.href = "user-home.html";
    } catch (error) {
        setAuthMessage(toFriendlyAuthError(error, "We could not create your account right now. Please try again."));
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
        }
    }
}

async function handleForgotPasswordSubmit(event) {
    event.preventDefault();
    const submitButton = event.submitter || event.target.querySelector('button[type="submit"]');
    if (submitButton) {
        submitButton.disabled = true;
    }

    const emailInput = document.getElementById("forgot-email");
    const email = emailInput ? emailInput.value.trim() : "";

    if (!isValidEmail(email)) {
        setAuthMessage("Please check your email address and try again.");
        if (submitButton) {
            submitButton.disabled = false;
        }
        return;
    }

    setAuthMessage("Sending reset code...", false);

    try {
        const data = await requestPasswordResetCode(email);
        setAuthMessage(data.message || "If an account exists, a 6-digit reset code has been sent.", false);
        showForgotResetStep(email);
    } catch (error) {
        setAuthMessage(toFriendlyAuthError(error, "Could not send reset code right now. Please try again."));
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
        }
    }
}

async function handleResetPasswordSubmit(event) {
    event.preventDefault();
    const submitButton = event.submitter || event.target.querySelector('button[type="submit"]');
    if (submitButton) {
        submitButton.disabled = true;
    }

    const emailInput = document.getElementById("forgot-email");
    const codeInput = document.getElementById("reset-code");
    const passwordInput = document.getElementById("reset-new-password");
    const email = emailInput ? emailInput.value.trim() : forgotPasswordEmail;
    const code = codeInput ? codeInput.value.trim() : "";
    const newPassword = passwordInput ? passwordInput.value : "";

    if (!isValidEmail(email)) {
        setAuthMessage("Please enter the same email used to request the reset code.");
        if (submitButton) {
            submitButton.disabled = false;
        }
        return;
    }

    const validationError = validateResetCodeInput(code, newPassword);
    if (validationError) {
        setAuthMessage(validationError);
        if (submitButton) {
            submitButton.disabled = false;
        }
        return;
    }

    setAuthMessage("Resetting your password...", false);

    try {
        const data = await resetPasswordWithCode(email, code, newPassword);
        setAuthMessage(data.message || "Password reset successful. You can now log in.", false);
        setTimeout(() => {
            resetForgotPasswordModalState();
            switchModal("forgotModal", "loginModal");
        }, 1200);
    } catch (error) {
        setAuthMessage(toFriendlyAuthError(error, "Could not reset password right now. Please try again."));
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
        }
    }
}

function openModal(id) {
    clearAuthMessage();
    const element = document.getElementById(id);
    if (element) {
        element.style.display = "flex";
    }
}

function closeModal(id) {
    const element = document.getElementById(id);
    if (element) {
        element.style.display = "none";
    }

    if (id === "forgotModal") {
        resetForgotPasswordModalState();
    }
}

function switchModal(currentId, nextId) {
    closeModal(currentId);
    openModal(nextId);
}

window.onclick = function(event) {
    if (event.target && event.target.className === "modal") {
        event.target.style.display = "none";
        if (event.target.id === "recipe-detail-modal") {
            hideRecipeDetails();
        }
    }
};

function initGuestAuth() {
    const loginForm = document.getElementById("login-form");
    const signupForm = document.getElementById("signup-form");
    const forgotForm = document.getElementById("forgot-form");
    const resetForm = document.getElementById("reset-form");
    const signupAllergensInput = document.getElementById("allergens");

    if (loginForm) {
        loginForm.addEventListener("submit", handleLoginSubmit);
    }

    if (signupForm) {
        signupForm.addEventListener("submit", handleSignupSubmit);
    }

    if (signupAllergensInput) {
        signupAllergensInput.addEventListener("input", () => {
            const sanitized = sanitizeAllergenText(signupAllergensInput.value);
            if (sanitized !== signupAllergensInput.value) {
                signupAllergensInput.value = sanitized;
            }
        });
    }

    if (forgotForm) {
        forgotForm.addEventListener("submit", handleForgotPasswordSubmit);
    }

    if (resetForm) {
        resetForm.addEventListener("submit", handleResetPasswordSubmit);
    }

    initPasswordToggle();
}

function initPasswordToggle() {
    const passwordToggles = document.querySelectorAll(".password-toggle");

    passwordToggles.forEach((toggle) => {
        toggle.addEventListener("click", (e) => {
            e.preventDefault();
            const wrapper = toggle.closest(".password-input-wrapper");
            const input = wrapper.querySelector(".password-input");
            const icon = toggle.querySelector("i");

            if (input.type === "password") {
                input.type = "text";
                icon.classList.remove("fa-eye");
                icon.classList.add("fa-eye-slash");
            } else {
                input.type = "password";
                icon.classList.remove("fa-eye-slash");
                icon.classList.add("fa-eye");
            }
        });
    });
}

async function initAboutHeaderAuthState() {
    const authActions = document.getElementById("about-auth-actions");
    const homeLink = document.getElementById("about-home-link");
    const recipesLink = document.getElementById("about-recipes-link");

    if (!authActions || !homeLink) {
        return;
    }

    const isLoggedIn = await hasValidUserSession();
    homeLink.href = isLoggedIn ? "user-home.html" : "guest-home.html";

    if (recipesLink) {
        if (isLoggedIn) {
            recipesLink.classList.remove("hidden");
            recipesLink.href = "recipe-main-page.html";
        } else {
            recipesLink.classList.add("hidden");
            recipesLink.href = "guest-home.html";
        }
    }

    if (!isLoggedIn) {
        return;
    }

    authActions.innerHTML = `
        <a href="ai-page.html" class="icon-btn ai-btn" title="AI Kitchen Assistant" onclick="openModal('aiModal')">
            <i class="fas fa-robot"></i>
        </a>

        <a href="userprofile.html" class="icon-btn profile-link" title="My Profile">
            <i class="fas fa-user-circle"></i>
        </a>
    `;
}

async function initHeaderFeatures() {
    await initAboutHeaderAuthState();
    await initHeaderProfileAvatar();
}

initRecipeSearch();
initGuestAuth();
redirectAuthenticatedUserFromGuestLanding();
initHeaderFeatures();