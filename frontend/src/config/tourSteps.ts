import type { Step } from "react-joyride";

/**
 * Tour steps for the HYVE onboarding experience.
 * Steps are grouped by page so the tour can resume across routes.
 */

// ─── HOME PAGE ───
export const homeSteps: Step[] = [
  {
    target: "body",
    content:
      "Welcome to HYVE! We turn hundreds of product reviews into a simple visual map so you can make smarter decisions — fast. Let's show you around.",
    placement: "center",
    disableBeacon: true,
  },
  {
    target: '[data-tour="nav-analyzed"]',
    content:
      "Here you'll find products that have already been analyzed. Click to browse their decision maps.",
  },
  {
    target: '[data-tour="nav-products"]',
    content:
      "Search for new products to analyze. Right now Amazon is available — more sources are coming soon.",
  },
  {
    target: '[data-tour="nav-about"]',
    content:
      "Want to learn more about how HYVE works? Check the About page or FAQs.",
  },
  {
    target: '[data-tour="hero-section"]',
    content:
      "This is your home base. From here you can start a new analysis, search for products, or explore ones that are already done.",
  },
];

// ─── PRODUCTS (Analyzed) PAGE ───
export const productsSteps: Step[] = [
  {
    target: "body",
    content:
      "This is the Analyzed page. Every product listed here has been processed by our AI — click any one to see its decision map.",
    placement: "center",
    disableBeacon: true,
  },
];

// ─── EXPLORE (Decision Map) PAGE ───
export const exploreSteps: Step[] = [
  {
    target: "body",
    content:
      "This is the decision map — the heart of HYVE. The tree shows themes, sentiments, and real claims from reviews. Click any node to expand it.",
    placement: "center",
    disableBeacon: true,
  },
];

// ─── AMAZON SEARCH PAGE ───
export const amazonSteps: Step[] = [
  {
    target: "body",
    content:
      "Search for any product on Amazon. When you find one, HYVE will pull its reviews and analyze them for you.",
    placement: "center",
    disableBeacon: true,
  },
];

// ─── THEME DETAILS PAGE ───
export const themeDetailsSteps: Step[] = [
  {
    target: "body",
    content:
      "This page shows you every claim under a single theme — grouped into positive, negative, and neutral. Scroll down to see real quotes from reviewers.",
    placement: "center",
    disableBeacon: true,
  },
];

/**
 * Map route patterns to their step sets.
 * The tour controller matches the current pathname against these patterns.
 */
export function getStepsForRoute(pathname: string): Step[] {
  if (pathname === "/") return homeSteps;
  if (pathname === "/products") return productsSteps;
  if (pathname === "/amazon") return amazonSteps;
  if (/^\/products\/\d+\/theme\/\d+$/.test(pathname)) return themeDetailsSteps;
  if (/^\/products\/\d+$/.test(pathname)) return exploreSteps;
  return [];
}
