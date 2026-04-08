import { Link } from "react-router-dom";
import { HelpCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    q: "What is HYVE?",
    a: "HYVE is an AI-powered tool that reads product reviews and turns them into a visual decision map. Instead of scrolling through hundreds of comments, you see the key themes, their sentiment scores, and the real claims people make — all in one interactive view.",
  },
  {
    q: "How does the AI analysis work?",
    a: "When reviews are submitted, our AI reads every review and extracts specific claims (like \"battery drains fast\" or \"great camera quality\"). It then groups similar claims into themes, calculates how positive or negative each theme is, and builds the decision map you see on screen.",
  },
  {
    q: "Where do the reviews come from?",
    a: "Right now you can search for products on Amazon directly from HYVE. You can also upload your own reviews via CSV or paste a product URL. We're working on adding more sources like Jumia and Alibaba soon.",
  },
  {
    q: "Is the analysis accurate?",
    a: "The AI does a good job of capturing the main points from reviews, but it's not perfect. We recommend using HYVE as a starting point for your research, not as your only source. The disclaimer at the top of the site is a reminder of that.",
  },
  {
    q: "What do the sentiment scores mean?",
    a: "Each theme shows a percentage score. A score of 80% means that 80% of the mentions about that theme are positive. Higher scores indicate topics where users are generally happy; lower scores highlight areas of concern.",
  },
  {
    q: "What is the decision map?",
    a: "The decision map is the interactive visual tree you see when you open a product. At the top is the product, then it branches into themes (like \"Battery\" or \"Design\"), then into positive and negative sentiment groups, and finally into the actual claims from real reviews.",
  },
  {
    q: "Can I analyse my own product reviews?",
    a: "Yes! Click \"New Analysis\" from the home page. You can paste review text, upload a CSV file, or enter a product URL. HYVE will process the reviews and build a decision map for you.",
  },
  {
    q: "Is HYVE free to use?",
    a: "HYVE is currently free during its development phase. The platform is an academic project built to explore how AI can make consumer reviews easier to understand.",
  },
];

export default function FAQ() {
  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-8 animate-fade-in">
      <div className="flex flex-col gap-3 pt-4">
        <div className="flex items-center gap-3">
          <HelpCircle className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-black tracking-tight">
            Frequently Asked Questions
          </h1>
        </div>
        <p className="text-muted-foreground">
          Quick answers to the most common questions about HYVE.
        </p>
      </div>

      <Accordion type="single" collapsible className="w-full">
        {faqs.map((faq, i) => (
          <AccordionItem key={i} value={`faq-${i}`}>
            <AccordionTrigger className="text-left font-semibold">
              {faq.q}
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed">
              {faq.a}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      <div className="flex gap-3 py-4 border-t border-border/40">
        <Button variant="outline" size="sm" asChild>
          <Link to="/about">
            <ArrowLeft className="h-4 w-4 mr-1" />
            About HYVE
          </Link>
        </Button>
        <Button size="sm" asChild>
          <Link to="/amazon">Search Products</Link>
        </Button>
      </div>
    </div>
  );
}
