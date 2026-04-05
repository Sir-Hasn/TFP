(function (global) {
    function requireApiClient() {
        if (!global.ApiClient || typeof global.ApiClient.request !== "function") {
            throw new Error("API client service is unavailable.");
        }

        return global.ApiClient;
    }

    async function fetchRecipes(query, limit, page) {
        const api = requireApiClient();
        const params = new URLSearchParams();
        const safeQuery = String(query || "").trim();
        if (safeQuery) {
            params.set("q", safeQuery);
        }
        params.set("num", String(limit || 20));
        params.set("page", String(page || 1));

        return api.request(`/recipes?${params.toString()}`, {}, "Failed to fetch recipes");
    }

    async function fetchRecipesAcrossPages(query, pageSize, maxPages) {
        const collectedRecipes = [];
        let lastQuery = query;
        const safePageSize = Number(pageSize || 20);
        const safeMaxPages = Number(maxPages || 5);

        for (let page = 1; page <= safeMaxPages; page += 1) {
            const result = await fetchRecipes(query, safePageSize, page);
            lastQuery = result.query || lastQuery;

            if (Array.isArray(result.recipes) && result.recipes.length > 0) {
                collectedRecipes.push(...result.recipes);
            }

            if (!Array.isArray(result.recipes) || result.recipes.length < safePageSize) {
                break;
            }
        }

        return {
            query: lastQuery,
            recipes: collectedRecipes
        };
    }

    global.RecipeService = {
        fetchRecipes,
        fetchRecipesAcrossPages
    };
})(window);
