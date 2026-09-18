import { z } from 'zod';
import type { Journey, JourneyEvent, ContactSubscription } from './journey';
export function allowedPushEndpoint(value:string){
  try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&(
    url.hostname==='fcm.googleapis.com'||url.hostname==='updates.push.services.mozilla.com'||url.hostname.endsWith('.push.services.mozilla.com')||url.hostname==='web.push.apple.com'||url.hostname.endsWith('.push.apple.com')||url.hostname.endsWith('.notify.windows.com'));
  }catch{return false;}
}
export const subscriptionSchema=z.object({endpoint:z.string().max(4096).refine(allowedPushEndpoint,'Unsupported push service.'),keys:z.object({p256dh:z.string().regex(/^[A-Za-z0-9_-]{87}$/),auth:z.string().regex(/^[A-Za-z0-9_-]{22}$/)})});
export function checkpointNotification(j:Journey,event:JourneyEvent){
  const index=(j.checkpoints??[]).findIndex(c=>c.id===event.checkpointId);
  const delayed=Date.parse(event.receivedAt)-Date.parse(event.occurredAt)>60000;
  // Avoid names and precise locations appearing on a locked phone.
  return {title:'SafeJourney checkpoint update',body:`Checkpoint ${index+1} of ${j.checkpoints?.length??0} reached.${delayed?' Synced after a delay.':''} Open your saved journey link for details.`,tag:`sj-${j.id}-${event.id}`,journeyId:j.id,occurredAt:event.occurredAt};
}
export function claimDeliveries(j:Journey,now:number){
  const claimed:{subscription:ContactSubscription;event:JourneyEvent}[]=[];
  if(j.status==='CANCELLED'||Date.parse(j.expiresAt)<=now)return claimed;
  for(const subscription of j.subscriptions??[]){
    for(const event of j.events.filter(e=>e.type==='CHECKPOINT_REACHED'&&Date.parse(e.receivedAt)>=Date.parse(subscription.since))){
      const delivery=subscription.delivery[event.id];
      if(delivery?.state==='sent'||(delivery?.leaseUntil??0)>now)continue;
      if(claimed.length>=10)return claimed;
      subscription.delivery[event.id]={state:'sending',leaseUntil:now+60000,attempts:(delivery?.attempts??0)+1};
      claimed.push({subscription:structuredClone(subscription),event});
    }
  }
  return claimed;
}
