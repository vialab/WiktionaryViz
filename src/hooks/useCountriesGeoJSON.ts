import { useEffect, useState } from 'react';
import type { FeatureCollection, Geometry } from 'geojson';
import { fetchData } from '@/utils/fetchUtils';

export interface CountryProps {
    ISO_A3?: string;
    iso_a3?: string;
    ISO3?: string;
    ADM0_A3?: string;
    ISO_A3_EH?: string;
    NAME_EN?: string;
    NAME?: string;
    ADMIN?: string;
    SOVEREIGNT?: string;
    [key: string]: unknown;
}

const useCountriesGeoJSON = (path: string = '/countries.geojson') => {
    const [data, setData] = useState<FeatureCollection<Geometry, CountryProps> | null>(null);

    useEffect(() => {
        fetchData<FeatureCollection<Geometry, CountryProps>>(path, (json) => {
            setData(json);
        });
    }, [path]);

    return data;
};

export default useCountriesGeoJSON;
