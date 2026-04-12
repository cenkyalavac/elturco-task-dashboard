import { useState, useEffect, useRef, createContext, useContext } from "react";
import { Switch, Route, Router, Redirect, useLocation } from "wouter";
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

// New Dispatch 2.0 pages
import VendorsPage from "@/pages/vendors";
import VendorDetailPage from "@/pages/vendor-detail";
import CustomersPage from "@/pages/customers";
import ProjectsPage from "@/pages/projects";
import CustomerDetailPage from "@/pages/customer-detail";
import ProjectDetailPage from "@/pages/project-detail";
import QualityPage from "@/pages/quality";
import VendorPortalPage from "@/pages/vendor-portal";

// Phase 2: Financial module
import InvoicesPage from "@/pages/invoices";
import PurchaseOrdersPage from "@/pages/purchase-orders";
import FinancialDashboardPage from "@/pages/financial-dashboard";

// Phase 2: Auto-Accept & Integrations
import AutoAcceptPage from "@/pages/auto-accept";
import IntegrationsPage from "@/pages/integrations";

import {
  LogOut, BarChart3, Sun, Moon, Bell, CheckCheck, Menu, X,
  Users, Building2, FolderKanban, Award, LayoutDashboard, History, Settings, UserCircle,
  DollarSign, FileText, ShoppingCart, Zap, Plug,
} from "lucide-react";

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

function SidebarLink({ href, label, icon }: { href: string; label: string; icon?: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const isActive = href === "/" ? location === "/" : location.startsWith(href);
  return (
    <a
      href={`#${href}`}
      onClick={(e) => {
        e.preventDefault();
        navigate(href);
      }}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
        isActive
          ? "bg-blue-500/10 text-blue-400 border-l-2 border-blue-400"
          : "text-white/50 hover:text-white/80 hover:bg-white/[0.04]"
      }`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </a>
  );
}

// Notification Center
function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Fetch from both legacy and v2 notification endpoints
  const { data } = useQuery({
    queryKey: ["/api/notifications"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/notifications");
      return r.json();
    },
    refetchInterval: 30000,
  });
  const { data: v2Data } = useQuery({
    queryKey: ["/api/notifications-v2"],
    queryFn: async () => {
      try {
        const r = await apiRequest("GET", "/api/notifications-v2");
        return r.json();
      } catch { return { notifications: [], unreadCount: 0 }; }
    },
    refetchInterval: 30000,
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/notifications/read-all");
      await apiRequest("POST", "/api/notifications-v2/read-all").catch(() => {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications-v2"] });
    },
  });

  const markRead = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/notifications/${id}/read`).catch(() => {});
      await apiRequest("PATCH", `/api/notifications-v2/${id}/read`).catch(() => {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications-v2"] });
    },
  });

  // Merge notifications from both endpoints
  const legacyNotifications = data?.notifications || [];
  const v2Notifications = (v2Data?.notifications || []).map((n: any) => ({
    ...n,
    createdAt: n.createdAt,
    read: n.read,
    title: n.title,
    message: n.message,
    type: n.type,
  }));
  const unread = (data?.unreadCount || 0) + (v2Data?.unreadCount || 0);
  const notifications = [...v2Notifications, ...legacyNotifications]
    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 20);

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
      case "task_accepted": return "text-emerald-400";
      case "project_status_change": return "text-yellow-400";
      case "invoice_generated": return "text-indigo-400";
      case "task_incoming": return "text-amber-400";
      case "job_delivered": return "text-cyan-400";
      case "deadline_warning": return "text-red-400";
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
                  onClick={() => { if (!n.read) markRead.mutate(n.id); if (n.link) { window.location.hash = n.link; setOpen(false); } }}
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
  const displayName = user?.name || getCurrentUser()?.name || "";
  const userRole = (user as any)?.role || getCurrentUser()?.role || "pm";
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const canSeeVendorMgmt = ["gm", "admin", "operations_manager", "vm"].includes(userRole);
  const canSeeFinances = ["gm", "operations_manager", "pm_team_lead", "admin"].includes(userRole);
  const canSeeAdmin = ["gm", "admin"].includes(userRole);
  const canSeeIntegrations = ["gm", "admin", "operations_manager"].includes(userRole);

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className={`hidden md:flex flex-col bg-[#0d1117] border-r border-white/[0.06] shrink-0 transition-all duration-200 ${sidebarCollapsed ? "w-16" : "w-56"}`}>
        {/* Logo */}
        <div className="h-12 flex items-center px-3 gap-2 border-b border-white/[0.06]">
          <img src="/logo-icon.jpg" alt="ElTurco" className="w-7 h-7 rounded-full object-cover shrink-0" />
          {!sidebarCollapsed && <span className="font-semibold text-white text-sm tracking-tight">Dispatch 2.0</span>}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
          <div className="mb-3">
            {!sidebarCollapsed && <p className="px-3 mb-1 text-[10px] font-semibold text-white/20 uppercase tracking-wider">Main</p>}
            <SidebarLink href="/" label="Dashboard" icon={<LayoutDashboard className="w-4 h-4 shrink-0" />} />
            <SidebarLink href="/history" label="Assignments" icon={<History className="w-4 h-4 shrink-0" />} />
            <SidebarLink href="/analytics" label="Analytics" icon={<BarChart3 className="w-4 h-4 shrink-0" />} />
          </div>

          <div className="mb-3">
            {!sidebarCollapsed && <p className="px-3 mb-1 text-[10px] font-semibold text-white/20 uppercase tracking-wider">Management</p>}
            {canSeeVendorMgmt && <SidebarLink href="/vendors" label="Vendors" icon={<Users className="w-4 h-4 shrink-0" />} />}
            <SidebarLink href="/customers" label="Customers" icon={<Building2 className="w-4 h-4 shrink-0" />} />
            <SidebarLink href="/projects" label="Projects" icon={<FolderKanban className="w-4 h-4 shrink-0" />} />
            <SidebarLink href="/quality" label="Quality" icon={<Award className="w-4 h-4 shrink-0" />} />
          </div>

          {canSeeFinances && (
            <div className="mb-3">
              {!sidebarCollapsed && <p className="px-3 mb-1 text-[10px] font-semibold text-white/20 uppercase tracking-wider">Finances</p>}
              <SidebarLink href="/finances" label="Dashboard" icon={<DollarSign className="w-4 h-4 shrink-0" />} />
              <SidebarLink href="/invoices" label="Invoices" icon={<FileText className="w-4 h-4 shrink-0" />} />
              <SidebarLink href="/purchase-orders" label="Purchase Orders" icon={<ShoppingCart className="w-4 h-4 shrink-0" />} />
            </div>
          )}

          {canSeeIntegrations && (
            <div className="mb-3">
              {!sidebarCollapsed && <p className="px-3 mb-1 text-[10px] font-semibold text-white/20 uppercase tracking-wider">Integrations</p>}
              <SidebarLink href="/auto-accept" label="Auto-Accept" icon={<Zap className="w-4 h-4 shrink-0" />} />
              <SidebarLink href="/integrations" label="Portals" icon={<Plug className="w-4 h-4 shrink-0" />} />
            </div>
          )}

          {canSeeAdmin && (
            <div className="mb-3">
              {!sidebarCollapsed && <p className="px-3 mb-1 text-[10px] font-semibold text-white/20 uppercase tracking-wider">Admin</p>}
              <SidebarLink href="/admin" label="Settings" icon={<Settings className="w-4 h-4 shrink-0" />} />
            </div>
          )}
        </nav>

        {/* User info */}
        <div className="border-t border-white/[0.06] p-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-blue-500/20 flex items-center justify-center text-xs font-medium text-blue-400 shrink-0">
              {displayName?.charAt(0) || "?"}
            </div>
            {!sidebarCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white/70 truncate">{displayName}</p>
                <p className="text-[10px] text-white/30 truncate">{userRole}</p>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-12 bg-[#0d1117] border-b border-white/[0.06] flex items-center px-3 sm:px-5 shrink-0 relative z-50">
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            className="md:hidden flex items-center justify-center w-8 h-8 rounded-md text-white/60 hover:text-white hover:bg-white/[0.06] mr-2"
          >
            {mobileNavOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>

          {/* Sidebar toggle for desktop */}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="hidden md:flex items-center justify-center w-8 h-8 rounded-md text-white/40 hover:text-white hover:bg-white/[0.06] mr-2"
          >
            <Menu className="w-4 h-4" />
          </button>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
            <span className="hidden sm:inline text-xs text-white/40 font-medium">{displayEmail}</span>
            <div className="hidden sm:block w-px h-4 bg-white/[0.08]" />
            <NotificationBell />
            <div className="hidden sm:block w-px h-4 bg-white/[0.08]" />
            <ThemeToggleButton />
            <div className="hidden sm:block w-px h-4 bg-white/[0.08]" />
            <button
              onClick={logout}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-white/40 hover:text-white hover:bg-white/[0.06] transition-all duration-150"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </header>

        {/* Mobile nav dropdown */}
        {mobileNavOpen && (
          <div className="md:hidden absolute top-12 left-0 right-0 z-40 bg-[#0d1117] border-b border-white/[0.08] shadow-xl shadow-black/30 py-2 px-3 flex flex-col gap-1">
            <SidebarLink href="/" label="Dashboard" icon={<LayoutDashboard className="w-4 h-4" />} />
            <SidebarLink href="/history" label="Assignments" icon={<History className="w-4 h-4" />} />
            <SidebarLink href="/analytics" label="Analytics" icon={<BarChart3 className="w-4 h-4" />} />
            {canSeeVendorMgmt && <SidebarLink href="/vendors" label="Vendors" icon={<Users className="w-4 h-4" />} />}
            <SidebarLink href="/customers" label="Customers" icon={<Building2 className="w-4 h-4" />} />
            <SidebarLink href="/projects" label="Projects" icon={<FolderKanban className="w-4 h-4" />} />
            <SidebarLink href="/quality" label="Quality" icon={<Award className="w-4 h-4" />} />
            {canSeeFinances && <SidebarLink href="/finances" label="Finances" icon={<DollarSign className="w-4 h-4" />} />}
            {canSeeFinances && <SidebarLink href="/invoices" label="Invoices" icon={<FileText className="w-4 h-4" />} />}
            {canSeeFinances && <SidebarLink href="/purchase-orders" label="POs" icon={<ShoppingCart className="w-4 h-4" />} />}
            {canSeeIntegrations && <SidebarLink href="/auto-accept" label="Auto-Accept" icon={<Zap className="w-4 h-4" />} />}
            {canSeeIntegrations && <SidebarLink href="/integrations" label="Portals" icon={<Plug className="w-4 h-4" />} />}
            {canSeeAdmin && <SidebarLink href="/admin" label="Admin" icon={<Settings className="w-4 h-4" />} />}
          </div>
        )}

        <main className="flex-1 overflow-auto">
          <Switch>
            <Route path="/">{() => <ProtectedRoute component={DashboardPage} />}</Route>
            <Route path="/history">{() => <ProtectedRoute component={AssignmentsPage} />}</Route>
            <Route path="/analytics">{() => <ProtectedRoute component={AnalyticsPage} />}</Route>
            <Route path="/admin">{() => <ProtectedRoute component={AdminPage} />}</Route>
            <Route path="/vendors">{() => <ProtectedRoute component={VendorsPage} />}</Route>
            <Route path="/vendors/:id">{() => <ProtectedRoute component={VendorDetailPage} />}</Route>
            <Route path="/customers">{() => <ProtectedRoute component={CustomersPage} />}</Route>
            <Route path="/customers/:id">{() => <ProtectedRoute component={CustomerDetailPage} />}</Route>
            <Route path="/projects">{() => <ProtectedRoute component={ProjectsPage} />}</Route>
            <Route path="/projects/:id">{() => <ProtectedRoute component={ProjectDetailPage} />}</Route>
            <Route path="/quality">{() => <ProtectedRoute component={QualityPage} />}</Route>
            <Route path="/finances">{() => <ProtectedRoute component={FinancialDashboardPage} />}</Route>
            <Route path="/invoices">{() => <ProtectedRoute component={InvoicesPage} />}</Route>
            <Route path="/purchase-orders">{() => <ProtectedRoute component={PurchaseOrdersPage} />}</Route>
            <Route path="/auto-accept">{() => <ProtectedRoute component={AutoAcceptPage} />}</Route>
            <Route path="/integrations">{() => <ProtectedRoute component={IntegrationsPage} />}</Route>
            <Route component={NotFound} />
          </Switch>
        </main>
      </div>
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
      <Route path="/portal" component={VendorPortalPage} />
      <Route path="/portal/verify/:token" component={VendorPortalPage} />
      <Route>{() => (isAuthenticated || hasToken) ? <AppLayout /> : <Redirect to="/login" />}</Route>
    </Switch>
  );
}

function ThemeToggleButton() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-white/40 hover:text-white hover:bg-white/[0.06] transition-all duration-150"
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
    </button>
  );
}

function App() {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const stored = localStorage.getItem("dispatch-theme");
    if (stored === "light" || stored === "dark") return stored;
    return "dark"; // default to dark — the UI is designed for dark mode
  });
  const [lastWsEvent, setLastWsEvent] = useState<any>(null);

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("dispatch-theme", theme);
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
            queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
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
