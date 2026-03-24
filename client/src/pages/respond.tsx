import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, CheckCircle2, XCircle, AlertTriangle, FileCheck, Clock } from "lucide-react";

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
      // For complete action, add timeSpent if reviewer (non-self-edit)
      if (action === "complete" && timeSpent) {
        bodyData.timeSpent = parseInt(timeSpent, 10);
      }
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
        // Refresh data
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-sm w-full border border-border">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="w-10 h-10 text-orange-500 mx-auto mb-3" />
            <p className="font-medium text-foreground">{error || "Offer not found."}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { offer, assignment, task } = data;
  const isTranslator = assignment.role === "translator";
  const isReviewer = assignment.role === "reviewer";
  const isSelfEdit = assignment.reviewType === "Self-Edit";
  const role = isTranslator ? "Translation" : (isSelfEdit ? "Self-Edit (Translation + Review)" : "Review");
  const isPending = offer.status === "pending";
  const isAccepted = offer.status === "accepted";
  const isCompleted = assignment.status === "completed";

  // Show the right deadline based on role
  const deadline = isTranslator ? (task.deadline || "—") : (task.revDeadline || task.deadline || "—");
  const deadlineLabel = isTranslator ? "Translation Deadline" : "Review Deadline";

  // Cat counts
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

  // Should we ask for time spent? Only for reviewers who are NOT self-edit
  const needsTimeInput = isReviewer && !isSelfEdit;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 32 32" fill="none">
              <path d="M6 8h20M6 14h14M6 20h8M22 18l4 4-4 4" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="font-semibold text-foreground text-sm">ElTurco Dispatch</span>
        </div>

        <Card className="border border-border">
          <CardContent className="pt-6">
            {/* Result banner */}
            {actionResult && (
              <div className={`mb-4 p-3 rounded-lg text-sm flex items-center gap-2 ${actionResult.success ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"}`} data-testid="text-action-result">
                {actionResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
                {actionResult.message}
              </div>
            )}

            {/* Greeting */}
            <p className="text-sm text-muted-foreground mb-1">Hello</p>
            <p className="text-lg font-semibold text-foreground mb-4" data-testid="text-freelancer-name">{offer.freelancerName}</p>

            {/* Status badge */}
            <div className="mb-4">
              {offer.status === "pending" && <Badge variant="secondary" className="text-xs">Pending Response</Badge>}
              {offer.status === "accepted" && !isCompleted && <Badge className="text-xs bg-green-500/10 text-green-600 border-green-500/20">Accepted</Badge>}
              {isCompleted && <Badge className="text-xs bg-blue-500/10 text-blue-600 border-blue-500/20">Completed</Badge>}
              {offer.status === "rejected" && <Badge variant="destructive" className="text-xs">Declined</Badge>}
              {offer.status === "withdrawn" && <Badge variant="secondary" className="text-xs">Withdrawn</Badge>}
              {offer.status === "expired" && <Badge variant="destructive" className="text-xs">Expired</Badge>}
            </div>

            {/* Task details */}
            <div className="space-y-0 text-sm mb-4">
              <DetailRow label="Task Type" value={role} />
              <DetailRow label="Account" value={task.account || assignment.account} />
              <DetailRow label="Source" value={`${assignment.source} / ${assignment.sheet}`} />
              <DetailRow label="Project ID" value={assignment.projectId} />
              {task.atmsId && task.atmsId !== assignment.projectId && (
                <DetailRow label="ATMS ID" value={task.atmsId} />
              )}
              {task.projectTitle && <DetailRow label="Title" value={task.projectTitle} />}
              <DetailRow label={deadlineLabel} value={deadline} highlight />
              <DetailRow label="Total / WWC" value={`${task.total || "—"} / ${task.wwc || "—"}`} />
              {isReviewer && task.revType && <DetailRow label="Review Type" value={task.revType} />}
            </div>

            {/* CAT Match Breakdown */}
            {nonZeroCats.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Word Count Breakdown</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs bg-muted/30 rounded-lg p-3">
                  {nonZeroCats.map(c => (
                    <div key={c.label} className="flex justify-between py-0.5">
                      <span className="text-muted-foreground">{c.label}</span>
                      <span className="font-medium text-foreground tabular-nums">{c.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* HO Note */}
            {task.hoNote && (
              <div className="mb-4">
                <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">HO Note</p>
                <p className="text-sm text-foreground bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">{task.hoNote}</p>
              </div>
            )}

            {/* Instructions */}
            {task.instructions && (
              <div className="mb-4">
                <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Instructions</p>
                <p className="text-sm text-foreground bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 whitespace-pre-wrap">{task.instructions}</p>
              </div>
            )}

            {/* Symfonie link */}
            {(task.symfonieLink || task.symfonieId) && (
              <div className="mb-4">
                <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Symfonie</p>
                <div className="text-sm bg-muted/30 rounded-lg p-3">
                  {task.symfonieLink && (
                    <a href={task.symfonieLink.startsWith("http") ? task.symfonieLink : `https://${task.symfonieLink}`} 
                       target="_blank" rel="noopener noreferrer"
                       className="text-primary underline break-all">
                      {task.symfonieLink}
                    </a>
                  )}
                  {task.symfonieId && !task.symfonieLink && (
                    <span className="text-foreground">{task.symfonieId}</span>
                  )}
                </div>
              </div>
            )}

            {/* Action buttons */}
            {isPending && !actionResult?.success && (
              <div className="space-y-2 mt-4">
                <Button
                  className="w-full"
                  size="lg"
                  onClick={() => handleAction("accept")}
                  disabled={!!actionLoading}
                  data-testid="button-accept"
                >
                  {actionLoading === "accept" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                  Accept Task
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  size="lg"
                  onClick={() => handleAction("reject")}
                  disabled={!!actionLoading}
                  data-testid="button-reject"
                >
                  {actionLoading === "reject" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <XCircle className="w-4 h-4 mr-2" />}
                  Decline
                </Button>
              </div>
            )}

            {isAccepted && !isCompleted && (
              <div className="mt-4 space-y-3">
                {needsTimeInput && !showTimeInput && (
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={() => setShowTimeInput(true)}
                    disabled={!!actionLoading}
                    data-testid="button-complete"
                  >
                    <FileCheck className="w-4 h-4 mr-2" />
                    Mark as Completed
                  </Button>
                )}
                {needsTimeInput && showTimeInput && (
                  <div className="space-y-3 p-4 bg-muted/30 rounded-lg border border-border">
                    <p className="text-sm font-medium text-foreground">How long did the review take?</p>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                      <Input
                        type="number"
                        placeholder="Minutes spent..."
                        value={timeSpent}
                        onChange={(e) => setTimeSpent(e.target.value)}
                        className="h-9 text-sm"
                        autoFocus
                        data-testid="input-time-spent"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        className="flex-1"
                        size="sm"
                        onClick={() => handleAction("complete")}
                        disabled={!!actionLoading || !timeSpent}
                        data-testid="button-confirm-complete"
                      >
                        {actionLoading === "complete" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                        Confirm
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => { setShowTimeInput(false); setTimeSpent(""); }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
                {!needsTimeInput && (
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={() => handleAction("complete")}
                    disabled={!!actionLoading}
                    data-testid="button-complete"
                  >
                    {actionLoading === "complete" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileCheck className="w-4 h-4 mr-2" />}
                    Mark as Completed
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-4">
          ElTurco Projects — projects@eltur.co
        </p>
      </div>
    </div>
  );
}

function DetailRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-border last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${highlight ? "text-red-600" : "text-foreground"}`}>{value}</span>
    </div>
  );
}
