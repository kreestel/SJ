'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { ArrowRight, MapPin, LocateFixed, ShieldCheck, Users, Clock3 } from 'lucide-react';
import { Shell } from './shell';
import type { Point } from '@/lib/journey';
const JourneyMap=dynamic(()=>import('./map'),{ssr:false,loading:()=> <div className="map-loading">Loading your map…</div>});
export function CreateJourney(){
  const [demo,setDemo]=useState(process.env.NEXT_PUBLIC_DEMO_MODE==='true');
  const [start,setStart]=useState<Point>({lat:9.9816,lng:76.2999});
  const [end,setEnd]=useState<Point>({lat:9.9925,lng:76.3044});
  const [located,setLocated]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  async function submit(event:React.FormEvent<HTMLFormElement>){event.preventDefault();setError('');setBusy(true);
    try{if(!demo&&!located)throw new Error('Use your current location before creating a real journey.');
      const data=new FormData(event.currentTarget);const response=await fetch('/api/journeys',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:data.get('name'),destination:data.get('destination'),contactName:data.get('contact'),start,end,durationMinutes:Number(data.get('duration')),graceSeconds:demo?20:Number(data.get('grace')),responseSeconds:demo?20:120,demo})});
      const result=await response.json();if(!response.ok)throw new Error(result.error);
      localStorage.setItem(`sj-share-${result.journey.id}`,result.sharePath);localStorage.setItem(`sj-journey-${result.journey.id}`,JSON.stringify(result.journey));localStorage.setItem('sj-active',result.journey.id);
      window.location.assign(`/traveller/journey/${result.journey.id}`);
    }catch(e){setError(e instanceof Error?e.message:'Could not create your journey.');setBusy(false);}
  }
  function locate(){setError('');if(!navigator.geolocation){setError('Location is not supported by this browser.');return;}navigator.geolocation.getCurrentPosition(position=>{const point={lat:position.coords.latitude,lng:position.coords.longitude};setStart(point);setEnd({lat:point.lat+.01,lng:point.lng+.005});setLocated(true);},()=>setError('Location permission is unavailable. Allow it in your browser settings, or try the labelled demo.'),{enableHighAccuracy:true,timeout:15000});}
  return <Shell active="journey" back><div className="page-heading compact"><div><div className="eyebrow">LET SOMEONE KNOW YOU’RE ON YOUR WAY</div><h1>A little planning.<br/><em>A more reassuring journey.</em></h1><p>Choose where you’re headed and who’s waiting for you.</p></div></div>
  <div className="create-layout"><form className="form-card" onSubmit={submit}>
    {process.env.NEXT_PUBLIC_DEMO_MODE==='true'&&<label className="demo-toggle"><input type="checkbox" checked={demo} onChange={e=>setDemo(e.target.checked)}/><span><strong>Try a demo journey</strong><small>Simulated movement in Kochi · Short check-in timers</small></span></label>}
    <div className="form-section"><h2><Users size={18}/> The people</h2><div className="field-row"><label>Your name<input name="name" placeholder="e.g. Jamie" required maxLength={60}/></label><label>Trusted contact’s name<input name="contact" placeholder="e.g. Alex" required maxLength={60}/></label></div><p className="field-hint">You’ll share a private link directly with this person. They should keep it open to receive in-app alerts.</p></div>
    <div className="form-section"><h2><MapPin size={18}/> The journey</h2><div className="location-field"><div><span>STARTING FROM</span><strong>{demo?'Marine Drive, Kochi':located?'Your current location':'Choose your current location'}</strong></div><button className="button text-button" type="button" onClick={locate}><LocateFixed size={16}/> Use my location</button></div><label>Destination name<input name="destination" placeholder="e.g. Home" defaultValue="Home" required maxLength={120}/></label><p className="field-hint">{demo?'Demo destination is preselected.':'Tap the map to choose your destination, then give it a name.'}</p>
    <details><summary>Adjust destination coordinates</summary><div className="field-row"><label>Latitude<input type="number" min="-90" max="90" step="any" value={end.lat} onChange={e=>setEnd({...end,lat:Number(e.target.value)})} required/></label><label>Longitude<input type="number" min="-180" max="180" step="any" value={end.lng} onChange={e=>setEnd({...end,lng:Number(e.target.value)})} required/></label></div></details></div>
    <div className="form-section"><h2><Clock3 size={18}/> The check-in</h2><div className="field-row"><label>Expected journey time<select name="duration" key={String(demo)} defaultValue={demo?'2':'30'}>{demo&&<><option value="1">1 minute — quick demo</option><option value="2">2 minutes — demo</option></>}<option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">1 hour</option><option value="120">2 hours</option></select></label><label>Grace period<select name="grace" disabled={demo} defaultValue="300">{demo?<option value="300">20 seconds — demo</option>:<><option value="60">1 minute</option><option value="300">5 minutes</option><option value="600">10 minutes</option></>}</select></label></div><p className="field-hint">After the grace period, you’ll have {demo?'20 seconds':'2 minutes'} to check in before your contact’s tracking view shows an alert.</p></div>
    <div className="privacy-inline"><ShieldCheck size={18}/><span>Your private link expires after 24 hours. Location sharing ends when you confirm arrival or cancel.</span></div>
    {error&&<div role="alert" className="notice error">{error}</div>}<button className="button primary full" disabled={busy}>{busy?'Creating your journey…':'Create journey & get share link'}<ArrowRight size={17}/></button>
  </form><aside className="create-aside"><JourneyMap start={start} end={end} onPick={setEnd}/><div className="aside-note"><span className="eyebrow">A PLAN YOU CAN COUNT ON</span><h3>You decide when you’re safe.</h3><p>Reaching the destination prompts a check-in. Only your confirmation tells your person that you’ve arrived safely.</p><div className="notice">Keep this app open during your trip. The prototype cannot guarantee background location tracking.</div></div></aside></div></Shell>;
}
