import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ExternalLink } from "lucide-react";

interface PortalTasksWidgetProps {
  pendingPortalTasks: any[];
  onAccept: (id: number) => void;
  onReject: (id: number) => void;
  acceptPending: boolean;
  rejectPending: boolean;
}

export default function PortalTasksWidget({
  pendingPortalTasks,
  onAccept,
  onReject,
  acceptPending,
  rejectPending,
}: PortalTasksWidgetProps) {
  return (
    <div className="border-b border-white/[0.06] bg-card/50 px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-white/70 uppercase tracking-wider flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          Incoming Portal Tasks {pendingPortalTasks.length > 0 && `(${pendingPortalTasks.length})`}
        </h3>
      </div>
      {pendingPortalTasks.length === 0 ? (
        <div className="flex items-center justify-center py-4 text-white/30">
          <p className="text-xs">No incoming portal tasks</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {pendingPortalTasks.slice(0, 5).map((task: any) => {
            const td = task.taskData || {};
            const deadline = td.deadline ? new Date(td.deadline).toLocaleDateString("en-US", { day: "numeric", month: "short" }) : null;
            return (
              <div key={task.id} className="flex items-center justify-between bg-amber-500/[0.04] border border-amber-500/10 rounded-lg px-3 py-2">
                <div className="flex items-center gap-3 min-w-0">
                  <Badge className="text-[9px] bg-amber-500/10 text-amber-400 border-amber-500/20 shrink-0">{task.portalSource}</Badge>
                  <span className="text-xs text-white/80 truncate">{td.projectName || td.name || task.externalId}</span>
                  <span className="text-[10px] text-white/30 shrink-0">{td.sourceLanguage} &gt; {Array.isArray(td.targetLanguages) ? td.targetLanguages.join(", ") : td.targetLanguage || "?"}</span>
                  {deadline && <span className="text-[10px] text-white/20 shrink-0">{deadline}</span>}
                  {td.wordCount && <span className="text-[10px] text-white/20">{Number(td.wordCount).toLocaleString()} words</span>}
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  <Button size="sm" className="h-6 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white px-2" onClick={() => onAccept(task.id)} disabled={acceptPending}>Accept</Button>
                  <Button size="sm" variant="outline" className="h-6 text-[10px] text-red-400 border-red-500/20 hover:bg-red-500/10 px-2" onClick={() => onReject(task.id)} disabled={rejectPending}>Reject</Button>
                  {task.externalUrl && <a href={task.externalUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-3 h-3 text-white/20 hover:text-blue-400" /></a>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
