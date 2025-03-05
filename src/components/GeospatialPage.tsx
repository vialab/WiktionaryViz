import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import useTeaData from '@/hooks/useTeaData';
import useLanguoidData from '@/hooks/useLanguoidData';
import { processTranslations } from '@/utils/mapUtils';
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

    useEffect(() => {
        if (teaData?.translations && languoidData.length) {
            processTranslations(teaData.translations, languoidData, setMarkers, word1, word2);
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
                <MarkerClusterGroup>
                    {markers.map((marker, index) => (
                        <Marker key={index} position={marker.position}>
                            <Popup>
                                <div dangerouslySetInnerHTML={{ __html: marker.popupText }} />
                            </Popup>
                        </Marker>
                    ))}
                </MarkerClusterGroup>
            </MapContainer>
        </section>
    );
};

export default GeospatialPage;
