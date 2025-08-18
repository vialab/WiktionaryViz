import { useEffect, useState } from 'react';
import { apiUrl } from '@/utils/apiBase';

export interface NodeData {
    lang: string; // Full language name (e.g., 'Indonesian') or expansion fallback
    drift: number;
    tooltip: string;
    word: string;
    lang_code: string;
    pronunciation?: string;
    dataQuality: 'complete' | 'partial-ai' | 'full-ai';
}

/**
 * Custom hook to fetch and process timeline data for the phonetic drift timeline using the word-data API and etymology_templates.
 * @param word - The target word
 * @param language - The target language
 */
interface AncestryChainEntry {
    phonemic_ipa: any;
    word: string;
    lang_code: string;
    ipa?: string;
    node?: any;
}

export function useTimelineData(word: string, language: string) {
    const [data, setData] = useState<NodeData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchTimelineFromAncestryChain() {
            setLoading(true);
            setError(null);
            setData([]);
            try {
                const res = await fetch(apiUrl(`/ancestry-chain?word=${encodeURIComponent(word)}&lang_code=${encodeURIComponent(language)}`));
                if (!res.ok) throw new Error('Failed to fetch ancestry chain');
                const result = await res.json();
                let rootExpansion = '';
                if (result.ancestry_chain && result.ancestry_chain.length > 0) {
                    const rootNode = result.ancestry_chain[0].node;
                    if (rootNode && Array.isArray(rootNode.etymology_templates) && rootNode.etymology_templates.length > 0 && rootNode.etymology_templates[0].expansion) {
                        rootExpansion = rootNode.etymology_templates[0].expansion;
                    }
                }
                if (result.ancestry_chain && Array.isArray(result.ancestry_chain)) {
                    const timeline: NodeData[] = result.ancestry_chain.map((entry: AncestryChainEntry & { drift?: number }) => {
                        let dataQuality: 'complete' | 'partial-ai' | 'full-ai' = 'complete';
                        // AI transparency logic:
                        // - If IPA is present and not estimated, 'complete'
                        // - If IPA is present and estimated, but phonemic IPA was available, 'partial-ai'
                        // - If IPA is present and estimated, and no phonemic IPA, 'full-ai'
                        // - If no IPA, fallback to 'full-ai'
                        const hasPhonemic = !!entry.phonemic_ipa;
                        const aiIpa = entry.node && entry.node.ai_estimated_ipa;
                        const isAIPhonetic = !!aiIpa && entry.ipa === aiIpa;
                        const hasPhonetic = !!entry.ipa && (!isAIPhonetic);
                        if (isAIPhonetic && hasPhonemic) {
                            dataQuality = 'partial-ai';
                        } else if (isAIPhonetic && !hasPhonemic) {
                            dataQuality = 'full-ai';
                        } else if (hasPhonetic) {
                            dataQuality = 'complete';
                        } else if (!entry.ipa) {
                            dataQuality = 'full-ai';
                        }
                        // Use full language name if available, otherwise use matching etymology_template expansion from root node, then lang_code
                        let lang = entry.node && entry.node.lang;
                        if (!lang && result.ancestry_chain.length > 0) {
                            const rootNode = result.ancestry_chain[0].node;
                            if (rootNode && Array.isArray(rootNode.etymology_templates)) {
                                // Find the template where args[2] matches entry.lang_code
                                const match = rootNode.etymology_templates.find(
                                    (tpl: any) => tpl.args && tpl.args["2"] === entry.lang_code && tpl.expansion
                                );
                                if (match) {
                                    // Remove the word from the expansion string
                                    const wordToRemove = entry.word;
                                    // Remove word at end, with or without parentheses, and trim
                                    lang = match.expansion.replace(new RegExp(`\\s*${wordToRemove}(\\s*\(.*\))?$`), '').trim();
                                }
                            }
                        }
                        if (!lang && rootExpansion) {
                            lang = rootExpansion;
                        } else if (!lang) {
                            lang = entry.lang_code;
                        }
                        console.debug(`Processing entry: ${entry.word} (${lang}) - IPA: ${entry.ipa}, Phonemic: ${hasPhonemic}, AI Estimated: ${isAIPhonetic}, Data Quality: ${dataQuality}`);
                        return {
                            lang,
                            drift: entry.drift ?? 0,
                            tooltip: `${entry.word} [${entry.ipa || 'N/A'}]\n${lang}`,
                            word: entry.word,
                            lang_code: entry.lang_code,
                            pronunciation: entry.ipa || '',
                            dataQuality
                        };
                    });
                    setData(timeline);
                } else {
                    setData([]);
                }
            } catch (err) {
                if (err instanceof Error) setError(err.message);
                else setError('Unknown error');
                setData([]);
            } finally {
                setLoading(false);
            }
        }
        if (word && language) fetchTimelineFromAncestryChain();
    }, [word, language]);

    return { data, loading, error };
}
