'use client';
import { useEffect, useRef, useState } from 'react';
import type { Checkpoint, Point } from '@/lib/journey';
import type L from 'leaflet';
import 'leaflet/dist/leaflet.css';
const emptyPoints:Point[]=[];
const emptyCheckpoints:Checkpoint[]=[];
export default function JourneyMap({start,end,points=emptyPoints,checkpoints=emptyCheckpoints,onPick,picked}:{start:Point;end?:Point;points?:Point[];checkpoints?:Checkpoint[];onPick?:(point:Point)=>void;picked?:Point}){
  const container=useRef<HTMLDivElement>(null);
  const map=useRef<L.Map|null>(null);
  const layers=useRef<L.LayerGroup|null>(null);
  const library=useRef<typeof L|null>(null);
  const click=useRef(onPick);
  const initial=useRef(start);
  const boundsKey=useRef('');
  const [ready,setReady]=useState(false);
  useEffect(()=>{click.current=onPick;},[onPick]);
  useEffect(()=>{
    let disposed=false;
    void import('leaflet').then(({default:leaflet})=>{
      if(disposed||!container.current)return;
      library.current=leaflet;
      const instance=leaflet.map(container.current,{zoomControl:false,scrollWheelZoom:false}).setView([initial.current.lat,initial.current.lng],14);
      map.current=instance;
      leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',maxZoom:19}).addTo(instance);
      leaflet.control.zoom({position:'bottomright'}).addTo(instance);
      layers.current=leaflet.layerGroup().addTo(instance);
      instance.on('click',e=>click.current?.({lat:e.latlng.lat,lng:e.latlng.lng}));
      setReady(true);
    });
    return()=>{disposed=true;map.current?.remove();map.current=null;};
  },[]);
  useEffect(()=>{
    const leaflet=library.current,layer=layers.current,instance=map.current;
    if(!ready||!leaflet||!layer||!instance)return;
    layer.clearLayers();
    function marker(point:Point,label:string,color:string){
      leaflet!.marker([point.lat,point.lng],{icon:leaflet!.divIcon({className:'route-pin-wrap',html:`<span class="route-pin" style="background:${color}">${label}</span>`,iconSize:[30,30],iconAnchor:[15,15]})}).addTo(layer!);
    }
    if(onPick){if(picked)marker(picked,'✓','#275f44');return;}
    const planned=[start,...checkpoints.map(c=>c.point),...(end?[end]:[])];
    leaflet.polyline(planned.map(p=>[p.lat,p.lng]),{color:'#657c70',weight:3,dashArray:'7 10'}).addTo(layer);
    marker(start,'S','#526b60');
    checkpoints.forEach((checkpoint,index)=>marker(checkpoint.point,String(index+1),'#927333'));
    if(end){marker(end,'D','#226343');leaflet.circle([end.lat,end.lng],{radius:100,color:'#25724d',weight:1,fillOpacity:.12}).addTo(layer);}
    if(points.length){leaflet.polyline(points.map(p=>[p.lat,p.lng]),{color:'#246d4b',weight:5}).addTo(layer);const p=points.at(-1)!;leaflet.circleMarker([p.lat,p.lng],{radius:9,color:'#fff',weight:4,fillColor:'#e49e40',fillOpacity:1}).addTo(layer);}
    const key=JSON.stringify(planned);
    if(boundsKey.current!==key){instance.fitBounds(planned.map(p=>[p.lat,p.lng]),{padding:[40,40],maxZoom:15});boundsKey.current=key;}
  },[ready,start,end,points,checkpoints,onPick,picked]);
  return <div className="map-frame"><div ref={container} className="map" aria-label={onPick?'Tap map to place location pin':'Journey location map'}/><span className="map-note">{onPick?'Tap the map to place a pin, then confirm below.':'S: start · numbers: checkpoints · D: destination. Dashed lines are not road directions.'}</span></div>;
}
