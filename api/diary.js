import { createDiaryAuth } from '../lib/diary-auth.js';
import { getDiaryStore, readDiaryConfig, readDiaryBookings, saveDiaryConfig } from '../lib/diary-store.js';
import { allowedOrigin, readBody, validateDiarySettings, validDate, validTime, keysOnly } from '../lib/diary-validation.js';
export { validateDiarySettings } from '../lib/diary-validation.js';
const METHODS = { session:'GET', login:'POST', logout:'POST', settings:'GET PUT', blocks:'POST DELETE', bookings:'GET', status:'PATCH' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = new Set(['pending','confirmed','completed','cancelled','no-show']);
const fail = (status,message) => Object.assign(new Error(message),{status});
const settingsView = c => ({business:{ownerEmail:c.business.ownerEmail},booking:c.booking,services:c.services});
const active = b => !['cancelled','completed','no-show'].includes(b.status);
const minutes = t => Number(t.slice(0,2))*60+Number(t.slice(3,5));
export function createDiaryHandler({store,auth,env=process.env}={}) {
 const secure=env.NODE_ENV==='production'||Boolean(env.VERCEL_ENV);
 const cookieName=secure?'__Host-louise_diary':'louise_diary';
 const cookie=(v,age)=>`${cookieName}=${v}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure?'; Secure':''}`;
 return async function diary(req,res) {
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('Vary','Cookie');
  try {
   const url=new URL(req.url,'https://soultosolebylouise.com');const route=url.searchParams.get('route')||'';const method=req.method||'GET';
   if(!Object.hasOwn(METHODS,route))throw fail(404,'Diary page not found.');
   if(!METHODS[route].split(' ').includes(method)){res.setHeader('Allow',METHODS[route].replaceAll(' ', ', '));throw fail(405,'This action is not supported.');}
   const origin=req.headers.origin||'';
   if((method!=='GET'||origin)&&!allowedOrigin(origin,env))throw fail(403,'Please open the diary on Louise’s website and try again.');
   const raw=String(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(`${cookieName}=`))?.slice(cookieName.length+1);
   const token=UUID.test(raw||'')?raw:'';
   if(route==='session'&&!token)return res.status(200).json({authenticated:false});
   if(!token&&!['login','logout'].includes(route))throw fail(401,'Please sign in to your diary.');
   const db=store||getDiaryStore();const account=auth||createDiaryAuth({query:db.query,env});
   if(route==='logout'){res.setHeader('Set-Cookie',cookie('',0));if(token)await account.logout(token);return res.status(200).json({success:true});}
   if(route==='session')return res.status(200).json({authenticated:await account.authenticate(token)});
   if(route!=='login'&&!await account.authenticate(token))throw fail(401,'Your session has ended. Please sign in again.');
   const body=['POST','PUT','PATCH'].includes(method)?await readBody(req):undefined;
   if(route==='login'){
    keysOnly(body,['username','password']);
    const session=await account.login({...body,ip:String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim()});
    res.setHeader('Set-Cookie',cookie(session,43200));return res.status(200).json({success:true});
   }
   if(route==='bookings')return res.status(200).json({items:await readDiaryBookings(db.query)});
   if(route==='settings'&&method==='GET')return res.status(200).json({settings:settingsView(await readDiaryConfig(db.query))});
   const result=await db.transaction(async query=>{
    if(route==='status'){
     const id=url.searchParams.get('id');keysOnly(body,['status']);
     if(!UUID.test(id||'')||!STATUSES.has(body.status))throw fail(400,'Choose a valid booking and status.');
     const {rows}=await query('SELECT data FROM diary_bookings WHERE id=$1 FOR UPDATE',[id]);const booking=rows[0]?.data;
     if(!booking)throw fail(404,'Booking not found.');
     if(booking.status==='cancelled'&&body.status!=='cancelled')throw fail(409,'Cancelled appointments cannot be reopened. Please make a new request.');
     booking.status=body.status;booking.updatedAt=new Date().toISOString();
     await query('UPDATE diary_bookings SET data=$2::jsonb WHERE id=$1',[id,JSON.stringify(booking)]);
     return {success:true,booking};
    }
    const config=await readDiaryConfig(query);
    if(route==='settings'){
     validateDiarySettings(body);
     config.booking={...config.booking,...body.booking,workingHours:{...config.booking.workingHours,...body.booking?.workingHours}};
     if(body.services)config.services=body.services;
     const bookings=await readDiaryBookings(query);const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Dublin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
     if(bookings.some(b=>active(b)&&b.date>=today&&(!config.booking.workingDays.includes(new Date(`${b.date}T12:00:00Z`).getUTCDay())||b.time<config.booking.workingHours.start||minutes(b.time)+b.durationMinutes>minutes(config.booking.workingHours.end))))throw fail(409,'These hours overlap an existing appointment. Please arrange that appointment before changing the hours.');
     await saveDiaryConfig(query,config);return {success:true,settings:settingsView(config)};
    }
    const block=method==='POST'?body:Object.fromEntries(['type','date','start','end'].map(k=>[k,url.searchParams.get(k)||'']));
    keysOnly(block,['type','date','start','end']);
    if(!['day','range'].includes(block.type)||!validDate(block.date))throw fail(400,'Choose a valid date and type of time off.');
    if(block.type==='range'&&(!validTime(block.start)||!validTime(block.end)||block.start>=block.end))throw fail(400,'The finish time must be later than the start time.');
    const rules=config.booking;
    if(method==='POST'){
     const bookings=await readDiaryBookings(query);
     if(bookings.some(b=>active(b)&&b.date===block.date&&(block.type==='day'||minutes(b.time)<minutes(block.end)&&minutes(b.time)+b.durationMinutes>minutes(block.start))))throw fail(409,'There is an appointment in that time. Please arrange it before adding time off.');
    }
    if(block.type==='day')rules.disabledDates=method==='POST'?[...new Set([...rules.disabledDates,block.date])].sort():rules.disabledDates.filter(d=>d!==block.date);
    else{
     const value=`${block.start}-${block.end}`;const ranges=rules.blockedTimeRangesByDate[block.date]||[];
     const next=method==='POST'?[...new Set([...ranges,value])].sort():ranges.filter(r=>r!==value);
     if(next.length)rules.blockedTimeRangesByDate[block.date]=next;else delete rules.blockedTimeRangesByDate[block.date];
    }
    await saveDiaryConfig(query,config);return {success:true,booking:rules};
   });
   return res.status(200).json(result);
  }catch(error){
   if(error.status===401)res.setHeader('Set-Cookie',cookie('',0));
   if(error.status===429)res.setHeader('Retry-After','900');
   if(!error.status)console.error('diary_request_failed');
   return res.status(error.status||503).json({error:error.status?error.message:'The diary is temporarily unavailable. Please try again shortly.'});
  }
 };
}
export default createDiaryHandler();
