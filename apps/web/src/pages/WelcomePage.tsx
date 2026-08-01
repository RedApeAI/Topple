import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

type Step = "oauth" | "email" | "password";

function OAuthButton({
  provider,
  label,
  icon,
}: {
  provider: string;
  label: string;
  icon: React.ReactNode;
}) {
  const [isLoading, setIsLoading] = useState(false);

  const handleOAuth = async () => {
    setIsLoading(true);
    try {
      // Better Auth requires POST request for social sign-in
      const redirectTo = `${window.location.origin}/dashboard/inbox`;
      const res = await fetch(`${API_URL}/api/auth/sign-in/social`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          provider,
          callbackURL: redirectTo,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        // Better Auth returns a URL to redirect to
        if (data.url) {
          window.location.href = data.url;
        } else {
          // Fallback: try to open the provider's auth URL
          const url = res.headers.get("Location");
          if (url) {
            window.location.href = url;
          }
        }
      } else {
        const error = await res.text();
        console.error("OAuth initiation failed:", error);
        alert(`Failed to initiate ${provider} login. Please try again.`);
      }
    } catch (err) {
      console.error("OAuth error:", err);
      alert(`Failed to connect to ${provider}. Please try again.`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleOAuth}
      disabled={isLoading}
      className="flex items-center gap-[12px] justify-center px-[24px] py-[13px] rounded-[10px] border border-[rgba(0,0,0,0.12)] bg-white hover:border-[#202020] hover:bg-[#fafafa] transition-all duration-200 cursor-pointer w-full disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <span className="text-[20px]">{icon}</span>
      <span className="font-inter font-medium text-[15px] text-[#202020]">
        {isLoading ? "Connecting..." : label}
      </span>
    </button>
  );
}

function DarkButton({
  children,
  disabled,
  loading,
  onClick,
  type,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type ?? "button"}
      disabled={disabled || loading}
      onClick={onClick}
      className="group flex items-center justify-center overflow-clip px-[24px] py-[12px] relative rounded-[8px] shadow-[0px_0px_0px_0.8px_#161616,0px_6.866px_6.866px_-2.333px_rgba(0,0,0,0.16),0px_13.647px_13.647px_-2.917px_rgba(0,0,0,0.16),0px_30px_30px_-3.5px_rgba(0,0,0,0.08)] cursor-pointer transition-[transform,box-shadow,opacity] duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0px_0px_0px_0.8px_#161616,0px_10px_10px_-3px_rgba(0,0,0,0.22),0px_18px_18px_-3px_rgba(0,0,0,0.2),0px_36px_34px_-4px_rgba(0,0,0,0.12)] disabled:opacity-40 disabled:pointer-events-none w-full"
    >
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none rounded-[8px]"
        style={{
          backgroundImage:
            "linear-gradient(-5.99027deg, rgb(7, 7, 7) 12.103%, rgb(47, 46, 49) 87.897%)",
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-[45%] -translate-x-[160%] skew-x-[-20deg] bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[260%]"
      />
      <span className="font-inter font-medium leading-[normal] relative text-[16px] text-white whitespace-nowrap">
        {loading ? "Please wait…" : children}
      </span>
      <div className="absolute inset-0 pointer-events-none rounded-[inherit] shadow-[inset_0px_0.8px_0px_0px_rgba(255,255,255,0.16)]" />
    </button>
  );
}

function TextField({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-[8px] w-full">
      <span className="font-inter font-medium text-[14px] text-[#202020]">
        {label}
      </span>
      <input
        {...props}
        className="bg-white border border-[rgba(0,0,0,0.12)] border-solid font-inter outline-none px-[16px] py-[12px] placeholder:text-[#a0a0a0] rounded-[10px] text-[#202020] text-[16px] focus:border-[#202020] focus:ring-2 focus:ring-[#202020]/10 transition-colors w-full"
      />
    </label>
  );
}

export default function WelcomePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, login, register } = useAuth();
  const [step, setStep] = useState<Step>("oauth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      const from =
        (location.state as { from?: { pathname?: string } })?.from?.pathname ||
        "/dashboard/inbox";
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, location.state]);

  const checkEmail = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }
    setError("");
    setStep("password");
    setIsSignUp(false);
  };

  const submit = async () => {
    if (!email.trim() || !password) return;

    setError("");
    setLoading(true);

    try {
      if (isSignUp) {
        const name = email.trim().split("@")[0];
        await register(name, email.trim(), password);
      } else {
        await login(email.trim(), password);
      }

      // After successful auth, redirect to dashboard
      const from =
        (location.state as { from?: { pathname?: string } })?.from?.pathname ||
        "/dashboard/inbox";
      navigate(from, { replace: true });
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Something went wrong.";
      setError(errorMessage);

      // If login fails because user doesn't exist, switch to sign up mode
      if (
        !isSignUp &&
        (errorMessage.toLowerCase().includes("user not found") ||
          errorMessage.toLowerCase().includes("invalid"))
      ) {
        setIsSignUp(true);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="bg-white flex flex-col min-h-screen w-full">
      <header className="flex items-center justify-between mx-auto max-w-[1440px] px-[20px] sm:px-[48px] py-[24px] w-full">
        <a href="/" className="flex gap-[7px] items-center">
          <svg
            width="23"
            height="23"
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect width="32" height="32" rx="8" fill="#202020" />
            <path
              d="M8 16C8 11.5817 11.5817 8 16 8C20.4183 8 24 11.5817 24 16"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <path
              d="M24 16C24 20.4183 20.4183 24 16 24C11.5817 24 8 20.4183 8 16"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray="2 4"
            />
          </svg>
          <span className="font-inter font-medium text-[#202020] text-[23px] tracking-[-0.58px]">
            Plucia
          </span>
        </a>
      </header>

      <div className="flex flex-1 items-start sm:items-center justify-center px-[20px] pb-[80px] pt-[48px] sm:pt-0 w-full">
        <div className="w-full max-w-[420px]">
          <div className="text-center">
            <h1 className="font-inter font-semibold text-[32px] text-[#202020] tracking-[-0.05em]">
              Welcome to Plucia
            </h1>
            <p className="font-inter mt-[8px] text-[16px] text-[#606060]">
              Sign in to your workspace to continue.
            </p>
          </div>

          <div className="flex flex-col gap-[12px] mt-[36px]">
            <OAuthButton
              provider="google"
              label="Continue with Google"
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
              }
            />
            <OAuthButton
              provider="apple"
              label="Continue with Apple"
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#000">
                  <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.56 5.98.51 7.14-.6 1.62-1.42 3.22-2.56 4.07zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                </svg>
              }
            />
            <OAuthButton
              provider="microsoft"
              label="Continue with Microsoft"
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <rect x="2" y="2" width="9.5" height="9.5" fill="#F25022" />
                  <rect
                    x="12.5"
                    y="2"
                    width="9.5"
                    height="9.5"
                    fill="#7FBA00"
                  />
                  <rect
                    x="2"
                    y="12.5"
                    width="9.5"
                    height="9.5"
                    fill="#00A4EF"
                  />
                  <rect
                    x="12.5"
                    y="12.5"
                    width="9.5"
                    height="9.5"
                    fill="#FFB900"
                  />
                </svg>
              }
            />
          </div>

          <div className="flex items-center gap-[16px] mt-[28px]">
            <div className="flex-1 h-[1px] bg-[rgba(0,0,0,0.08)]" />
            <span className="font-inter text-[13px] text-[#a0a0a0] whitespace-nowrap">
              or continue with email
            </span>
            <div className="flex-1 h-[1px] bg-[rgba(0,0,0,0.08)]" />
          </div>

          <form
            className="flex flex-col gap-[16px] mt-[24px]"
            onSubmit={(e) => {
              e.preventDefault();
              if (step === "oauth") {
                setStep("email");
              } else if (step === "email") {
                checkEmail();
              } else {
                submit();
              }
            }}
          >
            {(step === "email" || step === "password") && (
              <TextField
                label="Work email"
                type="email"
                placeholder="you@company.com"
                value={email}
                autoFocus
                required
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError("");
                }}
              />
            )}

            {step === "password" && (
              <TextField
                label="Password"
                type="password"
                placeholder="&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;"
                value={password}
                required
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
              />
            )}

            {error && (
              <p className="font-inter text-[#d03030] text-[13px]">{error}</p>
            )}

            {step === "oauth" && (
              <button
                type="button"
                onClick={() => setStep("email")}
                className="font-inter font-medium text-[15px] text-[#202020] underline underline-offset-4 cursor-pointer hover:text-[#606060] transition-colors"
              >
                Continue with email
              </button>
            )}

            {step === "email" && (
              <DarkButton type="submit">Continue</DarkButton>
            )}

            {step === "password" && (
              <>
                <DarkButton type="submit" loading={loading}>
                  {isSignUp ? "Sign Up" : "Sign In"}
                </DarkButton>
                <div className="flex items-center justify-center gap-[4px] mt-[4px]">
                  <span className="font-inter text-[14px] text-[#606060]">
                    {isSignUp
                      ? "Already have an account?"
                      : "Don't have an account?"}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSignUp(!isSignUp);
                      setError("");
                    }}
                    className="font-inter font-medium text-[14px] text-[#202020] underline underline-offset-4 cursor-pointer hover:text-[#606060] transition-colors"
                  >
                    {isSignUp ? "Sign In" : "Sign Up"}
                  </button>
                </div>
              </>
            )}
          </form>

          {/* 
            [PRESERVED COMMENTED CODE - DO NOT REMOVE]
            
            // DEV BYPASS - For testing without auth
            // <div className="mt-[24px] text-center">
            //   <button
            //     type="button"
            //     onClick={() => navigate("/dashboard/inbox", { replace: true })}
            //     className="font-inter text-[13px] text-[#a0a0a0] hover:text-[#202020] transition-colors cursor-pointer"
            //   >
            //     Skip to Dashboard (dev only)
            //   </button>
            // </div>
            
            // OAuth redirect URL for worker/orchestrator testing
            // const redirectUrl = `${API_URL}/api/auth/sign-in/social?provider=${provider}&redirectTo=${encodeURIComponent(window.location.origin)}/worker-test`;
          */}
        </div>
      </div>
    </main>
  );
}
