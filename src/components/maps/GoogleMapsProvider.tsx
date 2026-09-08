import { APIProvider } from "@vis.gl/react-google-maps";
import { useGoogleMapsKey } from "@/hooks/useGoogleMapsKey";
import { Skeleton } from "@/components/ui/skeleton";
import { createContext, useContext, useEffect, useState } from "react";
import MapErrorBoundary from "./MapErrorBoundary";
import { loadGooglePlaces } from "@/lib/loadGooglePlaces";

interface GoogleMapsContextValue {
  listingMapId: string;
  nomadMapId: string;
}

const GoogleMapsContext = createContext<GoogleMapsContextValue>({ listingMapId: "", nomadMapId: "" });

export const useGoogleMapsConfig = () => useContext(GoogleMapsContext);

interface GoogleMapsProviderProps {
  children: React.ReactNode;
  height?: string;
}

const GoogleMapsProvider = ({ children, height = "600px" }: GoogleMapsProviderProps) => {
  const { data: config, isLoading, error } = useGoogleMapsKey();
  // Pages can render a map alongside location search inputs, which use the
  // shared loader. Waiting for that single script keeps only ONE Maps script on
  // the page: by the time APIProvider mounts, google.maps.importLibrary already
  // exists and the library reuses it instead of injecting its own.
  const [scriptReady, setScriptReady] = useState(false);
  const [scriptFailed, setScriptFailed] = useState(false);

  useEffect(() => {
    if (!config?.key) return;
    let cancelled = false;
    loadGooglePlaces(config.key)
      .then(() => !cancelled && setScriptReady(true))
      .catch(() => !cancelled && setScriptFailed(true));
    return () => {
      cancelled = true;
    };
  }, [config?.key]);

  if (isLoading || (!scriptReady && !scriptFailed && !error)) {
    return <Skeleton className="w-full rounded-lg" style={{ height }} />;
  }

  if (error || scriptFailed || !config) {
    return (
      <div className="w-full flex items-center justify-center rounded-lg border border-border bg-muted/30" style={{ height }}>
        <p className="text-muted-foreground text-sm">Map unavailable</p>
      </div>
    );
  }

  return (
    <MapErrorBoundary height={height}>
      <APIProvider apiKey={config.key} libraries={["places", "marker"]}>
        <GoogleMapsContext.Provider value={{ listingMapId: config.listingMapId, nomadMapId: config.nomadMapId }}>
          {children}
        </GoogleMapsContext.Provider>
      </APIProvider>
    </MapErrorBoundary>
  );
};

export default GoogleMapsProvider;
