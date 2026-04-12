import { Activity } from "lucide-react";

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

interface ActivityFeedProps {
  activityFeed: any[] | undefined;
}

export default function ActivityFeed({ activityFeed }: ActivityFeedProps) {
  return (
    <div className="lg:col-span-2 bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 max-h-[280px] overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-white/70 uppercase tracking-wider flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-blue-400" /> Recent Activity
        </h3>
      </div>
      {!activityFeed || activityFeed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-white/30">
          <Activity className="w-6 h-6 mb-2 opacity-40" />
          <p className="text-xs">No recent activity</p>
        </div>
      ) : (
        <div className="space-y-2">
          {(activityFeed as any[]).slice(0, 15).map((item: any, idx: number) => (
            <div key={item.id || idx} className="flex items-start gap-2 py-1.5 border-b border-white/[0.04] last:border-0">
              <div className="w-6 h-6 rounded-full bg-blue-500/15 flex items-center justify-center shrink-0 mt-0.5">
                <Activity className="w-3 h-3 text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white/80 truncate">{item.description || item.action || item.message || "Activity"}</p>
                <p className="text-[10px] text-white/30 mt-0.5">
                  {item.createdAt ? timeAgo(new Date(item.createdAt)) : ""}
                  {item.userName && ` by ${item.userName}`}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
