import { TrendingUp } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Legend,
} from "recharts";

interface RevenueChartProps {
  revenueCostData: { month: string; Revenue: number; Cost: number }[];
}

export default function RevenueChart({ revenueCostData }: RevenueChartProps) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
      <h3 className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-3">Revenue vs Cost</h3>
      {revenueCostData.length > 0 ? (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={revenueCostData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="month" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }} />
            <YAxis tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }} tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
            <RechartsTooltip contentStyle={{ backgroundColor: "#1a1d27", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", fontSize: "11px" }} />
            <Legend wrapperStyle={{ fontSize: "10px" }} />
            <Bar dataKey="Revenue" fill="#14b8a6" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Cost" fill="#f43f5e" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[200px] flex flex-col items-center justify-center text-white/30">
          <TrendingUp className="w-8 h-8 mb-2 opacity-20" />
          <p className="text-xs font-medium">No revenue data yet</p>
          <p className="text-[10px] text-white/20 mt-1">Create invoices and projects to see financial data here</p>
        </div>
      )}
    </div>
  );
}
