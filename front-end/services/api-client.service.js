(function (global) {
    const API_BASE_URL = window.location.protocol === "file:"
        ? "http://localhost:3000/api"
        : `${window.location.origin}/api`;

    function getAuthToken() {
        return localStorage.getItem("token") || "";
    }

    async function request(path, options = {}, fallbackMessage = "Request failed") {
        const response = await fetch(`${API_BASE_URL}${path}`, options);
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.message || fallbackMessage);
        }

        return data;
    }

    global.ApiClient = {
        request,
        getAuthToken,
        getApiBaseUrl: function () {
            return API_BASE_URL;
        }
    };
})(window);
