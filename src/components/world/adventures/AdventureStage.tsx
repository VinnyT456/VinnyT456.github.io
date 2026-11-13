"use client";
/* eslint-disable react-hooks/immutability -- the scene owns its per-frame transforms and simulation refs. */
import { Fragment, Suspense, lazy, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { getRivalChallenge } from "./rival-challenge";
import { Blob, Block, TextSign, INKS } from "../parts";
import { HoverCar, Skiff } from "../Vehicles";
import { exhibits } from "@/data/museum";
import { TRACK } from "../speedway-track";
import { COLORS, complete, getSave, saveAdventure, type AdventureSave, type CommunityFlower, type Feature, type Furniture } from "./adventure-state";
import { PORTAL_FEEDS } from "./FloorWindows";
import { Cottage as House, Figure as Person, FurnitureModel as Furnishing, GardenTree as Tree, ROOM_OBSTACLES, RoomShell } from "./AdventureModels";
import type { ToyApi } from "./ToyPhysics";
import { SoftPanel, SoftSlab } from "./SculptedGeometry";
const ToyPhysics=lazy(()=>import("./ToyPhysics"));
export type StageApi={act:(action:string,value?:number)=>void;capture:()=>HTMLCanvasElement|null;resetView?:()=>void};
const INK=INKS.night;
const physicsModes:Feature[]=["crane","bowling","gravity"];
type SceneViewPreset={position:[number,number,number];target:[number,number,number];fov:number};
function sceneViewPreset(feature:Feature,phase=0,island=false):SceneViewPreset{
  if(feature==="ferry"&&island)return{position:[10,7,5],target:[6,.5,-2],fov:43};
  if(feature==="ferry")return{position:[13,11,16],target:[3,.5,2],fov:45};
  if(["home","editor","community","pocket"].includes(feature))return{position:[8,8,10],target:[0,.7,0],fov:43};
  if(feature==="cube")return{position:[6.5,7.5,8],target:[0,2,0],fov:43};
  if(feature==="portals")return{position:[0,3.8,8],target:[0,1.25,-1],fov:40};
  if(feature==="observatory")return{position:[9,8,11],target:[0,1.55,0],fov:44};
  if(feature==="replay"||feature==="coaster")return{position:[9,8,11],target:[0,1,0],fov:43};
  if(feature==="shrink")return phase===2?{position:[8.5,7.5,9],target:[.65,.55,-.75],fov:43}:{position:[9,8,11],target:[0,.65,-.15],fov:43};
  if(feature==="repairs"||feature==="power")return{position:[10,8,11],target:[0,.9,0],fov:45};
  if(feature==="music")return{position:[9,8,10],target:[0,.75,0],fov:44};
  if(feature==="garage"||feature==="transformer")return{position:[10,8,11],target:[0,1,0],fov:44};
  if(["delivery","fishing","residents","journal","secrets","controls","rooftops","drone","rival"].includes(feature))return{position:[8,7.5,9],target:[0,.6,0],fov:42};
  return{position:[9,8,10],target:[0,.6,0],fov:43};
}
const STAR_PATTERNS = [
  { stars:[[0,0],[1,0],[1.5,.8],[.8,1.4],[-.1,1.2],[-.55,.45]], links:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[1,4]] },
  { stars:[[0,0],[.7,.8],[1.55,.35],[1.1,-.45],[.1,-.55],[-.7,.1]], links:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[1,4]] },
  { stars:[[0,0],[.6,1.1],[1.4,1.25],[1.65,.3],[1,-.15],[.15,-.8]], links:[[0,1],[1,2],[2,3],[3,4],[4,0],[4,5],[0,5]] },
  { stars:[[0,0],[.6,.55],[1.5,.25],[1.1,-.55],[.2,-1],[-.45,-.25]], links:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[1,4]] },
  { stars:[[0,0],[.8,.9],[1.55,.2],[1.15,-.7],[.15,-.8],[-.5,.05]], links:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[0,4]] },
  { stars:[[0,0],[.45,1],[1.4,1.15],[1.7,.15],[.9,-.5],[-.1,-.8]], links:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[1,4]] },
];
const FURNITURE_RADIUS: Record<Furniture["kind"], number> = {house:.82,tree:.62,chair:.35,table:.52,lamp:.22};
const CUBE_ROADS = [
  {entry:[-2.25,0] as [number,number],exit:[0,2.25] as [number,number],path:[[-2.25,0],[0,0],[0,2.25]] as [number,number][]},
  {entry:[0,-2.25] as [number,number],exit:[2.25,0] as [number,number],path:[[0,-2.25],[0,0],[2.25,0]] as [number,number][]},
  {entry:[-2.25,0] as [number,number],exit:[0,2.25] as [number,number],path:[[-2.25,0],[0,0],[0,2.25]] as [number,number][]},
];
function rotateRoadPoint([x,z]:[number,number],turn:number):[number,number]{switch(turn%4){case 1:return[z,-x];case 2:return[-x,-z];case 3:return[-z,x];default:return[x,z];}}
function cubeRoadLinks(rotations:number[]){const ports=CUBE_ROADS.map((road,i)=>({entry:rotateRoadPoint(road.entry,rotations[i]),exit:rotateRoadPoint(road.exit,rotations[i])}));const links=[0,1].map(i=>Math.hypot(ports[i].exit[0]-ports[i+1].entry[0],ports[i].exit[1]-ports[i+1].entry[1])<.2);return{ports,links,connected:links.every(Boolean)};}
type ResidentRoutine={name:string;color:string;stops:{hour:number;place:"home"|"station"|"workshop"|"cafe";point:[number,number]}[]};
const RESIDENT_ROUTINES:ResidentRoutine[]=[
  {name:"Byte",color:"#f472b6",stops:[{hour:0,place:"home",point:[-3,-2.15]},{hour:7,place:"station",point:[0,3]},{hour:9,place:"workshop",point:[3,-2.15]},{hour:16,place:"cafe",point:[0,-2.15]},{hour:21,place:"home",point:[-3,-2.15]}]},
  {name:"Luma",color:"#67e8f9",stops:[{hour:0,place:"workshop",point:[3,-2.15]},{hour:6,place:"cafe",point:[0,-2.15]},{hour:10,place:"station",point:[0,3]},{hour:14,place:"workshop",point:[3,-2.15]},{hour:19,place:"home",point:[-3,-2.15]}]},
  {name:"Pip",color:"#fbbf24",stops:[{hour:0,place:"station",point:[0,3]},{hour:8,place:"cafe",point:[0,-2.15]},{hour:12,place:"home",point:[-3,-2.15]},{hour:15,place:"station",point:[0,3]},{hour:20,place:"cafe",point:[0,-2.15]},{hour:23,place:"home",point:[-3,-2.15]}]},
];
function residentAt(routine:ResidentRoutine,hour:number){
  const time=((hour%24)+24)%24;let previous=-1;
  for(let i=0;i<routine.stops.length;i++)if(routine.stops[i].hour<=time)previous=i;
  if(previous<0)previous=routine.stops.length-1;
  const next=(previous+1)%routine.stops.length,a=routine.stops[previous],b=routine.stops[next];
  const start=a.hour,end=next===0?b.hour+24:b.hour,clock=previous===routine.stops.length-1&&time<start?time+24:time;
  const travelStart=end-.55;let t=clock<=travelStart?0:THREE.MathUtils.clamp((clock-travelStart)/Math.max(.01,end-travelStart),0,1);t=t*t*(3-2*t);
  return{point:[THREE.MathUtils.lerp(a.point[0],b.point[0],t),THREE.MathUtils.lerp(a.point[1],b.point[1],t)] as [number,number],place:t>.5?b.place:a.place};
}
function circuitTargets(exhibit:typeof exhibits[number]){
  const source=`${exhibit.id}:${exhibit.title}:${exhibit.technologies.join("/")}`;
  const seed=[...source].reduce((sum,char)=>sum+char.charCodeAt(0),0);
  return [0,1,2,3].map((index)=>(seed+exhibit.technologies[index%exhibit.technologies.length].length*(index+1)+index*3)%4);
}
function scrambleCircuit(targets:number[],exhibit:typeof exhibits[number]){
  const seed=[...exhibit.id].reduce((sum,char)=>sum+char.charCodeAt(0),0);
  return targets.map((value,index)=>(value+1+(seed+index)%3)%4);
}
function wrapNote(text:string,maxChars=18,maxLines=3){const words=text.trim().split(/\s+/);const lines:string[]=[];let line="";for(const word of words){const next=line?`${line} ${word}`:word;if(next.length>maxChars&&line){lines.push(line);line=word;if(lines.length===maxLines-1)break;}else line=next;}if(line&&lines.length<maxLines)lines.push(line);if(lines.join(" ").length<text.trim().length&&lines.length)lines[lines.length-1]=`${lines.at(-1)?.slice(0,Math.max(0,maxChars-1))}…`;return lines;}
const FERRY_ROUTE=new THREE.CatmullRomCurve3([[0,.12,4.7],[0,.12,6.6],[3,.12,7.8],[7,.12,6.6],[8,.12,3],[8,.12,-1],[6,.12,-1.9]].map(([x,y,z])=>new THREE.Vector3(x,y,z)));
function FerryBoat(){return <group>
  <mesh position={[0,-.06,0]} rotation={[Math.PI/2,0,0]}><capsuleGeometry args={[.38,1.25,5,10]}/><meshStandardMaterial color="#67e8f9" roughness={.34} metalness={.12}/></mesh>
  <Block size={[.82,.12,1.62]} color="#c28c63" at={[0,.34,0]} radius={.12}/>
  <Block size={[.62,.48,.58]} color="#302a50" at={[0,.64,-.23]} radius={.12}/>
  <Block size={[.54,.31,.04]} color="#86d7df" at={[0,.69,.08]} radius={.08}/>
  <Block size={[.7,.12,.66]} color="#a78bfa" at={[0,.94,-.23]} radius={.1}/>
  {[-.42,.42].map(x=><group key={x}><Block size={[.045,.31,.045]} color="#f4d99a" at={[x,.54,.16]} radius={.02}/><Block size={[.045,.31,.045]} color="#f4d99a" at={[x,.54,-.73]} radius={.02}/><Block size={[.045,.31,.045]} color="#f4d99a" at={[x,.54,-.28]} radius={.02}/></group>)}
  <Block size={[.045,.045,.95]} color="#f4d99a" at={[-.42,.7,-.28]} radius={.02}/><Block size={[.045,.045,.95]} color="#f4d99a" at={[.42,.7,-.28]} radius={.02}/>
  <mesh position={[-.44,.16,.5]} rotation={[0,0,Math.PI/2]}><torusGeometry args={[.15,.04,8,20]}/><meshStandardMaterial color="#f472b6"/></mesh>
  <mesh position={[.44,.16,.5]} rotation={[0,0,Math.PI/2]}><torusGeometry args={[.15,.04,8,20]}/><meshStandardMaterial color="#f472b6"/></mesh>
</group>;}
function ArcadeCabinet({open=false}:{open?:boolean}){return <group>
  <Block size={[1.45,2,.92]} color="#312348" at={[0,0,0]} radius={.18}/>
  <Block size={[1.18,.94,.08]} color="#a78bfa" at={[0,1.35,.5]} radius={.12}/>
  <Block size={[1.02,.75,.04]} color={open?"#34d399":"#67e8f9"} at={[0,1.36,.56]} radius={.08} glow={.12}/>
  <TextSign text={open?"TINY CITY":"ARCADE"} width={.85} height={.18} at={[0,1.36,.59]}/>
  <Block size={[.85,.12,.2]} color="#211a32" at={[0,.72,.48]} radius={.06}/>
  <Block size={[.12,.22,.12]} color="#f472b6" at={[-.24,.88,.48]} radius={.05}/>
  <mesh position={[.24,.87,.48]}><cylinderGeometry args={[.08,.08,.06,16]}/><meshStandardMaterial color="#fbbf24"/></mesh>
  <Block size={[.14,2.08,.08]} color="#514568" at={[-.78,0,0]} radius={.06}/>
  <Block size={[.14,2.08,.08]} color="#514568" at={[.78,0,0]} radius={.06}/>
</group>;}
function FishingRig({bobberRef}:{bobberRef:Ref<THREE.Mesh>}){
  const line=useMemo(()=>new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(.5,.82,4.8),new THREE.Vector3(.42,.95,5.25),new THREE.Vector3(.2,.52,5.8),new THREE.Vector3(0,.15,6.5),
  ]),24,.012,5,false),[]);
  useEffect(()=>()=>line.dispose(),[line]);
  return <group>
    <Block size={[2,.12,3]} color="#8e654e" at={[0,0,4.5]} radius={.12}/>
    {[-.62,-.2,.2,.62].map(x=><Block key={x} size={[.04,.03,2.7]} color="#c28c63" at={[x,.075,4.5]} radius={.015}/>)}
    <Block size={[.055,1.5,.055]} color="#d5a452" at={[.5,.1,4.8]} rotation={[.5,0,0]} radius={.025}/>
    <Block size={[.17,.16,.12]} color="#514568" at={[.47,.1,4.52]} radius={.045}/>
    <mesh geometry={line}><meshStandardMaterial color="#f4e8ce"/></mesh>
    <mesh ref={bobberRef} position={[0,.15,6.5]}><sphereGeometry args={[.12,12,8]}/><meshStandardMaterial color="#f472b6" emissive="#f472b6" emissiveIntensity={.5}/></mesh>
  </group>;
}
function CatchDisplayItem({item}:{item:string}){
  if(item.toLowerCase().includes("keycap"))return <group><Block size={[.52,.2,.52]} color="#67e8f9" at={[0,0,0]} radius={.09}/><TextSign text="KEY" width={.35} height={.12} at={[0,.1,.012]}/></group>;
  if(item.toLowerCase().includes("car"))return <group scale={.58}><HoverCar ink={INK} body="#f472b6" len={.8} wid={.45} reduced/></group>;
  if(item.toLowerCase().includes("bottle"))return <group><mesh position={[0,.28,0]}><latheGeometry args={[[new THREE.Vector2(.13,0),new THREE.Vector2(.16,.08),new THREE.Vector2(.15,.34),new THREE.Vector2(.08,.43),new THREE.Vector2(.07,.53),new THREE.Vector2(.1,.55)],16]}/><meshStandardMaterial color="#a8d9be" transparent opacity={.78} roughness={.22} metalness={.08}/></mesh><Block size={[.15,.08,.15]} color="#c28c63" at={[0,.55,0]} radius={.035}/><TextSign text="SL" width={.2} height={.1} at={[0,.28,.15]}/></group>;
  const color=item.toLowerCase().includes("moon")?"#9c8bdf":"#dfa95e";
  return <group><mesh position={[0,.16,0]} scale={[.42,.22,.2]}><sphereGeometry args={[1,16,10]}/><meshStandardMaterial color={color} roughness={.38}/></mesh><mesh position={[-.36,.16,0]} rotation={[0,0,Math.PI/2]}><coneGeometry args={[.18,.28,3]}/><meshStandardMaterial color={color} roughness={.4}/></mesh><mesh position={[.03,.2,.18]}><sphereGeometry args={[.035,8,6]}/><meshStandardMaterial color="#211a32"/></mesh><mesh position={[0,.03,0]} rotation={[0,0,Math.PI/2]}><coneGeometry args={[.12,.24,3]}/><meshStandardMaterial color="#67e8f9"/></mesh></group>;
}
function DroneCraft({carrying=false}:{carrying?:boolean}){return <group>
  <mesh scale={[.42,.15,.36]}><sphereGeometry args={[1,16,12]}/><meshStandardMaterial color="#312b47" metalness={.35} roughness={.36}/></mesh>
  {[-1,1].flatMap(x=>[-1,1].map(z=><group key={`${x}:${z}`} position={[x*.33,.02,z*.28]}>
    <mesh rotation={[0,0,x*z*.68]}><cylinderGeometry args={[.035,.035,.48,8]}/><meshStandardMaterial color="#8d83a7" metalness={.5} roughness={.32}/></mesh>
    <mesh position={[0,.12,0]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[.15,.02,6,18]}/><meshStandardMaterial color="#a78bfa" emissive="#a78bfa" emissiveIntensity={.2}/></mesh>
  </group>))}
  <mesh position={[0,-.08,.27]}><sphereGeometry args={[.085,12,8]}/><meshStandardMaterial color="#67e8f9" emissive="#67e8f9" emissiveIntensity={.35}/></mesh>
  {carrying?<Block size={[.24,.24,.24]} color="#67e8f9" at={[0,-.3,0]} radius={.04}/>:null}
</group>;}
function TrackRig({curve}:{curve:THREE.CatmullRomCurve3}){
  const rails=useMemo(()=>[1,-1].map(side=>{
    const points=Array.from({length:128},(_,i)=>{const t=i/128,p=curve.getPointAt(t),d=curve.getTangentAt(t);return new THREE.Vector3(p.x+side*d.z*.15,p.y-.08,p.z-side*d.x*.15);});
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points,true),128,.045,7,true);
  }),[curve]);
  useEffect(()=>()=>rails.forEach(rail=>rail.dispose()),[rails]);
  return <group>
    {rails.map((rail,i)=><mesh key={i} geometry={rail}><meshStandardMaterial color="#67e8f9" metalness={.42} roughness={.3} emissive="#0a3640"/></mesh>)}
    {Array.from({length:40},(_,i)=>{const t=i/40,p=curve.getPointAt(t),d=curve.getTangentAt(t);return <group key={i} position={[p.x,p.y-.18,p.z]} rotation={[0,Math.atan2(d.x,d.z),0]}>
      <Block size={[.56,.09,.13]} color="#8e654e" at={[0,0,0]} radius={.025}/>
      {i%5===0?<Block size={[.07,.3,.07]} color="#514568" at={[-.23,-.2,0]} radius={.025}/>:null}
      {i%5===0?<Block size={[.07,.3,.07]} color="#514568" at={[.23,-.2,0]} radius={.025}/>:null}
    </group>;})}
  </group>;
}
function Ring({color,at,radius,tube=.025,rotation=[Math.PI/2,0,0] as [number,number,number]}:{color:string;at:[number,number,number];radius:number;tube?:number;rotation?:[number,number,number]}){
  return <mesh position={at} rotation={rotation}><torusGeometry args={[radius,tube,8,24]}/><meshStandardMaterial color={color} metalness={.18} roughness={.36}/></mesh>;
}
function OutdoorLandscape(){
  const path=useMemo(()=>{const shape=new THREE.Shape();shape.moveTo(-.48,-5);shape.quadraticCurveTo(-.55,-4.1,-.3,-3.35);shape.quadraticCurveTo(.05,-2.6,.2,-2);shape.quadraticCurveTo(.42,-1.25,.05,-.68);shape.quadraticCurveTo(-.42,.05,-1.25,.58);shape.quadraticCurveTo(-2,.95,-3.55,.78);shape.lineTo(-3.55,1.42);shape.quadraticCurveTo(-2.05,1.78,-1.02,1.13);shape.quadraticCurveTo(-.42,.72,.47,-.28);shape.quadraticCurveTo(.78,-.86,.48,-1.94);shape.quadraticCurveTo(.18,-3.1,.48,-4.12);shape.quadraticCurveTo(.72,-4.72,.55,-5);shape.closePath();return new THREE.ShapeGeometry(shape,20);},[]);
  const shore=useMemo(()=>{const points=Array.from({length:16},(_,i)=>{const a=i*Math.PI/8,r=5.06+.15*Math.sin(a*3)+.08*Math.cos(a*5);return new THREE.Vector3(Math.cos(a)*r,.002,Math.sin(a)*r);});const curve=new THREE.CatmullRomCurve3(points,true,"centripetal");return new THREE.TubeGeometry(curve,96,.028,6,true);},[]);
  useEffect(()=>()=>{path.dispose();shore.dispose();},[path,shore]);
  return <>
    <mesh geometry={path} position={[0,.004,0]} rotation={[-Math.PI/2,0,0]}><meshStandardMaterial color="#c3ac8c" roughness={.86}/></mesh>
    <mesh geometry={shore}><meshStandardMaterial color="#d7c5a1" roughness={.8}/></mesh>
    {[[4.05,.15],[-4.1,1.15],[1.55,4.12],[-1.7,-4.12]].map(([x,z],i)=><group key={i} position={[x,0,z]}>
      <mesh position={[0,.055,0]} scale={[.64,.11,.42]}><sphereGeometry args={[1,14,10]}/><meshStandardMaterial color="#557c59" roughness={.9}/></mesh>
      {[-.25,0,.25].map((offset,j)=><group key={j} position={[offset,.08,j%2?.1:-.08]}><mesh position={[0,.14,0]}><cylinderGeometry args={[.018,.025,.26,6]}/><meshStandardMaterial color="#3b805d"/></mesh><mesh position={[0,.27,0]}><sphereGeometry args={[.09,9,7]}/><meshStandardMaterial color={["#f4d99a","#f28ca8","#b8a5f0"][(i+j)%3]} roughness={.7}/></mesh></group>)}
    </group>)}
    {[-4.45,4.45].map((x,i)=><group key={x} position={[x,0,i?2.9:-2.1]}>
      <mesh position={[0,.18,0]} scale={[.4,.2,.3]}><sphereGeometry args={[1,10,8]}/><meshStandardMaterial color="#9c8c7b" roughness={.95}/></mesh>
      <mesh position={[.25,.12,.2]} scale={[.27,.14,.22]}><sphereGeometry args={[1,10,8]}/><meshStandardMaterial color="#b5a18a" roughness={.9}/></mesh>
    </group>)}
  </>;
}
function Robot(){return <group position={[0,0,-1]}>
  <mesh position={[0,.65,0]} scale={[.42,.43,.31]}><capsuleGeometry args={[.7,.34,6,14]}/><meshStandardMaterial color="#c4b5fd" roughness={.42} metalness={.12}/></mesh>
  <mesh position={[0,1.22,0]} scale={[.35,.32,.3]}><sphereGeometry args={[1,20,16]}/><meshStandardMaterial color="#e8e4ff" roughness={.4} metalness={.08}/></mesh>
  <Block size={[.48,.18,.045]} color="#211a32" at={[0,1.2,.27]} radius={.08}/>
  {[-.14,.14].map(x=><mesh key={x} position={[x,1.22,.304]}><sphereGeometry args={[.045,12,8]}/><meshStandardMaterial color="#67e8f9" emissive="#67e8f9" emissiveIntensity={.55}/></mesh>)}
  <mesh position={[0,1.51,0]}><cylinderGeometry args={[.035,.035,.23,10]}/><meshStandardMaterial color="#a78bfa"/></mesh>
  <mesh position={[0,1.64,0]}><sphereGeometry args={[.085,12,8]}/><meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={.2}/></mesh>
  {[-1,1].map(side=><group key={side}>
    <mesh position={[side*.4,.77,0]} rotation={[0,0,side*.25]}><capsuleGeometry args={[.09,.34,5,10]}/><meshStandardMaterial color="#e8e4ff"/></mesh>
    <mesh position={[side*.46,.31,0]} rotation={[0,0,Math.PI/2]}><capsuleGeometry args={[.07,.19,5,10]}/><meshStandardMaterial color="#514568"/></mesh>
    <Block size={[.09,.16,.12]} color="#f4d99a" at={[side*.48,.09,.02]} radius={.04}/>
  </group>)}
  <TextSign text="READY FOR A CHALLENGE?" width={3} height={.25} at={[0,2.05,0]}/>
</group>;}
const FLOWER_COLORS:Record<string,string>={coral:"#fb7185",gold:"#fbbf24",violet:"#a78bfa",blue:"#67e8f9",mint:"#34d399",pink:"#f472b6"};
function RooftopFlower({flower,color}:{flower:CommunityFlower["flower"];color:CommunityFlower["color"]}){
  const ink=FLOWER_COLORS[color]??"#a78bfa";
  return <group>
    <Block size={[.045,.28,.045]} color="#378b75" at={[0,0,0]}/>
    {flower==="daisy"? <>{Array.from({length:8},(_,i)=><mesh key={i} position={[Math.cos(i*Math.PI/4)*.09,.22,Math.sin(i*Math.PI/4)*.09]} rotation={[0,-i*Math.PI/4,0]}><sphereGeometry args={[.065,8,6]}/><meshStandardMaterial color="#fff7ed"/></mesh>)}<mesh position={[0,.24,0]}><sphereGeometry args={[.055,8,6]}/><meshStandardMaterial color={ink}/></mesh></>:
    flower==="sunflower"? <>{Array.from({length:10},(_,i)=><mesh key={i} position={[Math.cos(i*Math.PI/5)*.1,.23,Math.sin(i*Math.PI/5)*.1]}><sphereGeometry args={[.06,8,6]}/><meshStandardMaterial color={ink}/></mesh>)}<mesh position={[0,.24,0]}><sphereGeometry args={[.075,8,6]}/><meshStandardMaterial color="#514568"/></mesh></>:
    flower==="tulip"? <mesh position={[0,.24,0]}><sphereGeometry args={[.12,6,6]}/><meshStandardMaterial color={ink}/></mesh>:
    flower==="rose"? <>{[.09,.06,.035].map((r,i)=><mesh key={i} position={[0,.2+i*.025,0]}><sphereGeometry args={[r,8,6]}/><meshStandardMaterial color={ink}/></mesh>)}</>:
    <>{[-1,0,1].map(i=><mesh key={i} position={[i*.07,.23,Math.abs(i)*.035]}><sphereGeometry args={[.075,8,6]}/><meshStandardMaterial color={ink}/></mesh>)}</>}
  </group>;
}
function RivalBoard({refreshKey}:{refreshKey:number}){const rows=getRivalChallenge();return <group position={[3.05,0,-1]} userData={{refreshKey}}><Block size={[2.35,1.65,.16]} color="#302a50" at={[0,.93,0]} radius={.12}/><Block size={[2.05,1.32,.04]} color="#171525" at={[0,.95,.1]} radius={.08}/><TextSign text="ROBOT SCOREBOARD" width={1.9} height={.2} at={[0,1.43,.14]}/>{rows.map((row,i)=><TextSign key={row.id} text={`${row.id.toUpperCase()} ${row.won?"✓":"·"}`} width={1.8} height={.16} at={[0,1.08-i*.3,.14]}/>)}</group>}
function Capture({apiRef}:{apiRef:Ref<{capture:()=>HTMLCanvasElement|null}>}){const {gl,scene,camera}=useThree();useImperativeHandle(apiRef,()=>({capture(){try{gl.render(scene,camera);const canvas=document.createElement("canvas");canvas.width=gl.domElement.width;canvas.height=gl.domElement.height;const context=canvas.getContext("2d");if(!context)return null;context.drawImage(gl.domElement,0,0);return canvas;}catch{return null;}}}),[gl,scene,camera]);return null;}
function PortalWindow({index,x}:{index:number;x:number}){const material=useRef<THREE.MeshBasicMaterial>(null);const seenRevision=useRef(-1);const texture=useMemo(()=>{const tex=new THREE.CanvasTexture(PORTAL_FEEDS.canvases[index]);tex.colorSpace=THREE.SRGBColorSpace;tex.needsUpdate=true;return tex;},[index]);useEffect(()=>()=>texture.dispose(),[texture]);useFrame(()=>{if(seenRevision.current!==PORTAL_FEEDS.revision){texture.needsUpdate=true;seenRevision.current=PORTAL_FEEDS.revision;}});return <group position={[x,0,-2]}><SoftPanel size={[2.9,2.1,.18]} color="#a78bfa" at={[0,.4,0]} radius={.24}/><mesh position={[0,1.5,.105]} onClick={e=>{e.stopPropagation();complete("portals");}}><planeGeometry args={[2.65,1.65]}/><meshBasicMaterial ref={material} map={texture} toneMapped={false}/></mesh><TextSign text={["SURFACE CITY","LOWER CITY","SPEEDWAY"][index]} width={2.5} height={.2} at={[0,2.55,.12]}/></group>;}
function Scene({feature,save,apiRef,onNote,reduced,flowers=[],onPieceSelection,onFerryLock,onFerryMoving,onReplayTime,rivalRefresh}:{feature:Feature;save:AdventureSave;apiRef:Ref<ToyApi>;onNote:(v:string)=>void;reduced:boolean;flowers?:readonly CommunityFlower[];onPieceSelection?:(id:number|null)=>void;onFerryLock?:(locked:boolean)=>void;onFerryMoving?:(moving:boolean)=>void;onReplayTime?:(time:number)=>void;rivalRefresh:number}){
  const player=useRef<THREE.Group>(null),boat=useRef<THREE.Group>(null),drone=useRef<THREE.Group>(null),cart=useRef<THREE.Group>(null),shuttle=useRef<THREE.Group>(null),deliveryResident=useRef<THREE.Group>(null),telescope=useRef<THREE.Group>(null);
  const residents=useRef<(THREE.Group|null)[]>([]),layers=useRef<(THREE.Group|null)[]>([]),bobber=useRef<THREE.Mesh>(null);
  const [phase,setPhase]=useState(0),[project,setProject]=useState(0),[cube,setCube]=useState([1,2,3]),[switches,setSwitches]=useState(()=>scrambleCircuit(circuitTargets(exhibits[0]),exhibits[0])),[selected,setSelected]=useState<Furniture["kind"]>("chair"),[selectedPiece,setSelectedPiece]=useState<number|null>(null),[aim,setAim]=useState(0);
  const [keycaps,setKeycaps]=useState<number[]>([]),[pocketVisits,setPocketVisits]=useState<string[]>([]);
  const [carried,setCarried]=useState(false),[ferryBoarded,setFerryBoarded]=useState(false),[ferryIsland,setFerryIsland]=useState(false),[delivered,setDelivered]=useState(false),[parcelIntact,setParcelIntact]=useState(false);
  const keys=useRef(new Set<string>());
  const r=useRef({x:0,y:0,z:["home","editor","community","pocket"].includes(feature)?1.2:3,h:0,vy:0,t:0,target:null as [number,number]|null,ride:-1,returning:false,island:false,carry:false,fragile:false,routeLength:0,deliveryReactUntil:0,program:-1,commandAt:0,dx:-2,dz:2,droneYaw:Math.PI,replay:0,playing:true,speed:1,camera:"orbit",alt:1,aim:0,vehicle:0,vehicleCompleted:false,cast:-1,placed:0,recording:false,recordStart:0,frames:[] as AdventureSave["replay"],distance:0,placing:false,moving:null as number|null,zip:-1});
  const lastReplayReport=useRef({time:0,value:-1});
  const {camera}=useThree();const control=useRef<React.ComponentRef<typeof OrbitControls>>(null);
  const curve=useMemo(()=>new THREE.CatmullRomCurve3(save.coaster.map((h,i)=>new THREE.Vector3(Math.sin(i*Math.PI/4)*4,.6+h*.55,Math.cos(i*Math.PI/4)*4)),true),[save.coaster]);
  const replayCurve=useMemo(()=>new THREE.CatmullRomCurve3(TRACK.filter((_,i)=>i%12===0).map(p=>new THREE.Vector3(p.x*.4,.12,p.z*.4)),true),[]);
  const note=useRef(onNote);useEffect(()=>{note.current=onNote;},[onNote]);
  const outdoors=!["home","editor","community","cube","shrink","gravity","music","repairs","power","portals","replay","observatory","pocket"].includes(feature);
  const neighborhood=["delivery","ferry","fishing","residents","journal","garage","transformer","rival"].includes(feature);
  const cubeRoute=cubeRoadLinks(cube);
  const placementId=useRef(0);
  const targets=useMemo(()=>circuitTargets(exhibits[project%exhibits.length]),[project]);
  const circuitLive=switches.every((value,index)=>value===targets[index]);
  const turnSwitch=useCallback((index:number)=>{const next=switches.map((value,i)=>i===index?(value+1)%4:value);setSwitches(next);if(next.every((value,i)=>value===targets[i])){const exhibit=exhibits[project%exhibits.length];complete(feature==="power"?"power":"repairs");saveAdventure({repairedProjects:[...new Set([...getSave().repairedProjects,exhibit.id])].slice(0,exhibits.length)});note.current(`${exhibit.title} grid online. All four color routes reached their project ports.`);}else{const fixed=next.filter((value,i)=>value===targets[i]).length;note.current(`${fixed} of 4 connectors matched for ${exhibits[project%exhibits.length].title}. Follow each module's gold target arrow.`);}},[feature,project,switches,targets]);
  const inspectProjectCase=useCallback(()=>{const q=r.current;if(!q.island||q.ride>=0){note.current("Sail to this project island before inspecting its case.");return;}if(Math.hypot(q.x-6,q.z+3)>1.0){note.current("Walk up to the front of the project case to inspect it.");return;}const exhibit=exhibits[project%exhibits.length];note.current(`${exhibit.title}: ${exhibit.description} Technologies: ${exhibit.technologies.join(", ")}.`);complete("ferry");},[project]);
  const moveMiniature=useCallback((id:number,x:number,z:number)=>{
    const list=getSave().miniatures,item=list.find(piece=>piece.id===id);
    if(!item){note.current("Select a miniature that is still in the island.");return false;}
    const px=Math.round(x*2)/2,pz=Math.round(z*2)/2,radius=FURNITURE_RADIUS[item.kind],q=r.current;
    if(Math.abs(px)+radius>4.7||Math.abs(pz)+radius>4.7){note.current("That spot is too close to the island edge.");return false;}
    if(Math.hypot(px-q.x,pz-q.z)<radius+.2){note.current("That spot would block your explorer. Choose a little more space.");return false;}
    if((ROOM_OBSTACLES.editor??[]).some(obstacle=>Math.abs(px-obstacle.x)<radius+obstacle.hw&&Math.abs(pz-obstacle.z)<radius+obstacle.hd)){note.current("That spot is reserved for the room furniture.");return false;}
    if(list.some(piece=>piece.id!==id&&Math.hypot(px-piece.x,pz-piece.z)<radius+FURNITURE_RADIUS[piece.kind]*.75)){note.current("That piece would overlap another miniature.");return false;}
    saveAdventure({miniatures:list.map(piece=>piece.id===id?{...piece,x:px,z:pz}:piece)});setSelectedPiece(id);return true;
  },[]);
  const selectMiniature=useCallback((id:number|null)=>{setSelectedPiece(id);onPieceSelection?.(id);},[onPieceSelection]);
  useEffect(()=>{const down=(e:KeyboardEvent)=>{const target=e.target as HTMLElement;if(target.closest("input,select,textarea,[contenteditable=true]")||(e.key===" "&&target.closest("button")))return;if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","w","a","s","d"," "].includes(e.key)){e.preventDefault();keys.current.add(e.key);}};const up=(e:KeyboardEvent)=>keys.current.delete(e.key);const clear=()=>keys.current.clear();window.addEventListener("keydown",down);window.addEventListener("keyup",up);window.addEventListener("blur",clear);return()=>{clear();window.removeEventListener("keydown",down);window.removeEventListener("keyup",up);window.removeEventListener("blur",clear);};},[]);
  useImperativeHandle(apiRef,()=>({act(action,value=0){const q=r.current;
    if(action==="resetView"){q.camera="orbit";const preset=sceneViewPreset(feature,phase,q.island);if(control.current){control.current.target.set(...preset.target);camera.position.set(...preset.position);control.current.enabled=true;control.current.update();}return;}
    if(action==="walkStart"||action==="walkStop"){const key=(["ArrowUp","ArrowLeft","ArrowDown","ArrowRight"] as const)[Math.round(value)];if(key){if(action==="walkStart"){q.target=null;keys.current.add(key);}else keys.current.delete(key);}return;}
    if(action==="moveUp"||action==="moveLeft"||action==="moveDown"||action==="moveRight"){const [dx,dz]=({moveUp:[0,-1],moveLeft:[-1,0],moveDown:[0,1],moveRight:[1,0]} as const)[action];q.target=[q.x+dx*.75,q.z+dz*.75];return;}
    if(action==="up"||action==="down"||action==="left"||action==="right"){q.target=[q.x+({left:-1,right:1}[action as "left"|"right"]??0),q.z+({up:-1,down:1}[action as "up"|"down"]??0)];return;}
    if(action==="jump"){if(q.y<=.02||feature==="rooftops"){q.vy=feature==="rooftops"?6:4;if(feature==="delivery"&&q.carry&&q.fragile){q.fragile=false;setParcelIntact(false);note.current("Hard bounce! The fragile parcel cracked. Return to the conveyor for a replacement.");}}return;}
    if(action==="kind"){setSelected((["chair","table","lamp","tree","house"] as const)[value%5]);q.placing=true;note.current("Click the floor to place it. Your layout is saved on this device.");}
    if(action==="walk"||action==="stopplacing"){q.placing=false;note.current("Placement mode closed. Click open floor to walk there.");}
    if(action==="moveSelected"){if(selectedPiece===null)note.current("Click a miniature on the island to select it first.");else{q.moving=selectedPiece;q.placing=false;note.current("Move armed. Click an open floor tile to place the selected miniature.");}}
    if(action==="selectPiece"){const id=Math.round(value);if(value<0){selectMiniature(null);q.moving=null;}else if(getSave().miniatures.some(piece=>piece.id===id)){selectMiniature(id);note.current("Miniature selected. Choose a move, rotate, or remove action.");}}
    if(action==="nudgeSelected"){if(selectedPiece===null)note.current("Click a miniature on the island to select it first.");else{const item=getSave().miniatures.find(piece=>piece.id===selectedPiece);const directions:[[number,number],[number,number],[number,number],[number,number]]=[[0,-.5],[.5,0],[0,.5],[-.5,0]];if(item){const [dx,dz]=directions[((value%4)+4)%4];if(moveMiniature(item.id,item.x+dx,item.z+dz))note.current(`Moved ${item.kind} by half a tile.`);}}}
    if(action==="rotateSelected"){if(selectedPiece===null)note.current("Click a miniature on the island to select it first.");else{const list=getSave().miniatures;if(list.some(piece=>piece.id===selectedPiece)){saveAdventure({miniatures:list.map(piece=>piece.id===selectedPiece?{...piece,turn:(piece.turn+Math.PI/2)%(Math.PI*2)}:piece)});note.current("Selected miniature rotated a quarter turn.");}}}
    if(action==="deleteSelected"){if(selectedPiece===null)note.current("Click a miniature on the island to select it first.");else{const list=getSave().miniatures;if(list.some(piece=>piece.id===selectedPiece)){saveAdventure({miniatures:list.filter(piece=>piece.id!==selectedPiece)});selectMiniature(null);q.moving=null;note.current("Selected miniature removed from your saved island.");}}}
    if(action==="rotate"){const name=feature==="editor"?"miniatures":feature==="community"?"rooftop":"furniture";const list=getSave()[name];saveAdventure({[name]:list.map((p,i)=>i===list.length-1?{...p,turn:(p.turn+Math.PI/2)%(Math.PI*2)}:p)});}
    if(action==="undo"){const name=feature==="editor"?"miniatures":feature==="community"?"rooftop":"furniture";saveAdventure({[name]:getSave()[name].slice(0,-1)});}
    if(action==="collect"){
      if(q.carry&&q.fragile){note.current("The parcel is already on your shuttle.");}
      else if(q.carry&&!q.fragile&&Math.hypot(q.x+3,q.z)<.7){q.fragile=true;q.routeLength=0;setParcelIntact(true);note.current("Replacement parcel loaded. Keep the shuttle level along the route.");}
      else if(q.carry){note.current("That parcel is cracked. Bring the shuttle back to the conveyor for a replacement.");}
      else if(Math.hypot(q.x+3,q.z)<.7){q.carry=true;q.fragile=true;q.routeLength=0;setCarried(true);setParcelIntact(true);setDelivered(false);note.current("Fragile parcel loaded. Take the shuttle along the harbor route without jumping.");}
      else note.current("Walk to the cyan parcel on the conveyor first.");
    }
    if(action==="deliver"){
      if(!q.carry)note.current("Load a parcel onto the shuttle at the conveyor first.");
      else if(!q.fragile)note.current("This parcel cracked on the route. Return to the conveyor for a fresh one.");
      else if(q.routeLength<5.2)note.current("The shuttle needs to travel the harbor route before delivery.");
      else if(Math.hypot(q.x-3,q.z+3)<1.5){q.carry=false;q.deliveryReactUntil=q.t+4;setCarried(false);setParcelIntact(false);setDelivered(true);saveAdventure({deliveries:getSave().deliveries+1});complete("delivery");note.current("The resident receives the intact parcel and waves thanks. Delivery recorded.");}
      else note.current("Bring the shuttle to the pink resident's porch at the far end.");
    }
    if(action==="sail"){
      if(q.ride>=0){note.current("The ferry is already underway.");}
      else if((!q.island&&Math.hypot(q.x,q.z-4.7)<2)||(q.island&&Math.hypot(q.x-6,q.z+1.9)<2)){q.returning=q.island;q.ride=0;q.camera="ride";onFerryLock?.(true);onFerryMoving?.(true);setFerryBoarded(true);note.current(q.returning?"On board. Sailing back to the main harbor.":`On board. Sailing to ${exhibits[project%exhibits.length].title}.`);}
      else note.current(q.island?"Walk to the project island pier to sail back to the harbor.":"Walk to the harbor launch pier before boarding the ferry.");
    }
    if(action==="inspectCase"){inspectProjectCase();}
    if(action==="project"){if(q.island||q.ride>=0){note.current("Finish this ferry trip before choosing another project.");return;}const next=((Math.round(value)%exhibits.length)+exhibits.length)%exhibits.length;setProject(next);setSwitches(scrambleCircuit(circuitTargets(exhibits[next]),exhibits[next]));note.current(`${exhibits[next].title} island selected. Board at the launch pier when ready.`);}
    if(action==="cast"){q.cast=q.t;note.current("Line cast. The float glows when a catch is close; choose Reel in near the middle of its rhythm.");}
    if(action==="catch"){if(q.cast<0){note.current("Cast your line first.");return;}const timing=(q.t-q.cast)%2;if(Math.abs(timing-1)<.38){const items=["Moon koi","Lost cyan keycap","Tiny racing car","Bottle clue: try sl in About","Copper lanternfish"];const item=items[getSave().catches.length%items.length];saveAdventure({catches:[...getSave().catches,item].slice(-30)});complete("fishing");q.cast=-1;note.current(`Caught ${item}. It is catalogued on the harbor shelf.`);}else note.current("A ripple, but no catch. Watch the float and try again.");}
    if(action==="chat"){const hour=(q.t/8)%24;let nearest=0,nearestDistance=Infinity;residents.current.forEach((person,i)=>{if(!person)return;const distance=Math.hypot(q.x-person.position.x,q.z-person.position.z);if(distance<nearestDistance){nearest=i;nearestDistance=distance;}});if(nearestDistance>2.25){note.current("Walk up to a resident at the station, café or workshop to talk.");return;}const routine=RESIDENT_ROUTINES[nearest],place=residentAt(routine,hour).place;const line=place==="station"?(hour<12?"I am catching the morning train before the harbor gets busy.":"I am watching for the evening train; the platform is quieter now."):place==="workshop"?(hour<12?"We are opening the workshop and checking the tools.":"I am finishing a repair before the workshop closes."):place==="cafe"?(hour<11?"Breakfast is on; the first ferry should be here soon.":hour<17?"Lunch break. The harbor route works up an appetite.":"A warm drink before the last walk home."):hour<6?"The street is quiet. I will head out when the station opens.":"I am back home for the evening after my town round.";note.current(`${routine.name} · ${Math.floor(hour).toString().padStart(2,"0")}:00 · ${place}: “${line}”`);complete("residents");}
    if(action==="hour")q.t=THREE.MathUtils.clamp(value,0,23)*8;
    if(action==="view"&&feature==="portals"){complete("portals");note.current("You explored all three live floor windows.");}
    if(action==="paint")saveAdventure({carColor:COLORS[((Math.round(value)%COLORS.length)+COLORS.length)%COLORS.length]});
    if(action==="spoiler")saveAdventure({spoiler:!getSave().spoiler});
    if(action==="wheel")saveAdventure({wheel:((Math.round(value)%COLORS.length)+COLORS.length)%COLORS.length});
    if(action==="lamps"||action==="fountain"||action==="signs"){const state=getSave();saveAdventure({[action]:!state[action]});complete("controls");}
    if(action==="rival"){const wins=getRivalChallenge().every(challenge=>challenge.won);if(wins){complete("rival");note.current("Challenge cleared: you beat the robot in all three benchmarks.");}else note.current("Scoreboard checked. Beat all three robot benchmarks to clear the challenge.");}
    if(action==="switch")turnSwitch(value);
    if(action==="layer"){const next=cube.map((v,i)=>i===value?(v+1)%4:v);setCube(next);const route=cubeRoadLinks(next);if(route.connected){complete("cube");note.current("The road ports line up from the entry to the upper district. Gate open.");}else{const broken=route.links.findIndex(link=>!link);note.current(`Road connection ${broken+1} is offset. Rotate layers ${broken+1} and ${broken+2} until their ports meet.`);}}
    if(action==="shrink"){setPhase(phase?0:1);q.y=0;note.current(phase?"Back to your usual size.":"Tiny mode! Explore the giant keyboard and step over three glowing keycaps to power the arcade.");}
    if(action==="enter"){if(feature==="shrink"){if(phase===2){setPhase(1);note.current("Back outside the arcade. The keyboard plaza is still tiny; return to normal size whenever you like.");}else if(phase&&keycaps.length===3&&Math.abs(q.x-3)<.65&&Math.abs(q.z+1.85)<.55){setPhase(2);complete("shrink");note.current("You stepped onto the powered arcade entrance. Welcome to its tiny city!");}else if(phase&&keycaps.length<3)note.current(`The cabinet is still dark. Explore the keyboard to collect the ${3-keycaps.length} glowing keycaps.`);else if(phase)note.current("Stand on the lit entrance pad in front of the arcade cabinet to step inside.");else note.current("Shrink first, explore the keycaps, then walk to the lit arcade entrance.");}else{if(phase){if(pocketVisits.length===3){complete("pocket");note.current("Back home with the suitcase atlas complete: Pocket City, Home and Park mapped.");}else note.current(`Back in your apartment. Visit ${3-pocketVisits.length} more ${3-pocketVisits.length===1?"district":"districts"} before returning with a complete atlas.`);}setPhase(phase?0:1);q.x=0;q.z=.8;if(!phase){setPocketVisits([]);note.current("Inside the suitcase: visit HOME, PARK and POCKET CITY. Walk through each miniature district to map it.");}}}
    if(action==="zip"){q.zip=0;q.camera="ride";note.current("Clipped onto the zipline. Hold on!");}
    if(action==="rail"){q.ride=0;q.camera="ride";note.current("Hoverboard locked to the rooftop rail.");}
    if(action==="ride"){q.ride=0;q.camera="ride";note.current("Your coaster is leaving the station.");}
    if(action==="stopride"){q.ride=-1;q.zip=-1;q.camera="orbit";note.current("Ride stopped. The camera is back at the station.");}
    if(action==="camera"){q.camera=["orbit","chase","top"][value%3];}
    if(action==="note"){q.aim=value;setAim(value);q.commandAt=q.t;complete("music");}
    if(action==="run"){q.program=0;q.commandAt=q.t;q.dx=-2;q.dz=2;q.droneYaw=Math.PI;q.carry=false;setCarried(false);drone.current?.position.set(-2,.9,2);drone.current?.rotation.set(0,Math.PI,0);note.current("Drone program started at the launch pad. Collect at cyan, deliver at pink.");}
    if(action==="stop"){q.program=-1;q.ride=-1;q.zip=-1;q.camera="orbit";if(feature==="replay"){q.playing=false;q.replay=0;}}
    if(action==="aim"){q.aim=value;setAim(value);}
    if(action==="observe"){const target=project%6;const angle=target*Math.PI/3;if(Math.abs(Math.atan2(Math.sin(q.aim-angle),Math.cos(q.aim-angle)))<.25){complete("observatory");note.current(`${exhibits[project].title} · ${exhibits[project].technologies.join(", ")}`);}else note.current("Turn the telescope toward the selected constellation, then observe again.");}
    if(action==="transform"){q.vehicle=(q.vehicle+1)%3;setPhase(q.vehicle);q.y=0;q.vy=0;q.vehicleCompleted=false;if(q.vehicle===0){q.x=THREE.MathUtils.clamp(q.x,-1.35,1.35);q.z=THREE.MathUtils.clamp(q.z,-4.4,4.4);}else if(q.vehicle===1){q.x=3.1;q.z=0;}note.current(["Road mode: car stays on the marked road.","Boat mode: hull afloat. Steer inside the circular lagoon.","Flight mode: wings deployed. Set altitude and fly to the beacon."][q.vehicle]);}
    if(action==="altitude")q.alt=THREE.MathUtils.clamp(value,0,4);
    if(action==="record"){q.recording=!q.recording;q.recordStart=q.t;q.frames=[];note.current(q.recording?"Recording your workshop drive. Drive around, then choose Save recording.":"Recording stopped.");}
    if(action==="saveReplay"){if(q.frames.length>5){saveAdventure({replay:q.frames,replayMarkers:[]});note.current("Your drive is saved in Replay cinema.");}else note.current("Record a few seconds of driving first.");q.recording=false;}
    if(action==="play")q.playing=!q.playing;if(action==="speed")q.speed=value;if(action==="seek")q.replay=value;
    if(action==="marker"){q.replay=value;q.speed=.25;q.playing=true;}
    if(action==="reward"){if(getSave().completed.length>=3){complete("secrets");note.current("Your reward garden is growing. The mural appears at six activities and the little shop at ten.");}else note.current("Finish three activities to reveal the first transformation.");}
  }}),[camera.position,feature,phase,project,cube,turnSwitch,selectedPiece,moveMiniature,selectMiniature,keycaps.length,pocketVisits.length,onFerryLock,onFerryMoving,inspectProjectCase]);
  useFrame((_,raw)=>{const dt=Math.min(raw,.05),q=r.current;q.t+=dt;
    const k=keys.current;let dx=Number(k.has("d")||k.has("ArrowRight"))-Number(k.has("a")||k.has("ArrowLeft")),dz=Number(k.has("s")||k.has("ArrowDown"))-Number(k.has("w")||k.has("ArrowUp"));
    if(q.target){const vx=q.target[0]-q.x,vz=q.target[1]-q.z,d=Math.hypot(vx,vz);if(d<.12)q.target=null;else{dx=vx/d;dz=vz/d;}}
    const speed=feature==="transformer"?(phase===0?3.8:phase===1?2.6:4.6):feature==="garage"?3.8:phase===1&&feature==="shrink"?1.25:2.5;
    const ox=q.x,oz=q.z;
    if(q.ride<0&&q.zip<0){
      const room=feature==="home"||feature==="editor"||feature==="community"||feature==="pocket"&&phase===0;
      const range=feature==="transformer"&&phase===2?7:feature==="ferry"&&q.island?7.45:room?4.2:4.7;
      const roomItems: Furniture[]=room?(feature==="editor"?save.miniatures:feature==="community"?save.rooftop:save.furniture):[];
      const fixedItems=room?ROOM_OBSTACLES[feature]??[]:[];
      const blockedAt=(x:number,z:number)=>fixedItems.some(item=>Math.abs(x-item.x)<item.hw+.2&&Math.abs(z-item.z)<item.hd+.2)||roomItems.some(item=>Math.hypot(x-item.x,z-item.z)<FURNITURE_RADIUS[item.kind]+.12);
      if(room&&blockedAt(q.x,q.z)){
        const candidates=Array.from({length:17*17},(_,i)=>({x:q.x+(i%17-8)*.5,z:q.z+(Math.floor(i/17)-8)*.5})).sort((a,b)=>Math.hypot(a.x-q.x,a.z-q.z)-Math.hypot(b.x-q.x,b.z-q.z));
        const free=candidates.find(point=>Math.abs(point.x)<range&&Math.abs(point.z)<range&&!blockedAt(point.x,point.z));
        if(free){q.x=free.x;q.z=free.z;}
      }
      let nx=THREE.MathUtils.clamp(q.x+dx*dt*speed,-range,range),nz=THREE.MathUtils.clamp(q.z+dz*dt*speed,-range,range);
      if(feature==="ferry"&&q.island){nx=THREE.MathUtils.clamp(nx,4.55,7.45);nz=THREE.MathUtils.clamp(nz,-4.45,-1.3);}
      if(feature==="transformer"&&phase===0){nx=THREE.MathUtils.clamp(nx,-1.35,1.35);nz=THREE.MathUtils.clamp(nz,-4.4,4.4);}
      if(feature==="transformer"&&phase===1){const dx=nx-3.1,distance=Math.hypot(dx,nz);if(distance>1.48){nx=3.1+dx*1.48/distance;nz*=1.48/distance;}}
      const houses:[number,number,number,number][]=[];
      if(neighborhood){houses.push([-3,-3,.82,.72],[3,-3,.82,.72]);if(feature==="ferry")houses.push([6,-3,.9,.8]);if(feature==="residents")houses.push([0,-3,.9,.8]);}
      if(feature==="shrink"&&phase<2)houses.push([3,-3,.85,.75]);
      const houseBlocked=!(feature==="transformer"&&phase===2&&q.alt>2.1)&&houses.some(([x,z,rx,rz])=>Math.abs(nx-x)<rx&&Math.abs(nz-z)<rz);
      const roomBlocked=room&&blockedAt(nx,nz);
      const roofBlocked=feature==="rooftops"&&Array.from({length:5},(_,i)=>q.y<.6+i*.3-.08&&Math.abs(nx-(-3+i*1.45))<.65&&Math.abs(nz-(i%2?-.6:.6))<.65).some(Boolean);
      const blocked=houseBlocked||roomBlocked||roofBlocked;
      if(blocked){q.target=null;}else{q.x=nx;q.z=nz;}
      if(dx||dz)q.h=Math.atan2(dx,dz);
    }
    const moved=Math.hypot(q.x-ox,q.z-oz);q.distance+=moved;if(feature==="delivery"&&q.carry)q.routeLength+=moved;if(feature==="garage"&&q.distance>15)complete("garage");
    if(feature==="shrink"&&phase===1){const caps:[number,number][]=[[-2.875,-1],[-.575,.15],[1.725,1.3]];caps.forEach(([x,z],i)=>{if(!keycaps.includes(i)&&Math.hypot(q.x-x,q.z-z)<.55){setKeycaps(previous=>previous.includes(i)?previous:[...previous,i]);note.current(`Keycap ${keycaps.length+1}/3 powered. ${keycaps.length<2?"Find the next glowing key on the keyboard.":"The arcade cabinet is powered. Reach its pink entrance."}`);}});}
    if(feature==="pocket"&&phase>0){const districts:[string,number,number][]=[["POCKET CITY",0,-2],["HOME",-3,1],["PARK",3,1]];districts.forEach(([name,x,z])=>{if(!pocketVisits.includes(name)&&Math.hypot(q.x-x,q.z-z)<1.05){const next=[...pocketVisits,name];setPocketVisits(next);note.current(`${name} mapped · ${next.length}/3 districts. ${next.length===3?"Return to the suitcase in your apartment to finish the atlas.":"Explore the other landmarks."}`);}});}
    if(feature==="transformer"&&phase===2&&!q.vehicleCompleted&&q.alt>=2.5&&Math.hypot(q.x,q.z+3.8)<.85){q.vehicleCompleted=true;complete("transformer");note.current("Flight beacon reached. Road, water and air modes are all open.");}
    if(k.has(" ")&&q.y<=.01){q.vy=5;if(feature==="delivery"&&q.carry&&q.fragile){q.fragile=false;setParcelIntact(false);note.current("Hard bounce! The fragile parcel cracked. Return to the conveyor for a replacement.");}}
    let ground=0;if(feature==="rooftops"){for(let i=0;i<5;i++){const roof=.6+i*.3;if(Math.abs(q.x-(-3+i*1.45))<.65&&Math.abs(q.z-(i%2?-.6:.6))<.65&&q.y>=roof-.08&&q.vy<=0)ground=Math.max(ground,roof);}if(Math.hypot(q.x+3,q.z-3)<.7&&q.y<=.05)q.vy=7;}
    q.vy-=12*dt;q.y=Math.max(ground,q.y+q.vy*dt);if(q.y===ground)q.vy=0;
    if(player.current){const tiny=feature==="shrink"&&phase>0?.2:feature==="pocket"&&phase>0?.25:1;player.current.scale.setScalar(tiny);player.current.position.set(q.x,feature==="transformer"&&phase===2?q.alt:q.y,q.z);player.current.rotation.y=q.h-((feature==="garage"||feature==="transformer")?Math.PI/2:0);}
    if(feature==="delivery"&&shuttle.current&&q.carry){const back=new THREE.Vector3(q.x-Math.sin(q.h)*.72,.02,q.z-Math.cos(q.h)*.72);shuttle.current.position.lerp(back,1-Math.exp(-7*dt));shuttle.current.rotation.y=THREE.MathUtils.damp(shuttle.current.rotation.y,q.h,8,dt);}
    if(feature==="delivery"&&deliveryResident.current){const reacting=q.t<q.deliveryReactUntil;deliveryResident.current.position.y=reacting?Math.abs(Math.sin(q.t*9))*.2:0;}
    if(feature==="ferry"&&q.ride>=0){q.ride+=dt*.12;const t=Math.min(1,q.ride),routeT=q.returning?1-t:t,p=FERRY_ROUTE.getPoint(routeT),dir=FERRY_ROUTE.getTangent(routeT).multiplyScalar(q.returning?-1:1);if(boat.current){boat.current.position.set(p.x,p.y+(reduced?0:Math.sin(q.t*3)*.035),p.z);boat.current.rotation.y=Math.atan2(dir.x,dir.z);}if(q.ride>=1){q.ride=-1;q.camera="orbit";setFerryBoarded(false);onFerryMoving?.(false);if(q.returning){q.island=false;setFerryIsland(false);onFerryLock?.(false);q.x=0;q.z=3.7;if(control.current){control.current.target.set(0,.5,0);camera.position.set(7,7,8);control.current.update();}note.current("Back at the harbor. Choose another project island at the pier.");}else{q.island=true;setFerryIsland(true);q.x=6;q.z=-1.2;if(control.current){control.current.target.set(6,.5,-2);camera.position.set(10,7,5);control.current.update();}const exhibit=exhibits[project%exhibits.length];note.current(`Docked at ${exhibit.title}. Explore the island and inspect its project case, then return to the pier to sail home.`);}}if(q.camera==="ride"){const horizontal=new THREE.Vector3(dir.x,0,dir.z);if(horizontal.lengthSq()<.04)horizontal.set(0,0,1);else horizontal.normalize();camera.position.lerp(p.clone().addScaledVector(horizontal,-3.6).add(new THREE.Vector3(0,2.25,0)),Math.min(1,dt*5));camera.lookAt(p.x,.35,p.z);}}
    if(bobber.current){const a=q.cast<0?0:(q.t-q.cast)%2;bobber.current.position.y=.15+(reduced?0:Math.sin(q.t*5)*.06);(bobber.current.material as THREE.MeshStandardMaterial).emissiveIntensity=Math.abs(a-1)<.38?2.5:.3;}
    residents.current.forEach((g,i)=>{if(!g)return;const stop=residentAt(RESIDENT_ROUTINES[i],(q.t/8)%24);g.position.lerp(new THREE.Vector3(stop.point[0],0,stop.point[1]),Math.min(1,dt*7));g.rotation.y=Math.atan2(stop.point[0]-g.position.x,stop.point[1]-g.position.z);});
    layers.current.forEach((g,i)=>{if(g)g.rotation.y=THREE.MathUtils.damp(g.rotation.y,cube[i]*Math.PI/2,8,dt);});
    if(telescope.current)telescope.current.rotation.y=q.aim;
    if(feature==="drone"&&q.program>=0&&q.t-q.commandAt>.65){
      q.commandAt=q.t;const cmd=save.drone[q.program++];
      if(!cmd){q.program=-1;note.current("Program finished. Edit the commands and run it again.");}
      else if(cmd==="forward"){q.dz=Math.max(-2,q.dz-1);q.droneYaw=Math.PI;}
      else if(cmd==="back"){q.dz=Math.min(2,q.dz+1);q.droneYaw=0;}
      else if(cmd==="left"){q.dx=Math.max(-2,q.dx-1);q.droneYaw=-Math.PI/2;}
      else if(cmd==="right"){q.dx=Math.min(2,q.dx+1);q.droneYaw=Math.PI/2;}
      else if(cmd==="collect"){
        const atPickup=drone.current&&Math.hypot(drone.current.position.x+2,drone.current.position.z)<.48;
        if(atPickup){q.carry=true;setCarried(true);note.current("Parcel collected. Heading to the pink delivery pad.");}
        else{q.program=-1;note.current("Pickup failed: move the drone onto the cyan parcel before collecting.");}
      }else if(cmd==="deliver"){
        const atDrop=drone.current&&Math.hypot(drone.current.position.x,drone.current.position.z+2)<.48;
        if(q.carry&&atDrop){complete("drone");q.carry=false;q.program=-1;setCarried(false);note.current("Program successful. The parcel reached the pink pad.");}
        else{q.program=-1;note.current(q.carry?"Delivery failed: move onto the pink pad first.":"Delivery failed: collect the cyan parcel first.");}
      }
    }
    if(drone.current){drone.current.position.lerp(new THREE.Vector3(q.dx,.9+(reduced?0:Math.sin(q.t*3)*.035),q.dz),1-Math.exp(-8*dt));drone.current.rotation.y=THREE.MathUtils.damp(drone.current.rotation.y,q.droneYaw,8,dt);}
    if((feature==="coaster"||feature==="rooftops")&&q.ride>=0){
      q.ride+=dt*.12;const pt=curve.getPointAt(q.ride%1),dir=curve.getTangentAt(q.ride%1).normalize();
      if(cart.current){
        cart.current.position.set(pt.x,pt.y+.08,pt.z);
        if(feature==="rooftops")cart.current.rotation.y=Math.atan2(dir.x,dir.z);
        else{const forward=dir.clone(),worldUp=new THREE.Vector3(0,1,0),side=new THREE.Vector3().crossVectors(forward,worldUp);if(side.lengthSq()<.01)side.set(0,0,1);else side.normalize();const up=new THREE.Vector3().crossVectors(side,forward).normalize(),basis=new THREE.Matrix4().makeBasis(forward,up,side);cart.current.quaternion.slerp(new THREE.Quaternion().setFromRotationMatrix(basis),Math.min(1,dt*7));}
      }
      if(feature==="rooftops"&&player.current){player.current.position.copy(pt).add(new THREE.Vector3(0,.1,0));player.current.rotation.y=Math.atan2(dir.x,dir.z);}
      if(q.camera==="ride"||q.camera==="chase"){
        const horizontal=new THREE.Vector3(dir.x,0,dir.z);if(horizontal.lengthSq()<.04)horizontal.set(0,0,1);else horizontal.normalize();
        const desired=pt.clone().addScaledVector(horizontal,-3.6).add(new THREE.Vector3(0,2.5,0));
        camera.position.lerp(desired,Math.min(1,dt*5));camera.lookAt(pt.clone().addScaledVector(dir,1.25).add(new THREE.Vector3(0,.25,0)));
      }else if(q.camera==="top"){camera.position.lerp(new THREE.Vector3(0,12,.1),.15);camera.lookAt(pt);}
      if(q.ride>=1){complete(feature);q.ride=-1;q.camera="orbit";note.current("Back at the station. Ride complete!");}
    }
    if(q.zip>=0){q.zip+=dt*.25;const t=Math.min(1,q.zip);q.x=-4+t*8;q.z=-2;q.y=3-t;if(player.current)player.current.position.set(q.x,q.y,q.z);camera.position.lerp(new THREE.Vector3(q.x+2,q.y+2,q.z+3),.1);camera.lookAt(q.x,q.y,q.z);if(t===1){q.zip=-1;q.camera="orbit";complete("rooftops");note.current("Zipline landing! Try the trampoline or rooftop rail next.");}}
    if(q.recording&&q.frames.length<2400&&(q.frames.length===0||(q.t-q.recordStart)*1000-q.frames[q.frames.length-1][0]>=100)){const rot=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),q.h-Math.PI/2);q.frames.push([Math.round((q.t-q.recordStart)*1000),q.x,q.y,q.z,rot.x,rot.y,rot.z,rot.w]);}
    if(feature==="replay"&&save.replay.length>1){const end=save.replay[save.replay.length-1][0];if(q.playing)q.replay=(q.replay+dt*1000*q.speed)%Math.max(1,end);let i=0;while(i<save.replay.length-2&&save.replay[i+1][0]<q.replay)i++;const a=save.replay[i],b=save.replay[i+1],t=THREE.MathUtils.clamp((q.replay-a[0])/Math.max(1,b[0]-a[0]),0,1);if(cart.current){const x=THREE.MathUtils.lerp(a[1],b[1],t),y=THREE.MathUtils.lerp(a[2],b[2],t),z=THREE.MathUtils.lerp(a[3],b[3],t);cart.current.position.set(THREE.MathUtils.clamp(x,-4.5,4.5),THREE.MathUtils.clamp(y,.12,3.5),THREE.MathUtils.clamp(z,-4.5,4.5));cart.current.quaternion.slerpQuaternions(new THREE.Quaternion(a[4],a[5],a[6],a[7]),new THREE.Quaternion(b[4],b[5],b[6],b[7]),t);if(q.camera==="chase"){camera.position.lerp(cart.current.position.clone().add(new THREE.Vector3(1.5,1,2)),.15);camera.lookAt(cart.current.position);}if(q.camera==="top"){camera.position.set(0,12,.1);camera.lookAt(0,0,0);}}const report=lastReplayReport.current,now=performance.now();if(onReplayTime&&q.replay!==report.value&&(!q.playing||now-report.time>=100)){onReplayTime(q.replay);report.time=now;report.value=q.replay;}complete("replay");}
    if(control.current)control.current.enabled=q.camera==="orbit";
  });
  const furnitureMode=["home","editor","community"].includes(feature);
  const clickFloor=(x:number,z:number)=>{
    const q=r.current;
    if(feature==="editor"&&q.moving!==null){
      const id=q.moving;
      if(moveMiniature(id,x,z)){q.moving=null;note.current("Miniature moved and saved. Select another or keep arranging.");}
      return;
    }
    if(furnitureMode&&q.placing){
      const name=feature==="editor"?"miniatures":feature==="community"?"rooftop":"furniture",list=getSave()[name];
      if(list.length>=36){note.current("This little room has room for 36 objects. Remove one before adding more.");return;}
      const px=Math.round(x*2)/2,pz=Math.round(z*2)/2,radius=FURNITURE_RADIUS[selected];
      if(Math.hypot(px-q.x,pz-q.z)<radius+.2){note.current("Give yourself a little space before placing that object.");return;}
      if(Math.abs(px)+radius>4.7||Math.abs(pz)+radius>4.7){note.current("Leave a little room around the walls.");return;}
      const fixed=ROOM_OBSTACLES[feature]??[];
      if(fixed.some(item=>Math.abs(px-item.x)<radius+item.hw&&Math.abs(pz-item.z)<radius+item.hd)){note.current("That spot is reserved for the room furniture. Try an open patch of floor.");return;}
      if(list.some(item=>Math.hypot(px-item.x,pz-item.z)<radius+FURNITURE_RADIUS[item.kind]*.75)||feature==="community"&&flowers.slice(0,30).some((_,i)=>Math.hypot(px-(i%6-2.5)*.65,pz-(Math.floor(i/6)-2)*.65)<radius+.2)){note.current("Those pieces would overlap. Try an open patch of floor.");return;}
    saveAdventure({[name]:[...list,{id:(placementId.current=Math.max(Date.now(),placementId.current+1)),kind:selected,x:px,z:pz,turn:0}]});complete(feature);
    }else q.target=[x,z];
  };
  return <>
    <OrbitControls ref={control} makeDefault enablePan={false} minDistance={4} maxDistance={20} maxPolarAngle={Math.PI*.47} target={sceneViewPreset(feature).target}/>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.025,0]} onClick={e=>{if(e.object===e.eventObject)clickFloor(e.point.x,e.point.z);}}><planeGeometry args={[10,10]}/><meshBasicMaterial transparent opacity={0} depthWrite={false}/></mesh>{outdoors?<SoftSlab size={[10,.38,10]} color={neighborhood?"#738b68":outdoors?"#393056":"#28233e"} at={[0,-.425,0]} radius={.8} roughness={.88}/>:<SoftSlab size={[10,.12,10]} color={feature==="transformer"&&phase===1?"#31566f":feature==="home"?save.homeColor:"#28233e"} at={[0,-.145,0]} radius={.8} roughness={.88}/>}
    {outdoors?<><SoftSlab size={[9.68,.08,9.68]} color={neighborhood?"#506b54":"#332b4c"} at={[0,-.105,0]} radius={.78} roughness={.82}/><mesh rotation={[-Math.PI/2,0,0]} position={[0,-.3,0]}><planeGeometry args={[60,60]}/><meshStandardMaterial color="#153d60" metalness={.16} roughness={.38}/></mesh>{[-8,-5,5,8].map((x,i)=><mesh key={x} rotation={[-Math.PI/2,0,0]} position={[x,-.292,0]}><ringGeometry args={[.025+i*.012,.045+i*.012,96]}/><meshBasicMaterial color="#54849a" transparent opacity={.12}/></mesh>)}</>:null}{neighborhood?<><OutdoorLandscape/><House x={-3} z={-3} title="HOME"/><House x={3} z={-3} color="#f472b6" title="WORKSHOP"/>{[-3.5,3.5].map(x=><Tree key={x} x={x} z={1.8}/>)}</>:null}
    {feature==="delivery"?<>
      <Line points={[[-3,.025,0],[-2.5,.025,-1.15],[-1.25,.025,-1.72],[.35,.025,-1.92],[1.8,.025,-2.22],[2.55,.025,-2.7]]} color="#67e8f9" lineWidth={4} transparent opacity={.62}/>
      <Block size={[1.65,.12,1.15]} color="#8e654e" at={[-3,-.12,0]} radius={.1}/>
      <Block size={[1.28,.05,1.04]} color="#302a50" at={[-3,.005,0]} radius={.05}/>
      {[-.42,-.14,.14,.42].map(z=><mesh key={z} position={[-3,.075,z]} rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[.045,.045,1.16,10]}/><meshStandardMaterial color="#b7a7c9" metalness={.48} roughness={.34}/></mesh>)}
      <group visible={!carried}><Block size={[.5,.38,.5]} color="#8e654e" at={[-3,.11,0]} radius={.08}/><Block size={[.12,.4,.53]} color="#67e8f9" at={[-3,.11,0]} radius={.04}/><Block size={[.53,.12,.53]} color="#c28c63" at={[-3,.49,0]} radius={.045}/></group>
      {[-3.78,-2.22].map(x=><Block key={x} size={[.08,1.25,.08]} color="#c28c63" at={[x,0,-.36]} radius={.04}/>)}<Block size={[1.8,.13,.18]} color="#d4a779" at={[-3,1.25,-.36]} radius={.06}/><Block size={[1.56,.48,.08]} color="#31566f" at={[-3,1.38,-.29]} radius={.08}/><TextSign text="HARBOR PARCELS" width={1.42} height={.22} at={[-3,1.48,-.23]}/><TextSign text="CONVEYOR PICKUP" width={1.3} height={.18} at={[-3,.55,.3]}/>
      <group ref={shuttle} visible={carried}><Block size={[.82,.18,.94]} color="#514568" at={[0,.08,0]} radius={.12}/><Block size={[.68,.08,.72]} color="#c28c63" at={[0,.26,0]} radius={.08}/>{[-1,1].map(side=><mesh key={side} position={[side*.35,.11,.32]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.14,.14,.08,12]}/><meshStandardMaterial color="#211a32" metalness={.2}/></mesh>)}<Block size={[.32,.3,.36]} color={parcelIntact?"#67e8f9":"#f472b6"} at={[0,.34,0]} radius={.055}/><TextSign text={parcelIntact?"FRAGILE":"DAMAGED"} color={parcelIntact?"#173345":"#fff7ed"} width={.4} height={.12} at={[0,.49,.19]}/></group>
      <group ref={deliveryResident} position={[3,0,-1.7]}><Block size={[1.15,.12,.8]} color="#b78367" at={[0,0,0]} radius={.12}/><Person color="#f472b6"/><TextSign text={delivered?"THANK YOU!":"RESIDENT · DELIVERY"} width={1.75} height={.18} at={[0,1.8,0]}/></group>
      <group position={[3,0,-1.7]}><Ring color={delivered?"#34d399":"#f472b6"} at={[0,.03,0]} radius={.72} tube={.045}/><TextSign text="DESTINATION · PINK PORCH" width={2.15} height={.19} at={[0,1.18,0]}/></group>
      <TextSign text="FRAGILE · NO JUMPS" width={1.95} height={.18} color="#f4d99a" at={[-1.5,.55,-1.2]}/><TextSign text="FOLLOW ROUTE TO PINK PORCH" width={2.55} height={.2} color="#f4d99a" at={[.7,.55,-2.85]}/>
    </>:null}
    {feature==="ferry"?<>
      <Block size={[2,.18,1.2]} color="#6d5478" at={[0,-.08,4.8]}/>
      <TextSign text="HARBOR FERRY · BOARD HERE" width={2.4} height={.22} at={[0,.82,4.6]}/>
      <group ref={boat} position={[0,.1,4.7]}><Blob r={[.72,.36]} at={[0,-.06,0]}/><FerryBoat/>{ferryBoarded?<group position={[0,.4,.12]}><Person color="#f472b6"/></group>:null}</group>
      <Block size={[2,.18,1]} color={exhibits[project].theme.accent} at={[6,-.08,-1.85]}/>
      <TextSign text={ferryIsland?"HARBOR FERRY · SAIL HOME":"PROJECT PIER · ARRIVAL"} width={2.2} height={.18} at={[6,.8,-1.8]}/>
      <group position={[6,0,-3]} onClick={e=>{e.stopPropagation();inspectProjectCase();}}>
        <Block size={[3,.4,3]} color="#3b3157" at={[0,-.2,0]} radius={.2}/>
        <House x={0} z={0} color={exhibits[project].theme.accent} title={exhibits[project].title}/>
        <Block size={[1.2,.16,.62]} color={exhibits[project].theme.accent} at={[0,.22,1.02]} radius={.1}/>
        <Ring color={exhibits[project].theme.accent} at={[0,.48,1.02]} radius={.34} tube={.05}/>
        <TextSign text="PROJECT CASE · CLICK TO READ" width={2.25} height={.18} at={[0,1.08,1.14]}/>
      </group>
    </>:null}
    {feature==="fishing"?<>
      <FishingRig bobberRef={bobber}/>
      <group position={[3,0,.7]}>
        <Block size={[3.3,.14,1.65]} color="#8e654e" at={[0,.02,0]} radius={.15}/>
        <Block size={[3.08,1.35,.12]} color="#302a50" at={[0,.16,-.66]} radius={.12}/>
        <Block size={[2.82,.92,.035]} color="#514568" at={[0,.34,-.58]} radius={.08}/>
        <TextSign text={`HARBOR CATCHES · ${save.catches.length}`} width={2.6} height={.2} at={[0,1.18,-.5]}/>
        {save.catches.slice(-5).map((item,i)=><group key={`${item}-${i}`} position={[-1.08+i*.54,0,.12]} onClick={e=>{e.stopPropagation();note.current(item.includes("Bottle")?"Clue recovered: try sl in About.":`${item} · added to the harbor catch log.`);}}>
          <CatchDisplayItem item={item}/><TextSign text={item.includes("keycap")?"KEYCAP":item.includes("racing car")?"MINI CAR":item.includes("Bottle")?"BOTTLE":item.includes("koi")?"KOI":"FISH"} width={.48} height={.12} at={[0,.08,.36]}/>
        </group>)}
        {!save.catches.length?<TextSign text="CAST A LINE TO START THE LOG" width={2.5} height={.18} at={[0,.72,-.48]}/>:null}
      </group>
    </>:null}
    {feature==="journal"?<><Block size={[3.8,.12,2.4]} color="#302a50" at={[0,.04,-1]} radius={.18}/><TextSign text="PHOTO JOURNAL" width={3} height={.3} at={[0,2.1,-2.3]}/>{exhibits.slice(0,3).map((exhibit,i)=><group key={exhibit.id} position={[(i-1)*1.2,.12,-1]}><Block size={[.94,.18,.86]} color="#514568" at={[0,0,0]} radius={.12}/><Block size={[.72,.55,.08]} color={exhibit.theme.accent} at={[0,.35,-.2]} radius={.08}/><House x={0} z={.16} color={exhibit.theme.accent} title={exhibit.title.slice(0,11)}/><Ring color="#f4d99a" at={[0,.52,.52]} radius={.36} tube={.025}/></group>)}</>:null}
    {feature==="residents"?<>{RESIDENT_ROUTINES.map((resident,i)=><group key={resident.name} ref={g=>{residents.current[i]=g;}}><Person color={resident.color}/></group>)}<House x={0} z={-3} color="#fbbf24" title="CAFÉ"/><Block size={[2.4,.14,1.7]} color="#514568" at={[0,.05,3.25]} radius={.14}/>{[-.82,.82].map(x=><Block key={x} size={[.08,1.45,.08]} color="#c28c63" at={[x,.72,3.6]} radius={.035}/>)}<Block size={[2,.14,1.3]} color="#a78bfa" at={[0,1.45,3.6]} radius={.11}/><Block size={[1.05,.54,.08]} color="#302a50" at={[0,.56,3.5]} radius={.08}/><TextSign text="TOWN STATION" width={1.8} height={.2} at={[0,1.8,3.58]}/><Block size={[3.6,.09,.18]} color="#d8c2a0" at={[0,.12,4.18]} radius={.07}/></>:null}
    {furnitureMode||feature==="pocket"&&phase===0?<><RoomShell feature={feature==="pocket"?"pocket":feature} color={feature==="home"?save.homeColor:"#a78bfa"} completed={save.completed.length}/>{(feature==="editor"?save.miniatures:feature==="community"?save.rooftop:save.furniture).map(item=><group key={item.id} onClick={feature==="editor"?event=>{event.stopPropagation();selectMiniature(item.id);r.current.moving=null;note.current(`Selected ${item.kind}. Move it, rotate it, or remove it with the controls.`);}:undefined}><Furnishing item={item}/>{feature==="editor"&&selectedPiece===item.id?<Ring color="#fff3ca" at={[item.x,.045,item.z]} radius={FURNITURE_RADIUS[item.kind]+.12} tube={.045}/>:null}</group>)}{save.completed.slice(0,8).map((id,i)=><Block key={id} size={[.2,.35,.2]} color="#fbbf24" at={[-3.5+i*.4,1.2,-4.8]}/>)}</>:null}
    {feature==="pocket"&&phase>0?<><Block size={[10,.4,10]} color="#302a50" at={[0,-.2,0]} radius={.24}/><Block size={[9.7,.035,9.7]} color="#514568" at={[0,.02,0]} radius={.22}/><House x={0} z={-2} title="POCKET CITY"/><House x={-3} z={1} color="#67e8f9" title="HOME"/><House x={3} z={1} color="#34d399" title="PARK"/><Tree x={-2} z={3}/><Tree x={2} z={3}/>{[[0,-2,"POCKET CITY"],[-3,1,"HOME"],[3,1,"PARK"]].map(([x,z,label])=><Ring key={label} color={pocketVisits.includes(String(label))?"#34d399":"#f4d99a"} at={[Number(x),.08,Number(z)]} radius={.7} tube={.045}/>) }<TextSign text={`SUITCASE ATLAS · ${pocketVisits.length}/3`} width={3.4} height={.3} at={[0,2.2,-2]}/></>:null}
    {feature==="rival"?<><Robot/><RivalBoard refreshKey={rivalRefresh}/></>:null}
    {feature==="controls"?<>
      <group position={[2,0,0]}>
        <Block size={[2,.14,1.7]} color="#39344b" at={[0,.28,0]} radius={.16}/>
        <Block size={[1.82,.055,1.52]} color="#302a50" at={[0,.42,0]} radius={.12}/>
        {[-.78,.78].flatMap(x=>[-.62,.62].map(z=><Block key={`${x}:${z}`} size={[.12,.3,.12]} color="#514568" at={[x,0,z]} radius={.045}/>))}
        <Block size={[1.48,.38,.08]} color="#211a32" at={[0,.53,-.66]} radius={.075}/>
        <TextSign text="CITY CONTROL · 03 SYSTEMS" width={1.26} height={.14} at={[0,.68,-.61]}/>
        {[
          {label:"LIGHTS",enabled:save.lamps,color:"#67e8c9"},
          {label:"WATER",enabled:save.fountain,color:"#67e8f9"},
          {label:"SIGNS",enabled:save.signs,color:"#f472b6"},
        ].map(({label,enabled,color},index)=>{
          const x=(index-1)*.55;
          return <group key={label}>
            <Block size={[.38,.045,.52]} color="#17141d" at={[x,.475,0]} radius={.055}/>
            <Block size={[.26,.04,.34]} color={enabled?color:"#514568"} at={[x,.52,0]} radius={.045} glow={enabled ? 0.35 : 0}/>
            <Ring color={enabled?color:"#625b73"} at={[x,.565,0]} radius={.09} tube={.012}/>
            <TextSign text={label} width={.34} height={.075} color="#f4f2ff" background="#302a50" at={[x,.61,.33]}/>
          </group>;
        })}
      </group>
      {save.fountain?<group position={[-1,.08,-1]}><mesh><cylinderGeometry args={[.78,.88,.22,40]}/><meshStandardMaterial color="#514568" roughness={.42}/></mesh><mesh position={[0,.12,0]}><cylinderGeometry args={[.7,.7,.035,40]}/><meshStandardMaterial color="#3184a0" metalness={.32} roughness={.22}/></mesh><Ring color="#67e8f9" at={[0,.15,0]} radius={.56} tube={.045}/><mesh position={[0,.3,0]}><cylinderGeometry args={[.11,.18,.32,20]}/><meshStandardMaterial color="#86d7df" metalness={.4} roughness={.26}/></mesh>{[-1,1].map(side=><mesh key={side} position={[side*.24,.46,0]}><cylinderGeometry args={[.025,.055,.34,10]}/><meshStandardMaterial color="#67e8f9" transparent opacity={.78}/></mesh>)}<mesh position={[0,.55,0]}><sphereGeometry args={[.12,14,12]}/><meshStandardMaterial color="#d8fbff" emissive="#67e8f9" emissiveIntensity={.35}/></mesh></group>:null}
      {save.lamps?[-3.5,3.5].map(x=><group key={x}><mesh position={[x,.83,1]}><cylinderGeometry args={[.055,.09,1.55,12]}/><meshStandardMaterial color="#514568" metalness={.35} roughness={.32}/></mesh><Block size={[.24,.12,.24]} color="#b78367" at={[x,.04,1]} radius={.07}/><mesh position={[x,1.64,1]}><sphereGeometry args={[.19,16,12]}/><meshStandardMaterial color="#f5d78d" emissive="#f5d78d" emissiveIntensity={.38} roughness={.24}/></mesh><Ring color="#f5d78d" at={[x,1.64,1]} radius={.24} tube={.025}/></group>):null}
      {save.signs?<><TextSign text="LIGHTS · WATER · WAYFINDING" width={4} height={.35} at={[0,2,-1]}/><Block size={[1.4,.62,.16]} color="#302a50" at={[0,1.55,-1]} radius={.12}/><Block size={[1.2,.42,.035]} color="#a78bfa" at={[0,1.56,-.9]} radius={.05}/><Block size={[.12,.4,.08]} color="#fbbf24" at={[-.42,1.1,-.82]} radius={.04}/><Ring color="#67e8f9" at={[.36,1.65,-.85]} radius={.13} tube={.025}/></>:null}
    </>:null}
    {feature==="community"&&flowers.length?<>
      <group position={[0,.13,-.3]}>{flowers.slice(0,30).map((flower,i)=><group key={`${flower.flower}-${flower.color}-${i}`} position={[(i%6-2.5)*.65,0,(Math.floor(i/6)-2)*.65]}><RooftopFlower flower={flower.flower} color={flower.color}/></group>)}</group>
      {flowers.filter(flower=>flower.message?.trim()).slice(0,6).map((flower,i)=>{
        const x=(i-2.5)*1.35,lines=wrapNote(flower.message??"",15,3),author=(flower.name?.trim()||"Garden neighbor").slice(0,16),date=flower.at?new Date(flower.at).toLocaleDateString(undefined,{month:"short",day:"numeric"}):"";
        return <group key={`note-${flower.at??i}-${author}`} position={[x,0,3.45]} onClick={event=>{event.stopPropagation();note.current(`${author}: ${flower.message}`);}}>
          <Block size={[1.22,.94,.12]} color="#514568" at={[0,.62,0]} radius={.1}/><Block size={[1.08,.8,.045]} color={flower.color} at={[0,.64,.085]} radius={.055}/>
          <TextSign text={author} width={.98} height={.14} color="#fff7ed" background="#302a50" at={[0,.91,.115]}/>
          {lines.map((line,lineIndex)=><TextSign key={lineIndex} text={line} width={.98} height={.13} color="#e8e4ff" background="#302a50" at={[0,.72-lineIndex*.15,.115]}/>)}
          {date?<TextSign text={date} width={.72} height={.11} color="#c3b9db" background="#302a50" at={[0,.33,.115]}/>:null}
          <Block size={[.08,.22,.08]} color="#c28c63" at={[0,.13,0]} radius={.025}/>
        </group>;
      })}
    </>:null}
    {feature==="secrets"?<><group position={[0,0,-1]}>{Array.from({length:Math.min(16,save.completed.length)},(_,i)=><Tree key={i} x={(i%4-1.5)*1.4} z={Math.floor(i/4)*1.25-2}/>)}</group><Block size={[5.8,2.4,.18]} color="#302a50" at={[0,1.2,-4.72]} radius={.14}/><Block size={[5.35,1.95,.08]} color="#514568" at={[0,1.22,-4.6]} radius={.1}/>{save.completed.length>=6?<><Block size={[4.9,1.3,.04]} color="#67c7d4" at={[0,1.3,-4.53]} radius={.12}/><TextSign text="PLAY · BUILD · EXPLORE" color="#f472b6" width={4.4} height={.5} at={[0,1.5,-4.48]}/></>:null}{save.completed.length>=10?<><House x={3} z={0} color="#34d399" title="GARDEN CAFE"/><Block size={[.9,.16,.9]} color="#c28c63" at={[3,0,1.2]} radius={.12}/><Block size={[.08,.65,.08]} color="#8e654e" at={[3,.34,1.2]} radius={.04}/></>:null}</>:null}
    {feature==="cube"?<>
      {[0,1,2].map(layer=>{const road=CUBE_ROADS[layer],entry=cubeRoute.ports[layer].entry,exit=cubeRoute.ports[layer].exit;const entryOpen=layer===0||cubeRoute.links[layer-1],exitOpen=layer===2||cubeRoute.links[layer];const roadColor=["#a78bfa","#67e8f9","#f472b6"][layer];return <group key={layer} ref={g=>{layers.current[layer]=g;}} position={[0,layer*1.1,0]}>
        {[-1,0,1].flatMap(x=>[-1,0,1].map(z=><group key={`${x}:${z}`} position={[x*1.5,0,z*1.5]}><SoftSlab size={[1.42,.15,1.42]} color={["#a78bfa","#67e8f9","#f472b6"][layer]} at={[0,0,0]} radius={.2} roughness={.42}/><SoftSlab size={[1.18,.025,1.18]} color={layer===0?"#c4b5fd":layer===1?"#a5f3fc":"#fbcfe8"} at={[0,.15,0]} radius={.18} roughness={.55}/>{Math.abs(x)===1&&Math.abs(z)===1?(x+z+layer)%2===0?<group position={[.38,.1,.32]} scale={.25}><House x={0} z={0} color={roadColor}/></group>:<group position={[-.35,.08,-.32]} scale={.3}><Tree x={0} z={0}/></group>:null}</group>))}
        <Line points={road.path.map(([x,z])=>[x,.19,z] as [number,number,number])} color="#211a32" lineWidth={22}/>
        <Line points={road.path.map(([x,z])=>[x,.205,z] as [number,number,number])} color={roadColor} lineWidth={13}/>
        <Line points={road.path.map(([x,z])=>[x,.22,z] as [number,number,number])} color="#fff7ed" lineWidth={3}/>
        <Ring color={entryOpen?"#34d399":"#ff5b84"} at={[entry[0],.23,entry[1]]} radius={.3} tube={.065}/>
        <Ring color={exitOpen?"#34d399":"#ff5b84"} at={[exit[0],.23,exit[1]]} radius={.3} tube={.065}/>
        <TextSign text={`LAYER ${layer+1}`} width={1.12} height={.18} color="#fff7ed" background="#211a32" at={[0,.48,2.25]}/>
      </group>;})}
      {cubeRoute.links.map((connected,i)=>{if(!connected)return null;const p=cubeRoute.ports[i].exit;return <group key={`lift-${i}`} position={[p[0],i*1.1+.18,p[1]]}><mesh position={[0,.46,0]}><cylinderGeometry args={[.08,.08,.92,10]}/><meshStandardMaterial color="#34d399" emissive="#34d399" emissiveIntensity={.3} transparent opacity={.86}/></mesh><Ring color="#d8fbff" at={[0,.46,0]} radius={.14} tube={.025}/></group>;})}
      <Ring color="#67e8f9" at={[cubeRoute.ports[0].entry[0],.22,cubeRoute.ports[0].entry[1]]} radius={.3} tube={.045}/>
      <TextSign text="ENTRY" width={1} height={.16} color="#fff7ed" background="#211a32" at={[cubeRoute.ports[0].entry[0],.54,cubeRoute.ports[0].entry[1]+.42]}/>
      <SoftSlab size={[3.5,.14,.14]} color="#514568" at={[0,3.78,3.08]} radius={.07}/><SoftPanel size={[2.35,.34,.12]} color="#302a50" at={[0,3.95,3.08]} radius={.16}/><TextSign text={cubeRoute.connected?"DISTRICT OPEN":`ROUTES ${cubeRoute.links[0]?"01 ✓":"01 ·"}  ${cubeRoute.links[1]?"02 ✓":"02 ·"}`} width={2.1} height={.17} color={cubeRoute.connected?"#8cf0b0":"#ffe29a"} background="#211a32" at={[0,3.95,3.16]}/>
      {cubeRoute.connected?<Ring color="#34d399" at={[cubeRoute.ports[2].exit[0],2.45,cubeRoute.ports[2].exit[1]]} radius={.48} tube={.07} rotation={[0,0,0]}/>:<Block size={[1.2,.12,.12]} color="#f472b6" at={[cubeRoute.ports[2].exit[0],2.4,cubeRoute.ports[2].exit[1]]} radius={.05}/>}
    </>:null}
    {feature==="repairs"||feature==="power"?<>
      <House x={0} z={-2} color={circuitLive?"#34d399":exhibits[project].theme.accent} title={circuitLive?"POWER ONLINE":"POWER OFFLINE"}/>
      <TextSign text={exhibits[project].title} width={3} height={.25} at={[0,2.35,-2]}/>
      <TextSign text={circuitLive?"DISTRICT GRID · LIVE":"MATCH THE GOLD TARGET ARROWS"} width={5.1} height={.2} color={circuitLive?"#34d399":"#c7b7dc"} at={[0,1.3,-1.58]}/>
      <Block size={[8.2,.2,3.2]} color="#302a50" at={[0,.02,.42]} radius={.24}/>
      <Block size={[7.92,.08,2.98]} color="#514568" at={[0,.22,.42]} radius={.2}/>
      <Block size={[7.58,.045,2.62]} color="#39334f" at={[0,.3,.42]} radius={.16}/>
      {[-3.78,3.78].map(x=><group key={x}><Block size={[.07,.08,2.72]} color="#c28c63" at={[x,.31,.42]} radius={.03}/><Ring color="#a78bfa" at={[x,.36,-.7]} radius={.08} tube={.018}/><Ring color="#a78bfa" at={[x,.36,1.55]} radius={.08} tube={.018}/></group>)}
      <Block size={[6.7,.06,.075]} color="#c28c63" at={[0,.34,1.52]} radius={.03}/>
      <Block size={[6.7,.06,.075]} color="#c28c63" at={[0,.34,-.68]} radius={.03}/>
      {switches.map((v,i)=>{const x=-3+i*2;const color=["#67e8f9","#a78bfa","#f472b6","#34d399"][i];const live=v===targets[i],technology=exhibits[project].technologies[i%exhibits[project].technologies.length];return <group key={i} position={[x,0,.42]} onClick={e=>{e.stopPropagation();turnSwitch(i);}}>
        <Block size={[1.28,.3,1.28]} color="#302a50" at={[0,.3,0]} radius={.12}/>
        <Block size={[1.12,.06,1.12]} color={live?"#315e55":"#6b5a7d"} at={[0,.6,0]} radius={.1}/>
        <Ring color={live?"#34d399":color} at={[0,.65,0]} radius={.43} tube={.035}/>
        <mesh position={[0,.68,0]}><cylinderGeometry args={[.29,.34,.12,20]}/><meshStandardMaterial color="#211a32" metalness={.3} roughness={.38}/></mesh>
        <group rotation={[0,v*Math.PI/2,0]}>
          <Block size={[.13,.12,1.05]} color={color} at={[0,.74,0]} radius={.055} glow={live?.55:.12}/>
          <mesh position={[0,.84,.43]}><sphereGeometry args={[.105,12,8]}/><meshStandardMaterial color="#fde7b0" metalness={.35} roughness={.28}/></mesh>
          <Block size={[.52,.09,.14]} color="#fde7b0" at={[.24,.73,.24]} radius={.04}/>
        </group>
        <group position={[.59,.68,0]} rotation={[0,targets[i]*Math.PI/2,0]}><Block size={[.06,.045,.36]} color="#fff3ca" at={[0,0,.05]} radius={.025}/><mesh position={[0,.006,.24]}><coneGeometry args={[.1,.18,3]}/><meshStandardMaterial color="#fff3ca"/></mesh></group>
        <mesh position={[0,.84,-.38]}><sphereGeometry args={[.095,10,8]}/><meshStandardMaterial color={live?"#46f0a0":"#3a3448"} emissive={live?"#34d399":"#211a32"} emissiveIntensity={live?.65:0}/></mesh>
        <mesh position={[-.43,.7,-.43]}><sphereGeometry args={[.045,8,6]}/><meshStandardMaterial color="#e7d8b9" metalness={.45}/></mesh>
        <mesh position={[.43,.7,-.43]}><sphereGeometry args={[.045,8,6]}/><meshStandardMaterial color="#e7d8b9" metalness={.45}/></mesh>
        <TextSign text={feature==="power"?`ENERGY ${i+1}`:technology.toUpperCase().slice(0,13)} width={.98} height={.15} at={[0,.42,.73]}/>
        <TextSign text={`TARGET ${targets[i]*90}°`} width={.72} height={.13} color="#fff3ca" at={[0,.99,0]}/>
      </group>;})}
      {[-3, -1, 1, 3].map((x,i)=>{const colors=["#67e8f9","#a78bfa","#f472b6","#34d399"],live=switches.slice(0,i+1).every((value,index)=>value===targets[index]);return <Line key={`cable-${i}`} points={[[x,.78,.42],[x+.28,.82,-.28],[x+1.45,.82,-.28],[x+2,.78,.42]]} color={live?colors[i]:"#655a70"} lineWidth={live?5:3} transparent opacity={live?.95:.55}/>})}
      <TextSign text={`${exhibits[project].technologies.slice(0,3).join(" · ").toUpperCase()}`} width={4.2} height={.18} color={exhibits[project].theme.accent} at={[0,2.75,-2]}/>
      <group position={[4.12,0,.42]}>
        <mesh position={[0,.08,0]}><cylinderGeometry args={[.39,.48,.2,24]}/><meshStandardMaterial color="#514568" metalness={.3} roughness={.4}/></mesh>
        <mesh position={[0,.31,0]}><cylinderGeometry args={[.23,.28,.28,20]}/><meshStandardMaterial color={circuitLive?"#34d399":exhibits[project].theme.accent} metalness={.18} roughness={.48}/></mesh>
        <Ring color={circuitLive?"#34d399":exhibits[project].theme.accent} at={[0,.48,0]} radius={.26} tube={.045}/>
        <mesh position={[0,.57,0]}><sphereGeometry args={[.16,14,10]}/><meshStandardMaterial color={circuitLive?"#34d399":"#a78bfa"} emissive={circuitLive?"#34d399":"#a78bfa"} emissiveIntensity={circuitLive?.85:.25}/></mesh>
        <TextSign text={circuitLive?"PROJECT LIVE":"PROJECT PORT"} width={1.45} height={.16} color={circuitLive?"#34d399":"#e8e4ff"} at={[0,1.05,0]}/>
      </group>
    </>:null}
    {feature==="shrink"?<><SoftSlab size={[7.1,.09,3.45]} color="#514568" at={[0,-.105,.15]} radius={.3}/><SoftSlab size={[6.95,.035,3.3]} color="#a78bfa" at={[0,-.035,.15]} radius={.28}/><group position={[0,0,0]}>{Array.from({length:18},(_,i)=><group key={i} position={[(i%6-2.5)*1.15,0,Math.floor(i/6)*1.15-1]}><SoftSlab size={[1,.08,1]} color={i%3?"#ddd6fe":"#a78bfa"} at={[0,-.08,0]} radius={.24} roughness={.42}/><SoftSlab size={[.9,.045,.9]} color={i%3?"#f4f0ff":"#c4b5fd"} at={[0,0,0]} radius={.21} roughness={.48}/><TextSign text={"QWERTYASDFGHZXCVBN"[i]} width={.4} height={.4} at={[0,.05,.1]} rotation={[-Math.PI/2,0,0]}/></group>)}</group>{[[-2.875,-1],[-.575,.15],[1.725,1.3]].map(([x,z],i)=><group key={i}><Ring color={keycaps.includes(i)?"#34d399":"#f4d99a"} at={[x,.08,z]} radius={.38} tube={.07}/>{keycaps.includes(i)?<Block size={[.26,.22,.26]} color="#34d399" at={[x,.2,z]} radius={.07} glow={.4}/>:null}</group>)}{phase===2?<group position={[3,0,-3]} scale={.4}><Block size={[3,.08,3]} color="#44365f" at={[0,0,0]}/><TextSign text="ARCADE CITY · LEAVE WITH BUTTON" width={3.3} height={.3} at={[0,1.3,-1.1]}/>{[-.8,0,.8].map((x,i)=><group key={x} position={[x,.08,i%2?.5:-.5]} scale={.48}><House x={0} z={0} color={["#67e8f9","#f472b6","#34d399"][i]} title={["HOME","ARCADE","CAFE"][i]}/></group>)}</group>:<><group position={[3,0,-3]}><ArcadeCabinet open={keycaps.length===3}/><TextSign text={keycaps.length===3?"POWERED · USE ENTRANCE PAD":"FIND 3 KEYCAPS"} width={2.5} height={.2} at={[0,2.1,.55]}/></group><Ring color={keycaps.length===3?"#34d399":"#f472b6"} at={[3,.08,-1.85]} radius={.48} tube={.075}/><TextSign text={keycaps.length===3?"STEP HERE · ENTER":"ARCADE ENTRANCE"} width={1.9} height={.18} at={[3,.62,-1.85]}/></>}</>:null}
    {feature==="rooftops"?<><TrackRig curve={curve}/>{Array.from({length:5},(_,i)=><group key={i} position={[-3+i*1.45,0,i%2?-.6:.6]}><SoftSlab size={[1.3,.54+i*.3,1.3]} color={["#a78bfa","#67e8f9","#f472b6"][i%3]} at={[0,0,0]} radius={.28} roughness={.5}/><SoftPanel size={[.24,.28,.025]} color="#514568" at={[0,.03,.675]} radius={.07}/><SoftPanel size={[.12,.14,.012]} color="#f4d99a" at={[0,.14,.692]} radius={.035}/>{Array.from({length:Math.max(1,Math.floor((.54+i*.3-.32)/.32))},(_,row)=><Fragment key={row}><SoftPanel size={[.2,.17,.025]} color={row%2?"#67e8f9":"#f4d99a"} at={[-.32,.28+row*.32,.675]} radius={.055}/><SoftPanel size={[.2,.17,.025]} color={row%2?"#f4d99a":"#67e8f9"} at={[.32,.28+row*.32,.675]} radius={.055}/><SoftPanel size={[.2,.17,.025]} color={row%2?"#67e8f9":"#f4d99a"} at={[.675,.28+row*.32,-.28]} rotation={[0,Math.PI/2,0]} radius={.055}/><SoftPanel size={[.2,.17,.025]} color={row%2?"#f4d99a":"#67e8f9"} at={[.675,.28+row*.32,.28]} rotation={[0,Math.PI/2,0]} radius={.055}/></Fragment>)}<SoftPanel size={[1.12,.035,.025]} color="#e8e4ff" at={[0,.54+i*.3-.1,.675]} radius={.015}/><SoftPanel size={[1.12,.035,.025]} color="#e8e4ff" at={[.675,.54+i*.3-.1,0]} rotation={[0,Math.PI/2,0]} radius={.015}/><SoftSlab size={[1.23,.058,1.23]} color="#c9b9d8" at={[0,.54+i*.3,0]} radius={.22} roughness={.58}/><SoftSlab size={[.62,.035,.62]} color="#91b99c" at={[0,.565+i*.3,0]} radius={.28} roughness={.84}/></group>)}<group position={[-3,0,3]}><SoftSlab size={[1.2,.08,1.2]} color="#514568" at={[0,-.08,0]} radius={.28}/><Ring color="#67e8f9" at={[0,.025,0]} radius={.43} tube={.055}/><mesh position={[0,.012,0]} rotation={[-Math.PI/2,0,0]}><circleGeometry args={[.38,32]}/><meshStandardMaterial color="#34d399" roughness={.72} side={THREE.DoubleSide}/></mesh></group><SoftSlab size={[1.05,.07,.85]} color="#27293e" at={[3,0,3]} radius={.18}/>{[-.28,0,.28].map(x=><mesh key={x} position={[3+x,.08,3]}><tubeGeometry args={[new THREE.CatmullRomCurve3([new THREE.Vector3(0,0,-.34),new THREE.Vector3(0,.015,0),new THREE.Vector3(0,0,.34)]),8,.012,6,false]}/><meshStandardMaterial color="#67c7d4"/></mesh>)}{[-4,4].map((x)=><group key={x} position={[x,0,-2]}><mesh position={[0,(x>0?2.85:3.85)/2,0]}><cylinderGeometry args={[.07,.1,x>0?2.85:3.85,12]}/><meshStandardMaterial color="#c28c63" roughness={.7}/></mesh><mesh position={[0,x>0?2.85:3.85,0]}><sphereGeometry args={[.11,12,8]}/><meshStandardMaterial color="#f4d99a"/></mesh></group>)}<mesh><tubeGeometry args={[new THREE.CatmullRomCurve3([new THREE.Vector3(-4,3.85,-2),new THREE.Vector3(0,3.35,-2),new THREE.Vector3(4,2.85,-2)]),48,.025,8,false]}/><meshStandardMaterial color="#e8e4ff"/></mesh><group ref={cart}><Blob r={[.58,.32]} at={[0,.012,0]}/><Skiff ink={INK} body="#a78bfa" glow="#67e8f9"/></group></>:null}
    {feature==="coaster"?<><TrackRig curve={curve}/>{save.coaster.map((h,i)=><group key={i} position={[Math.sin(i*Math.PI/4)*4,0,Math.cos(i*Math.PI/4)*4]}><Block size={[.16,.52+h*.55,.16]} color="#514568" at={[0,0,0]} radius={.055}/><Ring color="#f4d99a" at={[0,.25+h*.275,0]} radius={.14} tube={.02} rotation={[0,0,0]}/></group>)}<Block size={[1.5,.18,1.2]} color="#8e654e" at={[0,.16,4.2]} radius={.12}/><TextSign text="SPEEDWAY STATION" width={2.4} height={.2} at={[0,1,4.2]}/><group ref={cart}><Blob r={[.66,.34]} at={[0,.012,0]}/><HoverCar ink={INK} body="#f472b6" len={.98} wid={.54} reduced={reduced} driver={{hair:"#31243c",skin:"#f1bd9d"}}/></group></>:null}
    {feature==="drone"?<><SoftSlab size={[5,.08,5]} color="#342d51" at={[0,-.095,0]} radius={.65} roughness={.55}/><SoftSlab size={[4.72,.025,4.72]} color="#514568" at={[0,-.025,0]} radius={.55} roughness={.6}/>{Array.from({length:25},(_,i)=><SoftSlab key={i} size={[.88,.018,.88]} color={i===2?"#f472b6":i===10?"#67e8f9":i===22?"#a78bfa":"#44365f"} at={[i%5-2,.002,Math.floor(i/5)-2]} radius={.2} roughness={.48}/>)}<Ring color="#a78bfa" at={[-2,.04,2]} radius={.38} tube={.04}/><TextSign text="LAUNCH" width={.9} height={.16} at={[-2,.34,2]}/><Block size={[.35,.3,.35]} color="#67e8f9" at={[-2,.03,0]} radius={.06}/><Ring color="#67e8f9" at={[-2,.2,0]} radius={.28} tube={.035}/><Block size={[.35,.3,.35]} color="#f472b6" at={[0,.03,-2]} radius={.06}/><Ring color="#f472b6" at={[0,.2,-2]} radius={.28} tube={.035}/><TextSign text="DROP" width={.75} height={.14} at={[0,.34,-2]}/><group ref={drone}><Blob r={[.25,.16]} at={[0,.01,0]}/><DroneCraft carrying={carried}/></group></>:null}
    {feature==="garage"||feature==="transformer"?<><Block size={[3,.01,9]} color="#625370" at={[0,.01,0]}/>{[-1,1].map(x=><Block key={x} size={[.03,.01,9]} color="#f4f2ff" at={[x,.02,0]}/>)}<Block size={[2.2,.14,1.5]} color="#514568" at={[0,.12,2.5]} radius={.15}/>{[-.72,.72].map(x=><Block key={x} size={[.13,.85,.13]} color="#a78bfa" at={[x,.54,2.5]} radius={.06}/>)}<Block size={[1.7,.08,1.2]} color="#67e8f9" at={[0,1,2.5]} radius={.09}/>{[-1,1].map(side=><group key={side} position={[side*1.8,.25,-1]}><Ring color="#211a32" at={[0,.25,0]} radius={.37} tube={.12}/><Ring color={side<0?"#a78bfa":"#67e8f9"} at={[0,.25,.015]} radius={.22} tube={.035}/></group>)}{feature==="garage"?[-1,1].map(x=><group key={x} position={[x*3,0,-2]}><Block size={[.15,1.5,.15]} color="#514568" at={[0,.75,0]} radius={.06}/><Ring color="#f472b6" at={[0,.4,0]} radius={.28} tube={.07} rotation={[0,0,0]}/><Block size={[.7,.08,.25]} color="#c28c63" at={[0,1.2,0]} radius={.05}/></group>):<><mesh position={[3.1,.005,0]}><cylinderGeometry args={[1.5,1.5,.035,40]}/><meshStandardMaterial color="#31566f" roughness={.3} metalness={.12}/></mesh>{feature==="transformer"?<><Ring color="#67e8f9" at={[0,3.05,-3.8]} radius={.72} tube={.065} rotation={[0,0,0]}/><Ring color="#a78bfa" at={[0,3.05,-3.8]} radius={.86} tube={.018} rotation={[0,0,0]}/><TextSign text="FLIGHT BEACON" width={1.8} height={.18} at={[0,4.05,-3.8]}/></>:null}</>}<TextSign text={feature==="garage"?"TEST ROAD":"ROAD · WATER · SKY"} width={4} height={.3} at={[0,2,-4]}/></>:null}
    {feature==="music"?<><SoftSlab size={[7,.22,2.2]} color="#302a50" at={[0,.02,0]} radius={.36}/><SoftSlab size={[6.7,.07,1.95]} color="#514568" at={[0,.23,0]} radius={.32}/>{Array.from({length:8},(_,i)=><group key={i}><Block size={[.66,.09,1.1]} color={i===Math.round(aim)?"#f472b6":"#f4f0e7"} at={[-2.8+i*.8,.23,.28]} radius={.07}/><Block size={[.16,.38+(i===Math.round(aim)?1.15:0),.16]} color={["#67e8f9","#a78bfa","#f472b6","#34d399"][i%4]} at={[-2.8+i*.8,.38,-1.12]} radius={.07} glow={i===Math.round(aim)?.45:.08}/></group>)}{[-1,1].map(side=><group key={side} position={[side*3.6,.2,0]}><mesh rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.42,.42,.22,24]}/><meshStandardMaterial color="#211a32"/></mesh><Ring color="#67e8f9" at={[0,.03,.13]} radius={.27} tube={.035}/><mesh><cylinderGeometry args={[.07,.07,.24,16]}/><meshStandardMaterial color="#fbbf24"/></mesh></group>)}<TextSign text="THE LIGHT & SOUND STUDIO" width={6} height={.4} at={[0,2,-2]}/></>:null}
    {feature==="observatory"?<><Line points={Array.from({length:7},(_,index)=>{const i=index%6;return [Math.sin(i*Math.PI/3)*3.4,2.7,Math.cos(i*Math.PI/3)*3.4] as [number,number,number];})} color="#a78bfa" lineWidth={1.5} transparent opacity={.45}/><Block size={[2.2,.16,2.2]} color="#302a50" at={[0,-.04,0]} radius={.2}/><Ring color="#a78bfa" at={[0,.08,0]} radius={.85} tube={.04} rotation={[0,0,0]}/><group ref={telescope} position={[0,.08,0]}><Block size={[.12,.14,.12]} color="#e8e4ff" at={[0,0,0]} radius={.05}/>{[-1,1].map(side=><mesh key={side} position={[side*.45,.45,.12]} rotation={[0,0,side*.3]}><cylinderGeometry args={[.035,.035,.95,10]}/><meshStandardMaterial color="#b7a7c9" metalness={.45}/></mesh>)}<mesh position={[0,1.4,0]} rotation={[1.22,0,0]}><cylinderGeometry args={[.22,.34,1.45,16]}/><meshStandardMaterial color="#514568" metalness={.48} roughness={.32}/></mesh><mesh position={[0,1.65,.69]} rotation={[1.22,0,0]}><cylinderGeometry args={[.2,.2,.035,24]}/><meshStandardMaterial color="#67e8f9" emissive="#67e8f9" emissiveIntensity={.25}/></mesh><Ring color="#a78bfa" at={[0,1.4,0]} radius={.34} tube={.03} rotation={[-.35,0,0]}/></group>{exhibits.slice(0,6).map((e,i)=>{const pattern=STAR_PATTERNS[i];const anchor=new THREE.Vector3(Math.sin(i*Math.PI/3)*3.4,2.7,Math.cos(i*Math.PI/3)*3.4);const points=pattern.stars.map(([x,z])=>[anchor.x+x*.48,anchor.y,anchor.z+z*.48] as [number,number,number]);return <group key={e.id}>{pattern.links.map(([a,b],edge)=><Line key={edge} points={[points[a],points[b]]} color={e.theme.accent} lineWidth={1.4} transparent opacity={.78}/>)}{points.map((point,j)=><mesh key={j} position={point}><sphereGeometry args={[j===0?.095:.065,12,10]}/><meshStandardMaterial color={e.theme.accent} emissive={e.theme.accent} emissiveIntensity={.32} roughness={.28}/></mesh>)}<TextSign text={e.title} width={2} height={.16} at={[anchor.x,anchor.y+.48,anchor.z]}/></group>})}</>:null}
    {feature==="portals"?[0,1,2].map(i=><PortalWindow key={i} index={i} x={(i-1)*3.2}/>):null}
    {feature==="replay"?<><SoftPanel size={[4.2,2.6,.18]} color="#302a50" at={[0,1.45,-4.5]} radius={.28}/><SoftPanel size={[3.82,2.25,.06]} color="#171525" at={[0,1.48,-4.38]} radius={.24}/><TextSign text="REPLAY CINEMA" width={2.8} height={.28} at={[0,2.78,-4.34]}/><TextSign text={save.replay.length>1?"▶ DRIVE REPLAY":"WAITING FOR REPLAY"} width={2.8} height={.24} at={[0,1.55,-4.34]}/><SoftSlab size={[3.2,.12,1.35]} color="#514568" at={[0,.18,3]} radius={.28}/>{[-1,1].map(x=><SoftSlab key={x} size={[1.2,.55,.1]} color="#a78bfa" at={[x,.42,2.48]} radius={.24}/>)}<TrackRig curve={replayCurve}/><group ref={cart}><Blob r={[.5,.3]} at={[0,.012,0]}/><HoverCar ink={INK} body={save.carColor} len={.8} wid={.4} reduced={reduced}/></group></>:null}
    {! ["cube","music","observatory","portals","replay","coaster"].includes(feature)?<group ref={player}><Blob r={[.48,.27]} at={[0,.012,0]}/>{feature==="garage"?<><HoverCar ink={INK} body={save.carColor} len={1} wid={.5} reduced={reduced}/>{[-1,1].flatMap(sx=>[-1,1].map(sz=><mesh key={`wheel-${sx}-${sz}`} position={[sx*.3,.065,sz*.285]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.035,.035,.006,12]}/><meshStandardMaterial color={["#a78bfa","#67e8f9","#f472b6","#34d399","#fbbf24"][save.wheel%5]} emissive={["#a78bfa","#67e8f9","#f472b6","#34d399","#fbbf24"][save.wheel%5]} emissiveIntensity={.35}/></mesh>))}{save.spoiler?<Block size={[.15,.06,.6]} color="#f472b6" at={[-.4,.55,0]}/>:null}</>:feature==="transformer"?phase===0?<HoverCar ink={INK} body={save.carColor} len={1} wid={.5} reduced={reduced}/>:phase===1?<><mesh position={[0,.16,0]} rotation={[0,0,Math.PI/2]}><capsuleGeometry args={[.3,.95,5,10]}/><meshStandardMaterial color="#67e8f9" roughness={.3} metalness={.22}/></mesh><Block size={[1.45,.09,.72]} color="#c28c63" at={[0,.3,0]} radius={.18}/><Block size={[.56,.3,.46]} color="#514568" at={[-.12,.39,-.05]} radius={.12}/><Block size={[.38,.045,.32]} color="#9de5e9" at={[-.12,.69,-.05]} radius={.08}/>{[-1,1].map(side=><Ring key={side} color="#f472b6" at={[side*.55,.42,.22]} radius={.14} tube={.035} rotation={[0,0,0]}/>)}</>:<><mesh position={[0,.24,0]} rotation={[0,0,Math.PI/2]}><capsuleGeometry args={[.18,1.15,5,10]}/><meshStandardMaterial color="#e8e4ff" metalness={.2} roughness={.32}/></mesh><Block size={[.62,.07,1.9]} color="#67e8f9" at={[0,.36,0]} radius={.15}/><Block size={[.4,.22,.5]} color="#a78bfa" at={[-.28,.43,-.12]} radius={.08}/><Block size={[.7,.055,.82]} color="#f4d99a" at={[-.52,.37,0]} radius={.08}/><Block size={[.42,.08,.6]} color="#a78bfa" at={[-.84,.33,0]} radius={.07}/><mesh position={[.75,.32,0]} rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[.055,.055,.12,10]}/><meshStandardMaterial color="#f472b6"/></mesh></>:<Person/>}{carried&&feature==="delivery"?<Block size={[.3,.3,.3]} color="#67e8f9" at={[0,.8,.2]}/>:null}</group>:null}
  </>;
}
export default function AdventureStage({feature,save,onNote,reduced,flowers,onPieceSelection,onFerryLock,onFerryMoving,onReplayTime,rivalRefresh=0,ref}:{feature:Feature;save:AdventureSave;onNote:(v:string)=>void;reduced:boolean;flowers?:readonly CommunityFlower[];onPieceSelection?:(id:number|null)=>void;onFerryLock?:(locked:boolean)=>void;onFerryMoving?:(moving:boolean)=>void;onReplayTime?:(time:number)=>void;rivalRefresh?:number;ref:Ref<StageApi>}){
  const api=useRef<ToyApi|null>(null),capture=useRef<{capture:()=>HTMLCanvasElement|null}|null>(null);
  useImperativeHandle(ref,()=>({act:(action,value)=>api.current?.act(action,value),capture:()=>capture.current?.capture()??null,resetView:()=>api.current?.act("resetView")}),[]);
  const isPhysics=physicsModes.includes(feature),physicsCamera:[number,number,number]=feature==="crane"||feature==="gravity"?[10,9,12]:[7,7,8];
  const view=isPhysics?null:sceneViewPreset(feature);
  return <Canvas camera={{position:isPhysics?physicsCamera:view!.position,fov:isPhysics?45:view!.fov}} dpr={[1,1.5]} gl={{antialias:true}} shadows={{type:THREE.PCFShadowMap}} tabIndex={0} aria-label="Interactive 3D adventure stage" onCreated={({gl})=>{gl.domElement.addEventListener("pointerdown",()=>gl.domElement.focus());}}>
    <color attach="background" args={["#0c0a18"]}/><ambientLight intensity={.48}/><hemisphereLight args={["#d6ccff","#201b36",.92]}/><directionalLight castShadow position={[-5,9,6]} intensity={1.9} shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-camera-left={-16} shadow-camera-right={16} shadow-camera-top={16} shadow-camera-bottom={-16} shadow-bias={-0.0002} shadow-normalBias={0.025}/><directionalLight position={[4,5,-5]} intensity={.58} color="#c4b5fd"/>
    <Capture apiRef={capture}/><Suspense fallback={null}>{physicsModes.includes(feature)?<ToyPhysics feature={feature} apiRef={api} onNote={onNote}/>:<Scene feature={feature} save={save} apiRef={api} onNote={onNote} reduced={reduced} flowers={flowers} onPieceSelection={onPieceSelection} onFerryLock={onFerryLock} onFerryMoving={onFerryMoving} onReplayTime={onReplayTime} rivalRefresh={rivalRefresh}/>}</Suspense>
  </Canvas>;
}
