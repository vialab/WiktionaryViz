import { useEffect, useState } from 'react';
import {
    MapContainer,
    TileLayer,
    Marker,
    Popup,
    LayersControl,
    Polyline,
    LayerGroup,
    CircleMarker
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

L.Marker.prototype.options.icon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
});

interface GeospatialPageProps {
    word: string;
    language: string;
}

// Helper: Normalize positions to [lat, lng] arrays
const normalizePosition = (
    pos: [number, number] | { lat: number; lng: number } | null | undefined
): [number, number] => {
    if (!pos) {
        console.warn('Missing position:', pos);
        return [0, 0]; // Fallback
    }
    if (Array.isArray(pos)) {
        return pos;
    }
    if (typeof pos === 'object' && 'lat' in pos && 'lng' in pos) {
        return [pos.lat, pos.lng];
    }

    console.error('Invalid position format:', pos);
    return [0, 0];
};

// Creates the arrow icon with rotation
const createArrowIcon = (angle: number) => {
    return L.divIcon({
        className: 'arrow-icon',
        html: `<div style="
            transform: rotate(${angle}deg);
            width: 0;
            height: 0;
            border-left: 5px solid transparent;
            border-right: 5px solid transparent;
            border-bottom: 10px solid #2158A5FF; 
        "></div>`,
        iconSize: [10, 10],
        iconAnchor: [5, 5],
    });
};

// Bearing calculation for correct arrow rotation
const calculateBearing = (start: [number, number], end: [number, number]): number => {
    const [lat1, lon1] = start.map(deg => deg * Math.PI / 180);
    const [lat2, lon2] = end.map(deg => deg * Math.PI / 180);

    const deltaLon = lon2 - lon1;
    const x = Math.sin(deltaLon) * Math.cos(lat2);
    const y = Math.cos(lat1) * Math.sin(lat2) -
              Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);

    const bearingRad = Math.atan2(x, y);
    const bearingDeg = (bearingRad * 180 / Math.PI + 360) % 360;

    return bearingDeg;
};

// Calculate the midpoint in Mercator projection
const calculateMercatorMidpoint = (coord1: [number, number], coord2: [number, number]): [number, number] => {
    const [lat1, lng1] = coord1;
    const [lat2, lng2] = coord2;

    const srcLatRad = lat1 * (Math.PI / 180);
    const dstLatRad = lat2 * (Math.PI / 180);

    const middleLatRad = Math.atan(Math.sinh(Math.log(Math.sqrt(
        (Math.tan(dstLatRad) + 1 / Math.cos(dstLatRad)) *
        (Math.tan(srcLatRad) + 1 / Math.cos(srcLatRad))
    ))));

    const middleLat = middleLatRad * (180 / Math.PI);
    const middleLng = (lng1 + lng2) / 2;

    return [middleLat, middleLng];
};

const GeospatialPage: React.FC<GeospatialPageProps> = ({ word, language }) => {
    const wordData = useWordData(word, language);
    const languoidData = useLanguoidData();
    const [markers, setMarkers] = useState<{ position: [number, number]; popupText: string }[]>([]);
    const [lineage, setLineage] = useState<EtymologyNode | null>(null);

    useEffect(() => {
        if (wordData?.translations && languoidData.length) {
            processTranslations(wordData.translations, languoidData, setMarkers);
        }
        if (wordData?.etymology_templates && languoidData.length) {
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
                        <MarkerClusterGroup >
                            {markers.map((marker, index) => {
                                return (
                                <Marker
                                    key={index}
                                    position={marker.position}
                                    interactive={true}
                                    eventHandlers={{
                                        click: (e) => {
                                            console.log("Marker clicked:", e);
                                                e.target.openPopup(); // Explicitly open the popup on click
                                        },
                                    }}
                                >
                                    <Popup>
                                        <div dangerouslySetInnerHTML={{ __html: marker.popupText }} />
                                    </Popup>
                                </Marker>
                                );
                            })}
                        </MarkerClusterGroup>
                    </LayersControl.Overlay>

                    {/* Etymology Lineage Path Layer */}
                    <LayersControl.Overlay name="Etymology Lineage Path">
                        <LayerGroup>
                            {lineage && renderLineage(lineage)}
                        </LayerGroup>
                    </LayersControl.Overlay>
                </LayersControl>
            </MapContainer>
        </section>
    );
};

// Helper function to render the linked list lineage
const renderLineage = (node: EtymologyNode | null) => {
    const elements: JSX.Element[] = [];
    let currentNode = node;

    while (currentNode && currentNode.next) {
        const { word, lang_code, romanization, position, expansion } = currentNode;
        const nextNode = currentNode.next;

        const start = normalizePosition(position);
        const end = normalizePosition(nextNode.position);

        // Add CircleMarker for current node
        if (start) {
            elements.push(
                <CircleMarker
                    key={`circle-${word}-${lang_code}`}
                    center={start}
                    radius={8}
                    fillColor="#3388ff"
                    color="#3388ff"
                    weight={1}
                    opacity={1}
                    fillOpacity={0.7}
                >
                    <Popup>
                        <div>
                            {expansion}
                            {romanization && ` - ${romanization}`}
                        </div>
                    </Popup>
                </CircleMarker>
            );
        }

        // Add Polyline + Arrow Marker
        if (start && end) {
            elements.push(
                <Polyline
                    key={`polyline-${word}-${nextNode.word}`}
                    positions={[start, end]}
                />
            );

            const midpoint = calculateMercatorMidpoint(start, end);
            const angle = calculateBearing(start, end);

            elements.push(
                <Marker
                    key={`arrow-${word}-${nextNode.word}`}
                    position={midpoint}
                    icon={createArrowIcon(angle)}
                    interactive={false}
                />
            );
        }

        currentNode = nextNode;
    }

    // Add CircleMarker for last node (tail of the lineage)
    if (currentNode && currentNode.position) {
        const { word, lang_code, romanization, position, expansion } = currentNode;
        const last = normalizePosition(position);

        elements.push(
            <CircleMarker
                key={`circle-${word}-${lang_code}`}
                center={last}
                radius={8}
                fillColor="#3388ff"
                color="#3388ff"
                weight={1}
                opacity={1}
                fillOpacity={0.7}
            >
                <Popup>
                    <div>
                        {word}
                        {romanization && ` - ${romanization}`}
                    </div>
                </Popup>
            </CircleMarker>
        );
    }

    return elements;
};

export default GeospatialPage;
