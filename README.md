# Serene Balance Wellness Booking Site

Production-style single-page wellness website with a planner-style booking flow and backend email notifications.

## Features

- Premium one-page website with conversion-focused sections
- Services, benefits, testimonials, FAQs, trust/policy blocks
- Availability planner with:
  - month calendar view
  - slot availability/unavailability states
  - service duration handling
  - blocked periods and disabled dates
- Booking form with validation and consent
- Anti-double-booking checks on the server
- Email notifications to business owner on booking submission
- Editable admin-style config for business rules and services

## Tech Stack

- Frontend: Vanilla HTML/CSS/JS (SPA-style interactions)
- Backend: Node.js + Express
- Email: Nodemailer (SMTP or local console mode)
- Storage: SQLite (local) with PostgreSQL-compatible schema and repository layer

## Project Structure

```text
wellness-booking-site/
  config/
    business.config.js      # services, pricing, hours, booking rules, content
  data/
    bookings.json           # legacy source used for one-time migration
    bookings.sqlite         # SQLite database (auto-created)
  public/
    index.html              # one-page UI
    styles.css              # premium responsive styles
    app.js                  # planner + form logic
  server/
    index.js                # API and static hosting
    scheduling.js           # slot generation and anti-conflict logic
    validation.js           # booking input validation
    email.js                # booking email templates + transport logic
    db/
      client.js             # sqlite/postgres client adapter
      schema.js             # table creation + JSON migration bootstrap
      time.js               # shared time helpers
    repositories/
      bookingRepository.js  # booking/blocked/settings data access layer
  .env.example
  package.json
```

## Local Run

1. Install Node.js 18+.
2. Install dependencies:

```bash
npm install
```

3. Create env file:

```bash
cp .env.example .env
```

4. Start server:

```bash
npm run dev
```

5. Open:

- [http://localhost:8000](http://localhost:8000)

## Database Configuration

The app supports two storage backends:

- Local development (`DB_CLIENT=sqlite`):
  - Uses `SQLITE_PATH` (default: `data/bookings.sqlite`)
  - Creates schema automatically on startup
- Production (`DB_CLIENT=postgres`):
  - Uses `DATABASE_URL`
  - Runs the same repository API and schema bootstrap

On first startup with an empty DB, legacy records from `data/bookings.json` are imported automatically.

## Data Model

Tables:

- `bookings`
  - `id`, `reference`, `name`, `email`, `phone`, `service`
  - `date`, `start_time`, `end_time`, `duration`
  - `status`, `notes`, `first_time_client`, `created_at`
- `blocked_times`
  - `date`, `start_time`, `end_time`, `reason`
- `settings`
  - `key`, `value_json`, `updated_at`

Indexes include date/time and status lookups to keep slot and calendar queries fast.

## Email Notifications

The app supports two modes:

1. `EMAIL_MODE=console` (default local testing)
   - Booking emails are generated and printed to server logs.
   - Useful for development without SMTP credentials.

2. `EMAIL_MODE=smtp` (real delivery)
   - Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and optional `SMTP_SECURE`.
   - Set `BOOKING_NOTIFICATION_TO` to owner email(s), comma-separated.

When a booking is submitted, the backend sends a detailed HTML + text email including service, date/time, client details, notes, and booking reference.

## Admin Configuration (Business Usability)

Edit these in `config/business.config.js`:

- `services`: names, durations, pricing, benefits, descriptions
- `booking.workingDays`: open weekdays (0=Sun ... 6=Sat)
- `booking.workingHours`: start/end times
- `booking.bufferBetweenAppointmentsMinutes`
- `booking.disabledDates`
- `booking.blockedTimeRangesByDate`
- `booking.maxAdvanceBookingDays`
- `booking.minNoticeHours`
- business contact details and trust content

## Booking Logic

Server-side checks in `server/scheduling.js` and `server/index.js`:

- validates date window and working days
- builds slots per service duration and interval
- applies blocked periods and disabled days
- enforces min notice and max advance window
- prevents overlap with existing pending/confirmed bookings
- re-checks availability at submit time to prevent race-condition double-booking
- validates overlap in a DB transaction before insert to prevent double-booking under concurrent requests

## Live Deployment (Render + Custom Domain + HTTPS)

This repo is prepared for one-click Render Blueprint deployment using `render.yaml`.

Production stack:

1. Render Web Service (Node app)
2. Render PostgreSQL database
3. Custom domain connected in Render
4. HTTPS certificates auto-managed by Render

Use the full checklist in [`DEPLOY_RENDER.md`](DEPLOY_RENDER.md).

## Commercial Hardening Next Step

If you plan to go live with customer traffic, keep PostgreSQL enabled, add managed backups, and continue hardening authenticated admin tooling for booking/block management.
