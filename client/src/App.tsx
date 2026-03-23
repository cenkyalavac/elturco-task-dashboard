import { Switch, Route, Router, Redirect, useLocation, Link } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { getAuthToken, getCurrentUser } from "@/lib/queryClient";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import AdminPage from "@/pages/admin";
import AssignmentsPage from "@/pages/assignments";
import RespondPage from "@/pages/respond";
import NotFound from "@/pages/not-found";
import { LogOut } from "lucide-react";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated && !getAuthToken()) return <Redirect to="/login" />;
  return <Component />;
}

function NavLink({ href, label }: { href: string; label: string }) {
  const [location] = useLocation();
  const isActive = href === "/" ? location === "/" : location.startsWith(href);
  return (
    <Link
      href={href}
      data-testid={`nav-${label.toLowerCase()}`}
      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
        isActive
          ? "bg-white/10 text-white"
          : "text-white/60 hover:text-white hover:bg-white/5"
      }`}
    >
      {label}
    </Link>
  );
}

function AppLayout() {
  const { user, logout } = useAuth();
  const displayEmail = user?.email || getCurrentUser()?.email || "";

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Top navbar */}
      <header className="h-12 bg-[#1a1a2e] border-b border-white/10 flex items-center px-4 shrink-0">
        {/* Left: Logo */}
        <div className="flex items-center gap-2 mr-8">
          <div className="w-7 h-7 bg-white/10 rounded-lg flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 32 32" fill="none">
              <path d="M6 8h20M6 14h14M6 20h8M22 18l4 4-4 4" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="font-semibold text-white text-sm" data-testid="text-nav-title">Dispatch</span>
        </div>

        {/* Center: Nav links */}
        <nav className="flex items-center gap-1">
          <NavLink href="/" label="Dashboard" />
          <NavLink href="/history" label="History" />
          <NavLink href="/admin" label="Admin" />
        </nav>

        {/* Right: User + logout */}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-white/50" data-testid="text-nav-email">{displayEmail}</span>
          <button
            onClick={logout}
            data-testid="button-logout"
            className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-white/50 hover:text-white hover:bg-white/5 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Switch>
          <Route path="/">{() => <ProtectedRoute component={DashboardPage} />}</Route>
          <Route path="/history">{() => <ProtectedRoute component={AssignmentsPage} />}</Route>
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
