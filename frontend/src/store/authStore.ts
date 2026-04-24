import { create } from "zustand";
import { persist } from "zustand/middleware";
import api from "@/lib/api";

interface User {
  id: string;
  tenant_id: string;
  username: string;
  email: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  fetchMe: () => Promise<void>;
}

// Next.js middleware runs on the Edge and can only read cookies, not localStorage.
// We set a lightweight session cookie alongside localStorage so the middleware can
// gate protected routes. The cookie carries no sensitive data — the real token
// lives in localStorage and is attached to API requests via the Axios interceptor.
function setAuthCookie(value: string) {
  document.cookie = `access_token=${value}; path=/; SameSite=Lax`;
}

function clearAuthCookie() {
  document.cookie = "access_token=; path=/; max-age=0; SameSite=Lax";
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (username, password) => {
        set({ isLoading: true });
        try {
          const res = await api.post("/auth/login", { username, password });
          localStorage.setItem("access_token", res.data.access_token);
          localStorage.setItem("refresh_token", res.data.refresh_token);
          setAuthCookie(res.data.access_token);
          const meRes = await api.get("/auth/me");
          set({ user: meRes.data, isAuthenticated: true, isLoading: false });
        } catch (err) {
          set({ isLoading: false });
          throw err;
        }
      },

      register: async (username, email, password) => {
        set({ isLoading: true });
        try {
          const res = await api.post("/auth/register", { username, email, password });
          localStorage.setItem("access_token", res.data.access_token);
          localStorage.setItem("refresh_token", res.data.refresh_token);
          setAuthCookie(res.data.access_token);
          const meRes = await api.get("/auth/me");
          set({ user: meRes.data, isAuthenticated: true, isLoading: false });
        } catch (err) {
          set({ isLoading: false });
          throw err;
        }
      },

      logout: () => {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        clearAuthCookie();
        set({ user: null, isAuthenticated: false });
        window.location.href = "/login";
      },

      fetchMe: async () => {
        try {
          const res = await api.get("/auth/me");
          set({ user: res.data, isAuthenticated: true });
        } catch {
          set({ user: null, isAuthenticated: false });
        }
      },
    }),
    { name: "guidebard-auth", partialize: (s) => ({ user: s.user, isAuthenticated: s.isAuthenticated }) }
  )
);
