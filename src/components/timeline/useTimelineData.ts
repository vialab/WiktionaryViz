import { useEffect, useState } from 'react';
import useLanguoidData from '@/hooks/useLanguoidData';
import useWordData from '@/hooks/useWordData';

export interface NodeData {
    language: string;
    drift: number;
    tooltip: string;
}

/**
 * Custom hook to fetch and process timeline data for the phonetic drift timeline.
 * @param word - The target word
 * @param language - The target language
 */
export function useTimelineData(word: string, language: string) {
    const languoidData = useLanguoidData();
    const wordData = useWordData(word, language);
    const [data, setData] = useState<NodeData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchTimeline() {
            setLoading(true);
            setError(null);
            if (!wordData) {
                setData([]);
                setLoading(false);
                return;
            }
            const chain = [];
            chain.push({
                word: wordData.word,
                lang: wordData.lang,
                lang_code: wordData.lang_code
            });
            const templates = (wordData.etymology_templates as any[]) || [];
            for (const entry of templates) {
                if (entry.name === 'bor' || entry.name === 'der') {
                    const lang_code = entry.args['2'];
                    const word = entry.args['3'] || entry.expansion;
                    if (lang_code && word) {
                        chain.push({ word, lang: null, lang_code });
                    }
                }
            }
            const ipaArr: { lang: string; lang_code: string; word: string; ipa: string | null }[] = [];
            for (const n of chain) {
                let lang = n.lang;
                let lang_code = n.lang_code;
                let ipa: string | null = null;
                try {
                    const res = await fetch(`http://localhost:8000/word-data?word=${encodeURIComponent(n.word)}&lang_code=${encodeURIComponent(n.lang_code)}`);
                    if (res.ok) {
                        const d = await res.json();
                        lang = d.lang || lang;
                        lang_code = d.lang_code || lang_code;
                        if (Array.isArray(d.sounds) && d.sounds.length > 0 && d.sounds[0].ipa) {
                            ipa = d.sounds[0].ipa;
                        }
                    }
                } catch {}
                ipaArr.push({ lang, lang_code, word: n.word, ipa });
            }
            const driftData: NodeData[] = [];
            if (ipaArr.length > 0) {
                driftData.push({ language: `${ipaArr[0].lang} (${ipaArr[0].lang_code})`, drift: 0, tooltip: `${ipaArr[0].word} (${ipaArr[0].lang} - ${ipaArr[0].lang_code})\nIPA: ${ipaArr[0].ipa || 'N/A'}` });
            }
            for (let i = 1; i < ipaArr.length; i++) {
                const ipa1 = ipaArr[i - 1].ipa || '';
                const ipa2 = ipaArr[i].ipa || '';
                let drift = 0;
                let tooltip = `${ipaArr[i - 1].word} (${ipaArr[i - 1].lang} - ${ipaArr[i - 1].lang_code}) → ${ipaArr[i].word} (${ipaArr[i].lang} - ${ipaArr[i].lang_code})\nIPA: ${ipa1} → ${ipa2}`;
                try {
                    if (ipa1 && ipa2) {
                        const res = await fetch(`http://localhost:8000/phonetic-drift-detailed?ipa1=${encodeURIComponent(ipa1)}&ipa2=${encodeURIComponent(ipa2)}`);
                        const json = await res.json();
                        drift = Array.isArray(json.alignment)
                            ? json.alignment.filter((d: { changes?: Record<string, string>; status?: string }) => d.changes || d.status === 'deletion' || d.status === 'insertion').length
                            : 0;
                        if (Array.isArray(json.alignment)) {
                            tooltip += '\nFeature Differences by Aligned Segments:';
                            for (const diff of json.alignment) {
                                if (diff.changes) {
                                    tooltip += `\n  ${diff.from} → ${diff.to} | ${Object.keys(diff.changes).length} feature diffs`;
                                } else if (diff.status === 'deletion') {
                                    tooltip += `\n  ${diff.from} → ∅ | deletion`;
                                } else if (diff.status === 'insertion') {
                                    tooltip += `\n  ∅ → ${diff.to} | insertion`;
                                }
                            }
                        }
                    } else {
                        tooltip += '\n(IPA missing for one or both words)';
                    }
                } catch {
                    tooltip += '\n(error fetching drift)';
                }
                driftData.push({ language: `${ipaArr[i].lang} (${ipaArr[i].lang_code})`, drift, tooltip });
            }
            setData(driftData);
            setLoading(false);
        }
        fetchTimeline();
    }, [word, language, wordData, languoidData]);

    return { data, loading, error };
}
