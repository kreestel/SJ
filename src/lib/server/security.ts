import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { isAllowedOrigin } from '../request-origin';
export const token=()=>randomBytes(32).toString('base64url');
export const hash=(raw:string)=>createHash('sha256').update(raw).digest('hex');
export async function owner(create=false){
  const jar=await cookies();let value=jar.get('sj_session')?.value;
  if(!value&&create){value=token();jar.set('sj_session',value,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:86400*7});}
  return value?hash(value):null;
}
export function equal(a:string,b:string){const x=Buffer.from(a);const y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
export class ApiError extends Error{constructor(public status:number,message:string){super(message);}}
export function sameOrigin(request:Request){
  if(!isAllowedOrigin(request,process.env.NEXT_PUBLIC_APP_URL))throw new ApiError(403,'Request origin is not allowed.');
}
const requests=new Map<string,{count:number;reset:number}>();
export function rateLimit(key:string,limit=120){
  const now=Date.now();const old=requests.get(key);const bucket=old&&old.reset>now?old:{count:0,reset:now+60000};
  bucket.count++;requests.set(key,bucket);
  if(requests.size>10000)for(const [k,v]of requests)if(v.reset<now)requests.delete(k);
  if(bucket.count>limit)throw new ApiError(429,'Too many requests. Please wait a minute.');
}
