/**
 * When the Dashboard shows "Turn on notifications on this device": only once
 * the check has finished, never when this device is already set up, never
 * when the member blocked notifications in the browser (Settings explains
 * how to allow them), never after they dismissed it on this device, and
 * never in the store apps (they don't have push set up yet).
 */
export const shouldShowPushBar = (s: {
  supported: boolean;
  loading: boolean;
  subscribed: boolean;
  permission: NotificationPermission;
  dismissed: boolean;
  signedIn: boolean;
  storeApp: boolean;
}) => s.signedIn && s.supported && !s.storeApp && !s.loading && !s.subscribed && s.permission !== "denied" && !s.dismissed;

export const PUSH_BAR_TEXT = "Turn on notifications on this device to get instant alerts for new messages, applications and invitations";
