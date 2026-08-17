import { useEffect, useState } from "react";
import whiteLogo from "@/assets/White_Logo_Full.png";

interface SplashScreenProps {
  onDone: () => void;
}

const SplashScreen = ({ onDone }: SplashScreenProps) => {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), 2200);
    const doneTimer = setTimeout(() => onDone(), 2700);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [onDone]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center transition-opacity duration-500"
      style={{
        backgroundColor: "#E8735A",
        opacity: fading ? 0 : 1,
        pointerEvents: fading ? "none" : "auto",
      }}
    >
      <img src={whiteLogo} alt="NomadNest" className="h-24 w-auto mb-6 drop-shadow-[0_2px_8px_rgba(0,0,0,0.15)]" />
      <p className="text-white/90 text-center text-base font-medium px-8 leading-relaxed max-w-xs">
        Where Travellers Find Homes & Pets Find Care
      </p>
    </div>
  );
};

export default SplashScreen;
