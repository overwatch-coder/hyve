import React, { useState, useEffect, useRef } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Trophy,
  X,
  Zap,
  Target,
  ClipboardCheck,
  List as ListIcon,
  Star,
  Clock,
  Lock,
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
import { motion } from "framer-motion";
import api from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

interface ExperimentModeProps {
  onClose: () => void;
  productId: string;
}

const ExperimentMode: React.FC<ExperimentModeProps> = ({
  onClose,
  productId,
}) => {
  const [platform, setPlatform] = useState<"select" | "hyve" | "traditional">(
    "select",
  );
  const [seconds, setSeconds] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [tasks, setTasks] = useState({
    weakness: false,
    evidence: false,
    recommendation: false,
  });
  const [showModal, setShowModal] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // FETCH: Reviews for Traditional View
  const { data: reviews } = useQuery({
    queryKey: ["product-reviews-traditional", productId],
    queryFn: async () => {
      const res = await api.get(`/reviews?product_id=${productId}&size=50`);
      return res.data.items;
    },
    enabled: platform === "traditional",
  });

  useEffect(() => {
    if (isActive) {
      timerRef.current = setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
    } else if (!isActive && timerRef.current) {
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
    setTasks({ weakness: false, evidence: false, recommendation: false });
  };

  const handleTaskToggle = (task: keyof typeof tasks) => {
    const newTasks = { ...tasks, [task]: !tasks[task] };
    setTasks(newTasks);

    if (newTasks.weakness && newTasks.evidence && newTasks.recommendation) {
      setIsActive(false);
      setShowModal(true);

      const result = {
        timestamp: new Date().toISOString(),
        timeSeconds: seconds,
        productId,
        mode: platform,
      };
      const existingLogs = JSON.parse(
        localStorage.getItem("hyve_experiment_results") || "[]",
      );
      localStorage.setItem(
        "hyve_experiment_results",
        JSON.stringify([...existingLogs, result]),
      );
    }
  };

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const completedCount = Object.values(tasks).filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-3xl flex flex-col animate-in fade-in duration-500">
      {/* ── TOP NAV / HUD ── */}
      <div className="h-16 border-b border-border/30 px-6 flex items-center justify-between bg-card/50">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary fill-primary" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">
              A/B Mission HUD
            </span>
          </div>
          {platform !== "select" && (
            <Badge
              variant="outline"
              className="text-[10px] font-bold border-primary/20 bg-primary/5 capitalize"
            >
              {platform} Protocol Active
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3 bg-muted/50 px-4 py-1.5 rounded-full border border-border/50">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm font-mono font-black tabular-nums tracking-tighter">
              {formatTime(seconds)}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── MAIN CONTENT AREA ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Experimental View */}
        <div className="flex-1 overflow-hidden relative">
          {platform === "select" ? (
            <div className="h-full flex items-center justify-center p-12">
              <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Traditional Mode */}
                <Card
                  className="group cursor-pointer hover:border-primary/50 transition-all duration-500 overflow-hidden relative"
                  onClick={() => startExperiment("traditional")}
                >
                  <div className="absolute inset-0 bg-linear-to-b from-transparent to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <CardHeader className="p-8 pb-4">
                    <div className="h-14 w-14 bg-muted rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <ListIcon className="h-7 w-7 text-muted-foreground" />
                    </div>
                    <CardTitle className="text-2xl font-black tracking-tight">
                      Traditional Method
                    </CardTitle>
                    <CardDescription className="text-sm font-medium">
                      Standard review list as seen on Amazon, Yelp, or Walmart.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-8 pt-0">
                    <ul className="space-y-3 text-xs text-muted-foreground font-medium">
                      <li className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
                        Linear scroll of individual comments
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
                        Static 1-5 star rating system
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
                        Manual scanning for hidden insights
                      </li>
                    </ul>
                    <Button className="w-full mt-10 font-bold uppercase tracking-widest text-[10px]">
                      Initialize Protocol
                    </Button>
                  </CardContent>
                </Card>

                {/* HYVE Mode */}
                <Card
                  className="group cursor-pointer border-primary/30 hover:border-primary transition-all duration-500 overflow-hidden relative shadow-2xl shadow-primary/10"
                  onClick={() => startExperiment("hyve")}
                >
                  <div className="absolute inset-0 bg-linear-to-b from-transparent to-primary/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <CardHeader className="p-8 pb-4">
                    <div className="h-14 w-14 bg-primary/20 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <Zap className="h-7 w-7 text-primary fill-primary" />
                    </div>
                    <CardTitle className="text-2xl font-black tracking-tight text-primary">
                      HYVE Intelligence
                    </CardTitle>
                    <CardDescription className="text-sm font-medium">
                      Deep AI synthesis using structured consumer claim graphs.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-8 pt-0">
                    <ul className="space-y-3 text-xs text-primary/70 font-bold">
                      <li className="flex items-center gap-2">
                        <Star className="h-3 w-3 fill-primary" />
                        Interactive tree-based knowledge graph
                      </li>
                      <li className="flex items-center gap-2">
                        <Star className="h-3 w-3 fill-primary" />
                        AI-distilled thematic clusters
                      </li>
                      <li className="flex items-center gap-2">
                        <Star className="h-3 w-3 fill-primary" />
                        Automated pro/con synthesis
                      </li>
                    </ul>
                    <Button className="w-full mt-10 font-black uppercase tracking-widest text-[10px] bg-primary text-primary-foreground">
                      Start AI Protocol
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col p-6">
              {platform === "traditional" ? (
                <Card className="flex-1 flex flex-col overflow-hidden bg-card/30 border-border/40">
                  <div className="flex-1 overflow-y-auto">
                    <div className="p-8 max-w-3xl mx-auto space-y-6">
                      <h2 className="text-3xl font-black tracking-tight mb-8">
                        Customer Reviews
                      </h2>
                      {reviews?.map((review: any) => (
                        <div
                          key={review.id}
                          className="p-6 bg-background/50 border border-border/30 rounded-2xl space-y-3 shadow-sm"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex gap-0.5">
                              {[...Array(5)].map((_, i) => (
                                <Star
                                  key={i}
                                  className={cn(
                                    "h-4 w-4",
                                    i < (review.star_rating || 5)
                                      ? "fill-amber-400 text-amber-400"
                                      : "text-muted",
                                  )}
                                />
                              ))}
                            </div>
                            <span className="text-[10px] font-bold text-muted-foreground uppercase">
                              {new Date(review.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-sm font-medium leading-relaxed text-foreground/80">
                            {review.original_text}
                          </p>
                          <div className="text-[9px] font-black tracking-widest uppercase text-muted-foreground/60">
                            {review.source} Verified Purchase
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>
              ) : (
                <div className="flex-1 flex items-center justify-center flex-col gap-6 text-center bg-card/10 rounded-3xl border border-primary/10">
                  <div className="p-12">
                    <div className="h-20 w-20 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-6">
                      <Lock className="h-10 w-10 text-primary" />
                    </div>
                    <h2 className="text-2xl font-black tracking-tight mb-2 uppercase italic">
                      HYVE Protocol Locked
                    </h2>
                    <p className="text-sm font-medium text-muted-foreground max-w-md mx-auto">
                      Use the main interface features behind this overlay. The
                      HUD in the right panel tracks your progress.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Mission HUD / Tasks */}
        {platform !== "select" && (
          <div className="w-96 border-l border-border/30 p-8 flex flex-col gap-8 bg-card/20 relative">
            <div className="space-y-1">
              <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">
                Mission Checklist
              </h4>
              <p className="text-xs text-muted-foreground">
                Complete tasks to finish the test.
              </p>
            </div>

            <div className="space-y-4">
              {[
                {
                  id: "weakness",
                  icon: Target,
                  label: "Identify Top Weakness",
                },
                {
                  id: "evidence",
                  icon: ClipboardCheck,
                  label: "Find Supporting Claim",
                },
                {
                  id: "recommendation",
                  icon: Zap,
                  label: "Review AI Strategies",
                },
              ].map((task) => (
                <motion.div
                  key={task.id}
                  className={cn(
                    "group flex items-center gap-4 p-4 rounded-2xl border transition-all duration-300",
                    tasks[task.id as keyof typeof tasks]
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600"
                      : "bg-background/20 border-border/40 text-muted-foreground",
                  )}
                  whileHover={{ x: 8 }}
                >
                  <Checkbox
                    id={task.id}
                    checked={tasks[task.id as keyof typeof tasks]}
                    onCheckedChange={() =>
                      handleTaskToggle(task.id as keyof typeof tasks)
                    }
                    className="h-5 w-5 rounded-lg data-[state=checked]:bg-emerald-500"
                  />
                  <label
                    htmlFor={task.id}
                    className="text-xs font-black cursor-pointer flex-1"
                  >
                    {task.label}
                  </label>
                  <task.icon
                    className={cn(
                      "h-4 w-4 transition-colors",
                      tasks[task.id as keyof typeof tasks]
                        ? "text-emerald-500"
                        : "opacity-20",
                    )}
                  />
                </motion.div>
              ))}
            </div>

            {/* Task Progress Bar */}
            <div className="mt-auto">
              <div className="flex justify-between items-end mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Task Coverage
                </span>
                <span className="text-[10px] font-black text-primary">
                  {Math.round((completedCount / 3) * 100)}%
                </span>
              </div>
              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-primary"
                  initial={{ width: 0 }}
                  animate={{ width: `${(completedCount / 3) * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Completion Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-md border-primary/20 bg-background/95 backdrop-blur-xl">
          <DialogHeader className="flex flex-col items-center gap-4 text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="h-20 w-20 bg-emerald-500/10 rounded-full flex items-center justify-center border-2 border-emerald-500/20 text-emerald-500"
            >
              <Trophy className="h-10 w-10" />
            </motion.div>
            <DialogTitle className="text-3xl font-black uppercase tracking-tight italic">
              Test Conducted
            </DialogTitle>
            <DialogDescription className="font-medium">
              You achieved the mission objective in {formatTime(seconds)} using
              the {platform === "hyve" ? "HYVE" : "Traditional"} protocol.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center">
            <Button
              onClick={onClose}
              className="w-full font-black uppercase tracking-widest text-xs h-12"
            >
              Submit Data & Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ExperimentMode;
