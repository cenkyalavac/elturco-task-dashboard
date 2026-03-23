import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AuthVerifyPage() {
  const [, params] = useRoute("/auth/verify/:token");
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!params?.token) return;
    
    async function verify() {
      try {
        const res = await apiRequest("POST", "/api/auth/verify", { token: params!.token });
        const data = await res.json();
        login(data.token, data.user);
        setStatus("success");
        setTimeout(() => setLocation("/"), 1500);
      } catch (err: any) {
        setStatus("error");
        const msg = err.message || "";
        if (msg.includes("kullanıldı")) setErrorMsg("Bu link zaten kullanıldı.");
        else if (msg.includes("dolmuş")) setErrorMsg("Bu linkin süresi dolmuş.");
        else setErrorMsg("Geçersiz veya süresi dolmuş link.");
      }
    }
    verify();
  }, [params?.token]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center">
        {status === "verifying" && (
          <div data-testid="text-verifying">
            <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto mb-3" />
            <p className="text-foreground font-medium">Doğrulanıyor...</p>
          </div>
        )}
        {status === "success" && (
          <div data-testid="text-verified">
            <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
            <p className="text-foreground font-medium">Giriş başarılı</p>
            <p className="text-sm text-muted-foreground mt-1">Yönlendiriliyorsunuz...</p>
          </div>
        )}
        {status === "error" && (
          <div data-testid="text-verify-error">
            <XCircle className="w-10 h-10 text-destructive mx-auto mb-3" />
            <p className="text-foreground font-medium">{errorMsg}</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => setLocation("/login")}
              data-testid="button-back-to-login"
            >
              Giriş sayfasına dön
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
