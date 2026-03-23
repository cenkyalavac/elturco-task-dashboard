import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, CheckCircle2, Clock, XCircle, Send, Users, LogOut } from "lucide-react";

interface Assignment {
  id: number;
  source: string;
  sheet: string;
  projectId: string;
  account: string;
  assignmentType: string;
  role: string;
  status: string;
  acceptedByName: string | null;
  acceptedBy: string | null;
  createdAt: string;
  completedAt: string | null;
  taskDetails: any;
  offers: any[];
}

const STATUS_MAP: Record<string, { label: string; variant: "secondary" | "default" | "destructive" | "outline"; icon: any }> = {
  pending: { label: "Bekliyor", variant: "secondary", icon: Clock },
  offered: { label: "Teklif Edildi", variant: "default", icon: Send },
  accepted: { label: "Kabul Edildi", variant: "default", icon: CheckCircle2 },
  completed: { label: "Tamamlandı", variant: "secondary", icon: CheckCircle2 },
  expired: { label: "Süresi Doldu", variant: "destructive", icon: XCircle },
  cancelled: { label: "İptal", variant: "destructive", icon: XCircle },
};

const TYPE_MAP: Record<string, string> = {
  direct: "Direkt",
  sequence: "Sıralı",
  broadcast: "Toplu",
};

export default function AssignmentsPage() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();

  const { data: assignments, isLoading } = useQuery<Assignment[]>({
    queryKey: ["/api/assignments"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/assignments");
      return res.json();
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card sticky top-0 z-30">
        <div className="max-w-[1200px] mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/")} data-testid="button-back-dashboard">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <span className="font-semibold text-sm text-foreground">Atama Geçmişi</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:inline">{user?.email}</span>
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-4 py-6">
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
          </div>
        ) : !assignments || assignments.length === 0 ? (
          <div className="text-center py-16">
            <Send className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">Henüz atama yapılmamış</p>
          </div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-assignments">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="text-left font-medium text-muted-foreground px-3 py-2.5">Proje ID</th>
                    <th className="text-left font-medium text-muted-foreground px-3 py-2.5">Kaynak</th>
                    <th className="text-left font-medium text-muted-foreground px-3 py-2.5">Rol</th>
                    <th className="text-left font-medium text-muted-foreground px-3 py-2.5">Tip</th>
                    <th className="text-left font-medium text-muted-foreground px-3 py-2.5">Durum</th>
                    <th className="text-left font-medium text-muted-foreground px-3 py-2.5">Kabul Eden</th>
                    <th className="text-left font-medium text-muted-foreground px-3 py-2.5">Teklifler</th>
                    <th className="text-left font-medium text-muted-foreground px-3 py-2.5">Tarih</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map(a => {
                    const st = STATUS_MAP[a.status] || STATUS_MAP.pending;
                    const Icon = st.icon;
                    return (
                      <tr key={a.id} className="border-b border-border last:border-0 hover:bg-muted/30" data-testid={`row-assignment-${a.id}`}>
                        <td className="px-3 py-2.5 font-medium text-foreground">{a.projectId}</td>
                        <td className="px-3 py-2.5">
                          <Badge variant="secondary" className="text-xs font-normal">{a.source} / {a.sheet}</Badge>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {a.role === "translator" ? "Çevirmen" : "Editör"}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">{TYPE_MAP[a.assignmentType] || a.assignmentType}</td>
                        <td className="px-3 py-2.5">
                          <Badge variant={st.variant} className="text-xs gap-1">
                            <Icon className="w-3 h-3" />
                            {st.label}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 text-foreground">{a.acceptedByName || "—"}</td>
                        <td className="px-3 py-2.5">
                          <OfferSummary offers={a.offers} />
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">
                          {new Date(a.createdAt).toLocaleDateString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function OfferSummary({ offers }: { offers: any[] }) {
  if (!offers || offers.length === 0) return <span className="text-muted-foreground">—</span>;
  const accepted = offers.filter(o => o.status === "accepted").length;
  const pending = offers.filter(o => o.status === "pending").length;
  const rejected = offers.filter(o => o.status === "rejected").length;

  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="text-muted-foreground">{offers.length} teklif</span>
      {accepted > 0 && <Badge variant="secondary" className="text-[10px] px-1 py-0 bg-green-500/10 text-green-600">{accepted} kabul</Badge>}
      {pending > 0 && <Badge variant="secondary" className="text-[10px] px-1 py-0">{pending} bekliyor</Badge>}
      {rejected > 0 && <Badge variant="secondary" className="text-[10px] px-1 py-0 bg-red-500/10 text-red-600">{rejected} ret</Badge>}
    </div>
  );
}
