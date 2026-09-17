# Soul to Sole — September 2026 release

## Public release

- Website: https://soul-to-sole-by-louise.vercel.app
- Coaching directions for Louise: https://soul-to-sole-by-louise.vercel.app/coaching-ideas.html
- Book page: https://soul-to-sole-by-louise.vercel.app/book.html
- Appointment diary: https://soul-to-sole-by-louise.vercel.app/booking.html

The coaching ideas page is excluded from search indexing and the main navigation. Anyone with its URL can view it. Favourites and notes are saved only on the visitor’s own device, when explicitly saved, and may be downloaded as a text file.

## What changed

The old long homepage has become separate home, reflexology, coaching, book, about, appointment and practical-information pages. The editorial visual system uses warm paper, deep green, plum and book-led navy/blue. It includes mobile navigation, natural scrolling, section reveals, gentle pointer interactions, responsive layouts and reduced-motion support.

Louise’s existing content, eight treatment IDs/prices in euros, supplied book cover, social profiles and telephone number are retained. Treatment descriptions now describe the experience without promising medical outcomes. The portrait is an AI-assisted cleanup of the supplied poster, with its surrounding lettering removed. The landscape is original generated scenery, not a claimed photograph of a real treatment location.

## Hosting arrangement

The public frontend is a separate Vercel project, `soul-to-sole-by-louise`, on the existing `darraghodalaigh-1802s-projects` team. Its relative `/api/*` requests are proxied to the original Render booking service at https://wellness-booking-site.onrender.com. Practitioner login returns directly to Render. The new static release contains no appointment database, account credentials or private customer records.

This avoids restarting the original backend: its checked-in Render definition uses SQLite on a free service without a declared persistent disk. Publishing the redesign to the original branch could discard runtime-only appointments or settings. That backend was deliberately not redeployed. Real booking records were not changed during QA.

The existing free booking service may take time to wake. Published page content is included locally so the public website loads promptly. The appointment diary always loads live configuration and availability, with retry and telephone fallbacks.

## Contact email correction — 17 September 2026

The confirmed contact is `soultosolebylouise@gmail.com`. All published contact links, privacy text and book enquiries use this address. The frontend explicitly keeps it when the legacy booking API supplies its old contact data. Source business settings, owner notification defaults and reply-to defaults have also been corrected for a future backend release.

The existing Render backend has not been redeployed or reconfigured. Its notification recipient/reply-to settings and any environment overrides still need correction using authenticated backend access, followed by an authorized delivery check. The SMTP sender is separate and has not been changed to an unverified Gmail sender. No test emails were sent.

## Book sales

The site has a dedicated book storefront with paperback, hardback and ebook selection. The supplied book launch date is 10 October 2026. No price, stock, retailer destination or payment account was supplied, so the current action is an honest book enquiry through the existing configured email address.

The frontend supports the existing `book.amazonUrl` and `book.waitlistUrl` fields from `/api/public-config`. A supplied retailer link becomes the live book action, including preorders; edition and price are confirmed with the retailer. A supplied waitlist URL becomes an external signup action. Enquiries are never represented as completed orders or subscriptions.

To launch direct sales, Louise still needs to choose a seller/payment service, provide the real edition prices, delivery/returns information and actual purchase links. No funds were accepted or checkout credentials created.

## Verification

Independent browser passes covered 1440×1000 desktop, 390×844 phone and 320px width. All main page routes, images, internal anchors, menu keyboard behaviour, reduced motion, book format selection and coaching review interactions passed. Final automated accessibility scans on reviewed pages returned zero violations. Final screenshots are in `qa/final` locally.

A real local appointment was created in an isolated temporary database using console-only email mode, then verified unavailable on revisiting the calendar. Native validation, missing selections, service preselection, 90-day bounds, rapid navigation, availability retry and failed submission retention passed. No production bookings or outbound emails were used for tests. Live API health and public configuration were checked through the deployed proxy.

## Prepared backend improvements (not deployed to Render)

- Admin HTML escaping for untrusted appointment/customer text.
- PostgreSQL per-date transaction lock for simultaneous appointments; eight regression tests pass. Concurrency is exercised with a transaction simulator, not a live PostgreSQL instance.
- Nodemailer upgraded to 10.0.10; seven email paths and nine messages tested with stream-only transport, including three calendar attachments. Dependency audit reports zero vulnerabilities.

These source changes are ready for a later backend release after durable storage and a backup/migration path are confirmed. Existing backend limitations, including persistence and its timezone handling, remain on the original service.

## Rebuilding the public release

Use Node 22 for local development of the full Express app (Node 26 is incompatible with the existing SQLite dependency).

Run `node scripts/build-web-release.mjs` from the repository. It writes a standalone static `web-release` folder, preserves its Vercel link, and includes the external API proxy configuration. Then deploy from `web-release` using the existing linked project. Do not push the redesign directly onto the original Render production branch until the backend persistence issue has been addressed.
