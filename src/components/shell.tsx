'use client';
/* Full document navigation populates the offline page cache. */
/* eslint-disable @next/next/no-html-link-for-pages */
import { ShieldCheck, Route, ArrowUpRight, Heart, Radio, ArrowLeft } from 'lucide-react';
import { useEffect } from 'react';
export function Shell({children,active='overview',back=false}:{children:React.ReactNode;active?:string;back?:boolean}){
  useEffect(()=>{if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});},[]);
  return <div className="app-shell">
    <aside className="sidebar"><a className="brand" href="/"><span className="brand-icon"><ShieldCheck size={23}/></span>safejourney<span className="brand-dot">.</span></a>
      <div className="workspace-label">YOUR PEACE OF MIND, IN MOTION</div>
      <nav><a className={active==='overview'?'nav-item selected':'nav-item'} href="/"><Route size={19}/> Overview <span className="nav-dot"/></a><a className={active==='journey'?'nav-item selected':'nav-item'} href="/create"><Radio size={19}/> Your journey</a></nav>
      <div className="sidebar-bottom"><div className="little-shield"><Heart size={20}/></div><h3>A little reassurance.<br/>All the way home.</h3><p>Keep someone you trust in the loop, wherever you’re headed.</p><div className="prototype-tag">QUALIFICATION PROTOTYPE <ArrowUpRight size={12}/></div></div>
    </aside>
    <div className="main-shell"><header className="topbar"><span>{back?<a href="/" className="back-link"><ArrowLeft size={15}/> Overview</a>:'A safer way to get there'}</span><span className="private-badge"><ShieldCheck size={14}/> Private by design</span></header><main>{children}</main><footer><span><ShieldCheck size={13}/> Made for the people waiting for you.</span><span>SafeJourney · Prototype</span></footer></div>
  </div>;
}
