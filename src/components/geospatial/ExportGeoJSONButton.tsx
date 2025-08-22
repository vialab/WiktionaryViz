import React, { useCallback, useState } from 'react';
import type { TranslationMarker } from './TranslationMarkers';
import type { EtymologyNode } from '@/types/etymology';
import { buildGeoJSON, downloadGeoJSON, ExportOptions } from '@/utils/geojsonExport';

interface ExportGeoJSONButtonProps {
    markers: TranslationMarker[];
    lineage: EtymologyNode | null;
}

const ExportGeoJSONButton: React.FC<ExportGeoJSONButtonProps> = ({ markers, lineage }) => {
    const [open, setOpen] = useState(false);
    const [options, setOptions] = useState<ExportOptions>({ markers: true, lineagePoints: true, lineagePath: true });

    const toggle = () => setOpen(o => !o);

    const onChange = (key: keyof ExportOptions) => (e: React.ChangeEvent<HTMLInputElement>) => {
        setOptions(prev => ({ ...prev, [key]: e.target.checked }));
    };

    const handleExport = useCallback(() => {
        const geojson = buildGeoJSON(markers, lineage, options);
        downloadGeoJSON(geojson);
    }, [markers, lineage, options]);

    return (
        <div className="fixed bottom-2 left-2 z-[10000]" style={{ pointerEvents: 'auto' }}>
            {open ? (
                <div className="p-3 bg-gray-800/95 rounded border border-gray-700 space-y-2 w-64 shadow-lg">
                    <div className="flex items-center justify-between">
                        <span className="font-semibold text-indigo-300 text-sm">Export GeoJSON</span>
                        <button
                            onClick={toggle}
                            className="text-gray-400 hover:text-gray-200 text-xs"
                            aria-label="Close export panel"
                        >✕</button>
                    </div>
                    <fieldset className="space-y-1">
                        <legend className="sr-only">Include layers</legend>
                        <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={options.markers !== false} onChange={onChange('markers')} />
                            <span>Translation Markers</span>
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={options.lineagePoints !== false} onChange={onChange('lineagePoints')} />
                            <span>Lineage Points</span>
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={options.lineagePath !== false} onChange={onChange('lineagePath')} />
                            <span>Lineage Path</span>
                        </label>
                    </fieldset>
                    <div className="pt-1 flex justify-end">
                        <button
                            onClick={handleExport}
                            className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm font-medium"
                        >
                            Download
                        </button>
                    </div>
                </div>
            ) : (
                <button
                    onClick={toggle}
                    className="bg-slate-700/90 hover:bg-slate-600 text-white font-medium px-4 py-2 rounded shadow text-sm backdrop-blur border border-slate-500/40"
                >
                    Export GeoJSON
                </button>
            )}
        </div>
    );
};

export default ExportGeoJSONButton;
