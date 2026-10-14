import { useEffect, useRef, useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ShieldCheck, CheckCircle2, AlertCircle, ArrowLeft, Upload, Clock } from "lucide-react";
import { HelpTooltip } from "@/components/ui/HelpTooltip";
import { useVerification } from "@/hooks/useVerification";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useIdDrafts } from "@/hooks/useIdDrafts";
import { useIdVerificationRequest } from "@/hooks/useIdVerificationRequest";
import IdDocumentPicker from "@/components/verify/IdDocumentPicker";

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

  // Manual ID review: each file is saved the moment it's picked.
  const idDrafts = useIdDrafts(user?.id);
  const [manualUploading, setManualUploading] = useState(false);
  const [manualSubmitted, setManualSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const { data: pendingRequest } = useIdVerificationRequest();
  const hasPending = pendingRequest?.status === "pending";

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


    try {
      const instance = window.Onfido.init({
        token: sdkToken,
        containerId: "onfido-mount",
        steps: ["welcome", "document", "face", "complete"],
        onComplete: async (data: unknown) => {
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
    const idPath = idDrafts.drafts.id?.path;
    const selfiePath = idDrafts.drafts.selfie?.path;
    if (!idPath || !selfiePath) {
      toast({ variant: "destructive", title: "Please add both your Photo ID and a selfie" });
      return;
    }
    setManualUploading(true);
    setSubmitError("");
    try {
      // A previous attempt can leave a pending row behind, so reuse it rather
      // than stacking duplicate submissions in the admin review queue. The
      // "Users can update own pending verifications" policy allows this while
      // the row is still pending; once an admin reviews it, a retry correctly
      // falls through to a fresh INSERT.
      const { data: existing, error: existingError } = await supabase
        .from("manual_id_verifications")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingError) throw existingError;

      if (existing) {
        const { error: updateError } = await supabase
          .from("manual_id_verifications")
          .update({ id_photo_path: idPath, selfie_path: selfiePath })
          .eq("id", existing.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from("manual_id_verifications")
          .insert({ user_id: user.id, id_photo_path: idPath, selfie_path: selfiePath });

        if (insertError) throw insertError;
      }

      setManualSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ["id-verification-request"] });
      toast({ title: "Submitted for review", description: "We'll notify you once reviewed, usually within 24-48 hours." });
    } catch (err) {
      console.error("ID submission failed", (err as { code?: string })?.code ?? "error");
      const msg = "That didn't send. Please check your connection and try again.";
      setSubmitError(msg);
      toast({ variant: "destructive", title: "Couldn't submit", description: msg });
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
      <main className="pt-20 pb-28 md:pb-12">
        <div className="container max-w-2xl mx-auto px-4">
          <Button variant="ghost" onClick={() => navigate(-1)} className="mb-6">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          <h1 className="sr-only">Verify your identity on NomadNest</h1>

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
                      {hasPending && (
                        <p className="rounded-2xl bg-muted p-3 text-sm text-muted-foreground">
                          We have your documents and are reviewing them. You can replace them below and send them again.
                        </p>
                      )}
                      {!idDrafts.loaded ? (
                        <div className="flex justify-center py-6">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading your documents" />
                        </div>
                      ) : (
                        <>
                          <IdDocumentPicker
                            title="Photo ID"
                            hint="Passport, driving licence or national ID. A photo or a PDF, up to 10MB."
                            takeLabel="Take a photo"
                            chooseLabel="Choose a file"
                            capture="environment"
                            chooseAccept="image/*,application/pdf"
                            draft={idDrafts.drafts.id}
                            saving={idDrafts.saving.id}
                            error={idDrafts.errors.id}
                            onPick={(file) => idDrafts.save("id", file)}
                            onRemove={() => idDrafts.remove("id")}
                          />
                          <IdDocumentPicker
                            title="Selfie"
                            hint="Hold your ID next to your face, or just look at the camera."
                            takeLabel="Take a selfie"
                            chooseLabel="Choose a photo"
                            capture="user"
                            chooseAccept="image/*"
                            draft={idDrafts.drafts.selfie}
                            saving={idDrafts.saving.selfie}
                            error={idDrafts.errors.selfie}
                            onPick={(file) => idDrafts.save("selfie", file)}
                            onRemove={() => idDrafts.remove("selfie")}
                          />
                        </>
                      )}
                      <p className="text-sm text-muted-foreground">
                        Photos are made smaller on your phone and their location data is removed before they're sent.
                      </p>
                      {submitError && (
                        <p className="text-sm text-destructive" role="alert">{submitError}</p>
                      )}

                      <Button
                        className="h-11 w-full"
                        onClick={handleManualSubmit}
                        disabled={manualUploading || idDrafts.saving.id || idDrafts.saving.selfie || !idDrafts.drafts.id || !idDrafts.drafts.selfie}
                      >
                        {manualUploading
                          ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending…</>
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
                <Button onClick={() => navigate("/settings/verification")}>Back to Settings</Button>
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
                <Button onClick={() => navigate("/settings/verification")}>Back to Settings</Button>
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
