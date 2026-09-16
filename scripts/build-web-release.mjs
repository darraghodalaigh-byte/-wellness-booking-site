import { mkdir, copyFile, cp, writeFile } from 'node:fs/promises';
import { BUSINESS_CONFIG } from '../config/business.config.js';
import { getPublicBusinessData } from '../server/scheduling.js';
const root = new URL('../', import.meta.url);
const out = new URL('../web-release/', import.meta.url);
await mkdir(out, {recursive:true});
const files=['index.html','reflexology.html','coaching.html','book.html','about.html','booking.html','privacy.html','coaching-ideas.html','site.css','site.js','booking.js','favicon.svg'];
for(const file of files) await copyFile(new URL(`public/${file}`,root),new URL(file,out));
await cp(new URL('public/assets/',root),new URL('assets/',out),{recursive:true});
const content = getPublicBusinessData(BUSINESS_CONFIG);
await writeFile(new URL('content.json',out),JSON.stringify(content));
await writeFile(new URL('content.json',new URL('public/',root)),JSON.stringify(content));
await writeFile(new URL('vercel.json',out),JSON.stringify({
  version:2,
  cleanUrls:false,
  rewrites:[{source:'/api/:path*',destination:'https://wellness-booking-site.onrender.com/api/:path*'}],
  redirects:[
    {source:'/admin',destination:'https://wellness-booking-site.onrender.com/admin',permanent:false},
    {source:'/admin-login.html',destination:'https://wellness-booking-site.onrender.com/admin-login.html',permanent:false},
    {source:'/admin.html',destination:'https://wellness-booking-site.onrender.com/admin.html',permanent:false}
  ],
  headers:[
    {source:'/(.*)',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},{key:'X-Frame-Options',value:'SAMEORIGIN'}]},
    {source:'/coaching-ideas.html',headers:[{key:'X-Robots-Tag',value:'noindex, nofollow'}]},
    {source:'/assets/(.*)',headers:[{key:'Cache-Control',value:'public, max-age=86400'}]}
  ]
},null,2));
await writeFile(new URL('robots.txt',out),'User-agent: *\nDisallow: /coaching-ideas.html\nDisallow: /admin\nDisallow: /api/\n');
console.log('Public web release built. API uses existing booking service; practitioner login returns to Render.');
