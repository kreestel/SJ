import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import type { Journey } from '../journey';

type Row={id:string;version:number;data:Journey};
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
const db=url&&key?createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}):null;
const directory=path.join(process.cwd(),'.local-data');
const filename=path.join(directory,'journeys.json');
let serial:Promise<unknown>=Promise.resolve();
function localOnly(){if(process.env.NODE_ENV==='production'&&!db) throw new Error('Production requires Supabase. Configure the environment before deploying.');}
async function localRead():Promise<Row[]>{localOnly();try{return JSON.parse(await readFile(filename,'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return [];throw error;}}
function lock<T>(fn:()=>Promise<T>):Promise<T>{const result=serial.then(fn,fn);serial=result.catch(()=>{});return result;}
async function localWrite(rows:Row[]){await mkdir(directory,{recursive:true});await writeFile(filename+'.tmp',JSON.stringify(rows));await rename(filename+'.tmp',filename);}
export function storageMode(){return db?'Supabase connected':'Local prototype';}
export async function insert(j:Journey){
  if(db){const {error}=await db.from('journey_documents').insert({id:j.id,data:j,version:0});if(error)throw error;return;}
  await lock(async()=>{const rows=await localRead();rows.push({id:j.id,data:j,version:0});await localWrite(rows);});
}
export async function find(field:'id'|'shareHash'|'ackHash',value:string):Promise<Journey|null>{
  if(db){const query=db.from('journey_documents').select('data');const {data,error}=await query.eq(field==='id'?'id':`data->>${field}`,value).maybeSingle();if(error)throw error;return data?.data??null;}
  return (await localRead()).find(row=>row.data[field]===value)?.data??null;
}
export async function mutate<T>(id:string,fn:(j:Journey)=>T):Promise<{journey:Journey;result:T}>{
  if(!db)return lock(async()=>{const rows=await localRead();const row=rows.find(r=>r.id===id);if(!row)throw new Error('Journey not found');const result=fn(row.data);row.version++;await localWrite(rows);return {journey:row.data,result};});
  for(let attempt=0;attempt<8;attempt++){
    const {data,error}=await db.from('journey_documents').select('*').eq('id',id).single();if(error)throw error;
    const row=data as Row;const result=fn(row.data);
    const updated=await db.from('journey_documents').update({data:row.data,version:row.version+1}).eq('id',id).eq('version',row.version).select('id');
    if(updated.error)throw updated.error;
    if(updated.data.length)return {journey:row.data,result};
  }
  throw new Error('Journey busy. Please retry.');
}
export async function allIds():Promise<string[]>{
  if(db){const {data,error}=await db.from('journey_documents').select('id').gt('data->>expiresAt',new Date().toISOString());if(error)throw error;return data.map(r=>r.id);}
  return (await localRead()).map(r=>r.id);
}
export async function cleanup(){
  const now=new Date().toISOString();
  if(db){const {error}=await db.from('journey_documents').delete().lt('data->>expiresAt',now);if(error)throw error;}
  else await lock(async()=>localWrite((await localRead()).filter(r=>r.data.expiresAt>now)));
}
