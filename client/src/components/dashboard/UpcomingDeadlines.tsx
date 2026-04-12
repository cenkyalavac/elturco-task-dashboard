import { Clock } from "lucide-react";

interface UpcomingDeadlinesProps {
  deadlinesData: any[] | undefined;
}

export default function UpcomingDeadlines({ deadlinesData }: UpcomingDeadlinesProps) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 max-h-[140px] overflow-y-auto">
      <h3 className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <Clock className="w-3.5 h-3.5 text-amber-400" /> Upcoming Deadlines
      </h3>
      {!deadlinesData || deadlinesData.length === 0 ? (
        <p className="text-[10px] text-white/30 py-2">No upcoming deadlines</p>
      ) : (
        <div className="space-y-1.5">
          {(deadlinesData as any[]).slice(0, 5).map((d: any, idx: number) => {
            const daysLeft = d.daysRemaining ?? Math.max(0, Math.ceil((new Date(d.deadline || d.dueDate).getTime() - Date.now()) / 86400000));
            const color = daysLeft < 3 ? "text-red-400" : daysLeft < 7 ? "text-amber-400" : "text-emerald-400";
            return (
              <div key={idx} className="flex items-center justify-between text-xs py-1 border-b border-white/[0.03] last:border-0">
                <span className="text-white/70 truncate max-w-[140px]">{d.projectName || d.name || "Project"}</span>
                <span className={`text-[10px] font-medium tabular-nums ${color}`}>{daysLeft}d left</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
