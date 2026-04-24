import { useState } from "react";

const SESSION_KEY = "hyve_study_session";

export interface StudySession {
  session_token: string;
  assigned_platform: "hyve" | "traditional";
  product_id: number;
  instructions: string;
  invite_code: string;
}

export function useStudySession() {
  const [session, setSession] = useState<StudySession | null>(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as StudySession) : null;
    } catch {
      return null;
    }
  });

  const saveSession = (s: StudySession) => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    setSession(s);
  };

  const clearSession = () => {
    sessionStorage.removeItem(SESSION_KEY);
    setSession(null);
  };

  return { session, saveSession, clearSession };
}
