import 'fake-indexeddb/auto';
import { describe,it,expect,vi,afterEach } from 'vitest';
import { enqueue,pending,sync } from '../src/lib/offline';
afterEach(()=>{vi.unstubAllGlobals();});
describe('checkpoint location queue recovery',()=>{
  it('keeps locations after transport failure and removes only server-acknowledged IDs',async()=>{
    const id=crypto.randomUUID();const a=await enqueue(id,{type:'LOCATION_RECORDED',point:{lat:10,lng:76},accuracy:10});
    const b=await enqueue(id,{type:'LOCATION_RECORDED',point:{lat:10.01,lng:76},accuracy:10});
    vi.stubGlobal('navigator',{onLine:true});vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('offline')));
    await expect(sync(id)).rejects.toThrow('offline');expect(await pending(id)).toHaveLength(2);
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({accepted:[a.id],duplicates:[],rejected:[{id:b.id,reason:'Rejected for inspection'}]}))));
    await sync(id);const remaining=await pending(id);expect(remaining).toHaveLength(1);expect(remaining[0].id).toBe(b.id);expect(remaining[0].error).toBe('Rejected for inspection');
  });
  it('prioritizes SOS and keeps monotonically increasing local sequences',async()=>{
    const id=crypto.randomUUID();const point=await enqueue(id,{type:'LOCATION_RECORDED',point:{lat:10,lng:76}});const sos=await enqueue(id,{type:'SOS_TRIGGERED'});
    expect(sos.sequence).toBe(point.sequence+1);vi.stubGlobal('navigator',{onLine:true});
    const fetcher=vi.fn(async(_url:string,options:RequestInit)=>{const events=JSON.parse(options.body as string).events;expect(events[0].id).toBe(sos.id);return new Response(JSON.stringify({accepted:events.map((e:{id:string})=>e.id),duplicates:[],rejected:[]}));});vi.stubGlobal('fetch',fetcher);
    await sync(id);expect(await pending(id)).toHaveLength(0);
  });
});
