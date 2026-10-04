# Push notifications

Moved from CLAUDE.md §4. Read only when the task touches push.

- One table `push_subscriptions` (user_id, business_id, platform, token / web-push subscription JSON, device info, last_seen_at).
- Android + iOS apps: Expo push token (FCM / APNs). Ask permission at a sensible moment (after a user action), handle "denied" gracefully on both. Web/PWA: Web Push with VAPID keys (public key in app config, private key in Edge Function secrets).
- `platform` values in the table: `android`, `ios`, `web`.
- iOS web push works **only when installed to home screen (iOS 16.4+)** — ask for permission only after a user action, never on page load, and show a clear message if not installed.
- All sending goes through one Edge Function (`send-push`) that routes by platform and removes dead subscriptions.
