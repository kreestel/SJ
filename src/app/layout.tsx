import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata:Metadata={title:'SafeJourney — Reassurance, all the way home',description:'Share your journey with someone you trust. Offline records, explicit safe check-in, and missed check-in alerts.',manifest:'/manifest.webmanifest',robots:{index:false,follow:false}};
export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#214f3b'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
