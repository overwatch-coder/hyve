import { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";

const ADMIN_TOKEN_KEY = "hyve_admin_token";

export function useAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const token = localStorage.getItem(ADMIN_TOKEN_KEY);

  // Verify token on mount
  useEffect(() => {
    const verify = async () => {
      if (!token) {
        setIsAdmin(false);
        setIsLoading(false);
        return;
      }
      try {
        await api.get("/admin/verify", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setIsAdmin(true);
      } catch {
        localStorage.removeItem(ADMIN_TOKEN_KEY);
        setIsAdmin(false);
      } finally {
        setIsLoading(false);
      }
    };
    verify();
  }, [token]);

  const login = useCallback(async (password: string) => {
    const res = await api.post("/admin/login", { password });
    const jwt = res.data.token;
    localStorage.setItem(ADMIN_TOKEN_KEY, jwt);
    setIsAdmin(true);
    return jwt;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    setIsAdmin(false);
  }, []);

  // Helper to get auth headers for admin API calls
  const getAuthHeaders = useCallback(() => {
    const t = localStorage.getItem(ADMIN_TOKEN_KEY);
    return t ? { Authorization: `Bearer ${t}` } : {};
  }, []);

  return { isAdmin, isLoading, token, login, logout, getAuthHeaders };
}
