import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Activity,
  StickyNote,
  Plus,
  Trash2,
  Calendar,
  User,
  Mail,
  Phone,
  Building,
  CheckCircle2,
  Clock,
  AlertCircle,
  Download,
  ChevronDown,
  Shield,
  Award,
  ArrowRight,
  ExternalLink,
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

const ALL_STATUSES = Object.keys(STATUS_COLORS);

const SERVICE_TYPES = [
  "Translation", "Editing", "Proofreading", "Review", "MTPE",
  "Transcreation", "Copywriting", "DTP", "Subtitling", "Voiceover",
  "Interpretation", "Localization", "QA", "LQA",
];

const RATE_TYPES = ["per_word", "per_hour", "per_page", "per_minute", "flat"];
const CURRENCIES = ["USD", "EUR", "GBP", "TRY"];

// ── Types ──

interface AddressObj {
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

interface AccountQualityScore {
  account: string;
  combinedScore?: string | null;
  lqaScore?: string | null;
  qsScore?: string | null;
  reviewCount?: number | null;
}

interface CatDiscounts {
  repetitions?: number | null;
  perfect?: number | null;
  contextMatch?: number | null;
  crossFileRepetitions?: number | null;
  match100?: number | null;
  match9599?: number | null;
  match8594?: number | null;
  match7584?: number | null;
  noMatch?: number | null;
}

interface PaymentInfoObj {
  method?: string;
  bankName?: string;
  bankCountry?: string;
  iban?: string;
  swift?: string;
  accountHolder?: string;
  paypalEmail?: string;
  wiseEmail?: string;
  [key: string]: string | undefined;
}

interface TaxInfoObj {
  vatNumber?: string;
  taxId?: string;
  [key: string]: string | undefined;
}

interface VendorDetail {
  id: number;
  resourceCode: string | null;
  fullName: string;
  email: string;
  email2: string | null;
  phone: string | null;
  phone2: string | null;
  phone3: string | null;
  address: AddressObj | null;
  location: string | null;
  website: string | null;
  skype: string | null;
  gender: string | null;
  companyName: string | null;
  profilePictureUrl: string | null;
  resourceType: string | null;
  nativeLanguage: string | null;
  translationSpecializations: string[] | null;
  otherProfessionalSkills: string[] | null;
  technicalSkills: string[] | null;
  serviceTypes: string[] | null;
  software: string[] | null;
  experienceYears: number | null;
  education: string | null;
  certifications: string[] | null;
  rates: Record<string, unknown>[] | null;
  catDiscounts: CatDiscounts | null;
  currency: string | null;
  minimumFee: string | null;
  minimumProjectFee: string | null;
  paymentInfo: PaymentInfoObj | null;
  taxInfo: TaxInfoObj | null;
  status: string;
  assignedTo: number | null;
  followUpDate: string | null;
  followUpNote: string | null;
  combinedQualityScore: string | null;
  averageLqaScore: string | null;
  averageQsScore: string | null;
  totalReviewsCount: number | null;
  accountQualityScores: AccountQualityScore[] | null;
  valueIndex: string | null;
  cvFileUrl: string | null;
  ndaFileUrl: string | null;
  portfolioFileUrl: string | null;
  ndaSigned: boolean | null;
  tested: boolean | null;
  certified: boolean | null;
  availability: string | null;
  accounts: string[] | null;
  specializations: string[] | null;
  tags: string[] | null;
  canDoLqa: boolean | null;
  notes: string | null;
  specialInstructions: string | null;
  createdAt: string;
  updatedAt: string;
}

interface LanguagePair {
  id: number;
  sourceLanguage: string;
  targetLanguage: string;
  isPrimary: boolean;
}

interface RateCard {
  id: number;
  sourceLanguage: string;
  targetLanguage: string;
  serviceType: string;
  rateType: string;
  rateValue: string;
  currency: string;
  specialization: string | null;
  account: string | null;
}

interface QualityReport {
  id: number;
  reportDate: string;
  reportType: string;
  score: string | number;
  projectCode: string | null;
  account: string | null;
  languagePair: string | null;
  status: string | null;
  feedback: string | null;
}

interface VendorDocument {
  id: number;
  fileName: string;
  fileType: string | null;
  documentType: string | null;
  uploadedAt: string;
  fileUrl: string | null;
  signatureUrl: string | null;
}

interface ActivityLogEntry {
  id: number;
  action: string;
  activityType: string | null;
  description: string | null;
  oldValue: string | null;
  newValue: string | null;
  performedBy: string | null;
  createdAt: string;
}

interface VendorNote {
  id: number;
  content: string;
  noteType: string | null;
  visibility: string | null;
  createdBy: string | null;
  createdAt: string;
}

interface UserItem {
  id: number;
  name: string;
  email: string;
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

function timeAgo(dateStr?: string | null): string {
  if (!dateStr) return "\u2014";
  const s = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function formatAddress(addr: AddressObj | null): string {
  if (!addr) return "\u2014";
  const parts = [addr.address1, addr.address2, addr.city, addr.state, addr.zip, addr.country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "\u2014";
}

function qualityScoreColor(score: number | null | undefined): string {
  if (score == null) return "text-zinc-400";
  if (score >= 4.5) return "text-emerald-400";
  if (score >= 3.5) return "text-blue-400";
  return "text-amber-400";
}

function qualityBgColor(score: number | null | undefined): string {
  if (score == null) return "bg-zinc-500/10 border-zinc-500/20";
  if (score >= 4.5) return "bg-emerald-500/10 border-emerald-500/20";
  if (score >= 3.5) return "bg-blue-500/10 border-blue-500/20";
  return "bg-amber-500/10 border-amber-500/20";
}

function parseScore(val: string | number | null | undefined): number | null {
  if (val == null) return null;
  const n = typeof val === "number" ? val : parseFloat(val);
  return isNaN(n) ? null : n;
}

function StatusBadge({ status }: { status: string }) {
  const colorClass = STATUS_COLORS[status] ?? "bg-zinc-500/15 text-zinc-400 border-zinc-500/25";
  return (
    <span className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold ${colorClass}`}>
      {status}
    </span>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm py-1.5">
      <span className="text-white/50">{label}</span>
      <span className={`text-white ${mono ? "font-mono text-xs" : ""}`}>{value || "\u2014"}</span>
    </div>
  );
}

function BadgeList({ items, color = "bg-white/[0.06] text-white/70 border-transparent" }: { items: string[] | null; color?: string }) {
  if (!items || items.length === 0) return <span className="text-xs text-white/30">None</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <Badge key={i} variant="secondary" className={`text-[11px] ${color}`}>
          {item}
        </Badge>
      ))}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">{children}</p>;
}

// ── Status Change Dialog ──

function StatusChangeDialog({
  vendor,
  open,
  onClose,
}: {
  vendor: VendorDetail;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newStatus, setNewStatus] = useState(vendor.status);

  const mutation = useMutation({
    mutationFn: async (status: string) => {
      const res = await apiRequest("PATCH", `/api/vendors/${vendor.id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/vendors/${vendor.id}`] });
      toast({ title: "Status updated", description: `Vendor status changed to ${newStatus}.` });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-[#1a1d27] border-white/[0.08] text-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-white text-base font-semibold">Change Status</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Label className="text-xs text-white/60">New Status</Label>
          <Select value={newStatus} onValueChange={setNewStatus}>
            <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1d27] border-white/[0.08]">
              {ALL_STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="text-white text-sm">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} className="text-white/60 hover:text-white hover:bg-white/[0.06]">
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate(newStatus)}
            disabled={mutation.isPending || newStatus === vendor.status}
            className="bg-blue-600 hover:bg-blue-500 text-white"
          >
            {mutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
            Update Status
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Vendor Dialog ──

function EditVendorDialog({
  vendor,
  open,
  onClose,
}: {
  vendor: VendorDetail;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [fullName, setFullName] = useState(vendor.fullName);
  const [email, setEmail] = useState(vendor.email);
  const [email2, setEmail2] = useState(vendor.email2 ?? "");
  const [phone, setPhone] = useState(vendor.phone ?? "");
  const [phone2, setPhone2] = useState(vendor.phone2 ?? "");
  const [phone3, setPhone3] = useState(vendor.phone3 ?? "");
  const [companyName, setCompanyName] = useState(vendor.companyName ?? "");
  const [website, setWebsite] = useState(vendor.website ?? "");
  const [skype, setSkype] = useState(vendor.skype ?? "");
  const [location, setLocation] = useState(vendor.location ?? "");
  const [resourceType, setResourceType] = useState(vendor.resourceType ?? "");
  const [nativeLanguage, setNativeLanguage] = useState(vendor.nativeLanguage ?? "");
  const [experienceYears, setExperienceYears] = useState(vendor.experienceYears?.toString() ?? "");
  const [education, setEducation] = useState(vendor.education ?? "");
  const [availability, setAvailability] = useState(vendor.availability ?? "");
  const [assignedTo, setAssignedTo] = useState(vendor.assignedTo?.toString() ?? "");
  const [specialInstructions, setSpecialInstructions] = useState(vendor.specialInstructions ?? "");

  const { data: users } = useQuery<UserItem[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/users");
      return res.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("PATCH", `/api/vendors/${vendor.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/vendors/${vendor.id}`] });
      toast({ title: "Vendor updated", description: "Changes saved successfully." });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
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
      companyName: companyName || null,
      website: website || null,
      skype: skype || null,
      location: location || null,
      resourceType: resourceType || null,
      nativeLanguage: nativeLanguage || null,
      experienceYears: experienceYears ? parseInt(experienceYears) : null,
      education: education || null,
      availability: availability || null,
      assignedTo: assignedTo ? parseInt(assignedTo) : null,
      specialInstructions: specialInstructions || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-[#1a1d27] border-white/[0.08] text-white max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white text-base font-semibold">Edit Vendor Profile</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Full Name</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="bg-white/[0.04] border-white/[0.08] text-white text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} className="bg-white/[0.04] border-white/[0.08] text-white text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Email 2</Label>
              <Input value={email2} onChange={(e) => setEmail2(e.target.value)} className="bg-white/[0.04] border-white/[0.08] text-white text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Company</Label>
              <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="bg-white/[0.04] border-white/[0.08] text-white text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="bg-white/[0.04] border-white/[0.08] text-white text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Phone 2</Label>
              <Input value={phone2} onChange={(e) => setPhone2(e.target.value)} className="bg-white/[0.04] border-white/[0.08] text-white text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Phone 3</Label>
              <Input value={phone3} onChange={(e) => setPhone3(e.target.value)} className="bg-white/[0.04] border-white/[0.08] text-white text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Website</Label>
              <Input value={website} onChange={(e) => setWebsite(e.target.value)} className="bg-white/[0.04] border-white/[0.08] text-white text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Skype</Label>
              <Input value={skype} onChange={(e) => setSkype(e.target.value)} className="bg-white/[0.04] border-white/[0.08] text-white text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Location</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} className="bg-white/[0.04] border-white/[0.08] text-white text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Resource Type</Label>
              <Select value={resourceType || "none"} onValueChange={(v) => setResourceType(v === "none" ? "" : v)}>
                <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1d27] border-white/[0.08]">
                  <SelectItem value="none" className="text-white/50 text-sm">Not set</SelectItem>
                  {["Freelancer", "Agency", "In-house"].map((t) => (
                    <SelectItem key={t} value={t} className="text-white text-sm">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Native Language</Label>
              <Select value={nativeLanguage || "none"} onValueChange={(v) => setNativeLanguage(v === "none" ? "" : v)}>
                <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1d27] border-white/[0.08]">
                  <SelectItem value="none" className="text-white/50 text-sm">Not set</SelectItem>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l} value={l} className="text-white text-sm">{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Experience (years)</Label>
              <Input type="number" value={experienceYears} onChange={(e) => setExperienceYears(e.target.value)} className="bg-white/[0.04] border-white/[0.08] text-white text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Availability</Label>
              <Select value={availability || "none"} onValueChange={(v) => setAvailability(v === "none" ? "" : v)}>
                <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1d27] border-white/[0.08]">
                  <SelectItem value="none" className="text-white/50 text-sm">Not set</SelectItem>
                  {["Available", "Busy", "On Leave", "Unavailable"].map((a) => (
                    <SelectItem key={a} value={a} className="text-white text-sm">{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Education</Label>
              <Input value={education} onChange={(e) => setEducation(e.target.value)} className="bg-white/[0.04] border-white/[0.08] text-white text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Assigned To</Label>
              <Select value={assignedTo || "none"} onValueChange={(v) => setAssignedTo(v === "none" ? "" : v)}>
                <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1d27] border-white/[0.08]">
                  <SelectItem value="none" className="text-white/50 text-sm">Unassigned</SelectItem>
                  {(users ?? []).map((u) => (
                    <SelectItem key={u.id} value={u.id.toString()} className="text-white text-sm">{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-white/60">Special Instructions</Label>
            <Textarea
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value)}
              className="bg-white/[0.04] border-white/[0.08] text-white text-sm min-h-[60px] resize-none"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} className="text-white/60 hover:text-white hover:bg-white/[0.06]">
            <X className="w-3.5 h-3.5 mr-1.5" />Cancel
          </Button>
          <Button onClick={handleSave} disabled={updateMutation.isPending} className="bg-blue-600 hover:bg-blue-500 text-white">
            {updateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Tab 1: Overview ──

function OverviewTab({ vendor }: { vendor: VendorDetail }) {
  const score = parseScore(vendor.combinedQualityScore);
  const valueIdx = parseScore(vendor.valueIndex);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Contact Info */}
        <Card className="bg-white/[0.03] border-white/[0.06]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-white/70 flex items-center gap-2">
              <Mail className="w-4 h-4 text-blue-400" />
              Contact Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <InfoRow label="Email" value={vendor.email} />
            {vendor.email2 && <InfoRow label="Email 2" value={vendor.email2} />}
            <InfoRow label="Phone" value={vendor.phone} />
            {vendor.phone2 && <InfoRow label="Phone 2" value={vendor.phone2} />}
            {vendor.phone3 && <InfoRow label="Phone 3" value={vendor.phone3} />}
            <div className="flex items-center justify-between text-sm py-1.5">
              <span className="text-white/50">Address</span>
              <span className="text-white text-right max-w-[60%] text-xs">{formatAddress(vendor.address)}</span>
            </div>
            <InfoRow label="Location" value={vendor.location} />
            {vendor.website && (
              <div className="flex items-center justify-between text-sm py-1.5">
                <span className="text-white/50">Website</span>
                <a href={vendor.website.startsWith("http") ? vendor.website : `https://${vendor.website}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 text-xs flex items-center gap-1">
                  {vendor.website} <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
            <InfoRow label="Skype" value={vendor.skype} />
          </CardContent>
        </Card>

        {/* Professional Summary */}
        <Card className="bg-white/[0.03] border-white/[0.06]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-white/70 flex items-center gap-2">
              <Building className="w-4 h-4 text-purple-400" />
              Professional Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <InfoRow label="Resource Type" value={vendor.resourceType} />
            <InfoRow label="Company" value={vendor.companyName} />
            <InfoRow label="Native Language" value={vendor.nativeLanguage} />
            <InfoRow label="Experience" value={vendor.experienceYears != null ? `${vendor.experienceYears} years` : null} />
            <InfoRow label="Education" value={vendor.education} />
            <div className="pt-2">
              <SectionLabel>Certifications</SectionLabel>
              <BadgeList items={vendor.certifications} color="bg-purple-500/10 text-purple-300 border-purple-500/20" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Skills & Tags Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-white/[0.03] border-white/[0.06]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-white/70">Skills & Services</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <SectionLabel>Service Types</SectionLabel>
              <BadgeList items={vendor.serviceTypes} color="bg-blue-500/10 text-blue-300 border-blue-500/20" />
            </div>
            <div>
              <SectionLabel>Specializations</SectionLabel>
              <BadgeList items={vendor.specializations ?? vendor.translationSpecializations} color="bg-emerald-500/10 text-emerald-300 border-emerald-500/20" />
            </div>
            <div>
              <SectionLabel>CAT Tools</SectionLabel>
              <BadgeList items={vendor.software} color="bg-amber-500/10 text-amber-300 border-amber-500/20" />
            </div>
            <div>
              <SectionLabel>Accounts</SectionLabel>
              <BadgeList items={vendor.accounts} color="bg-cyan-500/10 text-cyan-300 border-cyan-500/20" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/[0.03] border-white/[0.06]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-white/70">Quick Stats & Tags</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className={`rounded-lg border p-3 text-center ${qualityBgColor(score)}`}>
                <p className={`text-2xl font-bold ${qualityScoreColor(score)}`}>{score != null ? score.toFixed(2) : "\u2014"}</p>
                <p className="text-[10px] text-white/40 uppercase tracking-wide mt-0.5">Quality Score</p>
              </div>
              <div className="rounded-lg border bg-white/[0.04] border-white/[0.08] p-3 text-center">
                <p className="text-2xl font-bold text-white">{valueIdx != null ? valueIdx.toFixed(2) : "\u2014"}</p>
                <p className="text-[10px] text-white/40 uppercase tracking-wide mt-0.5">Value Index</p>
              </div>
              <div className="rounded-lg border bg-white/[0.04] border-white/[0.08] p-3 text-center">
                <p className="text-2xl font-bold text-white">{vendor.totalReviewsCount ?? 0}</p>
                <p className="text-[10px] text-white/40 uppercase tracking-wide mt-0.5">Total Reviews</p>
              </div>
              <div className="rounded-lg border bg-white/[0.04] border-white/[0.08] p-3 text-center">
                <p className="text-sm font-medium text-white">{formatDate(vendor.updatedAt)}</p>
                <p className="text-[10px] text-white/40 uppercase tracking-wide mt-0.5">Last Updated</p>
              </div>
            </div>

            {/* Availability */}
            <div>
              <SectionLabel>Availability</SectionLabel>
              <div className="flex items-center gap-2">
                {vendor.availability?.toLowerCase() === "available" ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : vendor.availability?.toLowerCase() === "busy" ? (
                  <Clock className="w-4 h-4 text-amber-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-400" />
                )}
                <span className="text-sm text-white">{vendor.availability ?? "Unknown"}</span>
              </div>
            </div>

            {/* Tags */}
            <div>
              <SectionLabel>Tags</SectionLabel>
              <BadgeList items={vendor.tags} />
            </div>

            {/* Special Instructions */}
            {vendor.specialInstructions && (
              <div>
                <SectionLabel>Special Instructions</SectionLabel>
                <p className="text-sm text-white/70 bg-white/[0.03] rounded-md p-2 border border-white/[0.06]">{vendor.specialInstructions}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Tab 2: Languages & Skills ──

function LanguagesTab({ vendorId, vendor }: { vendorId: string; vendor: VendorDetail }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [newSource, setNewSource] = useState("");
  const [newTarget, setNewTarget] = useState("");
  const [newPrimary, setNewPrimary] = useState(false);

  const { data: pairs, isLoading } = useQuery<LanguagePair[]>({
    queryKey: [`/api/vendors/${vendorId}/language-pairs`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/vendors/${vendorId}/language-pairs`);
      return res.json();
    },
  });

  const addPairMutation = useMutation({
    mutationFn: async (data: { sourceLanguage: string; targetLanguage: string; isPrimary: boolean }) => {
      const res = await apiRequest("POST", `/api/vendors/${vendorId}/language-pairs`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/vendors/${vendorId}/language-pairs`] });
      setNewSource("");
      setNewTarget("");
      setNewPrimary(false);
      toast({ title: "Language pair added" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add pair", description: err.message, variant: "destructive" });
    },
  });

  const deletePairMutation = useMutation({
    mutationFn: async (pairId: number) => {
      await apiRequest("DELETE", `/api/vendors/${vendorId}/language-pairs/${pairId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/vendors/${vendorId}/language-pairs`] });
      toast({ title: "Language pair removed" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to remove pair", description: err.message, variant: "destructive" });
    },
  });

  function handleAddPair() {
    if (!newSource || !newTarget) return;
    addPairMutation.mutate({ sourceLanguage: newSource, targetLanguage: newTarget, isPrimary: newPrimary });
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
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 bg-white/[0.04] rounded" />)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-white/[0.06] hover:bg-transparent">
                  <TableHead className="text-white/50 text-xs font-medium">Source</TableHead>
                  <TableHead className="text-white/50 text-xs font-medium">Target</TableHead>
                  <TableHead className="text-white/50 text-xs font-medium">Primary</TableHead>
                  <TableHead className="text-white/50 text-xs font-medium w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(pairs ?? []).map((pair) => (
                  <TableRow key={pair.id} className="border-white/[0.04] hover:bg-white/[0.02]">
                    <TableCell className="text-white font-mono text-sm">{pair.sourceLanguage}</TableCell>
                    <TableCell className="text-white font-mono text-sm">{pair.targetLanguage}</TableCell>
                    <TableCell>
                      {pair.isPrimary ? (
                        <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/25 text-[10px]">Primary</Badge>
                      ) : (
                        <span className="text-white/30 text-xs">{"\u2014"}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deletePairMutation.mutate(pair.id)}
                        disabled={deletePairMutation.isPending}
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-7 w-7 p-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {/* Add row */}
                <TableRow className="border-white/[0.04] hover:bg-white/[0.02]">
                  <TableCell>
                    <Select value={newSource} onValueChange={setNewSource}>
                      <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-xs h-8 w-24">
                        <SelectValue placeholder="Source" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#1a1d27] border-white/[0.08] max-h-60">
                        {LANGUAGES.map((l) => (
                          <SelectItem key={l} value={l} className="text-white text-xs">{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select value={newTarget} onValueChange={setNewTarget}>
                      <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-xs h-8 w-24">
                        <SelectValue placeholder="Target" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#1a1d27] border-white/[0.08] max-h-60">
                        {LANGUAGES.map((l) => (
                          <SelectItem key={l} value={l} className="text-white text-xs">{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={newPrimary}
                        onCheckedChange={(v) => setNewPrimary(v === true)}
                        className="border-white/20 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                      />
                      <span className="text-xs text-white/50">Primary</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleAddPair}
                      disabled={!newSource || !newTarget || addPairMutation.isPending}
                      className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 h-7 w-7 p-0"
                    >
                      {addPairMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    </Button>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
          {!isLoading && (!pairs || pairs.length === 0) && (
            <p className="text-center text-white/30 text-sm py-4">No language pairs on record. Add one above.</p>
          )}
        </CardContent>
      </Card>

      {/* Service Types, Specializations, CAT Tools */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="bg-white/[0.03] border-white/[0.06]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-white/70">Service Types</CardTitle>
          </CardHeader>
          <CardContent>
            <BadgeList items={vendor.serviceTypes} color="bg-blue-500/10 text-blue-300 border-blue-500/20" />
          </CardContent>
        </Card>
        <Card className="bg-white/[0.03] border-white/[0.06]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-white/70">Specializations</CardTitle>
          </CardHeader>
          <CardContent>
            <BadgeList items={vendor.specializations ?? vendor.translationSpecializations} color="bg-emerald-500/10 text-emerald-300 border-emerald-500/20" />
          </CardContent>
        </Card>
        <Card className="bg-white/[0.03] border-white/[0.06]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-white/70">CAT Tools / Software</CardTitle>
          </CardHeader>
          <CardContent>
            <BadgeList items={vendor.software} color="bg-amber-500/10 text-amber-300 border-amber-500/20" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Tab 3: Rates & Payment ──

function RatesTab({ vendorId, vendor }: { vendorId: string; vendor: VendorDetail }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [rcSource, setRcSource] = useState("");
  const [rcTarget, setRcTarget] = useState("");
  const [rcServiceType, setRcServiceType] = useState("");
  const [rcRateType, setRcRateType] = useState("per_word");
  const [rcRateValue, setRcRateValue] = useState("");
  const [rcCurrency, setRcCurrency] = useState("USD");
  const [rcSpecialization, setRcSpecialization] = useState("");
  const [rcAccount, setRcAccount] = useState("");
  const [showAddRate, setShowAddRate] = useState(false);

  const [editCat, setEditCat] = useState(false);
  const [catForm, setCatForm] = useState<CatDiscounts>(vendor.catDiscounts ?? {});

  const [editPayment, setEditPayment] = useState(false);
  const [payForm, setPayForm] = useState<PaymentInfoObj>(vendor.paymentInfo ?? {});
  const [taxForm, setTaxForm] = useState<TaxInfoObj>(vendor.taxInfo ?? {});

  const { data: rateCards, isLoading } = useQuery<RateCard[]>({
    queryKey: [`/api/vendors/${vendorId}/rate-cards`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/vendors/${vendorId}/rate-cards`);
      return res.json();
    },
  });

  const addRateMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", `/api/vendors/${vendorId}/rate-cards`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/vendors/${vendorId}/rate-cards`] });
      setShowAddRate(false);
      setRcSource(""); setRcTarget(""); setRcServiceType(""); setRcRateType("per_word");
      setRcRateValue(""); setRcCurrency("USD"); setRcSpecialization(""); setRcAccount("");
      toast({ title: "Rate card added" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add rate card", description: err.message, variant: "destructive" });
    },
  });

  const updateVendorMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("PATCH", `/api/vendors/${vendor.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/vendors/${vendorId}`] });
      setEditCat(false);
      setEditPayment(false);
      toast({ title: "Saved" });
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  function handleAddRate() {
    if (!rcSource || !rcTarget || !rcServiceType || !rcRateValue) return;
    addRateMutation.mutate({
      sourceLanguage: rcSource,
      targetLanguage: rcTarget,
      serviceType: rcServiceType,
      rateType: rcRateType,
      rateValue: rcRateValue,
      currency: rcCurrency,
      specialization: rcSpecialization || null,
      account: rcAccount || null,
    });
  }

  const catFields: { key: keyof CatDiscounts; label: string }[] = [
    { key: "repetitions", label: "Repetitions" },
    { key: "perfect", label: "Perfect Match" },
    { key: "contextMatch", label: "Context Match" },
    { key: "crossFileRepetitions", label: "Cross-file Rep." },
    { key: "match100", label: "100% Match" },
    { key: "match9599", label: "95-99% Match" },
    { key: "match8594", label: "85-94% Match" },
    { key: "match7584", label: "75-84% Match" },
  ];

  return (
    <div className="space-y-4">
      {/* Rate Cards */}
      <Card className="bg-white/[0.03] border-white/[0.06]">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium text-white/70 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-green-400" />
            Rate Cards
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAddRate(!showAddRate)}
            className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 h-7 text-xs"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />{showAddRate ? "Cancel" : "Add Rate"}
          </Button>
        </CardHeader>
        <CardContent>
          {showAddRate && (
            <div className="mb-4 p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] text-white/50">Source Lang</Label>
                  <Select value={rcSource} onValueChange={setRcSource}>
                    <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-xs h-8">
                      <SelectValue placeholder="Source" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a1d27] border-white/[0.08] max-h-60">
                      {LANGUAGES.map((l) => <SelectItem key={l} value={l} className="text-white text-xs">{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-white/50">Target Lang</Label>
                  <Select value={rcTarget} onValueChange={setRcTarget}>
                    <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-xs h-8">
                      <SelectValue placeholder="Target" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a1d27] border-white/[0.08] max-h-60">
                      {LANGUAGES.map((l) => <SelectItem key={l} value={l} className="text-white text-xs">{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-white/50">Service Type</Label>
                  <Select value={rcServiceType} onValueChange={setRcServiceType}>
                    <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-xs h-8">
                      <SelectValue placeholder="Service" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a1d27] border-white/[0.08]">
                      {SERVICE_TYPES.map((s) => <SelectItem key={s} value={s} className="text-white text-xs">{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-white/50">Rate Type</Label>
                  <Select value={rcRateType} onValueChange={setRcRateType}>
                    <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-xs h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a1d27] border-white/[0.08]">
                      {RATE_TYPES.map((r) => <SelectItem key={r} value={r} className="text-white text-xs">{r.replace("_", " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] text-white/50">Rate Value</Label>
                  <Input type="number" step="0.0001" value={rcRateValue} onChange={(e) => setRcRateValue(e.target.value)} className="bg-white/[0.04] border-white/[0.08] text-white text-xs h-8" placeholder="0.00" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-white/50">Currency</Label>
                  <Select value={rcCurrency} onValueChange={setRcCurrency}>
                    <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-xs h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a1d27] border-white/[0.08]">
                      {CURRENCIES.map((c) => <SelectItem key={c} value={c} className="text-white text-xs">{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-white/50">Specialization</Label>
                  <Input value={rcSpecialization} onChange={(e) => setRcSpecialization(e.target.value)} className="bg-white/[0.04] border-white/[0.08] text-white text-xs h-8" placeholder="Optional" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-white/50">Account</Label>
                  <Input value={rcAccount} onChange={(e) => setRcAccount(e.target.value)} className="bg-white/[0.04] border-white/[0.08] text-white text-xs h-8" placeholder="Optional" />
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={handleAddRate}
                  disabled={!rcSource || !rcTarget || !rcServiceType || !rcRateValue || addRateMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-xs h-7"
                >
                  {addRateMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Plus className="w-3 h-3 mr-1" />}
                  Add Rate Card
                </Button>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 bg-white/[0.04] rounded" />)}</div>
          ) : !rateCards || rateCards.length === 0 ? (
            <div className="text-center py-8 text-white/30">
              <DollarSign className="w-7 h-7 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No rate cards on record.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/[0.06] hover:bg-transparent">
                    <TableHead className="text-white/50 text-xs font-medium">Source</TableHead>
                    <TableHead className="text-white/50 text-xs font-medium">Target</TableHead>
                    <TableHead className="text-white/50 text-xs font-medium">Service</TableHead>
                    <TableHead className="text-white/50 text-xs font-medium">Rate Type</TableHead>
                    <TableHead className="text-white/50 text-xs font-medium text-right">Rate</TableHead>
                    <TableHead className="text-white/50 text-xs font-medium">Currency</TableHead>
                    <TableHead className="text-white/50 text-xs font-medium">Specialization</TableHead>
                    <TableHead className="text-white/50 text-xs font-medium">Account</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rateCards.map((card) => (
                    <TableRow key={card.id} className="border-white/[0.04] hover:bg-white/[0.02]">
                      <TableCell className="text-white font-mono text-sm">{card.sourceLanguage}</TableCell>
                      <TableCell className="text-white font-mono text-sm">{card.targetLanguage}</TableCell>
                      <TableCell className="text-white/70 text-sm">{card.serviceType}</TableCell>
                      <TableCell className="text-white/70 text-sm capitalize">{card.rateType?.replace("_", " ")}</TableCell>
                      <TableCell className="text-white text-sm text-right font-medium">{parseFloat(card.rateValue).toFixed(4)}</TableCell>
                      <TableCell className="text-white/50 text-sm">{card.currency}</TableCell>
                      <TableCell className="text-white/50 text-sm">{card.specialization ?? "\u2014"}</TableCell>
                      <TableCell className="text-white/50 text-sm">{card.account ?? "\u2014"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* CAT Discounts */}
      <Card className="bg-white/[0.03] border-white/[0.06]">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium text-white/70">CAT Discounts (%)</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (editCat) {
                updateVendorMutation.mutate({ catDiscounts: catForm });
              } else {
                setCatForm(vendor.catDiscounts ?? {});
                setEditCat(true);
              }
            }}
            className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 h-7 text-xs"
          >
            {editCat ? (
              updateVendorMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Save className="w-3 h-3 mr-1" />
            ) : (
              <Pencil className="w-3 h-3 mr-1" />
            )}
            {editCat ? "Save" : "Edit"}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {catFields.map(({ key, label }) => (
              <div key={key} className="space-y-1">
                <Label className="text-[10px] text-white/40">{label}</Label>
                {editCat ? (
                  <Input
                    type="number"
                    step="1"
                    value={catForm[key] ?? ""}
                    onChange={(e) => setCatForm({ ...catForm, [key]: e.target.value ? parseFloat(e.target.value) : null })}
                    className="bg-white/[0.04] border-white/[0.08] text-white text-xs h-8"
                    placeholder="0"
                  />
                ) : (
                  <p className="text-sm text-white font-mono bg-white/[0.02] rounded px-2 py-1 border border-white/[0.05]">
                    {vendor.catDiscounts?.[key] != null ? `${vendor.catDiscounts[key]}%` : "\u2014"}
                  </p>
                )}
              </div>
            ))}
          </div>
          {editCat && (
            <div className="flex justify-end mt-3">
              <Button variant="ghost" size="sm" onClick={() => setEditCat(false)} className="text-white/50 hover:text-white text-xs h-7 mr-2">
                Cancel
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment & Tax Info */}
      <Card className="bg-white/[0.03] border-white/[0.06]">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium text-white/70">Payment & Tax Information</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (editPayment) {
                updateVendorMutation.mutate({ paymentInfo: payForm, taxInfo: taxForm });
              } else {
                setPayForm(vendor.paymentInfo ?? {});
                setTaxForm(vendor.taxInfo ?? {});
                setEditPayment(true);
              }
            }}
            className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 h-7 text-xs"
          >
            {editPayment ? (
              updateVendorMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Save className="w-3 h-3 mr-1" />
            ) : (
              <Pencil className="w-3 h-3 mr-1" />
            )}
            {editPayment ? "Save" : "Edit"}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-2">
              <SectionLabel>Payment Details</SectionLabel>
              {editPayment ? (
                <div className="space-y-2">
                  {[
                    { key: "method", label: "Method" },
                    { key: "bankName", label: "Bank Name" },
                    { key: "bankCountry", label: "Bank Country" },
                    { key: "iban", label: "IBAN" },
                    { key: "swift", label: "SWIFT" },
                    { key: "accountHolder", label: "Account Holder" },
                    { key: "paypalEmail", label: "PayPal Email" },
                    { key: "wiseEmail", label: "Wise Email" },
                  ].map(({ key, label }) => (
                    <div key={key} className="space-y-1">
                      <Label className="text-[10px] text-white/40">{label}</Label>
                      <Input
                        value={payForm[key] ?? ""}
                        onChange={(e) => setPayForm({ ...payForm, [key]: e.target.value || undefined })}
                        className="bg-white/[0.04] border-white/[0.08] text-white text-xs h-8"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-1">
                  <InfoRow label="Method" value={vendor.paymentInfo?.method} />
                  <InfoRow label="Bank" value={vendor.paymentInfo?.bankName} />
                  <InfoRow label="Country" value={vendor.paymentInfo?.bankCountry} />
                  <InfoRow label="IBAN" value={vendor.paymentInfo?.iban} mono />
                  <InfoRow label="SWIFT" value={vendor.paymentInfo?.swift} mono />
                  <InfoRow label="Holder" value={vendor.paymentInfo?.accountHolder} />
                  <InfoRow label="PayPal" value={vendor.paymentInfo?.paypalEmail} />
                  <InfoRow label="Wise" value={vendor.paymentInfo?.wiseEmail} />
                  <InfoRow label="Currency" value={vendor.currency} />
                  <InfoRow label="Min Fee" value={vendor.minimumFee} />
                  <InfoRow label="Min Project Fee" value={vendor.minimumProjectFee} />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <SectionLabel>Tax Information</SectionLabel>
              {editPayment ? (
                <div className="space-y-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-white/40">VAT Number</Label>
                    <Input
                      value={taxForm.vatNumber ?? ""}
                      onChange={(e) => setTaxForm({ ...taxForm, vatNumber: e.target.value || undefined })}
                      className="bg-white/[0.04] border-white/[0.08] text-white text-xs h-8"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-white/40">Tax ID</Label>
                    <Input
                      value={taxForm.taxId ?? ""}
                      onChange={(e) => setTaxForm({ ...taxForm, taxId: e.target.value || undefined })}
                      className="bg-white/[0.04] border-white/[0.08] text-white text-xs h-8"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <InfoRow label="VAT Number" value={vendor.taxInfo?.vatNumber} mono />
                  <InfoRow label="Tax ID" value={vendor.taxInfo?.taxId} mono />
                </div>
              )}
            </div>
          </div>
          {editPayment && (
            <div className="flex justify-end mt-3">
              <Button variant="ghost" size="sm" onClick={() => setEditPayment(false)} className="text-white/50 hover:text-white text-xs h-7 mr-2">
                Cancel
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Tab 4: Quality History ──

function QualityTab({ vendorId, vendor }: { vendorId: string; vendor: VendorDetail }) {
  const combinedScore = parseScore(vendor.combinedQualityScore);
  const avgQs = parseScore(vendor.averageQsScore);
  const avgLqa = parseScore(vendor.averageLqaScore);

  const { data: reports, isLoading } = useQuery<QualityReport[]>({
    queryKey: [`/api/vendors/${vendorId}/quality-reports`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/vendors/${vendorId}/quality-reports`);
      return res.json();
    },
  });

  return (
    <div className="space-y-4">
      {/* Score Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className={`border ${qualityBgColor(combinedScore)}`}>
          <CardContent className="p-6 text-center">
            <div className="w-20 h-20 mx-auto rounded-full border-4 flex items-center justify-center mb-2"
              style={{ borderColor: combinedScore != null ? (combinedScore >= 4.5 ? "#34d399" : combinedScore >= 3.5 ? "#60a5fa" : "#fbbf24") : "#71717a" }}>
              <span className={`text-3xl font-bold ${qualityScoreColor(combinedScore)}`}>
                {combinedScore != null ? combinedScore.toFixed(1) : "\u2014"}
              </span>
            </div>
            <p className="text-xs text-white/40 uppercase tracking-wide">Combined Score</p>
          </CardContent>
        </Card>
        <Card className="bg-white/[0.03] border-white/[0.06]">
          <CardContent className="p-6 text-center">
            <p className={`text-3xl font-bold ${qualityScoreColor(avgQs)}`}>{avgQs != null ? avgQs.toFixed(2) : "\u2014"}</p>
            <p className="text-xs text-white/40 uppercase tracking-wide mt-1">Average QS Score</p>
          </CardContent>
        </Card>
        <Card className="bg-white/[0.03] border-white/[0.06]">
          <CardContent className="p-6 text-center">
            <p className={`text-3xl font-bold ${qualityScoreColor(avgLqa)}`}>{avgLqa != null ? avgLqa.toFixed(2) : "\u2014"}</p>
            <p className="text-xs text-white/40 uppercase tracking-wide mt-1">Average LQA Score</p>
          </CardContent>
        </Card>
      </div>

      {/* Per-Account Quality Breakdown */}
      {vendor.accountQualityScores && vendor.accountQualityScores.length > 0 && (
        <Card className="bg-white/[0.03] border-white/[0.06]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-white/70">Per-Account Quality Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-white/[0.06] hover:bg-transparent">
                  <TableHead className="text-white/50 text-xs font-medium">Account</TableHead>
                  <TableHead className="text-white/50 text-xs font-medium text-right">Combined</TableHead>
                  <TableHead className="text-white/50 text-xs font-medium text-right">LQA</TableHead>
                  <TableHead className="text-white/50 text-xs font-medium text-right">QS</TableHead>
                  <TableHead className="text-white/50 text-xs font-medium text-right">Reviews</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendor.accountQualityScores.map((aq, i) => {
                  const cs = parseScore(aq.combinedScore);
                  return (
                    <TableRow key={i} className="border-white/[0.04] hover:bg-white/[0.02]">
                      <TableCell className="text-white text-sm font-medium">{aq.account}</TableCell>
                      <TableCell className={`text-sm text-right font-bold ${qualityScoreColor(cs)}`}>{cs != null ? cs.toFixed(2) : "\u2014"}</TableCell>
                      <TableCell className="text-white/70 text-sm text-right">{aq.lqaScore ?? "\u2014"}</TableCell>
                      <TableCell className="text-white/70 text-sm text-right">{aq.qsScore ?? "\u2014"}</TableCell>
                      <TableCell className="text-white/70 text-sm text-right">{aq.reviewCount ?? 0}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Quality Reports Table */}
      <Card className="bg-white/[0.03] border-white/[0.06]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-white/70 flex items-center gap-2">
            <Star className="w-4 h-4 text-amber-400" />
            Quality Reports
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 bg-white/[0.04] rounded" />)}</div>
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
                  <TableHead className="text-white/50 text-xs font-medium">Lang Pair</TableHead>
                  <TableHead className="text-white/50 text-xs font-medium">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((report) => {
                  const rScore = parseScore(report.score);
                  return (
                    <TableRow key={report.id} className="border-white/[0.04] hover:bg-white/[0.02]">
                      <TableCell className="text-white/70 text-sm">{formatDate(report.reportDate)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px] bg-white/[0.06] text-white/60 border-transparent capitalize">
                          {report.reportType}
                        </Badge>
                      </TableCell>
                      <TableCell className={`text-sm text-right font-bold ${qualityScoreColor(rScore)}`}>
                        {rScore != null ? rScore.toFixed(2) : "\u2014"}
                      </TableCell>
                      <TableCell className="text-white/70 text-sm">{report.projectCode ?? "\u2014"}</TableCell>
                      <TableCell className="text-white/70 text-sm">{report.account ?? "\u2014"}</TableCell>
                      <TableCell className="text-white/70 text-sm font-mono">{report.languagePair ?? "\u2014"}</TableCell>
                      <TableCell>
                        {report.status ? (
                          <Badge variant="secondary" className="text-[10px] bg-white/[0.06] text-white/60 border-transparent capitalize">
                            {report.status}
                          </Badge>
                        ) : (
                          <span className="text-white/30 text-xs">{"\u2014"}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Tab 5: Documents ──

function DocumentsTab({ vendorId, vendor }: { vendorId: string; vendor: VendorDetail }) {
  const { data: documents, isLoading } = useQuery<VendorDocument[]>({
    queryKey: [`/api/vendors/${vendorId}/documents`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/vendors/${vendorId}/documents`);
      return res.json();
    },
  });

  const checks = [
    { label: "NDA Signed", value: vendor.ndaSigned },
    { label: "Tested", value: vendor.tested },
    { label: "Certified", value: vendor.certified },
  ];

  const fileLinks = [
    { label: "CV / Resume", url: vendor.cvFileUrl, icon: FileText },
    { label: "NDA Document", url: vendor.ndaFileUrl, icon: Shield },
    { label: "Portfolio", url: vendor.portfolioFileUrl, icon: Award },
  ];

  return (
    <div className="space-y-4">
      <Card className="bg-white/[0.03] border-white/[0.06]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-white/70">Document Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {checks.map(({ label, value }) => (
              <div key={label} className={`flex items-center gap-3 rounded-lg border p-3 ${value ? "bg-emerald-500/10 border-emerald-500/20" : "bg-white/[0.02] border-white/[0.06]"}`}>
                {value ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                ) : (
                  <X className="w-5 h-5 text-white/20 shrink-0" />
                )}
                <span className={`text-sm ${value ? "text-emerald-300" : "text-white/40"}`}>{label}</span>
              </div>
            ))}
            <div className={`flex items-center gap-3 rounded-lg border p-3 ${vendor.canDoLqa ? "bg-blue-500/10 border-blue-500/20" : "bg-white/[0.02] border-white/[0.06]"}`}>
              {vendor.canDoLqa ? (
                <CheckCircle2 className="w-5 h-5 text-blue-400 shrink-0" />
              ) : (
                <X className="w-5 h-5 text-white/20 shrink-0" />
              )}
              <span className={`text-sm ${vendor.canDoLqa ? "text-blue-300" : "text-white/40"}`}>Can Do LQA</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/[0.03] border-white/[0.06]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-white/70">Vendor Files</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {fileLinks.map(({ label, url, icon: Icon }) => (
              <div key={label} className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.05]">
                <Icon className={`w-5 h-5 shrink-0 ${url ? "text-blue-400" : "text-white/20"}`} />
                <span className={`text-sm flex-1 ${url ? "text-white" : "text-white/30"}`}>{label}</span>
                {url ? (
                  <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
                    <Download className="w-3.5 h-3.5" /> Download
                  </a>
                ) : (
                  <span className="text-xs text-white/20">Not uploaded</span>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/[0.03] border-white/[0.06]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-white/70">Uploaded Documents</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-14 bg-white/[0.04] rounded" />)}</div>
          ) : !documents || documents.length === 0 ? (
            <div className="text-center py-6 text-white/30">
              <FileText className="w-7 h-7 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No additional documents.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] transition-colors">
                  <FileText className="w-5 h-5 text-blue-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">{doc.fileName}</p>
                    <p className="text-xs text-white/40 mt-0.5">
                      {doc.documentType ?? doc.fileType ?? "Document"} &middot; {formatDate(doc.uploadedAt)}
                    </p>
                  </div>
                  {(doc.fileUrl || doc.signatureUrl) && (
                    <a href={doc.fileUrl ?? doc.signatureUrl ?? "#"} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-300 shrink-0">
                      View
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Tab 6: Activity Log ──

function ActivityTab({ vendorId }: { vendorId: string }) {
  const { data: activities, isLoading } = useQuery<ActivityLogEntry[]>({
    queryKey: [`/api/vendors/${vendorId}/activities`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/vendors/${vendorId}/activities`);
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 bg-white/[0.04] rounded-lg" />)}</div>
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

  function activityTypeColor(type: string | null): string {
    if (!type) return "bg-white/[0.06] text-white/50 border-transparent";
    const t = type.toLowerCase();
    if (t.includes("create") || t.includes("add")) return "bg-emerald-500/15 text-emerald-400 border-emerald-500/25";
    if (t.includes("update") || t.includes("edit") || t.includes("change")) return "bg-blue-500/15 text-blue-400 border-blue-500/25";
    if (t.includes("delete") || t.includes("remove")) return "bg-red-500/15 text-red-400 border-red-500/25";
    if (t.includes("status")) return "bg-amber-500/15 text-amber-400 border-amber-500/25";
    return "bg-white/[0.06] text-white/50 border-transparent";
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
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm text-white font-medium">{entry.action}</p>
                {entry.activityType && (
                  <Badge variant="secondary" className={`text-[10px] ${activityTypeColor(entry.activityType)}`}>
                    {entry.activityType}
                  </Badge>
                )}
              </div>
              {entry.description && (
                <p className="text-xs text-white/50 mt-0.5">{entry.description}</p>
              )}
              {(entry.oldValue || entry.newValue) && (
                <div className="flex items-center gap-2 mt-1 text-xs">
                  {entry.oldValue && (
                    <span className="text-red-400/70 line-through">{entry.oldValue}</span>
                  )}
                  {entry.oldValue && entry.newValue && (
                    <ArrowRight className="w-3 h-3 text-white/30" />
                  )}
                  {entry.newValue && (
                    <span className="text-emerald-400/70">{entry.newValue}</span>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2 mt-1">
                {entry.performedBy && (
                  <span className="text-[11px] text-white/30">{entry.performedBy}</span>
                )}
                <span className="text-[11px] text-white/20">{timeAgo(entry.createdAt)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab 7: Notes ──

function NotesTab({ vendorId }: { vendorId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [newContent, setNewContent] = useState("");
  const [newNoteType, setNewNoteType] = useState("info");
  const [newVisibility, setNewVisibility] = useState("team");

  const { data: notes, isLoading } = useQuery<VendorNote[]>({
    queryKey: [`/api/vendors/${vendorId}/notes`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/vendors/${vendorId}/notes`);
      return res.json();
    },
  });

  const addNoteMutation = useMutation({
    mutationFn: async (data: { content: string; noteType: string; visibility: string }) => {
      const res = await apiRequest("POST", `/api/vendors/${vendorId}/notes`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/vendors/${vendorId}/notes`] });
      setNewContent("");
      setNewNoteType("info");
      setNewVisibility("team");
      toast({ title: "Note added", description: "Your note has been saved." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add note", description: err.message, variant: "destructive" });
    },
  });

  function handleAddNote() {
    if (!newContent.trim()) return;
    addNoteMutation.mutate({ content: newContent.trim(), noteType: newNoteType, visibility: newVisibility });
  }

  function noteTypeColor(type: string | null): string {
    if (!type) return "bg-white/[0.06] text-white/50";
    if (type === "warning") return "bg-amber-500/15 text-amber-400 border-amber-500/25";
    if (type === "info") return "bg-blue-500/15 text-blue-400 border-blue-500/25";
    return "bg-white/[0.06] text-white/60 border-transparent";
  }

  function visibilityColor(vis: string | null): string {
    if (vis === "private") return "border-rose-500/30 text-rose-400";
    return "border-white/[0.12] text-white/40";
  }

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
                  <SelectItem key={t} value={t} className="text-white capitalize text-xs">{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={newVisibility} onValueChange={setNewVisibility}>
              <SelectTrigger className="w-28 bg-white/[0.04] border-white/[0.08] text-white text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#1a1d27] border-white/[0.08]">
                {["team", "private"].map((v) => (
                  <SelectItem key={v} value={v} className="text-white capitalize text-xs">{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={handleAddNote}
              disabled={!newContent.trim() || addNoteMutation.isPending}
              size="sm"
              className="bg-blue-600 hover:bg-blue-500 text-white ml-auto"
            >
              {addNoteMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
              Add Note
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-20 bg-white/[0.04] rounded-lg" />)}</div>
      ) : !notes || notes.length === 0 ? (
        <div className="text-center py-8 text-white/30">
          <StickyNote className="w-7 h-7 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No notes yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div key={note.id} className="p-4 rounded-lg bg-white/[0.03] border border-white/[0.06]">
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {note.noteType && (
                    <Badge variant="secondary" className={`text-[10px] capitalize ${noteTypeColor(note.noteType)}`}>
                      {note.noteType}
                    </Badge>
                  )}
                  {note.visibility && (
                    <Badge variant="outline" className={`text-[10px] capitalize border ${visibilityColor(note.visibility)}`}>
                      {note.visibility}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-white/30 shrink-0">
                  <Calendar className="w-3 h-3" />
                  {timeAgo(note.createdAt)}
                </div>
              </div>
              <p className="text-sm text-white/80 leading-relaxed">{note.content}</p>
              {note.createdBy && (
                <p className="text-[11px] text-white/30 mt-2">&mdash; {note.createdBy}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──

export default function VendorDetailPage() {
  const [, params] = useRoute("/vendors/:id");
  const vendorId = params?.id;

  const [editOpen, setEditOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  const { data: vendor, isLoading, isError, error } = useQuery<VendorDetail>({
    queryKey: [`/api/vendors/${vendorId}`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/vendors/${vendorId}`);
      return res.json();
    },
    enabled: !!vendorId,
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
          <Skeleton className="h-12 w-12 rounded-full bg-white/[0.04]" />
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
          <Button variant="ghost" size="sm" className="text-white/60 hover:text-white hover:bg-white/[0.06] mb-4">
            <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
            Back to Vendors
          </Button>
        </Link>
        <div className="text-center py-16 text-white/30">
          <AlertCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">{(error as Error)?.message ?? "Vendor not found."}</p>
        </div>
      </div>
    );
  }

  const combinedScore = parseScore(vendor.combinedQualityScore);
  const valueIdx = parseScore(vendor.valueIndex);
  const initial = vendor.fullName?.charAt(0)?.toUpperCase() ?? "V";

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-6xl mx-auto p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <Link href="/vendors">
              <Button variant="ghost" size="sm" className="text-white/50 hover:text-white hover:bg-white/[0.06] -ml-1">
                <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
                Vendors
              </Button>
            </Link>
            <div className="w-px h-8 bg-white/[0.08]" />

            {vendor.profilePictureUrl ? (
              <img src={vendor.profilePictureUrl} alt={vendor.fullName} className="w-12 h-12 rounded-full border-2 border-white/10 object-cover" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-blue-600/20 border-2 border-blue-500/30 flex items-center justify-center shrink-0">
                <span className="text-lg font-bold text-blue-400">{initial}</span>
              </div>
            )}

            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-lg font-semibold text-white leading-tight">{vendor.fullName}</h1>
                <StatusBadge status={vendor.status} />
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                {vendor.resourceCode && (
                  <code className="text-xs bg-white/[0.06] text-white/60 px-1.5 py-0.5 rounded font-mono">{vendor.resourceCode}</code>
                )}
                <span className="text-xs text-white/40">{vendor.email}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {combinedScore != null && (
              <div className={`rounded-lg border px-3 py-1.5 text-center ${qualityBgColor(combinedScore)}`}>
                <p className={`text-xl font-bold leading-tight ${qualityScoreColor(combinedScore)}`}>{combinedScore.toFixed(1)}</p>
                <p className="text-[9px] text-white/40 uppercase tracking-wider">Quality</p>
              </div>
            )}
            {valueIdx != null && (
              <div className="rounded-lg border bg-white/[0.04] border-white/[0.08] px-3 py-1.5 text-center">
                <p className="text-xl font-bold text-white leading-tight">{valueIdx.toFixed(1)}</p>
                <p className="text-[9px] text-white/40 uppercase tracking-wider">Value</p>
              </div>
            )}

            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditOpen(true)}
              className="text-white/60 hover:text-white hover:bg-white/[0.06] border border-white/[0.08]"
            >
              <Pencil className="w-3.5 h-3.5 mr-1.5" />
              Edit Profile
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-white/60 hover:text-white hover:bg-white/[0.06] border border-white/[0.08]"
                >
                  Status
                  <ChevronDown className="w-3.5 h-3.5 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-[#1a1d27] border-white/[0.08]" align="end">
                {ALL_STATUSES.map((s) => (
                  <DropdownMenuItem
                    key={s}
                    onClick={() => setStatusOpen(true)}
                    className="text-white text-sm hover:bg-white/[0.06] cursor-pointer"
                  >
                    <span className={`w-2 h-2 rounded-full mr-2 ${STATUS_COLORS[s]?.split(" ")[0] ?? "bg-zinc-500"}`} />
                    {s}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview">
          <TabsList className="bg-white/[0.04] border border-white/[0.06] h-auto p-1 flex flex-wrap gap-0.5">
            <TabsTrigger value="overview" className="text-xs text-white/50 data-[state=active]:text-white data-[state=active]:bg-white/[0.08] flex items-center gap-1.5 px-3 py-1.5">
              <User className="w-3 h-3" />Overview
            </TabsTrigger>
            <TabsTrigger value="languages" className="text-xs text-white/50 data-[state=active]:text-white data-[state=active]:bg-white/[0.08] flex items-center gap-1.5 px-3 py-1.5">
              <Globe className="w-3 h-3" />Languages &amp; Skills
            </TabsTrigger>
            <TabsTrigger value="rates" className="text-xs text-white/50 data-[state=active]:text-white data-[state=active]:bg-white/[0.08] flex items-center gap-1.5 px-3 py-1.5">
              <DollarSign className="w-3 h-3" />Rates &amp; Payment
            </TabsTrigger>
            <TabsTrigger value="quality" className="text-xs text-white/50 data-[state=active]:text-white data-[state=active]:bg-white/[0.08] flex items-center gap-1.5 px-3 py-1.5">
              <Star className="w-3 h-3" />Quality History
            </TabsTrigger>
            <TabsTrigger value="documents" className="text-xs text-white/50 data-[state=active]:text-white data-[state=active]:bg-white/[0.08] flex items-center gap-1.5 px-3 py-1.5">
              <FileText className="w-3 h-3" />Documents
            </TabsTrigger>
            <TabsTrigger value="activity" className="text-xs text-white/50 data-[state=active]:text-white data-[state=active]:bg-white/[0.08] flex items-center gap-1.5 px-3 py-1.5">
              <Activity className="w-3 h-3" />Activity Log
            </TabsTrigger>
            <TabsTrigger value="notes" className="text-xs text-white/50 data-[state=active]:text-white data-[state=active]:bg-white/[0.08] flex items-center gap-1.5 px-3 py-1.5">
              <StickyNote className="w-3 h-3" />Notes
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
          <TabsContent value="documents" className="mt-4">
            <DocumentsTab vendorId={vendorId} vendor={vendor} />
          </TabsContent>
          <TabsContent value="activity" className="mt-4">
            <ActivityTab vendorId={vendorId} />
          </TabsContent>
          <TabsContent value="notes" className="mt-4">
            <NotesTab vendorId={vendorId} />
          </TabsContent>
        </Tabs>
      </div>

      {editOpen && <EditVendorDialog vendor={vendor} open={editOpen} onClose={() => setEditOpen(false)} />}
      {statusOpen && <StatusChangeDialog vendor={vendor} open={statusOpen} onClose={() => setStatusOpen(false)} />}
    </div>
  );
}
