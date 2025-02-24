import { getCountryFromLanguageCode } from "./languageUtils";

/** 
 * Represents a translation entry. 
 */
interface Translation {
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
    latitude: string;
    longitude: string;
    country_ids: string;
}

/**
 * Filters and removes duplicate translations.
 * 
 * @param {Translation[]} translations - The array of translation data.
 * @returns {Translation[]} The cleaned translations with duplicates removed.
 */
export const preprocessTranslations = (translations: Translation[]): Translation[] => {
    console.log("Starting preprocessing of translations...");

    const validTranslations = translations.filter(t => t.lang && t.code && t.word);
    console.log(`Filtered out invalid records. Remaining count: ${validTranslations.length}`);

    const seen = new Set<string>();
    const uniqueTranslations = validTranslations.filter(t => {
        const key = `${t.lang}|${t.code}|${t.word}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    console.log(`Removed duplicate translations. Final count: ${uniqueTranslations.length}`);
    return uniqueTranslations;
};

/**
 * Parses and validates a latitude and longitude pair.
 * 
 * @param {string} latStr - Latitude as a string.
 * @param {string} lngStr - Longitude as a string.
 * @returns {Coordinate | null} A valid coordinate object or null if invalid.
 */
const parseCoordinate = (latStr: string, lngStr: string): Coordinate | null => {
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    return !isNaN(lat) && !isNaN(lng) ? { lat, lng } : null;
};

/**
 * Fetches the coordinates for a given country A2 code.
 * 
 * @param {string} countryA2Code - The country code in A2 format.
 * @param {LanguoidData[]} languoidData - The dataset containing language metadata.
 * @returns {Promise<Coordinate[]>} A list of coordinates for the country.
 */
export const getCountryCoordinates = async (
    countryA2Code: string,
    languoidData: LanguoidData[]
): Promise<Coordinate[]> => {
    console.log('Getting country coordinates for:', countryA2Code);

    if (!Array.isArray(languoidData) || languoidData.length === 0) {
        console.error('Error: languoidData is undefined or empty.');
        return [{ lat: 0, lng: 0 }];
    }

    const normalizedCountryCode = countryA2Code.toUpperCase();
    const countryDataList = languoidData.filter(row => {
        const countryIds = row.country_ids.trim().split(/\s+/);
        return countryIds.includes(normalizedCountryCode);
    });

    const coordinates = countryDataList
        .map(row => parseCoordinate(row.latitude, row.longitude))
        .filter((coord): coord is Coordinate => coord !== null);

    if (coordinates.length > 0) {
        console.log('Found multiple country coordinates:', coordinates);
        return coordinates;
    }

    console.log(`No coordinates found for ${countryA2Code}, returning default (0,0)`);
    return [{ lat: 0, lng: 0 }];
};

/**
 * Processes translations and generates map markers.
 * 
 * @param {Translation[]} translations - The list of translations.
 * @param {LanguoidData[]} languoidData - The dataset containing language metadata.
 * @param {React.Dispatch<React.SetStateAction<Marker[]>>} setMarkers - Function to update markers.
 */
export const processTranslations = async (
    translations: Translation[],
    languoidData: LanguoidData[],
    setMarkers: React.Dispatch<React.SetStateAction<Marker[]>>
) => {
    try {
        console.log('Starting to process translations...');

        const cleanedTranslations = preprocessTranslations(translations);
        const seenMarkers = new Set<string>();
        const newMarkers: Marker[] = [];

        for (const translation of cleanedTranslations) {
            try {
                console.log('Processing translation:', translation);
                let coordinates: Coordinate[] = [];

                // Find exact match in languoidData
                const matchingRows = languoidData.filter(row => row.iso639P3code === translation.code);
                if (matchingRows.length > 0) {
                    coordinates = matchingRows
                        .map(row => parseCoordinate(row.latitude, row.longitude))
                        .filter((coord): coord is Coordinate => coord !== null);
                }

                // Fallback to country coordinates if no exact match found
                if (coordinates.length === 0) {
                    const country = await getCountryFromLanguageCode(translation.code);
                    if (country) {
                        console.log('Fallback to country coordinates for code:', translation.code);
                        coordinates = await getCountryCoordinates(country.code_2, languoidData);
                    }
                }

                // Add markers for each valid coordinate
                for (const { lat, lng } of coordinates) {
                    if (lat !== 0 && lng !== 0) {
                        const markerKey = `${lat}|${lng}|${translation.lang}|${translation.word}|${translation.sense}`;
                        if (!seenMarkers.has(markerKey)) {
                            newMarkers.push({
                                position: [lat, lng],
                                popupText: `${translation.lang} (${translation.code}): ${translation.word}${translation.roman ? ` (${translation.roman})` : ""}<br>Meaning: ${translation.sense}`,
                            });
                            seenMarkers.add(markerKey);
                        }
                    }
                }
            } catch (err) {
                console.error('Error processing translation:', translation, err);
            }
        }
        
        setMarkers((prevMarkers) => [...prevMarkers, ...newMarkers]);
        console.log('Finished processing translations. New markers:', newMarkers);
    } catch (err) {
        console.error('Critical error processing translations:', err);
    }
};
