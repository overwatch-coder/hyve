import { useState, useEffect } from "react";
import "@xyflow/react/dist/style.css";
import ExperimentMode from "@/components/ExperimentMode";
import ExploreCore from "@/components/ExploreCore";
import {
  Search as SearchIcon,
  X,
  ChevronRight,
  Sparkles,
  CheckCircle2,
  GitBranch,
  Loader2,
  Bot,
  Zap,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { AnimatePresence, motion } from "framer-motion";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ══════════════════════════════════════════════
   Main Component
   ══════════════════════════════════════════════ */
function ExploreInner() {
  const { productId } = useParams<{ productId: string }>();
  const [searchParams] = useSearchParams();
  const isBatch = searchParams.get("batch") === "true";

  // FETCH: Deep Product Structure (Tree & Claims)
  const {
    data: productData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["product-deep", productId],
    queryFn: async () => {
      const res = await api.get(`/products/${productId}`);
      return res.data;
    },
    enabled: !!productId,
    refetchInterval: (q) =>
      q.state.data?.status === "processing" ? 2000 : false,
  });

  // FETCH: Product Analytics
  const { data: analyticsData } = useQuery({
    queryKey: ["product-analytics", productId],
    queryFn: async () => {
      const res = await api.get(`/products/${productId}/analytics`);
      return res.data;
    },
    enabled: !!productId,
  });

  const [viewMode, setViewMode] = useState<"accordion" | "graph">("graph");
  const [isExperimentMode, setIsExperimentMode] = useState(false);
  const [processingDone, setProcessingDone] = useState(false);
  // Only show modal when product transitions from processing → ready, not on initial load of ready products
  const [showModal, setShowModal] = useState(false);
  const [hasBeenProcessing, setHasBeenProcessing] = useState(false);

  // Track when product starts processing — only open modal then
  useEffect(() => {
    if (productData?.status === "processing") {
      setHasBeenProcessing(true);
      setShowModal(true);
      setProcessingDone(false);
    }
  }, [productData?.status]);

  // When product becomes ready AFTER having been processing → mark done
  useEffect(() => {
    if (
      productData?.status === "ready" &&
      hasBeenProcessing &&
      !processingDone
    ) {
      setProcessingDone(true);
      // Keep modal open so user sees the completion screen — they close it manually
    }
  }, [productData?.status, hasBeenProcessing, processingDone]);

  if (isLoading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center gap-4 bg-background">
        <div className="h-10 w-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        <p className="font-semibold text-lg animate-pulse">
          Initializing HYVE Intelligence...
        </p>
      </div>
    );
  }

  if (isError || !productData) {
    return (
      <div className="flex items-center justify-center h-full text-destructive">
        Failed to load product map.
      </div>
    );
  }

  const isProcessing = productData.status === "processing";

  // Show the real step from backend, or "Complete" when done, or nothing when ready without having processed
  const rawStep = productData.processing_step;
  const currentStep = processingDone
    ? "Analysis Complete"
    : isProcessing
      ? rawStep || "Initializing AI Pipeline"
      : rawStep || "";

  const stagesByIngestType = {
    url: [
      {
        id: "scraping",
        label: "Crawling URL & Sources",
        icon: SearchIcon,
        keywords: ["scraping", "crawling", "discovery", "scrape"],
      },
      {
        id: "ingest",
        label: "Extracting AI Data",
        icon: Sparkles,
        keywords: [
          "cleaning",
          "parsing",
          "grouping",
          "ingest",
          "archiving",
          "metadata",
        ],
      },
      {
        id: "claims",
        label: "Distilling Insights",
        icon: Zap,
        keywords: [
          "claims",
          "distilling",
          "extracting",
          "sentiment",
          "analysing",
        ],
      },
      {
        id: "clustering",
        label: "Harmonizing Patterns",
        icon: GitBranch,
        keywords: ["clustering", "harmonizing", "thematic"],
      },
      {
        id: "summary",
        label: "Generating Analysis",
        icon: Bot,
        keywords: ["summary", "advice", "complete", "analysis complete"],
      },
    ],
    csv: [
      {
        id: "ingest",
        label: "Parsing CSV Records",
        icon: Sparkles,
        keywords: [
          "initializing",
          "pipeline",
          "startup",
          "cleaning",
          "parsing",
          "grouping",
          "ingest",
          "records",
        ],
      },
      {
        id: "claims",
        label: "Distilling Insights",
        icon: Zap,
        keywords: [
          "claims",
          "distilling",
          "extracting",
          "sentiment",
          "analysing",
        ],
      },
      {
        id: "clustering",
        label: "Harmonizing Patterns",
        icon: GitBranch,
        keywords: ["clustering", "harmonizing", "thematic"],
      },
      {
        id: "summary",
        label: "Generating Analysis",
        icon: Bot,
        keywords: ["summary", "advice", "complete", "analysis complete"],
      },
    ],
    text: [
      {
        id: "ingest",
        label: "Processing Raw Text",
        icon: Sparkles,
        keywords: [
          "initializing",
          "pipeline",
          "startup",
          "cleaning",
          "parsing",
          "grouping",
          "ingest",
          "knowledge",
          "metadata",
        ],
      },
      {
        id: "claims",
        label: "Distilling Insights",
        icon: Zap,
        keywords: [
          "claims",
          "distilling",
          "extracting",
          "sentiment",
          "analysing",
        ],
      },
      {
        id: "clustering",
        label: "Harmonizing Patterns",
        icon: GitBranch,
        keywords: ["clustering", "harmonizing", "thematic"],
      },
      {
        id: "summary",
        label: "Generating Analysis",
        icon: Bot,
        keywords: ["summary", "advice", "complete", "analysis complete"],
      },
    ],
  };

  const allStages =
    stagesByIngestType[
      productData.ingest_type as keyof typeof stagesByIngestType
    ] || stagesByIngestType.csv;

  // When processingDone, treat all stages as completed
  const currentStageIndex = processingDone
    ? allStages.length // all complete
    : allStages.findIndex((s) =>
        s.keywords.some((k) => currentStep.toLowerCase().includes(k)),
      );

  // If no keyword matched and still processing, show stage 0 as active
  const effectiveStageIndex =
    !processingDone && currentStageIndex === -1 ? 0 : currentStageIndex;

  const modalOpen = showModal && (isProcessing || processingDone);

  return (
    <div
      className={cn(
        "relative flex-1 flex flex-col overflow-hidden bg-background",
        isProcessing && showModal && "cursor-wait",
      )}
    >
      {/* Blurred Content Background */}
      <div
        className={cn(
          "flex-1 flex flex-col transition-all duration-1000 overflow-hidden",
          modalOpen && "blur-2xl scale-95 opacity-50 contrast-125",
        )}
      >
        <ExploreCore
          productData={productData}
          analyticsData={analyticsData}
          productId={productId!}
          viewMode={viewMode}
          setViewMode={setViewMode}
          onRefresh={refetch}
          onStartExperiment={() => setIsExperimentMode(true)}
        />
      </div>

      {/* Premium Analysis Modal */}
      <Dialog
        open={modalOpen}
        onOpenChange={(open) => {
          // Only allow closing when done, not while processing
          if (!open && !isProcessing) setShowModal(false);
          else if (!open && isProcessing) return; // Block close during processing
        }}
      >
        <DialogContent className="max-w-2xl border-none bg-transparent shadow-none p-0 overflow-visible [&>button]:hidden">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="w-full bg-card/60 backdrop-blur-3xl border border-white/10 rounded-4xl shadow-[0_0_100px_rgba(var(--primary),0.1)] overflow-hidden relative"
          >
            {/* Manual Close Button — only shown when done */}
            {processingDone && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-6 right-6 h-10 w-10 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 hover:text-white transition-colors z-50"
                onClick={() => setShowModal(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            )}

            <div className="p-6 md:p-10">
              <div className="flex flex-col md:flex-row items-center md:items-start gap-4 md:gap-8 mb-8 md:mb-12 text-center md:text-left">
                <div className="h-20 w-20 md:h-24 md:w-24 bg-primary/10 rounded-3xl md:rounded-4xl flex items-center justify-center relative group shrink-0">
                  <div className="absolute inset-0 bg-primary/5 rounded-3xl md:rounded-4xl animate-ping" />
                  <AnimatePresence mode="wait">
                    {processingDone ? (
                      <motion.div
                        key="done"
                        initial={{ scale: 0, rotate: -90 }}
                        animate={{ scale: 1, rotate: 0 }}
                        className="relative z-10"
                      >
                        <CheckCircle2 className="h-10 w-10 md:h-12 md:w-12 text-emerald-500" />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="loader"
                        exit={{ scale: 0, rotate: 90 }}
                        className="relative z-10"
                      >
                        <Bot className="h-10 w-10 md:h-12 md:w-12 text-primary animate-bounce shadow-inner" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <div
                    className={cn(
                      "absolute -top-1 -right-1 h-6 w-6 rounded-full border-4 border-card transition-colors duration-500",
                      processingDone
                        ? "bg-emerald-500"
                        : "bg-primary animate-pulse",
                    )}
                  />
                </div>

                <div className="space-y-2">
                  <h2 className="text-2xl md:text-4xl font-black tracking-tight italic uppercase">
                    {processingDone ? "Extraction Complete" : "AI Ingestion"}
                  </h2>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className="bg-primary/5 text-primary border-primary/20 font-black uppercase tracking-widest text-[10px] px-3 max-w-[150px] md:max-w-none truncate"
                    >
                      {productData.name}
                    </Badge>
                    <p className="text-muted-foreground font-bold text-sm flex items-center gap-2">
                      {!processingDone && (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      )}
                      {currentStep}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-4 md:gap-y-6 mb-8 md:mb-10">
                {allStages.map((stage, i) => {
                  const isCompleted = i < effectiveStageIndex || processingDone;
                  const isActive = i === effectiveStageIndex && !processingDone;

                  return (
                    <motion.div
                      key={stage.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className={cn(
                        "flex items-center gap-4 transition-all duration-500",
                        !isActive &&
                          !isCompleted &&
                          "opacity-30 grayscale scale-95",
                      )}
                    >
                      <div
                        className={cn(
                          "h-12 w-12 rounded-2xl flex items-center justify-center transition-all duration-500",
                          isCompleted
                            ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                            : isActive
                              ? "bg-primary text-primary-foreground shadow-2xl shadow-primary/40 scale-110 ring-4 ring-primary/20"
                              : "bg-secondary/50 text-muted-foreground",
                        )}
                      >
                        {isCompleted ? (
                          <CheckCircle2 className="h-5 w-5 md:h-6 md:w-6" />
                        ) : (
                          <stage.icon
                            className={cn(
                              "h-5 w-5 md:h-6 md:w-6",
                              isActive && "animate-pulse",
                            )}
                          />
                        )}
                      </div>
                      <div className="space-y-0.5 min-w-0">
                        <span
                          className={cn(
                            "text-[10px] md:text-xs font-black uppercase tracking-widest truncate block",
                            isActive
                              ? "text-primary"
                              : isCompleted
                                ? "text-emerald-500"
                                : "text-muted-foreground",
                          )}
                        >
                          {isCompleted ? "✓ " : isActive ? "⟳ " : ""}
                          {stage.label.split(" ")[0]}
                        </span>
                        <p className="text-sm font-bold opacity-80 whitespace-nowrap truncate">
                          {stage.label}
                        </p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* Progress Bar & CTA */}
              <div className="space-y-6">
                <div className="space-y-3">
                  <div className="flex justify-between items-end px-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      Neural Convergence
                    </span>
                    <span className="text-[10px] font-black text-primary">
                      {processingDone
                        ? "100%"
                        : `${Math.max(5, Math.round(((effectiveStageIndex + 1) / allStages.length) * 100))}%`}
                    </span>
                  </div>
                  <div className="h-2 w-full bg-primary/5 rounded-full overflow-hidden p-0.5 border border-white/5">
                    <motion.div
                      className={cn(
                        "h-full rounded-full",
                        processingDone
                          ? "bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]"
                          : "bg-primary shadow-[0_0_15px_rgba(var(--primary),0.5)]",
                      )}
                      initial={{ width: 0 }}
                      animate={{
                        width: processingDone
                          ? "100%"
                          : `${Math.max(5, ((effectiveStageIndex + 1) / allStages.length) * 100)}%`,
                      }}
                      transition={{
                        type: "spring",
                        stiffness: 50,
                        damping: 20,
                      }}
                    />
                  </div>
                </div>

                <AnimatePresence>
                  {processingDone && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex flex-col gap-4"
                    >
                      <Button
                        size="lg"
                        className="w-full bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl h-14 font-black uppercase tracking-widest shadow-xl shadow-emerald-500/20 group"
                        onClick={() => setShowModal(false)}
                      >
                        View Interactive Insights
                        <ChevronRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                      </Button>
                      {isBatch && (
                        <p className="text-[10px] text-center text-muted-foreground font-bold uppercase tracking-tighter opacity-60 leading-relaxed px-4">
                          Analysis for first product complete. All remaining
                          products in your dataset are processing in the
                          background. Visit your dashboard to track global
                          progress.
                        </p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </DialogContent>
      </Dialog>

      <ExperimentMode
        open={isExperimentMode}
        onOpenChange={setIsExperimentMode}
        product={productData}
        analytics={analyticsData}
      />
    </div>
  );
}

export default function Explore() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <ExploreInner />
    </div>
  );
}
