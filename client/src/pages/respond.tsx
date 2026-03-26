import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, CheckCircle2, XCircle, AlertTriangle, FileCheck, Clock, ExternalLink, Globe, FileText } from "lucide-react";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

interface OfferData {
  offer: {
    id: number;
    status: string;
    freelancerName: string;
    freelancerCode: string;
    sentAt: string;
  };
  assignment: {
    id: number;
    source: string;
    sheet: string;
    projectId: string;
    account: string;
    role: string;
    status: string;
    assignmentType: string;
    reviewType: string | null;
  };
  task: any;
}

export default function RespondPage() {
  const [, params] = useRoute("/respond/:token");
  const token = params?.token || "";
  const [data, setData] = useState<OfferData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState<"accept" | "reject" | "complete" | null>(null);
  const [actionResult, setActionResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showTimeInput, setShowTimeInput] = useState(false);
  const [timeSpent, setTimeSpent] = useState("");
  const [qsScore, setQsScore] = useState("");

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/api/offers/${token}`)
      .then(res => {
        if (!res.ok) throw new Error("not_found");
        return res.json();
      })
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError("Offer not found or expired."); setLoading(false); });
  }, [token]);

  async function handleAction(action: "accept" | "reject" | "complete") {
    setActionLoading(action);
    try {
      const bodyData: any = {
        clientBaseUrl: window.location.href.split("#")[0].replace(/\/$/, ""),
        apiBaseUrl: (() => {
          const ab = "__PORT_5000__";
          if (ab.startsWith("__")) return window.location.origin;
          const m = window.location.href.split("#")[0].match(/^(https?:\/\/[^/]+\/sites\/proxy\/[^/]+\/)/);
          return m ? m[1] + ab : window.location.origin + "/" + ab;
        })(),
      };
      if (action === "complete" && timeSpent) bodyData.timeSpent = parseInt(timeSpent, 10);
      if (action === "complete" && qsScore) bodyData.qsScore = parseFloat(qsScore);
      const res = await fetch(`${API_BASE}/api/offers/${token}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyData),
      });
      const json = await res.json();
      if (!res.ok) {
        setActionResult({ success: false, message: json.error || "An error occurred." });
      } else {
        setActionResult({ success: true, message: json.message });
        const refreshRes = await fetch(`${API_BASE}/api/offers/${token}`);
        if (refreshRes.ok) setData(await refreshRes.json());
      }
    } catch {
      setActionResult({ success: false, message: "Connection error. Please try again." });
    } finally {
      setActionLoading(null);
      setShowTimeInput(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f1117] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
          <p className="text-sm text-white/40">Loading task details...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#0f1117] flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-[#1a1d27] rounded-2xl border border-white/[0.06] p-8 text-center">
          <AlertTriangle className="w-12 h-12 text-orange-400 mx-auto mb-4" />
          <p className="font-medium text-white text-lg mb-2">Not Found</p>
          <p className="text-sm text-white/50">{error || "This offer is no longer available."}</p>
        </div>
      </div>
    );
  }

  const { offer, assignment, task } = data;
  const isTranslator = assignment.role === "translator";
  const isReviewer = assignment.role === "reviewer";
  const isSelfEdit = assignment.reviewType === "Self-Edit";
  const role = isTranslator ? "Translation" : (isSelfEdit ? "Self-Edit" : "Review");
  const isPending = offer.status === "pending";
  const isAccepted = offer.status === "accepted";
  const isCompleted = assignment.status === "completed";

  const deadline = isTranslator ? (task.deadline || "—") : (task.revDeadline || task.deadline || "—");
  const deadlineLabel = isTranslator ? "TR Deadline" : "Review Deadline";

  // CAT counts for translator
  const cc = task.catCounts || {};
  const hasCatCounts = cc.ice || cc.rep || cc.match100 || cc.fuzzy95 || cc.fuzzy85 || cc.fuzzy75 || cc.noMatch || cc.mt;
  const nonZeroCats = hasCatCounts ? [
    { label: "ICE/101%", value: cc.ice },
    { label: "Rep", value: cc.rep },
    { label: "100%", value: cc.match100 },
    { label: "95-99%", value: cc.fuzzy95 },
    { label: "85-94%", value: cc.fuzzy85 },
    { label: "75-84%", value: cc.fuzzy75 },
    { label: "No Match", value: cc.noMatch },
    { label: "MT", value: cc.mt },
  ].filter(c => c.value && c.value !== "0") : [];

  const needsTimeInput = isReviewer && !isSelfEdit;

  // Status config
  const statusConfig = {
    pending: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20", label: "Awaiting Response" },
    accepted: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20", label: "Accepted" },
    completed: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20", label: "Completed" },
    rejected: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/20", label: "Declined" },
    withdrawn: { bg: "bg-zinc-500/10", text: "text-zinc-400", border: "border-zinc-500/20", label: "Withdrawn" },
    expired: { bg: "bg-zinc-500/10", text: "text-zinc-400", border: "border-zinc-500/20", label: "Expired" },
  };
  const st = statusConfig[offer.status as keyof typeof statusConfig] || statusConfig.pending;
  const displayStatus = isCompleted ? statusConfig.completed : st;

  return (
    <div className="min-h-screen bg-[#0f1117]">
      {/* Top brand bar */}
      <div className="bg-gradient-to-r from-[#0d1117] via-[#131620] to-[#0d1117] border-b border-white/[0.04] px-6 py-4">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <img src="/logo-icon.jpg" alt="ElTurco" className="w-8 h-8 rounded-lg object-cover" />
          <div>
            <p className="text-white font-semibold text-sm tracking-tight">ElTurco Dispatch</p>
            <p className="text-white/30 text-[11px]">Task Assignment Portal</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 sm:p-6 space-y-4">
        {/* Result banner */}
        {actionResult && (
          <div className={`p-4 rounded-xl flex items-center gap-3 ${actionResult.success ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-red-500/10 border border-red-500/20"}`} data-testid="text-action-result">
            {actionResult.success ? <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" /> : <XCircle className="w-5 h-5 text-red-400 shrink-0" />}
            <p className={`text-sm font-medium ${actionResult.success ? "text-emerald-300" : "text-red-300"}`}>{actionResult.message}</p>
          </div>
        )}

        {/* Main card */}
        <div className="bg-[#1a1d27] rounded-2xl border border-white/[0.06] overflow-hidden">
          {/* Header with role badge */}
          <div className="px-6 pt-6 pb-4 border-b border-white/[0.04]">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-white/40 text-xs mb-1">Hello</p>
                <p className="text-white text-xl font-semibold" data-testid="text-freelancer-name">{offer.freelancerName}</p>
              </div>
              <Badge className={`text-xs ${displayStatus.bg} ${displayStatus.text} ${displayStatus.border} border`}>{displayStatus.label}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs text-blue-300 border-blue-500/20 bg-blue-500/5">{role}</Badge>
              <span className="text-white/30 text-xs">{assignment.source} / {assignment.sheet}</span>
            </div>
          </div>

          {/* Task info grid */}
          <div className="px-6 py-4 space-y-3">
            <InfoRow icon={<Globe className="w-3.5 h-3.5" />} label="Account" value={task.account || assignment.account} />
            {task.projectTitle && <InfoRow icon={<FileText className="w-3.5 h-3.5" />} label="Project" value={task.projectTitle} />}
            <InfoRow label="Project ID" value={assignment.projectId} mono />
            {task.atmsId && task.atmsId !== assignment.projectId && <InfoRow label="ATMS ID" value={task.atmsId} mono />}
            <InfoRow label={deadlineLabel} value={deadline} highlight />

            {/* WC: Translator sees Total/WWC, Reviewer sees only Total WC */}
            {isReviewer ? (
              <InfoRow label="Total WC" value={task.total || "—"} />
            ) : (
              <InfoRow label="Total / WWC" value={`${task.total || "—"} / ${task.wwc || "—"}`} />
            )}
            {isReviewer && task.revType && <InfoRow label="Review Type" value={task.revType} />}
          </div>

          {/* CAT Breakdown — translator only */}
          {isTranslator && nonZeroCats.length > 0 && (
            <div className="mx-6 mb-4">
              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-2">CAT Analysis</p>
              <div className="bg-[#13151d] rounded-xl border border-white/[0.04] p-4">
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  {nonZeroCats.map(c => (
                    <div key={c.label} className="flex justify-between">
                      <span className="text-white/40 text-xs">{c.label}</span>
                      <span className="text-white/80 text-xs font-medium tabular-nums">{c.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* HO Note */}
          {task.hoNote && (
            <div className="mx-6 mb-4">
              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-2">HO Note</p>
              <div className="bg-amber-500/[0.04] border border-amber-500/10 rounded-xl p-4">
                <p className="text-sm text-amber-200/80 leading-relaxed">{task.hoNote}</p>
              </div>
            </div>
          )}

          {/* Instructions */}
          {task.instructions && (
            <div className="mx-6 mb-4">
              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-2">Instructions</p>
              <div className="bg-blue-500/[0.04] border border-blue-500/10 rounded-xl p-4">
                <p className="text-sm text-blue-200/80 leading-relaxed whitespace-pre-wrap">{task.instructions}</p>
              </div>
            </div>
          )}

          {/* Symfonie link */}
          {(task.symfonieLink || task.symfonieId) && (
            <div className="mx-6 mb-4">
              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-2">Symfonie</p>
              <div className="bg-[#13151d] border border-white/[0.04] rounded-xl p-4">
                {task.symfonieLink ? (
                  <a href={task.symfonieLink.startsWith("http") ? task.symfonieLink : `https://${task.symfonieLink}`}
                     target="_blank" rel="noopener noreferrer"
                     className="text-blue-400 hover:text-blue-300 text-sm underline underline-offset-2 flex items-center gap-1.5 break-all">
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    {task.symfonieLink}
                  </a>
                ) : (
                  <span className="text-white/60 text-sm">{task.symfonieId}</span>
                )}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="px-6 pb-6">
            {isPending && !actionResult?.success && (
              <div className="space-y-2.5">
                <button
                  className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  onClick={() => handleAction("accept")}
                  disabled={!!actionLoading}
                  data-testid="button-accept"
                >
                  {actionLoading === "accept" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Accept Task
                </button>
                <button
                  className="w-full h-11 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white/60 hover:text-white font-medium text-sm flex items-center justify-center gap-2 transition-colors border border-white/[0.06] disabled:opacity-50"
                  onClick={() => handleAction("reject")}
                  disabled={!!actionLoading}
                  data-testid="button-reject"
                >
                  {actionLoading === "reject" ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                  Decline
                </button>
              </div>
            )}

            {isAccepted && !isCompleted && (
              <div className="space-y-3">
                {needsTimeInput && !showTimeInput && (
                  <button
                    className="w-full h-12 rounded-xl bg-blue-500 hover:bg-blue-400 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                    onClick={() => setShowTimeInput(true)}
                    disabled={!!actionLoading}
                    data-testid="button-complete"
                  >
                    <FileCheck className="w-4 h-4" />
                    Mark as Completed
                  </button>
                )}
                {needsTimeInput && showTimeInput && (
                  <div className="bg-[#13151d] border border-white/[0.06] rounded-xl p-4 space-y-4">
                    <p className="text-sm font-medium text-white">How long did the review take?</p>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-white/30 shrink-0" />
                      <Input
                        type="number"
                        placeholder="Minutes spent..."
                        value={timeSpent}
                        onChange={(e) => setTimeSpent(e.target.value)}
                        className="h-10 text-sm bg-[#0f1117] border-white/[0.08]"
                        autoFocus
                        data-testid="input-time-spent"
                      />
                    </div>
                    <div>
                      <p className="text-xs text-white/40 mb-2">QS Score <span className="opacity-50">(optional)</span></p>
                      <div className="flex flex-wrap gap-1.5" data-testid="qs-score-selector">
                        {["1", "1.5", "2", "2.5", "3", "3.5", "4", "4.5", "5"].map((score) => (
                          <button
                            key={score}
                            type="button"
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                              qsScore === score
                                ? "bg-blue-500 text-white border-blue-500"
                                : "bg-transparent text-white/50 border-white/[0.08] hover:border-blue-500/40 hover:text-white/80"
                            }`}
                            onClick={() => setQsScore(qsScore === score ? "" : score)}
                            data-testid={`qs-btn-${score}`}
                          >
                            {score}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="flex-1 h-10 rounded-lg bg-blue-500 hover:bg-blue-400 text-white font-medium text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                        onClick={() => handleAction("complete")}
                        disabled={!!actionLoading || !timeSpent}
                        data-testid="button-confirm-complete"
                      >
                        {actionLoading === "complete" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        Confirm
                      </button>
                      <button
                        className="px-4 h-10 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-white/50 text-sm transition-colors"
                        onClick={() => { setShowTimeInput(false); setTimeSpent(""); setQsScore(""); }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                {!needsTimeInput && (
                  <button
                    className="w-full h-12 rounded-xl bg-blue-500 hover:bg-blue-400 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                    onClick={() => handleAction("complete")}
                    disabled={!!actionLoading}
                    data-testid="button-complete"
                  >
                    {actionLoading === "complete" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck className="w-4 h-4" />}
                    Mark as Completed
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-white/20 pb-4">
          ElTurco Projects — projects@eltur.co
        </p>
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value, highlight, mono }: { icon?: React.ReactNode; label: string; value: string; highlight?: boolean; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-white/35 text-xs flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <span className={`text-sm font-medium ${highlight ? "text-red-400" : "text-white/80"} ${mono ? "font-mono text-xs" : ""} text-right max-w-[60%] break-words`}>
        {value}
      </span>
    </div>
  );
}
