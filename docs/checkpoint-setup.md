# Checkpoints and contact notifications

The form now requires a confirmed start and destination. Select places on a map and give them names; typing a name alone does not search for an address. Up to five checkpoints can be added, edited, reordered, or removed. The map labels start S, checkpoints 1–5, and destination D. Lines indicate the planned order, not road navigation.

GPS records a checkpoint within 100 m using either one sample accurate to 25 m or two consecutive samples accurate to 100 m and no more than two minutes apart. Each checkpoint is recorded once, even after offline retries. Visits use actual recorded timestamps; delayed uploads are labelled. GPS can miss a checkpoint between samples. Checkpoints do not complete the journey, extend its deadline, or claim the traveller is safe.

## Enable notifications on Vercel

Run `node scripts/setup-push.mjs` locally once. This stores keys in `.env.local`, which is excluded from Git. Never commit this file or copy keys into `.env.example`.

In Vercel → Project → Settings → Environment Variables, copy the values from `.env.local`:

| Variable | Vercel type |
| --- | --- |
| NEXT_PUBLIC_VAPID_PUBLIC_KEY | Config |
| VAPID_PRIVATE_KEY | Secret |
| VAPID_SUBJECT | Config; use your main HTTPS app URL |

Redeploy after setting them. Keep the same key pair across deploys or contacts must resubscribe. Supabase's existing `journey_documents` JSON storage supports this change without a migration. Older journeys remain readable and have no checkpoints.

The contact opens the private link and taps **Enable journey notifications**. On iPhone/iPad (16.4+), add the app to the Home Screen and open the private journey link in that installed app before enabling. On supported Android/desktop browsers, approve notifications when prompted. Permission is requested only after a button tap. The contact can turn notifications off for an individual journey.

## What is delivered

Checkpoint Web Push can arrive with the contact page closed. The traveller app must remain open to capture GPS, and both devices need connectivity for delivery. Offline points are stored first and generate checkpoint events and pushes when uploaded. Lock-screen messages contain checkpoint numbers, not names or coordinates. Clicking opens the private link saved on that device; bearer tokens are not stored in notification payloads or server subscription records.

Subscriptions and delivery attempts are private server-only fields, removed with the journey after 24 hours by the existing cleanup job. Expired push endpoints are removed after a 404/410 provider response. Provider acceptance does not prove device receipt. A 60-second delivery lease prevents concurrent sends; retries use backoff. In the rare crash between provider acceptance and recording success, a retry can occur; a stable notification tag reduces duplicate display.

Delivery is attempted after traveller event uploads and retried on subsequent traveller/follower requests or the protected jobs endpoint. Pending retries stop when there are no further requests; configure an external scheduled caller to that endpoint for independent retries if needed. Existing database cron evaluates missed check-ins but does not dispatch Web Push. **This feature sends checkpoint, destination-reached, and explicit safe-arrival notifications; SOS and missed-check-in alerts still require the contact tracking page.** If keys are missing or permission is blocked, the UI explains the limitation instead of claiming notification delivery.

## Test on two devices

1. Create a demo route with at least two checkpoints; reorder one and confirm the final destination.
2. Open the private link on a contact device and enable notifications. Close the page.
3. Start the journey, tap **Visit [checkpoint]**, and check the contact's notification.
4. Reopen the link: the checkpoint should show its recorded time. Revisit it; no new checkpoint event should appear.
5. Disable the traveller's network, visit the next checkpoint, and verify it remains queued. Reconnect and check the delayed notification and progress entry.
6. Reach the destination: it must remain unconfirmed until the traveller taps **I'm safe**.
7. Test notification refusal and real GPS separately. Repeat the phone test over the production HTTPS domain, not a protected preview URL.
