import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthGuard } from "@/components/auth-guard";
import { useAuthStore } from "@/store/auth.store";
import WelcomePage from "@/pages/WelcomePage";

const DashboardLayout = lazy(() =>
  import("@/pages/DashboardLayout").then((module) => ({
    default: module.DashboardLayout,
  })),
);
const InboxPage = lazy(() =>
  import("@/pages/InboxPage").then((module) => ({ default: module.InboxPage })),
);
const OverviewPage = lazy(() =>
  import("@/pages/OverviewPage").then((module) => ({
    default: module.OverviewPage,
  })),
);
const CrmPage = lazy(() =>
  import("@/pages/CrmPage").then((module) => ({ default: module.CrmPage })),
);
const WhatsAppPage = lazy(() =>
  import("@/pages/WhatsAppPage").then((module) => ({
    default: module.WhatsAppPage,
  })),
);
const MailPage = lazy(() =>
  import("@/pages/MailPage").then((module) => ({ default: module.MailPage })),
);
const LinkedInPage = lazy(() =>
  import("@/pages/LinkedInPage").then((module) => ({
    default: module.LinkedInPage,
  })),
);
const CampaignsPage = lazy(() =>
  import("@/pages/CampaignsPage").then((module) => ({
    default: module.CampaignsPage,
  })),
);
const AiCallingPage = lazy(() =>
  import("@/pages/AiCallingPage").then((module) => ({
    default: module.AiCallingPage,
  })),
);
const CalendarPage = lazy(() =>
  import("@/pages/CalendarPage").then((module) => ({
    default: module.CalendarPage,
  })),
);
const InstagramPage = lazy(() =>
  import("@/pages/InstagramPage").then((module) => ({
    default: module.InstagramPage,
  })),
);
const ZernioCallbackPage = lazy(() =>
  import("@/pages/ZernioCallbackPage").then((module) => ({
    default: module.ZernioCallbackPage,
  })),
);

// Protected route wrapper - wraps DashboardLayout
function ProtectedDashboard() {
  return (
    <AuthGuard>
      <DashboardLayout />
    </AuthGuard>
  );
}

export default function App() {
  const initializeAuth = useAuthStore((state) => state.initialize);

  useEffect(() => {
    void initializeAuth();
  }, [initializeAuth]);

  return (
    <BrowserRouter>
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem
        disableTransitionOnChange
      >
        <TooltipProvider delay={200}>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              {/* Public routes */}
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/welcome" element={<WelcomePage />} />
              <Route
                path="/dashboard/zernio/callback"
                element={
                  <AuthGuard>
                    <ZernioCallbackPage />
                  </AuthGuard>
                }
              />
              {/* Protected dashboard routes */}
              <Route path="/dashboard" element={<ProtectedDashboard />}>
                <Route index element={<Navigate to="inbox" replace />} />
                <Route path="inbox" element={<InboxPage />} />
                <Route path="overview" element={<OverviewPage />} />
                <Route path="crm" element={<CrmPage />} />
                <Route path="whatsapp" element={<WhatsAppPage />} />
                <Route path="mail" element={<MailPage />} />
                <Route path="linkedin" element={<LinkedInPage />} />
                <Route path="campaigns" element={<CampaignsPage />} />
                <Route path="ai-calling" element={<AiCallingPage />} />
                <Route path="calendar" element={<CalendarPage />} />
                <Route path="instagram" element={<InstagramPage />} />
              </Route>
            </Routes>
          </Suspense>
        </TooltipProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

function RouteFallback() {
  return (
    <div
      className="flex min-h-screen items-center justify-center"
      aria-label="Loading page"
    >
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-muted border-t-foreground" />
    </div>
  );
}
