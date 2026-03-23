import { Switch, Route, Router, Redirect, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { getAuthToken } from "@/lib/queryClient";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import AdminPage from "@/pages/admin";
import AssignmentsPage from "@/pages/assignments";
import RespondPage from "@/pages/respond";
import NotFound from "@/pages/not-found";
import {
  LayoutDashboard, History, Settings, LogOut,
} from "lucide-react";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated && !getAuthToken()) return <Redirect to="/login" />;
  return <Component />;
}

function SidebarLink({ href, icon: Icon, label, active }: { href: string; icon: React.ComponentType<{ className?: string }>; label: string; active: boolean }) {
  const [, setLocation] = useLocation();
  return (
    <button
      onClick={() => setLocation(href)}
      data-testid={`nav-${label.toLowerCase()}`}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
      }`}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span>{label}</span>
    </button>
  );
}

function AppLayout() {
  const { user, logout } = useAuth();
  const [location] = useLocation();

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-56 border-r border-border bg-card flex flex-col shrink-0">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 32 32" fill="none">
                <path d="M6 8h20M6 14h14M6 20h8M22 18l4 4-4 4" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="font-semibold text-foreground text-sm" data-testid="text-sidebar-title">Dispatch</span>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          <SidebarLink href="/" icon={LayoutDashboard} label="Dashboard" active={location === "/"} />
          <SidebarLink href="/assignments" icon={History} label="Assignments" active={location === "/assignments"} />
          <SidebarLink href="/admin" icon={Settings} label="Admin" active={location === "/admin"} />
        </nav>

        <div className="p-3 border-t border-border">
          <div className="px-3 py-1.5 mb-2">
            <p className="text-xs text-muted-foreground truncate" data-testid="text-sidebar-email">{user?.email}</p>
            <p className="text-xs text-muted-foreground/60 truncate">{user?.name}</p>
          </div>
          <button
            onClick={logout}
            data-testid="button-logout"
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Switch>
          <Route path="/">{() => <ProtectedRoute component={DashboardPage} />}</Route>
          <Route path="/assignments">{() => <ProtectedRoute component={AssignmentsPage} />}</Route>
          <Route path="/admin">{() => <ProtectedRoute component={AdminPage} />}</Route>
          <Route component={NotFound} />
        </Switch>
      </main>
    </div>
  );
}

function AppRouter() {
  const { isAuthenticated } = useAuth();
  const hasToken = getAuthToken();

  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/respond/:token" component={RespondPage} />
      <Route>{() => (isAuthenticated || hasToken) ? <AppLayout /> : <Redirect to="/login" />}</Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Router hook={useHashLocation}>
            <AppRouter />
          </Router>
          <PerplexityAttribution />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
