(function (global) {
    function requireApiClient() {
        if (!global.ApiClient || typeof global.ApiClient.request !== "function") {
            throw new Error("API client service is unavailable.");
        }

        return global.ApiClient;
    }

    async function signUp(username, email, password, allergens) {
        const api = requireApiClient();
        return api.request("/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, email, password, allergens: Array.isArray(allergens) ? allergens : [] })
        }, "Sign up failed");
    }

    async function login(email, password) {
        const api = requireApiClient();
        return api.request("/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        }, "Login failed");
    }

    async function requestPasswordResetCode(email) {
        const api = requireApiClient();
        return api.request("/auth/forgot-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email })
        }, "Could not send reset code.");
    }

    async function resetPasswordWithCode(email, code, newPassword) {
        const api = requireApiClient();
        return api.request("/auth/reset-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, code, newPassword })
        }, "Could not reset password.");
    }

    global.AuthService = {
        signUp,
        login,
        requestPasswordResetCode,
        resetPasswordWithCode
    };
})(window);
