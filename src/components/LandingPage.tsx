import { useState, useEffect, useCallback } from "react";
import { RotateCcw } from "lucide-react";

interface LandingPageProps {
    setVisibleSection: (section: string) => void;
    setWord1: (word: string) => void;
    setWord2: (word: string) => void;
    setLanguage1: (lang: string) => void;
    setLanguage2: (lang: string) => void;
    word1: string;
    word2?: string;
    language1: string;
    language2?: string;
}

export default function LandingPage({
    setVisibleSection,
    setWord1,
    setWord2,
    setLanguage1,
    setLanguage2,
    word1,
    word2,
    language1,
    language2,
}: LandingPageProps) {
    const [explorationType, setExplorationType] = useState<"single" | "compare" | null>(null);
    const [selectedVisualization, setSelectedVisualization] = useState<string | null>(null);
    const [interestingWord, setInterestingWord] = useState<{ word: string; reason: string } | null>(null);
    const [wordCategory, setWordCategory] = useState<string>("");

    const [availableLangs, setAvailableLangs] = useState<string[]>([]);
    const [languageLoading, setLanguageLoading] = useState<boolean>(false);

    const [availableLangs2, setAvailableLangs2] = useState<string[]>([]);
    const [language2Loading, setLanguage2Loading] = useState<boolean>(false);

    const inputBaseStyles =
        "w-full px-4 py-2 rounded-md bg-gray-700 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500";

    const selectRandomInterestingWord = useCallback(() => {
        const placeholderInterestingWords = {
            "longest etymology": [
                { word: "serendipity", reason: "Has one of the longest etymology chains!" },
                { word: "wanderlust", reason: "Traces its roots through multiple languages!" },
            ],
            "most anagrams": [
                { word: "stop", reason: "Has 4 anagrams: stop, tops, post, spot!" },
                { word: "rat", reason: "Forms anagrams like art and tar!" },
            ],
            "most borrowed": [
                { word: "tea", reason: "Borrowed into over 50 languages!" },
                { word: "sugar", reason: "Adopted across multiple trade routes!" },
            ],
            "longest words": [
                { word: "antidisestablishmentarianism", reason: "One of the longest words in English!" },
                { word: "floccinaucinihilipilification", reason: "Rarely used, but incredibly long!" },
            ],
        };

        const categories = Object.keys(placeholderInterestingWords);
        const randomCategory = categories[Math.floor(Math.random() * categories.length)];
        const randomWord = placeholderInterestingWords[randomCategory as keyof typeof placeholderInterestingWords][Math.floor(Math.random() * placeholderInterestingWords[randomCategory as keyof typeof placeholderInterestingWords].length)];

        setWordCategory(randomCategory);
        setInterestingWord(randomWord);
    }, []);

    useEffect(() => {
        selectRandomInterestingWord();
    }, [selectRandomInterestingWord]);

    useEffect(() => {
        if (!word1) return;

        const fetchLanguages = async () => {
            setLanguageLoading(true);
            try {
                const res = await fetch(`http://localhost:8000/available-languages?word=${word1}`);
                const data = await res.json();
                setAvailableLangs(data.languages || []);
            } catch {
                setAvailableLangs([]);
            } finally {
                setLanguageLoading(false);
            }
        };

        fetchLanguages();
    }, [word1]);

    useEffect(() => {
        if (!word2) return;

        const fetchLanguages2 = async () => {
            setLanguage2Loading(true);
            try {
                const res = await fetch(`http://localhost:8000/available-languages?word=${word2}`);
                const data = await res.json();
                setAvailableLangs2(data.languages || []);
            } catch {
                setAvailableLangs2([]);
            } finally {
                setLanguage2Loading(false);
            }
        };

        fetchLanguages2();
    }, [word2]);

    return (
        <div className="max-w-lg mx-auto bg-gray-800 p-6 sm:p-8 rounded-lg shadow-xl text-center mt-10 overflow-y-auto">
            <h1 className="text-3xl font-bold text-white mb-2">Welcome To WiktionaryViz</h1>
            <p className="text-gray-300 text-base mb-6">
                An exploratory tool for visualizing the evolution of words and their relationships.
            </p>

            <h3 className="text-lg font-semibold text-white mb-3">How would you like to explore?</h3>
            <div className="flex justify-center gap-4 mb-6">
                <button
                    className={`px-4 py-2 rounded-md font-semibold transition ${explorationType === "single"
                        ? "bg-blue-500 text-white"
                        : "bg-gray-700 text-gray-200 hover:bg-gray-600"}`}
                    onClick={() => setExplorationType("single")}
                >
                    Explore one word
                </button>
                <button
                    className={`px-4 py-2 rounded-md font-semibold transition ${explorationType === "compare"
                        ? "bg-blue-500 text-white"
                        : "bg-gray-700 text-gray-200 hover:bg-gray-600"}`}
                    onClick={() => setExplorationType("compare")}
                >
                    Compare two words
                </button>
            </div>

            {explorationType && (
                <div className="space-y-4">
                    <input
                        type="text"
                        placeholder="Enter a word"
                        value={word1}
                        onChange={(e) => setWord1(e.target.value)}
                        className={inputBaseStyles}
                    />

                    {word1 && (
                        languageLoading ? (
                            <p className="text-gray-400">Loading languages...</p>
                        ) : (
                            <select
                                value={language1}
                                onChange={(e) => setLanguage1(e.target.value)}
                                className={inputBaseStyles}
                            >
                                <option value="">Select a language</option>
                                {availableLangs.map((lang) => (
                                    <option key={lang} value={lang}>
                                        {lang}
                                    </option>
                                ))}
                            </select>
                        )
                    )}

                    {explorationType === "compare" && (
                        <>
                            <input
                                type="text"
                                placeholder="Enter a second word"
                                value={word2}
                                onChange={(e) => setWord2(e.target.value)}
                                className={inputBaseStyles}
                            />

                            {word2 && (
                                language2Loading ? (
                                    <p className="text-gray-400">Loading second language list...</p>
                                ) : (
                                    <select
                                        value={language2}
                                        onChange={(e) => setLanguage2(e.target.value)}
                                        className={inputBaseStyles}
                                    >
                                        <option value="">Select a language</option>
                                        {availableLangs2.map((lang) => (
                                            <option key={lang} value={lang}>
                                                {lang}
                                            </option>
                                        ))}
                                    </select>
                                )
                            )}
                        </>
                    )}
                </div>
            )}

            {explorationType && interestingWord && (
                <div className="mt-6 bg-gray-700 p-4 rounded-md text-white relative">
                    <button
                        className="absolute top-2 right-2 text-gray-300 hover:text-white transition"
                        onClick={selectRandomInterestingWord}
                        title="Refresh suggestion"
                    >
                        <RotateCcw size={18} />
                    </button>
                    <p className="text-sm text-gray-300">
                        Try exploring a word from <span className="text-white font-medium">{wordCategory}</span>:
                    </p>
                    <button
                        className="mt-2 px-4 py-1 bg-purple-600 hover:bg-purple-700 rounded-full text-sm text-white font-medium"
                        onClick={() => setWord1(interestingWord.word)}
                    >
                        {interestingWord.word}
                    </button>
                    <p className="text-xs mt-2 italic text-gray-300">{interestingWord.reason}</p>
                </div>
            )}

            {explorationType && word1 && (
                <>
                    <h3 className="text-lg font-semibold text-white mt-6">Select a visualization type:</h3>
                    <ul className="mt-3 grid grid-cols-2 gap-3 text-left">
                        {["geospatial", "network", "radial", "tree"].map((value) => (
                            <li key={value}>
                                <label className="flex items-center space-x-3 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="visualization"
                                        value={value}
                                        checked={selectedVisualization === value}
                                        onChange={() => setSelectedVisualization(value)}
                                        className="hidden peer"
                                    />
                                    <div className="w-5 h-5 rounded-full border-2 border-white peer-checked:border-blue-500 peer-checked:bg-blue-500 flex items-center justify-center hover:border-blue-400 transition-all cursor-pointer">
                                        <div className="w-2.5 h-2.5 bg-white rounded-full opacity-0 peer-checked:opacity-100 transition-opacity"></div>
                                    </div>
                                    <span className="text-white capitalize">{value}</span>
                                </label>
                            </li>
                        ))}
                    </ul>
                </>
            )}

            {selectedVisualization && (
                <button
                    className="mt-8 px-6 py-2 bg-green-500 hover:bg-green-600 rounded-md text-white font-semibold transition"
                    onClick={() => setVisibleSection(selectedVisualization)}
                >
                    Start Visualization
                </button>
            )}
        </div>
    );
}
