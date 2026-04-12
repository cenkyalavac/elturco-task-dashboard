import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, ChevronLeft, ChevronRight, Users } from "lucide-react";

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const STATUS_COLORS: Record<string, string> = {
  available: "bg-emerald-500/30 border-emerald-500/50",
  unavailable: "bg-red-500/30 border-red-500/50",
  limited: "bg-amber-500/30 border-amber-500/50",
};

export default function TeamAvailabilityPage() {
  const { t } = useTranslation();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const { data, isLoading } = useQuery({
    queryKey: ["/api/availability/team", month + 1, year],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/availability/team?month=${month + 1}&year=${year}`);
      return r.json();
    },
  });

  const records = data || [];
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);

  // Group by date
  const dateMap = useMemo(() => {
    const map = new Map<string, Array<{ vendorName: string; status: string; hoursAvailable: number | null }>>();
    for (const r of records) {
      const dateStr = r.date;
      if (!map.has(dateStr)) map.set(dateStr, []);
      map.get(dateStr)!.push({ vendorName: r.vendorName, status: r.status, hoursAvailable: r.hoursAvailable });
    }
    return map;
  }, [records]);

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(year - 1); }
    else setMonth(month - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(year + 1); }
    else setMonth(month + 1);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[500px]" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-400" /> {t("availability.teamAvailability")}
        </h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 text-xs text-white/50">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/30 border border-emerald-500/50" /> {t("availability.available")}</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500/30 border border-amber-500/50" /> {t("availability.limited")}</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-500/30 border border-red-500/50" /> {t("availability.unavailable")}</span>
          </div>
        </div>
      </div>

      <Card className="bg-white/[0.03] border-white/[0.06]">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={prevMonth} className="text-white/50 hover:text-white">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <CardTitle className="text-sm text-white/70">{MONTHS[month]} {year}</CardTitle>
            <Button variant="ghost" size="sm" onClick={nextMonth} className="text-white/50 hover:text-white">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DAYS.map(d => (
              <div key={d} className="text-center text-[10px] text-white/30 font-medium py-1">{d}</div>
            ))}
          </div>
          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {/* Empty cells before first day */}
            {[...Array(firstDay)].map((_, i) => (
              <div key={`empty-${i}`} className="h-20" />
            ))}
            {/* Day cells */}
            {[...Array(daysInMonth)].map((_, i) => {
              const day = i + 1;
              const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const dayRecords = dateMap.get(dateStr) || [];
              const availCount = dayRecords.filter(r => r.status === "available").length;
              const limitedCount = dayRecords.filter(r => r.status === "limited").length;
              const unavailCount = dayRecords.filter(r => r.status === "unavailable").length;
              const isToday = day === now.getDate() && month === now.getMonth() && year === now.getFullYear();

              return (
                <div key={day} className={`h-20 rounded-lg border p-1 ${isToday ? "border-blue-500/50 bg-blue-500/[0.05]" : "border-white/[0.04] bg-white/[0.02]"} hover:bg-white/[0.04] transition-colors`}>
                  <p className={`text-xs font-medium ${isToday ? "text-blue-400" : "text-white/50"}`}>{day}</p>
                  <div className="mt-1 space-y-0.5">
                    {availCount > 0 && (
                      <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span className="text-[9px] text-emerald-400">{availCount}</span>
                      </div>
                    )}
                    {limitedCount > 0 && (
                      <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        <span className="text-[9px] text-amber-400">{limitedCount}</span>
                      </div>
                    )}
                    {unavailCount > 0 && (
                      <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                        <span className="text-[9px] text-red-400">{unavailCount}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 border-l-4 border-l-emerald-500">
          <p className="text-xs text-white/50 uppercase tracking-wider">Available Days</p>
          <p className="text-2xl font-bold text-emerald-400 mt-1">{records.filter((r: any) => r.status === "available").length}</p>
        </div>
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 border-l-4 border-l-amber-500">
          <p className="text-xs text-white/50 uppercase tracking-wider">Limited Days</p>
          <p className="text-2xl font-bold text-amber-400 mt-1">{records.filter((r: any) => r.status === "limited").length}</p>
        </div>
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 border-l-4 border-l-red-500">
          <p className="text-xs text-white/50 uppercase tracking-wider">Unavailable Days</p>
          <p className="text-2xl font-bold text-red-400 mt-1">{records.filter((r: any) => r.status === "unavailable").length}</p>
        </div>
      </div>
    </div>
  );
}
