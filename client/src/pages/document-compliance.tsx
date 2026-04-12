import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Shield, Plus, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip } from "recharts";

const PIE_COLORS = ["#10b981", "#f59e0b", "#ef4444"];

export default function DocumentCompliancePage() {
  const { t } = useTranslation();
  const [showAddDoc, setShowAddDoc] = useState(false);
  const [newDoc, setNewDoc] = useState({ title: "", docType: "nda", description: "", requiresSignature: true, requiredForApproval: false });

  const { data, isLoading } = useQuery({
    queryKey: ["/api/compliance"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/compliance"); return r.json(); },
  });

  const createDoc = useMutation({
    mutationFn: async (doc: any) => { await apiRequest("POST", "/api/compliance/documents", doc); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/compliance"] }); setShowAddDoc(false); setNewDoc({ title: "", docType: "nda", description: "", requiresSignature: true, requiredForApproval: false }); },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
    );
  }

  const docs = data?.documents || [];
  const overallCompliance = data?.overallCompliance || 0;
  const totalVendors = data?.totalVendors || 0;
  const signedTotal = data?.signatures?.filter((s: any) => s.status === "signed").length || 0;
  const pendingTotal = (data?.signatures?.length || 0) - signedTotal;

  const pieData = [
    { name: "Signed", value: signedTotal },
    { name: "Pending", value: pendingTotal },
  ];

  const complianceColor = overallCompliance >= 80 ? "text-emerald-400" : overallCompliance >= 50 ? "text-amber-400" : "text-red-400";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Shield className="w-5 h-5 text-blue-400" /> {t("compliance.title")}
        </h1>
        <Button size="sm" onClick={() => setShowAddDoc(true)} className="bg-blue-600 hover:bg-blue-700 text-xs">
          <Plus className="w-3.5 h-3.5 mr-1" /> {t("compliance.addDocument")}
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 border-l-4 border-l-blue-500">
          <p className="text-xs text-white/50 uppercase tracking-wider">{t("compliance.overallCompliance")}</p>
          <p className={`text-2xl font-bold mt-1 ${complianceColor}`}>{overallCompliance}%</p>
        </div>
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 border-l-4 border-l-purple-500">
          <p className="text-xs text-white/50 uppercase tracking-wider">{t("compliance.documentsTracked")}</p>
          <p className="text-2xl font-bold text-white mt-1">{docs.length}</p>
        </div>
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 border-l-4 border-l-emerald-500">
          <p className="text-xs text-white/50 uppercase tracking-wider">{t("compliance.vendorsTracked")}</p>
          <p className="text-2xl font-bold text-white mt-1">{totalVendors}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie Chart */}
        <Card className="bg-white/[0.03] border-white/[0.06]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-white/70">Signing Progress</CardTitle>
          </CardHeader>
          <CardContent>
            {signedTotal + pendingTotal > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={5} dataKey="value">
                    {pieData.map((_, index) => <Cell key={index} fill={PIE_COLORS[index]} />)}
                  </Pie>
                  <RechartsTooltip contentStyle={{ background: "#1a1d27", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-white/30 text-sm">No signature data</div>
            )}
            <div className="flex justify-center gap-4 mt-2">
              <span className="flex items-center gap-1 text-xs text-white/50"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Signed ({signedTotal})</span>
              <span className="flex items-center gap-1 text-xs text-white/50"><span className="w-2 h-2 rounded-full bg-amber-500" /> Pending ({pendingTotal})</span>
            </div>
          </CardContent>
        </Card>

        {/* Per-document compliance bar */}
        <Card className="bg-white/[0.03] border-white/[0.06]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-white/70">Compliance by Document</CardTitle>
          </CardHeader>
          <CardContent>
            {docs.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={docs.map((d: any) => ({ name: d.title?.substring(0, 15) || "Doc", compliance: d.compliancePercent }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} domain={[0, 100]} />
                  <RechartsTooltip contentStyle={{ background: "#1a1d27", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="compliance" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Compliance %" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-white/30 text-sm">No documents created yet</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Documents Table */}
      <Card className="bg-white/[0.03] border-white/[0.06]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-white/70">Documents</CardTitle>
        </CardHeader>
        <CardContent>
          {docs.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-white/40 border-b border-white/[0.06] text-xs">
                  <th className="text-left p-2">Title</th>
                  <th className="text-left p-2">Type</th>
                  <th className="text-center p-2">Required</th>
                  <th className="text-center p-2">Signed</th>
                  <th className="text-center p-2">Total</th>
                  <th className="text-center p-2">Compliance</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((doc: any) => (
                  <tr key={doc.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                    <td className="p-2 text-white font-medium">{doc.title}</td>
                    <td className="p-2 text-white/50">{doc.docType}</td>
                    <td className="p-2 text-center">{doc.requiredForApproval ? <CheckCircle2 className="w-4 h-4 text-emerald-400 inline" /> : <Minus className="w-4 h-4 text-white/20 inline" />}</td>
                    <td className="p-2 text-center text-white/70">{doc.signedCount}</td>
                    <td className="p-2 text-center text-white/50">{doc.totalVendors}</td>
                    <td className="p-2 text-center">
                      <Badge variant="outline" className={`text-xs ${doc.compliancePercent >= 80 ? "text-emerald-400 border-emerald-500/30" : doc.compliancePercent >= 50 ? "text-amber-400 border-amber-500/30" : "text-red-400 border-red-500/30"}`}>
                        {doc.compliancePercent}%
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="py-8 text-center text-white/30 text-sm flex flex-col items-center gap-2">
              <FileText className="w-8 h-8 text-white/10" />
              <p>No documents created yet. Add a document to start tracking compliance.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Document Dialog */}
      <Dialog open={showAddDoc} onOpenChange={setShowAddDoc}>
        <DialogContent className="bg-[#1a1d27] border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle>{t("compliance.addDocument")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-white/50 mb-1 block">Title</label>
              <Input value={newDoc.title} onChange={e => setNewDoc({ ...newDoc, title: e.target.value })} className="bg-white/5 border-white/10 text-white text-sm" placeholder="e.g. NDA Agreement" />
            </div>
            <div>
              <label className="text-xs text-white/50 mb-1 block">Type</label>
              <Select value={newDoc.docType} onValueChange={v => setNewDoc({ ...newDoc, docType: v })}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nda">NDA</SelectItem>
                  <SelectItem value="contract">Contract</SelectItem>
                  <SelectItem value="policy">Policy</SelectItem>
                  <SelectItem value="certificate">Certificate</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-white/50 mb-1 block">Description</label>
              <Input value={newDoc.description} onChange={e => setNewDoc({ ...newDoc, description: e.target.value })} className="bg-white/5 border-white/10 text-white text-sm" placeholder="Optional description" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowAddDoc(false)} className="border-white/10 text-white/60">{t("common.cancel")}</Button>
            <Button size="sm" onClick={() => createDoc.mutate(newDoc)} disabled={!newDoc.title || createDoc.isPending} className="bg-blue-600 hover:bg-blue-700">{t("common.create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Minus(props: any) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}><line x1="5" y1="12" x2="19" y2="12" /></svg>;
}
