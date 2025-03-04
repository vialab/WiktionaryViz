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
        <div className="landing-container">
            <h1>Welcome to WiktionaryViz</h1>
            <h2>An exploratory tool for visualizing the evolution of words, their meanings, and relationships.</h2>

            {/* Step 1: Select Exploration Type */}
            <h3>How would you like to explore?</h3>
            <div className="choice-buttons">
                <button
                    className={explorationType === "single" ? "active" : ""}
                    onClick={() => setExplorationType("single")}
                >
                    Explore one word
                </button>
                <button
                    className={explorationType === "compare" ? "active" : ""}
                    onClick={() => setExplorationType("compare")}
                >
                    Compare two words
                </button>
            </div>

            {/* Step 2: Show inputs only if an option is selected */}
            {explorationType && (
                <div className="input-container">
                    <input
                        type="text"
                        placeholder="Enter a word"
                        value={word1}
                        onChange={(e) => setWord1(e.target.value)}
                        autoFocus
                    />
                    {explorationType === "compare" && (
                        <input
                            type="text"
                            placeholder="Enter a second word"
                            value={word2}
                            onChange={(e) => setWord2(e.target.value)}
                        />
                    )}
                </div>
            )}

            {/* Step 3: Visualization Type Selection */}
            {explorationType && word1 && (
                <>
                    <h3>Select a visualization type:</h3>
                    <ul className="visualization-options">
                        {[
                            { label: "Word Evolution Map", value: "map-container" },
                            { label: "Senses Network Graph", value: "senses-network" },
                            { label: "Radial Chart", value: "radial-chart" },
                        ].map((option) => (
                            <li key={option.value}>
                                <label>
                                    <input
                                        type="radio"
                                        name="visualization"
                                        value={option.value}
                                        checked={selectedVisualization === option.value}
                                        onChange={() => setSelectedVisualization(option.value)}
                                    />
                                    {option.label}
                                </label>
                            </li>
                        ))}
                    </ul>
                </>
            )}

            {/* Step 4: Start Button (Disabled until selection is complete) */}
            {selectedVisualization && (
                <button
                    className="start-button"
                    onClick={() => setVisibleSection(selectedVisualization)}
                >
                    Start Visualization
                </button>
            )}
        </div>
    );
}
