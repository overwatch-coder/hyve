import { useState, useCallback, useEffect } from "react";

const TOUR_KEY = "hyve_tour_state";

interface TourState {
  /** Routes the user has already completed the tour on */
  completedRoutes: string[];
  /** Whether the user dismissed the entire tour */
  dismissed: boolean;
  /** Whether the full-site sequence tour is in progress */
  sequenceActive: boolean;
  /** Current index within the TOUR_SEQUENCE array */
  sequenceIndex: number;
}

function loadState(): TourState {
  try {
    const raw = localStorage.getItem(TOUR_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // corrupted — reset
  }
  return { completedRoutes: [], dismissed: false, sequenceActive: false, sequenceIndex: 0 };
}

function saveState(state: TourState) {
  localStorage.setItem(TOUR_KEY, JSON.stringify(state));
}

export function useTourState() {
  const [state, setState] = useState<TourState>(loadState);

  // Persist on every change
  useEffect(() => {
    saveState(state);
  }, [state]);

  const isRouteCompleted = useCallback(
    (routeKey: string) => state.completedRoutes.includes(routeKey),
    [state.completedRoutes],
  );

  const markRouteCompleted = useCallback((routeKey: string) => {
    setState((prev) => ({
      ...prev,
      completedRoutes: prev.completedRoutes.includes(routeKey)
        ? prev.completedRoutes
        : [...prev.completedRoutes, routeKey],
    }));
  }, []);

  const dismissTour = useCallback(() => {
    setState((prev) => ({ ...prev, dismissed: true, sequenceActive: false, sequenceIndex: 0 }));
  }, []);

  const restartTour = useCallback(() => {
    setState({ completedRoutes: [], dismissed: false, sequenceActive: false, sequenceIndex: 0 });
  }, []);

  const startSequence = useCallback(() => {
    setState((prev) => ({ ...prev, sequenceActive: true, sequenceIndex: 0, dismissed: false, completedRoutes: [] }));
  }, []);

  const endSequence = useCallback(() => {
    setState((prev) => ({ ...prev, sequenceActive: false, sequenceIndex: 0 }));
  }, []);

  const advanceSequence = useCallback(() => {
    setState((prev) => ({ ...prev, sequenceIndex: prev.sequenceIndex + 1 }));
  }, []);

  return {
    isDismissed: state.dismissed,
    isSequenceActive: state.sequenceActive,
    sequenceIndex: state.sequenceIndex,
    isRouteCompleted,
    markRouteCompleted,
    dismissTour,
    restartTour,
    startSequence,
    endSequence,
    advanceSequence,
  };
}
