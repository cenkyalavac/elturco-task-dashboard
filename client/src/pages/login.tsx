import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest, getPublicApiBase } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Mail, Loader2, CheckCircle2 } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    try {
      const clientBaseUrl = window.location.href.split("#")[0].replace(/\/$/, "");
      const apiBaseUrl = getPublicApiBase();
      await apiRequest("POST", "/api/auth/magic-link", { email: email.trim(), clientBaseUrl, apiBaseUrl });
      setSent(true);
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message?.includes("404")
          ? "This email address is not registered."
          : "Failed to send email. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center mb-4">
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none" aria-label="ElTurco Dispatch">
              <path d="M6 8h20M6 14h14M6 20h8M22 18l4 4-4 4" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-foreground" data-testid="text-app-title">
            ElTurco Dispatch
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Task Management System</p>
        </div>

        <Card className="border border-border">
          <CardContent className="pt-6">
            {sent ? (
              <div className="text-center py-4" data-testid="text-email-sent">
                <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
                <p className="font-medium text-foreground mb-1">Login link sent</p>
                <p className="text-sm text-muted-foreground">
                  Check your inbox and click the link to sign in.
                </p>
                <Button
                  variant="ghost"
                  className="mt-4 text-sm"
                  onClick={() => { setSent(false); setEmail(""); }}
                  data-testid="button-try-again"
                >
                  Try a different email
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="email"
                      placeholder="ornek@eltur.co"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10"
                      required
                      data-testid="input-email"
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={sending || !email.trim()}
                  data-testid="button-send-magic-link"
                >
                  {sending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    "Send Login Link"
                  )}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  You'll receive a secure login link via email.
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
