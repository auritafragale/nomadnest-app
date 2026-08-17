import { Star } from "lucide-react";

const testimonials = [
  {
    quote: "NomadNest changed how I travel. I've house-sat in Portugal, Bali, and Colombia — all while caring for the most adorable animals. It's community, not just a platform.",
    name: "Sophie R.",
    role: "Nomad since 2024",
    avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&h=120&fit=crop&crop=faces",
    rating: 5,
  },
  {
    quote: "I was nervous leaving our two cats for three weeks. Our NomadNest sitter sent daily photos, kept the house immaculate, and our cats absolutely loved her. 10/10.",
    name: "James & Priya T.",
    role: "Pet Parents since 2024",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&h=120&fit=crop&crop=face",
    rating: 5,
  },
  {
    quote: "The founding member perks alone are worth it — the eSIM discount saved me €40 last month. But the real value is the genuine connections you make.",
    name: "Marco L.",
    role: "Founding Nomad since 2024",
    avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120&h=120&fit=crop&crop=face",
    rating: 5,
  },
];

const TestimonialsSection = () => {
  return (
    <section className="py-20 bg-gradient-warm">
      <div className="container">
        <div className="text-center mb-14">
          <span className="inline-block px-4 py-1.5 rounded-full bg-terracotta-light text-primary text-sm font-semibold mb-4">
            Member Stories
          </span>
          <h2 className="text-3xl md:text-4xl font-display mb-4">
            Loved by Our Community
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Real stories from real members. This is why we do what we do.
          </p>
        </div>

        <div className="flex md:grid md:grid-cols-3 gap-4 md:gap-6 max-w-5xl mx-auto overflow-x-auto md:overflow-visible snap-x snap-mandatory md:snap-none pb-4 md:pb-0 -mx-4 px-4 md:mx-0 md:px-0 scroll-smooth">
          {testimonials.map((testimonial) => (
            <div
              key={testimonial.name}
              className="bg-surface rounded-2xl p-6 shadow-soft border border-border flex flex-col snap-center shrink-0 w-[80vw] sm:w-[60vw] md:w-auto md:shrink"
            >
              {/* Stars */}
              <div className="flex gap-1 mb-4">
                {Array.from({ length: testimonial.rating }).map((_, i) => (
                  <Star key={i} className="w-4 h-4 text-accent fill-accent" />
                ))}
              </div>

              {/* Quote */}
              <p className="text-sm text-foreground leading-relaxed flex-1 mb-6 italic">
                "{testimonial.quote}"
              </p>

              {/* Author */}
              <div className="flex items-center gap-3">
                <img
                  src={testimonial.avatar}
                  alt={testimonial.name}
                  className="w-11 h-11 rounded-full object-cover flex-shrink-0"
                />
                <div>
                  <p className="font-semibold text-sm">{testimonial.name}</p>
                  <p className="text-xs text-muted-foreground">{testimonial.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TestimonialsSection;
