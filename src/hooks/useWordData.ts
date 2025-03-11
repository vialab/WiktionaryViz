import { useEffect, useState } from "react";

const BACKEND_URL = "http://localhost:8000";

const useWordData = (word: string, language: string) => {
    const [wordData, setWordData] = useState<Record<string, unknown> | null>(null);

    useEffect(() => {
        if (!word || !language) {
            setWordData(null);
            return;
        }

        const fetchWordData = async () => {
            try {
                const response = await fetch(
                    `${BACKEND_URL}/word-data?word=${encodeURIComponent(word)}&lang_code=${encodeURIComponent(language)}`
                );

                if (!response.ok) {
                    console.error(`[useWordData] Request failed: ${response.status} ${response.statusText}`);
                    setWordData(null);
                    return;
                }

                const data = await response.json();

                if (Object.keys(data).length > 0) {
                    setWordData(data);
                } else {
                    setWordData(null);
                }
            } catch (error: unknown) {
                console.error("[useWordData] Error fetching data:", error);
                setWordData(null);
            }
        };

        fetchWordData();
    }, [word, language]);

    return wordData;
};

export default useWordData;
