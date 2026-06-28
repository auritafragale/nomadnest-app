import { ReactNode } from "react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

interface LegalPageLayoutProps {
  title: string;
  lastUpdated?: string;
  children: ReactNode;
}

const LegalPageLayout = ({
  title,
  lastUpdated = "25 April 2025",
  children,
}: LegalPageLayoutProps) => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1">
        <article className="container pt-24 pb-16 max-w-3xl">
          <header className="mb-10">
            <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-foreground">
              {title}
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Last updated: {lastUpdated}
            </p>
          </header>
          <div className="space-y-8 text-foreground/90 leading-relaxed [&_h2]:font-display [&_h2]:text-xl [&_h2]:md:text-2xl [&_h2]:font-semibold [&_h2]:text-foreground [&_h2]:mt-10 [&_h2]:mb-3 [&_h3]:font-display [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-foreground [&_h3]:mt-6 [&_h3]:mb-2 [&_p]:text-muted-foreground [&_p]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:text-muted-foreground [&_ul]:space-y-2 [&_ul]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:text-muted-foreground [&_ol]:space-y-2 [&_ol]:mb-4 [&_a]:text-primary [&_a]:underline-offset-4 hover:[&_a]:underline">
            {children}
          </div>
        </article>
      </main>
      <Footer />
    </div>
  );
};

export default LegalPageLayout;
