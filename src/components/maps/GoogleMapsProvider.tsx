import { APIProvider } from "@vis.gl/react-google-maps";
import { useGoogleMapsKey } from "@/hooks/useGoogleMapsKey";
import { Skeleton } from "@/components/ui/skeleton";
import { createContext, useContext } from "react";
import MapErrorBoundary from "./MapErrorBoundary";

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

  if (isLoading) {
    return <Skeleton className={`w-full rounded-lg`} style={{ height }} />;
  }

  if (error || !config) {
    return (
      <div className="w-full flex items-center justify-center rounded-lg border border-border bg-muted/30" style={{ height }}>
        <p className="text-muted-foreground text-sm">Map unavailable</p>
      </div>
    );
  }

  return (
    <MapErrorBoundary height={height}>
      <APIProvider apiKey={config.key} libraries={["places"]}>
        <GoogleMapsContext.Provider value={{ listingMapId: config.listingMapId, nomadMapId: config.nomadMapId }}>
          {children}
        </GoogleMapsContext.Provider>
      </APIProvider>
    </MapErrorBoundary>
  );
};

export default GoogleMapsProvider;
