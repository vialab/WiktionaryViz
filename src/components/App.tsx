import { useState } from 'react';
import '../styles/App.css'
import Navbar from './Navbar';
import MapSection from './MapSection';
import SensesNetworkSection from './SensesNetworkSection';
import RadialChartSection from './RadialChartSection';

function App() {
  const [visibleSection, setVisibleSection] = useState<string>('map-container');

  return (
    <div className="App">
      <header className="App-header">
        <Navbar
          sections={['map-container', 'senses-network', 'radial-chart']}
          onSectionChange={setVisibleSection}
        />
      </header>
      {visibleSection === 'map-container' && <MapSection />}
      {visibleSection === 'senses-network' && <SensesNetworkSection />}
      {visibleSection === 'radial-chart' && <RadialChartSection />}
    </div>
  );
}

export default App;
