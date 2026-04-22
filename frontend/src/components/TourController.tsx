import { useState, useCallback, useEffect, useRef } from "react";
import { ACTIONS, EVENTS, Joyride, STATUS } from "react-joyride";
import type { EventData, TooltipRenderProps } from "react-joyride";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { HelpCircle, MapPin, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTourState } from "@/hooks/useTourState";
import {
  getStepsForRoute,
  homeCompletionSteps,
  TOUR_SEQUENCE,
} from "@/config/tourSteps";
import api from "@/lib/api";

const PRIMARY = "#5048e5";

/** Detect whether dark mode is active */
function isDarkMode() {
  return document.documentElement.classList.contains("dark");
}

interface TourTooltipExtraProps {
  dark: boolean;
  isSequenceMode: boolean;
  onStartFullTour: () => void;
}

function TourTooltip({
  backProps,
  closeProps,
  index,
  isLastStep,
  primaryProps,
  size,
  skipProps,
  step,
  tooltipProps,
  dark,
  isSequenceMode,
  onStartFullTour,
}: TooltipRenderProps & TourTooltipExtraProps) {
  const backgroundColor = dark ? "#1a1d2e" : "#ffffff";
  const foregroundColor = dark ? "#e2e8f0" : "#1e293b";
  const secondaryColor = dark ? "#94a3b8" : "#64748b";

  const buttonStyle = {
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    padding: "8px 14px",
    border: "1px solid transparent",
    cursor: "pointer",
  } as const;

  return (
    <div
      {...tooltipProps}
      style={{
        width: 340,
        maxWidth: "calc(100vw - 32px)",
        borderRadius: 12,
        padding: 20,
        boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        backgroundColor,
        color: foregroundColor,
      }}
    >
      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, color: secondaryColor }}>
          Step {index + 1} of {size}
        </div>
        <button
          {...closeProps}
          style={{
            background: "transparent",
            border: 0,
            color: secondaryColor,
            cursor: "pointer",
            padding: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {step.title ? (
        <div style={{ marginTop: 12, fontSize: 15, fontWeight: 700 }}>
          {step.title}
        </div>
      ) : null}

      <div style={{ marginTop: 12, lineHeight: 1.6, fontSize: 14 }}>
        {step.content}
      </div>

      <div
        style={{
          marginTop: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        {index > 0 ? (
          <button
            {...backProps}
            style={{
              ...buttonStyle,
              background: "transparent",
              color: secondaryColor,
              borderColor: dark ? "#334155" : "#cbd5e1",
            }}
          >
            Back
          </button>
        ) : (
          <span />
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginLeft: "auto" }}>
          {isSequenceMode ? (
            <button
              {...skipProps}
              style={{
                ...buttonStyle,
                background: "transparent",
                color: secondaryColor,
                borderColor: dark ? "#334155" : "#cbd5e1",
              }}
            >
              Skip tour
            </button>
          ) : (
            <button
              type="button"
              onClick={onStartFullTour}
              style={{
                ...buttonStyle,
                background: "transparent",
                color: secondaryColor,
                borderColor: dark ? "#334155" : "#cbd5e1",
              }}
            >
              Full site tour
            </button>
          )}

          <button
            {...primaryProps}
            style={{
              ...buttonStyle,
              backgroundColor: PRIMARY,
              color: "#ffffff",
            }}
          >
            {isLastStep ? primaryProps.title : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TourController() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    isSequenceActive,
    sequenceIndex,
    isRouteCompleted,
    markRouteCompleted,
    completeAllTours,
    restartTour,
    startSequence,
    endSequence,
    setSequenceIndex,
  } = useTourState();

  const [run, setRun] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [dark, setDark] = useState(isDarkMode);

  // Synchronous mirror of sequenceIndex — written before navigate() so that the
  // isCompletionStep computation in the very next render is always correct,
  // without relying on React state to settle before the route change renders.
  const committedIndexRef = useRef(sequenceIndex);

  // Fetch first analyzed product ID for dynamic tour routing
  const { data: firstProductId } = useQuery({
    queryKey: ["tour-first-product"],
    queryFn: async () => {
      const res = await api.get("/products?page=1&size=1");
      const items = res.data.items;
      return items?.length > 0 ? items[0].id : null;
    },
    staleTime: 1000 * 60 * 5,
  });

  // Keep ref in sync whenever persisted state changes (e.g. after startSequence / endSequence)
  useEffect(() => {
    committedIndexRef.current = sequenceIndex;
  }, [sequenceIndex]);

  // Track dark mode changes
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(isDarkMode()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  // Normalise route key
  const routeKey =
    location.pathname.replace(/\/\d+/g, "/:id").replace(/\/$/, "") || "/";

  // Determine which steps to show:
  // - If we're in sequence mode and back at "/" for the last step, show completion steps
  // - Otherwise use the normal route-based steps
  // Read from committedIndexRef (not state) so this is correct in the same render
  // that fires immediately after we call navigate() in handleJoyrideCallback.
  const isCompletionStep =
    isSequenceActive &&
    location.pathname === "/" &&
    committedIndexRef.current === TOUR_SEQUENCE.length - 1;

  const steps = isCompletionStep
    ? homeCompletionSteps
    : getStepsForRoute(location.pathname);

  // First landing-page visit should enter the full guided sequence automatically.
  // Without this, the intro modal runs as a standalone one-page tour and clicking
  // the last button simply finishes instead of advancing to /products.
  useEffect(() => {
    if (
      location.pathname === "/" &&
      !isSequenceActive &&
      !isRouteCompleted(routeKey)
    ) {
      committedIndexRef.current = 0;
      setSequenceIndex(0);
      startSequence();
    }
  }, [
    location.pathname,
    routeKey,
    isSequenceActive,
    isRouteCompleted,
    setSequenceIndex,
    startSequence,
  ]);

  // Auto-start tour on new routes (or in sequence mode).
  // The Explore page has an async data fetch, so give it a longer delay to
  // ensure the Joyride instance (remounted via key={routeKey}) is fully settled
  // before we set run=true and the first modal appears.
  const isExplorePage = /^\/products\/\d+$/.test(location.pathname);
  useEffect(() => {
    if (steps.length > 0 && (isSequenceActive || !isRouteCompleted(routeKey))) {
      const delay = isExplorePage ? 900 : 600;
      const t = setTimeout(() => setRun(true), delay);
      return () => clearTimeout(t);
    }
    setRun(false);
  }, [
    routeKey,
    steps.length,
    isSequenceActive,
    isRouteCompleted,
    isCompletionStep,
    isExplorePage,
  ]);

  /**
   * Resolve the actual URL for the next sequence entry.
   * "DYNAMIC_PRODUCT" resolves to the first analyzed product.
   */
  const resolveSequenceRoute = useCallback(
    (route: string): string | null => {
      if (route === "DYNAMIC_PRODUCT") {
        return firstProductId ? `/products/${firstProductId}` : null;
      }
      return route;
    },
    [firstProductId],
  );

  const handleJoyrideCallback = useCallback(
    (data: EventData) => {
      const { action, index, status, type } = data;
      const completedCurrentPageStep =
        type === EVENTS.STEP_AFTER &&
        action === ACTIONS.NEXT &&
        index === steps.length - 1;
      const skipped = status === STATUS.SKIPPED;
      const closed = action === ACTIONS.CLOSE;
      const finished = status === STATUS.FINISHED;

      if (!completedCurrentPageStep && !skipped && !closed && !finished) return;

      setRun(false);

      if (skipped || closed) {
        committedIndexRef.current = 0;
        if (isSequenceActive) {
          completeAllTours();
        } else {
          markRouteCompleted(routeKey);
        }
        return;
      }

      markRouteCompleted(routeKey);

      if (isSequenceActive) {
        // Use the ref for a synchronous, non-stale current index.
        // This avoids the race where advanceSequence() schedules a setState
        // but navigate() fires immediately, causing the next render to read
        // the old sequenceIndex from state.
        const currentIdx = committedIndexRef.current;
        const nextIndex = currentIdx + 1;
        const nextTemplate = TOUR_SEQUENCE[nextIndex] ?? null;

        if (!nextTemplate || nextIndex >= TOUR_SEQUENCE.length) {
          committedIndexRef.current = 0;
          endSequence();
          return;
        }

        let resolved: string | null = resolveSequenceRoute(nextTemplate);

        if (!resolved && nextTemplate === "DYNAMIC_PRODUCT") {
          // Dynamic product not yet available — skip to the entry after it.
          const skipIndex = nextIndex + 1;
          const skipTemplate = TOUR_SEQUENCE[skipIndex] ?? null;
          if (!skipTemplate) {
            committedIndexRef.current = 0;
            endSequence();
            return;
          }
          committedIndexRef.current = skipIndex;
          setSequenceIndex(skipIndex);
          navigate(skipTemplate);
          return;
        }

        if (resolved) {
          // Update the ref BEFORE navigate() so the very next render
          // (triggered by the route change) computes isCompletionStep correctly.
          committedIndexRef.current = nextIndex;
          setSequenceIndex(nextIndex);
          navigate(resolved);
        } else {
          committedIndexRef.current = 0;
          endSequence();
        }
      }
    },
    [
      routeKey,
      completeAllTours,
      markRouteCompleted,
      isSequenceActive,
      endSequence,
      setSequenceIndex,
      navigate,
      resolveSequenceRoute,
    ],
  );

  const handleStartPageTour = () => {
    setShowHelp(false);
    setRun(true);
  };

  const handleStartFullTour = useCallback(() => {
    setRun(false);
    setShowHelp(false);
    committedIndexRef.current = 0;
    restartTour();
    startSequence();
    if (location.pathname !== "/") {
      navigate("/");
    } else {
      setTimeout(() => setRun(true), 200);
    }
  }, [location.pathname, navigate, restartTour, startSequence]);

  const handleResetHistory = () => {
    restartTour();
    setShowHelp(false);
  };

  // Determine the "last" button label based on context
  const isLastInSequence =
    isSequenceActive && committedIndexRef.current >= TOUR_SEQUENCE.length - 1;
  const lastLabel = isSequenceActive
    ? isLastInSequence
      ? "Finish tour"
      : "Next page →"
    : "Done";

  return (
    <>
      {steps.length > 0 && (
        <Joyride
          key={routeKey}
          steps={steps}
          run={run}
          continuous
          scrollToFirstStep
          onEvent={handleJoyrideCallback}
          tooltipComponent={(props) => (
            <TourTooltip
              {...props}
              dark={dark}
              isSequenceMode={isSequenceActive}
              onStartFullTour={handleStartFullTour}
            />
          )}
          options={{
            showProgress: true,
            overlayColor: "rgba(0, 0, 0, 0.55)",
            zIndex: 10000,
            overlayClickAction: false,
          }}
          locale={{
            back: "Back",
            close: "Got it",
            last: lastLabel,
            next: "Next",
            skip: "Skip tour",
          }}
          styles={{
            beaconInner: {
              backgroundColor: PRIMARY,
            },
            beaconOuter: {
              borderColor: PRIMARY,
              backgroundColor: `${PRIMARY}33`,
            },
          }}
        />
      )}

      {/* Floating help launcher */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
        {showHelp && (
          <div className="bg-popover border border-border rounded-xl shadow-lg p-4 w-72 animate-in slide-in-from-bottom-2 fade-in duration-200">
            <p className="text-sm font-semibold mb-1">Guided tour</p>
            <p className="text-xs text-muted-foreground mb-3">
              Take a tour of just this page, or walk through the entire site
              step-by-step.
            </p>
            <div className="flex flex-col gap-2">
              {steps.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs justify-start gap-2"
                  onClick={handleStartPageTour}
                >
                  <MapPin className="h-3 w-3" />
                  Tour this page
                </Button>
              )}
              <Button
                size="sm"
                className="text-xs justify-start gap-2 text-white"
                style={{ backgroundColor: PRIMARY }}
                onClick={handleStartFullTour}
              >
                <HelpCircle className="h-3 w-3" />
                Full site tour
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-xs justify-start gap-2 text-muted-foreground"
                onClick={handleResetHistory}
              >
                <RotateCcw className="h-3 w-3" />
                Reset tour history
              </Button>
            </div>
          </div>
        )}
        <Button
          size="icon"
          className="h-12 w-12 rounded-full shadow-lg text-white"
          style={{ backgroundColor: PRIMARY }}
          onClick={() => setShowHelp((prev) => !prev)}
          aria-label="Help & guided tour"
        >
          <HelpCircle className="h-5 w-5" />
        </Button>
      </div>
    </>
  );
}
