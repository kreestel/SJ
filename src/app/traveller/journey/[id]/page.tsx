import { JourneyScreen } from '@/components/journey-screen';
export default async function Page({params}:{params:Promise<{id:string}>}){return <JourneyScreen id={(await params).id}/>;}
