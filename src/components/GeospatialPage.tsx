import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, LayersControl, Polyline } from 'react-leaflet';
import useTeaData from '@/hooks/useTeaData';
import useLanguoidData from '@/hooks/useLanguoidData';
import { processTranslations, processEtymologyLineage } from '@/utils/mapUtils';
import 'leaflet-defaulticon-compatibility';
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import MarkerClusterGroup from "react-leaflet-markercluster";
import "react-leaflet-markercluster/styles";

// Set default marker icon
L.Marker.prototype.options.icon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
});

interface GeospatialPageProps {
    word1: string;
    word2: string;
}

const GeospatialPage: React.FC<GeospatialPageProps> = ({ word1, word2 }) => {
    const teaData = useTeaData();
    const languoidData = useLanguoidData();
    const [markers, setMarkers] = useState<{ position: [number, number]; popupText: string }[]>([]);
    const [lineage, setLineage] = useState<{ positions: [number, number][], lineageText: string }[]>([]);

    useEffect(() => {
        if (teaData?.translations && languoidData.length) {
            processTranslations(teaData.translations, languoidData, setMarkers, word1, word2);
        }
        if (teaData?.etymology_templates && languoidData.length) {
            processEtymologyLineage(teaData.etymology_templates, languoidData, teaData.word, teaData.lang_code)
                .then(setLineage);
        }
    }, [teaData, languoidData, word1, word2]);

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
                    {/* Direct Ancestry Lineage Layer */}
                    <LayersControl.Overlay name="Etymology Lineage">
                        <>
                            <MarkerClusterGroup>
                                {lineage.map((path, index) => (
                                    <>
                                        <Polyline
                                            key={`polyline-${index}`}
                                            positions={path.positions}
                                            color="blue"
                                            weight={3}
                                            opacity={0.8}
                                        />
                                        {path.positions.map((position, posIndex) => (
                                            <Marker key={`marker-${index}-${posIndex}`} position={position}>
                                                <Popup>
                                                    <div dangerouslySetInnerHTML={{ __html: path.lineageText }} />
                                                </Popup>
                                            </Marker>
                                        ))}
                                    </>
                                ))}
                            </MarkerClusterGroup>
                        </>
                    </LayersControl.Overlay>
                </LayersControl>
            </MapContainer>
        </section>
    );
};

export default GeospatialPage;
