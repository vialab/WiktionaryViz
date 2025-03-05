import { useState } from "react";

interface LandingPageProps {
    setVisibleSection: (section: string) => void;
    setWord1: (word: string) => void;
    setWord2: (word: string) => void;
    word1: string;
    word2: string;
}

export default function LandingPage({
    setVisibleSection,
    setWord1,
    setWord2,
    word1,
    word2,
}: LandingPageProps) {
    const [explorationType, setExplorationType] = useState<"single" | "compare" | null>(null);
    const [selectedVisualization, setSelectedVisualization] = useState<string | null>(null);

    return (
        <div className="max-w-lg mx-auto bg-gray-800 p-8 rounded-lg shadow-md text-center">
            {/* Title */}
            <h1 className="text-3xl font-bold text-white mb-2">Welcome To WiktionaryViz</h1>
            <h2 className="text-lg text-gray-300 mb-4">An exploratory etymology tool for visualizing the evolution of words, their meanings, and relationships.</h2>
            <p className="text-gray-300 mb-6">
                To begin your exploration, think of a word that fascinates you from any language—perhaps one with a rich history, an unexpected origin, or a shifting meaning over time. If you're curious about how two words relate, compare them to uncover their shared roots or divergent paths. Choose your approach below to get started.
            </p>

            {/* Step 1: Select Exploration Type */}
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

            {/* Step 2: Show Inputs Only if an Option is Selected */}
            {explorationType && (
                <div className="space-y-4">
                    <input
                        type="text"
                        placeholder="Enter a word"
                        value={word1}
                        onChange={(e) => setWord1(e.target.value)}
                        className="w-full px-4 py-2 rounded-md bg-gray-700 text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                    {explorationType === "compare" && (
                        <input
                            type="text"
                            placeholder="Enter a second word"
                            value={word2}
                            onChange={(e) => setWord2(e.target.value)}
                            className="w-full px-4 py-2 rounded-md bg-gray-700 text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    )}
                </div>
            )}

            {/* Step 3: Visualization Type Selection */}
            {explorationType && word1 && (
                <>
                    <h3 className="text-lg font-semibold text-white mt-6">Select a visualization type:</h3>
                    <ul className="mt-3 grid grid-cols-2 gap-3 text-left">
                        {[
                            { label: "Geospatial", value: "geospatial" },
                            { label: "Network", value: "network" },
                            { label: "Radial", value: "radial" },
                            { label: "Tree", value: "tree"},
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
