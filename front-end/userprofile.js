const API_BASE_URL = window.location.protocol === "file:"
    ? "http://localhost:3000/api"
    : `${window.location.origin}/api`;

const state = {
    profile: null,
    stats: null,
    avatarDataUrl: "",
    saving: false
};
const ALLERGEN_ALLOWED_CHARACTERS = /^[A-Za-z, ]*$/;

function getToken() {
    return localStorage.getItem("token");
}

function clearToken() {
    localStorage.removeItem("token");
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function normalizeText(value) {
    return String(value ?? "").trim();
}

function normalizeEmail(value) {
    return normalizeText(value).toLowerCase();
}

function splitList(value) {
    return String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
}

function sanitizeAllergenText(value) {
    return String(value || "")
        .replace(/[^A-Za-z, ]/g, "")
        .replace(/ +, +/g, ", ")
        .replace(/ {2,}/g, " ");
}

function hasInvalidAllergenCharacters(value) {
    return !ALLERGEN_ALLOWED_CHARACTERS.test(String(value || ""));
}

function splitAllergens(value) {
    return sanitizeAllergenText(value)
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
}

function getInitials(name, fallback = "TP") {
    const words = normalizeText(name)
        .split(/\s+/)
        .filter(Boolean);

    if (words.length === 0) {
        return fallback;
    }

    const initials = words.slice(0, 2).map((word) => word[0]).join("");
    return initials.toUpperCase() || fallback;
}

function buildFallbackAvatar(name) {
    const initials = getInitials(name);
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
            <rect width="200" height="200" rx="100" fill="#5c3d2e" />
            <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle"
                font-family="Poppins, Arial, sans-serif" font-size="72" font-weight="700" fill="#f7f2e8">${initials}</text>
        </svg>
    `;

    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
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

function setStatus(message, isError = false) {
    const status = document.getElementById("profile-message");
    if (!status) {
        return;
    }

    status.textContent = message;
    status.classList.toggle("is-error", Boolean(isError));
    status.classList.toggle("is-success", !isError && Boolean(message));
}

function setSaving(isSaving) {
    const saveBtn = document.getElementById("saveBtn");
    const cancelBtn = document.getElementById("cancelBtn");
    if (saveBtn) {
        saveBtn.disabled = isSaving;
    }
    if (cancelBtn) {
        cancelBtn.disabled = isSaving;
    }
    state.saving = isSaving;
}

function renderAvatar(profile) {
    const avatarPreview = document.getElementById("avatarPreview");
    if (!avatarPreview) {
        return;
    }

    const displayName = profile?.full_name || profile?.username || "The Filipino Plate";
    const fallbackSrc = buildFallbackAvatar(displayName);
    const avatarSrc = normalizeText(state.avatarDataUrl) || normalizeText(profile?.avatar);

    avatarPreview.onload = null;
    avatarPreview.onerror = () => {
        avatarPreview.onerror = null;
        avatarPreview.src = fallbackSrc;
    };

    avatarPreview.src = avatarSrc || fallbackSrc;
}

function renderProfile(profile) {
    state.profile = profile;

    const fullNameInput = document.getElementById("fullName");
    const usernameInput = document.getElementById("username");
    const emailInput = document.getElementById("email");
    const allergensInput = document.getElementById("allergens");
    const passwordInput = document.getElementById("password");
    const sidebarName = document.getElementById("sidebar-name");
    const sidebarUsername = document.getElementById("sidebar-username");
    const sidebarEmail = document.getElementById("sidebar-email");

    if (fullNameInput) fullNameInput.value = profile.full_name || "";
    if (usernameInput) usernameInput.value = profile.username || "";
    if (emailInput) emailInput.value = profile.email || "";
    if (allergensInput) allergensInput.value = sanitizeAllergenText((profile.allergens || []).join(", "));
    if (passwordInput) passwordInput.value = "";

    if (sidebarName) sidebarName.textContent = profile.full_name || profile.username || "Your Name";
    if (sidebarUsername) sidebarUsername.textContent = `@${profile.username || "username"}`;
    if (sidebarEmail) sidebarEmail.textContent = profile.email || "";

    renderAvatar(profile);
}

function renderStats(statsResponse) {
    const stats = statsResponse?.stats || {};
    state.stats = stats;

    const totalCooked = stats.totalCooked || 0;
    const uniqueMethods = stats.uniqueMethods || 0;
    const diversityScore = stats.diversityScore || 0;
    const mostCookedMethod = stats.mostCookedMethod || "-";
    const leastCookedMethod = stats.leastCookedMethod || "-";
    const neverUsedMethods = stats.neverUsedMethods || [];
    const countByMethod = stats.countByMethod || [];
    const recentHistory = statsResponse?.recentHistory || [];

    const statTotalCooked = document.getElementById("statTotalCooked");
    const statUniqueMethods = document.getElementById("statUniqueMethods");
    const statDiversityScore = document.getElementById("statDiversityScore");
    const statMostCooked = document.getElementById("statMostCooked");
    const statLeastCooked = document.getElementById("statLeastCooked");
    const statNeverTried = document.getElementById("statNeverTried");
    const statsSummary = document.getElementById("statsSummary");
    const methodBreakdown = document.getElementById("methodBreakdown");
    const neverUsedMethodsWrap = document.getElementById("neverUsedMethods");
    const recentHistoryWrap = document.getElementById("recentHistory");

    if (statTotalCooked) statTotalCooked.textContent = String(totalCooked);
    if (statUniqueMethods) statUniqueMethods.textContent = String(uniqueMethods);
    if (statDiversityScore) statDiversityScore.textContent = `${Math.round(diversityScore * 100)}%`;
    if (statMostCooked) statMostCooked.textContent = mostCookedMethod;
    if (statLeastCooked) statLeastCooked.textContent = leastCookedMethod;
    if (statNeverTried) statNeverTried.textContent = String(neverUsedMethods.length);
    if (statsSummary) {
        statsSummary.textContent = totalCooked > 0
            ? `${totalCooked} meals cooked, ${uniqueMethods} methods used`
            : "No cooking history yet";
    }

    if (methodBreakdown) {
        if (countByMethod.length === 0) {
            methodBreakdown.innerHTML = '<p class="empty-state">Cook a few recipes to see your method breakdown here.</p>';
        } else {
            const maxCount = Math.max(...countByMethod.map((item) => item.count), 1);
            methodBreakdown.innerHTML = countByMethod.map((item) => `
                <div class="method-row">
                    <div class="method-row-head">
                        <span>${escapeHtml(item.method)}</span>
                        <strong>${item.count}</strong>
                    </div>
                    <div class="method-track" aria-hidden="true">
                        <div class="method-fill" style="width: ${Math.max(8, Math.round((item.count / maxCount) * 100))}%;"></div>
                    </div>
                </div>
            `).join("");
        }
    }

    if (neverUsedMethodsWrap) {
        neverUsedMethodsWrap.innerHTML = neverUsedMethods.length > 0
            ? neverUsedMethods.map((method) => `<span class="chip">${escapeHtml(method)}</span>`).join("")
            : '<p class="empty-state">You have tried every tracked cooking method.</p>';
    }

    if (recentHistoryWrap) {
        recentHistoryWrap.innerHTML = recentHistory.length > 0
            ? recentHistory.map((item) => `
                <article class="recent-item">
                    <div>
                        <strong>${escapeHtml(item.recipe_name || "Recipe")}</strong>
                        <small>${escapeHtml(item.cooking_method || "Unknown method")}</small>
                    </div>
                    <small>${item.cooked_at ? new Date(item.cooked_at).toLocaleDateString() : ""}</small>
                </article>
            `).join("")
            : '<p class="empty-state">Your latest cooked recipes will appear here.</p>';
    }
}

function refreshSidebarFromInputs() {
    const fullNameInput = document.getElementById("fullName");
    const usernameInput = document.getElementById("username");
    const emailInput = document.getElementById("email");
    const sidebarName = document.getElementById("sidebar-name");
    const sidebarUsername = document.getElementById("sidebar-username");
    const sidebarEmail = document.getElementById("sidebar-email");

    if (sidebarName && fullNameInput) {
        sidebarName.textContent = fullNameInput.value || "Your Name";
    }
    if (sidebarUsername && usernameInput) {
        sidebarUsername.textContent = `@${usernameInput.value || "username"}`;
    }
    if (sidebarEmail && emailInput) {
        sidebarEmail.textContent = emailInput.value || "";
    }

    if (!normalizeText(state.avatarDataUrl) && document.getElementById("avatarPreview")) {
        document.getElementById("avatarPreview").src = buildFallbackAvatar(fullNameInput?.value || usernameInput?.value || "The Filipino Plate");
    }
}

async function loadProfilePage() {
    if (!getToken()) {
        window.location.href = "guest-home.html";
        return;
    }

    setSaving(false);
    setStatus("Loading profile...");

    try {
        const [profileResponse, statsResponse] = await Promise.all([
            apiRequest("/user/profile"),
            apiRequest("/user/stats")
        ]);

        state.avatarDataUrl = "";
        renderProfile(profileResponse.user || {});
        renderStats(statsResponse);
        setStatus("Profile loaded successfully.");
    } catch (error) {
        if (String(error.message).toLowerCase().includes("authorization") || String(error.message).toLowerCase().includes("token")) {
            clearToken();
            window.location.href = "guest-home.html";
            return;
        }

        setStatus(error.message, true);
    }
}

function handleAvatarChange(event) {
    const file = event.target.files?.[0];
    if (!file) {
        return;
    }

    if (!file.type.startsWith("image/")) {
        setStatus("Please choose an image file for your profile picture.", true);
        event.target.value = "";
        return;
    }

    if (file.size > 2 * 1024 * 1024) {
        setStatus("Please use an image smaller than 2 MB.", true);
        event.target.value = "";
        return;
    }

    const reader = new FileReader();
    reader.onload = () => {
        state.avatarDataUrl = String(reader.result || "");
        const avatarPreview = document.getElementById("avatarPreview");
        if (avatarPreview) {
            avatarPreview.src = state.avatarDataUrl;
        }
        setStatus("Profile picture ready to save.");
    };
    reader.readAsDataURL(file);
}

async function handleProfileSubmit(event) {
    event.preventDefault();

    const fullName = document.getElementById("fullName")?.value;
    const username = document.getElementById("username")?.value;
    const email = document.getElementById("email")?.value;
    const password = document.getElementById("password")?.value;
    const allergens = document.getElementById("allergens")?.value;

    if (hasInvalidAllergenCharacters(allergens)) {
        setStatus("Allergens can only contain letters, spaces, and commas.", true);
        return;
    }

    const payload = {
        full_name: normalizeText(fullName),
        username: normalizeText(username),
        email: normalizeEmail(email),
        allergens: splitAllergens(allergens)
    };

    if (normalizeText(password).length > 0) {
        payload.password = password;
    }

    if (normalizeText(state.avatarDataUrl).length > 0) {
        payload.avatar = state.avatarDataUrl;
    }

    setSaving(true);
    setStatus("Saving profile...");

    try {
        const response = await apiRequest("/user/profile", {
            method: "PUT",
            body: JSON.stringify(payload)
        });

        state.profile = response.user || state.profile;
        state.avatarDataUrl = "";

        renderProfile(response.user || {});
        const passwordInput = document.getElementById("password");
        if (passwordInput) {
            passwordInput.value = "";
        }
        refreshSidebarFromInputs();
        setStatus("Profile saved successfully.");
    } catch (error) {
        setStatus(error.message, true);
    } finally {
        setSaving(false);
    }
}

function resetProfileForm() {
    if (state.profile) {
        state.avatarDataUrl = "";
        renderProfile(state.profile);
        setStatus("Changes reverted.");
    }
}

function handleLogout(event) {
    event.preventDefault();
    clearToken();
    window.location.href = "guest-home.html";
}

function attachEvents() {
    const profileForm = document.getElementById("profile-form");
    const avatarInput = document.getElementById("profileAvatarInput");
    const cancelBtn = document.getElementById("cancelBtn");
    const logoutLink = document.getElementById("logout-link");
    const allergensInput = document.getElementById("allergens");

    if (profileForm) {
        profileForm.addEventListener("submit", handleProfileSubmit);
    }

    if (avatarInput) {
        avatarInput.addEventListener("change", handleAvatarChange);
    }

    if (cancelBtn) {
        cancelBtn.addEventListener("click", resetProfileForm);
    }

    if (logoutLink) {
        logoutLink.addEventListener("click", handleLogout);
    }

    if (allergensInput) {
        allergensInput.addEventListener("input", () => {
            const sanitized = sanitizeAllergenText(allergensInput.value);
            if (sanitized !== allergensInput.value) {
                allergensInput.value = sanitized;
            }
        });
    }

    ["fullName", "username", "email"].forEach((id) => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener("input", refreshSidebarFromInputs);
        }
    });
}

document.addEventListener("DOMContentLoaded", async () => {
    attachEvents();
    await loadProfilePage();
});
