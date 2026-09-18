'use client';
import { useEffect } from 'react';
import { Shell } from '@/components/shell';
export default function NotificationPage(){
  useEffect(()=>{try{const id=new URLSearchParams(window.location.search).get('journey');const path=id?localStorage.getItem(`sj-follow-${id}`):null;if(path?.startsWith('/follow/'))window.location.replace(path);}catch{/* Fall back to the original private link. */}},[]);
  return <Shell><div className="completion"><h1>Your checkpoint update is ready</h1><p>Opening your saved journey. If it does not open, use the original private link the traveller shared with you.</p></div></Shell>;
}
