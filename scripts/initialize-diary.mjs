import { readFile } from 'node:fs/promises';
import { BUSINESS_CONFIG } from '../config/business.config.js';
import { applyPublicContent } from '../lib/public-content.js';
import { createDiaryStore, DIARY_SCHEMA } from '../lib/diary-store.js';
const directory=process.argv[2];
if(!directory)throw new Error('Provide the private backup directory.');
const settings=JSON.parse(await readFile(`${directory}/settings.json`,'utf8')).settings;
const snapshot=JSON.parse(await readFile(`${directory}/public-config.json`,'utf8'));
const bookings=JSON.parse(await readFile(`${directory}/bookings.json`,'utf8')).items;
if(!settings?.booking||!Array.isArray(settings.services)||!Array.isArray(bookings))throw new Error('Invalid backup.');
const editorial=applyPublicContent(snapshot);
const config={...BUSINESS_CONFIG,business:{...BUSINESS_CONFIG.business,...editorial.business},book:{...BUSINESS_CONFIG.book,...editorial.book},booking:{...BUSINESS_CONFIG.booking,...settings.booking},services:settings.services,policies:editorial.policies,faq:editorial.faq};
delete config.business.phone;
const store=createDiaryStore();
try{
 await store.query(DIARY_SCHEMA);
 await store.transaction(async query=>{
  await query("INSERT INTO diary_config(id,data) VALUES('main',$1::jsonb) ON CONFLICT(id) DO NOTHING",[JSON.stringify(config)]);
  for(const booking of bookings)await query('INSERT INTO diary_bookings(id,data) VALUES($1,$2::jsonb) ON CONFLICT(id) DO NOTHING',[booking.id,JSON.stringify(booking)]);
 });
 const count=await store.query('SELECT count(*)::integer AS count FROM diary_bookings');
 console.log(JSON.stringify({initialized:true,bookings:count.rows[0].count,services:settings.services.length}));
}finally{await store.close();}
