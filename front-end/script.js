const API_BASE_URL = "http://localhost:3000/api";


//Signup and Login are included in guest-home html since they are only relevant to guests.
// Once logged in, the user will be redirected to home.html where they can access the full features of the app;
// including bookmarks and cooking history. The script.js file is shared between both pages for common functionality
// like fetching recipes and rendering them on the page.

// Sign up a new user.

async function signUp(username, email, password, allergens = []) {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password, allergens })
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.message || "Sign up failed");
    }

    return data;
}

// Login existing user/admin and get a token for authenticated requests.
async function login(email, password) {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.message || "Login failed");
    }

    return data;
}

async function fetchRecipes(query = "") {
    const params = new URLSearchParams();
    if (query.trim()) {
        params.set("q", query.trim());
    }
    params.set("num", "20");
    params.set("page", "1");

    const response = await fetch(`${API_BASE_URL}/recipes?${params.toString()}`);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.message || "Failed to fetch recipes");
    }

    return data;
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
let bookmarkedRecipeIds = new Set();
let bookmarkIdByRecipeId = new Map();

function getAuthToken() {
    return localStorage.getItem("token") || "";
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

function setRecipeMetaMessage(message, isError = false) {
    const meta = document.getElementById("recipe-search-meta");
    if (!meta) {
        return;
    }

    meta.textContent = message;
    meta.style.color = isError ? "#8b1e1e" : "";
}

async function fetchUserBookmarks() {
    const token = getAuthToken();
    if (!token) {
        return [];
    }

    const response = await fetch(`${API_BASE_URL}/bookmarks`, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.message || "Failed to load bookmarks");
    }

    return Array.isArray(data.bookmarks) ? data.bookmarks : [];
}

async function addRecipeBookmark(recipe) {
    const token = getAuthToken();
    if (!token) {
        throw new Error("Please log in to bookmark recipes.");
    }

    const response = await fetch(`${API_BASE_URL}/bookmarks/add`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
            recipe_id: normalizeRecipeId(recipe),
            recipe_name: recipe.title || "Untitled recipe",
            recipe_image: recipe.image || "",
            cooking_method: recipe.instructions || ""
        })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.message || "Failed to save bookmark");
    }

    return data;
}

async function removeRecipeBookmark(bookmarkId) {
    const token = getAuthToken();
    if (!token) {
        throw new Error("Please log in to manage bookmarks.");
    }

    const response = await fetch(`${API_BASE_URL}/bookmarks/${bookmarkId}`, {
        method: "DELETE",
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.message || "Failed to remove bookmark");
    }

    return data;
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
    latestRenderedRecipes = Array.isArray(recipes) ? recipes : [];

    if (!latestRenderedRecipes.length) {
        container.innerHTML = "<p>No recipes found.</p>";
        return;
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
        const result = await fetchRecipes(query);
        renderRecipes(result.recipes || []);
        setRecipeMetaMessage(`${result.count || 0} recipes shown for '${result.query || "all"}'.`);
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
        runSearch("");
    });
}

function setAuthMessage(message, isError = true) {
    const loginModal = document.getElementById("loginModal");
    const signupModal = document.getElementById("signupModal");

    let authMessage = null;
    if (loginModal && loginModal.style.display === "flex") {
        authMessage = document.getElementById("login-message");
    } else if (signupModal && signupModal.style.display === "flex") {
        authMessage = document.getElementById("signup-message");
    } else {
        authMessage = document.getElementById("login-message") || document.getElementById("signup-message") || document.getElementById("auth-message");
    }

    if (!authMessage) {
        return;
    }

    authMessage.textContent = message;
    authMessage.style.color = isError ? "#b00020" : "#0b7d3b";
}

function clearAuthMessage() {
    const ids = ["login-message", "signup-message", "auth-message"];
    ids.forEach((id) => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = "";
        }
    });
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
    const allergens = allergensInput
        ? allergensInput.value.split(",").map(a => a.trim()).filter(a => a)
        : [];
    const validationError = validateSignupInput(username, email, password);

    if (validationError) {
        setAuthMessage(validationError);
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

    if (loginForm) {
        loginForm.addEventListener("submit", handleLoginSubmit);
    }

    if (signupForm) {
        signupForm.addEventListener("submit", handleSignupSubmit);
    }
}

async function initAboutHeaderAuthState() {
    const authActions = document.getElementById("about-auth-actions");
    const homeLink = document.getElementById("about-home-link");

    if (!authActions || !homeLink) {
        return;
    }

    const isLoggedIn = await hasValidUserSession();
    homeLink.href = isLoggedIn ? "user-home.html" : "guest-home.html";

    if (!isLoggedIn) {
        return;
    }

    authActions.innerHTML = `
        <button class="icon-btn ai-btn" title="AI Kitchen Assistant" onclick="openModal('aiModal')">
            <i class="fas fa-robot"></i>
        </button>

        <a href="#" class="icon-btn profile-link" title="My Profile">
            <i class="fas fa-user-circle"></i>
        </a>
    `;
}

initRecipeSearch();
initGuestAuth();
initAboutHeaderAuthState();