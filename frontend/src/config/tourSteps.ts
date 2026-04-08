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
  {
    target: '[data-tour="products-search"]',
    content:
      "Search through analyzed products by name or category to find what you're looking for quickly.",
  },
  {
    target: '[data-tour="products-new"]',
    content:
      "Want to analyze a product yourself? Click here to start a new analysis from scratch.",
  },
  {
    target: '[data-tour="products-grid"]',
    content:
      "Each card shows the product's sentiment score and how many themes were found. Click any card to open its full decision map.",
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
  {
    target: '[data-tour="amazon-search"]',
    content:
      'Type a product name here (e.g. "Sony WH-1000XM5") and press Search. HYVE will fetch the latest Amazon listings for you.',
  },
];

// ─── ABOUT PAGE ───
export const aboutSteps: Step[] = [
  {
    target: "body",
    content:
      "This page explains how HYVE works under the hood — from reading reviews to building the decision map.",
    placement: "center",
    disableBeacon: true,
  },
  {
    target: '[data-tour="about-how"]',
    content:
      "These three pillars sum up what HYVE does: AI reads reviews, builds a visual decision map, and scores every theme so you see the full picture at a glance.",
  },
];

// ─── A/B RESULTS PAGE ───
export const abResultsSteps: Step[] = [
  {
    target: "body",
    content:
      "This page shows real test data: people who used HYVE made decisions faster and more confidently than those who read reviews the old way.",
    placement: "center",
    disableBeacon: true,
  },
  {
    target: '[data-tour="ab-stats"]',
    content:
      "These numbers come from controlled tests comparing HYVE users to traditional review readers. The results speak for themselves.",
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
  if (pathname === "/about") return aboutSteps;
  if (pathname === "/test-analytics") return abResultsSteps;
  if (/^\/products\/\d+\/theme\/\d+$/.test(pathname)) return themeDetailsSteps;
  if (/^\/products\/\d+$/.test(pathname)) return exploreSteps;
  return [];
}

/** Ordered list of routes for the full-site sequence tour */
export const TOUR_SEQUENCE = [
  "/",
  "/products",
  "/amazon",
  "/about",
  "/test-analytics",
];

/** Returns the next route in the sequence, or null if at the end */
export function getNextSequenceRoute(current: string): string | null {
  const idx = TOUR_SEQUENCE.indexOf(current);
  if (idx === -1 || idx === TOUR_SEQUENCE.length - 1) return null;
  return TOUR_SEQUENCE[idx + 1];
}
