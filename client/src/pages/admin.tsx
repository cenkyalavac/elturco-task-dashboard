import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, Loader2, FileSpreadsheet, Users, Mail, Save, Info, Pencil, X, Check, ExternalLink, Eye, Code } from "lucide-react";

// ── Types ──

interface SheetConfig {
  id: number;
  source: string;
  sheet: string;
  languagePair: string;
  sheetDbId: string | null;
  googleSheetUrl: string | null;
  assignedPms: string | null;
}

interface PmUser {
  id: number;
  email: string;
  name: string;
  role: string;
}

interface EmailTemplate {
  id: number;
  key: string;
  subject: string;
  body: string;
}

const LANGUAGE_PAIRS = [
  "EN>TR", "EN>AR", "EN>RU", "EN>DE", "EN>FR", "EN>ES",
  "EN>PT", "EN>IT", "EN>NL", "EN>PL", "EN>JA", "EN>KO", "EN>ZH", "Multi",
];

// ── Component ──

export default function AdminPage() {
  return (
    <div className="h-full overflow-auto">
      <div className="max-w-4xl mx-auto p-6 space-y-8">
        <h1 className="text-lg font-semibold text-foreground" data-testid="text-admin-title">Admin Panel</h1>
        <SheetConfigsSection />
        <PmUsersSection />
        <EmailTemplatesSection />
      </div>
    </div>
  );
}

// ── Sheet Configurations ──

function SheetConfigsSection() {
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Add form state
  const [newSource, setNewSource] = useState("");
  const [newSheet, setNewSheet] = useState("");
  const [newLangPair, setNewLangPair] = useState("EN>TR");
  const [newSheetDbId, setNewSheetDbId] = useState("");
  const [newGoogleSheetUrl, setNewGoogleSheetUrl] = useState("");
  const [newAssignedPms, setNewAssignedPms] = useState<string[]>([]);

  // Edit form state
  const [editSource, setEditSource] = useState("");
  const [editSheet, setEditSheet] = useState("");
  const [editLangPair, setEditLangPair] = useState("");
  const [editSheetDbId, setEditSheetDbId] = useState("");
  const [editGoogleSheetUrl, setEditGoogleSheetUrl] = useState("");
  const [editAssignedPms, setEditAssignedPms] = useState<string[]>([]);

  const { data: configs, isLoading } = useQuery<SheetConfig[]>({
    queryKey: ["/api/sheet-configs"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/sheet-configs");
      return res.json();
    },
  });

  const { data: pmUsers } = useQuery<PmUser[]>({
    queryKey: ["/api/pm-users"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/pm-users");
      return res.json();
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: { source: string; sheet: string; languagePair: string; sheetDbId?: string; googleSheetUrl?: string; assignedPms?: string | null }) => {
      const res = await apiRequest("POST", "/api/sheet-configs", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sheet-configs"] });
      toast({ title: "Config saved" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/sheet-configs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sheet-configs"] });
      toast({ title: "Config deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  function startEdit(c: SheetConfig) {
    setEditingId(c.id);
    setEditSource(c.source);
    setEditSheet(c.sheet);
    setEditLangPair(c.languagePair);
    setEditSheetDbId(c.sheetDbId || "");
    setEditGoogleSheetUrl(c.googleSheetUrl || "");
    try {
      setEditAssignedPms(c.assignedPms ? JSON.parse(c.assignedPms) : []);
    } catch { setEditAssignedPms([]); }
  }

  function handleAdd() {
    saveMutation.mutate({
      source: newSource,
      sheet: newSheet,
      languagePair: newLangPair,
      sheetDbId: newSheetDbId || undefined,
      googleSheetUrl: newGoogleSheetUrl || undefined,
      assignedPms: newAssignedPms.length > 0 ? JSON.stringify(newAssignedPms) : null,
    }, {
      onSuccess: () => {
        setNewSource(""); setNewSheet(""); setNewLangPair("EN>TR");
        setNewSheetDbId(""); setNewGoogleSheetUrl(""); setNewAssignedPms([]);
        setShowAdd(false);
      },
    });
  }

  function handleEditSave() {
    saveMutation.mutate({
      source: editSource,
      sheet: editSheet,
      languagePair: editLangPair,
      sheetDbId: editSheetDbId || undefined,
      googleSheetUrl: editGoogleSheetUrl || undefined,
      assignedPms: editAssignedPms.length > 0 ? JSON.stringify(editAssignedPms) : null,
    }, {
      onSuccess: () => { setEditingId(null); },
    });
  }

  function parsePmCount(assignedPms: string | null): number {
    if (!assignedPms) return 0;
    try { return (JSON.parse(assignedPms) as string[]).length; } catch { return 0; }
  }

  function PmCheckboxes({ selected, onChange }: { selected: string[]; onChange: (v: string[]) => void }) {
    if (!pmUsers || pmUsers.length === 0) return <p className="text-xs text-muted-foreground">No PM users found.</p>;
    return (
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {pmUsers.map((u) => (
          <label key={u.id} className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={selected.includes(u.email)}
              onChange={(e) => {
                if (e.target.checked) onChange([...selected, u.email]);
                else onChange(selected.filter((em) => em !== u.email));
              }}
              className="rounded border-border"
            />
            <span className="text-foreground">{u.name}</span>
            <span className="text-muted-foreground">({u.email})</span>
          </label>
        ))}
      </div>
    );
  }

  return (
    <Card className="border border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
            Sheet Configurations
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => { setShowAdd(!showAdd); setEditingId(null); }} data-testid="button-add-config">
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {showAdd && (
          <div className="mb-4 p-3 bg-muted/30 rounded-lg space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Source</label>
                <Input value={newSource} onChange={(e) => setNewSource(e.target.value)} placeholder="e.g. Amazon" className="h-8 text-sm" data-testid="input-config-source" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Sheet / Tab</label>
                <Input value={newSheet} onChange={(e) => setNewSheet(e.target.value)} placeholder="e.g. non-AFT" className="h-8 text-sm" data-testid="input-config-sheet" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Language Pair</label>
                <Select value={newLangPair} onValueChange={setNewLangPair}>
                  <SelectTrigger className="h-8 text-sm" data-testid="select-config-lang"><SelectValue /></SelectTrigger>
                  <SelectContent>{LANGUAGE_PAIRS.map((lp) => <SelectItem key={lp} value={lp}>{lp}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">SheetDB API ID</label>
                <Input value={newSheetDbId} onChange={(e) => setNewSheetDbId(e.target.value)} placeholder="e.g. mukq6ww3ssuk0" className="h-8 text-sm font-mono" data-testid="input-config-sheetdbid" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Google Sheet URL</label>
                <Input value={newGoogleSheetUrl} onChange={(e) => setNewGoogleSheetUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." className="h-8 text-sm" data-testid="input-config-gsheet-url" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Assigned PMs (empty = visible to all)</label>
              <PmCheckboxes selected={newAssignedPms} onChange={setNewAssignedPms} />
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleAdd} disabled={!newSource || !newSheet || saveMutation.isPending} data-testid="button-save-config" className="h-8">
                {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)} className="h-8">Cancel</Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded" />)}
          </div>
        ) : !configs || configs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No sheet configurations yet.</p>
        ) : (
          <div className="space-y-1" data-testid="table-configs">
            {configs.map((c) => (
              <div key={c.id} className="border border-border rounded-lg" data-testid={`config-row-${c.id}`}>
                {editingId === c.id ? (
                  /* ── Edit mode ── */
                  <div className="p-3 space-y-3 bg-muted/20">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Source</label>
                        <Input value={editSource} onChange={(e) => setEditSource(e.target.value)} className="h-8 text-sm" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Sheet / Tab</label>
                        <Input value={editSheet} onChange={(e) => setEditSheet(e.target.value)} className="h-8 text-sm" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Language Pair</label>
                        <Select value={editLangPair} onValueChange={setEditLangPair}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>{LANGUAGE_PAIRS.map((lp) => <SelectItem key={lp} value={lp}>{lp}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">SheetDB API ID</label>
                        <Input value={editSheetDbId} onChange={(e) => setEditSheetDbId(e.target.value)} placeholder="e.g. mukq6ww3ssuk0" className="h-8 text-sm font-mono" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Google Sheet URL</label>
                        <Input value={editGoogleSheetUrl} onChange={(e) => setEditGoogleSheetUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." className="h-8 text-sm" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Assigned PMs (empty = visible to all)</label>
                      <PmCheckboxes selected={editAssignedPms} onChange={setEditAssignedPms} />
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={handleEditSave} disabled={!editSource || !editSheet || saveMutation.isPending} className="h-7 text-xs">
                        {saveMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Check className="w-3 h-3 mr-1" />}
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="h-7 text-xs">
                        <X className="w-3 h-3 mr-1" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* ── Display mode ── */
                  <div className="flex items-center gap-2 px-3 py-2">
                    <span className="text-sm font-medium text-foreground w-24 shrink-0">{c.source}</span>
                    <span className="text-sm text-foreground w-32 shrink-0">{c.sheet}</span>
                    <Badge variant="secondary" className="text-xs shrink-0">{c.languagePair}</Badge>
                    {c.sheetDbId && (
                      <Badge variant="outline" className="text-[10px] font-mono shrink-0">{c.sheetDbId}</Badge>
                    )}
                    {parsePmCount(c.assignedPms) > 0 && (
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        <Users className="w-2.5 h-2.5 mr-0.5" />
                        {parsePmCount(c.assignedPms)} PM{parsePmCount(c.assignedPms) > 1 ? "s" : ""}
                      </Badge>
                    )}
                    {c.googleSheetUrl && (
                      <a href={c.googleSheetUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <div className="flex-1" />
                    <Button variant="ghost" size="sm" onClick={() => { startEdit(c); setShowAdd(false); }} className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" data-testid={`button-edit-config-${c.id}`}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(c.id)} className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" data-testid={`button-delete-config-${c.id}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── PM User Management ──

function PmUsersSection() {
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("pm");

  const { data: users, isLoading } = useQuery<PmUser[]>({
    queryKey: ["/api/pm-users"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/pm-users");
      return res.json();
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/pm-users", {
        email: newEmail,
        name: newName,
        password: newPassword,
        role: newRole,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pm-users"] });
      toast({ title: "User created" });
      setNewEmail("");
      setNewName("");
      setNewPassword("");
      setNewRole("pm");
      setShowAdd(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Card className="border border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            PM Users
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => setShowAdd(!showAdd)} data-testid="button-add-user">
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {showAdd && (
          <div className="mb-4 p-3 bg-muted/30 rounded-lg space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Email</label>
                <Input
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="user@eltur.co"
                  className="h-8 text-sm"
                  data-testid="input-user-email"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Name</label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Full Name"
                  className="h-8 text-sm"
                  data-testid="input-user-name"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Password</label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Password"
                  className="h-8 text-sm"
                  data-testid="input-user-password"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Role</label>
                <Select value={newRole} onValueChange={setNewRole}>
                  <SelectTrigger className="h-8 text-sm" data-testid="select-user-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pm">PM</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => addMutation.mutate()}
              disabled={!newEmail || !newName || !newPassword || addMutation.isPending}
              data-testid="button-save-user"
              className="h-8"
            >
              {addMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
              Create User
            </Button>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded" />)}
          </div>
        ) : !users || users.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No PM users yet.</p>
        ) : (
          <table className="w-full text-sm" data-testid="table-users">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left font-medium text-muted-foreground px-3 py-2 text-xs">Email</th>
                <th className="text-left font-medium text-muted-foreground px-3 py-2 text-xs">Name</th>
                <th className="text-left font-medium text-muted-foreground px-3 py-2 text-xs">Role</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0" data-testid={`user-row-${u.id}`}>
                  <td className="px-3 py-2 text-foreground">{u.email}</td>
                  <td className="px-3 py-2 text-foreground">{u.name}</td>
                  <td className="px-3 py-2">
                    <Badge variant={u.role === "admin" ? "default" : "secondary"} className="text-xs">
                      {u.role === "admin" ? "Admin" : "PM"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

// ── Email Templates ──

function EmailTemplatesSection() {
  const { toast } = useToast();

  const { data: templates, isLoading } = useQuery<EmailTemplate[]>({
    queryKey: ["/api/email-templates"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/email-templates");
      return res.json();
    },
  });

  return (
    <Card className="border border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Mail className="w-4 h-4 text-muted-foreground" />
          Email Templates
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-3 p-2 rounded bg-muted/30 flex items-start gap-2">
          <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-[11px] text-muted-foreground">
            Available placeholders: <code className="text-foreground">{"{{freelancerName}}"}</code>, <code className="text-foreground">{"{{account}}"}</code>, <code className="text-foreground">{"{{source}}"}</code>, <code className="text-foreground">{"{{sheet}}"}</code>, <code className="text-foreground">{"{{projectId}}"}</code>, <code className="text-foreground">{"{{deadline}}"}</code>, <code className="text-foreground">{"{{total}}"}</code>, <code className="text-foreground">{"{{wwc}}"}</code>, <code className="text-foreground">{"{{role}}"}</code>, <code className="text-foreground">{"{{acceptUrl}}"}</code>
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-32 w-full rounded" />)}
          </div>
        ) : !templates || templates.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No email templates yet.</p>
        ) : (
          <div className="space-y-4">
            {templates.map((tpl) => (
              <TemplateEditor key={tpl.id} template={tpl} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const TEMPLATE_PLACEHOLDERS = [
  "freelancerName", "account", "source", "sheet",
  "projectId", "deadline", "total", "wwc", "role", "acceptUrl",
];

const SAMPLE_DATA: Record<string, string> = {
  freelancerName: "Jane Doe",
  account: "Amazon",
  source: "Amazon",
  sheet: "non-AFT",
  projectId: "PRJ-20260323-001",
  deadline: "2026-03-25 17:00",
  total: "5,200",
  wwc: "3,800",
  role: "Translator",
  acceptUrl: "https://example.com/respond?token=abc123",
};

function replaceTemplateVars(html: string): string {
  let result = html;
  for (const key of TEMPLATE_PLACEHOLDERS) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), SAMPLE_DATA[key] || "");
  }
  return result;
}

function TemplateEditor({ template }: { template: EmailTemplate }) {
  const { toast } = useToast();
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [previewMode, setPreviewMode] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const hasChanges = subject !== template.subject || body !== template.body;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/email-templates", {
        key: template.key,
        subject,
        body,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-templates"] });
      toast({ title: "Template saved" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  function insertPlaceholder(name: string) {
    const ta = bodyRef.current;
    if (!ta) return;
    const tag = `{{${name}}}`;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const newBody = body.substring(0, start) + tag + body.substring(end);
    setBody(newBody);
    setPreviewMode(false);
    setTimeout(() => {
      ta.focus();
      const pos = start + tag.length;
      ta.setSelectionRange(pos, pos);
    }, 0);
  }

  return (
    <div className="p-3 border border-border rounded-lg" data-testid={`template-${template.key}`}>
      <div className="flex items-center justify-between mb-2">
        <Badge variant="secondary" className="text-xs">{template.key}</Badge>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant={previewMode ? "default" : "outline"}
            onClick={() => setPreviewMode(!previewMode)}
            className="h-7 text-xs"
            data-testid={`button-preview-${template.key}`}
          >
            {previewMode ? <Code className="w-3 h-3 mr-1" /> : <Eye className="w-3 h-3 mr-1" />}
            {previewMode ? "Source" : "Preview"}
          </Button>
          <Button
            size="sm"
            variant={hasChanges ? "default" : "outline"}
            onClick={() => saveMutation.mutate()}
            disabled={!hasChanges || saveMutation.isPending}
            className="h-7 text-xs"
            data-testid={`button-save-template-${template.key}`}
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-3 h-3 animate-spin mr-1" />
            ) : (
              <Save className="w-3 h-3 mr-1" />
            )}
            Save
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Subject</label>
          {previewMode ? (
            <div className="h-8 flex items-center px-3 bg-muted/30 rounded-md text-sm text-foreground">
              {replaceTemplateVars(subject)}
            </div>
          ) : (
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="h-8 text-sm"
              data-testid={`input-subject-${template.key}`}
            />
          )}
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            {previewMode ? "Body (Preview)" : "Body (HTML)"}
          </label>
          {previewMode ? (
            <div
              className="min-h-[200px] p-3 bg-white rounded-md border border-border text-sm overflow-auto"
              dangerouslySetInnerHTML={{ __html: replaceTemplateVars(body) }}
              data-testid={`preview-body-${template.key}`}
            />
          ) : (
            <Textarea
              ref={bodyRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="text-xs font-mono min-h-[200px]"
              data-testid={`input-body-${template.key}`}
            />
          )}
        </div>
        {!previewMode && (
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Insert placeholder</label>
            <div className="flex flex-wrap gap-1">
              {TEMPLATE_PLACEHOLDERS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => insertPlaceholder(p)}
                  className="px-2 py-0.5 text-[11px] rounded-full bg-muted hover:bg-muted-foreground/20 text-foreground font-mono cursor-pointer transition-colors"
                  data-testid={`chip-${p}`}
                >
                  {`{{${p}}}`}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
