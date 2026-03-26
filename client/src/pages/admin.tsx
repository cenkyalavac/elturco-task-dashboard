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
import { Plus, Trash2, Loader2, FileSpreadsheet, Users, Mail, Save, Info, Pencil, X, Check, ExternalLink, Eye, Code, Zap, Play, Timer } from "lucide-react";
import { useAuth } from "@/lib/auth";

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
  initial?: string;
  role: string;
}

interface EmailTemplate {
  id: number;
  key: string;
  subject: string;
  body: string;
}

interface AutoAssignRule {
  id: number;
  name: string;
  source: string | null;
  account: string | null;
  languagePair: string | null;
  role: string;
  freelancerCodes: string;
  assignmentType: string;
  maxWwc: number | null;
  enabled: number;
  createdBy: string;
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
        <AutoAssignRulesSection />
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
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newInitial, setNewInitial] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("pm");

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editInitial, setEditInitial] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editPassword, setEditPassword] = useState("");

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
        initial: newInitial,
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
      setNewInitial("");
      setNewPassword("");
      setNewRole("pm");
      setShowAdd(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const editMutation = useMutation({
    mutationFn: async (id: number) => {
      const body: Record<string, string> = {
        name: editName,
        initial: editInitial,
        role: editRole,
      };
      if (editPassword) body.password = editPassword;
      const res = await apiRequest("PUT", `/api/pm-users/${id}`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pm-users"] });
      toast({ title: "User updated" });
      setEditingUserId(null);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  function startEditUser(u: PmUser) {
    setEditingUserId(u.id);
    setEditName(u.name);
    setEditInitial(u.initial || "");
    setEditRole(u.role);
    setEditPassword("");
    setShowAdd(false);
  }

  return (
    <Card className="border border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            PM Users
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => { setShowAdd(!showAdd); setEditingUserId(null); }} data-testid="button-add-user">
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
                <label className="text-xs text-muted-foreground mb-1 block">Initial (sheet code)</label>
                <Input
                  value={newInitial}
                  onChange={(e) => setNewInitial(e.target.value.toUpperCase())}
                  placeholder="CY"
                  className="h-8 text-sm"
                  maxLength={5}
                  data-testid="input-user-initial"
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
                <th className="text-left font-medium text-muted-foreground px-3 py-2 text-xs">Initial</th>
                <th className="text-left font-medium text-muted-foreground px-3 py-2 text-xs">Role</th>
                <th className="text-right font-medium text-muted-foreground px-3 py-2 text-xs w-20">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) =>
                editingUserId === u.id ? (
                  <tr key={u.id} className="border-b border-border last:border-0 bg-muted/20" data-testid={`user-row-${u.id}`}>
                    <td className="px-3 py-2 text-foreground text-muted-foreground">{u.email}</td>
                    <td className="px-3 py-2">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-7 text-sm"
                        data-testid={`input-edit-user-name-${u.id}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={editInitial}
                        onChange={(e) => setEditInitial(e.target.value.toUpperCase())}
                        className="h-7 text-sm font-mono"
                        maxLength={5}
                        data-testid={`input-edit-user-initial-${u.id}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Select value={editRole} onValueChange={setEditRole}>
                        <SelectTrigger className="h-7 text-sm" data-testid={`select-edit-user-role-${u.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pm">PM</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <Input
                          type="password"
                          value={editPassword}
                          onChange={(e) => setEditPassword(e.target.value)}
                          placeholder="New pw"
                          className="h-7 text-sm w-20"
                          data-testid={`input-edit-user-password-${u.id}`}
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => editMutation.mutate(u.id)}
                          disabled={!editName || editMutation.isPending}
                          className="h-7 w-7 p-0"
                          data-testid={`button-save-edit-user-${u.id}`}
                        >
                          {editMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingUserId(null)}
                          className="h-7 w-7 p-0 text-muted-foreground"
                          data-testid={`button-cancel-edit-user-${u.id}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={u.id} className="border-b border-border last:border-0" data-testid={`user-row-${u.id}`}>
                    <td className="px-3 py-2 text-foreground">{u.email}</td>
                    <td className="px-3 py-2 text-foreground">{u.name}</td>
                    <td className="px-3 py-2 text-foreground font-mono text-xs">{u.initial || "—"}</td>
                    <td className="px-3 py-2">
                      <Badge variant={u.role === "admin" ? "default" : "secondary"} className="text-xs">
                        {u.role === "admin" ? "Admin" : "PM"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => startEditUser(u)}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                        data-testid={`button-edit-user-${u.id}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                )
              )}
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
  "projectId", "projectTitle", "deadline", "total", "wwc", "role", "acceptUrl",
  "hoNote", "revType",
  "ice", "rep", "match100", "fuzzy95", "fuzzy85", "fuzzy75", "noMatch", "mt",
];

const SAMPLE_DATA: Record<string, string> = {
  freelancerName: "Jane Doe",
  account: "Amazon WD 2026",
  source: "Amazon",
  sheet: "non-AFT",
  projectId: "41198507",
  projectTitle: "Widget Translation Q1",
  deadline: "26.03.2026 18:00",
  total: "5,200",
  wwc: "3,800",
  role: "Translation",
  acceptUrl: "https://dispatch.eltur.co/#/respond/abc123",
  hoNote: "Please check glossary",
  revType: "Full Review",
  ice: "120", rep: "340", match100: "890", fuzzy95: "1,200",
  fuzzy85: "450", fuzzy75: "80", noMatch: "2,120", mt: "0",
};

function buildSampleTemplate(key: string): string {
  if (key === "offer_reviewer") {
    return `<p>Hello <strong>{{freelancerName}}</strong>,</p>
<p>We'd like to know if you're available for the following review task.</p>
<table style="width:100%;border-collapse:collapse;margin:16px 0;border:1px solid #eee">
<tr><td style="padding:10px 14px;background:#f8f9fa;font-weight:600;color:#555;border-bottom:1px solid #eee;width:140px">Account</td><td style="padding:10px 14px;background:#f8f9fa;border-bottom:1px solid #eee">{{account}}</td></tr>
<tr><td style="padding:10px 14px;font-weight:600;color:#555;border-bottom:1px solid #eee">Project</td><td style="padding:10px 14px;border-bottom:1px solid #eee">{{projectTitle}}</td></tr>
<tr><td style="padding:10px 14px;background:#f8f9fa;font-weight:600;color:#555;border-bottom:1px solid #eee">Project ID</td><td style="padding:10px 14px;background:#f8f9fa;border-bottom:1px solid #eee">{{projectId}}</td></tr>
<tr><td style="padding:10px 14px;font-weight:600;color:#555;border-bottom:1px solid #eee">Review Deadline</td><td style="padding:10px 14px;color:#e74c3c;font-weight:700;border-bottom:1px solid #eee">{{deadline}}</td></tr>
<tr><td style="padding:10px 14px;background:#f8f9fa;font-weight:600;color:#555;border-bottom:1px solid #eee">Total WC</td><td style="padding:10px 14px;background:#f8f9fa;border-bottom:1px solid #eee">{{total}}</td></tr>
<tr><td style="padding:10px 14px;font-weight:600;color:#555;border-bottom:1px solid #eee">Review Type</td><td style="padding:10px 14px;border-bottom:1px solid #eee">{{revType}}</td></tr>
</table>`;
  }
  // Default: translator template
  return `<p>Hello <strong>{{freelancerName}}</strong>,</p>
<p>We'd like to know if you're available for the following translation task.</p>
<table style="width:100%;border-collapse:collapse;margin:16px 0;border:1px solid #eee">
<tr><td style="padding:10px 14px;background:#f8f9fa;font-weight:600;color:#555;border-bottom:1px solid #eee;width:140px">Account</td><td style="padding:10px 14px;background:#f8f9fa;border-bottom:1px solid #eee">{{account}}</td></tr>
<tr><td style="padding:10px 14px;font-weight:600;color:#555;border-bottom:1px solid #eee">Project</td><td style="padding:10px 14px;border-bottom:1px solid #eee">{{projectTitle}}</td></tr>
<tr><td style="padding:10px 14px;background:#f8f9fa;font-weight:600;color:#555;border-bottom:1px solid #eee">Project ID</td><td style="padding:10px 14px;background:#f8f9fa;border-bottom:1px solid #eee">{{projectId}}</td></tr>
<tr><td style="padding:10px 14px;font-weight:600;color:#555;border-bottom:1px solid #eee">TR Deadline</td><td style="padding:10px 14px;color:#e74c3c;font-weight:700;border-bottom:1px solid #eee">{{deadline}}</td></tr>
<tr><td style="padding:10px 14px;background:#f8f9fa;font-weight:600;color:#555;border-bottom:1px solid #eee">Total / WWC</td><td style="padding:10px 14px;background:#f8f9fa;border-bottom:1px solid #eee">{{total}} / {{wwc}}</td></tr>
<tr><td style="padding:10px 14px;font-weight:600;color:#555;border-bottom:1px solid #eee">ICE/CM</td><td style="padding:10px 14px;border-bottom:1px solid #eee">{{ice}}</td></tr>
<tr><td style="padding:10px 14px;background:#f8f9fa;font-weight:600;color:#555;border-bottom:1px solid #eee">Repetitions</td><td style="padding:10px 14px;background:#f8f9fa;border-bottom:1px solid #eee">{{rep}}</td></tr>
<tr><td style="padding:10px 14px;font-weight:600;color:#555;border-bottom:1px solid #eee">100%</td><td style="padding:10px 14px;border-bottom:1px solid #eee">{{match100}}</td></tr>
<tr><td style="padding:10px 14px;background:#f8f9fa;font-weight:600;color:#555;border-bottom:1px solid #eee">95-99%</td><td style="padding:10px 14px;background:#f8f9fa;border-bottom:1px solid #eee">{{fuzzy95}}</td></tr>
<tr><td style="padding:10px 14px;font-weight:600;color:#555;border-bottom:1px solid #eee">85-94%</td><td style="padding:10px 14px;border-bottom:1px solid #eee">{{fuzzy85}}</td></tr>
<tr><td style="padding:10px 14px;background:#f8f9fa;font-weight:600;color:#555;border-bottom:1px solid #eee">75-84%</td><td style="padding:10px 14px;background:#f8f9fa;border-bottom:1px solid #eee">{{fuzzy75}}</td></tr>
<tr><td style="padding:10px 14px;font-weight:600;color:#555;border-bottom:1px solid #eee">No Match</td><td style="padding:10px 14px;border-bottom:1px solid #eee">{{noMatch}}</td></tr>
<tr><td style="padding:10px 14px;background:#f8f9fa;font-weight:600;color:#555;border-bottom:1px solid #eee">MT</td><td style="padding:10px 14px;background:#f8f9fa;border-bottom:1px solid #eee">{{mt}}</td></tr>
</table>`;
}

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
          <div className="space-y-2">
            {/* Formatting helpers */}
            <div className="flex items-center gap-1">
              <label className="text-xs text-muted-foreground mr-1">Format:</label>
              {[
                { label: "B", tag: "strong", cls: "font-bold" },
                { label: "I", tag: "em", cls: "italic" },
                { label: "H3", tag: "h3", cls: "" },
                { label: "Link", tag: "a href=\"\"", cls: "" },
                { label: "<br>", tag: "br/", cls: "" },
              ].map(f => (
                <button key={f.label} type="button" onClick={() => {
                  const ta = bodyRef.current; if (!ta) return;
                  const start = ta.selectionStart; const end = ta.selectionEnd;
                  const sel = body.substring(start, end);
                  const wrapped = f.tag === "br/" ? body.substring(0, start) + "<br>" + body.substring(end)
                    : body.substring(0, start) + `<${f.tag}>${sel}</${f.tag.split(" ")[0]}>` + body.substring(end);
                  setBody(wrapped);
                }} className={`px-2 py-0.5 text-[11px] rounded bg-muted hover:bg-muted-foreground/20 text-foreground cursor-pointer ${f.cls}`}>
                  {f.label}
                </button>
              ))}
              <div className="flex-1" />
              <button type="button" onClick={() => { setBody(buildSampleTemplate(template.key)); }} className="px-2 py-0.5 text-[10px] rounded bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 cursor-pointer">
                Reset to Default
              </button>
            </div>
            {/* Placeholders grouped */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Insert placeholder</label>
              <div className="space-y-1">
                <div className="flex flex-wrap gap-1">
                  <span className="text-[9px] text-muted-foreground/50 w-10 pt-0.5">Core</span>
                  {["freelancerName", "account", "projectId", "projectTitle", "deadline", "role", "acceptUrl"].map(p => (
                    <button key={p} type="button" onClick={() => insertPlaceholder(p)} className="px-2 py-0.5 text-[10px] rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/15 hover:bg-blue-500/20 font-mono cursor-pointer">{`{{${p}}}`}</button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1">
                  <span className="text-[9px] text-muted-foreground/50 w-10 pt-0.5">WC</span>
                  {["total", "wwc", "ice", "rep", "match100", "fuzzy95", "fuzzy85", "fuzzy75", "noMatch", "mt"].map(p => (
                    <button key={p} type="button" onClick={() => insertPlaceholder(p)} className="px-2 py-0.5 text-[10px] rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/15 hover:bg-emerald-500/20 font-mono cursor-pointer">{`{{${p}}}`}</button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1">
                  <span className="text-[9px] text-muted-foreground/50 w-10 pt-0.5">Extra</span>
                  {["source", "sheet", "hoNote", "revType"].map(p => (
                    <button key={p} type="button" onClick={() => insertPlaceholder(p)} className="px-2 py-0.5 text-[10px] rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/15 hover:bg-purple-500/20 font-mono cursor-pointer">{`{{${p}}}`}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Auto-Assign Rules ──

function AutoAssignRulesSection() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [showAdd, setShowAdd] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [newSource, setNewSource] = useState("");
  const [newAccount, setNewAccount] = useState("");
  const [newLangPair, setNewLangPair] = useState("");
  const [newRole, setNewRole] = useState("translator");
  const [newFreelancerCodes, setNewFreelancerCodes] = useState("");
  const [newAssignmentType, setNewAssignmentType] = useState("sequence");
  const [newMaxWwc, setNewMaxWwc] = useState("");

  // Edit form state
  const [editRuleName, setEditRuleName] = useState("");
  const [editRuleSource, setEditRuleSource] = useState("");
  const [editRuleAccount, setEditRuleAccount] = useState("");
  const [editRuleLangPair, setEditRuleLangPair] = useState("");
  const [editRuleRole, setEditRuleRole] = useState("");
  const [editRuleFreelancerCodes, setEditRuleFreelancerCodes] = useState("");
  const [editRuleAssignmentType, setEditRuleAssignmentType] = useState("");
  const [editRuleMaxWwc, setEditRuleMaxWwc] = useState("");
  const [editRuleEnabled, setEditRuleEnabled] = useState(true);

  const { data: rules, isLoading } = useQuery<AutoAssignRule[]>({
    queryKey: ["/api/auto-assign-rules"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/auto-assign-rules");
      return res.json();
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const codes = newFreelancerCodes.split(",").map(c => c.trim()).filter(Boolean);
      const res = await apiRequest("POST", "/api/auto-assign-rules", {
        name: newName,
        source: newSource || null,
        account: newAccount || null,
        languagePair: newLangPair || null,
        role: newRole,
        freelancerCodes: JSON.stringify(codes),
        assignmentType: newAssignmentType,
        createdBy: user?.email || "unknown",
        ...(newMaxWwc ? { maxWwc: parseInt(newMaxWwc) } : {}),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auto-assign-rules"] });
      toast({ title: "Rule created" });
      setNewName(""); setNewSource(""); setNewAccount("");
      setNewLangPair(""); setNewRole("translator");
      setNewFreelancerCodes(""); setNewAssignmentType("sequence");
      setNewMaxWwc("");
      setShowAdd(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const editMutation = useMutation({
    mutationFn: async (id: number) => {
      const codes = editRuleFreelancerCodes.split(",").map(c => c.trim()).filter(Boolean);
      const res = await apiRequest("PUT", `/api/auto-assign-rules/${id}`, {
        name: editRuleName,
        source: editRuleSource || null,
        account: editRuleAccount || null,
        languagePair: editRuleLangPair || null,
        role: editRuleRole,
        freelancerCodes: JSON.stringify(codes),
        assignmentType: editRuleAssignmentType,
        maxWwc: editRuleMaxWwc ? parseInt(editRuleMaxWwc) : null,
        enabled: editRuleEnabled,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auto-assign-rules"] });
      toast({ title: "Rule updated" });
      setEditingRuleId(null);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/auto-assign-rules/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auto-assign-rules"] });
      toast({ title: "Rule deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Auto-dispatch mutation
  const autoDispatchMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auto-dispatch");
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Auto-Dispatch Complete", description: data?.message || `${data?.dispatched ?? 0} tasks dispatched.` });
    },
    onError: (err: any) => {
      toast({ title: "Auto-Dispatch Error", description: err.message, variant: "destructive" });
    },
  });

  // Sequence advance mutation
  const sequenceAdvanceMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/sequence-advance");
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Sequence Check Complete", description: data?.message || `${data?.advanced ?? 0} offers advanced.` });
    },
    onError: (err: any) => {
      toast({ title: "Sequence Check Error", description: err.message, variant: "destructive" });
    },
  });

  function parseCodes(json: string): string[] {
    try { return JSON.parse(json); } catch { return []; }
  }

  function startEditRule(rule: AutoAssignRule) {
    setEditingRuleId(rule.id);
    setEditRuleName(rule.name);
    setEditRuleSource(rule.source || "");
    setEditRuleAccount(rule.account || "");
    setEditRuleLangPair(rule.languagePair || "");
    setEditRuleRole(rule.role);
    setEditRuleFreelancerCodes(parseCodes(rule.freelancerCodes).join(", "));
    setEditRuleAssignmentType(rule.assignmentType);
    setEditRuleMaxWwc(rule.maxWwc != null ? String(rule.maxWwc) : "");
    setEditRuleEnabled(!!rule.enabled);
    setShowAdd(false);
  }

  return (
    <Card className="border border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Zap className="w-4 h-4 text-muted-foreground" />
            Auto-Assign Rules
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => autoDispatchMutation.mutate()}
              disabled={autoDispatchMutation.isPending}
              data-testid="button-auto-dispatch"
            >
              {autoDispatchMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Play className="w-3.5 h-3.5 mr-1" />}
              Run Auto-Dispatch
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => sequenceAdvanceMutation.mutate()}
              disabled={sequenceAdvanceMutation.isPending}
              data-testid="button-sequence-advance"
            >
              {sequenceAdvanceMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Timer className="w-3.5 h-3.5 mr-1" />}
              Check Sequence Timeouts
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setShowAdd(!showAdd); setEditingRuleId(null); }} data-testid="button-add-rule">
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {showAdd && (
          <div className="mb-4 p-3 bg-muted/30 rounded-lg space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Rule Name</label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Amazon TR Default" className="h-8 text-sm" data-testid="input-rule-name" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Source (empty = any)</label>
                <Input value={newSource} onChange={(e) => setNewSource(e.target.value)} placeholder="e.g. Amazon" className="h-8 text-sm" data-testid="input-rule-source" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Account (empty = any)</label>
                <Input value={newAccount} onChange={(e) => setNewAccount(e.target.value)} placeholder="e.g. Amazon SeCM" className="h-8 text-sm" data-testid="input-rule-account" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Language Pair (empty = any)</label>
                <Select value={newLangPair || "__any__"} onValueChange={(v) => setNewLangPair(v === "__any__" ? "" : v)}>
                  <SelectTrigger className="h-8 text-sm" data-testid="select-rule-lang"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any__">Any</SelectItem>
                    {LANGUAGE_PAIRS.map((lp) => <SelectItem key={lp} value={lp}>{lp}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Role</label>
                <Select value={newRole} onValueChange={setNewRole}>
                  <SelectTrigger className="h-8 text-sm" data-testid="select-rule-role"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="translator">Translator</SelectItem>
                    <SelectItem value="reviewer">Reviewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Assignment Type</label>
                <Select value={newAssignmentType} onValueChange={setNewAssignmentType}>
                  <SelectTrigger className="h-8 text-sm" data-testid="select-rule-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="direct">Direct</SelectItem>
                    <SelectItem value="sequence">Sequential</SelectItem>
                    <SelectItem value="broadcast">Broadcast</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Freelancer Codes (comma-separated)</label>
              <Input
                value={newFreelancerCodes}
                onChange={(e) => setNewFreelancerCodes(e.target.value)}
                placeholder="e.g. CY1, MP, BS"
                className="h-8 text-sm font-mono"
                data-testid="input-rule-codes"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Max WWC (optional)</label>
              <Input
                type="number"
                value={newMaxWwc}
                onChange={(e) => setNewMaxWwc(e.target.value)}
                placeholder="e.g. 5000"
                className="h-8 text-sm"
                data-testid="input-rule-max-wwc"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => addMutation.mutate()} disabled={!newName || !newFreelancerCodes || addMutation.isPending} data-testid="button-save-rule" className="h-8">
                {addMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)} className="h-8">Cancel</Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded" />)}
          </div>
        ) : !rules || rules.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No auto-assign rules yet.</p>
        ) : (
          <div className="space-y-1" data-testid="table-rules">
            {rules.map((rule) => {
              const codes = parseCodes(rule.freelancerCodes);
              return (
                <div key={rule.id} className="border border-border rounded-lg" data-testid={`rule-row-${rule.id}`}>
                  {editingRuleId === rule.id ? (
                    /* ── Edit mode ── */
                    <div className="p-3 space-y-3 bg-muted/20">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Rule Name</label>
                          <Input value={editRuleName} onChange={(e) => setEditRuleName(e.target.value)} className="h-8 text-sm" data-testid={`input-edit-rule-name-${rule.id}`} />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Source (empty = any)</label>
                          <Input value={editRuleSource} onChange={(e) => setEditRuleSource(e.target.value)} className="h-8 text-sm" data-testid={`input-edit-rule-source-${rule.id}`} />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Account (empty = any)</label>
                          <Input value={editRuleAccount} onChange={(e) => setEditRuleAccount(e.target.value)} className="h-8 text-sm" data-testid={`input-edit-rule-account-${rule.id}`} />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Language Pair (empty = any)</label>
                          <Select value={editRuleLangPair || "__any__"} onValueChange={(v) => setEditRuleLangPair(v === "__any__" ? "" : v)}>
                            <SelectTrigger className="h-8 text-sm" data-testid={`select-edit-rule-lang-${rule.id}`}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__any__">Any</SelectItem>
                              {LANGUAGE_PAIRS.map((lp) => <SelectItem key={lp} value={lp}>{lp}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Role</label>
                          <Select value={editRuleRole} onValueChange={setEditRuleRole}>
                            <SelectTrigger className="h-8 text-sm" data-testid={`select-edit-rule-role-${rule.id}`}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="translator">Translator</SelectItem>
                              <SelectItem value="reviewer">Reviewer</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Assignment Type</label>
                          <Select value={editRuleAssignmentType} onValueChange={setEditRuleAssignmentType}>
                            <SelectTrigger className="h-8 text-sm" data-testid={`select-edit-rule-type-${rule.id}`}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="direct">Direct</SelectItem>
                              <SelectItem value="sequence">Sequential</SelectItem>
                              <SelectItem value="broadcast">Broadcast</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Freelancer Codes (comma-separated)</label>
                        <Input
                          value={editRuleFreelancerCodes}
                          onChange={(e) => setEditRuleFreelancerCodes(e.target.value)}
                          className="h-8 text-sm font-mono"
                          data-testid={`input-edit-rule-codes-${rule.id}`}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Max WWC (optional)</label>
                          <Input
                            type="number"
                            value={editRuleMaxWwc}
                            onChange={(e) => setEditRuleMaxWwc(e.target.value)}
                            className="h-8 text-sm"
                            data-testid={`input-edit-rule-max-wwc-${rule.id}`}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Enabled</label>
                          <div className="flex items-center h-8">
                            <input
                              type="checkbox"
                              checked={editRuleEnabled}
                              onChange={(e) => setEditRuleEnabled(e.target.checked)}
                              className="rounded border-border"
                              data-testid={`checkbox-edit-rule-enabled-${rule.id}`}
                            />
                            <span className="ml-2 text-sm text-foreground">{editRuleEnabled ? "Active" : "Disabled"}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" onClick={() => editMutation.mutate(rule.id)} disabled={!editRuleName || !editRuleFreelancerCodes || editMutation.isPending} className="h-7 text-xs" data-testid={`button-save-edit-rule-${rule.id}`}>
                          {editMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Check className="w-3 h-3 mr-1" />}
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingRuleId(null)} className="h-7 text-xs" data-testid={`button-cancel-edit-rule-${rule.id}`}>
                          <X className="w-3 h-3 mr-1" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    /* ── Display mode ── */
                    <div className="flex items-center gap-2 px-3 py-2">
                      <span className="text-sm font-medium text-foreground w-40 shrink-0 truncate">{rule.name}</span>
                      {rule.source && <Badge variant="secondary" className="text-[10px] shrink-0">{rule.source}</Badge>}
                      {rule.account && <Badge variant="outline" className="text-[10px] shrink-0">{rule.account}</Badge>}
                      {rule.languagePair && <Badge variant="outline" className="text-[10px] shrink-0">{rule.languagePair}</Badge>}
                      <Badge className={`text-[10px] shrink-0 ${rule.role === "translator" ? "bg-orange-500/10 text-orange-600 border-orange-500/20" : "bg-blue-500/10 text-blue-600 border-blue-500/20"}`}>
                        {rule.role === "translator" ? "TR" : "REV"}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground font-mono truncate">{codes.join(", ")}</span>
                      {rule.maxWwc && <Badge variant="outline" className="text-[10px] shrink-0">≤{rule.maxWwc} WWC</Badge>}
                      <Badge variant={rule.enabled ? "default" : "secondary"} className="text-[10px] shrink-0 ml-auto">
                        {rule.enabled ? "Active" : "Disabled"}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => startEditRule(rule)}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground shrink-0"
                        data-testid={`button-edit-rule-${rule.id}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteMutation.mutate(rule.id)}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
                        data-testid={`button-delete-rule-${rule.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
