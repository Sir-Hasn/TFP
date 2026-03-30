const API_BASE_URL = "http://localhost:3000/api";

const state = {
    user: null,
    editingRecipeId: null
};

function getToken() {
    return localStorage.getItem("token");
}

function setToken(token) {
    localStorage.setItem("token", token);
}

function clearToken() {
    localStorage.removeItem("token");
}

async function apiRequest(path, options = {}) {
    const token = getToken();
    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    };

    const response = await fetch(API_BASE_URL + path, {
        ...options,
        headers
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.message || "Request failed");
    }

    return data;
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function showDashboard(show) {
    document.getElementById("admin-dashboard").classList.toggle("hidden", !show);
    document.getElementById("admin-auth").classList.toggle("hidden", show);
}

function normalizeIngredients(input) {
    return String(input || "")
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function renderRecipes(recipes) {
    const container = document.getElementById("admin-recipes-list");
    if (!recipes.length) {
        container.innerHTML = "<p>No internal recipes yet.</p>";
        return;
    }

    container.innerHTML = recipes.map((recipe) => `
        <article class="card">
            <h3>${escapeHtml(recipe.title)}</h3>
            <p>${escapeHtml(recipe.description || "No description")}</p>
            <p><strong>Method:</strong> ${escapeHtml(recipe.cooking_method || "n/a")}</p>
            <p><strong>Published:</strong> ${recipe.is_published ? "Yes" : "No"}</p>
            <div class="card-actions">
                <button type="button" data-action="edit" data-id="${escapeHtml(recipe._id)}">Edit</button>
                <button type="button" data-action="delete" data-id="${escapeHtml(recipe._id)}">Delete</button>
            </div>
        </article>
    `).join("");

    container.querySelectorAll("button[data-action='edit']").forEach((button) => {
        button.addEventListener("click", () => startRecipeEdit(button.dataset.id, recipes));
    });

    container.querySelectorAll("button[data-action='delete']").forEach((button) => {
        button.addEventListener("click", () => deleteRecipe(button.dataset.id));
    });
}

function renderUsers(users) {
    const container = document.getElementById("admin-users-list");
    if (!users.length) {
        container.innerHTML = "<p>No users found.</p>";
        return;
    }

    container.innerHTML = users.map((user) => `
        <article class="card">
            <h3>${escapeHtml(user.username)}</h3>
            <p>${escapeHtml(user.email)}</p>
            <label>Username
                <input type="text" data-username-input="${escapeHtml(user._id)}" value="${escapeHtml(user.username || "")}" autocomplete="off">
            </label>
            <label>Email
                <input type="email" data-email-input="${escapeHtml(user._id)}" value="${escapeHtml(user.email || "")}" autocomplete="off">
            </label>
            <label>New Password (optional)
                <input type="password" data-password-input="${escapeHtml(user._id)}" placeholder="Leave blank to keep current password" autocomplete="new-password">
            </label>
            <label>Role
                <select data-role-select="${escapeHtml(user._id)}">
                    <option value="user" ${user.role === "user" ? "selected" : ""}>user</option>
                    <option value="admin" ${user.role === "admin" ? "selected" : ""}>admin</option>
                </select>
            </label>
            <label>Status
                <select data-status-select="${escapeHtml(user._id)}">
                    <option value="active" ${user.status === "active" ? "selected" : ""}>active</option>
                    <option value="suspended" ${user.status === "suspended" ? "selected" : ""}>suspended</option>
                </select>
            </label>
            <div class="card-actions">
                <button type="button" data-action="save-user" data-id="${escapeHtml(user._id)}">Save</button>
                <button type="button" data-action="delete-user" data-id="${escapeHtml(user._id)}">Delete</button>
                <div class="loading-spinner" data-loading-spinner="${escapeHtml(user._id)}" style="display: none;">
                    <span class="spinner"></span> Sending email...
                </div>
            </div>
        </article>
    `).join("");

    container.querySelectorAll("button[data-action='save-user']").forEach((button) => {
        button.addEventListener("click", () => saveUserChanges(button.dataset.id));
    });

    container.querySelectorAll("button[data-action='delete-user']").forEach((button) => {
        button.addEventListener("click", () => deleteUser(button.dataset.id));
    });
}

function renderLogs(logs) {
    const container = document.getElementById("admin-logs-list");
    if (!logs.length) {
        container.innerHTML = "<p>No logs available.</p>";
        return;
    }

    container.innerHTML = logs.map((log) => `
        <article class="card">
            <h3>${escapeHtml(log.action)}</h3>
            <p><strong>Actor:</strong> ${escapeHtml(log.actor_email || log.actor_user_id)}</p>
            <p><strong>Target:</strong> ${escapeHtml(log.target_model)} (${escapeHtml(log.target_id)})</p>
            <p><strong>Time:</strong> ${new Date(log.created_at).toLocaleString()}</p>
        </article>
    `).join("");
}

async function loadMe() {
    const data = await apiRequest("/auth/me");
    return data.user;
}

async function refreshRecipes() {
    const data = await apiRequest("/admin/recipes");
    renderRecipes(data.recipes || []);
}

async function refreshUsers() {
    const data = await apiRequest("/admin/users");
    renderUsers(data.users || []);
}

async function refreshLogs() {
    const data = await apiRequest("/admin/logs?page=1&pageSize=20");
    renderLogs(data.logs || []);
}

function resetRecipeForm() {
    document.getElementById("recipe-form").reset();
    document.getElementById("recipe-published").checked = true;
    state.editingRecipeId = null;
    document.getElementById("recipe-submit-btn").textContent = "Create Recipe";
    document.getElementById("recipe-cancel-edit").classList.add("hidden");
}

function startRecipeEdit(recipeId, recipes) {
    const recipe = recipes.find((item) => String(item._id) === String(recipeId));
    if (!recipe) return;

    state.editingRecipeId = recipe._id;
    document.getElementById("recipe-title").value = recipe.title || "";
    document.getElementById("recipe-description").value = recipe.description || "";
    document.getElementById("recipe-ingredients").value = (recipe.ingredients || []).join(", ");
    document.getElementById("recipe-instructions").value = recipe.instructions || "";
    document.getElementById("recipe-image").value = recipe.image || "";
    document.getElementById("recipe-method").value = recipe.cooking_method || "";
    document.getElementById("recipe-published").checked = recipe.is_published !== false;
    document.getElementById("recipe-submit-btn").textContent = "Update Recipe";
    document.getElementById("recipe-cancel-edit").classList.remove("hidden");
}

async function deleteRecipe(recipeId) {
    if (!confirm("Delete this recipe?")) return;
    try {
        await apiRequest(`/admin/recipes/${recipeId}`, { method: "DELETE" });
        await refreshRecipes();
    } catch (err) {
        setText("recipe-form-message", err.message);
    }
}

async function saveUserChanges(userId) {
    try {
        const usernameInput = document.querySelector(`[data-username-input='${userId}']`);
        const emailInput = document.querySelector(`[data-email-input='${userId}']`);
        const passwordInput = document.querySelector(`[data-password-input='${userId}']`);
        const role = document.querySelector(`[data-role-select='${userId}']`).value;
        const status = document.querySelector(`[data-status-select='${userId}']`).value;
        const loadingSpinner = document.querySelector(`[data-loading-spinner='${userId}']`);
        const saveButton = document.querySelector(`[data-action='save-user'][data-id='${userId}']`);

        // Show loading spinner only if password is being changed
        const hasPassword = passwordInput && passwordInput.value.trim();
        if (hasPassword && loadingSpinner) {
            loadingSpinner.style.display = "flex";
            saveButton.disabled = true;
        }

        const profilePayload = {
            username: usernameInput ? usernameInput.value.trim() : "",
            email: emailInput ? emailInput.value.trim() : ""
        };

        if (passwordInput && passwordInput.value.trim()) {
            profilePayload.password = passwordInput.value;
        }

        await apiRequest(`/admin/users/${userId}/profile`, {
            method: "PUT",
            body: JSON.stringify(profilePayload)
        });

        await apiRequest(`/admin/users/${userId}/role`, {
            method: "PUT",
            body: JSON.stringify({ role })
        });

        await apiRequest(`/admin/users/${userId}/status`, {
            method: "PUT",
            body: JSON.stringify({ status })
        });

        await Promise.all([refreshUsers(), refreshLogs()]);
    } catch (err) {
        alert(err.message);
    } finally {
        // Hide loading spinner
        const loadingSpinner = document.querySelector(`[data-loading-spinner='${userId}']`);
        const saveButton = document.querySelector(`[data-action='save-user'][data-id='${userId}']`);
        if (loadingSpinner) {
            loadingSpinner.style.display = "none";
        }
        if (saveButton) {
            saveButton.disabled = false;
        }
    }
}

async function deleteUser(userId) {
    if (!confirm("Delete this user?")) return;
    try {
        await apiRequest(`/admin/users/${userId}`, { method: "DELETE" });
        await Promise.all([refreshUsers(), refreshLogs()]);
    } catch (err) {
        alert(err.message);
    }
}

async function handleRecipeSubmit(event) {
    event.preventDefault();
    setText("recipe-form-message", "");

    const payload = {
        title: document.getElementById("recipe-title").value,
        description: document.getElementById("recipe-description").value,
        ingredients: normalizeIngredients(document.getElementById("recipe-ingredients").value),
        instructions: document.getElementById("recipe-instructions").value,
        image: document.getElementById("recipe-image").value,
        cooking_method: document.getElementById("recipe-method").value,
        is_published: document.getElementById("recipe-published").checked
    };

    try {
        if (state.editingRecipeId) {
            await apiRequest(`/admin/recipes/${state.editingRecipeId}`, {
                method: "PUT",
                body: JSON.stringify(payload)
            });
            setText("recipe-form-message", "Recipe updated.");
        } else {
            await apiRequest("/admin/recipes", {
                method: "POST",
                body: JSON.stringify(payload)
            });
            setText("recipe-form-message", "Recipe created.");
        }

        resetRecipeForm();
        await Promise.all([refreshRecipes(), refreshLogs()]);
    } catch (err) {
        setText("recipe-form-message", err.message);
    }
}

async function initializeAdminDashboard() {
    try {
        const user = await loadMe();
        if (user.role !== "admin") {
            throw new Error("Admin access required");
        }

        state.user = user;
        setText("admin-welcome", `Signed in as ${user.email} (${user.role})`);
        showDashboard(true);
        await Promise.all([refreshRecipes(), refreshUsers(), refreshLogs()]);
    } catch (err) {
        showDashboard(false);
        setText("admin-auth-message", "Login as an admin to continue.");
    }
}

async function handleLogin(event) {
    event.preventDefault();
    setText("admin-auth-message", "");

    const email = document.getElementById("admin-email").value.trim();
    const password = document.getElementById("admin-password").value;

    try {
        const loginResult = await apiRequest("/auth/login", {
            method: "POST",
            body: JSON.stringify({ email, password })
        });

        setToken(loginResult.token);
        await initializeAdminDashboard();
    } catch (err) {
        setText("admin-auth-message", err.message);
    }
}

function attachEvents() {
    document.getElementById("admin-login-form").addEventListener("submit", handleLogin);
    document.getElementById("recipe-form").addEventListener("submit", handleRecipeSubmit);
    document.getElementById("recipe-cancel-edit").addEventListener("click", resetRecipeForm);
    document.getElementById("refresh-recipes").addEventListener("click", refreshRecipes);
    document.getElementById("refresh-users").addEventListener("click", refreshUsers);
    document.getElementById("refresh-logs").addEventListener("click", refreshLogs);

    document.getElementById("admin-logout").addEventListener("click", () => {
        clearToken();
        state.user = null;
        resetRecipeForm();
        setText("admin-auth-message", "Logged out.");
        showDashboard(false);
    });
}

attachEvents();
initializeAdminDashboard();
