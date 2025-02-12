import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import useTeaData from '../hooks/useTeaData';
import useLanguoidData from '../hooks/useLanguoidData';
import { processTranslationsByCountry } from '../utils/mapUtils';
import 'leaflet-defaulticon-compatibility';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

// Set up the default icon for markers
const DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
});
L.Marker.prototype.options.icon = DefaultIcon;

const MapSection: React.FC = () => {
    const teaData = useTeaData();
    const languoidData = useLanguoidData();
    const [markers, setMarkers] = useState<{ position: [number, number]; popupText: string }[]>([]);

    useEffect(() => {
        if (teaData && languoidData.length > 0) {
            processTranslationsByCountry(teaData.translations, languoidData, setMarkers);
        }
    }, [teaData, languoidData]);

    return (
        <section id="map-container" className="section visible">
            <MapContainer center={[0, 0]} zoom={2} scrollWheelZoom={false} style={{ height: "100vh", width: "100%" }}>
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {markers.map((marker, index) => (
                    <Marker key={index} position={marker.position}>
                        <Popup>
                            <div dangerouslySetInnerHTML={{ __html: marker.popupText }} />
                        </Popup>
                    </Marker>
                ))}
            </MapContainer>
        </section>
    );
};

export default MapSection;
