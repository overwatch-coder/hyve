import { Link, useNavigate } from "react-router-dom";
import {
  Search,
  ArrowRight,
  TrendingUp,
  MessageSquare,
  Sparkles,
  GitBranch,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useState } from "react";

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/dashboard?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background -mt-8">
      {/* ── HERO SECTION ── */}
      <section className="relative flex flex-col items-center text-center pt-24 pb-20 px-4">
        <div className="absolute inset-0 z-0 bg-linear-to-b from-primary/5 to-transparent pointer-events-none" />

        {/* Animated grid background */}
        <div
          className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(to right, var(--foreground) 1px, transparent 1px), linear-gradient(to bottom, var(--foreground) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        <div className="relative z-10 max-w-4xl mx-auto flex flex-col items-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-xs font-bold text-primary mb-8 uppercase tracking-widest shadow-sm">
            <Sparkles className="h-3.5 w-3.5" />
            <span>AI-powered review intelligence</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-foreground leading-[1.1] mb-6">
            Cut through the{" "}
            <span className="text-primary underline decoration-primary/30 underline-offset-12">
              noise
            </span>
            .<br />
            Buy with clarity.
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground font-medium max-w-2xl mb-12">
            HYVE analyzes thousands of product reviews and distills them into an
            interactive decision tree so you see exactly what matters, backed
            by real evidence.
          </p>

          {/* Large Search Bar */}
          <form
            onSubmit={handleSearch}
            className="w-full max-w-2xl relative mb-8 group"
          >
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
            </div>
            <Input
              type="text"
              placeholder='Try "Sony WH-1000XM5" or "NovaPhone X12"...'
              className="w-full pl-12 pr-32 py-8 text-lg rounded-2xl bg-card border-2 border-border/50 focus-visible:ring-primary/20 focus-visible:border-primary shadow-xl transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <div className="absolute inset-y-2 right-2">
              <Button
                type="submit"
                size="lg"
                className="h-full px-8 rounded-xl font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-md transition-all"
              >
                Analyze
              </Button>
            </div>
          </form>

          {/* Quick Links */}
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm font-medium text-muted-foreground">
            <Link
              to="/products/1"
              className="hover:text-primary transition-colors flex items-center gap-1"
            >
              MacBook Pro M4 <ArrowRight className="h-3 w-3" />
            </Link>
            <Link
              to="/products/2"
              className="hover:text-primary transition-colors flex items-center gap-1"
            >
              Galaxy S25 Ultra <ArrowRight className="h-3 w-3" />
            </Link>
            <Link
              to="/products/3"
              className="hover:text-primary transition-colors flex items-center gap-1"
            >
              Dyson V15 <ArrowRight className="h-3 w-3" />
            </Link>
            <Link
              to="/products/4"
              className="hover:text-primary transition-colors flex items-center gap-1"
            >
              NovaPhone X12 <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </section>

      <div className="w-full border-t border-border/40" />

      {/* ── STATS SECTION ── */}
      <section className="py-12 bg-card/30">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 divide-x divide-border/20 text-center">
          <div className="flex flex-col items-center">
            <p className="text-4xl font-black text-primary mb-2">500+</p>
            <p className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
              Reviews per analysis
            </p>
          </div>
          <div className="flex flex-col items-center">
            <p className="text-4xl font-black text-primary mb-2">12</p>
            <p className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
              Product categories
            </p>
          </div>
          <div className="flex flex-col items-center">
            <p className="text-4xl font-black text-primary mb-2">94%</p>
            <p className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
              Claim accuracy
            </p>
          </div>
          <div className="flex flex-col items-center">
            <p className="text-4xl font-black text-primary mb-2">&lt; 30s</p>
            <p className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
              Analysis time
            </p>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="py-24 bg-muted/20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs uppercase tracking-widest font-bold text-primary mb-4">
              How it works
            </p>
            <h2 className="text-4xl font-extrabold tracking-tight mb-4 text-foreground">
              From 5,000 reviews to one clear answer
            </h2>
            <p className="text-muted-foreground font-medium max-w-2xl mx-auto text-lg">
              HYVE transforms unstructured review data into a structured
              decision framework in seconds.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                num: "01",
                icon: Search,
                title: "Search any product",
                desc: "Enter a product name. HYVE fetches and analyzes thousands of reviews from across the web instantly.",
              },
              {
                num: "02",
                icon: Sparkles,
                title: "AI clusters the signal",
                desc: "Our models group reviews into themes - Battery, Camera, Build Quality - and extract concrete claims with confidence scores.",
              },
              {
                num: "03",
                icon: GitBranch,
                title: "Explore the decision tree",
                desc: "Navigate an interactive tree: zoom into themes, drill into claims, and read the verbatim evidence behind every insight.",
              },
              {
                num: "04",
                icon: ShieldCheck,
                title: "Decide with confidence",
                desc: "Get a clear verdict summary and a visual breakdown that shows exactly what real buyers love - and what to watch out for.",
              },
            ].map((step, i) => (
              <Card
                key={i}
                className="border-border/40 bg-card hover:border-primary/30 transition-all hover:shadow-lg shadow-sm"
              >
                <CardContent className="p-8">
                  <div className="flex justify-between items-start mb-6">
                    <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                      <step.icon className="h-6 w-6" />
                    </div>
                    <span className="text-4xl font-black text-muted-foreground/20">
                      {step.num}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold mb-3">{step.title}</h3>
                  <p className="text-muted-foreground text-sm font-medium leading-relaxed">
                    {step.desc}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── POPULAR PRODUCTS ── */}
      <section className="py-24 px-6 max-w-6xl mx-auto w-full">
        <div className="flex justify-between items-end mb-10">
          <div>
            <p className="text-xs uppercase tracking-widest font-bold text-primary mb-2">
              Featured Analyses
            </p>
            <h2 className="text-3xl font-bold tracking-tight text-foreground">
              Popular right now
            </h2>
          </div>
          <Link
            to="/dashboard"
            className="text-sm font-bold text-primary flex items-center gap-1 hover:underline"
          >
            View all <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              name: "NovaPhone X12",
              brand: "NovaTech",
              price: "$799",
              score: 74,
              scoreColor: "text-emerald-500",
              reviews: "5,842",
              tags: ["Camera", "Battery Life", "Display"],
              img: "📱",
            },
            {
              name: "Galaxy S25 Ultra",
              brand: "Samsung",
              price: "$1,299",
              score: 88,
              scoreColor: "text-emerald-500",
              reviews: "12,041",
              tags: ["S Pen", "Camera", "Battery Life"],
              img: "📱",
            },
            {
              name: "Pixel 9 Pro",
              brand: "Google",
              price: "$999",
              score: 82,
              scoreColor: "text-emerald-500",
              reviews: "7,214",
              tags: ["AI Features", "Camera", "Software"],
              img: "📱",
            },
          ].map((prod, i) => (
            <Link key={i} to={`/products/${i + 1}`}>
              <Card className="border-border/40 hover:border-primary/50 transition-all cursor-pointer group hover:shadow-xl shadow-sm bg-card overflow-hidden">
                <CardContent className="p-6">
                  <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-4">
                      <div className="h-16 w-16 bg-secondary/50 rounded-xl flex items-center justify-center text-3xl">
                        {prod.img}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-muted-foreground mb-1">
                          {prod.brand}
                        </p>
                        <h3 className="text-lg font-bold group-hover:text-primary transition-colors">
                          {prod.name}
                        </h3>
                        <p className="text-sm font-medium text-muted-foreground">
                          {prod.price}
                        </p>
                      </div>
                    </div>
                    <div
                      className={`h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center font-black ${prod.scoreColor}`}
                    >
                      {prod.score}
                    </div>
                  </div>

                  <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden mb-4 flex">
                    <div
                      className="h-full bg-emerald-500"
                      style={{ width: `${prod.score}%` }}
                    />
                    <div
                      className="h-full bg-rose-500"
                      style={{ width: `${100 - prod.score}%` }}
                    />
                  </div>

                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-4">
                    <MessageSquare className="h-3.5 w-3.5" />
                    {prod.reviews} reviews analyzed
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {prod.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2.5 py-1 rounded-full bg-secondary text-[10px] font-bold text-muted-foreground uppercase tracking-wider"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* ── BOTTOM CTA ── */}
      <section className="py-24 bg-primary/5 text-center px-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-primary/5" />
        <div className="relative z-10 max-w-2xl mx-auto flex flex-col items-center">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
            <TrendingUp className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-4">
            Ready to make smarter buying decisions?
          </h2>
          <p className="text-muted-foreground font-medium mb-10 text-lg">
            Stop scrolling through hundreds of reviews. Let HYVE surface what
            matters in seconds.
          </p>
          <div className="relative w-full max-w-lg mb-4 shadow-2xl rounded-xl">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-muted-foreground" />
            </div>
            <Input
              type="text"
              placeholder="Search a product to get started..."
              className="w-full pl-10 pr-28 py-6 rounded-xl bg-card border-border/50"
            />
            <div className="absolute inset-y-1 right-1">
              <Button className="h-full px-6 rounded-lg font-bold">
                Analyze
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
