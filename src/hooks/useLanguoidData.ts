import { useState, useEffect } from 'react';
import { usePapaParse } from 'react-papaparse';
import { fetchData } from '@/utils/fetchUtils';
import type { LanguoidData } from '@/types/languoid';

const useLanguoidData = () => {
    const [languoidData, setLanguoidData] = useState<LanguoidData[]>([]);
    const { readString } = usePapaParse();

    useEffect(() => {
        // console.log('Fetching languoid data...');
    fetchData<string>('/languoid.csv', (csvText) => {
            // console.log('CSV text fetched:', csvText);
            readString(csvText, {
                header: true,
                delimiter: ',',
                worker: true,
                complete: (results) => {
                    // console.log('CSV parsing complete:', results);
                    setLanguoidData(results.data as LanguoidData[]);
                },
                error: (error) => console.error('Error parsing languoid CSV:', error),
            });
        });
    }, [readString]);

    console.log('Languoid data state:', languoidData);
    return languoidData;
};

export default useLanguoidData;