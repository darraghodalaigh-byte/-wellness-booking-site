# Louise’s private diary

Entry point: https://soultosolebylouise.com/admin (opens /diary.html on the same domain).
Username: `lodal01` (lowercase L). Use the password Darragh supplied privately. Passwords and database credentials are not stored in this repository.

## Using the diary

1. Open **Louise’s diary** in the website footer and sign in.
2. Under **Working hours**, choose working days, start/finish times and **Save working hours**. The hours apply to every selected day. Appointment spacing and advance notice are under the expandable section.
3. Under **Time off**, close a whole date or a time window. Removing time off reopens the time within the usual working hours. The diary prevents a closure from overlapping an existing active appointment.
4. Under **Bookings**, review requests and reply by email. A new request reserves its time and awaits confirmation. Send payment details for the 50% deposit, then confirm the appointment by email after receiving it. Changing a status updates the diary only; it does not send an email. Cancelling releases availability, and cancelled appointments cannot be reopened.
5. Under **Working hours → Treatments & sessions**, edit an existing offering or **Add a treatment or session**. Enter a name, length, whole-euro price and description, enable availability if ready, then save. New entries are drafts until saved. Turning an offering off prevents new bookings without removing existing appointments.
6. Sign out when finished, especially on a shared device.

Group courses still use the enquiry form. The diary supports one-to-one appointments; it does not claim to manage class capacity or multi-session course enrolments.

## Hosting and storage

The website, private diary and public booking endpoints run on Vercel. Neon stores the diary configuration, bookings, hashed sessions, notification state and rate limits on its free plan in London. Registration of the domain remains separate from website hosting. Louise does not need to sign into Vercel, Neon or Render for everyday diary management.

All eight existing treatments, prices, working hours and closures were copied from an authenticated backup of the original service. Initialization inserts missing configuration only and never overwrites a configured diary. Operational information comes from Postgres; approved public wording, contact information, name spelling and publication date remain protected by the editorial layer.

Every booking insertion, closure, status change and settings change uses the same transaction lock. Availability uses Europe/Dublin independently of the server timezone, including clock changes. Database failures produce an error rather than an empty diary or fictitious availability.

## Login and privacy

The owner password is a salted scrypt hash in sensitive Vercel production configuration. Sessions are represented by hashed tokens in Postgres, with a 12-hour lifetime. The browser cookie is host-only, Secure, HttpOnly and SameSite=Strict. Sign-in throttling is persisted across function instances. Diary responses are private/no-store and require authentication; writes also require an allowed website origin.

Appointment requests are saved before notification is attempted. AgentMail sends a notification to Louise’s approved Gmail address, with the customer’s email as reply-to. Email acceptance is tracked separately from the saved booking. An uncertain notification shows a warning in the diary; it does not remove the request or tell the customer that an unsaved booking succeeded. Exact request retries reuse the existing pending booking. No automatic customer confirmation is sent.

The public website contains no Louise phone number. The privacy page explains Vercel/Neon booking storage and AgentMail notification delivery.

## Verification

- Automated suite: 76 passed, zero failed; the separate Postgres integration suite is opt-in.
- Real disposable local PostgreSQL 18.6: all ten integration scenarios passed (11 tests including the parent). Checks cover persistence across connections, private login, simultaneous booking contention, retry deduplication, cancellation, notification failure, validation and closure/booking races. The isolated local schema was removed and server stopped.
- Remote database testing was limited to the legitimate diary setup and application checks. No production test schemas were created.
- Chosen owner credentials work on the live domain. Saved hours immediately changed customer availability; a day closure survived sign-out/re-entry and removed all public slots. Original hours and closures were restored afterward. All eight services and zero original bookings were preserved.
- Phone layouts passed at 320 and 390 pixels. The live authenticated diary had no horizontal overflow or console errors. Draft creation/removal and the empty booking state were checked.
- The custom domain, www address and stable Vercel address are healthy. Render is suspended and its old public backend no longer serves appointments.
- No real customer booking, email or payment was created during testing. Email-provider acceptance is covered by test responses; actual Gmail receipt was not exercised with a live test email.

## Release and recovery

The migration source is commit `fc4365d`. The final Vercel release is `dpl_mm8nK4K936P9Ppbhh7ZieKterkpr`. Live cutover results are recorded in RELEASE-NOTES.md.

The original service is `srv-d7hnk1v7f7vs738muli0` on Render. Its final authenticated backup is held outside this repository in the restricted local migration folder. Keep the old service suspended after migration: it uses obsolete credentials and filesystem storage. Do not resume or redeploy it as the booking source without deliberate reconciliation with the authoritative Neon diary. Do not promote pre-migration Vercel releases, which proxy bookings to that obsolete service.

Future releases: run the tests, run `node scripts/build-web-release.mjs`, and deploy from `web-release`. Required production configuration is DATABASE_URL, DIARY_USERNAME, DIARY_PASSWORD_HASH and the existing AgentMail credentials. Never commit or include these values in browser files.
