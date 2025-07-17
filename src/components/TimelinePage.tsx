import React, { useState, useEffect } from 'react';
import { useTimelineData, NodeData } from './timeline/useTimelineData';
import { EtymologyCarousel } from './timeline/EtymologyCarousel';
import { MetadataPanel } from './timeline/MetadataPanel';

interface TimelinePageProps {
    word: string;
    language: string;
}

const TimelinePage: React.FC<TimelinePageProps> = ({ word, language }) => {
    const { data, loading } = useTimelineData(word, language);
    const [focusIdx, setFocusIdx] = useState(0);
    const [drift, setDrift] = useState<any>(null);

    // Carousel uses ancestor-to-root order
    // Metadata panel uses reversed order to match carousel's visual order
    const reversedData = [...data].reverse();
    const currentCard = reversedData[focusIdx];
    const prevCard = focusIdx > 0 ? reversedData[focusIdx - 1] : undefined;

    // Fetch phonetic drift from backend when cards change
    useEffect(() => {
        async function fetchDrift() {
            function getIPA(card: NodeData | undefined): string | undefined {
                if (!card) return undefined;
                if (card.pronunciation) {
                    return card.pronunciation.replace(/^\[|\]$/g, '');
                }
                return undefined;
            }
            const ipa1 = getIPA(prevCard);
            const ipa2 = getIPA(currentCard);
            if (ipa1 && ipa2) {
                try {
                    const res = await fetch(
                        `http://localhost:8000/phonetic-drift-detailed?ipa1=${encodeURIComponent(ipa1)}&ipa2=${encodeURIComponent(ipa2)}`
                    );
                    if (res.ok) {
                        const driftData = await res.json();
                        setDrift(driftData);
                    } else {
                        setDrift(null);
                    }
                } catch {
                    setDrift(null);
                }
            } else {
                setDrift(null);
            }
        }
        fetchDrift();
    }, [prevCard, currentCard]);

    if (loading) return <div>Loading timeline...</div>;
    if (!data.length) return <div>No etymology found.</div>;

    return (
        <div className="p-4 relative w-full max-w-4xl mx-auto">
            <h1 className="text-xl font-bold mb-4">Etymology Timeline</h1>
            <EtymologyCarousel cards={data} onFocusChange={setFocusIdx} />
            <MetadataPanel card={currentCard} prevCard={prevCard} drift={drift} />
        </div>
    );
};

export default TimelinePage;
