import React, { useState, useEffect, useRef } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Trophy,
  X,
  Zap,
  Target,
  ClipboardCheck,
  List as ListIcon,
  Star,
  Clock,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  CheckSquare,
  Square,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import api from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import ExploreCore from "./ExploreCore";
import { toast } from "sonner";

interface ExperimentModeProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: any;
  analytics: any;
}

const getTasks = (platform: string) => {
  if (platform === "traditional") {
    return [
      { id: "weakness", icon: Target, label: "Identify Top Weakness", field: "weakness_paraphrase", refType: "review", refId: "weakness_review_ref" },
      { id: "claim", icon: ClipboardCheck, label: "Find Supporting Claim", field: "claim_paraphrase", refType: "review", refId: "claim_review_ref" },
      { id: "positive", icon: Zap, label: "Find Positive Aspect", field: "positive_paraphrase", refType: "review", refId: "positive_review_ref" },
      { id: "negative", icon: Zap, label: "Find Negative Aspect", field: "negative_paraphrase", refType: "review", refId: "negative_review_ref" },
    ];
  }
  return [
    { id: "weakness", icon: Target, label: "Identify Top Weakness", field: "weakness_paraphrase", refType: "theme", refId: "weakness_ref" },
    { id: "claim", icon: ClipboardCheck, label: "Find Supporting Claim", field: "claim_paraphrase", refType: "claim", refId: "claim_ref" },
    { id: "strategy", icon: Zap, label: "Review AI Strategies", field: "strategy_paraphrase", refType: "strategy", refId: "strategy_ref" },
  ];
};

const countWords = (t: string) => (t || "").trim().split(/\s+/).filter(Boolean).length;

const ExperimentMode: React.FC<ExperimentModeProps> = ({
  open,
  onOpenChange,
  product,
  analytics,
}) => {
  const [platform, setPlatform] = useState<"select" | "hyve" | "traditional">("select");
  const [seconds, setSeconds] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [tasksState, setTasksState] = useState<Record<string, boolean>>({});
  const [openTaskForm, setOpenTaskForm] = useState<string | null>(null);

  const [evidence, setEvidence] = useState<{
    weakness_paraphrase: string;
    claim_paraphrase: string;
    positive_paraphrase: string;
    negative_paraphrase: string;
    strategy_paraphrase: string;
    source_refs: Record<string, { type: string; id: string }>;
  }>({
    weakness_paraphrase: "",
    claim_paraphrase: "",
    positive_paraphrase: "",
    negative_paraphrase: "",
    strategy_paraphrase: "",
    source_refs: {},
  });

  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [participantName, setParticipantName] = useState("");
  const [viewMode, setViewMode] = useState<"accordion" | "graph" | "traditional">("graph");
  const [hudExpanded, setHudExpanded] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const TASKS = getTasks(platform);

  const { data: reviews } = useQuery({
    queryKey: ["product-reviews-traditional", product?.id],
    queryFn: async () => {
      const res = await api.get(`/reviews?product_id=${product.id}&size=50`);
      return res.data.items;
    },
    enabled: platform === "traditional" && !!product?.id,
  });

  useEffect(() => {
    if (isActive) {
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive]);

  const startExperiment = (mode: "hyve" | "traditional") => {
    setPlatform(mode);
    setSeconds(0);
    setIsActive(true);
    setTasksState({});
    setOpenTaskForm(null);
    setEvidence({
      weakness_paraphrase: "",
      claim_paraphrase: "",
      positive_paraphrase: "",
      negative_paraphrase: "",
      strategy_paraphrase: "",
      source_refs: {},
    });
    setHudExpanded(true);
  };

  const isTaskValid = (task: typeof TASKS[0]) => {
    const text = (evidence as any)[task.field];
    if (countWords(text) < 5) return false;
    if (!evidence.source_refs[task.refId]) return false;
    return true;
  };

  const handleTaskToggle = (taskId: string) => {
    const tDef = TASKS.find(t => t.id === taskId);
    if (!tDef || !isTaskValid(tDef)) {
      if (openTaskForm === taskId) setOpenTaskForm(null);
      else setOpenTaskForm(taskId);
      return;
    }
    const newTasks = { ...tasksState, [taskId]: !tasksState[taskId] };
    setTasksState(newTasks);
    
    // Auto collapse form when marked done
    if (newTasks[taskId]) setOpenTaskForm(null);

    const allDone = TASKS.every((t) => newTasks[t.id]);
    if (allDone) {
      setIsActive(false);
      setShowCompletionModal(true);
    }
  };

  const submitResults = async () => {
    try {
      await api.post("/experiments/results", {
        product_id: product.id,
        platform,
        time_seconds: seconds,
        participant_name: participantName || "Anonymous Participant",
        evidence: {
          platform,
          weakness_paraphrase: evidence.weakness_paraphrase,
          claim_paraphrase: evidence.claim_paraphrase,
          ...(platform === 'traditional' ? {
            positive_paraphrase: evidence.positive_paraphrase,
            negative_paraphrase: evidence.negative_paraphrase,
          } : {
            strategy_paraphrase: evidence.strategy_paraphrase,
          }),
          source_refs: evidence.source_refs
        }
      });
      toast.success("Experiment results submitted successfully!");
      handleClose();
    } catch {
      toast.error("Failed to submit results. Please try again.");
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setPlatform("select");
    setSeconds(0);
    setIsActive(false);
    setShowCompletionModal(false);
    setParticipantName("");
  };

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleSourceRefPick = (refId: string, type: string, id: string) => {
    setEvidence(prev => ({
      ...prev,
      source_refs: {
        ...prev.source_refs,
        [refId]: { type, id }
      }
    }));
  };

  const completedCount = TASKS.filter((t) => tasksState[t.id]).length;

  if (!open) return null;

  if (platform === "select") {
    return (
      <div className="fixed inset-0 z-50 bg-background/98 flex flex-col animate-in fade-in duration-300">
        <div className="h-14 border-b border-border/20 px-6 flex items-center justify-between bg-card/40 shrink-0">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary fill-primary" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">
              A/B Research Mission
            </span>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-8 md:p-8 flex items-center justify-center">
          <div className="w-full max-w-3xl">
            <div className="text-center mb-8 md:mb-10">
              <h2 className="text-2xl md:text-3xl font-black tracking-tighter uppercase">
                Choose Your Platform
              </h2>
              <p className="text-sm text-muted-foreground mt-2 font-medium">
                Evaluating: <span className="font-bold text-foreground">{product?.name}</span>
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Select a platform. Your time starts immediately after.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              <Card className="group cursor-pointer border-border/40 hover:border-border transition-all duration-300 hover:shadow-lg rounded-2xl overflow-hidden flex flex-col" onClick={() => startExperiment("traditional")}>
                <CardHeader className="p-5 md:p-8 pb-3">
                  <div className="h-10 w-10 md:h-12 md:w-12 bg-muted rounded-xl flex items-center justify-center mb-3 md:mb-4 group-hover:bg-muted/80 transition-colors">
                    <ListIcon className="h-5 w-5 md:h-6 md:w-6 text-muted-foreground" />
                  </div>
                  <CardTitle className="text-lg md:text-xl font-black tracking-tight leading-tight">
                    Traditional Method
                  </CardTitle>
                  <CardDescription className="text-xs md:text-sm font-medium mt-1">
                    Standard review list format — similar to Amazon, Yelp, or Walmart.
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-5 md:px-8 pb-6 md:pb-8 flex-1 flex flex-col">
                  <ul className="space-y-1.5 md:space-y-2 text-[11px] md:text-xs text-muted-foreground font-medium mb-5 flex-1">
                    {["Linear scroll of individual reviews", "Static 1–5 star rating system", "Manual scanning for patterns"].map((item) => (
                      <li key={item} className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <Button className="w-full font-black uppercase tracking-widest text-[9px] md:text-[10px] h-10 bg-muted text-foreground hover:bg-muted/80 mt-auto">
                    Start Traditional Test
                  </Button>
                </CardContent>
              </Card>
              <Card className="group cursor-pointer border-primary/30 hover:border-primary transition-all duration-300 hover:shadow-xl hover:shadow-primary/10 rounded-2xl overflow-hidden bg-primary/2 flex flex-col" onClick={() => startExperiment("hyve")}>
                <CardHeader className="p-5 md:p-8 pb-3">
                  <div className="h-10 w-10 md:h-12 md:w-12 bg-primary/15 rounded-xl flex items-center justify-center mb-3 md:mb-4 group-hover:bg-primary/20 transition-colors">
                    <Zap className="h-5 w-5 md:h-6 md:w-6 text-primary fill-primary" />
                  </div>
                  <CardTitle className="text-lg md:text-xl font-black tracking-tight text-primary leading-tight">
                    HYVE Intelligence
                  </CardTitle>
                  <CardDescription className="text-xs md:text-sm font-medium mt-1">
                    Full AI-powered product analytics.
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-5 md:px-8 pb-6 md:pb-8 flex-1 flex flex-col">
                  <ul className="space-y-1.5 md:space-y-2 text-[11px] md:text-xs text-primary/70 font-bold mb-5 flex-1">
                    {["Interactive AI decision tree", "Thematic sentiment breakdown", "AI executive synthesis & strategies"].map((item) => (
                      <li key={item} className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <Button className="w-full font-black uppercase tracking-widest text-[9px] md:text-[10px] h-10 bg-primary text-primary-foreground shadow-md shadow-primary/20 mt-auto">
                    Start HYVE Test
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const HUDPanel = (
    <div className="fixed bottom-0 left-0 right-0 md:bottom-6 md:right-6 md:left-auto z-50 flex flex-col items-end md:gap-2">
      <AnimatePresence>
        {hudExpanded && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className="w-full md:w-[360px] bg-card/95 backdrop-blur-xl border-t md:border border-border/40 rounded-t-3xl md:rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
          >
            <div className="px-4 py-3 border-b border-border/20 flex items-center justify-between bg-card/60 shrink-0">
              <div className="flex items-center gap-2">
                <div className={cn("h-2 w-2 rounded-full animate-pulse", isActive ? "bg-emerald-500" : "bg-muted-foreground/40")} />
                <span className="text-[10px] font-black uppercase tracking-widest text-foreground">
                  {platform === "hyve" ? "HYVE" : "Traditional"} Mission
                </span>
              </div>
              <div className="flex items-center gap-1.5 bg-muted/60 px-2.5 py-1 rounded-lg border border-border/20">
                <Clock className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs font-mono font-black tabular-nums tracking-tighter">{formatTime(seconds)}</span>
              </div>
            </div>

            <div className="p-4 space-y-2 overflow-y-auto flex-1">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-3">
                Mission Checklist
              </p>
              {TASKS.map((task) => {
                const done = tasksState[task.id];
                const valid = isTaskValid(task);
                const isOpen = openTaskForm === task.id;

                return (
                  <div key={task.id} className="space-y-1">
                    <button
                      className={cn(
                        "w-full flex justify-between items-center px-3 py-2.5 rounded-xl border text-left transition-all",
                        done ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-700 dark:text-emerald-400" : "bg-background border-border/30 text-muted-foreground hover:border-border hover:text-foreground"
                      )}
                      onClick={() => !done ? setOpenTaskForm(isOpen ? null : task.id) : handleTaskToggle(task.id)}
                    >
                      <div className="flex items-center gap-3">
                        {done ? <CheckSquare className="h-4 w-4 shrink-0 text-emerald-500" /> : <Square className="h-4 w-4 shrink-0 opacity-40" />}
                        <span className={cn("text-xs font-bold", done ? "" : (valid ? "text-primary" : ""))}>{task.label}</span>
                      </div>
                      {!done && (
                        <div className="flex gap-2 items-center">
                          {valid && <div className="h-1.5 w-1.5 bg-emerald-500 rounded-full" title="Valid"></div>}
                          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                      )}
                    </button>
                    <AnimatePresence>
                      {isOpen && !done && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="p-3 bg-muted/30 border border-border/40 rounded-xl space-y-3 mt-1">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                              Paraphrase Evidence (≥5 words)
                            </label>
                            <textarea
                              maxLength={280}
                              rows={3}
                              className="w-full text-xs p-2 rounded-md border border-border bg-background"
                              placeholder="Write in your own words..."
                              value={(evidence as any)[task.field]}
                              onChange={(e) => setEvidence({ ...evidence, [task.field]: e.target.value })}
                            />
                            
                            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-2 block">
                              Source Reference
                            </label>
                            {platform === "hyve" && task.refType === "theme" && (
                              <select className="w-full text-xs p-2 rounded-md border border-border bg-background"
                                value={evidence.source_refs[task.refId]?.id || ""}
                                onChange={(e) => handleSourceRefPick(task.refId, "theme", e.target.value)}>
                                <option value="">-- Choose Theme --</option>
                                {product?.themes?.map((t: any) => (
                                  <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                              </select>
                            )}
                            {platform === "hyve" && task.refType === "claim" && (
                              <select className="w-full text-xs p-2 rounded-md border border-border bg-background"
                                value={evidence.source_refs[task.refId]?.id || ""}
                                onChange={(e) => handleSourceRefPick(task.refId, "claim", e.target.value)}>
                                <option value="">-- Choose Claim --</option>
                                {product?.themes?.flatMap((t:any) => t.claims || []).map((c: any) => (
                                  <option key={c.id} value={c.id}>{c.claim_text}</option>
                                ))}
                              </select>
                            )}
                            {platform === "hyve" && task.refType === "strategy" && (
                              <select className="w-full text-xs p-2 rounded-md border border-border bg-background"
                                value={evidence.source_refs[task.refId]?.id || ""}
                                onChange={(e) => handleSourceRefPick(task.refId, "strategy", e.target.value)}>
                                <option value="">-- Choose Theme as Strategy --</option>
                                {product?.themes?.filter((t:any) => !!t.recommendation).map((t: any) => (
                                  <option key={t.id} value={t.id}>{t.recommendation?.substring(0, 40)}...</option>
                                ))}
                              </select>
                            )}
                            {platform === "traditional" && (
                              <div className="text-[10px] text-muted-foreground">
                                {evidence.source_refs[task.refId] ? (
                                  <span className="text-emerald-500 font-bold">Review Selected</span>
                                ) : (
                                  <span className="text-amber-500 font-bold">Please click a "Use for..." button on a review to select it as evidence.</span>
                                )}
                              </div>
                            )}

                            <Button
                              className="w-full text-[10px] h-7 uppercase tracking-wider font-bold"
                              disabled={!valid}
                              onClick={() => handleTaskToggle(task.id)}
                            >
                              Mark Complete
                            </Button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>

            <div className="px-4 pb-4 space-y-3 shrink-0 bg-card/60">
              <div>
                <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                  <span>Progress</span>
                  <span className="text-primary">{Math.round((completedCount / TASKS.length) * 100)}%</span>
                </div>
                <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                  <motion.div className="h-full bg-primary rounded-full" animate={{ width: `${(completedCount / TASKS.length) * 100}%` }} />
                </div>
              </div>
              <Button
                className="w-full h-9 font-black text-[10px] uppercase tracking-widest gap-2"
                disabled={completedCount < TASKS.length}
                onClick={() => {
                  setIsActive(false);
                  setShowCompletionModal(true);
                }}
              >
                <Trophy className="h-3.5 w-3.5" />
                Submit Results
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        className={cn(
          "h-10 px-4 rounded-full border font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-lg transition-all mb-4 mr-4 md:mb-0 md:mr-0 mt-2",
          hudExpanded
            ? "bg-card border-border/40 text-muted-foreground hover:text-foreground md:flex"
            : "bg-primary text-primary-foreground border-primary shadow-primary/20",
        )}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => setHudExpanded((v) => !v)}
      >
        {hudExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        {hudExpanded ? "Hide HUD" : `Mission (${completedCount}/${TASKS.length})`}
      </motion.button>
    </div>
  );

  if (platform === "hyve") {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col animate-in fade-in duration-300">
        <div className="h-10 border-b border-border/20 px-6 flex items-center justify-between bg-card/30 shrink-0">
          <div className="flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-primary fill-primary" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">A/B Mission · HYVE Protocol</span>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto pb-6">
          <ExploreCore productData={product} analyticsData={analytics} productId={product?.id} viewMode={viewMode} setViewMode={setViewMode} onRefresh={() => {}} hideExperimentTrigger={true} isExperiment={false} />
        </div>
        {HUDPanel}
        <CompletionModal open={showCompletionModal} onOpenChange={setShowCompletionModal} platform={platform} seconds={seconds} formatTime={formatTime} participantName={participantName} setParticipantName={setParticipantName} submitResults={submitResults} />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col animate-in fade-in duration-300">
      <div className="h-10 border-b border-border/20 px-6 flex items-center justify-between bg-card/30 shrink-0">
        <div className="flex items-center gap-2">
          <ListIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">A/B Mission · Traditional Protocol</span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto pb-44 md:pb-28">
        <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-6 md:space-y-8">
          <div className="flex flex-col gap-2 border-b border-border/20 pb-6 md:pb-8">
            <h2 className="text-2xl md:text-3xl font-black tracking-tight">{product?.name}</h2>
            <div className="flex items-center gap-3">
              <div className="flex gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className={cn("h-4 w-4", i < 4 ? "fill-amber-400 text-amber-400" : "text-muted")} />
                ))}
              </div>
              <span className="text-base font-bold">4.2 out of 5</span>
              <span className="text-sm text-muted-foreground font-medium">· {reviews?.length || 0} reviews</span>
            </div>
          </div>

          <div className="space-y-4">
            {reviews?.map((review: any) => (
              <div key={review.id} className="p-4 md:p-6 bg-card border border-border/30 rounded-2xl space-y-3 hover:border-border/60 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center font-bold text-xs uppercase">
                      {review.author?.[0] || "U"}
                    </div>
                    <div>
                      <div className="text-sm font-bold">{review.author || "Verified User"}</div>
                      <div className="flex gap-0.5 mt-0.5">
                        {[...Array(5)].map((_, i) => <Star key={i} className={cn("h-3 w-3", i < (review.star_rating || 5) ? "fill-amber-400 text-amber-400" : "text-muted")} />)}
                      </div>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground font-medium">
                    {new Date(review.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", })}
                  </span>
                </div>

                {review.title && <h4 className="font-bold text-sm leading-tight">{review.title}</h4>}
                <p className="text-sm leading-relaxed text-foreground/70 font-medium">{review.original_text}</p>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50 font-bold uppercase tracking-widest border-t border-border/10 pt-3">
                  <ShieldCheck className="h-3 w-3 text-emerald-500" />
                  {review.source || "Amazon"} Verified Purchase
                </div>
                
                <div className="flex flex-wrap gap-2 pt-2">
                  {TASKS.map(t => (
                    <Button 
                      key={t.id} 
                      size="sm" 
                      variant={(evidence.source_refs[t.refId]?.id === String(review.id)) ? "secondary" : "outline"}
                      className={cn("text-[10px] uppercase font-bold tracking-wider h-6 px-2", 
                        (evidence.source_refs[t.refId]?.id === String(review.id)) ? "border-primary text-primary bg-primary/10 hover:bg-primary/20" : "")}
                      onClick={() => {
                        handleSourceRefPick(t.refId, "review", String(review.id));
                        setOpenTaskForm(t.id);
                      }}
                    >
                      {evidence.source_refs[t.refId]?.id === String(review.id) ? "Selected" : `Use for ${t.label.split(" ").slice(1).join(" ")}`}
                    </Button>
                  ))}
                </div>
              </div>
            ))}

            {(!reviews || reviews.length === 0) && (
              <div className="text-center py-16 bg-muted/20 rounded-2xl border border-dashed border-border/40">
                <p className="text-muted-foreground text-sm font-medium">Loading reviews...</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {HUDPanel}
      <CompletionModal open={showCompletionModal} onOpenChange={setShowCompletionModal} platform={platform} seconds={seconds} formatTime={formatTime} participantName={participantName} setParticipantName={setParticipantName} submitResults={submitResults} />
    </div>
  );
};

function CompletionModal({
  open, onOpenChange, platform, seconds, formatTime, participantName, setParticipantName, submitResults,
}: { open: boolean; onOpenChange: (v: boolean) => void; platform: string; seconds: number; formatTime: (s: number) => string; participantName: string; setParticipantName: (v: string) => void; submitResults: () => void; }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md border-border/40 bg-card rounded-2xl shadow-2xl">
        <DialogHeader className="flex flex-col items-center gap-4 text-center">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="h-16 w-16 bg-emerald-500/10 rounded-full flex items-center justify-center border-2 border-emerald-500/20 text-emerald-500">
            <Trophy className="h-8 w-8" />
          </motion.div>
          <DialogTitle className="text-2xl font-black uppercase tracking-tight">Mission Complete</DialogTitle>
          <DialogDescription className="font-medium">
            You completed the {platform === "hyve" ? "HYVE" : "Traditional"} protocol in <span className="font-black text-foreground">{formatTime(seconds)}</span>.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2 block">Participant Identifier</label>
          <input type="text" className="w-full bg-muted/50 border border-border/40 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-primary/50 transition-colors" placeholder="e.g. user_42 or student_A" value={participantName} onChange={(e) => setParticipantName(e.target.value)} />
          <p className="text-[10px] text-muted-foreground/60 mt-2 font-medium">Optional — helps link your result to a participant record.</p>
        </div>
        <DialogFooter className="sm:justify-center gap-3">
          <Button variant="ghost" className="font-black text-[10px] uppercase tracking-widest h-10 px-6" onClick={() => onOpenChange(false)}>Back</Button>
          <Button className="font-black text-xs uppercase tracking-widest h-10 px-8 gap-2" onClick={submitResults}><Trophy className="h-3.5 w-3.5" />Submit & Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ExperimentMode;
