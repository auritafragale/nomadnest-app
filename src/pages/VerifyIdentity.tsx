import { useEffect, useRef, useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ShieldCheck, CheckCircle2, AlertCircle, ArrowLeft, Upload, Clock } from "lucide-react";
import { Label } from "@/components/ui/label";
import { HelpTooltip } from "@/components/ui/HelpTooltip";
import { useVerification } from "@/hooks/useVerification";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

declare global {
  interface Window {
    Onfido: {
      init: (config: Record<string, unknown>) => { tearDown: () => void };
    };
  }
}

const ONFIDO_ENABLED = false;
const ONFIDO_JS_URL = "https://assets.onfido.com/web-sdk-releases/8.0.0/onfido.min.js";
const ONFIDO_CSS_URL = "https://assets.onfido.com/web-sdk-releases/8.0.0/style.css";

type VerifyStep = "intro" | "loading_sdk" | "verifying" | "submitted" | "already_verified" | "error";

const loadOnfidoSDK = (): Promise<void> =>
  new Promise((resolve, reject) => {
    if (window.Onfido) {
      console.log("[Onfido] SDK already loaded");
      resolve();
      return;
    }

    // Load CSS
    if (!document.querySelector(`link[href="${ONFIDO_CSS_URL}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = ONFIDO_CSS_URL;
      document.head.appendChild(link);
    }

    // Load JS
    if (document.querySelector(`script[src="${ONFIDO_JS_URL}"]`)) {
      // Script tag exists but window.Onfido not set yet — wait for it
      const poll = setInterval(() => {
        if (window.Onfido) {
          clearInterval(poll);
          console.log("[Onfido] SDK became available");
          resolve();
        }
      }, 50);
      setTimeout(() => { clearInterval(poll); reject(new Error("Onfido SDK load timeout")); }, 10000);
      return;
    }

    console.log("[Onfido] Loading SDK from", ONFIDO_JS_URL);
    const script = document.createElement("script");
    script.src = ONFIDO_JS_URL;
    script.crossOrigin = "anonymous";
    script.onload = () => {
      console.log("[Onfido] Script onload fired, window.Onfido:", !!window.Onfido);
      if (window.Onfido) {
        resolve();
      } else {
        // Some builds attach asynchronously — poll briefly
        let tries = 0;
        const poll = setInterval(() => {
          tries++;
          if (window.Onfido) { clearInterval(poll); resolve(); }
          else if (tries > 20) { clearInterval(poll); reject(new Error("Onfido global not set after script load")); }
        }, 50);
      }
    };
    script.onerror = (e) => {
      console.error("[Onfido] Script failed to load:", e);
      reject(new Error(`Failed to load Onfido SDK from CDN (${ONFIDO_JS_URL})`));
    };
    document.head.appendChild(script);
  });

const VerifyIdentity = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: verificationData, isLoading: verificationLoading } = useVerification();
  const onfidoRef = useRef<{ tearDown: () => void } | null>(null);

  const [step, setStep] = useState<VerifyStep>("intro");
  const [errorMsg, setErrorMsg] = useState("");
  const [sdkToken, setSdkToken] = useState("");
  const [applicantId, setApplicantId] = useState("");

  // Manual ID review state
  const [idFile, setIdFile] = useState<File | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [manualUploading, setManualUploading] = useState(false);
  const [manualSubmitted, setManualSubmitted] = useState(false);
  const idInputRef = useRef<HTMLInputElement>(null);
  const selfieInputRef = useRef<HTMLInputElement>(null);

  // Teardown on unmount
  useEffect(() => {
    return () => { onfidoRef.current?.tearDown(); };
  }, []);

  // Mark already-verified
  useEffect(() => {
    if (!verificationLoading && verificationData?.id_verified) {
      setStep("already_verified");
    }
  }, [verificationData, verificationLoading]);

  // Initialize Onfido AFTER the mount div is in the DOM (step === "verifying")
  useEffect(() => {
    if (step !== "verifying" || !sdkToken) return;

    const mountEl = document.getElementById("onfido-mount");
    if (!mountEl) {
      console.error("[Onfido] #onfido-mount element not found");
      setErrorMsg("Mount element missing — please try again");
      setStep("error");
      return;
    }

    if (!window.Onfido) {
      console.error("[Onfido] window.Onfido not available at init time");
      setErrorMsg("Onfido SDK not available — please try again");
      setStep("error");
      return;
    }

    console.log("[Onfido] Initializing SDK with token:", sdkToken.slice(0, 20) + "...");

    try {
      const instance = window.Onfido.init({
        token: sdkToken,
        containerId: "onfido-mount",
        steps: ["welcome", "document", "face", "complete"],
        onComplete: async (data: unknown) => {
          console.log("[Onfido] onComplete data:", data);
          instance.tearDown();
          onfidoRef.current = null;

          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData.session?.access_token;

          const res = await supabase.functions.invoke("onfido-create-applicant", {
            body: { mode: "submit", applicant_id: applicantId },
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          });

          if (res.error) {
            console.error("[Onfido] submit error:", res.error);
          } else {
            console.log("[Onfido] submit success:", res.data);
          }

          queryClient.invalidateQueries({ queryKey: ["verification"] });
          setStep("submitted");
        },
        onError: (err: unknown) => {
          const msg =
            err instanceof Error
              ? err.message
              : typeof err === "object" && err !== null && "message" in err
              ? String((err as { message: unknown }).message)
              : "Verification error";
          console.error("[Onfido] onError:", err);
          setErrorMsg(msg);
          setStep("error");
        },
      });

      onfidoRef.current = instance;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to initialize Onfido";
      console.error("[Onfido] init threw:", err);
      setErrorMsg(msg);
      setStep("error");
    }
  }, [step, sdkToken, applicantId, queryClient]);

  if (loading || verificationLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  const handleManualSubmit = async () => {
    if (!idFile || !selfieFile) {
      toast({ variant: "destructive", title: "Please upload both files" });
      return;
    }
    setManualUploading(true);
    try {
      const uploadFile = async (file: File, name: string) => {
        const path = `${user.id}/${name}-${Date.now()}.${file.name.split(".").pop()}`;
        const { error } = await supabase.storage
          .from("id-verification-documents")
          .upload(path, file, { upsert: false });
        if (error) throw error;
        return path;
      };

      const [idPath, selfiePath] = await Promise.all([
        uploadFile(idFile, "id"),
        uploadFile(selfieFile, "selfie"),
      ]);

      const { error: insertError } = await supabase
        .from("manual_id_verifications")
        .insert({ user_id: user.id, id_photo_path: idPath, selfie_path: selfiePath });

      if (insertError) throw insertError;

      setManualSubmitted(true);
      toast({ title: "Submitted for review", description: "We'll notify you once reviewed, usually within 24-48 hours." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Upload failed", description: err.message });
    } finally {
      setManualUploading(false);
    }
  };

  const handleStart = async () => {
    setStep("loading_sdk");
    setErrorMsg("");

    try {
      // Step 1: load the SDK script
      await loadOnfidoSDK();
      console.log("[Onfido] SDK loaded successfully");

      // Step 2: get SDK token from edge function
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Not authenticated — please sign in again");

      console.log("[Onfido] Calling onfido-create-applicant (create)...");
      const res = await supabase.functions.invoke("onfido-create-applicant", {
        body: { mode: "create" },
        headers: { Authorization: `Bearer ${token}` },
      });

      console.log("[Onfido] Edge function response:", res);

      if (res.error) {
        throw new Error(`Edge function error: ${res.error.message}`);
      }

      const data = res.data as { sdk_token?: string; applicant_id?: string; error?: string };

      if (data?.error) {
        throw new Error(`API error: ${data.error}`);
      }

      if (!data?.sdk_token) {
        console.error("[Onfido] Unexpected response shape:", data);
        throw new Error("No SDK token in response — check ONFIDO_API_TOKEN secret");
      }

      console.log("[Onfido] Got sdk_token and applicant_id:", data.applicant_id);
      setSdkToken(data.sdk_token);
      setApplicantId(data.applicant_id || "");

      // Step 3: switch to verifying — useEffect will init the SDK once mount div is rendered
      setStep("verifying");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      console.error("[Onfido] handleStart error:", err);
      setErrorMsg(msg);
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
            <div className="space-y-6">
              {ONFIDO_ENABLED && (
                <Card className="opacity-60">
                  <CardHeader className="text-center">
                    <div className="flex justify-center mb-4">
                      <ShieldCheck className="w-14 h-14 text-muted-foreground" />
                    </div>
                    <CardTitle className="text-2xl">Automated ID Check</CardTitle>
                    <CardDescription className="text-base">
                      Powered by Onfido — temporarily paused.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-3">
                      {[
                        "Takes about 5 minutes",
                        "You'll need a government-issued photo ID",
                        "A short selfie photo to match your ID",
                        "Your data is handled securely by Onfido",
                      ].map((item) => (
                        <div key={item} className="flex items-center gap-3 text-sm text-muted-foreground">
                          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                    <Button className="w-full" disabled>
                      Temporarily Unavailable
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Manual review (active alternative) */}
              <Card>
                <CardHeader>
                  <div className="flex justify-center mb-4">
                    <Upload className="w-14 h-14 text-primary" />
                  </div>
                  <div className="flex items-center justify-center gap-1.5">
                    <CardTitle className="text-xl text-center">Verify Your Identity</CardTitle>
                    <HelpTooltip
                      align="center"
                      label="Why verify"
                      content="Verifying builds trust and adds an ID-verified badge to your profile, so families and nomads feel safer connecting with you."
                    />
                  </div>
                  <CardDescription className="text-center">
                    Upload a photo ID and a selfie. Our team reviews submissions within 24–48 hours.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {manualSubmitted ? (
                    <div className="flex flex-col items-center gap-3 py-6 text-center">
                      <Clock className="w-12 h-12 text-primary" />
                      <p className="font-semibold">Submitted — under review</p>
                      <p className="text-sm text-muted-foreground">
                        We'll notify you once a team member has reviewed your documents.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="id_photo">Photo ID (passport, driving licence, national ID)</Label>
                        <input
                          ref={idInputRef}
                          id="id_photo"
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                          className="hidden"
                          onChange={(e) => setIdFile(e.target.files?.[0] ?? null)}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          onClick={() => idInputRef.current?.click()}
                        >
                          <Upload className="w-4 h-4 mr-2" />
                          {idFile ? "Change Photo ID" : "Choose Photo ID"}
                        </Button>
                        {idFile && (
                          <p className="text-xs text-muted-foreground truncate">Selected: {idFile.name}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="selfie">Selfie (holding your ID or looking at camera)</Label>
                        <input
                          ref={selfieInputRef}
                          id="selfie"
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                          className="hidden"
                          onChange={(e) => setSelfieFile(e.target.files?.[0] ?? null)}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          onClick={() => selfieInputRef.current?.click()}
                        >
                          <Upload className="w-4 h-4 mr-2" />
                          {selfieFile ? "Change Selfie" : "Choose Selfie"}
                        </Button>
                        {selfieFile && (
                          <p className="text-xs text-muted-foreground truncate">Selected: {selfieFile.name}</p>
                        )}
                      </div>
                      <Button
                        className="w-full"
                        style={{ backgroundColor: "#E8735A", color: "white" }}
                        onClick={handleManualSubmit}
                        disabled={manualUploading || !idFile || !selfieFile}
                      >
                        {manualUploading
                          ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Uploading…</>
                          : <><Upload className="w-4 h-4 mr-2" />Submit for Review</>
                        }
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {step === "loading_sdk" && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground">Preparing verification...</p>
                <p className="text-xs text-muted-foreground mt-2">Loading secure verification SDK</p>
              </CardContent>
            </Card>
          )}

          {step === "verifying" && (
            <Card>
              <CardContent className="p-0">
                <div id="onfido-mount" className="min-h-[600px]" />
              </CardContent>
            </Card>
          )}

          {step === "submitted" && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <CheckCircle2 className="h-14 w-14 text-green-500 mb-4" />
                <h2 className="text-xl font-semibold mb-2">Verification Submitted</h2>
                <p className="text-muted-foreground max-w-sm mb-6">
                  Your documents are being reviewed. You'll receive a notification once the check is complete, usually within a few minutes.
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
                <p className="text-sm font-mono bg-muted rounded px-3 py-2 mb-4 text-left max-w-sm w-full break-all">
                  {errorMsg}
                </p>
                <p className="text-sm text-muted-foreground mb-6">
                  Check the browser console for more details.
                </p>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => navigate("/contact")}>
                    Contact Support
                  </Button>
                  <Button onClick={() => { setSdkToken(""); setStep("intro"); }}>
                    Try Again
                  </Button>
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
