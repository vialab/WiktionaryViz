// @ts-ignore
import * as countryLanguage from 'country-language';

export const getCountryFromLanguageCode = (code: string): Promise<any> => {
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
