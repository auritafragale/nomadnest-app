import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import CityChatsSection from "@/components/city-chat/CityChatsSection";
import { HelpTooltip } from "@/components/ui/HelpTooltip";

const CityChats = () => (
  <div className="min-h-screen flex flex-col bg-background">
    <Navbar />

    <main className="flex-1 pt-20">
      <div className="bg-surface border-b border-border">
        <div className="container py-8">
          <div className="flex items-center gap-1.5">
            <h1 className="text-3xl md:text-4xl font-display">City Chats</h1>
            <HelpTooltip
              label="About city chats"
              content="City chats are local community spaces for nomads in the same area. You can join a city chat once you have a confirmed sit there."
            />
          </div>
        </div>
      </div>

      <div className="container pb-8">
        <CityChatsSection />
      </div>
    </main>

    <Footer />
  </div>
);

export default CityChats;
