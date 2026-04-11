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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
} from "lucide-react";

// ── Types ──

interface Vendor {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  status: string;
  resourceCode?: string | null;
  company?: string | null;
  qualityScore?: number | null;
  translationScore?: number | null;
  reviewScore?: number | null;
  availability?: string | null;
  nativeLanguage?: string | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

interface LanguagePair {
  id: number;
  sourceLang: string;
  targetLang: string;
  serviceType?: string | null;
  specialization?: string | null;
  yearsExperience?: number | null;
}

interface RateCard {
  id: number;
  sourceLang: string;
  targetLang: string;
  serviceType: string;
  unit: string;
  rate: number;
  currency: string;
  effectiveDate?: string | null;
}

interface QualityReport {
  id: number;
  reportDate: string;
  reportType: string;
  score: number;
  projectId?: string | null;
  projectTitle?: string | null;
  feedback?: string | null;
}

interface VendorDocument {
  id: number;
  fileName: string;
  fileType?: string | null;
  documentType?: string | null;
  uploadedAt: string;
  fileUrl?: string | null;
}

interface ActivityLogEntry {
  id: number;
  action: string;
  description?: string | null;
  performedBy?: string | null;
  createdAt: string;
}

interface VendorNote {
  id: number;
  content: string;
  noteType?: string | null;
  visibility?: string | null;
  createdBy?: string | null;
  createdAt: string;
}

// ── Helpers ──

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "—";
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
  if (!dateStr) return "—";
  const s = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function StatusBadge({ status }: { status: string }) {
  const lower = status?.toLowerCase() ?? "";
  let colorClass = "bg-zinc-500/20 text-zinc-300 border-zinc-500/30";
  if (lower === "active") colorClass = "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
  else if (lower === "inactive") colorClass = "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
  else if (lower === "suspended") colorClass = "bg-red-500/20 text-red-300 border-red-500/30";
  else if (lower === "pending") colorClass = "bg-amber-500/20 text-amber-300 border-amber-500/30";
  else if (lower === "blacklisted") colorClass = "bg-red-700/20 text-red-400 border-red-700/30";

  return (
    <span
      className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold capitalize ${colorClass}`}
    >
      {status}
    </span>
  );
}

function ScorePill({ score, label }: { score?: number | null; label: string }) {
  if (score == null) return null;
  let color = "text-zinc-400";
  if (score >= 90) color = "text-emerald-400";
  else if (score >= 75) color = "text-amber-400";
  else color = "text-red-400";
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`text-lg font-bold ${color}`}>{score}</span>
      <span className="text-[10px] text-white/40 uppercase tracking-wide">{label}</span>
    </div>
  );
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
  const queryClient = useQueryClient();

  const [name, setName] = useState(vendor.name);
  const [email, setEmail] = useState(vendor.email);
  const [phone, setPhone] = useState(vendor.phone ?? "");
  const [status, setStatus] = useState(vendor.status);
  const [resourceCode, setResourceCode] = useState(vendor.resourceCode ?? "");
  const [company, setCompany] = useState(vendor.company ?? "");
  const [availability, setAvailability] = useState(vendor.availability ?? "");

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<Vendor>) => {
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
      name,
      email,
      phone: phone || null,
      status,
      resourceCode: resourceCode || null,
      company: company || null,
      availability: availability || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-[#1a1d27] border-white/[0.08] text-white max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white text-base font-semibold">Edit Vendor</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
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
              <Label className="text-xs text-white/60">Phone</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
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
                  {["active", "inactive", "pending", "suspended", "blacklisted"].map((s) => (
                    <SelectItem key={s} value={s} className="text-white capitalize">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <Label className="text-xs text-white/60">Company</Label>
              <Input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="bg-white/[0.04] border-white/[0.08] text-white text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-white/60">Availability</Label>
            <Select value={availability || "available"} onValueChange={setAvailability}>
              <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#1a1d27] border-white/[0.08]">
                {["available", "busy", "on_leave", "unavailable"].map((a) => (
                  <SelectItem key={a} value={a} className="text-white capitalize">
                    {a.replace("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Contact Info */}
        <Card className="bg-white/[0.03] border-white/[0.06]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-white/70">Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <User className="w-4 h-4 text-white/30 shrink-0" />
              <span className="text-white">{vendor.name}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Mail className="w-4 h-4 text-white/30 shrink-0" />
              <a
                href={`mailto:${vendor.email}`}
                className="text-blue-400 hover:text-blue-300 transition-colors"
              >
                {vendor.email}
              </a>
            </div>
            {vendor.phone && (
              <div className="flex items-center gap-3 text-sm">
                <Phone className="w-4 h-4 text-white/30 shrink-0" />
                <span className="text-white">{vendor.phone}</span>
              </div>
            )}
            {vendor.company && (
              <div className="flex items-center gap-3 text-sm">
                <Building className="w-4 h-4 text-white/30 shrink-0" />
                <span className="text-white">{vendor.company}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Status & Info */}
        <Card className="bg-white/[0.03] border-white/[0.06]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-white/70">Status & Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/50">Status</span>
              <StatusBadge status={vendor.status} />
            </div>
            {vendor.resourceCode && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/50">Resource Code</span>
                <code className="text-xs bg-white/[0.06] text-white/80 px-2 py-0.5 rounded font-mono">
                  {vendor.resourceCode}
                </code>
              </div>
            )}
            {vendor.nativeLanguage && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/50">Native Language</span>
                <span className="text-white">{vendor.nativeLanguage}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/50">Availability</span>
              <span className="flex items-center gap-1.5 text-white capitalize">
                {vendor.availability?.toLowerCase() === "available" ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : vendor.availability?.toLowerCase() === "busy" ? (
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                )}
                {vendor.availability?.replace("_", " ") ?? "Unknown"}
              </span>
            </div>
            {vendor.createdAt && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/50">Member Since</span>
                <span className="text-white">{formatDate(vendor.createdAt)}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quality Scores */}
      {(vendor.qualityScore != null ||
        vendor.translationScore != null ||
        vendor.reviewScore != null) && (
        <Card className="bg-white/[0.03] border-white/[0.06]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-white/70 flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-400" />
              Quality Scores
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-8">
              <ScorePill score={vendor.qualityScore} label="Overall" />
              <ScorePill score={vendor.translationScore} label="Translation" />
              <ScorePill score={vendor.reviewScore} label="Review" />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Tab: Languages & Skills ──

function LanguagesTab({ vendorId }: { vendorId: string }) {
  const { data: pairs, isLoading } = useQuery<LanguagePair[]>({
    queryKey: [`/api/vendors/${vendorId}/language-pairs`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/vendors/${vendorId}/language-pairs`);
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 bg-white/[0.04] rounded-lg" />
        ))}
      </div>
    );
  }

  if (!pairs || pairs.length === 0) {
    return (
      <div className="text-center py-12 text-white/30">
        <Globe className="w-8 h-8 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No language pairs on record.</p>
      </div>
    );
  }

  return (
    <Card className="bg-white/[0.03] border-white/[0.06]">
      <Table>
        <TableHeader>
          <TableRow className="border-white/[0.06] hover:bg-transparent">
            <TableHead className="text-white/50 text-xs font-medium">Source</TableHead>
            <TableHead className="text-white/50 text-xs font-medium">Target</TableHead>
            <TableHead className="text-white/50 text-xs font-medium">Service Type</TableHead>
            <TableHead className="text-white/50 text-xs font-medium">Specialization</TableHead>
            <TableHead className="text-white/50 text-xs font-medium">Experience (yrs)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pairs.map((pair) => (
            <TableRow key={pair.id} className="border-white/[0.04] hover:bg-white/[0.02]">
              <TableCell className="text-white font-mono text-sm">{pair.sourceLang}</TableCell>
              <TableCell className="text-white font-mono text-sm">{pair.targetLang}</TableCell>
              <TableCell className="text-white/70 text-sm">{pair.serviceType ?? "—"}</TableCell>
              <TableCell className="text-white/70 text-sm">{pair.specialization ?? "—"}</TableCell>
              <TableCell className="text-white/70 text-sm">
                {pair.yearsExperience != null ? pair.yearsExperience : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

// ── Tab: Rates ──

function RatesTab({ vendorId }: { vendorId: string }) {
  const { data: rateCards, isLoading } = useQuery<RateCard[]>({
    queryKey: [`/api/vendors/${vendorId}/rate-cards`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/vendors/${vendorId}/rate-cards`);
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 bg-white/[0.04] rounded-lg" />
        ))}
      </div>
    );
  }

  if (!rateCards || rateCards.length === 0) {
    return (
      <div className="text-center py-12 text-white/30">
        <DollarSign className="w-8 h-8 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No rate cards on record.</p>
      </div>
    );
  }

  return (
    <Card className="bg-white/[0.03] border-white/[0.06]">
      <Table>
        <TableHeader>
          <TableRow className="border-white/[0.06] hover:bg-transparent">
            <TableHead className="text-white/50 text-xs font-medium">Language Pair</TableHead>
            <TableHead className="text-white/50 text-xs font-medium">Service</TableHead>
            <TableHead className="text-white/50 text-xs font-medium">Unit</TableHead>
            <TableHead className="text-white/50 text-xs font-medium text-right">Rate</TableHead>
            <TableHead className="text-white/50 text-xs font-medium">Effective Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rateCards.map((card) => (
            <TableRow key={card.id} className="border-white/[0.04] hover:bg-white/[0.02]">
              <TableCell className="text-white font-mono text-sm">
                {card.sourceLang} &rarr; {card.targetLang}
              </TableCell>
              <TableCell className="text-white/70 text-sm">{card.serviceType}</TableCell>
              <TableCell className="text-white/70 text-sm capitalize">{card.unit}</TableCell>
              <TableCell className="text-white text-sm text-right font-medium">
                {card.rate.toFixed(4)}{" "}
                <span className="text-white/40 text-xs">{card.currency}</span>
              </TableCell>
              <TableCell className="text-white/70 text-sm">{formatDate(card.effectiveDate)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

// ── Tab: Quality History ──

function QualityTab({ vendorId }: { vendorId: string }) {
  const { data: reports, isLoading } = useQuery<QualityReport[]>({
    queryKey: [`/api/vendors/${vendorId}/quality-reports`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/vendors/${vendorId}/quality-reports`);
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 bg-white/[0.04] rounded-lg" />
        ))}
      </div>
    );
  }

  if (!reports || reports.length === 0) {
    return (
      <div className="text-center py-12 text-white/30">
        <Star className="w-8 h-8 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No quality reports on record.</p>
      </div>
    );
  }

  return (
    <Card className="bg-white/[0.03] border-white/[0.06]">
      <Table>
        <TableHeader>
          <TableRow className="border-white/[0.06] hover:bg-transparent">
            <TableHead className="text-white/50 text-xs font-medium">Date</TableHead>
            <TableHead className="text-white/50 text-xs font-medium">Type</TableHead>
            <TableHead className="text-white/50 text-xs font-medium text-right">Score</TableHead>
            <TableHead className="text-white/50 text-xs font-medium">Project</TableHead>
            <TableHead className="text-white/50 text-xs font-medium">Feedback</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reports.map((report) => {
            let scoreColor = "text-zinc-400";
            if (report.score >= 90) scoreColor = "text-emerald-400";
            else if (report.score >= 75) scoreColor = "text-amber-400";
            else scoreColor = "text-red-400";
            return (
              <TableRow key={report.id} className="border-white/[0.04] hover:bg-white/[0.02]">
                <TableCell className="text-white/70 text-sm">{formatDate(report.reportDate)}</TableCell>
                <TableCell className="text-white/70 text-sm capitalize">{report.reportType}</TableCell>
                <TableCell className={`text-sm text-right font-bold ${scoreColor}`}>
                  {report.score}
                </TableCell>
                <TableCell className="text-white/70 text-sm">
                  {report.projectTitle ?? report.projectId ?? "—"}
                </TableCell>
                <TableCell className="text-white/50 text-sm max-w-[200px] truncate">
                  {report.feedback ?? "—"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

// ── Tab: Documents ──

function DocumentsTab({ vendorId }: { vendorId: string }) {
  const { data: documents, isLoading } = useQuery<VendorDocument[]>({
    queryKey: [`/api/vendors/${vendorId}/documents`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/vendors/${vendorId}/documents`);
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-16 bg-white/[0.04] rounded-lg" />
        ))}
      </div>
    );
  }

  if (!documents || documents.length === 0) {
    return (
      <div className="text-center py-12 text-white/30">
        <FileText className="w-8 h-8 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No documents on record.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {documents.map((doc) => (
        <div
          key={doc.id}
          className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05] transition-colors"
        >
          <FileText className="w-5 h-5 text-blue-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white font-medium truncate">{doc.fileName}</p>
            <p className="text-xs text-white/40 mt-0.5">
              {doc.documentType ?? doc.fileType ?? "Document"} &middot; Uploaded {formatDate(doc.uploadedAt)}
            </p>
          </div>
          {doc.fileUrl && (
            <a
              href={doc.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors shrink-0"
            >
              View
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Tab: Activity Log ──

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
      {/* Timeline line */}
      <div className="absolute left-[19px] top-2 bottom-2 w-px bg-white/[0.06]" />
      <div className="space-y-1">
        {activities.map((entry) => (
          <div key={entry.id} className="flex items-start gap-4 py-3 pl-1">
            {/* Dot */}
            <div className="w-9 h-9 rounded-full bg-[#1a1d27] border border-white/[0.10] flex items-center justify-center shrink-0 z-10">
              <Activity className="w-3.5 h-3.5 text-white/40" />
            </div>
            <div className="flex-1 min-w-0 pt-1.5">
              <p className="text-sm text-white font-medium">{entry.action}</p>
              {entry.description && (
                <p className="text-xs text-white/50 mt-0.5">{entry.description}</p>
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

// ── Tab: Notes ──

function NotesTab({ vendorId }: { vendorId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [newContent, setNewContent] = useState("");
  const [newNoteType, setNewNoteType] = useState("general");
  const [newVisibility, setNewVisibility] = useState("internal");

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
      setNewNoteType("general");
      setNewVisibility("internal");
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

  return (
    <div className="space-y-4">
      {/* Add new note */}
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
              <SelectTrigger className="w-36 bg-white/[0.04] border-white/[0.08] text-white text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#1a1d27] border-white/[0.08]">
                {["general", "performance", "complaint", "feedback", "follow-up"].map((t) => (
                  <SelectItem key={t} value={t} className="text-white capitalize text-xs">
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={newVisibility} onValueChange={setNewVisibility}>
              <SelectTrigger className="w-32 bg-white/[0.04] border-white/[0.08] text-white text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#1a1d27] border-white/[0.08]">
                {["internal", "public"].map((v) => (
                  <SelectItem key={v} value={v} className="text-white capitalize text-xs">
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

      {/* Existing notes */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-20 bg-white/[0.04] rounded-lg" />
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
                    <Badge variant="secondary" className="text-[10px] capitalize bg-white/[0.06] text-white/60 border-transparent">
                      {note.noteType}
                    </Badge>
                  )}
                  {note.visibility && (
                    <Badge
                      variant="outline"
                      className={`text-[10px] capitalize border ${
                        note.visibility === "public"
                          ? "border-blue-500/30 text-blue-400"
                          : "border-white/[0.12] text-white/40"
                      }`}
                    >
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
                <p className="text-[11px] text-white/30 mt-2">— {note.createdBy}</p>
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

  const { data: vendor, isLoading, isError, error } = useQuery<Vendor>({
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
      <div className="max-w-5xl mx-auto p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-20 bg-white/[0.04]" />
          <Skeleton className="h-7 w-48 bg-white/[0.04]" />
        </div>
        <Skeleton className="h-10 w-full bg-white/[0.04]" />
        <Skeleton className="h-64 w-full bg-white/[0.04]" />
      </div>
    );
  }

  if (isError || !vendor) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <Link href="/vendors">
          <Button variant="ghost" size="sm" className="text-white/60 hover:text-white hover:bg-white/[0.06] mb-4">
            <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
            Back to Vendors
          </Button>
        </Link>
        <div className="text-center py-16 text-white/30">
          <AlertCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">
            {(error as Error)?.message ?? "Vendor not found."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-5xl mx-auto p-6 space-y-5">
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
              <div className="w-9 h-9 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <h1 className="text-base font-semibold text-white leading-tight">{vendor.name}</h1>
                {vendor.resourceCode && (
                  <p className="text-xs text-white/40 mt-0.5 font-mono">{vendor.resourceCode}</p>
                )}
              </div>
              <StatusBadge status={vendor.status} />
            </div>
          </div>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEditOpen(true)}
            className="text-white/60 hover:text-white hover:bg-white/[0.06] border border-white/[0.08]"
          >
            <Pencil className="w-3.5 h-3.5 mr-1.5" />
            Edit
          </Button>
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
              Rates
            </TabsTrigger>
            <TabsTrigger
              value="quality"
              className="text-xs text-white/50 data-[state=active]:text-white data-[state=active]:bg-white/[0.08] flex items-center gap-1.5 px-3 py-1.5"
            >
              <Star className="w-3 h-3" />
              Quality History
            </TabsTrigger>
            <TabsTrigger
              value="documents"
              className="text-xs text-white/50 data-[state=active]:text-white data-[state=active]:bg-white/[0.08] flex items-center gap-1.5 px-3 py-1.5"
            >
              <FileText className="w-3 h-3" />
              Documents
            </TabsTrigger>
            <TabsTrigger
              value="activity"
              className="text-xs text-white/50 data-[state=active]:text-white data-[state=active]:bg-white/[0.08] flex items-center gap-1.5 px-3 py-1.5"
            >
              <Activity className="w-3 h-3" />
              Activity Log
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
            <LanguagesTab vendorId={vendorId} />
          </TabsContent>

          <TabsContent value="rates" className="mt-4">
            <RatesTab vendorId={vendorId} />
          </TabsContent>

          <TabsContent value="quality" className="mt-4">
            <QualityTab vendorId={vendorId} />
          </TabsContent>

          <TabsContent value="documents" className="mt-4">
            <DocumentsTab vendorId={vendorId} />
          </TabsContent>

          <TabsContent value="activity" className="mt-4">
            <ActivityTab vendorId={vendorId} />
          </TabsContent>

          <TabsContent value="notes" className="mt-4">
            <NotesTab vendorId={vendorId} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit Dialog */}
      {editOpen && (
        <EditVendorDialog vendor={vendor} open={editOpen} onClose={() => setEditOpen(false)} />
      )}
    </div>
  );
}
