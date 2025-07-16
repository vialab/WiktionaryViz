import React, { useState } from 'react';
import { useTimelineData } from './timeline/useTimelineData';
import { EtymologyCarousel } from './timeline/EtymologyCarousel';
import { MetadataPanel } from './timeline/MetadataPanel';

interface TimelinePageProps {
    word: string;
    language: string;
}

/**
 * TimelinePage visualizes phonetic drift as an animated timeline.
 * Uses modular components and a custom hook for maintainability.
 */
const TimelinePage: React.FC<TimelinePageProps> = ({ word, language }) => {
    const { data, loading } = useTimelineData(word, language);
    const [focusIdx, setFocusIdx] = useState(0);

    if (loading) return <div>Loading timeline...</div>;
    if (!data.length) return <div>No etymology found.</div>;

    return (
        <div className="p-4 relative w-full max-w-4xl mx-auto">
            <h1 className="text-xl font-bold mb-4">Etymology Timeline</h1>
            <EtymologyCarousel cards={data} onFocusChange={setFocusIdx} />
            <MetadataPanel card={data[focusIdx]} />
        </div>
    );
};

export default TimelinePage;
