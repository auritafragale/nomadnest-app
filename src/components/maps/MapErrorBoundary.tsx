import { Component, ReactNode } from "react";

interface MapErrorBoundaryProps {
  children: ReactNode;
  height?: string;
}

interface MapErrorBoundaryState {
  failed: boolean;
}

/**
 * Google Maps can throw at runtime for reasons outside the app's control —
 * a referer-restricted key, a blocked WebGL context, a quota error. Without a
 * boundary those throws unmount the whole page (losing the Apply button, the
 * listing details, everything below the map). This keeps the failure local.
 */
class MapErrorBoundary extends Component<MapErrorBoundaryProps, MapErrorBoundaryState> {
  state: MapErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): MapErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Map failed to render:", error);
  }

  render() {
    if (this.state.failed) {
      return (
        <div
          className="w-full flex items-center justify-center rounded-lg border border-border bg-muted/30"
          style={{ height: this.props.height ?? "250px" }}
        >
          <p className="text-muted-foreground text-sm">Map unavailable right now</p>
        </div>
      );
    }
    return <>{this.props.children}</>;
  }
}

export default MapErrorBoundary;
