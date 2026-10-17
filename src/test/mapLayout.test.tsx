// @vitest-environment jsdom
/**
 * Map search (Android Chrome): the on-screen keyboard shrinks the page
 * (viewport interactive-widget=resizes-content). The map page must not
 * switch layout or rebuild the search while it has focus, or the keyboard
 * closes at once.
 */
import { act, cleanup, fireEvent, render, screen as rtl } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MapScreen } from "@/components/maps/MapScreen";
import { isSidewaysPhone, pickLayout } from "@/hooks/useMapLayout";

type Listener = () => void;
const orientation = { type: "portrait-primary", listeners: [] as Listener[] };

/** The phone's screen (as the device reports it) and the page width, which follows the rotation. */
const setScreen = (w: number, h: number, type: string, pageWidth = type.startsWith("landscape") ? Math.max(w, h) : Math.min(w, h)) => {
  Object.defineProperty(window.screen, "width", { value: w, configurable: true });
  Object.defineProperty(window.screen, "height", { value: h, configurable: true });
  Object.defineProperty(window, "innerWidth", { value: pageWidth, configurable: true });
  orientation.type = type;
};

beforeEach(() => {
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  Object.defineProperty(window.screen, "orientation", {
    configurable: true,
    value: {
      get type() {
        return orientation.type;
      },
      addEventListener: (_: string, l: Listener) => orientation.listeners.push(l),
      removeEventListener: (_: string, l: Listener) => (orientation.listeners = orientation.listeners.filter((x) => x !== l)),
    },
  });
  setScreen(390, 844, "portrait-primary");
});
afterEach(() => {
  cleanup();
  orientation.listeners = [];
});

const turn = (w: number, h: number, type: string) =>
  act(() => {
    setScreen(w, h, type);
    orientation.listeners.forEach((l) => l());
  });

const renderScreen = () =>
  render(
    <MapScreen
      user={null}
      items={[{ id: "a" }, { id: "b" }]}
      getId={(i) => i.id}
      isLoading={false}
      message={null}
      countLabel="2 sits in this area"
      loadingLabel="…"
      note="note"
      title="Browse Sits"
      subtitle="sub"
      srTitle="Browse Sits, map"
      search={() => <input aria-label="Where do you want to go?" />}
      filters={() => <button type="button">Filters</button>}
      onShowList={() => {}}
      renderMap={() => <div data-testid="map" />}
      renderCard={(i) => <article>{i.id}</article>}
      cardWidth="w-[300px]"
    />,
  );

const carousel = () => document.querySelector('[role="list"][aria-label="2 sits in this area"]');
const sidePanel = () => document.querySelector('section[aria-label="2 sits in this area"]');

describe("map search keeps the keyboard open", () => {
  it("sideways is the device turned, never the page height", () => {
    setScreen(390, 844, "portrait-primary");
    expect(isSidewaysPhone()).toBe(false);
    setScreen(844, 390, "landscape-primary");
    expect(isSidewaysPhone()).toBe(true);
    setScreen(1366, 1024, "landscape-primary"); // a tablet: not a phone
    expect(isSidewaysPhone()).toBe(false);
    setScreen(390, 844, "landscape-primary", 844); // an iPhone turned: same screen numbers, wider page
    expect(isSidewaysPhone()).toBe(true);
    setScreen(390, 844, "landscape-primary", 390); // a desktop browser emulating a phone: page not wider
    expect(isSidewaysPhone()).toBe(false);
    expect(pickLayout(false, true)).toBe("landscape");
    expect(pickLayout(true, true)).toBe("desktop");
  });

  it("the page shrinking under the keyboard changes nothing, and the search stays focused", () => {
    renderScreen();
    const input = rtl.getByLabelText("Where do you want to go?");
    act(() => input.focus());
    fireEvent.focus(input);
    expect(carousel()).not.toBeNull();

    // The keyboard opens: the page gets short and wide.
    act(() => {
      Object.defineProperty(window, "innerHeight", { value: 350, configurable: true });
      window.dispatchEvent(new Event("resize"));
    });
    expect(rtl.getByLabelText("Where do you want to go?")).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(carousel()).not.toBeNull();
    expect(sidePanel()).toBeNull();
  });

  it("even turning the phone waits until the search loses focus", () => {
    renderScreen();
    const input = rtl.getByLabelText("Where do you want to go?");
    act(() => input.focus());
    fireEvent.focus(input);

    turn(844, 390, "landscape-primary");
    expect(rtl.getByLabelText("Where do you want to go?")).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(sidePanel()).toBeNull();

    act(() => input.blur());
    fireEvent.blur(input);
    expect(sidePanel()).not.toBeNull();
    // Still the same search element after the switch.
    expect(rtl.getByLabelText("Where do you want to go?")).toBe(input);
  });
});
