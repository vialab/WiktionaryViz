import { getCountryFromLanguageCode } from "./languageUtils";

export const processTranslations = async (
    translations: any[],
    languoidData: any[],
    setMarkers: React.Dispatch<React.SetStateAction<{ position: [number, number]; popupText: string }[]>>
) => {
    try {
        const seenCoordinates = new Set<string>();
        const newMarkers: { position: [number, number]; popupText: string }[] = [];

        for (const translation of translations) {
            let lat = 0;
            let lng = 0;

            const matchingRow = languoidData.find((row: any) => row.iso639p3code === translation.code);
            if (matchingRow) {
                lat = parseFloat(matchingRow.latitude);
                lng = parseFloat(matchingRow.longitude);
            }

            if (lat === 0 && lng === 0) {
                // Fallback to country coordinates if no match found in languoid data
                const country = await getCountryFromLanguageCode(translation.code);
                if (country) {
                    ({ lat, lng } = await getCountryCoordinates(country.code_2, languoidData));
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
                    popupText: `${translation.lang}: ${translation.word} (${translation.sense})`,
                });
            }
        }
        setMarkers((prevMarkers) => [...prevMarkers, ...newMarkers]);
    } catch (err) {
        console.error('Error processing translations:', err);
    }
};

export const getCountryCoordinates = async (
    countryA2Code: string,
    languoidData: any[]
): Promise<{ lat: number; lng: number }> => {
    const countryData = languoidData.find((row: any) => row.country_ids.includes(countryA2Code));
    if (countryData) {
        const lat = parseFloat(countryData.latitude);
        const lng = parseFloat(countryData.longitude);
        if (!isNaN(lat) && !isNaN(lng)) {
            return { lat, lng };
        }
    }
    return { lat: 0, lng: 0 };
};
