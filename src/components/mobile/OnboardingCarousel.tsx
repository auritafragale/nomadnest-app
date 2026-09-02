import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const slides = [
  {
    image: "https://images.unsplash.com/photo-1452857297128-d9c29adba80b?w=800&h=1000&fit=crop",
    title: "Travel the World",
    subtitle: "House sit in amazing homes across the globe while their owners travel.",
  },
  {
    image: "https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=800&h=1000&fit=crop",
    title: "Pet Parents, Travel Freely",
    subtitle: "Leave your pets happy at home with a trusted Nomad — no kennels, no sitting fees.",
  },
  {
    image: "https://images.unsplash.com/photo-1501555088652-021faa106b9b?w=800&h=1000&fit=crop",
    title: "Live Like a Local",
    subtitle: "Skip the hotels. Stay in real homes and experience destinations authentically.",
  },
];

const STORAGE_KEY = "nomadnest_onboarding_seen";

interface OnboardingCarouselProps {
  onDone: () => void;
}

const OnboardingCarousel = ({ onDone }: OnboardingCarouselProps) => {
  const [current, setCurrent] = useState(0);
  const startXRef = useRef<number | null>(null);
  const navigate = useNavigate();

  const markSeen = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    onDone();
  };

  const next = () => {
    if (current < slides.length - 1) {
      setCurrent(current + 1);
    } else {
      markSeen();
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (startXRef.current === null) return;
    const diff = startXRef.current - e.changedTouches[0].clientX;
    if (diff > 50) next();
    else if (diff < -50 && current > 0) setCurrent(current - 1);
    startXRef.current = null;
  };

  const slide = slides[current];

  return (
    <div
      className="fixed inset-0 z-[9998] flex flex-col"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Background image */}
      <div className="absolute inset-0">
        <img src={slide.image} alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
      </div>

      {/* Skip */}
      <div className="relative z-10 flex justify-end p-6 pt-12">
        <button
          onClick={markSeen}
          className="text-white/70 text-sm font-medium"
        >
          Skip
        </button>
      </div>

      {/* Content */}
      <div className="relative z-10 mt-auto p-8 pb-12">
        <h2 className="text-white text-3xl font-display font-bold mb-3">
          {slide.title}
        </h2>
        <p className="text-white/80 text-base leading-relaxed mb-8">
          {slide.subtitle}
        </p>

        {/* Dots */}
        <div className="flex gap-2 mb-8">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className="h-2 rounded-full transition-all duration-300"
              style={{
                width: i === current ? 24 : 8,
                backgroundColor: i === current ? "#E8735A" : "rgba(255,255,255,0.4)",
              }}
            />
          ))}
        </div>

        <div className="flex gap-3">
          <Button
            onClick={next}
            className="flex-1 h-12 text-base font-semibold"
            style={{ backgroundColor: "#E8735A", color: "white" }}
          >
            {current < slides.length - 1 ? "Next" : "Get Started"}
          </Button>
          {current === slides.length - 1 && (
            <Button
              variant="outline"
              className="h-12 text-white border-white/40 bg-white/10"
              onClick={() => { markSeen(); navigate("/auth"); }}
            >
              Sign In
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export { STORAGE_KEY as ONBOARDING_STORAGE_KEY };
export default OnboardingCarousel;
