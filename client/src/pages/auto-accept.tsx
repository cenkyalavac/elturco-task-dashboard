import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus, Pencil, Trash2, Play, ListFilter, History,
  X as XIcon, FlaskConical, Zap,
} from "lucide-react";

interface RuleCondition {
  field: string;
  operator: string;
  value: any;
}

interface AutoAcceptRule {
  id: number;
  name: string;
  portalSource: string;
  conditions: RuleCondition[];
  action: string;
  priority: number;
  enabled: boolean;
  createdBy: string | null;
  lastModifiedBy: string | null;
  lastModifiedAt: string | null;
  createdAt: string;
  matchCount: number;
  lastMatchedAt: string | null;
}

interface FieldConfig {
  field: string;
  label: string;
  type: string;
  operators: string[];
}

const PORTAL_SOURCES = [
  { value: "symfonie", label: "Symfonie" },
  { value: "aps", label: "APS (Lionbridge)" },
  { value: "junction", label: "Junction" },
  { value: "xtrf", label: "XTRF" },
  { value: "plunet", label: "Plunet" },
];

const ACTIONS = [
  { value: "approve", label: "Approve" },
  { value: "ignore", label: "Ignore" },
  { value: "manual_review", label: "Manual Review" },
];

const OPERATOR_LABELS: Record<string, string> = {
  equals: "Equals",
  not_equals: "Not Equals",
  contains: "Contains",
  not_contains: "Not Contains",
  in_set: "In Set",
  not_in_set: "Not In Set",
  gt: "Greater Than",
  gte: "Greater or Equal",
  lt: "Less Than",
  lte: "Less or Equal",
  more_than: "More Than",
  less_than: "Less Than",
};

function actionBadge(action: string) {
  switch (action) {
    case "approve": return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/25">Approve</Badge>;
    case "ignore": return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/25">Ignore</Badge>;
    case "manual_review": return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/25">Manual Review</Badge>;
    default: return <Badge variant="outline">{action}</Badge>;
  }
}

export default function AutoAcceptPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState("rules");
  const [showRuleDialog, setShowRuleDialog] = useState(false);
  const [editingRule, setEditingRule] = useState<AutoAcceptRule | null>(null);
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [testSource, setTestSource] = useState("aps");
  const [testJson, setTestJson] = useState('{\n  "project_name": "Apple Turkish MTPE",\n  "client": "Apple",\n  "source_language": "EN",\n  "target_language": "TR",\n  "weighted_quantity": 5000\n}');
  const [testResult, setTestResult] = useState<any>(null);

  const { data: rules = [], isLoading } = useQuery<AutoAcceptRule[]>({
    queryKey: ["/api/auto-accept-rules"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/auto-accept-rules"); return r.json(); },
  });

  const { data: fieldConfig = [] } = useQuery<FieldConfig[]>({
    queryKey: ["/api/auto-accept/field-config"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/auto-accept/field-config"); return r.json(); },
  });

  const { data: logData } = useQuery<{ logs: any[]; total: number }>({
    queryKey: ["/api/auto-accept-log"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/auto-accept-log?limit=50"); return r.json(); },
    enabled: tab === "log",
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/auto-accept-rules/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/auto-accept-rules"] }); toast({ title: "Rule deleted" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: async (id: number) => { const r = await apiRequest("POST", `/api/auto-accept-rules/${id}/toggle`); return r.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/auto-accept-rules"] }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const taskData = JSON.parse(testJson);
      const r = await apiRequest("POST", "/api/auto-accept/evaluate", { portalSource: testSource, taskData });
      return r.json();
    },
    onSuccess: (data) => setTestResult(data),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-400" /> Auto-Accept Rules
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Manage rules that automatically accept, ignore, or flag incoming portal tasks</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => { setTestSource("aps"); setTestResult(null); setShowTestDialog(true); }}>
              <FlaskConical className="w-4 h-4 mr-1" /> Test Rules
            </Button>
            <Button size="sm" onClick={() => { setEditingRule(null); setShowRuleDialog(true); }}>
              <Plus className="w-4 h-4 mr-1" /> New Rule
            </Button>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="rules" className="gap-1"><ListFilter className="w-3.5 h-3.5" /> Rules ({rules.length})</TabsTrigger>
            <TabsTrigger value="log" className="gap-1"><History className="w-3.5 h-3.5" /> Match Log</TabsTrigger>
          </TabsList>

          <TabsContent value="rules" className="mt-4">
            <Card className="border border-border">
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">Loading...</div>
                ) : rules.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">No rules yet. Create your first auto-accept rule.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">Priority</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Conditions</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead className="text-right">Matches</TableHead>
                        <TableHead>Enabled</TableHead>
                        <TableHead className="w-20">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rules.map((rule) => (
                        <TableRow key={rule.id}>
                          <TableCell className="font-mono text-xs">{rule.priority}</TableCell>
                          <TableCell className="font-medium">{rule.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{rule.portalSource}</Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-muted-foreground">{(rule.conditions || []).length} condition(s)</span>
                          </TableCell>
                          <TableCell>{actionBadge(rule.action)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {rule.matchCount || 0}
                            {rule.lastMatchedAt && (
                              <span className="block text-[10px] text-muted-foreground">{new Date(rule.lastMatchedAt).toLocaleDateString()}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Switch checked={rule.enabled} onCheckedChange={() => toggleMutation.mutate(rule.id)} />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingRule(rule); setShowRuleDialog(true); }}>
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-300" onClick={() => { if (confirm("Delete this rule?")) deleteMutation.mutate(rule.id); }}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="log" className="mt-4">
            <Card className="border border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Match History</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {!logData?.logs?.length ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">No matches yet</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Task ID</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Rule</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logData.logs.map((log: any) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-xs">{log.matchedAt ? new Date(log.matchedAt).toLocaleString() : "-"}</TableCell>
                          <TableCell className="font-mono text-xs">{log.taskId || "-"}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{log.portalSource}</Badge></TableCell>
                          <TableCell>{actionBadge(log.actionTaken)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {log.ruleId ? `Rule #${log.ruleId}` : "No match (default)"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Rule Create/Edit Dialog */}
        {showRuleDialog && (
          <RuleDialog
            rule={editingRule}
            fieldConfig={fieldConfig}
            onClose={() => { setShowRuleDialog(false); setEditingRule(null); }}
          />
        )}

        {/* Test Dialog */}
        <Dialog open={showTestDialog} onOpenChange={setShowTestDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Test Rules (Dry Run)</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Portal Source</label>
                <Select value={testSource} onValueChange={setTestSource}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PORTAL_SOURCES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Task Data (JSON)</label>
                <Textarea value={testJson} onChange={(e) => setTestJson(e.target.value)} rows={8} className="font-mono text-xs" />
              </div>
              {testResult && (
                <Card className={`border ${testResult.matched ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
                  <CardContent className="p-3 text-sm">
                    {testResult.matched ? (
                      <>
                        <p className="font-medium text-emerald-400">Matched: {testResult.ruleName}</p>
                        <p className="text-xs text-muted-foreground mt-1">Action: {testResult.action}</p>
                      </>
                    ) : (
                      <p className="text-amber-400">No rule matched — default action: manual_review</p>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowTestDialog(false)}>Close</Button>
              <Button onClick={() => testMutation.mutate()} disabled={testMutation.isPending}>
                <Play className="w-4 h-4 mr-1" /> {testMutation.isPending ? "Testing..." : "Run Test"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

// ============================================
// RULE CREATE/EDIT DIALOG
// ============================================

function RuleDialog({ rule, fieldConfig, onClose }: { rule: AutoAcceptRule | null; fieldConfig: FieldConfig[]; onClose: () => void }) {
  const { toast } = useToast();
  const isEdit = !!rule;
  const [name, setName] = useState(rule?.name || "");
  const [portalSource, setPortalSource] = useState(rule?.portalSource || "aps");
  const [action, setAction] = useState(rule?.action || "approve");
  const [priority, setPriority] = useState(rule?.priority ?? 100);
  const [enabled, setEnabled] = useState(rule?.enabled !== false);
  const [conditions, setConditions] = useState<RuleCondition[]>(rule?.conditions || []);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = { name, portalSource, conditions, action, priority, enabled };
      if (isEdit) {
        const r = await apiRequest("PATCH", `/api/auto-accept-rules/${rule!.id}`, body);
        return r.json();
      }
      const r = await apiRequest("POST", "/api/auto-accept-rules", body);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auto-accept-rules"] });
      toast({ title: isEdit ? "Rule updated" : "Rule created" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addCondition = () => {
    const firstField = fieldConfig[0];
    setConditions([...conditions, { field: firstField?.field || "project_name", operator: firstField?.operators[0] || "contains", value: "" }]);
  };

  const removeCondition = (idx: number) => {
    setConditions(conditions.filter((_, i) => i !== idx));
  };

  const updateCondition = (idx: number, updates: Partial<RuleCondition>) => {
    setConditions(conditions.map((c, i) => i === idx ? { ...c, ...updates } : c));
  };

  const getOperatorsForField = (fieldName: string) => {
    const fc = fieldConfig.find(f => f.field === fieldName);
    return fc?.operators || ["contains", "not_contains"];
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Rule" : "Create Rule"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Rule Name</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Apple Turkish MTPE" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Portal Source</label>
              <Select value={portalSource} onValueChange={setPortalSource}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PORTAL_SOURCES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Action</label>
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACTIONS.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Priority (lower = first)</label>
              <Input type="number" value={priority} onChange={e => setPriority(parseInt(e.target.value) || 100)} min={1} max={9999} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            <span className="text-sm text-muted-foreground">Enabled</span>
          </div>

          {/* Conditions Builder */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-muted-foreground">Conditions (all must match)</label>
              <Button variant="outline" size="sm" onClick={addCondition}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Condition
              </Button>
            </div>
            {conditions.length === 0 && (
              <p className="text-xs text-muted-foreground/60 py-3 text-center border border-dashed border-border rounded-md">
                No conditions added. Rule will never match without at least one condition.
              </p>
            )}
            <div className="space-y-2">
              {conditions.map((cond, idx) => {
                const fieldOps = getOperatorsForField(cond.field);
                const fc = fieldConfig.find(f => f.field === cond.field);
                return (
                  <div key={idx} className="flex items-center gap-2 p-2 rounded-md bg-muted/30 border border-border">
                    <Select value={cond.field} onValueChange={v => {
                      const ops = getOperatorsForField(v);
                      updateCondition(idx, { field: v, operator: ops[0] || "contains", value: "" });
                    }}>
                      <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {fieldConfig.map(f => <SelectItem key={f.field} value={f.field}>{f.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={cond.operator} onValueChange={v => updateCondition(idx, { operator: v })}>
                      <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {fieldOps.map(op => <SelectItem key={op} value={op}>{OPERATOR_LABELS[op] || op}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {fc?.type === "string_set" && (cond.operator === "in_set" || cond.operator === "not_in_set") ? (
                      <Input
                        className="flex-1 h-8 text-xs"
                        value={Array.isArray(cond.value) ? cond.value.join(", ") : cond.value}
                        onChange={e => updateCondition(idx, { value: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
                        placeholder="EN, TR, DE (comma separated)"
                      />
                    ) : fc?.type === "number" ? (
                      <Input
                        type="number"
                        className="flex-1 h-8 text-xs"
                        value={cond.value}
                        onChange={e => updateCondition(idx, { value: parseFloat(e.target.value) || 0 })}
                        placeholder="0"
                      />
                    ) : (
                      <Input
                        className="flex-1 h-8 text-xs"
                        value={cond.value}
                        onChange={e => updateCondition(idx, { value: e.target.value })}
                        placeholder="Value..."
                      />
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-red-400" onClick={() => removeCondition(idx)}>
                      <XIcon className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !name || !portalSource}>
            {saveMutation.isPending ? "Saving..." : isEdit ? "Update Rule" : "Create Rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
