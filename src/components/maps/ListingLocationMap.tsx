import { useEffect } from "react";
import { Map, useMap } from "@vis.gl/react-google-maps";
import GoogleMapsProvider, { useGoogleMapsConfig } from "./GoogleMapsProvider";

/**
 * The listing's coordinates here are already approximate (a stored random
 * point within ~500 m of the home). A soft circle a little larger than that
 * shows the area without ever pointing at the house.
 */
const AREA_RADIUS_M = 600;

interface ListingLocationMapProps {
  latitude: number;
  longitude: number;
  title: string;
}

const AreaCircle = ({ latitude, longitude }: { latitude: number; longitude: number }) => {
  const map = useMap();
  useEffect(() => {
    const gm = (window as unknown as { google?: typeof google }).google?.maps;
    if (!map || !gm) return;
    const circle = new gm.Circle({
      map,
      center: { lat: latitude, lng: longitude },
      radius: AREA_RADIUS_M,
      strokeColor: "#0f766e",
      strokeOpacity: 0.35,
      strokeWeight: 1,
      fillColor: "#14b8a6",
      fillOpacity: 0.18,
      clickable: false,
    });
    return () => circle.setMap(null);
  }, [map, latitude, longitude]);
  return null;
};

const MapContent = ({ latitude, longitude }: ListingLocationMapProps) => {
  const { listingMapId } = useGoogleMapsConfig();

  return (
    <div className="w-full aspect-[4/3] min-h-[220px] sm:aspect-auto sm:h-[250px] rounded-2xl overflow-hidden border border-border">
      <Map
        defaultCenter={{ lat: latitude, lng: longitude }}
        defaultZoom={14}
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
        <AreaCircle latitude={latitude} longitude={longitude} />
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
      <p className="mt-2 text-sm text-muted-foreground">This shows the area only. The exact address is shared in the Welcome Guide once a sit is confirmed.</p>
    </GoogleMapsProvider>
  );
};

export default ListingLocationMap;
