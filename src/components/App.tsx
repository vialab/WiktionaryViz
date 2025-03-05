import { useState } from "react";
import "@/styles/App.css";
import Navbar from "@/components/Navbar";
import LandingPage from "@/components/LandingPage";
import MapSection from "@/components/MapSection";

function App() {
  const [visibleSection, setVisibleSection] = useState<string>("landing-page");
  const [word1, setWord1] = useState<string>("");
  const [word2, setWord2] = useState<string>("");

  return (
    <div className="App">
      <header className="App-header">
        <Navbar title="WiktionaryViz" onTitleClick={() => setVisibleSection("landing-page")} />
      </header>

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
      {/* {visibleSection === 'senses-network' && <SensesNetworkSection word1={word1} word2={word2} />} */}
      {/* {visibleSection === 'radial-chart' && <RadialChartSection word1={word1} word2={word2} />} */}
    </div>
  );
}

export default App;
