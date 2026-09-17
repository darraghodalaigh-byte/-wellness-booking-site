# Soul to Sole — September 2026 release

## Public release

- Website: https://soultosolebylouise.com
- Coaching directions for Louise: https://soul-to-sole-by-louise.vercel.app/coaching-ideas.html
- Book page: https://soul-to-sole-by-louise.vercel.app/book.html
- Appointment diary: https://soul-to-sole-by-louise.vercel.app/booking.html

The coaching ideas page is excluded from search indexing and the main navigation. Anyone with its URL can view it. Favourites and notes are saved only on the visitor’s own device, when explicitly saved, and may be downloaded as a text file.

## What changed

The old long homepage has become separate home, reflexology, coaching, book, about, appointment and practical-information pages. The editorial visual system uses warm paper, deep green, plum and book-led navy/blue. It includes mobile navigation, natural scrolling, section reveals, gentle pointer interactions, responsive layouts and reduced-motion support.

Louise’s existing content, eight treatment IDs/prices in euros, supplied book cover, and social profiles are retained. Telephone contact was removed in the 17 September email-only update. Treatment descriptions now describe the experience without promising medical outcomes. The portrait is an AI-assisted cleanup of the supplied poster, with its surrounding lettering removed. The landscape is original generated scenery, not a claimed photograph of a real treatment location.

## Hosting arrangement

The public frontend is a separate Vercel project, `soul-to-sole-by-louise`, on the existing `darraghodalaigh-1802s-projects` team. Availability, booking and health requests are proxied to the original Render booking service at https://wellness-booking-site.onrender.com. The contact form runs as a Vercel function; another function filters the legacy public configuration to remove the withdrawn phone number and retain the confirmed Gmail contact. Practitioner login returns directly to Render. The new static release contains no appointment database, account credentials or private customer records.

This avoids restarting the original backend: its checked-in Render definition uses SQLite on a free service without a declared persistent disk. Publishing the redesign to the original branch could discard runtime-only appointments or settings. That backend was deliberately not redeployed. Real booking records were not changed during QA.

The existing free booking service may take time to wake. Published page content is included locally so the public website loads promptly. The appointment diary always loads live configuration and availability, with retry and enquiry-form fallbacks.

## Contact email correction — 17 September 2026

The confirmed contact is `soultosolebylouise@gmail.com`. All published contact links, privacy text and book enquiries use this address. The frontend explicitly keeps it when the legacy booking API supplies its old contact data. Source business settings, owner notification defaults and reply-to defaults have also been corrected for a future backend release.

The existing Render backend has not been redeployed or reconfigured. Its notification recipient/reply-to settings and any environment overrides still need correction using authenticated backend access, followed by an authorized delivery check. The SMTP sender is separate and has not been changed to an unverified Gmail sender. No test emails were sent.

## Book sales

The site has a dedicated book storefront with paperback, hardback and ebook selection. The supplied book launch date is 10 October 2026. No price, stock, retailer destination or payment account was supplied, so the current action is an enquiry form with the selected book edition included.

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

Run `node scripts/build-web-release.mjs` from the repository. It writes a standalone `web-release` folder with static pages and two Node.js functions, preserves its Vercel link, and includes the external booking API proxy configuration. Only current website imagery is published; source reference posters containing the old phone number are excluded. Then deploy from `web-release` using the existing linked project. Do not push the redesign directly onto the original Render production branch until the backend persistence issue has been addressed.

## Email-only enquiries — 17 September 2026

- Live form: https://soultosolebylouise.com/contact.html
- Homepage “Let’s talk” and service enquiry links now open this form.
- Name, reply email, topic, a short message and consent are collected. There is no telephone field in the enquiry form.
- Delivery recipient is fixed server-side to soultosolebylouise@gmail.com. The visitor’s email is the Reply-To address.
- Public telephone links, displayed numbers, fallback phone copy, and the phone property in published configuration are removed. The booking form selects email as its contact method. The existing appointment service still requires a customer phone number; that field remains until its separate backend contract can be changed safely.
- Enquiries use the free AgentMail integration resource “soul-to-sole-enquiries”, connected to this Vercel project. Sender: soul-to-sole-enquiries@agentmail.to. Secrets remain in Vercel environment configuration and an ignored local environment file; no credentials are included in the release or repository.
- Required production variables: AGENTMAIL_API_KEY and AGENTMAIL_INBOX_ID. The latter must be configured explicitly for any additional environment before enabling its form. The sending endpoint approves the custom domain, www and the stable Vercel domain; arbitrary preview origins are not enabled.
- The provider stores sent messages; Gmail holds the delivered copy. Public privacy text identifies the provider and US processing. No analytics or visitor data in localStorage were added.
- Success is shown only after provider acceptance. A rejection keeps the visitor’s text; an uncertain delivery prevents automatic retries. Browser double-click prevention and warm-instance duplicate suppression reduce accidental repeats. Server rate limits and deduplication are instance-local, not shared durable storage.

Verification: 19 contact-handler tests passed, covering validation, fixed recipient, malformed requests, provider failures, timeouts, duplicate clicks and rate limits. Mocked browser flows passed for success, definitive rejection and unknown delivery. Layouts passed at 320, 390, 768 and 1440 pixels; no browser errors or automated accessibility violations were reported. Live GET readiness, invalid POST rejection, filtered configuration, health and removed legacy artwork were checked. No live test email has been sent; actual inbox receipt remains to be confirmed with Louise. Existing appointment notification configuration on Render remains a separate outstanding item described above.

Deployment: dpl_6gupWbFdMQevKvpK5WmUfgmD9eKt.

## Louise’s feedback update — 17 September 2026

Sources reviewed: the six supplied WhatsApp screenshots, the 4 April 2017 Word document, the genuine CLARITY Coach certificate photograph supplied earlier, and the 17-second snow-globe video. The Word document was treated as historical content, with the current screenshots and Darragh’s instructions taking precedence.

Changes:
- Qualified nurse; more than three decades in healthcare, including over 20 years as a healthcare leader. The distinction is consistent across home, about and coaching pages. The biography includes the five healthcare roles from Louise’s document.
- Coaching now describes everyday life, change/career decisions and leadership/work, with a tailored introduction and agreed approach. Two short original testimonial excerpts are attributed to AnneMarie M and Eileen M. Dated fixed-duration programmes, retreats and mailing-list offers were not reinstated.
- A 17-second snow-globe clip is presented with native controls, no autoplay, a poster and a visible visual description. The exported version contains no audio track. Local inspection of the original found no intelligible speech, only extremely quiet background sound. The original source file is unchanged.
- CLARITY Coach certification by Jamie Smart in June 2017 is stated factually. The AI-restored certificate image is not presented as an exact scanned credential.
- Conversation links lead to the email enquiry form, including a reflexology topic preset. Louise’s phone number stays absent from the published site.
- Darragh confirmed payment details should be sent by email. A 50% deposit is now explained in the booking summary, FAQs, practical-information page, consent text and request confirmation. The summary calculates the deposit from the selected treatment price. A cancellation less than 24 hours before the appointment makes the booking deposit non-refundable. No additional refund or rescheduling promises have been invented, and no online payment processing was added.
- Shared editorial content is applied to the published snapshot and the Vercel configuration endpoint, so legacy Render content cannot restore the old biography, telephone or cancellation wording. Operational prices, service IDs, booking rules, availability and book links remain live.

Validation: six focused editorial/configuration tests passed, including stale-upstream protection and preservation of live operational data. Desktop booking QA verified the €22.50 deposit on a €45 treatment and the pending-deposit confirmation with a mocked local request. No live appointment, email or payment was created. The existing Render service needed a wake-up during local calendar testing; retry loaded its real availability successfully. Mobile coaching checks at 320, 390 and 768 pixels verified no horizontal overflow, a fully visible logo, readable new sections and working user-initiated video playback. The corrected biography remains after the live configuration response.

The existing Render appointment notification configuration remains the separate outstanding item documented above. The enquiry form delivery setup is unchanged; actual Gmail receipt has not yet been tested with an authorized real email.
