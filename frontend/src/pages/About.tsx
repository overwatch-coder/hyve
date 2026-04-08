import { Link } from "react-router-dom";
import {
  Hexagon,
  Activity,
  GitBranch,
  Sparkles,
  BarChart2,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function About() {
  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-10 animate-fade-in">
      {/* Hero */}
      <div className="flex flex-col items-center text-center gap-4 pt-4">
        <div className="relative">
          <Hexagon className="h-14 w-14 text-primary fill-primary/10" />
          <Activity className="h-6 w-6 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
        <h1 className="text-4xl font-black tracking-tight">About HYVE</h1>
        <p className="text-lg text-muted-foreground max-w-xl leading-relaxed">
          HYVE helps you make smarter shopping decisions. Instead of reading
          hundreds of product reviews, you get a clear visual map of what people
          love and what they don't — in seconds.
        </p>
      </div>

      {/* What it does */}
      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-bold">How it works</h2>
        <p className="text-muted-foreground leading-relaxed">
          HYVE uses AI to read through product reviews and pull out the key
          points. It groups similar feedback into themes (like "Battery Life" or
          "Build Quality"), figures out whether people feel positively or
          negatively about each theme, and shows everything in an interactive
          decision map you can explore.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-2">
          <Card className="border-border/40">
            <CardContent className="p-5 flex flex-col gap-2">
              <Sparkles className="h-6 w-6 text-primary" />
              <h3 className="font-bold">AI-Powered</h3>
              <p className="text-sm text-muted-foreground">
                Advanced AI reads every review and extracts the specific claims
                people make about a product.
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/40">
            <CardContent className="p-5 flex flex-col gap-2">
              <GitBranch className="h-6 w-6 text-primary" />
              <h3 className="font-bold">Decision Maps</h3>
              <p className="text-sm text-muted-foreground">
                See an interactive tree that breaks down themes, sentiments, and
                real user quotes at a glance.
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/40">
            <CardContent className="p-5 flex flex-col gap-2">
              <BarChart2 className="h-6 w-6 text-primary" />
              <h3 className="font-bold">Clear Scores</h3>
              <p className="text-sm text-muted-foreground">
                Every theme gets a sentiment score so you can quickly see
                strengths and weaknesses.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Who it's for */}
      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-bold">Who is it for?</h2>
        <ul className="list-disc list-inside text-muted-foreground space-y-2 leading-relaxed">
          <li>
            <strong className="text-foreground">Shoppers</strong> — quickly
            understand the real pros and cons before you buy.
          </li>
          <li>
            <strong className="text-foreground">Product teams</strong> — see
            what customers care about most and where to improve.
          </li>
          <li>
            <strong className="text-foreground">Researchers</strong> — turn
            unstructured review text into structured, visual insights.
          </li>
        </ul>
      </section>

      {/* CTA */}
      <div className="flex flex-col items-center gap-4 py-6 border-t border-border/40">
        <p className="text-muted-foreground text-sm">
          Ready to try it out?
        </p>
        <div className="flex gap-3">
          <Button asChild>
            <Link to="/amazon">
              Search Products <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/faq">Read the FAQ</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
