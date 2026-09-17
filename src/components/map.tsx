'use client';
import { useEffect, useRef } from 'react';
import type { Point } from '@/lib/journey';
import type L from 'leaflet';
import 'leaflet/dist/leaflet.css';
const emptyPoints:Point[]=[];
export default function JourneyMap({start,end,points=emptyPoints,onPick}:{start:Point;end:Point;points?:Point[];onPick?:(point:Point)=>void}){
  const container=useRef<HTMLDivElement>(null);const map=useRef<L.Map|null>(null);const layer=useRef<L.LayerGroup|null>(null);
  useEffect(()=>{let disposed=false;void import('leaflet').then(({default:leaflet})=>{
    if(disposed||!container.current)return;
    const instance=leaflet.map(container.current,{zoomControl:false,scrollWheelZoom:false}).setView([start.lat,start.lng],14);map.current=instance;
    leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',maxZoom:19}).addTo(instance);
    leaflet.control.zoom({position:'bottomright'}).addTo(instance);
    if(onPick)instance.on('click',event=>onPick({lat:event.latlng.lat,lng:event.latlng.lng}));
    layer.current=leaflet.layerGroup().addTo(instance);
    instance.fitBounds([[start.lat,start.lng],[end.lat,end.lng]],{padding:[55,55],maxZoom:15});
    draw(leaflet);
  });
  function draw(leaflet:typeof L){if(!layer.current)return;layer.current.clearLayers();
    leaflet.polyline([[start.lat,start.lng],[end.lat,end.lng]],{color:'#657c70',weight:3,dashArray:'7 10'}).addTo(layer.current);
    leaflet.circleMarker([start.lat,start.lng],{radius:6,color:'#fff',weight:3,fillColor:'#526b60',fillOpacity:1}).addTo(layer.current);
    leaflet.circle([end.lat,end.lng],{radius:100,color:'#25724d',weight:1,fillOpacity:.12}).addTo(layer.current);
    leaflet.circleMarker([end.lat,end.lng],{radius:9,color:'#fff',weight:3,fillColor:'#226343',fillOpacity:1}).addTo(layer.current);
    if(points.length){leaflet.polyline(points.map(p=>[p.lat,p.lng]),{color:'#246d4b',weight:5}).addTo(layer.current);const point=points.at(-1)!;leaflet.circleMarker([point.lat,point.lng],{radius:9,color:'#fff',weight:4,fillColor:'#e49e40',fillOpacity:1}).addTo(layer.current);}
  }
  return()=>{disposed=true;map.current?.remove();map.current=null;};
  // Rebuild on coordinate updates to keep this small prototype deterministic.
  },[start.lat,start.lng,end.lat,end.lng,points,onPick]);
  return <div className="map-frame"><div ref={container} className="map" aria-label="Journey location map"/><span className="map-note">Dashed line: destination reference, not road directions</span></div>;
}
