import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

// Since Batch F1 an ID check decision notifies the member from the database
// (the notify_id_verification_decision trigger on manual_id_verifications):
// the in-app row, the push, and the email through send-notification-email
// (type id_verification_rejected). This function sends nothing any more. It
// stays deployed so older app versions that still call it after rejecting a
// check get a quiet 200 instead of an error, and can't send a second notice.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  console.log(JSON.stringify({ fn: "notify-id-rejected", skipped: "moved_to_database" }));
  return new Response(JSON.stringify({ skipped: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
