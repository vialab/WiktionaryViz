import { useState, useEffect } from 'react';
import { fetchData } from '@/utils/fetchUtils';

const useWordData = (word: string | null) => {
    const [wordData, setWordData] = useState<any>(null);

    useEffect(() => {
        if (!word) {
            setWordData(null);
            return;
        }

        const fileName = `${word.toLowerCase()}.json`;

        fetchData(`/${fileName}`, setWordData);
    }, [word]);

    return wordData;
};

export default useWordData;
