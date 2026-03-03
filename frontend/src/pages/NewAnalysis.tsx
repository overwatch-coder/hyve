import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";
import {
  Loader2,
  Sparkles,
  UploadCloud,
  Link as LinkIcon,
  FileText,
  Bot,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";

export default function NewAnalysis() {
  const [autoDetect, setAutoDetect] = useState(true);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Technology");

  // Ingestion Sources State
  const [activeTab, setActiveTab] = useState("paste");
  const [reviewsRaw, setReviewsRaw] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");

  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const ingestMutation = useMutation({
    mutationFn: async () => {
      // 1. URL CRAWL
      if (activeTab === "url") {
        if (!url) throw new Error("Please provide a product URL to crawl.");

        const res = await api.post("/ingest/url", {
          url,
          name: autoDetect ? null : name,
          category: autoDetect ? "Uncategorized" : category,
          product_id: null,
        });
        return { type: "url", productId: res.data.product_id };
      }

      // 2. PASTE TEXT
      if (activeTab === "paste") {
        const reviewLines = reviewsRaw
          .split(/\n+/)
          .map((line) => line.trim())
          .filter((line) => line.length > 5);

        if (reviewLines.length === 0) {
          throw new Error("Please provide at least one valid review.");
        }

        // If Auto-Detect is enabled, send to the generic raw endpoint
        if (autoDetect) {
          await api.post(`/ingest/raw`, {
            text: reviewsRaw,
          });
          return { type: "raw_batch" };
        } else {
          // Manual fallback: Create single product then ingest
          const prodRes = await api.post("/products", {
            name,
            category,
          });
          const productId = prodRes.data.id;

          const reviewsPayload = reviewLines.map((text) => ({
            text,
            source: "manual",
            star_rating: 5,
          }));

          await api.post(`/products/${productId}/ingest`, {
            reviews: reviewsPayload,
          });
          return { type: "single", productId };
        }
      }

      // 3. UPLOAD FILE
      if (activeTab === "upload") {
        if (!file) throw new Error("Please select a file to upload.");

        const formData = new FormData();
        formData.append("file", file);
        formData.append(
          "fallback_category",
          autoDetect ? "Uncategorized" : category,
        );
        // Note: For now, the existing `/ingest/csv` backend handles files
        // and we will intercept it on the backend if autoDetect rules apply.

        const res = await api.post("/ingest/csv", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        return { type: "batch", results: res.data };
      }

      return null;
    },
    onSuccess: (data: any) => {
      if (data?.type === "batch") {
        toast.success("Batch Ingestion Started", {
          description: `Processed ${data.results.reviews_added} reviews for ${data.results.products_created.length} products.`,
        });
        navigate("/dashboard");
      } else if (data?.type === "raw_batch") {
        toast.success("AI Analysis Started", {
          description:
            "Hyve is analyzing the raw text and automatically creating products.",
        });
        navigate("/dashboard");
      } else if (data?.type === "url") {
        toast.success("AI Crawl Started", {
          description: "We are currently scraping and analyzing the URL.",
        });
        navigate(`/products/${data.productId}`);
      } else if (data?.type === "single") {
        toast.success("Analysis Complete", {
          description: `Successfully analyzed the product.`,
        });
        navigate(`/products/${data.productId}`);
      }

      queryClient.invalidateQueries({ queryKey: ["products-list"] });
      queryClient.invalidateQueries({ queryKey: ["platform-stats"] });
    },
    onError: (error: any) => {
      toast.error("Analysis Failed", {
        description:
          error.response?.data?.detail ||
          error.message ||
          "An unexpected error occurred.",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!autoDetect && (!name || !category)) {
      toast.error("Missing Fields", {
        description:
          "Please provide a name and category when Auto-Detect is off.",
      });
      return;
    }
    if (activeTab === "paste" && !reviewsRaw) return;
    if (activeTab === "upload" && !file) return;
    if (activeTab === "url" && !url) return;

    ingestMutation.mutate();
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">New Analysis</h1>
        <p className="text-muted-foreground mt-2">
          Ingest consumer reviews from any source. Let HYVE's AI automatically
          extract claims, cluster themes, and calculate sentiment.
        </p>
      </div>

      <div className="border border-border/50 bg-card/30 backdrop-blur-md rounded-xl p-6 sm:p-8 space-y-8 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* AI Toggle Header */}
          <div className="flex items-center justify-between p-4 bg-primary/5 border border-primary/20 rounded-lg">
            <div className="flex gap-4 items-center">
              <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                <Bot className="h-5 w-5 text-primary" />
              </div>
              <div className="space-y-0.5">
                <Label
                  htmlFor="auto-detect"
                  className="text-base font-semibold cursor-pointer"
                >
                  Auto-Detect Products & Categories
                </Label>
                <p className="text-sm text-muted-foreground">
                  HYVE will use AI to automatically identify products and group
                  reviews from raw text or files.
                </p>
              </div>
            </div>
            <Switch
              id="auto-detect"
              checked={autoDetect}
              onCheckedChange={setAutoDetect}
              disabled={ingestMutation.isPending}
            />
          </div>

          {/* Manual Meta Fields */}
          {!autoDetect && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 animate-in fade-in zoom-in-95 duration-300">
              <div className="space-y-2">
                <Label htmlFor="name">Product Name</Label>
                <Input
                  id="name"
                  placeholder="e.g. ProBuds 500"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required={!autoDetect}
                  disabled={ingestMutation.isPending}
                  className="bg-background/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  placeholder="e.g. Electronics"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  required={!autoDetect}
                  disabled={ingestMutation.isPending}
                  className="bg-background/50"
                />
              </div>
            </div>
          )}

          {/* Ingestion Source Tabs */}
          <div className="space-y-4">
            <Label className="text-lg font-semibold">Data Source</Label>
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-3 h-12 p-1 bg-muted/50 rounded-lg">
                <TabsTrigger
                  value="paste"
                  className="gap-2 rounded-md transition-all"
                >
                  <FileText className="h-4 w-4" />{" "}
                  <span className="hidden sm:inline">Paste Text</span>
                </TabsTrigger>
                <TabsTrigger
                  value="upload"
                  className="gap-2 rounded-md transition-all"
                >
                  <UploadCloud className="h-4 w-4" />{" "}
                  <span className="hidden sm:inline">Upload File</span>
                </TabsTrigger>
                <TabsTrigger
                  value="url"
                  className="gap-2 rounded-md transition-all"
                >
                  <LinkIcon className="h-4 w-4" />{" "}
                  <span className="hidden sm:inline">Crawl URL</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent
                value="paste"
                className="space-y-2 mt-6 animate-in fade-in"
              >
                <Label htmlFor="reviews">Raw Reviews</Label>
                <Textarea
                  id="reviews"
                  className="resize-none h-64 font-mono text-sm bg-background/50 leading-relaxed"
                  placeholder="Paste unstructured reviews here...&#10;&#10;e.g.&#10;The Dyson V15 battery life is amazing but it's too heavy.&#10;Sony WH-1000XM5 noise cancellation is top notch, highly recommend.&#10;..."
                  value={reviewsRaw}
                  onChange={(e) => setReviewsRaw(e.target.value)}
                  disabled={ingestMutation.isPending}
                />
                {autoDetect && (
                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3 text-primary" /> You can paste
                    data for multiple distinct products. HYVE will separate them
                    automatically.
                  </p>
                )}
              </TabsContent>

              <TabsContent
                value="upload"
                className="space-y-4 mt-6 animate-in fade-in"
              >
                <div className="space-y-2">
                  <Label htmlFor="file">CSV or Excel File</Label>
                  <div
                    className="border-2 border-dashed border-border/50 rounded-xl p-10 flex flex-col items-center justify-center text-center bg-muted/10 hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => document.getElementById("file")?.click()}
                  >
                    <UploadCloud className="h-10 w-10 text-primary mb-4 opacity-80" />
                    <p className="text-base font-semibold">
                      Click to upload or drag & drop
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      .csv, .xlsx up to 10MB
                    </p>
                    <Input
                      id="file"
                      type="file"
                      accept=".csv,.xlsx"
                      className="hidden"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      className="mt-6 pointer-events-none"
                    >
                      Select File
                    </Button>
                  </div>
                  {file && (
                    <p className="text-sm font-medium text-emerald-500 flex items-center gap-2 mt-2">
                      <Sparkles className="h-4 w-4" /> Selected: {file.name}
                    </p>
                  )}
                </div>
              </TabsContent>

              <TabsContent
                value="url"
                className="space-y-2 mt-6 animate-in fade-in"
              >
                <Label htmlFor="url">Product Page URL</Label>
                <div className="flex gap-3">
                  <Input
                    id="url"
                    type="url"
                    className="h-12 text-base bg-background/50"
                    placeholder="https://example.com/product/123"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    disabled={ingestMutation.isPending}
                  />
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Our AI agents will navigate to this page and extract consumer
                  reviews automatically using Playwright & BeautifulSoup.
                </p>
              </TabsContent>
            </Tabs>
          </div>

          <div className="pt-6 border-t border-border/30 flex justify-end gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(-1)}
              disabled={ingestMutation.isPending}
              className="w-32"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="w-40"
              disabled={ingestMutation.isPending}
            >
              {ingestMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Start Analysis
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
