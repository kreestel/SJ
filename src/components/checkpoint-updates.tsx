'use client';
import { useEffect, useState } from 'react';
import { Bell, Check } from 'lucide-react';
import type { PublicJourney } from '@/lib/journey';
export function CheckpointUpdates({journey,shareToken}:{journey:PublicJourney;shareToken?:string}){
  const [enabled,setEnabled]=useState(false);const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
  useEffect(()=>{
    if(!shareToken)return;
    let cancelled=false;
    try{localStorage.setItem(`sj-follow-${journey.id}`,window.location.pathname+window.location.hash);}catch{/* The original link can still be opened manually. */}
    if('serviceWorker'in navigator)void navigator.serviceWorker.getRegistration().then(registration=>registration?.pushManager.getSubscription()).then(subscription=>{
      if(!cancelled)setEnabled(!!subscription&&localStorage.getItem(`sj-push-${journey.id}`)==='true'&&'Notification'in window&&Notification.permission==='granted');
    }).catch(()=>{});
    return()=>{cancelled=true;};
  },[shareToken,journey.id]);
  async function toggle(){
    if(!shareToken)return;
    setBusy(true);setMessage('');
    try{
      if(!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window))throw new Error('Push is unavailable here. On iPhone, add SafeJourney to your Home Screen, open it there, then reopen this private link.');
      if(!enabled&&await Notification.requestPermission()!=='granted')throw new Error('Notifications are blocked. Allow them in browser settings to receive checkpoint updates.');
      const configResponse=await fetch('/api/push-config');const config=await configResponse.json();
      if(!config.publicKey)throw new Error('The site owner still needs to configure checkpoint notifications. Updates remain available in this page.');
      await navigator.serviceWorker.register('/sw.js');
      const registration=await navigator.serviceWorker.ready;
      let subscription=await registration.pushManager.getSubscription();
      if(!subscription&&!enabled){const encoded=config.publicKey.replace(/-/g,'+').replace(/_/g,'/');const key=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});}
      if(!subscription)throw new Error('No notification subscription is available. Please enable notifications again.');
      const response=await fetch(`/api/follow/${shareToken}/subscription`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subscription:subscription.toJSON(),remove:enabled})});
      const result=await response.json();if(!response.ok)throw new Error(result.error);
      const next=!enabled;setEnabled(next);localStorage.setItem(`sj-push-${journey.id}`,String(next));
      setMessage(next?'Checkpoint notifications enabled for this journey. You can close this page.':'Checkpoint notifications disabled for this journey.');
    }catch(error){setMessage(error instanceof Error?error.message:'Could not enable notifications.');}
    finally{setBusy(false);}
  }
  return <section className="checkpoint-card"><h2>{shareToken?'Progress without watching the map':'Your checkpoints'}</h2>
    <ol className="checkpoint-progress">{(journey.checkpoints??[]).map((checkpoint,index)=>{const event=journey.events.find(e=>e.type==='CHECKPOINT_REACHED'&&e.checkpointId===checkpoint.id);const delayed=event&&Date.parse(event.receivedAt)-Date.parse(event.occurredAt)>60000;return <li key={checkpoint.id}><span className={`place-number ${event?'visited':'stop'}`}>{event?<Check size={17}/>:index+1}</span><div><strong>{checkpoint.name}</strong><p>{event?`Reached at ${new Date(event.occurredAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}${delayed?' · Synced after a delay':''}`:'Not yet recorded'}</p></div></li>;})}</ol>
    {!(journey.checkpoints??[]).length&&<p>No checkpoints were added to this journey.</p>}
    <div className="final-destination"><strong>Final destination: {journey.destination}</strong><p>{journey.status==='COMPLETED'?'Safe arrival confirmed':'Safe arrival requires the traveller’s confirmation.'}</p></div>
    {shareToken&&(journey.checkpoints?.length??0)>0&&<><button className="button secondary full" onClick={toggle} disabled={busy}><Bell size={17}/>{busy?'Updating…':enabled?'Turn off checkpoint notifications':'Enable checkpoint notifications'}</button><p className="field-hint">Notifications arrive after location updates reach the server. Internet and notification permission are required. Missed-check-in and SOS alerts currently appear in the tracking page.</p><p className="field-hint">On iPhone: add this app to your Home Screen to use push notifications.</p></>}
    {message&&<div className="notice" role="status">{message}</div>}
  </section>;
}
