import { useState, useCallback, useEffect } from "react";

const TOUR_KEY = "hyve_tour_state";

interface TourState {
  /** Routes the user has already completed the tour on */
  completedRoutes: string[];
  /** Whether the user dismissed the entire tour */
  dismissed: boolean;
  /** Whether the full-site sequence tour is in progress */
  sequenceActive: boolean;
}

function loadState(): TourState {
  try {
    const raw = localStorage.getItem(TOUR_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // corrupted — reset
  }
  return { completedRoutes: [], dismissed: false, sequenceActive: false };
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
    setState((prev) => ({ ...prev, dismissed: true, sequenceActive: false }));
  }, []);

  const restartTour = useCallback(() => {
    setState({ completedRoutes: [], dismissed: false, sequenceActive: false });
  }, []);

  const startSequence = useCallback(() => {
    setState((prev) => ({ ...prev, sequenceActive: true, dismissed: false }));
  }, []);

  const endSequence = useCallback(() => {
    setState((prev) => ({ ...prev, sequenceActive: false }));
  }, []);

  return {
    isDismissed: state.dismissed,
    isSequenceActive: state.sequenceActive,
    isRouteCompleted,
    markRouteCompleted,
    dismissTour,
    restartTour,
    startSequence,
    endSequence,
  };
}
