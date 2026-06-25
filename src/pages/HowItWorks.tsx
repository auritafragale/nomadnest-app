import { Link } from "react-router-dom";
import Navbar from "@/components/layout/Navbar";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Check, X, Sparkles } from "lucide-react";

const nomadSteps = [
  {
    title: "Create your profile",
    description:
      "Tell the community who you are, your travel history, the pets you have cared for, your sitting style, and when you are available. A complete profile gets more invitations.",
  },
  {
    title: "Browse sits worldwide",
    description:
      "Filter by location, dates, and pet types. Find sits in cities and countries you have always wanted to explore and apply with a personalised message.",
  },
  {
    title: "Get verified",
    description:
      "Upload a photo ID and a selfie. Our team reviews all submissions within 24 to 48 hours. Your verified badge builds trust with Pet Parents instantly.",
  },
  {
    title: "Match and connect",
    description:
      "Pet Parents can message you, invite you directly, or accept your application. Chat and get to know each other before committing.",
  },
  {
    title: "Go and sit",
    description:
      "Arrive, meet the pets, settle in. Care for the home and animals as agreed. Leave a review and build your reputation sit by sit.",
  },
  {
    title: "Connect with nomads nearby",
    description:
      "Join your city's chat room and meet other nomads in the same area. Organise meetups, share tips, and find your people wherever in the world you are. Access unlocks automatically when you have an upcoming or active sit in that city.",
  },
];

const parentSteps = [
  {
    title: "Create your listing",
    description:
      "Describe your home, your neighbourhood, your pets' needs, and the dates you need cover. Add photos because listings with great photos get the best applicants.",
  },
  {
    title: "Get verified",
    description:
      "All Pet Parents are ID verified before going live. This protects your home and reassures the Nomads applying.",
  },
  {
    title: "Browse and invite Nomads",
    description:
      "Search our global community of verified Nomads by location, experience, and availability. Send a direct invitation or wait for applications to come in.",
  },
  {
    title: "Choose your Nomad",
    description:
      "Review profiles, read reviews from other Pet Parents, and chat with applicants. Video calls are encouraged before confirming.",
  },
  {
    title: "Enjoy your trip",
    description:
      "Your home is in safe hands. Your pets are in their own environment, on their own routine, with someone who genuinely cares. Come home to a happy house.",
  },
];

const planFeatures: Array<{
  feature: string;
  nomad: boolean;
  parent: boolean;
  combined: boolean;
}> = [
  { feature: "Unlimited sit applications", nomad: true, parent: false, combined: true },
  { feature: "Create unlimited listings", nomad: false, parent: true, combined: true },
  { feature: "Verified member badge", nomad: true, parent: true, combined: true },
  { feature: "Browse and invite Nomads", nomad: false, parent: true, combined: true },
  { feature: "Nomads Near Me map", nomad: true, parent: false, combined: true },
  { feature: "City chat rooms", nomad: true, parent: false, combined: true },
  { feature: "No booking fees ever", nomad: true, parent: true, combined: true },
];

const YesNo = ({ value }: { value: boolean }) =>
  value ? (
    <Check className="w-5 h-5 text-primary mx-auto" aria-label="Yes" />
  ) : (
    <X className="w-5 h-5 text-muted-foreground/50 mx-auto" aria-label="No" />
  );

const StepCard = ({
  index,
  title,
  description,
}: {
  index: number;
  title: string;
  description: string;
}) => (
  <Card variant="feature" className="h-full">
    <CardHeader className="pb-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-display text-lg shrink-0">
          {index}
        </div>
        <CardTitle className="text-xl">{title}</CardTitle>
      </div>
    </CardHeader>
    <CardContent>
      <p className="text-muted-foreground leading-relaxed">{description}</p>
    </CardContent>
  </Card>
);

const HowItWorks = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1">
        <div className="container mx-auto px-4 pt-20 pb-16">
          <Breadcrumbs />

          {/* Hero */}
          <section className="max-w-3xl mx-auto text-center mb-16">
            <span className="inline-block px-4 py-1.5 rounded-full bg-terracotta-light text-primary text-sm font-semibold mb-4">
              A genuine exchange
            </span>
            <h1 className="text-3xl md:text-5xl font-display mb-5">
              How NomadNest Works
            </h1>
            <p className="text-muted-foreground text-lg leading-relaxed">
              House and pet sitting is one of the world's best-kept travel secrets.
              Pet Parents get trusted, loving care for their home and animals while
              they're away. Nomads get free accommodation in real homes across the
              world. No money changes hands between members, just a genuine exchange
              built on trust.
            </p>
          </section>

          {/* For Nomads */}
          <section className="max-w-5xl mx-auto mb-20">
            <div className="text-center mb-10">
              <h2 className="text-2xl md:text-3xl font-display mb-2">
                For Nomads 🌍
              </h2>
              <p className="text-muted-foreground">
                Travel the world, one home at a time.
              </p>
            </div>
            <div className="grid md:grid-cols-2 gap-5">
              {nomadSteps.map((step, i) => (
                <StepCard
                  key={step.title}
                  index={i + 1}
                  title={step.title}
                  description={step.description}
                />
              ))}
            </div>
          </section>

          {/* For Pet Parents */}
          <section className="max-w-5xl mx-auto mb-20">
            <div className="text-center mb-10">
              <h2 className="text-2xl md:text-3xl font-display mb-2">
                For Pet Parents 🏠
              </h2>
              <p className="text-muted-foreground">
                Trusted care for your pets, in their own home.
              </p>
            </div>
            <div className="grid md:grid-cols-2 gap-5">
              {parentSteps.map((step, i) => (
                <StepCard
                  key={step.title}
                  index={i + 1}
                  title={step.title}
                  description={step.description}
                />
              ))}
            </div>
          </section>

          {/* Membership plans */}
          <section className="max-w-5xl mx-auto mb-20">
            <div className="text-center mb-10">
              <h2 className="text-2xl md:text-3xl font-display mb-2">
                Membership plans
              </h2>
              <p className="text-muted-foreground">
                One flat annual fee. No booking fees. Ever.
              </p>
            </div>

            <Card variant="default" className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-surface">
                    <TableHead className="font-display text-foreground">
                      Feature
                    </TableHead>
                    <TableHead className="font-display text-foreground text-center">
                      Nomad
                      <div className="text-xs font-normal text-muted-foreground">
                        £59 / year
                      </div>
                    </TableHead>
                    <TableHead className="font-display text-foreground text-center">
                      Pet Parent
                      <div className="text-xs font-normal text-muted-foreground">
                        £59 / year
                      </div>
                    </TableHead>
                    <TableHead className="font-display text-primary text-center">
                      Combined
                      <div className="text-xs font-normal text-muted-foreground">
                        £99 / year
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {planFeatures.map((row) => (
                    <TableRow key={row.feature}>
                      <TableCell className="font-medium">{row.feature}</TableCell>
                      <TableCell className="text-center">
                        <YesNo value={row.nomad} />
                      </TableCell>
                      <TableCell className="text-center">
                        <YesNo value={row.parent} />
                      </TableCell>
                      <TableCell className="text-center bg-terracotta-light/30">
                        <YesNo value={row.combined} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>

            <Card variant="feature" className="mt-8">
              <CardContent className="p-6 md:p-8 flex flex-col md:flex-row items-center gap-6 text-center md:text-left">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Sparkles className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-display text-xl mb-1">
                    Founding Member offer
                  </h3>
                  <p className="text-muted-foreground">
                    The first 1,000 members from our community get free lifetime
                    access.
                  </p>
                </div>
                <Button asChild variant="default" size="lg">
                  <Link to="/membership">Check availability</Link>
                </Button>
              </CardContent>
            </Card>
          </section>

          {/* The exchange */}
          <section className="max-w-3xl mx-auto">
            <Card variant="outline" className="border-primary/20">
              <CardContent className="p-8 md:p-10 text-center">
                <h2 className="text-2xl md:text-3xl font-display mb-4">
                  The exchange
                </h2>
                <p className="text-muted-foreground leading-relaxed text-lg">
                  House and pet sitting is a skill exchange, not a financial
                  transaction. Nomads provide attentive, responsible pet and home
                  care. Pet Parents provide free accommodation in their home. No
                  money changes hands between members because NomadNest only
                  charges the annual platform membership. This is what keeps the
                  community genuine. People who are here for the right reasons.
                </p>
              </CardContent>
            </Card>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default HowItWorks;
