import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  Mail,
  LogOut,
  Star,
  Briefcase,
  DollarSign,
  FileText,
  AlertCircle,
  User,
  CheckCircle2,
} from "lucide-react";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";
const STORAGE_KEY = "elturco_vendor_auth";

// ── Types ──

interface VendorProfile {
  id: number;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  availability?: string;
  paymentInfo?: string;
  qualityScore?: number;
}

interface VendorJob {
  id: number;
  projectId: string;
  account: string;
  languagePair?: string;
  role?: string;
  status?: string;
  deadline?: string;
  wordCount?: number;
  rate?: number;
  total?: number;
}

interface PurchaseOrder {
  id: number;
  poNumber?: string;
  projectId?: string;
  amount?: number;
  currency?: string;
  status?: string;
  issuedAt?: string;
  paidAt?: string;
}

interface QualityScore {
  id: number;
  projectId?: string;
  score?: number;
  category?: string;
  feedback?: string;
  createdAt?: string;
}

interface VendorDocument {
  id: number;
  name: string;
  type?: string;
  url?: string;
  uploadedAt?: string;
}

// ── Helpers ──

function formatDate(dateStr?: string) {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function formatCurrency(amount?: number, currency = "USD") {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}

// ── Empty State ──

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <FileText className="w-8 h-8 text-white/10 mb-2" />
      <p className="text-white/30 text-sm">{label}</p>
    </div>
  );
}

// ── Loading State ──

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-14">
      <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
    </div>
  );
}

// ── Status Badge ──

function StatusBadge({ status }: { status?: string }) {
  if (!status) return <span className="text-white/30 text-xs">—</span>;
  const map: Record<string, string> = {
    active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    completed: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    paid: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    overdue: "bg-red-500/10 text-red-400 border-red-500/20",
    cancelled: "bg-white/5 text-white/30 border-white/10",
  };
  const cls = map[status.toLowerCase()] ?? "bg-white/5 text-white/40 border-white/10";
  return (
    <Badge className={`text-[10px] border ${cls}`}>{status}</Badge>
  );
}

// ── Dashboard Tab ──

function DashboardTab({
  profile,
  jobs,
  payments,
}: {
  profile?: VendorProfile;
  jobs?: VendorJob[];
  payments?: PurchaseOrder[];
}) {
  const activeJobs = jobs?.filter((j) => j.status?.toLowerCase() === "active") ?? [];
  const recentPayments = payments?.slice(0, 5) ?? [];

  const kpis = [
    {
      label: "Quality Score",
      value: profile?.qualityScore != null ? `${profile.qualityScore}%` : "—",
      icon: <Star className="w-4 h-4 text-amber-400" />,
      color: "text-amber-400",
    },
    {
      label: "Active Jobs",
      value: activeJobs.length,
      icon: <Briefcase className="w-4 h-4 text-blue-400" />,
      color: "text-blue-400",
    },
    {
      label: "Total Payments",
      value: payments?.length ?? 0,
      icon: <DollarSign className="w-4 h-4 text-emerald-400" />,
      color: "text-emerald-400",
    },
  ];

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="bg-[#1a1d27] border-white/[0.06]">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-white/[0.04] flex items-center justify-center shrink-0">
                {kpi.icon}
              </div>
              <div>
                <p className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</p>
                <p className="text-xs text-white/40 mt-0.5">{kpi.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Welcome card */}
      {profile && (
        <Card className="bg-[#1a1d27] border-white/[0.06]">
          <CardContent className="p-4">
            <p className="text-white/60 text-sm">
              Welcome back, <span className="text-white font-medium">{profile.name}</span>.
            </p>
            <p className="text-white/30 text-xs mt-0.5">{profile.email}</p>
          </CardContent>
        </Card>
      )}

      {/* Recent Payments */}
      <Card className="bg-[#1a1d27] border-white/[0.06]">
        <CardHeader className="px-4 pt-4 pb-2">
          <CardTitle className="text-sm text-white/70 font-medium">Recent Payments</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {recentPayments.length === 0 ? (
            <p className="text-white/30 text-sm py-4 text-center">No payments yet</p>
          ) : (
            <div className="space-y-2">
              {recentPayments.map((po) => (
                <div
                  key={po.id}
                  className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0"
                >
                  <div>
                    <p className="text-white text-xs font-medium">
                      {po.poNumber ?? `PO #${po.id}`}
                    </p>
                    <p className="text-white/30 text-[11px]">{formatDate(po.issuedAt)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-white/70 text-xs font-medium">
                      {formatCurrency(po.amount, po.currency)}
                    </span>
                    <StatusBadge status={po.status} />
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

// ── Profile Tab ──

function ProfileTab({
  vendorToken,
  profile,
  onSaved,
}: {
  vendorToken: string;
  profile?: VendorProfile;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    phone: profile?.phone ?? "",
    address: profile?.address ?? "",
    availability: profile?.availability ?? "",
    paymentInfo: profile?.paymentInfo ?? "",
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        phone: profile.phone ?? "",
        address: profile.address ?? "",
        availability: profile.availability ?? "",
        paymentInfo: profile.paymentInfo ?? "",
      });
    }
  }, [profile]);

  const saveMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await fetch(`${API_BASE}/api/portal/profile`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${vendorToken}`,
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to save profile");
      }
      return res.json();
    },
    onSuccess: () => {
      setSaved(true);
      onSaved();
      setTimeout(() => setSaved(false), 2500);
    },
  });

  return (
    <Card className="bg-[#1a1d27] border-white/[0.06]">
      <CardHeader className="px-5 pt-5 pb-2">
        <CardTitle className="text-sm text-white/70 font-medium flex items-center gap-2">
          <User className="w-4 h-4" /> Profile Information
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5 space-y-4">
        {profile && (
          <div className="pb-3 border-b border-white/[0.06]">
            <p className="text-white font-medium">{profile.name}</p>
            <p className="text-white/40 text-xs">{profile.email}</p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-white/60 text-xs">Phone</Label>
          <Input
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder="+1 555 000 0000"
            className="h-9 bg-[#13151d] border-white/[0.08] text-white text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-white/60 text-xs">Address</Label>
          <Input
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            placeholder="Street, City, Country"
            className="h-9 bg-[#13151d] border-white/[0.08] text-white text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-white/60 text-xs">Availability</Label>
          <Input
            value={form.availability}
            onChange={(e) => setForm((f) => ({ ...f, availability: e.target.value }))}
            placeholder="e.g. Full-time, Weekdays only, 20 hrs/week"
            className="h-9 bg-[#13151d] border-white/[0.08] text-white text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-white/60 text-xs">Payment Info</Label>
          <Input
            value={form.paymentInfo}
            onChange={(e) => setForm((f) => ({ ...f, paymentInfo: e.target.value }))}
            placeholder="Bank / PayPal / IBAN details"
            className="h-9 bg-[#13151d] border-white/[0.08] text-white text-sm"
          />
        </div>

        {saveMutation.isError && (
          <p className="text-red-400 text-xs">{(saveMutation.error as Error).message}</p>
        )}

        <Button
          onClick={() => saveMutation.mutate(form)}
          disabled={saveMutation.isPending}
          className="h-9 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium"
        >
          {saveMutation.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
          ) : saved ? (
            <CheckCircle2 className="w-3.5 h-3.5 mr-2 text-emerald-300" />
          ) : null}
          {saved ? "Saved" : "Save Changes"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Jobs Tab ──

function JobsTab({ jobs, loading }: { jobs?: VendorJob[]; loading: boolean }) {
  if (loading) return <LoadingState />;
  if (!jobs?.length) return <EmptyState label="No jobs found" />;

  return (
    <Card className="bg-[#1a1d27] border-white/[0.06] overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="border-white/[0.06] hover:bg-transparent">
            <TableHead className="text-white/40 text-xs font-medium">Project</TableHead>
            <TableHead className="text-white/40 text-xs font-medium">Account</TableHead>
            <TableHead className="text-white/40 text-xs font-medium hidden sm:table-cell">Role</TableHead>
            <TableHead className="text-white/40 text-xs font-medium hidden md:table-cell">Deadline</TableHead>
            <TableHead className="text-white/40 text-xs font-medium hidden md:table-cell">Words</TableHead>
            <TableHead className="text-white/40 text-xs font-medium hidden lg:table-cell">Total</TableHead>
            <TableHead className="text-white/40 text-xs font-medium">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job) => (
            <TableRow key={job.id} className="border-white/[0.04] hover:bg-white/[0.02]">
              <TableCell className="text-white text-xs font-medium py-3">{job.projectId ?? `#${job.id}`}</TableCell>
              <TableCell className="text-white/50 text-xs py-3">{job.account ?? "—"}</TableCell>
              <TableCell className="text-white/50 text-xs py-3 hidden sm:table-cell">{job.role ?? "—"}</TableCell>
              <TableCell className="text-white/50 text-xs py-3 hidden md:table-cell">{formatDate(job.deadline)}</TableCell>
              <TableCell className="text-white/50 text-xs py-3 hidden md:table-cell">
                {job.wordCount != null ? job.wordCount.toLocaleString() : "—"}
              </TableCell>
              <TableCell className="text-white/50 text-xs py-3 hidden lg:table-cell">
                {formatCurrency(job.total)}
              </TableCell>
              <TableCell className="py-3">
                <StatusBadge status={job.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

// ── Payments Tab ──

function PaymentsTab({ payments, loading }: { payments?: PurchaseOrder[]; loading: boolean }) {
  if (loading) return <LoadingState />;
  if (!payments?.length) return <EmptyState label="No purchase orders found" />;

  return (
    <Card className="bg-[#1a1d27] border-white/[0.06] overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="border-white/[0.06] hover:bg-transparent">
            <TableHead className="text-white/40 text-xs font-medium">PO Number</TableHead>
            <TableHead className="text-white/40 text-xs font-medium hidden sm:table-cell">Project</TableHead>
            <TableHead className="text-white/40 text-xs font-medium">Amount</TableHead>
            <TableHead className="text-white/40 text-xs font-medium hidden md:table-cell">Issued</TableHead>
            <TableHead className="text-white/40 text-xs font-medium hidden md:table-cell">Paid</TableHead>
            <TableHead className="text-white/40 text-xs font-medium">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {payments.map((po) => (
            <TableRow key={po.id} className="border-white/[0.04] hover:bg-white/[0.02]">
              <TableCell className="text-white text-xs font-medium py-3">
                {po.poNumber ?? `PO-${po.id}`}
              </TableCell>
              <TableCell className="text-white/50 text-xs py-3 hidden sm:table-cell">
                {po.projectId ?? "—"}
              </TableCell>
              <TableCell className="text-white/70 text-xs font-medium py-3">
                {formatCurrency(po.amount, po.currency)}
              </TableCell>
              <TableCell className="text-white/50 text-xs py-3 hidden md:table-cell">
                {formatDate(po.issuedAt)}
              </TableCell>
              <TableCell className="text-white/50 text-xs py-3 hidden md:table-cell">
                {formatDate(po.paidAt)}
              </TableCell>
              <TableCell className="py-3">
                <StatusBadge status={po.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

// ── Quality Tab ──

function QualityTab({ scores, loading }: { scores?: QualityScore[]; loading: boolean }) {
  if (loading) return <LoadingState />;
  if (!scores?.length) return <EmptyState label="No quality scores yet" />;

  const avg =
    scores.reduce((sum, s) => sum + (s.score ?? 0), 0) / scores.length;

  return (
    <div className="space-y-4">
      <Card className="bg-[#1a1d27] border-white/[0.06]">
        <CardContent className="p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
            <Star className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-amber-400">{avg.toFixed(1)}%</p>
            <p className="text-xs text-white/40">Average quality score across {scores.length} review{scores.length !== 1 ? "s" : ""}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-[#1a1d27] border-white/[0.06] overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-white/[0.06] hover:bg-transparent">
              <TableHead className="text-white/40 text-xs font-medium">Project</TableHead>
              <TableHead className="text-white/40 text-xs font-medium">Category</TableHead>
              <TableHead className="text-white/40 text-xs font-medium">Score</TableHead>
              <TableHead className="text-white/40 text-xs font-medium hidden md:table-cell">Feedback</TableHead>
              <TableHead className="text-white/40 text-xs font-medium hidden sm:table-cell">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {scores.map((qs) => (
              <TableRow key={qs.id} className="border-white/[0.04] hover:bg-white/[0.02]">
                <TableCell className="text-white text-xs font-medium py-3">
                  {qs.projectId ?? `#${qs.id}`}
                </TableCell>
                <TableCell className="text-white/50 text-xs py-3">{qs.category ?? "—"}</TableCell>
                <TableCell className="py-3">
                  {qs.score != null ? (
                    <span
                      className={`text-xs font-bold ${
                        qs.score >= 90
                          ? "text-emerald-400"
                          : qs.score >= 70
                          ? "text-amber-400"
                          : "text-red-400"
                      }`}
                    >
                      {qs.score}%
                    </span>
                  ) : (
                    <span className="text-white/30 text-xs">—</span>
                  )}
                </TableCell>
                <TableCell className="text-white/40 text-xs py-3 hidden md:table-cell max-w-[200px] truncate">
                  {qs.feedback ?? "—"}
                </TableCell>
                <TableCell className="text-white/40 text-xs py-3 hidden sm:table-cell">
                  {formatDate(qs.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

// ── Documents Tab ──

function DocumentsTab({ documents, loading }: { documents?: VendorDocument[]; loading: boolean }) {
  if (loading) return <LoadingState />;
  if (!documents?.length) return <EmptyState label="No documents found" />;

  return (
    <div className="space-y-2">
      {documents.map((doc) => (
        <Card key={doc.id} className="bg-[#1a1d27] border-white/[0.06]">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <p className="text-white text-sm font-medium">{doc.name}</p>
                <p className="text-white/30 text-xs">
                  {doc.type ?? "Document"} · {formatDate(doc.uploadedAt)}
                </p>
              </div>
            </div>
            {doc.url && (
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0"
              >
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs border-white/[0.08] text-white/60 hover:text-white hover:border-white/20 bg-transparent"
                >
                  View
                </Button>
              </a>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Main Page ──

export default function VendorPortalPage() {
  const [, verifyParams] = useRoute("/portal/verify/:token");
  const verifyToken = verifyParams?.token ?? "";

  const [vendorToken, setVendorToken] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) ?? "";
    } catch {
      return "";
    }
  });

  const [email, setEmail] = useState("");
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [magicLinkLoading, setMagicLinkLoading] = useState(false);
  const [magicLinkError, setMagicLinkError] = useState("");
  const [verifying, setVerifying] = useState(!!verifyToken);
  const [verifyError, setVerifyError] = useState("");
  const [activeTab, setActiveTab] = useState("dashboard");

  // ── Verify magic link token from URL ──
  useEffect(() => {
    if (!verifyToken) return;
    setVerifying(true);
    fetch(`${API_BASE}/api/auth/vendor-verify/${verifyToken}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.token) {
          try {
            localStorage.setItem(STORAGE_KEY, d.token);
          } catch {}
          setVendorToken(d.token);
        } else {
          setVerifyError(d.error ?? "Verification failed");
        }
      })
      .catch(() => setVerifyError("Verification failed"))
      .finally(() => setVerifying(false));
  }, [verifyToken]);

  // ── API queries ──

  const profileQuery = useQuery({
    queryKey: ["/api/portal/profile", vendorToken],
    enabled: !!vendorToken,
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/portal/profile`, {
        headers: { Authorization: `Bearer ${vendorToken}` },
      });
      if (res.status === 401) {
        handleLogout();
        return null;
      }
      return res.json() as Promise<VendorProfile>;
    },
  });

  const jobsQuery = useQuery({
    queryKey: ["/api/portal/jobs", vendorToken],
    enabled: !!vendorToken && activeTab === "jobs",
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/portal/jobs`, {
        headers: { Authorization: `Bearer ${vendorToken}` },
      });
      if (res.status === 401) { handleLogout(); return []; }
      return res.json() as Promise<VendorJob[]>;
    },
  });

  const paymentsQuery = useQuery({
    queryKey: ["/api/portal/payments", vendorToken],
    enabled: !!vendorToken && (activeTab === "payments" || activeTab === "dashboard"),
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/portal/payments`, {
        headers: { Authorization: `Bearer ${vendorToken}` },
      });
      if (res.status === 401) { handleLogout(); return []; }
      return res.json() as Promise<PurchaseOrder[]>;
    },
  });

  const qualityQuery = useQuery({
    queryKey: ["/api/portal/quality-scores", vendorToken],
    enabled: !!vendorToken && activeTab === "quality",
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/portal/quality-scores`, {
        headers: { Authorization: `Bearer ${vendorToken}` },
      });
      if (res.status === 401) { handleLogout(); return []; }
      return res.json() as Promise<QualityScore[]>;
    },
  });

  const documentsQuery = useQuery({
    queryKey: ["/api/portal/documents", vendorToken],
    enabled: !!vendorToken && activeTab === "documents",
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/portal/documents`, {
        headers: { Authorization: `Bearer ${vendorToken}` },
      });
      if (res.status === 401) { handleLogout(); return []; }
      return res.json() as Promise<VendorDocument[]>;
    },
  });

  // ── Also load jobs for dashboard active count ──
  const jobsDashboardQuery = useQuery({
    queryKey: ["/api/portal/jobs-dashboard", vendorToken],
    enabled: !!vendorToken && activeTab === "dashboard",
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/portal/jobs`, {
        headers: { Authorization: `Bearer ${vendorToken}` },
      });
      if (res.status === 401) { handleLogout(); return []; }
      return res.json() as Promise<VendorJob[]>;
    },
  });

  // ── Auth handlers ──

  function handleLogout() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    setVendorToken("");
  }

  async function handleRequestMagicLink() {
    if (!email) return;
    setMagicLinkLoading(true);
    setMagicLinkError("");
    try {
      const res = await fetch(`${API_BASE}/api/auth/vendor-magic-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          clientBaseUrl: window.location.href.split("#")[0].replace(/\/$/, ""),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMagicLinkError(json.error ?? "Failed to send magic link");
      } else {
        setMagicLinkSent(true);
      }
    } catch {
      setMagicLinkError("Connection error. Please try again.");
    } finally {
      setMagicLinkLoading(false);
    }
  }

  // ── Verifying state ──

  if (verifying) {
    return (
      <div className="min-h-screen bg-[#0f1117] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
          <p className="text-sm text-white/40">Verifying your link...</p>
        </div>
      </div>
    );
  }

  if (verifyError) {
    return (
      <div className="min-h-screen bg-[#0f1117] flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-[#1a1d27] rounded-2xl border border-white/[0.06] p-8 text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-white font-medium mb-2">Link Expired</p>
          <p className="text-sm text-white/40 mb-6">{verifyError}</p>
          <Button
            variant="outline"
            className="border-white/10 text-white/60"
            onClick={() => { setVerifyError(""); setVendorToken(""); }}
          >
            Request New Link
          </Button>
        </div>
      </div>
    );
  }

  // ── Not authenticated — show login ──

  if (!vendorToken) {
    return (
      <div className="min-h-screen bg-[#0f1117]">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#0d1117] via-[#131620] to-[#0d1117] border-b border-white/[0.04] px-6 py-4">
          <div className="max-w-md mx-auto flex items-center gap-3">
            <img src="/logo-icon.jpg" alt="ElTurco" className="w-8 h-8 rounded-lg object-cover" />
            <div>
              <p className="text-white font-semibold text-sm">ElTurco Portal</p>
              <p className="text-white/30 text-[11px]">Vendor (Linguist) Portal</p>
            </div>
          </div>
        </div>

        <div className="max-w-md mx-auto p-6 mt-12">
          <div className="bg-[#1a1d27] rounded-2xl border border-white/[0.06] p-8">
            {magicLinkSent ? (
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
                  <Mail className="w-8 h-8 text-emerald-400" />
                </div>
                <p className="text-white font-semibold text-lg mb-2">Check Your Email</p>
                <p className="text-white/40 text-sm">
                  We've sent a sign-in link to{" "}
                  <span className="text-white/60">{email}</span>. Click it to
                  access your portal.
                </p>
              </div>
            ) : (
              <>
                <div className="text-center mb-6">
                  <p className="text-white font-semibold text-lg mb-1">Sign In</p>
                  <p className="text-white/40 text-sm">
                    Enter your email to receive a magic link.
                  </p>
                </div>
                {magicLinkError && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4">
                    <p className="text-sm text-red-300">{magicLinkError}</p>
                  </div>
                )}
                <div className="space-y-3">
                  <Input
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleRequestMagicLink()}
                    className="h-11 bg-[#13151d] border-white/[0.08] text-white"
                    data-testid="input-vendor-email"
                  />
                  <button
                    className="w-full h-11 rounded-lg bg-blue-500 hover:bg-blue-400 text-white font-medium text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                    onClick={handleRequestMagicLink}
                    disabled={magicLinkLoading || !email}
                    data-testid="button-vendor-magic-link"
                  >
                    {magicLinkLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Mail className="w-4 h-4" />
                    )}
                    Send Magic Link
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Authenticated portal ──

  const profile = profileQuery.data ?? undefined;
  const jobs = activeTab === "jobs" ? jobsQuery.data : jobsDashboardQuery.data;
  const payments = paymentsQuery.data;
  const qualityScores = qualityQuery.data;
  const documents = documentsQuery.data;

  return (
    <div className="min-h-screen bg-[#0f1117]">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#0d1117] via-[#131620] to-[#0d1117] border-b border-white/[0.04] px-4 sm:px-6 py-3 sticky top-0 z-30">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo-icon.jpg" alt="ElTurco" className="w-7 h-7 rounded-lg object-cover" />
            <div>
              <p className="text-white font-semibold text-sm">ElTurco Portal</p>
              {profileQuery.isLoading ? (
                <p className="text-white/30 text-[11px]">Loading...</p>
              ) : profile ? (
                <p className="text-white/30 text-[11px]">{profile.name}</p>
              ) : (
                <p className="text-white/30 text-[11px]">Vendor Portal</p>
              )}
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-white/30 hover:text-white/60 text-xs transition-colors"
            data-testid="button-vendor-logout"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-3xl mx-auto p-4 sm:p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full bg-[#1a1d27] border border-white/[0.04] rounded-xl p-1 mb-5 flex gap-0.5 overflow-x-auto">
            {[
              { value: "dashboard", label: "Dashboard" },
              { value: "profile", label: "Profile" },
              { value: "jobs", label: "Jobs" },
              { value: "payments", label: "Payments" },
              { value: "quality", label: "Quality" },
              { value: "documents", label: "Documents" },
            ].map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="flex-1 min-w-[70px] text-xs font-medium py-2 rounded-lg data-[state=active]:bg-white/[0.08] data-[state=active]:text-white data-[state=inactive]:text-white/30 data-[state=inactive]:hover:text-white/50 transition-all"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="dashboard">
            <DashboardTab
              profile={profile}
              jobs={jobs ?? undefined}
              payments={payments ?? undefined}
            />
          </TabsContent>

          <TabsContent value="profile">
            <ProfileTab
              vendorToken={vendorToken}
              profile={profile}
              onSaved={() => profileQuery.refetch()}
            />
          </TabsContent>

          <TabsContent value="jobs">
            <JobsTab jobs={jobs ?? undefined} loading={jobsQuery.isLoading} />
          </TabsContent>

          <TabsContent value="payments">
            <PaymentsTab
              payments={payments ?? undefined}
              loading={paymentsQuery.isLoading}
            />
          </TabsContent>

          <TabsContent value="quality">
            <QualityTab
              scores={qualityScores ?? undefined}
              loading={qualityQuery.isLoading}
            />
          </TabsContent>

          <TabsContent value="documents">
            <DocumentsTab
              documents={documents ?? undefined}
              loading={documentsQuery.isLoading}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
