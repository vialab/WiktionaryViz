import { useEffect, useState } from 'react';

export interface NodeData {
    language: string;
    drift: number;
    tooltip: string;
    word: string;
    lang_code: string;
    pronunciation?: string;
}

/**
 * Custom hook to fetch and process timeline data for the phonetic drift timeline using the word-data API and etymology_templates.
 * @param word - The target word
 * @param language - The target language
 */
export function useTimelineData(word: string, language: string) {
    const [data, setData] = useState<NodeData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchTimelineFromWordData() {
            setLoading(true);
            setError(null);
            setData([]);
            try {
                const res = await fetch(`http://localhost:8000/word-data?word=${encodeURIComponent(word)}&lang_code=${encodeURIComponent(language)}`);
                if (!res.ok) throw new Error('Failed to fetch word data');
                const node = await res.json();
                const timeline: NodeData[] = [];
                // Add the current word as the first node
                const pron = node.sounds && node.sounds.length > 0 && node.sounds[0].ipa ? node.sounds[0].ipa : node.ai_estimated_ipa || '';
                timeline.push({
                    language: node.lang_code,
                    drift: 0,
                    tooltip: `${node.word} (${node.lang_code})\nIPA: ${pron || 'N/A'}`,
                    word: node.word,
                    lang_code: node.lang_code,
                    pronunciation: pron
                });
                // Add each ancestor from etymology_templates
                if (Array.isArray(node.etymology_templates)) {
                    node.etymology_templates.forEach((tpl, i) => {
                        const ancestorWord = tpl.args && tpl.args["3"] ? tpl.args["3"] : 'unknown';
                        const ancestorLang = tpl.args && tpl.args["2"] ? tpl.args["2"] : 'unknown';
                        const ancestorPron = tpl.expansion || '';
                        timeline.push({
                            language: ancestorLang,
                            drift: 0, // Drift calculation can be added if available
                            tooltip: `${ancestorWord} (${ancestorLang})\n${ancestorPron}`,
                            word: ancestorWord,
                            lang_code: ancestorLang,
                            pronunciation: ancestorPron
                        });
                    });
                }
                setData(timeline);
            } catch (err) {
                if (err instanceof Error) setError(err.message);
                else setError('Unknown error');
                setData([]);
            } finally {
                setLoading(false);
            }
        }
        if (word && language) fetchTimelineFromWordData();
    }, [word, language]);

    return { data, loading, error };
}
