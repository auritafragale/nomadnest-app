import { useCallback, useEffect, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { ChevronLeft, ChevronRight, Pause, Play, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";


const testimonials = [
  {
    quote: "NomadNest changed how I travel. I've house-sat in Portugal, Bali, and Colombia — all while caring for the most adorable animals. It's community, not just a platform.",
    name: "Sophie R.",
    role: "Nomad since 2025",
    avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&h=120&fit=crop&crop=faces",
    rating: 5,
  },
  {
    quote: "I was nervous leaving our two cats for three weeks. Our NomadNest sitter sent daily photos, kept the house immaculate, and our cats absolutely loved her. 10/10.",
    name: "James & Priya T.",
    role: "Pet Parents since 2025",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&h=120&fit=crop&crop=face",
    rating: 5,
  },
  {
    quote: "The founding member perks alone are worth it — the eSIM discount saved me €40 last month. But the real value is the genuine connections you make.",
    name: "Marco L.",
    role: "Founding Nomad since 2025",
    avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120&h=120&fit=crop&crop=face",
    rating: 5,
  },
  {
    quote: "As a full-time Nomad, finding affordable stays was always a struggle. NomadNest gave me a home in every city — and a furry friend to come back to.",
    name: "Lena K.",
    role: "Combined member since 2025",
    avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=120&h=120&fit=crop&crop=face",
    rating: 5,
  },
];

const TestimonialsSection = () => {
  const autoplay = useRef(
    Autoplay({ delay: 5000, stopOnInteraction: false, stopOnMouseEnter: true })
  );
  const [emblaRef, emblaApi] = useEmblaCarousel(
    { loop: true, align: "start" },
    [autoplay.current]
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelectedIndex(emblaApi.selectedScrollSnap());
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi]);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  const toggleAutoplay = useCallback(() => {
    const plugin = autoplay.current;
    if (!plugin) return;
    if (isPlaying) {
      plugin.stop();
      setIsPlaying(false);
    } else {
      plugin.play();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  return (
    <section className="py-12 bg-gradient-warm">
      <div className="container">
        <div className="text-center mb-8">
          <span className="inline-block px-4 py-1.5 rounded-full bg-terracotta-light text-primary text-sm font-semibold mb-4">
            Member Stories
          </span>
          <h2 className="text-3xl md:text-4xl font-display mb-4">
            Loved by Our Community
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Real stories from real members. This is why we do what we do.
          </p>
        </div>

        <div className="max-w-5xl mx-auto">
          <div
            className="overflow-hidden -mx-4 px-4 md:mx-0 md:px-0"
            ref={emblaRef}
            role="region"
            aria-roledescription="carousel"
            aria-label="Member testimonials"
          >
            <div className="flex gap-4 md:gap-6">
              {testimonials.map((testimonial, index) => (
                <div
                  key={testimonial.name}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`Testimonial ${index + 1} of ${testimonials.length}`}
                  className="min-w-0 shrink-0 basis-[85%] sm:basis-[60%] md:basis-[calc((100%-3rem)/3)]"
                >
                  <div className="h-full bg-surface rounded-2xl p-6 shadow-soft border border-border flex flex-col">
                    {/* Stars */}
                    <div className="flex gap-1 mb-4">
                      {Array.from({ length: testimonial.rating }).map((_, i) => (
                        <Star key={i} className="w-4 h-4 text-accent fill-accent" />
                      ))}
                    </div>

                    {/* Quote */}
                    <p className="text-sm text-foreground leading-relaxed flex-1 mb-6 italic">
                      "{testimonial.quote}"
                    </p>

                    {/* Author */}
                    <div className="flex items-center gap-3">
                      <img
                        src={testimonial.avatar}
                        alt={testimonial.name}
                        loading="lazy"
                        className="w-11 h-11 rounded-full object-cover flex-shrink-0"
                      />
                      <div>
                        <p className="font-semibold text-sm">{testimonial.name}</p>
                        <p className="text-xs text-muted-foreground">{testimonial.role}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-3 mt-6">
            <Button
              variant="outline"
              size="icon"
              className="rounded-full"
              onClick={scrollPrev}
              aria-label="Previous testimonial"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>

            <div className="flex items-center gap-2" role="tablist" aria-label="Choose testimonial">
              {testimonials.map((testimonial, index) => (
                <button
                  key={testimonial.name}
                  type="button"
                  role="tab"
                  aria-selected={index === selectedIndex}
                  aria-label={`Go to testimonial ${index + 1}`}
                  onClick={() => emblaApi?.scrollTo(index)}
                  className={cn(
                    "h-2 rounded-full transition-all",
                    index === selectedIndex
                      ? "w-6 bg-primary"
                      : "w-2 bg-border hover:bg-muted-foreground/40"
                  )}
                />
              ))}
            </div>

            <Button
              variant="outline"
              size="icon"
              className="rounded-full"
              onClick={scrollNext}
              aria-label="Next testimonial"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="rounded-full gap-1.5"
              onClick={toggleAutoplay}
              aria-pressed={isPlaying}
              aria-label={isPlaying ? "Pause autoplay" : "Start autoplay"}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span className="text-xs">{isPlaying ? "Pause" : "Play"}</span>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};


export default TestimonialsSection;
