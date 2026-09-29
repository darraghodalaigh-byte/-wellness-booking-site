import { getDiaryStore } from '../lib/diary-store.js';
export default async function health(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed.'});
 try{await getDiaryStore().query('SELECT 1');return res.status(200).json({ok:true});}
 catch{return res.status(503).json({ok:false});}
}
