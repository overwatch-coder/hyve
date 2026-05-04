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
  List as ListIcon,
  Star,
  Clock,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  CheckSquare,
  Square,
  Loader2,
  PartyPopper,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import api from "@/lib/api";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import ExploreCore from "./ExploreCore";
import { toast } from "sonner";
import {
  TRADITIONAL_REVIEW_SORT_OPTIONS,
  type TraditionalReviewSort,
} from "@/lib/traditionalReviewSort";

interface ExperimentModeProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: any;
  analytics: any;
  // Study mode: lock platform and product, hide selectors
  locked?: boolean;
  lockedPlatform?: "hyve" | "traditional";
  sessionToken?: string;
  studyInstructions?: string;
  onExperimentComplete?: () => void;
}

type TaskGroup = "strengths" | "weaknesses";

type TaskDef = {
  id: string;
  icon: typeof Star;
  label: string;
  group: TaskGroup;
  index: number;
};

// Both platforms use identical task labels so results are directly comparable.
// The only difference is HOW the participant locates evidence:
//   - HYVE:        from the AI decision tree (theme / claim / sentiment nodes)
//   - Traditional: from raw reviews
const getTasks = () => {
  return [
    {
      id: "strength-1",
      icon: Star,
      label: "Top Strength 1",
      group: "strengths",
      index: 0,
    },
    {
      id: "strength-2",
      icon: Star,
      label: "Top Strength 2",
      group: "strengths",
      index: 1,
    },
    {
      id: "strength-3",
      icon: Star,
      label: "Top Strength 3",
      group: "strengths",
      index: 2,
    },
    {
      id: "weakness-1",
      icon: Target,
      label: "Top Weakness 1",
      group: "weaknesses",
      index: 0,
    },
    {
      id: "weakness-2",
      icon: Target,
      label: "Top Weakness 2",
      group: "weaknesses",
      index: 1,
    },
    {
      id: "weakness-3",
      icon: Target,
      label: "Top Weakness 3",
      group: "weaknesses",
      index: 2,
    },
  ] satisfies TaskDef[];
};

const ExperimentMode: React.FC<ExperimentModeProps> = ({
  open,
  onOpenChange,
  product,
  analytics,
  locked = false,
  lockedPlatform,
  sessionToken,
  studyInstructions: _studyInstructions,
  onExperimentComplete,
}) => {
  const [platform, setPlatform] = useState<"select" | "hyve" | "traditional">(
    "select",
  );
  const [seconds, setSeconds] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [tasksState, setTasksState] = useState<Record<string, boolean>>({});
  const [openTaskForm, setOpenTaskForm] = useState<string | null>(null);

  const [evidence, setEvidence] = useState<{
    strengths: string[];
    weaknesses: string[];
  }>({
    strengths: ["", "", ""],
    weaknesses: ["", "", ""],
  });

  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [participantName, setParticipantName] = useState("");
  const [confidenceRating, setConfidenceRating] = useState<number | null>(null);
  const [helpfulnessResponse, setHelpfulnessResponse] = useState<
    "yes" | "no" | null
  >(null);
  const [viewMode, setViewMode] = useState<
    "accordion" | "graph" | "traditional"
  >("graph");
  const [hudExpanded, setHudExpanded] = useState(true);
  const [checklistExpanded, setChecklistExpanded] = useState(true);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [thankYouOpen, setThankYouOpen] = useState(false);
  const [isSubmittingResults, setIsSubmittingResults] = useState(false);
  const [traditionalPage, setTraditionalPage] = useState(1);
  const [traditionalSortMode, setTraditionalSortMode] =
    useState<TraditionalReviewSort>("most-helpful");
  const [displayedTraditionalPage, setDisplayedTraditionalPage] = useState(1);
  const [displayedTraditionalTotalPages, setDisplayedTraditionalTotalPages] =
    useState(1);
  const [displayedTraditionalReviewCount, setDisplayedTraditionalReviewCount] =
    useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const traditionalReviewsTopRef = useRef<HTMLDivElement | null>(null);
  const previousTraditionalProductIdRef = useRef<string | number | null>(null);
  const REVIEWS_PER_PAGE = 20;

  const TASKS = getTasks();
  const isTraditionalProductChanging =
    platform === "traditional" &&
    open &&
    !!product?.id &&
    previousTraditionalProductIdRef.current !== product.id;
  const effectiveTraditionalPage = isTraditionalProductChanging
    ? 1
    : traditionalPage;

  const {
    data: traditionalReviewsData,
    isLoading: reviewsLoading,
    isError: reviewsError,
    isPlaceholderData,
  } = useQuery({
    queryKey: [
      "product-reviews-traditional",
      product?.id,
      effectiveTraditionalPage,
      traditionalSortMode,
    ],
    queryFn: async () => {
      const res = await api.get(
        `/reviews?product_id=${product.id}&page=${effectiveTraditionalPage}&size=${REVIEWS_PER_PAGE}&sort=${traditionalSortMode}`,
      );
      return res.data;
    },
    enabled: platform === "traditional" && open && !!product?.id,
    placeholderData: (previousData, previousQuery) => {
      const previousProductId =
        typeof previousQuery?.queryKey?.[1] === "string" ||
        typeof previousQuery?.queryKey?.[1] === "number"
          ? previousQuery.queryKey[1]
          : null;
      const previousSortMode =
        typeof previousQuery?.queryKey?.[3] === "string"
          ? previousQuery.queryKey[3]
          : null;
      return previousProductId === product?.id
        && previousSortMode === traditionalSortMode
        ? keepPreviousData(previousData)
        : undefined;
    },
  });

  useEffect(() => {
    if (platform !== "traditional" || !open) {
      previousTraditionalProductIdRef.current = null;
      setTraditionalPage(1);
      setDisplayedTraditionalPage(1);
      setDisplayedTraditionalTotalPages(1);
      setDisplayedTraditionalReviewCount(0);
      return;
    }
    if (!product?.id) {
      return;
    }
    if (previousTraditionalProductIdRef.current !== product.id) {
      previousTraditionalProductIdRef.current = product.id;
      setTraditionalPage(1);
      setDisplayedTraditionalPage(1);
    }
  }, [platform, product?.id, open]);

  useEffect(() => {
    if (
      platform !== "traditional" ||
      !open ||
      !traditionalReviewsData ||
      isPlaceholderData
    ) {
      return;
    }
    setDisplayedTraditionalPage(effectiveTraditionalPage);
    setDisplayedTraditionalTotalPages(traditionalReviewsData.pages || 1);
    setDisplayedTraditionalReviewCount(traditionalReviewsData.total ?? 0);
  }, [
    platform,
    open,
    traditionalReviewsData,
    isPlaceholderData,
    effectiveTraditionalPage,
  ]);

  useEffect(() => {
    if (platform !== "traditional" || !open) {
      return;
    }
    traditionalReviewsTopRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [displayedTraditionalPage, platform, open]);

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

  // Auto-start in locked study mode
  useEffect(() => {
    if (locked && lockedPlatform && open && platform === "select") {
      startExperiment(lockedPlatform);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, lockedPlatform, open]);

  const startExperiment = (mode: "hyve" | "traditional") => {
    setPlatform(mode);
    setSeconds(0);
    setIsActive(true);
    setTasksState({});
    setOpenTaskForm(null);
    setEvidence({
      strengths: ["", "", ""],
      weaknesses: ["", "", ""],
    });
    setHudExpanded(true);
    setChecklistExpanded(true);
    setHelpfulnessResponse(null);
    setTraditionalPage(1);
    setTraditionalSortMode("most-helpful");
    setDisplayedTraditionalPage(1);
  };

  const isTaskValid = (task: TaskDef) => {
    const text = evidence[task.group][task.index]?.trim();
    return Boolean(text);
  };

  const handleTaskToggle = (taskId: string) => {
    const tDef = TASKS.find((t) => t.id === taskId);
    if (!tDef || !isTaskValid(tDef)) {
      if (openTaskForm === taskId) setOpenTaskForm(null);
      else setOpenTaskForm(taskId);
      return;
    }
    const newTasks = { ...tasksState, [taskId]: !tasksState[taskId] };
    setTasksState(newTasks);

    // Auto collapse form when marked done
    if (newTasks[taskId]) setOpenTaskForm(null);

  };

  const submitResults = async () => {
    setIsSubmittingResults(true);
    try {
      await api.post("/experiments/results", {
        product_id: product.id,
        platform,
        time_seconds: seconds,
        participant_name: participantName || "Anonymous Participant",
        session_token: sessionToken,
        confidence_rating: confidenceRating,
        helpfulness_response: helpfulnessResponse,
        evidence: {
          platform,
          strengths: evidence.strengths.map((text) => ({ text })),
          weaknesses: evidence.weaknesses.map((text) => ({ text })),
        },
      });
      setIsActive(false);
      setShowCompletionModal(false);
      setThankYouOpen(true);
    } catch {
      toast.error("Failed to submit results. Please try again.");
    } finally {
      setIsSubmittingResults(false);
    }
  };

  const closeExperiment = () => {
    onOpenChange(false);
    setPlatform("select");
    setSeconds(0);
    setIsActive(false);
    setShowCompletionModal(false);
    setThankYouOpen(false);
    setParticipantName("");
    setConfidenceRating(null);
    setHelpfulnessResponse(null);
    setEvidence({
      strengths: ["", "", ""],
      weaknesses: ["", "", ""],
    });
    setTasksState({});
    setLeaveDialogOpen(false);
  };

  const completeAndClose = () => {
    onExperimentComplete?.();
    closeExperiment();
  };

  const handleClose = () => {
    if (locked && !showCompletionModal && completedCount < TASKS.length) {
      setLeaveDialogOpen(true);
      return;
    }

    closeExperiment();
  };

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const completedCount = TASKS.filter((t) => tasksState[t.id]).length;
  const reviews = traditionalReviewsData?.items || [];
  const totalTraditionalPages =
    traditionalReviewsData?.pages ?? displayedTraditionalTotalPages;
  const totalTraditionalReviewCount =
    traditionalReviewsData?.total ?? displayedTraditionalReviewCount;
  const showTraditionalLoadingState = reviewsLoading && !traditionalReviewsData;

  const getVisibleTraditionalPages = () => {
    const pages: Array<number | "ellipsis"> = [];
    if (totalTraditionalPages <= 7) {
      for (let page = 1; page <= totalTraditionalPages; page += 1) {
        pages.push(page);
      }
      return pages;
    }

    pages.push(1);
    const start = Math.max(2, displayedTraditionalPage - 1);
    const end = Math.min(totalTraditionalPages - 1, displayedTraditionalPage + 1);

    if (start > 2) {
      pages.push("ellipsis");
    }
    for (let page = start; page <= end; page += 1) {
      pages.push(page);
    }
    if (end < totalTraditionalPages - 1) {
      pages.push("ellipsis");
    }
    pages.push(totalTraditionalPages);
    return pages;
  };

  if (!open) return null;

  // In locked mode the useEffect handles auto-start; show nothing until it fires
  if (locked && platform === "select") return null;

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
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleClose}
          >
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
                Evaluating:{" "}
                <span className="font-bold text-foreground">
                  {product?.name}
                </span>
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Select a platform. Your time starts immediately after.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              <Card
                className="group cursor-pointer border-border/40 hover:border-border transition-all duration-300 hover:shadow-lg rounded-2xl overflow-hidden flex flex-col"
                onClick={() => startExperiment("traditional")}
              >
                <CardHeader className="p-5 md:p-8 pb-3">
                  <div className="h-10 w-10 md:h-12 md:w-12 bg-muted rounded-xl flex items-center justify-center mb-3 md:mb-4 group-hover:bg-muted/80 transition-colors">
                    <ListIcon className="h-5 w-5 md:h-6 md:w-6 text-muted-foreground" />
                  </div>
                  <CardTitle className="text-lg md:text-xl font-black tracking-tight leading-tight">
                    Traditional Method
                  </CardTitle>
                  <CardDescription className="text-xs md:text-sm font-medium mt-1">
                    Standard review list format — similar to Amazon, Yelp, or
                    Walmart.
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-5 md:px-8 pb-6 md:pb-8 flex-1 flex flex-col">
                  <ul className="space-y-1.5 md:space-y-2 text-[11px] md:text-xs text-muted-foreground font-medium mb-5 flex-1">
                    {[
                      "Linear scroll of individual reviews",
                      "Static 1–5 star rating system",
                      "Manual scanning for patterns",
                    ].map((item) => (
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
              <Card
                className="group cursor-pointer border-primary/30 hover:border-primary transition-all duration-300 hover:shadow-xl hover:shadow-primary/10 rounded-2xl overflow-hidden bg-primary/2 flex flex-col"
                onClick={() => startExperiment("hyve")}
              >
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
                    {[
                      "Interactive AI decision tree",
                      "Thematic sentiment breakdown",
                      "AI executive synthesis & strategies",
                    ].map((item) => (
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
                <div
                  className={cn(
                    "h-2 w-2 rounded-full animate-pulse",
                    isActive ? "bg-emerald-500" : "bg-muted-foreground/40",
                  )}
                />
                <span className="text-[10px] font-black uppercase tracking-widest text-foreground">
                  {platform === "hyve" ? "HYVE" : "Traditional"} Mission
                </span>
              </div>
              <div className="flex items-center gap-1.5 bg-muted/60 px-2.5 py-1 rounded-lg border border-border/20">
                <Clock className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs font-mono font-black tabular-nums tracking-tighter">
                  {formatTime(seconds)}
                </span>
              </div>
            </div>

            <div className="p-4 space-y-3 overflow-y-auto flex-1">
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-xl border border-border/30 bg-background/60 px-3 py-2 text-left transition-colors hover:border-border hover:bg-background"
                onClick={() => setChecklistExpanded((value) => !value)}
                aria-expanded={checklistExpanded}
              >
                <div className="flex items-center gap-2">
                  <ListIcon className="h-3.5 w-3.5 text-primary" />
                  <span className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                    Mission Checklist
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground">
                  <span>
                    {completedCount}/{TASKS.length}
                  </span>
                  {checklistExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </div>
              </button>

              <AnimatePresence initial={false}>
                {checklistExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-2 pt-1">
                      {TASKS.map((task) => {
                        const done = tasksState[task.id];
                        const valid = isTaskValid(task);
                        const isOpen = openTaskForm === task.id;

                        return (
                          <div key={task.id} className="space-y-1">
                            <button
                              className={cn(
                                "w-full flex justify-between items-center px-3 py-2.5 rounded-xl border text-left transition-all",
                                done
                                  ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-700 dark:text-emerald-400"
                                  : "bg-background border-border/30 text-muted-foreground hover:border-border hover:text-foreground",
                              )}
                              onClick={() =>
                                !done
                                  ? setOpenTaskForm(isOpen ? null : task.id)
                                  : handleTaskToggle(task.id)
                              }
                            >
                              <div className="flex items-center gap-3">
                                {done ? (
                                  <CheckSquare className="h-4 w-4 shrink-0 text-emerald-500" />
                                ) : (
                                  <Square className="h-4 w-4 shrink-0 opacity-40" />
                                )}
                                <span
                                  className={cn(
                                    "text-xs font-bold",
                                    done ? "" : valid ? "text-primary" : "",
                                  )}
                                >
                                  {task.label}
                                </span>
                              </div>
                              {!done && (
                                <div className="flex gap-2 items-center">
                                  {valid && (
                                    <div
                                      className="h-1.5 w-1.5 bg-emerald-500 rounded-full"
                                      title="Valid"
                                    ></div>
                                  )}
                                  {isOpen ? (
                                    <ChevronUp className="w-4 h-4" />
                                  ) : (
                                    <ChevronDown className="w-4 h-4" />
                                  )}
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
                                      Response
                                    </label>
                                    <textarea
                                      rows={3}
                                      className="w-full text-xs p-2 rounded-md border border-border bg-background"
                                      placeholder={`Write ${task.label.toLowerCase()} in your own words...`}
                                      value={evidence[task.group][task.index]}
                                      onChange={(e) => {
                                        setEvidence((prev) => ({
                                          ...prev,
                                          [task.group]: prev[task.group].map((entry, index) =>
                                            index === task.index ? e.target.value : entry,
                                          ),
                                        }));
                                      }}
                                    />

                                    <p className="text-[10px] text-muted-foreground">
                                      Focus on the top insight only. Source references
                                      are no longer required here.
                                    </p>

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

                      <div className="px-1 pt-2 space-y-3 shrink-0 bg-card/60">
                        <div>
                          <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                            <span>Progress</span>
                            <span className="text-primary">
                              {Math.round((completedCount / TASKS.length) * 100)}%
                            </span>
                          </div>
                          <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                            <motion.div
                              className="h-full bg-primary rounded-full"
                              animate={{
                                width: `${(completedCount / TASKS.length) * 100}%`,
                              }}
                            />
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
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
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
        {hudExpanded ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronUp className="h-3.5 w-3.5" />
        )}
        {hudExpanded
          ? "Hide HUD"
          : `Mission (${completedCount}/${TASKS.length})`}
      </motion.button>
    </div>
  );

  if (platform === "hyve") {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col animate-in fade-in duration-300">
        <div className="h-10 border-b border-border/20 px-6 flex items-center justify-between bg-card/30 shrink-0">
          <div className="flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-primary fill-primary" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">
              A/B Mission · HYVE Protocol
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleClose}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto pb-6">
          <ExploreCore
            productData={product}
            analyticsData={analytics}
            productId={product?.id}
            viewMode={viewMode}
            setViewMode={setViewMode}
            onRefresh={() => {}}
            hideExperimentTrigger={true}
            hideTraditionalTrigger={true}
            hideRegenerateTrigger={true}
            isExperiment={false}
          />
        </div>
        {HUDPanel}
        <CompletionModal
          open={showCompletionModal}
          onOpenChange={(nextOpen) => {
            setShowCompletionModal(nextOpen);
            if (!nextOpen && completedCount >= TASKS.length) {
              setIsActive(true);
            }
          }}
          platform={platform}
          seconds={seconds}
          formatTime={formatTime}
          participantName={participantName}
          setParticipantName={setParticipantName}
          submitResults={submitResults}
          confidenceRating={confidenceRating}
          setConfidenceRating={setConfidenceRating}
          helpfulnessResponse={helpfulnessResponse}
          setHelpfulnessResponse={setHelpfulnessResponse}
          locked={locked}
          isSubmitting={isSubmittingResults}
        />
        <LeaveStudyDialog
          open={leaveDialogOpen}
          onOpenChange={setLeaveDialogOpen}
          onConfirmLeave={closeExperiment}
        />
        <ThankYouDialog
          open={thankYouOpen}
          platform={platform}
          seconds={seconds}
          formatTime={formatTime}
          onDone={completeAndClose}
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col animate-in fade-in duration-300">
      <div className="h-10 border-b border-border/20 px-6 flex items-center justify-between bg-card/30 shrink-0">
        <div className="flex items-center gap-2">
          <ListIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">
            A/B Mission · Traditional Protocol
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={handleClose}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto pb-44 md:pb-28">
        <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-6 md:space-y-8">
          <div ref={traditionalReviewsTopRef} />
          <div className="flex flex-col gap-2 border-b border-border/20 pb-6 md:pb-8">
            <h2 className="text-2xl md:text-3xl font-black tracking-tight">
              {product?.name}
            </h2>
            <div className="flex items-center gap-3">
              <div className="flex gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={cn(
                      "h-4 w-4",
                      i < 4 ? "fill-amber-400 text-amber-400" : "text-muted",
                    )}
                  />
                ))}
              </div>
              <span className="text-base font-bold">4.2 out of 5</span>
              <span className="text-sm text-muted-foreground font-medium">
                · {totalTraditionalReviewCount} reviews
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex flex-col gap-2 rounded-xl border border-border/30 bg-card/40 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                  Sort Reviews
                </p>
                <p className="text-[11px] font-medium text-muted-foreground/80">
                  {totalTraditionalReviewCount} review
                  {totalTraditionalReviewCount === 1 ? "" : "s"}
                </p>
              </div>
              <select
                aria-label="Sort traditional reviews"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-[210px]"
                value={traditionalSortMode}
                onChange={(event) => {
                  const nextSortMode =
                    event.target.value as TraditionalReviewSort;
                  setTraditionalPage(1);
                  setTraditionalSortMode(nextSortMode);
                }}
              >
                {TRADITIONAL_REVIEW_SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {reviews.map((review: any) => (
              <div
                key={review.id ?? `${traditionalPage}-${review.created_at}`}
                className="p-4 md:p-6 bg-card border border-border/30 rounded-2xl space-y-3 hover:border-border/60 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center font-bold text-xs uppercase">
                      {review.author?.[0] || "U"}
                    </div>
                    <div>
                      <div className="text-sm font-bold">
                        {review.author || "Verified User"}
                      </div>
                      <div className="flex gap-0.5 mt-0.5">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={cn(
                              "h-3 w-3",
                              i < (review.star_rating || 5)
                                ? "fill-amber-400 text-amber-400"
                                : "text-muted",
                            )}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground font-medium">
                    {new Date(review.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>

                {review.title && (
                  <h4 className="font-bold text-sm leading-tight">
                    {review.title}
                  </h4>
                )}
                <p className="text-sm leading-relaxed text-foreground/70 font-medium">
                  {review.original_text}
                </p>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50 font-bold uppercase tracking-widest border-t border-border/10 pt-3">
                  <ShieldCheck className="h-3 w-3 text-emerald-500" />
                  User Verified Purchase
                </div>
              </div>
            ))}

            {reviews.length === 0 && (
              <div className="text-center py-16 bg-muted/20 rounded-2xl border border-dashed border-border/40">
                {reviewsLoading ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    <p className="text-muted-foreground text-sm font-medium">Loading reviews…</p>
                  </div>
                ) : reviewsError ? (
                  <p className="text-destructive text-sm font-medium">Failed to load reviews. Please refresh.</p>
                ) : (
                  <p className="text-muted-foreground text-sm font-medium">No reviews found for this product.</p>
                )}
              </div>
            )}

            {totalTraditionalReviewCount > REVIEWS_PER_PAGE && (
              <div className="rounded-2xl border border-border/20 bg-muted/10 px-4 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs font-medium text-muted-foreground">
                    Showing {(displayedTraditionalPage - 1) * REVIEWS_PER_PAGE + 1}-
                    {Math.min(
                      displayedTraditionalPage * REVIEWS_PER_PAGE,
                      totalTraditionalReviewCount,
                    )}{" "}
                    of {totalTraditionalReviewCount} reviews
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 px-3 text-[10px] font-black uppercase tracking-wide"
                      disabled={
                        showTraditionalLoadingState ||
                        isPlaceholderData ||
                        displayedTraditionalPage === 1
                      }
                      onClick={() =>
                        setTraditionalPage((current) => Math.max(1, current - 1))
                      }
                    >
                      Previous
                    </Button>
                    {getVisibleTraditionalPages().map((page, index) =>
                      page === "ellipsis" ? (
                        <span
                          key={`ellipsis-${index}`}
                          className="px-1 text-sm font-black text-muted-foreground"
                        >
                          …
                        </span>
                      ) : (
                        <Button
                          key={page}
                          type="button"
                          size="sm"
                          variant={
                            page === displayedTraditionalPage
                              ? "default"
                              : "outline"
                          }
                          className="h-8 min-w-8 px-2 text-[10px] font-black"
                          disabled={showTraditionalLoadingState || isPlaceholderData}
                          onClick={() => setTraditionalPage(page)}
                        >
                          {page}
                        </Button>
                      ),
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 px-3 text-[10px] font-black uppercase tracking-wide"
                      disabled={
                        showTraditionalLoadingState ||
                        isPlaceholderData ||
                        displayedTraditionalPage === totalTraditionalPages
                      }
                      onClick={() =>
                        setTraditionalPage((current) =>
                          Math.min(totalTraditionalPages, current + 1),
                        )
                      }
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {HUDPanel}
      <CompletionModal
        open={showCompletionModal}
        onOpenChange={(nextOpen) => {
          setShowCompletionModal(nextOpen);
          if (!nextOpen && completedCount >= TASKS.length) {
            setIsActive(true);
          }
        }}
        platform={platform}
        seconds={seconds}
        formatTime={formatTime}
        participantName={participantName}
        setParticipantName={setParticipantName}
        submitResults={submitResults}
        confidenceRating={confidenceRating}
        setConfidenceRating={setConfidenceRating}
        helpfulnessResponse={helpfulnessResponse}
        setHelpfulnessResponse={setHelpfulnessResponse}
        locked={locked}
        isSubmitting={isSubmittingResults}
      />
      <LeaveStudyDialog
        open={leaveDialogOpen}
        onOpenChange={setLeaveDialogOpen}
        onConfirmLeave={closeExperiment}
      />
      <ThankYouDialog
        open={thankYouOpen}
        platform={platform}
        seconds={seconds}
        formatTime={formatTime}
        onDone={completeAndClose}
      />
    </div>
  );
};

function LeaveStudyDialog({
  open,
  onOpenChange,
  onConfirmLeave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmLeave: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="rounded-2xl border-border/40 bg-card shadow-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-xl font-black tracking-tight">
            Leave This Study?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-6">
            You have not finished the study yet. If you leave now, this attempt
            will not be counted and you will need to start again later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          Any unfinished responses from this session will be discarded.
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-xl font-black uppercase tracking-widest">
            Stay in Study
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirmLeave}
            className="rounded-xl bg-rose-500 font-black uppercase tracking-widest text-white hover:bg-rose-600"
          >
            Leave Study
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function CompletionModal({
  open,
  onOpenChange,
  platform,
  seconds,
  formatTime,
  participantName,
  setParticipantName,
  submitResults,
  confidenceRating,
  setConfidenceRating,
  helpfulnessResponse,
  setHelpfulnessResponse,
  locked,
  isSubmitting,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  platform: string;
  seconds: number;
  formatTime: (s: number) => string;
  participantName: string;
  setParticipantName: (v: string) => void;
  submitResults: () => void;
  confidenceRating: number | null;
  setConfidenceRating: (v: number | null) => void;
  helpfulnessResponse: "yes" | "no" | null;
  setHelpfulnessResponse: (v: "yes" | "no" | null) => void;
  locked?: boolean;
  isSubmitting: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md border-border/40 bg-card rounded-2xl shadow-2xl">
        <DialogHeader className="flex flex-col items-center gap-4 text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="h-16 w-16 bg-emerald-500/10 rounded-full flex items-center justify-center border-2 border-emerald-500/20 text-emerald-500"
          >
            <Trophy className="h-8 w-8" />
          </motion.div>
          <DialogTitle className="text-2xl font-black uppercase tracking-tight">
            Mission Complete
          </DialogTitle>
          <DialogDescription className="font-medium">
            You completed the {platform === "hyve" ? "HYVE" : "Traditional"}{" "}
            protocol in{" "}
            <span className="font-black text-foreground">
              {formatTime(seconds)}
            </span>
            .
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-5">
          {/* Confidence rating — always shown */}
          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              How confident are you in your answers?
            </p>
            <div className="flex gap-2 justify-between">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setConfidenceRating(n)}
                  className={cn(
                    "flex-1 h-10 rounded-lg border font-black text-sm transition-all",
                    confidenceRating === n
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-muted/30 hover:border-primary/50",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="flex justify-between text-[9px] text-muted-foreground/50 font-medium px-0.5">
              <span>Not confident</span>
              <span>Very confident</span>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Did this experience help you make an informed decision about purchasing the product?
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setHelpfulnessResponse("yes")}
                className={cn(
                  "h-10 rounded-lg border font-black text-sm transition-all",
                  helpfulnessResponse === "yes"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-muted/30 hover:border-primary/50",
                )}
              >
                Yes
              </button>
              <button
                onClick={() => setHelpfulnessResponse("no")}
                className={cn(
                  "h-10 rounded-lg border font-black text-sm transition-all",
                  helpfulnessResponse === "no"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-muted/30 hover:border-primary/50",
                )}
              >
                No
              </button>
            </div>
          </div>
          {/* Participant ID — hide in locked/study mode */}
          {!locked && (
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2 block">
                Participant Identifier
              </label>
              <input
                type="text"
                className="w-full bg-muted/50 border border-border/40 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-primary/50 transition-colors"
                placeholder="e.g. user_42 or student_A"
                value={participantName}
                onChange={(e) => setParticipantName(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground/60 mt-2 font-medium">
                Optional — helps link your result to a participant record.
              </p>
            </div>
          )}
        </div>
        <DialogFooter className="sm:justify-center gap-3">
          <Button
            variant="ghost"
            className="font-black text-[10px] uppercase tracking-widest h-10 px-6"
            onClick={() => onOpenChange(false)}
          >
            Back
          </Button>
          <Button
            className="font-black text-xs uppercase tracking-widest h-10 px-8 gap-2"
            onClick={submitResults}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trophy className="h-3.5 w-3.5" />
            )}
            {isSubmitting ? "Submitting..." : "Submit & Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ThankYouDialog({
  open,
  platform,
  seconds,
  formatTime,
  onDone,
}: {
  open: boolean;
  platform: string;
  seconds: number;
  formatTime: (s: number) => string;
  onDone: () => void;
}) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="sm:max-w-md rounded-2xl border-border/40 bg-card shadow-2xl">
        <AlertDialogHeader className="flex flex-col items-center gap-4 text-center">
          <motion.div
            initial={{ scale: 0.86, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="h-16 w-16 rounded-full border-2 border-emerald-500/20 bg-emerald-500/10 text-emerald-500 flex items-center justify-center"
          >
            <PartyPopper className="h-8 w-8" />
          </motion.div>
          <AlertDialogTitle className="text-2xl font-black tracking-tight">
            Thank You
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-6">
            Your {platform === "hyve" ? "HYVE" : "Traditional"} study response
            has been submitted successfully.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="rounded-xl border border-border/40 bg-muted/20 p-4 text-center">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Completion Time
          </p>
          <p className="mt-2 text-2xl font-black tabular-nums">
            {formatTime(seconds)}
          </p>
        </div>

        <AlertDialogFooter className="sm:justify-center">
          <AlertDialogAction
            className="h-10 px-8 rounded-xl font-black uppercase tracking-widest text-xs"
            onClick={onDone}
          >
            Finish
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default ExperimentMode;
