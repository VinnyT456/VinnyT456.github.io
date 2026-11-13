"use client";
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import type * as Rapier from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { Blob, Block } from "../parts";
import { SoftSlab } from "./SculptedGeometry";
import { loadPhysics } from "../physics-runtime";
import { complete, getSave, saveAdventure, type Feature } from "./adventure-state";
export type ToyApi={act:(action:string,value?:number)=>void};
type Engine={world:Rapier.World;bodies:Rapier.RigidBody[];ball:Rapier.RigidBody|null};
const PIN_PROFILE=[new THREE.Vector2(0,-.45),new THREE.Vector2(.105,-.45),new THREE.Vector2(.115,-.32),new THREE.Vector2(.16,-.17),new THREE.Vector2(.18,-.04),new THREE.Vector2(.16,.09),new THREE.Vector2(.105,.2),new THREE.Vector2(.075,.29),new THREE.Vector2(.08,.38),new THREE.Vector2(.105,.45),new THREE.Vector2(0,.45)];
const PIN_GEOMETRY=new THREE.LatheGeometry(PIN_PROFILE,24);
type Axis=[number,number,number];
const SURFACE_BASIS:{right:Axis;forward:Axis}[]=[
  {right:[1,0,0],forward:[0,0,-1]}, {right:[0,0,-1],forward:[0,1,0]},
  {right:[1,0,0],forward:[0,0,1]}, {right:[0,0,1],forward:[0,1,0]},
  {right:[1,0,0],forward:[0,1,0]}, {right:[-1,0,0],forward:[0,1,0]},
];
export default function ToyPhysics({feature,apiRef,onNote}:{feature:Feature;apiRef:Ref<ToyApi>;onNote:(text:string)=>void}){
  const controls=useRef<React.ComponentRef<typeof OrbitControls>>(null);const {camera}=useThree();
  const engine=useRef<Engine|null>(null);const meshes=useRef<(THREE.Group|null)[]>([]),shadows=useRef<(THREE.Group|null)[]>([]);const [ready,setReady]=useState(false),[cargoHeld,setCargoHeld]=useState(false),[resetKey,setResetKey]=useState(0),[best,setBest]=useState(getSave().bowlingBest),[roundScore,setRoundScore]=useState<number|null>(null),[gravityFace,setGravityFace]=useState(0);
  const magnet=useRef({x:0,y:3,z:0,held:-1});const arm=useRef<THREE.Group>(null),trolley=useRef<THREE.Group>(null),cable=useRef<THREE.Mesh>(null);const accumulator=useRef(0);const gravity=useRef(0);
  const movement=useRef(new Set<string>()),shotActive=useRef(false),settledFor=useRef(0),placementSettled=useRef(0),placementComplete=useRef(false);
  const message=useRef(onNote);useEffect(()=>{message.current=onNote;},[onNote]);
  useEffect(()=>{let alive=true;let made:Engine|null=null;
    loadPhysics().then(R=>{if(!alive)return;
      gravity.current=0;setGravityFace(0);movement.current.clear();
      const world=new R.World({x:0,y:-9.81,z:0});world.timestep=1/60;
      world.createCollider(R.ColliderDesc.cuboid(5,.15,5).setTranslation(0,-.15,0).setFriction(.65));
      const wallHalfHeight=feature==="gravity"?3:feature==="bowling"?.18:1.2,wallCenter=wallHalfHeight;
      for(const side of [-1,1]){
        world.createCollider(R.ColliderDesc.cuboid(.1,wallHalfHeight,5).setTranslation(side*5,wallCenter,0));
        world.createCollider(R.ColliderDesc.cuboid(5,wallHalfHeight,.1).setTranslation(0,wallCenter,side*5));
      }
      if(feature==="gravity")world.createCollider(R.ColliderDesc.cuboid(5,.1,5).setTranslation(0,6,0));
      const bodies:Rapier.RigidBody[]=[];const count=feature==="bowling"?10:feature==="crane"?12:18;
      for(let i=0;i<count;i++){
        if(feature==="bowling"){
          const row=Math.floor((Math.sqrt(8*i+1)-1)/2),col=i-row*(row+1)/2;
          const body=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation((col-row/2)*.6,.45,-2-row*.55).setLinearDamping(.12).setAngularDamping(.4).setCcdEnabled(true));
          world.createCollider(R.ColliderDesc.cylinder(.45,.18).setMass(1).setFriction(.55).setRestitution(.16),body);bodies.push(body);
        }else if(feature==="crane"){
          const row=Math.floor(i/4),col=i%4,isCar=i%4===3;
          const body=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation((col-1.5)*.85,isCar?.18:.4+row*.65,-1.5).setLinearDamping(.12).setAngularDamping(.4).setCcdEnabled(true));
          const shape=isCar?R.ColliderDesc.cuboid(.34,.18,.22):R.ColliderDesc.cuboid(.28,.28,.28);
          world.createCollider(shape.setMass(isCar?1.3:1).setFriction(.6).setRestitution(.12),body);bodies.push(body);
        }else{
          const row=Math.floor(i/4),col=i%4,shape=i===0?1:(i-1)%3;
          const body=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation((col-1.5)*.85,.5+row*.72,-1.5).setLinearDamping(.12).setAngularDamping(.4).setCcdEnabled(true));
          const collider=shape===0?R.ColliderDesc.ball(.24):shape===1?R.ColliderDesc.cuboid(.25,.25,.25):R.ColliderDesc.capsule(.2,.14);
          world.createCollider(collider.setMass(1).setFriction(.55).setRestitution(.18),body);bodies.push(body);
        }
      }
      let ball:Rapier.RigidBody|null=null;if(feature==="bowling"){ball=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(0,.3,3.5).setCcdEnabled(true));world.createCollider(R.ColliderDesc.cuboid(.3,.3,.3).setMass(5).setFriction(.22).setRestitution(.12),ball);bodies.push(ball);}
      made={world,bodies,ball};engine.current=made;setReady(true);placementSettled.current=0;placementComplete.current=false;shotActive.current=false;settledFor.current=0;setRoundScore(null);message.current(feature==="crane"?"Move the magnet above cargo, lower it and grab. Place a load on the green pad and let it settle to finish.":feature==="gravity"?"Change gravity to choose a wall or ceiling, then steer the explorer with WASD, arrows, or the touch pad.":"Aim and launch. Pinfall is counted automatically after the ball and rack settle.");
    }).catch(()=>message.current("The physics room could not load. Leave and open it again to retry."));
    return()=>{alive=false;engine.current=null;made?.world.free();};
  },[feature,resetKey]);
  useEffect(()=>{
    if(feature!=="gravity")return;
    const input=movement.current;
    const codes:Record<string,string>={ArrowUp:"up",w:"up",ArrowDown:"down",s:"down",ArrowLeft:"left",a:"left",ArrowRight:"right",d:"right"};
    const down=(event:KeyboardEvent)=>{const key=codes[event.key];if(!key)return;const target=event.target;if(target instanceof HTMLElement&&target.closest("input,select,textarea,[contenteditable=true]"))return;event.preventDefault();input.add(key);};
    const up=(event:KeyboardEvent)=>{const key=codes[event.key];if(key)input.delete(key);};
    const clear=()=>input.clear();
    window.addEventListener("keydown",down);window.addEventListener("keyup",up);window.addEventListener("blur",clear);
    return()=>{window.removeEventListener("keydown",down);window.removeEventListener("keyup",up);window.removeEventListener("blur",clear);input.clear();};
  },[feature]);
  const scoreBowling=useCallback((e:Engine)=>{
    if(!e.ball||!shotActive.current)return;
    const knocked=e.bodies.slice(0,10).filter((body,index)=>{
      const row=Math.floor((Math.sqrt(8*index+1)-1)/2),col=index-row*(row+1)/2;
      const startX=(col-row/2)*.6,startZ=-2-row*.55,p=body.translation(),q=body.rotation();
      return p.y<.28||Math.abs(q.x)+Math.abs(q.z)>.38||Math.hypot(p.x-startX,p.z-startZ)>.38;
    }).length;
    const nextBest=Math.max(getSave().bowlingBest,knocked);
    saveAdventure({bowlingBest:nextBest});setBest(nextBest);setRoundScore(knocked);shotActive.current=false;settledFor.current=0;
    if(knocked>0)complete("bowling");
    message.current(`${knocked}/10 pins down${knocked===10?" · strike!":knocked===0?" · try a different line.":""} Best: ${nextBest}/10.`);
  },[]);
  useImperativeHandle(apiRef,()=>({act(action,value=0){const e=engine.current;if(action==="resetView"){const target: [number,number,number]=[0,feature==="crane"?2.1:feature==="gravity"?2.7:.6,0];if(controls.current){controls.current.target.set(...target);const position: [number,number,number]=feature==="crane"||feature==="gravity"?[10,9,12]:[7,7,8];camera.position.set(...position);controls.current.update();}return;}if(action==="reset"){setReady(false);setCargoHeld(false);setRoundScore(null);shotActive.current=false;settledFor.current=0;magnet.current={x:0,y:3,z:0,held:-1};setResetKey(key=>key+1);message.current("Rack reset. Aim and launch a new roll.");return;}if(!e)return;const m=magnet.current;
    if(action==="x"||action==="aim")m.x=value;if(action==="z")m.z=value;if(action==="height")m.y=value;
    if(action==="grab"){
      if(m.held>=0){m.held=-1;setCargoHeld(false);message.current("Cargo released. Stack it on the glowing loading pad.");}
      else {let best=-1,dist=1.4;e.bodies.forEach((b,i)=>{const p=b.translation();const d=Math.hypot(p.x-m.x,p.z-m.z,p.y-(m.y-.5));if(d<dist){best=i;dist=d;}});m.held=best;setCargoHeld(best>=0);message.current(best<0?"Lower the magnet closer to a crate or car.":"Magnet locked. Lift it and move it onto the loading pad.");}
    }
    if(action==="launch"&&e.ball){if(shotActive.current){message.current("The current roll is still settling. Reset the lane to bowl again.");return;}setRoundScore(null);settledFor.current=0;shotActive.current=true;e.ball.setTranslation({x:m.x*.34,y:.3,z:3.5},true);e.ball.setLinvel({x:m.x*2.2,y:.7,z:-12},true);e.ball.setAngvel({x:-1,y:0,z:.3},true);message.current("Rolling… the score updates when the ball and pins come to rest.");}
    if(action==="score")scoreBowling(e);
    if(action==="gravity"){
      gravity.current=(gravity.current+1)%6;setGravityFace(gravity.current);const g=[{x:0,y:-9.81,z:0},{x:9.81,y:0,z:0},{x:0,y:9.81,z:0},{x:-9.81,y:0,z:0},{x:0,y:0,z:9.81},{x:0,y:0,z:-9.81}][gravity.current];e.world.gravity=g;e.bodies.forEach(b=>b.wakeUp());complete("gravity");message.current(["Floor","East wall","Ceiling","West wall","South wall","North wall"][gravity.current]+" is down. The glowing explorer follows the new surface.");
    }
    if(action==="nudge"){e.bodies[1]?.applyImpulse({x:Math.sin(value)*3,y:2,z:Math.cos(value)*3},true);}
    if(action==="walkStart"||action==="walkStop"){
      const direction=["up","left","down","right"][Math.round(value)];
      if(direction){if(action==="walkStart")movement.current.add(direction);else movement.current.delete(direction);}
    }
    if(action.startsWith("move")&&feature==="gravity"){
      const basis=SURFACE_BASIS[gravity.current],player=e.bodies[0],direction=action.slice(4).toLowerCase();if(!player)return;
      const axis=direction==="up"||direction==="down"?basis.forward:basis.right,sign=direction==="down"||direction==="left"?-1:1;
      player.applyImpulse({x:axis[0]*sign*.85,y:axis[1]*sign*.85,z:axis[2]*sign*.85},true);
    }
  }}),[camera.position,feature,scoreBowling]);
  useFrame((_,dt)=>{const e=engine.current;if(!e)return;accumulator.current=Math.min(.1,accumulator.current+dt);const m=magnet.current;
    if(arm.current)arm.current.position.set(m.x,m.y,m.z);
    if(trolley.current)trolley.current.position.set(m.x,5.35,m.z);
    if(cable.current){cable.current.position.set(m.x,(5.35+m.y)/2,m.z);cable.current.scale.y=Math.max(.08,5.35-m.y);}
    if(m.held>=0){const b=e.bodies[m.held],p=b.translation();b.setLinvel({x:(m.x-p.x)*7,y:(m.y-.48-p.y)*7,z:(m.z-p.z)*7},true);}
    while(accumulator.current>=1/60){e.world.step();accumulator.current-=1/60;}
    e.bodies.forEach((b,i)=>{const mesh=meshes.current[i];if(!mesh)return;const p=b.translation(),q=b.rotation();mesh.position.set(p.x,p.y,p.z);mesh.quaternion.set(q.x,q.y,q.z,q.w);if(feature!=="gravity"){const shadow=shadows.current[i];if(shadow){shadow.position.set(p.x,.002,p.z);shadow.visible=p.y<1.5;}}});
    if(feature==="crane"&&m.held<0&&!placementComplete.current){const placed=e.bodies.some((body,index)=>{const p=body.translation(),v=body.linvel(),w=body.angvel(),car=index%4===3,half=car?.18:.28;return p.x>2.25&&p.x<3.75&&p.z>1.2&&p.z<2.8&&p.y>half+.02&&p.y<3.2&&Math.hypot(v.x,v.y,v.z)<.24&&Math.hypot(w.x,w.y,w.z)<.35;});placementSettled.current=placed?placementSettled.current+dt:0;if(placementSettled.current>=1){placementComplete.current=true;complete("crane");message.current("Load secured. The cargo stayed on the pad for a full second; try stacking another piece.");}}else if(feature==="crane"&&(m.held>=0||!e.bodies.some(body=>{const p=body.translation(),v=body.linvel(),w=body.angvel();return p.x>2.25&&p.x<3.75&&p.z>1.2&&p.z<2.8&&p.y>.3&&Math.hypot(v.x,v.y,v.z)<.24&&Math.hypot(w.x,w.y,w.z)<.35;}))){placementSettled.current=0;}
    if(feature==="bowling"&&shotActive.current&&e.ball){const ballSpeed=e.ball.linvel(),pinSpeed=e.bodies.slice(0,10).reduce((speed,body)=>{const v=body.linvel(),w=body.angvel();return Math.max(speed,Math.hypot(v.x,v.y,v.z),Math.hypot(w.x,w.y,w.z));},0);if(Math.max(Math.hypot(ballSpeed.x,ballSpeed.y,ballSpeed.z),pinSpeed)<.16){settledFor.current+=dt;if(settledFor.current>=.75)scoreBowling(e);}else settledFor.current=0;}
    if(feature==="gravity"){
      const player=e.bodies[0];if(player){const basis=SURFACE_BASIS[gravity.current],keys=movement.current,side=(keys.has("right")?1:0)-(keys.has("left")?1:0),forward=(keys.has("up")?1:0)-(keys.has("down")?1:0),v=player.linvel(),speed=2.35,blend=Math.min(1,dt*9),h=basis.right,f=basis.forward;const alongH=v.x*h[0]+v.y*h[1]+v.z*h[2],alongF=v.x*f[0]+v.y*f[1]+v.z*f[2],nextH=alongH+(side*speed-alongH)*blend,nextF=alongF+(forward*speed-alongF)*blend;player.setLinvel({x:v.x+h[0]*(nextH-alongH)+f[0]*(nextF-alongF),y:v.y+h[1]*(nextH-alongH)+f[1]*(nextF-alongF),z:v.z+h[2]*(nextH-alongH)+f[2]*(nextF-alongF)},true);}
    }
  });
  return <group><OrbitControls ref={controls} makeDefault target={[0,feature==="crane"?2.1:feature==="gravity"?2.7:.6,0]} minDistance={5} maxDistance={22}/>
    {/* Concrete floor and raised edge aprons meet the Rapier floor collider at y=0. */}
    <Block size={[10,feature==="bowling"?.28:.3,10]} color={feature==="bowling"?"#211b2b":feature==="crane"?"#211f2b":"#171521"} at={[0,-.3,0]} radius={.12} roughness={.82}/>
    {feature==="bowling"?<>
      <SoftSlab size={[3.75,.025,8.55]} color="#7a4d36" at={[0,-.04,0]} radius={.035} roughness={.34}/>
      {Array.from({length:9},(_,i)=><SoftSlab key={i} size={[.405,.012,8.42]} color={["#b48257","#c39162","#ad7950"][i%3]} at={[-1.62+i*.405,-.012,0]} radius={.015} roughness={.36}/>)}
      {[-1.96,1.96].map(x=><group key={x}>
        <mesh position={[x,.17,0]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.17,.17,8.35,18,1,true,0,Math.PI]}/><meshStandardMaterial color="#352b3c" metalness={.32} roughness={.3} side={THREE.DoubleSide}/></mesh>
        <Block size={[.09,.22,8.5]} color="#392b40" at={[x*1.12,0,0]} radius={.04}/>
        <Block size={[.035,.035,8.45]} color="#c4b5fd" at={[x*1.15,.19,0]} glow={.18}/>
      </group>)}
      {[-.65,-.32,0,.32,.65].map((x,i)=><group key={x} position={[x,.001,2.25]} rotation={[0,i%2?-.34:.34,0]}><Block size={[.055,.002,.18]} color="#f0d2a8" at={[0,0,0]}/><Block size={[.055,.002,.18]} color="#f0d2a8" at={[0,0,-.12]} rotation={[0,i%2?.68:-.68,0]}/></group>)}
      <Block size={[2.55,.002,2.1]} color="#322b3a" at={[0,.0005,-3.15]} radius={.001}/>
      <Block size={[3.8,2.4,.2]} color="#30273b" at={[0,0,-5]} radius={.08}/>
      <Block size={[3.15,.09,.34]} color="#c18450" at={[0,2.32,-4.58]} radius={.035}/>
      <Block size={[2.92,.55,.1]} color="#49344b" at={[0,1.72,-4.72]} radius={.045}/>
      <Block size={[.075,.62,.18]} color="#8a755d" at={[-1.52,1.68,-4.73]} radius={.03}/><Block size={[.075,.62,.18]} color="#8a755d" at={[1.52,1.68,-4.73]} radius={.03}/>
      {[-1,1].flatMap(x=>[-1,1].map(y=><mesh key={`sign-bolt-${x}-${y}`} position={[x*1.38,1.72+y*.19,-4.65]}><sphereGeometry args={[.035,12,8]}/><meshStandardMaterial color="#d4c2a0" metalness={.75} roughness={.24}/></mesh>))}
      <Text position={[0,1.82,-4.65]} fontSize={.22} color="#f5dfbb" anchorX="center" anchorY="middle" letterSpacing={.06}>PIN DECK</Text>
      <Block size={[1.9,.12,.11]} color="#c4b5fd" at={[0,1.32,-4.7]} radius={.04} glow={.35}/>
      <Text position={[0,1.02,-4.65]} fontSize={.13} color="#d8d0eb" anchorX="center" anchorY="middle">ROUND  {roundScore===null?"—":roundScore} / 10   ·   BEST  {best} / 10</Text>
      <Block size={[.08,1.35,.2]} color="#6b4f51" at={[-1.86,0,-4.75]} radius={.03}/><Block size={[.08,1.35,.2]} color="#6b4f51" at={[1.86,0,-4.75]} radius={.03}/>
      <Block size={[.12,.35,10]} color="#4a394d" at={[-4.96,0,0]} radius={.05}/><Block size={[.12,.35,10]} color="#4a394d" at={[4.96,0,0]} radius={.05}/><Block size={[10,.35,.2]} color="#392e42" at={[0,0,5]} radius={.05}/>
      <Text position={[0,.11,3.1]} fontSize={.12} color="#e8d9c8" anchorX="center" anchorY="middle">AIM  ·  ROLL  ·  COUNT</Text>
    </>:null}
    {feature==="crane"?<>
      {/* Enclosed toy workshop: the translucent cage follows the collision bounds. */}
      {[[-5,0,0],[5,0,0],[0,0,-5],[0,0,5]].map(([x,y,z],i)=><mesh key={`glass-${i}`} position={[x,y+1.2,z]} rotation={i<2?[0,Math.PI/2,0]:[0,0,0]}><planeGeometry args={[10,2.4]}/><meshStandardMaterial color="#67e8f9" transparent opacity={.055} side={THREE.DoubleSide} depthWrite={false}/></mesh>)}
      {[-4.85,4.85].map(x=><group key={x}>{[-4.8,4.8].map(z=><Block key={z} size={[.28,5.25,.28]} color="#433851" at={[x,0,z]} radius={.07}/>)}{[-4.6,4.6].map(z=><Block key={`foot-${z}`} size={[.5,.18,.5]} color="#c4b5fd" at={[x,.02,z]} radius={.06} glow={.16}/>)}</group>)}
      {[-4.55,4.55].map(z=><SoftSlab key={z} size={[9.7,.24,.3]} color="#5a4867" at={[0,5.12,z]} radius={.08}/>)}
      {[-4.3,4.3].map(x=><group key={`rail-${x}`}>
        <mesh position={[x,5.18,0]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.075,.075,9.15,16]}/><meshStandardMaterial color="#88739a" metalness={.34} roughness={.38}/></mesh>
        {[-4.1,4.1].map(z=><mesh key={z} position={[x,5.18,z]} rotation={[0,0,Math.PI/2]}><torusGeometry args={[.105,.026,8,20]}/><meshStandardMaterial color="#c4b5fd" metalness={.55} roughness={.3}/></mesh>)}
      </group>)}
      {[-4.5,4.5].map(x=><mesh key={`beam-${x}`} position={[x,2.2,0]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.035,.035,9.2,12]}/><meshStandardMaterial color="#89769a" metalness={.25} roughness={.42}/></mesh>)}
      <Block size={[9.1,.035,.06]} color="#67e8f9" at={[0,.72,-4.87]} glow={.22}/><Block size={[9.1,.035,.06]} color="#67e8f9" at={[0,.72,4.87]} glow={.22}/>
      <Block size={[2,.045,2]} color="#202d2d" at={[3,.012,2]} radius={.08}/><Block size={[1.8,.025,1.8]} color="#2d614d" at={[3,.04,2]} radius={.07} glow={.12}/>
      {[-.45,0,.45].map((offset,i)=><group key={offset} position={[3+offset,.075,2]} rotation={[0,Math.PI/4,0]}><Block size={[.06,.012,1.1]} color={i===1?"#d9efbc":"#b2d6ad"} at={[0,0,0]}/></group>)}
      <Text position={[3,.1,3.02]} rotation={[-Math.PI/2,0,0]} fontSize={.14} color="#d9efbc" anchorX="center" anchorY="middle">LOAD PAD</Text>
      {[-4,-2,0,2,4].map(x=><Block key={`floor-seam-${x}`} size={[.018,.006,9.8]} color="#36343f" at={[x,0,0]} radius={.006}/>)}
      <Block size={[.18,.8,.18]} color="#4f4655" at={[4.4,0,1]} radius={.04}/><Block size={[.18,.8,.18]} color="#4f4655" at={[4.4,0,3]} radius={.04}/><Block size={[.18,.12,2.1]} color="#fbbf24" at={[4.4,.8,2]} radius={.03}/>
      <Block size={[2.1,.55,.12]} color="#342c40" at={[0,5.28,-4.25]} radius={.06}/><Text position={[0,5.52,-4.17]} fontSize={.16} color="#c4b5fd" anchorX="center" anchorY="middle">MAGNET WORKS</Text>
      <mesh ref={cable} position={[0,4.175,0]} scale={[1,2.35,1]}><cylinderGeometry args={[.025,.025,1,10]}/><meshStandardMaterial color="#d9d3e6" metalness={.72} roughness={.24}/></mesh>
      <group ref={trolley} position={[0,5.35,0]}><SoftSlab size={[.76,.22,.68]} color="#7a6689" at={[0,-.12,0]} radius={.12}/><mesh position={[0,-.27,0]}><cylinderGeometry args={[.19,.24,.12,24]}/><meshStandardMaterial color="#b49bc7" metalness={.45} roughness={.3}/></mesh>{[-.25,.25].map(x=><mesh key={x} position={[x,.03,-.3]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.1,.1,.08,20]}/><meshStandardMaterial color="#26212d" metalness={.65} roughness={.28}/></mesh>)}<SoftSlab size={[.12,.1,.12]} color="#fbbf24" at={[0,-.24,0]} radius={.05}/></group>
      <group ref={arm} position={[0,3,0]}><mesh position={[0,-.1,0]}><cylinderGeometry args={[.3,.34,.2,24]}/><meshStandardMaterial color={cargoHeld?"#67e8f9":"#d58c38"} metalness={.36} roughness={.3}/></mesh><mesh position={[0,-.23,0]}><cylinderGeometry args={[.2,.26,.1,24]}/><meshStandardMaterial color="#47384b" metalness={.28} roughness={.34}/></mesh><mesh position={[0,-.32,0]}><torusGeometry args={[.19,.035,10,28]}/><meshStandardMaterial color={cargoHeld?"#67e8f9":"#c4b5fd"} emissive="#67e8f9" emissiveIntensity={cargoHeld?.8:.25} metalness={.55}/></mesh>{[-.1,.1].map(x=><mesh key={x} position={[x,-.43,0]}><cylinderGeometry args={[.025,.045,.2,12]}/><meshStandardMaterial color="#cad0d6" metalness={.65}/></mesh>)}</group>
    </>:null}
    {feature==="gravity"?<>
      {/* Clear acrylic room faces sit on the same planes as the six Rapier limits. */}
      {[[0,3,-4.9],[0,3,4.9]].map(([x,y,z],i)=><mesh key={`wallz-${i}`} position={[x,y,z]}><planeGeometry args={[10,6]}/><meshStandardMaterial color="#8373ab" transparent opacity={.075} side={THREE.DoubleSide} depthWrite={false}/></mesh>)}
      {[-4.9,4.9].map((x,i)=><mesh key={`wallx-${i}`} position={[x,3,0]} rotation={[0,Math.PI/2,0]}><planeGeometry args={[10,6]}/><meshStandardMaterial color="#77b9ca" transparent opacity={.065} side={THREE.DoubleSide} depthWrite={false}/></mesh>)}
      <mesh position={[0,5.9,0]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[10,10]}/><meshStandardMaterial color="#9a7bd1" transparent opacity={.07} side={THREE.DoubleSide} depthWrite={false}/></mesh>
      {[-5,5].flatMap(x=>[-5,5].map(z=><Block key={`${x}:${z}`} size={[.1,6,.1]} color="#a78bfa" at={[x,0,z]} radius={.04} glow={.25}/>))}
      {[-5,5].flatMap(x=>[-5,5].map(z=><Block key={`top-${x}:${z}`} size={[.1,.1,.1]} color="#67e8f9" at={[x,5.9,z]} radius={.04} glow={.35}/>))}
      {Array.from({length:6},(_,i)=><mesh key={`floor-rib-${i}`} position={[0,.012,-4+i*1.6]} rotation={[0,Math.PI/2,0]}><cylinderGeometry args={[.012,.012,9.5,8]}/><meshStandardMaterial color="#51485f" metalness={.2} roughness={.5}/></mesh>)}
      <Block size={[2.1,.08,2.1]} color="#292335" at={[0,.01,0]} radius={.22}/><Block size={[1.6,.035,1.6]} color="#322c47" at={[0,.09,0]} radius={.2}/>
      <mesh position={[0,.3,0]}><octahedronGeometry args={[.22,0]}/><meshStandardMaterial color="#67e8f9" emissive="#67e8f9" emissiveIntensity={.85} metalness={.35} roughness={.22}/></mesh>
      {[
        {label:"FLOOR",position:[0,.19,0] as [number,number,number],rotation:[Math.PI,0,0] as [number,number,number]},
        {label:"EAST",position:[4.7,3,0] as [number,number,number],rotation:[0,0,-Math.PI/2] as [number,number,number]},
        {label:"CEILING",position:[0,5.72,0] as [number,number,number],rotation:[0,0,0] as [number,number,number]},
        {label:"WEST",position:[-4.7,3,0] as [number,number,number],rotation:[0,0,Math.PI/2] as [number,number,number]},
        {label:"SOUTH",position:[0,3,4.7] as [number,number,number],rotation:[-Math.PI/2,0,0] as [number,number,number]},
        {label:"NORTH",position:[0,3,-4.7] as [number,number,number],rotation:[Math.PI/2,0,0] as [number,number,number]},
      ].map((face,i)=><group key={face.label} position={face.position} rotation={face.rotation}>
        <mesh><coneGeometry args={[.18,.38,3]}/><meshStandardMaterial color={i===gravityFace?"#f6e2a9":["#67e8f9","#a78bfa","#f472b6","#34d399","#fbbf24","#60a5fa"][i]} emissive={i===gravityFace?"#f6e2a9":["#67e8f9","#a78bfa","#f472b6","#34d399","#fbbf24","#60a5fa"][i]} emissiveIntensity={i===gravityFace?1.4:.5}/></mesh>
        <mesh position={[0,-.25,0]}><cylinderGeometry args={[.025,.025,.28,8]}/><meshStandardMaterial color="#ded8ec" emissive="#ded8ec" emissiveIntensity={i===gravityFace?.45:.1}/></mesh>
        <Text position={[0,.34,.05]} fontSize={.13} color={i===gravityFace?"#fff1c7":"#c8bfd8"} anchorX="center" anchorY="middle">{face.label}</Text>
      </group>)}
    </>:null}
    {Array.from({length:feature==="bowling"?11:feature==="crane"?12:18},(_,i)=><group key={i}>
      {feature!=="gravity"?<group ref={g=>{shadows.current[i]=g;}} visible={ready}><Blob r={feature==="bowling"?(i===10?.34:.16):i%4===3?[.42,.25]:[.34,.29]} opacity={.13} at={[0,0,0]}/></group>:null}
      <group ref={g=>{meshes.current[i]=g;}} visible={ready}>
      {feature==="bowling"&&i<10?<>
        <mesh geometry={PIN_GEOMETRY} dispose={null}><meshStandardMaterial color="#f3eee7" roughness={.22} metalness={.08}/></mesh>
        <mesh position={[0,.255,0]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[.083,.023,8,24]}/><meshStandardMaterial color="#d44961" roughness={.3} metalness={.08}/></mesh>
      </>:feature==="bowling"?<>
        <Block size={[.6,.6,.6]} color="#7058a2" at={[0,-.3,0]} radius={.15} roughness={.24}/>
        {[[0,.13,-.28],[-.12,-.1,-.28],[.12,-.1,-.28]].map(([x,y,z],j)=><mesh key={j} position={[x,y,z]}><sphereGeometry args={[.038,16,12]}/><meshStandardMaterial color="#171321" roughness={.9}/></mesh>)}
        <mesh position={[0,.26,-.06]}><sphereGeometry args={[.035,12,10]}/><meshStandardMaterial color="#16131b"/></mesh>
      </>:feature==="crane"&&i%4===3?<>
        <SoftSlab size={[.68,.16,.44]} color={["#7a5ad1","#258fa3","#dc5e83"][Math.floor(i/4)%3]} at={[0,-.19,0]} radius={.12} roughness={.3}/>
        <SoftSlab size={[.38,.16,.3]} color="#b9a8d2" at={[-.015,-.02,0]} radius={.11}/><SoftSlab size={[.16,.095,.24]} color="#b8e5e9" at={[.19,.025,0]} radius={.07} roughness={.2}/>
        {[-1,1].flatMap(x=>[-1,1].map(z=><group key={`${x}:${z}`}><mesh position={[x*.24,-.09,z*.17]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.09,.09,.07,16]}/><meshStandardMaterial color="#22202a" roughness={.68}/></mesh><mesh position={[x*.24,-.09,z*.205]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[.048,.012,8,16]}/><meshStandardMaterial color="#d8cee9" metalness={.62} roughness={.25}/></mesh></group>))}
      </>:feature==="crane"?<>
        <SoftSlab size={[.52,.56,.52]} color={["#9a673f","#b37c4a","#886143"][i%3]} at={[0,-.28,0]} radius={.075} roughness={.72}/>
        {[-.19,.19].map(x=><group key={x}><SoftSlab size={[.045,.5,.035]} color="#d7ba8f" at={[x,-.28,-.252]} radius={.018}/><SoftSlab size={[.045,.5,.035]} color="#d7ba8f" at={[x,-.28,.252]} radius={.018}/><SoftSlab size={[.045,.035,.5]} color="#c09c6a" at={[x,.245,0]} radius={.016}/><SoftSlab size={[.045,.035,.5]} color="#c09c6a" at={[x,-.28,0]} radius={.016}/></group>)}
      </>:feature==="gravity"&&i===0?<><Block size={[.5,.5,.5]} color="#fbbf24" at={[0,-.25,0]} glow={.65} radius={.1} roughness={.24}/><mesh><sphereGeometry args={[.34,20,16]}/><meshBasicMaterial color="#fbbf24" transparent opacity={.07} wireframe/></mesh></>:feature==="gravity"&&i>0&&(i-1)%3===0?<mesh><sphereGeometry args={[.24,20,16]}/><meshStandardMaterial color="#67e8f9" roughness={.26} metalness={.2}/></mesh>:feature==="gravity"&&i>0&&(i-1)%3===2?<mesh><capsuleGeometry args={[.14,.4,6,12]}/><meshStandardMaterial color="#f472b6" roughness={.3}/></mesh>:feature==="gravity"?<Block size={[.5,.5,.5]} color="#67c6d4" at={[0,-.25,0]} radius={.1} roughness={.3}/>:null}
      {feature==="gravity"&&i===0?<group><mesh position={[-.07,.04,.244]}><sphereGeometry args={[.03,12,8]}/><meshStandardMaterial color="#211525" roughness={.28}/></mesh><mesh position={[.07,.04,.244]}><sphereGeometry args={[.03,12,8]}/><meshStandardMaterial color="#211525" roughness={.28}/></mesh><Block size={[.08,.025,.012]} color="#473139" at={[0,-.065,.244]} radius={.01}/></group>:null}
      </group>
    </group>)}
  </group>;
}
