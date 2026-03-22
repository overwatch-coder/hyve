import { useEffect, useMemo, useState } from "react";
import { Bot, GitBranch, MessageSquare } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Step = {
  key: "reviews" | "analysis" | "decision";
  title: string;
  subtitle: string;
  Icon: typeof MessageSquare;
};

export function HeroProcessVisualization({ className }: { className?: string }) {
  const shouldReduceMotion = useReducedMotion();

  const steps = useMemo<Step[]>(
    () => [
      {
        key: "reviews",
        title: "Product Reviews",
        subtitle: "Raw snippets, ratings, and mentions",
        Icon: MessageSquare,
      },
      {
        key: "analysis",
        title: "AI Analysis",
        subtitle: "Themes + sentiment signals",
        Icon: Bot,
      },
      {
        key: "decision",
        title: "Decision Tree",
        subtitle: "Clear pros/cons paths",
        Icon: GitBranch,
      },
    ],
    [],
  );

  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (shouldReduceMotion) return;

    const id = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % steps.length);
    }, 2200);

    return () => window.clearInterval(id);
  }, [shouldReduceMotion, steps.length]);

  const derivedActiveIndex = shouldReduceMotion ? steps.length - 1 : activeIndex;

  const result =
    derivedActiveIndex >= steps.length - 1 ? "Recommendation Ready" : "Building…";

  return (
    <div className={cn("flex flex-col gap-5", className)}>
      <div className="flex flex-col gap-3">
        {steps.map((step, index) => {
          const isActive = index === derivedActiveIndex;
          const isComplete = index < derivedActiveIndex;

          return (
            <div key={step.key} className="grid grid-cols-[28px_1fr] gap-3">
              <div className="flex flex-col items-center">
                <motion.div
                  animate={
                    isActive && !shouldReduceMotion
                      ? { scale: 1.04 }
                      : { scale: 1 }
                  }
                  transition={{ type: "spring", stiffness: 300, damping: 22 }}
                  className={cn(
                    "size-7 rounded-lg border flex items-center justify-center",
                    isActive
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-border/40 bg-muted/20 text-muted-foreground",
                  )}
                >
                  <step.Icon className="h-3.5 w-3.5" />
                </motion.div>

                {index < steps.length - 1 ? (
                  <div className="relative w-px flex-1 min-h-6 bg-border/40 my-1 overflow-hidden rounded-full">
                    <motion.div
                      className="absolute inset-0 bg-primary/40 origin-top"
                      initial={false}
                      animate={{ scaleY: isComplete ? 1 : 0 }}
                      transition={{ duration: 0.45, ease: "easeOut" }}
                    />

                    <AnimatePresence initial={false}>
                      {isActive && !shouldReduceMotion ? (
                        <motion.div
                          key="dot"
                          className="absolute left-1/2 -translate-x-1/2 size-1.5 rounded-full bg-primary"
                          initial={{ opacity: 0, y: 2 }}
                          animate={{ opacity: 1, y: [2, 18, 2] }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 1.2, ease: "easeInOut", repeat: Infinity }}
                        />
                      ) : null}
                    </AnimatePresence>
                  </div>
                ) : null}
              </div>

              <motion.div
                animate={
                  isActive && !shouldReduceMotion
                    ? { y: -1 }
                    : { y: 0 }
                }
                transition={{ type: "spring", stiffness: 300, damping: 26 }}
                className={cn(
                  "rounded-xl border px-3.5 py-3",
                  isActive
                    ? "border-primary/20 bg-primary/5"
                    : "border-border/40 bg-background/40",
                )}
              >
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-foreground">
                  {step.title}
                </p>
                <p className="text-xs font-medium text-muted-foreground mt-1 leading-relaxed">
                  {step.subtitle}
                </p>
              </motion.div>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-border/40 bg-muted/15 px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">
              Decision Tree Result
            </p>
            <p className="text-sm font-bold text-foreground truncate mt-1">{result}</p>
          </div>
          <Badge
            variant={
              derivedActiveIndex >= steps.length - 1 ? "default" : "secondary"
            }
          >
            {derivedActiveIndex >= steps.length - 1 ? "Ready" : "Processing"}
          </Badge>
        </div>
      </div>
    </div>
  );
}
