import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { motion, AnimatePresence } from 'framer-motion';
import useLanguoidData from '@/hooks/useLanguoidData';
import useWordData from '@/hooks/useWordData';
import { processEtymologyLineage, fetchIPAForWord } from '@/utils/mapUtils';

interface NodeData {
    language: string;
    drift: number;
    tooltip: string;
}


interface TimelinePageProps {
    word: string;
    language: string;
}

const TimelinePage: React.FC<TimelinePageProps> = ({ word, language }) => {
    const svgRef = useRef<SVGSVGElement | null>(null);
    const languoidData = useLanguoidData();
    const wordData = useWordData(word, language);
    const [data, setData] = useState<NodeData[]>([]);
    const [loading, setLoading] = useState(true);
    const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null);

    useEffect(() => {
        async function fetchTimeline() {
            setLoading(true);
            if (!wordData) {
                setData([]);
                setLoading(false);
                return;
            }
            // Build etymology chain from etymology_templates, starting from the current word
            const chain = [];
            // Start with the current word
            chain.push({
                word: wordData.word,
                lang: wordData.lang,
                lang_code: wordData.lang_code
            });
            // Walk through etymology_templates in order (bor/der)
            const templates = (wordData.etymology_templates as any[]) || [];
            for (const entry of templates) {
                if (entry.name === 'bor' || entry.name === 'der') {
                    const lang_code = entry.args['2'];
                    const word = entry.args['3'] || entry.expansion;
                    if (lang_code && word) {
                        // We'll fetch /word-data for this step
                        chain.push({ word, lang: null, lang_code });
                    }
                }
            }
            // For each node, fetch /word-data to get lang, lang_code, and IPA
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
            // For each pair, call phonology API
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

    // Remove the d3 SVG rendering useEffect, and instead use d3 for layout only
    // We'll use React/JSX for rendering and framer-motion for animation

    // Layout calculations
    const width = 1000;
    const height = 200;
    const margin = 50;
    const maxDrift = d3.max(data, d => d.drift) || 1;
    const sizeScale = d3.scaleLinear().domain([0, maxDrift]).range([300, 2000]);
    const xScale = d3.scalePoint<string>()
        .domain(data.map(d => d.language))
        .range([0, width - margin * 2])
        .padding(0.5);

    return (
        <div className="p-4 relative">
            <h1 className="text-xl font-bold mb-4">Phonetic Drift Timeline</h1>
            {loading ? (
                <div>Loading timeline...</div>
            ) : (
                <svg ref={svgRef} width={width} height={height}>
                    <g transform={`translate(${margin},${height / 2})`}>
                        {/* Lines */}
                        <AnimatePresence>
                            {data.slice(1).map((d, i) => (
                                <motion.line
                                    key={`line-${i}`}
                                    initial={{
                                        x1: xScale(data[i].language),
                                        x2: xScale(data[i].language),
                                        opacity: 0
                                    }}
                                    animate={{
                                        x1: xScale(data[i].language),
                                        x2: xScale(data[i + 1].language),
                                        opacity: 1
                                    }}
                                    exit={{ opacity: 0 }}
                                    y1={0}
                                    y2={0}
                                    stroke="gray"
                                    strokeWidth={2}
                                    transition={{ duration: 0.7, delay: i * 0.1 }}
                                />
                            ))}
                        </AnimatePresence>
                        {/* Circles (nodes) */}
                        <AnimatePresence>
                            {data.map((d, i) => (
                                <motion.circle
                                    key={`circle-${i}`}
                                    initial={{
                                        cx: xScale(d.language),
                                        cy: 0,
                                        r: 0,
                                        opacity: 0
                                    }}
                                    animate={{
                                        cx: xScale(d.language),
                                        cy: 0,
                                        r: Math.sqrt(sizeScale(d.drift) / Math.PI),
                                        opacity: 1
                                    }}
                                    exit={{ opacity: 0, r: 0 }}
                                    fill="tomato"
                                    stroke="black"
                                    onMouseOver={e => {
                                        setTooltip({
                                            x: e.clientX,
                                            y: e.clientY,
                                            content: d.tooltip
                                        });
                                    }}
                                    onMouseMove={e => {
                                        setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null);
                                    }}
                                    onMouseOut={() => setTooltip(null)}
                                    transition={{ duration: 0.7, delay: i * 0.1 }}
                                />
                            ))}
                        </AnimatePresence>
                        {/* Labels */}
                        <AnimatePresence>
                            {data.map((d, i) => (
                                <motion.text
                                    key={`label-${i}`}
                                    x={xScale(d.language)}
                                    y={50}
                                    textAnchor="middle"
                                    className="text-sm fill-white"
                                    initial={{ opacity: 0, y: 70 }}
                                    animate={{ opacity: 1, y: 50 }}
                                    exit={{ opacity: 0, y: 70 }}
                                    transition={{ duration: 0.7, delay: i * 0.1 }}
                                >
                                    {d.language}
                                </motion.text>
                            ))}
                        </AnimatePresence>
                    </g>
                </svg>
            )}
            {/* Tooltip */}
            <AnimatePresence>
                {tooltip && (
                    <motion.div
                        className="tooltip bg-black text-white p-2 rounded text-xs max-w-sm"
                        style={{
                            position: 'fixed',
                            top: tooltip.y + 10,
                            left: tooltip.x + 10,
                            zIndex: 10,
                            maxWidth: '300px',
                            wordWrap: 'break-word',
                            whiteSpace: 'pre-wrap',
                            pointerEvents: 'none',
                        }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        <div>{tooltip.content}</div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default TimelinePage;
