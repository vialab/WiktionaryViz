import { useState } from "react";
import Navbar from "@/components/Navbar";
import LandingPage from "@/components/LandingPage";
import MapSection from "@/components/MapSection";

function App() {
  const [visibleSection, setVisibleSection] = useState<string>("landing-page");
  const [word1, setWord1] = useState<string>("");
  const [word2, setWord2] = useState<string>("");

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Navbar */}
      <header className="bg-gray-800 shadow-md p-4">
        <Navbar title="WiktionaryViz" onTitleClick={() => setVisibleSection("landing-page")} />
      </header>

      {/* Conditional Rendering of Sections */}
      <main className="flex flex-col items-center justify-center px-6 py-12">
        {visibleSection === "landing-page" && (
          <LandingPage
            setVisibleSection={setVisibleSection}
            setWord1={setWord1}
            setWord2={setWord2}
            word1={word1}
            word2={word2}
          />
        )}
        {visibleSection === "map-container" && <MapSection word1={word1} word2={word2} />}
      </main>
    </div>
  );
}

export default App;
