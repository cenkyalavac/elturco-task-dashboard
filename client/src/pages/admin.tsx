import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, Loader2, FileSpreadsheet, Users } from "lucide-react";

// ── Types ──

interface SheetConfig {
  id: number;
  source: string;
  sheet: string;
  languagePair: string;
}

interface PmUser {
  id: number;
  email: string;
  name: string;
  role: string;
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
      </div>
    </div>
  );
}

// ── Sheet Configurations ──

function SheetConfigsSection() {
  const { toast } = useToast();
  const [newSource, setNewSource] = useState("");
  const [newSheet, setNewSheet] = useState("");
  const [newLangPair, setNewLangPair] = useState("EN>TR");
  const [showAdd, setShowAdd] = useState(false);

  const { data: configs, isLoading } = useQuery<SheetConfig[]>({
    queryKey: ["/api/sheet-configs"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/sheet-configs");
      return res.json();
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/sheet-configs", {
        source: newSource,
        sheet: newSheet,
        languagePair: newLangPair,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sheet-configs"] });
      toast({ title: "Config saved" });
      setNewSource("");
      setNewSheet("");
      setNewLangPair("EN>TR");
      setShowAdd(false);
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

  const updateMutation = useMutation({
    mutationFn: async ({ source, sheet, languagePair }: { source: string; sheet: string; languagePair: string }) => {
      const res = await apiRequest("POST", "/api/sheet-configs", { source, sheet, languagePair });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sheet-configs"] });
      toast({ title: "Config updated" });
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
            <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
            Sheet Configurations
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => setShowAdd(!showAdd)} data-testid="button-add-config">
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {showAdd && (
          <div className="flex items-end gap-2 mb-4 p-3 bg-muted/30 rounded-lg">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">Source</label>
              <Input
                value={newSource}
                onChange={(e) => setNewSource(e.target.value)}
                placeholder="e.g. Amazon"
                className="h-8 text-sm"
                data-testid="input-config-source"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">Sheet</label>
              <Input
                value={newSheet}
                onChange={(e) => setNewSheet(e.target.value)}
                placeholder="e.g. non-AFT"
                className="h-8 text-sm"
                data-testid="input-config-sheet"
              />
            </div>
            <div className="w-32">
              <label className="text-xs text-muted-foreground mb-1 block">Language Pair</label>
              <Select value={newLangPair} onValueChange={setNewLangPair}>
                <SelectTrigger className="h-8 text-sm" data-testid="select-config-lang">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGE_PAIRS.map((lp) => (
                    <SelectItem key={lp} value={lp}>{lp}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              onClick={() => addMutation.mutate()}
              disabled={!newSource || !newSheet || addMutation.isPending}
              data-testid="button-save-config"
              className="h-8"
            >
              {addMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
            </Button>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded" />)}
          </div>
        ) : !configs || configs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No sheet configurations yet.</p>
        ) : (
          <table className="w-full text-sm" data-testid="table-configs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left font-medium text-muted-foreground px-3 py-2 text-xs">Source</th>
                <th className="text-left font-medium text-muted-foreground px-3 py-2 text-xs">Sheet</th>
                <th className="text-left font-medium text-muted-foreground px-3 py-2 text-xs">Language Pair</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {configs.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0" data-testid={`config-row-${c.id}`}>
                  <td className="px-3 py-2 text-foreground">{c.source}</td>
                  <td className="px-3 py-2 text-foreground">{c.sheet}</td>
                  <td className="px-3 py-2">
                    <Select
                      value={c.languagePair}
                      onValueChange={(v) => updateMutation.mutate({ source: c.source, sheet: c.sheet, languagePair: v })}
                    >
                      <SelectTrigger className="h-7 text-xs w-28" data-testid={`select-lang-${c.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LANGUAGE_PAIRS.map((lp) => (
                          <SelectItem key={lp} value={lp}>{lp}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(c.id)}
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      data-testid={`button-delete-config-${c.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
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
