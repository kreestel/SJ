import { NextResponse } from 'next/server';
import { z } from 'zod';
import { acceptEvents, createSchema, evaluate, eventSchema, isClosed, publicView, record, type Journey } from '@/lib/journey';
import { allIds, cleanup, find, insert, mutate, storageMode } from '@/lib/server/store';
import { ApiError, equal, hash, owner, rateLimit, sameOrigin, token } from '@/lib/server/security';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{path:string[]}>};
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
async function body(request:Request){const text=await request.text();if(text.length>64000)throw new ApiError(413,'Request is too large.');return JSON.parse(text);}
async function accessible(field:'id'|'shareHash'|'ackHash',value:string){const j=await find(field,value);if(!j||Date.parse(j.expiresAt)<=Date.now()||j.status==='CANCELLED')throw new ApiError(404,'This journey link has expired or is unavailable.');return j;}
async function handle(request:Request,{params}:Context){
  const p=(await params).path;const method=request.method;const now=Date.now();
  if(method==='POST')sameOrigin(request);
  rateLimit(hash(request.headers.get('x-forwarded-for')?.split(',')[0]||'local'),300);
  if(p[0]==='health')return json({storage:storageMode(),demo:process.env.NEXT_PUBLIC_DEMO_MODE==='true'});
  if(p[0]==='jobs'&&p[1]==='evaluate-escalations'){
    const secret=process.env.JOB_SECRET;
    if(!secret||!equal(request.headers.get('authorization')||'',`Bearer ${secret}`))throw new ApiError(401,'Unauthorized');
    let evaluated=0;for(const id of await allIds()){await mutate(id,j=>evaluate(j,now));evaluated++;}await cleanup();return json({evaluated});
  }
  if(p[0]==='journeys'&&p.length===1&&method==='POST'){
    const input=createSchema.parse(await body(request));
    if(input.demo&&process.env.NEXT_PUBLIC_DEMO_MODE!=='true')throw new ApiError(400,'Demo mode is disabled.');
    if(!input.demo&&(input.durationMinutes<5||input.graceSeconds<60||input.responseSeconds<60))throw new ApiError(400,'Use at least five minutes for a real journey, with one-minute grace and response windows.');
    const ownerHash=(await owner(true))!;rateLimit(ownerHash,12);
    const share=token(),ack=token();const j:Journey={...input,id:crypto.randomUUID(),ownerHash,shareHash:hash(share),ackHash:hash(ack),status:'DRAFT',createdAt:new Date(now).toISOString(),expiresAt:new Date(now+86400000).toISOString(),events:[]};
    record(j,'JOURNEY_CREATED',now);await insert(j);
    // Acknowledgement capability lives in the fragment, never in a server access URL.
    return json({journey:publicView(j),sharePath:`/follow/${share}#ack=${ack}`},201);
  }
  if(p[0]==='journeys'&&p[1]){
    const j=await find('id',p[1]);if(!j||j.ownerHash!==await owner()||Date.parse(j.expiresAt)<=now)throw new ApiError(404,'Journey not found.');
    if(method==='GET'){
      const updated=await mutate(j.id,current=>evaluate(current,now));return json(publicView(updated.journey));
    }
    if(p[2]==='start'&&method==='POST'){
      const updated=await mutate(j.id,current=>{if(current.status!=='DRAFT')return;current.status='ACTIVE';current.startedAt=new Date(now).toISOString();current.expectedAt=new Date(now+current.durationMinutes*60000).toISOString();record(current,'JOURNEY_STARTED',now);});
      return json(publicView(updated.journey));
    }
    if(p[2]==='events'&&method==='POST'){
      const input=z.object({events:z.array(eventSchema).min(1).max(50)}).parse(await body(request));
      const updated=await mutate(j.id,current=>acceptEvents(current,input.events,now));return json({...updated.result,journey:publicView(updated.journey)});
    }
  }
  if(p[0]==='follow'&&p[1]&&method==='GET'){
    const j=await accessible('shareHash',hash(p[1]));const updated=await mutate(j.id,current=>evaluate(current,now));
    if(isClosed(updated.journey))return json({closed:true,name:j.name,status:updated.journey.status,completedAt:updated.journey.completedAt,expiresAt:j.expiresAt});
    return json(publicView(updated.journey));
  }
  if(p[0]==='escalation'&&p[1]&&method==='POST'){
    const j=await accessible('ackHash',hash(p[1]));const updated=await mutate(j.id,current=>{
      if(!['ESCALATED','SOS'].includes(current.status))throw new ApiError(409,'There is no active alert to acknowledge.');
      if(!current.acknowledgedAt){current.acknowledgedAt=new Date(now).toISOString();record(current,'ESCALATION_ACKNOWLEDGED',now);}
    });return json({acknowledgedAt:updated.journey.acknowledgedAt});
  }
  throw new ApiError(404,'Not found');
}
async function route(request:Request,context:Context){try{return await handle(request,context);}catch(error){
  if(error instanceof ApiError)return json({error:error.message},error.status);
  if(error instanceof z.ZodError)return json({error:error.issues[0]?.message||'Invalid input'},400);
  if(error instanceof SyntaxError)return json({error:'Invalid JSON'},400);
  console.error('SafeJourney request failed:',error instanceof Error?error.message:'Storage error');
  return json({error:'Unable to save or load this journey. Check the server connection and retry.'},503);
}}
export const GET=route;export const POST=route;
