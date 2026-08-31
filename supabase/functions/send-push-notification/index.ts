import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

interface RequestBody {
  user_id: string;
  payload: PushPayload;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!vapidPublicKey || !vapidPrivateKey) {
      console.error('VAPID keys not configured');
      throw new Error('VAPID keys not configured');
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Supabase credentials not configured');
      throw new Error('Supabase credentials not configured');
    }

    const { payload }: RequestBody = await req.json();

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // This endpoint is only used for the member's own "send a test push" button,
    // so the recipient is always the caller — never a user id from the body.
    // Otherwise anyone could push arbitrary notifications to any account.
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace('Bearer ', '').trim();
    const { data: caller, error: callerError } = await supabase.auth.getUser(jwt);
    if (callerError || !caller?.user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const user_id = caller.user.id;
    console.log('Sending push notification to user:', user_id, 'payload:', payload);

    // Get user's push subscriptions
    const { data: subscriptions, error: subError } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', user_id);

    // Query total unread message count for the recipient so sw.js can set the badge correctly
    const { data: userConvos } = await supabase
      .from('conversations')
      .select('id')
      .or(`owner_user_id.eq.${user_id},sitter_user_id.eq.${user_id}`);

    const convIds = (userConvos || []).map((c: { id: string }) => c.id);
    let unreadCount = 1; // default to at least 1 since we're sending a notification
    if (convIds.length > 0) {
      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .in('conversation_id', convIds)
        .neq('sender_user_id', user_id)
        .is('read_at', null);
      unreadCount = count || 1;
    }

    // Enrich payload with unread count for badge display in sw.js
    const enrichedPayload = { ...payload, unreadCount };

    if (subError) {
      console.error('Error fetching subscriptions:', subError);
      throw subError;
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log('No push subscriptions found for user:', user_id);
      return new Response(
        JSON.stringify({ success: true, message: 'No subscriptions found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${subscriptions.length} subscriptions for user`);

    // Configure web-push with VAPID details
    webpush.setVapidDetails(
      'mailto:hello@nomadnest.global',
      vapidPublicKey,
      vapidPrivateKey
    );

    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        };

        try {
          await webpush.sendNotification(
            pushSubscription,
            JSON.stringify(enrichedPayload)
          );
          console.log('Push notification sent successfully to endpoint:', sub.endpoint.substring(0, 50));
          return { success: true, endpoint: sub.endpoint };
        } catch (error) {
          const err = error as { statusCode?: number; message?: string };
          console.error('Error sending to endpoint:', sub.endpoint.substring(0, 50), err.message);
          
          // If subscription is no longer valid, delete it
          if (err.statusCode === 404 || err.statusCode === 410) {
            console.log('Removing invalid subscription:', sub.id);
            await supabase
              .from('push_subscriptions')
              .delete()
              .eq('id', sub.id);
          }
          
          return { success: false, endpoint: sub.endpoint, error: err.message };
        }
      })
    );

    const successCount = results.filter(
      (r) => r.status === 'fulfilled' && (r.value as { success: boolean }).success
    ).length;

    console.log(`Push notifications sent: ${successCount}/${subscriptions.length} successful`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        sent: successCount, 
        total: subscriptions.length 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in send-push-notification:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
