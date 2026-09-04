import { forwardRef, type SVGProps } from "react";

/**
 * Lucide does not ship horse or snake glyphs, so these two follow the same
 * stroke conventions (24x24, currentColor, 2px stroke) as the lucide set.
 */
const base = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const Horse = forwardRef<SVGSVGElement, SVGProps<SVGSVGElement>>(
  ({ width = 24, height = 24, ...props }, ref) => (
    <svg ref={ref} width={width} height={height} {...base} {...props}>
      <path d="M4 20v-4a6 6 0 0 1 6-6h3l3.5-3.5" />
      <path d="M16.5 6.5 15 4l3-1 2 2.5c1.2 1.5 1.3 3.6.2 5.2L18 13v7" />
      <path d="M13 10v10" />
      <path d="M8 20v-3" />
      <path d="M18.5 5.5h.01" />
    </svg>
  ),
);
Horse.displayName = "Horse";

export const Snake = forwardRef<SVGSVGElement, SVGProps<SVGSVGElement>>(
  ({ width = 24, height = 24, ...props }, ref) => (
    <svg ref={ref} width={width} height={height} {...base} {...props}>
      <path d="M17 5.5a2.5 2.5 0 1 0-5 0c0 3 5 3 5 6a3 3 0 0 1-3 3H9a3.5 3.5 0 0 0 0 7h9" />
      <path d="M15 4.5h.01" />
      <path d="M20 21.5c-.8-.6-1.4-1.2-2-2" />
    </svg>
  ),
);
Snake.displayName = "Snake";
