import { Map, AdvancedMarker } from "@vis.gl/react-google-maps";
import GoogleMapsProvider, { useGoogleMapsConfig } from "./GoogleMapsProvider";

const CoralPin = () => (
  <div className="flex flex-col items-center">
    <div
      className="w-8 h-8 rounded-full border-2 border-white shadow-lg flex items-center justify-center"
      style={{ backgroundColor: "#E8735A" }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
      </svg>
    </div>
  </div>
);

interface SitterLocationMapProps {
  latitude: number;
  longitude: number;
  name: string;
}

const MapContent = ({ latitude, longitude, name }: SitterLocationMapProps) => {
  const { nomadMapId } = useGoogleMapsConfig();

  return (
    <div className="w-full h-[250px] rounded-lg overflow-hidden border border-border">
      <Map
        defaultCenter={{ lat: latitude, lng: longitude }}
        defaultZoom={13}
        gestureHandling="cooperative"
        disableDefaultUI
        zoomControl
        mapId={nomadMapId || "nomad-map"}
        className="w-full h-full"
      >
        <AdvancedMarker position={{ lat: latitude, lng: longitude }} title={name}>
          <CoralPin />
        </AdvancedMarker>
      </Map>
    </div>
  );
};

const SitterLocationMap = ({ latitude, longitude, name }: SitterLocationMapProps) => {
  if (!latitude || !longitude) {
    return null;
  }

  return (
    <GoogleMapsProvider height="250px">
      <MapContent latitude={latitude} longitude={longitude} name={name} />
    </GoogleMapsProvider>
  );
};

export default SitterLocationMap;
