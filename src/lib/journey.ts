import { z } from 'zod';

export const pointSchema = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
export type Point = z.infer<typeof pointSchema>;
export const checkpointSchema = z.object({id:z.uuid(),name:z.string().trim().min(1).max(80),point:pointSchema});
export type Checkpoint = z.infer<typeof checkpointSchema>;
export const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  destination: z.string().trim().min(1).max(120),
  contactName: z.string().trim().min(1).max(60),
  start: pointSchema, end: pointSchema,
  startLabel: z.string().trim().min(1).max(120).optional(),
  checkpoints: z.array(checkpointSchema).max(5).refine(points=>new Set(points.map(p=>p.id)).size===points.length,'Checkpoint identifiers must be unique.').optional(),
  durationMinutes: z.number().min(1).max(720),
  graceSeconds: z.number().int().min(10).max(1800),
  responseSeconds: z.number().int().min(10).max(600),
  demo: z.boolean(),
});
export type CreateInput = z.infer<typeof createSchema>;
export const eventSchema = z.object({
  id: z.uuid(),
  type: z.enum(['LOCATION_RECORDED', 'SAFE_CONFIRMED', 'SOS_TRIGGERED', 'JOURNEY_CANCELLED']),
  occurredAt: z.string().datetime(),
  sequence: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  point: pointSchema.optional(),
  accuracy: z.number().min(0).max(100000).optional(),
}).superRefine((event, ctx) => {
  if (event.type === 'LOCATION_RECORDED' && !event.point) ctx.addIssue({code:'custom',message:'A location event needs coordinates.'});
});
export type ClientEvent = z.infer<typeof eventSchema>;
export type Status = 'DRAFT' | 'ACTIVE' | 'ARRIVAL_DETECTED' | 'GRACE_PERIOD' | 'CHECK_IN_DUE' | 'ESCALATED' | 'SOS' | 'COMPLETED' | 'CANCELLED';
export type JourneyEvent = {id:string; type:string; occurredAt:string; receivedAt:string; sequence:number; point?:Point; accuracy?:number; checkpointId?:string};
export type ContactSubscription = {id:string; endpoint:string; keys:{p256dh:string;auth:string}; since:string; delivery:Record<string,{state:'sending'|'sent'|'retry';leaseUntil:number;attempts:number}>};
export type Journey = CreateInput & {
  id: string; ownerHash: string; shareHash: string; ackHash: string;
  status: Status; createdAt: string; startedAt?: string; expectedAt?:string;
  expiresAt: string; completedAt?:string; escalatedAt?:string; acknowledgedAt?:string;
  events: JourneyEvent[];
  subscriptions?:ContactSubscription[];
};
export type PublicJourney = Omit<Journey, 'ownerHash'|'shareHash'|'ackHash'|'contactName'|'subscriptions'>;
export const isClosed = (j: Pick<Journey,'status'>) => ['COMPLETED','CANCELLED'].includes(j.status);
export function distance(a: Point, b:Point) {
  const rad = Math.PI/180;
  const x = Math.sin((b.lat-a.lat)*rad/2)**2 + Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin((b.lng-a.lng)*rad/2)**2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0,1-x)));
}
export function record(j:Journey, type:string, now:number) {
  j.events.push({id:crypto.randomUUID(),type,occurredAt:new Date(now).toISOString(),receivedAt:new Date(now).toISOString(),sequence:0});
}
export function evaluate(j:Journey, now:number) {
  if (!j.expectedAt || isClosed(j) || j.status === 'SOS' || j.status === 'ESCALATED') return;
  const eta = Date.parse(j.expectedAt);
  if (['ACTIVE','ARRIVAL_DETECTED'].includes(j.status) && now >= eta) { j.status='GRACE_PERIOD'; record(j,'ETA_MISSED',now); }
  if (j.status === 'GRACE_PERIOD' && now >= eta+j.graceSeconds*1000) { j.status='CHECK_IN_DUE'; record(j,'CHECK_IN_REQUESTED',now); }
  if (j.status === 'CHECK_IN_DUE' && now >= eta+(j.graceSeconds+j.responseSeconds)*1000) {
    j.status='ESCALATED'; j.escalatedAt=new Date(now).toISOString(); record(j,'ESCALATION_SENT',now);
  }
}
export function orderedLocations(j:Pick<Journey,'events'>) {
  return j.events.filter(e=>e.type==='LOCATION_RECORDED' && e.point).sort((a,b)=>Date.parse(a.occurredAt)-Date.parse(b.occurredAt)||a.sequence-b.sequence);
}
export function acceptEvents(j:Journey, events:ClientEvent[], now:number) {
  const result:{accepted:string[];duplicates:string[];rejected:{id:string;reason:string}[]}={accepted:[],duplicates:[],rejected:[]};
  evaluate(j,now);
  for (const e of events) {
    if (j.events.some(old=>old.id===e.id)) {result.duplicates.push(e.id);continue;}
    const at=Date.parse(e.occurredAt);
    let reason='';
    if (at > now+60000 || at < Date.parse(j.createdAt)-60000) reason='Event time is outside this journey.';
    else if (!j.startedAt || j.status==='DRAFT') reason='Start the journey first.';
    else if (isClosed(j) && !(e.type==='LOCATION_RECORDED' && at<=Date.parse(j.completedAt??'') && j.status==='COMPLETED')) reason='Journey is closed.';
    else if (j.events.length>=12000) reason='Journey event limit reached.';
    if (reason) {result.rejected.push({id:e.id,reason});continue;}
    j.events.push({...e,receivedAt:new Date(now).toISOString()});
    result.accepted.push(e.id);
    if(e.type==='SAFE_CONFIRMED') {j.status='COMPLETED';j.completedAt=new Date(now).toISOString();}
    if(e.type==='SOS_TRIGGERED') {j.status='SOS';j.escalatedAt=new Date(now).toISOString();j.acknowledgedAt=undefined;}
    if(e.type==='JOURNEY_CANCELLED') {j.status='CANCELLED';j.completedAt=new Date(now).toISOString();}
  }
  detectCheckpoints(j,now);
  if(j.status==='ACTIVE') {
    const points=orderedLocations(j).filter(e=>(e.accuracy??1000)<=100);
    const last=points.at(-1);
    const previous=points.at(-2);
    if(last?.point && distance(last.point,j.end)<=100 && ((last.accuracy??1000)<=25 || (previous?.point && distance(previous.point,j.end)<=100))) {
      j.status='ARRIVAL_DETECTED';record(j,'ARRIVAL_DETECTED',now);
    }
  }
  return result;
}
export function publicView(j:Journey):PublicJourney {
  // Explicit allowlist: never expose bearer hashes or contact details.
  return {id:j.id,name:j.name,destination:j.destination,start:j.start,end:j.end,startLabel:j.startLabel,checkpoints:j.checkpoints??[],durationMinutes:j.durationMinutes,graceSeconds:j.graceSeconds,responseSeconds:j.responseSeconds,demo:j.demo,status:j.status,createdAt:j.createdAt,startedAt:j.startedAt,expectedAt:j.expectedAt,expiresAt:j.expiresAt,completedAt:j.completedAt,escalatedAt:j.escalatedAt,acknowledgedAt:j.acknowledgedAt,events:j.events};
}
export function detectCheckpoints(j:Journey, now:number){
  if(j.status==='CANCELLED'||j.status==='DRAFT')return;
  const locations=orderedLocations(j);
  for(const checkpoint of j.checkpoints??[]){
    if(j.events.some(e=>e.type==='CHECKPOINT_REACHED'&&e.checkpointId===checkpoint.id))continue;
    const hit=locations.find((e,index)=>{
      if(!e.point||(e.accuracy??Infinity)>100||distance(e.point,checkpoint.point)>100)return false;
      if((e.accuracy??Infinity)<=25)return true;
      const previous=locations[index-1];
      return !!previous?.point&&(previous.accuracy??Infinity)<=100&&distance(previous.point,checkpoint.point)<=100&&Date.parse(e.occurredAt)-Date.parse(previous.occurredAt)<=120000;
    });
    if(hit)j.events.push({id:crypto.randomUUID(),type:'CHECKPOINT_REACHED',checkpointId:checkpoint.id,occurredAt:hit.occurredAt,sequence:hit.sequence,receivedAt:new Date(now).toISOString()});
  }
}
export const statusLabel:Record<Status,string>={DRAFT:'Ready when you are',ACTIVE:'On the way',ARRIVAL_DETECTED:'Time to check in',GRACE_PERIOD:'Past expected arrival',CHECK_IN_DUE:'Check-in needed',ESCALATED:'Check-in missed',SOS:'Help requested',COMPLETED:'Arrived safely',CANCELLED:'Journey cancelled'};
