import { useState, useMemo, useEffect, useCallback, useRef, Fragment } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getPublicApiBase, getAuthToken } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Search, Send, Loader2, X, ChevronUp, ChevronDown, ChevronRight,
  CheckCircle2, Pencil, Save, Eye, Code, ListOrdered, Trash2,
  Ban, Clock, XCircle, UserCheck, CheckSquare,
  FileSpreadsheet, ArrowUpDown, StickyNote, GripVertical, Mail, Filter,
  Star, Volume2, VolumeX, CalendarClock, Undo2, UserX, ExternalLink,
  Plus, UserPlus,
} from "lucide-react";
import VisualEmailEditor from "@/components/VisualEmailEditor";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";

// ── Helpers: time ago ──
function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

// API_BASE for direct fetch calls (XLSX export)
const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

// ── Types ──

interface CatCounts {
  ice: string;
  rep: string;
  match100: string;
  fuzzy95: string;
  fuzzy85: string;
  fuzzy75: string;
  noMatch: string;
  mt: string;
}

interface Task {
  source: string;
  sheet: string;
  projectId: string;
  account: string;
  translator: string;
  reviewer: string;
  trDone: string;
  revComplete: string;
  delivered: string;
  deadline: string;
  total: string;
  wwc: string;
  revType: string;
  catCounts: CatCounts;
  hoNote: string;
  trHbNote: string;
  revHbNote: string;
  instructions: string;
  lqi: string;
  qs: string;
  projectTitle: string;
  revDeadline: string;
  atmsId: string;
  symfonieLink: string;
  symfonieId: string;
  languagePair: string;
}

interface Freelancer {
  id: string;
  fullName: string;
  resourceCode: string;
  email: string;
  status: string;
  accounts: string[];
  languagePairs: string[];
  serviceTypes: string[];
  availability: string;
  resourceRating: string;
  nativeLanguage: string;
  canDoLqa: boolean;
  specializations: string[];
}

interface Offer {
  id: number;
  assignmentId: number;
  freelancerCode: string;
  freelancerName: string;
  freelancerEmail: string;
  status: string;
  sequenceOrder: number | null;
}

interface Assignment {
  id: number;
  source: string;
  sheet: string;
  projectId: string;
  account: string;
  assignmentType: string;
  role: string;
  status: string;
  offers: Offer[];
}

interface SheetConfig {
  id: number;
  source: string;
  sheet: string;
  languagePair: string;
  sheetDbId?: string;
  googleSheetUrl?: string;
  assignedPms?: string | null;
  googleSheetId?: string | null;
  worksheetId?: number | null;
}

// Build Google Sheets URL from config
function getSheetUrl(configs: SheetConfig[] | undefined, source: string, sheet: string): string | null {
  if (!configs) return null;
  const cfg = configs.find(c => c.source === source && c.sheet === sheet);
  if (!cfg?.googleSheetId) return null;
  let url = `https://docs.google.com/spreadsheets/d/${cfg.googleSheetId}`;
  if (cfg.worksheetId) url += `/edit#gid=${cfg.worksheetId}`;
  return url;
}

interface EmailTemplate {
  id: number;
  key: string;
  subject: string;
  body: string;
}

interface SequencePreset {
  id: number;
  name: string;
  pmEmail: string;
  role: string;
  freelancerCodes: string;
  assignmentType: string;
}

interface FreelancerStats {
  taskCount: number;
  avgQs: number | null;
  activeCount: number;
  activeWwc: number;
}

interface FreelancerDeliveryStats {
  avgWwcPerHour: number;
  totalDeliveries: number;
}

// ── ELTS Quality + Availability types ──

interface EltsAccountQuality {
  qs: number | null;
  lqa: number | null;
  count: number;
}

interface EltsFreelancerQuality {
  generalQs: number | null;
  generalLqa: number | null;
  totalReports: number;
  accounts: Record<string, EltsAccountQuality>;
}

type EltsQualityData = Record<string, EltsFreelancerQuality>;

interface EltsAvailabilityDay {
  date: string;
  status: string;
  hours: number;
  notes: string;
}

type EltsAvailabilityData = Record<string, EltsAvailabilityDay[]>;

// ── Constants ──

const ACCOUNT_MATCH: Record<string, string[]> = {
  Amazon: ["Amazon", "Amazon SeCM", "Amazon PWS"],
  AppleCare: ["Apple"],
  "L-Google": ["Google"],
  WhatsApp: ["Whatsapp"],
  TikTok: ["TikTok"],
  Facebook: ["Facebook"],
};

// Specialization-based matching: filter by freelancer specialization instead of account
const SPECIALIZATION_MATCH: Record<string, string[]> = {
  Games: ["Game", "Gaming", "Game Localization", "Gaming Localization", "Gaming Translation", "Games Localization Specialist", "Video Games", "Video Game Localisation", "Videogame Localization", "Game Industry"],
};

// Test freelancer codes that bypass account/language filters
const BYPASS_FILTER_CODES = ["CY", "CY1"];

// ── Helpers ──

function isXX(v: string): boolean {
  return v.trim().toUpperCase() === "XX";
}

function isCancelledValue(v: string): boolean {
  const lv = v.trim().toLowerCase();
  return lv === "cancelled" || lv === "canceled" || lv === "on hold" || lv === "onhold" || lv === "on-hold";
}

// A task is "effectively cancelled" if ANY delivery-related column says cancelled/on hold
function isEffectivelyCancelled(t: Task): boolean {
  return isCancelledValue(t.trDone || "") || isCancelledValue(t.revComplete || "");
}

function isRevCompleted(t: Task): boolean {
  const v = (t.revComplete || "").trim().toLowerCase();
  if (!v) return false;
  if (isCancelledValue(v)) return false; // cancelled is NOT completed
  if (v === "yes" || v === "y") return true;
  if (/^\d+/.test(v)) return true;
  return false;
}

function isTrDone(t: Task): boolean {
  const v = (t.trDone || "").trim().toLowerCase();
  if (!v) return false;
  if (isCancelledValue(v)) return false; // cancelled is NOT done
  if (v === "yes" || v === "y") return true;
  return false;
}

function needsTranslator(t: Task): boolean {
  if (isEffectivelyCancelled(t)) return false; // cancelled tasks don't "need" anyone
  if (isRevCompleted(t)) return false;
  if (isTrDone(t)) return false;
  return !t.translator || t.translator.trim() === "" || isXX(t.translator);
}

function needsReviewer(t: Task): boolean {
  if (isEffectivelyCancelled(t)) return false; // cancelled tasks don't "need" anyone
  if (isRevCompleted(t)) return false;
  if (!t.translator || t.translator.trim() === "" || isXX(t.translator)) return false;
  return !t.reviewer || t.reviewer.trim() === "" || isXX(t.reviewer);
}

function taskKey(t: Task): string {
  return `${t.source}|${t.sheet}|${t.projectId}`;
}

function parseDeadline(d: string): Date | null {
  if (!d) return null;
  // Try DD.MM.YYYY HH:mm format first (European date format used in sheets)
  const euMatch = d.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})\s*(\d{1,2}):(\d{2})/);
  if (euMatch) {
    return new Date(+euMatch[3], +euMatch[2] - 1, +euMatch[1], +euMatch[4], +euMatch[5]);
  }
  // Try DD.MM.YYYY without time
  const euDateOnly = d.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (euDateOnly) {
    return new Date(+euDateOnly[3], +euDateOnly[2] - 1, +euDateOnly[1]);
  }
  // Fallback to native parser (ISO, US formats etc.)
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function deadlineClass(d: string): string {
  const date = parseDeadline(d);
  if (!date) return "text-muted-foreground";
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  if (diffMs < 0) return "text-red-500 font-semibold"; // overdue
  if (diffHours <= 2) return "text-red-400 font-medium animate-pulse"; // within 2 hours
  if (diffHours <= 8) return "text-orange-400 font-medium"; // within 8 hours
  if (diffHours <= 24) return "text-amber-400"; // within 24 hours
  return "text-emerald-400/70"; // more than 24h away
}

// Calculate suggested translator deadline based on WWC and business hours
// Assumes: 300 words/hour, Mon-Fri 9:00-18:00, small buffer (30 min)
// If clientDeadline is provided, the suggestion is capped 2h before it (review buffer)
function suggestDeadline(wwcStr: string, clientDeadline?: string): string {
  const wwc = parseFloat((wwcStr || "0").replace(/[^\d.,]/g, "").replace(",", "."));
  if (!wwc || wwc <= 0) return "";
  const hoursNeeded = wwc / 300;
  const bufferHours = 0.5; // 30 min buffer
  let totalMinutes = Math.ceil((hoursNeeded + bufferHours) * 60);

  const now = new Date();
  let cursor = new Date(now);
  
  // If current time is before 9:00, start at 9:00 today
  // If after 18:00 or weekend, start at 9:00 next business day
  function nextBusinessStart(d: Date): Date {
    const r = new Date(d);
    // Skip to next day if past 18:00
    if (r.getHours() >= 18) {
      r.setDate(r.getDate() + 1);
      r.setHours(9, 0, 0, 0);
    }
    // If before 9:00, set to 9:00
    if (r.getHours() < 9) {
      r.setHours(9, 0, 0, 0);
    }
    // Skip weekends
    while (r.getDay() === 0 || r.getDay() === 6) {
      r.setDate(r.getDate() + 1);
      r.setHours(9, 0, 0, 0);
    }
    return r;
  }

  cursor = nextBusinessStart(cursor);

  while (totalMinutes > 0) {
    // Minutes left in current business day (until 18:00)
    const endOfDay = new Date(cursor);
    endOfDay.setHours(18, 0, 0, 0);
    const availableMinutes = Math.max(0, (endOfDay.getTime() - cursor.getTime()) / 60000);

    if (totalMinutes <= availableMinutes) {
      cursor = new Date(cursor.getTime() + totalMinutes * 60000);
      totalMinutes = 0;
    } else {
      totalMinutes -= availableMinutes;
      // Move to next business day 9:00
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(9, 0, 0, 0);
      cursor = nextBusinessStart(cursor);
    }
  }

  // Cap at client/review deadline minus 2 hours (review buffer)
  if (clientDeadline) {
    const cd = parseDeadline(clientDeadline);
    if (cd) {
      const cap = new Date(cd.getTime() - 2 * 3600 * 1000);
      if (cursor > cap) cursor = cap;
    }
  }

  // Format as datetime-local value: YYYY-MM-DDTHH:mm
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}T${pad(cursor.getHours())}:${pad(cursor.getMinutes())}`;
}

// Format datetime-local to display format (DD.MM.YYYY HH:mm)
function formatDeadlineDisplay(dtLocal: string): string {
  if (!dtLocal) return "";
  const d = new Date(dtLocal);
  if (isNaN(d.getTime())) return dtLocal;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Build full taskDetails for assignment API calls
function buildTaskDetails(t: Task) {
  return {
    source: t.source, sheet: t.sheet, projectId: t.projectId,
    account: t.account, deadline: t.deadline, revDeadline: t.revDeadline || "",
    total: t.total, wwc: t.wwc, revType: t.revType,
    projectTitle: t.projectTitle,
    catCounts: t.catCounts, hoNote: t.hoNote,
    trHbNote: t.trHbNote, revHbNote: t.revHbNote,
    instructions: t.instructions, lqi: t.lqi, qs: t.qs,
    atmsId: t.atmsId || "",
    symfonieLink: t.symfonieLink || "",
    symfonieId: t.symfonieId || "",
  };
}

// ── Sound helpers (Web Audio API) ──

function playAcceptSound() {
  try {
    const ctx = new AudioContext();
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.frequency.value = 440;
    gain1.gain.value = 0.15;
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.1);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.frequency.value = 660;
    gain2.gain.value = 0.15;
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.1);
    osc2.stop(ctx.currentTime + 0.2);

    setTimeout(() => ctx.close(), 500);
  } catch {}
}

function playRejectSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(220, ctx.currentTime + 0.15);
    gain.gain.value = 0.12;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);

    setTimeout(() => ctx.close(), 500);
  } catch {}
}

// ── ELTS helpers ──

function getQsBadgeColor(qs: number): string {
  if (qs >= 4.5) return "bg-emerald-500/15 text-emerald-400 border-emerald-500/25";
  if (qs >= 4.0) return "bg-blue-500/15 text-blue-400 border-blue-500/25";
  if (qs >= 3.5) return "bg-amber-500/15 text-amber-400 border-amber-500/25";
  return "bg-red-500/15 text-red-400 border-red-500/25";
}

function getTodayStr(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getAvailabilityToday(days: EltsAvailabilityDay[] | undefined): EltsAvailabilityDay | null {
  if (!days) return null;
  const today = getTodayStr();
  return days.find(d => d.date === today) || null;
}

function getUpcomingUnavailable(days: EltsAvailabilityDay[] | undefined): { start: string; end: string } | null {
  if (!days) return null;
  const today = getTodayStr();
  // Look at next 3 days after today
  const todayDate = new Date(today);
  const upcoming: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const d = new Date(todayDate);
    d.setDate(d.getDate() + i);
    const pad = (n: number) => n.toString().padStart(2, "0");
    const ds = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const match = days.find(day => day.date === ds);
    if (match && match.status === "unavailable") {
      upcoming.push(ds);
    }
  }
  if (upcoming.length === 0) return null;
  // Format as "Mar 26" or "Mar 26-28"
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const first = new Date(upcoming[0]);
  const last = new Date(upcoming[upcoming.length - 1]);
  const startStr = `${months[first.getMonth()]} ${first.getDate()}`;
  if (upcoming.length === 1) return { start: startStr, end: startStr };
  const endStr = first.getMonth() === last.getMonth()
    ? `${last.getDate()}`
    : `${months[last.getMonth()]} ${last.getDate()}`;
  return { start: startStr, end: endStr };
}

function formatAvailabilityTooltip(days: EltsAvailabilityDay[] | undefined): string {
  if (!days || days.length === 0) return "";
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return days.slice(0, 7).map(d => {
    const dt = new Date(d.date);
    const label = `${months[dt.getMonth()]} ${dt.getDate()}`;
    const statusLabel = d.status === "unavailable" ? "\u274C Unavailable"
      : d.status === "partially_available" ? `\u26A0\uFE0F ${d.hours}h`
      : "\u2705 Available";
    return `${label}: ${statusLabel}${d.notes ? ` (${d.notes})` : ""}`;
  }).join("\n");
}

// ── Component ──

export default function DashboardPage() {
  const { toast } = useToast();
  const { user } = useAuth();

  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState(user?.defaultSource || "all");
  const [accountFilter, setAccountFilter] = useState(user?.defaultAccount || "all");
  const [langFilter, setLangFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState(user?.defaultFilter || "ongoing");
  const [myProjectsOnly, setMyProjectsOnly] = useState(user?.defaultMyProjects || false);
  const [selectedTaskKey, setSelectedTaskKey] = useState<string | null>(null);
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());

  // Bulk mode
  const [bulkMode, setBulkMode] = useState<"translator" | "reviewer" | null>(null);

  // Assignment form state
  const [role, setRole] = useState<"translator" | "reviewer">("translator");
  const [assignmentType, setAssignmentType] = useState<"direct" | "sequence" | "broadcast">("sequence");
  const [selectedFreelancers, setSelectedFreelancers] = useState<Freelancer[]>([]);
  const [freelancerSearch, setFreelancerSearch] = useState("");
  const [showAllLangOnly, setShowAllLangOnly] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailPreviewMode, setEmailPreviewMode] = useState(false);
  const [customSubject, setCustomSubject] = useState("");
  const [customBody, setCustomBody] = useState("");
  const [showInstructions, setShowInstructions] = useState(false);

  // Preset state
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [presetName, setPresetName] = useState("");

  // Project Complete state
  const [showComplete, setShowComplete] = useState(false);
  const [completeMode, setCompleteMode] = useState<"yes" | "minutes">("yes");
  const [completeMinutes, setCompleteMinutes] = useState("");

  // Skip email (confirmed assign)
  const [skipEmail, setSkipEmail] = useState(false);

  // Review type for reviewer assignments
  const [reviewType, setReviewType] = useState("Full Review");

  // Translator deadline (when TR Deadline is empty)
  const [customDeadline, setCustomDeadline] = useState("");

  // Bulk complete state
  const [showBulkComplete, setShowBulkComplete] = useState(false);
  const [bulkCompleteMode, setBulkCompleteMode] = useState<"yes" | "minutes">("yes");
  const [bulkCompleteMinutes, setBulkCompleteMinutes] = useState("");

  // Auto-refresh: last updated tracking
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [lastUpdatedText, setLastUpdatedText] = useState("");

  // Column sorting state
  const [sortCol, setSortCol] = useState<string>("deadline");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // T2.8: Task grouping
  const [groupBy, setGroupBy] = useState<"none" | "account" | "source" | "deadline">("none");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // T2.1: Drag-and-drop state
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);

  // T2.6: Email preview modal
  const [showEmailPreviewModal, setShowEmailPreviewModal] = useState(false);

  // Availability Calendar
  const [calendarFreelancer, setCalendarFreelancer] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; });
  const [editingDay, setEditingDay] = useState<string | null>(null);
  const [editDayStatus, setEditDayStatus] = useState("unavailable");
  const [editDayHours, setEditDayHours] = useState("");
  const [editDayNotes, setEditDayNotes] = useState("");
  const [savingAvail, setSavingAvail] = useState(false);

  // T2.7: Mobile filter toggle
  const isMobile = useIsMobile();
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Search input ref for keyboard shortcut
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Feature 1: Notification sounds — mute state (default: muted)
  const soundMutedRef = useRef(true);
  const [soundMuted, setSoundMuted] = useState(true);
  const prevAssignmentsRef = useRef<Assignment[] | null>(null);

  // Feature 2: Freelancer favorites
  const { data: favorites } = useQuery<string[]>({
    queryKey: ["/api/favorites"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/favorites");
      return res.json();
    },
    staleTime: 60000,
  });

  const favoritesSet = useMemo(() => new Set(favorites || []), [favorites]);

  const toggleFavoriteMutation = useMutation({
    mutationFn: async (freelancerCode: string) => {
      const res = await apiRequest("POST", "/api/favorites", { freelancerCode });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/favorites"] });
    },
    onError: (err: any) => {
      toast({ title: "Error toggling favorite", description: err.message, variant: "destructive" });
    },
  });

  // Feature 3: Undo last action
  const [lastAssignmentId, setLastAssignmentId] = useState<number | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const undoMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/assignments/${id}/undo`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Assignment undone" });
      setLastAssignmentId(null);
    },
    onError: (err: any) => {
      toast({ title: "Undo failed", description: err.message, variant: "destructive" });
    },
  });

  // Feature 4: Batch deadline
  const [showBatchDeadline, setShowBatchDeadline] = useState(false);
  const [batchDeadlineValue, setBatchDeadlineValue] = useState("");

  const batchDeadlineMutation = useMutation({
    mutationFn: async () => {
      if (!tasks) throw new Error("No tasks");
      const checkedTasks = tasks.filter(t => checkedKeys.has(taskKey(t)));
      const taskIds = checkedTasks.map(t => ({
        source: t.source,
        sheet: t.sheet,
        projectId: t.projectId,
      }));
      const res = await apiRequest("POST", "/api/tasks/batch-deadline", {
        tasks: taskIds,
        deadline: formatDeadlineDisplay(batchDeadlineValue),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Deadlines updated", description: `${checkedKeys.size} tasks updated.` });
      setShowBatchDeadline(false);
      setBatchDeadlineValue("");
    },
    onError: (err: any) => {
      toast({ title: "Error setting deadlines", description: err.message, variant: "destructive" });
    },
  });

  // KPI queries for dashboard summary
  const { data: kpiProjects } = useQuery({
    queryKey: ["/api/projects?status=active&limit=1"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/projects?status=active&limit=1"); return r.json(); },
    staleTime: 120000,
  });
  const { data: kpiFinancial } = useQuery({
    queryKey: ["/api/financial/summary"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/financial/summary"); return r.json().catch(() => ({})); },
    staleTime: 120000,
  });

  // Queries
  const wantDelivered = statusFilter === "delivered" || statusFilter === "all";
  const { data: tasks, isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks", wantDelivered],
    queryFn: async () => {
      const url = wantDelivered ? "/api/tasks?includeDelivered=true" : "/api/tasks";
      const res = await apiRequest("GET", url);
      return res.json();
    },
    staleTime: 60000,
    refetchInterval: 60000,
  });

  const { data: assignments } = useQuery<Assignment[]>({
    queryKey: ["/api/assignments"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/assignments");
      return res.json();
    },
    staleTime: 30000,
    refetchInterval: 30000,
  });

  // Feature 1: Notification sounds — detect status changes on refetch
  useEffect(() => {
    if (!assignments) return;
    const prev = prevAssignmentsRef.current;
    if (prev !== null && !soundMutedRef.current) {
      // Build map of previous offer statuses
      const prevOfferStatuses = new Map<number, string>();
      for (const a of prev) {
        for (const o of (a.offers || [])) {
          prevOfferStatuses.set(o.id, o.status);
        }
      }
      // Check for new accepted/rejected
      let hasAccept = false;
      let hasReject = false;
      for (const a of assignments) {
        for (const o of (a.offers || [])) {
          const prevStatus = prevOfferStatuses.get(o.id);
          if (prevStatus && prevStatus !== o.status) {
            if (o.status === "accepted") hasAccept = true;
            if (o.status === "rejected") hasReject = true;
          }
        }
      }
      if (hasAccept) playAcceptSound();
      else if (hasReject) playRejectSound();
    }
    prevAssignmentsRef.current = assignments;
  }, [assignments]);

  const { data: freelancers, isLoading: freelancersLoading } = useQuery<Freelancer[]>({
    queryKey: ["/api/freelancers"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/freelancers");
      return res.json();
    },
    staleTime: 300000,
  });

  const { data: sheetConfigs } = useQuery<SheetConfig[]>({
    queryKey: ["/api/sheet-configs"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/sheet-configs");
      return res.json();
    },
    staleTime: 300000,
  });

  const { data: emailTemplates } = useQuery<EmailTemplate[]>({
    queryKey: ["/api/email-templates"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/email-templates");
      return res.json();
    },
    staleTime: 300000,
  });

  const { data: presets } = useQuery<SequencePreset[]>({
    queryKey: ["/api/presets"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/presets");
      return res.json();
    },
    staleTime: 60000,
  });

  const { data: freelancerStats } = useQuery<Record<string, FreelancerStats>>({
    queryKey: ["/api/freelancer-stats"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/freelancer-stats");
      return res.json();
    },
    staleTime: 300000,
  });

  const { data: freelancerDeliveryStats } = useQuery<Record<string, FreelancerDeliveryStats>>({
    queryKey: ["/api/freelancer-delivery-stats"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/freelancer-delivery-stats");
      return res.json();
    },
    staleTime: 300000,
  });

  // ELTS Quality scores
  const { data: eltsQuality } = useQuery<EltsQualityData>({
    queryKey: ["/api/elts/quality"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/elts/quality");
      return res.json();
    },
    staleTime: 300000,
  });

  // ELTS Availability
  const { data: eltsAvailability } = useQuery<EltsAvailabilityData>({
    queryKey: ["/api/elts/availability"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/elts/availability");
      return res.json();
    },
    staleTime: 300000,
  });

  // Task notes query
  const { data: taskNotes } = useQuery<{ source: string; sheet: string; projectId: string; note: string }[]>({
    queryKey: ["/api/task-notes"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/task-notes");
      return res.json();
    },
    staleTime: 60000,
  });

  // Notes map for quick lookup
  const notesMap = useMemo(() => {
    const map = new Map<string, string>();
    if (taskNotes) {
      for (const n of taskNotes) {
        map.set(`${n.source}|${n.sheet}|${n.projectId}`, n.note);
      }
    }
    return map;
  }, [taskNotes]);

  // Task note editing state
  const [editingNote, setEditingNote] = useState("");
  const [noteExpanded, setNoteExpanded] = useState(false);

  // Save note mutation
  const saveNoteMutation = useMutation({
    mutationFn: async ({ source, sheet, projectId, note }: { source: string; sheet: string; projectId: string; note: string }) => {
      const res = await apiRequest("POST", "/api/task-notes", { source, sheet, projectId, note });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-notes"] });
      toast({ title: "Note saved" });
    },
    onError: (err: any) => {
      toast({ title: "Error saving note", description: err.message, variant: "destructive" });
    },
  });

  // Track when tasks data changes (was fetched)
  useEffect(() => {
    if (tasks) {
      setLastUpdated(new Date());
    }
  }, [tasks]);

  // Refresh "Updated X ago" text every 10s
  useEffect(() => {
    function tick() {
      if (lastUpdated) setLastUpdatedText(timeAgo(lastUpdated));
    }
    tick();
    const iv = setInterval(tick, 10000);
    return () => clearInterval(iv);
  }, [lastUpdated]);

  // Assigned project IDs set
  const assignedProjectIds = useMemo(() => {
    if (!assignments) return new Set<string>();
    return new Set(
      (assignments as Assignment[])
        .filter((a) => a.status !== "cancelled" && a.status !== "expired")
        .map((a) => `${a.source}|${a.sheet}|${a.projectId}`)
    );
  }, [assignments]);

  // Unique sources for filter dropdown (dynamic from actual data)
  const uniqueSources = useMemo(() => {
    if (!tasks) return [];
    return [...new Set(tasks.map(t => t.source))].filter(Boolean).sort();
  }, [tasks]);

  // Unique accounts for filter dropdown
  const uniqueAccounts = useMemo(() => {
    if (!tasks) return [];
    return [...new Set(tasks.map(t => t.account))].filter(Boolean).sort();
  }, [tasks]);

  // Unique language pairs for filter dropdown
  const uniqueLangPairs = useMemo(() => {
    if (!sheetConfigs) return [];
    return [...new Set((sheetConfigs as SheetConfig[]).map(c => c.languagePair))].sort();
  }, [sheetConfigs]);

  // Base filtered tasks — applies source/account/myProjects/lang filters but NOT status/search
  const baseFilteredTasks = useMemo(() => {
    if (!tasks) return [];
    return tasks.filter((t) => {
      if (sourceFilter !== "all" && t.source !== sourceFilter) return false;
      if (accountFilter !== "all" && t.account !== accountFilter) return false;
      if (myProjectsOnly && sheetConfigs && user) {
        const config = (sheetConfigs as SheetConfig[]).find(c => c.source === t.source && c.sheet === t.sheet);
        if (config?.assignedPms) {
          try {
            const pms = JSON.parse(config.assignedPms) as string[];
            if (!pms.includes(user.email)) return false;
          } catch {}
        }
      }
      if (langFilter !== "all" && sheetConfigs) {
        const config = (sheetConfigs as SheetConfig[]).find(c => c.source === t.source && c.sheet === t.sheet);
        if (!config || config.languagePair !== langFilter) return false;
      }
      return true;
    });
  }, [tasks, sourceFilter, accountFilter, langFilter, sheetConfigs, myProjectsOnly, user]);

  // Filter + sort tasks (status/search/sort on top of baseFilteredTasks)
  const filteredTasks = useMemo(() => {
    const filtered = baseFilteredTasks.filter((t) => {
      const nTR = needsTranslator(t);
      const nREV = needsReviewer(t);
      const isUnassigned = nTR || nREV;

      const revDone = isRevCompleted(t);

      const isTerminal = t.delivered === "Delivered" || t.delivered === "Cancelled" || t.delivered === "On Hold" || isEffectivelyCancelled(t);
      if (statusFilter === "ongoing" && (revDone || isTerminal)) return false;
      if (statusFilter === "needs_tr" && !nTR) return false;
      if (statusFilter === "needs_rev" && !nREV) return false;
      if (statusFilter === "unassigned" && !isUnassigned) return false;
      if (statusFilter === "assigned" && (isUnassigned || isTerminal)) return false;
      if (statusFilter === "all" && isTerminal) return false;
      if (statusFilter === "delivered" && t.delivered !== "Delivered") return false;
      if (statusFilter === "rev_done" && (!isRevCompleted(t) || isTerminal)) return false;
      if (statusFilter === "overdue") {
        const d = parseDeadline(t.deadline);
        if (!d || d >= new Date() || isRevCompleted(t) || isTerminal) return false;
      }
      if (statusFilter === "my_assigned") {
        const pmInit = user?.initial || "";
        if (!pmInit || (t.translator !== pmInit && t.reviewer !== pmInit)) return false;
        if (isTerminal) return false;
      }
      if (["delivered", "all", "ongoing", "needs_tr", "needs_rev", "unassigned", "assigned", "overdue", "rev_done", "my_assigned"].indexOf(statusFilter) === -1 && t.delivered === "Delivered") return false;

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return [t.projectId, t.account, t.translator, t.reviewer, t.sheet, t.source, t.projectTitle]
          .some((v) => v?.toLowerCase().includes(q));
      }
      return true;
    });

    // Sorting
    const parseNumeric = (v: string) => {
      if (!v) return 0;
      return parseFloat(v.replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".")) || 0;
    };

    return filtered.sort((a, b) => {
      let cmp = 0;
      switch (sortCol) {
        case "projectId":
          cmp = (a.projectId || "").localeCompare(b.projectId || "");
          break;
        case "account":
          cmp = (a.account || "").localeCompare(b.account || "");
          break;
        case "deadline": {
          const da = parseDeadline(a.deadline);
          const db = parseDeadline(b.deadline);
          if (!da && !db) cmp = 0;
          else if (!da) cmp = 1;
          else if (!db) cmp = -1;
          else cmp = da.getTime() - db.getTime();
          break;
        }
        case "total":
          cmp = parseNumeric(a.total) - parseNumeric(b.total);
          break;
        case "wwc":
          cmp = parseNumeric(a.wwc) - parseNumeric(b.wwc);
          break;
        case "status": {
          const statusOrder = (t: Task) => {
            if (needsTranslator(t)) return 0;
            if (needsReviewer(t)) return 1;
            if (t.delivered === "Delivered") return 3;
            return 2;
          };
          cmp = statusOrder(a) - statusOrder(b);
          break;
        }
        default: {
          const da = parseDeadline(a.deadline);
          const db = parseDeadline(b.deadline);
          if (!da && !db) cmp = 0;
          else if (!da) cmp = 1;
          else if (!db) cmp = -1;
          else cmp = da.getTime() - db.getTime();
        }
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [baseFilteredTasks, statusFilter, searchQuery, sortCol, sortDir]);

  // T2.8: Grouped tasks computation
  const groupedTasks = useMemo(() => {
    if (groupBy === "none") return null;
    const groups = new Map<string, Task[]>();
    for (const t of filteredTasks) {
      let key: string;
      if (groupBy === "account") key = t.account || "(No Account)";
      else if (groupBy === "source") key = `${t.source}/${t.sheet}`;
      else {
        // deadline: group by date only
        const d = parseDeadline(t.deadline);
        if (!d) key = "(No Deadline)";
        else {
          const pad = (n: number) => n.toString().padStart(2, "0");
          const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
          key = `${months[d.getMonth()]} ${pad(d.getDate())}`;
        }
      }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }
    return Array.from(groups.entries()).map(([name, tasks]) => ({ name, tasks }));
  }, [filteredTasks, groupBy]);

  function toggleGroupCollapse(name: string) {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  // T2.1: Drag-and-drop handlers for freelancer chips
  function handleDragStart(idx: number) {
    setDragIdx(idx);
  }
  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    setDropIdx(idx);
  }
  function handleDrop(idx: number) {
    if (dragIdx !== null && dragIdx !== idx) {
      setSelectedFreelancers(prev => {
        const arr = [...prev];
        const [item] = arr.splice(dragIdx, 1);
        arr.splice(idx, 0, item);
        return arr;
      });
    }
    setDragIdx(null);
    setDropIdx(null);
  }
  function handleDragEnd() {
    setDragIdx(null);
    setDropIdx(null);
  }

  // Stats — computed from baseFilteredTasks so counts match visible filter context
  const stats = useMemo(() => {
    if (!baseFilteredTasks.length) return { total: 0, ongoing: 0, needsTR: 0, needsREV: 0, assigned: 0, completed: 0, pastDeadline: 0, myAssigned: 0 };
    const nonDelivered = baseFilteredTasks.filter((t) => t.delivered !== "Delivered" && t.delivered !== "Cancelled" && t.delivered !== "On Hold" && !isEffectivelyCancelled(t));
    const ongoing = nonDelivered.filter(t => !isRevCompleted(t)).length;
    const nTR = nonDelivered.filter(needsTranslator).length;
    const nREV = nonDelivered.filter(needsReviewer).length;
    const completedCount = nonDelivered.filter(t => isRevCompleted(t)).length;
    const pastDeadline = nonDelivered.filter(t => {
      const d = parseDeadline(t.deadline);
      return d && d < new Date() && !isRevCompleted(t);
    }).length;
    // Count tasks where current PM's initial is in TR or REV column
    const pmInitial = user?.initial || "";
    const myAssigned = pmInitial ? nonDelivered.filter(t =>
      t.translator === pmInitial || t.reviewer === pmInitial
    ).length : 0;
    return {
      total: nonDelivered.length,
      ongoing,
      needsTR: nTR,
      needsREV: nREV,
      assigned: ongoing - nTR - nREV,
      completed: completedCount,
      pastDeadline,
      myAssigned,
    };
  }, [baseFilteredTasks, assignments, user]);

  // Selected task
  const selectedTask = useMemo(() => {
    if (!selectedTaskKey || !tasks) return null;
    return tasks.find((t) => taskKey(t) === selectedTaskKey) || null;
  }, [selectedTaskKey, tasks]);

  // Get language pair for the selected task from sheet configs
  const taskLangPair = useMemo(() => {
    if (!selectedTask || !sheetConfigs) return null;
    const config = sheetConfigs.find(
      (c) => c.source === selectedTask.source && c.sheet === selectedTask.sheet
    );
    return config?.languagePair || null;
  }, [selectedTask, sheetConfigs]);

  // Get email template for current role
  const currentTemplate = useMemo(() => {
    if (!emailTemplates) return null;
    const key = role === "translator" ? "offer_translator" : "offer_reviewer";
    return emailTemplates.find((t) => t.key === key) || null;
  }, [emailTemplates, role]);

  // Bulk sources for cross-account matching
  const bulkSources = useMemo(() => {
    if (!bulkMode || !tasks) return [];
    const checkedTasks = tasks.filter(t => checkedKeys.has(taskKey(t)));
    const sources: string[] = [];
    checkedTasks.forEach(t => {
      if (!sources.includes(t.source)) sources.push(t.source);
    });
    return sources;
  }, [bulkMode, tasks, checkedKeys]);

  // Bulk filtered freelancers: must match ALL sources
  const bulkFilteredFreelancers = useMemo(() => {
    if (!freelancers || !bulkMode || !tasks) return [];
    const selectedIds = new Set(selectedFreelancers.map((f) => f.id));
    // Collect language pairs from checked tasks
    const checkedTasks = tasks.filter(t => checkedKeys.has(taskKey(t)));
    const bulkLangs = new Set<string>();
    checkedTasks.forEach(t => {
      const lp = t.languagePair || sheetConfigs?.find(c => c.source === t.source && c.sheet === t.sheet)?.languagePair || "";
      if (lp && lp !== "Multi") bulkLangs.add(lp);
    });
    return freelancers.filter(f => {
      if (selectedIds.has(f.id)) return false;
      if (BYPASS_FILTER_CODES.includes(f.resourceCode)) return true;
      // PRIMARY: Language pair filter
      if (bulkLangs.size > 0) {
        if (!f.languagePairs || f.languagePairs.length === 0) return false;
        const matchesLang = [...bulkLangs].some(lp => f.languagePairs.includes(lp));
        if (!matchesLang) return false;
      }
      // SECONDARY: If no lang pairs detected, fall back to account/specialization
      if (bulkLangs.size === 0) {
        return bulkSources.every(source => {
          const matchAccts = ACCOUNT_MATCH[source] || [];
          const specMatch = SPECIALIZATION_MATCH[source] || [];
          if (matchAccts.length === 0 && specMatch.length === 0) return true;
          const acctOk = matchAccts.length > 0 && f.accounts?.some((a: string) => matchAccts.includes(a));
          const specOk = specMatch.length > 0 && f.specializations?.some((s: string) => specMatch.includes(s));
          return acctOk || specOk;
        });
      }
      return true;
    }).sort((a, b) => {
      // Unavailable freelancers sort to bottom
      const aUnavail = getAvailabilityToday(eltsAvailability?.[a.resourceCode])?.status === "unavailable" ? 1 : 0;
      const bUnavail = getAvailabilityToday(eltsAvailability?.[b.resourceCode])?.status === "unavailable" ? 1 : 0;
      if (aUnavail !== bUnavail) return aUnavail - bUnavail;
      // Feature 2: Favorites first
      const aFav = favoritesSet.has(a.resourceCode) ? 1 : 0;
      const bFav = favoritesSet.has(b.resourceCode) ? 1 : 0;
      if (bFav !== aFav) return bFav - aFav;
      const sa = freelancerStats?.[a.resourceCode]?.taskCount || 0;
      const sb = freelancerStats?.[b.resourceCode]?.taskCount || 0;
      if (sb !== sa) return sb - sa;
      return a.fullName.localeCompare(b.fullName);
    });
  }, [freelancers, bulkMode, bulkSources, selectedFreelancers, freelancerStats, favoritesSet, eltsAvailability, tasks, checkedKeys, sheetConfigs]);

  // XLSX export handler
  const [exporting, setExporting] = useState(false);
  async function handleExportXlsx() {
    try {
      setExporting(true);
      const authToken = getAuthToken();
      const res = await fetch(`${API_BASE}/api/export/xlsx`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { "Authorization": `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ tasks: filteredTasks }),
      });
      if (!res.ok) throw new Error(`Export failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "dispatch-export.xlsx";
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Export complete", description: `${filteredTasks.length} tasks exported.` });
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  // Task select handler
  function selectTask(t: Task) {
    const key = taskKey(t);
    if (selectedTaskKey === key) {
      setSelectedTaskKey(null);
      return;
    }
    setSelectedTaskKey(key);
    setSelectedFreelancers([]);
    setFreelancerSearch("");
    setShowAllLangOnly(false);
    setEditingEmail(false);
    setEmailPreviewMode(false);
    setCustomSubject("");
    setCustomBody("");
    setShowInstructions(false);
    // Auto-suggest deadline if TR Deadline is empty
    setCustomDeadline(t.deadline ? "" : suggestDeadline(t.wwc, t.revDeadline));
    setShowComplete(false);
    setShowSavePreset(false);
    const newRole = needsTranslator(t) ? "translator" : "reviewer";
    setRole(newRole);
    setAssignmentType("sequence");
    // Load existing note for this task
    setEditingNote(notesMap.get(key) || "");
    setNoteExpanded(false);
  }

  // Checkbox handling
  function toggleCheck(key: string) {
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAllVisible() {
    if (checkedKeys.size === filteredTasks.length) {
      setCheckedKeys(new Set());
    } else {
      setCheckedKeys(new Set(filteredTasks.map(taskKey)));
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const active = document.activeElement;
      const isTyping = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || (active as HTMLElement).isContentEditable);

      if (e.key === "Escape") {
        setSelectedTaskKey(null);
        setBulkMode(null);
        if (active instanceof HTMLElement) active.blur();
      }

      // Ctrl+F / Cmd+F: focus search input
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "a" && !e.shiftKey) {
        if (isTyping) return;
        e.preventDefault();
        setCheckedKeys(new Set(filteredTasks.map(taskKey)));
      }

      // Arrow keys + Enter: navigate tasks
      if (isTyping) return;

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (filteredTasks.length === 0) return;
        const currentIdx = selectedTaskKey ? filteredTasks.findIndex(t => taskKey(t) === selectedTaskKey) : -1;
        let nextIdx: number;
        if (e.key === "ArrowDown") {
          nextIdx = currentIdx < filteredTasks.length - 1 ? currentIdx + 1 : 0;
        } else {
          nextIdx = currentIdx > 0 ? currentIdx - 1 : filteredTasks.length - 1;
        }
        const nextTask = filteredTasks[nextIdx];
        if (nextTask) {
          selectTask(nextTask);
          // Scroll the row into view
          const row = document.querySelector(`[data-testid="row-task-${nextIdx}"]`);
          row?.scrollIntoView({ block: "nearest" });
        }
      }

      if (e.key === "Enter") {
        if (selectedTaskKey && !filteredTasks.find(t => taskKey(t) === selectedTaskKey)) return;
        // If task is selected via keyboard but panel not yet open, just confirm selection
        // (selectTask already opens it)
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [filteredTasks, selectedTaskKey]);

  // Freelancer filtering (single task mode)
  const filteredFreelancers = useMemo(() => {
    if (!freelancers || !selectedTask) return [];
    const selectedIds = new Set(selectedFreelancers.map((f) => f.id));
    const effectiveLang = selectedTask.languagePair || taskLangPair;
    const matchAccounts = ACCOUNT_MATCH[selectedTask.source] || [];
    const specMatch = SPECIALIZATION_MATCH[selectedTask.source] || [];

    return freelancers
      .filter((f) => {
        if (selectedIds.has(f.id)) return false;
        if (BYPASS_FILTER_CODES.includes(f.resourceCode)) return true;

        // LANGUAGE PAIR FILTER (always applied when available)
        if (effectiveLang && effectiveLang !== "Multi") {
          // Freelancer must have the matching language pair
          // If freelancer has no language pairs defined, they don't match
          if (!f.languagePairs || f.languagePairs.length === 0 || !f.languagePairs.includes(effectiveLang)) return false;
        }

        // ACCOUNT/SPECIALIZATION FILTER (default on, PM can toggle off)
        if (!showAllLangOnly && (matchAccounts.length > 0 || specMatch.length > 0)) {
          const acctOk = matchAccounts.length > 0 && f.accounts?.some((a: string) => matchAccounts.includes(a));
          const specOk = specMatch.length > 0 && f.specializations?.some((s: string) => specMatch.includes(s));
          if (!acctOk && !specOk) return false;
        }

        // Text search
        if (freelancerSearch) {
          const q = freelancerSearch.toLowerCase();
          return [f.fullName, f.resourceCode, f.email]
            .some((v) => v?.toLowerCase().includes(q));
        }
        return true;
      })
      .map((f) => {
        // Smart score calculation
        let score = 0;
        const fSt = freelancerStats?.[f.resourceCode];
        const eltsQ = eltsQuality?.[f.resourceCode];
        const acctQ = (selectedTask?.account && eltsQ?.accounts?.[selectedTask.account]) || null;
        const todayAvail = getAvailabilityToday(eltsAvailability?.[f.resourceCode]);
        // +30: Available today
        if (todayAvail?.status !== "unavailable") score += 30;
        if (todayAvail?.status === "partially_available") score += 15;
        // +25: Low active workload
        const activeCount = fSt?.activeCount || 0;
        score += Math.max(0, 25 - activeCount * 5);
        // +20: High QS
        const qs = acctQ?.qs ?? eltsQ?.generalQs ?? fSt?.avgQs ?? 0;
        if (qs >= 4.5) score += 20;
        else if (qs >= 4) score += 15;
        else if (qs >= 3.5) score += 10;
        else if (qs > 0) score += 5;
        // +15: Has experience with this account (from ELTS quality reports)
        if (acctQ && acctQ.count > 0) score += 15;
        // +12: Account tag match in ELTS profile
        if (matchAccounts.length > 0 && f.accounts?.some((a: string) => matchAccounts.includes(a))) score += 12;
        // +8: Specialization match
        if (specMatch.length > 0 && f.specializations?.some((s: string) => specMatch.includes(s))) score += 8;
        // +10: Favorite
        if (favoritesSet.has(f.resourceCode)) score += 10;
        return { ...f, _score: score, _hasAccountTag: matchAccounts.length > 0 && f.accounts?.some((a: string) => matchAccounts.includes(a)) };
      })
      .sort((a, b) => {
        // Unavailable sort to bottom
        const aUnavail = getAvailabilityToday(eltsAvailability?.[a.resourceCode])?.status === "unavailable" ? 1 : 0;
        const bUnavail = getAvailabilityToday(eltsAvailability?.[b.resourceCode])?.status === "unavailable" ? 1 : 0;
        if (aUnavail !== bUnavail) return aUnavail - bUnavail;
        // Smart score desc
        if (b._score !== a._score) return b._score - a._score;
        return a.fullName.localeCompare(b.fullName);
      });
  }, [freelancers, selectedTask, freelancerSearch, selectedFreelancers, taskLangPair, freelancerStats, favoritesSet, eltsAvailability, eltsQuality, showAllLangOnly]);

  // Use bulkFilteredFreelancers in bulk mode, filteredFreelancers otherwise
  const displayFreelancers = bulkMode ? bulkFilteredFreelancers : filteredFreelancers;

  // Determine current account name for ELTS quality lookup
  const currentAccountName = useMemo(() => {
    if (selectedTask) return selectedTask.account || null;
    if (bulkMode && tasks) {
      const checkedTasks = tasks.filter(t => checkedKeys.has(taskKey(t)));
      const accounts = Array.from(new Set(checkedTasks.map(t => t.account).filter(Boolean)));
      return accounts.length === 1 ? accounts[0] : null;
    }
    return null;
  }, [selectedTask, bulkMode, tasks, checkedKeys]);

  function addFreelancer(f: Freelancer) {
    if (assignmentType === "direct") {
      setSelectedFreelancers([f]);
    } else {
      setSelectedFreelancers((prev) => [...prev, f]);
    }
  }

  function removeFreelancer(id: string) {
    setSelectedFreelancers((prev) => prev.filter((f) => f.id !== id));
  }

  function moveFreelancer(index: number, dir: "up" | "down") {
    setSelectedFreelancers((prev) => {
      const arr = [...prev];
      const ni = dir === "up" ? index - 1 : index + 1;
      if (ni < 0 || ni >= arr.length) return prev;
      [arr[index], arr[ni]] = [arr[ni], arr[index]];
      return arr;
    });
  }

  // Load preset
  function loadPreset(preset: SequencePreset) {
    if (!freelancers) return;
    try {
      const codes = JSON.parse(preset.freelancerCodes) as string[];
      const matched = codes.map(code => freelancers.find(f => f.resourceCode === code)).filter(Boolean) as Freelancer[];
      setSelectedFreelancers(matched);
      setAssignmentType(preset.assignmentType as any || "sequence");
      if (!bulkMode) setRole(preset.role as any || "translator");
    } catch {}
  }

  // Save preset mutation
  const savePresetMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/presets", {
        name: presetName,
        role: bulkMode || role,
        freelancerCodes: JSON.stringify(selectedFreelancers.map(f => f.resourceCode)),
        assignmentType,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/presets"] });
      toast({ title: "Preset saved" });
      setShowSavePreset(false);
      setPresetName("");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Delete preset mutation
  const deletePresetMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/presets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/presets"] });
      toast({ title: "Preset deleted" });
    },
  });

  // Save default filter preferences
  const saveDefaultsMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/pm-users/preferences", {
        defaultFilter: statusFilter,
        defaultMyProjects: myProjectsOnly,
        defaultSource: sourceFilter,
        defaultAccount: accountFilter,
      });
    },
    onSuccess: () => {
      toast({ title: "Default filters saved", description: `Saved: ${statusFilter}${sourceFilter !== "all" ? ` / ${sourceFilter}` : ""}${myProjectsOnly ? " + My Projects" : ""}` });
    },
    onError: (err: any) => {
      toast({ title: "Error saving defaults", description: err.message, variant: "destructive" });
    },
  });

  // Feature 3: Helper to show undo toast after assignment
  function showUndoToast(assignmentId: number) {
    setLastAssignmentId(assignmentId);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    const { dismiss } = toast({
      title: "Task assigned",
      description: (
        <div className="flex items-center gap-2">
          <span>Assignment created.</span>
          <button
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-primary/20 text-primary text-xs font-medium hover:bg-primary/30 transition-colors"
            data-testid="button-undo-assignment"
            onClick={() => {
              undoMutation.mutate(assignmentId);
              dismiss();
            }}
          >
            <Undo2 className="w-3 h-3" />
            Undo
          </button>
        </div>
      ) as any,
    });
    undoTimerRef.current = setTimeout(() => {
      dismiss();
      setLastAssignmentId(null);
    }, 12000);
  }

  // Submit assignment
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTask) throw new Error("No task selected");
      const body: any = {
        source: selectedTask.source,
        sheet: selectedTask.sheet,
        projectId: selectedTask.projectId,
        account: selectedTask.account,
        taskDetails: buildTaskDetails(selectedTask),
        assignmentType,
        role,
        freelancers: selectedFreelancers.map((f) => ({
          resourceCode: f.resourceCode,
          fullName: f.fullName,
          email: f.email,
        })),
        autoAssignReviewer: false,
        clientBaseUrl: window.location.href.split("#")[0].replace(/\/$/, ""),
        apiBaseUrl: getPublicApiBase(),
        reviewType,
      };
      if (customSubject) body.emailSubject = customSubject;
      if (customBody) body.emailBody = customBody;
      if (customDeadline) body.customDeadline = formatDeadlineDisplay(customDeadline);
      const res = await apiRequest("POST", "/api/assignments", body);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      if (data?.assignment?.id) {
        showUndoToast(data.assignment.id);
      } else {
        toast({ title: "Task assigned", description: "Emails sent successfully." });
      }
      setSelectedTaskKey(null);
      setSelectedFreelancers([]);
      setEditingEmail(false);
      setCustomSubject("");
      setCustomBody("");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Bulk assign mutation
  const bulkAssignMutation = useMutation({
    mutationFn: async () => {
      if (!bulkMode || !tasks) throw new Error("No bulk mode");
      const checkedTasks = tasks.filter(t => checkedKeys.has(taskKey(t)));
      for (const task of checkedTasks) {
        await apiRequest("POST", "/api/assignments", {
          source: task.source,
          sheet: task.sheet,
          projectId: task.projectId,
          account: task.account,
          taskDetails: buildTaskDetails(task),
          assignmentType,
          role: bulkMode,
          freelancers: selectedFreelancers.map(f => ({
            resourceCode: f.resourceCode, fullName: f.fullName, email: f.email,
          })),
          autoAssignReviewer: false,
          clientBaseUrl: window.location.href.split("#")[0].replace(/\/$/, ""),
          apiBaseUrl: getPublicApiBase(),
          reviewType,
          ...(customSubject ? { emailSubject: customSubject } : {}),
          ...(customBody ? { emailBody: customBody } : {}),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Bulk assignment complete", description: `${checkedKeys.size} tasks assigned.` });
      setCheckedKeys(new Set());
      setBulkMode(null);
      setSelectedFreelancers([]);
      setEditingEmail(false);
      setCustomSubject("");
      setCustomBody("");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Project complete mutation
  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTask) throw new Error("No task");
      const revCompleteValue = completeMode === "yes" ? "Yes" : completeMinutes;
      const res = await apiRequest("POST", "/api/tasks/complete", {
        source: selectedTask.source,
        sheet: selectedTask.sheet,
        projectId: selectedTask.projectId,
        revCompleteValue,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      toast({ title: "Task marked as complete" });
      setShowComplete(false);
      setCompleteMode("yes");
      setCompleteMinutes("");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Cancel assignment mutation
  const cancelAssignmentMutation = useMutation({
    mutationFn: async (assignmentId: number) => {
      await apiRequest("POST", `/api/assignments/${assignmentId}/cancel`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      toast({ title: "Assignment cancelled" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Unassign from sheet (write XX + cancel dispatch)
  const unassignMutation = useMutation({
    mutationFn: async ({ role: unRole }: { role: "translator" | "reviewer" }) => {
      if (!selectedTask) throw new Error("No task selected");
      await apiRequest("POST", "/api/tasks/unassign", {
        source: selectedTask.source,
        sheet: selectedTask.sheet,
        projectId: selectedTask.projectId,
        role: unRole,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      toast({ title: "Freelancer unassigned", description: "Sheet updated to XX. Task is now available for reassignment." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Withdraw offer mutation
  const withdrawOfferMutation = useMutation({
    mutationFn: async (offerId: number) => {
      await apiRequest("POST", `/api/offers/${offerId}/withdraw`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      toast({ title: "Offer withdrawn" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Self-assign mutation (Assign to Me)
  const selfAssignMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTask || !user) throw new Error("No task or user");
      const res = await apiRequest("POST", "/api/assignments/self-assign", {
        source: selectedTask.source,
        sheet: selectedTask.sheet,
        projectId: selectedTask.projectId,
        account: selectedTask.account,
        taskDetails: buildTaskDetails(selectedTask),
        role,
        reviewType,
        ...(customDeadline ? { customDeadline: formatDeadlineDisplay(customDeadline) } : {}),
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      if (data?.assignment?.id) {
        showUndoToast(data.assignment.id);
      } else {
        toast({ title: "Assigned to you" });
      }
      setSelectedTaskKey(null);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Confirmed assign mutation (skip email)
  const confirmedAssignMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTask || selectedFreelancers.length === 0) throw new Error("No task or freelancer");
      const f = selectedFreelancers[0];
      const res = await apiRequest("POST", "/api/assignments/confirmed", {
        source: selectedTask.source,
        sheet: selectedTask.sheet,
        projectId: selectedTask.projectId,
        account: selectedTask.account,
        taskDetails: buildTaskDetails(selectedTask),
        role,
        freelancerCode: f.resourceCode,
        freelancerName: f.fullName,
        freelancerEmail: f.email,
        reviewType,
        ...(customDeadline ? { customDeadline: formatDeadlineDisplay(customDeadline) } : {}),
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      if (data?.assignment?.id) {
        showUndoToast(data.assignment.id);
      } else {
        toast({ title: "Task assigned (confirmed)", description: "No email sent." });
      }
      setSelectedTaskKey(null);
      setSelectedFreelancers([]);
      setSkipEmail(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Bulk complete mutation
  const bulkCompleteMutation = useMutation({
    mutationFn: async () => {
      if (!tasks) throw new Error("No tasks");
      const checkedTasks = tasks.filter(t => checkedKeys.has(taskKey(t)));
      const taskIds = checkedTasks.map(t => ({
        source: t.source,
        sheet: t.sheet,
        projectId: t.projectId,
      }));
      const res = await apiRequest("POST", "/api/tasks/bulk-complete", {
        tasks: taskIds,
        mode: bulkCompleteMode,
        totalMinutes: bulkCompleteMode === "minutes" ? parseInt(bulkCompleteMinutes) || 0 : undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      toast({ title: "Tasks marked complete", description: `${checkedKeys.size} tasks completed.` });
      setCheckedKeys(new Set());
      setShowBulkComplete(false);
      setBulkCompleteMode("yes");
      setBulkCompleteMinutes("");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Assignments for the selected task
  const taskAssignments = useMemo(() => {
    if (!selectedTask || !assignments) return [];
    return (assignments as Assignment[]).filter(a =>
      a.source === selectedTask.source && a.projectId === selectedTask.projectId &&
      a.status !== "cancelled"
    );
  }, [selectedTask, assignments]);

  // Whether selected task is fully assigned (no needs)
  const isFullyAssigned = selectedTask ? !needsTranslator(selectedTask) && !needsReviewer(selectedTask) : false;

  // CAT counts sum
  const catSum = useCallback((cc: CatCounts) => {
    return [cc.ice, cc.rep, cc.match100, cc.fuzzy95, cc.fuzzy85, cc.fuzzy75, cc.noMatch, cc.mt]
      .reduce((s, v) => s + (parseInt(v) || 0), 0);
  }, []);

  // Sample vars for email preview
  const sampleVars: Record<string, string> = selectedTask ? {
    freelancerName: selectedFreelancers[0]?.fullName || "Freelancer Name",
    account: selectedTask.account || "Account",
    source: selectedTask.source || "Source",
    sheet: selectedTask.sheet || "Sheet",
    projectId: selectedTask.projectId || "PRJ-123",
    deadline: selectedTask.deadline || "2026-04-01",
    total: selectedTask.total || "1000",
    wwc: selectedTask.wwc || "500",
    role: role === "translator" ? "Translation" : "Review",
    acceptUrl: "#",
  } : {};

  function replacePreviewVars(template: string): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => sampleVars[key] ?? `{{${key}}}`);
  }

  // Can show complete button: has TR and REV assigned, rev not done
  const canComplete = selectedTask &&
    selectedTask.translator && !isXX(selectedTask.translator) &&
    selectedTask.reviewer && !isXX(selectedTask.reviewer) &&
    !isRevCompleted(selectedTask);

  const hasChecked = checkedKeys.size > 0;

  // Presets for current role
  const rolePresets = useMemo(() => {
    if (!presets) return [];
    const r = bulkMode || role;
    return presets.filter(p => p.role === r);
  }, [presets, role, bulkMode]);

  // Render a single task row (shared between flat and grouped views)
  function renderTaskRow(task: Task, key: string, globalIdx: number, localIdx: number) {
    const isSelected = key === selectedTaskKey;
    const isChecked = checkedKeys.has(key);
    const nTR = needsTranslator(task);
    const nREV = needsReviewer(task);
    const isEven = localIdx % 2 === 0;
    return (
      <tr
        key={`${key}-${globalIdx}`}
        className={`border-b border-white/[0.03] cursor-pointer transition-all duration-100 ${
          isSelected
            ? "bg-primary/[0.08] border-l-2 border-l-primary"
            : isChecked
            ? "bg-blue-500/[0.06]"
            : isEven
            ? "bg-transparent hover:bg-white/[0.03]"
            : "bg-white/[0.015] hover:bg-white/[0.04]"
        }`}
        onClick={() => selectTask(task)}
        data-testid={`row-task-${globalIdx}`}
      >
        <td className="w-10 px-2 py-2" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={isChecked}
            onCheckedChange={() => toggleCheck(key)}
          />
        </td>
        <td className="px-2 py-2 font-medium text-foreground whitespace-nowrap text-xs">
          <span className="inline-flex items-center gap-1">
            {task.projectId}
            {notesMap.has(key) && notesMap.get(key) && (
              <StickyNote className="w-3 h-3 text-amber-400/70" />
            )}
          </span>
        </td>
        <td className="px-2 py-2 hidden md:table-cell">
          {(() => {
            const sheetUrl = getSheetUrl(sheetConfigs as SheetConfig[] | undefined, task.source, task.sheet);
            return sheetUrl ? (
              <a href={sheetUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title="Open Google Sheet">
                <Badge variant="secondary" className="text-[10px] font-normal px-1.5 py-0 bg-white/[0.04] border border-white/[0.06] hover:bg-blue-500/10 hover:border-blue-500/20 cursor-pointer transition-colors">
                  {task.source}/{task.sheet} <ExternalLink className="w-2.5 h-2.5 ml-0.5 inline opacity-40" />
                </Badge>
              </a>
            ) : (
              <Badge variant="secondary" className="text-[10px] font-normal px-1.5 py-0 bg-white/[0.04] border border-white/[0.06]">
                {task.source}/{task.sheet}
              </Badge>
            );
          })()}
        </td>
        <td className="px-2 py-2 text-muted-foreground text-xs truncate max-w-[120px]">{task.account}</td>
        <td className="px-2 py-2 text-xs hidden md:table-cell">
          {nTR ? <span className="text-muted-foreground/30">—</span> : <span className="text-foreground">{task.translator}</span>}
        </td>
        <td className="px-2 py-2 text-xs hidden md:table-cell">
          {task.translator && !isXX(task.translator)
            ? (nREV ? <span className="text-muted-foreground/30">—</span> : <span className="text-foreground">{task.reviewer}</span>)
            : <span className="text-muted-foreground/30">—</span>}
        </td>
        <td className={`px-2 py-2 text-xs whitespace-nowrap ${deadlineClass(task.deadline)}`}>
          {task.deadline || "—"}
        </td>
        <td className="px-2 py-2 text-xs tabular-nums text-right text-muted-foreground">{task.total}</td>
        <td className="px-2 py-2 text-xs tabular-nums text-right text-muted-foreground">{task.wwc}</td>
        <td className="px-2 py-2">
          {nTR && <StatusBadge type="needs-tr" />}
          {nREV && <StatusBadge type="needs-rev" />}
          {!nTR && !nREV && task.delivered === "Delivered" && <StatusBadge type="delivered" />}
          {!nTR && !nREV && task.delivered !== "Delivered" && <StatusBadge type="assigned" />}
        </td>
      </tr>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Overdue alert banner */}
      {stats.pastDeadline > 0 && statusFilter !== "overdue" && (
        <div
          className="px-4 py-1.5 bg-red-500/10 border-b border-red-500/20 flex items-center gap-2 cursor-pointer hover:bg-red-500/15 transition-colors"
          onClick={() => setStatusFilter("overdue")}
        >
          <span className="text-red-400 text-xs font-medium">{stats.pastDeadline} overdue task{stats.pastDeadline > 1 ? "s" : ""} past deadline</span>
          <span className="text-red-400/50 text-[10px]">Click to view</span>
        </div>
      )}

      {/* KPI Summary Cards */}
      <div className="border-b border-white/[0.06] bg-card/50 px-4 py-2">
        <div className="flex items-center gap-3 overflow-x-auto">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-md min-w-fit">
            <span className="text-[10px] text-blue-400/70 uppercase tracking-wider">Active Projects</span>
            <span className="text-sm font-bold text-blue-400 tabular-nums">{kpiProjects?.total ?? "\u2014"}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-md min-w-fit">
            <span className="text-[10px] text-emerald-400/70 uppercase tracking-wider">Revenue</span>
            <span className="text-sm font-bold text-emerald-400 tabular-nums">
              {kpiFinancial?.totalRevenue ? `\u20ac${Number(kpiFinancial.totalRevenue).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "\u2014"}
            </span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-md min-w-fit">
            <span className="text-[10px] text-amber-400/70 uppercase tracking-wider">Outstanding AR</span>
            <span className="text-sm font-bold text-amber-400 tabular-nums">
              {kpiFinancial?.totalOutstanding ? `\u20ac${Number(kpiFinancial.totalOutstanding).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "\u2014"}
            </span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-md min-w-fit">
            <span className="text-[10px] text-red-400/70 uppercase tracking-wider">Overdue Tasks</span>
            <span className="text-sm font-bold text-red-400 tabular-nums">{stats.pastDeadline}</span>
          </div>
        </div>
      </div>

      {/* Stats bar — premium glassmorphism stat pills */}
      <div className="border-b border-white/[0.06] bg-gradient-to-r from-card via-card to-card/80 px-4 py-2">
        <div className="flex items-center gap-1.5 text-xs flex-wrap">
          <StatPill label="Ongoing" value={stats.ongoing} loading={tasksLoading} color="blue" active={statusFilter === "ongoing"} onClick={() => setStatusFilter("ongoing")} />
          <StatPill label="Needs TR" value={stats.needsTR} loading={tasksLoading} color="orange" active={statusFilter === "needs_tr"} onClick={() => setStatusFilter("needs_tr")} />
          <StatPill label="Needs REV" value={stats.needsREV} loading={tasksLoading} color="cyan" active={statusFilter === "needs_rev"} onClick={() => setStatusFilter("needs_rev")} />
          <StatPill label="Unassigned" value={stats.needsTR + stats.needsREV} loading={tasksLoading} color="red" active={statusFilter === "unassigned"} onClick={() => setStatusFilter("unassigned")} />
          <StatPill label="Overdue" value={stats.pastDeadline} loading={tasksLoading} color="red" active={statusFilter === "overdue"} onClick={() => setStatusFilter("overdue")} />
          <StatPill label="Assigned" value={stats.assigned} loading={tasksLoading} color="emerald" active={statusFilter === "assigned"} onClick={() => setStatusFilter("assigned")} />
          {user?.initial && <StatPill label="Mine" value={stats.myAssigned} loading={tasksLoading} color="purple" active={statusFilter === "my_assigned"} onClick={() => setStatusFilter("my_assigned")} />}
          <StatPill label="Rev Done" value={stats.completed} loading={tasksLoading} color="green" active={statusFilter === "rev_done"} onClick={() => setStatusFilter("rev_done")} />
          <StatPill label="All" value={stats.total} loading={tasksLoading} color="gray" active={statusFilter === "all"} onClick={() => setStatusFilter("all")} />
          {/* Feature 1: Sound toggle */}
          <button
            onClick={() => {
              const newVal = !soundMuted;
              setSoundMuted(newVal);
              soundMutedRef.current = newVal;
            }}
            className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors px-1.5 py-1 rounded hover:bg-white/[0.04]"
            title={soundMuted ? "Unmute notifications" : "Mute notifications"}
            data-testid="button-sound-toggle"
          >
            {soundMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>
          {lastUpdatedText && (
            <span className="text-[10px] text-muted-foreground/60 tabular-nums" data-testid="text-last-updated">
              Updated {lastUpdatedText}
            </span>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="border-b border-white/[0.06] bg-card/30 px-4 py-2">
        <div className="flex items-center gap-2 overflow-x-auto">
          <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider mr-1">Quick Actions</span>
          <button
            onClick={() => { window.location.hash = "#/projects?create=true"; }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-md hover:bg-blue-500/20 transition-colors min-w-fit"
          >
            <Plus className="w-3.5 h-3.5" />
            Create Project
          </button>
          <button
            onClick={() => { window.location.hash = "#/vendors?add=true"; }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-md hover:bg-emerald-500/20 transition-colors min-w-fit"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Add Vendor
          </button>
          <button
            onClick={() => { window.location.hash = "#/quality?tab=qs-entry"; }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md hover:bg-amber-500/20 transition-colors min-w-fit"
          >
            <Star className="w-3.5 h-3.5" />
            Quick QS Entry
          </button>
        </div>
      </div>

      {/* T2.9: Sticky bulk operations toolbar */}
      {hasChecked && (
        <div className="sticky top-0 z-30 border-b border-amber-500/20 bg-amber-500/[0.05] backdrop-blur-sm px-4 py-2 flex items-center gap-3 relative shadow-sm shadow-black/10" data-testid="toolbar-bulk">
            <Badge variant="secondary" className="text-xs gap-1 bg-primary/10 text-primary border border-primary/20">
              <CheckCircle2 className="w-3 h-3" />
              {checkedKeys.size} tasks selected
            </Badge>
            <Button
              variant="default"
              size="sm"
              className="h-7 text-xs bg-orange-600 hover:bg-orange-700 shadow-sm shadow-orange-900/20"
              onClick={() => {
                setBulkMode("translator");
                setSelectedTaskKey(null);
                setSelectedFreelancers([]);
                setAssignmentType("sequence");
              }}
              data-testid="button-bulk-tr"
            >
              Bulk TR
              <ChevronRight className="w-3 h-3 ml-1" />
            </Button>
            <Button
              variant="default"
              size="sm"
              className="h-7 text-xs bg-blue-600 hover:bg-blue-700 shadow-sm shadow-blue-900/20"
              onClick={() => {
                setBulkMode("reviewer");
                setSelectedTaskKey(null);
                setSelectedFreelancers([]);
                setAssignmentType("sequence");
              }}
              data-testid="button-bulk-rev"
            >
              Bulk REV
              <ChevronRight className="w-3 h-3 ml-1" />
            </Button>
            <Button
              variant="default"
              size="sm"
              className="h-7 text-xs bg-green-600 hover:bg-green-700 shadow-sm shadow-green-900/20"
              onClick={() => setShowBulkComplete(true)}
              data-testid="button-bulk-complete"
            >
              <CheckSquare className="w-3 h-3 mr-1" />
              Bulk Complete
            </Button>
            <Button
              variant="default"
              size="sm"
              className="h-7 text-xs bg-purple-600 hover:bg-purple-700 shadow-sm shadow-purple-900/20"
              onClick={() => { setShowBatchDeadline(true); setShowBulkComplete(false); }}
              data-testid="button-batch-deadline"
            >
              <CalendarClock className="w-3 h-3 mr-1" />
              Set Deadline
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs border-red-500/20 text-red-400 hover:bg-red-500/10"
              onClick={async () => {
                if (!confirm(`Unassign TR from ${checkedKeys.size} tasks? This writes XX to the sheet.`)) return;
                for (const key of checkedKeys) {
                  const [source, sheet, projectId] = key.split("|");
                  try { await apiRequest("POST", "/api/tasks/unassign", { source, sheet, projectId, role: "translator" }); } catch {}
                }
                queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
                toast({ title: "Bulk unassign complete" });
                setCheckedKeys(new Set());
              }}
            >
              <UserX className="w-3 h-3 mr-1" />
              Unassign TR
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs border-white/10"
              onClick={() => { setCheckedKeys(new Set()); setBulkMode(null); setShowBulkComplete(false); setShowBatchDeadline(false); }}
            >
              Clear
            </Button>
            {/* Feature 4: Batch deadline popover */}
            {showBatchDeadline && (
              <div className="absolute top-full left-0 mt-1 z-20 bg-card border border-white/[0.08] rounded-lg shadow-xl shadow-black/30 p-3 w-80">
                <p className="text-xs font-semibold mb-2">Set Deadline for {checkedKeys.size} tasks</p>
                <div className="space-y-2">
                  <input
                    type="datetime-local"
                    value={batchDeadlineValue}
                    onChange={(e) => setBatchDeadlineValue(e.target.value)}
                    className="w-full h-8 px-2 text-xs rounded-md border border-white/[0.08] bg-background/50 text-foreground focus:ring-1 focus:ring-primary/40 focus:border-primary/40"
                    data-testid="input-batch-deadline"
                  />
                  {batchDeadlineValue && (
                    <p className="text-[10px] text-muted-foreground">{formatDeadlineDisplay(batchDeadlineValue)}</p>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs w-full border-white/[0.08]"
                    onClick={() => {
                      if (!tasks) return;
                      const checkedTasks = tasks.filter(t => checkedKeys.has(taskKey(t)));
                      const wwcValues = checkedTasks.map(t => parseFloat((t.wwc || "0").replace(/[^\d.,]/g, "").replace(",", "."))).filter(v => v > 0);
                      if (wwcValues.length === 0) return;
                      const avgWwc = wwcValues.reduce((a, b) => a + b, 0) / wwcValues.length;
                      const suggested = suggestDeadline(avgWwc.toString());
                      if (suggested) setBatchDeadlineValue(suggested);
                    }}
                    data-testid="button-suggest-batch-deadline"
                  >
                    <Clock className="w-3 h-3 mr-1" />
                    Suggest from avg WWC
                  </Button>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="h-7 text-xs bg-purple-600 hover:bg-purple-700"
                      disabled={!batchDeadlineValue || batchDeadlineMutation.isPending}
                      onClick={() => batchDeadlineMutation.mutate()}
                      data-testid="button-apply-batch-deadline"
                    >
                      {batchDeadlineMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                      Apply
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowBatchDeadline(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            )}
            {showBulkComplete && (
              <div className="absolute top-full left-0 mt-1 z-20 bg-card border border-white/[0.08] rounded-lg shadow-xl shadow-black/30 p-3 w-72">
                <p className="text-xs font-semibold mb-2">Bulk Complete {checkedKeys.size} tasks</p>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input type="radio" name="bulkCompleteMode" checked={bulkCompleteMode === "yes"} onChange={() => setBulkCompleteMode("yes")} />
                      Mark as Yes
                    </label>
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input type="radio" name="bulkCompleteMode" checked={bulkCompleteMode === "minutes"} onChange={() => setBulkCompleteMode("minutes")} />
                      Distribute minutes
                    </label>
                  </div>
                  {bulkCompleteMode === "minutes" && (
                    <Input
                      type="number"
                      value={bulkCompleteMinutes}
                      onChange={(e) => setBulkCompleteMinutes(e.target.value)}
                      placeholder="Total minutes to split evenly..."
                      className="h-7 text-xs"
                    />
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="h-7 text-xs bg-green-600 hover:bg-green-700"
                      disabled={bulkCompleteMode === "minutes" && !bulkCompleteMinutes || bulkCompleteMutation.isPending}
                      onClick={() => bulkCompleteMutation.mutate()}
                    >
                      {bulkCompleteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                      Confirm
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowBulkComplete(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            )}
        </div>
      )}

      {/* Filters — integrated filter bar with T2.7 responsive + T2.8 Group By */}
      {!hasChecked && (
        <div className="border-b border-white/[0.06] bg-card/50 backdrop-blur-sm px-4 py-2">
          {/* Mobile: compact filter row with toggle */}
          <div className="flex items-center gap-2 md:gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[140px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                placeholder={isMobile ? "Search..." : "Search by project ID, account, translator..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-8 text-sm bg-background/50 border-white/[0.08]"
                data-testid="input-search"
              />
            </div>
            {/* Mobile: filter toggle button */}
            {isMobile && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2 text-xs border-white/[0.08]"
                onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
                data-testid="button-mobile-filters"
              >
                <Filter className="w-3.5 h-3.5" />
              </Button>
            )}
            {/* Desktop filter controls (always visible) / Mobile (collapsible) */}
            {(!isMobile || mobileFiltersOpen) && (
              <>
                <Select value={sourceFilter} onValueChange={setSourceFilter}>
                  <SelectTrigger className="w-32 h-8 text-sm bg-background/50 border-white/[0.08]" data-testid="select-source">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sources</SelectItem>
                    {uniqueSources.map((src) => (
                      <SelectItem key={src} value={src}>{src}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={accountFilter} onValueChange={setAccountFilter}>
                  <SelectTrigger className="w-40 h-8 text-sm bg-background/50 border-white/[0.08]" data-testid="select-account">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Accounts</SelectItem>
                    {uniqueAccounts.map((acct) => (
                      <SelectItem key={acct} value={acct}>{acct}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={langFilter} onValueChange={setLangFilter}>
                  <SelectTrigger className="w-28 h-8 text-sm bg-background/50 border-white/[0.08]" data-testid="select-lang">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Langs</SelectItem>
                    {uniqueLangPairs.map(lp => (
                      <SelectItem key={lp} value={lp}>{lp}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* T2.8: Group By dropdown */}
                <Select value={groupBy} onValueChange={(v) => { setGroupBy(v as any); setCollapsedGroups(new Set()); }}>
                  <SelectTrigger className="w-32 h-8 text-sm bg-background/50 border-white/[0.08]" data-testid="select-group-by">
                    <SelectValue placeholder="Group by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Grouping</SelectItem>
                    <SelectItem value="account">Account</SelectItem>
                    <SelectItem value="source">Source</SelectItem>
                    <SelectItem value="deadline">Deadline Date</SelectItem>
                  </SelectContent>
                </Select>
                <button
                  onClick={() => setMyProjectsOnly(!myProjectsOnly)}
                  className={`h-8 px-3 text-xs rounded-md border transition-all duration-150 ${
                    myProjectsOnly
                      ? "bg-primary/15 text-primary border-primary/30 shadow-sm shadow-primary/10"
                      : "bg-background/30 text-muted-foreground border-white/[0.08] hover:bg-white/[0.04] hover:border-white/[0.12]"
                  }`}
                  data-testid="toggle-my-projects"
                >
                  My Projects
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => saveDefaultsMutation.mutate()}
                  disabled={saveDefaultsMutation.isPending}
                  title="Save current filters (status, source, account, my projects) as your default view"
                  data-testid="button-save-defaults"
                >
                  {saveDefaultsMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span className="ml-1 hidden sm:inline">Save as Default</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={handleExportXlsx}
                  disabled={exporting || filteredTasks.length === 0}
                  title="Export filtered tasks to XLSX"
                  data-testid="button-export-xlsx"
                >
                  {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
                  <span className="ml-1 hidden sm:inline">Export</span>
                </Button>
              </>
            )}
            <span className="text-xs text-muted-foreground ml-auto tabular-nums">
              {filteredTasks.length} tasks
            </span>
          </div>
        </div>
      )}

      {/* Split panel */}
      <div className={`flex-1 flex overflow-hidden ${isMobile ? 'flex-col' : ''}`}>
        {/* Left: Task table */}
        <div className={`flex-1 min-w-0 overflow-auto ${isMobile && (selectedTask || bulkMode) ? 'hidden' : ''}`}>
          {tasksLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(12)].map((_, i) => <Skeleton key={i} className="h-9 w-full rounded" />)}
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm" data-testid="text-no-tasks">
              No tasks found
            </div>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]" data-testid="table-tasks">
              <thead className="sticky top-0 bg-card/95 backdrop-blur-md z-10 border-b border-white/[0.06]">
                <tr>
                  <th className="w-10 px-2 py-2.5">
                    <Checkbox
                      checked={filteredTasks.length > 0 && checkedKeys.size === filteredTasks.length}
                      onCheckedChange={toggleAllVisible}
                      data-testid="checkbox-all"
                    />
                  </th>
                  <SortableHeader col="projectId" label="Project ID" sortCol={sortCol} sortDir={sortDir} setSortCol={setSortCol} setSortDir={setSortDir} />
                  <th className="text-left font-medium text-muted-foreground px-2 py-2.5 text-[11px] uppercase tracking-wider hidden md:table-cell">Source</th>
                  <SortableHeader col="account" label="Account" sortCol={sortCol} sortDir={sortDir} setSortCol={setSortCol} setSortDir={setSortDir} />
                  <th className="text-left font-medium text-muted-foreground px-2 py-2.5 text-[11px] uppercase tracking-wider hidden md:table-cell">TR</th>
                  <th className="text-left font-medium text-muted-foreground px-2 py-2.5 text-[11px] uppercase tracking-wider hidden md:table-cell">REV</th>
                  <SortableHeader col="deadline" label="Deadline" sortCol={sortCol} sortDir={sortDir} setSortCol={setSortCol} setSortDir={setSortDir} />
                  <SortableHeader col="total" label="Total" sortCol={sortCol} sortDir={sortDir} setSortCol={setSortCol} setSortDir={setSortDir} align="right" />
                  <SortableHeader col="wwc" label="WWC" sortCol={sortCol} sortDir={sortDir} setSortCol={setSortCol} setSortDir={setSortDir} align="right" />
                  <SortableHeader col="status" label="Status" sortCol={sortCol} sortDir={sortDir} setSortCol={setSortCol} setSortDir={setSortDir} />
                </tr>
              </thead>
              <tbody>
                {groupedTasks ? (
                  /* T2.8: Grouped rendering */
                  groupedTasks.map((group) => {
                    const isCollapsed = collapsedGroups.has(group.name);
                    return (
                      <Fragment key={`group-${group.name}`}>
                        <tr
                          className="bg-white/[0.03] border-b border-white/[0.06] cursor-pointer hover:bg-white/[0.05] transition-colors"
                          onClick={() => toggleGroupCollapse(group.name)}
                          data-testid={`group-header-${group.name}`}
                        >
                          <td colSpan={10} className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-150 ${isCollapsed ? '' : 'rotate-90'}`} />
                              <span className="text-xs font-semibold text-foreground">{group.name}</span>
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-white/[0.04] border border-white/[0.06]">
                                {group.tasks.length}
                              </Badge>
                            </div>
                          </td>
                        </tr>
                        {!isCollapsed && group.tasks.map((task, idx) => {
                          const key = taskKey(task);
                          const globalIdx = filteredTasks.indexOf(task);
                          return renderTaskRow(task, key, globalIdx, idx);
                        })}
                      </Fragment>
                    );
                  })
                ) : (
                  /* Flat list (no grouping) */
                  filteredTasks.slice(0, 300).map((task, idx) => {
                    const key = taskKey(task);
                    return renderTaskRow(task, key, idx, idx);
                  })
                )}
              </tbody>
            </table>
            </div>
          )}
          {filteredTasks.length > 300 && !groupedTasks && (
            <div className="text-center py-2 text-xs text-muted-foreground border-t border-white/[0.06]">
              Showing first 300 of {filteredTasks.length} results
            </div>
          )}
        </div>

        {/* Right: Slide-over detail + assign panel (T2.7: full-screen on mobile) */}
        {(selectedTask || bulkMode) && (
          <div className={`${
            isMobile
              ? 'fixed inset-0 z-40 bg-card flex flex-col'
              : 'w-[480px] shrink-0 border-l border-white/[0.06] bg-card/80 backdrop-blur-sm flex flex-col h-full animate-slide-in-right'
          }`}>
            {/* Single scroll container for everything */}
            <div className="flex-1 overflow-y-auto">
            {/* Task details header */}
            <div>
              {bulkMode && !selectedTask ? (
                /* Bulk mode header */
                <div className="p-4 border-b border-white/[0.06]">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm text-foreground">Bulk Assign</h3>
                      <Badge className={`text-[10px] ${bulkMode === "translator" ? "bg-orange-500/15 text-orange-400 border-orange-500/20" : "bg-blue-500/15 text-blue-400 border-blue-500/20"}`}>
                        {checkedKeys.size} tasks · {bulkMode === "translator" ? "Translator" : "Reviewer"}
                      </Badge>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setBulkMode(null)} data-testid="button-close-bulk" className="h-6 w-6 p-0 hover:bg-white/[0.06]">
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Assigning {bulkMode === "translator" ? "translator" : "reviewer"} to {checkedKeys.size} selected tasks.
                    {bulkSources.length > 1 && (
                      <span className="block mt-1 text-amber-400">
                        Multiple sources selected ({bulkSources.join(", ")}). Showing freelancers matching all sources.
                      </span>
                    )}
                  </p>
                </div>
              ) : selectedTask ? (
                /* Single task header */
                <>
                  <div className="p-4 border-b border-white/[0.06]">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-sm text-foreground">{selectedTask.projectId}</h3>
                        {(() => {
                          const sheetUrl = getSheetUrl(sheetConfigs as SheetConfig[] | undefined, selectedTask.source, selectedTask.sheet);
                          return sheetUrl ? (
                            <a href={sheetUrl} target="_blank" rel="noopener noreferrer" title="Open Google Sheet">
                              <Badge variant="secondary" className="text-[10px] bg-white/[0.04] border border-white/[0.06] hover:bg-blue-500/10 hover:border-blue-500/20 cursor-pointer transition-colors">
                                {selectedTask.source}/{selectedTask.sheet} <ExternalLink className="w-2.5 h-2.5 ml-0.5 inline opacity-40" />
                              </Badge>
                            </a>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] bg-white/[0.04] border border-white/[0.06]">{selectedTask.source}/{selectedTask.sheet}</Badge>
                          );
                        })()}
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedTaskKey(null)} data-testid="button-close-panel" className="h-6 w-6 p-0 hover:bg-white/[0.06]">
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    {selectedTask.projectTitle && (
                      <p className="text-xs text-muted-foreground mb-2">{selectedTask.projectTitle}</p>
                    )}

                    {/* Task details grid — card section */}
                    <div className="grid grid-cols-3 gap-x-3 gap-y-2 text-xs mt-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                      <DetailItem label="Account" value={selectedTask.account} />
                      <DetailItem label="TR Deadline" value={selectedTask.deadline || "—"} />
                      <DetailItem label="Client DL" value={selectedTask.revDeadline || "—"} />
                      <DetailItem label="Rev Type" value={selectedTask.revType || "—"} />
                      <DetailItem label="TR" value={selectedTask.translator || "—"} />
                      <DetailItem label="REV" value={selectedTask.reviewer || "—"} />
                      <DetailItem label="TR Done" value={selectedTask.trDone || "—"} />
                    </div>

                    {/* HO Note - yellow highlight */}
                    {selectedTask.hoNote && (
                      <div className="mt-3 p-2.5 rounded-lg bg-amber-500/[0.08] border border-amber-500/20 text-xs text-amber-300">
                        <span className="font-semibold">HO Note: </span>{selectedTask.hoNote}
                      </div>
                    )}

                    {/* Instructions (collapsible) */}
                    {selectedTask.instructions && (
                      <div className="mt-2">
                        <button
                          onClick={() => setShowInstructions(!showInstructions)}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <ChevronRight className={`w-3 h-3 transition-transform duration-150 ${showInstructions ? "rotate-90" : ""}`} />
                          Instructions
                        </button>
                        {showInstructions && (
                          <p className="mt-1 text-xs text-muted-foreground pl-4">{selectedTask.instructions}</p>
                        )}
                      </div>
                    )}

                    {/* Notes */}
                    {(selectedTask.trHbNote || selectedTask.revHbNote || selectedTask.lqi) && (
                      <div className="mt-2 pt-2 border-t border-white/[0.04]">
                        {selectedTask.trHbNote && (
                          <p className="text-[10px] text-muted-foreground"><span className="font-medium text-muted-foreground/80">TR HB:</span> {selectedTask.trHbNote}</p>
                        )}
                        {selectedTask.revHbNote && (
                          <p className="text-[10px] text-muted-foreground"><span className="font-medium text-muted-foreground/80">Rev HB:</span> {selectedTask.revHbNote}</p>
                        )}
                        {selectedTask.lqi && (
                          <p className="text-[10px] text-muted-foreground"><span className="font-medium text-muted-foreground/80">LQI:</span> {selectedTask.lqi}</p>
                        )}
                      </div>
                    )}

                    {/* PM Internal Notes */}
                    <div className="mt-3">
                      <button
                        onClick={() => setNoteExpanded(!noteExpanded)}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        data-testid="button-toggle-notes"
                      >
                        <ChevronRight className={`w-3 h-3 transition-transform duration-150 ${noteExpanded ? "rotate-90" : ""}`} />
                        <StickyNote className="w-3 h-3" />
                        PM Notes
                        {editingNote && <span className="text-amber-400/70 ml-1">•</span>}
                      </button>
                      {noteExpanded && (
                        <div className="mt-1.5 pl-4 space-y-1.5">
                          <Textarea
                            value={editingNote}
                            onChange={(e) => setEditingNote(e.target.value)}
                            placeholder="Add internal notes for this task..."
                            className="text-xs min-h-[60px] bg-background/50 border-white/[0.08]"
                            data-testid="textarea-pm-note"
                          />
                          <Button
                            size="sm"
                            className="h-6 text-[10px] px-2"
                            disabled={saveNoteMutation.isPending}
                            onClick={() => {
                              if (selectedTask) {
                                saveNoteMutation.mutate({
                                  source: selectedTask.source,
                                  sheet: selectedTask.sheet,
                                  projectId: selectedTask.projectId,
                                  note: editingNote,
                                });
                              }
                            }}
                            data-testid="button-save-note"
                          >
                            {saveNoteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3 mr-0.5" />}
                            Save Note
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Project Complete button */}
                    {canComplete && (
                      <div className="mt-3">
                        {!showComplete ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs text-green-400 border-green-500/20 hover:bg-green-500/10"
                            onClick={() => setShowComplete(true)}
                          >
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Mark Complete
                          </Button>
                        ) : (
                          <div className="p-2.5 rounded-lg bg-green-500/[0.06] border border-green-500/15 space-y-2">
                            <div className="flex items-center gap-3">
                              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                                <input type="radio" name="completeMode" checked={completeMode === "yes"} onChange={() => setCompleteMode("yes")} />
                                Mark as Yes
                              </label>
                              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                                <input type="radio" name="completeMode" checked={completeMode === "minutes"} onChange={() => setCompleteMode("minutes")} />
                                Enter time (minutes)
                              </label>
                            </div>
                            {completeMode === "minutes" && (
                              <Input
                                type="number"
                                value={completeMinutes}
                                onChange={(e) => setCompleteMinutes(e.target.value)}
                                placeholder="Minutes..."
                                className="h-7 text-xs w-32"
                              />
                            )}
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                className="h-7 text-xs bg-green-600 hover:bg-green-700"
                                disabled={completeMode === "minutes" && !completeMinutes || completeMutation.isPending}
                                onClick={() => completeMutation.mutate()}
                              >
                                {completeMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                                Confirm
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowComplete(false)}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* CAT Analysis */}
                  {selectedTask.catCounts && catSum(selectedTask.catCounts) > 0 && (
                    <div className="px-4 py-3 border-b border-white/[0.06]">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">CAT Analysis</p>
                      <div className="flex flex-wrap gap-1">
                        {([
                          ["ICE", selectedTask.catCounts.ice],
                          ["Rep", selectedTask.catCounts.rep],
                          ["100%", selectedTask.catCounts.match100],
                          ["95-99", selectedTask.catCounts.fuzzy95],
                          ["85-94", selectedTask.catCounts.fuzzy85],
                          ["75-84", selectedTask.catCounts.fuzzy75],
                          ["NM", selectedTask.catCounts.noMatch],
                          ["MT", selectedTask.catCounts.mt],
                        ] as [string, string][]).filter(([, v]) => parseInt(v) > 0).map(([label, value]) => (
                          <span key={label} className="inline-flex items-center gap-1 bg-white/[0.04] border border-white/[0.06] rounded px-1.5 py-0.5 text-[10px]">
                            <span className="text-muted-foreground">{label}:</span>
                            <span className="font-medium text-foreground tabular-nums">{value}</span>
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-3 mt-1.5 text-[10px]">
                        <span className="text-muted-foreground">Total: <span className="font-semibold text-foreground">{selectedTask.total}</span></span>
                        <span className="text-muted-foreground">WWC: <span className="font-semibold text-foreground">{selectedTask.wwc}</span></span>
                      </div>
                    </div>
                  )}

                  {/* Symfonie Link */}
                  {selectedTask.symfonieLink && (
                    <div className="px-4 py-2.5 border-b border-white/[0.06]">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Symfonie</p>
                      <a
                        href={selectedTask.symfonieLink.startsWith("http") ? selectedTask.symfonieLink : `https://${selectedTask.symfonieLink}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2 break-all"
                      >
                        {selectedTask.symfonieLink}
                      </a>
                    </div>
                  )}
                </>
              ) : null}
            </div>

            {/* T2.2: Assignment History Timeline */}
            {selectedTask && taskAssignments.length > 0 && (
              <div className="p-4 border-b border-white/[0.06]">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Assignment Timeline</p>
                <div className="relative pl-4">
                  {/* Connecting line */}
                  <div className="absolute left-[7px] top-1 bottom-1 w-[2px] bg-white/[0.08]" />
                  {taskAssignments.flatMap(asgn =>
                    (asgn.offers || []).sort((a, b) => (a.sequenceOrder ?? 999) - (b.sequenceOrder ?? 999)).map(offer => ({
                      ...offer,
                      role: asgn.role,
                      assignmentType: asgn.assignmentType,
                    }))
                  ).map((offer, i) => {
                    const statusColors: Record<string, string> = {
                      accepted: "bg-green-400 shadow-green-400/30",
                      rejected: "bg-red-400 shadow-red-400/30",
                      withdrawn: "bg-red-400 shadow-red-400/30",
                      pending: "bg-amber-400 shadow-amber-400/30",
                      offered: "bg-amber-400 shadow-amber-400/30",
                      completed: "bg-blue-400 shadow-blue-400/30",
                    };
                    const dotColor = statusColors[offer.status] || "bg-gray-400";
                    return (
                      <div key={`tl-${offer.id}-${i}`} className="relative flex items-start gap-3 mb-3 last:mb-0" data-testid={`timeline-item-${offer.id}`}>
                        <div className={`w-3 h-3 rounded-full ${dotColor} shadow-sm shrink-0 mt-0.5 ring-2 ring-card`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-medium text-foreground">
                              Offered {offer.role === "translator" ? "TR" : "REV"} to {offer.freelancerName}
                            </span>
                            <span className="text-[10px] text-muted-foreground">({offer.freelancerCode})</span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <OfferStatusBadge status={offer.status} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Status view OR assignment controls */}
            {isFullyAssigned && selectedTask && !bulkMode ? (
              /* ── Status View for fully assigned tasks ── */
              <div>
                <div className="p-4 space-y-3">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Active Assignments</p>

                  {taskAssignments.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">No assignments found for this task.</p>
                  ) : (
                    <div className="space-y-3">
                      {taskAssignments.map((asgn) => (
                        <div key={asgn.id} className="border border-white/[0.06] rounded-lg p-3 space-y-2 bg-white/[0.02]">
                          <div className="flex items-center gap-2">
                            <Badge className={`text-[10px] px-1.5 py-0 ${asgn.role === "translator" ? "bg-orange-500/15 text-orange-400 border-orange-500/20" : "bg-blue-500/15 text-blue-400 border-blue-500/20"}`}>
                              {asgn.role === "translator" ? "Translator" : "Reviewer"}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">
                              {asgn.assignmentType === "direct" ? "Direct" : asgn.assignmentType === "sequence" ? "Sequential" : "Broadcast"}
                            </span>
                            <OfferStatusBadge status={asgn.status} />
                          </div>

                          {/* Offers list */}
                          <div className="space-y-1 pl-1">
                            {(asgn.offers || [])
                              .sort((a, b) => (a.sequenceOrder ?? 999) - (b.sequenceOrder ?? 999))
                              .map((offer, oi) => (
                              <div key={offer.id} className="flex items-center gap-2 text-xs">
                                <span className="text-muted-foreground w-4 text-right shrink-0">{oi + 1}.</span>
                                <span className="font-medium text-foreground">{offer.freelancerName}</span>
                                <span className="text-muted-foreground">({offer.freelancerCode})</span>
                                <OfferStatusBadge status={offer.status} />
                                {offer.status === "pending" && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-5 text-[10px] px-1.5 text-muted-foreground hover:text-destructive ml-auto"
                                    disabled={withdrawOfferMutation.isPending}
                                    onClick={() => withdrawOfferMutation.mutate(offer.id)}
                                  >
                                    <XCircle className="w-3 h-3 mr-0.5" />
                                    Withdraw
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>

                          {/* Cancel assignment button */}
                          {asgn.status !== "completed" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 text-[10px] text-destructive border-destructive/20 hover:bg-destructive/10"
                              disabled={cancelAssignmentMutation.isPending}
                              onClick={() => cancelAssignmentMutation.mutate(asgn.id)}
                            >
                              {cancelAssignmentMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Ban className="w-3 h-3 mr-1" />}
                              Cancel Assignment
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Unassign buttons */}
                {selectedTask && (
                  <div className="p-4 border-t border-white/[0.06] space-y-2">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Unassign</p>
                    <div className="flex gap-2">
                      {selectedTask.translator && selectedTask.translator.trim() && !isXX(selectedTask.translator) && !isRevCompleted(selectedTask) && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 h-7 text-[10px] text-orange-400 border-orange-500/20 hover:bg-orange-500/10"
                          disabled={unassignMutation.isPending}
                          onClick={() => unassignMutation.mutate({ role: "translator" })}
                        >
                          {unassignMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <UserX className="w-3 h-3 mr-1" />}
                          TR: {selectedTask.translator}
                        </Button>
                      )}
                      {selectedTask.reviewer && selectedTask.reviewer.trim() && !isXX(selectedTask.reviewer) && !isRevCompleted(selectedTask) && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 h-7 text-[10px] text-blue-400 border-blue-500/20 hover:bg-blue-500/10"
                          disabled={unassignMutation.isPending}
                          onClick={() => unassignMutation.mutate({ role: "reviewer" })}
                        >
                          {unassignMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <UserX className="w-3 h-3 mr-1" />}
                          REV: {selectedTask.reviewer}
                        </Button>
                      )}
                    </div>
                    <p className="text-[9px] text-muted-foreground/60">Writes XX to sheet and cancels dispatch assignment</p>
                  </div>
                )}
              </div>
            ) : (
              /* ── Assignment Form ── */
              <div>
              {/* Assignment config (compact) */}
              <div className="p-3 border-b border-white/[0.06] space-y-2 shrink-0">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Assignment</p>

                {/* Assign to Me button (single task only) */}
                {selectedTask && !bulkMode && (needsTranslator(selectedTask) || needsReviewer(selectedTask)) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs w-full border-primary/20 text-primary hover:bg-primary/10"
                    disabled={selfAssignMutation.isPending}
                    onClick={() => selfAssignMutation.mutate()}
                    data-testid="button-assign-to-me"
                  >
                    {selfAssignMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <UserCheck className="w-3 h-3 mr-1" />}
                    Assign to Me ({role === "translator" ? "TR" : "REV"})
                  </Button>
                )}

                {/* Skip email toggle (confirmed assign) */}
                {selectedTask && !bulkMode && (
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={skipEmail}
                      onChange={(e) => setSkipEmail(e.target.checked)}
                      className="rounded border-border"
                    />
                    <span className="text-muted-foreground">Already confirmed (skip email)</span>
                  </label>
                )}

                {/* Presets */}
                {rolePresets.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <ListOrdered className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="text-[10px] text-muted-foreground shrink-0">Presets:</span>
                    {rolePresets.map(p => (
                      <div key={p.id} className="flex items-center gap-0.5">
                        <button
                          onClick={() => loadPreset(p)}
                          className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-xs text-foreground hover:bg-white/[0.08] transition-colors"
                        >
                          {p.name}
                        </button>
                        <button
                          onClick={() => deletePresetMutation.mutate(p.id)}
                          className="text-muted-foreground hover:text-destructive p-0"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Current TR/REV (single task only) */}
                {selectedTask && !bulkMode && (
                  <div className="flex gap-4 text-xs">
                    <span className="text-muted-foreground">
                      Current TR: <span className="font-medium text-foreground">{selectedTask.translator || "—"}</span>
                    </span>
                    <span className="text-muted-foreground">
                      Current REV: <span className="font-medium text-foreground">{selectedTask.reviewer || "—"}</span>
                    </span>
                  </div>
                )}

                {/* Role toggle (hidden in bulk mode since role is pre-set) */}
                {!bulkMode && (
                  <div className="flex items-center gap-3">
                    <label className="text-xs font-medium text-muted-foreground w-10">Role</label>
                    <div className="flex gap-1">
                      <TogglePill
                        active={role === "translator"}
                        onClick={() => setRole("translator")}
                        color="orange"
                        data-testid="button-role-translator"
                      >
                        Translator
                      </TogglePill>
                      <TogglePill
                        active={role === "reviewer"}
                        onClick={() => setRole("reviewer")}
                        color="blue"
                        data-testid="button-role-reviewer"
                      >
                        Reviewer
                      </TogglePill>
                    </div>
                  </div>
                )}

                {/* Type toggle */}
                <div className="flex items-center gap-3">
                  <label className="text-xs font-medium text-muted-foreground w-10">Type</label>
                  <div className="flex gap-1">
                    {(["direct", "sequence", "broadcast"] as const).map((t) => (
                      <TogglePill
                        key={t}
                        active={assignmentType === t}
                        onClick={() => {
                          setAssignmentType(t);
                          if (t === "direct") setSelectedFreelancers((prev) => prev.slice(0, 1));
                        }}
                        color="primary"
                        data-testid={`button-type-${t}`}
                      >
                        {t === "direct" ? "Direct" : t === "sequence" ? "Sequential" : "Broadcast"}
                      </TogglePill>
                    ))}
                  </div>
                </div>

                {/* Review Type selector — always visible */}
                <div className="flex items-center gap-3">
                  <label className="text-xs font-medium text-muted-foreground w-10">Rev</label>
                  <div className="flex gap-1">
                    {(["Full Review", "Self-Edit", "LQA", "QA"] as const).map((rt) => (
                      <TogglePill
                        key={rt}
                        active={reviewType === rt}
                        onClick={() => {
                          if (reviewType === rt) {
                            setReviewType("Full Review");
                          } else {
                            setReviewType(rt);
                            if (rt === "Self-Edit" && !bulkMode) {
                              setRole("reviewer");
                            }
                          }
                        }}
                        color="purple"
                        data-testid={`button-revtype-${rt.toLowerCase().replace(" ", "-")}`}
                      >
                        {rt}
                      </TogglePill>
                    ))}
                  </div>
                </div>

                {/* TR Deadline input — shown when task has no TR deadline */}
                {selectedTask && !bulkMode && !selectedTask.deadline && role === "translator" && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-muted-foreground">TR Deadline</label>
                      {selectedTask.wwc && !customDeadline && (
                        <button
                          onClick={() => setCustomDeadline(suggestDeadline(selectedTask.wwc, selectedTask.revDeadline))}
                          className="text-[10px] text-primary hover:text-primary/80 transition-colors"
                          data-testid="button-suggest-deadline"
                        >
                          <Clock className="w-3 h-3 inline mr-0.5" />
                          Suggest from WWC
                        </button>
                      )}
                    </div>
                    <input
                      type="datetime-local"
                      value={customDeadline}
                      onChange={(e) => setCustomDeadline(e.target.value)}
                      className="w-full h-8 px-2 text-xs rounded-md border border-white/[0.08] bg-background/50 text-foreground focus:ring-1 focus:ring-primary/40 focus:border-primary/40"
                      data-testid="input-custom-deadline"
                    />
                    {customDeadline && (
                      <p className="text-[10px] text-muted-foreground">
                        {formatDeadlineDisplay(customDeadline)}
                        {selectedTask.wwc && (
                          <span className="text-muted-foreground/60"> · {selectedTask.wwc} WWC ≈ {Math.ceil(parseFloat((selectedTask.wwc || "0").replace(/[^\d.,]/g, "").replace(",", ".")) / 300 * 10) / 10}h @ 300w/h</span>
                        )}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Selected freelancers chips */}
              {selectedFreelancers.length > 0 && (
                <div className="px-4 py-2 border-b border-white/[0.06] shrink-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="text-[10px] font-medium text-muted-foreground">
                      Selected ({selectedFreelancers.length})
                    </div>
                    <button
                      onClick={() => { setShowSavePreset(!showSavePreset); }}
                      className="flex items-center gap-1 text-[10px] text-primary hover:underline"
                    >
                      <Save className="w-3 h-3" />
                      Save as preset
                    </button>
                  </div>
                  {showSavePreset && (
                    <div className="flex items-center gap-1.5 mb-2">
                      <Input
                        value={presetName}
                        onChange={(e) => setPresetName(e.target.value)}
                        placeholder="Preset name..."
                        className="h-6 text-xs flex-1"
                      />
                      <Button
                        size="sm"
                        className="h-6 text-[10px] px-2"
                        disabled={!presetName || savePresetMutation.isPending}
                        onClick={() => savePresetMutation.mutate()}
                      >
                        {savePresetMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
                      </Button>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {selectedFreelancers.map((f, idx) => (
                      <div
                        key={f.id}
                        draggable={assignmentType === "sequence" && selectedFreelancers.length > 1}
                        onDragStart={() => handleDragStart(idx)}
                        onDragOver={(e) => handleDragOver(e, idx)}
                        onDrop={() => handleDrop(idx)}
                        onDragEnd={handleDragEnd}
                        className={`flex items-center gap-1 bg-white/[0.04] border rounded-md px-2 py-0.5 text-xs transition-all ${
                          dragIdx === idx ? 'opacity-40 border-white/[0.06]' : dropIdx === idx && dragIdx !== null ? 'border-blue-400 border-l-2' : 'border-white/[0.06]'
                        } ${assignmentType === "sequence" && selectedFreelancers.length > 1 ? 'cursor-grab active:cursor-grabbing' : ''}`}
                        data-testid={`chip-${f.resourceCode}`}
                      >
                        {assignmentType === "sequence" && selectedFreelancers.length > 1 && (
                          <GripVertical className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                        )}
                        {assignmentType === "sequence" && (
                          <span className="text-muted-foreground font-medium">{idx + 1}.</span>
                        )}
                        <span className="font-medium text-foreground">{f.fullName.split(" ")[0]}</span>
                        <span className="text-muted-foreground">{f.resourceCode}</span>
                        {assignmentType === "sequence" && selectedFreelancers.length > 1 && (
                          <>
                            <button onClick={(e) => { e.stopPropagation(); moveFreelancer(idx, "up"); }} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0">
                              <ChevronUp className="w-3 h-3" />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); moveFreelancer(idx, "down"); }} disabled={idx === selectedFreelancers.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0">
                              <ChevronDown className="w-3 h-3" />
                            </button>
                          </>
                        )}
                        <button onClick={() => removeFreelancer(f.id)} className="text-muted-foreground hover:text-destructive p-0" data-testid={`remove-${f.resourceCode}`}>
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Email preview/edit */}
              <div className="px-4 py-2 border-b border-white/[0.06] shrink-0">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Email Template</p>
                  <div className="flex items-center gap-2">
                    {editingEmail && (
                      <button
                        onClick={() => setEmailPreviewMode(!emailPreviewMode)}
                        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                      >
                        {emailPreviewMode ? <Code className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        {emailPreviewMode ? "Source" : "Preview"}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (!editingEmail && currentTemplate) {
                          setCustomSubject(currentTemplate.subject);
                          setCustomBody(currentTemplate.body);
                        }
                        setEditingEmail(!editingEmail);
                        setEmailPreviewMode(false);
                      }}
                      className="flex items-center gap-1 text-[10px] text-primary hover:underline"
                    >
                      <Pencil className="w-3 h-3" />
                      {editingEmail ? "Cancel" : "Edit email"}
                    </button>
                  </div>
                </div>
                {editingEmail ? (
                  <VisualEmailEditor
                    subject={customSubject}
                    body={customBody}
                    onSubjectChange={setCustomSubject}
                    onBodyChange={setCustomBody}
                    compact
                  />
                ) : (
                  <div className="text-xs text-muted-foreground">
                    {currentTemplate ? (
                      <>
                        <p className="font-medium text-foreground text-[11px]">{currentTemplate.subject}</p>
                        <p className="mt-0.5 truncate">{currentTemplate.body.replace(/<[^>]*>/g, "").slice(0, 80)}...</p>
                      </>
                    ) : (
                      <p>Default template will be used.</p>
                    )}
                  </div>
                )}
              </div>

              {/* Freelancer search + list */}
              <div>
                <div className="p-3 sticky top-0 bg-card/95 backdrop-blur-md z-10 border-b border-white/[0.06]">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search freelancers..."
                      value={freelancerSearch}
                      onChange={(e) => setFreelancerSearch(e.target.value)}
                      className="pl-8 h-7 text-xs bg-background/50 border-white/[0.08]"
                      data-testid="input-freelancer-search"
                    />
                  </div>
                  {selectedTask && (
                    <div className="flex items-center justify-between mt-1.5 gap-2">
                      <p className="text-[10px] text-muted-foreground">
                        {(selectedTask.languagePair || taskLangPair) ? (
                          <>{selectedTask.languagePair || taskLangPair}{" "}· {displayFreelancers.length} freelancer{displayFreelancers.length !== 1 ? "s" : ""}</>
                        ) : (
                          <>{displayFreelancers.length} freelancers</>
                        )}
                      </p>
                      {(ACCOUNT_MATCH[selectedTask.source] || SPECIALIZATION_MATCH[selectedTask.source]) && (
                        <button
                          onClick={() => setShowAllLangOnly(!showAllLangOnly)}
                          data-testid="button-toggle-all-lang"
                          className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                            showAllLangOnly
                              ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
                              : "bg-white/[0.03] text-muted-foreground border-white/[0.08] hover:border-white/[0.15]"
                          }`}
                        >
                          {showAllLangOnly ? "Showing all" : "Show all"}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {freelancersLoading ? (
                  <div className="p-3 space-y-2">
                    {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded" />)}
                  </div>
                ) : displayFreelancers.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">
                    No matching freelancers found.
                  </p>
                ) : (
                  <div className="divide-y divide-white/[0.03]">
                    {displayFreelancers.slice(0, 50).map((f) => {
                      const fStats = freelancerStats?.[f.resourceCode];
                      const fDeliveryStats = freelancerDeliveryStats?.[f.resourceCode];
                      const isFav = favoritesSet.has(f.resourceCode);
                      // ELTS quality data
                      const eltsQ = eltsQuality?.[f.resourceCode];
                      const eltsAcctQ = currentAccountName && eltsQ?.accounts?.[currentAccountName];
                      // Determine best QS to show: account-specific > general > sheet-based
                      const eltsQsVal = eltsAcctQ ? eltsAcctQ.qs : (eltsQ ? eltsQ.generalQs : null);
                      const eltsQsLabel = eltsAcctQ && currentAccountName ? currentAccountName : (eltsQ ? "ELTS" : null);
                      const eltsReportCount = eltsAcctQ ? eltsAcctQ.count : (eltsQ ? eltsQ.totalReports : null);
                      // ELTS availability
                      const fAvailDays = eltsAvailability?.[f.resourceCode];
                      const todayAvail = getAvailabilityToday(fAvailDays);
                      const isUnavailableToday = todayAvail?.status === "unavailable";
                      const isPartialToday = todayAvail?.status === "partially_available";
                      const upcomingOff = getUpcomingUnavailable(fAvailDays);
                      const availTooltip = formatAvailabilityTooltip(fAvailDays);
                      return (
                        <div
                          key={f.id}
                          className={`flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/[0.03] cursor-pointer transition-colors ${isFav ? 'bg-amber-500/[0.04]' : ''} ${isUnavailableToday ? 'opacity-60' : ''}`}
                          onClick={() => addFreelancer(f)}
                          data-testid={`freelancer-${f.resourceCode}`}
                        >
                          {/* Feature 2: Star icon for favorites */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFavoriteMutation.mutate(f.resourceCode);
                            }}
                            className={`shrink-0 p-0.5 transition-colors ${isFav ? 'text-amber-400 hover:text-amber-300' : 'text-muted-foreground/30 hover:text-amber-400/60'}`}
                            data-testid={`star-${f.resourceCode}`}
                          >
                            <Star className={`w-3.5 h-3.5 ${isFav ? 'fill-current' : ''}`} />
                          </button>
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary/20 to-blue-400/10 flex items-center justify-center text-[10px] font-medium text-primary/80 shrink-0 ring-1 ring-white/[0.06]">
                            {f.fullName?.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-medium text-foreground truncate">{f.fullName}</span>
                              <span className="text-[10px] text-muted-foreground">{f.resourceCode}</span>
                              {(f as any)._score >= 80 && displayFreelancers.indexOf(f) === 0 && (
                                <span className="text-[8px] px-1.5 py-0 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 font-semibold">Recommended</span>
                              )}
                              {fDeliveryStats && fDeliveryStats.avgWwcPerHour > 0 && (
                                <span className="text-[9px] px-1.5 py-0 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 tabular-nums" data-testid={`speed-badge-${f.resourceCode}`}>
                                  ~{Math.round(fDeliveryStats.avgWwcPerHour)} w/h
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                              <span>{f.languagePairs?.slice(0, 3).map((lp: any) => typeof lp === "string" ? lp : `${lp.source_language}>${lp.target_language}`).join(", ")}</span>
                              {fStats && (
                                <>
                                  <span className="text-muted-foreground/40">·</span>
                                  <span className="tabular-nums">{fStats.taskCount} tasks</span>
                                  {fStats.activeCount > 0 && (
                                    <span className="inline-flex items-center gap-0.5 px-1 py-0 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/15 text-[9px] tabular-nums">
                                      {fStats.activeCount} active{fStats.activeWwc > 0 ? ` · ${fStats.activeWwc >= 1000 ? `${(fStats.activeWwc/1000).toFixed(1)}K` : fStats.activeWwc} WWC` : ""}
                                    </span>
                                  )}
                                </>
                              )}
                              {/* ELTS quality badge */}
                              {eltsQsVal !== null && eltsQsVal !== undefined ? (
                                <>
                                  <span className="text-muted-foreground/40">·</span>
                                  <span
                                    className={`inline-flex items-center gap-0.5 px-1.5 py-0 rounded-full border text-[9px] tabular-nums font-medium ${getQsBadgeColor(eltsQsVal)}`}
                                    data-testid={`elts-qs-${f.resourceCode}`}
                                  >
                                    {eltsQsLabel}: {eltsQsVal.toFixed(1)}
                                    {eltsReportCount !== null && (
                                      <span className="text-[8px] font-normal opacity-70 ml-0.5">({eltsReportCount})</span>
                                    )}
                                  </span>
                                </>
                              ) : fStats?.avgQs !== null && fStats?.avgQs !== undefined ? (
                                <>
                                  <span className="text-muted-foreground/40">·</span>
                                  <span className="tabular-nums">QS: {fStats.avgQs}</span>
                                </>
                              ) : null}
                              {/* Availability indicator — clickable to open calendar */}
                              {isUnavailableToday && (
                                <>
                                  <span className="text-muted-foreground/40">·</span>
                                  <span
                                    className="inline-flex items-center gap-1 text-red-400 cursor-pointer hover:underline"
                                    title={availTooltip}
                                    data-testid={`avail-${f.resourceCode}`}
                                    onClick={(e) => { e.stopPropagation(); setCalendarFreelancer(f.resourceCode); setCalendarMonth({ year: new Date().getFullYear(), month: new Date().getMonth() }); }}
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
                                    Off today
                                  </span>
                                </>
                              )}
                              {isPartialToday && !isUnavailableToday && (
                                <>
                                  <span className="text-muted-foreground/40">·</span>
                                  <span
                                    className="inline-flex items-center gap-1 text-amber-400 cursor-pointer hover:underline"
                                    title={availTooltip}
                                    data-testid={`avail-${f.resourceCode}`}
                                    onClick={(e) => { e.stopPropagation(); setCalendarFreelancer(f.resourceCode); setCalendarMonth({ year: new Date().getFullYear(), month: new Date().getMonth() }); }}
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                                    {todayAvail?.hours}h today
                                  </span>
                                </>
                              )}
                              {!isUnavailableToday && !isPartialToday && upcomingOff && (
                                <>
                                  <span className="text-muted-foreground/40">·</span>
                                  <span
                                    className="inline-flex items-center gap-1 text-amber-400/70 cursor-pointer hover:underline"
                                    title={availTooltip}
                                    data-testid={`avail-upcoming-${f.resourceCode}`}
                                    onClick={(e) => { e.stopPropagation(); setCalendarFreelancer(f.resourceCode); setCalendarMonth({ year: new Date().getFullYear(), month: new Date().getMonth() }); }}
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400/60 inline-block" />
                                    Off {upcomingOff.start}{upcomingOff.start !== upcomingOff.end ? `-${upcomingOff.end}` : ""}
                                  </span>
                                </>
                              )}
                              {/* Calendar icon — always visible for PM to click */}
                              {!isUnavailableToday && !isPartialToday && !upcomingOff && (
                                <>
                                  <span className="text-muted-foreground/40">·</span>
                                  <span
                                    className="inline-flex items-center gap-1 text-muted-foreground/50 cursor-pointer hover:text-muted-foreground"
                                    data-testid={`avail-calendar-${f.resourceCode}`}
                                    onClick={(e) => { e.stopPropagation(); setCalendarFreelancer(f.resourceCode); setCalendarMonth({ year: new Date().getFullYear(), month: new Date().getMonth() }); }}
                                  >
                                    <CalendarClock className="w-3 h-3" />
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {displayFreelancers.length > 50 && (
                      <p className="text-[10px] text-muted-foreground text-center py-2">
                        Showing first 50 of {displayFreelancers.length}
                      </p>
                    )}
                  </div>
                )}
              </div>

              </div>
            )}
            </div>

            {/* Assign button — pinned at bottom, outside scroll */}
            {!(isFullyAssigned && selectedTask && !bulkMode) && (
              <div className="p-3 border-t border-white/[0.06] bg-card shrink-0 space-y-2">
                {/* Predicted delivery estimate */}
                {selectedTask && !bulkMode && selectedFreelancers.length > 0 && (() => {
                  const firstFreelancer = selectedFreelancers[0];
                  const dStats = freelancerDeliveryStats?.[firstFreelancer.resourceCode];
                  if (!dStats || dStats.avgWwcPerHour <= 0) return null;
                  const wwcNum = parseFloat((selectedTask.wwc || "0").replace(/[^\d.,]/g, "").replace(",", "."));
                  if (!wwcNum || wwcNum <= 0) return null;
                  const hoursNeeded = wwcNum / dStats.avgWwcPerHour;
                  const display = hoursNeeded < 1
                    ? `~${Math.round(hoursNeeded * 60)}min`
                    : `~${Math.round(hoursNeeded * 10) / 10}h`;
                  return (
                    <div className="text-xs text-emerald-400/80 flex items-center gap-1.5 px-1" data-testid="text-predicted-delivery">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Est. {display} to complete <span className="text-muted-foreground">({Math.round(dStats.avgWwcPerHour)} w/h × {wwcNum.toLocaleString()} WWC)</span></span>
                    </div>
                  );
                })()}
                {/* T2.6: Preview button */}
                {selectedTask && !bulkMode && !skipEmail && selectedFreelancers.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-7 text-xs border-white/[0.08] text-muted-foreground hover:text-foreground"
                    onClick={() => setShowEmailPreviewModal(true)}
                    data-testid="button-email-preview"
                  >
                    <Eye className="w-3.5 h-3.5 mr-1.5" />
                    Preview Email
                  </Button>
                )}
                {bulkMode ? (
                  <Button
                    className="w-full shadow-lg shadow-primary/20"
                    size="sm"
                    disabled={selectedFreelancers.length === 0 || bulkAssignMutation.isPending}
                    onClick={() => bulkAssignMutation.mutate()}
                    data-testid="button-bulk-assign"
                  >
                    {bulkAssignMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Assigning {checkedKeys.size} tasks...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Assign {bulkMode === "translator" ? "TR" : "REV"} to {checkedKeys.size} tasks ({selectedFreelancers.length})
                      </>
                    )}
                  </Button>
                ) : skipEmail ? (
                  <Button
                    className="w-full bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-900/20"
                    size="sm"
                    disabled={selectedFreelancers.length === 0 || confirmedAssignMutation.isPending}
                    onClick={() => confirmedAssignMutation.mutate()}
                    data-testid="button-assign-confirmed"
                  >
                    {confirmedAssignMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Assigning...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        Assign Confirmed ({selectedFreelancers.length}) — No email
                      </>
                    )}
                  </Button>
                ) : (
                  <Button
                    className="w-full shadow-lg shadow-primary/20"
                    size="sm"
                    disabled={selectedFreelancers.length === 0 || createMutation.isPending}
                    onClick={() => createMutation.mutate()}
                    data-testid="button-assign"
                  >
                    {createMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Assign {role === "translator" ? "TR" : "REV"} ({selectedFreelancers.length})
                      </>
                    )}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* T2.6: Email Preview Modal */}
      <Dialog open={showEmailPreviewModal} onOpenChange={setShowEmailPreviewModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col" data-testid="dialog-email-preview">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <Mail className="w-4 h-4" />
              Email Preview
            </DialogTitle>
            <DialogDescription className="text-xs">
              Preview the assignment email before sending
            </DialogDescription>
          </DialogHeader>
          {selectedTask && (
            <div className="flex-1 overflow-y-auto space-y-3">
              {/* Recipients */}
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Recipients</p>
                <div className="flex flex-wrap gap-1">
                  {selectedFreelancers.map(f => (
                    <Badge key={f.id} variant="secondary" className="text-xs bg-white/[0.04] border border-white/[0.06]">
                      {f.fullName} &lt;{f.email}&gt;
                    </Badge>
                  ))}
                </div>
              </div>
              {/* Subject */}
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Subject</p>
                <p className="text-sm font-medium text-foreground bg-white/[0.02] border border-white/[0.06] rounded-md px-3 py-2" data-testid="text-email-subject">
                  {replacePreviewVars(customSubject || currentTemplate?.subject || "Assignment Offer")}
                </p>
              </div>
              {/* Body */}
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Body</p>
                <div
                  className="bg-white text-black rounded-md p-4 text-sm max-h-[40vh] overflow-y-auto border border-white/[0.06]"
                  data-testid="text-email-body"
                >
                  {(() => {
                    const body = customBody || currentTemplate?.body || generateDefaultEmailBody(selectedTask, role, sampleVars);
                    const rendered = replacePreviewVars(body);
                    return <div dangerouslySetInnerHTML={{ __html: rendered }} />;
                  })()}
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="flex gap-2 pt-2 border-t border-white/[0.06]">
            <Button variant="outline" size="sm" onClick={() => setShowEmailPreviewModal(false)} data-testid="button-preview-cancel">
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={selectedFreelancers.length === 0 || createMutation.isPending}
              onClick={() => {
                setShowEmailPreviewModal(false);
                createMutation.mutate();
              }}
              data-testid="button-preview-send"
            >
              {createMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Send className="w-3.5 h-3.5 mr-1" />}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Availability Calendar Dialog ── */}
      <Dialog open={!!calendarFreelancer} onOpenChange={(open) => { if (!open) { setCalendarFreelancer(null); setEditingDay(null); } }}>
        <DialogContent className="max-w-lg" data-testid="availability-calendar-dialog">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">
              Availability — {calendarFreelancer}
              {freelancers?.find(f => f.resourceCode === calendarFreelancer)?.fullName
                ? ` (${freelancers.find(f => f.resourceCode === calendarFreelancer)!.fullName})`
                : ""}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">Click a day to add or edit availability.</DialogDescription>
          </DialogHeader>
          {(() => {
            const { year, month } = calendarMonth;
            const firstDay = new Date(year, month, 1);
            const lastDay = new Date(year, month + 1, 0);
            const startDow = firstDay.getDay(); // 0=Sun
            const daysInMonth = lastDay.getDate();
            const monthLabel = firstDay.toLocaleString("en-US", { month: "long", year: "numeric" });
            const fDays = calendarFreelancer ? (eltsAvailability?.[calendarFreelancer] || []) : [];
            const dayMap = new Map(fDays.map(d => [d.date, d]));

            const cells: (number | null)[] = [];
            for (let i = 0; i < startDow; i++) cells.push(null);
            for (let d = 1; d <= daysInMonth; d++) cells.push(d);
            while (cells.length % 7 !== 0) cells.push(null);

            const todayStr = new Date().toISOString().slice(0, 10);

            return (
              <div className="space-y-3">
                {/* Month nav */}
                <div className="flex items-center justify-between">
                  <Button variant="ghost" size="sm" onClick={() => setCalendarMonth(prev => {
                    const d = new Date(prev.year, prev.month - 1, 1);
                    return { year: d.getFullYear(), month: d.getMonth() };
                  })} data-testid="calendar-prev-month">
                    <ChevronUp className="w-4 h-4 -rotate-90" />
                  </Button>
                  <span className="text-sm font-medium text-foreground" data-testid="calendar-month-label">{monthLabel}</span>
                  <Button variant="ghost" size="sm" onClick={() => setCalendarMonth(prev => {
                    const d = new Date(prev.year, prev.month + 1, 1);
                    return { year: d.getFullYear(), month: d.getMonth() };
                  })} data-testid="calendar-next-month">
                    <ChevronUp className="w-4 h-4 rotate-90" />
                  </Button>
                </div>

                {/* Calendar grid */}
                <div className="grid grid-cols-7 gap-1 text-center">
                  {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(d => (
                    <div key={d} className="text-[10px] text-muted-foreground font-medium py-1">{d}</div>
                  ))}
                  {cells.map((day, idx) => {
                    if (day === null) return <div key={`e-${idx}`} />;
                    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                    const avail = dayMap.get(dateStr);
                    const isToday = dateStr === todayStr;
                    const isEditing = editingDay === dateStr;
                    let bgColor = "bg-transparent hover:bg-white/[0.04]";
                    let dotColor = "";
                    if (avail) {
                      if (avail.status === "unavailable") { bgColor = "bg-red-500/15 hover:bg-red-500/25"; dotColor = "bg-red-400"; }
                      else if (avail.status === "partially_available") { bgColor = "bg-amber-500/15 hover:bg-amber-500/25"; dotColor = "bg-amber-400"; }
                      else if (avail.status === "available") { bgColor = "bg-emerald-500/15 hover:bg-emerald-500/25"; dotColor = "bg-emerald-400"; }
                    }
                    return (
                      <button
                        key={dateStr}
                        className={`relative p-1.5 rounded-md text-xs cursor-pointer transition-colors ${bgColor} ${isToday ? "ring-1 ring-primary/50" : ""} ${isEditing ? "ring-2 ring-primary" : ""}`}
                        onClick={() => {
                          setEditingDay(dateStr);
                          if (avail) {
                            setEditDayStatus(avail.status);
                            setEditDayHours(avail.hours ? String(avail.hours) : "");
                            setEditDayNotes(avail.notes || "");
                          } else {
                            setEditDayStatus("unavailable");
                            setEditDayHours("");
                            setEditDayNotes("");
                          }
                        }}
                        data-testid={`cal-day-${dateStr}`}
                      >
                        <span className="text-foreground">{day}</span>
                        {dotColor && <span className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${dotColor}`} />}
                      </button>
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground justify-center">
                  <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" />Available</span>
                  <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" />Partial</span>
                  <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" />Unavailable</span>
                </div>

                {/* Edit form for selected day */}
                {editingDay && (
                  <div className="border border-white/[0.06] rounded-lg p-3 space-y-2.5 bg-muted/20" data-testid="avail-edit-form">
                    <p className="text-xs font-medium text-foreground">Edit: {editingDay}</p>
                    <div className="flex items-center gap-2">
                      <Select value={editDayStatus} onValueChange={setEditDayStatus}>
                        <SelectTrigger className="h-8 text-xs flex-1" data-testid="avail-status-select">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="available">Available</SelectItem>
                          <SelectItem value="partially_available">Partially Available</SelectItem>
                          <SelectItem value="unavailable">Unavailable</SelectItem>
                        </SelectContent>
                      </Select>
                      {editDayStatus === "partially_available" && (
                        <Input
                          type="number"
                          placeholder="Hours"
                          value={editDayHours}
                          onChange={e => setEditDayHours(e.target.value)}
                          className="h-8 w-20 text-xs"
                          data-testid="avail-hours-input"
                        />
                      )}
                    </div>
                    <Textarea
                      placeholder="Notes (optional)"
                      value={editDayNotes}
                      onChange={e => setEditDayNotes(e.target.value)}
                      className="text-xs min-h-[50px] resize-none"
                      data-testid="avail-notes-input"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1 h-7 text-xs"
                        disabled={savingAvail}
                        data-testid="avail-save-btn"
                        onClick={async () => {
                          if (!calendarFreelancer || !editingDay) return;
                          setSavingAvail(true);
                          try {
                            await apiRequest("POST", "/api/elts/availability", {
                              freelancerCode: calendarFreelancer,
                              date: editingDay,
                              status: editDayStatus,
                              hours: editDayHours ? parseFloat(editDayHours) : 0,
                              notes: editDayNotes,
                            });
                            queryClient.invalidateQueries({ queryKey: ["/api/elts/availability"] });
                            toast({ title: "Saved", description: `Availability for ${editingDay} updated.` });
                            setEditingDay(null);
                          } catch (err: any) {
                            toast({ title: "Error", description: err?.message || "Failed to save.", variant: "destructive" });
                          } finally {
                            setSavingAvail(false);
                          }
                        }}
                      >
                        {savingAvail ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}
                        Save
                      </Button>
                      {dayMap.has(editingDay) && (
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-7 text-xs"
                          disabled={savingAvail}
                          data-testid="avail-delete-btn"
                          onClick={async () => {
                            if (!calendarFreelancer || !editingDay) return;
                            setSavingAvail(true);
                            try {
                              await apiRequest("DELETE", `/api/elts/availability/${calendarFreelancer}/${editingDay}`);
                              queryClient.invalidateQueries({ queryKey: ["/api/elts/availability"] });
                              toast({ title: "Deleted", description: `Availability for ${editingDay} removed.` });
                              setEditingDay(null);
                            } catch (err: any) {
                              toast({ title: "Error", description: err?.message || "Failed to delete.", variant: "destructive" });
                            } finally {
                              setSavingAvail(false);
                            }
                          }}
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          Delete
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingDay(null)} data-testid="avail-cancel-btn">
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Helper: generate default email body for preview when no template is loaded
function generateDefaultEmailBody(task: Task, role: string, vars: Record<string, string>): string {
  return `
    <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;">
      <tr>
        <td style="padding:16px;">
          <p>Dear {{freelancerName}},</p>
          <p>We would like to offer you a <strong>${role === "translator" ? "Translation" : "Review"}</strong> assignment:</p>
          <table style="width:100%;border:1px solid #e0e0e0;border-collapse:collapse;margin:12px 0;">
            <tr><td style="padding:8px;border:1px solid #e0e0e0;font-weight:bold;">Account</td><td style="padding:8px;border:1px solid #e0e0e0;">{{account}}</td></tr>
            <tr><td style="padding:8px;border:1px solid #e0e0e0;font-weight:bold;">Project</td><td style="padding:8px;border:1px solid #e0e0e0;">{{projectId}}</td></tr>
            <tr><td style="padding:8px;border:1px solid #e0e0e0;font-weight:bold;">Source/Sheet</td><td style="padding:8px;border:1px solid #e0e0e0;">{{source}} / {{sheet}}</td></tr>
            <tr><td style="padding:8px;border:1px solid #e0e0e0;font-weight:bold;">Deadline</td><td style="padding:8px;border:1px solid #e0e0e0;">{{deadline}}</td></tr>
            <tr><td style="padding:8px;border:1px solid #e0e0e0;font-weight:bold;">Total Words</td><td style="padding:8px;border:1px solid #e0e0e0;">{{total}}</td></tr>
            <tr><td style="padding:8px;border:1px solid #e0e0e0;font-weight:bold;">WWC</td><td style="padding:8px;border:1px solid #e0e0e0;">{{wwc}}</td></tr>
          </table>
          <p>Please accept or decline this assignment.</p>
        </td>
      </tr>
    </table>
  `;
}

// ── Sub-components ──

const STAT_COLORS: Record<string, { dot: string; text: string; activeBg: string; activeRing: string }> = {
  blue: { dot: "bg-blue-400", text: "text-blue-400", activeBg: "bg-blue-500/[0.12]", activeRing: "ring-blue-500/30" },
  orange: { dot: "bg-orange-400", text: "text-orange-400", activeBg: "bg-orange-500/[0.12]", activeRing: "ring-orange-500/30" },
  cyan: { dot: "bg-cyan-400", text: "text-cyan-400", activeBg: "bg-cyan-500/[0.12]", activeRing: "ring-cyan-500/30" },
  red: { dot: "bg-red-400", text: "text-red-400", activeBg: "bg-red-500/[0.12]", activeRing: "ring-red-500/30" },
  emerald: { dot: "bg-emerald-400", text: "text-emerald-400", activeBg: "bg-emerald-500/[0.12]", activeRing: "ring-emerald-500/30" },
  green: { dot: "bg-green-400", text: "text-green-400", activeBg: "bg-green-500/[0.12]", activeRing: "ring-green-500/30" },
  purple: { dot: "bg-purple-400", text: "text-purple-400", activeBg: "bg-purple-500/[0.12]", activeRing: "ring-purple-500/30" },
  gray: { dot: "bg-gray-400", text: "text-gray-400", activeBg: "bg-gray-500/[0.12]", activeRing: "ring-gray-500/30" },
};

function StatPill({ label, value, loading, color, active, onClick }: { label: string; value: number; loading: boolean; color: string; active?: boolean; onClick?: () => void }) {
  const c = STAT_COLORS[color] || STAT_COLORS.gray;
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all duration-150 ${
        active
          ? `${c.activeBg} ring-1 ${c.activeRing}`
          : "hover:bg-white/[0.04]"
      } ${onClick ? "cursor-pointer" : "cursor-default"}`}
      data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      <span className="text-xs text-muted-foreground">{label}</span>
      {loading ? <Skeleton className="h-4 w-6" /> : <span className={`text-sm font-bold tabular-nums ${c.text}`}>{value}</span>}
    </button>
  );
}

function StatusBadge({ type }: { type: "needs-tr" | "needs-rev" | "assigned" | "delivered" }) {
  const config = {
    "needs-tr": "bg-orange-500/15 text-orange-400 border-orange-500/25 shadow-sm shadow-orange-500/5",
    "needs-rev": "bg-blue-500/15 text-blue-400 border-blue-500/25 shadow-sm shadow-blue-500/5",
    "assigned": "bg-emerald-500/15 text-emerald-400 border-emerald-500/25 shadow-sm shadow-emerald-500/5",
    "delivered": "bg-white/[0.06] text-muted-foreground border-white/[0.08]",
  };
  const labels = {
    "needs-tr": "Needs TR",
    "needs-rev": "Needs REV",
    "assigned": "Assigned",
    "delivered": "Delivered",
  };
  return (
    <Badge className={`text-[10px] px-1.5 py-0 border ${config[type]}`}>
      {labels[type]}
    </Badge>
  );
}

function TogglePill({ active, onClick, color, children, ...rest }: { active: boolean; onClick: () => void; color: string; children: React.ReactNode; [key: string]: any }) {
  const colorMap: Record<string, { active: string; inactive: string }> = {
    orange: { active: "bg-orange-500/15 text-orange-400 border border-orange-500/25", inactive: "bg-white/[0.03] text-muted-foreground border border-white/[0.06]" },
    blue: { active: "bg-blue-500/15 text-blue-400 border border-blue-500/25", inactive: "bg-white/[0.03] text-muted-foreground border border-white/[0.06]" },
    primary: { active: "bg-primary/15 text-primary border border-primary/25", inactive: "bg-white/[0.03] text-muted-foreground border border-white/[0.06]" },
    purple: { active: "bg-purple-500/15 text-purple-400 border border-purple-500/25", inactive: "bg-white/[0.03] text-muted-foreground border border-white/[0.06]" },
  };
  const c = colorMap[color] || colorMap.primary;
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-md text-xs font-medium transition-all duration-150 ${active ? c.active : c.inactive} hover:bg-white/[0.06]`}
      {...rest}
    >
      {children}
    </button>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="text-muted-foreground/70 text-[10px] uppercase tracking-wider">{label}</span>
      <p className="font-medium text-foreground truncate text-xs">{value}</p>
    </div>
  );
}

function OfferStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-amber-500/15 text-amber-400 border-amber-500/20",
    accepted: "bg-green-500/15 text-green-400 border-green-500/20",
    rejected: "bg-red-500/15 text-red-400 border-red-500/20",
    withdrawn: "bg-gray-500/10 text-gray-400 border-gray-500/20",
    completed: "bg-blue-500/15 text-blue-400 border-blue-500/20",
    offered: "bg-amber-500/15 text-amber-400 border-amber-500/20",
    expired: "bg-gray-500/10 text-gray-400 border-gray-500/20",
    cancelled: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  };
  const icons: Record<string, React.ReactNode> = {
    pending: <Clock className="w-2.5 h-2.5 mr-0.5" />,
    accepted: <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />,
    rejected: <XCircle className="w-2.5 h-2.5 mr-0.5" />,
    withdrawn: <Ban className="w-2.5 h-2.5 mr-0.5" />,
  };
  return (
    <Badge className={`text-[10px] px-1.5 py-0 ${styles[status] || "bg-muted text-muted-foreground"}`}>
      {icons[status] || null}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

function SortableHeader({ col, label, sortCol, sortDir, setSortCol, setSortDir, align }: {
  col: string;
  label: string;
  sortCol: string;
  sortDir: "asc" | "desc";
  setSortCol: (col: string) => void;
  setSortDir: (fn: (prev: "asc" | "desc") => "asc" | "desc") => void;
  align?: "left" | "right";
}) {
  const isActive = sortCol === col;
  return (
    <th
      className={`${align === "right" ? "text-right" : "text-left"} font-medium text-muted-foreground px-2 py-2.5 text-[11px] uppercase tracking-wider cursor-pointer select-none hover:text-foreground transition-colors group`}
      onClick={() => {
        if (sortCol === col) {
          setSortDir((prev: "asc" | "desc") => prev === "asc" ? "desc" : "asc");
        } else {
          setSortCol(col);
          setSortDir(() => "asc");
        }
      }}
      data-testid={`sort-${col}`}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {isActive ? (
          sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-40 transition-opacity" />
        )}
      </span>
    </th>
  );
}

function matchAccountsHelper(task: Task | null): boolean {
  if (!task) return false;
  return !!ACCOUNT_MATCH[task.source] || !!SPECIALIZATION_MATCH[task.source];
}
