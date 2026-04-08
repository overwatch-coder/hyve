import { useState, useCallback, useEffect } from "react";
import { Joyride, STATUS } from "react-joyride";
import type { CallBackProps } from "react-joyride";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { HelpCircle, RotateCcw, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTourState } from "@/hooks/useTourState";
import {
  getStepsForRoute,
  getNextSequenceRoute,
  homeCompletionSteps,
  TOUR_SEQUENCE,
} from "@/config/tourSteps";
import api from "@/lib/api";

const PRIMARY = "#5048e5";

/** Detect whether dark mode is active */
function isDarkMode() {
  return document.documentElement.classList.contains("dark");
}

export default function TourController() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    isDismissed,
    isSequenceActive,
    sequenceIndex,
    isRouteCompleted,
    markRouteCompleted,
    dismissTour,
    restartTour,
    startSequence,
    endSequence,
    advanceSequence,
  } = useTourState();

  const [run, setRun] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [dark, setDark] = useState(isDarkMode);

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
  const isCompletionStep =
    isSequenceActive &&
    location.pathname === "/" &&
    sequenceIndex === TOUR_SEQUENCE.length - 1;

  const steps = isCompletionStep
    ? homeCompletionSteps
    : getStepsForRoute(location.pathname);

  // Auto-start tour on new routes (or in sequence mode)
  useEffect(() => {
    if (steps.length > 0 && !isDismissed) {
      if (isSequenceActive || !isRouteCompleted(routeKey)) {
        const t = setTimeout(() => setRun(true), 600);
        return () => clearTimeout(t);
      }
    }
    setRun(false);
  }, [routeKey, steps.length, isDismissed, isSequenceActive, isRouteCompleted, isCompletionStep]);

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
    (data: CallBackProps) => {
      const { status } = data;
      const finished = [STATUS.FINISHED, STATUS.SKIPPED].includes(status as any);
      if (!finished) return;

      setRun(false);

      if (status === STATUS.SKIPPED) {
        dismissTour();
        endSequence();
        return;
      }

      markRouteCompleted(routeKey);

      if (isSequenceActive) {
        const nextTemplate = getNextSequenceRoute(sequenceIndex);
        if (nextTemplate) {
          let resolved = resolveSequenceRoute(nextTemplate);
          // If dynamic product not available, skip to the entry after it
          if (!resolved && nextTemplate === "DYNAMIC_PRODUCT") {
            advanceSequence(); // skip DYNAMIC_PRODUCT
            const fallback = getNextSequenceRoute(sequenceIndex + 1);
            resolved = fallback;
          }
          if (resolved) {
            advanceSequence();
            navigate(resolved);
          } else {
            endSequence();
          }
        } else {
          // Sequence complete
          endSequence();
        }
      }
    },
    [
      routeKey,
      dismissTour,
      markRouteCompleted,
      isSequenceActive,
      sequenceIndex,
      endSequence,
      advanceSequence,
      navigate,
      resolveSequenceRoute,
    ],
  );

  const handleStartPageTour = () => {
    setShowHelp(false);
    setRun(true);
  };

  const handleStartFullTour = () => {
    setShowHelp(false);
    restartTour();
    startSequence();
    if (location.pathname !== "/") {
      navigate("/");
    } else {
      setTimeout(() => setRun(true), 200);
    }
  };

  const handleResetHistory = () => {
    restartTour();
    setShowHelp(false);
  };

  const tooltipBg = dark ? "#1a1d2e" : "#ffffff";
  const tooltipText = dark ? "#e2e8f0" : "#1e293b";
  const mutedText = dark ? "#94a3b8" : "#64748b";

  // Determine the "last" button label based on context
  const isLastInSequence =
    isSequenceActive && sequenceIndex >= TOUR_SEQUENCE.length - 1;
  const lastLabel = isSequenceActive
    ? isLastInSequence
      ? "Finish tour"
      : "Next page →"
    : "Done";

  return (
    <>
      {steps.length > 0 && (
        <Joyride
          steps={steps}
          run={run}
          continuous
          showSkipButton
          showProgress
          scrollToFirstStep
          disableOverlayClose
          callback={handleJoyrideCallback}
          locale={{
            back: "Back",
            close: "Got it",
            last: lastLabel,
            next: "Next",
            skip: "Skip tour",
          }}
          styles={{
            options: {
              primaryColor: PRIMARY,
              backgroundColor: tooltipBg,
              textColor: tooltipText,
              arrowColor: tooltipBg,
              overlayColor: "rgba(0, 0, 0, 0.55)",
              zIndex: 10000,
            },
            tooltip: {
              borderRadius: 12,
              fontSize: 14,
              padding: "16px 20px",
              boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
            },
            tooltipTitle: {
              fontSize: 15,
              fontWeight: 700,
              color: tooltipText,
            },
            tooltipContent: {
              padding: "8px 0",
              color: tooltipText,
              lineHeight: 1.6,
            },
            tooltipFooter: {
              marginTop: 8,
            },
            buttonNext: {
              backgroundColor: PRIMARY,
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              padding: "8px 18px",
            },
            buttonBack: {
              color: mutedText,
              fontSize: 13,
              marginRight: 8,
            },
            buttonSkip: {
              color: mutedText,
              fontSize: 12,
            },
            buttonClose: {
              color: mutedText,
            },
            beacon: {
              inner: PRIMARY,
              outer: PRIMARY,
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
