import { useEffect, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { usePapaParse } from 'react-papaparse';
import './App.css';
import 'leaflet-defaulticon-compatibility';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
// @ts-ignore
import * as countryLanguage from 'country-language';

// Set up the default icon for markers
const DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
});
L.Marker.prototype.options.icon = DefaultIcon;

function App() {
  const [teaData, setTeaData] = useState<any>(null);
  const [markers, setMarkers] = useState<{ position: [number, number], popupText: string }[]>([]);
  const [languoidData, setLanguoidData] = useState<any[]>([]);
  const { readString } = usePapaParse();

  // Fetch data utility function
  const fetchData = useCallback(async (url: string, onSuccess: (data: any) => void) => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`Fetch response not OK for ${url}:`, response);
        return;
      }
      const data = url.endsWith('.csv') ? await response.text() : await response.json();
      onSuccess(data);
    } catch (error) {
      console.error(`Error fetching data from ${url}:`, error);
    }
  }, []);

  // Fetch tea data
  useEffect(() => {
    fetchData('/tea.json', setTeaData);
  }, [fetchData]);

  // Fetch languoid data
  useEffect(() => {
    fetchData('/languoid.csv', (csvText: string) => {
      readString(csvText, {
        header: true,
        delimiter: ',',
        worker: true,
        complete: (results) => setLanguoidData(results.data),
        error: (error) => console.error('Error parsing languoid CSV:', error),
      });
    });
  }, [fetchData, readString]);

  const getCountryCoordinates = useCallback(async (country_a2_code: string): Promise<{ lat: number, lng: number }> => {
    if (!languoidData.length) {
      return { lat: 0, lng: 0 };
    }
    const countryData = languoidData.find((row: any) => row.country_ids.includes(country_a2_code));
    if (countryData) {
      const lat = parseFloat(countryData.latitude);
      const lng = parseFloat(countryData.longitude);
      if (!isNaN(lat) && !isNaN(lng)) {
        return { lat, lng };
      }
    }
    return { lat: 0, lng: 0 };
  }, [languoidData]);

  const processTranslations = useCallback(async (translations: any[]) => {
    console.debug('Processing translations:', translations);
    try {
      const seenCoordinates = new Set<string>();
      const newMarkers: { position: [number, number]; popupText: string; }[] = [];

      for (const translation of translations) {
        console.debug('Processing translation:', translation);
        let lat = 0;
        let lng = 0;

        const matchingRow = languoidData.find((row: any) => row.iso639p3code === translation.code);
        if (matchingRow) {
          lat = parseFloat(matchingRow.latitude);
          lng = parseFloat(matchingRow.longitude);
        }
        if (lat === 0 && lng === 0) {
          const country = await getCountryFromLanguageCode(translation.code);
          if (country) {
            ({ lat, lng } = await getCountryCoordinates(country.code_2));
          }
        }

        if (lat !== 0 && lng !== 0) {
          let coordKey = `${lat},${lng}`;
          let retries = 0;
          while (seenCoordinates.has(coordKey) && retries < 10) {
            lat += (Math.random() - 0.5) * 0.01;
            lng += (Math.random() - 0.5) * 0.01;
            coordKey = `${lat},${lng}`;
            retries++;
          }
          seenCoordinates.add(coordKey);
          newMarkers.push({
            position: [lat, lng],
            popupText: `${translation.lang}: ${translation.word} (${translation.sense})`
          });
        }
      }
      setMarkers((prevMarkers) => [...prevMarkers, ...newMarkers]);
    } catch (err) {
      console.error('Error processing translations:', err);
    }
  }, [languoidData, getCountryCoordinates]);

  // Process translations once both teaData and languoidData are loaded
  useEffect(() => {
    if (teaData && languoidData.length > 0) {
      processTranslations(teaData.translations);
    }
  }, [teaData, languoidData, processTranslations]);

  const getCountryFromLanguageCode = (code: string): Promise<any> => {
    return new Promise((resolve, reject) => {
      countryLanguage.getLanguage(code, (err: any, language: any) => {
        if (err) {
          reject(err);
        } else {
          resolve(language.countries[0]);
        }
      });
    });
  };

  const showSection = (sectionId: string) => {
    document.querySelectorAll('.section').forEach((section) => section.classList.remove('visible'));
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
      targetSection.classList.add('visible');
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <nav className="navbar">
          <ul className="navbar-list">
            {['map-container', 'senses-network', 'radial-chart'].map((id) => (
              <li key={id} className="navbar-item">
                <button onClick={() => showSection(id)}>{id.replace('-', ' ').toUpperCase()}</button>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <section id="map-container" className="section visible">
        <MapContainer center={[0, 0]} zoom={2} scrollWheelZoom={false} style={{ height: "100vh", width: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {markers.map((marker, index) => (
            <Marker key={index} position={marker.position}>
              <Popup>{marker.popupText}</Popup>
            </Marker>
          ))}
        </MapContainer>
      </section>

      <section id="senses-network" className="section">
        <h2>Senses Network</h2>
        <p>Content for the senses network goes here.</p>
      </section>

      <section id="radial-chart" className="section">
        <h2>Radial Chart</h2>
        <p>Content for the radial chart goes here.</p>
      </section>
    </div>
  );
}

export default App;
