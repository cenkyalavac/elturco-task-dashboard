import { useState, useEffect, useRef, createContext, useContext } from "react";
import { Switch, Route, Router, Redirect, useLocation, Link } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient, apiRequest, getAuthToken } from "./lib/queryClient";
import { QueryClientProvider, useQuery, useMutation } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { getCurrentUser } from "@/lib/queryClient";

import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import AdminPage from "@/pages/admin";
import AssignmentsPage from "@/pages/assignments";
import RespondPage from "@/pages/respond";
import AnalyticsPage from "@/pages/analytics";
import FreelancerPortalPage from "@/pages/freelancer-portal";
import AuthVerifyPage from "@/pages/auth-verify";
import NotFound from "@/pages/not-found";
import { LogOut, BarChart3, Sun, Moon, Bell, CheckCheck, Menu, X } from "lucide-react";

// Theme context
const ThemeContext = createContext<{ theme: "dark" | "light"; toggleTheme: () => void }>({ theme: "dark", toggleTheme: () => {} });
export function useTheme() { return useContext(ThemeContext); }

// WebSocket context for real-time updates
const WsContext = createContext<{ lastEvent: any | null }>({ lastEvent: null });
export function useWsEvent() { return useContext(WsContext); }

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

// ── Notification Center ──
function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ["/api/notifications"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/notifications");
      return r.json();
    },
    refetchInterval: 30000,
  });

  const markAllRead = useMutation({
    mutationFn: () => apiRequest("POST", "/api/notifications/read-all"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  const markRead = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  const unread = data?.unreadCount || 0;
  const notifications = data?.notifications || [];

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const typeIcon = (type: string) => {
    switch (type) {
      case "offer_accepted": return "text-emerald-400";
      case "offer_rejected": return "text-red-400";
      case "task_completed": return "text-blue-400";
      default: return "text-white/40";
    }
  };

  const timeAgo = (dateStr: string) => {
    const s = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    return `${Math.floor(s / 3600)}h`;
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        data-testid="button-notifications"
        className="relative flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-white/40 hover:text-white hover:bg-white/[0.06] transition-all duration-150"
      >
        <Bell className="w-3.5 h-3.5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-[#1a1d27] border border-white/[0.08] rounded-xl shadow-xl shadow-black/40 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
            <p className="text-white text-sm font-medium">Notifications</p>
            {unread > 0 && (
              <button
                onClick={() => markAllRead.mutate()}
                className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1"
              >
                <CheckCheck className="w-3 h-3" /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-white/20 text-sm">No notifications</p>
              </div>
            ) : (
              notifications.map((n: any) => (
                <div
                  key={n.id}
                  className={`px-4 py-3 border-b border-white/[0.03] hover:bg-white/[0.02] cursor-pointer transition-colors ${
                    !n.read ? "bg-blue-500/[0.03]" : ""
                  }`}
                  onClick={() => { if (!n.read) markRead.mutate(n.id); }}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${!n.read ? "bg-blue-400" : "bg-transparent"}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium ${typeIcon(n.type)}`}>{n.title}</p>
                      <p className="text-xs text-white/40 mt-0.5 truncate">{n.message}</p>
                      <p className="text-[10px] text-white/20 mt-1">{timeAgo(n.createdAt)}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AppLayout() {
  const { user, logout } = useAuth();
  const displayEmail = user?.email || getCurrentUser()?.email || "";
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Top navbar */}
      <header className="h-12 bg-gradient-to-r from-[#0d1117] via-[#111827] to-[#0d1117] border-b border-white/[0.06] flex items-center px-3 sm:px-5 shrink-0 shadow-lg shadow-black/20 relative z-50">
        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileNavOpen(!mobileNavOpen)}
          className="md:hidden flex items-center justify-center w-8 h-8 rounded-md text-white/60 hover:text-white hover:bg-white/[0.06] mr-2"
          data-testid="button-mobile-menu"
        >
          {mobileNavOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </button>

        <div className="flex items-center gap-2 mr-4 sm:mr-8">
          <img src="/logo-icon.jpg" alt="ElTurco" className="w-7 h-7 rounded-full object-cover" />
          <span className="font-semibold text-white text-sm tracking-tight" data-testid="text-nav-title">Dispatch</span>
        </div>

        <nav className="hidden md:flex items-center gap-1">
          <NavLink href="/" label="Dashboard" />
          <NavLink href="/history" label="History" />
          <NavLink href="/analytics" label="Analytics" icon={<BarChart3 className="w-3.5 h-3.5 mr-1" />} />
          <NavLink href="/admin" label="Admin" />
        </nav>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
          <span className="hidden sm:inline text-xs text-white/40 font-medium" data-testid="text-nav-email">{displayEmail}</span>
          <div className="hidden sm:block w-px h-4 bg-white/[0.08]" />
          <NotificationBell />
          <div className="hidden sm:block w-px h-4 bg-white/[0.08]" />
          <ThemeToggleButton />
          <div className="hidden sm:block w-px h-4 bg-white/[0.08]" />
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

      {/* Mobile nav dropdown */}
      {mobileNavOpen && (
        <div className="md:hidden absolute top-12 left-0 right-0 z-40 bg-[#111827] border-b border-white/[0.08] shadow-xl shadow-black/30 py-2 px-3 flex flex-col gap-1">
          <NavLink href="/" label="Dashboard" />
          <NavLink href="/history" label="History" />
          <NavLink href="/analytics" label="Analytics" icon={<BarChart3 className="w-3.5 h-3.5 mr-1" />} />
          <NavLink href="/admin" label="Admin" />
          {displayEmail && <p className="text-[10px] text-white/30 mt-2 px-3">{displayEmail}</p>}
        </div>
      )}

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
      <Route path="/auth/verify/:token" component={AuthVerifyPage} />
      <Route path="/freelancer" component={FreelancerPortalPage} />
      <Route path="/freelancer/verify/:token" component={FreelancerPortalPage} />
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
  const [lastWsEvent, setLastWsEvent] = useState<any>(null);

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  // WebSocket connection
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      try {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        ws = new WebSocket(wsUrl);
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            setLastWsEvent(data);
            // Auto-invalidate notifications on any event
            queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
            // Invalidate tasks/assignments on relevant events
            if (["offer_accepted", "offer_rejected", "task_completed"].includes(data.event)) {
              queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
              queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
            }
          } catch {}
        };
        ws.onclose = () => {
          reconnectTimer = setTimeout(connect, 5000);
        };
        ws.onerror = () => {
          ws?.close();
        };
      } catch {}
    }

    connect();
    return () => {
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  const toggleTheme = () => setTheme((prev) => (prev === "dark" ? "light" : "dark"));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <WsContext.Provider value={{ lastEvent: lastWsEvent }}>
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
      </WsContext.Provider>
    </ThemeContext.Provider>
  );
}

export default App;
