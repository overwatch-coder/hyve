import { useState, useCallback, useEffect } from "react";

const TOUR_KEY = "hyve_tour_state";

interface TourState {
  /** Routes the user has already completed the tour on */
  completedRoutes: string[];
  /** Whether the user dismissed the entire tour */
  dismissed: boolean;
}

function loadState(): TourState {
  try {
    const raw = localStorage.getItem(TOUR_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // corrupted — reset
  }
  return { completedRoutes: [], dismissed: false };
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
    setState((prev) => ({ ...prev, dismissed: true }));
  }, []);

  const restartTour = useCallback(() => {
    setState({ completedRoutes: [], dismissed: false });
  }, []);

  return {
    isDismissed: state.dismissed,
    isRouteCompleted,
    markRouteCompleted,
    dismissTour,
    restartTour,
  };
}
