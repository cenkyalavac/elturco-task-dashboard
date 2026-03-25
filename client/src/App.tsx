import { useState, useEffect, createContext, useContext } from "react";
import { Switch, Route, Router, Redirect, useLocation, Link } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { getAuthToken, getCurrentUser } from "@/lib/queryClient";

import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import AdminPage from "@/pages/admin";
import AssignmentsPage from "@/pages/assignments";
import RespondPage from "@/pages/respond";
import AnalyticsPage from "@/pages/analytics";
import NotFound from "@/pages/not-found";
import { LogOut, BarChart3, Sun, Moon } from "lucide-react";

// Theme context
const ThemeContext = createContext<{ theme: "dark" | "light"; toggleTheme: () => void }>({ theme: "dark", toggleTheme: () => {} });
export function useTheme() { return useContext(ThemeContext); }

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated && !getAuthToken()) return <Redirect to="/login" />;
  return <Component />;
}

function NavLink({ href, label, icon }: { href: string; label: string; icon?: React.ReactNode }) {
  const [location] = useLocation();
  const isActive = href === "/" ? location === "/" : location.startsWith(href);
  return (
    <Link
      href={href}
      data-testid={`nav-${label.toLowerCase()}`}
      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-150 flex items-center ${
        isActive
          ? "bg-white/[0.10] text-white shadow-sm shadow-white/5"
          : "text-white/50 hover:text-white/90 hover:bg-white/[0.06]"
      }`}
    >
      {icon}
      {label}
    </Link>
  );
}

function AppLayout() {
  const { user, logout } = useAuth();
  const displayEmail = user?.email || getCurrentUser()?.email || "";

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Top navbar — premium dark with gradient */}
      <header className="h-12 bg-gradient-to-r from-[#0d1117] via-[#111827] to-[#0d1117] border-b border-white/[0.06] flex items-center px-5 shrink-0 shadow-lg shadow-black/20">
        {/* Left: Logo */}
        <div className="flex items-center gap-2.5 mr-8">
          <div className="w-7 h-7 bg-gradient-to-br from-primary/80 to-blue-400/60 rounded-lg flex items-center justify-center shadow-sm shadow-primary/20">
            <svg width="14" height="14" viewBox="0 0 32 32" fill="none">
              <path d="M6 8h20M6 14h14M6 20h8M22 18l4 4-4 4" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="font-semibold text-white text-sm tracking-tight" data-testid="text-nav-title">Dispatch</span>
        </div>

        {/* Center: Nav links */}
        <nav className="flex items-center gap-1">
          <NavLink href="/" label="Dashboard" />
          <NavLink href="/history" label="History" />
          <NavLink href="/analytics" label="Analytics" icon={<BarChart3 className="w-3.5 h-3.5 mr-1" />} />
          <NavLink href="/admin" label="Admin" />
        </nav>

        {/* Right: User + theme toggle + logout */}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-white/40 font-medium" data-testid="text-nav-email">{displayEmail}</span>
          <div className="w-px h-4 bg-white/[0.08]" />
          <ThemeToggleButton />
          <div className="w-px h-4 bg-white/[0.08]" />
          <button
            onClick={logout}
            data-testid="button-logout"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-white/40 hover:text-white hover:bg-white/[0.06] transition-all duration-150"
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
          <Route path="/analytics">{() => <ProtectedRoute component={AnalyticsPage} />}</Route>
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

function ThemeToggleButton() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      data-testid="button-theme-toggle"
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-white/40 hover:text-white hover:bg-white/[0.06] transition-all duration-150"
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
    </button>
  );
}

function App() {
  const [theme, setTheme] = useState<"dark" | "light">(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  );

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === "dark" ? "light" : "dark"));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <Toaster />
            <Router hook={useHashLocation}>
              <AppRouter />
            </Router>

          </AuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeContext.Provider>
  );
}

export default App;
