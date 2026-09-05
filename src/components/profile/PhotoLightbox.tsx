import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import { cn } from "@/lib/utils";

interface PhotoLightboxProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photos: string[];
  /** Photo to open on. */
  startIndex?: number;
  alt: string;
  /** Keeps the page's small gallery in sync while browsing full size. */
  onIndexChange?: (index: number) => void;
}

/** Full-size, browsable photo viewer: arrows, keyboard, swipe and thumbnails. */
export const PhotoLightbox = ({
  open,
  onOpenChange,
  photos,
  startIndex = 0,
  alt,
  onIndexChange,
}: PhotoLightboxProps) => {
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(startIndex);

  useEffect(() => {
    if (!api) return;
    const onSelect = () => {
      const i = api.selectedScrollSnap();
      setCurrent(i);
      onIndexChange?.(i);
    };
    api.on("select", onSelect);
    onSelect();
    return () => {
      api.off("select", onSelect);
    };
  }, [api, onIndexChange]);

  // Jump to the tapped photo whenever the viewer is (re)opened.
  useEffect(() => {
    if (open && api) {
      api.scrollTo(startIndex, true);
      setCurrent(startIndex);
    }
  }, [open, api, startIndex]);

  useEffect(() => {
    if (!open || !api) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") api.scrollPrev();
      if (e.key === "ArrowRight") api.scrollNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, api]);

  if (photos.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-3 sm:p-4">
        <DialogHeader className="sr-only">
          <DialogTitle>{alt}</DialogTitle>
        </DialogHeader>

        <Carousel setApi={setApi} opts={{ loop: photos.length > 1 }} className="w-full">
          <CarouselContent>
            {photos.map((photo, i) => (
              <CarouselItem key={photo + i}>
                <img
                  src={photo}
                  alt={`${alt} — photo ${i + 1}`}
                  className="w-full max-h-[70vh] object-contain rounded-lg select-none"
                  draggable={false}
                />
              </CarouselItem>
            ))}
          </CarouselContent>
          {photos.length > 1 && (
            <>
              <CarouselPrevious className="left-2" />
              <CarouselNext className="right-2" />
            </>
          )}
        </Carousel>

        {photos.length > 1 && (
          <div className="space-y-3">
            <p className="text-center text-xs text-muted-foreground">
              {current + 1}/{photos.length}
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {photos.map((photo, i) => (
                <button
                  key={`thumb-${photo}-${i}`}
                  type="button"
                  aria-label={`View photo ${i + 1}`}
                  onClick={() => api?.scrollTo(i)}
                  className={cn(
                    "shrink-0 w-16 h-11 rounded-md overflow-hidden border-2 transition-colors",
                    i === current ? "border-primary" : "border-transparent opacity-70",
                  )}
                >
                  <img src={photo} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
