import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryProvider } from "@/lib/query-provider";
import { AuthProvider } from "@/lib/auth-context";
import { AuthGuard } from "@/components/auth-guard";
import { DashboardLayout } from "@/pages/DashboardLayout";
import { InboxPage } from "@/pages/InboxPage";
import { OverviewPage } from "@/pages/OverviewPage";
import { CrmPage } from "@/pages/CrmPage";
import { WhatsAppPage } from "@/pages/WhatsAppPage";
import { MailPage } from "@/pages/MailPage";
import { LinkedInPage } from "@/pages/LinkedInPage";
import { CampaignsPage } from "@/pages/CampaignsPage";
import { AiCallingPage } from "@/pages/AiCallingPage";
import { CalendarPage } from "@/pages/CalendarPage";
import { IntegrationsPage } from "@/pages/IntegrationsPage";
import { InstagramPage } from "@/pages/InstagramPage";
import WelcomePage from "@/pages/WelcomePage";

// Protected route wrapper - wraps DashboardLayout
function ProtectedDashboard() {
  return (
    <AuthGuard>
      <DashboardLayout />
    </AuthGuard>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem
        disableTransitionOnChange
      >
        <QueryProvider>
          <AuthProvider>
            <TooltipProvider delay={200}>
              <Routes>
                {/* Public routes */}
                <Route
                  path="/"
                  element={<Navigate to="/dashboard" replace />}
                />
                <Route path="/welcome" element={<WelcomePage />} />

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
                  <Route path="integrations" element={<IntegrationsPage />} />
                  <Route path="instagram" element={<InstagramPage />} />
                </Route>
              </Routes>
            </TooltipProvider>
          </AuthProvider>
        </QueryProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
