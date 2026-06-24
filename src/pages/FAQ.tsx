import Navbar from "@/components/layout/Navbar";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import Footer from "@/components/layout/Footer";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { HelpCircle } from "lucide-react";

const faqs = [
  {
    question: "How do I create a listing for my home?",
    answer:
      "Sign up as a Pet Parent, complete your profile, then click 'Create Listing' from your dashboard. You'll be guided through adding your pets, home details, and available dates.",
  },
  {
    question: "Is pet sitting really free?",
    answer:
      "Yes! NomadNest operates on a trust exchange model. Pet Parents get free pet care while Nomads get free accommodation. There are no per-sit fees — just an annual membership.",
  },
  {
    question: "How are sitters verified?",
    answer:
      "We offer optional ID verification and background checks for Nomads. Look for the verification badges on Nomad profiles. We also have a two-way review system so you can see feedback from previous sits.",
  },
  {
    question: "What if something goes wrong during a sit?",
    answer:
      "We encourage clear communication between Pet Parents and Nomads before the sit begins. Document everything, exchange emergency contacts, and discuss expectations. If issues arise, contact us and we'll help mediate.",
  },
  {
    question: "Can I cancel an application or booking?",
    answer:
      "Yes, you can withdraw applications before they're accepted. For confirmed sits, please communicate with the other party as early as possible to give them time to find alternatives.",
  },
  {
    question: "How do I report a problem with a user?",
    answer:
      "You can report users or listings using the flag icon on their profile or listing page. Our team reviews all reports and takes appropriate action to maintain community safety.",
  },
];

const FAQ = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1">
        <div className="container mx-auto px-4 pt-20 pb-12">
          <div className="max-w-3xl mx-auto">
            <Breadcrumbs />
            <div className="text-center mb-10">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <HelpCircle className="w-6 h-6 text-primary" />
              </div>
              <h1 className="text-2xl md:text-4xl font-display font-bold mb-3">
                Frequently Asked Questions
              </h1>
              <p className="text-muted-foreground">
                Answers to the most common questions about NomadNest.
              </p>
            </div>

            <Accordion type="single" collapsible className="w-full">
              {faqs.map((faq, index) => (
                <AccordionItem key={index} value={`item-${index}`}>
                  <AccordionTrigger className="text-left">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default FAQ;
