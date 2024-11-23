import React, { useEffect, useState } from 'react';
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

  useEffect(() => {
    console.debug('Fetching tea data...');
    fetch('/tea.json')
      .then(response => {
        if (!response.ok) {
          console.warn('Tea data fetch response not OK:', response);
        }
        return response.json();
      })
      .then(data => {
        console.log('Fetched tea data:', data);
        setTeaData(data);
        processTranslations(data.translations);
      })
      .catch(error => console.error('Error fetching tea data:', error));
  }, []);

  useEffect(() => {
    console.debug('Fetching languoid data...');
    readString('/languoid.csv', {
      header: true,
      delimiter: ',',
      worker: true,
      complete: (results) => {
        console.log(results);
        setLanguoidData(results.data);
      },
      error: (error) => console.error('Error fetching languoid data:', error),
    });
    
    
  }, []);

  const processTranslations = async (translations: any[]) => {
    console.debug('Processing translations:', translations);
    try {
      const newMarkers = await Promise.all(translations.map(async (translation) => {
        console.debug('Processing translation:', translation);
        try {
          const country = await getCountryFromLanguageCode(translation.code);
          console.log('Country found for translation:', country);
          if (country) {
            const { lat, lng } = await getCountryCoordinates(country.code_2);
            console.log(`Coordinates for country ${country.code_2}:`, { lat, lng });
            return {
              position: [lat, lng] as [number, number],
              popupText: `${translation.lang}: ${translation.word} (${translation.sense})`
            };
          }
        } catch (err) {
          console.error('Error processing translation:', translation, err);
        }
        return null;
      }));
      setMarkers(newMarkers.filter(marker => marker !== null) as { position: [number, number], popupText: string }[]);
    } catch (err) {
      console.error('Error processing translations:', err);
    }
  };

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

  const getCountryCoordinates = async (country_a2_code: string): Promise<{ lat: number, lng: number }> => {
    if (!languoidData || languoidData.length === 0) {
      console.warn('Languoid data is empty');
      return { lat: 0, lng: 0 };
    }
  
    const countryData = languoidData.find(row => row.country_ids.includes(country_a2_code));
    if (countryData) {
      return { lat: parseFloat(countryData.latitude), lng: parseFloat(countryData.longitude) };
    }
    return { lat: 0, lng: 0 };
  };
  

  const showSection = (sectionId: string) => {
    console.debug('Showing section:', sectionId);
    // Hide all sections
    const sections = document.querySelectorAll('.section');
    sections.forEach((section) => section.classList.remove('visible'));

    // Show the selected section
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
      console.log(`Section ${sectionId} is now visible`);
      targetSection.classList.add('visible');
    } else {
      console.warn(`Section ${sectionId} not found`);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <nav className="navbar">
          <ul className="navbar-list">
            <li className="navbar-item">
              <button id="map-link" onClick={() => showSection('map-container')}>Map</button>
            </li>
            <li className="navbar-item">
              <button id="senses-network-link" onClick={() => showSection('senses-network')}>Senses Network</button>
            </li>
            <li className="navbar-item">
              <button id="radial-chart-link" onClick={() => showSection('radial-chart')}>Radial Chart</button>
            </li>
          </ul>
        </nav>
      </header>

      <section id="map-container" className="section visible">
        <MapContainer center={[0, 0]} zoom={2} scrollWheelZoom={false} style={{
          height: "100vh",
          width: "100%",
        }}>
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