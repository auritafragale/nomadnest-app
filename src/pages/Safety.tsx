import { ShieldCheck, Users, Camera, Star, Mail } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import Footer from "@/components/layout/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const safetySections = [
  {
    icon: ShieldCheck,
    title: "Identity verification — for everyone",
    paragraphs: [
      "Every NomadNest member, both Nomad and Pet Parent, is identity verified before they can use the platform fully. We verify members worldwide, not just in selected countries like some platforms do. If you are on NomadNest, you are verified.",
    ],
    bullets: [
      "Upload a government-issued photo ID such as a passport, driving licence, or national ID",
      "Upload a selfie holding your ID or looking at camera",
      "Our team reviews every submission within 24 to 48 hours",
      "Verified members receive a badge on their profile that is visible to everyone",
    ],
  },
  {
    icon: Users,
    title: "Community standards",
    paragraphs: [
      "Every member agrees to our Community Standards when joining NomadNest. The short version:",
    ],
    bullets: [
      "Treat everyone with respect in messages, on sits, and in reviews",
      "Be honest about your home, your pets, and your expectations",
      "Communicate promptly and clearly",
      "Honour your commitments because cancelled sits cause real disruption to people and their pets",
      "Disclose any recording devices in your home before a sit begins",
    ],
    footer: "We take violations seriously. Members who breach our standards may have their accounts suspended or permanently removed.",
  },
  {
    icon: Camera,
    title: "Camera and recording policy",
    paragraphs: [
      "Pet Parents: if you have any cameras, doorbells with recording, or other surveillance devices in or around your home, you must disclose them fully to your Nomad before the sit is confirmed. This is non-negotiable.",
      "Nomads: you may not install or use any recording devices in a Pet Parent's home under any circumstances without explicit written permission.",
      "Undisclosed recording is a serious breach of trust and may result in immediate account termination and referral to local authorities.",
    ],
  },
  {
    icon: Star,
    title: "Reviews and reputation",
    paragraphs: [
      "After every sit, both parties leave a review. Reviews are honest, verified, and visible on profiles. They cannot be edited or removed without good reason. A strong review history is the most powerful trust signal on NomadNest. Build yours sit by sit.",
    ],
  },
  {
    icon: Mail,
    title: "How to report a problem",
    paragraphs: [
      "If something goes wrong during a sit, in a message, or anywhere on the platform, contact us immediately at support@nomadnest.global. We take all reports seriously and respond within 24 hours.",
    ],
  },
];

const SectionCard = ({
  icon: Icon,
  title,
  paragraphs,
  bullets,
  footer,
}: {
  icon: typeof ShieldCheck;
  title: string;
  paragraphs: string[];
  bullets?: string[];
  footer?: string;
}) => (
  <Card variant="feature" className="h-full">
    <CardHeader className="pb-3">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Icon className="w-6 h-6" />
        </div>
        <CardTitle asChild>
          <h2 className="text-xl md:text-2xl font-display leading-tight">
            {title}
          </h2>
        </CardTitle>
      </div>
    </CardHeader>
    <CardContent className="space-y-4">
      {paragraphs.map((text, index) => (
        <p key={index} className="text-muted-foreground leading-relaxed">
          {text}
        </p>
      ))}
      {bullets && bullets.length > 0 && (
        <ul className="list-disc pl-5 space-y-2 text-muted-foreground leading-relaxed">
          {bullets.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      )}
      {footer && (
        <p className="text-foreground font-medium leading-relaxed">{footer}</p>
      )}
    </CardContent>
  </Card>
);

const Safety = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1">
        <div className="container mx-auto px-4 pt-20 pb-16">
          <Breadcrumbs />

          {/* Hero */}
          <section className="max-w-3xl mx-auto text-center mb-16">
            <span className="inline-block px-4 py-1.5 rounded-full bg-terracotta-light text-primary text-sm font-semibold mb-4">
              Safety & Trust
            </span>
            <h1 className="text-3xl md:text-5xl font-display mb-5">
              Safety & Trust
            </h1>
            <p className="text-muted-foreground text-lg md:text-xl leading-relaxed">
              NomadNest connects real people, in real homes, with real pets.
              Safety is not a feature here. It is the foundation everything else
              is built on.
            </p>
          </section>

          {/* Sections */}
          <section className="max-w-4xl mx-auto mb-20 space-y-6">
            {safetySections.map((section) => (
              <SectionCard
                key={section.title}
                icon={section.icon}
                title={section.title}
                paragraphs={section.paragraphs}
                bullets={section.bullets}
                footer={section.footer}
              />
            ))}
          </section>

          {/* Closing quote */}
          <section className="max-w-4xl mx-auto">
            <Card className="bg-primary text-primary-foreground border-0 rounded-2xl shadow-glow">
              <CardContent className="p-8 md:p-12 text-center">
                <blockquote className="text-lg md:text-xl leading-relaxed font-body mb-6">
                  "We built NomadNest because we have been on both sides of this
                  exchange. We have been the Nomads trusted with someone's home
                  and beloved pets. We know what that responsibility feels like
                  and we know what it feels like when a Pet Parent puts their
                  trust in you completely. That is why we do not cut corners on
                  safety. Every verification, every policy, every community
                  standard exists because we would want it to exist if we were
                  the ones handing over our keys."
                </blockquote>
                <p className="font-semibold">Aurita and Clare, co-founders</p>
              </CardContent>
            </Card>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Safety;
