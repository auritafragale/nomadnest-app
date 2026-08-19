import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Phone, Loader2, CheckCircle2, AlertTriangle, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// Read at build time — WhatsApp stays hidden until the env flag is set.
const WHATSAPP_ENABLED = import.meta.env.VITE_ENABLE_WHATSAPP_VERIFY === "true";

const RESEND_COOLDOWN_SECONDS = 60;

interface Props {
  phoneVerified: boolean;
  phoneNumber: string | null;
  onVerified: () => void;
}

type Step = "idle" | "entering" | "code_sent" | "verified";

export const PhoneVerification = ({ phoneVerified, phoneNumber, onVerified }: Props) => {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>(phoneVerified ? "verified" : "idle");
  const [phone, setPhone] = useState(phoneNumber ?? "");
  const [channel, setChannel] = useState<"sms" | "whatsapp">("sms");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [voipWarning, setVoipWarning] = useState(false);

  // Resend rate-limiting: countdown in seconds
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
  }, []);

  const startCooldown = () => {
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    cooldownRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(cooldownRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const sendCode = async (isResend = false) => {
    if (!phone.trim()) {
      toast({ variant: "destructive", title: "Enter a phone number first" });
      return;
    }

    setLoading(true);
    setVoipWarning(false);

    try {
      const { data, error } = await supabase.functions.invoke("verify-phone-start", {
        body: { phone_number: phone.trim(), channel },
      });

      if (error) throw error;

      if (data?.voip_warning) {
        setVoipWarning(true);
      }

      // The channel that actually delivered the code (may differ from the
      // requested channel if WhatsApp fell back to SMS).
      const delivered = (data?.delivered_channel ?? data?.channel ?? channel) as "sms" | "whatsapp";

      setStep("code_sent");
      startCooldown();

      toast({
        title: isResend ? "Code resent" : "Code sent",
        description:
          delivered !== channel
            ? `We couldn't reach WhatsApp, so we sent a text to ${phone.trim()} instead.`
            : `We sent a ${delivered === "whatsapp" ? "WhatsApp message" : "text"} to ${phone.trim()}.`,
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Could not send code",
        description: err.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const checkCode = async () => {
    if (!code.trim()) return;
    setLoading(true);

    try {
      const { error } = await supabase.functions.invoke("verify-phone-check", {
        body: { phone_number: phone.trim(), code: code.trim() },
      });

      if (error) throw error;

      setStep("verified");
      toast({ title: "Phone verified!", description: "Your number has been confirmed." });
      onVerified();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Invalid code",
        description: err.message ?? "Please check the code and try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  if (step === "verified") {
    return (
      <div className="flex items-center gap-3 py-2">
        <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
        <div>
          <p className="font-medium text-green-700 dark:text-green-400">Phone Verified</p>
          <p className="text-sm text-muted-foreground">{phoneNumber}</p>
        </div>
      </div>
    );
  }

  if (step === "idle") {
    return (
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-medium">Not Verified</p>
          <p className="text-sm text-muted-foreground">
            Add a verified phone number to build trust with the community.
          </p>
        </div>
        <Button variant="outline" onClick={() => setStep("entering")} className="flex-shrink-0">
          <Phone className="w-4 h-4 mr-2" />
          Add Phone
        </Button>
      </div>
    );
  }

  if (step === "entering") {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="phone_number">Phone number (with country code)</Label>
          <Input
            id="phone_number"
            type="tel"
            placeholder="+44 7700 900000"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        {WHATSAPP_ENABLED && (
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={channel === "sms" ? "default" : "outline"}
              onClick={() => setChannel("sms")}
            >
              SMS
            </Button>
            <Button
              type="button"
              size="sm"
              variant={channel === "whatsapp" ? "default" : "outline"}
              onClick={() => setChannel("whatsapp")}
            >
              <MessageSquare className="w-3 h-3 mr-1" />
              WhatsApp
            </Button>
          </div>
        )}

        <div className="flex gap-2">
          <Button onClick={() => sendCode(false)} disabled={loading || !phone.trim()}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send Code"}
          </Button>
          <Button variant="ghost" onClick={() => setStep("idle")}>Cancel</Button>
        </div>
      </div>
    );
  }

  // step === "code_sent"
  return (
    <div className="space-y-4">
      {voipWarning && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <p>
            This looks like a virtual number. Using your personal mobile is recommended for verification, but you can continue if this is correct.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="verify_code">6-digit code sent to {phone}</Label>
        <Input
          id="verify_code"
          type="text"
          inputMode="numeric"
          placeholder="123456"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        />
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button onClick={checkCode} disabled={loading || code.length < 4}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify"}
        </Button>
        <Button
          variant="outline"
          onClick={() => sendCode(true)}
          disabled={loading || resendCooldown > 0}
        >
          {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
        </Button>
        <Button variant="ghost" onClick={() => { setStep("entering"); setCode(""); setVoipWarning(false); }}>
          Change number
        </Button>
      </div>
    </div>
  );
};
