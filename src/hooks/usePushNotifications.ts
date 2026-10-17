import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer;
}

/** This device's subscription, saved for the member (replacing a stale row for the same endpoint). */
const saveSubscription = async (subscription: PushSubscription) => {
  const json = subscription.toJSON();
  // An RPC so it can atomically delete any stale row for this endpoint
  // (possibly owned by a different user) then insert for the current user.
  // A plain client-side upsert cannot cross user_id boundaries due to RLS.
  const { error } = await supabase.rpc('upsert_push_subscription', {
    p_endpoint: subscription.endpoint,
    p_p256dh: json.keys?.p256dh || '',
    p_auth: json.keys?.auth || '',
  });
  if (error) throw error;
};

/** The service worker, registering it if needed (`ready` alone never resolves without one). */
const getRegistration = async () => {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  await navigator.serviceWorker.register('/sw.js');
  return navigator.serviceWorker.ready;
};

let vapidKeyPromise: Promise<string | null> | null = null;
/** The VAPID public key, fetched once per page load. */
const getVapidKey = () => {
  vapidKeyPromise ??= supabase.functions
    .invoke('get-vapid-key')
    .then(({ data, error }) => (error ? null : ((data?.publicKey as string | undefined) ?? null)))
    .catch(() => null);
  return vapidKeyPromise;
};

export const usePushNotifications = () => {
  const { user } = useAuth();
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);

  // Check if push notifications are supported
  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    setIsSupported(supported);
    
    if (supported) {
      setPermission(Notification.permission);
    }
  }, []);

  // Fetch VAPID public key
  useEffect(() => {
    if (!isSupported) return;
    let live = true;
    void getVapidKey().then((key) => live && setVapidPublicKey(key));
    return () => {
      live = false;
    };
  }, [isSupported]);

  // Check this device. With permission already granted, keep it set up
  // quietly: re-save a renewed subscription (Chrome changes the endpoint
  // now and then), or subscribe again if the browser has none. No prompt is
  // shown for either, because permission was already given.
  useEffect(() => {
    let live = true;
    const checkSubscription = async () => {
      if (!isSupported || !user) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      const current = Notification.permission;
      setPermission(current);
      try {
        // Not allowed yet (or blocked): nothing to keep up to date here.
        if (current !== 'granted') {
          if (live) setIsSubscribed(false);
          return;
        }

        const registration = await getRegistration();
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          const key = await getVapidKey();
          if (!key) {
            if (live) setIsSubscribed(false);
            return;
          }
          subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
          await saveSubscription(subscription);
          if (live) setIsSubscribed(true);
          return;
        }

        const { data, error } = await supabase
          .from('push_subscriptions')
          .select('id')
          .eq('user_id', user.id)
          .eq('endpoint', subscription.endpoint)
          .maybeSingle();
        if (error) throw error;
        if (!data) await saveSubscription(subscription);
        if (live) setIsSubscribed(true);
      } catch (error) {
        console.error('Error checking push subscription:', error);
        if (live) setIsSubscribed(false);
      } finally {
        if (live) setIsLoading(false);
      }
    };

    void checkSubscription();
    return () => {
      live = false;
    };
  }, [isSupported, user]);

  // Register service worker
  const registerServiceWorker = useCallback(async () => {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service workers not supported');
    }

    const registration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    return registration;
  }, []);

  // Subscribe to push notifications
  const subscribe = useCallback(async () => {
    if (!user || !isSupported) {
      toast.error('Push notifications are not supported in your browser');
      return false;
    }

    if (!vapidPublicKey) {
      console.error('VAPID public key not available');
      toast.error('Push notifications are not configured');
      return false;
    }

    setIsLoading(true);

    try {
      // Request permission
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);

      if (permissionResult !== 'granted') {
        toast.error('Notification permission denied');
        return false;
      }

      // Register service worker
      const registration = await registerServiceWorker();

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      await saveSubscription(subscription);

      setIsSubscribed(true);
      toast.success('Push notifications enabled');
      return true;
    } catch (error) {
      console.error('Error subscribing to push:', error);
      toast.error('Failed to enable push notifications');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user, isSupported, vapidPublicKey, registerServiceWorker]);

  // Unsubscribe from push notifications
  const unsubscribe = useCallback(async () => {
    if (!user) return false;

    setIsLoading(true);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // Remove from database
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('user_id', user.id)
          .eq('endpoint', subscription.endpoint);

        // Unsubscribe from browser
        await subscription.unsubscribe();
      }

      setIsSubscribed(false);
      toast.success('Push notifications disabled');
      return true;
    } catch (error) {
      console.error('Error unsubscribing:', error);
      toast.error('Failed to disable push notifications');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  return {
    isSupported,
    isSubscribed,
    isLoading,
    permission,
    subscribe,
    unsubscribe,
  };
};
