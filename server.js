// 핏빛 카타콤 — 멀티플레이 서버
'use strict';
const http=require('http'),fs=require('fs'),path=require('path');
const {WebSocketServer}=require('./wslite.js');
const SH=require('./public/shared.js');
const {TS,CLASSES,SKILLS}=SH;
const PORT=process.env.PORT||3000;
const PUB=path.join(__dirname,'public');
const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.json':'application/json','.ico':'image/x-icon','.webp':'image/webp'};

const server=http.createServer((req,res)=>{
  let u;try{u=decodeURIComponent(req.url.split('?')[0]);}catch(e){res.writeHead(400);res.end();return;}
  if(u==='/health'){res.end('ok');return;}
  if(u==='/')u='/index.html';
  const f=path.normalize(path.join(PUB,u));
  if(!f.startsWith(PUB)){res.writeHead(403);res.end();return;}
  fs.readFile(f,(e,d)=>{if(e){res.writeHead(404);res.end('not found');return;}res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(d);});
});
const wss=new WebSocketServer({server,path:'/ws',maxPayload:256*1024});

// ================= 밸런스 (이 숫자만 고치면 난이도가 바뀝니다) =================
const BAL={
  monHpPerFloor:0.5,   // 층마다 몬스터 체력 +50%
  monHpCurve:0.012,    // 깊어질수록 추가로 붙는 체력 배율(레벨·장비 성장 따라잡기)
  monDmgPerFloor:0.25, // 층마다 몬스터 공격력 +25%
  partyHp:0.6,         // 파티원 1명 추가마다 몬스터 체력 +60%
  eliteHp:2.6,eliteDmg:1.4,
  bossHp:2.0,          // 보스 체력 전체 배율
  bossHpCurve:0.005,   // 깊은 층 보스 추가 체력
  finalBoss:1.6,       // 100층 보스 체력 배율
  bossPartyHp:0.25,bossPartyDmg:0.1,bossPartyTempo:0.07, // 파티원 1명 추가마다 보스만 추가로: 체력 +25%, 공격력 +10%, 패턴 속도 +7%
  bossDmg:1.0,         // 보스 공격력 전체 배율
  xp:1.0,gold:1.0,     // 경험치 · 골드 배율
  dropItem:0.15,dropHp:0.04,dropMp:0.02,
  legBase:0.25,legPerFloor:0.004,legCorrupt:0.15, // 보스 전설 확률: 25% + 층당 0.4% (+타락 15%), 100층은 확정
 
  farDist:70,farCd1:4.5,farCd2:3.5,farDmg:1.5,
  farTheme:[1,1,0.4,1.4,0.85,0.8,0.9,1.8,0.5,0.9] // 테마별 견제 빈도 (보스마다 원거리 패턴 양이 달라서 맞춤) // 보스가 멀리 있는 플레이어를 견제하는 주기·피해
};
// ================= 유틸 =================
const R=Math.random,ri=(a,b)=>a+Math.floor(R()*(b-a+1)),rf=(a,b)=>a+R()*(b-a),pick=a=>a[Math.floor(R()*a.length)],clamp=(v,a,b)=>v<a?a:v>b?b:v;
const r1=v=>Math.round(v*10)/10;
function angDiff(a,b){let d=Math.abs(a-b)%(Math.PI*2);return d>Math.PI?Math.PI*2-d:d;}

// ================= 상태 =================
let nextId=1;
const players=new Map();   // id -> P
const parties=new Map();   // id -> party
const dungeons=new Map();  // id -> inst
const hub={id:'hub',type:'hub',map:SH.genHub(),players:new Set(),drops:[],fx:[],time:0,did:1,monsters:[],projs:[],zones:[],timers:[],hz:[],dark:0,mid:1,pid:1,flows:new Map(),floor:1};
for(const d of hub.map.dummies)hub.monsters.push({id:hub.mid++,type:'dummy',tc:99,dummy:true,x:d.x,y:d.y,r:7,maxHp:1e9,hp:1e9,dmg:0,spd:0,xp:0,face:-1,alert:true,slow:0,stun:0,flash:0,wind:0,windType:'',atkT:0,charge:0,dead:false});

function send(P,o){if(P.ws.readyState===1)P.ws.send(JSON.stringify(o));}
function instPlayers(inst){const a=[];for(const id of inst.players){const p=players.get(id);if(p)a.push(p);}return a;}
function bcast(inst,o){const s=JSON.stringify(o);for(const p of instPlayers(inst))if(p.ws.readyState===1)p.ws.send(s);}
function fx(inst,o){inst.fx.push(o);}
function msg(P,m,c){send(P,{t:'msg',m,c});}
function markDirty(P){P.dirty=true;}
function recalc(P){P.S=SH.calcStats(P.ch);P.hp=Math.min(P.hp,P.S.maxHp);P.mp=Math.min(P.mp,P.S.maxMp);markDirty(P);}

// ================= 파티 =================
function newParty(P){const pt={id:'pt'+(nextId++),leader:P.id,members:new Set([P.id]),inst:null};parties.set(pt.id,pt);P.party=pt;return pt;}
function partyList(pt){const a=[];for(const id of pt.members){const p=players.get(id);if(p)a.push(p);}return a;}
function sendParty(pt){const list=partyList(pt).map(p=>({id:p.id,cid:p.ch.id,name:p.ch.name,cls:p.ch.cls,lvl:p.ch.lvl}));for(const p of partyList(pt))send(p,{t:'party',leader:pt.leader,members:list,inDungeon:!!pt.inst});}
// 재접속(서버 재시작 등)했을 때 예전 파티원끼리 자동으로 다시 묶기
function restoreParty(P){const prev=P.prevParty;if(!prev||prev.length<2)return;for(const Q of players.values()){if(Q===P||!Q.ch||!Q.party||Q.inst!==hub||!prev.includes(Q.ch.id))continue;if(!(Q.prevParty||[]).includes(P.ch.id))continue;const pt=Q.party;if(pt===P.party||pt.members.size>=4||pt.inst)continue;
    leaveParty(P);pt.members.add(P.id);P.party=pt;sendParty(pt);bcastRoster(hub);for(const q of partyList(pt))msg(q,`${P.ch.name}님이 다시 파티에 합류했습니다`,'#7fd05a');return;}}
function leaveParty(P){const pt=P.party;if(!pt)return;pt.members.delete(P.id);P.party=null;if(pt.members.size===0){parties.delete(pt.id);}else{if(pt.leader===P.id)pt.leader=[...pt.members][0];sendParty(pt);}}

// ================= 인스턴스 =================
function lookOf(P){const w=P.ch.eq.weapon,a=P.ch.eq.armor,r=P.ch.eq.ring,c=P.ch.cos||{};return{pet:P.ch.pet||null,ttl:P.ch.title?SH.titleOf(P.ch.title):null,w:w?w.kind:null,wr:w?w.rar:-1,wid:w?String(w.id).slice(0,12):null,a:a?a.kind:null,ar:a?a.rar:-1,rr:r?r.rar:-1,dy:P.ch.dye|0,cp:c.cape===0?0:1,gl:c.glow===0?0:1};}
function roster(inst){return instPlayers(inst).map(p=>({id:p.id,name:p.ch.name,cls:p.ch.cls,lvl:p.ch.lvl,pt:p.party?p.party.id:null,look:lookOf(p),pvp:p.ch.pvp,tm:p.arenaTeam==null?-1:p.arenaTeam}));}
function bcastRoster(inst){if(inst.type==='dungeon'){inst.syn=SH.synergies(instPlayers(inst).map(p=>p.ch.cls));inst.synM={};for(const c of SH.CLASS_ORDER)inst.synM[c]=SH.synergyMods(inst.syn,c);}bcast(inst,{t:'ros',list:roster(inst),syn:inst.syn||null});}
function visibleDrops(inst,P){return inst.drops.filter(d=>d.owner==null||d.owner===P.id);}
function sendMap(P){const inst=P.inst;
  if(inst.type==='hub')send(P,{t:'map',kind:'hub',x:P.x,y:P.y,drops:visibleDrops(inst,P)});
  else send(P,{t:'map',kind:'dungeon',seed:inst.seed,floor:inst.floor,stairs:inst.stairsOpen,x:P.x,y:P.y,drops:visibleDrops(inst,P),paused:inst.paused,ev:evPub(inst),arena:inst.arena?1:0});}
function resetCombat(P){P.burn=0;P.rootT=0;P.slowT=0;P.slowV=0;P.downed=false;P.rev=0;P.shield=0;P.shieldT=0;P.dodgeT=0;P.buffs={};P.scd={};P.atkCd=0;}
function leaveInst(P){const inst=P.inst;if(!inst)return;inst.players.delete(P.id);P.inst=null;
  if(inst.type==='dungeon'){inst.flows.delete(P.id);
    if(inst.players.size===0){dungeons.delete(inst.id);if(inst.party&&inst.party.inst===inst){inst.party.inst=null;sendParty(inst.party);}}
    else bcastRoster(inst);}
  else bcastRoster(inst);}
function joinHub(P){leaveInst(P);P.inst=hub;hub.players.add(P.id);const s=hub.map.spawn;P.x=s.x+rf(-30,30);P.y=s.y+rf(-12,12);resetCombat(P);P.hp=P.S.maxHp;P.mp=P.S.maxMp;sendMap(P);bcastRoster(hub);}
function placeStart(inst,P,k){const st=inst.map.start;const offs=[[0,0],[14,0],[-14,0],[0,14],[0,-14],[14,14]];const o=offs[k%offs.length];let x=st.cx*TS+8+o[0],y=st.cy*TS+8+o[1];if(SH.blocked(inst.map,x,y,4)){x=st.cx*TS+8;y=st.cy*TS+8;}P.x=x;P.y=y;}
function createDungeon(pt){const inst={id:'d'+(nextId++),type:'dungeon',party:pt,players:new Set(),floor:0,seed:0,map:null,monsters:[],projs:[],drops:[],zones:[],timers:[],hz:[],dark:0,fx:[],paused:null,mid:1,pid:1,did:1,time:0,flows:new Map(),meter:new Map(),bossMeter:null,bossStart:0,trans:null,wipeT:0,meterT:0};dungeons.set(inst.id,inst);pt.inst=inst;return inst;}
function loadFloor(inst,floor){
  if(inst.floor>0&&floor===inst.floor+1)for(const P of instPlayers(inst))bump(P,'floor',1);
  inst.floor=floor;inst.seed=(Math.random()*2147483647)|0;inst.map=SH.genFloor(inst.seed,floor);
  inst.monsters=[];inst.projs=[];inst.drops=[];inst.zones=[];inst.timers=[];inst.hz=[];inst.dark=0;inst.trans=null;inst.wipeT=0;inst.bossMeter=null;inst.stairsOpen=!inst.map.boss;inst.flows.clear();
  if(inst.stairsOpen)SH.openStairs(inst.map);
  spawnMonsters(inst);setupEvents(inst);
  let k=0;
  for(const P of instPlayers(inst)){placeStart(inst,P,k++);if(P.downed){P.downed=false;P.rev=0;P.hp=Math.round(P.S.maxHp*0.4);}P.dodgeT=0;
    if(floor>1&&(floor-1)%5===0&&!P.ch.cps.includes(floor)){P.ch.cps.push(floor);P.ch.cps.sort((a,b)=>a-b);msg(P,`체크포인트 개방 · 지하 ${floor}층`,'#ffd35a');}
    if(floor>P.ch.best)P.ch.best=floor;markDirty(P);sendMap(P);}
  bcastRoster(inst);
}
function getMeter(map,P){let m=map.get(P.id);if(!m){m={name:P.ch.name,cls:P.ch.cls,dmg:0,taken:0,heal:0,shield:0,kills:0,elites:0};map.set(P.id,m);}return m;}
function addMeter(inst,P,k,v){if(!inst.meter||v<=0)return;getMeter(inst.meter,P)[k]+=v;if(inst.bossMeter)getMeter(inst.bossMeter,P)[k]+=v;}
function meterRows(map){return [...map.entries()].map(([id,m])=>({id,name:m.name,cls:m.cls,dmg:Math.round(m.dmg),taken:Math.round(m.taken),heal:Math.round(m.heal),shield:Math.round(m.shield),kills:m.kills||0,elites:m.elites||0}));}

// ================= 몬스터 =================
function pickType(f){const w=[['zombie',Math.max(20,60-f*4)],['skel',25+Math.min(f,20)*2],['hound',Math.min(35,10+f*3)]];let t=R()*w.reduce((a,b)=>a+b[1],0);for(const[k,v]of w){if((t-=v)<=0)return k;}return 'zombie';}
function spawnMonster(inst,type,x,y,elite){const d=SH.MT[type],f=inst.floor,n=Math.max(1,inst.players.size);
  const hpM=(1+BAL.monHpPerFloor*(f-1))*(1+BAL.monHpCurve*(f-1))*(1+BAL.partyHp*(n-1)),dmM=1+BAL.monDmgPerFloor*(f-1);
  const m={id:inst.mid++,type,tc:SH.MT_LIST.indexOf(type),d,x,y,r:d.r,elite:!!elite,maxHp:Math.round(d.hp*hpM*(elite?BAL.eliteHp:1)*(type==='boss'?BAL.bossHp:1)),dmg:d.dmg*dmM*(elite?BAL.eliteDmg:1)*(type==='boss'?BAL.bossDmg:1),spd:d.spd*(elite?1.1:1),
    xp:Math.round(d.xp*(1+0.3*(f-1))*(elite?3:1)*BAL.xp),face:1,cd:rf(0,1),ccd:1.5,wind:0,windType:'',atkT:0,flash:0,slow:0,stun:0,alert:false,moving:false,wander:0,wdx:0,wdy:0,charge:0,dead:false,tgt:null,tgtT:0,taunt:null};
  if(elite&&type!=='boss'){const pool=SH.EAFF.slice();const n=f>=10&&R()<0.45?2:1;m.ea=0;for(let i=0;i<n;i++){const a=pool.splice(Math.floor(R()*pool.length),1)[0];m.ea|=a[2];}
    if(m.ea&128)m.maxHp=Math.round(m.maxHp*1.5);if(m.ea&64)m.spd*=1.4;m.tpT=rf(2,5);m.shCd=rf(2,5);}
  m.hp=m.maxHp;m.baseDmg=m.dmg;inst.monsters.push(m);return m;}
function spawnMonsters(inst){const map=inst.map,f=inst.floor,n=Math.max(1,inst.players.size);
  for(const r of map.rooms){
    if(r===map.start)continue;
    if(r===map.bossRoom){const b=spawnMonster(inst,'boss',r.cx*TS+8,r.cy*TS+8,false);b.boss=true;b.home={x:b.x,y:b.y};const th=SH.themeOf(f);const bm=(1+th.idx*0.12)*(th.corrupt?1.3:1)*(1+BAL.bossHpCurve*(f-1))*(f===100?BAL.finalBoss:1);const pn=n-1;b.hp=b.maxHp=Math.round(b.maxHp*bm*(1+BAL.bossPartyHp*pn));b.dmg*=1+BAL.bossPartyDmg*pn;b.baseDmg=b.dmg;b.partyCd=1/(1+BAL.bossPartyTempo*pn);b.r=f===100?13:11;inst.bossId=b.id;continue;}
    let c=ri(2,4)+Math.min(4,Math.floor(f/4))+(n-1);if(map.boss)c=Math.max(1,c-2);const eliteRoom=R()<0.12+Math.min(0.3,f*0.015);
    for(let i=0;i<c;i++){const x=(r.x+ri(1,r.w-2))*TS+8,y=(r.y+ri(1,r.h-2))*TS+8;spawnMonster(inst,pickType(f),x,y,eliteRoom&&i===0);}
  }}
function livingPlayers(inst){return instPlayers(inst).filter(p=>!p.downed);}
function pickTarget(inst,m){if(m.taunt&&m.taunt.t>0){const p=players.get(m.taunt.pid);if(p&&p.inst===inst&&!p.downed)return p;}
  let best=null,bd=1e9;for(const p of livingPlayers(inst)){let d=Math.hypot(p.x-m.x,p.y-m.y);if(p.ch.cls==='guardian')d*=0.6;if(d<bd){bd=d;best=p;}}
  if(inst.allies&&!m.boss)for(const a of inst.allies){if(a.downed)continue;let d=Math.hypot(a.x-m.x,a.y-m.y);if(a.type==='w')d*=0.6;else d*=1.15;if(d<bd){bd=d;best=a;}}return best;}
function getFlow(inst,P){if(P.ally){if(!P.fl||inst.time-P.fl.t>0.4)P.fl={t:inst.time,d:SH.bfs(inst.map,Math.floor(P.x/TS),Math.floor(P.y/TS),30)};return P.fl.d;}let f=inst.flows.get(P.id);if(!f||inst.time-f.t>0.3){f={t:inst.time,d:SH.bfs(inst.map,Math.floor(P.x/TS),Math.floor(P.y/TS),45)};inst.flows.set(P.id,f);}return f.d;}
function alertPack(inst,m){const wake=o=>{if(o.alert)return;o.alert=true;if(o.boss){{const th=SH.themeOf(inst.floor);const ln=th.final?SH.FINAL_LINES[0]:(th.corrupt?'다시 왔구나… 심장이 나를 되살렸다! ':'')+SH.BOSS_LINES[th.idx][0];fx(inst,{k:'bsay',id:o.id,m:ln});}fx(inst,{k:'msg',m:`${SH.bossOf(inst.floor).n}이(가) 깨어났다!`,c:'#ff5a4a'});fx(inst,{k:'sfx',n:'boss'});inst.bossMeter=new Map();inst.bossStart=inst.time;}};
  wake(m);for(const o of inst.monsters)if(!o.dead&&!o.alert&&Math.hypot(o.x-m.x,o.y-m.y)<90)wake(o);}
function wanderStep(inst,m,dt){m.wander-=dt;if(m.wander<=0){m.wander=rf(1,3);if(R()<.5){m.wdx=0;m.wdy=0;}else{const a=R()*Math.PI*2;m.wdx=Math.cos(a);m.wdy=Math.sin(a);}}
  if(m.wdx||m.wdy){if(!SH.moveEnt(inst.map,m,m.wdx*m.spd*0.35*dt,m.wdy*m.spd*0.35*dt)){m.wdx=-m.wdx;m.wdy=-m.wdy;}m.moving=true;if(m.wdx)m.face=m.wdx<0?-1:1;}}
function chase(inst,m,T,dt,sm){const map=inst.map,W=map.w,sp=m.spd*sm*dt;let tx=T.x,ty=T.y;const d=Math.hypot(T.x-m.x,T.y-m.y);
  if(!(d<90&&SH.los(map,m.x,m.y,T.x,T.y,m.r))){const flow=getFlow(inst,T);const tX=Math.floor(m.x/TS),tY=Math.floor(m.y/TS),cd=flow[tY*W+tX];
    if(cd>0){let best=cd,bx=-1,by=-1;for(const[ox,oy]of SH.D8){const nx=tX+ox,ny=tY+oy;if(!SH.walk(map,nx,ny))continue;if(ox&&oy&&(!SH.walk(map,tX+ox,tY)||!SH.walk(map,tX,tY+oy)))continue;const v=flow[ny*W+nx];if(v>=0&&v<best){best=v;bx=nx;by=ny;}}if(bx>=0){tx=bx*TS+8;ty=by*TS+8;}}}
  const ax=tx-m.x,ay=ty-m.y,al=Math.hypot(ax,ay)||1;SH.moveEnt(map,m,ax/al*sp,ay/al*sp);m.moving=true;if(Math.abs(ax)>0.5)m.face=ax<0?-1:1;}
function startWind(m,type,t){m.wind=t;m.windType=type;m.atkT=t;}
function monsterStrike(inst,m){const T=m.tgt;
  if(m.windType==='melee'){m.cd=m.d.cd;for(const p of livingPlayers(inst))if(Math.hypot(p.x-m.x,p.y-m.y)<m.r+4+13&&(p===T||Math.hypot(p.x-m.x,p.y-m.y)<m.r+10))hurtPlayer(inst,p,m.dmg,m);if(T&&T.ally&&Math.hypot(T.x-m.x,T.y-m.y)<m.r+4+13)hurtAlly(inst,T,m.dmg);}
  else if(m.windType==='shoot'){m.cd=m.d.cd;if(!T)return;if(T.ally){fx(inst,{k:'sfx',n:'bow'});later(inst,Math.hypot(T.x-m.x,T.y-m.y)/150,()=>{if(!T.downed)hurtAlly(inst,T,m.dmg);});}const a=Math.atan2(T.y-m.y,T.x-m.x);inst.projs.push({id:inst.pid++,type:'arrow',owner:'m',x:m.x,y:m.y,vx:Math.cos(a)*150,vy:Math.sin(a)*150,dmg:m.dmg,r:2,life:2,h:7,sn:SH.monName(inst.floor,m.type,m.elite,m.id)+'의 화살',src:m});fx(inst,{k:'sfx',n:'bow'});}
  else if(m.windType==='charge'){if(!T)return;const a=Math.atan2(T.y-m.y,T.x-m.x);m.cdx=Math.cos(a);m.cdy=Math.sin(a);m.charge=0.38;m.chit=new Set();fx(inst,{k:'sfx',n:'dash'});}
  else if(m.windType==='slam'){m.cd=m.d.cd;fx(inst,{k:'slam',x:r1(m.x),y:r1(m.y)});for(const p of livingPlayers(inst))if(Math.hypot(p.x-m.x,p.y-m.y)<40+4)hurtPlayer(inst,p,m.dmg*1.5,m);}
  else if(m.windType==='ring'){const n=m.hp<m.maxHp*0.4?18:13,off=R()*6.28;for(let k=0;k<n;k++){const a=off+k/n*Math.PI*2;inst.projs.push({id:inst.pid++,type:'orb',owner:'m',x:m.x+Math.cos(a)*8,y:m.y+Math.sin(a)*8,vx:Math.cos(a)*85,vy:Math.sin(a)*85,dmg:m.dmg*0.7,r:3,life:3.5,h:10});}fx(inst,{k:'sfx',n:'boss'});fx(inst,{k:'shake',v:2});m.cd=0.8;}}
// ================= 보스 패턴 엔진 =================
const RING_PROJ=['orb','ice','fireb','orb','orb','web','orb','page','orb','void'];
function roomPoint(inst,minFrom,minD){const r=inst.map.bossRoom||inst.map.start;for(let t=0;t<30;t++){const x=(r.x+1+R()*(r.w-2))*TS,y=(r.y+1+R()*(r.h-2))*TS;if(SH.blocked(inst.map,x,y,6))continue;if(minFrom&&Math.hypot(x-minFrom.x,y-minFrom.y)<minD)continue;return{x,y};}return{x:(r.cx)*TS+8,y:(r.cy)*TS+8};}
function hitCircle(inst,x,y,r,dmg,src,o){for(const p of livingPlayers(inst))if(Math.hypot(p.x-x,p.y-y)<r+4)hurtPlayer(inst,p,dmg,src,o);if(inst.allies)for(const a of inst.allies)if(!a.downed&&Math.hypot(a.x-x,a.y-y)<r+4)hurtAlly(inst,a,dmg*0.6);}
function distSeg(px,py,x1,y1,x2,y2){const vx=x2-x1,vy=y2-y1,L2=vx*vx+vy*vy||1;const t=clamp(((px-x1)*vx+(py-y1)*vy)/L2,0,1);return Math.hypot(x1+vx*t-px,y1+vy*t-py);}
function mproj(inst,m,type,a,speed,dmg,o){o=o||{};inst.projs.push(Object.assign({id:inst.pid++,type,owner:'m',x:m.x+Math.cos(a)*(m.r+2),y:m.y+Math.sin(a)*(m.r+2),vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,dmg,r:3,life:4,h:10},o));}
function addHz(inst,o){const h=Object.assign({x:0,y:0,r:24,t:6,arm:0.8,iv:0.5,tick:0,dmg:0,slow:0,root:0,heal:0,vis:20,src:null},o);h.max=h.t+h.arm;inst.hz.push(h);return h;}
function spawnAdd(inst,m,type,x,y,o){const a=spawnMonster(inst,type,x,y,false);a.alert=true;a.summ=true;a.xp=Math.round(a.xp*0.3);Object.assign(a,o||{});fx(inst,{k:'summon',x:r1(x),y:r1(y)});return a;}
function nearPoint(inst,m,rad){for(let t=0;t<12;t++){const a=R()*6.28,d=rad*(0.6+R()*0.4),x=m.x+Math.cos(a)*d,y=m.y+Math.sin(a)*d;if(!SH.blocked(inst.map,x,y,6))return{x,y};}return{x:m.x,y:m.y};}
function farthest(inst,m){let b=null,bd=-1;for(const p of livingPlayers(inst)){const d=Math.hypot(p.x-m.x,p.y-m.y);if(d>bd){bd=d;b=p;}}return b;}
function bmsg(inst,m,t,c){fx(inst,{k:'msg',m:t,c:c||'#ff8a7a'});}
const BP={
  slam(inst,m){const t=0.8*m.tf;m.atkT=t;fx(inst,{k:'tele',x:r1(m.x),y:r1(m.y),r:46,d:t});later(inst,t,()=>{if(m.dead)return;fx(inst,{k:'slam',x:r1(m.x),y:r1(m.y)});hitCircle(inst,m.x,m.y,46,m.dmg*1.6,m);});return t+0.4;},
  ring(inst,m){const t=0.6*m.tf;m.atkT=t;const type=RING_PROJ[m.theme]||'orb';later(inst,t,()=>{if(m.dead)return;const n=m.phase>1?18:13,off=R()*6.28;for(let k=0;k<n;k++)mproj(inst,m,type,off+k/n*Math.PI*2,85,m.dmg*0.75,{life:3.5});fx(inst,{k:'sfx',n:'boss'});fx(inst,{k:'shake',v:2});});return t+0.5;},
  bloodring(inst,m){const t=0.6*m.tf;m.atkT=t;const waves=m.phase>1?2:1;for(let w=0;w<waves;w++)later(inst,t+w*0.55,()=>{if(m.dead)return;const n=14,off=R()*6.28;for(let k=0;k<n;k++)mproj(inst,m,'orb',off+k/n*Math.PI*2,85,m.dmg*0.75,{life:3.5});fx(inst,{k:'sfx',n:'boss'});});return t+0.5+waves*0.4;},
  summon(inst,m){const n=2+Math.min(2,inst.players.size-1)+(m.phase>1?1:0);for(let i=0;i<n;i++){const p=nearPoint(inst,m,30);spawnAdd(inst,m,pick(['zombie','zombie','hound']),p.x,p.y);}bmsg(inst,m,`${m.bname}이(가) 부하를 불러낸다!`,'#c77ad8');fx(inst,{k:'sfx',n:'boss'});return 0.8;},
  lungeFar(inst,m){const T=farthest(inst,m);if(!T)return 0.3;const a=Math.atan2(T.y-m.y,T.x-m.x),L=Math.min(200,Math.hypot(T.x-m.x,T.y-m.y)+20);const x2=m.x+Math.cos(a)*L,y2=m.y+Math.sin(a)*L;const t=0.9*m.tf;m.atkT=t;
    fx(inst,{k:'teleline',x1:r1(m.x),y1:r1(m.y),x2:r1(x2),y2:r1(y2),w:14,d:t});bmsg(inst,m,`${m.bname}이(가) ${T.ch.name}님을 노린다!`);
    later(inst,t,()=>{if(m.dead)return;const ox=m.x,oy=m.y;for(let s=0;s<L;s+=4){const nx=ox+Math.cos(a)*s,ny=oy+Math.sin(a)*s;if(SH.blocked(inst.map,nx,ny,m.r*0.6))break;m.x=nx;m.y=ny;}
      fx(inst,{k:'dash',x1:r1(ox),y1:r1(oy),x2:r1(m.x),y2:r1(m.y)});for(const p of livingPlayers(inst))if(distSeg(p.x,p.y,ox,oy,m.x,m.y)<16)hurtPlayer(inst,p,m.dmg*1.8,m);fx(inst,{k:'shake',v:3});});return t+0.5;},
  bloodpool(inst,m){for(const p of livingPlayers(inst))addHz(inst,{x:p.x,y:p.y,r:26,t:7,arm:0.9*m.tf,dmg:m.dmg*0.25,heal:3,vis:20,src:m});bmsg(inst,m,'피웅덩이 위에 서면 보스가 회복한다!','#e0574a');return 0.8;},
  inout(inst,m){const t=1.0*m.tf;m.atkT=t;fx(inst,{k:'tele',x:r1(m.x),y:r1(m.y),r:42,d:t});
    later(inst,t,()=>{if(m.dead)return;fx(inst,{k:'nova2',x:r1(m.x),y:r1(m.y),r:42});hitCircle(inst,m.x,m.y,42,m.dmg*1.7,m);fx(inst,{k:'donut',x:r1(m.x),y:r1(m.y),r1:44,r2:130,d:t});
      later(inst,t,()=>{if(m.dead)return;fx(inst,{k:'donutboom',x:r1(m.x),y:r1(m.y),r1:44,r2:130});for(const p of livingPlayers(inst)){const d=Math.hypot(p.x-m.x,p.y-m.y);if(d>44&&d<134)hurtPlayer(inst,p,m.dmg*1.7,m);}fx(inst,{k:'shake',v:3});});});return t*2+0.6;},
  iceSpears(inst,m){const T=m.tgt;if(!T)return 0.3;for(let w=0;w<3;w++)later(inst,0.3*m.tf+w*0.35,()=>{if(m.dead||!T)return;const a=Math.atan2(T.y-m.y,T.x-m.x);for(let k=-1;k<=1;k++)mproj(inst,m,'ice',a+k*0.22,190,m.dmg*0.9,{r:3,life:2.5});fx(inst,{k:'sfx',n:'ice'});});return 1.4;},
  markSpread(inst,m){const ps=livingPlayers(inst);if(!ps.length)return 0.2;const T=pick(ps);const t=3*m.tf;fx(inst,{k:'mark',id:T.id,d:t,c:'c',txt:'흩어지세요!'});
    later(inst,t,()=>{if(m.dead||T.inst!==inst)return;fx(inst,{k:'boom',x:r1(T.x),y:r1(T.y),r:40,c:1});hitCircle(inst,T.x,T.y,40,m.dmg*2,m);});return 0.4;},
  cone(inst,m){const T=m.tgt;if(!T)return 0.3;const a=Math.atan2(T.y-m.y,T.x-m.x),t=0.8*m.tf;m.atkT=t;fx(inst,{k:'telecone',x:r1(m.x),y:r1(m.y),a:r1(a),r:90,arc:0.6,d:t});
    later(inst,t,()=>{if(m.dead)return;fx(inst,{k:'cleave',x:r1(m.x),y:r1(m.y),a:r1(a)});for(const p of livingPlayers(inst)){const d=Math.hypot(p.x-m.x,p.y-m.y);if(d<94&&(d<12||angDiff(Math.atan2(p.y-m.y,p.x-m.x),a)<0.62)){hurtPlayer(inst,p,m.dmg*1.8,m);if(m.burnOn)addBurn(inst,p,m,2);}}});return t+0.4;},
  blizzard(inst,m){const fires=[roomPoint(inst,m,50),roomPoint(inst,m,50)];for(const f of fires)addHz(inst,{x:f.x,y:f.y,r:28,t:7,arm:1.2,vis:28,safe:true});
    addHz(inst,{x:m.x,y:m.y,r:9999,t:6,arm:1.8*m.tf,dmg:m.dmg*0.4,slow:0.4,vis:29,global:true,safeSpots:fires});bmsg(inst,m,'눈보라! 화톳불 곁으로 피하세요!','#8fd0ff');fx(inst,{k:'sfx',n:'ice'});return 1;},
  circles(inst,m){const waves=m.phase>1?2:1;const t=1.2*m.tf;for(let w=0;w<waves;w++)later(inst,w*0.9,()=>{if(m.dead)return;for(const p of livingPlayers(inst)){const x=p.x,y=p.y;fx(inst,{k:'tele',x:r1(x),y:r1(y),r:26,d:t,c:m.col});later(inst,t,()=>{if(m.dead)return;fx(inst,{k:'boom',x:r1(x),y:r1(y),r:26});hitCircle(inst,x,y,26,m.dmg*1.6,m);});}});return 0.8;},
  meteorRain(inst,m){const n=8+2*inst.players.size;const t=1.4*m.tf;for(let i=0;i<n;i++)later(inst,i*0.15,()=>{if(m.dead)return;const ps=livingPlayers(inst);const tp=(R()<0.5&&ps.length)?pick(ps):null;const p=tp?{x:tp.x+rf(-12,12),y:tp.y+rf(-12,12)}:roomPoint(inst);fx(inst,{k:'tele',x:r1(p.x),y:r1(p.y),r:24,d:t,c:'o'});fx(inst,{k:'meteor',x:r1(p.x),y:r1(p.y),d:t});
    later(inst,t,()=>{if(m.dead)return;fx(inst,{k:'boom',x:r1(p.x),y:r1(p.y),r:24});hitCircle(inst,p.x,p.y,24,m.dmg*1.4,m);});});bmsg(inst,m,'불비가 쏟아진다!','#ff8a3a');return 1.6;},
  lavaLines(inst,m){for(let n=0;n<3;n++){const a=R()*6.28;for(let s=16;s<200;s+=16){const x=m.x+Math.cos(a)*s,y=m.y+Math.sin(a)*s;if(SH.solidAt(inst.map,x,y))break;addHz(inst,{x,y,r:11,t:6,arm:1.0*m.tf,dmg:m.dmg*0.35,vis:21});}}fx(inst,{k:'shake',v:2});return 0.9;},
  burnMark(inst,m){m.burnOn=true;return BP.cone(inst,m);},
  poisonPools(inst,m){for(const p of livingPlayers(inst))addHz(inst,{x:p.x,y:p.y,r:24,t:8,arm:0.9*m.tf,dmg:m.dmg*0.25,slow:0.4,vis:22});for(let i=0;i<2;i++){const p=roomPoint(inst);addHz(inst,{x:p.x,y:p.y,r:28,t:8,arm:0.9*m.tf,dmg:m.dmg*0.25,slow:0.4,vis:22});}fx(inst,{k:'sfx',n:'boss'});return 0.8;},
  eggs(inst,m){const n=2+Math.min(2,inst.players.size);for(let i=0;i<n;i++){const p=roomPoint(inst,m,30);const e=spawnAdd(inst,m,'egg',p.x,p.y,{hatch:7});e.hp=e.maxHp=Math.round(m.maxHp*0.03);}bmsg(inst,m,'알을 부수세요! 곧 부화합니다','#b8e07a');return 0.8;},
  sweep(inst,m){const T=m.tgt;const a0=T?Math.atan2(T.y-m.y,T.x-m.x)-1.6:R()*6.28,dir=R()<0.5?1:-1,a1=a0+dir*3.4,pre=0.7*m.tf,dur=2.2*m.tf;m.atkT=pre;
    fx(inst,{k:'teleline',x1:r1(m.x),y1:r1(m.y),x2:r1(m.x+Math.cos(a0)*170),y2:r1(m.y+Math.sin(a0)*170),w:8,d:pre});fx(inst,{k:'sweep',x:r1(m.x),y:r1(m.y),a0:r1(a0),a1:r1(a1),len:170,d:dur,pre});
    const hitT=new Map();const steps=Math.round(dur/0.1);for(let i=0;i<=steps;i++)later(inst,pre+i*0.1,()=>{if(m.dead)return;const a=a0+(a1-a0)*(i/steps);const x2=m.x+Math.cos(a)*170,y2=m.y+Math.sin(a)*170;
      for(const p of livingPlayers(inst)){if(distSeg(p.x,p.y,m.x,m.y,x2,y2)<8&&(hitT.get(p.id)||-9)<inst.time-0.4){hitT.set(p.id,inst.time);hurtPlayer(inst,p,m.dmg*0.9,m);}}});return pre+dur+0.3;},
  split(inst,m){if(m.didSplit)return BP.poisonPools(inst,m);m.didSplit=true;m.invul=12;const kids=[];for(let i=0;i<2;i++){const p=nearPoint(inst,m,40);const k=spawnAdd(inst,m,'zombie',p.x,p.y,{elite:true,splitOf:m.id});k.hp=k.maxHp=Math.round(m.maxHp*0.12);k.dmg=m.dmg*0.6;kids.push(k);}
    bmsg(inst,m,'모체가 분열했다! 12초 안에 둘 다 쓰러뜨리세요','#b8e07a');
    later(inst,12,()=>{if(m.dead)return;const alive=kids.filter(k=>!k.dead);if(alive.length){for(const k of alive){k.dead=true;fx(inst,{k:'mdie',id:k.id});}m.hp=Math.min(m.maxHp,m.hp+m.maxHp*0.15);bmsg(inst,m,'분열체가 합쳐져 모체가 회복했다!','#e0574a');}m.invul=0;});return 1;},
  tentacles(inst,m){if(inst.monsters.some(o=>!o.dead&&o.guardOf===m.id))return BP.ring(inst,m);for(let i=0;i<4;i++){const p=roomPoint(inst,m,40);const t=spawnAdd(inst,m,'tentacle',p.x,p.y,{guardOf:m.id});t.hp=t.maxHp=Math.round(m.maxHp*0.05);t.dmg=m.dmg*0.7;}m.invul=99;bmsg(inst,m,'촉수가 솟아났다! 촉수를 모두 부숴야 보스를 공격할 수 있다','#8fd0ff');return 1;},
  guards(inst,m){if(inst.monsters.some(o=>!o.dead&&o.guardOf===m.id))return BP.ring(inst,m);const n=3;for(let i=0;i<n;i++){const p=nearPoint(inst,m,36);const g=spawnAdd(inst,m,'guard',p.x,p.y,{guardOf:m.id});g.hp=g.maxHp=Math.round(m.maxHp*0.04);g.dmg=m.dmg*0.6;}m.invul=99;bmsg(inst,m,'수호자가 보스를 지킨다! 수호자를 먼저 쓰러뜨리세요','#c77ad8');return 1;},
  tide(inst,m){const r=inst.map.bossRoom;const left=R()<0.5;const cx=(r.x+(left?r.w*0.25:r.w*0.75))*TS,cy=(r.y+r.h/2)*TS;addHz(inst,{x:cx,y:cy,r:r.w*TS*0.3,t:6,arm:1.3*m.tf,dmg:m.dmg*0.2,slow:0.5,vis:24});bmsg(inst,m,'물이 차오른다!','#8fd0ff');return 0.8;},
  pull(inst,m){const t=1.6*m.tf;m.atkT=t;bmsg(inst,m,'노랫소리가 끌어당긴다! 구르기로 버티세요','#8fd0ff');fx(inst,{k:'ring',x:r1(m.x),y:r1(m.y),r:160,c:'c',c2:'p'});
    for(const p of livingPlayers(inst)){const a=Math.atan2(m.y-p.y,m.x-p.x);send(p,{t:'force',vx:Math.cos(a)*62,vy:Math.sin(a)*62,d:t});}
    fx(inst,{k:'tele',x:r1(m.x),y:r1(m.y),r:52,d:t+0.3});later(inst,t+0.3,()=>{if(m.dead)return;fx(inst,{k:'slam',x:r1(m.x),y:r1(m.y)});hitCircle(inst,m.x,m.y,52,m.dmg*1.8,m);});return t+0.7;},
  webShot(inst,m){const ps=livingPlayers(inst);for(let i=0;i<Math.min(3,ps.length+1);i++){const T=ps.length?ps[i%ps.length]:m.tgt;if(!T)continue;const a=Math.atan2(T.y-m.y,T.x-m.x)+rf(-0.1,0.1);later(inst,i*0.2,()=>{if(!m.dead)mproj(inst,m,'web',a,150,m.dmg*0.5,{root:2.5,life:3});});}fx(inst,{k:'sfx',n:'bow'});return 0.9;},
  ceiling(inst,m){const T=m.tgt;if(!T)return 0.3;m.hidden=true;m.invul=99;fx(inst,{k:'tp',x:r1(m.x),y:r1(m.y)});const t=1.6*m.tf;let tx=T.x,ty=T.y;
    later(inst,t*0.6,()=>{if(T.inst===inst){tx=T.x;ty=T.y;}fx(inst,{k:'tele',x:r1(tx),y:r1(ty),r:40,d:t*0.4});});
    later(inst,t,()=>{if(m.dead)return;m.hidden=false;m.invul=0;m.x=tx;m.y=ty;if(SH.blocked(inst.map,m.x,m.y,m.r*0.6)){const p=roomPoint(inst);m.x=p.x;m.y=p.y;}fx(inst,{k:'slam',x:r1(m.x),y:r1(m.y)});hitCircle(inst,m.x,m.y,40,m.dmg*2,m);});return t+0.5;},
  webPools(inst,m){for(let i=0;i<4;i++){const p=roomPoint(inst);addHz(inst,{x:p.x,y:p.y,r:30,t:10,arm:0.5,slow:0.55,vis:23});}for(const p of livingPlayers(inst))addHz(inst,{x:p.x,y:p.y,r:22,t:10,arm:0.8,slow:0.55,vis:23});return 0.6;},
  lines(inst,m){const n=m.phase>1?5:4;const t=1.0*m.tf;m.atkT=t;const ps=livingPlayers(inst);for(let i=0;i<n;i++){const T=ps[i];const a=T?Math.atan2(T.y-m.y,T.x-m.x):R()*6.28;const x2=m.x+Math.cos(a)*230,y2=m.y+Math.sin(a)*230;const x1=m.x,y1=m.y;
    fx(inst,{k:'teleline',x1:r1(x1),y1:r1(y1),x2:r1(x2),y2:r1(y2),w:10,d:t});later(inst,t,()=>{if(m.dead)return;fx(inst,{k:'laser',x1:r1(x1),y1:r1(y1),x2:r1(x2),y2:r1(y2)});for(const p of livingPlayers(inst))if(distSeg(p.x,p.y,x1,y1,x2,y2)<10)hurtPlayer(inst,p,m.dmg*1.6,m);});}return t+0.4;},
  overheat(inst,m){m.vuln=3.5*(m.corrupt?0.8:1);bmsg(inst,m,'과열! 약점이 드러났다 (받는 피해 2배)','#ffd35a');fx(inst,{k:'sfx',n:'dash'});return m.vuln;},
  rewind(inst,m){const t=2.5*m.tf;for(const p of livingPlayers(inst)){const x=p.x,y=p.y;fx(inst,{k:'tele',x:r1(x),y:r1(y),r:26,d:t,c:'y'});later(inst,t,()=>{if(m.dead)return;fx(inst,{k:'boom',x:r1(x),y:r1(y),r:26,c:1});hitCircle(inst,x,y,26,m.dmg*2,m);});}bmsg(inst,m,'시간이 되감긴다! 지금 서 있던 곳에서 멀어지세요','#ffd35a');return 0.5;},
  homing(inst,m){const n=m.phase>1?6:4;for(let i=0;i<n;i++){const a=i/n*Math.PI*2;mproj(inst,m,'page',a,70,m.dmg*0.8,{homing:1.8,life:5,r:3});}fx(inst,{k:'sfx',n:'cast'});return 0.8;},
  pages(inst,m){for(let i=0;i<16;i++)mproj(inst,m,'page',R()*6.28,rf(45,75),m.dmg*0.6,{life:5});fx(inst,{k:'sfx',n:'cast'});return 0.6;},
  clones(inst,m){for(let i=0;i<2;i++){const p=roomPoint(inst,m,40);const c=spawnAdd(inst,m,'clone',p.x,p.y,{cloneOf:m.id,tcSkin:m.tc});c.hp=c.maxHp=Math.round(m.maxHp*0.06);c.dmg=m.dmg*0.5;c.r=m.r;}const p=roomPoint(inst,m,40);fx(inst,{k:'tp',x:r1(m.x),y:r1(m.y)});m.x=p.x;m.y=p.y;fx(inst,{k:'tp',x:r1(m.x),y:r1(m.y)});bmsg(inst,m,'분신이 나타났다! 그림자가 있는 것이 진짜다','#c77ad8');return 0.8;},
  stackMark(inst,m){const ps=livingPlayers(inst);if(!ps.length)return 0.2;const T=pick(ps);const t=3*m.tf;fx(inst,{k:'mark',id:T.id,d:t,c:'y',txt:'모이세요!'});
    later(inst,t,()=>{if(m.dead||T.inst!==inst)return;const inside=livingPlayers(inst).filter(p=>Math.hypot(p.x-T.x,p.y-T.y)<38);const total=m.dmg*2.2*Math.max(1,inst.players.size);fx(inst,{k:'strike',x:r1(T.x),y:r1(T.y)});fx(inst,{k:'ring',x:r1(T.x),y:r1(T.y),r:38,c:'y',c2:'w'});for(const p of inside)hurtPlayer(inst,p,total/Math.max(1,inside.length),m);});return 0.4;},
  chainMark(inst,m){const t=3*m.tf;const ps=livingPlayers(inst);for(const p of ps)fx(inst,{k:'mark',id:p.id,d:t,c:'c',txt:'떨어지세요!'});
    later(inst,t,()=>{if(m.dead)return;const live=livingPlayers(inst);for(const p of live){const n=live.filter(q=>q!==p&&Math.hypot(q.x-p.x,q.y-p.y)<44).length;fx(inst,{k:'strike',x:r1(p.x),y:r1(p.y)});hurtPlayer(inst,p,m.dmg*0.9*(1+n),m);}});return 0.4;},
  whirlwind(inst,m){for(let i=0;i<2;i++){const p=nearPoint(inst,m,30);const a=R()*6.28;addHz(inst,{x:p.x,y:p.y,r:18,t:7,arm:0.6,dmg:m.dmg*0.4,vis:27,vx:Math.cos(a)*45,vy:Math.sin(a)*45});}bmsg(inst,m,'회오리가 몰아친다!','#8fd0ff');return 0.7;},
  collapse(inst,m){const n=5+inst.players.size;const t=1.2*m.tf;for(let i=0;i<n;i++){const ps=livingPlayers(inst);const p=i<ps.length?{x:ps[i].x,y:ps[i].y}:roomPoint(inst);fx(inst,{k:'tele',x:r1(p.x),y:r1(p.y),r:22,d:t,c:'S'});addHz(inst,{x:p.x,y:p.y,r:22,t:8,arm:t,dmg:m.dmg*0.6,vis:25,burst:m.dmg*1.2});}bmsg(inst,m,'바닥이 무너진다!','#ffd35a');fx(inst,{k:'shake',v:3});return 1;},
  voidOrb(inst,m){const T=m.tgt;if(!T)return 0.3;const a=Math.atan2(T.y-m.y,T.x-m.x);m.atkT=0.6;later(inst,0.6*m.tf,()=>{if(!m.dead)mproj(inst,m,'void',a,48,m.dmg*2,{r:8,life:6,h:12,burstR:34});});fx(inst,{k:'sfx',n:'boss'});return 1;},
  portals(inst,m){for(let i=0;i<2;i++){const p=roomPoint(inst,m,50);addHz(inst,{x:p.x,y:p.y,r:12,t:4,arm:0.6,vis:26,shoot:0.45,sdmg:m.dmg*0.6});}bmsg(inst,m,'차원 균열이 열렸다!','#c77ad8');return 0.8;},
  darkness(inst,m){inst.dark=12;bmsg(inst,m,'빛이 삼켜진다...','#6a3aa0');for(let i=0;i<2;i++){const p=nearPoint(inst,m,40);spawnAdd(inst,m,'hound',p.x,p.y);}return 0.8;},
  doom(inst,m){if(m.didDoom)return BP.circles(inst,m);m.didDoom=true;const t=8;fx(inst,{k:'doom',d:t});bmsg(inst,m,'종말의 카운트다운! 보호막과 방어 스킬을 모두 쓰세요!','#ff4a3a');
    later(inst,t,()=>{if(m.dead)return;fx(inst,{k:'shake',v:8});fx(inst,{k:'flash'});for(const p of livingPlayers(inst))hurtPlayer(inst,p,m.dmg*5,m,{nododge:true});});return 1;},
  swipe(inst,m){const T=m.tgt;if(!T)return 0.3;const a=Math.atan2(T.y-m.y,T.x-m.x),t=0.45*m.tf;m.atkT=t;fx(inst,{k:'telecone',x:r1(m.x),y:r1(m.y),a:r1(a),r:m.r+22,arc:0.9,d:t});
    later(inst,t,()=>{if(m.dead)return;fx(inst,{k:'cleave',x:r1(m.x),y:r1(m.y),a:r1(a),s:1});for(const p of livingPlayers(inst)){const d=Math.hypot(p.x-m.x,p.y-m.y);if(d<m.r+26&&(d<m.r+4||angDiff(Math.atan2(p.y-m.y,p.x-m.x),a)<0.9)){hurtPlayer(inst,p,m.dmg*1.0,m);if(m.burnOn)addBurn(inst,p,m,1);}}});return t+0.3;}
};
function addBurn(inst,P,m,n){if(P.downed)return;P.burn=(P.burn||0)+n;fx(inst,{k:'txt',x:r1(P.x),y:r1(P.y-30),s:`화상 ${Math.min(5,P.burn)}`,c:'#ff8a3a'});
  if(P.burn>=5){P.burn=0;fx(inst,{k:'boom',x:r1(P.x),y:r1(P.y),r:30});hurtPlayer(inst,P,m.dmg*2.5,m,{nododge:true});for(const q of livingPlayers(inst))if(q!==P&&Math.hypot(q.x-P.x,q.y-P.y)<30)hurtPlayer(inst,q,m.dmg,m);}}
function initBoss(inst,m){const f=inst.floor,th=SH.themeOf(f),bd=SH.bossOf(f);m.bossInit=true;m.bname=bd.n;m.theme=th.idx;m.corrupt=th.corrupt;m.final=!!bd.final;m.tf=th.corrupt?0.8:1;m.phase=1;m.fightT=0;m.patCd=2;m.spdMul=1;
  m.p1=bd.pats.slice();m.p2=bd.p2.slice();m.p3=(bd.p3||[]).slice();
  if(th.corrupt&&!bd.final){const other=SH.THEMES[(th.idx+3)%10].boss.pats;m.p1.push(other[0]);m.p2.push(other[1]);}
  m.col=['e','c','o','z','c','e','y','P','y','P'][th.idx];}
function bossAI(inst,m,T,d,dt,sm){if(!m.bossInit)initBoss(inst,m);m.face=T.x<m.x?-1:1;m.fightT+=dt;
  if(m.vuln>0)m.vuln-=dt;if(m.invul>0&&m.invul<90){m.invul-=dt;if(m.invul<0)m.invul=0;}
  if(m.invul>=90&&!inst.monsters.some(o=>!o.dead&&o.guardOf===m.id)&&!m.hidden){m.invul=0;bmsg(inst,m,'보호가 풀렸다! 지금 공격하세요','#ffd35a');}
  const hpf=m.hp/m.maxHp;
  if(m.phase===1&&hpf<0.5){m.phase=2;m.patCd=0.5;bmsg(inst,m,`${m.bname}이(가) 격노한다!`,'#ff4a3a');fx(inst,{k:'shake',v:5});fx(inst,{k:'sfx',n:'boss'});}
  if(m.phase===2&&m.p3.length&&hpf<0.2){m.phase=3;m.patCd=0.3;m.forceNext=m.p3[0];}
  if(!m.enraged&&m.fightT>240){m.enraged=true;m.dmg*=1.6;m.spdMul=1.4;bmsg(inst,m,`${m.bname}이(가) 광폭해졌다! (시간 초과)`,'#ff4a3a');}
  farHarass(inst,m,dt);
  if(m.busy>0){m.busy-=dt;return;}
  if(m.vuln>0)return;
  m.patCd-=dt;
  if(m.patCd<=0){let name=m.forceNext;m.forceNext=null;if(!name){const pool=m.phase>1?m.p1.concat(m.p2,m.p2):m.p1;const opts=pool.filter(p=>p!==m.last);name=pick(opts.length?opts:pool);}
    const busy=(BP[name]||BP.slam)(inst,m,T);m.busy=busy;m.last=name;m.patCd=rf(1.6,2.6)*(m.corrupt?0.8:1)*(m.enraged?0.7:1)*(m.phase>1?0.85:1)*(m.partyCd||1);return;}
  if(d<m.r+4+18&&m.cd<=0){m.cd=m.d.cd*(m.corrupt?0.8:1);m.busy=BP.swipe(inst,m,T);return;}
  chase(inst,m,T,dt,sm*m.spdMul*(m.corrupt?1.2:1));}
// 멀리 떨어진 플레이어 견제: 근거리만 맞고 원거리는 편한 상황을 막는다 (발밑 경고 → 폭발, 움직이면 피함)
function farHarass(inst,m,dt){if(m.hidden||m.dead)return;m.farCd=(m.farCd==null?4:m.farCd)-dt;if(m.farCd>0)return;
  m.farCd=(m.phase>1?BAL.farCd2:BAL.farCd1)*(m.corrupt?0.85:1)*(m.enraged?0.8:1)/(BAL.farTheme[m.theme]||1);
  const far=livingPlayers(inst).filter(p=>Math.hypot(p.x-m.x,p.y-m.y)>BAL.farDist);if(!far.length)return;const t=1.0*m.tf,r=22;
  for(const p of far){const x=p.x,y=p.y;fx(inst,{k:'tele',x:r1(x),y:r1(y),r,d:t,c:m.col});later(inst,t,()=>{if(m.dead)return;fx(inst,{k:'boom',x:r1(x),y:r1(y),r});hitCircle(inst,x,y,r,m.dmg*BAL.farDmg,m);});}}
// 보스방 규칙: 일반 몬스터 출입 금지 · 보스는 방 밖으로 못 나감 · 전투 중엔 방 안의 플레이어도 못 나감
function bossRoomRules(inst){const r=inst.map&&inst.map.bossRoom;if(!r)return;const x0=r.x*TS,y0=r.y*TS,x1=(r.x+r.w)*TS,y1=(r.y+r.h)*TS;
  const inR=(x,y,pad)=>x>=x0-pad&&x<x1+pad&&y>=y0-pad&&y<y1+pad;const boss=inst.monsters.find(m=>m.boss&&!m.dead);
  for(const m of inst.monsters){if(m.dead)continue;
    if(m.boss){if(!inR(m.x,m.y,-6)){m.x=clamp(m.x,x0+8,x1-8);m.y=clamp(m.y,y0+8,y1-8);}}
    else if(!m.summ&&!m.guardOf&&inR(m.x,m.y,6)&&m.lx!=null&&!inR(m.lx,m.ly,6)){m.x=m.lx;m.y=m.ly;}
    m.lx=m.x;m.ly=m.y;}
  const lock=!!(boss&&boss.alert);if(lock!==!!inst.bossLock){inst.bossLock=lock;bcast(inst,{t:'block',r:lock?{x:x0,y:y0,w:x1-x0,h:y1-y0}:null});if(lock)fx(inst,{k:'msg',m:'보스방 입구가 봉인됐다! 보스를 쓰러뜨려야 나갈 수 있다',c:'#ff6a5a'});}
  for(const P of instPlayers(inst)){if(!lock){P.inBoss=false;continue;}const inside=inR(P.x,P.y,-2);if(inside)P.inBoss=true;else if(P.inBoss){P.x=clamp(P.x,x0+6,x1-6);P.y=clamp(P.y,y0+6,y1-6);if(SH.blocked(inst.map,P.x,P.y,3)){P.x=(r.cx*TS+8);P.y=(r.cy*TS+8);}send(P,{t:'tp',x:P.x,y:P.y});}}}
function updateHazards(inst,dt){for(let i=inst.hz.length-1;i>=0;i--){const h=inst.hz[i];
  if(h.arm>0){h.arm-=dt;if(h.arm<=0&&h.burst){fx(inst,{k:'boom',x:r1(h.x),y:r1(h.y),r:h.r,c:1});hitCircle(inst,h.x,h.y,h.r,h.burst,h.src);}continue;}
  h.t-=dt;if(h.t<=0){inst.hz.splice(i,1);continue;}
  if(h.vx){const nx=h.x+h.vx*dt,ny=h.y+h.vy*dt;if(SH.blocked(inst.map,nx,h.y,8))h.vx=-h.vx;else h.x=nx;if(SH.blocked(inst.map,h.x,ny,8))h.vy=-h.vy;else h.y=ny;}
  if(h.shoot){h.st=(h.st||0)-dt;if(h.st<=0){h.st=h.shoot;const ps=livingPlayers(inst);if(ps.length){const T=ps.reduce((a,b)=>Math.hypot(a.x-h.x,a.y-h.y)<Math.hypot(b.x-h.x,b.y-h.y)?a:b);const a=Math.atan2(T.y-h.y,T.x-h.x);inst.projs.push({id:inst.pid++,type:'void',owner:'m',x:h.x,y:h.y,vx:Math.cos(a)*110,vy:Math.sin(a)*110,dmg:h.sdmg,r:3,life:3,h:10});}}}
  for(const p of livingPlayers(inst)){let inside;if(h.global)inside=!h.safeSpots.some(s=>Math.hypot(p.x-s.x,p.y-s.y)<30);else inside=Math.hypot(p.x-h.x,p.y-h.y)<h.r+3;if(!inside)continue;
    if(h.slow){p.slowT=0.3;p.slowV=Math.max(p.slowV||0,h.slow);}if(h.root){p.rootT=Math.max(p.rootT||0,h.root);}}
  h.tick-=dt;if(h.tick>0)continue;h.tick=h.iv;
  if(h.dmg)for(const p of livingPlayers(inst)){let inside;if(h.global)inside=!h.safeSpots.some(s=>Math.hypot(p.x-s.x,p.y-s.y)<30);else inside=Math.hypot(p.x-h.x,p.y-h.y)<h.r+3;if(!inside)continue;const before=p.hp;hurtPlayer(inst,p,h.dmg,h.src,{nododge:true,quiet:true});
    if(h.heal&&h.src&&!h.src.dead){const got=Math.max(0,before-p.hp)*h.heal;h.src.hp=Math.min(h.src.maxHp,h.src.hp+got);if(got>0)fx(inst,{k:'heal',x:r1(h.src.x),y:r1(h.src.y-30),v:Math.round(got)});}}}}
function updateMonsters(inst,dt){const map=inst.map;
  for(const m of inst.monsters){
    if(m.dead)continue;m.flash=Math.max(0,m.flash-dt);if(m.slow>0)m.slow-=dt;m.cd-=dt;m.ccd-=dt;if(m.atkT>0)m.atkT-=dt;m.moving=false;if(m.taunt){m.taunt.t-=dt;if(m.taunt.t<=0)m.taunt=null;}
    if(m.shT>0){m.shT-=dt;if(m.shT<=0)m.shV=0;}
    if(m.stun>0){m.stun-=dt;m.wind=0;m.charge=0;continue;}
    if(m.type==='goblin'){goblinAI(inst,m,dt);continue;}
    if(m.ea&&m.alert){m.tpT-=dt;m.shCd-=dt;const T0=m.tgt;
      if(m.ea&8&&m.tpT<=0&&T0&&Math.hypot(T0.x-m.x,T0.y-m.y)>60){for(let k=0;k<8;k++){const a=R()*Math.PI*2,nx=T0.x+Math.cos(a)*18,ny=T0.y+Math.sin(a)*18;if(!SH.blocked(map,nx,ny,m.r)){fx(inst,{k:'blink',x:r1(m.x),y:r1(m.y)});m.x=nx;m.y=ny;fx(inst,{k:'blink',x:r1(nx),y:r1(ny)});break;}}m.tpT=rf(4.5,6);}
      if(m.ea&16&&m.shCd<=0){m.shV=Math.round(m.maxHp*0.25);m.shT=3.5;m.shCd=rf(8,10);fx(inst,{k:'txt',x:r1(m.x),y:r1(m.y-24),s:'보호막!',c:'#8fd0ff'});}}
    if(m.hatch!=null){m.hatch-=dt;if(m.hatch<=0){m.dead=true;fx(inst,{k:'mdie',id:m.id});for(let i=0;i<2;i++){const p={x:m.x+rf(-8,8),y:m.y+rf(-8,8)};if(!SH.blocked(inst.map,p.x,p.y,5))spawnAdd(inst,m,'zombie',p.x,p.y);}fx(inst,{k:'msg',m:'알이 부화했다!',c:'#e0574a'});}continue;}
    if(m.d.stat){const Tn=pickTarget(inst,m);m.alert=true;if(Tn&&Math.hypot(Tn.x-m.x,Tn.y-m.y)<m.r+18&&m.cd<=0&&m.dmg>0){m.tgt=Tn;startWind(m,'melee',0.4);}if(m.wind>0){m.wind-=dt;if(m.wind<=0)monsterStrike(inst,m);}continue;}
    m.tgtT-=dt;if(m.tgtT<=0||!m.tgt||m.tgt.downed||m.tgt.inst!==inst){m.tgt=pickTarget(inst,m);m.tgtT=0.5;}
    const T=m.tgt;
    if(!T){if(m.boss&&m.alert)m.alert=false;wanderStep(inst,m,dt);continue;}
    const dx=T.x-m.x,dy=T.y-m.y,d=Math.hypot(dx,dy)||1;
    if(d>380&&!m.boss&&!m.alert)continue;
    const sm=m.slow>0?0.5:1;
    if(!m.alert){if(d<150&&SH.los(map,m.x,m.y,T.x,T.y))alertPack(inst,m);else{wanderStep(inst,m,dt);continue;}}
    if(m.wind>0){m.wind-=dt;if(m.wind<=0)monsterStrike(inst,m);continue;}
    if(m.charge>0){m.charge-=dt;const st=210*dt;const ok=SH.moveEnt(map,m,m.cdx*st,m.cdy*st);m.moving=true;for(const p of livingPlayers(inst)){if(!m.chit.has(p.id)&&Math.hypot(p.x-m.x,p.y-m.y)<m.r+4+3){m.chit.add(p.id);hurtPlayer(inst,p,m.dmg*1.3,m);}}if(!ok)m.charge=0;continue;}
    if(m.boss){bossAI(inst,m,T,d,dt,sm);continue;}
    if(Math.abs(dx)>1)m.face=dx<0?-1:1;
    if(m.type==='skel'){const vis=d<180&&SH.los(map,m.x,m.y,T.x,T.y);
      if(d<50&&vis){const st=m.spd*sm*dt,ux=-dx/d,uy=-dy/d;if(!SH.moveEnt(map,m,ux*st,uy*st))SH.moveEnt(map,m,-uy*st,ux*st);m.moving=true;}
      else if(vis&&d<170&&m.cd<=0)startWind(m,'shoot',0.45);
      else if(!vis||d>=150)chase(inst,m,T,dt,sm);}
    else{
      if(m.type==='hound'&&m.ccd<=0&&d<110&&d>30&&SH.los(map,m.x,m.y,T.x,T.y,m.r)){startWind(m,'charge',0.45);m.ccd=3;continue;}
      if(d<m.r+4+6){if(m.cd<=0)startWind(m,'melee',0.3);}else chase(inst,m,T,dt,sm);}
  }
  const ms=inst.monsters;
  for(let i=0;i<ms.length;i++){const a=ms[i];if(a.dead||!a.alert)continue;for(let j=i+1;j<ms.length;j++){const b=ms[j];if(b.dead)continue;const dx=b.x-a.x,dy=b.y-a.y,rr=a.r+b.r;if(Math.abs(dx)>rr||Math.abs(dy)>rr)continue;const d=Math.hypot(dx,dy)||0.01;if(d<rr){const p=(rr-d)/2,ux=dx/d,uy=dy/d;if(!a.boss)SH.moveEnt(map,a,-ux*p,-uy*p);if(!b.boss)SH.moveEnt(map,b,ux*p,uy*p);}}}
  inst.monsters=ms.filter(m=>!m.dead);
}

function goblinAI(inst,m,dt){const map=inst.map;let near=null,nd=1e9;for(const p of livingPlayers(inst)){const d=Math.hypot(p.x-m.x,p.y-m.y);if(d<nd){nd=d;near=p;}}
  if(!m.alert){if(near&&nd<130&&SH.los(map,m.x,m.y,near.x,near.y)){m.alert=true;m.gT=15;fx(inst,{k:'msg',m:'보물 고블린이다! 15초 안에 잡지 못하면 도망친다',c:'#ffd35a'});fx(inst,{k:'sfx',n:'legend'});}else{wanderStep(inst,m,dt);return;}}
  m.gT-=dt;if(m.gT<=0){m.dead=true;fx(inst,{k:'blink',x:r1(m.x),y:r1(m.y)});fx(inst,{k:'mdie',id:m.id});fx(inst,{k:'msg',m:'보물 고블린이 차원문으로 도망쳤다...',c:'#9e937a'});return;}
  if(!near)return;const dx=m.x-near.x,dy=m.y-near.y,d=Math.hypot(dx,dy)||1;if(d>200){m.moving=false;return;}const st=m.spd*(m.slow>0?0.5:1)*dt;let ux=dx/d,uy=dy/d;
  if(!SH.moveEnt(map,m,ux*st,uy*st)){const s2=(m.id%2?1:-1);if(!SH.moveEnt(map,m,-uy*st*s2,ux*st*s2))SH.moveEnt(map,m,uy*st*s2,-ux*st*s2);}m.moving=true;m.face=ux<0?-1:1;}

// ================= 돌발 이벤트 (고블린 · 제단 · 비밀방 · 떠돌이 상인) =================
function randRoomPt(inst,avoid){const map=inst.map;const rs=map.rooms.filter(r=>r!==map.start&&r!==map.bossRoom&&!(avoid||[]).includes(r)&&!(map.stairsIdx===r.cy*map.w+r.cx));if(!rs.length)return null;const r=pick(rs);return{r,x:r.cx*TS+8,y:r.cy*TS+8};}
function setupEvents(inst){const f=inst.floor,map=inst.map;const ev={altar:null,trader:null,secret:map.secret?{open:false,chests:map.secret.chests.map(c=>({x:c.x,y:c.y,open:false}))}:null};inst.ev=ev;const used=[];const hints=[];
  if(!map.boss){
    if(R()<0.2){const p=randRoomPt(inst,used);if(p){used.push(p.r);ev.altar={x:p.x,y:p.y,st:0,wave:0,t:0,ids:[]};hints.push('어딘가에서 저주받은 제단의 기운이 느껴진다');}}
    if(f>=3&&R()<0.14){const p=randRoomPt(inst,used);if(p){used.push(p.r);ev.trader={x:p.x+10,y:p.y,stock:{}};hints.push('떠돌이 상인의 방울 소리가 들린다');}}
    if(ev.secret)hints.push('벽 틈으로 바람이 새어 나온다... 비밀 통로가 있을지도');}
  inst.traps=[];if(!map.boss&&f>=2)setupTraps(inst);
  {const li=SH.LORE.findIndex((_,i)=>SH.loreFloor(i)===f);if(li>=0){const p=randRoomPt(inst,used);if(p){used.push(p.r);ev.lore={x:p.x-12,y:p.y+10,i:li};hints.push('바닥에 낡은 일지가 떨어져 있는 것 같다');}}}
  if(R()<(map.boss?0.1:0.22)){const p=randRoomPt(inst,used);if(p){const g=spawnMonster(inst,'goblin',p.x,p.y,false);g.xp=Math.round(g.xp*2);}}
  if(hints.length)setTimeout(()=>{for(const h of hints)bcast(inst,{t:'msg',m:h,c:'#c9a0e8'});},2600);}
function evPub(inst){const e=inst.ev;if(!e)return null;return{lore:e.lore||null,altar:e.altar?{x:e.altar.x,y:e.altar.y,st:e.altar.st,wave:e.altar.wave,left:e.altar.ids.filter(id=>inst.monsters.some(m=>m.id===id&&!m.dead)).length}:null,trader:e.trader?{x:e.trader.x,y:e.trader.y}:null,secret:e.secret?{open:e.secret.open,chests:e.secret.chests}:null};}
function bcastEv(inst){bcast(inst,{t:'ev',ev:evPub(inst)});}
// ---- 함정: 가시(0) · 화염 분사구(1) · 굴러오는 돌(2) ----
function trapDmg(f){return Math.round(8*(1+0.25*(f-1)));}
function setupTraps(inst){const map=inst.map,f=inst.floor;const n=Math.min(9,2+Math.floor(f/8));const rs=map.rooms.filter(r=>r!==map.start&&r!==map.bossRoom);
  for(let k=0;k<n&&rs.length;k++){const r=pick(rs);const roll=R();
    if(roll<0.2&&r.w>=8){const y=(r.y+1+ri(0,Math.max(0,r.h-3)))*TS+8;inst.traps.push({k:2,x:(r.x+1)*TS+8,y,x0:(r.x+1)*TS+8,x1:(r.x+r.w-2)*TS+8,v:70*(R()<0.5?1:-1),cd:{},st:1});continue;}
    for(let t=0;t<10;t++){const tx=r.x+1+ri(0,r.w-3),ty=r.y+1+ri(0,r.h-3);const x=tx*TS+8,y=ty*TS+8;if(inst.traps.some(q=>Math.hypot(q.x-x,q.y-y)<40))continue;inst.traps.push({k:roll<0.62?0:1,x,y,ph:R()*4,st:0,hit:{}});break;}}}
function updateTraps(inst,dt){if(!inst.traps||!inst.traps.length)return;const base=trapDmg(inst.floor);const ps=livingPlayers(inst);
  for(const t of inst.traps){
    if(t.k===0){const c=(inst.time+t.ph)%3.2;const st=c<1.8?0:c<2.3?1:2;if(st===2&&t.st!==2)t.hit={};t.st=st;if(st===2)for(const P of ps){if(t.hit[P.id]||P.dodgeT>0)continue;if(Math.abs(P.x-t.x)<9&&Math.abs(P.y-t.y)<9){t.hit[P.id]=1;hurtPlayer(inst,P,base,null,{what:'가시 함정',nododge:false});}}}
    else if(t.k===1){const c=(inst.time+t.ph)%4;const st=c<2.4?0:c<3?1:2;t.st=st;if(st===2){t.tk=(t.tk||0)-dt;if(t.tk<=0){t.tk=0.25;for(const P of ps)if(Math.hypot(P.x-t.x,P.y-t.y)<18)hurtPlayer(inst,P,base*0.35,null,{what:'화염 분사구',quiet:true});}}}
    else{t.x+=t.v*dt;if(t.x<t.x0){t.x=t.x0;t.v=-t.v;}if(t.x>t.x1){t.x=t.x1;t.v=-t.v;}for(const P of ps){if(Math.hypot(P.x-t.x,P.y-t.y)<10&&(t.cd[P.id]||0)<inst.time){t.cd[P.id]=inst.time+0.9;hurtPlayer(inst,P,base*1.2,null,{what:'굴러오는 돌'});if(!P.downed){P.slowT=Math.max(P.slowT||0,0.8);P.slowV=Math.max(P.slowV||0,0.4);}}}}}}
// ================= 용병 (혼자일 때만) =================
function syncAllies(inst){const ps=instPlayers(inst);inst.allies=inst.allies||[];const want=ps.length===1&&ps[0].ch.merc&&!inst.arena?ps[0]:null;
  inst.allies=inst.allies.filter(a=>want&&a.owner===want.id&&a.type===want.ch.merc);
  if(want&&!inst.allies.length){const P=want,M=SH.MERCS[P.ch.merc];const hp=Math.round(P.S.maxHp*M.hp);inst.allies.push({id:'m'+(nextId++),ally:true,owner:P.id,type:P.ch.merc,ch:{cls:M.cls,name:'용병 '+M.n},x:P.x-10,y:P.y+6,r:4,hp,maxHp:hp,downed:false,revT:0,face:1,cd:0,hcd:2,inst,atk:0,mv:false});}
  for(const a of inst.allies){a.inst=inst;const P=players.get(a.owner);if(P){const hp=Math.round(P.S.maxHp*SH.MERCS[a.type].hp);if(hp!==a.maxHp){a.hp=Math.min(hp,a.hp*hp/a.maxHp);a.maxHp=hp;}}}}
function hurtAlly(inst,a,d){if(a.downed)return;const v=Math.max(1,Math.round(d*0.8*rf(0.9,1.1)));a.hp-=v;fx(inst,{k:'txt',x:r1(a.x),y:r1(a.y-20),s:String(v),c:'#ff9a8a'});if(a.hp<=0){a.hp=0;a.downed=true;a.revT=10;fx(inst,{k:'msg',m:`${a.ch.name}이(가) 쓰러졌습니다 · 10초 뒤 일어납니다`,c:'#ff9a8a'});}}
function updateAllies(inst,dt){if(!inst.allies)return;for(const a of inst.allies){const P=players.get(a.owner);if(!P||P.inst!==inst)continue;a.atk=Math.max(0,a.atk-dt);a.mv=false;
  if(a.downed){a.revT-=dt;if(a.revT<=0){a.downed=false;a.hp=Math.round(a.maxHp*0.5);fx(inst,{k:'revive',id:P.id});}continue;}
  a.hp=Math.min(a.maxHp,a.hp+a.maxHp*0.01*dt);const map=inst.map;const dO=Math.hypot(P.x-a.x,P.y-a.y);if(dO>300){a.x=P.x-8;a.y=P.y+6;continue;}
  let tg=null,td=1e9;for(const m of inst.monsters){if(m.dead||m.pvp||m.hidden||m.dummy)continue;const d=Math.hypot(m.x-a.x,m.y-a.y);if(d<td&&d<150&&SH.los(map,a.x,a.y,m.x,m.y)){td=d;tg=m;}}
  const M=SH.MERCS[a.type];a.cd-=dt;a.hcd-=dt;const step=(tx,ty,sp)=>{const dx=tx-a.x,dy=ty-a.y,d=Math.hypot(dx,dy);if(d<2)return;const st=Math.min(d,sp*dt);SH.moveEnt(map,a,dx/d*st,dy/d*st);a.mv=true;if(Math.abs(dx)>1)a.face=dx<0?-1:1;};
  if(a.type==='p'&&a.hcd<=0){const low=[P,a].filter(q=>q.hp<(q.maxHp||q.S.maxHp)*0.8);if(low.length){a.hcd=3;a.atk=0.4;healPlayer(inst,P,P.S.healPow*0.9,P);a.hp=Math.min(a.maxHp,a.hp+P.S.healPow*0.6);fx(inst,{k:'heal',x:r1(P.x),y:r1(P.y-20),v:Math.round(P.S.healPow*0.9)});}}
  if(tg&&dO<200){if(a.type==='w'){if(td>tg.r+10)step(tg.x,tg.y,78);else{a.face=tg.x<a.x?-1:1;if(a.cd<=0){a.cd=1.1;a.atk=0.3;hitMonster(inst,tg,P,M.mult,{el:'slash'});}}}
    else{const ang=Math.atan2(tg.y-a.y,tg.x-a.x);a.face=Math.cos(ang)<0?-1:1;if(td<55)step(a.x-Math.cos(ang)*30,a.y-Math.sin(ang)*30,70);else if(td>120)step(tg.x,tg.y,70);
      if(a.cd<=0&&td<=140){a.cd=a.type==='a'?1.2:1.7;a.atk=0.3;const pj=spawnPProj(inst,P,a.type==='a'?'arrow':'holy',ang,a.type==='a'?270:220,M.mult);pj.x=a.x+Math.cos(ang)*6;pj.y=a.y-2+Math.sin(ang)*6;}}}
  else{const fx2=P.x-(P.face||1)*18,fy=P.y+8;if(Math.hypot(fx2-a.x,fy-a.y)>12)step(fx2,fy,Math.max(80,dO*1.5));}}}
function updateEvents(inst,dt){updateTraps(inst,dt);syncAllies(inst);updateAllies(inst,dt);const a=inst.ev&&inst.ev.altar;if(!a||a.st!==1)return;a.t-=dt;const alive=a.ids.filter(id=>inst.monsters.some(m=>m.id===id&&!m.dead));
  if(a.t<=0||(!alive.length&&a.t<9)){if(a.wave>=3){if(!alive.length){a.st=2;altarReward(inst,a);bcastEv(inst);}return;}
    a.wave++;a.t=13;const n=2+a.wave+Math.max(1,inst.players.size);const f=inst.floor;
    for(let i=0;i<n;i++){let x=a.x,y=a.y;for(let k=0;k<10;k++){const an=R()*Math.PI*2,rr=rf(40,80);x=a.x+Math.cos(an)*rr;y=a.y+Math.sin(an)*rr;if(!SH.blocked(inst.map,x,y,5))break;}const m=spawnMonster(inst,pickType(f),x,y,i===0);m.alert=true;m.altar=1;a.ids.push(m.id);fx(inst,{k:'blink',x:r1(x),y:r1(y)});}
    fx(inst,{k:'msg',m:`제단의 저주 · ${a.wave}/3 물결`,c:'#ff6a5a'});fx(inst,{k:'shake',v:3});bcastEv(inst);}}
function lootFor(inst,P,x,y,o){const f=inst.floor,fam=CLASSES[P.ch.cls].fam;for(let i=0;i<o.items;i++)addDrop(inst,{kind:'item',owner:P.id,it:SH.genItem(f+1,fam,i===0?o.minR:1,20,R,2)},x,y);
  for(let i=0;i<o.gold;i++)addDrop(inst,{kind:'gold',owner:P.id,amt:Math.max(1,Math.round(ri(4,9)*f*BAL.gold))},x,y);for(let i=0;i<o.gems;i++)addDrop(inst,{kind:'gem',owner:P.id,g:SH.randGem(f+3)},x,y);}
function altarReward(inst,a){fx(inst,{k:'msg',m:'저주를 이겨냈다! 제단이 보물을 내어준다',c:'#ffd35a'});fx(inst,{k:'sfx',n:'legend'});for(const P of instPlayers(inst)){stInc(P,'alt');lootFor(inst,P,a.x,a.y+8,{items:2,minR:2,gold:4,gems:1});gainXP(P,Math.round(40*(1+0.3*inst.floor)));}}
function traderStock(inst,P){const t=inst.ev.trader;let st=t.stock[P.id];if(!st){st=[];const fam=CLASSES[P.ch.cls].fam;for(let i=0;i<4;i++){const it=SH.genItem(inst.floor+2,fam,1,i===0?60:25,R,2);it.price=Math.round(it.value*2.6);st.push(it);}t.stock[P.id]=st;}return st;}

// ================= 결투장 =================
const PVP_MUL=0.45,ARENA_TIME=120;
function foe(inst,P,m){if(!m.pvp)return true;if(m.pvp===P.id)return false;const T=players.get(m.pvp);return !!T&&T.arenaTeam!==P.arenaTeam;}
function duelTeams(P,T){const hubOk=q=>q.inst===hub;const a=P.party&&P.party.leader===P.id?partyList(P.party).filter(hubOk):[P];const b=T.party?partyList(T.party).filter(hubOk):[T];
  if(a.length>1&&b.length===a.length&&P.party!==T.party&&T.party.leader===T.id)return[a,b];return[[P],[T]];}
function startArena(A,B){const seed=(Math.random()*2147483647)|0;const all=A.concat(B);const lv=Math.round(all.reduce((s2,q)=>s2+q.ch.lvl,0)/all.length);
  const inst={id:'a'+(nextId++),type:'dungeon',arena:{cd:3.5,t:0,over:false,endT:0,size:A.length},party:null,players:new Set(),floor:clamp(lv,1,100),seed,map:SH.genArena(seed),monsters:[],projs:[],drops:[],zones:[],timers:[],hz:[],dark:0,fx:[],paused:null,mid:1,pid:1,did:1,time:0,flows:new Map(),meter:new Map(),bossMeter:null,bossStart:0,trans:null,wipeT:0,meterT:0,stairsOpen:false,ev:null};
  dungeons.set(inst.id,inst);const sp=inst.map.spawns;
  [A,B].forEach((team,ti)=>team.forEach((P,k)=>{leaveInst(P);P.inst=inst;inst.players.add(P.id);P.arenaTeam=ti;resetCombat(P);P.hp=P.S.maxHp;P.mp=P.S.maxMp;P.x=sp[ti].x;P.y=sp[ti].y+(k-(team.length-1)/2)*22;
    inst.monsters.push({id:inst.mid++,type:'pvp',tc:-1,pvp:P.id,team:ti,x:P.x,y:P.y,r:5,maxHp:1e9,hp:1e9,dmg:0,d:{},alert:true,dead:false,slow:0,stun:0,flash:0,face:1,cd:0,ccd:0,atkT:0,wind:0,charge:0});}));
  for(const P of all){sendMap(P);if(P.party)sendParty(P.party);}bcastRoster(inst);bcastRoster(hub);
  bcast(inst,{t:'arena',st:'cd',t0:3,teams:Object.fromEntries(all.map(q=>[q.id,q.arenaTeam])),names:[A.map(q=>q.ch.name),B.map(q=>q.ch.name)]});}
function updateArena(inst,dt){const A=inst.arena;inst.time+=dt;
  for(const m of inst.monsters){if(!m.pvp)continue;const P=players.get(m.pvp);if(!P||P.inst!==inst){m.dead=true;continue;}m.x=P.x;m.y=P.y;}inst.monsters=inst.monsters.filter(m=>!m.dead);
  if(A.cd>0){A.cd-=dt;if(A.cd<=0)bcast(inst,{t:'arena',st:'go'});return;}
  updatePlayers(inst,dt);updateDots(inst,dt);updateProjs(inst,dt);updateZones(inst,dt);updateTimers(inst,dt);
  if(A.over){A.endT-=dt;if(A.endT<=0)closeArena(inst);return;}
  A.t+=dt;const ps=instPlayers(inst);const alive=[0,1].map(t=>ps.filter(q=>q.arenaTeam===t&&!q.downed).length);const here=[0,1].map(t=>ps.filter(q=>q.arenaTeam===t).length);
  let win=-1;if(!here[0]||!alive[0])win=1;else if(!here[1]||!alive[1])win=0;
  else if(A.t>=ARENA_TIME){const hp=[0,1].map(t=>ps.filter(q=>q.arenaTeam===t).reduce((s2,q)=>s2+(q.downed?0:q.hp/q.S.maxHp),0)/Math.max(1,here[t]));win=hp[0]>=hp[1]?0:1;fx(inst,{k:'msg',m:'시간 종료 · 남은 체력으로 판정',c:'#ffd35a'});}
  inst.meterT-=dt;if(inst.meterT<=0){inst.meterT=1;bcast(inst,{t:'meter',rows:meterRows(inst.meter),boss:null,hist:[]});}
  if(win>=0)endArena(inst,win);}
function endArena(inst,win){const A=inst.arena;A.over=true;A.endT=4.5;const ps=instPlayers(inst);
  for(const P of ps){if(P.arenaTeam===win)P.ch.pvp.w++;else P.ch.pvp.l++;markDirty(P);}
  bcast(inst,{t:'arena',st:'end',win,time:Math.round(A.t),rows:meterRows(inst.meter),teams:Object.fromEntries(ps.map(q=>[q.id,q.arenaTeam]))});
  for(const P of ps)msg(P,P.arenaTeam===win?'결투 승리!':'결투 패배...',P.arenaTeam===win?'#ffd35a':'#ff6a5a');}
function closeArena(inst){for(const P of instPlayers(inst)){P.arenaTeam=null;joinHub(P);if(P.party)sendParty(P.party);}}
function pvpHit(inst,m,P,mult,o){const T=players.get(m.pvp);const A=inst.arena;if(!A||!T||T.inst!==inst||T.downed||A.cd>0||A.over||T.arenaTeam===P.arenaTeam)return;
  const r=rollDmg(P,mult);const v=Math.max(1,Math.round(r.d*PVP_MUL));const hp0=T.hp;hurtPlayer(inst,T,v,null,{what:P.ch.name+'의 공격'});const dealt=Math.max(0,hp0-T.hp);if(dealt)addMeter(inst,P,'dmg',dealt);
  if(o.slow&&!T.downed){T.slowT=Math.max(T.slowT||0,Math.min(1.5,o.slow));T.slowV=Math.max(T.slowV||0,0.3);}if(o.stun&&!T.downed)T.rootT=Math.max(T.rootT||0,Math.min(0.6,o.stun*0.3));
  if(P.S.ls&&!P.downed&&dealt)P.hp=Math.min(P.S.maxHp,P.hp+dealt*P.S.ls/100);fx(inst,{k:'spark',x:r1(T.x),y:r1(T.y-8),c:r.crit?'y':'r'});}
function withFoes(inst,P,f){if(!inst.arena)return f();const all=inst.monsters;inst.monsters=all.filter(m=>foe(inst,P,m));try{return f();}finally{const extra=inst.monsters.filter(m=>!all.includes(m));inst.monsters=all.concat(extra);}}

// ================= 전투 =================
// 혼자일 때 딜이 약한 직업 보정 (수호자·사제가 솔로로도 진행할 수 있게)
const SOLO_DMG={guardian:1.7,priest:1.4};
function synMods(inst,P){const b=(inst&&inst.synM&&inst.synM[P.ch.cls])||{dmg:1,dr:0,regen:1};const sb=inst&&inst.type!=='hub'&&inst.players&&inst.players.size===1?(SOLO_DMG[P.ch.cls]||1):1;return sb===1?b:{dmg:b.dmg*sb,dr:b.dr,regen:b.regen};}
function bOn(P,k){return P.buffs[k+'T']>0?P.buffs[k]:0;}
function buff(P,k,v,t){const b=P.buffs;if(b[k+'T']>0&&b[k]>v){b[k+'T']=Math.max(b[k+'T'],t);return;}b[k]=v;b[k+'T']=Math.max(b[k+'T']||0,t);}
function atkMul(P){return 1+bOn(P,'as');}
function rollDmg(P,mult){const S=P.S;const bonus=1+bOn(P,'dmg')+bOn(P,'sdmg')+bOn(P,'bdmg');let d=S.dmgBase*rf(0.8,1.2)*S.dmgMul*mult*bonus*synMods(P.inst,P).dmg;const crit=R()*100<S.crit;if(crit)d*=S.critMul;return{d:Math.max(1,Math.round(d)),crit};}
function hitMonster(inst,m,P,mult,o){if(m.dead)return;o=o||{};if(m.pvp){pvpHit(inst,m,P,mult,o);return;}if(m.hidden)return;if(m.invul>0){if(!o.dotHit&&R()<0.3)fx(inst,{k:'txt',x:r1(m.x),y:r1(m.y-(m.boss?34:18)),s:'무적',c:'#9e937a'});return;}if(m.vuln>0)mult*=2;if(o.exec&&m.hp<m.maxHp*0.3)mult*=2;const r=rollDmg(P,mult);let v=r.d;if(m.shV>0&&m.shT>0){const ab=Math.min(m.shV,v);m.shV-=ab;v-=ab;if(v<=0){if(R()<0.4)fx(inst,{k:'txt',x:r1(m.x),y:r1(m.y-20),s:'보호막',c:'#8fd0ff'});return;}}const real=Math.min(v,m.hp);m.hp-=v;m.flash=0.09;if(!m.alert)alertPack(inst,m);
  addMeter(inst,P,'dmg',real);const el=o.el||inst._el||baseEl(P);fx(inst,{k:'dmg',x:r1(m.x),y:r1(m.y-(m.boss?32:17)),v,c:o.dotHit?2:r.crit?1:0,e:SH.EL_LIST.indexOf(el)});
  if(o.slow)m.slow=Math.max(m.slow,o.slow);if(o.stun)m.stun=Math.max(m.stun,m.boss?o.stun*0.25:o.stun);
  if(o.dot){m.dots=m.dots||[];m.dots.push({pid:P.id,per:o.dot.mult/(o.dot.dur*2),n:Math.round(o.dot.dur*2),t:0.5,c:o.dot.c||'r'});}
  if(m.type==='goblin'&&R()<0.3)addDrop(inst,{kind:'gold',owner:P.id,amt:Math.max(1,Math.round(ri(2,5)*inst.floor*BAL.gold))},m.x,m.y);
  if(m.dummy){m.hp=m.maxHp;const w=P.dps||(P.dps={t0:inst.time,last:0,tot:0,win:[]});if(inst.time-w.last>4){w.t0=inst.time;w.tot=0;w.win=[];}w.last=inst.time;w.tot+=v;w.win.push([inst.time,v]);return;}
  if(o.kb&&!m.boss){const a=Math.atan2(m.y-P.y,m.x-P.x);SH.moveEnt(inst.map,m,Math.cos(a)*o.kb,Math.sin(a)*o.kb);}
  if(P.S.ls&&!P.downed)P.hp=Math.min(P.S.maxHp,P.hp+real*P.S.ls/100);
  if(m.hp<=0)killMonster(inst,m,P);}
function hurtPlayer(inst,P,d,src,o){o=o||{};if(P.downed||P.inst!==inst)return;
  if(P.dodgeT>0&&!o.nododge){fx(inst,{k:'txt',x:r1(P.x),y:r1(P.y-18),s:'회피',c:'#8fd0ff'});return;}
  let keep=1-SH.dmgReduce(P.S,inst.floor);keep*=1-bOn(P,'red');keep*=1-bOn(P,'wred');keep*=1-bOn(P,'tred');keep*=1-(P.S.dr||0);keep*=1-synMods(inst,P).dr;
  let v=Math.max(1,Math.round(d*keep*rf(0.9,1.1)));
  if(P.shield>0){const ab=Math.min(P.shield,v);P.shield-=ab;v-=ab;const by=players.get(P.shieldBy);if(by&&by.inst===inst)addMeter(inst,by,'shield',ab);fx(inst,{k:'txt',x:r1(P.x),y:r1(P.y-24),s:String(ab),c:'#bfe3ff'});}
  if(v<=0)return;
  addMeter(inst,P,'taken',Math.min(v,P.hp));P.hp-=v;fx(inst,{k:'pdmg',id:P.id,v,q:o.quiet?1:0});
  if(src&&src.ea&&!src.dead){if(src.ea&1){P.slowT=Math.max(P.slowT||0,1.6);P.slowV=Math.max(P.slowV||0,0.35);}if(src.ea&4){src.hp=Math.min(src.maxHp,src.hp+v*1.5);}}
  {const dl=P.dlog||(P.dlog=[]);dl.push({n:srcName(inst,src,o),v,t:inst.time});while(dl.length&&inst.time-dl[0].t>10)dl.shift();}
  if(P.hp<=0){const ur=(P.ch.sk&&P.ch.sk.undying)||0;
    if(ur>0&&(P.undyCd||0)<=0){P.hp=Math.round(P.S.maxHp*0.3);P.undyCd=120-8*ur;fx(inst,{k:'txt',x:r1(P.x),y:r1(P.y-30),s:'불굴!',c:'#ffd35a'});fx(inst,{k:'revive',id:P.id});return;}
    P.hp=0;P.downed=true;P.rev=0;P.shield=0;fx(inst,{k:'pdown',id:P.id});sendDeathSum(inst,P);fx(inst,{k:'msg',m:`${P.ch.name}님이 쓰러졌습니다`,c:'#ff6a5a'});}}
function srcName(inst,src,o){if(o&&o.what)return o.what;if(src&&src.type){if(src.boss||src.type==='boss')return SH.bossOf(inst.floor).n;if(src.type==='clone')return SH.bossOf(inst.floor).n+' 분신';const en=src.ea?SH.eaffNames(src.ea).join('·')+' ':'';return en+SH.monName(inst.floor,src.type,src.elite,src.id);}return inst.bossId?SH.bossOf(inst.floor).n+'의 패턴':'함정·투사체';}
function sendDeathSum(inst,P){const dl=P.dlog||[];const by=new Map();let tot=0;for(const e of dl){if(inst.time-e.t>10)continue;const r=by.get(e.n)||{n:e.n,v:0,c:0};r.v+=e.v;r.c++;by.set(e.n,r);tot+=e.v;}
  const rows=[...by.values()].sort((a,b)=>b.v-a.v).slice(0,5);const last=dl.length?dl[dl.length-1]:null;const dur=dl.length?Math.max(0.1,inst.time-dl[0].t):0;
  send(P,{t:'dsum',rows,tot,dur:Math.round(dur*10)/10,killer:last?last.n:null,kv:last?last.v:0,maxHp:P.S.maxHp});P.dlog=[];}
function healPlayer(inst,T,amt,src){if(T.downed||T.inst!==inst)return;if(inst.arena&&src&&src.arenaTeam!==T.arenaTeam)return;const real=Math.min(Math.round(amt),T.S.maxHp-Math.ceil(T.hp));T.hp=Math.min(T.S.maxHp,T.hp+amt);if(real>0){addMeter(inst,src,'heal',real);fx(inst,{k:'heal',x:r1(T.x),y:r1(T.y-20),v:real});}}
function gainXP(P,x){P.ch.xp+=x;let up=0;while(P.ch.xp>=SH.xpFor(P.ch.lvl)){P.ch.xp-=SH.xpFor(P.ch.lvl);P.ch.lvl++;P.ch.pts+=3;P.ch.spts=(P.ch.spts||0)+1;up++;}
  if(up){recalc(P);P.hp=P.S.maxHp;P.mp=P.S.maxMp;if(P.inst)fx(P.inst,{k:'lvl',id:P.id});msg(P,`레벨 ${P.ch.lvl} 달성 · 스탯 +3 (C) · 스킬 포인트 +1 (K)`,'#ffd35a');
    const nu=CLASSES[P.ch.cls].skills.filter(s=>SKILLS[s].lvl>P.ch.lvl-up&&SKILLS[s].lvl<=P.ch.lvl);for(const s of nu)msg(P,`새 스킬 해금: ${SKILLS[s].n}`,'#8fd0ff');
    if(P.inst)bcastRoster(P.inst);if(P.party)sendParty(P.party);}markDirty(P);}
function addDrop(inst,o,x,y){let tx=x,ty=y;for(let t=0;t<14;t++){const a=R()*Math.PI*2,r=rf(5,20),nx=x+Math.cos(a)*r,ny=y+Math.sin(a)*r;if(!SH.blocked(inst.map,nx,ny,3)){tx=nx;ty=ny;break;}}
  o.id=inst.did++;o.sx=r1(x);o.sy=r1(y);o.x=r1(tx);o.y=r1(ty);o.born=inst.time;inst.drops.push(o);
  for(const p of instPlayers(inst))if(o.owner==null||o.owner===p.id)send(p,{t:'dadd',d:[o]});return o;}
function remDrop(inst,d){const i=inst.drops.indexOf(d);if(i>=0)inst.drops.splice(i,1);bcast(inst,{t:'drem',id:d.id});}
function killMonster(inst,m,killer){if(m.dummy)return;m.dead=true;m.hp=0;fx(inst,{k:'mdie',id:m.id});if(killer&&inst.meter&&!m.boss&&!m.summ){const mm=getMeter(inst.meter,killer);if(m.elite)mm.elites++;else mm.kills++;}
  const f=inst.floor;
  for(const P of instPlayers(inst)){gainXP(P,m.xp);if(P===killer)P.ch.kills++;const fam=CLASSES[P.ch.cls].fam,own=P.id;
    if(!m.summ){if(m.boss){bump(P,'boss',1);P.ch.bossK=(P.ch.bossK|0)+1;}else{bump(P,'kill',1);if(m.elite)bump(P,'elite',1);}}
    {const th=SH.themeOf(f);if(m.boss)addCdx(P,f>=100?'b:fin':'b:'+th.idx);else if(m.type==='goblin'){addCdx(P,'gob');stInc(P,'gob');}else if(['zombie','skel','hound'].includes(m.type)&&!m.summ)addCdx(P,`m:${th.idx}:${m.type}`);}
    if(m.type==='goblin'){lootFor(inst,P,m.x,m.y,{items:R()<0.5?2:1,minR:2,gold:8,gems:1});continue;}
    if(m.boss){const th0=SH.themeOf(f);const en=f>=100?5:th0.corrupt?2:1;P.ch.mats.ess+=en;msg(P,`핏빛 정수 +${en}`,'#ff5a6a');for(let i=0;i<2;i++)addDrop(inst,{kind:'gem',owner:own,g:SH.randGem(f+5)},m.x,m.y);}
    else if(R()<(m.elite?0.2:0.025))addDrop(inst,{kind:'gem',owner:own,g:SH.randGem(f)},m.x,m.y);
    if(m.boss){const th=SH.themeOf(f);const legP=f>=100?1:BAL.legBase+(th.corrupt?BAL.legCorrupt:0)+f*BAL.legPerFloor;
      for(let i=0;i<3;i++){const leg=i===0&&R()<legP;addDrop(inst,{kind:'item',owner:own,it:leg?SH.genItem(f+2,fam,3,0,R,3):SH.genItem(f+2,fam,i===0?2:1,i===0?0:25,R,2)},m.x,m.y);}for(let i=0;i<4;i++)addDrop(inst,{kind:'gold',owner:own,amt:ri(10,20)*f},m.x,m.y);addDrop(inst,{kind:'hp',owner:own},m.x,m.y);}
    else{if(R()<(m.elite?0.9:BAL.dropItem))addDrop(inst,{kind:'item',owner:own,it:SH.genItem(f+(m.elite?1:0),fam,m.elite?1:0,m.elite?8:0,R,2)},m.x,m.y);
      if(R()<.35)addDrop(inst,{kind:'gold',owner:own,amt:Math.max(1,Math.round(ri(2,6)*f*(m.elite?3:1)*BAL.gold))},m.x,m.y);if(R()<BAL.dropHp)addDrop(inst,{kind:'hp',owner:own},m.x,m.y);if(R()<BAL.dropMp)addDrop(inst,{kind:'mp',owner:own},m.x,m.y);}}
  if(m.type==='goblin')fx(inst,{k:'msg',m:'보물 고블린을 잡았다! 보물이 쏟아진다',c:'#ffd35a'});
  if(m.altar&&inst.ev)bcastEv(inst);
  if(m.ea&2){for(let i=0;i<2;i++){const x=m.x+rf(-8,8),y=m.y+rf(-8,8);if(SH.blocked(inst.map,x,y,5))continue;const c=spawnMonster(inst,m.type,x,y,false);c.maxHp=c.hp=Math.round(m.maxHp*0.3);c.xp=Math.round(m.xp*0.1);c.summ=true;c.alert=true;fx(inst,{k:'blink',x:r1(x),y:r1(y)});}}
  if(m.ea&32){const x=m.x,y=m.y,dm=m.dmg*2.2;fx(inst,{k:'tele',x:r1(x),y:r1(y),r:42,d:1});later(inst,1,()=>{fx(inst,{k:'boom',x:r1(x),y:r1(y),r:42});fx(inst,{k:'shake',v:3});hitCircle(inst,x,y,42,dm,null,{what:'자폭 정예의 폭발'});});}
  if(m.boss){{const th=SH.themeOf(inst.floor);fx(inst,{k:'bsay',id:m.id,x:r1(m.x),y:r1(m.y),m:th.final?SH.FINAL_LINES[1]:SH.BOSS_LINES[th.idx][1],dead:1});}inst.stairsOpen=true;SH.openStairs(inst.map);bcast(inst,{t:'stairs'});fx(inst,{k:'shake',v:7});fx(inst,{k:'msg',m:'보스를 쓰러뜨렸다! 아래로 가는 계단이 열렸다',c:'#ffd35a'});
    const rows=inst.bossMeter?meterRows(inst.bossMeter):[];const res={title:`${m.bname||SH.bossOf(f).n} 처치`,floor:f,time:Math.round(inst.time-inst.bossStart),rows};(inst.bossHist=inst.bossHist||[]).push(res);if(inst.bossHist.length>20)inst.bossHist.shift();bcast(inst,Object.assign({t:'result'},res));inst.bossMeter=null;inst.bossId=null;}}

// ---------- 플레이어 공격/스킬 ----------
function spawnPProj(inst,P,type,a,speed,mult,o){o=o||{};const p={id:inst.pid++,type,owner:'p',pid:P.id,x:P.x+Math.cos(a)*6,y:P.y-2+Math.sin(a)*6,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,mult,r:o.r||2,life:o.life||1.3,h:8,pierce:!!o.pierce,hit:new Set(),boom:o.boom||0,dot:o.dot||null,bounce:o.bounce||0,aura:o.aura||null,slow:o.slow||0,ghost:!!o.ghost,el:inst._el||null};inst.projs.push(p);return p;}
function basicAttack(inst,P,a){const C=CLASSES[P.ch.cls];if(P.atkCd>0.06)return;P.atkCd=1/(P.S.atkRate*atkMul(P));P.face=Math.cos(a)<0?-1:1;
  if(C.basic.kind==='melee'){const dur=clamp(0.3*1.25/(P.S.atkRate*atkMul(P)),0.12,0.36);fx(inst,{k:'swing',id:P.id,a:r1(a),d:r1(dur)});
    for(const m of inst.monsters){if(m.dead)continue;const dx=m.x-P.x,dy=m.y-(P.y-4),d=Math.hypot(dx,dy);if(d>4+m.r+20)continue;if(d<4+m.r+3||angDiff(Math.atan2(dy,dx),a)<1.15)hitMonster(inst,m,P,C.basic.mult,{kb:3});}}
  else{fx(inst,{k:'shot',id:P.id,a:r1(a)});spawnPProj(inst,P,SH.PROJ_LIST[C.basic.proj],a,C.basic.speed,C.basic.mult);}}
function clampTarget(P,tx,ty,max){const dx=tx-P.x,dy=ty-P.y,d=Math.hypot(dx,dy);if(d<=max)return[tx,ty];return[P.x+dx/d*max,P.y+dy/d*max];}
function partyNear(inst,P,r){return livingPlayers(inst).filter(q=>Math.hypot(q.x-P.x,q.y-P.y)<=r&&(!inst.arena||q.arenaTeam===P.arenaTeam));}
function dashTo(inst,P,a,dist){let nx=P.x,ny=P.y;for(let s=dist;s>=0;s-=4){const x=P.x+Math.cos(a)*s,y=P.y+Math.sin(a)*s;if(!SH.blocked(inst.map,x,y,4)&&SH.los(inst.map,P.x,P.y,x,y,3)){nx=x;ny=y;break;}}const ox=P.x,oy=P.y;P.x=nx;P.y=ny;send(P,{t:'tp',x:nx,y:ny});return[ox,oy];}
function aoe(inst,P,x,y,r,mult,o){let n=0;for(const m of inst.monsters)if(!m.dead&&Math.hypot(m.x-x,m.y-y)<r+m.r){hitMonster(inst,m,P,mult,o);n++;}return n;}
function cone(inst,P,a,r,arc,mult,o){for(const m of inst.monsters){if(m.dead)continue;const d=Math.hypot(m.x-P.x,m.y-P.y);if(d<r+m.r&&(d<10||angDiff(Math.atan2(m.y-P.y,m.x-P.x),a)<arc))hitMonster(inst,m,P,mult,o);}}
function addZone(inst,P,o){inst.zones.push(Object.assign({x:P.x,y:P.y,r:30,t:3,tick:0,iv:0.5,dmg:0,heal:0,slow:0,vis:0,pid:P.id,follow:false,trap:false},o));}
function later(inst,t,f){inst.timers.push({t,f,el:inst._el});}
// 타격음 속성: 스킬·투사체·기본 무기별
const SKILL_EL={whirl:'slash',charge:'blunt',cleave:'slash',leap:'quake',rend:'slash',bladestorm:'slash',execute:'heavy',earthsplit:'quake',
  bash:'blunt',hook:'blunt',consecrate:'holy',slam:'quake',shieldthrow:'blunt',bastion:'holy',
  multishot:'arrow',pierce:'arrow',rain:'arrow',trap:'zap',poison:'poison',volley:'arrow',sniper:'heavy',barrage:'arrow',starfall:'holy',
  fireball:'fire',nova:'ice',chain:'zap',meteor:'fire',frostorb:'ice',flamewall:'fire',blizzard:'ice',thunder:'zap',armageddon:'fire',
  smite:'holy',sanctuary:'holy',purify:'holy',holyfire:'fire',lightpillar:'holy',miracle:'holy'};
const PROJ_EL={arrow:'arrow',parrow:'arrow',pierce:'arrow',bolt:'zap',holy:'holy',holybeam:'holy',fire:'fire',fireb:'fire',orb:'magic',frostorb:'ice',ice:'ice',poison:'poison',void:'void',shieldp:'blunt',web:'magic',page:'magic'};
function baseEl(P){const C=CLASSES[P.ch.cls];if(C.fam==='bow')return 'arrow';if(C.fam==='staff')return P.ch.cls==='priest'?'holy':'magic';const k=P.ch.eq.weapon&&P.ch.eq.weapon.kind;return k==='mace'?'blunt':k==='great'?'heavy':'slash';}
function alive(inst,P){return P&&P.inst===inst&&!P.downed;}
const SK={
  // ----- 전사 -----
  whirl(inst,P,a,tx,ty,k){fx(inst,{k:'whirl',id:P.id});aoe(inst,P,P.x,P.y,38,1.6*k,{kb:7});},
  charge(inst,P,a,tx,ty,k){const[ox,oy]=dashTo(inst,P,a,100);fx(inst,{k:'dash',x1:r1(ox),y1:r1(oy),x2:r1(P.x),y2:r1(P.y)});
    for(const m of inst.monsters){if(m.dead)continue;const vx=P.x-ox,vy=P.y-oy,L2=vx*vx+vy*vy||1;const t=clamp(((m.x-ox)*vx+(m.y-oy)*vy)/L2,0,1);if(Math.hypot(ox+vx*t-m.x,oy+vy*t-m.y)<14+m.r)hitMonster(inst,m,P,1.8*k,{kb:5});}},
  warcry(inst,P,a,tx,ty,k){fx(inst,{k:'warcry',x:r1(P.x),y:r1(P.y)});for(const q of partyNear(inst,P,120))buff(q,'dmg',0.25*k,8);},
  cleave(inst,P,a,tx,ty,k){fx(inst,{k:'cleave',x:r1(P.x),y:r1(P.y),a:r1(a)});cone(inst,P,a,58,0.75,2.5*k,{stun:1.2,kb:4});},
  leap(inst,P,a,tx,ty,k){[tx,ty]=clampTarget(P,tx,ty,120);const[ox,oy]=dashTo(inst,P,Math.atan2(ty-P.y,tx-P.x),Math.hypot(tx-P.x,ty-P.y));fx(inst,{k:'leap',x1:r1(ox),y1:r1(oy),x2:r1(P.x),y2:r1(P.y)});P.dodgeT=Math.max(P.dodgeT,0.3);
    later(inst,0.3,()=>{if(!alive(inst,P))return;fx(inst,{k:'quake',x:r1(P.x),y:r1(P.y),r:40});aoe(inst,P,P.x,P.y,40,2.0*k,{stun:1,kb:6});});},
  rend(inst,P,a,tx,ty,k){fx(inst,{k:'swing',id:P.id,a:r1(a),d:0.25});fx(inst,{k:'cleave',x:r1(P.x),y:r1(P.y),a:r1(a),s:1});cone(inst,P,a,36,0.8,0.8*k,{dot:{mult:2.5*k,dur:5,c:'r'}});},
  berserk(inst,P,a,tx,ty,k,rank){fx(inst,{k:'ring',x:r1(P.x),y:r1(P.y),r:40,c:'e',c2:'o'});fx(inst,{k:'sfx',n:'shout'});buff(P,'as',0.4+0.03*(rank-1),8);buff(P,'sdmg',0.2*k,8);},
  bladestorm(inst,P,a,tx,ty,k){addZone(inst,P,{r:36,t:3,iv:0.25,dmg:0.375*k,vis:7,follow:true});fx(inst,{k:'sfx',n:'whirl'});},
  execute(inst,P,a,tx,ty,k){let b=null,bd=1e9;for(const m of inst.monsters){if(m.dead)continue;const d=Math.hypot(m.x-P.x,m.y-P.y);if(d<34+m.r&&(d<10||angDiff(Math.atan2(m.y-P.y,m.x-P.x),a)<0.8)&&d<bd){bd=d;b=m;}}
    fx(inst,{k:'swing',id:P.id,a:r1(a),d:0.3});if(b){fx(inst,{k:'execute',x:r1(b.x),y:r1(b.y)});hitMonster(inst,b,P,4*k,{exec:true,kb:6});fx(inst,{k:'shake',v:3});}},
  earthsplit(inst,P,a,tx,ty,k){fx(inst,{k:'quake',x:r1(P.x),y:r1(P.y),r:72});fx(inst,{k:'shake',v:6});aoe(inst,P,P.x,P.y,72,3.5*k,{stun:2,kb:8});},
  // ----- 수호자 -----
  taunt(inst,P){fx(inst,{k:'taunt',x:r1(P.x),y:r1(P.y)});buff(P,'tred',0.3,3);for(const m of inst.monsters)if(!m.dead&&Math.hypot(m.x-P.x,m.y-P.y)<95){m.taunt={pid:P.id,t:5};m.tgt=P;if(!m.alert)alertPack(inst,m);}},
  bash(inst,P,a,tx,ty,k){fx(inst,{k:'swing',id:P.id,a:r1(a),d:0.25});fx(inst,{k:'bash',x:r1(P.x+Math.cos(a)*14),y:r1(P.y+Math.sin(a)*14)});cone(inst,P,a,32,0.9,1.4*k,{stun:2,kb:6});},
  bulwark(inst,P,a,tx,ty,k,rank){fx(inst,{k:'bulwark',x:r1(P.x),y:r1(P.y)});for(const q of partyNear(inst,P,120))buff(q,'red',0.35+0.02*(rank-1),6);},
  hook(inst,P,a,tx,ty,k){let hit=null;for(let s=8;s<=150&&!hit;s+=4){const x=P.x+Math.cos(a)*s,y=P.y+Math.sin(a)*s;if(SH.solidAt(inst.map,x,y))break;for(const m of inst.monsters)if(!m.dead&&Math.hypot(m.x-x,m.y-y)<m.r+4){hit=m;break;}}
    const ex=hit?hit.x:P.x+Math.cos(a)*150,ey=hit?hit.y:P.y+Math.sin(a)*150;fx(inst,{k:'hook',x1:r1(P.x),y1:r1(P.y),x2:r1(ex),y2:r1(ey)});
    if(hit){if(!hit.boss){const nx=P.x+Math.cos(a)*16,ny=P.y+Math.sin(a)*16;if(!SH.blocked(inst.map,nx,ny,hit.r)){hit.x=nx;hit.y=ny;}}hit.taunt={pid:P.id,t:3};hit.tgt=P;hitMonster(inst,hit,P,1.0*k,{});}},
  shieldwall(inst,P,a,tx,ty,k,rank){fx(inst,{k:'ring',x:r1(P.x),y:r1(P.y),r:18,c:'c',c2:'y'});fx(inst,{k:'sfx',n:'shield'});buff(P,'wred',0.6,4+0.2*(rank-1));},
  consecrate(inst,P,a,tx,ty,k){addZone(inst,P,{r:44,t:5,iv:0.5,dmg:0.3*k,heal:P.S.healPow*0.12*k,vis:6});fx(inst,{k:'sfx',n:'holy'});},
  slam(inst,P,a,tx,ty,k){fx(inst,{k:'quake',x:r1(P.x),y:r1(P.y),r:50});fx(inst,{k:'shake',v:3});aoe(inst,P,P.x,P.y,50,1.8*k,{slow:3,kb:4});},
  rally(inst,P,a,tx,ty,k,rank){fx(inst,{k:'shieldfx',x:r1(P.x),y:r1(P.y)});fx(inst,{k:'sfx',n:'shout'});for(const q of partyNear(inst,P,120)){q.shield=Math.max(q.shield,Math.round(q.S.maxHp*(0.2+0.02*(rank-1))));q.shieldT=8;q.shieldBy=P.id;}},
  shieldthrow(inst,P,a,tx,ty,k){fx(inst,{k:'shot',id:P.id,a:r1(a)});spawnPProj(inst,P,'shieldp',a,240,1.5*k,{bounce:3,r:3,life:1.6});},
  bastion(inst,P,a,tx,ty,k,rank){fx(inst,{k:'ring',x:r1(P.x),y:r1(P.y),r:150,c:'y',c2:'c'});fx(inst,{k:'shake',v:3});fx(inst,{k:'sfx',n:'shout'});
    for(const q of partyNear(inst,P,150))buff(q,'red',0.4+0.02*(rank-1),8);for(const m of inst.monsters)if(!m.dead&&Math.hypot(m.x-P.x,m.y-P.y)<150){m.taunt={pid:P.id,t:4};m.tgt=P;if(!m.alert)alertPack(inst,m);}},
  // ----- 궁수 -----
  multishot(inst,P,a,tx,ty,k){fx(inst,{k:'shot',id:P.id,a:r1(a)});for(let n=-2;n<=2;n++)spawnPProj(inst,P,'parrow',a+n*0.13,280,0.7*k);},
  pierce(inst,P,a,tx,ty,k){fx(inst,{k:'shot',id:P.id,a:r1(a)});spawnPProj(inst,P,'pierce',a,330,2.2*k,{pierce:true,r:3,life:1.2});},
  rain(inst,P,a,tx,ty,k){[tx,ty]=clampTarget(P,tx,ty,220);addZone(inst,P,{x:tx,y:ty,r:34,t:2.5,iv:0.25,dmg:0.3*k,vis:1});fx(inst,{k:'sfx',n:'bow'});},
  vault(inst,P,a,tx,ty,k){const[ox,oy]=dashTo(inst,P,a+Math.PI,60);fx(inst,{k:'tp',x:r1(ox),y:r1(oy)});fx(inst,{k:'shot',id:P.id,a:r1(a)});for(let n=-1;n<=1;n++)spawnPProj(inst,P,'parrow',a+n*0.1,280,0.85*k);},
  trap(inst,P,a,tx,ty,k){[tx,ty]=clampTarget(P,tx,ty,200);const mine=inst.zones.filter(z=>z.trap&&z.pid===P.id);if(mine.length>=3)inst.zones.splice(inst.zones.indexOf(mine[0]),1);addZone(inst,P,{x:tx,y:ty,r:12,t:25,trap:true,dmg:2.5*k,slow:3,vis:8});fx(inst,{k:'sfx',n:'equip'});},
  poison(inst,P,a,tx,ty,k){fx(inst,{k:'shot',id:P.id,a:r1(a)});spawnPProj(inst,P,'poison',a,280,1.0*k,{dot:{mult:3*k,dur:5,c:'z'}});},
  volley(inst,P,a,tx,ty,k){fx(inst,{k:'shot',id:P.id,a:r1(a)});for(let n=-4;n<=4;n++)spawnPProj(inst,P,'parrow',a+n*0.11,270,0.6*k);},
  sniper(inst,P,a,tx,ty,k){fx(inst,{k:'aim',id:P.id,a:r1(a)});later(inst,1.0,()=>{if(!alive(inst,P))return;fx(inst,{k:'shot',id:P.id,a:r1(a)});fx(inst,{k:'sfx',n:'bolt'});spawnPProj(inst,P,'pierce',a,500,6*k,{pierce:true,r:4,life:1.2});});},
  barrage(inst,P,a,tx,ty,k){for(let n=0;n<12;n++)later(inst,n*0.125,()=>{if(!alive(inst,P))return;fx(inst,{k:'shot',id:P.id,a:r1(a)});spawnPProj(inst,P,'parrow',a+rf(-0.06,0.06),300,0.8*k);});},
  starfall(inst,P,a,tx,ty,k){[tx,ty]=clampTarget(P,tx,ty,220);for(let n=0;n<3;n++){const x=tx+rf(-12,12),y=ty+rf(-8,8);fx(inst,{k:'tele',x:r1(x),y:r1(y),r:36,d:0.4+n*0.4});later(inst,0.4+n*0.4,()=>{if(!P.inst||P.inst!==inst)return;fx(inst,{k:'boom',x:r1(x),y:r1(y),r:36,c:1});fx(inst,{k:'shake',v:3});aoe(inst,P,x,y,36,3*k,{kb:5});});}},
  // ----- 마법사 -----
  fireball(inst,P,a,tx,ty,k){fx(inst,{k:'shot',id:P.id,a:r1(a)});spawnPProj(inst,P,'fire',a,210,1.7*P.S.spell*k,{r:3,life:1.4,boom:24});fx(inst,{k:'sfx',n:'fire'});},
  nova(inst,P,a,tx,ty,k){fx(inst,{k:'nova',x:r1(P.x),y:r1(P.y)});aoe(inst,P,P.x,P.y,66,1.2*P.S.spell*k,{slow:3});},
  chain(inst,P,a,tx,ty,k){[tx,ty]=clampTarget(P,tx,ty,180);let cur=null,bd=70;for(const m of inst.monsters){if(m.dead)continue;const d=Math.hypot(m.x-tx,m.y-ty);if(d<bd&&SH.los(inst.map,P.x,P.y,m.x,m.y)){bd=d;cur=m;}}
    const pts=[[r1(P.x),r1(P.y-6)]];if(!cur){pts.push([r1(tx),r1(ty)]);fx(inst,{k:'chain',pts});return;}const hit=new Set();
    for(let n=0;n<4&&cur;n++){hit.add(cur);pts.push([r1(cur.x),r1(cur.y-6)]);hitMonster(inst,cur,P,1.3*P.S.spell*k,{});let nx=null,nd=75;for(const m of inst.monsters){if(m.dead||hit.has(m))continue;const d=Math.hypot(m.x-cur.x,m.y-cur.y);if(d<nd){nd=d;nx=m;}}cur=nx;}
    fx(inst,{k:'chain',pts});},
  blink(inst,P,a,tx,ty){const d=Math.min(130,Math.hypot(tx-P.x,ty-P.y));let nx=P.x,ny=P.y;for(let s=d;s>=0;s-=4){const x=P.x+Math.cos(a)*s,y=P.y+Math.sin(a)*s;if(!SH.blocked(inst.map,x,y,4)){nx=x;ny=y;break;}}fx(inst,{k:'tp',x:r1(P.x),y:r1(P.y)});P.x=nx;P.y=ny;send(P,{t:'tp',x:nx,y:ny});fx(inst,{k:'tp',x:r1(nx),y:r1(ny)});},
  meteor(inst,P,a,tx,ty,k){[tx,ty]=clampTarget(P,tx,ty,220);fx(inst,{k:'tele',x:r1(tx),y:r1(ty),r:40,d:1,c:'o'});fx(inst,{k:'meteor',x:r1(tx),y:r1(ty),d:1});
    later(inst,1,()=>{if(!P.inst||P.inst!==inst)return;fx(inst,{k:'boom',x:r1(tx),y:r1(ty),r:40});fx(inst,{k:'shake',v:5});aoe(inst,P,tx,ty,40,4*P.S.spell*k,{kb:6});addZone(inst,P,{x:tx,y:ty,r:34,t:3,iv:0.5,dmg:0.3*P.S.spell*k,vis:2});});},
  frostorb(inst,P,a,tx,ty,k){fx(inst,{k:'shot',id:P.id,a:r1(a)});fx(inst,{k:'sfx',n:'ice'});spawnPProj(inst,P,'frostorb',a,90,0,{r:4,life:2.6,ghost:true,aura:{r:34,mult:0.4*P.S.spell*k,iv:0.25,tick:0}});},
  flamewall(inst,P,a,tx,ty,k){[tx,ty]=clampTarget(P,tx,ty,200);addZone(inst,P,{x:tx,y:ty,r:34,t:4,iv:0.25,dmg:0.35*P.S.spell*k,vis:2});fx(inst,{k:'sfx',n:'fire'});},
  blizzard(inst,P,a,tx,ty,k){[tx,ty]=clampTarget(P,tx,ty,220);addZone(inst,P,{x:tx,y:ty,r:60,t:5,iv:0.25,dmg:0.25*P.S.spell*k,slow:1,vis:3});fx(inst,{k:'sfx',n:'ice'});},
  thunder(inst,P,a,tx,ty,k){[tx,ty]=clampTarget(P,tx,ty,220);const tg=inst.monsters.filter(m=>!m.dead&&Math.hypot(m.x-tx,m.y-ty)<70).sort((p,q)=>Math.hypot(p.x-tx,p.y-ty)-Math.hypot(q.x-tx,q.y-ty)).slice(0,6);
    if(!tg.length)fx(inst,{k:'strike',x:r1(tx),y:r1(ty)});tg.forEach((m,i)=>later(inst,i*0.08,()=>{if(m.dead||!P.inst)return;fx(inst,{k:'strike',x:r1(m.x),y:r1(m.y)});hitMonster(inst,m,P,2.2*P.S.spell*k,{stun:0.3});}));fx(inst,{k:'sfx',n:'bolt'});},
  armageddon(inst,P,a,tx,ty,k){fx(inst,{k:'shake',v:2});fx(inst,{k:'msg',m:`${P.ch.name}: 종말이 온다!`,c:'#ff8a3a'});
    for(let n=0;n<20;n++)later(inst,n*0.25,()=>{if(!P.inst||P.inst!==inst)return;const near=inst.monsters.filter(m=>!m.dead&&Math.hypot(m.x-P.x,m.y-P.y)<150);let x,y;if(near.length&&R()<0.7){const m=pick(near);x=m.x+rf(-8,8);y=m.y+rf(-8,8);}else{x=P.x+rf(-110,110);y=P.y+rf(-70,70);}
      fx(inst,{k:'tele',x:r1(x),y:r1(y),r:26,d:0.5,c:'o'});fx(inst,{k:'meteor',x:r1(x),y:r1(y),d:0.5});later(inst,0.5,()=>{if(!P.inst||P.inst!==inst)return;fx(inst,{k:'boom',x:r1(x),y:r1(y),r:26});aoe(inst,P,x,y,26,2.5*P.S.spell*k,{kb:3});});});},
  // ----- 사제 -----
  heal(inst,P,a,tx,ty,k){[tx,ty]=clampTarget(P,tx,ty,200);fx(inst,{k:'healburst',x:r1(tx),y:r1(ty)});let any=false;for(const q of livingPlayers(inst))if(Math.hypot(q.x-tx,q.y-ty)<42){healPlayer(inst,q,P.S.healPow*1.6*k,P);any=true;}
    if(!any){let b=null,bd=90;for(const q of livingPlayers(inst)){const d=Math.hypot(q.x-tx,q.y-ty);if(d<bd){bd=d;b=q;}}if(b)healPlayer(inst,b,P.S.healPow*1.6*k,P);}},
  smite(inst,P,a,tx,ty,k){[tx,ty]=clampTarget(P,tx,ty,200);fx(inst,{k:'smite',x:r1(tx),y:r1(ty)});aoe(inst,P,tx,ty,26,1.8*P.S.spell*k,{});},
  shield(inst,P,a,tx,ty,k){fx(inst,{k:'shieldfx',x:r1(P.x),y:r1(P.y)});for(const q of partyNear(inst,P,120)){q.shield=Math.max(q.shield,Math.round(P.S.healPow*1.5*k));q.shieldT=6;q.shieldBy=P.id;}},
  sanctuary(inst,P,a,tx,ty,k){[tx,ty]=clampTarget(P,tx,ty,200);addZone(inst,P,{x:tx,y:ty,r:40,t:5,iv:0.5,heal:P.S.healPow*0.35*k,vis:0});},
  renew(inst,P){const dn=instPlayers(inst).filter(q=>q.downed&&Math.hypot(q.x-P.x,q.y-P.y)<90);if(!dn.length){msg(P,'주변에 쓰러진 동료가 없습니다','#9e937a');return false;}
    for(const q of dn){q.downed=false;q.rev=0;q.hp=Math.round(q.S.maxHp*0.5);addMeter(inst,P,'heal',q.hp);fx(inst,{k:'revive',id:q.id});fx(inst,{k:'msg',m:`${P.ch.name}님이 ${q.ch.name}님을 일으켰습니다`,c:'#7fd05a'});}},
  purify(inst,P,a,tx,ty,k){fx(inst,{k:'ring',x:r1(P.x),y:r1(P.y),r:80,c:'y',c2:'w'});fx(inst,{k:'sfx',n:'holy'});for(const q of partyNear(inst,P,80))healPlayer(inst,q,P.S.healPow*1.2*k,P);aoe(inst,P,P.x,P.y,80,1.2*P.S.spell*k,{});},
  holyfire(inst,P,a,tx,ty,k){fx(inst,{k:'shot',id:P.id,a:r1(a)});fx(inst,{k:'sfx',n:'holy'});spawnPProj(inst,P,'holybeam',a,380,2.5*P.S.spell*k,{pierce:true,r:3,life:0.8});},
  blessing(inst,P,a,tx,ty,k,rank){fx(inst,{k:'ring',x:r1(P.x),y:r1(P.y),r:200,c:'y',c2:'w'});fx(inst,{k:'sfx',n:'revive'});for(const q of partyNear(inst,P,200)){buff(q,'bdmg',0.2+0.02*(rank-1),10);buff(q,'red',0.2+0.02*(rank-1),10);}},
  lightpillar(inst,P,a,tx,ty,k){[tx,ty]=clampTarget(P,tx,ty,200);addZone(inst,P,{x:tx,y:ty,r:30,t:5,iv:0.25,dmg:0.3*P.S.spell*k,heal:P.S.healPow*0.12*k,vis:5});fx(inst,{k:'sfx',n:'holy'});},
  miracle(inst,P,a,tx,ty,k){fx(inst,{k:'msg',m:`${P.ch.name}: 기적이여!`,c:'#ffe9a8'});fx(inst,{k:'sfx',n:'revive'});for(const q of livingPlayers(inst)){healPlayer(inst,q,q.S.maxHp,P);q.shield=Math.max(q.shield,Math.round(q.S.maxHp*0.25*k));q.shieldT=8;q.shieldBy=P.id;fx(inst,{k:'revive',id:q.id});}}
};
function castSkill(inst,P,i,tx,ty){const sid=P.ch.bar&&P.ch.bar[i];if(!sid)return;const sk=SKILLS[sid];if(!sk||sk.pas||!SK[sid])return;const rank=(P.ch.sk&&P.ch.sk[sid])|0;if(rank<1)return;
  if((P.scd[sid]||0)>0.1)return;if(P.mp<sk.mp){msg(P,'마나가 부족합니다','#7aa2ff');return;}
  P.mp-=sk.mp;P.scd[sid]=sk.cd*(1-(P.S.cdr||0));const a=Math.atan2(ty-P.y,tx-P.x);P.face=Math.cos(a)<0?-1:1;
  inst._el=SKILL_EL[sid]||null;let ok;try{ok=withFoes(inst,P,()=>SK[sid](inst,P,a,tx,ty,SH.skillMul(rank),rank));}finally{inst._el=null;}if(ok===false){P.mp+=sk.mp;P.scd[sid]=0;send(P,{t:'cdr',sid});}}

// ================= 인스턴스 업데이트 =================
function updatePlayers(inst,dt){
  for(const P of instPlayers(inst)){
    P.atkCd-=dt;P.potCd-=dt;P.dodgeT-=dt;P.dodgeCd-=dt;if(P.undyCd>0)P.undyCd-=dt;if(P.slowT>0){P.slowT-=dt;if(P.slowT<=0)P.slowV=0;}if(P.rootT>0){P.rootT-=dt;if(livingPlayers(inst).some(q=>q!==P&&Math.hypot(q.x-P.x,q.y-P.y)<20)){P.rootT=0;fx(inst,{k:'txt',x:r1(P.x),y:r1(P.y-24),s:'풀려남',c:'#7fd05a'});}}for(const k in P.scd)P.scd[k]-=dt;
    const b=P.buffs;for(const k in b)if(k.endsWith('T'))b[k]-=dt;if(P.shieldT>0){P.shieldT-=dt;if(P.shieldT<=0)P.shield=0;}
    if(P.downed){if(inst.arena)continue;const helpers=livingPlayers(inst).filter(q=>Math.hypot(q.x-P.x,q.y-P.y)<22);
      if(helpers.length){P.rev+=dt*(helpers.some(q=>q.ch.cls==='priest')?2:1);if(P.rev>=3){P.downed=false;P.rev=0;P.hp=Math.round(P.S.maxHp*0.4);fx(inst,{k:'revive',id:P.id});fx(inst,{k:'msg',m:`${P.ch.name}님이 일어났습니다`,c:'#7fd05a'});}}
      else P.rev=Math.max(0,P.rev-dt*0.5);continue;}
    P.hp=Math.min(P.S.maxHp,P.hp+P.S.maxHp*0.006*dt*synMods(inst,P).regen*(P.S.regen||1));P.mp=Math.min(P.S.maxMp,P.mp+P.S.mpRegen*dt);
    for(let i=inst.drops.length-1;i>=0;i--){const d=inst.drops[i];if(d.kind==='item'||d.owner!==P.id||inst.time-d.born<0.45)continue;if(Math.hypot(d.x-P.x,d.y-P.y)<((P.ch.pet&&(d.kind==='gold'||d.kind==='gem'))?46:12)){
      if(d.kind==='gold'){P.ch.gold+=d.amt;send(P,{t:'fxp',k:'gold',x:d.x,y:d.y,v:d.amt});}
      else if(d.kind==='gem'){P.ch.gems[d.g]=(P.ch.gems[d.g]|0)+1;send(P,{t:'fxp',k:'gem',x:d.x,y:d.y,g:d.g});msg(P,`${SH.gemName(d.g)} 획득`,SH.GEM_COL[d.g[0]]);bump(P,'gem',1);}
      else{if(P.ch.pots[d.kind]>=9)continue;P.ch.pots[d.kind]++;msg(P,d.kind==='hp'?'체력 물약 획득':'마나 물약 획득',d.kind==='hp'?'#ff7a6a':'#8fd0ff');send(P,{t:'fxp',k:'pot'});}
      markDirty(P);inst.drops.splice(i,1);send(P,{t:'drem',id:d.id});}}
    {const onS=inst.stairsOpen&&inst.map.tiles[Math.floor(P.y/TS)*inst.map.w+Math.floor(P.x/TS)]===2;if(onS&&!P.onStairs&&!inst.trans)send(P,{t:'stairsAsk',floor:inst.floor+1});P.onStairs=onS;}
  }}
function updateDots(inst,dt){for(const m of inst.monsters){if(m.dead||!m.dots||!m.dots.length)continue;for(let i=m.dots.length-1;i>=0;i--){const d=m.dots[i];d.t-=dt;if(d.t>0)continue;d.t=0.5;d.n--;const P=players.get(d.pid);if(P&&P.inst===inst)hitMonster(inst,m,P,d.per,{dotHit:true});if(d.n<=0||m.dead)m.dots.splice(i,1);if(m.dead)break;}}}
function updateProjs(inst,dt){const map=inst.map;
  for(let i=inst.projs.length-1;i>=0;i--){const p=inst.projs[i];p.life-=dt;let dead=p.life<=0;
    if(p.aura&&!dead){const P=players.get(p.pid);p.aura.tick-=dt;if(p.aura.tick<=0&&P&&P.inst===inst){p.aura.tick=p.aura.iv;fx(inst,{k:'shards',x:r1(p.x),y:r1(p.y)});aoe(inst,P,p.x,p.y,p.aura.r,p.aura.mult,{slow:1.5});}}
    for(let s=0;s<2&&!dead;s++){p.x+=p.vx*dt/2;p.y+=p.vy*dt/2;
      if(SH.solidAt(map,p.x,p.y)){dead=true;if(p.boom)explode(inst,p);else fx(inst,{k:'spark',x:r1(p.x),y:r1(p.y),c:'W'});break;}
      if(p.ghost)continue;
      if(p.owner==='p'){const P=players.get(p.pid);if(!P||P.inst!==inst){dead=true;break;}
        for(const m of inst.monsters){if(m.dead||p.hit.has(m.id)||(m.pvp&&!foe(inst,P,m)))continue;if(Math.hypot(m.x-p.x,m.y-(p.y+2))<m.r+p.r+3){
          if(p.boom){dead=true;explode(inst,p);break;}
          p.hit.add(m.id);hitMonster(inst,m,P,p.mult,{kb:p.pierce?0:1,dot:p.dot,slow:p.slow,el:p.el||PROJ_EL[p.type]});
          if(p.pierce)continue;
          if(p.bounce>0){p.bounce--;let nx=null,nd=90;for(const o of inst.monsters){if(o.dead||p.hit.has(o.id))continue;const d=Math.hypot(o.x-p.x,o.y-p.y);if(d<nd){nd=d;nx=o;}}
            if(nx){const sp=Math.hypot(p.vx,p.vy),a=Math.atan2(nx.y-p.y,nx.x-p.x);p.vx=Math.cos(a)*sp;p.vy=Math.sin(a)*sp;p.life=Math.max(p.life,0.8);break;}}
          dead=true;break;}}}
      else{if(p.homing){const ps=livingPlayers(inst);if(ps.length){const T=ps.reduce((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)<Math.hypot(b.x-p.x,b.y-p.y)?a:b);const want=Math.atan2(T.y-p.y,T.x-p.x),cur=Math.atan2(p.vy,p.vx);let da=want-cur;while(da>Math.PI)da-=Math.PI*2;while(da<-Math.PI)da+=Math.PI*2;const na=cur+clamp(da,-p.homing*dt/2,p.homing*dt/2),sp=Math.hypot(p.vx,p.vy);p.vx=Math.cos(na)*sp;p.vy=Math.sin(na)*sp;}}
        for(const P of livingPlayers(inst)){if(Math.hypot(P.x-p.x,P.y-p.y)<4+p.r+1){if(p.burstR){fx(inst,{k:'boom',x:r1(p.x),y:r1(p.y),r:p.burstR});hitCircle(inst,p.x,p.y,p.burstR,p.dmg,null);dead=true;break;}if(p.root&&P.dodgeT<=0){P.rootT=p.root;fx(inst,{k:'txt',x:r1(P.x),y:r1(P.y-24),s:'속박!',c:'#e6dcc3'});}hurtPlayer(inst,P,p.dmg,p.src||null,p.sn?{what:p.sn}:undefined);fx(inst,{k:'spark',x:r1(p.x),y:r1(p.y),c:p.type==='orb'?'p':'W'});dead=true;break;}}}}
    if(dead)inst.projs.splice(i,1);}}
function explode(inst,p){const P=players.get(p.pid);fx(inst,{k:'boom',x:r1(p.x),y:r1(p.y),r:p.boom});fx(inst,{k:'shake',v:1.5});if(!P||P.inst!==inst)return;aoe(inst,P,p.x,p.y,p.boom,p.mult,{kb:4,el:p.el||PROJ_EL[p.type]});}
function updateZones(inst,dt){for(let i=inst.zones.length-1;i>=0;i--){const z=inst.zones[i];z.t-=dt;const P=players.get(z.pid);
  if(!P||P.inst!==inst||z.t<=0){inst.zones.splice(i,1);continue;}
  if(z.follow){z.x=P.x;z.y=P.y;}
  if(z.trap){const hit=inst.monsters.find(m=>!m.dead&&foe(inst,P,m)&&Math.hypot(m.x-z.x,m.y-z.y)<z.r+m.r);if(hit){fx(inst,{k:'boom',x:r1(z.x),y:r1(z.y),r:30});fx(inst,{k:'shake',v:2});aoe(inst,P,z.x,z.y,30,z.dmg,{slow:z.slow,kb:3});inst.zones.splice(i,1);}continue;}
  z.tick-=dt;if(z.tick>0)continue;z.tick=z.iv;
  if(z.dmg)aoe(inst,P,z.x,z.y,z.r,z.dmg,{slow:z.slow});
  if(z.heal)for(const q of livingPlayers(inst))if(Math.hypot(q.x-z.x,q.y-z.y)<z.r)healPlayer(inst,q,z.heal,P);}}
function updateTimers(inst,dt){for(let i=inst.timers.length-1;i>=0;i--){const t=inst.timers[i];t.t-=dt;if(t.t<=0){inst.timers.splice(i,1);inst._el=t.el;try{t.f();}catch(e){console.error('timer',e);}inst._el=null;}}}
function updateDungeon(inst,dt){
  if(inst.arena){updateArena(inst,dt);return;}
  if(inst.paused)return;
  inst.time+=dt;
  if(inst.trans){inst.trans.t-=dt;if(inst.trans.t<=0){if(inst.floor>=100){victory(inst);return;}loadFloor(inst,inst.floor+1);return;}}
  if(inst.dark>0)inst.dark-=dt;
  updatePlayers(inst,dt);updateMonsters(inst,dt);bossRoomRules(inst);updateEvents(inst,dt);updateDots(inst,dt);updateProjs(inst,dt);updateZones(inst,dt);updateHazards(inst,dt);updateTimers(inst,dt);
  const all=instPlayers(inst);
  if(all.length&&all.every(p=>p.downed)){inst.wipeT+=dt;if(inst.wipeT>=3){inst.wipeT=0;wipe(inst);}}else inst.wipeT=0;
  inst.meterT-=dt;if(inst.meterT<=0){inst.meterT=1;const bm=inst.bossMeter&&inst.bossId?{name:SH.bossOf(inst.floor).n,floor:inst.floor,time:Math.round(inst.time-inst.bossStart),rows:meterRows(inst.bossMeter)}:null;bcast(inst,{t:'meter',rows:meterRows(inst.meter),boss:bm,hist:inst.bossHist||[]});}
}
function victory(inst){const ps=instPlayers(inst);for(const P of ps){P.ch.cleared=(P.ch.cleared|0)+1;markDirty(P);}for(const P of ps){joinHub(P);send(P,{t:'victory'});msg(P,'지하 100층 정복! 심연의 심장이 멈췄다','#ffd35a');if(P.party)sendParty(P.party);}}
function wipe(inst){fx(inst,{k:'msg',m:'파티가 전멸했습니다 · 입구에서 다시 시작합니다',c:'#ff6a5a'});
  inst.projs=[];inst.zones=[];inst.timers=[];inst.hz=[];inst.dark=0;
  for(const m of inst.monsters){m.dots=null;if(m.boss){m.hp=m.maxHp;m.alert=false;m.x=m.home.x;m.y=m.home.y;m.wind=0;m.charge=0;m.bossInit=false;m.busy=0;m.invul=0;m.vuln=0;m.hidden=false;m.didSplit=false;m.didDoom=false;m.burnOn=false;m.enraged=false;m.dmg=m.baseDmg||m.dmg;}m.taunt=null;m.tgt=null;}
  inst.monsters=inst.monsters.filter(m=>!m.summ);
  for(const m of inst.monsters)if(!m.boss)m.alert=false;
  inst.bossMeter=null;let k=0;
  for(const P of instPlayers(inst)){P.downed=false;P.rev=0;P.hp=Math.round(P.S.maxHp*0.6);P.mp=P.S.maxMp;placeStart(inst,P,k++);send(P,{t:'tp',x:P.x,y:P.y});}}

// ================= 스냅샷 =================
function snapshot(inst){
  const ps=instPlayers(inst).map(p=>[p.id,r1(p.x),r1(p.y),p.face,Math.ceil(p.hp),p.S.maxHp,(p.downed?1:0)|(p.dodgeT>0?2:0)|(p.moving?4:0)|(p.shield>0?8:0),r1(p.rev/3)]);
  const base={t:'s',p:ps,fx:inst.fx};
  if(inst.type==='hub'){base.m=inst.monsters.map(m=>[m.id,m.tc,r1(m.x),r1(m.y),1,1,m.face,(m.flash>0?8:0)|(m.slow>0?2:0)|(m.stun>0?4:0),0,0,m.r]);base.j=inst.projs.map(p=>[p.id,SH.PROJ_LIST.indexOf(p.type),r1(p.x),r1(p.y),Math.round(p.vx),Math.round(p.vy),p.h]);base.z=inst.zones.map(z=>[z.vis,r1(z.x),r1(z.y),z.r,r1(z.t),z.pid]);}
  if(inst.type==='dungeon'){
    base.m=inst.monsters.filter(m=>!m.pvp).map(m=>[m.id,m.tc,r1(m.x),r1(m.y),Math.ceil(m.hp),m.maxHp,m.face,(m.elite?1:0)|(m.slow>0?2:0)|(m.stun>0?4:0)|(m.flash>0?8:0)|(m.alert?16:0)|(m.charge>0?32:0)|(m.moving?64:0)|(m.invul>0?128:0)|(m.vuln>0?256:0)|(m.hidden?512:0)|(m.cloneOf?1024:0)|(m.phase>1?2048:0),SH.WIND_LIST.indexOf(m.windType)*(m.wind>0?1:0),r1(Math.max(0,m.atkT)),m.r,(m.ea||0)|(m.shT>0&&m.shV>0?256:0)]);
    base.j=inst.projs.map(p=>[p.id,SH.PROJ_LIST.indexOf(p.type),r1(p.x),r1(p.y),Math.round(p.vx),Math.round(p.vy),p.h]);
    base.z=inst.zones.map(z=>[z.vis,r1(z.x),r1(z.y),z.r,r1(z.t),z.pid]);for(const h of inst.hz)base.z.push([h.vis,r1(h.x),r1(h.y),Math.min(h.r,400),r1(h.t),h.arm>0?1:0]);base.dark=inst.dark>0?1:0;
    base.pause=inst.paused;base.trans=inst.trans?r1(inst.trans.t):0;if(inst.allies&&inst.allies.length)base.al=inst.allies.map(a=>[a.id,a.type,r1(a.x),r1(a.y),Math.ceil(a.hp),a.maxHp,a.face,(a.downed?1:0)|(a.atk>0?2:0)|(a.mv?4:0),a.owner]);if(inst.traps&&inst.traps.length)base.tr=inst.traps.map(t=>[t.k,r1(t.x),r1(t.y),t.st]);
  }
  const s0=JSON.stringify(base).slice(0,-1);
  for(const P of instPlayers(inst)){if(P.ws.readyState!==1)continue;
    const b=P.buffs,mx=(...ks)=>{let v=0;for(const k of ks)if(b[k+'T']>v)v=b[k+'T'];return r1(v);};const me=[Math.ceil(P.hp),P.S.maxHp,Math.floor(P.mp),P.S.maxMp,Math.round(P.shield),mx('dmg','sdmg','bdmg'),mx('red','wred','tred'),r1(atkMul(P)),mx('as'),P.rootT>0?0:r1(1-(P.slowV||0)*(P.slowT>0?1:0)),P.burn||0];
    P.ws.send(s0+',"me":'+JSON.stringify(me)+'}');}
  inst.fx=[];
}

// ================= 메시지 처리 =================
function sanitizeChar(o){if(!SH.validChar(o))return null;const C=CLASSES[o.cls];
  const ch={v:1,id:String(o.id||SH.rid()).slice(0,24),name:String(o.name).slice(0,12)||'모험가',cls:o.cls,lvl:clamp(o.lvl|0,1,999),xp:Math.max(0,o.xp|0),pts:Math.max(0,o.pts|0),
    str:o.str|0||C.base.str,dex:o.dex|0||C.base.dex,vit:o.vit|0||C.base.vit,ene:o.ene|0||C.base.ene,gold:Math.max(0,o.gold|0),pots:{hp:clamp((o.pots&&o.pots.hp)|0,0,9),mp:clamp((o.pots&&o.pots.mp)|0,0,9)},
    eq:{weapon:o.eq.weapon||null,armor:o.eq.armor||null,ring:o.eq.ring||null},bag:new Array(20).fill(null),cps:Array.isArray(o.cps)&&o.cps.length?o.cps.filter(n=>Number.isInteger(n)&&n>=1&&n<=100):[1],best:o.best|0,kills:o.kills|0,created:o.created||Date.now()};
  for(let i=0;i<20;i++)ch.bag[i]=o.bag[i]||null;if(!ch.cps.includes(1))ch.cps.unshift(1);
  const cs=C.skills,def=SH.defaultSkills(o.cls);let sk={};if(o.sk&&typeof o.sk==='object')for(const s of cs){const r=clamp(o.sk[s]|0,0,SH.MAX_RANK);if(r>0&&SKILLS[s].lvl<=ch.lvl)sk[s]=r;}
  for(const s in def.sk)if(!sk[s])sk[s]=1;const spent=Object.values(sk).reduce((a,b)=>a+b,0)-2,total=SH.skillPointsTotal(ch.lvl);
  if(spent>total){sk=def.sk;ch.spts=total;}else ch.spts=total-spent;ch.sk=sk;
  ch.bar=new Array(SH.BAR_SIZE).fill(null);const src=Array.isArray(o.bar)?o.bar:def.bar;const used=new Set();for(let i=0;i<SH.BAR_SIZE;i++){const s=src[i];if(s&&sk[s]&&!SKILLS[s].pas&&!used.has(s)){ch.bar[i]=s;used.add(s);}}
  if(!ch.bar.some(Boolean))ch.bar=def.bar.slice();
  const mt=o.mats||{};ch.mats={iron:clamp(mt.iron|0,0,99999),dust:clamp(mt.dust|0,0,99999),ess:clamp(mt.ess|0,0,99999)};
  ch.gems={};if(o.gems&&typeof o.gems==='object')for(const g in o.gems)if(SH.gemOk(g)){const n=clamp(o.gems[g]|0,0,9999);if(n)ch.gems[g]=n;}
  if(o.bty&&typeof o.bty==='object'&&typeof o.bty.d==='string'&&Array.isArray(o.bty.q))ch.bty={d:o.bty.d.slice(0,12),q:o.bty.q.slice(0,3).map(q=>({t:String(q.t).slice(0,8),n:Math.max(0,q.n|0),need:Math.max(1,q.need|0),cl:!!q.cl,r:q.r&&typeof q.r==='object'?q.r:{}})),all:!!o.bty.all};
  ch.bossK=Math.max(0,o.bossK|0);
  ch.pvp={w:Math.max(0,(o.pvp&&o.pvp.w)|0),l:Math.max(0,(o.pvp&&o.pvp.l)|0)};
  ch.fish={};if(o.fish&&typeof o.fish==='object')for(const f of SH.FISH){const n=clamp(o.fish[f.id]|0,0,9999);if(n)ch.fish[f.id]=n;}ch.fishN=Math.max(0,o.fishN|0);ch.fishBest=o.fishBest&&typeof o.fishBest==='object'?{id:String(o.fishBest.id).slice(0,4),cm:+o.fishBest.cm||0}:null;
  ch.dyes=Array.isArray(o.dyes)?o.dyes.filter(i=>Number.isInteger(i)&&i>0&&i<SH.DYES.length):[];ch.dye=Number.isInteger(o.dye)&&(o.dye===0||ch.dyes.includes(o.dye))?o.dye:0;
  {const tr=SH.TALENTS[ch.cls];ch.tal={};if(o.tal&&typeof o.tal==='object')for(const br of tr)for(const nd of br.n){const r=clamp(o.tal[nd.id]|0,0,nd.max);if(r)ch.tal[nd.id]=r;}if(SH.talentSpent(ch)>SH.talentPts(ch.lvl))ch.tal={};}
  ch.ach=Array.isArray(o.ach)?o.ach.filter(id=>SH.ACH.some(a=>a.id===id)):[];ch.title=typeof o.title==='string'&&ch.ach.includes(o.title)?o.title:null;
  {const ok=new Set(SH.codexList().map(c=>c.k));ch.cdx=Array.isArray(o.cdx)?[...new Set(o.cdx.filter(k=>ok.has(k)))]:[];}
  ch.st={};if(o.st&&typeof o.st==='object')for(const k of['gob','alt','sec','bty','gam','leg','maxUp'])ch.st[k]=Math.max(0,o.st[k]|0);ch.cleared=Math.max(0,o.cleared|0);
  ch.pets=Array.isArray(o.pets)?o.pets.filter(id=>SH.PETS.some(p=>p.id===id)):[];ch.pet=ch.pets.includes(o.pet)?o.pet:null;
  ch.lore=Array.isArray(o.lore)?[...new Set(o.lore.filter(i=>Number.isInteger(i)&&i>=0&&i<SH.LORE.length))]:[];
  ch.merc=typeof o.merc==='string'&&SH.MERCS[o.merc]?o.merc:null;
  ch.cos={cape:!(o.cos&&o.cos.cape===0)?1:0,glow:!(o.cos&&o.cos.glow===0)?1:0};
  return ch;}
function okItem(it){return !!(it&&typeof it==='object'&&['weapon','armor','ring'].includes(it.slot)&&Number.isInteger(it.rar)&&it.rar>=0&&it.rar<=3&&it.base&&typeof it.base==='object'&&Array.isArray(it.aff)&&typeof it.name==='string');}
const STASH_N=40;
function sanitizeStash(a){const out=new Array(STASH_N).fill(null);if(Array.isArray(a))for(let i=0;i<STASH_N;i++)if(okItem(a[i]))out[i]=a[i];return out;}
function near(P,pt,r){return Math.hypot(P.x-pt.x,P.y-pt.y)<=r;}
function addBag(P,it){const i=P.ch.bag.indexOf(null);if(i<0)return false;P.ch.bag[i]=it;return true;}

// ================= 업적 · 도감 =================
function addCdx(P,k){const c=P.ch.cdx||(P.ch.cdx=[]);if(c.includes(k))return;c.push(k);const e=SH.codexList().find(x=>x.k===k);if(e)msg(P,`도감 등록: ${e.n} (${c.length}/${SH.codexList().length})`,'#c9a0e8');markDirty(P);}
function stInc(P,k,n){const st=P.ch.st||(P.ch.st={});st[k]=(st[k]|0)+(n==null?1:n);markDirty(P);}
function checkAch(P){const ch=P.ch;ch.ach=ch.ach||[];for(const a of SH.ACH){if(ch.ach.includes(a.id))continue;if((a.c(ch)|0)<a.need)continue;ch.ach.push(a.id);
    msg(P,`업적 달성: ${a.n} · 칭호 '${a.t}' 획득`,'#ffd35a');send(P,{t:'ach',id:a.id});
    if(a.pet&&!(ch.pets||[]).includes(a.pet)){(ch.pets=ch.pets||[]).push(a.pet);const pt=SH.PETS.find(x=>x.id===a.pet);msg(P,`새 펫: ${pt.n}! 기록 창(J)에서 데리고 다닐 수 있어요`,'#7fd05a');}
    if(P.inst)for(const q of instPlayers(P.inst))if(q!==P)msg(q,`${ch.name}님이 업적 '${a.n}'을(를) 달성했습니다`,'#c9a0e8');}}

// ================= 현상금 게시판 (하루 3개, 한국 시간 자정 초기화) =================
const BTY_T={kill:{n:'몬스터 처치',need:[60,100,150]},elite:{n:'정예 몬스터 처치',need:[6,10,15]},boss:{n:'보스 처치',need:[1,2,3]},floor:{n:'던전 층 내려가기',need:[5,8,12]},gem:{n:'보석 줍기',need:[2,3,5]}};
function dayKey(){return new Date(Date.now()+9*3600e3).toISOString().slice(0,10);}
function ensureBty(P){const ch=P.ch,d=dayKey();if(ch.bty&&ch.bty.d===d)return ch.bty;
  let h=2166136261;for(const c of d+ch.id)h=Math.imul(h^c.charCodeAt(0),16777619);const rr=SH.mulberry(h>>>0);
  const types=Object.keys(BTY_T);const q=[];const best=Math.max(1,ch.best|0);
  while(q.length<3){const t=types.splice(Math.floor(rr()*types.length),1)[0];const lv=Math.floor(rr()*3);const need=BTY_T[t].need[lv];
    const r={gold:Math.round((80+best*30)*(1+lv*0.6)*(t==='boss'?1.5:1)),iron:3+lv*2,dust:1+lv,gem:SH.GEM_T[Math.floor(rr()*6)]+SH.gemTierFor(best,rr)};if(t==='boss')r.ess=1+lv;
    q.push({t,n:0,need,cl:false,r});}
  ch.bty={d,q,all:false};markDirty(P);return ch.bty;}
function bump(P,t,n){if(!P.ch)return;const b=ensureBty(P);for(const q of b.q){if(q.t!==t||q.n>=q.need)continue;q.n=Math.min(q.need,q.n+n);if(q.n>=q.need)msg(P,`의뢰 완료: ${BTY_T[t].n} ${q.need} · 마을 게시판에서 보상을 받으세요`,'#ffd35a');markDirty(P);}}
function giveR(P,r){const ch=P.ch,got=[];if(r.gold){ch.gold+=r.gold;got.push(`${r.gold}골드`);}for(const k of['iron','dust','ess'])if(r[k]){ch.mats[k]+=r[k];got.push(`${MAT_N[k]} ${r[k]}`);}
  if(r.gem&&SH.gemOk(r.gem)){ch.gems[r.gem]=(ch.gems[r.gem]|0)+1;got.push(SH.gemName(r.gem));}markDirty(P);return got.join(', ');}
const MAT_N={iron:'철 조각',dust:'마력 가루',ess:'핏빛 정수'};

// ================= 대장간 =================
function refItem(P,d){if(d.w==='eq'){if(!['weapon','armor','ring'].includes(d.s))return null;return P.ch.eq[d.s]||null;}const i=d.i|0;if(i<0||i>=20)return null;return P.ch.bag[i]||null;}
function findItemById(P,id){for(const s2 of['weapon','armor','ring'])if(P.ch.eq[s2]&&P.ch.eq[s2].id===id)return P.ch.eq[s2];return P.ch.bag.find(x=>x&&x.id===id)||null;}
function pay(P,c){const ch=P.ch,m=ch.mats;if((c.gold|0)>ch.gold){msg(P,'골드가 부족합니다','#ff6a5a');return false;}for(const k of['iron','dust','ess'])if((c[k]|0)>m[k]){msg(P,`${MAT_N[k]}이(가) 부족합니다`,'#ff6a5a');return false;}
  ch.gold-=c.gold|0;for(const k of['iron','dust','ess'])m[k]-=c[k]|0;markDirty(P);return true;}
function afterItem(P,it){const eqd=['weapon','armor','ring'].some(s2=>P.ch.eq[s2]===it);if(eqd){recalc(P);if(P.inst)bcastRoster(P.inst);}else markDirty(P);}
function salvageItem(P,i){const it=P.ch.bag[i];if(!it)return null;const y=SH.salvageOf(it);const m=P.ch.mats;m.iron+=y.iron;m.dust+=y.dust;m.ess+=y.ess;let dust2=0;if(y.dustP&&R()<y.dustP){m.dust++;dust2=1;}
  const gems=[];for(const g of it.so||[])if(g){P.ch.gems[g]=(P.ch.gems[g]|0)+1;gems.push(g);}if(it.rar>=1&&R()<0.15){const g=SH.randGem(it.L|0);P.ch.gems[g]=(P.ch.gems[g]|0)+1;gems.push(g);}
  P.ch.bag[i]=null;markDirty(P);return{iron:y.iron,dust:y.dust+dust2,ess:y.ess,gems};}
const BS={
  enh(P,d){const it=refItem(P,d);if(!it)return;const up=it.up|0;if(up>=SH.ENH_MAX){msg(P,'이미 최대 강화입니다','#9e937a');return;}const c=SH.enhCost(it);if(!pay(P,c))return;
    const ok=R()*100<SH.ENH_RATE[up];if(ok){it.up=up+1;if(it.up>((P.ch.st&&P.ch.st.maxUp)|0))stInc(P,'maxUp',it.up-((P.ch.st&&P.ch.st.maxUp)|0));msg(P,`강화 성공! ${SH.itemName(it)}`,'#ffd35a');}else msg(P,`강화 실패 · 재료만 사라졌습니다 (+${up} 유지)`,'#ff6a5a');afterItem(P,it);send(P,{t:'bsr',op:'enh',ok,up:it.up|0});},
  rr(P,d){const it=refItem(P,d);if(!it)return;const a=d.a|0,cur=it.aff[a];if(!cur)return;if(it.rk!=null&&it.rk!==a){msg(P,`이 장비는 '${SH.AFF[it.aff[it.rk].k].f(it.aff[it.rk].v)}' 능력만 재련할 수 있습니다`,'#ff6a5a');return;}
    const swap=!!d.swap;const c=SH.rerollCost(it,swap);if(!pay(P,c))return;let nw;
    if(swap){const have=new Set(it.aff.map(x=>x.k));const pool=SH.AFF_POOL[it.slot].filter(k=>!have.has(k));if(!pool.length){P.ch.gold+=c.gold|0;for(const k of['iron','dust','ess'])P.ch.mats[k]+=c[k]|0;msg(P,'바꿀 수 있는 능력이 없습니다','#ff6a5a');return;}const k=pick(pool);nw={k,v:SH.rollAff(it,k,R)};}
    else nw={k:cur.k,v:SH.rollAff(it,cur.k,R)};
    it.rk=a;it.rc=(it.rc|0)+1;P.pend={id:it.id,a,old:{k:cur.k,v:cur.v},nw};afterItem(P,it);send(P,{t:'bsr',op:'rr',pend:P.pend});},
  pick(P,d){const pd=P.pend;P.pend=null;if(!pd)return;const it=findItemById(P,pd.id);if(!it||!it.aff[pd.a])return;if(!d.keep){it.aff[pd.a]={k:pd.nw.k,v:pd.nw.v};msg(P,`새 능력 적용: ${SH.AFF[pd.nw.k].f(pd.nw.v)}`,'#7fd05a');}else msg(P,'기존 능력을 유지했습니다','#9e937a');afterItem(P,it);send(P,{t:'bsr',op:'pick'});},
  sock(P,d){const it=refItem(P,d);if(!it)return;const so=it.so||[];if(so.length>=SH.SOCK_MAX[it.slot]){msg(P,'소켓을 더 뚫을 수 없습니다','#9e937a');return;}const c=SH.socketCost(it);if(!pay(P,c))return;it.so=so.concat([null]);msg(P,`소켓을 뚫었습니다 (${it.so.length}/${SH.SOCK_MAX[it.slot]})`,'#ffd35a');afterItem(P,it);send(P,{t:'bsr',op:'sock'});},
  gem(P,d){const it=refItem(P,d);const g=d.g;if(!it||!SH.gemOk(g)||!(P.ch.gems[g]>0))return;const so=it.so||[];const k=so.indexOf(null);if(k<0){msg(P,'빈 소켓이 없습니다','#ff6a5a');return;}
    so[k]=g;it.so=so;P.ch.gems[g]--;if(!P.ch.gems[g])delete P.ch.gems[g];const e=SH.gemEff(g,it.slot);msg(P,`${SH.gemName(g)} 장착 · ${SH.AFF[e.k].f(e.v)}`,SH.GEM_COL[g[0]]);afterItem(P,it);send(P,{t:'bsr',op:'gem'});},
  ungem(P,d){const it=refItem(P,d);if(!it||!it.so)return;const k=d.k|0,g=it.so[k];if(!g)return;const c={gold:SH.unsocketCost(g)};if(!pay(P,c))return;it.so[k]=null;P.ch.gems[g]=(P.ch.gems[g]|0)+1;msg(P,`${SH.gemName(g)}을(를) 빼냈습니다`,'#9e937a');afterItem(P,it);send(P,{t:'bsr',op:'ungem'});},
  comb(P,d){const g=d.g;if(!SH.gemOk(g))return;const t=+g[1];if(t>=5||(P.ch.gems[g]|0)<3){msg(P,'같은 보석 3개가 필요합니다','#ff6a5a');return;}if(!pay(P,{gold:SH.combineCost(t)}))return;
    P.ch.gems[g]-=3;if(!P.ch.gems[g])delete P.ch.gems[g];const ng=g[0]+(t+1);P.ch.gems[ng]=(P.ch.gems[ng]|0)+1;msg(P,`합성 성공: ${SH.gemName(ng)}`,SH.GEM_COL[g[0]]);markDirty(P);send(P,{t:'bsr',op:'comb'});},
  salv(P,d){const i=d.i|0;if(!P.ch.bag[i])return;const nm=P.ch.bag[i].name;const y=salvageItem(P,i);const parts=[`철 조각 ${y.iron}`];if(y.dust)parts.push(`마력 가루 ${y.dust}`);if(y.ess)parts.push(`핏빛 정수 ${y.ess}`);for(const g of y.gems)parts.push(SH.gemName(g));msg(P,`${nm} 분해 · ${parts.join(', ')}`,'#d2c7ab');send(P,{t:'bsr',op:'salv'});},
  salvAll(P,d){const mx=clamp(d.max|0,0,2);let n=0;const tot={iron:0,dust:0,ess:0,g:0};for(let i=0;i<20;i++){const it=P.ch.bag[i];if(!it||it.rar>mx||(it.so||[]).some(Boolean))continue;const y=salvageItem(P,i);n++;tot.iron+=y.iron;tot.dust+=y.dust;tot.ess+=y.ess;tot.g+=y.gems.length;}
    if(!n){msg(P,'분해할 아이템이 없습니다','#9e937a');return;}msg(P,`${n}개 분해 · 철 조각 ${tot.iron}${tot.dust?`, 마력 가루 ${tot.dust}`:''}${tot.g?`, 보석 ${tot.g}`:''}`,'#d2c7ab');send(P,{t:'bsr',op:'salv'});}
};
function msUntilReset(){const n=Date.now()+9*3600e3;return 86400e3-(n%86400e3);}
function inYard(P){return P.inst===hub&&hub.map.dummies.some(d=>Math.hypot(P.x-d.x,P.y-d.y)<130);}
const H={
  mv(P,d){const inst=P.inst;if(!inst||P.downed)return;if(inst.type==='dungeon'&&(inst.paused||inst.trans&&inst.trans.t<0.3))return;
    const x=+d.x,y=+d.y;if(!isFinite(x)||!isFinite(y))return;if(Math.hypot(x-P.x,y-P.y)>90||SH.blocked(inst.map,x,y,3)){P.bad=(P.bad||0)+1;if(P.bad>=3){P.bad=0;send(P,{t:'tp',x:P.x,y:P.y});}return;}P.bad=0;P.x=x;P.y=y;P.face=d.f<0?-1:1;P.moving=!!d.m;},
  atk(P,d){const inst=P.inst;if(!inst||P.downed||inst.paused)return;if(inst.type!=='dungeon'&&!inYard(P))return;if(inst.arena&&(inst.arena.cd>0||inst.arena.over))return;withFoes(inst,P,()=>basicAttack(inst,P,+d.a||0));},
  sk(P,d){const inst=P.inst;if(!inst||P.downed)return;if(inst.type!=='dungeon'&&!inYard(P)){msg(P,'마을에서는 훈련장에서만 스킬을 쓸 수 있습니다','#9e937a');return;}if(inst.arena&&(inst.arena.cd>0||inst.arena.over))return;if(inst.paused)return;const i=d.i|0;if(i<0||i>=SH.BAR_SIZE)return;castSkill(inst,P,i,+d.x||P.x,+d.y||P.y);},
  dodge(P){if(P.downed||P.dodgeCd>0.1||P.rootT>0)return;P.dodgeT=0.35;P.dodgeCd=0.9;if(P.burn){P.burn=0;if(P.inst)fx(P.inst,{k:'txt',x:r1(P.x),y:r1(P.y-30),s:'화상 해제',c:'#8fd0ff'});}},
  pot(P,d){if(P.downed||P.potCd>0)return;const k=d.k==='mp'?'mp':'hp';if(P.ch.pots[k]<=0){msg(P,k==='hp'?'체력 물약이 없습니다':'마나 물약이 없습니다','#ff6a5a');return;}
    if(k==='hp'){if(P.hp>=P.S.maxHp)return;P.hp=Math.min(P.S.maxHp,P.hp+P.S.maxHp*0.45);}else{if(P.mp>=P.S.maxMp)return;P.mp=Math.min(P.S.maxMp,P.mp+P.S.maxMp*0.5);}
    P.ch.pots[k]--;P.potCd=0.4;markDirty(P);if(P.inst)fx(P.inst,{k:'potion',id:P.id,c:k});},
  pick(P,d){const inst=P.inst;if(!inst)return;const dr=inst.drops.find(x=>x.id===d.id);if(!dr||dr.kind!=='item'||(dr.owner!=null&&dr.owner!==P.id))return;if(Math.hypot(dr.x-P.x,dr.y-P.y)>28)return;
    const it=dr.it;if(!P.ch.eq[it.slot]&&SH.canEquip(it,P.ch.cls)){P.ch.eq[it.slot]=it;recalc(P);msg(P,`${it.name} 장착`,null);bcastRoster(inst);}else if(!addBag(P,it)){msg(P,'가방이 가득 찼습니다','#ff6a5a');return;}else msg(P,`${it.name} 획득`,null);
    if(it.rar===3){stInc(P,'leg');const ln=SH.codexList().find(c=>c.k==='l:'+it.name);if(ln)addCdx(P,ln.k);}
    markDirty(P);remDrop(inst,dr);send(P,{t:'fxp',k:'pick',r:it.rar});},
  drop(P,d){const inst=P.inst;if(!inst)return;const i=d.bi|0,it=P.ch.bag[i];if(!it)return;P.ch.bag[i]=null;markDirty(P);addDrop(inst,{kind:'item',owner:null,it,by:P.ch.name},P.x,P.y);msg(P,`${it.name}을(를) 바닥에 내려놓았습니다`,'#9e937a');},
  eq(P,d){const i=d.bi|0,it=P.ch.bag[i];if(!it)return;if(!SH.canEquip(it,P.ch.cls)){msg(P,`${CLASSES[P.ch.cls].n}은(는) ${SH.FAMN[it.fam]}을(를) 쓸 수 없습니다`,'#ff6a5a');return;}
    const old=P.ch.eq[it.slot];P.ch.eq[it.slot]=it;P.ch.bag[i]=old||null;recalc(P);if(P.inst)bcastRoster(P.inst);},
  uneq(P,d){const s=d.s;if(!['weapon','armor','ring'].includes(s))return;const it=P.ch.eq[s];if(!it)return;if(!addBag(P,it)){msg(P,'가방이 가득 찼습니다','#ff6a5a');return;}P.ch.eq[s]=null;recalc(P);if(P.inst)bcastRoster(P.inst);},
  stat(P,d){if(!['str','dex','vit','ene'].includes(d.k)||P.ch.pts<=0)return;P.ch[d.k]++;P.ch.pts--;recalc(P);},
  buy(P,d){if(P.inst!==hub||!near(P,hub.map.merchant,48))return;const k=d.k==='mp'?'mp':'hp';const price=SH.potPrice(P.ch.lvl);if(P.ch.pots[k]>=9){msg(P,'더 들 수 없습니다','#ff6a5a');return;}if(P.ch.gold<price){msg(P,'골드가 부족합니다','#ff6a5a');return;}P.ch.gold-=price;P.ch.pots[k]++;markDirty(P);send(P,{t:'fxp',k:'gold'});},
  sell(P,d){if(P.inst!==hub||!near(P,hub.map.merchant,48))return;const i=d.bi|0,it=P.ch.bag[i];if(!it)return;P.ch.bag[i]=null;P.ch.gold+=it.value;markDirty(P);msg(P,`${it.name} 판매 · +${it.value} 골드`,'#ffd35a');send(P,{t:'fxp',k:'gold'});},
  chat(P,d){const m=String(d.m||'').replace(/\s+/g,' ').trim().slice(0,80);if(!m||!P.inst)return;bcast(P.inst,{t:'chat',id:P.id,name:P.ch.name,m});},
  inv(P,d){const T=players.get(d.id);if(!T||T===P)return;if(P.inst!==hub||T.inst!==hub){msg(P,'마을에서만 초대할 수 있습니다','#ff6a5a');return;}
    if(P.party.members.size>=4){msg(P,'파티가 가득 찼습니다 (최대 4명)','#ff6a5a');return;}if(T.party.members.size>1){msg(P,`${T.ch.name}님은 이미 파티 중입니다`,'#ff6a5a');return;}
    if(P.party.inst){msg(P,'파티가 던전에 있을 때는 초대할 수 없습니다','#ff6a5a');return;}
    T.invite={from:P.id,pt:P.party.id,t:Date.now()};send(T,{t:'invite',from:P.id,name:P.ch.name});msg(P,`${T.ch.name}님에게 파티 초대를 보냈습니다`,'#9e937a');},
  ians(P,d){const iv=P.invite;P.invite=null;if(!iv||iv.from!==d.from)return;const F=players.get(iv.from);if(!F){msg(P,'초대가 만료되었습니다','#ff6a5a');return;}
    if(!d.ok){msg(F,`${P.ch.name}님이 파티 초대를 거절했습니다`,'#9e937a');return;}
    const pt=parties.get(iv.pt);if(!pt||!pt.members.has(F.id)||pt.members.size>=4||pt.inst||P.inst!==hub||P.party.members.size>1){msg(P,'파티에 들어갈 수 없습니다','#ff6a5a');return;}
    leaveParty(P);pt.members.add(P.id);P.party=pt;sendParty(pt);bcastRoster(hub);for(const q of partyList(pt))msg(q,`${P.ch.name}님이 파티에 들어왔습니다`,'#7fd05a');},
  leave(P){if(P.inst!==hub){msg(P,'마을에서만 파티를 나갈 수 있습니다','#ff6a5a');return;}if(P.party.members.size<=1)return;leaveParty(P);newParty(P);sendParty(P.party);bcastRoster(hub);msg(P,'파티에서 나왔습니다','#9e937a');},
  kick(P,d){const pt=P.party;if(pt.leader!==P.id||P.inst!==hub||pt.inst)return;const T=players.get(d.id);if(!T||T.party!==pt||T===P)return;leaveParty(T);newParty(T);sendParty(T.party);msg(T,'파티에서 추방되었습니다','#ff6a5a');bcastRoster(hub);},
  enter(P,d){if(P.inst!==hub)return;if(P.duelLock&&Date.now()<P.duelLock)return;if(!near(P,hub.map.portal,56)){msg(P,'던전 입구에 더 가까이 가세요','#9e937a');return;}const pt=P.party;
    if(pt.inst){const inst=pt.inst;leaveInst(P);P.inst=inst;inst.players.add(P.id);resetCombat(P);placeStart(inst,P,inst.players.size);sendMap(P);bcastRoster(inst);bcastRoster(hub);sendParty(pt);msg(P,'파티의 던전에 합류했습니다','#7fd05a');return;}
    if(pt.leader!==P.id){msg(P,'파티장만 던전을 열 수 있습니다','#ff6a5a');return;}
    const floor=d.floor|0;if(!P.ch.cps.includes(floor)){msg(P,'열리지 않은 체크포인트입니다','#ff6a5a');return;}
    const members=partyList(pt).filter(q=>q.inst===hub);const inst=createDungeon(pt);
    for(const q of members){leaveInst(q);q.inst=inst;inst.players.add(q.id);resetCombat(q);q.hp=q.S.maxHp;q.mp=q.S.maxMp;}
    loadFloor(inst,floor);bcastRoster(hub);sendParty(pt);},
  pause(P){const inst=P.inst;if(!inst||inst.type!=='dungeon'||inst.arena)return;inst.paused=inst.paused?null:P.ch.name;bcast(inst,{t:'paused',by:inst.paused});},
  learn(P,d){const sid=d.sid;const sk=SKILLS[sid];if(!sk||sk.cls!==P.ch.cls)return;if(P.ch.lvl<sk.lvl){msg(P,`레벨 ${sk.lvl}에 해금됩니다`,'#ff6a5a');return;}if((P.ch.spts|0)<=0){msg(P,'스킬 포인트가 없습니다','#ff6a5a');return;}
    const r=P.ch.sk[sid]|0;if(r>=SH.MAX_RANK)return;P.ch.sk[sid]=r+1;P.ch.spts--;if(r===0&&!sk.pas&&!P.ch.bar.includes(sid)){const e=P.ch.bar.indexOf(null);if(e>=0)P.ch.bar[e]=sid;}recalc(P);send(P,{t:'fxp',k:'learn'});},
  bar(P,d){const i=d.i|0;if(i<0||i>=SH.BAR_SIZE)return;const sid=d.sid||null;if(sid){const sk=SKILLS[sid];if(!sk||sk.cls!==P.ch.cls||sk.pas||!(P.ch.sk[sid]>0))return;const j=P.ch.bar.indexOf(sid);if(j>=0)P.ch.bar[j]=P.ch.bar[i];}P.ch.bar[i]=sid;markDirty(P);},
  shop(P){if(P.inst!==hub||!near(P,hub.map.merchant,48))return;const lvl=P.ch.lvl;if(!P.stock||P.stockLvl!==lvl||Date.now()-P.stockT>300000){P.stock=[];const fam=CLASSES[P.ch.cls].fam;for(let i=0;i<6;i++){const it=SH.genItem(lvl+ri(0,2),fam,i<2?1:0,i===5?15:5,R,2);it.price=it.value*4;P.stock.push(it);}P.stockLvl=lvl;P.stockT=Date.now();}
    send(P,{t:'shop',items:P.stock,refresh:Math.max(0,Math.round((300000-(Date.now()-P.stockT))/1000)),respec:30*lvl});},
  shopbuy(P,d){if(P.inst!==hub||!near(P,hub.map.merchant,48)||!P.stock)return;const i=P.stock.findIndex(x=>x.id===d.id);if(i<0)return;const it=P.stock[i];if(P.ch.gold<it.price){msg(P,'골드가 부족합니다','#ff6a5a');return;}
    const copy=Object.assign({},it);delete copy.price;if(!addBag(P,copy)){msg(P,'가방이 가득 찼습니다','#ff6a5a');return;}P.ch.gold-=it.price;P.stock.splice(i,1);markDirty(P);msg(P,`${it.name} 구입`,'#ffd35a');send(P,{t:'fxp',k:'gold'});H.shop(P);},
  respec(P){if(P.inst!==hub||!near(P,hub.map.merchant,48))return;const cost=30*P.ch.lvl;if(P.ch.gold<cost){msg(P,'골드가 부족합니다','#ff6a5a');return;}const def=SH.defaultSkills(P.ch.cls);P.ch.gold-=cost;P.ch.sk=def.sk;P.ch.bar=def.bar.slice();P.ch.spts=SH.skillPointsTotal(P.ch.lvl);recalc(P);msg(P,'스킬을 초기화했습니다','#ffd35a');H.shop(P);},
  dbg(P,d){if(!process.env.BC_DEBUG)return;const inst=P.inst;if(d.tp){P.x=d.tp[0];P.y=d.tp[1];send(P,{t:'tp',x:P.x,y:P.y});}if(d.bosshp&&inst&&inst.monsters){for(const m of inst.monsters)if(m.boss)m.hp=Math.min(m.hp,d.bosshp);}if(d.god){P.S.maxHp=99999;P.hp=99999;}if(d.lvl){P.ch.lvl=d.lvl;P.ch.spts=(P.ch.spts|0)+d.lvl;recalc(P);}if(d.gold){P.ch.gold+=d.gold;markDirty(P);}if(d.floor&&inst&&inst.type==='dungeon')loadFloor(inst,d.floor);if(d.bossfrac&&inst&&inst.monsters){for(const m of inst.monsters)if(m.boss)m.hp=Math.round(m.maxHp*d.bossfrac);}if(d.fullhp){P.hp=P.S.maxHp;}if(d.sethp){P.hp=d.sethp;}if(d.kills){P.ch.kills=d.kills;markDirty(P);}if(d.pets){P.ch.pets=SH.PETS.map(p=>p.id);markDirty(P);}if(d.mats){P.ch.mats.iron+=500;P.ch.mats.dust+=200;P.ch.mats.ess+=20;for(const g of['r1','s2','t3','e1','a1','d4'])P.ch.gems[g]=(P.ch.gems[g]|0)+4;markDirty(P);}if(d.ev&&inst&&inst.type==='dungeon'){const e=inst.ev;if(d.ev==='altar')e.altar={x:P.x+40,y:P.y,st:0,wave:0,t:0,ids:[]};if(d.ev==='trader')e.trader={x:P.x+30,y:P.y,stock:{}};if(d.ev==='goblin'){spawnMonster(inst,'goblin',P.x+60,P.y,false);}bcastEv(inst);}
    if(d.killall&&inst&&inst.type==='dungeon'){for(const m of inst.monsters.slice())if(!m.dead&&!m.boss)killMonster(inst,m,P);}
    if(d.elite&&inst&&inst.type==='dungeon'){const m=spawnMonster(inst,'zombie',P.x+50,P.y,true);m.ea=d.elite;m.alert=true;}
    if(d.item!=null){addBag(P,SH.genItem(P.ch.lvl,CLASSES[P.ch.cls].fam,d.item,0,R,3,d.slot||null));markDirty(P);}},
  descend(P){const inst=P.inst;if(!inst||inst.type!=='dungeon'||!inst.stairsOpen||inst.trans||P.downed)return;const tx=Math.floor(P.x/TS),ty=Math.floor(P.y/TS);let near2=false;for(let j=-1;j<=1&&!near2;j++)for(let i=-1;i<=1;i++)if(inst.map.tiles[(ty+j)*inst.map.w+tx+i]===2){near2=true;break;}if(!near2)return;
    inst.trans={t:3,by:P.ch.name};bcast(inst,{t:'trans',t0:3,by:P.ch.name});},
  bs(P,d){if(P.inst!==hub||!near(P,hub.map.forge,60)){msg(P,'대장간 가까이에서만 할 수 있습니다','#9e937a');return;}const f=BS[d.op];if(f)f(P,d);},
  stash(P){if(P.inst!==hub||!near(P,hub.map.vault,60))return;send(P,{t:'stash',s:P.stash});},
  stput(P,d){if(P.inst!==hub||!near(P,hub.map.vault,60))return;const i=d.bi|0,it=P.ch.bag[i];if(!it)return;const k=P.stash.indexOf(null);if(k<0){msg(P,'창고가 가득 찼습니다','#ff6a5a');return;}P.stash[k]=it;P.ch.bag[i]=null;markDirty(P);send(P,{t:'stash',s:P.stash,save:1});},
  sttake(P,d){if(P.inst!==hub||!near(P,hub.map.vault,60))return;const k=d.si|0,it=P.stash[k];if(!it)return;if(!addBag(P,it)){msg(P,'가방이 가득 찼습니다','#ff6a5a');return;}P.stash[k]=null;markDirty(P);send(P,{t:'stash',s:P.stash,save:1});},
  gamble(P,d){if(P.inst!==hub||!near(P,hub.map.tent,60))return;const slot=['weapon','armor','ring'].includes(d.s)?d.s:'weapon';const cost=SH.gambleCost(slot,P.ch.lvl);if(P.ch.gold<cost){msg(P,'골드가 부족합니다','#ff6a5a');return;}if(P.ch.bag.indexOf(null)<0){msg(P,'가방이 가득 찼습니다','#ff6a5a');return;}
    stInc(P,'gam');P.ch.gold-=cost;const jack=R()<0.001;const it=jack?SH.genItem(P.ch.lvl+ri(0,3),CLASSES[P.ch.cls].fam,3,0,R,3,slot):SH.genItem(P.ch.lvl+ri(0,3),CLASSES[P.ch.cls].fam,0,20,R,2,slot);if(jack){bcast(hub,{t:'msg',m:`${P.ch.name}님이 도박에서 전설 '${it.name}'을(를) 뽑았다!!`,c:'#ff8a1f'});bcast(hub,{t:'fxp',k:'pick',r:3});}addBag(P,it);markDirty(P);send(P,{t:'gam',it});send(P,{t:'fxp',k:'pick',r:it.rar});},
  bty(P){if(P.inst!==hub||!near(P,hub.map.board,60))return;const b=ensureBty(P);send(P,{t:'bty',b,names:Object.fromEntries(Object.entries(BTY_T).map(([k,v])=>[k,v.n])),reset:msUntilReset()});},
  btyc(P,d){if(P.inst!==hub||!near(P,hub.map.board,60))return;const b=ensureBty(P);const q=b.q[d.i|0];if(!q||q.cl||q.n<q.need)return;q.cl=true;stInc(P,'bty');const got=giveR(P,q.r);msg(P,`의뢰 보상: ${got}`,'#ffd35a');send(P,{t:'fxp',k:'gold'});
    if(!b.all&&b.q.every(x=>x.cl)){b.all=true;const g2=SH.GEM_T[ri(0,5)]+Math.min(5,SH.gemTierFor(P.ch.best|0)+1);const got2=giveR(P,{ess:1,gem:g2,dust:3});msg(P,`오늘의 의뢰 모두 완료! 추가 보상: ${got2}`,'#ff9a5a');}H.bty(P);},
  evx(P,d){const inst=P.inst;if(!inst||inst.type!=='dungeon'||!inst.ev||P.downed||inst.paused)return;const e=inst.ev;
    if(d.k==='wall'&&e.secret&&!e.secret.open){const i=inst.map.secret.door,tx=i%inst.map.w,ty=(i/inst.map.w)|0;if(Math.hypot(P.x-(tx*TS+8),P.y-(ty*TS+8))>30)return;inst.map.tiles[i]=1;e.secret.open=true;for(const Q of instPlayers(inst))stInc(Q,'sec');bcast(inst,{t:'tile',i,v:1});fx(inst,{k:'boom',x:tx*TS+8,y:ty*TS+8,r:18});fx(inst,{k:'shake',v:3});fx(inst,{k:'msg',m:`${P.ch.name}님이 비밀 통로를 찾았다!`,c:'#ffd35a'});bcastEv(inst);return;}
    if(d.k==='chest'&&e.secret&&e.secret.open){const c=e.secret.chests[d.i|0];if(!c||c.open||Math.hypot(P.x-c.x,P.y-c.y)>26)return;c.open=true;fx(inst,{k:'sfx',n:'legend'});for(const Q of instPlayers(inst))lootFor(inst,Q,c.x,c.y+6,{items:1,minR:R()<0.35?2:1,gold:3,gems:R()<0.5?1:0});bcastEv(inst);return;}
    if(d.k==='lore'&&e.lore){if(Math.hypot(P.x-e.lore.x,P.y-e.lore.y)>30)return;const i=e.lore.i;const L=P.ch.lore||(P.ch.lore=[]);const first=!L.includes(i);if(first){L.push(i);L.sort((a,b)=>a-b);markDirty(P);}send(P,{t:'lore',i,first});return;}
    if(d.k==='altar'&&e.altar&&e.altar.st===0){if(Math.hypot(P.x-e.altar.x,P.y-e.altar.y)>34)return;e.altar.st=1;e.altar.t=1.2;fx(inst,{k:'msg',m:`${P.ch.name}님이 저주받은 제단을 건드렸다! 몰려오는 괴물을 모두 물리쳐라`,c:'#ff6a5a'});fx(inst,{k:'sfx',n:'boss'});bcastEv(inst);}},
  trader(P){const inst=P.inst;if(!inst||!inst.ev||!inst.ev.trader||Math.hypot(P.x-inst.ev.trader.x,P.y-inst.ev.trader.y)>40)return;send(P,{t:'trd',items:traderStock(inst,P),pot:Math.round(SH.potPrice(P.ch.lvl)*0.8)});},
  tbuy(P,d){const inst=P.inst;if(!inst||!inst.ev||!inst.ev.trader||Math.hypot(P.x-inst.ev.trader.x,P.y-inst.ev.trader.y)>40)return;
    if(d.k){const k=d.k==='mp'?'mp':'hp',pr=Math.round(SH.potPrice(P.ch.lvl)*0.8);if(P.ch.pots[k]>=9){msg(P,'더 들 수 없습니다','#ff6a5a');return;}if(P.ch.gold<pr){msg(P,'골드가 부족합니다','#ff6a5a');return;}P.ch.gold-=pr;P.ch.pots[k]++;markDirty(P);send(P,{t:'fxp',k:'gold'});return;}
    const st=traderStock(inst,P),i=st.findIndex(x=>x.id===d.id);if(i<0)return;const it=st[i];if(P.ch.gold<it.price){msg(P,'골드가 부족합니다','#ff6a5a');return;}const cp=Object.assign({},it);delete cp.price;if(!addBag(P,cp)){msg(P,'가방이 가득 찼습니다','#ff6a5a');return;}P.ch.gold-=it.price;st.splice(i,1);markDirty(P);msg(P,`${it.name} 구입`,'#ffd35a');send(P,{t:'fxp',k:'gold'});H.trader(P);},
  ping(P,d){const inst=P.inst;if(!inst)return;const now=Date.now();if(now-(P.pingT||0)<700)return;P.pingT=now;const x=+d.x,y=+d.y;if(!isFinite(x)||!isFinite(y))return;const k=clamp(d.k|0,0,2);
    const o={t:'ping',x:r1(x),y:r1(y),k,id:P.id,name:P.ch.name};const tg=P.party?partyList(P.party).filter(q=>q.inst===inst):[P];for(const q of tg)send(q,o);},
  duel(P,d){const T=players.get(d.id);if(!T||T===P||!T.ch)return;if(P.inst!==hub||T.inst!==hub){msg(P,'마을에서만 결투를 신청할 수 있습니다','#ff6a5a');return;}
    const [A,B]=duelTeams(P,T);if(A.some(q=>B.includes(q))){msg(P,'같은 파티끼리는 결투할 수 없습니다','#ff6a5a');return;}
    T.duelInv={from:P.id,t:Date.now(),n:A.length};send(T,{t:'duelInv',from:P.id,name:P.ch.name,n:A.length});msg(P,`${T.ch.name}님에게 ${A.length}:${A.length} 결투를 신청했습니다`,'#9e937a');},
  duelAns(P,d){const iv=P.duelInv;P.duelInv=null;if(!iv||iv.from!==d.from||Date.now()-iv.t>30000)return;const F=players.get(iv.from);if(!F||!F.ch){msg(P,'결투 신청이 만료되었습니다','#ff6a5a');return;}
    if(!d.ok){msg(F,`${P.ch.name}님이 결투를 거절했습니다`,'#9e937a');return;}if(F.inst!==hub||P.inst!==hub){msg(P,'결투를 시작할 수 없습니다','#ff6a5a');return;}
    const [A,B]=duelTeams(F,P);if(A.some(q=>B.includes(q))||A.some(q=>q.inst!==hub)||B.some(q=>q.inst!==hub))return;startArena(A,B);},
  fish(P,d){if(P.inst!==hub||!near(P,hub.map.fish,40))return;const now=Date.now();
    if(d.op==='cast'){const f=SH.rollFish(R,P.ch.lvl);P.fishing={bite:now+rf(2200,6500),f,cm:Math.round(rf(12,40)*(1+f.r*0.6)*10)/10};send(P,{t:'fish',st:'cast',wait:Math.round(P.fishing.bite-now)});return;}
    if(d.op==='reel'){const fs=P.fishing;P.fishing=null;if(!fs)return;if(now<fs.bite-400){msg(P,'너무 일찍 당겼어요! 물고기가 도망갔습니다','#ff6a5a');send(P,{t:'fish',st:'miss'});return;}if(!d.ok||now>fs.bite+12000){send(P,{t:'fish',st:'miss'});msg(P,'놓쳤다...','#9e937a');return;}
      const f=fs.f,ch=P.ch;ch.fish[f.id]=(ch.fish[f.id]|0)+1;addCdx(P,'f:'+f.id);ch.fishN=(ch.fishN|0)+1;let extra='';if(f.gem){for(let i=0;i<f.gem;i++){const g=SH.randGem(Math.max(1,ch.best|0)+10);ch.gems[g]=(ch.gems[g]|0)+1;extra+=` · ${SH.gemName(g)}`;}}if(f.dust){ch.mats.dust+=f.dust;extra+=` · 마력 가루 ${f.dust}`;}
      let best=false;if(!ch.fishBest||fs.cm>ch.fishBest.cm){ch.fishBest={id:f.id,cm:fs.cm};best=true;}markDirty(P);send(P,{t:'fish',st:'got',id:f.id,cm:fs.cm,best,extra});
      if(f.r>=2)bcast(hub,{t:'msg',m:`${P.ch.name}님이 ${SH.FISH_RN[f.r]} 물고기 '${f.n}'(${fs.cm}cm)을 낚았다!`,c:SH.FISH_RC[f.r]});return;}
    if(d.op==='bite'){const fs=P.fishing;if(!fs)return;send(P,{t:'fish',st:'bite',r:fs.f.r});}},
  sellfish(P){if(P.inst!==hub||!near(P,hub.map.merchant,48))return;let g=0,n=0;for(const f of SH.FISH){const c=P.ch.fish[f.id]|0;if(c){g+=c*f.v;n+=c;}}if(!n){msg(P,'팔 물고기가 없습니다','#9e937a');return;}P.ch.fish={};P.ch.gold+=g;markDirty(P);msg(P,`물고기 ${n}마리 판매 · +${g}골드`,'#ffd35a');send(P,{t:'fxp',k:'gold'});},
  emo(P,d){const inst=P.inst;if(!inst)return;const now=Date.now();if(now-(P.emoT||0)<1200)return;P.emoT=now;const i=clamp(d.i|0,0,SH.EMOTES.length-1);bcast(inst,{t:'emo',id:P.id,i});},
  dye(P,d){if(P.inst!==hub||!near(P,hub.map.tailor,48))return;const i=d.i|0;if(i<0||i>=SH.DYES.length)return;const ch=P.ch;
    if(i>0&&!ch.dyes.includes(i)){if(ch.gold<SH.DYE_COST){msg(P,'골드가 부족합니다','#ff6a5a');return;}ch.gold-=SH.DYE_COST;ch.dyes.push(i);msg(P,`'${SH.DYES[i].n}' 염료를 샀습니다`,'#ffd35a');send(P,{t:'fxp',k:'gold'});}
    ch.dye=i;markDirty(P);bcastRoster(hub);},
  cos(P,d){if(P.inst!==hub)return;const k=d.k==='glow'?'glow':'cape';P.ch.cos[k]=P.ch.cos[k]?0:1;markDirty(P);bcastRoster(hub);},
  tal(P,d){const e=SH.canTalent(P.ch,String(d.id));if(e){msg(P,e,'#ff6a5a');return;}P.ch.tal[d.id]=(P.ch.tal[d.id]|0)+1;recalc(P);send(P,{t:'fxp',k:'learn'});},
  talreset(P){if(P.inst!==hub){msg(P,'마을에서만 초기화할 수 있습니다','#ff6a5a');return;}const cost=50*P.ch.lvl;if(P.ch.gold<cost){msg(P,'골드가 부족합니다','#ff6a5a');return;}P.ch.gold-=cost;P.ch.tal={};recalc(P);msg(P,`특성을 초기화했습니다 (-${cost}골드)`,'#ffd35a');},
  title(P,d){const id=d.id||null;if(id&&!(P.ch.ach||[]).includes(id))return;P.ch.title=id;markDirty(P);if(P.inst)bcastRoster(P.inst);},
  pet(P,d){const id=d.id||null;if(id&&!(P.ch.pets||[]).includes(id))return;P.ch.pet=id;markDirty(P);if(P.inst)bcastRoster(P.inst);},
  merc(P,d){if(P.inst!==hub||!near(P,hub.map.merc,50))return;if(!d.k){P.ch.merc=null;markDirty(P);msg(P,'용병을 돌려보냈습니다','#9e937a');return;}const M=SH.MERCS[d.k];if(!M)return;const cost=SH.mercCost(P.ch.lvl);
    if(P.ch.gold<cost){msg(P,'골드가 부족합니다','#ff6a5a');return;}P.ch.gold-=cost;P.ch.merc=d.k;markDirty(P);send(P,{t:'fxp',k:'gold'});msg(P,`${M.n} 용병을 고용했습니다 · 혼자 던전에 들어가면 함께 싸웁니다`,'#7fd05a');},
  town(P){if(!P.inst||P.inst===hub)return;const inst=P.inst;if(inst.arena){if(!inst.arena.over){P.ch.pvp.l++;markDirty(P);msg(P,'결투를 포기했습니다 (패배)','#ff6a5a');}P.arenaTeam=null;}const wasPauser=inst.paused===P.ch.name;joinHub(P);if(wasPauser&&inst.players.size){inst.paused=null;bcast(inst,{t:'paused',by:null});}if(P.party)sendParty(P.party);}
};

wss.on('connection',ws=>{
  const P={id:'p'+(nextId++),ws,ch:null,S:null,x:0,y:0,r:4,face:1,moving:false,inst:null,party:null,hp:1,mp:1,shield:0,shieldT:0,shieldBy:null,downed:false,rev:0,dodgeT:0,dodgeCd:0,atkCd:0,potCd:0,scd:{},buffs:{},dirty:false,invite:null,alive:true,msgs:0};
  ws.on('pong',()=>{P.alive=true;});
  ws.on('message',raw=>{let d;try{d=JSON.parse(raw);}catch(e){return;}if(!d||typeof d.t!=='string')return;
    if(++P.msgs>200)return;
    if(!P.ch){if(d.t==='join'){const ch=sanitizeChar(d.ch);if(!ch){send(P,{t:'err',m:'캐릭터 정보가 올바르지 않습니다'});return;}P.ch=ch;P.S=SH.calcStats(ch);P.stash=sanitizeStash(d.stash);players.set(P.id,P);newParty(P);send(P,{t:'welcome',id:P.id});joinHub(P);P.prevParty=Array.isArray(d.prev)?d.prev.slice(0,4).map(String):null;restoreParty(P);sendParty(P.party);send(P,{t:'ch',ch:P.ch,S:P.S});send(P,{t:'stash',s:P.stash});}return;}
    const h=H[d.t];if(h){try{h(P,d);}catch(e){console.error('handler',d.t,e);}}});
  ws.on('close',()=>{if(!P.ch)return;leaveInst(P);const pt=P.party;leaveParty(P);players.delete(P.id);});
});
setInterval(()=>{for(const P of players.values()){if(!P.alive){P.ws.terminate();continue;}P.alive=false;try{P.ws.ping();}catch(e){}}},25000);

// ================= 메인 루프 =================
const DT=0.05;let flushT=0;
setInterval(()=>{
  for(const P of players.values())P.msgs=0;
  for(const inst of dungeons.values()){try{updateDungeon(inst,DT);snapshot(inst);}catch(e){console.error('tick',e);}}
  hub.time+=DT;
  for(let i=hub.drops.length-1;i>=0;i--)if(hub.time-hub.drops[i].born>300)remDrop(hub,hub.drops[i]);
  for(const P of instPlayers(hub)){P.hp=P.S.maxHp;P.mp=P.S.maxMp;P.atkCd-=DT;P.potCd-=DT;P.dodgeT-=DT;P.dodgeCd-=DT;for(const k in P.scd)P.scd[k]-=DT;const b=P.buffs;for(const k in b)if(k.endsWith('T'))b[k]-=DT;if(P.shieldT>0){P.shieldT-=DT;if(P.shieldT<=0)P.shield=0;}
    const w=P.dps;if(w){while(w.win.length&&hub.time-w.win[0][0]>5)w.win.shift();if(hub.time-w.last<=4.5&&((hub.time*2)|0)!==w.sent){w.sent=(hub.time*2)|0;const span=Math.min(5,Math.max(1,hub.time-w.t0));send(P,{t:'dps',v:Math.round(w.win.reduce((a,b)=>a+b[1],0)/span),tot:Math.round(w.tot),dur:Math.round((w.last-w.t0)*10)/10});}}}
  try{updateDots(hub,DT);updateProjs(hub,DT);updateZones(hub,DT);updateTimers(hub,DT);for(const m of hub.monsters){m.flash-=DT;m.slow-=DT;m.stun-=DT;}}catch(e){console.error('hub',e);}
  snapshot(hub);
  flushT-=DT;if(flushT<=0){flushT=0.5;for(const P of players.values())if(P.dirty){P.dirty=false;checkAch(P);send(P,{t:'ch',ch:P.ch,S:P.S});}}
},DT*1000);

server.listen(PORT,()=>console.log('핏빛 카타콤 서버 실행 중 · 포트 '+PORT));
