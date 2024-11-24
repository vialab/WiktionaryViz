import { getCountryFromLanguageCode } from "./languageUtils";

export const processTranslations = async (
    translations: any[],
    languoidData: any[],
    setMarkers: React.Dispatch<React.SetStateAction<{ position: [number, number]; popupText: string }[]>>
) => {
    try {
        console.log('Starting to process translations...');
        const seenCoordinates = new Set<string>();
        const newMarkers: { position: [number, number]; popupText: string }[] = [];

        for (const translation of translations) {
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
                    let coordKey = `${lat},${lng}`;
                    let retries = 0;
                    const maxRetries = 20; // Increased retry limit for better staggering
                    const offsetStep = 0.5; // Stagger offset step size
                    const staggeredCoordinates = () => {
                        const angle = Math.random() * 2 * Math.PI; // Random angle
                        const radius = retries * offsetStep; // Radius increases with retries
                        return {
                            lat: lat + Math.cos(angle) * radius,
                            lng: lng + Math.sin(angle) * radius,
                        };
                    };

                    while (seenCoordinates.has(coordKey) && retries < maxRetries) {
                        const newCoords = staggeredCoordinates();
                        coordKey = `${newCoords.lat},${newCoords.lng}`;
                        lat = newCoords.lat;
                        lng = newCoords.lng;
                        retries++;
                    }

                    seenCoordinates.add(coordKey);
                    newMarkers.push({
                        position: [lat, lng],
                        popupText: `${translation.lang}: ${translation.word} (${translation.roman})`,
                    });
                    console.log('Added new marker:', { position: [lat, lng], popupText: `${translation.lang}: ${translation.word} (${translation.sense})` });
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