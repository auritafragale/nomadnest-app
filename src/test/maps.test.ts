import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAP_CONTROLS, WORLD_RESTRICTION, worldMinZoom } from "@/components/maps/mapLimits";
import { openDates, petCounts, sitPlace } from "@/lib/sitCard";

describe("no map zooms out past the world", () => {
  it("the world (256px at zoom 0) always fills the map's height", () => {
    expect(worldMinZoom(300)).toBe(2); // never below 2
    expect(worldMinZoom(512)).toBe(2);
    expect(worldMinZoom(513)).toBe(2);
    expect(worldMinZoom(700)).toBe(2);
    expect(worldMinZoom(1025)).toBe(3);
    expect(worldMinZoom(2100)).toBe(4);
    expect(worldMinZoom(0)).toBe(2);
    for (const h of [250, 420, 640, 836, 1200]) expect(256 * 2 ** worldMinZoom(h)).toBeGreaterThanOrEqual(Math.min(h, 1024));
  });

  it("the world can't repeat side by side, and only pinch and drag remain", () => {
    expect(WORLD_RESTRICTION).toEqual({ latLngBounds: { north: 85, south: -85, west: -180, east: 180 }, strictBounds: true });
    expect(MAP_CONTROLS).toMatchObject({ cameraControl: false, fullscreenControl: false, keyboardShortcuts: false, streetViewControl: false, mapTypeControl: false, zoomControl: false, rotateControl: false });
  });

  it("every map uses the limits", () => {
    const read = (name: string) => readFileSync(join(__dirname, "..", "components", "maps", `${name}.tsx`), "utf8");
    // The shared map, and the listing page's small area map, set them directly…
    for (const name of ["WorldMap", "ListingLocationMap"]) {
      const src = read(name);
      expect(src, name).toContain("restriction={WORLD_RESTRICTION}");
      expect(src, name).toContain("minZoom={minZoom}");
      expect(src, name).toContain("{...MAP_CONTROLS}");
    }
    // …and every full-screen map is a WorldMap.
    for (const name of ["ListingGoogleMap", "NearMeMap", "SitterGoogleMap"]) {
      const src = read(name);
      expect(src, name).toContain("<WorldMap");
      expect(src, name).not.toMatch(/<GoogleMap\b|<Map\b/);
    }
  });
});

describe("sit cards", () => {
  const pets = [{ id: "1", name: "A", type: "cat" }, { id: "2", name: "B", type: "Cats" }, { id: "3", name: "C", type: "dog" }];

  it("counts pets per type", () => {
    expect(petCounts(pets)).toEqual([{ type: "cats", count: 2 }, { type: "dogs", count: 1 }]);
  });

  it("shows the first open dates and how many more", () => {
    const sit_dates = [
      { id: "a", start_date: "2099-03-01", end_date: "2099-03-10", status: "open" },
      { id: "b", start_date: "2099-01-01", end_date: "2099-01-10", status: "open" },
      { id: "c", start_date: "2099-02-01", end_date: "2099-02-10", status: "booked" },
      { id: "d", start_date: "2000-01-01", end_date: "2000-01-10", status: "open" },
    ];
    const { first, more } = openDates({ sit_dates });
    expect(first?.id).toBe("b");
    expect(more).toBe(1);
  });

  it("place as on every card", () => {
    expect(sitPlace({ city: "Lisbon", country: "Portugal" })).toBe("Lisbon, Portugal");
    expect(sitPlace({ city: null, country: null })).toBe("Location to be confirmed");
  });
});
