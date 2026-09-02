import { useEffect, useState } from "react";
import { useCityChatRooms, type CityChatRoom } from "@/hooks/useCityChatRooms";
import { useGoogleMapsKey } from "@/hooks/useGoogleMapsKey";
import { geocodeCityCountry } from "@/lib/geocode";

export interface NearbyRoom extends CityChatRoom {
  distanceKm: number;
}

type Status = "idle" | "prompting" | "granted" | "denied" | "unsupported";

const CACHE_KEY = "nn_city_chat_coords_v1";
const MAX_ROOMS_TO_GEOCODE = 25;

const readCache = (): Record<string, { lat: number; lng: number }> => {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
  } catch {
    return {};
  }
};

const writeCache = (cache: Record<string, { lat: number; lng: number }>) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
};

const haversineKm = (
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number => {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const lat1 = (aLat * Math.PI) / 180;
  const lat2 = (bLat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/**
 * Finds the city chat rooms closest to the member's device location.
 * Falls back gracefully when permission is denied or unavailable.
 */
export const useNearbyCityChats = () => {
  const { rooms, loading: roomsLoading } = useCityChatRooms();
  const { data: mapsConfig } = useGoogleMapsKey();
  const [status, setStatus] = useState<Status>("idle");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [nearby, setNearby] = useState<NearbyRoom[]>([]);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (!("geolocation" in navigator)) setStatus("unsupported");
  }, []);

  const requestLocation = () => {
    if (!("geolocation" in navigator)) {
      setStatus("unsupported");
      return;
    }
    setStatus("prompting");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setStatus("granted");
      },
      () => setStatus("denied"),
      { timeout: 10000, maximumAge: 300000 },
    );
  };

  useEffect(() => {
    if (!coords || roomsLoading || rooms.length === 0) return;
    let mounted = true;

    const resolve = async () => {
      setResolving(true);
      const cache = readCache();
      const withCoords: NearbyRoom[] = [];

      for (const room of rooms.slice(0, MAX_ROOMS_TO_GEOCODE)) {
        let point =
          room.latitude != null && room.longitude != null
            ? { lat: Number(room.latitude), lng: Number(room.longitude) }
            : cache[room.city_key];

        if (!point && mapsConfig?.key) {
          const geo = await geocodeCityCountry(mapsConfig.key, room.city, room.country);
          if (geo) {
            point = { lat: geo.latitude, lng: geo.longitude };
            cache[room.city_key] = point;
          }
        }
        if (point) {
          withCoords.push({
            ...room,
            distanceKm: haversineKm(coords.lat, coords.lng, point.lat, point.lng),
          });
        }
      }

      writeCache(cache);
      if (mounted) {
        setNearby(withCoords.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 6));
        setResolving(false);
      }
    };

    resolve();
    return () => {
      mounted = false;
    };
  }, [coords, rooms, roomsLoading, mapsConfig?.key]);

  return {
    status,
    nearby,
    loading: roomsLoading || resolving,
    requestLocation,
  };
};
