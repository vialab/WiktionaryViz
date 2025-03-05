import { useState, useEffect } from 'react';
import { fetchData } from '@/utils/fetchUtils';

const useTeaData = () => {
    const [teaData, setTeaData] = useState<any>(null);

    useEffect(() => {
        fetchData('/tea.json', setTeaData);
    }, []);

    return teaData;
};

export default useTeaData;
