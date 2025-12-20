import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { toast } from "sonner";
import { 
  Mail, 
  MessageSquare, 
  HelpCircle, 
  FileText, 
  Shield, 
  Loader2,
  CheckCircle2,
  ArrowLeft
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const contactSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name must be less than 100 characters"),
  email: z.string().trim().email("Invalid email address").max(255, "Email must be less than 255 characters"),
  category: z.string().min(1, "Please select a category"),
  subject: z.string().trim().min(1, "Subject is required").max(200, "Subject must be less than 200 characters"),
  message: z.string().trim().min(10, "Message must be at least 10 characters").max(2000, "Message must be less than 2000 characters"),
});

type ContactFormData = z.infer<typeof contactSchema>;

const faqs = [
  {
    question: "How do I create a listing for my home?",
    answer: "Sign up as a pet owner, complete your profile, then click 'Create Listing' from your dashboard. You'll be guided through adding your pets, home details, and available dates."
  },
  {
    question: "Is pet sitting really free?",
    answer: "Yes! NomadNest operates on a trust exchange model. Pet owners get free pet care while sitters get free accommodation. There are no fees for either party."
  },
  {
    question: "How are sitters verified?",
    answer: "We offer optional ID verification and background checks for sitters. Look for the verification badges on sitter profiles. We also have a review system so you can see feedback from previous sits."
  },
  {
    question: "What if something goes wrong during a sit?",
    answer: "We encourage clear communication between owners and sitters before the sit begins. Document everything, exchange emergency contacts, and discuss expectations. If issues arise, contact us and we'll help mediate."
  },
  {
    question: "Can I cancel an application or booking?",
    answer: "Yes, you can withdraw applications before they're accepted. For confirmed sits, please communicate with the other party as early as possible to give them time to find alternatives."
  },
  {
    question: "How do I report a problem with a user?",
    answer: "You can report users or listings using the flag icon on their profile or listing page. Our team reviews all reports and takes appropriate action to maintain community safety."
  },
];

const Contact = () => {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const form = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: "",
      email: user?.email || "",
      category: "",
      subject: "",
      message: "",
    },
  });

  const onSubmit = async (data: ContactFormData) => {
    setIsSubmitting(true);
    
    try {
      const { data: response, error } = await supabase.functions.invoke('send-contact-email', {
        body: data,
      });

      if (error) {
        console.error("Error sending contact email:", error);
        toast.error("Failed to send message. Please try again.");
        setIsSubmitting(false);
        return;
      }

      console.log("Contact form submitted successfully:", response);
      setIsSubmitted(true);
      toast.success("Message sent! We'll get back to you soon.");
    } catch (error) {
      console.error("Error sending contact email:", error);
      toast.error("Failed to send message. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="flex-1 container mx-auto px-4 py-12">
          <div className="max-w-md mx-auto text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h1 className="text-2xl font-bold mb-4">Message Sent!</h1>
            <p className="text-muted-foreground mb-6">
              Thank you for reaching out. We typically respond within 24-48 hours.
            </p>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={() => setIsSubmitted(false)}>
                Send Another Message
              </Button>
              <Link to="/">
                <Button>Back to Home</Button>
              </Link>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1">
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-4xl mx-auto">
            {/* Header */}
            <div className="text-center mb-12">
              <h1 className="text-4xl font-display font-bold mb-4">
                Contact & Support
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Have a question or need help? We're here for you. Check our FAQs below or send us a message.
              </p>
            </div>

            {/* Quick Help Cards */}
            <div className="grid md:grid-cols-3 gap-4 mb-12">
              <Card className="text-center hover:shadow-md transition-shadow">
                <CardContent className="pt-6">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <HelpCircle className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-semibold mb-2">General Questions</h3>
                  <p className="text-sm text-muted-foreground">
                    How the platform works, account help, and more
                  </p>
                </CardContent>
              </Card>

              <Card className="text-center hover:shadow-md transition-shadow">
                <CardContent className="pt-6">
                  <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
                    <Shield className="w-6 h-6 text-destructive" />
                  </div>
                  <h3 className="font-semibold mb-2">Safety & Trust</h3>
                  <p className="text-sm text-muted-foreground">
                    Report issues, verification, and community safety
                  </p>
                </CardContent>
              </Card>

              <Card className="text-center hover:shadow-md transition-shadow">
                <CardContent className="pt-6">
                  <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center mx-auto mb-4">
                    <FileText className="w-6 h-6 text-secondary" />
                  </div>
                  <h3 className="font-semibold mb-2">Feedback</h3>
                  <p className="text-sm text-muted-foreground">
                    Suggestions, feature requests, and partnerships
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="grid lg:grid-cols-2 gap-8">
              {/* FAQs */}
              <div>
                <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2">
                  <HelpCircle className="w-6 h-6" />
                  Frequently Asked Questions
                </h2>
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

              {/* Contact Form */}
              <div>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MessageSquare className="w-5 h-5" />
                      Send us a Message
                    </CardTitle>
                    <CardDescription>
                      Fill out the form below and we'll get back to you within 24-48 hours.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Form {...form}>
                      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                          control={form.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Name</FormLabel>
                              <FormControl>
                                <Input placeholder="Your name" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Email</FormLabel>
                              <FormControl>
                                <Input type="email" placeholder="your@email.com" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="category"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Category</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select a category" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="general">General Question</SelectItem>
                                  <SelectItem value="account">Account Help</SelectItem>
                                  <SelectItem value="safety">Safety Concern</SelectItem>
                                  <SelectItem value="bug">Bug Report</SelectItem>
                                  <SelectItem value="feedback">Feedback & Suggestions</SelectItem>
                                  <SelectItem value="partnership">Partnership Inquiry</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="subject"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Subject</FormLabel>
                              <FormControl>
                                <Input placeholder="Brief description of your inquiry" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="message"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Message</FormLabel>
                              <FormControl>
                                <Textarea 
                                  placeholder="Tell us more about your question or issue..."
                                  className="min-h-[120px] resize-none"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <Button type="submit" className="w-full" disabled={isSubmitting}>
                          {isSubmitting ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Sending...
                            </>
                          ) : (
                            <>
                              <Mail className="w-4 h-4 mr-2" />
                              Send Message
                            </>
                          )}
                        </Button>
                      </form>
                    </Form>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Contact;
