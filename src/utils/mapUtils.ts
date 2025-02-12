import { getCountryFromLanguageCode } from "./languageUtils";

export const preprocessTranslations = (translations: any[]): any[] => {
    console.log("Starting preprocessing of translations...");
    
    // Filter out invalid records (must have lang, code, and word; roman is optional)
    const validTranslations = translations.filter(translation =>
        translation.lang && translation.code && translation.word
    );

    console.log(`Filtered out invalid records. Remaining count: ${validTranslations.length}`);

    // Deduplicate translations based on lang, code, and word
    const seen = new Set<string>();
    const uniqueTranslations = validTranslations.filter(translation => {
        const key = `${translation.lang}|${translation.code}|${translation.word}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });

    console.log(`Removed duplicate translations. Final count: ${uniqueTranslations.length}`);
    return uniqueTranslations;
};


export const processTranslations = async (
    translations: any[],
    languoidData: any[],
    setMarkers: React.Dispatch<React.SetStateAction<{ position: [number, number]; popupText: string }[]>>
) => {
    try {
        console.log('Starting to process translations...');
        
        // Preprocess translations to remove duplicates and invalid entries
        const cleanedTranslations = preprocessTranslations(translations);

        const seenCoordinates = new Set<string>();
        const newMarkers: { position: [number, number]; popupText: string }[] = [];

        for (const translation of cleanedTranslations) {
            try {
                console.log('Processing translation:', translation);
                let lat = 0;
                let lng = 0;

                const matchingRow = languoidData.find((row: any) => row.iso639p3code === translation.code);
                if (matchingRow) {
                    lat = parseFloat(matchingRow.latitude);
                    lng = parseFloat(matchingRow.longitude);
                    console.log('Found matching row in languoid data:', matchingRow);
                }

                if (lat === 0 && lng === 0) {
                    // Fallback to country coordinates if no match found in languoid data
                    const country = await getCountryFromLanguageCode(translation.code);
                    if (country) {
                        console.log('Fallback to country coordinates for code:', translation.code);
                        ({ lat, lng } = await getCountryCoordinates(country.code_2, languoidData));
                    }
                }

                if (lat !== 0 && lng !== 0) {
                    newMarkers.push({
                        position: [lat, lng],
                        popupText: `${translation.lang}: ${translation.word}${translation.roman ? ` (${translation.roman})` : ""}`,
                    });
                    console.log('Added new marker:', { position: [lat, lng], popupText: `${translation.lang}: ${translation.word}${translation.roman ? ` (${translation.roman})` : ""}` });
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


export const getCountryCoordinates = async (
    countryA2Code: string,
    languoidData: any[]
): Promise<{ lat: number; lng: number }> => {
    console.log('Getting country coordinates for:', countryA2Code);
    const countryData = languoidData.find((row: any) => row.country_ids.includes(countryA2Code));
    if (countryData) {
        const lat = parseFloat(countryData.latitude);
        const lng = parseFloat(countryData.longitude);
        if (!isNaN(lat) && !isNaN(lng)) {
            console.log('Found country coordinates:', { lat, lng });
            return { lat, lng };
        }
    }
    console.log('Country coordinates not found, returning default (0, 0)');
    return { lat: 0, lng: 0 };
};

export const processTranslationsByCountry = async (
    translations: any[],
    languoidData: any[],
    setMarkers: React.Dispatch<React.SetStateAction<{ position: [number, number]; popupText: string }[]>>
) => {
    try {
        console.log("Starting country-level processing of translations...");

        // Preprocess translations to remove duplicates and invalid entries
        const cleanedTranslations = preprocessTranslations(translations);

        const countryWordMap: Map<string, { lat: number; lng: number; words: string[] }> = new Map();

        for (const translation of cleanedTranslations) {
            try {
                // Find country based on language code
                const country = await getCountryFromLanguageCode(translation.code);
                if (!country) {
                    console.warn(`No country found for language code: ${translation.code}`);
                    continue;
                }

                const countryCode = country.code_2;
                let lat = NaN;
                let lng = NaN;

                // Get country coordinates
                const countryData = languoidData.find(row => row.country_ids.includes(countryCode));
                if (countryData) {
                    lat = parseFloat(countryData.latitude);
                    lng = parseFloat(countryData.longitude);
                }

                // Ensure lat/lng are valid numbers
                if (isNaN(lat) || isNaN(lng)) {
                    console.error(`Invalid coordinates for ${countryCode}: (${lat}, ${lng})`);
                    continue; // Skip this entry
                }

                // Group translations by country
                if (!countryWordMap.has(countryCode)) {
                    countryWordMap.set(countryCode, { lat, lng, words: [] });
                }
                countryWordMap.get(countryCode)?.words.push(`${translation.lang}: ${translation.word}${translation.roman ? ` (${translation.roman})` : ""}`);
            } catch (err) {
                console.error("Error processing translation:", translation, err);
            }
        }

        // Convert the grouped data into valid markers
        const newMarkers = Array.from(countryWordMap.values()).map(({ lat, lng, words }) => ({
            position: [lat, lng] as [number, number],
            popupText: words.join("<br>"),
        }));

        setMarkers(newMarkers);
        console.log("Finished processing translations by country. Markers:", newMarkers);
    } catch (err) {
        console.error("Critical error processing translations by country:", err);
    }
};



