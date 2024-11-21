import L from 'leaflet';
import { getCountryCoordinatesForLanguage } from '../dataProcessing/translationLoader';
import { getOffsetCoordinates } from '../utils/helpers';

export function initializeMap(mapContainerId) {
    console.log("Attempting to initialize the map...");

    const mapContainer = document.getElementById(mapContainerId);
    if (!mapContainer) {
        console.error(`Map container with ID '${mapContainerId}' not found.`);
        return null;
    }

    try {
        // Directly initialize the map every time for testing purposes
        const map = L.map(mapContainerId).setView([20, 0], 2);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);
        console.log("Leaflet map instance created successfully.");

        // Additional check to confirm that `map` is a valid Leaflet instance
        if (map && typeof map.invalidateSize === 'function') {
            console.log("Map has invalidateSize function.");
        } else {
            console.error("Map does not have invalidateSize function.");
        }
        return map; // Return the newly created map instance
    } catch (error) {
        console.error("Error during map initialization:", error);
        return null;
    }
}


export async function loadMapMarkers(map, translations) {
    console.log("Placing map markers...");
    if (!map || typeof map.addLayer !== 'function') {
        console.error("Invalid map instance. Make sure the map is initialized properly.");
        return;
    }

    const markerCounts = new Map();
    for (const entry of translations) {
        const coordinatesList = await getCountryCoordinatesForLanguage(entry.code, entry.word, entry.roman || "");
        coordinatesList.forEach(({ countryName, baseCoordinates, word, roman }) => {
            const coordKey = `${baseCoordinates[0]},${baseCoordinates[1]}`;
            const count = markerCounts.get(coordKey) || 0;
            markerCounts.set(coordKey, count + 1);

            const offsetCoordinates = getOffsetCoordinates(baseCoordinates[0], baseCoordinates[1], count);
            const popupContent = `<b>${countryName}:</b> ${word}${roman ? ` (${roman})` : ""}`;

            const marker = L.marker(offsetCoordinates);
            if (marker && typeof marker.addTo === 'function') {
                marker.addTo(map).bindPopup(popupContent);
                console.log(`Marker added at ${offsetCoordinates} for ${countryName} (${word}).`);
            } else {
                console.error("Failed to create or add marker to map.");
            }
        });
    }
    console.log("All markers placed.");
}

