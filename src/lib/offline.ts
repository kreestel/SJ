import { openDB } from 'idb';
import type { ClientEvent } from './journey';
export type QueuedEvent=ClientEvent & {journeyId:string;error?:string};
const db=()=>openDB('safejourney-v1',1,{upgrade(database){database.createObjectStore('events',{keyPath:'id'});database.createObjectStore('counters');}});
export async function enqueue(journeyId:string,input:Omit<ClientEvent,'id'|'occurredAt'|'sequence'>){
  const database=await db();const tx=database.transaction(['events','counters'],'readwrite');
  const sequence=((await tx.objectStore('counters').get(journeyId))??0)+1;
  const event:QueuedEvent={...input,journeyId,id:crypto.randomUUID(),occurredAt:new Date().toISOString(),sequence};
  await tx.objectStore('counters').put(sequence,journeyId);await tx.objectStore('events').put(event);await tx.done;return event;
}
export async function pending(journeyId:string):Promise<QueuedEvent[]>{return (await(await db()).getAll('events')).filter(e=>e.journeyId===journeyId);}
export function orderQueue(events:QueuedEvent[]){
  const priority:Record<string,number>={SOS_TRIGGERED:0,SAFE_CONFIRMED:1,JOURNEY_CANCELLED:2,LOCATION_RECORDED:3};
  return [...events].sort((a,b)=>priority[a.type]-priority[b.type]||Date.parse(a.occurredAt)-Date.parse(b.occurredAt)||a.sequence-b.sequence);
}
let active:Promise<void>|null=null;
export async function sync(journeyId:string){
  if(active)return active;
  active=(async()=>{
    while(navigator.onLine){
      const events=orderQueue((await pending(journeyId)).filter(e=>!e.error)).slice(0,50);if(!events.length)return;
      const response=await fetch(`/api/journeys/${journeyId}/events`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({events:events.map(({journeyId:_,error:__,...event})=>event)})});
      if(!response.ok)throw new Error('Updates are saved on this device. Waiting to sync.');
      const result=await response.json();const database=await db();const tx=database.transaction('events','readwrite');
      for(const id of [...result.accepted,...result.duplicates])await tx.store.delete(id);
      for(const rejection of result.rejected){const event=events.find(e=>e.id===rejection.id);if(event)await tx.store.put({...event,error:rejection.reason});}
      await tx.done;
      if(!result.accepted.length&&!result.duplicates.length&&!result.rejected.length)throw new Error('Server did not acknowledge these events.');
    }
  })().finally(()=>{active=null;});
  return active;
}
