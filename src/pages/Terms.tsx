import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

const Terms = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1">
        <div className="container pt-20 pb-12 max-w-4xl">
          <h1 className="text-2xl md:text-4xl font-bold mb-8">Terms of Service</h1>
          <p className="text-muted-foreground mb-8">
            Last updated: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </p>

          <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
            <section>
              <h2 className="text-2xl font-semibold mb-4">1. Acceptance of Terms</h2>
              <p className="text-muted-foreground leading-relaxed">
                By accessing and using NomadNest ("the Service"), you accept and agree to be bound by the terms 
                and provisions of this agreement. If you do not agree to these terms, please do not use the Service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">2. Description of Service</h2>
              <p className="text-muted-foreground leading-relaxed">
                NomadNest is a platform that connects pet owners with pet sitters for pet-sitting arrangements. 
                Pet owners can list their homes and pets, and sitters can browse and apply for sits. The service 
                facilitates communication between parties but is not responsible for the actual pet-sitting arrangements.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">3. User Accounts</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                To use certain features of the Service, you must register for an account. You agree to:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Provide accurate, current, and complete information during registration</li>
                <li>Maintain and promptly update your account information</li>
                <li>Maintain the security of your password and account</li>
                <li>Accept responsibility for all activities that occur under your account</li>
                <li>Notify us immediately of any unauthorized use of your account</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">4. User Conduct</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                You agree not to:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Use the Service for any unlawful purpose</li>
                <li>Post false, misleading, or fraudulent content</li>
                <li>Harass, abuse, or harm other users</li>
                <li>Interfere with or disrupt the Service</li>
                <li>Attempt to gain unauthorized access to the Service</li>
                <li>Use automated means to access the Service without permission</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">5. Pet Owner Responsibilities</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                As a pet owner, you agree to:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Provide accurate information about your pets and home</li>
                <li>Ensure your pets are healthy and have up-to-date vaccinations</li>
                <li>Provide clear care instructions for your pets</li>
                <li>Leave emergency contact information and veterinary details</li>
                <li>Ensure your home is safe and habitable for the sitter</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">6. Pet Sitter Responsibilities</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                As a pet sitter, you agree to:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Provide accurate information about your experience and availability</li>
                <li>Follow the pet owner's care instructions</li>
                <li>Treat the pets and home with care and respect</li>
                <li>Communicate promptly with pet owners during sits</li>
                <li>Report any issues or emergencies immediately</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">7. Limitation of Liability</h2>
              <p className="text-muted-foreground leading-relaxed">
                NomadNest is a platform that facilitates connections between users. We are not responsible for 
                any damages, injuries, or losses that may occur during pet-sitting arrangements. Users engage 
                with each other at their own risk. We strongly encourage users to verify identities, read reviews, 
                and communicate thoroughly before entering into any arrangement.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">8. Termination</h2>
              <p className="text-muted-foreground leading-relaxed">
                We may terminate or suspend your account and access to the Service immediately, without prior 
                notice or liability, for any reason, including without limitation if you breach these Terms. 
                Upon termination, your right to use the Service will cease immediately.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">9. Changes to Terms</h2>
              <p className="text-muted-foreground leading-relaxed">
                We reserve the right to modify or replace these Terms at any time. We will provide notice of 
                any significant changes. Your continued use of the Service after such modifications constitutes 
                acceptance of the updated Terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">10. Contact Us</h2>
              <p className="text-muted-foreground leading-relaxed">
                If you have any questions about these Terms of Service, please contact us through our platform.
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Terms;
