import { applyPublicContent } from '../lib/public-content.js';
import { getDiaryStore, readDiaryConfig } from '../lib/diary-store.js';
import { getPublicBusinessData } from '../server/scheduling.js';
export function createPublicConfigHandler({store}={}) { return async function handler(req,res) {
 res.setHeader('Cache-Control','no-store');
 if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');return res.status(405).json({error:'Method not allowed.'});}
 try{
  const config=applyPublicContent(getPublicBusinessData(await readDiaryConfig((store||getDiaryStore()).query)));
  if(req.method==='HEAD')return res.status(200).end();
  return res.status(200).json(config);
 }catch{console.error('public_config_request_failed');return res.status(503).json({error:'The appointment configuration is temporarily unavailable.'});}
}; }
export default createPublicConfigHandler();
