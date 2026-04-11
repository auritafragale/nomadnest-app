import { APIProvider } from "@vis.gl/react-google-maps";
import { useGoogleMapsKey } from "@/hooks/useGoogleMapsKey";
import { Skeleton } from "@/components/ui/skeleton";

interface GoogleMapsProviderProps {
  children: React.ReactNode;
  height?: string;
}

const GoogleMapsProvider = ({ children, height = "600px" }: GoogleMapsProviderProps) => {
  const { data: apiKey, isLoading, error } = useGoogleMapsKey();

  if (isLoading) {
    return <Skeleton className={`w-full rounded-lg`} style={{ height }} />;
  }

  if (error || !apiKey) {
    return (
      <div className="w-full flex items-center justify-center rounded-lg border border-border bg-muted/30" style={{ height }}>
        <p className="text-muted-foreground text-sm">Map unavailable</p>
      </div>
    );
  }

  return (
    <APIProvider apiKey={apiKey} libraries={["places"]}>
      {children}
    </APIProvider>
  );
};

export default GoogleMapsProvider;
