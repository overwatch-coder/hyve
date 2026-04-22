import { useState, useCallback, useEffect } from "react";
import { TOUR_ROUTE_KEYS } from "@/config/tourSteps";

const TOUR_KEY = "hyve_tour_state";

interface TourState {
  /** Routes the user has already completed the tour on */
  completedRoutes: string[];
  /** Whether the full-site sequence tour is in progress */
  sequenceActive: boolean;
  /** Current index within the TOUR_SEQUENCE array */
  sequenceIndex: number;
}

interface StoredTourState extends Partial<TourState> {
  dismissed?: boolean;
}

const DEFAULT_STATE: TourState = {
  completedRoutes: [],
  sequenceActive: false,
  sequenceIndex: 0,
};

function loadState(): TourState {
  try {
    const raw = localStorage.getItem(TOUR_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredTourState;
      const completedRoutes = Array.isArray(parsed.completedRoutes)
        ? parsed.completedRoutes.filter(
            (route): route is string => typeof route === "string",
          )
        : [];

      if (parsed.dismissed) {
        return {
          ...DEFAULT_STATE,
          completedRoutes: [...TOUR_ROUTE_KEYS],
        };
      }

      return {
        completedRoutes,
        sequenceActive: parsed.sequenceActive === true,
        sequenceIndex:
          typeof parsed.sequenceIndex === "number" ? parsed.sequenceIndex : 0,
      };
    }
  } catch {
    // corrupted — reset
  }
  return DEFAULT_STATE;
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

  const completeAllTours = useCallback(() => {
    setState({
      ...DEFAULT_STATE,
      completedRoutes: [...TOUR_ROUTE_KEYS],
    });
  }, []);

  const restartTour = useCallback(() => {
    setState(DEFAULT_STATE);
  }, []);

  const startSequence = useCallback(() => {
    setState((prev) => ({
      ...prev,
      sequenceActive: true,
      sequenceIndex: 0,
      completedRoutes: [],
    }));
  }, []);

  const endSequence = useCallback(() => {
    setState((prev) => ({ ...prev, sequenceActive: false, sequenceIndex: 0 }));
  }, []);

  const setSequenceIndex = useCallback((n: number) => {
    setState((prev) => ({ ...prev, sequenceIndex: n }));
  }, []);

  return {
    isSequenceActive: state.sequenceActive,
    sequenceIndex: state.sequenceIndex,
    isRouteCompleted,
    markRouteCompleted,
    completeAllTours,
    restartTour,
    startSequence,
    endSequence,
    setSequenceIndex,
  };
}
