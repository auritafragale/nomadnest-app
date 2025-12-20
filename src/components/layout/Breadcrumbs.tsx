import { ChevronRight, Home } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items?: BreadcrumbItem[];
  showHome?: boolean;
}

const routeLabels: Record<string, string> = {
  dashboard: "Dashboard",
  "browse-sits": "Browse Sits",
  "browse-sitters": "Browse Sitters",
  inbox: "Messages",
  applications: "Applications",
  saved: "Saved Listings",
  settings: "Settings",
  contact: "Contact",
  "create-listing": "Create Listing",
  "edit-listing": "Edit Listing",
  listing: "Listing",
  sitter: "Sitter Profile",
  owner: "Owner Profile",
  "edit-sitter-profile": "Edit Sitter Profile",
  "edit-owner-profile": "Edit Owner Profile",
  terms: "Terms of Service",
  privacy: "Privacy Policy",
};

const Breadcrumbs = ({ items, showHome = true }: BreadcrumbsProps) => {
  const location = useLocation();
  
  // Generate breadcrumbs from URL if items not provided
  const generateBreadcrumbs = (): BreadcrumbItem[] => {
    if (items) return items;
    
    const pathSegments = location.pathname.split("/").filter(Boolean);
    const breadcrumbs: BreadcrumbItem[] = [];
    
    pathSegments.forEach((segment, index) => {
      // Skip UUID segments (listing IDs, user IDs, etc.)
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) {
        return;
      }
      
      const label = routeLabels[segment] || segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " ");
      const href = "/" + pathSegments.slice(0, index + 1).join("/");
      
      breadcrumbs.push({
        label,
        href: index === pathSegments.length - 1 ? undefined : href,
      });
    });
    
    return breadcrumbs;
  };
  
  const breadcrumbItems = generateBreadcrumbs();
  
  if (breadcrumbItems.length === 0) return null;
  
  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex items-center gap-1.5 text-sm text-muted-foreground flex-wrap">
        {showHome && (
          <>
            <li>
              <Link 
                to="/" 
                className="flex items-center gap-1 hover:text-foreground transition-colors"
                aria-label="Home"
              >
                <Home className="w-4 h-4" />
                <span className="sr-only sm:not-sr-only">Home</span>
              </Link>
            </li>
            <li aria-hidden="true">
              <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
            </li>
          </>
        )}
        {breadcrumbItems.map((item, index) => (
          <li key={index} className="flex items-center gap-1.5">
            {item.href ? (
              <Link 
                to={item.href} 
                className="hover:text-foreground transition-colors"
              >
                {item.label}
              </Link>
            ) : (
              <span className="text-foreground font-medium" aria-current="page">
                {item.label}
              </span>
            )}
            {index < breadcrumbItems.length - 1 && (
              <ChevronRight className="w-4 h-4 text-muted-foreground/50" aria-hidden="true" />
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
};

export default Breadcrumbs;
