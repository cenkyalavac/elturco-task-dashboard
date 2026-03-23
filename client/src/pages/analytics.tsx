import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, Send, Users, Clock, CheckCircle2, TrendingUp } from "lucide-react";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

export default function AnalyticsPage() {
  const { data, isLoading, error } = useQuery<any>({
    queryKey: ["/api/analytics"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/analytics");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-lg font-semibold">Analytics</h1>
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-64 rounded-lg" />)}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <h1 className="text-lg font-semibold mb-4">Analytics</h1>
        <p className="text-muted-foreground">No data available yet. Start assigning tasks to see analytics.</p>
      </div>
    );
  }

  // Transform data for charts
  const statusData = Object.entries(data.byStatus || {}).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value: value as number,
  }));

  const typeData = Object.entries(data.byType || {}).map(([name, value]) => ({
    name: name === "direct" ? "Direct" : name === "sequence" ? "Sequential" : "Broadcast",
    value: value as number,
  }));

  const roleData = [
    { name: "Translator", value: data.byRole?.translator || 0 },
    { name: "Reviewer", value: data.byRole?.reviewer || 0 },
  ];

  const topFreelancers = (data.topFreelancers || []).map(([code, info]: [string, any]) => ({
    name: `${info.name} (${code})`,
    accepted: info.accepted,
    completed: info.completed,
  }));

  const dayData = (data.byDay || []).map(([date, counts]: [string, any]) => ({
    date: date.slice(5), // "03-23"
    created: counts.created,
    accepted: counts.accepted,
    completed: counts.completed,
  }));

  const totalAccepted = Object.values(data.byStatus || {}).reduce((s: number, v: any) => {
    return s;
  }, 0);
  const acceptedCount = (data.byStatus?.accepted || 0) + (data.byStatus?.completed || 0);
  const acceptanceRate = data.totalOffers > 0 ? Math.round((acceptedCount / data.totalOffers) * 100) : 0;

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <h1 className="text-lg font-semibold">Analytics</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard icon={<Send className="w-4 h-4" />} label="Total Assignments" value={data.totalAssignments} color="text-blue-500" />
        <KpiCard icon={<Users className="w-4 h-4" />} label="Total Offers" value={data.totalOffers} color="text-purple-500" />
        <KpiCard icon={<Clock className="w-4 h-4" />} label="Avg Response Time" value={data.avgResponseTimeMinutes ? `${data.avgResponseTimeMinutes}m` : "—"} color="text-orange-500" />
        <KpiCard icon={<TrendingUp className="w-4 h-4" />} label="Acceptance Rate" value={`${acceptanceRate}%`} color="text-green-500" />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Status Distribution */}
        <Card className="border border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Assignments by Status</CardTitle>
          </CardHeader>
          <CardContent>
            {statusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={statusData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : <p className="text-center text-muted-foreground py-12 text-sm">No data</p>}
          </CardContent>
        </Card>

        {/* Assignment Types */}
        <Card className="border border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Assignment Types</CardTitle>
          </CardHeader>
          <CardContent>
            {typeData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={typeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-center text-muted-foreground py-12 text-sm">No data</p>}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Role Split */}
        <Card className="border border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Translator vs Reviewer</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={roleData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  <Cell fill="#3b82f6" />
                  <Cell fill="#10b981" />
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Activity Over Time */}
        <Card className="border border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Activity Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            {dayData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={dayData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="created" fill="#3b82f6" name="Created" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="accepted" fill="#10b981" name="Accepted" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="completed" fill="#f59e0b" name="Completed" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-center text-muted-foreground py-12 text-sm">No activity data</p>}
          </CardContent>
        </Card>
      </div>

      {/* Top Freelancers */}
      {topFreelancers.length > 0 && (
        <Card className="border border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Top Freelancers</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(200, topFreelancers.length * 40)}>
              <BarChart data={topFreelancers} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={180} />
                <Tooltip />
                <Legend />
                <Bar dataKey="accepted" fill="#3b82f6" name="Accepted" radius={[0, 2, 2, 0]} />
                <Bar dataKey="completed" fill="#10b981" name="Completed" radius={[0, 2, 2, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function KpiCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  return (
    <Card className="border border-border">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className={color}>{icon}</span>
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}
