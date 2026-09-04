import { Map, AdvancedMarker } from "@vis.gl/react-google-maps";
import GoogleMapsProvider, { useGoogleMapsConfig } from "./GoogleMapsProvider";
import { MapPin } from "lucide-react";

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

interface ListingLocationMapProps {
  latitude: number;
  longitude: number;
  title: string;
}

const MapContent = ({ latitude, longitude, title }: ListingLocationMapProps) => {
  const { listingMapId } = useGoogleMapsConfig();

  return (
    <div className="w-full h-[45vh] sm:h-[250px] rounded-lg overflow-hidden border border-border">
      <Map
        defaultCenter={{ lat: latitude, lng: longitude }}
        defaultZoom={13}
        gestureHandling="cooperative"
        rotateControl={false}
        tilt={0}
        disableDefaultUI
        streetViewControl={false}
        zoomControl={false}
        mapTypeControl={false}
        mapId={listingMapId || "listing-map"}
        className="w-full h-full"
      >
        <AdvancedMarker position={{ lat: latitude, lng: longitude }} title={title}>
          <CoralPin />
        </AdvancedMarker>
      </Map>
    </div>
  );
};

const ListingLocationMap = ({ latitude, longitude, title }: ListingLocationMapProps) => {
  if (!latitude || !longitude) {
    return null;
  }

  return (
    <GoogleMapsProvider height="250px">
      <MapContent latitude={latitude} longitude={longitude} title={title} />
    </GoogleMapsProvider>
  );
};

export default ListingLocationMap;
