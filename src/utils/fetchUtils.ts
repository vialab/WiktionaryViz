export const fetchData = async (url: string, onSuccess: (data: any) => void) => {
    const basePath = process.env.PUBLIC_URL || "";
    const fullUrl = `${basePath}${url}`;

    try {
        const response = await fetch(fullUrl);
        if (!response.ok) {
            console.warn(`Fetch response not OK for ${fullUrl}:`, response);
            return;
        }
        const data = url.endsWith('.csv') ? await response.text() : await response.json();
        onSuccess(data);
    } catch (error) {
        console.error(`Error fetching data from ${fullUrl}:`, error);
    }
};