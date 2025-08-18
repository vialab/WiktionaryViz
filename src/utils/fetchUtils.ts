export const fetchData = async <T = unknown>(url: string, onSuccess: (data: T) => void): Promise<void> => {
    const basePath = import.meta.env.BASE_URL || "";
    const fullUrl = `${basePath}${url}`;

    try {
        const response = await fetch(fullUrl);
        if (!response.ok) {
            console.warn(`Fetch response not OK for ${fullUrl}:`, response);
            return;
        }
    const data = url.endsWith('.csv') ? await response.text() : await response.json();
    onSuccess(data as T);
    } catch (error) {
        console.error(`Error fetching data from ${fullUrl}:`, error);
    }
};

// TODO [HIGH LEVEL]: Shareable state URLs (encode current app state into query/hash) and decode on load.
// TODO [LOW LEVEL]: Implement `encodeStateToQuery(state)` and `decodeStateFromLocation(location)` utilities here.

// TODO [HIGH LEVEL]: Data export helpers (CSV/JSON/PNG) for timelines/networks/maps.
// TODO [LOW LEVEL]: Implement `exportAsCSV(rows)`, `exportAsJSON(obj)`, and a `downloadBlob(filename, blob)` helper.