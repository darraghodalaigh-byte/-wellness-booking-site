# Render Deployment Checklist (Live HTTPS + Custom Domain)

Use this exact flow to launch the booking site as a real HTTPS website.

## 1. Create accounts

1. Create a [GitHub](https://github.com/) account (if you do not already have one).
2. Create a [Render](https://render.com/) account and sign in with GitHub.

## 2. Push this project to GitHub

1. Create a new GitHub repository (for example: `wellness-booking-site`).
2. Upload this full folder to that repo (all files in this project root).
3. Confirm the repo contains `render.yaml`, `package.json`, `server/`, `public/`.

## 3. Deploy on Render (Blueprint)

1. In Render, click `New +` -> `Blueprint`.
2. Select your GitHub repo.
3. Render will detect `render.yaml` and show:
   - one web service: `wellness-booking-site`
   - one PostgreSQL database: `wellness-booking-db`
4. Click `Apply`.

## 4. Add required environment values

In Render -> `wellness-booking-site` -> `Environment`, set these values:

- `SMTP_HOST` = your SMTP server hostname
- `SMTP_PORT` = `587` (or your provider value)
- `SMTP_SECURE` = `false` (use `true` only if your provider requires SSL on port 465)
- `SMTP_USER` = your SMTP username
- `SMTP_PASS` = your SMTP password or app password
- `EMAIL_FROM` = sender address shown to clients (for example `Serene Balance Wellness <bookings@yourdomain.com>`)
- `EMAIL_REPLY_TO` = address replies should go to (for example `owner@yourdomain.com`)
- `BOOKING_NOTIFICATION_TO` = owner notification inbox (comma-separated if multiple)
- `ADMIN_USERNAME` = admin login username
- `ADMIN_PASSWORD` = strong admin login password

Then click `Save Changes` and `Manual Deploy` -> `Deploy latest commit`.

## 5. Connect your custom domain

1. In Render -> `wellness-booking-site` -> `Settings` -> `Custom Domains`.
2. Click `Add Custom Domain` and add:
   - `www.yourdomain.com`
   - (optional) `yourdomain.com` root/apex
3. Render shows required DNS records. Add those at your domain registrar DNS panel.

Typical records:

- For `www`:
  - Type: `CNAME`
  - Name/Host: `www`
  - Value/Target: `your-render-service.onrender.com`
- For root domain (`yourdomain.com`):
  - Type: `A` (or `ALIAS/ANAME` if your DNS supports it)
  - Name/Host: `@`
  - Value/Target: values shown by Render

4. Wait for DNS propagation (usually 5-30 minutes, can take up to 24-48 hours).
5. In Render, domain status changes to `Verified`.

## 6. HTTPS

Render automatically provisions and renews SSL certificates (Let's Encrypt) once DNS is correct.
No separate SSL purchase or setup is needed.

## 7. Verify live booking and email

1. Open `https://www.yourdomain.com`.
2. Submit a real test booking form with your own email.
3. Confirm:
   - booking success message appears
   - owner notification email arrives at `BOOKING_NOTIFICATION_TO`
   - client confirmation email arrives at the test client email
4. Open `https://www.yourdomain.com/api/health` and confirm `{"ok":true,...}` appears.

## 8. Final expected URL format

- Render default: `https://wellness-booking-site.onrender.com`
- Custom domain: `https://www.yourdomain.com`
- Optional root redirect/canonical: `https://yourdomain.com` -> `https://www.yourdomain.com`
