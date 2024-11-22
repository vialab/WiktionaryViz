import React, { useEffect } from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import * as d3 from 'd3';
import L, { Map as LeafletMap } from 'leaflet';
import countries from 'i18n-iso-countries';
import mbxGeocoding from '@mapbox/mapbox-sdk/services/geocoding';
import 'leaflet/dist/leaflet.css';
import './App.css';

// Extend the Window interface to include mapInstance
declare global {
  interface Window {
    mapInstance?: LeafletMap;
  }
}

// Helpers
export function getOffsetCoordinates(lat: number, lng: number, index: number): [number, number] {
  const offsetFactor = 1.0;
  const angle = (index * 45) % 360;
  const radian = angle * (Math.PI / 180);
  return [lat + Math.sin(radian) * offsetFactor, lng + Math.cos(radian) * offsetFactor];
}

// TranslationLoader
export async function getCountryCoordinatesForLanguage(langCode: string, word: string, roman: string) {
  console.log(`Getting coordinates for language code: ${langCode}`);
  try {
    const countriesList = await new Promise<any[]>((resolve, reject) => {
      const countryLanguage = require('country-language');
      countryLanguage.getLanguageCountries(langCode, (err: any, data: any[]) => {
        if (err) {
          console.error(`Error fetching countries for language ${langCode}:`, err);
          reject(err);
        } else {
          resolve(data);
        }
      });
    });

    const mapboxClient = mbxGeocoding({ accessToken: process.env.REACT_APP_MAPBOX_ACCESS_TOKEN ?? '' });
    const coordinatesList = await Promise.all(countriesList.map(async (country: any) => {
      const countryName = countries.getName(country.code_3, 'en');
      if (!countryName) {
        console.warn(`Country name not found for code: ${country.code_3}`);
        return null;
      }
      try {
        const response = await mapboxClient.forwardGeocode({ query: countryName, limit: 1 }).send();
        if (response && response.body.features.length) {
          const [lng, lat] = response.body.features[0].center;
          console.log(`Coordinates found for ${countryName}: [${lat}, ${lng}]`);
          return { countryName, baseCoordinates: [lat, lng] as [number, number], word, roman };
        } else {
          console.warn(`No coordinates found for ${countryName}`);
        }
      } catch (innerError) {
        console.error(`Error finding coordinates for ${countryName}:`, innerError);
      }
      return null;
    }));

    return coordinatesList.filter(item => item !== null);
  } catch (error) {
    console.error(`Error in getCountryCoordinatesForLanguage for ${langCode}:`, error);
    return [];
  }
}

// Register countries locale
countries.registerLocale(require('i18n-iso-countries/langs/en.json')); // Register English locale for country names

function App() {
  useEffect(() => {
    const initializeApp = async () => {
      const translations = await loadTranslations();
      if (translations.length > 0) {
        console.log(`Loaded ${translations.length} translations.`);
        await loadMapMarkers(translations);
      } else {
        console.error("Failed to load translations.");
      }
    };

    initializeApp();
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <nav className="navbar">
          <ul className="navbar-list">
            <li className="navbar-item"><button id="map-link" onClick={() => showSection('map-container')}>Map</button></li>
            <li className="navbar-item"><button id="senses-network-link" onClick={() => showSection('senses-network')}>Senses Network</button></li>
            <li className="navbar-item"><button id="radial-chart-link" onClick={() => showSection('radial-chart')}>Radial Chart</button></li>
          </ul>
        </nav>
      </header>

      <section id="map-container" className="section visible">
        <MapContainer center={[20, 0]} zoom={2} style={{ height: '100vh', width: '100%' }} whenReady={(map: LeafletMap) => { window.mapInstance = map; }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        </MapContainer>
      </section>
      <section id="senses-network" className="section"></section>
      <section id="radial-chart" className="section"></section>
    </div>
  );
}

// Load translations from tea.json
async function loadTranslations() {
  console.log("Loading translations from tea.json...");
  try {
    const data: any = await d3.json('/WiktionaryViz/tea.json');
    console.log("Translations loaded successfully.");
    return data.translations;
  } catch (error) {
    console.error("Error loading translations:", error);
    return [];
  }
}

// Load map markers based on translations
async function loadMapMarkers(translations: any[]) {
  console.log("Placing map markers...");
  if (!window.mapInstance) {
    console.error("Invalid map instance. Make sure the map is initialized properly.");
    return;
  }

  const map = window.mapInstance;
  const markerCounts = new Map();
  for (const entry of translations) {
    const coordinatesList = await getCountryCoordinatesForLanguage(entry.code, entry.word, entry.roman || "");
    if (coordinatesList.length === 0) {
      console.warn(`No coordinates found for translation entry: ${entry.word}`);
      continue;
    }
    coordinatesList.forEach((item) => {
      if (item === null) return;
      const { countryName, baseCoordinates, word, roman } = item;
      const coordKey = `${baseCoordinates[0]},${baseCoordinates[1]}`;
      const count = markerCounts.get(coordKey) || 0;
      markerCounts.set(coordKey, count + 1);

      const offsetCoordinates = getOffsetCoordinates(baseCoordinates[0], baseCoordinates[1], count);
      const popupContent = `<b>${countryName}:</b> ${word}${roman ? ` (${roman})` : ""}`;

      const marker = L.marker(offsetCoordinates);
      marker.addTo(map).bindPopup(popupContent);
      console.log(`Marker added at ${offsetCoordinates} for ${countryName} (${word}).`);
    });
  }
  console.log("All markers placed.");
}

// Function to show sections based on button clicks
function showSection(sectionId: string) {
  // Hide all sections
  document.querySelectorAll('.section').forEach(section => {
    if (section instanceof HTMLElement) {
      section.style.display = 'none';
    }
  });

  // Show selected section
  const selectedSection = document.getElementById(sectionId);
  if (selectedSection instanceof HTMLElement) {
    selectedSection.style.display = 'block';

    // If the map section is selected, ensure the map is properly resized
    if (sectionId === 'map-container' && window.mapInstance) {
      setTimeout(() => {
        window.mapInstance?.invalidateSize({ animate: true });
      }, 300); // Adding a slight delay helps ensure the container is fully visible before resizing
    }
  }
}

export default App;
