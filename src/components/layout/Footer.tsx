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
        { label: "Our Story", href: "/about" },
        { label: "Contact", href: "/contact" },
      ],
    },
    {
      heading: "Community",
      links: [
        { label: "Safety & Trust", href: "/safety" },
        { label: "Community Standards", href: "/code-of-conduct" },
        { label: "FAQ", href: "/faq" },
        { label: "Member Perks", href: "/membership" },
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
    { icon: Instagram, label: "Instagram", href: "https://instagram.com/nomadnest" },
    { icon: Facebook, label: "Facebook", href: "https://facebook.com/nomadnest" },
    { icon: Mail, label: "Email", href: "mailto:hello@nomadnest.global" },
  ];

  return (
    <footer className="hidden md:block bg-surface border-t border-border mt-auto">
      <div className="container py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Brand */}
          <div className="space-y-4 sm:col-span-2 lg:col-span-1">
            <Link to="/" className="inline-flex items-center">
              <img src={logo} alt="NomadNest" className="h-10 w-auto" />
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
              Where travellers find homes and pets find care. No booking fees. Just adventure.
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
          <p className="text-xs text-muted-foreground">
            Founded by travellers, for travellers.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
