import { mkdir, copyFile, cp, rm, writeFile } from "node:fs/promises";
import { BUSINESS_CONFIG } from "../config/business.config.js";
import { getPublicBusinessData } from "../server/scheduling.js";
const root = new URL("../", import.meta.url);
const out = new URL("../web-release/", import.meta.url);
await mkdir(out, { recursive: true });
const files = [
  "index.html",
  "reflexology.html",
  "coaching.html",
  "book.html",
  "about.html",
  "booking.html",
  "privacy.html",
  "coaching-ideas.html",
  "contact.html",
  "contact.js",
  "diary.html",
  "diary.css",
  "diary.js",
  "site.css",
  "site.js",
  "booking.js",
  "favicon.svg",
];
for (const file of files)
  await copyFile(new URL(`public/${file}`, root), new URL(file, out));
// Publish only the current website artwork; reference posters include old contact data.
await rm(new URL("assets/", out), { recursive: true, force: true });
for (const asset of [
  "brand/deeply-ok-cover.jpeg",
  "brand/deeply-ok-cover-fada.jpeg",
  "brand/deeply-ok-cover-fada.png",
  "brand/transformation-through-coaching-logo.png",
  "editorial/atlantic-morning.jpg",
  "editorial/louise-portrait.jpg",
  "media/clarity-snowglobe.mp4",
  "media/clarity-snowglobe-poster.jpg",
]) {
  await mkdir(new URL(`assets/${asset.split("/")[0]}/`, out), { recursive: true });
  await copyFile(new URL(`public/assets/${asset}`, root), new URL(`assets/${asset}`, out));
}
await cp(new URL("api/", root), new URL("api/", out), { recursive: true });
await cp(new URL("lib/", root), new URL("lib/", out), { recursive: true });
await writeFile(new URL("package.json", out), JSON.stringify({ private: true, type: "module", engines: { node: "22.x" } }, null, 2));
const content = getPublicBusinessData(BUSINESS_CONFIG);
delete content.business.phone;
await writeFile(new URL("content.json", out), JSON.stringify(content));
await writeFile(
  new URL("content.json", new URL("public/", root)),
  JSON.stringify(content),
);
await writeFile(
  new URL("vercel.json", out),
  JSON.stringify(
    {
      version: 2,
      cleanUrls: false,
      rewrites: [
        {
          source: "/api/availability/:path*",
          destination: "https://wellness-booking-site.onrender.com/api/availability/:path*",
        },
        {
          source: "/api/bookings",
          destination: "https://wellness-booking-site.onrender.com/api/bookings",
        },
        {
          source: "/api/health",
          destination: "https://wellness-booking-site.onrender.com/api/health",
        },
      ],
      functions: {
        "api/contact.js": { maxDuration: 30 },
        "api/public-config.js": { maxDuration: 60 },
        "api/diary.js": { maxDuration: 60 },
      },
      redirects: [
        {
          source: "/admin",
          destination: "/diary.html",
          permanent: false,
        },
        {
          source: "/admin-login.html",
          destination: "/diary.html",
          permanent: false,
        },
        {
          source: "/admin.html",
          destination: "/diary.html",
          permanent: false,
        },
      ],
      headers: [
        {
          source: "/(.*)",
          headers: [
            { key: "X-Content-Type-Options", value: "nosniff" },
            {
              key: "Referrer-Policy",
              value: "strict-origin-when-cross-origin",
            },
            { key: "X-Frame-Options", value: "SAMEORIGIN" },
          ],
        },
        {
          source: "/coaching-ideas.html",
          headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
        },
        {
          source: "/diary.html",
          headers: [
            { key: "X-Robots-Tag", value: "noindex, nofollow" },
            { key: "Cache-Control", value: "private, no-store" },
            { key: "Referrer-Policy", value: "no-referrer" },
          ],
        },
        {
          source: "/assets/(.*)",
          headers: [{ key: "Cache-Control", value: "public, max-age=86400" }],
        },
      ],
    },
    null,
    2,
  ),
);
await writeFile(
  new URL("robots.txt", out),
  "User-agent: *\nDisallow: /coaching-ideas.html\nDisallow: /diary.html\nDisallow: /admin\nDisallow: /api/\n",
);
console.log(
  "Public web release built. The private diary uses an authenticated bridge to the existing booking service.",
);
