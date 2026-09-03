import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Empty by default, so auth calls go to the frontend's own origin — the same
 * default `lib/api/client.ts` uses, and for the same reason: the session cookie
 * has to stay first-party for Better Auth's OAuth callbacks to resolve. Vite
 * inlines this at build time, so a default of `localhost` would ship in the
 * production bundle and send every sign-in to a machine that isn't there.
 */
const API_URL = import.meta.env.VITE_API_URL ?? "";

type AuthUser = {
  id?: string;
  name?: string;
  email?: string;
  image?: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function readErrorMessage(response: Response) {
  try {
    const payload = await response.json();
    return (
      payload?.message ??
      payload?.error ??
      `Request failed with status ${response.status}`
    );
  } catch {
    return `Request failed with status ${response.status}`;
  }
}

function extractUser(payload: unknown): AuthUser | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const maybePayload = payload as {
    user?: AuthUser | null;
    session?: { user?: AuthUser | null } | null;
  };

  return maybePayload.user ?? maybePayload.session?.user ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    setIsLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/auth/get-session`, {
        credentials: "include",
      });

      if (!response.ok) {
        setUser(null);
        return;
      }

      const payload = await response.json();
      setUser(extractUser(payload));
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/auth/sign-in/email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          email,
          password,
          rememberMe: true,
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = await response.json();
      setUser(extractUser(payload));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      setIsLoading(true);

      try {
        const response = await fetch(`${API_URL}/api/auth/sign-up/email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            name,
            email,
            password,
          }),
        });

        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }

        const payload = await response.json();
        setUser(extractUser(payload));
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    setIsLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/auth/sign-out`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isLoading,
      login,
      register,
      logout,
      refreshSession,
    }),
    [isLoading, login, logout, refreshSession, register, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside an AuthProvider");
  }

  return context;
}
