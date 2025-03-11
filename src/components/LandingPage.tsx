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

    // TODO: Replace with real data fetching when preprocessing is implemented
    // Function to pick a random word from a category
    const selectRandomInterestingWord = useCallback(() => {
        const placeholderInterestingWords: { [key: string]: { word: string; reason: string }[] } = {
            "longest etymology": [
                { word: "serendipity", reason: "Has one of the longest etymology chains!" },
                { word: "wanderlust", reason: "Traces its roots through multiple languages!" }
            ],
            "most anagrams": [
                { word: "stop", reason: "Has 4 anagrams: stop, tops, post, spot!" },
                { word: "rat", reason: "Forms anagrams like art and tar!" }
            ],
            "most borrowed": [
                { word: "tea", reason: "Borrowed into over 50 languages!" },
                { word: "sugar", reason: "Adopted across multiple trade routes!" }
            ],
            "longest words": [
                { word: "antidisestablishmentarianism", reason: "One of the longest words in English!" },
                { word: "floccinaucinihilipilification", reason: "Rarely used, but incredibly long!" }
            ]
        };

        const categories = Object.keys(placeholderInterestingWords);
        const randomCategory = categories[Math.floor(Math.random() * categories.length)];
        const wordsInCategory = placeholderInterestingWords[randomCategory as keyof typeof placeholderInterestingWords];
        const randomWordObject = wordsInCategory[Math.floor(Math.random() * wordsInCategory.length)];

        setWordCategory(randomCategory);
        setInterestingWord(randomWordObject);
    }, []);
    
    useEffect(() => {
        selectRandomInterestingWord();
    }, [selectRandomInterestingWord]);

    return (
        <div className="max-w-lg mx-auto bg-gray-800 p-8 rounded-lg shadow-md text-center mt-8">
            <h1 className="text-3xl font-bold text-white mb-2">Welcome To WiktionaryViz</h1>
            <h2 className="text-lg text-gray-300 mb-4">An exploratory etymology tool for visualizing the evolution of words, their meanings, and relationships.</h2>

            <h3 className="text-lg font-semibold text-white mb-3">How would you like to explore?</h3>
            <div className="flex justify-center gap-4 mb-6">
                <button
                    className={`px-4 py-2 rounded-md transition ${explorationType === "single" ? "bg-blue-500" : "bg-gray-700 hover:bg-gray-600"
                        }`}
                    onClick={() => setExplorationType("single")}
                >
                    Explore one word
                </button>
                <button
                    className={`px-4 py-2 rounded-md transition ${explorationType === "compare" ? "bg-blue-500" : "bg-gray-700 hover:bg-gray-600"
                        }`}
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
                        className="input-styles"
                    />
                    <input
                        type="text"
                        placeholder="Enter language code (e.g., en)"
                        value={language1}
                        onChange={(e) => setLanguage1(e.target.value)}
                        className="input-styles"
                    />
                    {explorationType === "compare" && (
                        <>
                            <input
                                type="text"
                                placeholder="Enter a second word"
                                value={word2}
                                onChange={(e) => setWord2(e.target.value)}
                                className="input-styles"
                            />
                            <input
                                type="text"
                                placeholder="Enter second language code (e.g., en)"
                                value={language2}
                                onChange={(e) => setLanguage2(e.target.value)}
                                className="input-styles"
                            />
                        </>
                    )}
                </div>
            )}

            {/* Recommended Word Section */}
            {explorationType && interestingWord && (
                <div className="mt-4 bg-gray-700 p-4 rounded-md text-white relative">
                    {/* Refresh Button */}
                    <button
                        className="absolute top-2 right-2 text-gray-300 hover:text-white transition"
                        onClick={selectRandomInterestingWord}
                        title="Refresh suggestion"
                    >
                        <RotateCcw />
                    </button>

                    <p className="text-sm">Try exploring a word from <b>{wordCategory}</b>:</p>
                    <button
                        className="mt-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 rounded-md text-white font-semibold transition"
                        onClick={() => setWord1(interestingWord.word)}
                    >
                        {interestingWord.word}
                    </button>
                    <p className="text-sm mt-2 italic text-gray-300">{interestingWord.reason}</p>
                    {/* TODO: Replace placeholder words with dynamically generated words from Wiktextract */}
                </div>
            )}

            {explorationType && word1 && (
                <>
                    <h3 className="text-lg font-semibold text-white mt-6">Select a visualization type:</h3>
                    <ul className="mt-3 grid grid-cols-2 gap-3 text-left">
                        {[
                            { label: "Geospatial", value: "geospatial" },
                            { label: "Network", value: "network" },
                            { label: "Radial", value: "radial" },
                            { label: "Tree", value: "tree" },
                        ].map((option) => (
                            <li key={option.value} className="flex items-center justify-start">
                                <label className="flex items-center space-x-3 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="visualization"
                                        value={option.value}
                                        checked={selectedVisualization === option.value}
                                        onChange={() => setSelectedVisualization(option.value)}
                                        className="hidden peer"
                                    />
                                    <div className="w-5 h-5 rounded-full border-2 border-white peer-checked:border-blue-500 peer-checked:bg-blue-500 flex items-center justify-center">
                                        <div className="w-2.5 h-2.5 bg-white rounded-full opacity-0 peer-checked:opacity-100 transition-opacity"></div>
                                    </div>
                                    <span className="text-white">{option.label}</span>
                                </label>
                            </li>
                        ))}
                    </ul>
                </>
            )}

            {/* Step 4: Start Button (Disabled Until Selection is Complete) */}
            {selectedVisualization && (
                <button
                    className="mt-6 px-6 py-2 bg-green-500 hover:bg-green-600 rounded-md text-white font-semibold transition"
                    onClick={() => setVisibleSection(selectedVisualization)}
                >
                    Start Visualization
                </button>
            )}
        </div>
    );
}
