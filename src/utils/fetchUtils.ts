export const fetchData = async (url: string, onSuccess: (data: any) => void) => {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.warn(`Fetch response not OK for ${url}:`, response);
            return;
        }
        const data = url.endsWith('.csv') ? await response.text() : await response.json();
        onSuccess(data);
    } catch (error) {
        console.error(`Error fetching data from ${url}:`, error);
    }
};
