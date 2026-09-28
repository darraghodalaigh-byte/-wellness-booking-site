# Louise’s private diary

Entry point: https://soultosolebylouise.com/admin (opens /diary.html on the same domain).

## Using the diary

1. Open **Louise’s diary** in the website footer.
2. Sign in with the existing diary username and password.
3. Under **Working hours**, select working days, choose start/finish times, and save. Those hours apply to all selected days. Appointment spacing and advance notice are under the expandable section.
4. Under **Time off**, close a whole date or a time window. Remove a closure to reopen that time within the usual working hours.
5. Under **Bookings**, review requests and reply by email. Status changes update the diary only: send confirmation, deposit instructions and cancellation messages separately. Confirm only after Louise has received the deposit and agreed the appointment.
6. Existing treatments can be edited or switched off under **Treatments & existing offerings**. Prices are euros. This interface does not create group courses, capacities or recurring course sessions.

Do not share the diary credentials with customers. Signing out removes the session and clears displayed booking details. The diary is excluded from search indexing; each data request also requires authentication.

## Access still required to complete the owner setup

The existing Render host has diary credentials configured. They are not available in this workspace or the connected Vercel project. Darragh has been asked to sign in to the Render account in the in-app browser, or confirm access to the existing diary credentials. No credentials were guessed, changed, printed or embedded in the website. A single empty login request confirmed configuration without authenticating.

Production owner login, a real availability-save check, and live booking export have not been completed. The interface and bridge can use the existing credentials; a new owner credential has not been issued. A Render sign-in is not itself the diary username/password.

## Existing host protection and remaining durability work

The Render service has not been restarted, redeployed or reconfigured, and no real bookings or availability settings were changed. The public customer calendar still uses the same original booking backend.

Before changing that host, export live appointments, settings and blocked times using authenticated access. The repository’s data/bookings.json is a legacy import source, not a live backup. Current source uses SQLite and filesystem settings on a Render free service; durable storage remains outstanding.

A database migration must make settings authoritative in the database, seed missing settings only, preserve dates as YYYY-MM-DD under the Postgres driver, and use consistent Europe/Dublin scheduling. Booking creation, reopening, blocks and availability changes need transactional conflict checks. Existing notification copy and recipients also need review against the email-only, pending-deposit process.

The new Vercel bridge forwards only allowlisted authenticated actions, rejects cross-origin writes and malformed settings, and uses a Secure/HttpOnly/SameSite=Strict host-only cookie. The legacy host still owns credentials and sessions. Sessions are lost if that host restarts. Login throttling in the bridge is a warm-instance safeguard, not distributed protection, and does not apply to direct requests to the legacy host. The cancellation preflight prevents reopening an already-cancelled appointment but is not an atomic cross-browser guarantee. The UI serializes its writes; the backend needs conditional status updates to close the remaining race.

## Validation

- 47 automated tests pass with `node --experimental-vm-modules --test --test-reporter=dot test/*.mjs` (14 new diary tests).
- Isolated browser fixture: signed in, saved 10:00–16:00 hours, blocked and reopened a day, and updated an example request to confirmed. The real scheduling module used the same fixture state: the closed day offered no slots, reopening restored slots, and the example existing appointment remained unavailable.
- Example HTML in a client name was rendered as text. No live email, booking or availability change was used for testing.
- Mobile checks passed at 320 and 390 pixels and 200% text. Simulated 503 responses retained drafts and paused writes until reload; simulated expired sessions hid private details and preserved unfinished availability entries.
- A successful authenticated production flow and persistence across a host restart remain unverified until owner access and backup are available.
