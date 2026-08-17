import { useEffect } from "react";
import Navbar from "@/components/layout/Navbar";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import Footer from "@/components/layout/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Instagram, Facebook, Mail, Heart } from "lucide-react";

const About = () => {
  useEffect(() => {
    document.title = "About NomadNest — Our story";
    const meta =
      document.querySelector('meta[name="description"]') ??
      Object.assign(document.createElement("meta"), { name: "description" });
    meta.setAttribute(
      "content",
      "NomadNest is a community platform connecting Nomads with Pet Parents. No booking fees, just a fair annual membership built on trust."
    );
    if (!meta.parentNode) document.head.appendChild(meta);
  }, []);

  const comparisonRows = [
    { feature: "Annual fee", nn: "From £59", others: "From £99–£129" },
    { feature: "Booking fees", nn: "Never", others: "Often" },
    {
      feature: "ID verification",
      nn: "All members, worldwide",
      others: "Selected countries only",
    },
    {
      feature: "Community",
      nn: "Built-in city chats & Nomad map",
      others: "Forums (if any)",
    },
    { feature: "Founding Member spots", nn: "1,000 free forever", others: "N/A" },
    { feature: "Built by", nn: "Active house sitters", others: "Corporate teams" },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <Breadcrumbs />

      <main className="flex-1">
        {/* Hero */}
        <section className="container py-12 md:py-20">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="font-display text-4xl md:text-6xl leading-tight tracking-tight text-foreground">
              We believe travel shouldn&apos;t cost a fortune
              <span className="text-primary"> and pets deserve to stay home.</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
              NomadNest is a community platform connecting adventurous Nomads
              with Pet Parents who need trusted, loving care for their home and
              pets. No booking fees. No per sit charges. Just one flat annual
              membership and a community built on trust.
            </p>
            <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
              We&apos;re not a booking agency. We&apos;re a community of people
              who love to travel and love animals — and we built the platform we
              always wished existed.
            </p>
          </div>
        </section>

        {/* Why */}
        <section className="container py-10 md:py-16">
          <div className="max-w-3xl mx-auto">
            <h2 className="font-display text-3xl md:text-4xl text-foreground mb-6">
              Why NomadNest exists
            </h2>
            <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
              The house and pet sitting world has a problem. The big platforms
              charge booking fees on top of annual memberships, verify members
              only in certain countries, and treat the whole thing like a
              transaction. What&apos;s missing is something simpler: a real
              community where trust is built in, fees are fair, and both sides
              of the exchange feel genuinely supported. We started NomadNest
              because we lived this frustration first-hand — as sitters, as
              travellers, and as pet owners ourselves.
            </p>
          </div>
        </section>

        {/* Founders — temporarily hidden
        <section className="container py-10 md:py-16">
          <div className="max-w-5xl mx-auto">
            <h2 className="font-display text-3xl md:text-4xl text-foreground mb-8 text-center">
              Meet the founders
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card variant="feature">
                <CardHeader>
                  <CardTitle className="text-primary">Aurita</CardTitle>
                  <p className="text-sm text-muted-foreground font-body">Co-founder</p>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed">
                    Born to a Dominican mother and an Italian father, Aurita
                    grew up between the Dominican Republic and Italy before
                    moving to London at 18. Over the next decade she built a
                    career in luxury and creativity — working at Harrods and
                    Porsche, then Google, before becoming Head of Customer
                    Service for the Cannes Lions Festival of Creativity,
                    working with some of the world&apos;s biggest brands and
                    spending every summer on the ground in Cannes. But
                    somewhere between the five-star hotels and festival
                    glamour, she discovered something she loved more: staying
                    in real homes, in real neighbourhoods, caring for animals,
                    and seeing the world at its actual pace. House sitting
                    changed everything. In 2026, Aurita stepped away from the
                    traditional career path to focus entirely on NomadNest.
                  </p>
                </CardContent>
              </Card>

              <Card variant="feature">
                <CardHeader>
                  <CardTitle className="text-primary">Clare</CardTitle>
                  <p className="text-sm text-muted-foreground font-body">Co-founder</p>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed">
                    Clare is a teacher from Australia who moved to London in
                    2019 looking for adventure — and found it. She and Aurita
                    met in London that year, bonded immediately over their
                    shared love of travel, animals, and the belief that the
                    world is better explored slowly, with a dog at your feet
                    and a local neighbourhood to call home for a while.
                    Together they&apos;ve completed over 50 sits across more
                    than 20 countries, saving over £20,000 in accommodation
                    costs along the way. That experience became the foundation
                    for NomadNest.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
        */}

        {/* Journey */}
        <section className="container py-10 md:py-16">
          <div className="max-w-3xl mx-auto">
            <h2 className="font-display text-3xl md:text-4xl text-foreground mb-6">
              Our journey <span className="text-muted-foreground">(the honest version)</span>
            </h2>
            <div className="space-y-4 text-base md:text-lg text-muted-foreground leading-relaxed">
              <p>
                We started building NomadNest in 2024. Like many founders, we
                trusted a development team to bring the vision to life — and
                like too many founders, we learned the hard way that trust has
                to be earned. After significant investment of both money and
                time, we found ourselves without the product we&apos;d been
                promised.
              </p>
              <p>
                Rather than give up, we rebuilt — this time with full control,
                full transparency, and a much clearer vision of exactly what
                NomadNest needed to be. The delay was frustrating. But it made
                the platform better.
              </p>
              <p>
                Every feature was built from real experience: our own sits, our
                own frustrations, and the 1,000+ community members in our
                Facebook group who told us exactly what they needed.
              </p>
              <p>
                NomadNest launched in 2026. It&apos;s not perfect yet. But
                it&apos;s real, it&apos;s growing, and it&apos;s ours — and
                yours.
              </p>
            </div>
          </div>
        </section>

        {/* Comparison */}
        <section className="container py-10 md:py-16">
          <div className="max-w-4xl mx-auto">
            <h2 className="font-display text-3xl md:text-4xl text-foreground mb-8 text-center">
              What makes us different
            </h2>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Feature</TableHead>
                      <TableHead className="text-primary font-semibold">
                        NomadNest
                      </TableHead>
                      <TableHead>Others</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comparisonRows.map((row) => (
                      <TableRow key={row.feature}>
                        <TableCell className="font-medium">{row.feature}</TableCell>
                        <TableCell className="text-primary font-medium">
                          {row.nn}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {row.others}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Community */}
        <section className="container py-10 md:py-16">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-terracotta-light text-primary mb-4">
              <Heart className="w-6 h-6" />
            </div>
            <h2 className="font-display text-3xl md:text-4xl text-foreground mb-6">
              The NomadNest community
            </h2>
            <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
              ~1,000 members in our Facebook community before the app even
              launched. Real house sitters, real pet parents, real people who
              found us because they were searching for exactly what we were
              building. That community is the heart of NomadNest. The app is
              just the tool that connects them.
            </p>
          </div>
        </section>

        {/* Connect */}
        <section className="container py-10 md:py-20">
          <div className="max-w-3xl mx-auto">
            <Card variant="feature">
              <CardContent className="p-8 md:p-10">
                <h2 className="font-display text-2xl md:text-3xl text-foreground mb-6 text-center">
                  Come say hi
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <a
                    href="https://www.instagram.com/nomadnest.global/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-col items-center gap-2 p-4 rounded-lg hover:bg-muted transition-colors text-center"
                  >
                    <div className="w-10 h-10 rounded-lg bg-terracotta-light text-primary flex items-center justify-center">
                      <Instagram className="w-5 h-5" />
                    </div>
                    <p className="text-sm font-semibold text-foreground">Instagram</p>
                    <p className="text-xs text-muted-foreground">@nomadnest.global</p>
                  </a>
                  <a
                    href="https://www.facebook.com/profile.php?id=61573065826502"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-col items-center gap-2 p-4 rounded-lg hover:bg-muted transition-colors text-center"
                  >
                    <div className="w-10 h-10 rounded-lg bg-terracotta-light text-primary flex items-center justify-center">
                      <Facebook className="w-5 h-5" />
                    </div>
                    <p className="text-sm font-semibold text-foreground">Facebook</p>
                    <p className="text-xs text-muted-foreground">Community group</p>
                  </a>
                  <a
                    href="mailto:support@nomadnest.global"
                    className="flex flex-col items-center gap-2 p-4 rounded-lg hover:bg-muted transition-colors text-center"
                  >
                    <div className="w-10 h-10 rounded-lg bg-terracotta-light text-primary flex items-center justify-center">
                      <Mail className="w-5 h-5" />
                    </div>
                    <p className="text-sm font-semibold text-foreground">Email</p>
                    <p className="text-xs text-muted-foreground">support@nomadnest.global</p>
                  </a>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default About;
