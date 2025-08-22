import { useEffect, useState } from 'react';
import {
    MapContainer,
    TileLayer,
    LayersControl,
    LayerGroup
} from 'react-leaflet';
import useWordData from '@/hooks/useWordData';
import useLanguoidData from '@/hooks/useLanguoidData';
import { processTranslations, processEtymologyLineage } from '@/utils/mapUtils';
import 'leaflet-defaulticon-compatibility';
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import MarkerClusterGroup from "react-leaflet-markercluster";
import "react-leaflet-markercluster/styles";
import TranslationMarkers, { TranslationMarker } from './geospatial/TranslationMarkers';
import CountriesLayer from './geospatial/CountriesLayer';
import EtymologyLineagePath from './geospatial/EtymologyLineagePath';
import ExportGeoJSONButton from './geospatial/ExportGeoJSONButton';
import type { EtymologyNode } from '@/types/etymology';
import type { Translation } from '@/utils/mapUtils';

L.Marker.prototype.options.icon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
});

// Define the expected structure for wordData
interface WordData {
    translations?: Translation[];
    etymology_templates?: { name: string; args: { [key: string]: string }; expansion: string }[];
    word: string;
    lang_code: string;
}

interface GeospatialPageProps {
    word: string;
    language: string;
}

/**
 * GeospatialPage visualizes translations and etymology lineage on a map.
 * Uses modular components for maintainability and performance.
 */
const GeospatialPage: React.FC<GeospatialPageProps> = ({ word, language }) => {
    const wordData = useWordData(word, language) as WordData | null;
    const languoidData = useLanguoidData();
    const [markers, setMarkers] = useState<TranslationMarker[]>([]);
    const [lineage, setLineage] = useState<EtymologyNode | null>(null);

    useEffect(() => {
        if (Array.isArray(wordData?.translations) && languoidData.length) {
            processTranslations(wordData.translations, languoidData, setMarkers);
        }
        if (Array.isArray(wordData?.etymology_templates) && languoidData.length) {
            processEtymologyLineage(
                wordData.etymology_templates,
                languoidData,
                wordData.word,
                wordData.lang_code
            ).then(setLineage);
        }
    }, [wordData, languoidData]);

    return (
        <section id="geospatial" className="w-full h-screen bg-gray-900 text-white">
            <MapContainer
                center={[0, 0]}
                zoom={2}
                minZoom={2}
                scrollWheelZoom={false}
                className="relative w-full h-full"
                style={{ background: '#0b0f1a' }}
            >
                {/* Export current map data as GeoJSON */}
                <ExportGeoJSONButton markers={markers} lineage={lineage} />
                <LayersControl position="topright">
                    {/* Base Layers */}
                    <LayersControl.BaseLayer checked name="Dark (CartoDB)">
                        <TileLayer
                            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                            subdomains={['a', 'b', 'c', 'd']}
                            maxZoom={20}
                        />
                    </LayersControl.BaseLayer>
                    <LayersControl.BaseLayer name="Light (OSM)">
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                    </LayersControl.BaseLayer>
                    {/* GeoJSON export button added; future: standardized dynamic layer ingestion. */}
                    {/* TODO [LOW LEVEL]: Add a file/URL loader for GeoJSON and render via GeoJSON component with style options. */}
                    {/* Countries hover highlight layer */}
                    <LayersControl.Overlay checked name="Countries (hover)">
                        <LayerGroup>
                            <CountriesLayer />
                        </LayerGroup>
                    </LayersControl.Overlay>
                    {/* General Etymology Markers Layer */}
                    <LayersControl.Overlay checked name="Etymology Markers">
                        <MarkerClusterGroup>
                            <TranslationMarkers markers={markers} />
                        </MarkerClusterGroup>
                    </LayersControl.Overlay>
                    {/* Etymology Lineage Path Layer */}
                    <LayersControl.Overlay name="Etymology Lineage Path">
                        <LayerGroup>
                            <EtymologyLineagePath lineage={lineage} />
                        </LayerGroup>
                    </LayersControl.Overlay>
                    {/* TODO [HIGH LEVEL]: Trade-route path types (land/sea) with arrows and timestamps to show diffusion. */}
                    {/* TODO [LOW LEVEL]: Extend lineage nodes with route metadata and render dashed patterns and directional arrows. */}
                    {/* TODO [HIGH LEVEL]: Filters (time slider, region, language family) to declutter map; uncertainty styling. */}
                    {/* TODO [LOW LEVEL]: Add a control panel to filter markers by decade/region and desaturate uncertain items. */}
                </LayersControl>
            </MapContainer>
        </section>
    );
};

export default GeospatialPage;
