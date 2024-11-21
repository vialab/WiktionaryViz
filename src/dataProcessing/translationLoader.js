import * as d3 from 'd3';
import countryLanguage from 'country-language';
import countries from 'i18n-iso-countries';
import mbxGeocoding from '@mapbox/mapbox-sdk/services/geocoding';

countries.registerLocale(require('i18n-iso-countries/langs/en.json'));
const mapboxClient = mbxGeocoding({ accessToken: process.env.MAPBOX_ACCESS_TOKEN });

export async function loadTranslations() {
    console.log("Loading translations from tea.json...");
    try {
        const data = await d3.json('/tea.json');
        console.log("Translations loaded successfully.");
        return data.translations;
    } catch (error) {
        console.error("Error loading translations:", error);
        return null;
    }
}

export async function getCountryCoordinatesForLanguage(langCode, word, roman) {
    console.log(`Getting coordinates for language code: ${langCode}`);
    try {
        const countriesList = await new Promise((resolve, reject) => {
            countryLanguage.getLanguageCountries(langCode, (err, data) => {
                if (err) {
                    console.error(`Error fetching countries for language ${langCode}:`, err);
                    reject(err);
                } else {
                    resolve(data);
                }
            });
        });

        const coordinatesList = await Promise.all(countriesList.map(async (country) => {
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
                    return { countryName, baseCoordinates: [lat, lng], word, roman };
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

// Cache all languages at the start to avoid repeated calls
let allLanguages = null;

async function loadAllLanguages() {
    if (!allLanguages) {
        allLanguages = countryLanguage.getLanguages();
    }
    return allLanguages;
}

// Function to convert any language code or language name to ISO 639-3
export async function getISO639_3(langCode, langName) {
    const languages = await loadAllLanguages();

    // Attempt to find the language by ISO 639-1 code
    let language = languages.find(lang => lang.iso639_1 === langCode);

    // If not found by code, try matching by language name
    if (!language && langName) {
        language = languages.find(lang => lang.name.includes(langName));
    }

    // Return the ISO 639-3 code if found, otherwise null
    return language ? language.iso639_3 : null;
}

// Function to load `languoid.csv` and get the language family
async function getLanguageFamily(iso639_3) {
    const languoidPath = '/languoid.csv';
    try {
        const data = await d3.csv(languoidPath);
        const entry = data.find(row => row.iso639P3code === iso639_3);
        if (entry) {
            return { family_id: entry.family_id, family_name: entry.name };
        } else {
            console.warn(`Family not found for ISO 639-3 code: ${iso639_3}`);
            return null;
        }
    } catch (error) {
        console.error(`Error loading languoid.csv: ${error}`);
        return null;
    }
}

// Main function to get language family from a language code
export async function getLanguageFamilyFromCode(langCode) {
    try {
        const iso639_3 = await getISO639_3(langCode);
        return await getLanguageFamily(iso639_3);
    } catch (error) {
        console.error(`Error getting language family for code: ${langCode}`, error);
        return null;
    }
}
