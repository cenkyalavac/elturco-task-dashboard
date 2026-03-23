import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, AlertTriangle, FileCheck } from "lucide-react";

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
      const res = await fetch(`${API_BASE}/api/offers/${token}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientBaseUrl: window.location.href.split("#")[0].replace(/\/$/, ""),
          apiBaseUrl: (() => {
            const ab = "__PORT_5000__";
            if (ab.startsWith("__")) return window.location.origin;
            const m = window.location.href.split("#")[0].match(/^(https?:\/\/[^/]+\/sites\/proxy\/[^/]+\/)/);
            return m ? m[1] + ab : window.location.origin + "/" + ab;
          })(),
        }),
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
  const role = assignment.role === "translator" ? "Translation" : "Review";
  const isPending = offer.status === "pending";
  const isAccepted = offer.status === "accepted";
  const isCompleted = assignment.status === "completed";

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
            <div className="space-y-2 text-sm mb-6">
              <DetailRow label="Task Type" value={role} />
              <DetailRow label="Account" value={task.account || assignment.account} />
              <DetailRow label="Source" value={`${assignment.source} / ${assignment.sheet}`} />
              <DetailRow label="Project ID" value={assignment.projectId} />
              <DetailRow label="Deadline" value={task.deadline || "—"} />
              <DetailRow label="Total / WWC" value={`${task.total || "—"} / ${task.wwc || "—"}`} />
            </div>

            {/* Action buttons */}
            {isPending && !actionResult?.success && (
              <div className="space-y-2">
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
              <Button
                className="w-full mt-4"
                size="lg"
                onClick={() => handleAction("complete")}
                disabled={!!actionLoading}
                data-testid="button-complete"
              >
                {actionLoading === "complete" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileCheck className="w-4 h-4 mr-2" />}
                Mark as Completed
              </Button>
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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-border last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
