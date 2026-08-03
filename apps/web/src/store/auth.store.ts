import { create } from "zustand";
import { apiClient } from "@/lib/api/client";

export interface User {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  status: "active" | "suspended" | "deleted";
  createdAt: string;
  updatedAt: string;
}

export interface AuthSession {
  id: string;
  token: string;
  userId: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  activeOrganizationId?: string | null;
}

interface SessionPayload {
  user: User;
  session: AuthSession;
}

interface AuthStore {
  user: User | null;
  session: AuthSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  initialized: boolean;
  initialize: () => Promise<void>;
  checkSession: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

let sessionRequest: Promise<void> | undefined;

async function ensureActiveOrganization(
  session: AuthSession,
): Promise<AuthSession> {
  if (session.activeOrganizationId) return session;

  try {
    const { data: organizations } = await apiClient.get<Array<{ id: string }>>(
      "/api/auth/organization/list",
    );
    const organizationId =
      organizations.length === 1 ? organizations[0]?.id : undefined;
    if (!organizationId) return session;

    await apiClient.post("/api/auth/organization/set-active", {
      organizationId,
    });
    return { ...session, activeOrganizationId: organizationId };
  } catch {
    return session;
  }
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  session: null,
  isAuthenticated: false,
  isLoading: true,
  initialized: false,

  initialize: async () => {
    if (get().initialized) return;
    set({ initialized: true });
    await get().checkSession();
  },

  checkSession: async () => {
    if (sessionRequest) return sessionRequest;
    sessionRequest = (async () => {
      set({ isLoading: true });
      try {
        const { data } = await apiClient.get<{
          data: SessionPayload | null;
          authenticated: boolean;
        }>("/api/v1/auth/session");

        if (data.authenticated && data.data) {
          const session = await ensureActiveOrganization(data.data.session);
          set({ user: data.data.user, session, isAuthenticated: true });
        } else {
          set({ user: null, session: null, isAuthenticated: false });
        }
      } catch {
        set({ user: null, session: null, isAuthenticated: false });
      } finally {
        set({ isLoading: false });
        sessionRequest = undefined;
      }
    })();
    return sessionRequest;
  },

  login: async (email, password) => {
    await apiClient.post("/api/auth/sign-in/email", { email, password });
    await get().checkSession();
  },

  register: async (name, email, password) => {
    await apiClient.post("/api/auth/sign-up/email", { name, email, password });
    await get().checkSession();
  },

  logout: async () => {
    try {
      await apiClient.post("/api/v1/auth/logout");
    } finally {
      set({ user: null, session: null, isAuthenticated: false });
    }
  },
}));
