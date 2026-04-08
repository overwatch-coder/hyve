import { useState, useCallback, useEffect } from "react";
import { Joyride, STATUS } from "react-joyride";
import type { CallBackProps } from "react-joyride";
import { useLocation } from "react-router-dom";
import { HelpCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTourState } from "@/hooks/useTourState";
import { getStepsForRoute } from "@/config/tourSteps";

/**
 * Global tour controller that renders based on current route.
 * Includes a floating help button to restart the tour.
 */
export default function TourController() {
  const location = useLocation();
  const {
    isDismissed,
    isRouteCompleted,
    markRouteCompleted,
    dismissTour,
    restartTour,
  } = useTourState();

  const [run, setRun] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // Normalise route key — collapse parameterised routes
  const routeKey = location.pathname
    .replace(/\/\d+/g, "/:id")
    .replace(/\/$/, "") || "/";

  const steps = getStepsForRoute(location.pathname);

  // Auto-start tour for routes that haven't been seen yet
  useEffect(() => {
    if (steps.length > 0 && !isDismissed && !isRouteCompleted(routeKey)) {
      // Small delay so page content renders first
      const t = setTimeout(() => setRun(true), 600);
      return () => clearTimeout(t);
    } else {
      setRun(false);
    }
  }, [routeKey, steps.length, isDismissed, isRouteCompleted]);

  const handleJoyrideCallback = useCallback(
    (data: CallBackProps) => {
      const { status } = data;
      const finished = [STATUS.FINISHED, STATUS.SKIPPED].includes(
        status as any,
      );
      if (finished) {
        setRun(false);
        if (status === STATUS.SKIPPED) {
          dismissTour();
        } else {
          markRouteCompleted(routeKey);
        }
      }
    },
    [routeKey, dismissTour, markRouteCompleted],
  );

  const handleRestart = () => {
    restartTour();
    setShowHelp(false);
    // Force re-run on next tick after state clears
    setTimeout(() => setRun(true), 100);
  };

  const handleStartTour = () => {
    setShowHelp(false);
    setRun(true);
  };

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
            last: "Finish",
            next: "Next",
            skip: "Skip tour",
          }}
          styles={{
            options: {
              primaryColor: "hsl(262 83% 58%)",
              zIndex: 10000,
            },
            tooltip: {
              borderRadius: 12,
              fontSize: 14,
            },
            buttonNext: {
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
            },
            buttonBack: {
              color: "hsl(220 9% 46%)",
              fontSize: 13,
            },
            buttonSkip: {
              color: "hsl(220 9% 46%)",
              fontSize: 12,
            },
          }}
        />
      )}

      {/* Floating help launcher */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
        {showHelp && (
          <div className="bg-popover border border-border rounded-xl shadow-lg p-4 w-64 animate-in slide-in-from-bottom-2 fade-in duration-200">
            <p className="text-sm font-semibold mb-2">Need help?</p>
            <p className="text-xs text-muted-foreground mb-3">
              Take a guided tour of this page or restart the full walkthrough.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="text-xs flex-1"
                onClick={handleStartTour}
              >
                This page
              </Button>
              <Button
                size="sm"
                className="text-xs flex-1"
                onClick={handleRestart}
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Full tour
              </Button>
            </div>
          </div>
        )}
        <Button
          size="icon"
          className="h-12 w-12 rounded-full shadow-lg"
          onClick={() => setShowHelp((prev) => !prev)}
          aria-label="Help & guided tour"
        >
          <HelpCircle className="h-5 w-5" />
        </Button>
      </div>
    </>
  );
}
