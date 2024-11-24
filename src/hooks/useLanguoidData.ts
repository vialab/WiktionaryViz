import { useState, useEffect } from 'react';
import { usePapaParse } from 'react-papaparse';
import { fetchData } from '../utils/fetchUtils';

const useLanguoidData = () => {
    const [languoidData, setLanguoidData] = useState<any[]>([]);
    const { readString } = usePapaParse();

    useEffect(() => {
        fetchData('/languoid.csv', (csvText: string) => {
            readString(csvText, {
                header: true,
                delimiter: ',',
                worker: true,
                complete: (results) => setLanguoidData(results.data),
                error: (error) => console.error('Error parsing languoid CSV:', error),
            });
        });
    }, [readString]);

    return languoidData;
};

export default useLanguoidData;
