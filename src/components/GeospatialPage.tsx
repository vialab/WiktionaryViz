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
import EtymologyLineagePath, { EtymologyNode } from './geospatial/EtymologyLineagePath';

L.Marker.prototype.options.icon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
});

interface GeospatialPageProps {
    word: string;
    language: string;
}

/**
 * GeospatialPage visualizes translations and etymology lineage on a map.
 * Uses modular components for maintainability and performance.
 */
const GeospatialPage: React.FC<GeospatialPageProps> = ({ word, language }) => {
    const wordData = useWordData(word, language);
    const languoidData = useLanguoidData();
    const [markers, setMarkers] = useState<TranslationMarker[]>([]);
    const [lineage, setLineage] = useState<EtymologyNode | null>(null);

    useEffect(() => {
        if (Array.isArray(wordData?.translations) && languoidData.length) {
            processTranslations(wordData.translations, languoidData, setMarkers);
        }
        if (Array.isArray(wordData?.etymology_templates) && languoidData.length) {
            processEtymologyLineage(wordData.etymology_templates, languoidData, wordData.word, wordData.lang_code)
                .then(setLineage);
        }
    }, [wordData, languoidData]);

    return (
        <section id="geospatial" className="w-full h-screen bg-gray-900 text-white">
            <MapContainer
                center={[0, 0]}
                zoom={2}
                minZoom={2}
                scrollWheelZoom={false}
                className="w-full h-full"
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <LayersControl position="topright">
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
                </LayersControl>
            </MapContainer>
        </section>
    );
};

export default GeospatialPage;
