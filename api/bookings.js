import { createHash, randomUUID } from 'node:crypto';
import { getDiaryStore, readDiaryConfig, readDiaryBookings } from '../lib/diary-store.js';
import { allowedOrigin, readBody, validDate, validTime } from '../lib/diary-validation.js';
import { validateBookingInput } from '../server/validation.js';
import { checkBookingConflict } from '../server/scheduling.js';
const fail=(status,message,fieldErrors)=>Object.assign(new Error(message),{status,fieldErrors});
const hash=s=>createHash('sha256').update(s).digest('hex');
const FIELDS=new Set(['fullName','email','phone','serviceId','date','time','notes','preferredContactMethod','consentAccepted','website']);
const EMAIL=/^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
export function validateAppointment(body,services){
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!FIELDS.has(k)))throw fail(422,'Please check your appointment details.',{form:'Unexpected appointment details.'});
 for(const k of FIELDS)if(k!=='consentAccepted'&&body[k]!==undefined&&typeof body[k]!=='string')throw fail(422,'Please check your appointment details.',{form:'Invalid appointment details.'});
 const value={...body};for(const k of ['fullName','email','phone','serviceId','date','time','notes'])value[k]=String(body[k]||'').trim();
 value.email=value.email.toLowerCase();value.preferredContactMethod='email';
 const fieldErrors=validateBookingInput(value,{services}).errors;
 if(value.fullName.length>120||/[\p{Cc}\p{Cf}]/u.test(value.fullName))fieldErrors.fullName='Enter a name of up to 120 characters.';
 if(value.email.length>254||value.email.split('@')[0].length>64||!EMAIL.test(value.email)||/[\p{Cc}\p{Cf}]/u.test(value.email))fieldErrors.email='Enter one valid email address.';
 if(value.phone.length>20)fieldErrors.phone='Enter a valid phone number.';
 if(value.notes.length>3000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value.notes))fieldErrors.notes='Use up to 3,000 characters of ordinary text.';
 if(!validDate(value.date))fieldErrors.date='Choose a valid date.';
 if(!validTime(value.time))fieldErrors.time='Choose a valid time.';
 if(body.consentAccepted!==true)fieldErrors.consentAccepted='Please agree to being contacted about this appointment.';
 if(Object.keys(fieldErrors).length)throw fail(422,'Please check the appointment details.',fieldErrors);
 return value;
}
async function notifyOwner(booking,env,fetchImpl){
 if(!env.AGENTMAIL_API_KEY||!env.AGENTMAIL_INBOX_ID)return false;
 try{
  const response=await fetchImpl(`https://api.agentmail.to/v0/inboxes/${encodeURIComponent(env.AGENTMAIL_INBOX_ID)}/messages/send`,{
   method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{Authorization:`Bearer ${env.AGENTMAIL_API_KEY}`,'Content-Type':'application/json'},
   body:JSON.stringify({to:['soultosolebylouise@gmail.com'],reply_to:[booking.email],subject:`Soul to Sole — appointment request ${booking.bookingReference}`,
   text:`New appointment request — awaiting your confirmation\n\nReference: ${booking.bookingReference}\nName: ${booking.fullName}\nEmail: ${booking.email}\nTreatment: ${booking.serviceName}\nDate: ${booking.date}\nTime: ${booking.time} (Ireland)\nDuration: ${booking.durationMinutes} minutes\n\n${booking.notes||'No additional message.'}\n\nPlease reply by email with arrangements and payment details for the 50% deposit. This appointment is not confirmed until you have received the deposit and confirmed it by email.\n\nManage your diary: https://soultosolebylouise.com/admin`})});
  if(!response.ok)return false;
  const value=await response.json();return typeof value.message_id==='string'&&value.message_id.length>0;
 }catch{return false;}
}
export function createBookingHandler({store,env=process.env,fetchImpl=fetch,deliver=notifyOwner,now=()=>new Date()}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed.'});}
  if(!allowedOrigin(req.headers.origin||'',env))return res.status(403).json({error:'Please use the appointment form on Louise’s website.'});
  try{
   const body=await readBody(req);const db=store||getDiaryStore();
   const result=await db.transaction(async query=>{
    const config=await readDiaryConfig(query);const value=validateAppointment(body,config.services);
    const bookings=await readDiaryBookings(query);
    // A lost response can be retried without inserting a duplicate appointment.
    const duplicate=bookings.find(b=>b.status==='pending'&&b.date===value.date&&b.time===value.time&&b.serviceId===value.serviceId&&b.email===value.email&&b.fullName===value.fullName&&b.phone===value.phone&&b.notes===value.notes);
    if(duplicate)return {booking:duplicate,created:false};
    const ip=String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();
    for(const key of [`booking-ip:${hash(ip)}`,`booking-email:${hash(value.email)}`]){
     const limited=await query('SELECT count, expires_at FROM diary_limits WHERE key=$1',[key]);
     if(limited.rows[0]&&new Date(limited.rows[0].expires_at)>now()&&limited.rows[0].count>=5)throw fail(429,'Please wait before making another request, or email Louise.');
    }
    const conflict=checkBookingConflict({serviceId:value.serviceId,date:value.date,time:value.time,bookings,config,now:now()});
    if(conflict.conflict)throw fail(409,'That time is no longer available. Please choose another time.');
    const service=config.services.find(s=>s.id===value.serviceId);
    const booking={id:randomUUID(),bookingReference:`STS-${randomUUID().slice(0,8).toUpperCase()}`,fullName:value.fullName,email:value.email,phone:value.phone,serviceId:service.id,serviceName:service.name,durationMinutes:service.durationMinutes,date:value.date,time:value.time,notes:value.notes,status:'pending',createdAt:now().toISOString(),preferredContactMethod:'email',consentAccepted:true};
    await query('INSERT INTO diary_bookings(id,data) VALUES($1,$2::jsonb)',[booking.id,JSON.stringify(booking)]);
    await query('INSERT INTO diary_notifications(booking_id) VALUES($1)',[booking.id]);
    for(const key of [`booking-ip:${hash(ip)}`,`booking-email:${hash(value.email)}`])await query("INSERT INTO diary_limits(key,count,expires_at) VALUES($1,1,$2) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN diary_limits.expires_at<=$3 THEN 1 ELSE diary_limits.count+1 END, expires_at=CASE WHEN diary_limits.expires_at<=$3 THEN $2 ELSE diary_limits.expires_at END",[key,new Date(now().getTime()+900000),now()]);
    return {booking,created:true};
   });
   let notification='previously-recorded';
   if(result.created){
    try{
     const claimed=await db.query("UPDATE diary_notifications SET state='sending',updated_at=now() WHERE booking_id=$1 AND state='pending' RETURNING booking_id",[result.booking.id]);
     if(claimed.rowCount){
      notification=await deliver(result.booking,env,fetchImpl)?'accepted':'unconfirmed';
      await db.query('UPDATE diary_notifications SET state=$2,updated_at=now() WHERE booking_id=$1',[result.booking.id,notification]);
     }
    }catch{notification='unconfirmed';console.error('booking_notification_unconfirmed');}
   }
   const b=result.booking;
   return res.status(201).json({success:true,booking:{bookingReference:b.bookingReference,serviceName:b.serviceName,date:b.date,time:b.time,fullName:b.fullName},emailStatus:{status:notification}});
  }catch(error){
   if(!error.status)console.error('booking_request_failed');
   if(error.status===429)res.setHeader('Retry-After','900');
   return res.status(error.status||503).json({error:error.status?error.message:'Your request could not be confirmed. Please contact Louise before trying again.',...(error.fieldErrors?{fieldErrors:error.fieldErrors}:{})});
  }
 };
}
export default createBookingHandler();
