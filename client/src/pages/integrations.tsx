import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plug, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Globe, Key, Mail,
} from "lucide-react";

interface PortalCredential {
  id: number;
  portalSource: string;
  credentials: Record<string, any>;
  entityId: number | null;
  status: string;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function statusBadge(status: string) {
  switch (status) {
    case "connected": return <Badge className="rounded-full px-2.5 py-0.5 text-xs font-medium bg-emerald-500/20 text-emerald-400 border-emerald-500/25"><CheckCircle2 className="w-3 h-3 mr-1" /> Connected</Badge>;
    case "error": return <Badge className="rounded-full px-2.5 py-0.5 text-xs font-medium bg-red-500/20 text-red-400 border-red-500/25"><XCircle className="w-3 h-3 mr-1" /> Error</Badge>;
    default: return <Badge className="rounded-full px-2.5 py-0.5 text-xs font-medium bg-white/10 text-white/40 border-white/10"><AlertTriangle className="w-3 h-3 mr-1" /> Disconnected</Badge>;
  }
}

export default function IntegrationsPage() {
  const { toast } = useToast();

  const { data: credentials = [] } = useQuery<PortalCredential[]>({
    queryKey: ["/api/portal-credentials"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/portal-credentials"); return r.json(); },
  });

  const apsCred = credentials.find(c => c.portalSource === "aps");

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="border-b border-white/[0.06] bg-white/[0.02] -mx-6 -mt-6 px-6 py-5 mb-2">
          <h1 className="text-lg font-semibold text-white flex items-center gap-2">
            <Plug className="w-5 h-5 text-blue-400" /> Portal Integrations
          </h1>
          <p className="text-sm text-white/50 mt-1">Manage connections to external project portals</p>
        </div>

        <Tabs defaultValue="aps">
          <TabsList>
            <TabsTrigger value="aps">APS (Lionbridge)</TabsTrigger>
            <TabsTrigger value="symfonie" disabled>Symfonie</TabsTrigger>
            <TabsTrigger value="junction" disabled>Junction</TabsTrigger>
          </TabsList>

          <TabsContent value="aps" className="mt-4">
            <ApsConnectionCard credential={apsCred} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ============================================
// APS CONNECTION CARD
// ============================================

function ApsConnectionCard({ credential }: { credential?: PortalCredential }) {
  const { toast } = useToast();
  const [jiraBaseUrl, setJiraBaseUrl] = useState(credential?.credentials?.jiraBaseUrl || "https://aps.lionbridge.com");
  const [jiraEmail, setJiraEmail] = useState(credential?.credentials?.jiraEmail || "");
  const [jiraApiToken, setJiraApiToken] = useState("");
  const [jiraProjectKey, setJiraProjectKey] = useState(credential?.credentials?.jiraProjectKey || "");

  const saveMutation = useMutation({
    mutationFn: async () => {
      const creds: Record<string, any> = { jiraBaseUrl, jiraEmail, jiraProjectKey };
      // Only include token if user entered a new one
      if (jiraApiToken) creds.jiraApiToken = jiraApiToken;
      else if (credential?.credentials?.jiraApiToken) {
        // If token wasn't changed, reuse the masked value won't work, so check
        // We need the full token from the saved creds — but we only have masked version
        // So only send token if user provides a new one
      }
      if (!jiraApiToken && !credential) {
        throw new Error("API token is required for initial setup");
      }
      const r = await apiRequest("POST", "/api/portal-credentials", {
        portalSource: "aps",
        credentials: jiraApiToken ? { ...creds, jiraApiToken } : creds,
      });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal-credentials"] });
      toast({ title: "APS credentials saved" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const creds: Record<string, any> = { jiraBaseUrl, jiraEmail, jiraProjectKey };
      if (jiraApiToken) creds.jiraApiToken = jiraApiToken;
      const r = await apiRequest("POST", "/api/portal-credentials/test", { portalSource: "aps", credentials: creds });
      return r.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Connection successful", description: data.message });
        queryClient.invalidateQueries({ queryKey: ["/api/portal-credentials"] });
      } else {
        toast({ title: "Connection failed", description: data.message, variant: "destructive" });
      }
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/portal-credentials/aps/sync");
      return r.json();
    },
    onSuccess: (data) => {
      toast({ title: "Sync complete", description: `Found ${data.total} tasks, ${data.new} new` });
      queryClient.invalidateQueries({ queryKey: ["/api/portal-credentials"] });
    },
    onError: (e: any) => toast({ title: "Sync failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Card className="border border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Lionbridge APS (Jira)</CardTitle>
            <CardDescription>Connect to Lionbridge APS via Jira REST API</CardDescription>
          </div>
          {credential && statusBadge(credential.status)}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
              <Globe className="w-3 h-3" /> Jira Base URL
            </label>
            <Input value={jiraBaseUrl} onChange={e => setJiraBaseUrl(e.target.value)} placeholder="https://aps.lionbridge.com" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
              <Mail className="w-3 h-3" /> Jira Email
            </label>
            <Input value={jiraEmail} onChange={e => setJiraEmail(e.target.value)} placeholder="user@example.com" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
              <Key className="w-3 h-3" /> API Token
            </label>
            <Input
              type="password"
              value={jiraApiToken}
              onChange={e => setJiraApiToken(e.target.value)}
              placeholder={credential ? "(unchanged — enter new token to update)" : "Enter Jira API token"}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Project Key</label>
            <Input value={jiraProjectKey} onChange={e => setJiraProjectKey(e.target.value)} placeholder="PROJ" />
          </div>
        </div>

        {credential?.lastSyncAt && (
          <p className="text-xs text-muted-foreground">Last synced: {new Date(credential.lastSyncAt).toLocaleString()}</p>
        )}

        <div className="flex items-center gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => testMutation.mutate()} disabled={testMutation.isPending || !jiraBaseUrl || !jiraEmail}>
            {testMutation.isPending ? "Testing..." : "Test Connection"}
          </Button>
          <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Saving..." : "Save Credentials"}
          </Button>
          {credential && credential.status === "connected" && (
            <Button variant="outline" size="sm" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${syncMutation.isPending ? "animate-spin" : ""}`} />
              {syncMutation.isPending ? "Syncing..." : "Sync Now"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
