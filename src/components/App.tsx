import { useState } from "react";
import Navbar from "@/components/Navbar";
import LandingPage from "@/components/LandingPage";
import GeospatialPage from "@/components/GeospatialPage";

function App() {
  const [visibleSection, setVisibleSection] = useState<string>("landing-page");
  const [word1, setWord1] = useState<string>("");
  const [word2, setWord2] = useState<string>("");

  return (
    <div className="flex flex-col min-h-screen bg-gray-900 text-white">
      {/* Navbar */}
      <header className="bg-gray-800 shadow-md p-3 z-50 fixed top-0 w-full">
        <Navbar title="WiktionaryViz" onTitleClick={() => setVisibleSection("landing-page")} />
      </header>

      {/* Main content takes up remaining space */}
      <main className="flex-1 flex flex-col items-center px-6 py-12 mt-16">
        {visibleSection === "landing-page" && (
          <LandingPage
            setVisibleSection={setVisibleSection}
            setWord1={setWord1}
            setWord2={setWord2}
            word1={word1}
            word2={word2}
          />
        )}
        {visibleSection === "geospatial" && <GeospatialPage word1={word1} word2={word2} />}
      </main>
    </div>
  );
}

export default App;
