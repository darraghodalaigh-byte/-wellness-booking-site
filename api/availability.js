import { getDiaryStore, readDiaryConfig, readDiaryBookings } from '../lib/diary-store.js';
import { validDate } from '../lib/diary-validation.js';
import { buildSlotsForDate, generateCalendarSummary } from '../server/scheduling.js';
export function createAvailabilityHandler({store,now}={}) {
 return async (req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed.'});}
  const q=new URL(req.url,'https://soultosolebylouise.com').searchParams;
  const action=q.get('action')||req.url.split('?')[0].split('/').pop();const serviceId=q.get('serviceId');const date=q.get('date');const month=q.get('month');
  if(!serviceId||serviceId.length>80||!['slots','summary'].includes(action)||(action==='slots'&&!validDate(date))||(action==='summary'&&(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month||'')||!validDate(`${month}-01`))))return res.status(400).json({error:'Choose a valid service and date.'});
  try{
   const db=store||getDiaryStore();const [config,bookings]=await Promise.all([readDiaryConfig(db.query),readDiaryBookings(db.query)]);
   const args={serviceId,bookings,config,...(now?{now:now()}: {})};
   const value=action==='slots'?buildSlotsForDate({...args,date}):generateCalendarSummary({...args,month});
   if(value.error)return res.status(400).json({error:value.error});
   return res.status(200).json(value);
  }catch{console.error('availability_request_failed');return res.status(503).json({error:'Availability is temporarily unavailable. Please try again shortly.'});}
 };
}
export default createAvailabilityHandler();
