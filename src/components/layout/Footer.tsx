import { Link } from "react-router-dom";
import { Instagram, Facebook, Mail } from "lucide-react";
import blackLogo from "@/assets/Black_Logo.png";
import whiteLogo from "@/assets/White_Logo.png";
import { useTheme } from "@/contexts/ThemeContext";

const Footer = () => {
  const { theme } = useTheme();
  const logo = theme === "dark" ? whiteLogo : blackLogo;

  const columns = [
    {
      heading: "About",
      links: [
        { label: "About NomadNest", href: "/about" },
        { label: "How It Works", href: "/#how-it-works" },
        { label: "Contact", href: "/contact" },
      ],
    },
    {
      heading: "Community",
      links: [
        { label: "Safety & Trust", href: "/safety" },
        { label: "Community Standards", href: "/code-of-conduct" },
        { label: "FAQ", href: "/faq" },
        { label: "Member Perks", href: "/perks" },
      ],
    },
    {
      heading: "Legal",
      links: [
        { label: "Terms of Service", href: "/terms" },
        { label: "Privacy Policy", href: "/privacy" },
        { label: "Cookie Policy", href: "/cookies" },
      ],
    },
  ];

  const socials = [
    { icon: Instagram, label: "Instagram", href: "https://www.instagram.com/nomadnest.global" },
    { icon: Facebook, label: "Facebook", href: "https://www.facebook.com/profile.php?id=61573065826502" },
    { icon: Mail, label: "Email", href: "mailto:support@nomadnest.global" },
  ];

  // Phone: one compact block of links (design: HomePhone footer).
  const compact = [
    { label: "About", href: "/about" },
    { label: "How it works", href: "/#how-it-works" },
    { label: "Safety", href: "/safety" },
    { label: "FAQ", href: "/faq" },
    { label: "Contact", href: "/contact" },
    { label: "Code of conduct", href: "/code-of-conduct" },
    { label: "Privacy", href: "/privacy" },
    { label: "Terms", href: "/terms" },
    { label: "Cookies", href: "/cookies" },
  ];

  return (
    <footer className="mt-auto border-t border-border bg-surface">
      <div className="px-5 py-8 md:hidden">
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-4">
          {compact.map((link) => (
            <Link key={link.label} to={link.href} className="flex min-h-[44px] items-center text-[15px] text-muted-foreground hover:text-foreground">
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-5">
          <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} NomadNest</p>
          <div className="flex items-center gap-1">
            {socials.map((social) => (
              <a
                key={social.label}
                href={social.href}
                aria-label={social.label}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <social.icon className="h-5 w-5" aria-hidden="true" />
              </a>
            ))}
          </div>
        </div>
      </div>
      <div className="container hidden py-12 md:block">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Brand */}
          <div className="space-y-4 sm:col-span-2 lg:col-span-1">
            <Link to="/" className="inline-flex items-center">
              <img src={logo} alt="NomadNest" className="h-10 w-auto" />
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
              Where travellers find homes and pets find care. No booking fees. Just community.
            </p>
            <div className="flex items-center gap-3 pt-1">
              {socials.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  aria-label={social.label}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:bg-terracotta-light hover:text-primary transition-colors"
                >
                  <social.icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {columns.map((col) => (
            <div key={col.heading}>
              <h4 className="font-semibold text-sm mb-4 text-foreground">{col.heading}</h4>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.href}
                      className="text-sm text-muted-foreground hover:text-primary transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} NomadNest. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
