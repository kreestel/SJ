'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { ArrowRight, MapPin, LocateFixed, ShieldCheck, Plus, ArrowUp, ArrowDown, Trash2, X } from 'lucide-react';
import { Shell } from './shell';
import { distance, type Point, type Checkpoint } from '@/lib/journey';
const JourneyMap=dynamic(()=>import('./map'),{ssr:false,loading:()=> <div className="map-loading">Loading your map…</div>});
type Place={name:string;point:Point};
const demoStart:Place={name:'Marine Drive, Kochi',point:{lat:9.9816,lng:76.2999}};
const demoEnd:Place={name:'Demo destination, Kochi',point:{lat:9.9925,lng:76.3044}};
export function CreateJourney(){
  const [demo,setDemo]=useState(false);
  const [start,setStart]=useState<Place|null>(null);
  const [end,setEnd]=useState<Place|null>(null);
  const [checkpoints,setCheckpoints]=useState<Checkpoint[]>([]);
  const [picker,setPicker]=useState<string|null>(null);
  const [candidate,setCandidate]=useState<Point|undefined>();
  const [label,setLabel]=useState('');
  const [locating,setLocating]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  function changeDemo(enabled:boolean){
    setDemo(enabled);setStart(enabled?demoStart:null);setEnd(enabled?demoEnd:null);setError('');
    setCheckpoints(enabled?[{id:crypto.randomUUID(),name:'Demo checkpoint',point:{lat:9.987,lng:76.302}}]:[]);
  }
  function openPicker(target:string){
    const place=target==='start'?start:target==='end'?end:checkpoints.find(c=>c.id===target);
    setPicker(target);setCandidate(place?.point);setLabel(place?.name??'');
  }
  function confirmPin(){
    if(!candidate||!label.trim()||!picker)return;
    const place={name:label.trim(),point:candidate};
    if(picker==='start')setStart(place);
    else if(picker==='end')setEnd(place);
    else if(picker==='new')setCheckpoints(current=>[...current,{...place,id:crypto.randomUUID()}]);
    else setCheckpoints(current=>current.map(c=>c.id===picker?{...c,...place}:c));
    setPicker(null);setError('');
  }
  function reorder(index:number,delta:number){setCheckpoints(current=>{const next=[...current];[next[index],next[index+delta]]=[next[index+delta],next[index]];return next;});}
  function locate(){
    setError('');if(!navigator.geolocation){setError('Location is unavailable. Choose your starting point on the map instead.');return;}
    setLocating(true);
    navigator.geolocation.getCurrentPosition(position=>{setStart({name:'My current location',point:{lat:position.coords.latitude,lng:position.coords.longitude}});setLocating(false);},()=>{setLocating(false);setError('Could not get your location. Allow location access or choose a starting pin on the map.');},{enableHighAccuracy:true,timeout:15000});
  }
  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();setError('');
    if(!start||!end){setError('Choose and confirm both your starting point and final destination.');return;}
    if(distance(start.point,end.point)<100){setError('Choose a destination at least 100 metres from your starting point.');return;}
    setBusy(true);
    try{
      const data=new FormData(event.currentTarget);
      const response=await fetch('/api/journeys',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:data.get('name'),destination:end.name,contactName:data.get('contact'),start:start.point,startLabel:start.name,end:end.point,checkpoints,durationMinutes:Number(data.get('duration')),graceSeconds:demo?20:Number(data.get('grace')),responseSeconds:demo?20:120,demo})});
      const result=await response.json();if(!response.ok)throw new Error(result.error);
      localStorage.setItem(`sj-share-${result.journey.id}`,result.sharePath);localStorage.setItem(`sj-journey-${result.journey.id}`,JSON.stringify(result.journey));localStorage.setItem('sj-active',result.journey.id);
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Cache the traveller document for offline reloads.
      window.location.assign(`/traveller/journey/${result.journey.id}`);
    }catch(e){setError(e instanceof Error?e.message:'Could not create your journey.');setBusy(false);}
  }
  const ready=!!start&&!!end;
  return <Shell active="journey" back><div className="page-heading compact"><div><div className="eyebrow">YOUR ROUTE, YOUR PEOPLE</div><h1>Where are you heading?</h1><p>Choose your destination. Add checkpoints for updates along the way.</p></div></div>
  <form className="mobile-journey-form" onSubmit={submit}>
    {process.env.NEXT_PUBLIC_DEMO_MODE==='true'&&<label className="demo-toggle"><input type="checkbox" checked={demo} onChange={e=>changeDemo(e.target.checked)}/><span><strong>Try a demo route</strong><small>Preselected locations and short timers. No real GPS.</small></span></label>}
    <section className="form-card"><h2 className="form-step-title">1. Plan your route</h2>
      <div className="place-row"><span className="place-number">S</span><div><strong>Starting point</strong><p>{start?.name??'Choose where your journey begins'}</p><div className="button-row"><button className="button secondary" type="button" onClick={locate} disabled={locating||demo}><LocateFixed size={16}/>{locating?'Locating…':'Use my location'}</button><button className="button secondary" type="button" onClick={()=>openPicker('start')}>{start?'Change pin':'Choose on map'}</button></div></div></div>
      {checkpoints.map((checkpoint,index)=><div className="place-row checkpoint-row" key={checkpoint.id}><span className="place-number stop">{index+1}</span><div><strong>Checkpoint {index+1}</strong><button type="button" className="place-edit" onClick={()=>openPicker(checkpoint.id)}>{checkpoint.name} · Edit</button><div className="checkpoint-tools"><button type="button" aria-label={`Move checkpoint ${index+1} earlier`} disabled={index===0} onClick={()=>reorder(index,-1)}><ArrowUp size={18}/></button><button type="button" aria-label={`Move checkpoint ${index+1} later`} disabled={index===checkpoints.length-1} onClick={()=>reorder(index,1)}><ArrowDown size={18}/></button><button type="button" aria-label={`Remove checkpoint ${index+1}`} onClick={()=>setCheckpoints(current=>current.filter(c=>c.id!==checkpoint.id))}><Trash2 size={18}/></button></div></div></div>)}
      <button className="button secondary add-checkpoint" type="button" disabled={checkpoints.length>=5} onClick={()=>openPicker('new')}><Plus size={17}/> Add checkpoint {checkpoints.length>0?`(${checkpoints.length}/5)`:''}</button>
      <div className="place-row destination-row"><span className="place-number destination"><MapPin size={19}/></span><div><strong>Final destination <span className="required-label">Required</span></strong><p>{end?.name??'Choose where you want to arrive'}</p><button className="button primary" type="button" onClick={()=>openPicker('end')}>{end?'Change destination':'Choose final destination'}<ArrowRight size={17}/></button></div></div>
      <p className="field-hint">Checkpoint visits update your contact after they sync. Only your final “I’m safe” confirmation completes the journey.</p>
      {start&&end&&<div className="route-review"><h3>Review your route</h3><JourneyMap start={start.point} end={end.point} checkpoints={checkpoints}/><p>{start.name} → {checkpoints.map(c=>`${c.name} → `).join('')}{end.name}</p></div>}
    </section>
    <section className="form-card"><h2 className="form-step-title">2. Choose your person</h2><div className="field-row"><label>Your name<input name="name" placeholder="e.g. Jamie" required maxLength={60} autoComplete="given-name"/></label><label>Trusted contact’s name<input name="contact" placeholder="e.g. Alex" required maxLength={60}/></label></div><p className="field-hint">Send them the private link after creating your journey. They can enable checkpoint notifications there—no account needed. Without notifications enabled, updates appear only in the tracking page.</p></section>
    <section className="form-card"><h2 className="form-step-title">3. Set your arrival time</h2><div className="field-row"><label>Expected journey time<select name="duration" key={String(demo)} defaultValue={demo?'2':'30'}>{demo&&<><option value="1">1 minute — demo</option><option value="2">2 minutes — demo</option></>}<option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">1 hour</option><option value="120">2 hours</option></select></label><label>Grace period<select name="grace" key={String(demo)} disabled={demo} defaultValue={demo?'20':'300'}>{demo?<option value="20">20 seconds — demo</option>:<><option value="60">1 minute</option><option value="300">5 minutes</option><option value="600">10 minutes</option></>}</select></label></div><p className="field-hint">Include time at your checkpoints. After the grace period you have {demo?'20 seconds':'2 minutes'} to check in before a missed-arrival alert. Passing checkpoints does not extend this deadline.</p></section>
    <div className="privacy-inline"><ShieldCheck size={18}/><span>Keep the traveller’s app open for GPS. Offline updates wait for a connection. Sharing expires after 24 hours and ends when you confirm safe arrival or cancel.</span></div>
    {error&&<div className="notice error" role="alert">{error}</div>}
    <div className="create-action"><span>{ready?`${checkpoints.length} checkpoint${checkpoints.length===1?'':'s'} · Destination confirmed`:'Confirm a starting point and destination'}</span><button className="button primary full" disabled={busy||!ready}>{busy?'Creating journey…':'Create journey & share'}<ArrowRight size={18}/></button></div>
  </form>
  {picker&&<div className="modal-backdrop"><div className="location-picker" role="dialog" aria-modal="true" aria-labelledby="pin-title"><div className="picker-heading"><h2 id="pin-title">{picker==='start'?'Starting point':picker==='end'?'Final destination':'Checkpoint'}</h2><button className="icon-button" aria-label="Close location picker" onClick={()=>setPicker(null)}><X size={22}/></button></div><p>Move and zoom the map, then tap your location.</p><JourneyMap start={candidate??start?.point??demoStart.point} picked={candidate} onPick={setCandidate}/><label>Location name<input value={label} onChange={e=>setLabel(e.target.value)} placeholder="e.g. Central station, north entrance" maxLength={80}/></label><p className="pin-confirmation" role="status">{candidate?`Pin selected: ${candidate.lat.toFixed(5)}, ${candidate.lng.toFixed(5)}`:'No pin selected yet. Tap the map to choose one.'}</p><button className="button primary full" disabled={!candidate||!label.trim()} onClick={confirmPin}>Confirm this location <MapPin size={17}/></button></div></div>}
  </Shell>;
}
