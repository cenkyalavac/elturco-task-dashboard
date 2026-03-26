import { useState, useEffect, useMemo } from "react";
import { useRoute, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Mail, LogOut, Clock, CheckCircle2, FileText, AlertCircle, ExternalLink } from "lucide-react";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

interface FreelancerTask {
  source: string;
  sheet: string;
  projectId: string;
  account: string;
  deadline: string;
  revDeadline: string;
  total: string;
  wwc: string;
  delivered: string;
  projectTitle: string;
  myRoles: string[];
  trDone: string;
  revComplete: string;
  symfonieLink: string;
  hoNote: string;
}

interface PendingOffer {
  offerId: number;
  token: string;
  assignment: { id: number; source: string; sheet: string; projectId: string; account: string; role: string; reviewType: string | null };
  task: any;
  sentAt: string;
}

export default function FreelancerPortalPage() {
  const [, verifyParams] = useRoute("/freelancer/verify/:token");
  const verifyToken = verifyParams?.token || "";

  const [flToken, setFlToken] = useState(() => {
    try { return sessionStorage.getItem("fl_token") || ""; } catch { return ""; }
  });
  const [freelancer, setFreelancer] = useState<{ code: string; name: string; email: string } | null>(() => {
    try { const d = sessionStorage.getItem("fl_data"); return d ? JSON.parse(d) : null; } catch { return null; }
  });

  const [email, setEmail] = useState("");
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [magicLinkLoading, setMagicLinkLoading] = useState(false);
  const [magicLinkError, setMagicLinkError] = useState("");
  const [verifying, setVerifying] = useState(!!verifyToken);
  const [verifyError, setVerifyError] = useState("");

  const [data, setData] = useState<{ active: FreelancerTask[]; completed: FreelancerTask[]; pendingOffers: PendingOffer[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"pending" | "active" | "completed">("active");

  // Verify magic link
  useEffect(() => {
    if (!verifyToken) return;
    setVerifying(true);
    fetch(`${API_BASE}/api/freelancer/verify/${verifyToken}`, { method: "POST" })
      .then(r => r.json())
      .then(d => {
        if (d.token && d.freelancer) {
          try { sessionStorage.setItem("fl_token", d.token); sessionStorage.setItem("fl_data", JSON.stringify(d.freelancer)); } catch {}
          setFlToken(d.token);
          setFreelancer(d.freelancer);
        } else {
          setVerifyError(d.error || "Verification failed");
        }
      })
      .catch(() => setVerifyError("Verification failed"))
      .finally(() => setVerifying(false));
  }, [verifyToken]);

  // Load tasks when authenticated
  useEffect(() => {
    if (!flToken) return;
    setLoading(true);
    fetch(`${API_BASE}/api/freelancer/tasks`, {
      headers: { Authorization: `Bearer ${flToken}` },
    })
      .then(r => {
        if (r.status === 401) { handleLogout(); return null; }
        return r.json();
      })
      .then(d => {
        if (d) {
          setData({ active: d.active, completed: d.completed, pendingOffers: d.pendingOffers });
          if (d.freelancer) setFreelancer(d.freelancer);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [flToken]);

  function handleLogout() {
    try { sessionStorage.removeItem("fl_token"); sessionStorage.removeItem("fl_data"); } catch {}
    setFlToken("");
    setFreelancer(null);
    setData(null);
  }

  async function handleRequestMagicLink() {
    if (!email) return;
    setMagicLinkLoading(true);
    setMagicLinkError("");
    try {
      const res = await fetch(`${API_BASE}/api/freelancer/magic-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, clientBaseUrl: window.location.href.split("#")[0].replace(/\/$/, "") }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMagicLinkError(json.error || "Failed to send magic link");
      } else {
        setMagicLinkSent(true);
      }
    } catch {
      setMagicLinkError("Connection error");
    } finally {
      setMagicLinkLoading(false);
    }
  }

  // Verifying state
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
          <p className="text-sm text-white/40 mb-4">{verifyError}</p>
          <Link href="/freelancer">
            <Button variant="outline" className="border-white/10 text-white/60">Request New Link</Button>
          </Link>
        </div>
      </div>
    );
  }

  // Not authenticated — show login
  if (!flToken || !freelancer) {
    return (
      <div className="min-h-screen bg-[#0f1117]">
        <div className="bg-gradient-to-r from-[#0d1117] via-[#131620] to-[#0d1117] border-b border-white/[0.04] px-6 py-4">
          <div className="max-w-md mx-auto flex items-center gap-3">
            <img src="/logo-icon.jpg" alt="ElTurco" className="w-8 h-8 rounded-lg object-cover" />
            <div>
              <p className="text-white font-semibold text-sm">ElTurco Dispatch</p>
              <p className="text-white/30 text-[11px]">Freelancer Portal</p>
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
                <p className="text-white/40 text-sm">We've sent a sign-in link to <span className="text-white/60">{email}</span>. Click it to access your tasks.</p>
              </div>
            ) : (
              <>
                <div className="text-center mb-6">
                  <p className="text-white font-semibold text-lg mb-1">Sign In</p>
                  <p className="text-white/40 text-sm">Enter your email to receive a magic link.</p>
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
                    className="h-11 bg-[#13151d] border-white/[0.08] text-white"
                    onKeyDown={(e) => e.key === "Enter" && handleRequestMagicLink()}
                    data-testid="input-fl-email"
                  />
                  <button
                    className="w-full h-11 rounded-lg bg-blue-500 hover:bg-blue-400 text-white font-medium text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                    onClick={handleRequestMagicLink}
                    disabled={magicLinkLoading || !email}
                    data-testid="button-fl-magic-link"
                  >
                    {magicLinkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
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

  // Authenticated — show portal
  const pendingCount = data?.pendingOffers?.length || 0;
  const activeCount = data?.active?.length || 0;
  const completedCount = data?.completed?.length || 0;

  return (
    <div className="min-h-screen bg-[#0f1117]">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#0d1117] via-[#131620] to-[#0d1117] border-b border-white/[0.04] px-6 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo-icon.jpg" alt="ElTurco" className="w-7 h-7 rounded-lg object-cover" />
            <div>
              <p className="text-white font-semibold text-sm">{freelancer.name}</p>
              <p className="text-white/30 text-[11px]">{freelancer.code}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-1.5 text-white/30 hover:text-white/60 text-xs transition-colors">
            <LogOut className="w-3.5 h-3.5" /> Sign Out
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 sm:p-6">
        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-[#1a1d27] rounded-xl p-1 border border-white/[0.04]">
          {[
            { key: "pending" as const, label: "Pending", count: pendingCount },
            { key: "active" as const, label: "Active", count: activeCount },
            { key: "completed" as const, label: "Completed", count: completedCount },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                tab === t.key
                  ? "bg-white/[0.08] text-white shadow-sm"
                  : "text-white/30 hover:text-white/50"
              }`}
            >
              {t.label}
              {t.count > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                  tab === t.key ? "bg-blue-500/20 text-blue-300" : "bg-white/[0.06] text-white/40"
                }`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
          </div>
        ) : (
          <div className="space-y-3">
            {tab === "pending" && (
              data?.pendingOffers?.length ? (
                data.pendingOffers.map(o => (
                  <div key={o.offerId} className="bg-[#1a1d27] rounded-xl border border-amber-500/10 p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-white text-sm font-medium">{o.assignment.projectId}</p>
                        <p className="text-white/30 text-xs">{o.assignment.source} / {o.assignment.account}</p>
                      </div>
                      <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 border text-[10px]">Awaiting</Badge>
                    </div>
                    <Link href={`/respond/${o.token}`}>
                      <button className="w-full mt-2 h-9 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-medium transition-colors flex items-center justify-center gap-1.5">
                        <ExternalLink className="w-3 h-3" /> View & Respond
                      </button>
                    </Link>
                  </div>
                ))
              ) : (
                <EmptyState label="No pending offers" />
              )
            )}
            {tab === "active" && (
              data?.active?.length ? (
                data.active.map(t => <TaskCard key={`${t.source}|${t.sheet}|${t.projectId}`} task={t} />)
              ) : (
                <EmptyState label="No active tasks" />
              )
            )}
            {tab === "completed" && (
              data?.completed?.length ? (
                data.completed.map(t => <TaskCard key={`${t.source}|${t.sheet}|${t.projectId}`} task={t} completed />)
              ) : (
                <EmptyState label="No completed tasks" />
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TaskCard({ task, completed }: { task: FreelancerTask; completed?: boolean }) {
  const deadline = task.myRoles.includes("reviewer") ? (task.revDeadline || task.deadline) : task.deadline;
  return (
    <div className={`bg-[#1a1d27] rounded-xl border p-4 ${completed ? "border-white/[0.04] opacity-70" : "border-white/[0.06]"}`}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-white text-sm font-medium">{task.projectId}</p>
          <p className="text-white/30 text-xs">{task.source} / {task.account}</p>
          {task.projectTitle && <p className="text-white/40 text-xs mt-0.5">{task.projectTitle}</p>}
        </div>
        <div className="flex gap-1">
          {task.myRoles.map(r => (
            <Badge key={r} variant="outline" className={`text-[10px] ${r === "translator" ? "text-blue-300 border-blue-500/20" : "text-purple-300 border-purple-500/20"}`}>
              {r === "translator" ? "TR" : "REV"}
            </Badge>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-4 text-xs text-white/40 mt-2">
        {deadline && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{deadline}</span>}
        <span>{task.total || "—"} WC</span>
        {task.delivered !== "Ongoing" && <Badge variant="secondary" className="text-[10px]">{task.delivered}</Badge>}
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="bg-[#1a1d27] rounded-xl border border-white/[0.04] p-12 text-center">
      <FileText className="w-8 h-8 text-white/10 mx-auto mb-2" />
      <p className="text-white/30 text-sm">{label}</p>
    </div>
  );
}
