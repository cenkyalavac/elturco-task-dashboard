import { FolderKanban } from "lucide-react";
import {
  PieChart, Pie, Cell, Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";

const PIPELINE_COLORS: Record<string, string> = {
  active: "#14b8a6", completed: "#10b981", invoiced: "#3b82f6",
  on_hold: "#f59e0b", cancelled: "#f43f5e", draft: "#6b7280",
};

interface ProjectPipelineProps {
  pipelineData: any[];
}

export default function ProjectPipeline({ pipelineData }: ProjectPipelineProps) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
      <h3 className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-3">Project Pipeline</h3>
      {pipelineData.length > 0 ? (
        <div className="flex items-center gap-4">
          <ResponsiveContainer width="50%" height={200}>
            <PieChart>
              <Pie data={pipelineData} dataKey="count" nameKey="status" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2}>
                {pipelineData.map((entry: any, idx: number) => (
                  <Cell key={idx} fill={PIPELINE_COLORS[entry.status] || "#6b7280"} />
                ))}
              </Pie>
              <RechartsTooltip contentStyle={{ backgroundColor: "#1a1d27", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", fontSize: "11px" }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 flex-1">
            {pipelineData.map((entry: any, idx: number) => (
              <div key={idx} className="flex items-center gap-2 text-xs">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PIPELINE_COLORS[entry.status] || "#6b7280" }} />
                <span className="text-white/60 capitalize">{entry.status?.replace(/_/g, " ")}</span>
                <span className="ml-auto text-white/80 font-medium tabular-nums">{entry.count}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="h-[200px] flex flex-col items-center justify-center text-white/30">
          <FolderKanban className="w-8 h-8 mb-2 opacity-20" />
          <p className="text-xs font-medium">No pipeline data yet</p>
          <p className="text-[10px] text-white/20 mt-1">Create projects to see your pipeline breakdown here</p>
        </div>
      )}
    </div>
  );
}
