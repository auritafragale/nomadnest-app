import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ShieldCheck, CheckCircle2, AlertCircle, ArrowLeft } from "lucide-react";
import { useVerification } from "@/hooks/useVerification";
import { useQueryClient } from "@tanstack/react-query";

declare global {
  interface Window {
    Onfido: {
      init: (config: Record<string, unknown>) => { tearDown: () => void };
    };
  }
}

const ONFIDO_SDK_URL = "https://assets.onfido.com/web-sdk-releases/14.30.0/onfido.min.js";
const ONFIDO_CSS_URL = "https://assets.onfido.com/web-sdk-releases/14.30.0/style.css";

type VerifyStep = "intro" | "loading_sdk" | "verifying" | "submitted" | "already_verified" | "error";

const VerifyIdentity = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: verificationData, isLoading: verificationLoading } = useVerification();
  const mountRef = useRef<HTMLDivElement>(null);
  const onfidoRef = useRef<{ tearDown: () => void } | null>(null);

  const [step, setStep] = useState<VerifyStep>("intro");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    return () => {
      onfidoRef.current?.tearDown();
    };
  }, []);

  useEffect(() => {
    if (!verificationLoading && verificationData?.id_verified) {
      setStep("already_verified");
    }
  }, [verificationData, verificationLoading]);

  if (loading || verificationLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  const loadSDK = (): Promise<void> =>
    new Promise((resolve, reject) => {
      if (window.Onfido) { resolve(); return; }

      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = ONFIDO_CSS_URL;
      document.head.appendChild(link);

      const script = document.createElement("script");
      script.src = ONFIDO_SDK_URL;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load Onfido SDK"));
      document.head.appendChild(script);
    });

  const handleStart = async () => {
    setStep("loading_sdk");
    try {
      await loadSDK();

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const res = await supabase.functions.invoke("onfido-create-applicant", {
        body: { mode: "create" },
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.error) throw new Error(res.error.message);
      const { sdk_token, applicant_id } = res.data as { sdk_token: string; applicant_id: string };

      setStep("verifying");

      await new Promise<void>((resolve) => setTimeout(resolve, 100));

      onfidoRef.current = window.Onfido.init({
        token: sdk_token,
        containerId: "onfido-mount",
        steps: ["welcome", "document", "face", "complete"],
        onComplete: async () => {
          onfidoRef.current?.tearDown();

          await supabase.functions.invoke("onfido-create-applicant", {
            body: { mode: "submit", applicant_id },
            headers: { Authorization: `Bearer ${token}` },
          });

          queryClient.invalidateQueries({ queryKey: ["verification"] });
          setStep("submitted");
        },
        onError: (err: Error) => {
          console.error("Onfido error:", err);
          setErrorMsg(err.message || "Verification failed");
          setStep("error");
        },
      });
    } catch (err: any) {
      setErrorMsg(err.message || "Something went wrong");
      setStep("error");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-20 pb-12">
        <div className="container max-w-2xl mx-auto px-4">
          <Button variant="ghost" onClick={() => navigate(-1)} className="mb-6">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          {step === "intro" && (
            <Card>
              <CardHeader className="text-center">
                <div className="flex justify-center mb-4">
                  <ShieldCheck className="w-14 h-14 text-primary" />
                </div>
                <CardTitle className="text-2xl">Verify Your Identity</CardTitle>
                <CardDescription className="text-base">
                  Build trust with the community by verifying your identity. Verified members get more applications and bookings.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  {[
                    "Takes about 5 minutes",
                    "You'll need a government-issued photo ID",
                    "A short selfie video to match your ID",
                    "Your data is handled securely by Onfido",
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-3 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
                <Button
                  className="w-full"
                  style={{ backgroundColor: "#E8735A", color: "white" }}
                  onClick={handleStart}
                >
                  Start Verification
                </Button>
              </CardContent>
            </Card>
          )}

          {step === "loading_sdk" && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground">Preparing verification...</p>
              </CardContent>
            </Card>
          )}

          {step === "verifying" && (
            <Card>
              <CardContent className="p-0">
                <div id="onfido-mount" ref={mountRef} className="min-h-[600px]" />
              </CardContent>
            </Card>
          )}

          {step === "submitted" && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <CheckCircle2 className="h-14 w-14 text-green-500 mb-4" />
                <h2 className="text-xl font-semibold mb-2">Verification Submitted</h2>
                <p className="text-muted-foreground max-w-sm mb-6">
                  Your documents are being reviewed. You'll receive an email once the check is complete, usually within a few minutes.
                </p>
                <Button onClick={() => navigate("/settings")}>Back to Settings</Button>
              </CardContent>
            </Card>
          )}

          {step === "already_verified" && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <ShieldCheck className="h-14 w-14 text-green-500 mb-4" />
                <h2 className="text-xl font-semibold mb-2">Identity Verified</h2>
                <p className="text-muted-foreground max-w-sm mb-6">
                  Your identity has already been verified. You have full access to all NomadNest features.
                </p>
                <Button onClick={() => navigate("/settings")}>Back to Settings</Button>
              </CardContent>
            </Card>
          )}

          {step === "error" && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <AlertCircle className="h-14 w-14 text-destructive mb-4" />
                <h2 className="text-xl font-semibold mb-2">Verification Failed</h2>
                <p className="text-muted-foreground max-w-sm mb-2">{errorMsg}</p>
                <p className="text-sm text-muted-foreground mb-6">Please try again or contact support.</p>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => navigate("/contact")}>Contact Support</Button>
                  <Button onClick={() => setStep("intro")}>Try Again</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
};

export default VerifyIdentity;
