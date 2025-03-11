import { useEffect, useState } from "react";

const BACKEND_URL = "http://localhost:8000";

const useWordData = (word: string, language: string) => {
    const [wordData, setWordData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        console.log("[useWordData] useEffect triggered with:", { word, language });

        if (!word || !language) {
            console.log("[useWordData] Missing word or language, resetting wordData.");
            setWordData(null);
            return;
        }

        const fetchWordData = async () => {
            console.log(`[useWordData] Fetching word data for: word="${word}", language="${language}"`);

            try {
                const response = await fetch(
                    `${BACKEND_URL}/word-data?word=${encodeURIComponent(word)}&lang_code=${encodeURIComponent(language)}`
                );

                console.log(`[useWordData] Response received:`, response);

                if (!response.ok) {
                    const errorMessage = `Error fetching word data: ${response.status} ${response.statusText}`;
                    console.error("[useWordData] Request failed:", errorMessage);
                    throw new Error(errorMessage);
                }

                const data = await response.json();
                console.log("[useWordData] JSON data parsed:", data);

                // Assuming the API now returns a single object (not an array of matches)
                if (Object.keys(data).length > 0) {
                    console.log("[useWordData] Setting word data:", data);
                    setWordData(data);
                } else {
                    console.warn("[useWordData] No data found for query.");
                    setWordData(null);
                }

            } catch (error: any) {
                console.error("[useWordData] Exception caught:", error.message);
                setError(error.message);
                setWordData(null);
            }
        };

        fetchWordData();
    }, [word, language]);

    return wordData;
};

export default useWordData;
