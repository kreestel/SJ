import 'server-only';
import webpush from 'web-push';
import { claimDeliveries, checkpointNotification } from '../notifications';
import { find, mutate } from './store';
export function pushConfig(){
  const publicKey=process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey=process.env.VAPID_PRIVATE_KEY;
  const subject=process.env.VAPID_SUBJECT;
  return publicKey&&privateKey&&subject?{publicKey,privateKey,subject}:null;
}
export async function dispatchCheckpointNotifications(id:string){
  const config=pushConfig();if(!config)return;
  const snapshot=await find('id',id);
  if(!snapshot?.subscriptions?.length)return;
  const {journey,result:deliveries}=await mutate(id,j=>claimDeliveries(j,Date.now()));
  await Promise.all(deliveries.map(async({subscription,event})=>{
    let sent=false,expired=false;
    try{
      await webpush.sendNotification({endpoint:subscription.endpoint,keys:subscription.keys},JSON.stringify(checkpointNotification(journey,event)),{vapidDetails:config,TTL:Math.max(0,Math.min(3600,Math.floor((Date.parse(journey.expiresAt)-Date.now())/1000))),timeout:10000});
      sent=true;
    }catch(error){const status=(error as {statusCode?:number}).statusCode;expired=status===404||status===410;}
    await mutate(id,j=>{
      if(expired){j.subscriptions=j.subscriptions?.filter(s=>s.id!==subscription.id);return;}
      const sub=j.subscriptions?.find(s=>s.id===subscription.id);const delivery=sub?.delivery[event.id];
      if(delivery){delivery.state=sent?'sent':'retry';delivery.leaseUntil=sent?0:Date.now()+Math.min(300000,15000*2**Math.min(delivery.attempts,4));}
    });
  }));
}
