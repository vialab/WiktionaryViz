import { getCountryFromLanguageCode } from "@/utils/languageUtils";
import { apiUrl } from "@/utils/apiBase";
import { getLanguage } from "@ladjs/country-language";
import type { EtymologyNode } from '@/types/etymology';

/** 
 * Represents a translation entry. 
 */
export interface Translation {
    lang: string;
    code: string;
    word: string;
    sense?: string;
    roman?: string;
}

/** 
 * Represents a geographical coordinate. 
 */
interface Coordinate {
    lat: number;
    lng: number;
}

/** 
 * Represents a marker with a position and popup text. 
 */
interface Marker {
    position: [number, number];
    popupText: string;
}

/** 
 * Represents language metadata from the dataset.
 */
interface LanguoidData {
    iso639P3code: string;
    latitude?: string;
    longitude?: string;
    country_ids?: string;
    name: string;
}

/**
 * Converts an ISO 639-1 language code to ISO 639-3.
 * @param {string} iso639_1 - The ISO 639-1 code.
 * @returns {Promise<string | null>} - The ISO 639-3 code or null if not found.
 */
export const getIso639P3 = async (iso639_1: string): Promise<string | null> => {
    try {
        if (!iso639_1) return null;

        const language = await new Promise((resolve) => {
            getLanguage(iso639_1, (err, data) => {
                if (err || !data || !data.iso639_3) {
                    console.warn(`No ISO 639-3 mapping found for: ${iso639_1}`);
                    resolve(null);
                } else {
                    resolve(data.iso639_3);
                }
            });
        });

        return language as string | null;
    } catch (err) {
        console.error(`Error converting ISO 639-1 to ISO 639-3: ${iso639_1}`, err);
        return null;
    }
};

/**
 * Parses and validates a latitude and longitude pair.
 * @param {string | undefined} latStr - Latitude as a string.
 * @param {string | undefined} lngStr - Longitude as a string.
 * @returns {Coordinate | null} A valid coordinate object or null if invalid.
 */
const parseCoordinate = (latStr?: string, lngStr?: string): Coordinate | null => {
    if (!latStr || !lngStr) return null;
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    return !isNaN(lat) && !isNaN(lng) ? { lat, lng } : null;
};

/**
 * Gets coordinates based on ISO 639-3 code or language name.
 * Handles Wikimedia's custom "-pro" proto-language suffix.
 */
export const getCoordinatesForLanguage = async (
    languageCode: string,
    languoidData: LanguoidData[]
): Promise<Coordinate | null> => {
    console.log(`Getting coordinates for: ${languageCode}`);

    if (!languageCode) {
        console.warn("No language code provided for lookup.");
        return null;
    }

    let iso639P3 = languageCode.trim();

    // 🛠 Strip "-pro" suffix if present
    if (iso639P3.endsWith("-pro")) {
        iso639P3 = iso639P3.replace("-pro", ""); // Remove "-pro"
        console.warn(`Detected proto-language. Adjusting lookup: ${languageCode} -> ${iso639P3}`);
    }

    // Convert ISO 639-1 to ISO 639-3 if necessary
    if (iso639P3.length === 2) {
        const convertedCode = await getIso639P3(iso639P3);
        if (convertedCode) {
            iso639P3 = convertedCode;
            console.log(`Converted ${languageCode} -> ${iso639P3}`);
        }
    }

    // Validate input before lookup
    if (!iso639P3) {
        console.warn(`No valid ISO 639-3 code found for: ${languageCode}`);
        return null;
    }

    // Try to find an exact match in the dataset
    console.log(`Looking up coordinates for ISO code: ${iso639P3}`);
    const matchingRow = languoidData.find(row => row.iso639P3code?.toLowerCase() === iso639P3.toLowerCase());

    if (matchingRow) {
        console.log(`Matched language by ISO code: ${iso639P3}`);
        console.log(`Coordinates: ${matchingRow.latitude}, ${matchingRow.longitude}`);
        return parseCoordinate(matchingRow.latitude, matchingRow.longitude);
    }

    // 🔥 SAFELY HANDLE MISSING `name` PROPERTY
    try {
        const nameMatch = languoidData.find(row => row.name && row.name.toLowerCase().includes(languageCode.toLowerCase()));
        if (nameMatch) {
            console.log(`Matched using name: ${nameMatch.name}`);
            return parseCoordinate(nameMatch.latitude, nameMatch.longitude);
        }
    } catch (err) {
        console.error(`Error while searching by name for language code: ${languageCode}`, err);
    }

    console.warn(`No coordinates found for language code: ${iso639P3}. Skipping.`);
    return null; // ✅ SAFELY SKIP if there's no mapping
};

/**
 * Fetches a single representative coordinate for a given country.
 * @param {string} countryA2Code - The country code in A2 format.
 * @param {LanguoidData[]} languoidData - The dataset containing language metadata.
 * @returns {Promise<Coordinate>} A single coordinate for the country.
 */
export const getCountryCoordinates = async (
    countryA2Code: string,
    languoidData: LanguoidData[]
): Promise<Coordinate> => {
    console.log('Getting country coordinates for:', countryA2Code);

    const normalizedCountryCode = countryA2Code.toUpperCase();
    const countryDataList = languoidData.filter(row => {
        const countryIds = row.country_ids ? row.country_ids.trim().split(/\s+/) : [];
        return countryIds.includes(normalizedCountryCode);
    });

    const validCoordinates = countryDataList
        .map(row => parseCoordinate(row.latitude, row.longitude))
        .filter((coord): coord is Coordinate => coord !== null);

    if (validCoordinates.length > 0) {
        return validCoordinates[0];
    }

    console.log(`No coordinates found for ${countryA2Code}, returning default (0,0)`);
    return { lat: 0, lng: 0 };
};

/**
 * Processes translations and generates map markers.
 * @param {Translation[]} translations - The list of translations.
 * @param {LanguoidData[]} languoidData - The dataset containing language metadata.
 * @param {React.Dispatch<React.SetStateAction<Marker[]>>} setMarkers - Function to update markers.
 */
export const processTranslations = async (
    translations: Translation[],
    languoidData: LanguoidData[],
    setMarkers: React.Dispatch<React.SetStateAction<Marker[]>>,
) => {
    try {
        console.log("Starting to process translations...");

        const cleanedTranslations = translations.filter(t => t.lang && t.code && t.word);
        const seenMarkers = new Map<string, string[]>();
        const newMarkers: Marker[] = [];

        for (const translation of cleanedTranslations) {
            try {
                console.log("Processing translation:", translation);
                let coordinates: Coordinate[] = [];

                // Try language-based lookup first
                const langCoordinate = await getCoordinatesForLanguage(translation.code, languoidData);
                if (langCoordinate) {
                    coordinates = [langCoordinate];
                }

                // Fallback to country coordinates if no exact match found
                if (coordinates.length === 0) {
                    const country = await getCountryFromLanguageCode(translation.code);
                    if (country) {
                        console.log(`Fallback to country coordinates for code: ${translation.code}`);
                        const fallbackCoordinate = await getCountryCoordinates(country.code_2, languoidData);
                        if (fallbackCoordinate.lat !== 0 && fallbackCoordinate.lng !== 0) {
                            coordinates = [fallbackCoordinate];
                        }
                    }
                }

                // Group multiple meanings under the same marker
                for (const { lat, lng } of coordinates) {
                    if (lat !== 0 && lng !== 0) {
                        const markerKey = `${lat}|${lng}|${translation.lang}|${translation.word}|${translation.roman}|${translation.code}`;

                        const meaning = translation.sense ? `${translation.sense}` : "No meaning provided";
                        if (seenMarkers.has(markerKey)) {
                            seenMarkers.get(markerKey)!.push(`<br> - ${meaning}`);
                        } else {
                            seenMarkers.set(markerKey, [`<br> - ${meaning}`]);
                        }
                    }
                }
            } catch (err) {
                console.error("Error processing translation:", translation, err);
                continue;
            }
        }

        // Create final markers with grouped meanings
        seenMarkers.forEach((meanings, key) => {
            const [lat, lng, lang, word, roman, code] = key.split("|");
            newMarkers.push({
                position: [parseFloat(lat), parseFloat(lng)],
                popupText: `${lang} (${code}): ${word} ${roman !== 'undefined' ? `(${roman})` : ""}<br>Meaning(s):${meanings.join("")}`,
            });
        });

        setMarkers(prevMarkers => [...prevMarkers, ...newMarkers]);
        console.log("Finished processing translations. New markers:", newMarkers);
    } catch (err) {
        console.error("Critical error processing translations:", err);
    }
};

/**
 * Processes etymology lineage and generates a direct historical path.
 * @param {any[]} etymologyTemplates - The etymology templates from teaData.
 * @param {LanguoidData[]} languoidData - The dataset containing language metadata.
 * @param {string} targetWord - The final word being traced (e.g., "tea").
 * @param {string} targetLang - The language code of the word (e.g., "en").
 * @returns {Promise<{ positions: [number, number][], lineageText: string }[]>} - The ordered lineage path.
 */
export const processEtymologyLineage = async (
    etymologyTemplates: { name: string; args: { [key: string]: string }; expansion: string }[],
    languoidData: LanguoidData[],
    targetWord: string,
    targetLang: string
): Promise<EtymologyNode | null> => {
    if (!etymologyTemplates || etymologyTemplates.length === 0) {
        console.warn("No etymology templates found.");
        return null;
    }

    const position = await getCoordinatesForLanguage(targetLang, languoidData);

    let currentNode: EtymologyNode | null = {
        word: targetWord,
        lang_code: targetLang,
        romanization: null,
        position: position ? [position.lat, position.lng] : null,
        next: null,
        expansion: targetWord // Use the word itself as the initial expansion
    };

    console.log("Current node:", currentNode);

    // Ensure the initial position is valid
    if (currentNode && (!currentNode.position || isNaN(currentNode.position[0]) || isNaN(currentNode.position[1]))) {
        console.warn(`Initial position for targetLang (${targetLang}) is invalid. Setting default coordinates.`);
        if (currentNode) currentNode.position = [0, 0]; // Default fallback coordinates
    }

    const orderedEtymology = etymologyTemplates.filter(entry => entry.name === "bor" || entry.name === "der");

    for (const entry of orderedEtymology) {
        const { args, expansion } = entry;
        const sourceLang = args["2"]?.trim() ?? null;
        const sourceWord = args["3"]?.trim() ?? expansion;
        const sourceRomanization = args["tr"]?.trim() ?? null;

        if (!sourceLang) {
            console.warn(`Skipping entry due to missing sourceLang:`, entry);
            continue;
        }

        let sourceCoords = await getCoordinatesForLanguage(sourceLang, languoidData);

        // Approximate coordinates if not found
        if (!sourceCoords) {
            console.warn(`No coordinates found for sourceLang: ${sourceLang}. Approximating...`);
            if (currentNode && currentNode.position) {
                sourceCoords = { lat: currentNode.position[0] + 1, lng: currentNode.position[1] + 1 };
            } else {
                sourceCoords = { lat: 0, lng: 0 };
            }
        }

        // Handle specific overrides for known languages
        if (sourceLang === "fa-cls") {
            sourceCoords = { lat: 32.9, lng: 53.3 };
        }
        if (sourceLang === "ar") {
            sourceCoords = { lat: 27.96, lng: 43.85 };
        }

        // Ensure sourceCoords is valid and not NaN
        if (!sourceCoords || isNaN(sourceCoords.lat) || isNaN(sourceCoords.lng)) {
            console.warn(`Source coordinates for ${sourceLang} are invalid. Skipping this entry.`);
            continue;
        }

        const newNode: EtymologyNode = {
            word: sourceWord,
            lang_code: sourceLang,
            romanization: sourceRomanization,
            position: [sourceCoords.lat, sourceCoords.lng],
            next: currentNode,
            expansion: expansion
        };

        currentNode = newNode;
    }

    console.log("Finished processing etymology lineage. Result:", currentNode);
    return currentNode;
};

// Extracts all possible ancestor forms for each etymology step from etymology_text
export function extractEtymologyVariants(etymologyText: string): { lang: string; word: string }[] {
    // Example regex: matches 'from Middle Dutch arance, orange', 'from Old French orenge, arange', etc.
    // Handles: from <Language> <word1>[,| and| or] <word2> ...
    const variants: { lang: string; word: string }[] = [];
    if (!etymologyText) return variants;
    // Regex to match: from <Language> <word>[,| and| or] <word2> ...
    const regex = /from ([A-Z][a-zA-Z ]+?) ([^,.;()\[\]]+)(?:, ([^,.;()\[\]]+))*/g;
    let match;
    while ((match = regex.exec(etymologyText)) !== null) {
        const lang = match[1].trim();
        // match[2] is the first word, match[3] is the second (if present), etc.
        if (match[2]) variants.push({ lang, word: match[2].trim() });
        // Check for additional comma-separated words
        if (match[0].includes(',')) {
            const rest = match[0].split(/from [A-Z][a-zA-Z ]+ /)[1];
            if (rest) {
                rest.split(',').slice(1).forEach(w => {
                    const word = w.trim().replace(/^(and|or) /, '');
                    if (word) variants.push({ lang, word });
                });
            }
        }
    }
    return variants;
}

// Utility: fetches the IPA for a given word/lang from /word-data
export const fetchIPAForWord = async (word: string, lang: string): Promise<string | null> => {
    try {
    const res = await fetch(apiUrl(`/word-data?word=${encodeURIComponent(word)}&lang_code=${encodeURIComponent(lang)}`));
        if (!res.ok) return null;
        const data = await res.json();
        // Try to get IPA from sounds
        if (Array.isArray(data.sounds) && data.sounds.length > 0 && data.sounds[0].ipa) {
            return data.sounds[0].ipa;
        }
        // Fallback: try to get IPA from head_templates or forms if needed (not implemented here)
        return null;
    } catch {
        return null;
    }
};

/**
 * Normalizes a position to a [lat, lng] tuple.
 */
export const normalizePosition = (
    pos: [number, number] | { lat: number; lng: number } | null | undefined
): [number, number] => {
    if (!pos) {
        console.warn('Missing position:', pos);
        return [0, 0]; // Fallback
    }
    if (Array.isArray(pos)) {
        return pos;
    }
    if (typeof pos === 'object' && 'lat' in pos && 'lng' in pos) {
        return [pos.lat, pos.lng];
    }
    console.error('Invalid position format:', pos);
    return [0, 0];
};

/**
 * Creates a Leaflet arrow icon with the given rotation angle.
 */
export const createArrowIcon = (angle: number) => {
    return window.L.divIcon({
        className: 'arrow-icon',
        html: `<div style="
            transform: rotate(${angle}deg);
            width: 0;
            height: 0;
            border-left: 5px solid transparent;
            border-right: 5px solid transparent;
            border-bottom: 10px solid #2158A5FF; 
        "></div>`,
        iconSize: [10, 10],
        iconAnchor: [5, 5],
    });
};

/**
 * Calculates the bearing (angle) between two coordinates.
 */
export const calculateBearing = (start: [number, number], end: [number, number]): number => {
    const [lat1, lon1] = start.map(deg => deg * Math.PI / 180);
    const [lat2, lon2] = end.map(deg => deg * Math.PI / 180);
    const deltaLon = lon2 - lon1;
    const x = Math.sin(deltaLon) * Math.cos(lat2);
    const y = Math.cos(lat1) * Math.sin(lat2) -
              Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
    const bearingRad = Math.atan2(x, y);
    const bearingDeg = (bearingRad * 180 / Math.PI + 360) % 360;
    return bearingDeg;
};

/**
 * Calculates the midpoint between two coordinates in Mercator projection.
 */
export const calculateMercatorMidpoint = (coord1: [number, number], coord2: [number, number]): [number, number] => {
    const [lat1, lng1] = coord1;
    const [lat2, lng2] = coord2;
    const srcLatRad = lat1 * (Math.PI / 180);
    const dstLatRad = lat2 * (Math.PI / 180);
    const middleLatRad = Math.atan(Math.sinh(Math.log(Math.sqrt(
        (Math.tan(dstLatRad) + 1 / Math.cos(dstLatRad)) *
        (Math.tan(srcLatRad) + 1 / Math.cos(srcLatRad))
    ))));
    const middleLat = middleLatRad * (180 / Math.PI);
    const middleLng = (lng1 + lng2) / 2;
    return [middleLat, middleLng];
};