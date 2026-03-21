import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  TrendingUp,
  MessageSquare,
  Sparkles,
  GitBranch,
  ShieldCheck,
  UploadCloud,
  Layers,
  Zap,
  Bot,
  Link as LinkIcon,
  FileText,
  Loader2,
  Package,
  ShoppingCart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";

function FeaturedProducts() {
  const { data: products, isLoading } = useQuery({
    queryKey: ["products-list-home"],
    queryFn: async () => {
      const res = await api.get("/products");
      return (res.data.items as any[]).slice(0, 3);
    },
    staleTime: 1000 * 60 * 2,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-56 bg-muted animate-pulse rounded-2xl border border-border/40" />
        ))}
      </div>
    );
  }

  if (!products || products.length === 0) {
    return (
      <div className="col-span-full h-56 border-2 border-dashed border-border/40 rounded-3xl flex flex-col items-center justify-center gap-4 bg-muted/5">
        <Package className="h-10 w-10 text-muted-foreground/40" />
        <div className="text-center">
          <p className="font-bold text-muted-foreground text-sm">No analyses yet.</p>
          <Link to="/new">
            <button className="text-xs font-black text-primary uppercase tracking-widest mt-2 hover:underline underline-offset-4">
              Start your first analysis
            </button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
      {products.map((prod: any) => {
        const score = Math.round((prod.overall_sentiment_score ?? 0) * 100);
        const isPositive = score >= 60;
        return (
          <motion.div key={prod.id} whileHover={{ y: -8 }}>
            <Link to={`/products/${prod.id}`}>
              <Card className="border-border/40 hover:border-primary/50 transition-all shadow-sm hover:shadow-2xl overflow-hidden group">
                <CardContent className="p-0">
                  <div className="h-28 bg-primary/5 flex items-center justify-center text-5xl group-hover:scale-110 transition-transform duration-500">
                    📦
                  </div>
                  <div className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div className="min-w-0 pr-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground opacity-60 mb-1 truncate">
                          {prod.category || "General"}
                        </p>
                        <h3 className="text-lg font-bold group-hover:text-primary transition-colors line-clamp-1">
                          {prod.name}
                        </h3>
                      </div>
                      <div
                        className={cn(
                          "h-10 w-10 shrink-0 rounded-lg flex items-center justify-center font-black text-sm border-2",
                          isPositive
                            ? "border-emerald-500/20 text-emerald-500 bg-emerald-500/5"
                            : "border-rose-500/20 text-rose-500 bg-rose-500/5",
                        )}
                      >
                        {score}
                      </div>
                    </div>

                    <div className="w-full h-1.5 bg-gray-200/50 rounded-full flex overflow-hidden mb-3">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-700"
                        style={{ width: `${score}%` }}
                      />
                      <div
                        className="h-full bg-rose-500 transition-all duration-700"
                        style={{ width: `${100 - score}%` }}
                      />
                    </div>

                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary">
                      Open Decision Map <ArrowRight className="h-3 w-3" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </motion.div>
        );
      })}
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("paste");
  const [reviewsRaw, setReviewsRaw] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const ingestMutation = useMutation({
    mutationFn: async () => {
      if (activeTab === "url") {
        if (!url) throw new Error("Provide a URL to crawl.");
        const res = await api.post("/ingest/url", {
          url,
          name: null,
          category: "Technology",
        });
        return { type: "url", productId: res.data.product_id };
      }
      if (activeTab === "paste") {
        if (!reviewsRaw.trim()) throw new Error("Paste some reviews first.");
        const res = await api.post(`/ingest/raw`, { text: reviewsRaw });
        return { type: "raw_batch", results: res.data };
      }
      if (activeTab === "upload") {
        if (!file) throw new Error("Select a CSV file.");
        const formData = new FormData();
        formData.append("file", file);
        formData.append("fallback_category", "Technology");
        const res = await api.post("/ingest/csv", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        return { type: "batch", results: res.data };
      }
      return null;
    },
    onSuccess: (data: any) => {
      const productIds = data?.results?.product_ids || [];
      const firstId = productIds[0];
      const isMultiple = productIds.length > 1;
      const batchTag = isMultiple ? "?batch=true" : "";

      if (data?.type === "batch") {
        toast.success("Analysis Started", {
          description: "Hyve is processing your dataset in the background.",
        });
        if (firstId) {
          navigate(`/products/${firstId}${batchTag}`);
        } else {
          navigate("/products");
        }
      } else if (data?.type === "raw_batch") {
        toast.success("AI Synthesis Started", {
          description: "Extracting products and insights from your text...",
        });
        if (firstId) {
          navigate(`/products/${firstId}${batchTag}`);
        } else {
          navigate("/products");
        }
      } else if (data?.type === "url") {
        toast.success("AI Crawl Started", {
          description: "Fetching reviews and analyzing sentiment...",
        });
        navigate(`/products/${data.productId}`);
      }
      queryClient.invalidateQueries({ queryKey: ["products-list"] });
    },
    onError: (error: any) => {
      toast.error("Analysis Failed", {
        description: error.message || "Unauthorized or invalid input.",
      });
    },
  });

  return (
    <div className="flex flex-col min-h-screen bg-background -mt-8 overflow-x-hidden">
      {/* ── HERO SECTION ── */}
      <section className="relative pt-16 md:pt-32 pb-20 md:pb-32 px-4 md:px-6">
        {/* Abstract Background Blobs */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-primary/5 blur-[120px] rounded-full -z-10" />
        <div className="absolute top-40 right-[-10%] w-[500px] h-[500px] bg-emerald-500/5 blur-[100px] rounded-full -z-10" />

        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-16 items-center">
          {/* Left: Content */}
          <div className="lg:col-span-7 space-y-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-black text-primary uppercase tracking-[0.2em]"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Collective Intelligence Engine</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-4xl md:text-8xl font-black tracking-tight leading-none md:leading-[0.95] text-foreground"
            >
              Turn <span className="text-primary italic">Noise</span> Into{" "}
              <br className="hidden md:block" />
              <span className="bg-linear-to-r from-primary to-emerald-500 bg-clip-text text-transparent">
                Actionable
              </span>{" "}
              Clarity.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-lg md:text-2xl text-muted-foreground font-medium max-w-2xl leading-relaxed"
            >
              HYVE clusters thousands of raw reviews into a visual decision
              tree. Drill down from themes to specific claims in seconds.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex flex-wrap gap-4 pt-4 font-mono uppercase tracking-widest text-[10px] font-bold text-muted-foreground/60"
            >
              <div className="flex items-center gap-2">
                <Zap className="h-3 w-3 text-primary" />
                D3.js Visualization
              </div>
              <div className="flex items-center gap-2">
                <Bot className="h-3 w-3 text-primary" />
                Gemini 1.5 Pro AI
              </div>
              <div className="flex items-center gap-2">
                <Layers className="h-3 w-3 text-primary" />
                Sentiment Layering
              </div>
            </motion.div>
          </div>

          {/* Right: Ingestion UI (Glassmorphism) */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 }}
            className="lg:col-span-5 w-full max-w-md mx-auto lg:max-w-none"
          >
            <Card className="border-primary/20 bg-card/60 backdrop-blur-3xl shadow-[0_32px_64px_-16px_rgba(var(--primary),0.1)] overflow-hidden">
              <div className="p-4 md:p-6 border-b border-border/30 bg-primary/5">
                <h2 className="text-base md:text-lg font-black uppercase tracking-widest flex items-center gap-2">
                  <UploadCloud className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                  Quick Analyze
                </h2>
                <p className="text-xs md:text-sm text-muted-foreground font-medium mt-1">
                  Upload reviews to generate your map
                </p>
              </div>

              <div className="p-4 md:p-6">
                <Tabs
                  value={activeTab}
                  onValueChange={setActiveTab}
                  className="w-full"
                >
                  <TabsList className="grid w-full grid-cols-4 h-10 p-1 bg-muted/30 rounded-lg mb-6">
                    <TabsTrigger
                      value="paste"
                      className="text-[10px] sm:text-xs font-black uppercase tracking-widest gap-2"
                    >
                      <FileText className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Paste</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="upload"
                      className="text-[10px] sm:text-xs font-black uppercase tracking-widest gap-2"
                    >
                      <UploadCloud className="h-3.5 w-3.5" /> <span className="hidden sm:inline">File</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="url"
                      className="text-[10px] sm:text-xs font-black uppercase tracking-widest gap-2"
                    >
                      <LinkIcon className="h-3.5 w-3.5" /> <span className="hidden sm:inline">URL</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="amazon"
                      className="text-[10px] sm:text-xs font-black uppercase tracking-widest gap-2"
                    >
                      <ShoppingCart className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Amazon</span>
                    </TabsTrigger>
                  </TabsList>

                  <div className="min-h-[160px]">
                    <AnimatePresence mode="wait">
                      {activeTab === "paste" && (
                        <motion.div
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -10 }}
                          key="paste"
                        >
                          <textarea
                            className="w-full h-32 p-4 rounded-xl bg-background/50 border border-border/50 text-sm font-medium focus:ring-2 ring-primary/20 outline-none resize-none transition-all"
                            placeholder="Paste unstructured feedback here..."
                            value={reviewsRaw}
                            onChange={(e) => setReviewsRaw(e.target.value)}
                          />
                        </motion.div>
                      )}

                      {activeTab === "upload" && (
                        <motion.div
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -10 }}
                          key="upload"
                        >
                          <div
                            className="w-full h-32 border-2 border-dashed border-primary/20 rounded-xl flex flex-col items-center justify-center bg-primary/5 hover:bg-primary/10 transition-colors cursor-pointer"
                            onClick={() =>
                              document.getElementById("file-hero")?.click()
                            }
                          >
                            <UploadCloud className="h-8 w-8 text-primary/40 mb-2" />
                            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                              {file ? file.name : "Choose CSV or Excel"}
                            </span>
                            <input
                              id="file-hero"
                              type="file"
                              className="hidden"
                              onChange={(e) =>
                                setFile(e.target.files?.[0] || null)
                              }
                            />
                          </div>
                        </motion.div>
                      )}

                      {activeTab === "url" && (
                        <motion.div
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -10 }}
                          key="url"
                        >
                          <Input
                            className="h-14 rounded-xl bg-background/50 border border-border/50 font-medium"
                            placeholder="https://amazon.com/product-link"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                          />
                          <p className="text-[10px] font-bold text-muted-foreground mt-3 uppercase tracking-widest flex items-center gap-1.5 opacity-60">
                            <Bot className="h-3 w-3 text-primary" /> Multi-Agent
                            Scraping Enabled
                          </p>
                        </motion.div>
                      )}

                      {activeTab === "amazon" && (
                        <motion.div
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -10 }}
                          key="amazon"
                        >
                          <div className="flex flex-col items-center justify-center h-32 text-center">
                             <ShoppingCart className="h-8 w-8 text-primary/40 mb-2" />
                             <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                               Browse Amazon Catalog
                             </span>
                             <p className="text-[10px] mt-2 text-muted-foreground/60 w-3/4">
                               Discover, analyze, and leave reviews for products via Canopy.
                             </p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <Button
                    className="w-full h-14 rounded-xl mt-6 font-black uppercase tracking-[0.2em] shadow-lg shadow-primary/20 group"
                    onClick={() => {
                      if (activeTab === "amazon") {
                        navigate("/amazon");
                      } else {
                        ingestMutation.mutate();
                      }
                    }}
                    disabled={activeTab !== "amazon" && ingestMutation.isPending}
                  >
                    {activeTab !== "amazon" && ingestMutation.isPending ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        {activeTab === "amazon" ? "Open Catalog" : "Ignite Analysis"}
                        <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                      </>
                    )}
                  </Button>
                </Tabs>
              </div>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* ── FEATURED ANALYSES (The "Products" section) ── */}
      <section className="py-16 md:py-24 px-4 md:px-6 bg-muted/20">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 md:mb-12 gap-6">
            <div>
              <p className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.3em] text-primary mb-2">
                Live Examples
              </p>
              <h2 className="text-3xl md:text-4xl font-black tracking-tighter">
                Community Hyped Products
              </h2>
            </div>
            <Link to="/products" className="w-full md:w-auto">
              <Button
                variant="ghost"
                className="w-full md:w-auto font-bold uppercase tracking-widest text-[10px] justify-between md:justify-center"
              >
                Explore All Intelligence{" "}
                <ArrowRight className="ml-2 h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>

          <FeaturedProducts />
        </div>
      </section>

      {/* ── CORE DIFFERENTIATORS ── */}
      <section className="py-24 px-6 border-t border-border/30">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
            {[
              {
                icon: GitBranch,
                title: "Drill-Down Logic",
                desc: "No more overall scores. Navigate from themes to specific verified claims.",
              },
              {
                icon: TrendingUp,
                title: "Conflict Detection",
                desc: "AI identifies when reviews disagree and highlights the tension points.",
              },
              {
                icon: MessageSquare,
                title: "Chat-with-Review",
                desc: "Ask our AI assistant specific questions and get answers cited from the dataset.",
              },
              {
                icon: ShieldCheck,
                title: "Source Integrity",
                desc: "Every claim mapped back to original text. Full transparency, zero hallucination.",
              },
            ].map((feature, i) => (
              <div key={i} className="space-y-4">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                  <feature.icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold uppercase tracking-tight">
                  {feature.title}
                </h3>
                <p className="text-sm font-medium text-muted-foreground leading-relaxed">
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER-ISH CTA ── */}
      <section className="py-20 md:py-32 px-4 md:px-6 text-center bg-primary/5">
        <div className="max-w-3xl mx-auto space-y-6 md:space-y-8">
          <Trophy className="h-10 w-10 md:h-12 md:w-12 text-primary mx-auto opacity-50" />
          <h2 className="text-3xl md:text-5xl font-black tracking-tighter">
            Ready to Buy Smarter?
          </h2>
          <p className="text-lg md:text-xl text-muted-foreground font-medium">
            Join 5,000+ shoppers and product teams using collective intelligence
            to make better decisions.
          </p>
          <Button
            size="lg"
            className="w-full md:w-auto h-14 md:h-16 px-12 rounded-2xl font-black uppercase tracking-[0.3em] text-xs"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            Analyze Your First Product
          </Button>
        </div>
      </section>
    </div>
  );
}

const Trophy = (props: any) => (
  <svg
    {...props}
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
    <path d="M4 22h16" />
    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
  </svg>
);
