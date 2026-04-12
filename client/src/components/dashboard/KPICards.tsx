import { Skeleton } from "@/components/ui/skeleton";
import {
  Briefcase, ListTodo, FileText, AlertTriangle, TrendingUp, Users,
} from "lucide-react";

interface KPICardsProps {
  loading: boolean;
  dashboardKpis: any;
  kpiProjects: any;
  kpiFinancial: any;
  statsOngoing: number;
  statsPastDeadline: number;
}

export default function KPICards({
  loading,
  dashboardKpis,
  kpiProjects,
  kpiFinancial,
  statsOngoing,
  statsPastDeadline,
}: KPICardsProps) {
  return (
    <div className="border-b border-white/[0.06] bg-card/50 px-4 py-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {loading ? (
          <>
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-7 w-16" />
              </div>
            ))}
          </>
        ) : (
          <>
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 border-l-4 border-l-teal-500 relative overflow-hidden">
              <Briefcase className="absolute top-3 right-3 w-8 h-8 text-teal-500 opacity-20" />
              <p className="text-xs text-white/50 uppercase tracking-wider">Active Projects</p>
              <p className="text-2xl font-bold text-white mt-1 tabular-nums">{dashboardKpis?.activeProjects ?? kpiProjects?.total ?? 0}</p>
            </div>
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 border-l-4 border-l-blue-500 relative overflow-hidden">
              <ListTodo className="absolute top-3 right-3 w-8 h-8 text-blue-500 opacity-20" />
              <p className="text-xs text-white/50 uppercase tracking-wider">Open Tasks</p>
              <p className="text-2xl font-bold text-white mt-1 tabular-nums">{dashboardKpis?.openTasks ?? statsOngoing}</p>
            </div>
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 border-l-4 border-l-amber-500 relative overflow-hidden">
              <FileText className="absolute top-3 right-3 w-8 h-8 text-amber-500 opacity-20" />
              <p className="text-xs text-white/50 uppercase tracking-wider">Pending Invoices</p>
              <p className="text-2xl font-bold text-white mt-1 tabular-nums">{dashboardKpis?.pendingInvoices ?? 0}</p>
              {dashboardKpis?.pendingInvoicesAmount && (
                <p className="text-[10px] text-amber-400/60 mt-0.5">{`\u00a3${Number(dashboardKpis.pendingInvoicesAmount).toLocaleString("en-US", { minimumFractionDigits: 0 })}`}</p>
              )}
            </div>
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 border-l-4 border-l-red-500 relative overflow-hidden">
              <AlertTriangle className="absolute top-3 right-3 w-8 h-8 text-red-500 opacity-20" />
              <p className="text-xs text-white/50 uppercase tracking-wider">Overdue Items</p>
              <p className="text-2xl font-bold text-white mt-1 tabular-nums">{dashboardKpis?.overdueItems ?? statsPastDeadline}</p>
            </div>
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 border-l-4 border-l-emerald-500 relative overflow-hidden">
              <TrendingUp className="absolute top-3 right-3 w-8 h-8 text-emerald-500 opacity-20" />
              <p className="text-xs text-white/50 uppercase tracking-wider">Monthly Revenue</p>
              <p className="text-2xl font-bold text-white mt-1 tabular-nums">
                {`\u00a3${Number(dashboardKpis?.monthlyRevenue ?? kpiFinancial?.totalRevenue ?? 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
              </p>
            </div>
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 border-l-4 border-l-purple-500 relative overflow-hidden">
              <Users className="absolute top-3 right-3 w-8 h-8 text-purple-500 opacity-20" />
              <p className="text-xs text-white/50 uppercase tracking-wider">Vendor Availability</p>
              <p className="text-2xl font-bold text-white mt-1 tabular-nums">{dashboardKpis?.vendorAvailability ?? 0}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
