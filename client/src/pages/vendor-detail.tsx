import { useState, useMemo, useRef } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Pencil,
  Save,
  X,
  Loader2,
  FileText,
  Star,
  Globe,
  DollarSign,
  ClipboardList,
  Activity,
  StickyNote,
  Plus,
  Calendar,
  User,
  Mail,
  Phone,
  Building,
  CheckCircle2,
  Clock,
  AlertCircle,
  Trash2,
  Check,
  XCircle,
  MapPin,
  Link as LinkIcon,
  ExternalLink,
  Award,
  ShieldCheck,
  TrendingUp,
  CreditCard,
  FileCheck,
  ChevronRight,
  Upload,
  Download,
  BarChart3,
  Crown,
  Percent,
  Calendar as CalendarIcon,
  ChevronLeft,
} from "lucide-react";

// ── Constants ──

const LANGUAGES = [
  "EN", "TR", "DE", "FR", "ES", "IT", "PT", "NL", "PL", "RU",
  "ZH", "JA", "KO", "AR", "SV", "DA", "FI", "NO", "CS", "HU",
  "RO", "BG", "HR", "SK", "SL", "EL", "UK", "TH", "VI", "ID",
  "MS", "HI", "BN", "HE", "FA",
];

const STATUS_COLORS: Record<string, string> = {
  "New Application": "bg-blue-500/15 text-blue-400 border-blue-500/25",
  "Form Sent": "bg-cyan-500/15 text-cyan-400 border-cyan-500/25",
  "Price Negotiation": "bg-amber-500/15 text-amber-400 border-amber-500/25",
  "Test Sent": "bg-purple-500/15 text-purple-400 border-purple-500/25",
  Approved: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  Inactive: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
  Rejected: "bg-red-500/15 text-red-400 border-red-500/25",
  "Red Flag": "bg-rose-600/15 text-rose-400 border-rose-600/25",
};

const VENDOR_STATUSES = [
  "New Application",
  "Form Sent",
  "Price Negotiation",
  "Test Sent",
  "Approved",
  "Inactive",
  "Rejected",
  "Red Flag",
];

const SERVICE_TYPES = [
  "Translation", "MTPE", "Review", "LQA", "Proofreading", "Subtitling",
  "DTP", "TEP", "Copywriting", "Transcreation", "Editing", "Interpretation",
  "Localization", "Transcription",
];

const RATE_TYPES = [
  "per_word", "per_hour", "per_page", "per_minute",
  "per_project", "per_character", "per_day",
];

const VENDOR_TIERS = ["Premium", "Standard", "Economy", "Probation", "Blacklisted"];

const TIER_COLORS: Record<string, string> = {
  Premium: "bg-amber-500/15 text-amber-400 border-amber-500/25",
  Standard: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  Economy: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
  Probation: "bg-amber-600/15 text-amber-500 border-amber-600/25",
  Blacklisted: "bg-red-500/15 text-red-400 border-red-500/25",
};

const DOCUMENT_TYPES = ["CV", "NDA", "Certificate", "Test Result", "Contract", "Other"];

// ── Types ──

interface VendorAddress {
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

interface Vendor {
  id: number;
  fullName: string;
  email: string;
  email2?: string | null;
  phone?: string | null;
  phone2?: string | null;
  phone3?: string | null;
  address?: VendorAddress | null;
  location?: string | null;
  website?: string | null;
  skype?: string | null;
  gender?: string | null;
  companyName?: string | null;
  profilePictureUrl?: string | null;
  resourceCode?: string | null;
  resourceType?: string | null;
  nativeLanguage?: string | null;
  translationSpecializations?: string[] | null;
  otherProfessionalSkills?: string[] | null;
  technicalSkills?: string[] | null;
  serviceTypes?: string[] | null;
  software?: string[] | null;
  experienceYears?: number | null;
  education?: string | null;
  certifications?: string[] | null;
  catDiscounts?: Record<string, number> | null;
  currency?: string | null;
  minimumFee?: number | null;
  minimumProjectFee?: number | null;
  paymentInfo?: Record<string, any> | null;
  taxInfo?: Record<string, any> | null;
  status: string;
  assignedTo?: number | null;
  followUpDate?: string | null;
  followUpNote?: string | null;
  combinedQualityScore?: number | null;
  averageLqaScore?: number | null;
  averageQsScore?: number | null;
  totalReviewsCount?: number | null;
  accountQualityScores?: Record<string, any>[] | null;
  valueIndex?: number | null;
  cvFileUrl?: string | null;
  ndaFileUrl?: string | null;
  portfolioFileUrl?: string | null;
  ndaSigned?: boolean | null;
  tested?: boolean | null;
  certified?: boolean | null;
  availability?: string | null;
  accounts?: string[] | null;
  specializations?: string[] | null;
  tags?: string[] | null;
  canDoLqa?: boolean | null;
  lqaLanguages?: string | null;
  lqaSpecializations?: string | null;
  tier?: string | null;
  notes?: string | null;
  specialInstructions?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

interface LanguagePair {
  id: number;
  vendorId: number;
  sourceLanguage: string;
  targetLanguage: string;
  isPrimary?: boolean;
}

interface RateCard {
  id: number;
  vendorId: number;
  sourceLanguage: string;
  targetLanguage: string;
  serviceType: string;
  rateType: string;
  rateValue: number;
  currency: string;
  specialization?: string | null;
  account?: string | null;
}

interface QualityReport {
  id: number;
  reportDate?: string;
  reportType?: string;
  score?: number;
  qsScore?: string | number | null;
  lqaScore?: string | number | null;
  projectId?: string | null;
  projectTitle?: string | null;
  projectName?: string | null;
  account?: string | null;
  clientAccount?: string | null;
  languagePair?: string | null;
  sourceLanguage?: string | null;
  targetLanguage?: string | null;
  reviewerName?: string | null;
  status?: string | null;
  feedback?: string | null;
}

interface VendorFileUpload {
  id: number;
  vendorId: number;
  fileName: string;
  fileUrl: string;
  docType: string;
  fileSize?: number | null;
  mimeType?: string | null;
  uploadedAt?: string;
}

interface PerformanceData {
  qsTrend: { date: string; score: number }[];
  lqaTrend: { date: string; score: number }[];
  onTimeRate: number | null;
  totalWordCount: number;
  totalJobs: number;
  totalEarnings: number;
}

interface ActivityLogEntry {
  id: number;
  vendorId: number;
  activityType: string;
  description?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  createdAt: string;
}

interface VendorNote {
  id: number;
  vendorId: number;
  content: string;
  noteType?: string | null;
  visibility?: string | null;
  createdBy?: string | null;
  createdAt: string;
}

// ── Helpers ──

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "\u2014";
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return "\u2014";
  try {
    return new Date(dateStr).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function timeAgo(dateStr?: string | null): string {
  if (!dateStr) return "\u2014";
  const s = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function formatAddress(addr?: VendorAddress | null): string {
  if (!addr) return "";
  const parts = [
    addr.address1, addr.address2, addr.city,
    addr.state, addr.zip, addr.country,
  ].filter(Boolean);
  return parts.join(", ");
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function getAvatarColor(name: string): string {
  const colors = [
    "bg-blue-600", "bg-emerald-600", "bg-purple-600", "bg-amber-600",
    "bg-rose-600", "bg-cyan-600", "bg-indigo-600", "bg-teal-600",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function StatusBadge({ status }: { status: string }) {
  const colorClass =
    STATUS_COLORS[status] || "bg-zinc-500/15 text-zinc-400 border-zinc-500/25";
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold ${colorClass}`}
    >
      {status}
    </span>
  );
}

function ScoreDisplay({
  score,
  label,
  size = "md",
}: {
  score?: number | string | null;
  label: string;
  size?: "sm" | "md" | "lg";
}) {
  if (score == null) return null;
  const numScore = Number(score);
  if (isNaN(numScore)) return null;
  let color = "text-zinc-400";
  if (numScore >= 90) color = "text-emerald-400";
  else if (numScore >= 75) color = "text-amber-400";
  else color = "text-red-400";

  const textSize =
    size === "lg" ? "text-3xl" : size === "md" ? "text-lg" : "text-sm";
  const labelSize = size === "lg" ? "text-xs" : "text-[10px]";

  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`${textSize} font-bold ${color}`}>
        {numScore.toFixed(1)}
      </span>
      <span className={`${labelSize} text-white/40 uppercase tracking-wide`}>
        {label}
      </span>
    </div>
  );
}

function BadgeList({
  items,
  emptyText,
}: {
  items?: string[] | null;
  emptyText?: string;
}) {
  if (!items || items.length === 0) {
    return (
      <span className="text-xs text-white/30">{emptyText || "None"}</span>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <Badge
          key={item}
          variant="secondary"
          className="text-[11px] bg-white/[0.06] text-white/70 border-transparent hover:bg-white/[0.10]"
        >
          {item}
        </Badge>
      ))}
    </div>
  );
}

function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-sm text-white/50 shrink-0">{label}</span>
      <span className="text-sm text-white text-right">{children}</span>
    </div>
  );
}

function BooleanIcon({ value }: { value?: boolean | null }) {
  if (value) return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
  return <XCircle className="w-4 h-4 text-white/20" />;
}

// ── Edit Vendor Dialog ──

function EditVendorDialog({
  vendor,
  open,
  onClose,
}: {
  vendor: Vendor;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();

  const [fullName, setFullName] = useState(vendor.fullName);
  const [email, setEmail] = useState(vendor.email);
  const [email2, setEmail2] = useState(vendor.email2 ?? "");
  const [phone, setPhone] = useState(vendor.phone ?? "");
  const [phone2, setPhone2] = useState(vendor.phone2 ?? "");
  const [phone3, setPhone3] = useState(vendor.phone3 ?? "");
  const [status, setStatus] = useState(vendor.status);
  const [resourceCode, setResourceCode] = useState(vendor.resourceCode ?? "");
  const [resourceType, setResourceType] = useState(vendor.resourceType ?? "");
  const [companyName, setCompanyName] = useState(vendor.companyName ?? "");
  const [nativeLanguage, setNativeLanguage] = useState(
    vendor.nativeLanguage ?? "",
  );
  const [experienceYears, setExperienceYears] = useState(
    vendor.experienceYears?.toString() ?? "",
  );
  const [education, setEducation] = useState(vendor.education ?? "");
  const [website, setWebsite] = useState(vendor.website ?? "");
  const [skype, setSkype] = useState(vendor.skype ?? "");
  const [gender, setGender] = useState(vendor.gender ?? "");
  const [location, setLocation] = useState(vendor.location ?? "");
  const [availability, setAvailability] = useState(vendor.availability ?? "");
  const [currency, setCurrency] = useState(vendor.currency ?? "");
  const [minimumFee, setMinimumFee] = useState(
    vendor.minimumFee?.toString() ?? "",
  );
  const [minimumProjectFee, setMinimumProjectFee] = useState(
    vendor.minimumProjectFee?.toString() ?? "",
  );
  const [notesText, setNotesText] = useState(vendor.notes ?? "");
  const [specialInstructions, setSpecialInstructions] = useState(
    vendor.specialInstructions ?? "",
  );

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<Vendor>) => {
      const res = await apiRequest("PATCH", `/api/vendors/${vendor.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/vendors/${vendor.id}`],
      });
      toast({
        title: "Vendor updated",
        description: "Changes saved successfully.",
      });
      onClose();
    },
    onError: (err: Error) => {
      toast({
        title: "Update failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  function handleSave() {
    updateMutation.mutate({
      fullName,
      email,
      email2: email2 || null,
      phone: phone || null,
      phone2: phone2 || null,
      phone3: phone3 || null,
      status,
      resourceCode: resourceCode || null,
      resourceType: resourceType || null,
      companyName: companyName || null,
      nativeLanguage: nativeLanguage || null,
      experienceYears: experienceYears
        ? parseInt(experienceYears, 10)
        : null,
      education: education || null,
      website: website || null,
      skype: skype || null,
      gender: gender || null,
      location: location || null,
      availability: availability || null,
      currency: currency || null,
      minimumFee: minimumFee ? parseFloat(minimumFee) : null,
      minimumProjectFee: minimumProjectFee
        ? parseFloat(minimumProjectFee)
        : null,
      notes: notesText || null,
      specialInstructions: specialInstructions || null,
    } as any);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-[#1a1d27] border-white/[0.08] text-white max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white text-base font-semibold">
            Edit Vendor
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Full Name</Label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="bg-white/[0.04] border-white/[0.08] text-white text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Email</Label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-white/[0.04] border-white/[0.08] text-white text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Email 2</Label>
              <Input
                value={email2}
                onChange={(e) => setEmail2(e.target.value)}
                className="bg-white/[0.04] border-white/[0.08] text-white text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1d27] border-white/[0.08]">
                  {VENDOR_STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="text-white">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Phone</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="bg-white/[0.04] border-white/[0.08] text-white text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Phone 2</Label>
              <Input
                value={phone2}
                onChange={(e) => setPhone2(e.target.value)}
                className="bg-white/[0.04] border-white/[0.08] text-white text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Phone 3</Label>
              <Input
                value={phone3}
                onChange={(e) => setPhone3(e.target.value)}
                className="bg-white/[0.04] border-white/[0.08] text-white text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Resource Code</Label>
              <Input
                value={resourceCode}
                onChange={(e) => setResourceCode(e.target.value)}
                className="bg-white/[0.04] border-white/[0.08] text-white text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Resource Type</Label>
              <Input
                value={resourceType}
                onChange={(e) => setResourceType(e.target.value)}
                className="bg-white/[0.04] border-white/[0.08] text-white text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Company</Label>
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="bg-white/[0.04] border-white/[0.08] text-white text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Native Language</Label>
              <Select value={nativeLanguage} onValueChange={setNativeLanguage}>
                <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-sm">
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1d27] border-white/[0.08]">
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l} value={l} className="text-white">
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">
                Experience (years)
              </Label>
              <Input
                type="number"
                value={experienceYears}
                onChange={(e) => setExperienceYears(e.target.value)}
                className="bg-white/[0.04] border-white/[0.08] text-white text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Gender</Label>
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-sm">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1d27] border-white/[0.08]">
                  {["Male", "Female", "Other"].map((g) => (
                    <SelectItem key={g} value={g} className="text-white">
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Availability</Label>
              <Select value={availability || ""} onValueChange={setAvailability}>
                <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-sm">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1d27] border-white/[0.08]">
                  {["Available", "Busy", "On Leave", "Unavailable"].map(
                    (a) => (
                      <SelectItem key={a} value={a} className="text-white">
                        {a}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Website</Label>
              <Input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="bg-white/[0.04] border-white/[0.08] text-white text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Skype</Label>
              <Input
                value={skype}
                onChange={(e) => setSkype(e.target.value)}
                className="bg-white/[0.04] border-white/[0.08] text-white text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Location</Label>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="bg-white/[0.04] border-white/[0.08] text-white text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Education</Label>
              <Input
                value={education}
                onChange={(e) => setEducation(e.target.value)}
                className="bg-white/[0.04] border-white/[0.08] text-white text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Currency</Label>
              <Input
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="bg-white/[0.04] border-white/[0.08] text-white text-sm"
                placeholder="e.g. USD"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Minimum Fee</Label>
              <Input
                type="number"
                step="0.01"
                value={minimumFee}
                onChange={(e) => setMinimumFee(e.target.value)}
                className="bg-white/[0.04] border-white/[0.08] text-white text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Min Project Fee</Label>
              <Input
                type="number"
                step="0.01"
                value={minimumProjectFee}
                onChange={(e) => setMinimumProjectFee(e.target.value)}
                className="bg-white/[0.04] border-white/[0.08] text-white text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-white/60">Notes</Label>
            <Textarea
              value={notesText}
              onChange={(e) => setNotesText(e.target.value)}
              className="bg-white/[0.04] border-white/[0.08] text-white text-sm min-h-[60px] resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-white/60">
              Special Instructions
            </Label>
            <Textarea
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value)}
              className="bg-white/[0.04] border-white/[0.08] text-white text-sm min-h-[60px] resize-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            onClick={onClose}
            className="text-white/60 hover:text-white hover:bg-white/[0.06]"
          >
            <X className="w-3.5 h-3.5 mr-1.5" />
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="bg-blue-600 hover:bg-blue-500 text-white"
          >
            {updateMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5 mr-1.5" />
            )}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Tab: Overview ──

function OverviewTab({ vendor }: { vendor: Vendor }) {
  const addr = formatAddress(vendor.address);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Contact Info */}
        <Card className="bg-white/[0.03] border-white/[0.06]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-white/70 flex items-center gap-2">
              <Mail className="w-4 h-4 text-blue-400" />
              Contact Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-3 text-sm">
              <Mail className="w-4 h-4 text-white/30 shrink-0" />
              <a
                href={`mailto:${vendor.email}`}
                className="text-blue-400 hover:text-blue-300 transition-colors"
              >
                {vendor.email}
              </a>
            </div>
            {vendor.email2 && (
              <div className="flex items-center gap-3 text-sm">
                <Mail className="w-4 h-4 text-white/30 shrink-0" />
                <a
                  href={`mailto:${vendor.email2}`}
                  className="text-blue-400 hover:text-blue-300 transition-colors"
                >
                  {vendor.email2}
                </a>
              </div>
            )}
            {vendor.phone && (
              <div className="flex items-center gap-3 text-sm">
                <Phone className="w-4 h-4 text-white/30 shrink-0" />
                <span className="text-white">{vendor.phone}</span>
              </div>
            )}
            {vendor.phone2 && (
              <div className="flex items-center gap-3 text-sm">
                <Phone className="w-4 h-4 text-white/30 shrink-0" />
                <span className="text-white">{vendor.phone2}</span>
              </div>
            )}
            {vendor.phone3 && (
              <div className="flex items-center gap-3 text-sm">
                <Phone className="w-4 h-4 text-white/30 shrink-0" />
                <span className="text-white">{vendor.phone3}</span>
              </div>
            )}
            {addr && (
              <div className="flex items-start gap-3 text-sm">
                <MapPin className="w-4 h-4 text-white/30 shrink-0 mt-0.5" />
                <span className="text-white">{addr}</span>
              </div>
            )}
            {vendor.location && (
              <div className="flex items-center gap-3 text-sm">
                <Globe className="w-4 h-4 text-white/30 shrink-0" />
                <span className="text-white">{vendor.location}</span>
              </div>
            )}
            {vendor.website && (
              <div className="flex items-center gap-3 text-sm">
                <LinkIcon className="w-4 h-4 text-white/30 shrink-0" />
                <a
                  href={
                    vendor.website.startsWith("http")
                      ? vendor.website
                      : `https://${vendor.website}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
                >
                  {vendor.website} <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
            {vendor.skype && (
              <div className="flex items-center gap-3 text-sm">
                <User className="w-4 h-4 text-white/30 shrink-0" />
                <span className="text-white">Skype: {vendor.skype}</span>
              </div>
            )}
            {vendor.gender && (
              <div className="flex items-center gap-3 text-sm">
                <User className="w-4 h-4 text-white/30 shrink-0" />
                <span className="text-white">Gender: {vendor.gender}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Professional Info */}
        <Card className="bg-white/[0.03] border-white/[0.06]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-white/70 flex items-center gap-2">
              <Building className="w-4 h-4 text-purple-400" />
              Professional
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {vendor.resourceType && (
              <InfoRow label="Resource Type">{vendor.resourceType}</InfoRow>
            )}
            {vendor.companyName && (
              <InfoRow label="Company">{vendor.companyName}</InfoRow>
            )}
            {vendor.nativeLanguage && (
              <InfoRow label="Native Language">
                <Badge
                  variant="secondary"
                  className="text-[11px] bg-white/[0.06] text-white/70 border-transparent"
                >
                  {vendor.nativeLanguage}
                </Badge>
              </InfoRow>
            )}
            {vendor.experienceYears != null && (
              <InfoRow label="Experience">
                {vendor.experienceYears} years
              </InfoRow>
            )}
            {vendor.education && (
              <InfoRow label="Education">{vendor.education}</InfoRow>
            )}
            <InfoRow label="Availability">
              <span className="flex items-center gap-1.5 capitalize">
                {vendor.availability?.toLowerCase() === "available" ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : vendor.availability?.toLowerCase() === "busy" ? (
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                )}
                {vendor.availability || "Unknown"}
              </span>
            </InfoRow>
          </CardContent>
        </Card>
      </div>

      {/* Badges grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-white/[0.03] border-white/[0.06]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-white/70 flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-400" />
              Certifications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BadgeList
              items={vendor.certifications}
              emptyText="No certifications listed"
            />
          </CardContent>
        </Card>

        <Card className="bg-white/[0.03] border-white/[0.06]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-white/70 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-cyan-400" />
              Service Types
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BadgeList
              items={vendor.serviceTypes}
              emptyText="No service types listed"
            />
          </CardContent>
        </Card>

        <Card className="bg-white/[0.03] border-white/[0.06]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-white/70 flex items-center gap-2">
              <Star className="w-4 h-4 text-indigo-400" />
              Specializations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BadgeList
              items={
                vendor.specializations || vendor.translationSpecializations
              }
              emptyText="No specializations"
            />
          </CardContent>
        </Card>

        <Card className="bg-white/[0.03] border-white/[0.06]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-white/70 flex items-center gap-2">
              <FileText className="w-4 h-4 text-green-400" />
              CAT Tools / Software
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BadgeList
              items={vendor.software}
              emptyText="No CAT tools listed"
            />
          </CardContent>
        </Card>

        <Card className="bg-white/[0.03] border-white/[0.06]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-white/70 flex items-center gap-2">
              <Building className="w-4 h-4 text-rose-400" />
              Accounts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BadgeList
              items={vendor.accounts}
              emptyText="No accounts assigned"
            />
          </CardContent>
        </Card>

        <Card className="bg-white/[0.03] border-white/[0.06]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-white/70 flex items-center gap-2">
              <StickyNote className="w-4 h-4 text-teal-400" />
              Tags
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BadgeList items={vendor.tags} emptyText="No tags" />
          </CardContent>
        </Card>
      </div>

      {/* Quick Stats */}
      <Card className="bg-white/[0.03] border-white/[0.06]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-white/70 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            Quick Stats
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-8 flex-wrap">
            <ScoreDisplay
              score={vendor.combinedQualityScore}
              label="Quality Score"
            />
            <ScoreDisplay score={vendor.valueIndex} label="Value Index" />
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-lg font-bold text-white">
                {vendor.totalReviewsCount ?? 0}
              </span>
              <span className="text-[10px] text-white/40 uppercase tracking-wide">
                Total Reviews
              </span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-lg font-bold text-white">
                {formatDate(vendor.createdAt)}
              </span>
              <span className="text-[10px] text-white/40 uppercase tracking-wide">
                Member Since
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes & Special Instructions */}
      {(vendor.notes || vendor.specialInstructions) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {vendor.notes && (
            <Card className="bg-white/[0.03] border-white/[0.06]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-white/70">
                  Notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">
                  {vendor.notes}
                </p>
              </CardContent>
            </Card>
          )}
          {vendor.specialInstructions && (
            <Card className="bg-amber-500/5 border-amber-500/15">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-amber-400 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Special Instructions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">
                  {vendor.specialInstructions}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tab: Languages & Skills ──

function LanguagesTab({
  vendorId,
  vendor,
}: {
  vendorId: string;
  vendor: Vendor;
}) {
  const { toast } = useToast();

  const [newSource, setNewSource] = useState("");
  const [newTarget, setNewTarget] = useState("");
  const [newPrimary, setNewPrimary] = useState(false);

  const { data: pairs, isLoading } = useQuery<LanguagePair[]>({
    queryKey: [`/api/vendors/${vendorId}/language-pairs`],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/vendors/${vendorId}/language-pairs`,
      );
      return res.json();
    },
  });

  const addPairMutation = useMutation({
    mutationFn: async (data: {
      sourceLanguage: string;
      targetLanguage: string;
      isPrimary: boolean;
    }) => {
      const res = await apiRequest(
        "POST",
        `/api/vendors/${vendorId}/language-pairs`,
        data,
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/vendors/${vendorId}/language-pairs`],
      });
      setNewSource("");
      setNewTarget("");
      setNewPrimary(false);
      toast({ title: "Language pair added" });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to add",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const deletePairMutation = useMutation({
    mutationFn: async (pairId: number) => {
      await apiRequest(
        "DELETE",
        `/api/vendors/${vendorId}/language-pairs/${pairId}`,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/vendors/${vendorId}/language-pairs`],
      });
      toast({ title: "Language pair removed" });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to delete",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  function handleAddPair() {
    if (!newSource || !newTarget) return;
    addPairMutation.mutate({
      sourceLanguage: newSource,
      targetLanguage: newTarget,
      isPrimary: newPrimary,
    });
  }

  return (
    <div className="space-y-4">
      <Card className="bg-white/[0.03] border-white/[0.06]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-white/70 flex items-center gap-2">
            <Globe className="w-4 h-4 text-blue-400" />
            Language Pairs
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton
                  key={i}
                  className="h-10 bg-white/[0.04] rounded"
                />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-white/[0.06] hover:bg-transparent">
                  <TableHead className="text-white/50 text-xs font-medium">
                    Source
                  </TableHead>
                  <TableHead className="text-white/50 text-xs font-medium">
                    Target
                  </TableHead>
                  <TableHead className="text-white/50 text-xs font-medium">
                    Primary
                  </TableHead>
                  <TableHead className="text-white/50 text-xs font-medium w-[80px]">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pairs && pairs.length > 0 ? (
                  pairs.map((pair) => (
                    <TableRow
                      key={pair.id}
                      className="border-white/[0.04] hover:bg-white/[0.02]"
                    >
                      <TableCell className="text-white font-mono text-sm">
                        {pair.sourceLanguage}
                      </TableCell>
                      <TableCell className="text-white font-mono text-sm">
                        {pair.targetLanguage}
                      </TableCell>
                      <TableCell>
                        {pair.isPrimary ? (
                          <Check className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <span className="text-white/20">{"\u2014"}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deletePairMutation.mutate(pair.id)}
                          disabled={deletePairMutation.isPending}
                          className="h-7 w-7 p-0 text-white/30 hover:text-red-400 hover:bg-red-500/10"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center text-white/30 text-sm py-6"
                    >
                      No language pairs added yet
                    </TableCell>
                  </TableRow>
                )}

                {/* Add row */}
                <TableRow className="border-white/[0.04] hover:bg-white/[0.02]">
                  <TableCell>
                    <Select value={newSource} onValueChange={setNewSource}>
                      <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-xs h-8 w-24">
                        <SelectValue placeholder="Source" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#1a1d27] border-white/[0.08] max-h-48">
                        {LANGUAGES.map((l) => (
                          <SelectItem
                            key={l}
                            value={l}
                            className="text-white text-xs"
                          >
                            {l}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select value={newTarget} onValueChange={setNewTarget}>
                      <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-xs h-8 w-24">
                        <SelectValue placeholder="Target" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#1a1d27] border-white/[0.08] max-h-48">
                        {LANGUAGES.map((l) => (
                          <SelectItem
                            key={l}
                            value={l}
                            className="text-white text-xs"
                          >
                            {l}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center">
                      <Checkbox
                        checked={newPrimary}
                        onCheckedChange={(v) => setNewPrimary(!!v)}
                        className="border-white/20"
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      onClick={handleAddPair}
                      disabled={
                        !newSource ||
                        !newTarget ||
                        addPairMutation.isPending
                      }
                      className="h-7 bg-blue-600 hover:bg-blue-500 text-white text-xs"
                    >
                      {addPairMutation.isPending ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Plus className="w-3 h-3 mr-1" />
                      )}
                      Add
                    </Button>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Display-mode lists */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-white/[0.03] border-white/[0.06]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-white/70">
              Service Types
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BadgeList items={vendor.serviceTypes} emptyText="None listed" />
          </CardContent>
        </Card>

        <Card className="bg-white/[0.03] border-white/[0.06]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-white/70">
              Specializations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BadgeList
              items={
                vendor.specializations || vendor.translationSpecializations
              }
              emptyText="None listed"
            />
          </CardContent>
        </Card>

        <Card className="bg-white/[0.03] border-white/[0.06]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-white/70">
              CAT Tools
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BadgeList items={vendor.software} emptyText="None listed" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Tab: Rates & Payment ──

function RatesTab({
  vendorId,
  vendor,
}: {
  vendorId: string;
  vendor: Vendor;
}) {
  const { toast } = useToast();

  const [rcSource, setRcSource] = useState("");
  const [rcTarget, setRcTarget] = useState("");
  const [rcService, setRcService] = useState("");
  const [rcRateType, setRcRateType] = useState("");
  const [rcRate, setRcRate] = useState("");
  const [rcCurrency, setRcCurrency] = useState(vendor.currency || "USD");
  const [rcSpec, setRcSpec] = useState("");
  const [rcAccount, setRcAccount] = useState("");

  const [editingPayment, setEditingPayment] = useState(false);
  const catFields = [
    "repetitions",
    "100%",
    "95-99%",
    "85-94%",
    "75-84%",
    "50-74%",
    "noMatch",
    "mt",
  ];
  const [catValues, setCatValues] = useState<Record<string, string>>(() => {
    const d = vendor.catDiscounts || {};
    const out: Record<string, string> = {};
    catFields.forEach((f) => {
      out[f] = (d as any)[f]?.toString() ?? "";
    });
    return out;
  });

  const [payMethod, setPayMethod] = useState(
    (vendor.paymentInfo as any)?.method ?? "",
  );
  const [payBank, setPayBank] = useState(
    (vendor.paymentInfo as any)?.bankDetails ?? "",
  );
  const [payPaypal, setPayPaypal] = useState(
    (vendor.paymentInfo as any)?.paypal ?? "",
  );
  const [payWise, setPayWise] = useState(
    (vendor.paymentInfo as any)?.wise ?? "",
  );
  const [taxVat, setTaxVat] = useState(
    (vendor.taxInfo as any)?.vat ?? "",
  );
  const [taxId, setTaxId] = useState(
    (vendor.taxInfo as any)?.taxId ?? "",
  );

  const { data: rateCards, isLoading } = useQuery<RateCard[]>({
    queryKey: [`/api/vendors/${vendorId}/rate-cards`],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/vendors/${vendorId}/rate-cards`,
      );
      return res.json();
    },
  });

  const addCardMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest(
        "POST",
        `/api/vendors/${vendorId}/rate-cards`,
        data,
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/vendors/${vendorId}/rate-cards`],
      });
      setRcSource("");
      setRcTarget("");
      setRcService("");
      setRcRateType("");
      setRcRate("");
      setRcSpec("");
      setRcAccount("");
      toast({ title: "Rate card added" });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to add",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const deleteCardMutation = useMutation({
    mutationFn: async (cardId: number) => {
      await apiRequest(
        "DELETE",
        `/api/vendors/${vendorId}/rate-cards/${cardId}`,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/vendors/${vendorId}/rate-cards`],
      });
      toast({ title: "Rate card removed" });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to delete",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const updatePaymentMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest(
        "PATCH",
        `/api/vendors/${vendorId}`,
        data,
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/vendors/${vendorId}`],
      });
      setEditingPayment(false);
      toast({ title: "Payment info updated" });
    },
    onError: (err: Error) => {
      toast({
        title: "Update failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  function handleAddCard() {
    if (!rcSource || !rcTarget || !rcService || !rcRateType || !rcRate) return;
    addCardMutation.mutate({
      sourceLanguage: rcSource,
      targetLanguage: rcTarget,
      serviceType: rcService,
      rateType: rcRateType,
      rateValue: parseFloat(rcRate),
      currency: rcCurrency,
      specialization: rcSpec || null,
      account: rcAccount || null,
    });
  }

  function handleSavePayment() {
    const catDiscounts: Record<string, number | null> = {};
    catFields.forEach((f) => {
      catDiscounts[f] = catValues[f] ? parseFloat(catValues[f]) : null;
    });
    updatePaymentMutation.mutate({
      catDiscounts,
      paymentInfo: {
        method: payMethod || null,
        bankDetails: payBank || null,
        paypal: payPaypal || null,
        wise: payWise || null,
      },
      taxInfo: {
        vat: taxVat || null,
        taxId: taxId || null,
      },
    });
  }

  return (
    <div className="space-y-4">
      {/* Rate Cards Table */}
      <Card className="bg-white/[0.03] border-white/[0.06]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-white/70 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-green-400" />
            Rate Cards
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton
                  key={i}
                  className="h-10 bg-white/[0.04] rounded"
                />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/[0.06] hover:bg-transparent">
                    <TableHead className="text-white/50 text-xs font-medium">
                      Source
                    </TableHead>
                    <TableHead className="text-white/50 text-xs font-medium">
                      Target
                    </TableHead>
                    <TableHead className="text-white/50 text-xs font-medium">
                      Service
                    </TableHead>
                    <TableHead className="text-white/50 text-xs font-medium">
                      Rate Type
                    </TableHead>
                    <TableHead className="text-white/50 text-xs font-medium text-right">
                      Rate
                    </TableHead>
                    <TableHead className="text-white/50 text-xs font-medium">
                      Currency
                    </TableHead>
                    <TableHead className="text-white/50 text-xs font-medium">
                      Specialization
                    </TableHead>
                    <TableHead className="text-white/50 text-xs font-medium">
                      Account
                    </TableHead>
                    <TableHead className="text-white/50 text-xs font-medium w-[60px]">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rateCards && rateCards.length > 0 ? (
                    rateCards.map((card) => (
                      <TableRow
                        key={card.id}
                        className="border-white/[0.04] hover:bg-white/[0.02]"
                      >
                        <TableCell className="text-white font-mono text-sm">
                          {card.sourceLanguage}
                        </TableCell>
                        <TableCell className="text-white font-mono text-sm">
                          {card.targetLanguage}
                        </TableCell>
                        <TableCell className="text-white/70 text-sm">
                          {card.serviceType}
                        </TableCell>
                        <TableCell className="text-white/70 text-sm capitalize">
                          {card.rateType?.replace("_", " ")}
                        </TableCell>
                        <TableCell className="text-white text-sm text-right font-medium">
                          {Number(card.rateValue).toFixed(4)}
                        </TableCell>
                        <TableCell className="text-white/50 text-sm">
                          {card.currency}
                        </TableCell>
                        <TableCell className="text-white/50 text-sm">
                          {card.specialization || "\u2014"}
                        </TableCell>
                        <TableCell className="text-white/50 text-sm">
                          {card.account || "\u2014"}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              deleteCardMutation.mutate(card.id)
                            }
                            disabled={deleteCardMutation.isPending}
                            className="h-7 w-7 p-0 text-white/30 hover:text-red-400 hover:bg-red-500/10"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={9}
                        className="text-center text-white/30 text-sm py-6"
                      >
                        No rate cards on record
                      </TableCell>
                    </TableRow>
                  )}

                  {/* Add row */}
                  <TableRow className="border-white/[0.04] hover:bg-white/[0.02]">
                    <TableCell>
                      <Select value={rcSource} onValueChange={setRcSource}>
                        <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-xs h-8 w-20">
                          <SelectValue placeholder="Src" />
                        </SelectTrigger>
                        <SelectContent className="bg-[#1a1d27] border-white/[0.08] max-h-48">
                          {LANGUAGES.map((l) => (
                            <SelectItem
                              key={l}
                              value={l}
                              className="text-white text-xs"
                            >
                              {l}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select value={rcTarget} onValueChange={setRcTarget}>
                        <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-xs h-8 w-20">
                          <SelectValue placeholder="Tgt" />
                        </SelectTrigger>
                        <SelectContent className="bg-[#1a1d27] border-white/[0.08] max-h-48">
                          {LANGUAGES.map((l) => (
                            <SelectItem
                              key={l}
                              value={l}
                              className="text-white text-xs"
                            >
                              {l}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select value={rcService} onValueChange={setRcService}>
                        <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-xs h-8 w-28">
                          <SelectValue placeholder="Service" />
                        </SelectTrigger>
                        <SelectContent className="bg-[#1a1d27] border-white/[0.08] max-h-48">
                          {SERVICE_TYPES.map((s) => (
                            <SelectItem
                              key={s}
                              value={s}
                              className="text-white text-xs"
                            >
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={rcRateType}
                        onValueChange={setRcRateType}
                      >
                        <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-xs h-8 w-28">
                          <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent className="bg-[#1a1d27] border-white/[0.08] max-h-48">
                          {RATE_TYPES.map((r) => (
                            <SelectItem
                              key={r}
                              value={r}
                              className="text-white text-xs capitalize"
                            >
                              {r.replace("_", " ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.0001"
                        value={rcRate}
                        onChange={(e) => setRcRate(e.target.value)}
                        placeholder="0.00"
                        className="bg-white/[0.04] border-white/[0.08] text-white text-xs h-8 w-20 text-right"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={rcCurrency}
                        onChange={(e) => setRcCurrency(e.target.value)}
                        className="bg-white/[0.04] border-white/[0.08] text-white text-xs h-8 w-16"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={rcSpec}
                        onChange={(e) => setRcSpec(e.target.value)}
                        placeholder="Spec"
                        className="bg-white/[0.04] border-white/[0.08] text-white text-xs h-8 w-20"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={rcAccount}
                        onChange={(e) => setRcAccount(e.target.value)}
                        placeholder="Acct"
                        className="bg-white/[0.04] border-white/[0.08] text-white text-xs h-8 w-20"
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        onClick={handleAddCard}
                        disabled={
                          !rcSource ||
                          !rcTarget ||
                          !rcService ||
                          !rcRateType ||
                          !rcRate ||
                          addCardMutation.isPending
                        }
                        className="h-7 bg-blue-600 hover:bg-blue-500 text-white text-xs"
                      >
                        {addCardMutation.isPending ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Plus className="w-3 h-3" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* CAT Discounts + Payment Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-white/[0.03] border-white/[0.06]">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-white/70">
              CAT Discounts (%)
            </CardTitle>
            {!editingPayment && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditingPayment(true)}
                className="h-7 text-xs text-white/50 hover:text-white hover:bg-white/[0.06]"
              >
                <Pencil className="w-3 h-3 mr-1" />
                Edit
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {catFields.map((field) => (
                <div
                  key={field}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="text-xs text-white/50 capitalize">
                    {field
                      .replace("noMatch", "No Match")
                      .replace("mt", "MT")}
                  </span>
                  {editingPayment ? (
                    <Input
                      type="number"
                      step="1"
                      value={catValues[field]}
                      onChange={(e) =>
                        setCatValues({
                          ...catValues,
                          [field]: e.target.value,
                        })
                      }
                      className="bg-white/[0.04] border-white/[0.08] text-white text-xs h-7 w-16 text-right"
                    />
                  ) : (
                    <span className="text-sm text-white font-mono">
                      {(vendor.catDiscounts as any)?.[field] != null
                        ? `${(vendor.catDiscounts as any)[field]}%`
                        : "\u2014"}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/[0.03] border-white/[0.06]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-white/70 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-green-400" />
              Payment Info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {editingPayment ? (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs text-white/50">Method</Label>
                  <Input
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                    className="bg-white/[0.04] border-white/[0.08] text-white text-xs h-8"
                    placeholder="e.g. Wire, PayPal"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-white/50">
                    Bank Details
                  </Label>
                  <Input
                    value={payBank}
                    onChange={(e) => setPayBank(e.target.value)}
                    className="bg-white/[0.04] border-white/[0.08] text-white text-xs h-8"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-white/50">PayPal</Label>
                  <Input
                    value={payPaypal}
                    onChange={(e) => setPayPaypal(e.target.value)}
                    className="bg-white/[0.04] border-white/[0.08] text-white text-xs h-8"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-white/50">Wise</Label>
                  <Input
                    value={payWise}
                    onChange={(e) => setPayWise(e.target.value)}
                    className="bg-white/[0.04] border-white/[0.08] text-white text-xs h-8"
                  />
                </div>
              </>
            ) : (
              <>
                <InfoRow label="Method">
                  {(vendor.paymentInfo as any)?.method || "\u2014"}
                </InfoRow>
                <InfoRow label="Bank Details">
                  {(vendor.paymentInfo as any)?.bankDetails || "\u2014"}
                </InfoRow>
                <InfoRow label="PayPal">
                  {(vendor.paymentInfo as any)?.paypal || "\u2014"}
                </InfoRow>
                <InfoRow label="Wise">
                  {(vendor.paymentInfo as any)?.wise || "\u2014"}
                </InfoRow>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tax Info */}
      <Card className="bg-white/[0.03] border-white/[0.06]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-white/70">
            Tax Info
          </CardTitle>
        </CardHeader>
        <CardContent>
          {editingPayment ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-white/50">VAT Number</Label>
                <Input
                  value={taxVat}
                  onChange={(e) => setTaxVat(e.target.value)}
                  className="bg-white/[0.04] border-white/[0.08] text-white text-xs h-8"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-white/50">Tax ID</Label>
                <Input
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  className="bg-white/[0.04] border-white/[0.08] text-white text-xs h-8"
                />
              </div>
            </div>
          ) : (
            <div className="flex gap-8">
              <InfoRow label="VAT">
                {(vendor.taxInfo as any)?.vat || "\u2014"}
              </InfoRow>
              <InfoRow label="Tax ID">
                {(vendor.taxInfo as any)?.taxId || "\u2014"}
              </InfoRow>
            </div>
          )}
        </CardContent>
      </Card>

      {editingPayment && (
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditingPayment(false)}
            className="text-white/60 hover:text-white hover:bg-white/[0.06]"
          >
            <X className="w-3.5 h-3.5 mr-1.5" />
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSavePayment}
            disabled={updatePaymentMutation.isPending}
            className="bg-blue-600 hover:bg-blue-500 text-white"
          >
            {updatePaymentMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5 mr-1.5" />
            )}
            Save Payment Info
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Tab: Quality ──

function QualityTab({
  vendorId,
  vendor,
}: {
  vendorId: string;
  vendor: Vendor;
}) {
  const { data: reports, isLoading } = useQuery<QualityReport[]>({
    queryKey: [`/api/vendors/${vendorId}/quality-reports`],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/vendors/${vendorId}/quality-reports`,
      );
      return res.json();
    },
  });

  const chartData = useMemo(() => {
    if (!reports || reports.length === 0) return [];
    return [...reports]
      .filter((r) => r.reportDate)
      .sort((a, b) => new Date(a.reportDate!).getTime() - new Date(b.reportDate!).getTime())
      .map((r) => {
        const qs = r.qsScore != null ? Number(r.qsScore) : null;
        const lqa = r.lqaScore != null ? Number(r.lqaScore) : null;
        const score = r.score != null ? Number(r.score) : (qs != null ? qs * 20 : lqa);
        return {
          date: formatDate(r.reportDate),
          QS: qs,
          LQA: lqa,
          Score: score,
          type: r.reportType,
        };
      });
  }, [reports]);

  function getReportScore(r: QualityReport): string {
    if (r.reportType === "QS" && r.qsScore != null) return String(r.qsScore);
    if (r.reportType === "LQA" && r.lqaScore != null) return String(r.lqaScore);
    if (r.score != null) return String(r.score);
    if (r.qsScore != null) return String(r.qsScore);
    if (r.lqaScore != null) return String(r.lqaScore);
    return "\u2014";
  }

  function getScoreColor(r: QualityReport): string {
    const val = Number(getReportScore(r));
    if (isNaN(val)) return "text-zinc-400";
    if (r.reportType === "QS") {
      if (val >= 4) return "text-emerald-400";
      if (val >= 3) return "text-amber-400";
      return "text-red-400";
    }
    if (val >= 90) return "text-emerald-400";
    if (val >= 75) return "text-amber-400";
    return "text-red-400";
  }

  return (
    <div className="space-y-4">
      {/* Score Overview */}
      <Card className="bg-white/[0.03] border-white/[0.06]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-white/70 flex items-center gap-2">
            <Star className="w-4 h-4 text-amber-400" />
            Score Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-12 flex-wrap">
            <ScoreDisplay
              score={vendor.combinedQualityScore}
              label="Combined Score"
              size="lg"
            />
            <ScoreDisplay
              score={vendor.averageQsScore}
              label="QS Average"
              size="md"
            />
            <ScoreDisplay
              score={vendor.averageLqaScore}
              label="LQA Average"
              size="md"
            />
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-lg font-bold text-white">
                {vendor.totalReviewsCount ?? 0}
              </span>
              <span className="text-[10px] text-white/40 uppercase tracking-wide">
                Total Reviews
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quality Trend Chart */}
      {chartData.length >= 2 && (
        <Card className="bg-white/[0.03] border-white/[0.06]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-white/70 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-400" />
              Score Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="date" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} stroke="rgba(255,255,255,0.1)" />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} stroke="rgba(255,255,255,0.1)" />
                  <Tooltip contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }} />
                  <Line type="monotone" dataKey="QS" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  <Line type="monotone" dataKey="LQA" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quality Reports Table */}
      <Card className="bg-white/[0.03] border-white/[0.06]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-white/70">
            Quality Reports
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton
                  key={i}
                  className="h-10 bg-white/[0.04] rounded"
                />
              ))}
            </div>
          ) : !reports || reports.length === 0 ? (
            <div className="text-center py-8 text-white/30">
              <Star className="w-7 h-7 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No quality reports on record.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-white/[0.06] hover:bg-transparent">
                  <TableHead className="text-white/50 text-xs font-medium">Date</TableHead>
                  <TableHead className="text-white/50 text-xs font-medium">Type</TableHead>
                  <TableHead className="text-white/50 text-xs font-medium text-right">Score</TableHead>
                  <TableHead className="text-white/50 text-xs font-medium">Project</TableHead>
                  <TableHead className="text-white/50 text-xs font-medium">Account</TableHead>
                  <TableHead className="text-white/50 text-xs font-medium">Reviewer</TableHead>
                  <TableHead className="text-white/50 text-xs font-medium">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((report) => (
                  <TableRow
                    key={report.id}
                    className="border-white/[0.04] hover:bg-white/[0.02]"
                  >
                    <TableCell className="text-white/70 text-sm">
                      {formatDate(report.reportDate)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className="text-[10px] bg-white/[0.06] text-white/70 border-transparent capitalize"
                      >
                        {report.reportType || "\u2014"}
                      </Badge>
                    </TableCell>
                    <TableCell className={`text-sm text-right font-bold ${getScoreColor(report)}`}>
                      {getReportScore(report)}
                    </TableCell>
                    <TableCell className="text-white/70 text-sm">
                      {report.projectName || report.projectTitle || report.projectId || "\u2014"}
                    </TableCell>
                    <TableCell className="text-white/50 text-sm">
                      {report.clientAccount || report.account || "\u2014"}
                    </TableCell>
                    <TableCell className="text-white/50 text-sm">
                      {report.reviewerName || "\u2014"}
                    </TableCell>
                    <TableCell>
                      {report.status ? (
                        <Badge
                          variant="outline"
                          className="text-[10px] capitalize border-white/[0.12] text-white/50"
                        >
                          {report.status}
                        </Badge>
                      ) : (
                        "\u2014"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Tab: Performance ──

function PerformanceTab({
  vendorId,
  vendor,
}: {
  vendorId: string;
  vendor: Vendor;
}) {
  const { data: performance, isLoading } = useQuery<PerformanceData>({
    queryKey: [`/api/vendors/${vendorId}/performance`],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/vendors/${vendorId}/performance`,
      );
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-48 bg-white/[0.04] rounded-xl" />
        ))}
      </div>
    );
  }

  const qsData = performance?.qsTrend || [];
  const lqaData = performance?.lqaTrend || [];

  return (
    <div className="space-y-4">
      {/* Volume Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-white/[0.03] border border-white/[0.06] rounded-xl shadow-lg">
          <CardContent className="pt-5 pb-4">
            <div className="flex flex-col items-center gap-1">
              <span className="text-2xl font-bold text-white">
                {performance?.totalJobs ?? 0}
              </span>
              <span className="text-[10px] text-white/40 uppercase tracking-wider font-medium">
                Total Jobs
              </span>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white/[0.03] border border-white/[0.06] rounded-xl shadow-lg">
          <CardContent className="pt-5 pb-4">
            <div className="flex flex-col items-center gap-1">
              <span className="text-2xl font-bold text-white">
                {(performance?.totalWordCount ?? 0).toLocaleString()}
              </span>
              <span className="text-[10px] text-white/40 uppercase tracking-wider font-medium">
                Total Words
              </span>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white/[0.03] border border-white/[0.06] rounded-xl shadow-lg">
          <CardContent className="pt-5 pb-4">
            <div className="flex flex-col items-center gap-1">
              <span className="text-2xl font-bold text-white">
                {vendor.currency || "EUR"} {(performance?.totalEarnings ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-white/40 uppercase tracking-wider font-medium">
                Total Earnings
              </span>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white/[0.03] border border-white/[0.06] rounded-xl shadow-lg">
          <CardContent className="pt-5 pb-4">
            <div className="flex flex-col items-center gap-2">
              <span className="text-2xl font-bold text-white">
                {performance?.onTimeRate != null ? `${performance.onTimeRate}%` : "\u2014"}
              </span>
              <span className="text-[10px] text-white/40 uppercase tracking-wider font-medium">
                On-Time Delivery
              </span>
              {performance?.onTimeRate != null && (
                <Progress
                  value={performance.onTimeRate}
                  className="h-2 w-full bg-white/[0.06]"
                />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* QS Score Trend */}
      <Card className="bg-white/[0.03] border border-white/[0.06] rounded-xl shadow-lg">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-white/70 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-teal-400" />
            QS Score Trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          {qsData.length >= 2 ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={qsData} style={{ background: "transparent" }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
                    stroke="rgba(255,255,255,0.1)"
                  />
                  <YAxis
                    tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
                    stroke="rgba(255,255,255,0.1)"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1a1a2e",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8,
                      color: "#fff",
                      fontSize: 12,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="#14b8a6"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#14b8a6" }}
                    connectNulls
                    name="QS Score"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="text-center py-8 text-white/30">
              <BarChart3 className="w-7 h-7 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Not enough QS data points for a trend chart.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* LQA Score Trend */}
      <Card className="bg-white/[0.03] border border-white/[0.06] rounded-xl shadow-lg">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-white/70 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            LQA Score Trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          {lqaData.length >= 2 ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lqaData} style={{ background: "transparent" }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
                    stroke="rgba(255,255,255,0.1)"
                  />
                  <YAxis
                    tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
                    stroke="rgba(255,255,255,0.1)"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1a1a2e",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8,
                      color: "#fff",
                      fontSize: 12,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#10b981" }}
                    connectNulls
                    name="LQA Score"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="text-center py-8 text-white/30">
              <BarChart3 className="w-7 h-7 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Not enough LQA data points for a trend chart.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Current Scores Summary */}
      <Card className="bg-white/[0.03] border border-white/[0.06] rounded-xl shadow-lg">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-white/70 flex items-center gap-2">
            <Star className="w-4 h-4 text-amber-400" />
            Current Scores
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-12 flex-wrap">
            <ScoreDisplay
              score={vendor.averageQsScore}
              label="QS Average"
              size="lg"
            />
            <ScoreDisplay
              score={vendor.averageLqaScore}
              label="LQA Average"
              size="lg"
            />
            <ScoreDisplay
              score={vendor.combinedQualityScore}
              label="Combined"
              size="lg"
            />
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-3xl font-bold text-white">
                {vendor.totalReviewsCount ?? 0}
              </span>
              <span className="text-xs text-white/40 uppercase tracking-wide">
                Total Reviews
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Tab: Documents ──

function DocumentsTab({
  vendorId,
  vendor,
}: {
  vendorId: string;
  vendor: Vendor;
}) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadDocType, setUploadDocType] = useState("Other");

  const { data: documents, isLoading } = useQuery<VendorFileUpload[]>({
    queryKey: [`/api/vendors/${vendorId}/documents`],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/vendors/${vendorId}/documents`,
      );
      return res.json();
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("docType", uploadDocType);
      const res = await fetch(`/api/vendors/${vendorId}/documents`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error || "Upload failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/vendors/${vendorId}/documents`],
      });
      toast({ title: "Document uploaded" });
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    onError: (err: Error) => {
      toast({
        title: "Upload failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (docId: number) => {
      await apiRequest(
        "DELETE",
        `/api/vendors/${vendorId}/documents/${docId}`,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/vendors/${vendorId}/documents`],
      });
      toast({ title: "Document deleted" });
    },
    onError: (err: Error) => {
      toast({
        title: "Delete failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      uploadMutation.mutate(file);
    }
  }

  function formatFileSize(bytes?: number | null): string {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const docTypeBadgeColors: Record<string, string> = {
    CV: "bg-blue-500/15 text-blue-400 border-blue-500/25",
    NDA: "bg-purple-500/15 text-purple-400 border-purple-500/25",
    Certificate: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
    "Test Result": "bg-amber-500/15 text-amber-400 border-amber-500/25",
    Contract: "bg-cyan-500/15 text-cyan-400 border-cyan-500/25",
    Other: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
  };

  return (
    <div className="space-y-4">
      {/* Checklist */}
      <Card className="bg-white/[0.03] border border-white/[0.06] rounded-xl shadow-lg">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-white/70 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-400" />
            Checklist
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-2">
              <BooleanIcon value={vendor.ndaSigned} />
              <span className="text-sm text-white/70">NDA Signed</span>
            </div>
            <div className="flex items-center gap-2">
              <BooleanIcon value={vendor.tested} />
              <span className="text-sm text-white/70">Tested</span>
            </div>
            <div className="flex items-center gap-2">
              <BooleanIcon value={vendor.certified} />
              <span className="text-sm text-white/70">Certified</span>
            </div>
            <div className="flex items-center gap-2">
              <BooleanIcon value={vendor.canDoLqa} />
              <span className="text-sm text-white/70">Can Do LQA</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Legacy Document Links */}
      <Card className="bg-white/[0.03] border border-white/[0.06] rounded-xl shadow-lg">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-white/70 flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-purple-400" />
            Profile Documents
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-white/[0.04]">
            <div className="flex items-center gap-3">
              <FileCheck className="w-4 h-4 text-white/30" />
              <span className="text-sm text-white/70">CV / Resume</span>
            </div>
            {vendor.cvFileUrl ? (
              <a
                href={vendor.cvFileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
              >
                View <ExternalLink className="w-3 h-3" />
              </a>
            ) : (
              <span className="text-sm text-white/30">Not uploaded</span>
            )}
          </div>
          <div className="flex items-center justify-between py-2 border-b border-white/[0.04]">
            <div className="flex items-center gap-3">
              <FileCheck className="w-4 h-4 text-white/30" />
              <span className="text-sm text-white/70">NDA</span>
            </div>
            {vendor.ndaFileUrl ? (
              <a
                href={vendor.ndaFileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
              >
                View <ExternalLink className="w-3 h-3" />
              </a>
            ) : (
              <span className="text-sm text-white/30">Not uploaded</span>
            )}
          </div>
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-3">
              <FileCheck className="w-4 h-4 text-white/30" />
              <span className="text-sm text-white/70">Portfolio</span>
            </div>
            {vendor.portfolioFileUrl ? (
              <a
                href={vendor.portfolioFileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
              >
                View <ExternalLink className="w-3 h-3" />
              </a>
            ) : (
              <span className="text-sm text-white/30">Not uploaded</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Upload + Document List */}
      <Card className="bg-white/[0.03] border border-white/[0.06] rounded-xl shadow-lg">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium text-white/70 flex items-center gap-2">
            <Upload className="w-4 h-4 text-teal-400" />
            Uploaded Documents
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={uploadDocType} onValueChange={setUploadDocType}>
              <SelectTrigger className="w-32 bg-white/[0.04] border-white/[0.08] text-white text-xs h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#1a1d27] border-white/[0.08]">
                {DOCUMENT_TYPES.map((t) => (
                  <SelectItem
                    key={t}
                    value={t}
                    className="text-white text-xs"
                  >
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileSelect}
            />
            <Button
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadMutation.isPending}
              className="h-8 bg-blue-600 hover:bg-blue-500 text-white text-xs"
            >
              {uploadMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5 mr-1.5" />
              )}
              Upload
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton
                  key={i}
                  className="h-12 bg-white/[0.04] rounded"
                />
              ))}
            </div>
          ) : !documents || documents.length === 0 ? (
            <div className="text-center py-8 text-white/30">
              <FileText className="w-7 h-7 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No documents uploaded yet.</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="mt-2 text-blue-400 hover:text-blue-300 text-xs"
              >
                <Upload className="w-3.5 h-3.5 mr-1.5" />
                Upload your first document
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between py-3 px-3 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.03] transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge
                      variant="secondary"
                      className={`text-[10px] shrink-0 border ${docTypeBadgeColors[doc.docType] || docTypeBadgeColors.Other}`}
                    >
                      {doc.docType}
                    </Badge>
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate">
                        {doc.fileName}
                      </p>
                      <p className="text-[11px] text-white/30">
                        {formatDate(doc.uploadedAt)}
                        {doc.fileSize ? ` \u00B7 ${formatFileSize(doc.fileSize)}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-3">
                    <a
                      href={doc.fileUrl}
                      download={doc.fileName}
                      className="inline-flex"
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-white/30 hover:text-blue-400 hover:bg-blue-500/10"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </Button>
                    </a>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(doc.id)}
                      disabled={deleteMutation.isPending}
                      className="h-7 w-7 p-0 text-white/30 hover:text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Tab: Activity ──

function ActivityTab({ vendorId }: { vendorId: string }) {
  const { data: activities, isLoading } = useQuery<ActivityLogEntry[]>({
    queryKey: [`/api/vendors/${vendorId}/activities`],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/vendors/${vendorId}/activities`,
      );
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-14 bg-white/[0.04] rounded-lg" />
        ))}
      </div>
    );
  }

  if (!activities || activities.length === 0) {
    return (
      <div className="text-center py-12 text-white/30">
        <Activity className="w-8 h-8 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No activity recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute left-[19px] top-2 bottom-2 w-px bg-white/[0.06]" />
      <div className="space-y-1">
        {activities.map((entry) => (
          <div key={entry.id} className="flex items-start gap-4 py-3 pl-1">
            <div className="w-9 h-9 rounded-full bg-[#1a1d27] border border-white/[0.10] flex items-center justify-center shrink-0 z-10">
              <Activity className="w-3.5 h-3.5 text-white/40" />
            </div>
            <div className="flex-1 min-w-0 pt-1">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <Badge
                  variant="secondary"
                  className="text-[10px] bg-white/[0.06] text-white/60 border-transparent capitalize"
                >
                  {entry.activityType}
                </Badge>
                <span className="text-[11px] text-white/20">
                  {formatDateTime(entry.createdAt)}
                </span>
              </div>
              {entry.description && (
                <p className="text-sm text-white/80 mt-0.5">
                  {entry.description}
                </p>
              )}
              {(entry.oldValue || entry.newValue) && (
                <div className="mt-1 flex items-center gap-2 text-xs">
                  {entry.oldValue && (
                    <span className="text-red-400/60 line-through">
                      {entry.oldValue}
                    </span>
                  )}
                  {entry.oldValue && entry.newValue && (
                    <ChevronRight className="w-3 h-3 text-white/20" />
                  )}
                  {entry.newValue && (
                    <span className="text-emerald-400/80">
                      {entry.newValue}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab: Notes ──

function NotesTab({ vendorId }: { vendorId: string }) {
  const { toast } = useToast();

  const [newContent, setNewContent] = useState("");
  const [newNoteType, setNewNoteType] = useState("info");
  const [newVisibility, setNewVisibility] = useState("team");

  const { data: notes, isLoading } = useQuery<VendorNote[]>({
    queryKey: [`/api/vendors/${vendorId}/notes`],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/vendors/${vendorId}/notes`,
      );
      return res.json();
    },
  });

  const addNoteMutation = useMutation({
    mutationFn: async (data: {
      content: string;
      noteType: string;
      visibility: string;
    }) => {
      const res = await apiRequest(
        "POST",
        `/api/vendors/${vendorId}/notes`,
        data,
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/vendors/${vendorId}/notes`],
      });
      setNewContent("");
      setNewNoteType("info");
      setNewVisibility("team");
      toast({ title: "Note added", description: "Your note has been saved." });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to add note",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: number) => {
      await apiRequest("DELETE", `/api/vendors/${vendorId}/notes/${noteId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/vendors/${vendorId}/notes`],
      });
      toast({ title: "Note deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete note", description: err.message, variant: "destructive" });
    },
  });

  function handleAddNote() {
    if (!newContent.trim()) return;
    addNoteMutation.mutate({
      content: newContent.trim(),
      noteType: newNoteType,
      visibility: newVisibility,
    });
  }

  const noteTypeColors: Record<string, string> = {
    info: "bg-blue-500/15 text-blue-400 border-blue-500/25",
    warning: "bg-amber-500/15 text-amber-400 border-amber-500/25",
    note: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
  };

  const visibilityColors: Record<string, string> = {
    team: "border-emerald-500/25 text-emerald-400",
    private: "border-purple-500/25 text-purple-400",
  };

  return (
    <div className="space-y-4">
      <Card className="bg-white/[0.03] border-white/[0.06]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-white/70 flex items-center gap-2">
            <Plus className="w-3.5 h-3.5" />
            Add Note
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Write a note..."
            className="bg-white/[0.04] border-white/[0.08] text-white text-sm placeholder:text-white/30 min-h-[80px] resize-none"
          />
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={newNoteType} onValueChange={setNewNoteType}>
              <SelectTrigger className="w-32 bg-white/[0.04] border-white/[0.08] text-white text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#1a1d27] border-white/[0.08]">
                {["info", "warning", "note"].map((t) => (
                  <SelectItem
                    key={t}
                    value={t}
                    className="text-white capitalize text-xs"
                  >
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={newVisibility} onValueChange={setNewVisibility}>
              <SelectTrigger className="w-28 bg-white/[0.04] border-white/[0.08] text-white text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#1a1d27] border-white/[0.08]">
                {["team", "private"].map((v) => (
                  <SelectItem
                    key={v}
                    value={v}
                    className="text-white capitalize text-xs"
                  >
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={handleAddNote}
              disabled={!newContent.trim() || addNoteMutation.isPending}
              size="sm"
              className="bg-blue-600 hover:bg-blue-500 text-white ml-auto"
            >
              {addNoteMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5 mr-1.5" />
              )}
              Add Note
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <Skeleton
              key={i}
              className="h-20 bg-white/[0.04] rounded-lg"
            />
          ))}
        </div>
      ) : !notes || notes.length === 0 ? (
        <div className="text-center py-8 text-white/30">
          <StickyNote className="w-7 h-7 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No notes yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div
              key={note.id}
              className="p-4 rounded-lg bg-white/[0.03] border border-white/[0.06]"
            >
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {note.noteType && (
                    <Badge
                      variant="secondary"
                      className={`text-[10px] capitalize border ${noteTypeColors[note.noteType] || "bg-white/[0.06] text-white/60 border-transparent"}`}
                    >
                      {note.noteType}
                    </Badge>
                  )}
                  {note.visibility && (
                    <Badge
                      variant="outline"
                      className={`text-[10px] capitalize border ${visibilityColors[note.visibility] || "border-white/[0.12] text-white/40"}`}
                    >
                      {note.visibility}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-white/30 flex items-center gap-1.5">
                    <Calendar className="w-3 h-3" />
                    {formatDateTime(note.createdAt)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteNoteMutation.mutate(note.id)}
                    disabled={deleteNoteMutation.isPending}
                    className="h-6 w-6 p-0 text-white/20 hover:text-red-400"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">
                {note.content}
              </p>
              {note.createdBy && (
                <p className="text-[11px] text-white/30 mt-2">
                  {note.createdBy}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Scorecard Tab ──
function ScorecardTab({ vendorId }: { vendorId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: [`/api/vendors/${vendorId}/scorecard`],
    queryFn: async () => { const r = await apiRequest("GET", `/api/vendors/${vendorId}/scorecard`); return r.json(); },
  });

  if (isLoading) return <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20" />)}</div>;
  if (!data || data.totalReviews === 0) {
    return (
      <div className="text-center py-12">
        <Award className="w-10 h-10 text-white/10 mx-auto mb-3" />
        <p className="text-sm text-white/30">No quality reviews found for this vendor</p>
      </div>
    );
  }

  const trendDir = data.trend > 0 ? "Improving" : data.trend < 0 ? "Declining" : "Stable";
  const trendColor = data.trend > 0 ? "text-emerald-400" : data.trend < 0 ? "text-red-400" : "text-white/40";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="bg-white/[0.03] border-white/[0.06] border-l-4 border-l-amber-500">
          <CardContent className="p-4 text-center">
            <p className="text-[10px] text-white/30 mb-1">Avg QS</p>
            <p className="text-xl font-bold text-amber-400">{data.avgQs?.toFixed(1) || "—"}/5</p>
          </CardContent>
        </Card>
        <Card className="bg-white/[0.03] border-white/[0.06] border-l-4 border-l-blue-500">
          <CardContent className="p-4 text-center">
            <p className="text-[10px] text-white/30 mb-1">Avg LQA</p>
            <p className="text-xl font-bold text-blue-400">{data.avgLqa?.toFixed(1) || "—"}/100</p>
          </CardContent>
        </Card>
        <Card className="bg-white/[0.03] border-white/[0.06] border-l-4 border-l-emerald-500">
          <CardContent className="p-4 text-center">
            <p className="text-[10px] text-white/30 mb-1">Combined Score</p>
            <p className={`text-xl font-bold ${data.combined >= 80 ? "text-emerald-400" : data.combined >= 60 ? "text-amber-400" : "text-red-400"}`}>{data.combined?.toFixed(1) || "—"}</p>
          </CardContent>
        </Card>
        <Card className="bg-white/[0.03] border-white/[0.06] border-l-4 border-l-purple-500">
          <CardContent className="p-4 text-center">
            <p className="text-[10px] text-white/30 mb-1">Trend</p>
            <p className={`text-xl font-bold ${trendColor}`}>{trendDir}</p>
            <p className="text-[10px] text-white/20">{data.totalReviews} reviews</p>
          </CardContent>
        </Card>
      </div>

      {data.accountBreakdown?.length > 0 && (
        <Card className="bg-white/[0.03] border-white/[0.06]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-white/70">Per-Account Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-white/[0.06]">
                  <TableHead className="text-[11px] text-white/30">Account</TableHead>
                  <TableHead className="text-[11px] text-white/30 text-right">Reports</TableHead>
                  <TableHead className="text-[11px] text-white/30 text-right">Avg QS</TableHead>
                  <TableHead className="text-[11px] text-white/30 text-right">Avg LQA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.accountBreakdown.map((a: any) => (
                  <TableRow key={a.account} className="border-white/[0.03]">
                    <TableCell className="text-xs text-white">{a.account}</TableCell>
                    <TableCell className="text-xs text-white/50 text-right">{a.count}</TableCell>
                    <TableCell className="text-xs text-white/70 text-right">{a.avgQs?.toFixed(1) ?? "—"}</TableCell>
                    <TableCell className="text-xs text-white/70 text-right">{a.avgLqa?.toFixed(1) ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── CAT Discounts Tab ──
const CAT_FIELDS = [
  { key: "repetitions", label: "Repetitions", default: 0 },
  { key: "match100", label: "100% Matches", default: 10 },
  { key: "fuzzyHigh", label: "95-99% (Fuzzy High)", default: 25 },
  { key: "fuzzyMid", label: "85-94% (Fuzzy Mid)", default: 60 },
  { key: "fuzzyLow", label: "75-84% (Fuzzy Low)", default: 75 },
  { key: "fuzzyLowest", label: "50-74% (Fuzzy Lowest)", default: 100 },
  { key: "noMatch", label: "No Match (New Words)", default: 100 },
  { key: "machineTranslated", label: "Machine Translated", default: 100 },
];

function CatDiscountsTab({ vendorId }: { vendorId: string }) {
  const { toast } = useToast();
  const [localValues, setLocalValues] = useState<Record<string, number>>({});
  const [initialized, setInitialized] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: [`/api/vendors/${vendorId}/cat-discounts`],
    queryFn: async () => { const r = await apiRequest("GET", `/api/vendors/${vendorId}/cat-discounts`); return r.json(); },
  });

  const saveMutation = useMutation({
    mutationFn: async (catDiscounts: Record<string, number>) => {
      await apiRequest("PATCH", `/api/vendors/${vendorId}/cat-discounts`, { catDiscounts });
    },
    onSuccess: () => { toast({ title: "CAT discounts saved" }); queryClient.invalidateQueries({ queryKey: [`/api/vendors/${vendorId}/cat-discounts`] }); },
    onError: () => { toast({ title: "Failed to save", variant: "destructive" }); },
  });

  if (!initialized && data) {
    const disc = data.catDiscounts || {};
    const vals: Record<string, number> = {};
    for (const f of CAT_FIELDS) vals[f.key] = disc[f.key] ?? f.default;
    setLocalValues(vals);
    setInitialized(true);
  }

  if (isLoading) return <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-white/50">Percentage of per-word rate charged for each match type</p>
        <Button size="sm" onClick={() => saveMutation.mutate(localValues)} disabled={saveMutation.isPending} className="bg-blue-600 hover:bg-blue-700 text-xs">
          <Save className="w-3 h-3 mr-1" /> Save
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {CAT_FIELDS.map(f => (
          <Card key={f.key} className="bg-white/[0.03] border-white/[0.06]">
            <CardContent className="p-3">
              <Label className="text-xs text-white/50 mb-1 block">{f.label}</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={localValues[f.key] ?? f.default}
                  onChange={e => setLocalValues({ ...localValues, [f.key]: parseInt(e.target.value) || 0 })}
                  className="bg-white/5 border-white/10 text-white text-sm h-8"
                />
                <span className="text-xs text-white/30">%</span>
              </div>
              {localValues[f.key] !== f.default && (
                <Badge variant="outline" className="text-[9px] text-blue-400 border-blue-500/30 mt-1">Custom</Badge>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Availability Tab ──
const AVAIL_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const AVAIL_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const AVAIL_STATUS_COLORS: Record<string, string> = {
  available: "bg-emerald-500/30 border-emerald-500/50 text-emerald-400",
  unavailable: "bg-red-500/30 border-red-500/50 text-red-400",
  limited: "bg-amber-500/30 border-amber-500/50 text-amber-400",
};

function AvailabilityTab({ vendorId }: { vendorId: string }) {
  const { toast } = useToast();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState("available");
  const [editHours, setEditHours] = useState("8");
  const [editNotes, setEditNotes] = useState("");

  const { data: records = [], isLoading } = useQuery({
    queryKey: [`/api/vendors/${vendorId}/availability`, month + 1, year],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/vendors/${vendorId}/availability?month=${month + 1}&year=${year}`);
      return r.json();
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("POST", `/api/vendors/${vendorId}/availability`, data);
    },
    onSuccess: () => {
      toast({ title: "Availability updated" });
      queryClient.invalidateQueries({ queryKey: [`/api/vendors/${vendorId}/availability`] });
      setSelectedDate(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (date: string) => {
      await apiRequest("DELETE", `/api/vendors/${vendorId}/availability/${date}`);
    },
    onSuccess: () => {
      toast({ title: "Availability removed" });
      queryClient.invalidateQueries({ queryKey: [`/api/vendors/${vendorId}/availability`] });
      setSelectedDate(null);
    },
  });

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();

  const recordMap = new Map<string, any>();
  for (const r of records) recordMap.set(r.date, r);

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1); };

  if (isLoading) return <Skeleton className="h-[400px]" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={prevMonth} className="text-white/50 hover:text-white"><ChevronLeft className="w-4 h-4" /></Button>
        <h3 className="text-sm font-medium text-white/70">{AVAIL_MONTHS[month]} {year}</h3>
        <Button variant="ghost" size="sm" onClick={nextMonth} className="text-white/50 hover:text-white"><ChevronRight className="w-4 h-4" /></Button>
      </div>

      <div className="flex items-center gap-3 text-xs text-white/40">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Available</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Limited</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Unavailable</span>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {AVAIL_DAYS.map(d => <div key={d} className="text-center text-[10px] text-white/30 font-medium py-1">{d}</div>)}
        {[...Array(firstDay)].map((_, i) => <div key={`e-${i}`} className="h-14" />)}
        {[...Array(daysInMonth)].map((_, i) => {
          const day = i + 1;
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const record = recordMap.get(dateStr);
          const isToday = day === now.getDate() && month === now.getMonth() && year === now.getFullYear();
          const statusClass = record ? AVAIL_STATUS_COLORS[record.status] || "" : "";
          return (
            <button
              key={day}
              onClick={() => { setSelectedDate(dateStr); setEditStatus(record?.status || "available"); setEditHours(record?.hoursAvailable?.toString() || "8"); setEditNotes(record?.notes || ""); }}
              className={`h-14 rounded-lg border p-1.5 text-left transition-colors hover:bg-white/[0.06] ${isToday ? "border-blue-500/50" : "border-white/[0.04]"} ${record ? statusClass : "bg-white/[0.02]"}`}
            >
              <p className={`text-xs font-medium ${isToday ? "text-blue-400" : "text-white/50"}`}>{day}</p>
              {record && <p className="text-[9px] mt-0.5">{record.hoursAvailable}h</p>}
            </button>
          );
        })}
      </div>

      {/* Edit dialog */}
      {selectedDate && (
        <Dialog open={!!selectedDate} onOpenChange={() => setSelectedDate(null)}>
          <DialogContent className="bg-[#1a1d27] border-white/10 text-white max-w-sm">
            <DialogHeader><DialogTitle className="text-sm">Set Availability — {selectedDate}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-white/50">Status</Label>
                <Select value={editStatus} onValueChange={setEditStatus}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="limited">Limited</SelectItem>
                    <SelectItem value="unavailable">Unavailable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-white/50">Hours Available</Label>
                <Input type="number" min={0} max={24} value={editHours} onChange={e => setEditHours(e.target.value)} className="bg-white/5 border-white/10 text-white text-sm" />
              </div>
              <div>
                <Label className="text-xs text-white/50">Notes</Label>
                <Input value={editNotes} onChange={e => setEditNotes(e.target.value)} className="bg-white/5 border-white/10 text-white text-sm" placeholder="Optional notes..." />
              </div>
            </div>
            <DialogFooter className="flex gap-2">
              {recordMap.has(selectedDate) && (
                <Button variant="outline" size="sm" onClick={() => deleteMutation.mutate(selectedDate)} className="border-red-500/30 text-red-400 hover:bg-red-500/10">Remove</Button>
              )}
              <Button size="sm" onClick={() => saveMutation.mutate({ date: selectedDate, status: editStatus, hoursAvailable: parseInt(editHours) || 0, notes: editNotes })} disabled={saveMutation.isPending} className="bg-blue-600 hover:bg-blue-700">Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ── Main Page ──

export default function VendorDetailPage() {
  const params = useParams<{ id: string }>();
  const vendorId = params?.id;
  const { toast } = useToast();

  const [editOpen, setEditOpen] = useState(false);

  const {
    data: vendor,
    isLoading,
    isError,
    error,
  } = useQuery<Vendor>({
    queryKey: [`/api/vendors/${vendorId}`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/vendors/${vendorId}`);
      return res.json();
    },
    enabled: !!vendorId,
  });

  const statusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      const res = await apiRequest("PATCH", `/api/vendors/${vendorId}`, {
        status: newStatus,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/vendors/${vendorId}`],
      });
      toast({ title: "Status updated" });
    },
    onError: (err: Error) => {
      toast({
        title: "Status update failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const tierMutation = useMutation({
    mutationFn: async (newTier: string) => {
      const res = await apiRequest("PATCH", `/api/vendors/${vendorId}`, {
        tier: newTier,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/vendors/${vendorId}`],
      });
      toast({ title: "Tier updated" });
    },
    onError: (err: Error) => {
      toast({
        title: "Tier update failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  if (!vendorId) {
    return (
      <div className="flex items-center justify-center h-full text-white/40 text-sm">
        No vendor ID provided.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-20 bg-white/[0.04]" />
          <Skeleton className="h-10 w-10 rounded-full bg-white/[0.04]" />
          <Skeleton className="h-7 w-48 bg-white/[0.04]" />
        </div>
        <Skeleton className="h-10 w-full bg-white/[0.04]" />
        <Skeleton className="h-64 w-full bg-white/[0.04]" />
      </div>
    );
  }

  if (isError || !vendor) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <Link href="/vendors">
          <Button
            variant="ghost"
            size="sm"
            className="text-white/60 hover:text-white hover:bg-white/[0.06] mb-4"
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
            Back to Vendors
          </Button>
        </Link>
        <div className="text-center py-16 text-white/40">
          <AlertCircle className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">Vendor not found</p>
          <p className="text-xs text-white/25 mt-1">The vendor may have been deleted or the ID is invalid.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-6xl mx-auto p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <Link href="/vendors">
              <Button
                variant="ghost"
                size="sm"
                className="text-white/50 hover:text-white hover:bg-white/[0.06] -ml-1"
              >
                <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
                Vendors
              </Button>
            </Link>
            <div className="w-px h-5 bg-white/[0.08]" />
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-full ${getAvatarColor(vendor.fullName)} flex items-center justify-center shrink-0 text-white font-semibold text-sm`}
              >
                {getInitials(vendor.fullName)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-semibold text-white leading-tight">
                    {vendor.fullName}
                  </h1>
                  {vendor.resourceCode && (
                    <code className="text-xs bg-white/[0.06] text-white/50 px-1.5 py-0.5 rounded font-mono">
                      {vendor.resourceCode}
                    </code>
                  )}
                </div>
                <p className="text-xs text-white/40 mt-0.5">{vendor.email}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <StatusBadge status={vendor.status} />

            {/* Tier Badge + Dropdown */}
            <Select
              value={vendor.tier || "Standard"}
              onValueChange={(val) => tierMutation.mutate(val)}
            >
              <SelectTrigger className="w-auto h-auto p-0 border-0 bg-transparent shadow-none focus:ring-0 [&>svg]:hidden">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium cursor-pointer ${TIER_COLORS[vendor.tier || "Standard"] || TIER_COLORS.Standard}`}
                >
                  <Crown className="w-3 h-3" />
                  {vendor.tier || "Standard"}
                </span>
              </SelectTrigger>
              <SelectContent className="bg-[#1a1d27] border-white/[0.08]">
                {VENDOR_TIERS.map((t) => (
                  <SelectItem key={t} value={t} className="text-white text-xs">
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {vendor.combinedQualityScore != null && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.04] border border-white/[0.08]">
                <Star className="w-3.5 h-3.5 text-amber-400" />
                <span
                  className={`text-sm font-bold ${Number(vendor.combinedQualityScore) >= 90 ? "text-emerald-400" : Number(vendor.combinedQualityScore) >= 75 ? "text-amber-400" : "text-red-400"}`}
                >
                  {Number(vendor.combinedQualityScore).toFixed(1)}
                </span>
              </div>
            )}

            {vendor.valueIndex != null && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.04] border border-white/[0.08]">
                <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-sm font-bold text-cyan-400">
                  {Number(vendor.valueIndex).toFixed(1)}
                </span>
              </div>
            )}

            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditOpen(true)}
              className="text-white/60 hover:text-white hover:bg-white/[0.06] border border-white/[0.08]"
            >
              <Pencil className="w-3.5 h-3.5 mr-1.5" />
              Edit
            </Button>

            <Select
              value={vendor.status}
              onValueChange={(val) => statusMutation.mutate(val)}
            >
              <SelectTrigger className="w-auto bg-white/[0.04] border-white/[0.08] text-white text-xs h-8 gap-1.5">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="bg-[#1a1d27] border-white/[0.08]">
                {VENDOR_STATUSES.map((s) => (
                  <SelectItem key={s} value={s} className="text-white text-xs">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview">
          <TabsList className="bg-white/[0.04] border border-white/[0.06] h-auto p-1 flex flex-wrap gap-0.5">
            <TabsTrigger
              value="overview"
              className="text-xs text-white/50 data-[state=active]:text-white data-[state=active]:bg-white/[0.08] flex items-center gap-1.5 px-3 py-1.5"
            >
              <User className="w-3 h-3" />
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="languages"
              className="text-xs text-white/50 data-[state=active]:text-white data-[state=active]:bg-white/[0.08] flex items-center gap-1.5 px-3 py-1.5"
            >
              <Globe className="w-3 h-3" />
              Languages &amp; Skills
            </TabsTrigger>
            <TabsTrigger
              value="rates"
              className="text-xs text-white/50 data-[state=active]:text-white data-[state=active]:bg-white/[0.08] flex items-center gap-1.5 px-3 py-1.5"
            >
              <DollarSign className="w-3 h-3" />
              Rates &amp; Payment
            </TabsTrigger>
            <TabsTrigger
              value="quality"
              className="text-xs text-white/50 data-[state=active]:text-white data-[state=active]:bg-white/[0.08] flex items-center gap-1.5 px-3 py-1.5"
            >
              <Star className="w-3 h-3" />
              Quality
            </TabsTrigger>
            <TabsTrigger
              value="performance"
              className="text-xs text-white/50 data-[state=active]:text-white data-[state=active]:bg-white/[0.08] flex items-center gap-1.5 px-3 py-1.5"
            >
              <BarChart3 className="w-3 h-3" />
              Performance
            </TabsTrigger>
            <TabsTrigger
              value="documents"
              className="text-xs text-white/50 data-[state=active]:text-white data-[state=active]:bg-white/[0.08] flex items-center gap-1.5 px-3 py-1.5"
            >
              <FileText className="w-3 h-3" />
              Documents
            </TabsTrigger>
            <TabsTrigger
              value="scorecard"
              className="text-xs text-white/50 data-[state=active]:text-white data-[state=active]:bg-white/[0.08] flex items-center gap-1.5 px-3 py-1.5"
            >
              <Award className="w-3 h-3" />
              Scorecard
            </TabsTrigger>
            <TabsTrigger
              value="cat-discounts"
              className="text-xs text-white/50 data-[state=active]:text-white data-[state=active]:bg-white/[0.08] flex items-center gap-1.5 px-3 py-1.5"
            >
              <Percent className="w-3 h-3" />
              CAT Discounts
            </TabsTrigger>
            <TabsTrigger
              value="availability"
              className="text-xs text-white/50 data-[state=active]:text-white data-[state=active]:bg-white/[0.08] flex items-center gap-1.5 px-3 py-1.5"
            >
              <CalendarIcon className="w-3 h-3" />
              Availability
            </TabsTrigger>
            <TabsTrigger
              value="activity"
              className="text-xs text-white/50 data-[state=active]:text-white data-[state=active]:bg-white/[0.08] flex items-center gap-1.5 px-3 py-1.5"
            >
              <Activity className="w-3 h-3" />
              Activity
            </TabsTrigger>
            <TabsTrigger
              value="notes"
              className="text-xs text-white/50 data-[state=active]:text-white data-[state=active]:bg-white/[0.08] flex items-center gap-1.5 px-3 py-1.5"
            >
              <StickyNote className="w-3 h-3" />
              Notes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <OverviewTab vendor={vendor} />
          </TabsContent>

          <TabsContent value="languages" className="mt-4">
            <LanguagesTab vendorId={vendorId} vendor={vendor} />
          </TabsContent>

          <TabsContent value="rates" className="mt-4">
            <RatesTab vendorId={vendorId} vendor={vendor} />
          </TabsContent>

          <TabsContent value="quality" className="mt-4">
            <QualityTab vendorId={vendorId} vendor={vendor} />
          </TabsContent>

          <TabsContent value="performance" className="mt-4">
            <PerformanceTab vendorId={vendorId} vendor={vendor} />
          </TabsContent>

          <TabsContent value="documents" className="mt-4">
            <DocumentsTab vendorId={vendorId} vendor={vendor} />
          </TabsContent>

          <TabsContent value="activity" className="mt-4">
            <ActivityTab vendorId={vendorId} />
          </TabsContent>

          <TabsContent value="notes" className="mt-4">
            <NotesTab vendorId={vendorId} />
          </TabsContent>

          <TabsContent value="scorecard" className="mt-4">
            <ScorecardTab vendorId={vendorId} />
          </TabsContent>

          <TabsContent value="cat-discounts" className="mt-4">
            <CatDiscountsTab vendorId={vendorId} />
          </TabsContent>

          <TabsContent value="availability" className="mt-4">
            <AvailabilityTab vendorId={vendorId} />
          </TabsContent>
        </Tabs>
      </div>

      {editOpen && (
        <EditVendorDialog
          vendor={vendor}
          open={editOpen}
          onClose={() => setEditOpen(false)}
        />
      )}
    </div>
  );
}
