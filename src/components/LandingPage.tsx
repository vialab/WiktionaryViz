import { useState } from "react";
import ExplorationTypeSelector from "./landing/ExplorationTypeSelector";
import WordLanguageInput from "./landing/WordLanguageInput";
import InterestingWordSuggestion from "./landing/InterestingWordSuggestion";
import VisualizationTypeSelector from "./landing/VisualizationTypeSelector";
import { useAvailableLanguages } from "@/hooks/useAvailableLanguages";
import { useInterestingWord } from "@/hooks/useInterestingWord";

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

/**
 * Main landing page for WiktionaryViz. Handles exploration type, word/language input, and visualization selection.
 */
export default function LandingPage({
    setVisibleSection,
    setWord1,
    setWord2,
    setLanguage1,
    setLanguage2,
    word1,
    word2 = "",
    language1,
    language2 = "",
}: LandingPageProps) {
    const [explorationType, setExplorationType] = useState<"single" | "compare" | null>(null);
    const [selectedVisualization, setSelectedVisualization] = useState<string | null>(null);
    const inputBaseStyles =
        "w-full px-4 py-2 rounded-md bg-[#1C1C1E] text-[#F5F5F5] placeholder-[#888] border border-[#B79F58] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]";

    // Hooks for available languages
    const { languages: availableLangs, loading: languageLoading } = useAvailableLanguages(word1);
    const { languages: availableLangs2, loading: language2Loading } = useAvailableLanguages(word2);
    // Hook for interesting word suggestion
    const { interestingWord, category: wordCategory, loading: interestingLoading, refresh } = useInterestingWord();

    return (
        <div className="max-w-lg mx-auto bg-[#1C1C1E] p-6 sm:p-8 rounded-lg shadow-xl text-center mt-10 overflow-y-auto">
            <h1 className="text-3xl font-bold text-[#D4AF37] mb-2">Welcome To WiktionaryViz</h1>
            <p className="text-[#F5F5F5] text-base mb-6">
                An exploratory tool for visualizing the evolution of words and their relationships.
            </p>
            <h3 className="text-lg font-semibold text-[#F5F5F5] mb-3">How would you like to explore?</h3>
            <ExplorationTypeSelector value={explorationType} onChange={setExplorationType} />

            {explorationType && (
                <div className="space-y-4">
                    <WordLanguageInput
                        word={word1}
                        onWordChange={setWord1}
                        language={language1}
                        onLanguageChange={setLanguage1}
                        availableLanguages={availableLangs}
                        loading={languageLoading}
                        inputBaseStyles={inputBaseStyles}
                        placeholder="Enter a word"
                    />
                    {explorationType === "compare" && (
                        <WordLanguageInput
                            word={word2}
                            onWordChange={setWord2}
                            language={language2}
                            onLanguageChange={setLanguage2}
                            availableLanguages={availableLangs2}
                            loading={language2Loading}
                            inputBaseStyles={inputBaseStyles}
                            placeholder="Enter a second word"
                        />
                    )}
                </div>
            )}

            {explorationType && interestingWord && (
                <InterestingWordSuggestion
                    interestingWord={interestingWord}
                    category={wordCategory}
                    loading={interestingLoading}
                    onRefresh={refresh}
                    onSelect={setWord1}
                />
            )}

            {explorationType && word1 && (
                <>
                    <h3 className="text-lg font-semibold text-[#F5F5F5] mt-6">Select an available visualization type:</h3>
                    <VisualizationTypeSelector
                        value={selectedVisualization}
                        onChange={setSelectedVisualization}
                    />
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
