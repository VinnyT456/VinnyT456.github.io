import { useSyncExternalStore } from "react";
import { exhibits } from "@/data/museum";

export const FEATURES = [
  ["delivery", "Parcel service", "Harbor", "Collect cargo and deliver it to the matching island resident."],
  ["ferry", "Project ferries", "Harbor", "Sail to small islands inspired by the real projects."],
  ["fishing", "Odd little fishing", "Harbor", "Time your catch to reel in fish and curious lost objects."],
  ["residents", "A day in town", "Harbor", "Follow residents between home, the café and the station."],
  ["journal", "Photo journal", "Harbor", "Photograph the new districts and keep a local album."],
  ["home", "Your tiny home", "Workshop", "Furnish an apartment and choose its colors."],
  ["editor", "Tabletop island", "Workshop", "Place and rotate a miniature neighborhood of your own."],
  ["garage", "Vehicle workshop", "Workshop", "Customize a car and drive it on the test road."],
  ["community", "Community rooftop", "Workshop", "Plant a moderated message and arrange a personal rooftop garden."],
  ["rival", "Robot challenges", "Workshop", "A friendly robot sets goals across your island activities."],
  ["repairs", "Repair the district", "Playworks", "Solve a circuit puzzle to restore a project's power."],
  ["power", "Cube energy room", "Playworks", "Route colored energy through a small machine."],
  ["cube", "Rotating neighborhoods", "Playworks", "Turn three city layers until their road connections line up."],
  ["crane", "Magnetic crane", "Playworks", "Lift physical cargo and cars, then stack them on the loading pad."],
  ["bowling", "Cube bowling", "Playworks", "Launch a cube into physical pins and count your strikes."],
  ["music", "Light & sound studio", "Playworks", "Play a synth and build a short looping melody."],
  ["controls", "Island control room", "Playworks", "Operate the station lights, fountain and wayfinding signs."],
  ["secrets", "Changing city", "Playworks", "Completed challenges grow your reward garden and reveal a mural."],
  ["rooftops", "Rooftop playground", "Sky district", "Jump between roofs, bounce on a trampoline and ride the zipline."],
  ["shrink", "Shrink-ray expedition", "Sky district", "Change scale to explore a giant keyboard and an arcade cabinet."],
  ["gravity", "Gravity room", "Sky district", "Switch gravity to the walls and ceiling in a physical toy room."],
  ["observatory", "Project constellations", "Sky district", "Aim your telescope at constellations made from real projects."],
  ["pocket", "Suitcase universe", "Sky district", "Open a suitcase, step into its miniature island, then return."],
  ["portals", "Floor windows", "Sky district", "Look through live windows onto the city's three main floors."],
  ["coaster", "Build a coaster", "Sky district", "Shape a rail circuit, then ride it with a chase camera."],
  ["transformer", "Transforming ride", "Motor club", "Drive, unfold into a boat and deploy wings for flight."],
  ["drone", "Program a drone", "Motor club", "Build a command sequence that collects and delivers a parcel."],
  ["replay", "Replay cinema", "Motor club", "Replay your recorded drive with camera choices and slow motion."],
] as const;
export type Feature = typeof FEATURES[number][0];
export type District = typeof FEATURES[number][2];
export type Furniture = { id: number; kind: "house" | "tree" | "chair" | "table" | "lamp"; x: number; z: number; turn: number };
export type Photo = { id: number; title: string; image: string; feature: Feature; district: District };
export const HOME_AMBIENCES = ["sunset", "moonlight", "garden"] as const;
export type HomeAmbience = typeof HOME_AMBIENCES[number];
export type CommunityFlower = { flower: string; color: string; name?: string; message?: string; at?: string };
export type ReplayFrame = [number, number, number, number, number, number, number, number];
export type ReplayMarker = { time: number; kind: "impact" | "recovery" };
export type AdventureSave = {
  version: 1; completed: Feature[]; catches: string[]; deliveries: number; bowlingBest: number;
  homeColor: string; carColor: string; spoiler: boolean; wheel: number;
  homeAmbience: HomeAmbience;
  furniture: Furniture[]; miniatures: Furniture[]; rooftop: Furniture[]; photos: Photo[];
  lamps: boolean; fountain: boolean; signs: boolean;
  repairedProjects: string[];
  melody: number[]; drone: string[]; coaster: number[]; replay: ReplayFrame[]; replayMarkers: ReplayMarker[];
};
const KEY = "cube-world:adventures:v1";
const COLORS = ["#a78bfa", "#67e8f9", "#f472b6", "#34d399", "#fbbf24"];
export { COLORS };
const initial = (): AdventureSave => ({ version:1,completed:[],catches:[],deliveries:0,bowlingBest:0,homeColor:COLORS[0],carColor:COLORS[0],spoiler:false,wheel:0,homeAmbience:"sunset",furniture:[],miniatures:[],rooftop:[],photos:[],lamps:true,fountain:true,signs:true,repairedProjects:[],melody:[0,2,4,2,0,4,3,2],drone:["forward","forward","collect","right","right","forward","forward","deliver"],coaster:[0,1,0,2,0,1,0,1],replay:[],replayMarkers:[] });
const validFeature = (v: unknown): v is Feature => FEATURES.some(([id])=>id===v);
const validDistrict = (v: unknown): v is District => FEATURES.some(([, , district])=>district===v);
const districtForFeature = (v: Feature): District => FEATURES.find(([id])=>id===v)![2];
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
function furniture(v: unknown): Furniture[] {
  return Array.isArray(v) ? v.slice(0,36).filter((p):p is Furniture => Boolean(p && typeof p==="object" && finite(p.id) && ["house","tree","chair","table","lamp"].includes(p.kind) && finite(p.x)&&Math.abs(p.x)<=5&&finite(p.z)&&Math.abs(p.z)<=5&&finite(p.turn)&&Math.abs(p.turn)<=12)) : [];
}
export function decodeSave(raw: string | null): AdventureSave {
  const out=initial();
  if(!raw) return out;
  try {
    const p:unknown=JSON.parse(raw); if(!p||typeof p!=="object"||!("version" in p)||p.version!==1) return out;
    const data=p as Partial<AdventureSave>;
    out.completed=Array.isArray(data.completed)?[...new Set(data.completed.filter(validFeature))]:[];
    out.catches=Array.isArray(data.catches)?data.catches.filter((v)=>typeof v==="string"&&v.length<=60).slice(0,30):[];
    for(const key of ["deliveries","bowlingBest","wheel"] as const) if(finite(data[key]))out[key]=Math.max(0,Math.min(key==="wheel"?4:key==="bowlingBest"?10:10000,Math.floor(data[key]!)));
    for(const key of ["homeColor","carColor"] as const)if(COLORS.includes(data[key]??""))out[key]=data[key]!;
    if(HOME_AMBIENCES.includes(data.homeAmbience as HomeAmbience))out.homeAmbience=data.homeAmbience as HomeAmbience;
    for(const key of ["lamps","fountain","signs","spoiler"] as const)if(typeof data[key]==="boolean")out[key]=data[key]!;
    if(Array.isArray(data.repairedProjects))out.repairedProjects=[...new Set(data.repairedProjects.filter((id):id is string=>typeof id==="string"&&exhibits.some(exhibit=>exhibit.id===id)))].slice(0,exhibits.length);
    out.furniture=furniture(data.furniture);out.miniatures=furniture(data.miniatures);out.rooftop=furniture(data.rooftop);
    if(Array.isArray(data.photos)) out.photos=data.photos.slice(0,12).flatMap((value)=>{
      if(!value||typeof value!=="object")return [];
      const p=value as Partial<Photo>;
      if(!finite(p.id)||!Number.isSafeInteger(p.id)||p.id<0||p.id>8.64e15||typeof p.title!=="string"||p.title.length>100||!validFeature(p.feature)||typeof p.image!=="string"||p.image.length>90000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(p.image))return [];
      return [{id:p.id,title:p.title,image:p.image,feature:p.feature,district:validDistrict(p.district)?p.district:districtForFeature(p.feature)}];
    });
    if(Array.isArray(data.melody))out.melody=data.melody.slice(0,8).map(v=>finite(v)?Math.max(0,Math.min(7,Math.round(v))):0);if(out.melody.length<8)out.melody=[...out.melody,...initial().melody.slice(out.melody.length)];
    if(Array.isArray(data.drone))out.drone=data.drone.filter(v=>["forward","back","left","right","collect","deliver"].includes(v)).slice(0,32);
    if(Array.isArray(data.coaster)&&data.coaster.length===8)out.coaster=data.coaster.map(v=>finite(v)?Math.max(0,Math.min(3,v)):0);
    if(Array.isArray(data.replay)) {
      let previous=-1;
      out.replay=data.replay.slice(0,2400).filter((f):f is ReplayFrame=>{
        if(!Array.isArray(f)||f.length!==8||!f.every(finite)||f[0]<0||f[0]<=previous||f[0]>3600000||f.slice(1,4).some(v=>Math.abs(v)>200))return false;
        const length=Math.hypot(...f.slice(4));
        if(length<.9||length>1.1)return false;
        previous=f[0];return true;
      });
    }
    if(Array.isArray(data.replayMarkers)) {
      let previous=-1;
      out.replayMarkers=data.replayMarkers.slice(0,64).filter((marker):marker is ReplayMarker=>{
        if(!marker||typeof marker!=="object")return false;
        const item=marker as Partial<ReplayMarker>;
        if(!finite(item.time)||item.time<0||item.time>3600000||item.time<previous||(item.kind!=="impact"&&item.kind!=="recovery"))return false;
        previous=item.time;
        if(out.replay.length&&item.time>out.replay[out.replay.length-1][0])return false;
        return true;
      });
    }
    return out;
  }catch{return out;}
}
let snapshot:AdventureSave|undefined;
const listeners=new Set<()=>void>();
export function getSave(){if(!snapshot){try{snapshot=decodeSave(localStorage.getItem(KEY));storageWarning=false;}catch{snapshot=initial();storageWarning=true;}}return snapshot;}
const server=initial();
let storageWarning=false;
export function getAdventureStorageWarning(){return storageWarning;}
function subscribe(f:()=>void){listeners.add(f);return()=>{listeners.delete(f);};}
export function useAdventures(){return useSyncExternalStore(subscribe,getSave,()=>server);}
export function saveAdventure(patch:Partial<AdventureSave>){snapshot={...getSave(),...patch,version:1};try{localStorage.setItem(KEY,JSON.stringify(snapshot));storageWarning=false;}catch{storageWarning=true;}listeners.forEach(f=>f());}
export function complete(id:Feature){const s=getSave();if(!s.completed.includes(id))saveAdventure({completed:[...s.completed,id]});}
