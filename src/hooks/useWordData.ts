import { useEffect, useState } from "react";

const BACKEND_URL = "http://localhost:8000";

/**
 * Standalone async function to fetch word data.
 * Use this when you want to fetch data manually (e.g., in useEffect or events).
 */
export const fetchWordData = async (word: string, language: string) => {
    if (!word || !language) {
        throw new Error("[fetchWordData] Missing word or language.");
    }

    try {
        const response = await fetch(
            `${BACKEND_URL}/word-data?word=${encodeURIComponent(word)}&lang_code=${encodeURIComponent(language)}`
        );

        if (!response.ok) {
            console.error(`[fetchWordData] Request failed: ${response.status} ${response.statusText}`);
            return null;
        }

        const data = await response.json();

        if (Object.keys(data).length > 0) {
            return data;
        } else {
            return null;
        }
    } catch (error: unknown) {
        console.error("[fetchWordData] Error fetching data:", error);
        return null;
    }
};

/**
 * React hook for fetching word data reactively.
 * This is great for components where you pass in `word` and `language` as props/state.
 */
const useWordData = (word: string, language: string) => {
    const [wordData, setWordData] = useState<Record<string, unknown> | null>(null);

    useEffect(() => {
        if (!word || !language) {
            setWordData(null);
            return;
        }

        const fetchData = async () => {
            const data = await fetchWordData(word, language);
            setWordData(data);
        };

        fetchData();
    }, [word, language]);

    return wordData;
};

export default useWordData;
