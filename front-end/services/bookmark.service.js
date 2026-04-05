(function (global) {
    function requireApiClient() {
        if (!global.ApiClient || typeof global.ApiClient.request !== "function") {
            throw new Error("API client service is unavailable.");
        }

        return global.ApiClient;
    }

    async function getBookmarks() {
        const api = requireApiClient();
        const token = api.getAuthToken();
        if (!token) {
            return [];
        }

        const data = await api.request("/bookmarks", {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }, "Failed to load bookmarks");

        return Array.isArray(data.bookmarks) ? data.bookmarks : [];
    }

    async function addBookmark(payload) {
        const api = requireApiClient();
        const token = api.getAuthToken();
        if (!token) {
            throw new Error("Please log in to bookmark recipes.");
        }

        return api.request("/bookmarks/add", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(payload || {})
        }, "Failed to save bookmark");
    }

    async function removeBookmark(bookmarkId) {
        const api = requireApiClient();
        const token = api.getAuthToken();
        if (!token) {
            throw new Error("Please log in to manage bookmarks.");
        }

        return api.request(`/bookmarks/${bookmarkId}`, {
            method: "DELETE",
            headers: {
                Authorization: `Bearer ${token}`
            }
        }, "Failed to remove bookmark");
    }

    global.BookmarkService = {
        getBookmarks,
        addBookmark,
        removeBookmark,
        getApiBaseUrl: function () {
            return global.ApiClient && typeof global.ApiClient.getApiBaseUrl === "function"
                ? global.ApiClient.getApiBaseUrl()
                : "";
        }
    };
})(window);
