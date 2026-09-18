import { describe,it,expect } from 'vitest';
import { acceptEvents,createSchema,publicView,type Journey,type ClientEvent } from '../src/lib/journey';
import { allowedPushEndpoint,claimDeliveries,checkpointNotification } from '../src/lib/notifications';
const now=Date.parse('2026-09-18T12:00:00Z');
const point={lat:10,lng:76};
function journey():Journey{return {id:crypto.randomUUID(),ownerHash:'owner',shareHash:'share',ackHash:'ack',name:'Private Name',contactName:'Contact',destination:'Home',start:{lat:9.98,lng:76},end:{lat:10.03,lng:76},durationMinutes:60,graceSeconds:300,responseSeconds:120,demo:true,status:'ACTIVE',createdAt:new Date(now-1000).toISOString(),startedAt:new Date(now).toISOString(),expectedAt:new Date(now+3600000).toISOString(),expiresAt:new Date(now+86400000).toISOString(),events:[],checkpoints:[{id:crypto.randomUUID(),name:'Private Address',point}]};}
function location(sequence=1,accuracy=10):ClientEvent{return {id:crypto.randomUUID(),type:'LOCATION_RECORDED',point,accuracy,sequence,occurredAt:new Date(now+sequence*1000).toISOString()};}
function subscriber(j:Journey){j.subscriptions=[{id:'device',endpoint:'https://fcm.googleapis.com/fcm/send/example',keys:{p256dh:'test',auth:'test'},since:new Date(now).toISOString(),delivery:{}}];}
describe('checkpoint progress',()=>{
  it('records one checkpoint without completing or changing the agreed ETA',()=>{const j=journey();const deadline=j.expectedAt;acceptEvents(j,[location()],now+2000);expect(j.events.filter(e=>e.type==='CHECKPOINT_REACHED')).toHaveLength(1);expect(j.status).toBe('ACTIVE');expect(j.expectedAt).toBe(deadline);});
  it('deduplicates retries and repeat visits',()=>{const j=journey();const event=location();acceptEvents(j,[event],now+2000);acceptEvents(j,[event,location(2)],now+3000);expect(j.events.filter(e=>e.type==='CHECKPOINT_REACHED')).toHaveLength(1);});
  it('requires two consecutive moderate-accuracy samples, and rejects poor accuracy',()=>{const j=journey();acceptEvents(j,[location(1,200)],now+2000);expect(j.events.some(e=>e.type==='CHECKPOINT_REACHED')).toBe(false);acceptEvents(j,[location(2,70)],now+3000);expect(j.events.some(e=>e.type==='CHECKPOINT_REACHED')).toBe(false);acceptEvents(j,[location(3,70)],now+4000);expect(j.events.filter(e=>e.type==='CHECKPOINT_REACHED')).toHaveLength(1);});
  it('recovers offline visits in their occurrence order',()=>{const j=journey();const a=location(1,70),b=location(2,70);acceptEvents(j,[b,a],now+180000);const event=j.events.find(e=>e.type==='CHECKPOINT_REACHED')!;expect(event.occurredAt).toBe(b.occurredAt);expect(event.receivedAt).toBe(new Date(now+180000).toISOString());expect(checkpointNotification(j,event).body).toContain('Synced after a delay');});
  it('does not interpolate a checkpoint between distant GPS samples',()=>{const j=journey();acceptEvents(j,[{...location(),point:j.start},{...location(2),point:j.end}],now+3000);expect(j.events.some(e=>e.type==='CHECKPOINT_REACHED')).toBe(false);});
  it('supports older journeys without checkpoints',()=>{const j=journey();delete j.checkpoints;acceptEvents(j,[location()],now+2000);expect(publicView(j).checkpoints).toEqual([]);});
  it('validates destinations, unique checkpoint IDs and the five-stop limit',()=>{const j=journey();expect(createSchema.safeParse({...j,end:undefined}).success).toBe(false);expect(createSchema.safeParse({...j,checkpoints:[j.checkpoints![0],j.checkpoints![0]]}).success).toBe(false);expect(createSchema.safeParse({...j,checkpoints:Array.from({length:6},()=>({...j.checkpoints![0],id:crypto.randomUUID()}))}).success).toBe(false);});
});
describe('checkpoint delivery',()=>{
  it('notifies arrival and explicit safety on a journey without checkpoints',()=>{
    const j=journey();j.checkpoints=[];subscriber(j);
    acceptEvents(j,[{...location(),point:j.end}],now+2000);
    const [arrival]=claimDeliveries(j,now+3000);
    expect(arrival.event.type).toBe('ARRIVAL_DETECTED');
    expect(checkpointNotification(j,arrival.event).body).toContain('not yet confirmed');
    acceptEvents(j,[{id:crypto.randomUUID(),type:'SAFE_CONFIRMED',sequence:2,occurredAt:new Date(now+4000).toISOString()}],now+5000);
    const tasks=claimDeliveries(j,now+6000);
    expect(tasks.map(t=>t.event.type)).toEqual(['SAFE_CONFIRMED']);
    expect(checkpointNotification(j,tasks[0].event).title).toContain('arrived safely');
  });
  it('records arrival after escalation without clearing the alert or duplicating arrival',()=>{
    const j=journey();j.status='ESCALATED';const event={...location(),point:j.end};
    acceptEvents(j,[event],now+2000);acceptEvents(j,[event],now+3000);
    expect(j.status).toBe('ESCALATED');expect(j.events.filter(e=>e.type==='ARRIVAL_DETECTED')).toHaveLength(1);
    expect(publicView(j).events.some(e=>e.type==='ARRIVAL_DETECTED')).toBe(true);
  });
  it('records arrival during grace and keeps the overdue deadline',()=>{
    const j=journey();j.status='GRACE_PERIOD';const deadline=j.expectedAt;
    acceptEvents(j,[{...location(),point:j.end}],now+2000);
    expect(j.status).toBe('GRACE_PERIOD');expect(j.expectedAt).toBe(deadline);
    expect(j.events.some(e=>e.type==='ARRIVAL_DETECTED')).toBe(true);
  });
  it('leases work to prevent concurrent sends and retries an expired lease',()=>{const j=journey();subscriber(j);acceptEvents(j,[location()],now+2000);expect(claimDeliveries(j,now+3000)).toHaveLength(1);expect(claimDeliveries(j,now+4000)).toHaveLength(0);expect(claimDeliveries(j,now+64000)).toHaveLength(1);});
  it('does not resend provider-accepted events or notify for visits before subscription',()=>{const j=journey();subscriber(j);acceptEvents(j,[location()],now+2000);const [task]=claimDeliveries(j,now+3000);j.subscriptions![0].delivery[task.event.id].state='sent';expect(claimDeliveries(j,now+99999)).toHaveLength(0);j.subscriptions![0].delivery={};j.subscriptions![0].since=new Date(now+10000).toISOString();expect(claimDeliveries(j,now+99999)).toHaveLength(0);});
  it('never exposes subscriptions, addresses, names, or bearer tokens in push payloads',()=>{const j=journey();subscriber(j);acceptEvents(j,[location()],now+2000);expect(publicView(j)).not.toHaveProperty('subscriptions');const text=JSON.stringify(checkpointNotification(j,j.events.find(e=>e.type==='CHECKPOINT_REACHED')!));expect(text).not.toContain('Private');expect(text).not.toContain('owner');expect(text).not.toContain('share');});
  it('rejects arbitrary endpoints and stops sending after cancellation or expiry',()=>{expect(allowedPushEndpoint('https://127.0.0.1/private')).toBe(false);expect(allowedPushEndpoint('https://fcm.googleapis.com.evil.test/')).toBe(false);expect(allowedPushEndpoint('http://fcm.googleapis.com/')).toBe(false);expect(allowedPushEndpoint('https://web.push.apple.com/example')).toBe(true);const j=journey();subscriber(j);acceptEvents(j,[location()],now+2000);j.status='CANCELLED';expect(claimDeliveries(j,now+3000)).toHaveLength(0);j.status='ACTIVE';expect(claimDeliveries(j,now+86400001)).toHaveLength(0);});
});
