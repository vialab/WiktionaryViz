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
        "w-full px-4 py-2 rounded-md bg-[#1C1C1E] text-[#F5F5F5] placeholder-[#888] border border-[#B79F58] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]";

    const selectRandomInterestingWord = useCallback(async () => {
        try {
            const res = await fetch("http://localhost:8000/random-interesting-word");
            const data = await res.json();

            if (data?.entry?.word && data?.entry?.lang_code) {
                setInterestingWord({
                    word: data.entry.word,
                    reason:
                        data.entry.reason ||
                        `Highlighted in ${data.category.replace(/_/g, " ")} category`,
                });
                setWordCategory(data.category.replace(/_/g, " "));
            } else {
                throw new Error("Invalid format");
            }
        } catch {
            setInterestingWord({
                word: "example",
                reason: "Could not fetch real interesting words.",
            });
            setWordCategory("unknown");
        }
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
        <div className="max-w-lg mx-auto bg-[#1C1C1E] p-6 sm:p-8 rounded-lg shadow-xl text-center mt-10 overflow-y-auto">
            <h1 className="text-3xl font-bold text-[#D4AF37] mb-2">Welcome To WiktionaryViz</h1>
            <p className="text-[#F5F5F5] text-base mb-6">
                An exploratory tool for visualizing the evolution of words and their relationships.
            </p>

            <h3 className="text-lg font-semibold text-[#F5F5F5] mb-3">How would you like to explore?</h3>
            <div className="flex justify-center gap-4 mb-6">
                <button
                    className={`px-4 py-2 rounded-md font-semibold transition ${explorationType === "single"
                            ? "bg-[#D4AF37] text-black"
                            : "bg-[#0F0F0F] text-[#D4AF37] border border-[#D4AF37] hover:bg-[#1C1C1E]"
                        }`}
                    onClick={() => setExplorationType("single")}
                >
                    Explore one word
                </button>
                <button
                    className={`px-4 py-2 rounded-md font-semibold transition ${explorationType === "compare"
                            ? "bg-[#D4AF37] text-black"
                            : "bg-[#0F0F0F] text-[#D4AF37] border border-[#D4AF37] hover:bg-[#1C1C1E]"
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
                        className={inputBaseStyles}
                    />

                    {word1 && (
                        languageLoading ? (
                            <p className="text-[#B79F58]">Loading languages...</p>
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
                                    <p className="text-[#B79F58]">Loading second language list...</p>
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
                <div className="mt-6 bg-[#252525FF] p-4 rounded-md text-[#F5F5F5] relative">
                    <button
                        className="absolute top-2 right-2 text-[#B79F58] hover:text-[#D4AF37] transition"
                        onClick={selectRandomInterestingWord}
                        title="Refresh suggestion"
                    >
                        <RotateCcw size={18} />
                    </button>
                    <p className="text-sm text-[#B79F58]">
                        Try exploring a word from <span className="text-[#D4AF37] font-medium">{wordCategory}</span>:
                    </p>
                    <button
                        className="mt-2 px-4 py-1 bg-[#D4AF37] hover:bg-[#B79F58] text-black rounded-full text-sm font-medium transition"
                        onClick={() => setWord1(interestingWord.word)}
                    >
                        {interestingWord.word}
                    </button>
                    <p className="text-xs mt-2 italic text-[#B79F58]">{interestingWord.reason}</p>
                </div>
            )}

            {explorationType && word1 && (
                <>
                    <h3 className="text-lg font-semibold text-[#F5F5F5] mt-6">Select an available visualization type:</h3>
                    <ul className="mt-3 grid grid-cols-1 gap-3 text-left">
                        {["geospatial", "network", "timeline"].map((value) => (
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
                                    <div className="w-5 h-5 rounded-full border-2 border-[#F5F5F5] peer-checked:border-[#D4AF37] peer-checked:bg-[#D4AF37] flex items-center justify-center hover:border-[#B79F58] transition-all cursor-pointer">
                                        <div className="w-2.5 h-2.5 bg-black rounded-full opacity-0 peer-checked:opacity-100 transition-opacity"></div>
                                    </div>
                                    <span className="text-[#F5F5F5] capitalize">{value}</span>
                                </label>
                            </li>
                        ))}
                    </ul>
                </>
            )}

            {selectedVisualization && (
                <button
                    className="mt-8 px-6 py-2 bg-[#D4AF37] hover:bg-[#B79F58] rounded-md text-black font-semibold transition"
                    onClick={() => setVisibleSection(selectedVisualization)}
                >
                    Start Visualization
                </button>
            )}
        </div>
    );
}
