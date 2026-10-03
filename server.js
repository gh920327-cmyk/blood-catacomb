// 달 없는 밤: 등불을 든 자 — 멀티플레이 서버
'use strict';
const http=require('http'),fs=require('fs'),path=require('path');
/* 클라이언트 빌드 버전: 접속 중 새 버전이 배포되면 클라이언트가 스스로 새로고침 */
const BUILD=process.env.BC_BUILD||(()=>{try{const h=require('crypto').createHash('md5');for(const f of['client.js','shared.js','index.html'])h.update(fs.readFileSync(path.join(__dirname,'public',f)));return h.digest('hex').slice(0,10);}catch(e){return String(Date.now());}})();
const {WebSocketServer}=require('./wslite.js');
const SH=require('./public/shared.js');
const {TS,CLASSES,SKILLS}=SH;
const PORT=process.env.PORT||3000;
const PUB=path.join(__dirname,'public');
const DATA_DIR=process.env.BC_DATA||path.join(__dirname,'data');
/* 서버 이전: 옛 주소로 들어오면 브라우저 저장 데이터를 챙겨 새 주소로 보낸다 (MOVE_TO가 비어 있으면 꺼짐) */
const MOVE_TO=process.env.BC_MOVE_TO||(process.env.RENDER?(()=>{try{return fs.readFileSync(path.join(__dirname,'deploy','move_to.txt'),'utf8').trim();}catch(e){return '';}})():'');
const MOVE_PAGE=(u,always)=>`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>달 없는 밤 · 새 서버로 이동</title><style>body{background:#0e0b12;color:#e6dcc3;font:16px sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}</style></head><body><div>새 서울 서버로 이동하는 중… 캐릭터는 그대로 옮겨져요.</div><script>(function(){var u=${JSON.stringify(u)},always=${always?1:0};var d='';try{if(always||!localStorage.getItem('bc_moved')){var o={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&k.indexOf('bc_')===0)o[k]=localStorage.getItem(k);}if(Object.keys(o).length)d='#mig='+btoa(unescape(encodeURIComponent(JSON.stringify(o))));localStorage.setItem('bc_moved','1');}}catch(e){}location.replace(u+d);})();</script></body></html>`;
const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.json':'application/json','.ico':'image/x-icon','.webp':'image/webp','.jpg':'image/jpeg'};

const server=http.createServer((req,res)=>{
  let u;try{u=decodeURIComponent(req.url.split('?')[0]);}catch(e){res.writeHead(400);res.end();return;}
  if(u==='/health'){res.end('ok');return;}
  if(u==='/api/export'){res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({ranks:RANKS,fame:FAME}));return;}
  if(MOVE_TO&&(u==='/'||u==='/index.html')&&!/[?&]stay=1/.test(req.url)){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(MOVE_PAGE(MOVE_TO,/BCDesktop\//.test(req.headers['user-agent']||'')));return;}
  if(u==='/raidlog'){const q=new URLSearchParams(req.url.split('?')[1]||'');if(q.get('k')!==(process.env.RAIDLOG_KEY||'moonless')){res.writeHead(403);res.end();return;}res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(RAIDLOG));return;}
  if(u==='/')u='/index.html';
  const f=path.normalize(path.join(PUB,u));
  if(!f.startsWith(PUB)){res.writeHead(403);res.end();return;}
  fs.readFile(f,(e,d)=>{if(e){res.writeHead(404);res.end('not found');return;}res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(d);});
});
/* 레이드 기록: 끝날 때마다 한 줄씩 저장(밸런스 패치 근거). 파일은 재배포 때 초기화될 수 있어 로그에도 남김 */
const RAIDLOG_F=path.join(DATA_DIR,'raidlog.jsonl');const RAIDLOG=[];
try{for(const l of fs.readFileSync(RAIDLOG_F,'utf8').split('\n'))if(l.trim())RAIDLOG.push(JSON.parse(l));}catch(e){}
function raidLog(inst,result,why){try{const r=inst.raid;if(!r||r.logged)return;r.logged=1;const boss=inst.monsters.find(m=>m.boss&&!m.add);
  const rec={ts:new Date().toISOString(),raid:r.id,mode:r.practice?'practice':r.hard?'hard':'normal',result,why:why||null,time:Math.round(inst.time),bossT:Math.round(r.bossT||0),deathsLeft:r.deaths,bossHp:boss?Math.round(Math.max(0,boss.hp)/boss.maxHp*1000)/10:null,hl:r.hl||null,
    players:instPlayers(inst).map(P=>{const m=inst.meter.get(P.id)||{};const s=rst(inst,P)||{};const an=(r.an&&r.an[P.id])||{};return{name:P.ch.name,cls:P.ch.cls,lvl:P.ch.lvl,cp:SH.power(P.ch),ult:P.ch.ult||null,dmg:Math.round(m.dmg||0),bossDps:Math.round((m.dmg||0)/Math.max(1,r.bossT||inst.time)),heal:Math.round(m.heal||0),shield:Math.round(m.shield||0),taken:Math.round(m.taken||0),deaths:s.deaths|0,ctr:s.ctr|0,gim:s.gim|0,sk:Object.fromEntries(Object.entries(an).sort((a,b)=>b[1]-a[1]).map(([k,v])=>[k,Math.round(v)]))};})};
  RAIDLOG.push(rec);if(RAIDLOG.length>2000)RAIDLOG.shift();console.log('[RAIDLOG]'+JSON.stringify(rec));
  fs.mkdir(path.dirname(RAIDLOG_F),{recursive:true},()=>fs.appendFile(RAIDLOG_F,JSON.stringify(rec)+'\n',()=>{}));}catch(e){console.error('raidlog',e);}}
/* 명예의 전당: 흑왕 처치 파티 */
const FAME_F=path.join(DATA_DIR,'fame.json');let FAME=[];try{FAME=JSON.parse(fs.readFileSync(FAME_F,'utf8'))||[];}catch(e){}
/* 마을 랭킹 게시판: 격돌 무한 연습 · 낚시 대어 (캐릭터마다 최고 기록 1개 · 상위 20) — 배포로 파일이 지워져도 접속하는 캐릭터의 최고 기록으로 다시 채워짐 */
const RANK_F=path.join(DATA_DIR,'ranks.json');const RANKS={cpr:[],fish:[]};try{const o=JSON.parse(fs.readFileSync(RANK_F,'utf8'));for(const k of['cpr','fish'])if(o&&Array.isArray(o[k]))RANKS[k]=o[k].slice(0,20);}catch(e){}
let rankSaveT=null;function rankSave(){if(rankSaveT)return;rankSaveT=setTimeout(()=>{rankSaveT=null;try{fs.mkdirSync(path.dirname(RANK_F),{recursive:true});fs.writeFileSync(RANK_F,JSON.stringify(RANKS));}catch(e){}},1500);}
function rankPut(board,ent,quiet){const L=RANKS[board];const i=L.findIndex(e=>e.id===ent.id);if(i>=0){if(L[i].s>=ent.s){if(L[i].n!==ent.n){L[i].n=ent.n;rankSave();}return -1;}L.splice(i,1);}const top=L[0];L.push(ent);L.sort((a,b)=>b.s-a.s||a.ts-b.ts);if(L.length>20)L.length=20;const pos=L.indexOf(ent);if(pos<0)return -1;rankSave();
  if(!quiet&&pos===0&&(!top||top.id!==ent.id)){const m=board==='cpr'?`${ent.n}님이 격돌 무한 연습 ${ent.s.toLocaleString()}점으로 랭킹 1위!`:`${ent.n}님이 ${SH.FISH_GN[ent.g]} '${(SH.FISH.find(f=>f.id===ent.f)||{}).n||'물고기'}' ${ent.s}cm로 낚시 랭킹 1위!`;for(const q of players.values())if(q.ch)send(q,{t:'msg',m,c:'#ffd35a'});}return pos;}
function rankSeed(P){const ch=P.ch;if(!ch||!ch.id)return;if(ch.fishBest&&ch.fishBest.cm>0){const f=SH.FISH.find(x=>x.id===ch.fishBest.id);if(f)rankPut('fish',{id:ch.id,n:ch.name,cls:ch.cls,s:ch.fishBest.cm,f:f.id,g:SH.fishGrade(f,ch.fishBest.cm),ts:Date.now()},true);}
  if(ch.cprBest&&ch.cprBest.s>0)rankPut('cpr',{id:ch.id,n:ch.name,cls:ch.cls,s:ch.cprBest.s,best:ch.cprBest.best|0,p:ch.cprBest.p|0,ts:Date.now()},true);
  if(RANKS.cpr[0]&&RANKS.cpr[0].id===ch.id&&!ch.cprTop1){ch.cprTop1=1;markDirty(P);}if(!ch.fishLeg){const fb=ch.fishBest&&SH.FISH.find(x=>x.id===ch.fishBest.id);const legSeen=(ch.cdx||[]).some(k=>{const f=SH.FISH.find(x=>'f:'+x.id===k);return f&&f.r>=3;})||SH.FISH.some(f=>f.r>=3&&(ch.fish||{})[f.id]>0);if(legSeen||(fb&&SH.fishGrade(fb,ch.fishBest.cm)>=3)){ch.fishLeg=1;markDirty(P);}}}
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
  bossDmg:1.0,
  deepFrom:35,deepDamp:0.005, // 만렙 50(약 35층) 이후 몬스터 성장 완화: 장비로 강해지는 구간         // 보스 공격력 전체 배율
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
for(const d of (process.env.ONE_DUMMY?hub.map.dummies.slice(0,1):hub.map.dummies))hub.monsters.push({id:hub.mid++,type:'dummy',tc:99,dummy:true,x:d.x,y:d.y,r:7,maxHp:1e9,hp:1e9,dmg:0,spd:0,xp:0,face:-1,alert:true,slow:0,stun:0,flash:0,wind:0,windType:'',atkT:0,charge:0,dead:false});

/* 위치 강제 이동(tp)·맵 전송마다 번호를 붙여, 그 전에 출발한 낡은 이동 패킷이 위치를 되돌리지 못하게 (대시·순간이동 뒤 원래 자리로 튕기던 문제) */
function send(P,o){if(o&&(o.t==='tp'||o.t==='map')){P.tpSeq=((P.tpSeq|0)+1)&0xffff;o.q=P.tpSeq;}if(P.ws.readyState===1)P.ws.send(JSON.stringify(o));}
function instPlayers(inst){const a=[];for(const id of inst.players){const p=players.get(id);if(p)a.push(p);}return a;}
function bcast(inst,o){const s=JSON.stringify(o);for(const p of instPlayers(inst))if(p.ws.readyState===1)p.ws.send(s);}
function fx(inst,o){inst.fx.push(o);}
function msg(P,m,c){send(P,{t:'msg',m,c});}
function markDirty(P){P.dirty=true;}
/* 유물: 모든 지역·레이드에서 발동 (결투장만 제외 · 공정한 대결) */
function relicActive(P){return !(P.inst&&P.inst.arena);}
function recalc(P){P.S=SH.calcStats(P.ch,relicActive(P));P.hp=Math.min(P.hp,P.S.maxHp);P.mp=Math.min(P.mp,P.S.maxMp);markDirty(P);}

// ================= 파티 =================
function newParty(P){const pt={id:'pt'+(nextId++),leader:P.id,members:new Set([P.id]),inst:null};parties.set(pt.id,pt);P.party=pt;return pt;}
function partyList(pt){const a=[];for(const id of pt.members){const p=players.get(id);if(p)a.push(p);}return a;}
function sendParty(pt){const list=partyList(pt).map(p=>({id:p.id,cid:p.ch.id,name:p.ch.name,cls:p.ch.cls,lvl:p.ch.lvl}));for(const p of partyList(pt))send(p,{t:'party',leader:pt.leader,members:list,inDungeon:!!pt.inst});}
// 재접속(서버 재시작 등)했을 때 예전 파티원끼리 자동으로 다시 묶기
function restoreParty(P){const prev=P.prevParty;if(!prev||prev.length<2)return;for(const Q of players.values()){if(Q===P||!Q.ch||!Q.party||Q.inst!==hub||!prev.includes(Q.ch.id))continue;if(!(Q.prevParty||[]).includes(P.ch.id))continue;const pt=Q.party;if(pt===P.party||pt.members.size>=PARTY_MAX||pt.inst)continue;
    leaveParty(P);pt.members.add(P.id);P.party=pt;sendParty(pt);bcastRoster(hub);for(const q of partyList(pt))msg(q,`${P.ch.name}님이 다시 파티에 합류했습니다`,'#7fd05a');return;}}
function leaveParty(P){const pt=P.party;if(!pt)return;pt.members.delete(P.id);P.party=null;if(pt.members.size===0){parties.delete(pt.id);}else{if(pt.leader===P.id)pt.leader=[...pt.members][0];sendParty(pt);}}

// ================= 인스턴스 =================
function lookOf(P){const w=P.ch.eq.weapon,a=P.ch.eq.armor,r=P.ch.eq.ring,c=P.ch.cos||{};return{pet:P.ch.pet||null,ttl:P.ch.title?SH.titleOf(P.ch.title):null,w:w?w.kind:null,wr:w?w.rar:-1,wid:w?String(w.id).slice(0,12):null,a:a?a.kind:null,ar:a?a.rar:-1,rr:r?r.rar:-1,dy:P.ch.dye|0,cp:c.cape===0?0:1,gl:c.glow===0?0:1,sh:c.shield===0?0:1,adv:SH.advOf(P.ch)?P.ch.adv:null,aw:SH.awkOf(P.ch)?1:0,sk:(P.ch.skinOn||{})[CLASSES[P.ch.cls].fam]||null,cs:P.ch.cstOn||null,mt:P.ch.mtOn||null,fp:P.ch.fpOn||null,lg:P.ch.lgOn&&SH.legendOk(P.ch,P.ch.lgOn)?P.ch.lgOn:null};}
function roster(inst){return instPlayers(inst).map(p=>({id:p.id,name:p.ch.name,cls:p.ch.cls,lvl:p.ch.lvl,pt:p.party?p.party.id:null,look:lookOf(p),pvp:p.ch.pvp,tm:p.arenaTeam==null?-1:p.arenaTeam}));}
function bcastRoster(inst){if(inst.type==='dungeon'){inst.syn=SH.synergies(instPlayers(inst).map(p=>p.ch.cls));inst.synM={};for(const c of SH.CLASS_ORDER)inst.synM[c]=SH.synergyMods(inst.syn,c);}bcast(inst,{t:'ros',list:roster(inst),syn:inst.syn||null});}
function visibleDrops(inst,P){return inst.drops.filter(d=>d.owner==null||d.owner===P.id);}
function sendMap(P){const inst=P.inst;if(P.S&&!!P.S.rl!==relicActive(P)){recalc(P);send(P,{t:'ch',ch:P.ch,S:P.S});}
  if(inst.type==='hub')send(P,{t:'map',kind:'hub',x:P.x,y:P.y,drops:visibleDrops(inst,P)});
  else send(P,{t:'map',kind:'dungeon',seed:inst.seed,floor:inst.floor,stairs:inst.stairsOpen,x:P.x,y:P.y,drops:visibleDrops(inst,P),paused:inst.paused,ev:evPub(inst),tm:inst.tmod?[...inst.tmod]:0,arena:inst.arena?1:0,trial:inst.trial?{adv:inst.trial.adv,cls:inst.trial.cls,look:inst.trial.look,re:inst.trial.re?1:0,aw:inst.trial.awk?1:0}:0,field:inst.field?fieldPub(inst):0,raid:inst.raid?{id:inst.raid.id,mode:inst.raid.mode,tf:RAID_TF[inst.raid.id]||1,door:!!inst.raid.doorOpen,st:raidPub(inst)}:0});}
/* 인스턴스마다 시계(inst.time)가 0부터 다시 시작하므로, 인스턴스 시간으로 적어 둔 개인 값은 옮길 때마다 비운다 (멈춤·스킬 먹통 버그) */
function resetCombat(P){P.gmLock=0;P.lkT=0;P.clashLk=0;P.actT=0;P.novaT=0;P.bellT=0;P.comboT=0;P.combo=0;P._chzT=0;P.awkInvTx=0;P._ctrWarn=0;P._hcT=0;P.bad=0;P.stuckT=0;P.awkInv=0;P.burn=0;P.rootT=0;P.slowT=0;P.slowV=0;P.downed=false;P.rev=0;P.shield=0;P.shieldT=0;P.dodgeT=0;P.buffs={};P.scd={};P.atkCd=0;/* 인스턴스 시계(inst.time) 기준 값들: 인스턴스마다 시계가 0부터라, 남겨 두면 다음 던전에서 '불사(광란)'가 몇 시간씩 이어지거나 과열·등불 유물이 막힘 */P.undyT=0;P.ovhT=0;P.lampUndy=0;P.dlog=[];P.steam=0;}
function leaveInst(P){if(P.trade)cancelTrade(P,'상대가 마을을 떠나 거래가 취소되었습니다');P.fishing=null;const inst=P.inst;if(!inst)return;inst.players.delete(P.id);P.inst=null;
  /* 일시정지한 사람이 접속을 끊으면 남은 파티원이 멈춘 채로 남던 문제 */if(inst.paused&&P.ch&&inst.paused===P.ch.name&&inst.players.size){inst.paused=null;bcast(inst,{t:'paused',by:null});}
  if(inst.raid&&inst.raid.vote&&inst.players.size){try{voteCheck(inst);}catch(e){}}
  /* 결투 중 접속을 끊어도 패배로 (예전엔 끊으면 패배가 안 쌓였음) */if(inst.arena&&!inst.arena.over&&P.ch&&!P._arenaQuit){P.ch.pvp=P.ch.pvp||{w:0,l:0};P.ch.pvp.l++;}P._arenaQuit=false;
  if(inst.type==='dungeon'){inst.flows.delete(P.id);
    if(inst.players.size===0){dungeons.delete(inst.id);if(inst.party&&inst.party.inst===inst){inst.party.inst=null;sendParty(inst.party);}}
    else bcastRoster(inst);}
  else bcastRoster(inst);}
function joinHub(P){leaveInst(P);P.inst=hub;P.arenaTeam=null;hub.players.add(P.id);const s=hub.map.spawn;P.x=s.x+rf(-30,30);P.y=s.y+rf(-12,12);resetCombat(P);P.hp=P.S.maxHp;P.mp=P.S.maxMp;sendMap(P);bcastRoster(hub);}
function placeStart(inst,P,k){const st=inst.map.start;const offs=[[0,0],[14,0],[-14,0],[0,14],[0,-14],[14,14],[-14,14],[14,-14],[-14,-14]];const o=offs[k%offs.length];let x=st.cx*TS+8+o[0],y=st.cy*TS+8+o[1];if(SH.blocked(inst.map,x,y,4)){x=st.cx*TS+8;y=st.cy*TS+8;}P.x=x;P.y=y;}
function createDungeon(pt){const inst={id:'d'+(nextId++),type:'dungeon',party:pt,players:new Set(),floor:0,seed:0,map:null,monsters:[],projs:[],drops:[],zones:[],timers:[],hz:[],dark:0,fx:[],paused:null,mid:1,pid:1,did:1,time:0,flows:new Map(),meter:new Map(),bossMeter:null,bossStart:0,trans:null,wipeT:0,meterT:0};dungeons.set(inst.id,inst);pt.inst=inst;return inst;}
function loadFloor(inst,floor){
  if(inst.floor>0&&floor===inst.floor+1)for(const P of instPlayers(inst))bump(P,'floor',1);
  inst.floor=floor;inst.seed=(Math.random()*2147483647)|0;inst.map=SH.genFloor(inst.seed,floor);inst.tmod=null;
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
function spawnMonster(inst,type,x,y,elite){const d=SH.MT[type],f=inst.floor,n=Math.max(1,inst.players.size);const deep=f>BAL.deepFrom?1/(1+BAL.deepDamp*(f-BAL.deepFrom)):1;
  const hpM=(1+BAL.monHpPerFloor*(f-1))*(1+BAL.monHpCurve*(f-1))*(1+BAL.partyHp*(n-1))*deep,dmM=(1+BAL.monDmgPerFloor*(f-1))*deep;
  const m={id:inst.mid++,type,tc:SH.MT_LIST.indexOf(type),d,x,y,r:d.r,elite:!!elite,maxHp:Math.round(d.hp*hpM*(elite?BAL.eliteHp:1)*(type==='boss'?BAL.bossHp:1)),dmg:d.dmg*dmM*(elite?BAL.eliteDmg:1)*(type==='boss'?BAL.bossDmg:1),spd:d.spd*(elite?1.1:1),
    xp:Math.round(d.xp*(1+0.3*(f-1))*(elite?3:1)*BAL.xp),face:1,cd:rf(0,1),ccd:1.5,wind:0,windType:'',atkT:0,flash:0,slow:0,stun:0,alert:false,moving:false,wander:0,wdx:0,wdy:0,charge:0,dead:false,tgt:null,tgtT:0,taunt:null};
  if(elite&&type!=='boss'){const pool=SH.EAFF.slice();const n=f>=10&&R()<0.45?2:1;m.ea=0;for(let i=0;i<n;i++){const a=pool.splice(Math.floor(R()*pool.length),1)[0];m.ea|=a[2];}
    if(m.ea&128)m.maxHp=Math.round(m.maxHp*1.5);if(m.ea&64)m.spd*=1.4;m.tpT=rf(2,5);m.shCd=rf(2,5);}
  m.hp=m.maxHp;m.baseDmg=m.dmg;inst.monsters.push(m);return m;}
function spawnMonsters(inst){const map=inst.map,f=inst.floor,n=Math.max(1,inst.players.size);
  for(const r of map.rooms){
    if(r===map.start)continue;
    if(r===map.bossRoom){const b=spawnMonster(inst,'boss',r.cx*TS+8,r.cy*TS+8,false);b.boss=true;b.home={x:b.x,y:b.y};const th=SH.themeOf(f);const bm=(1+th.idx*0.12)*(th.corrupt?1.3:1)*(1+BAL.bossHpCurve*(f-1))*(f===100?BAL.finalBoss:1);const pn=n-1;b.hp=b.maxHp=Math.round(b.maxHp*bm*(1+BAL.bossPartyHp*pn));b.dmg*=1+BAL.bossPartyDmg*pn;b.baseDmg=b.dmg;b.partyCd=1/(1+BAL.bossPartyTempo*pn);b.r=f===100?13:11;inst.bossId=b.id;continue;}
    let c=ri(2,4)+Math.min(4,Math.floor(f/4))+(n<=4?n-1:3+Math.ceil((n-4)/2));if(map.boss)c=Math.max(1,c-2);const eliteRoom=R()<0.12+Math.min(0.3,f*0.015);
    for(let i=0;i<c;i++){const x=(r.x+ri(1,r.w-2))*TS+8,y=(r.y+ri(1,r.h-2))*TS+8;spawnMonster(inst,pickType(f),x,y,eliteRoom&&i===0);}
  }}
function livingPlayers(inst){return instPlayers(inst).filter(p=>!p.downed);}
function pickTarget(inst,m){if(m.taunt&&m.taunt.t>0){const p=players.get(m.taunt.pid);if(p&&p.inst===inst&&!p.downed)return p;}
  let best=null,bd=1e9;for(const p of livingPlayers(inst)){let d=Math.hypot(p.x-m.x,p.y-m.y);if(p.ch.cls==='guardian')d*=0.6;if(d<bd){bd=d;best=p;}}
  if(inst.allies&&!m.boss)for(const a of inst.allies){if(a.downed)continue;let d=Math.hypot(a.x-m.x,a.y-m.y);if(a.type==='w')d*=0.6;else d*=1.15;if(d<bd){bd=d;best=a;}}return best;}
function getFlow(inst,P){if(P.ally){if(!P.fl||inst.time-P.fl.t>0.4)P.fl={t:inst.time,d:SH.bfs(inst.map,Math.floor(P.x/TS),Math.floor(P.y/TS),30)};return P.fl.d;}let f=inst.flows.get(P.id);if(!f||inst.time-f.t>0.3){f={t:inst.time,d:SH.bfs(inst.map,Math.floor(P.x/TS),Math.floor(P.y/TS),45)};inst.flows.set(P.id,f);}return f.d;}
function alertPack(inst,m){const wake=o=>{if(o.alert)return;o.alert=true;if(o.boss&&inst.raid){if(!inst.raid.introDone){inst.raid.introDone=1;bossCard(inst,null);}fx(inst,{k:'bsay',id:o.id,m:(RAID_LINES[inst.raid.id]||[''])[0]});fx(inst,{k:'msg',m:`${o.bname}이(가) 깨어났다!`,c:'#ff5a4a'});fx(inst,{k:'sfx',n:'boss'});inst.bossMeter=new Map();inst.bossStart=inst.time;return;}if(o.boss){{const th=SH.themeOf(o.f||inst.floor);const ln=th.final?SH.FINAL_LINES[0]:(th.corrupt?'다시 왔구나… 심장이 나를 되살렸다! ':'')+((SH.BOSS_LINES[th.idx]||th.t.bl||['…'])[0]);fx(inst,{k:'bsay',id:o.id,m:ln});}fx(inst,{k:'msg',m:`${SH.bossOf(o.f||inst.floor).n}이(가) 깨어났다!`,c:'#ff5a4a'});fx(inst,{k:'sfx',n:'boss'});inst.bossMeter=new Map();inst.bossStart=inst.time;}};
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
function hitCircle(inst,x,y,r,dmg,src,o){const big=src&&src.id!=null&&instPlayers(inst).length>4;for(const p of livingPlayers(inst))if(Math.hypot(p.x-x,p.y-y)<r+4){let d=dmg;/* 5인 이상: 사람마다 생기는 장판이 겹쳐도 몇 배로 맞지 않게 */if(big){if(p._hcS===src.id&&inst.time-p._hcT<0.3)d*=0.35;p._hcS=src.id;p._hcT=inst.time;}hurtPlayer(inst,p,d,src,o);}if(inst.allies)for(const a of inst.allies)if(!a.downed&&Math.hypot(a.x-x,a.y-y)<r+4)hurtAlly(inst,a,dmg*0.6);}
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
  markSpread(inst,m){const ps=livingPlayers(inst);if(!ps.length)return 0.2;const T=pick(ps);const t=3*m.tf;fx(inst,{k:'mark',id:T.id,d:t,c:'c',txt:rh(inst,'spread',['!','홀로 버텨라','흩어지세요!'])});
    later(inst,t,()=>{if(m.dead||T.inst!==inst)return;fx(inst,{k:'boom',x:r1(T.x),y:r1(T.y),r:40,c:1});hitCircle(inst,T.x,T.y,40,m.dmg*2,m);});return 0.4;},
  cone(inst,m){const T=m.tgt;if(!T)return 0.3;const a=Math.atan2(T.y-m.y,T.x-m.x),t=0.8*m.tf;m.atkT=t;fx(inst,{k:'telecone',x:r1(m.x),y:r1(m.y),a:r1(a),r:90,arc:0.6,d:t});
    later(inst,t,()=>{if(m.dead)return;fx(inst,{k:'cleave',x:r1(m.x),y:r1(m.y),a:r1(a)});for(const p of livingPlayers(inst)){const d=Math.hypot(p.x-m.x,p.y-m.y);if(d<94&&(d<12||angDiff(Math.atan2(p.y-m.y,p.x-m.x),a)<0.62)){hurtPlayer(inst,p,m.dmg*1.8,m);if(m.burnOn)addBurn(inst,p,m,2);}}});return t+0.4;},
  blizzard(inst,m){const fires=[roomPoint(inst,m,50),roomPoint(inst,m,50)];for(const f of fires)addHz(inst,{x:f.x,y:f.y,r:28,t:7,arm:1.2,vis:28,safe:true});
    addHz(inst,{x:m.x,y:m.y,r:9999,t:6,arm:1.8*m.tf,dmg:m.dmg*0.4,slow:0.4,vis:29,global:true,safeSpots:fires});bmsg(inst,m,rh(inst,'bliz',['눈보라!','눈보라! 온기를 찾아라','눈보라! 화톳불 곁으로 피하세요!']),'#8fd0ff');fx(inst,{k:'sfx',n:'ice'});return 1;},
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
  rewind(inst,m){const t=2.5*m.tf;for(const p of livingPlayers(inst)){const x=p.x,y=p.y;fx(inst,{k:'tele',x:r1(x),y:r1(y),r:26,d:t,c:'y'});later(inst,t,()=>{if(m.dead)return;fx(inst,{k:'boom',x:r1(x),y:r1(y),r:26,c:1});hitCircle(inst,x,y,26,m.dmg*2,m);});}bmsg(inst,m,rh(inst,'rewind',['시간이 되감긴다!','시간이 되감긴다! 방금 서 있던 자리가 위험하다','시간이 되감긴다! 지금 서 있던 곳에서 멀어지세요']),'#ffd35a');return 0.5;},
  homing(inst,m){const n=m.phase>1?6:4;for(let i=0;i<n;i++){const a=i/n*Math.PI*2;mproj(inst,m,'page',a,70,m.dmg*0.8,{homing:1.8,life:5,r:3});}fx(inst,{k:'sfx',n:'cast'});return 0.8;},
  pages(inst,m){for(let i=0;i<16;i++)mproj(inst,m,'page',R()*6.28,rf(45,75),m.dmg*0.6,{life:5});fx(inst,{k:'sfx',n:'cast'});return 0.6;},
  clones(inst,m){for(let i=0;i<2;i++){const p=roomPoint(inst,m,40);const c=spawnAdd(inst,m,'clone',p.x,p.y,{cloneOf:m.id,tcSkin:m.tc});c.hp=c.maxHp=Math.round(m.maxHp*0.06);c.dmg=m.dmg*0.5;c.r=m.r;}const p=roomPoint(inst,m,40);fx(inst,{k:'tp',x:r1(m.x),y:r1(m.y)});m.x=p.x;m.y=p.y;fx(inst,{k:'tp',x:r1(m.x),y:r1(m.y)});bmsg(inst,m,'분신이 나타났다! 그림자가 있는 것이 진짜다','#c77ad8');return 0.8;},
  stackMark(inst,m){const ps=livingPlayers(inst);if(!ps.length)return 0.2;const T=pick(ps);const t=3*m.tf;fx(inst,{k:'mark',id:T.id,d:t,c:'y',txt:rh(inst,'stack',['!','함께 버텨라','모이세요!'])});
    later(inst,t,()=>{if(m.dead||T.inst!==inst)return;const inside=livingPlayers(inst).filter(p=>Math.hypot(p.x-T.x,p.y-T.y)<38);const total=m.dmg*2.2*Math.max(1,livingPlayers(inst).length);fx(inst,{k:'strike',x:r1(T.x),y:r1(T.y)});fx(inst,{k:'ring',x:r1(T.x),y:r1(T.y),r:38,c:'y',c2:'w'});for(const p of inside)hurtPlayer(inst,p,total/Math.max(1,inside.length),m);});return 0.4;},
  chainMark(inst,m){const t=3*m.tf;const ps=livingPlayers(inst);const sepT=rh(inst,'sep',['!','서로에게서…','떨어지세요!']);for(const p of ps)fx(inst,{k:'mark',id:p.id,d:t,c:'c',txt:sepT});
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
function initBoss(inst,m){const f=m.f||inst.floor,th=SH.themeOf(f),bd=SH.bossOf(f);m.bossInit=true;m.bname=bd.n;m.theme=th.idx;m.corrupt=th.corrupt;m.final=!!bd.final;m.tf=th.corrupt?0.8:1;m.phase=1;m.fightT=0;m.patCd=2;m.spdMul=1;
  m.p1=bd.pats.slice();m.p2=bd.p2.slice();m.p3=(bd.p3||[]).slice();
  if(th.corrupt&&!bd.final){const other=SH.THEMES[(th.idx+3)%10].boss.pats;m.p1.push(other[0]);m.p2.push(other[1]);}
  m.col=['e','c','o','z','c','e','y','P','y','P'][th.idx];}
function bossAI(inst,m,T,d,dt,sm){if(!m.bossInit)initBoss(inst,m);if(!(m.faceLock>inst.time))m.face=T.x<m.x?-1:1;m.fightT+=dt;
  if(m.vuln>0)m.vuln-=dt;if(m.invul>0&&m.invul<90){m.invul-=dt;if(m.invul<0)m.invul=0;}
  if(m.invul>=90&&!inst.monsters.some(o=>!o.dead&&o.guardOf===m.id)&&!m.hidden){m.invul=0;bmsg(inst,m,'보호가 풀렸다! 지금 공격하세요','#ffd35a');}
  const hpf=m.hp/m.maxHp;
  if(m.phase===1&&hpf<0.5){m.phase=2;m.patCd=0.5;bmsg(inst,m,`${m.bname}이(가) 격노한다!`,'#ff4a3a');fx(inst,{k:'shake',v:5});fx(inst,{k:'sfx',n:'boss'});}
  if(m.phase===2&&m.p3.length&&hpf<0.2){m.phase=3;m.patCd=0.3;m.forceNext=m.p3[0];}
  if(!m.enraged&&m.fightT>240){m.enraged=true;m.dmg*=1.6;m.spdMul=1.4;bmsg(inst,m,`${m.bname}이(가) 광폭해졌다! (시간 초과)`,'#ff4a3a');}
  farHarass(inst,m,dt);
  if(m.busy>0){m.busy-=dt;return;}
  if(m.vuln>0)return;
  m.ctrCd=(m.ctrCd==null?rf(9,13):m.ctrCd)-dt;if(m.ctrCd<=0&&!m.hidden&&!(m.invul>0)){m.ctrCd=rf(15,21)*(m.phase>1?0.8:1);m.busy=counterWindow(inst,m,T);return;}
  m.patCd-=dt;
  if(m.patCd<=0){let name=m.forceNext;m.forceNext=null;if(!name){const pool=m.phase>1?m.p1.concat(m.p2,m.p2):m.p1;const opts=pool.filter(p=>p!==m.last);name=pick(opts.length?opts:pool);}
    const busy=(BP[name]||BP.slam)(inst,m,T);m.busy=busy;m.last=name;m.patCd=rf(1.6,2.6)*(m.corrupt?0.8:1)*(m.enraged?0.7:1)*(m.phase>1?0.85:1)*(m.partyCd||1);return;}
  if(d<m.r+4+18&&m.cd<=0){m.cd=m.d.cd*(m.corrupt?0.8:1);m.busy=BP.swipe(inst,m,T);return;}
  chase(inst,m,T,dt,sm*m.spdMul*(m.corrupt?1.2:1));}
// ---- 카운터: 보스가 파랗게 빛나는 동안 '카운터 가능' 스킬을 맞히면 저지 → 그로기, 못 막으면 강공격 ----
const CTR_WIN=1.15,CTR_GRACE=0.15;/* 경고 표시 시간 = 판정 시간 · 서버 지연 보정 0.15초 */
function counterWindow(inst,m,T){const moon=m.ctrMode==='moon',hard=!!(inst.raid&&inst.raid.hard);const win=CTR_WIN*(hard?0.8:1)*(moon?0.9:1);m.cwEnd=inst.time+win;m.face=T.x<m.x?-1:1;m.faceLock=inst.time+win+0.4;const id=m.ctrId=(m.ctrId|0)+1;m.atkT=win;
  const FR=moon?(hard?175:150):82;fx(inst,{k:'ctrwin',id:m.id,d:win});fx(inst,{k:'tele',x:r1(m.x),y:r1(m.y),r:FR,d:win,c:'c'});
  later(inst,win+CTR_GRACE,()=>{if(m.dead||m.ctrId!==id||m.countered===id)return;m.cwEnd=0;
    fx(inst,{k:'boom',x:r1(m.x),y:r1(m.y),r:FR});fx(inst,{k:'shake',v:moon?10:6});fx(inst,{k:'msg',m:`${m.bname||'보스'}의 강공격! (카운터 실패)`,c:'#ff6a5a'});
    if(moon)fx(inst,{k:'sv',s:'awnova',x:r1(m.x),y:r1(m.y),r:FR,c:'#9a7ad8',sid:'awAbyssBind',d:0.9});
    const mul=moon?(hard?3.6:3.0):2.4,kb=moon?300:220;
    for(const p of livingPlayers(inst)){const d=Math.hypot(p.x-m.x,p.y-m.y);if(d<FR+4){hurtPlayer(inst,p,m.dmg*mul,m,{what:`${m.bname||'보스'}의 강공격`});const gk=inst.raid&&inst.raid.gm&&inst.raid.gm.k;if(!p.downed&&!(moon&&gk&&MOON_POS_GM[gk])){const a=Math.atan2(p.y-m.y,p.x-m.x);send(p,{t:'force',vx:Math.cos(a)*kb,vy:Math.sin(a)*kb,d:0.25});}}}
    if(inst.allies)for(const a of inst.allies)if(!a.downed&&Math.hypot(a.x-m.x,a.y-m.y)<FR)hurtAlly(inst,a,m.dmg*1.5);
    if(moon)moonCtrChain(inst,m,false);});
  return win+CTR_GRACE+0.4;}
/* 흑왕: 2페이즈부터 연속 카운터 (성공·실패와 상관없이 이어서 한 번 더) */
function moonCtrChain(inst,m,ok){if(m.phase<2||m.dead||m.chainLeft===0)return;if(m.chainLeft==null){if(R()>(m.phase>2?0.55:0.4))return;m.chainLeft=1;}m.chainLeft--;m.chainFirst=!!ok;later(inst,0.55,()=>{if(m.dead||m.hidden)return;const ps=livingPlayers(inst);if(!ps.length)return;fx(inst,{k:'bsay',id:m.id,m:'한 번 더!'});m.busy=counterWindow(inst,m,pick(ps));m.chainWin=m.ctrId;});}
/* 2연속 카운터 모두 성공 → 흑월 균열: 진짜 무력화 + 파티 버프 */
function moonCrack(inst,m,P){m.chainWin=0;m.busy=3;m.stun=Math.max(m.stun||0,3);m.grog=inst.time+4;m.wind=0;m.atkT=0;fx(inst,{k:'bsay',id:m.id,m:'크윽… 흑월이… 갈라진다…!'});fx(inst,{k:'shake',v:9});fx(inst,{k:'flash'});
  fx(inst,{k:'sv',s:'awnova',x:r1(m.x),y:r1(m.y),r:120,c:'#ffe9a8',sid:'',d:1});fx(inst,{k:'sv',s:'starburst',x:r1(m.x),y:r1(m.y-10),r:60,d:0.9});
  for(const q of livingPlayers(inst)){buff(q,'dmg',0.15,10);fx(inst,{k:'txt',x:r1(q.x),y:r1(q.y-30),s:'새벽의 기세!',c:'#ffd35a'});}
  for(const q of instPlayers(inst))msg(q,`흑월 균열! ${P.ch.name}님의 연속 카운터로 흑왕이 무력화됐다 (3초 · 받는 피해 +30%) · 파티 공격력 +15% 10초`,'#ffd35a');}
/* 흑왕 카운터 성공: 무력화되지 않고 튕겨낸 뒤 카운터한 사람에게 약한 반격 (짧은 경고 → 피해야 함) */
function moonRetaliate(inst,m,P){const hard=!!(inst.raid&&inst.raid.hard),t=hard?0.42:0.5,dm=m.dmg*(hard?1.0:0.8);const v=pick(['slash','drop','cross']);m.busy=t+0.5;
  fx(inst,{k:'bsay',id:m.id,m:pick(['가소롭다!','그 정도로는 안 된다.','흑월은 꺾이지 않는다!'])});
  if(v==='slash'){const a=Math.atan2(P.y-m.y,P.x-m.x),L=170,x2=m.x+Math.cos(a)*L,y2=m.y+Math.sin(a)*L;fx(inst,{k:'teleline',x1:r1(m.x),y1:r1(m.y),x2:r1(x2),y2:r1(y2),w:12,d:t});
    later(inst,t,()=>{if(m.dead)return;fx(inst,{k:'sv',s:'awbeam',x1:r1(m.x),y1:r1(m.y-6),x2:r1(x2),y2:r1(y2-6),w:12,c:'#9a7ad8',sid:'',d:0.4});for(const p of livingPlayers(inst))if(distSeg(p.x,p.y,m.x,m.y,x2,y2)<14)hurtPlayer(inst,p,dm,m,{what:'흑왕의 반격 베기'});});}
  else if(v==='drop'){const x=P.x,y=P.y;fx(inst,{k:'tele',x:r1(x),y:r1(y),r:34,d:t,c:'p'});later(inst,t,()=>{if(m.dead)return;fx(inst,{k:'sv',s:'awnova',x:r1(x),y:r1(y),r:34,c:'#9a7ad8',sid:'',d:0.6});hitCircle(inst,x,y,34,dm,m,{what:'흑왕의 반격'});});}
  else{const a0=Math.atan2(P.y-m.y,P.x-m.x),L=150;const segs=[0,Math.PI/2].map(o=>[m.x-Math.cos(a0+o)*L,m.y-Math.sin(a0+o)*L,m.x+Math.cos(a0+o)*L,m.y+Math.sin(a0+o)*L]);for(const g of segs)fx(inst,{k:'teleline',x1:r1(g[0]),y1:r1(g[1]),x2:r1(g[2]),y2:r1(g[3]),w:10,d:t+0.08});
    later(inst,t+0.08,()=>{if(m.dead)return;for(const g of segs)fx(inst,{k:'sv',s:'awbeam',x1:r1(g[0]),y1:r1(g[1]-6),x2:r1(g[2]),y2:r1(g[3]-6),w:10,c:'#9a7ad8',sid:'',d:0.4});for(const p of livingPlayers(inst))if(segs.some(g=>distSeg(p.x,p.y,g[0],g[1],g[2],g[3])<12))hurtPlayer(inst,p,dm,m,{what:'흑왕의 십자 반격'});});}
  later(inst,t+0.2,()=>moonCtrChain(inst,m,true));}
// 보스 기준 플레이어 위치: 1 헤드(앞), -1 백(뒤), 0 옆
function bossSide(m,P){const f=m.face<0?-1:1;const dx=P.x-m.x,dy=P.y-m.y,d=Math.hypot(dx,dy)||1;const c=dx*f/d;return c>0.3?1:c<-0.5?-1:0;}
function counterHit(inst,m,P){if(P.S&&P.S.set3&&P.S.set3.includes('moon')){buff(P,'sdmg',0.35,10);P.ctrT=0;send(P,{t:'ctrReset'});fx(inst,{k:'txt',x:r1(P.x),y:r1(P.y-34),s:'흑월 각성!',c:'#c9a0e8'});}if(inst.raid){const s=rst(inst,P);if(s)s.ctr++;}m.cwEnd=0;m.countered=m.ctrId;m.busy=0;m.wind=0;m.atkT=0;if(m.ctrMode==='moon'){fx(inst,{k:'counter',id:m.id,x:r1(m.x),y:r1(m.y),by:P.ch.name});stInc(P,'ctr');P.ctrT=0;send(P,{t:'ctrReset'});/* 흑왕: 카운터 성공 시 카운터 쿨 초기화 → 혼자서도 연속 카운터 가능 */if(m.chainWin&&m.chainWin===m.ctrId&&m.chainFirst){moonCrack(inst,m,P);return;}later(inst,0.22,()=>{if(!m.dead)moonRetaliate(inst,m,P);});m.busy=0.9;for(const q of instPlayers(inst))msg(q,`${P.ch.name}님의 카운터! 흑왕이 튕겨내고 반격한다 — 피하세요!`,'#c9a0e8');return;}m.stun=Math.max(m.stun||0,1.8);m.grog=inst.time+1.8;
  fx(inst,{k:'counter',id:m.id,x:r1(m.x),y:r1(m.y),by:P.ch.name});fx(inst,{k:'shake',v:3});stInc(P,'ctr');
  for(const q of instPlayers(inst))msg(q,`${P.ch.name}님의 카운터! 보스가 그로기 상태입니다`,'#8fd0ff');}

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
    if(m.dead)continue;if(inst.field&&!m.fev&&!m.boss){m.slpT=(m.slpT||0)-dt;if(m.slpT<=0){m.slpT=0.4+R()*0.3;m.slp=!fieldNear(inst,m.x,m.y,m.alert?560:420);if(m.slp&&m.alert){m.alert=false;m.tgt=null;}}if(m.slp)continue;}m.flash=Math.max(0,m.flash-dt);if(m.slow>0)m.slow-=dt;m.cd-=dt;m.ccd-=dt;if(m.atkT>0)m.atkT-=dt;m.moving=false;if(m.taunt){m.taunt.t-=dt;if(m.taunt.t<=0)m.taunt=null;}
    if(m.shT>0){m.shT-=dt;if(m.shT<=0)m.shV=0;}
    if(m.stun>0){m.stun-=dt;m.wind=0;m.charge=0;continue;}
    if(m.frozen)continue;
    if(m.type==='goblin'){goblinAI(inst,m,dt);continue;}
    if(m.type==='shadow'){shadowAI(inst,m,dt);continue;}
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
    if(m.boss){(m.raidAI||bossAI)(inst,m,T,d,dt,sm);continue;}
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
function syncAllies(inst){const ps=instPlayers(inst);inst.allies=inst.allies||[];const want=ps.length===1&&ps[0].ch.merc&&!inst.arena&&!inst.trial?ps[0]:null;
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
let CUR_CASTER=null;
/* 버프 갱신: 약한 버프가 들어와도 강한 버프 시간이 늘지 않게, 강한 버프는 제 시간만큼만 (예전엔 오라가 0.5초마다 다른 버프 시간을 늘려 광란 +50% 같은 버프가 끝나지 않았음) */function buff(P,k,v,t){const b=P.buffs;if(b[k+'T']>0&&b[k]>v)return;if(CUR_CASTER&&(k==='red'||k==='wred'||k==='tred'))b[k+'S']=CUR_CASTER.id;if(b[k+'T']>0&&b[k]===v){b[k+'T']=Math.max(b[k+'T'],t);return;}b[k]=v;b[k+'T']=t;}
function atkMul(P){return 1+bOn(P,'as')+(P.S.bloodboil&&P.hp<P.S.maxHp*0.5?0.02*P.S.bloodboil:0);}
function rollDmg(P,mult){const S=P.S;const bonus=1+bOn(P,'dmg')+bOn(P,'sdmg')+bOn(P,'bdmg');let d=S.dmgBase*rf(0.8,1.2)*S.dmgMul*mult*bonus*synMods(P.inst,P).dmg;const crit=R()*100<S.crit;if(crit)d*=S.critMul;return{d:Math.max(1,Math.round(d)),crit};}
// ===== 잿불 유물: 획득 · 발동 =====
function relicGain(P,q){const ch=P.ch;if(!ch.rbag)ch.rbag=SH.relicNewBag(ch.rbagLv|0);const I=ch.rinv||(ch.rinv=[]);
  if(q.t==='r'){const R=SH.RELICS[q.id];const ex=ch.rbag.c.concat(I).find(x=>x&&x.t==='r'&&x.id===q.id);if(ex){if(ex.lv<R.max){ex.lv++;msg(P,`유물 「${R.n}」 기본 레벨 ${ex.lv}로 강화!`,SH.RTAG[R.tag].c);}else{ch.mats.dust=(ch.mats.dust|0)+3;msg(P,`「${R.n}」은 이미 최고 레벨 · 마력 가루 +3`,'#9e937a');}recalc(P);markDirty(P);send(P,{t:'ch',ch:P.ch,S:P.S});return;}}
  if(I.length>=SH.RINV_MAX){ch.mats.dust=(ch.mats.dust|0)+2;msg(P,'유물 보관함이 가득 차서 마력 가루로 바꿨어요','#ff9a5a');markDirty(P);return;}
  I.push(q);msg(P,q.t==='r'?`유물 획득: 「${SH.RELICS[q.id].n}」 (${SH.RTAG[SH.RELICS[q.id].tag].n})`:`석판 획득: 「${SH.TABLETS[q.id].n}」`,q.t==='r'?SH.RTAG[SH.RELICS[q.id].tag].c:'#e6dcc3');markDirty(P);send(P,{t:'ch',ch:P.ch,S:P.S});}
function rlv(P,id){const r=P.S&&P.S.rl;return r?(r.on[id]|0):0;}
function relicHit(inst,m,P,mult,o){if(!P||!P.S||!P.S.rl||o.relic||o.dotHit||o.myth)return;const f4=P.S.rl.sp.fire4?1.5:1;let L;
  if((L=rlv(P,'chill')))m.slow=Math.max(m.slow||0,L*0.3);
  if((L=rlv(P,'blaze'))&&R()<L*0.06*f4){const x=m.x,y=m.y;fx(inst,{k:'boom',x:r1(x),y:r1(y),r:26,c:1});later(inst,0.05,()=>{if(P.inst===inst)aoe(inst,P,x,y,26,0.6+L*0.2,{relic:1,el:'fire'});});}
  if((L=rlv(P,'echo'))&&R()<L*0.06&&!m.dead){fx(inst,{k:'txt',x:r1(m.x),y:r1(m.y-24),s:'메아리',c:'#b48aff'});later(inst,0.18,()=>{if(!m.dead&&P.inst===inst)hitMonster(inst,m,P,Math.max(0.1,mult*0.5),{relic:1});});}
  if((L=rlv(P,'piston'))&&R()<L*0.05){const x=P.x,y=P.y;fx(inst,{k:'ring',x:r1(x),y:r1(y),r:40,c:'y',c2:'w'});later(inst,0.05,()=>{if(P.inst===inst)aoe(inst,P,x,y,40,0.4+L*0.2,{relic:1,kb:10});});}}
function relicKill(inst,m,P){if(!P||!P.S||!P.S.rl)return;const L=rlv(P,'pyre');if(!L)return;const f4=P.S.rl.sp.fire4?1.25:1;const x=m.x,y=m.y;fx(inst,{k:'boom',x:r1(x),y:r1(y),r:34*f4,c:1});later(inst,0.12,()=>{if(P.inst===inst)aoe(inst,P,x,y,34*f4,0.4+L*0.3,{relic:1,el:'fire'});});}
function relicDodge(inst,P){if(!P.S||!P.S.rl)return;let L;if((L=rlv(P,'nightveil')))buff(P,'dmg',L*0.08,1.5+0.35);
  if((L=rlv(P,'flametrail'))){later(inst,0.33,()=>{if(P.inst!==inst||P.downed)return;const x=P.x,y=P.y;fx(inst,{k:'boom',x:r1(x),y:r1(y),r:30,c:1});aoe(inst,P,x,y,30,0.8+L*0.4,{relic:1,el:'fire'});});}}
function relicHurt(inst,P){if(!P.S||!P.S.rl||P.downed)return;const L=rlv(P,'icenova');if(L&&R()<L*0.08&&!(P.novaT>inst.time)){P.novaT=inst.time+1.2;const x=P.x,y=P.y;fx(inst,{k:'ring',x:r1(x),y:r1(y),r:50,c:'c',c2:'w'});aoe(inst,P,x,y,50,0.5+L*0.25,{relic:1,slow:1.5,el:'ice'});}}
function hitMonster(inst,m,P,mult,o){if(m.dead)return;o=o||{};if(m.mirrorOf){mirrorHit(inst,m,P,mult,o);return;}if(m.pvp){pvpHit(inst,m,P,mult,o);return;}
  if(m.fake){if(P&&P.ch&&(!m.rflT||inst.time-m.rflT>0.3)){m.rflT=inst.time;m.flash=0.15;fx(inst,{k:'txt',x:r1(m.x),y:r1(m.y-26),s:'허상! 피해 반사',c:'#c9a0e8'});hurtPlayer(inst,P,P.S.maxHp*0.02*clamp(mult,0.5,2),m,{what:'허상의 반사',noMit:1});}return;}
  if(m.type==='shadow'&&m.sa){m.sa.dmgIn=(m.sa.dmgIn||0)+1;if(m.drT&&inst.time<m.drT)mult*=0.3;}
  const pos=(m.boss||m.ctrable)?bossSide(m,P):0;
  if(m.cwEnd&&inst.time<m.cwEnd+CTR_GRACE&&(o.ctr||inst._ctr)&&!m.hidden){const cp=o.px!=null?bossSide(m,{x:o.px,y:o.py}):pos;if(cp===1)counterHit(inst,m,P);else if(!P._ctrWarn||inst.time-P._ctrWarn>0.8){P._ctrWarn=inst.time;fx(inst,{k:'txt',x:r1(P.x),y:r1(P.y-28),s:'헤드에서 쳐야 해요!',c:'#ffb03a'});}}
  if(inst._um)mult*=inst._um;if(m.grog>inst.time)mult*=1.3;if(m.lmarkT>inst.time)mult*=1.25;if(pos===-1)mult*=1.1;if(m.hidden)return;if(m.invul>0){if(!o.dotHit&&R()<0.3)fx(inst,{k:'txt',x:r1(m.x),y:r1(m.y-(m.boss?34:18)),s:'무적',c:'#9e937a'});return;}if(inst.field&&m.fs&&fieldDuelBlock(m,P)){if(R()<0.3)fx(inst,{k:'txt',x:r1(m.x),y:r1(m.y-34),s:'결투 중',c:'#9e937a'});return;}if(m.vuln>0)mult*=2;if(P.S&&P.S.rl&&P.S.rl.sp.frost4&&m.slow>0)mult*=1.15;if(o.exec&&m.hp<m.maxHp*0.3)mult*=2;if(m.boss&&mythOn(P,'wrath'))mult*=1.2;if(m.boss&&P.S.bossDmg)mult*=1+P.S.bossDmg;/* 전직 효과 */if(m.starT>inst.time)mult*=1.1;if(m.curseT>inst.time)mult*=1.15;if(P.S.adv==='berserker'){const lost=1-P.hp/Math.max(1,P.S.maxHp);mult*=1+Math.min(0.4,lost*0.6);}if(P.combo&&inst._sk&&P.comboT>inst.time)mult*=1+0.06*P.combo;if(o.dotHit&&P.S.dotMul)mult*=P.S.dotMul;if(inst.raid&&RAIDX[inst.raid.id].dmgMod)mult*=RAIDX[inst.raid.id].dmgMod(inst,m,P);if(m.brk>inst.time)mult*=1.15;if(P.ch&&P.ch.cls==='gunner'){if((P.steam||0)>=70)mult*=1+(P.S.hiP||0.1);if(o.boom&&P.S.boomMul)mult*=P.S.boomMul;}const r=rollDmg(P,mult);if(o.fcrit&&!r.crit){r.crit=true;r.d=Math.round(r.d*P.S.critMul);}let v=r.d;if(m.shV>0&&m.shT>0){const ab=Math.min(m.shV,v);m.shV-=ab;v-=ab;if(v<=0){if(R()<0.4)fx(inst,{k:'txt',x:r1(m.x),y:r1(m.y-20),s:'보호막',c:'#8fd0ff'});return;}}const real=Math.min(v,m.hp);m.hp-=v;m.flash=0.09;if(!m.alert)alertPack(inst,m);
  addMeter(inst,P,'dmg',real);{const src=o.src||inst._src||'etc';anAdd(P,src,v,r.crit,o.dotHit);if(P.S.exoHeal&&real>0&&P.ch){let lo=null;for(const q of livingPlayers(inst))if(!lo||q.hp/q.S.maxHp<lo.hp/lo.S.maxHp)lo=q;if(lo&&lo.hp<lo.S.maxHp)healPlayer(inst,lo,real*P.S.exoHeal,P);}
  if(inst.raid){const A=inst.raid.an||(inst.raid.an={});const a=A[P.id]||(A[P.id]={});a[src]=(a[src]||0)+v;if(inst.raid.gm)gmHit(inst,m,P,real);}}const el=o.el||inst._el||baseEl(P);fx(inst,{k:'dmg',x:r1(m.x),y:r1(m.y-(m.boss?32:17)),v,c:o.dotHit?2:r.crit?1:0,e:SH.EL_LIST.indexOf(el),p:P.id,id:m.id,sk:inst._sk?1:0});
  if(o.slow)m.slow=Math.max(m.slow,o.slow);if(o.stun)m.stun=Math.max(m.stun,m.boss?o.stun*0.25:o.stun);
  if(o.dot){m.dots=m.dots||[];m.dots.push({pid:P.id,src:o.src||inst._src||null,per:o.dot.mult/(o.dot.dur*2),n:Math.round(o.dot.dur*2),t:0.5,c:o.dot.c||'r'});}
  if(m.type==='goblin'&&R()<0.3)addDrop(inst,{kind:'gold',owner:P.id,amt:Math.max(1,Math.round(ri(2,5)*inst.floor*BAL.gold))},m.x,m.y);
  if(m.dummy){m.hp=m.maxHp;const w=P.dps||(P.dps={t0:inst.time,last:0,tot:0,win:[]});if(inst.time-w.last>4){w.t0=inst.time;w.tot=0;w.win=[];}w.last=inst.time;w.tot+=v;w.win.push([inst.time,v]);return;}
  if(o.kb&&!m.boss){const a=Math.atan2(m.y-P.y,m.x-P.x);SH.moveEnt(inst.map,m,Math.cos(a)*o.kb,Math.sin(a)*o.kb);}
  if((P.S.ls||bOn(P,'lsb'))&&!P.downed)P.hp=Math.min(P.S.maxHp,P.hp+real*(P.S.ls+bOn(P,'lsb')*100)/100);if(bOn(P,'god')&&!P.downed)P.hp=Math.min(P.S.maxHp,P.hp+real*0.05);
  if(r.crit&&!o.myth&&!o.dotHit&&m.hp>0)mythCrit(inst,m,P,v);
  if(inst._sk&&!o.dotHit&&P.S.set3&&P.S.set3.includes('bell')&&!(P.bellT>inst.time)&&!m.dummy){P.bellT=inst.time+5;const x=P.x,y=P.y;fx(inst,{k:'bell',c:4,x:r1(x),y:r1(y)});fx(inst,{k:'ring',x:r1(x),y:r1(y),r:60,c:'y',c2:'g'});later(inst,0.05,()=>{if(P.inst===inst)aoe(inst,P,x,y,60,1.5,{kb:4,myth:1});});}
  if(P.S&&P.S.rl&&P.ch)relicHit(inst,m,P,mult,o);
  if(m.hp<=0)killMonster(inst,m,P);}
function hurtPlayer(inst,P,d,src,o){o=o||{};if(P.downed||P.inst!==inst)return;if(bOn(P,'hdance'))return;if(P.awkInv>inst.time){if(inst.time-(P.awkInvTx||0)>0.4){P.awkInvTx=inst.time;fx(inst,{k:'txt',x:r1(P.x),y:r1(P.y-18),s:'무적',c:'#ffd35a'});}return;}
  if(P.dodgeT>0&&!o.nododge){fx(inst,{k:'txt',x:r1(P.x),y:r1(P.y-18),s:'회피',c:'#8fd0ff'});return;}
  let keep=1-SH.dmgReduce(P.S,inst.floor);if(inst.raid){const bs=['red','wred','tred'].filter(k=>bOn(P,k)>0&&P.buffs[k+'S']&&P.buffs[k+'S']!==P.id);if(bs.length){const f=bs.reduce((a,k)=>a*(1-bOn(P,k)),1);const src=players.get(P.buffs[bs[0]+'S']);if(src&&src.inst===inst){const s=rst(inst,src);if(s)s.mit+=d*keep*(1-f);}}}keep*=1-bOn(P,'red');keep*=1-bOn(P,'wred');keep*=1-bOn(P,'tred');keep*=1-(P.S.dr||0);keep*=1-synMods(inst,P).dr;if(P.S.rl){const bl=P.S.rl.on.beacon|0;if(bl&&livingPlayers(inst).some(q=>q!==P&&Math.hypot(q.x-P.x,q.y-P.y)<80))keep*=1-bl*0.03;}
  let v=Math.max(1,Math.round(d*keep*rf(0.9,1.1)));
  if(P.shield>0){const ab=Math.min(P.shield,v);P.shield-=ab;v-=ab;const by=players.get(P.shieldBy);if(by&&by.inst===inst)addMeter(inst,by,'shield',ab);fx(inst,{k:'txt',x:r1(P.x),y:r1(P.y-24),s:String(ab),c:'#bfe3ff'});}
  if(v<=0)return;
  addMeter(inst,P,'taken',Math.min(v,P.hp));P.hp-=v;if(inst.raid&&inst.raid.gm)gmHurt(inst,P,v);fx(inst,{k:'pdmg',id:P.id,v,q:o.quiet?1:0});
  if(src&&src.ea&&!src.dead){if(src.ea&1){P.slowT=Math.max(P.slowT||0,1.6);P.slowV=Math.max(P.slowV||0,0.35);}if(src.ea&4){src.hp=Math.min(src.maxHp,src.hp+v*1.5);}}
  {const dl=P.dlog||(P.dlog=[]);dl.push({n:srcName(inst,src,o),v,t:inst.time});while(dl.length&&inst.time-dl[0].t>10)dl.shift();}
  if(P.S.rl)relicHurt(inst,P);
  if(P.hp<=0&&P.undyT>inst.time){P.hp=1;return;}
  if(P.hp<=0&&P.S.rl&&P.S.rl.sp.lamp4&&!(P.lampUndy>inst.time)){P.lampUndy=inst.time+90;P.hp=Math.round(P.S.maxHp*0.25);P.awkInv=inst.time+1;fx(inst,{k:'txt',x:r1(P.x),y:r1(P.y-30),s:'등불이 지켜 주었다!',c:'#ffd35a'});fx(inst,{k:'revive',id:P.id});return;}
  if(P.hp<=0){const ur=(P.ch.sk&&P.ch.sk.undying)||0;
    if(ur>0&&(P.undyCd||0)<=0){P.hp=Math.round(P.S.maxHp*0.3);P.undyCd=120-8*ur;fx(inst,{k:'txt',x:r1(P.x),y:r1(P.y-30),s:'불굴!',c:'#ffd35a'});fx(inst,{k:'revive',id:P.id});return;}
    P.hp=0;P.downed=true;P.rev=0;P.shield=0;fx(inst,{k:'pdown',id:P.id});sendDeathSum(inst,P);if(!inst.raid||inst.raid.practice)fx(inst,{k:'msg',m:`${P.ch.name}님이 쓰러졌습니다`,c:'#ff6a5a'});}}
function srcName(inst,src,o){if(o&&o.what)return o.what;if(src&&src.type){if(src.bname&&src.boss)return src.bname;if(src.boss||src.type==='boss')return SH.bossOf(src.f||inst.floor).n;if(src.type==='clone')return SH.bossOf(inst.floor).n+' 분신';const en=src.ea?SH.eaffNames(src.ea).join('·')+' ':'';return en+SH.monName(inst.floor,src.type,src.elite,src.id);}return inst.bossId?SH.bossOf(inst.floor).n+'의 패턴':'함정·투사체';}
function sendDeathSum(inst,P){const dl=P.dlog||[];const by=new Map();let tot=0;for(const e of dl){if(inst.time-e.t>10)continue;const r=by.get(e.n)||{n:e.n,v:0,c:0};r.v+=e.v;r.c++;by.set(e.n,r);tot+=e.v;}
  const rows=[...by.values()].sort((a,b)=>b.v-a.v).slice(0,5);const last=dl.length?dl[dl.length-1]:null;const dur=dl.length?Math.max(0.1,inst.time-dl[0].t):0;
  send(P,{t:'dsum',rows,tot,dur:Math.round(dur*10)/10,killer:last?last.n:null,kv:last?last.v:0,maxHp:P.S.maxHp});P.dlog=[];}
function healPlayer(inst,T,amt,src){if(T.downed||T.inst!==inst)return;if(inst.arena&&src&&src.arenaTeam!==T.arenaTeam)return;const real=Math.min(Math.round(amt),T.S.maxHp-Math.ceil(T.hp));T.hp=Math.min(T.S.maxHp,T.hp+amt);if(real>0){addMeter(inst,src,'heal',real);fx(inst,{k:'heal',x:r1(T.x),y:r1(T.y-20),v:real});}}
function gainXP(P,x){P.ch.xp+=x;let up=0;if(P.ch.lvl>=SH.LVL_CAP){capXP(P,x);return;}while(P.ch.lvl<SH.LVL_CAP&&P.ch.xp>=SH.xpFor(P.ch.lvl)){P.ch.xp-=SH.xpFor(P.ch.lvl);P.ch.lvl++;P.ch.pts+=3;P.ch.spts=(P.ch.spts||0)+1;up++;}
  if(up){recalc(P);P.hp=P.S.maxHp;P.mp=P.S.maxMp;if(P.inst)fx(P.inst,{k:'lvl',id:P.id});msg(P,`레벨 ${P.ch.lvl} 달성 · 스탯 +3 (C) · 스킬 포인트 +1 (K)`,'#ffd35a');
    const nu=CLASSES[P.ch.cls].skills.filter(s=>SKILLS[s].lvl>P.ch.lvl-up&&SKILLS[s].lvl<=P.ch.lvl);for(const s of nu)msg(P,`새 스킬 해금: ${SKILLS[s].n}`,'#8fd0ff');
    if(P.ch.lvl>=SH.LVL_CAP){P.ch.xp=0;msg(P,`만렙 ${SH.LVL_CAP} 달성! 이제 장비·강화·세트로 강해집니다 (경험치는 골드·마력 가루로 바뀝니다)`,'#ffd35a');}
    if(P.inst)bcastRoster(P.inst);if(P.party)sendParty(P.party);}markDirty(P);}
function capXP(P,x){const ch=P.ch;if(SH.awkOf(ch)&&(ch.awl|0)<SH.AWL_MAX){ch.awx=(ch.awx|0)+x;let up=0;while((ch.awl|0)<SH.AWL_MAX&&ch.awx>=SH.awNeed(ch.awl)){ch.awx-=SH.awNeed(ch.awl);ch.awl=(ch.awl|0)+1;ch.spts=(ch.spts|0)+1;up++;}if(ch.awl>=SH.AWL_MAX)ch.awx=0;if(up){recalc(P);const W=SH.AWK[ch.adv];if(P.inst){fx(P.inst,{k:'burst',x:r1(P.x),y:r1(P.y),r:60,cs:['#ffffff',W.col,'#ffd35a']});fx(P.inst,{k:'txt',x:r1(P.x),y:r1(P.y-34),s:`각성 레벨 ${ch.awl}!`,c:W.col});}msg(P,`각성 레벨 ${ch.awl} · 각성 포인트 +1 · 스킬 포인트 +1 (스킬 창 [각성] 탭)`,'#ffd35a');}}ch.gold+=Math.max(1,Math.round(x*0.06));while(ch.xp>=2500){ch.xp-=2500;ch.mats.dust++;}markDirty(P);}
function addDrop(inst,o,x,y){let tx=x,ty=y;for(let t=0;t<14;t++){const a=R()*Math.PI*2,r=rf(5,20),nx=x+Math.cos(a)*r,ny=y+Math.sin(a)*r;if(!SH.blocked(inst.map,nx,ny,3)){tx=nx;ty=ny;break;}}
  o.id=inst.did++;o.sx=r1(x);o.sy=r1(y);o.x=r1(tx);o.y=r1(ty);o.born=inst.time;inst.drops.push(o);
  for(const p of instPlayers(inst))if(o.owner==null||o.owner===p.id)send(p,{t:'dadd',d:[o]});return o;}
function remDrop(inst,d){const i=inst.drops.indexOf(d);if(i>=0)inst.drops.splice(i,1);bcast(inst,{t:'drem',id:d.id});}
function killMonster(inst,m,killer){if(m.dummy)return;m.dead=true;m.hp=0;fx(inst,{k:'mdie',id:m.id});if(inst.field&&m.lair!=null)fieldBossKill(inst,m);if(killer&&killer.ch&&killer.S&&killer.S.rl)relicKill(inst,m,killer);if(killer&&killer.ch)mythKill(inst,m,killer);
  if(inst.raid){for(const P of instPlayers(inst))gainXP(P,m.xp);if(m.boss){const X=RAIDX[inst.raid.id];if(X.bossDied&&X.bossDied(inst,m)===false)return;/* 연습 모드: 보스 처치 의뢰·업적에 안 셈 */if(!inst.raid.practice)for(const P of instPlayers(inst)){bump(P,'boss',1);P.ch.bossK=(P.ch.bossK|0)+1;}raidClear(inst,m);}return;}if(killer&&inst.meter&&!m.boss&&!m.summ){const mm=getMeter(inst.meter,killer);if(m.elite)mm.elites++;else mm.kills++;}
  /* 그림자 시련: 보스 전리품 없이 바로 시련 결과로 (예전엔 공짜 재도전마다 보스 전리품이 쏟아졌음) */if(m.boss&&inst.trial){trialWin(inst);return;}
  const f=m.f||inst.floor;const fin=f>=100&&!inst.field;/* 황야(102~114 '층')를 최종 보스(100층)로 착각해 전설 확정·정수 5개가 나오던 문제 */const iL=inst.field?((SH.FIELD_LV[m.reg!=null?m.reg:(m.lair|0)]||SH.FIELD_LV[0])+1):f;if(inst.field&&m.fev!=null){const b=inst.field.bases.find(q=>q.id===m.fev);if(b&&b.ev)b.ev.kills++;}
  for(const P of instPlayers(inst)){if(inst.field&&Math.hypot(P.x-m.x,P.y-m.y)>600)continue;if(inst.field&&!m.summ&&R()<(m.elite?0.08:0.008))relicGain(P,SH.randRelicDrop(R));gainXP(P,m.xp);if(P===killer)P.ch.kills++;const fam=CLASSES[P.ch.cls].fam,own=P.id;
    if(!m.summ){if(m.boss){bump(P,'boss',1);P.ch.bossK=(P.ch.bossK|0)+1;}else{bump(P,'kill',1);if(m.elite)bump(P,'elite',1);}}
    {const th=SH.themeOf(f);if(m.boss)addCdx(P,fin?'b:fin':'b:'+th.idx);else if(m.type==='goblin'){addCdx(P,'gob');stInc(P,'gob');}else if(['zombie','skel','hound'].includes(m.type)&&!m.summ)addCdx(P,`m:${th.idx}:${m.type}`);}
    if(m.type==='goblin'){lootFor(inst,P,m.x,m.y,{items:R()<0.5?2:1,minR:2,gold:8,gems:1});continue;}
    if(m.boss){const th0=SH.themeOf(f);const en=fin?5:th0.corrupt?2:1;P.ch.mats.ess+=en;msg(P,`핏빛 정수 +${en}`,'#ff5a6a');for(let i=0;i<2;i++)addDrop(inst,{kind:'gem',owner:own,g:SH.randGem(f+5)},m.x,m.y);}
    else if(R()<(m.elite?0.2:0.025))addDrop(inst,{kind:'gem',owner:own,g:SH.randGem(f)},m.x,m.y);
    if(m.boss){const th=SH.themeOf(f);const legP=fin?1:BAL.legBase+(th.corrupt?BAL.legCorrupt:0)+f*BAL.legPerFloor;
      for(let i=0;i<3;i++){const leg=i===0&&R()<legP;addDrop(inst,{kind:'item',owner:own,it:leg?SH.genItem(iL+2,fam,3,0,R,3):SH.genItem(iL+2,fam,i===0?2:1,i===0?0:25,R,2)},m.x,m.y);}for(let i=0;i<4;i++)addDrop(inst,{kind:'gold',owner:own,amt:ri(10,20)*f},m.x,m.y);addDrop(inst,{kind:'hp',owner:own},m.x,m.y);}
    else{if(R()<(m.elite?0.9:BAL.dropItem))addDrop(inst,{kind:'item',owner:own,it:SH.genItem(iL+(m.elite?1:0),fam,m.elite?1:0,m.elite?8:0,R,2)},m.x,m.y);
      if(R()<.35)addDrop(inst,{kind:'gold',owner:own,amt:Math.max(1,Math.round(ri(2,6)*f*(m.elite?3:1)*BAL.gold))},m.x,m.y);if(R()<BAL.dropHp)addDrop(inst,{kind:'hp',owner:own},m.x,m.y);if(R()<BAL.dropMp)addDrop(inst,{kind:'mp',owner:own},m.x,m.y);}}
  if(m.type==='goblin')fx(inst,{k:'msg',m:'보물 고블린을 잡았다! 보물이 쏟아진다',c:'#ffd35a'});
  if(m.altar&&inst.ev)bcastEv(inst);
  if(m.ea&2){for(let i=0;i<2;i++){const x=m.x+rf(-8,8),y=m.y+rf(-8,8);if(SH.blocked(inst.map,x,y,5))continue;const c=spawnMonster(inst,m.type,x,y,false);c.maxHp=c.hp=Math.round(m.maxHp*0.3);c.xp=Math.round(m.xp*0.1);c.summ=true;c.alert=true;fx(inst,{k:'blink',x:r1(x),y:r1(y)});}}
  if(m.ea&32){const x=m.x,y=m.y,dm=m.dmg*2.2;fx(inst,{k:'tele',x:r1(x),y:r1(y),r:42,d:1});later(inst,1,()=>{fx(inst,{k:'boom',x:r1(x),y:r1(y),r:42});fx(inst,{k:'shake',v:3});hitCircle(inst,x,y,42,dm,null,{what:'자폭 정예의 폭발'});});}
  if(m.boss&&inst.trial){trialWin(inst);return;}
  if(m.boss&&inst.field){const th=SH.themeOf(m.f||inst.floor);fx(inst,{k:'bsay',id:m.id,x:r1(m.x),y:r1(m.y),m:(th.t.bl||['…','…','…'])[2]||'…',dead:1});fx(inst,{k:'shake',v:7});return;}
  if(m.boss){{const th=SH.themeOf(inst.floor);fx(inst,{k:'bsay',id:m.id,x:r1(m.x),y:r1(m.y),m:th.final?SH.FINAL_LINES[1]:(SH.BOSS_LINES[th.idx]||th.t.bl||['…','…'])[1],dead:1});}inst.stairsOpen=true;SH.openStairs(inst.map);bcast(inst,{t:'stairs'});fx(inst,{k:'shake',v:7});fx(inst,{k:'msg',m:'보스를 쓰러뜨렸다! 아래로 가는 계단이 열렸다',c:'#ffd35a'});
    const rows=inst.bossMeter?meterRows(inst.bossMeter):[];const res={title:`${m.bname||SH.bossOf(f).n} 처치`,floor:f,time:Math.round(inst.time-inst.bossStart),rows};(inst.bossHist=inst.bossHist||[]).push(res);if(inst.bossHist.length>20)inst.bossHist.shift();bcast(inst,Object.assign({t:'result'},res));inst.bossMeter=null;inst.bossId=null;}}

// ---------- 플레이어 공격/스킬 ----------
function spawnPProj(inst,P,type,a,speed,mult,o){o=o||{};const p={id:inst.pid++,type,owner:'p',pid:P.id,src:inst._src||null,x:P.x+Math.cos(a)*6,y:P.y-2+Math.sin(a)*6,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,mult:mult*(inst._um||1),r:o.r||2,life:o.life||1.3,h:8,pierce:!!o.pierce,hit:new Set(),boom:o.boom||0,dot:o.dot||null,bounce:o.bounce||0,aura:o.aura?Object.assign({},o.aura,{mult:o.aura.mult*(inst._um||1)}):null,slow:o.slow||0,ghost:!!o.ghost,el:inst._el||null,ctr:inst._ctr||null,mir:inst._mir||null,st:o.st||0,gb:o.gb||0,lb:o.lb||0,stun:o.stun||0};inst.projs.push(p);return p;}
function basicAttack(inst,P,a){const C=CLASSES[P.ch.cls];if(P.atkCd>0.06)return;P.atkCd=1/SH.atkSpd(P.ch.cls,P.S.atkRate,atkMul(P));P.face=Math.cos(a)<0?-1:1;
  if(C.basic.kind==='melee'){const dur=clamp(0.3*1.25/SH.atkSpd(P.ch.cls,P.S.atkRate,atkMul(P)),0.12,0.36);fx(inst,{k:'swing',id:P.id,a:r1(a),d:r1(dur)});
    let bh=0;for(const m of inst.monsters){if(m.dead)continue;const dx=m.x-P.x,dy=m.y-(P.y-4),d=Math.hypot(dx,dy);if(d>4+m.r+20)continue;if(d<4+m.r+3||angDiff(Math.atan2(dy,dx),a)<1.15){hitMonster(inst,m,P,C.basic.mult,{kb:3});bh++;}}
    if(P.ch.cls==='knight'){if(bh)addHoly(P,6);if(bOn(P,'excal')){fx(inst,{k:'lwave',x1:r1(P.x),y1:r1(P.y-6),x2:r1(P.x+Math.cos(a)*100),y2:r1(P.y-6+Math.sin(a)*100)});lineHit(inst,P,P.x,P.y,a,100,10,1.0,{});}}
    if(bOn(P,'god')){const gx=P.x+Math.cos(a)*22,gy=P.y+Math.sin(a)*22;fx(inst,{k:'quake',x:r1(gx),y:r1(gy),r:30});aoe(inst,P,gx,gy,30,C.basic.mult*0.7,{kb:5});}}
  else if(C.basic.kind==='gun')gunBasic(inst,P,a);
  else{fx(inst,{k:'shot',id:P.id,a:r1(a)});spawnPProj(inst,P,SH.PROJ_LIST[C.basic.proj],a,C.basic.speed,C.basic.mult);const sh=bOn(P,'shadow');if(sh)for(const o of[-0.14,0.14])spawnPProj(inst,P,SH.PROJ_LIST[C.basic.proj],a+o,C.basic.speed,C.basic.mult*sh);}}
function clampTarget(P,tx,ty,max){const dx=tx-P.x,dy=ty-P.y,d=Math.hypot(dx,dy);if(d<=max)return[tx,ty];return[P.x+dx/d*max,P.y+dy/d*max];}
function partyNear(inst,P,r){if(inst._mir)return [];return livingPlayers(inst).filter(q=>Math.hypot(q.x-P.x,q.y-P.y)<=r&&(!inst.arena||q.arenaTeam===P.arenaTeam));}
function dashTo(inst,P,a,dist){let nx=P.x,ny=P.y;for(let s=dist;s>=0;s-=4){const x=P.x+Math.cos(a)*s,y=P.y+Math.sin(a)*s;if(!SH.blocked(inst.map,x,y,4)&&SH.los(inst.map,P.x,P.y,x,y,3)){nx=x;ny=y;break;}}const ox=P.x,oy=P.y;P.x=nx;P.y=ny;send(P,{t:'tp',x:nx,y:ny});return[ox,oy];}
function aoe(inst,P,x,y,r,mult,o){let n=0;for(const m of inst.monsters)if(!m.dead&&Math.hypot(m.x-x,m.y-y)<r+m.r){hitMonster(inst,m,P,mult,o);n++;}return n;}
function cone(inst,P,a,r,arc,mult,o){for(const m of inst.monsters){if(m.dead)continue;const d=Math.hypot(m.x-P.x,m.y-P.y);if(d<r+m.r&&(d<10||angDiff(Math.atan2(m.y-P.y,m.x-P.x),a)<arc))hitMonster(inst,m,P,mult,o);}}
function addZone(inst,P,o){const z=Object.assign({x:P.x,y:P.y,r:30,t:3,tick:0,iv:0.5,dmg:0,heal:0,slow:0,vis:0,pid:P.id,follow:false,trap:false,ctr:inst._ctr||null,src:inst._src||null,mir:inst._mir||null},o);if(z.mir){z.heal=0;z.revive=0;z.dmgb=0;z.dr=0;}if(inst._um)z.dmg*=inst._um;inst.zones.push(z);}
// 레이드 기믹 힌트: 처음엔 흐릿하게, 실패하거나 오래 못 풀면 조금씩 또렷하게 (0→1→2)
const HINTS={
  bellseq:[()=>'종들이 저마다 한 번씩 울었다… 그 소리를 기억하라',()=>'방금 울린 종소리를 같은 순서로 되울려라',()=>'같은 순서로 종을 치세요! (종 옆에서 F)'],
  bb:[v=>'그레고르가 종소리 뒤에 숨었다… 방 모서리의 종들이 떨고 있다',v=>`모서리의 종 ${v.need}개가 함께 울려야 한다`,v=>`방 모서리 종 ${v.need}개를 ${v.win}초 안에 동시에 치세요 (F)`],
  march:[()=>'망자의 행렬이 몰려온다!',()=>'망자의 행렬이 몰려온다! 줄 사이 어딘가가 비어 있다',()=>'망자의 행렬이 몰려온다! 빈틈으로 지나가세요'],
  mirror:[v=>`거울 ${v.i}/${v.n}: 빛이 길을 잃었다… 수정이 빛을 기다린다`,v=>`거울 ${v.i}/${v.n}: 거울이 향한 쪽으로 빛이 꺾인다`,v=>`거울 ${v.i}/${v.n}: 거울 옆에서 G로 돌려 빛을 수정에 닿게 하세요`],
  marks:[()=>'빛과 그림자의 표식이 새겨졌다… 자매는 서로의 반대를 두려워한다',()=>'표식과 반대인 마녀를 노려라. 표식이 사라질 땐 같은 빛 속에 서라',()=>'빛 표식은 노라를, 그림자 표식은 리라를 공격하세요. 8초 뒤 같은 색 원에 들어가세요'],
  split:[()=>'거울벽이 방을 가른다! 한쪽만 기울면 다른 쪽이 원망한다',()=>'거울벽이 방을 가른다! 두 마녀의 상처가 같아야 한다',()=>'거울벽이 방을 가른다! 양쪽 마녀의 체력을 비슷하게 맞추세요 (20초)'],
  clockpz:[v=>`태엽 장치 ${v.i}/${v.n}: 등불들은 이웃과 함께 깜빡인다`,v=>`태엽 장치 ${v.i}/${v.n}: 레버 하나가 제 등불과 양옆을 함께 뒤집는다`,v=>`태엽 장치 ${v.i}/${v.n}: 레버(F)는 자기와 양옆 등불을 바꿉니다. 등불을 모두 켜세요`],
  plates:[v=>'증기 보호막! 바닥의 판들이 무게를 기다린다',v=>`증기 보호막! 판 ${v.need}개가 한꺼번에 눌려야 한다`,v=>`증기 보호막! 압력판 ${v.need}개를 동시에 밟고 버티세요`],
  moonpz:[v=>`달의 제단 ${v.i}/${v.n}: ${v.rev?'이번엔 달이 거꾸로 흐른다…':'달은 차오르고 이지러진다…'}`,v=>`달의 제단 ${v.i}/${v.n}: ${v.rev?'달이 이지러지는 순서대로':'달이 차오르는 순서대로'} 제단을 깨워라`,v=>`달의 제단 ${v.i}/${v.n}: ${v.rev?'보름달부터 그믐 순서로':'초승달부터 보름달 순서로'} 제단을 활성화하세요 (F)`],
  clash:[v=>`격돌! 흑왕이 자세를 취했다 — 누군가 나서야 한다${v.n>1||v.h?' · 실패하면 전멸':''}`,v=>`격돌! 흑왕 곁에서 상호작용 키로 맞서라${v.n>1?` (${v.n}연속 · 실패하면 전멸)`:v.h?' · 실패하면 전멸':''}`,v=>`격돌! 흑왕 곁으로 가서 상호작용 키를 누른 한 사람이 1:1로 맞섭니다 · 바깥 원이 안쪽 원에 겹칠 때 원 안의 키${v.n>1?` (${v.n}연속 · 실패하면 전멸)`:v.h?' · 실패하면 전멸':''}`],
  clones:[()=>'흑왕이 넷으로 갈라졌다! 진짜 칼날은 하나씩 날아든다',()=>'흑왕이 넷으로 갈라졌다! 푸르게 빛나는 분신이 진짜 공격이다',()=>'흑왕이 넷으로 갈라졌다! 파랗게 빛나는 분신을 앞에서 카운터하세요'],
  chain:[v=>`${v.who}이(가) 쇠사슬에 묶였다!`,v=>`${v.who}이(가) 쇠사슬에 묶였다! 사슬이 팽팽해지면 끊어진다`,v=>`${v.who}이(가) 쇠사슬에 묶였다! 멀리 떨어지세요`],
  funeral:[v=>`장례의 종! 관 자리가 ${v.txt||''} 로 나뉘었다… 빈자리도, 넘치는 자리도 용서받지 못한다`,v=>`장례의 종! 원 위의 숫자만큼만 서야 한다 (${v.txt||''})`,v=>`장례의 종! 원마다 적힌 인원이 정확히 서세요 (${v.txt||''}) · 원 밖에 있으면 안 돼요`],
  silence:[()=>'침묵의 종소리… 종이 울리는 동안은 숨도 쉬지 마라',()=>'침묵의 종소리! 종이 울리는 순간 움직이거나 공격하면 끝이다',()=>'침묵의 종소리! 종이 울릴 때(화면이 파랗게) 이동·공격·스킬을 멈추세요'],
  prison:[()=>'거울 감옥! 갇힌 동료의 모습이 비친 거울이 있다',()=>'거울 감옥! 갇힌 사람과 같은 모습이 비친 거울만 깨라 — 다른 거울은 함정이다',()=>'거울 감옥! 갇힌 사람 이름이 비친 거울 옆에서 G로 깨세요 · 틀리면 전멸'],
  chorus:[()=>'자매의 합창이 시작됐다… 한 목소리만 끊으면 다른 목소리가 커진다',()=>'자매의 합창! 두 마녀의 노래를 거의 동시에 끊어야 한다',()=>'자매의 합창! 파티를 둘로 나눠 두 마녀를 동시에 공격하세요 (한쪽이 끊기면 5초 안에 다른 쪽도)'],
  core:[()=>'과열 코어! 방 가장자리의 밸브들이 흔들린다',()=>'과열 코어! 밸브는 각자 하나씩만 돌릴 수 있다',()=>'과열 코어! 흩어져서 한 사람당 밸브 하나씩 G로 돌리세요'],
  gears:[()=>'톱니 행진! 톱니벽이 몰려온다… 흩어진 자에게 틈은 없다',()=>'톱니 행진! 모두 같은 줄에 모여야 벽에 틈이 열린다',()=>'톱니 행진! 파티 전원이 가로 세 줄 중 한 줄에 모이세요'],
  moonfall:[()=>'흑월 강림! 중앙의 불씨를 기둥들에 옮겨라',()=>'흑월 강림! 불씨를 든 채 맞으면 꺼진다 — 기둥에 모두 불을 붙여라',()=>'흑월 강림! 중앙 화로에서 G로 불씨를 들고 기둥에서 G로 점화 · 들고 있을 때 맞지 마세요'],
  eclipse:[()=>'일식! 흑월이 해를 삼킨다… 빛이 남은 곳은 몇 군데뿐',()=>'일식! 바닥의 빛 웅덩이 안에 서 있어야 산다',()=>'일식! 시간이 끝날 때 파티 전원이 빛 웅덩이(금색 원) 안에 있어야 해요 — 보스 공격도 피하면서'],
  absorb:[()=>'흑월 흡수! 흑왕이 달빛을 빨아들인다…',()=>'흑월 흡수! 흑왕을 감싼 보호막을 시간 안에 깨부숴라',()=>'흑월 흡수! 제한 시간 안에 흑왕에게 보호막만큼 피해를 넣어야 해요 — 궁극기를 아끼지 마세요'],
  shadow:[()=>'그림자 대역! 너희 그림자가 흩어졌다… 남의 그림자는 독이다',()=>'그림자 대역! 자기 색의 그림자만 찾아 밟아라',()=>'그림자 대역! 자기 이름이 적힌 그림자를 밟으세요 · 남의 그림자에 닿으면 전멸'],
  beats:[()=>'역격돌! 흑월의 박동에 맞서라',()=>'역격돌! 박동이 금빛 선에 닿는 순간을 노려라',()=>'역격돌! 박자가 선에 닿을 때 F를 누르세요']};
// 레이드에서는 나올 때마다 조금씩 또렷하게, 일반 던전에서는 그대로
function rh(inst,k,arr){if(!inst.raid)return arr[2];const lv=hintLv(inst,k);hintUp(inst,k);return arr[lv];}
function hintLv(inst,k){const h=inst.raid&&inst.raid.hl;return Math.min(2,h?h[k]|0:0);}
function hintUp(inst,k){const r=inst.raid;if(!r)return;const h=r.hl||(r.hl={});if((h[k]|0)>=2)return;h[k]=(h[k]|0)+1;raidState(inst);}
// open: 아직 못 풀었는지 확인 → wait초 뒤 한 단계 또렷하게 다시 알려 줌 / occ: 나올 때마다 조금씩 또렷하게
function hint(inst,k,c,v,o){o=o||{};v=v||{};const lv=hintLv(inst,k);
  // 기믹 컷인: 레이드 한 판에서 그 기믹이 처음 나올 때 한 번만 (다시 알려 주는 힌트에는 없음)
  if(!o._re&&inst.raid){const cu=inst.raid.cut||(inst.raid.cut={});if(!cu[k]){cu[k]=1;fx(inst,{k:'gcut',g:k});}}
  fx(inst,{k:'msg',m:HINTS[k][lv](v),c});
  if(o.occ)hintUp(inst,k);
  if(o.open&&lv<2){const tok=((inst.raid.hTok=inst.raid.hTok||{})[k]=(inst.raid.hTok[k]|0)+1);later(inst,o.wait||20,()=>{if(!inst.raid||inst.raid.hTok[k]!==tok||!o.open())return;hintUp(inst,k);hint(inst,k,c,typeof o.vars==='function'?o.vars():v,Object.assign({},o,{_re:1}));});}}
// 보스 등장·페이즈 카드: 약 3초 동안 보스를 멈추고 무적
function bossCard(inst,ph){const r=inst.raid;if(!r)return;fx(inst,{k:'bintro',r:r.id,p:ph||null});r.cardT=inst.time+3;const bs=inst.monsters.filter(b=>b.boss&&!b.dead&&!b.introFz);for(const b of bs){b.frozen=true;b.invul=99;b.introFz=1;}later(inst,3,()=>{for(const b of bs){if(!b.introFz)continue;b.introFz=0;b.frozen=false;if(b.invul===99)b.invul=0;}});}
/* 전투력 분석기: 스킬별 누적 피해 */
function anAdd(P,src,v,crit,dot){const A=P.an||(P.an={t0:Date.now(),t1:Date.now(),by:{}});const now=Date.now();if(!A.n)A.t0=now;A.n=(A.n|0)+1;A.t1=now;const b=A.by[src]||(A.by[src]={d:0,h:0,c:0,dot:0,mx:0});b.d+=v;b.h++;if(crit)b.c++;if(dot)b.dot+=v;if(v>b.mx)b.mx=v;}
function later(inst,t,f){inst.timers.push({t,f,el:inst._el,ctr:inst._ctr,sk:inst._sk,um:inst._um,src:inst._src,mir:inst._mir||null,foe:inst.arena?CUR_CASTER:null});}
// 타격음 속성: 스킬·투사체·기본 무기별
const SKILL_EL={gshot:'shot',gbuck:'shot',ggren:'blast',grecoil:'shot',gslug:'shot',ggatling:'shot',gkick:'shot',gvent:'blast',gcluster:'blast',grail:'blast',gturret:'shot',steamarmor:'blast',bigbarrage:'blast',siegecannon:'blast',bulletballet:'shot',gmortar:'blast',gscald:'fire',gshell:'blast',gricochet:'shot',gslide:'shot',gfan:'shot',lslash:'slash',flashdash:'slash',lmark:'holy',crossslash:'slash',skyfall:'holy',bladedance:'slash',judgment:'holy',lastflash:'heavy',lightstorm:'holy',radiantspear:'holy',dawnblade:'holy',heavendance:'slash',whirl:'slash',charge:'blunt',cleave:'slash',leap:'quake',rend:'slash',bladestorm:'slash',execute:'heavy',earthsplit:'quake',
  bash:'blunt',hook:'blunt',consecrate:'holy',slam:'quake',shieldthrow:'blunt',bastion:'holy',
  multishot:'arrow',pierce:'arrow',rain:'arrow',trap:'zap',poison:'poison',volley:'arrow',sniper:'heavy',barrage:'arrow',starfall:'holy',
  fireball:'fire',nova:'ice',chain:'zap',meteor:'fire',frostorb:'ice',flamewall:'fire',blizzard:'ice',thunder:'zap',armageddon:'fire',
  smite:'holy',sanctuary:'holy',purify:'holy',holyfire:'fire',lightpillar:'holy',miracle:'holy'};
const PROJ_EL={hammer:'holy',arrow:'arrow',parrow:'arrow',pierce:'arrow',bolt:'zap',holy:'holy',holybeam:'holy',fire:'fire',fireb:'fire',orb:'magic',frostorb:'ice',ice:'ice',poison:'poison',void:'void',shieldp:'blunt',web:'magic',page:'magic',bullet:'shot',pellet:'shot',shell:'blast',slug:'shot'};
function baseEl(P){const C=CLASSES[P.ch.cls];if(C.fam==='bow')return 'arrow';if(C.fam==='gun')return 'shot';if(C.fam==='staff')return P.ch.cls==='priest'?'holy':'magic';const k=P.ch.eq.weapon&&P.ch.eq.weapon.kind;return k==='mace'?'blunt':k==='great'?'heavy':'slash';}
function alive(inst,P){return P&&P.inst===inst&&!P.downed;}
// ---------- 빛의 기사 ----------
function addHoly(P,n){if(!P||P.ch.cls!=='knight')return;P.holy=Math.min(100,(P.holy||0)+n*(P.S.holyGain||1)*(bOn(P,'dawn')?2:1));}
function lineHit(inst,P,x,y,a,len,w,mult,o){const ca=Math.cos(a),sa=Math.sin(a);let n=0;for(const m of inst.monsters){if(m.dead)continue;const dx=m.x-x,dy=m.y-y,t=dx*ca+dy*sa;if(t<-m.r||t>len+m.r)continue;if(Math.abs(-dx*sa+dy*ca)<w+m.r){hitMonster(inst,m,P,mult,o);n++;}}return n;}
function dashHit(inst,P,a,dist,mult,o){const[ox,oy]=dashTo(inst,P,a,dist);const vx=P.x-ox,vy=P.y-oy,L2=vx*vx+vy*vy||1;for(const m of inst.monsters){if(m.dead)continue;const t=clamp(((m.x-ox)*vx+(m.y-oy)*vy)/L2,0,1);if(Math.hypot(ox+vx*t-m.x,oy+vy*t-m.y)<14+m.r)hitMonster(inst,m,P,mult,o);}return[ox,oy];}
// ---------- 플레이어 간 거래 (아이템 최대 6개 + 골드) ----------
const TRADE_MAX=6;
function tradeOther(P){return P.trade?players.get(P.trade.with):null;}
function tradeView(P){const T=tradeOther(P);if(!P.trade||!T||!T.trade)return null;const side=Q=>({items:Q.trade.ids.map(id=>Q.ch.bag.find(it=>it&&it.id===id)).filter(Boolean),gold:Q.trade.gold,lock:Q.trade.lock,ok:Q.trade.ok});return{name:T.ch.name,me:side(P),them:side(T)};}
function tradeSync(P){const T=tradeOther(P);send(P,{t:'trade',st:tradeView(P)});if(T)send(T,{t:'trade',st:tradeView(T)});}
/* 저장을 바로 내려보냄: 창고·거래·버리기는 0.5초 저장 주기 사이에 창을 닫으면 아이템이 복사되거나 사라질 수 있었음 */function saveNow(P){if(!P||!P.ch)return;P.dirty=false;try{checkAch(P);}catch(e){}send(P,{t:'ch',ch:P.ch,S:P.S});}
function cancelTrade(P,why){const T=tradeOther(P);P.trade=null;send(P,{t:'trade',st:null});if(T&&T.trade&&T.trade.with===P.id){T.trade=null;send(T,{t:'trade',st:null});if(why)msg(T,why,'#9e937a');}}
function tradeUnlock(P){const T=tradeOther(P);for(const Q of[P,T])if(Q&&Q.trade){Q.trade.lock=false;Q.trade.ok=false;}}
function doTrade(P,T){const pick=Q=>Q.trade.ids.map(id=>Q.ch.bag.findIndex(it=>it&&it.id===id));const pi=pick(P),ti=pick(T);
  if(pi.includes(-1)||ti.includes(-1)){tradeUnlock(P);tradeSync(P);msg(P,'올린 아이템이 바뀌어 다시 확인해야 해요','#ff6a5a');msg(T,'올린 아이템이 바뀌어 다시 확인해야 해요','#ff6a5a');return;}
  if(P.trade.gold>P.ch.gold||T.trade.gold>T.ch.gold){tradeUnlock(P);tradeSync(P);msg(P,'골드가 부족해 거래할 수 없어요','#ff6a5a');msg(T,'골드가 부족해 거래할 수 없어요','#ff6a5a');return;}
  const free=Q=>Q.ch.bag.filter(x=>!x).length;if(free(P)+pi.length<ti.length){msg(P,'인벤토리 공간이 부족해요','#ff6a5a');msg(T,`${P.ch.name}님의 인벤토리 공간이 부족해요`,'#ff6a5a');tradeUnlock(P);tradeSync(P);return;}
  if(free(T)+ti.length<pi.length){msg(T,'인벤토리 공간이 부족해요','#ff6a5a');msg(P,`${T.ch.name}님의 인벤토리 공간이 부족해요`,'#ff6a5a');tradeUnlock(P);tradeSync(P);return;}
  /* 확인(잠금) 뒤에 올린 아이템을 대장간 등에서 바꿔치기하던 문제 → 잠글 때 모습과 다르면 다시 확인 */const snap=(Q,idx)=>JSON.stringify(idx.map(i=>Q.ch.bag[i]));if(P.trade.snap!==snap(P,pi)||T.trade.snap!==snap(T,ti)){tradeUnlock(P);tradeSync(P);msg(P,'올린 아이템이 바뀌어 다시 확인해야 해요','#ff6a5a');msg(T,'올린 아이템이 바뀌어 다시 확인해야 해요','#ff6a5a');return;}
  const pItems=pi.map(i=>P.ch.bag[i]),tItems=ti.map(i=>T.ch.bag[i]);for(const i of pi)P.ch.bag[i]=null;for(const i of ti)T.ch.bag[i]=null;
  const put=(Q,its)=>{for(const it of its){const k=Q.ch.bag.findIndex(x=>!x);Q.ch.bag[k]=it;}};put(P,tItems);put(T,pItems);
  const pg=P.trade.gold,tg=T.trade.gold;P.ch.gold+=tg-pg;T.ch.gold+=pg-tg;
  P.trade=null;T.trade=null;send(P,{t:'trade',st:null,done:1});send(T,{t:'trade',st:null,done:1});saveNow(P);saveNow(T);
  msg(P,`${T.ch.name}님과 거래를 마쳤습니다`,'#7fd05a');msg(T,`${P.ch.name}님과 거래를 마쳤습니다`,'#7fd05a');}
/* 전직 스킬 보조 */
function nearMon(inst,x,y,r){let T=null,bd=r;for(const m of inst.monsters){if(m.dead||m.hidden||m.dummy&&false)continue;const d=Math.hypot(m.x-x,m.y-y)-m.r;if(d<bd){bd=d;T=m;}}return T;}
function trapCap(inst,P){const cap=P.S.adv==='trapper'?5:3;const mine=inst.zones.filter(z=>z.trap&&z.pid===P.id);while(mine.length>=cap){inst.zones.splice(inst.zones.indexOf(mine.shift()),1);}}
// ---------- 증기총사 ----------
/* 증기압: 기본 공격 명중·스킬로 차오름 · 70 이상 고압(피해 +10%) · 100이 되면 과열 분출(주변 150%) 후 40으로 */
function addSteam(inst,P,n){if(!P||!P.ch||P.ch.cls!=='gunner'||P.inst!==inst)return;P.steam=Math.min(100,(P.steam||0)+n*(P.S.steamGain||1)*(bOn(P,'odrive')?2:1));
  if(P.steam>=100&&!(P.ovhT>inst.time)){P.ovhT=inst.time+0.6;P.steam=40;const x=P.x,y=P.y;fx(inst,{k:'gvent',x:r1(x),y:r1(y),r:46,ring:1,s:100});fx(inst,{k:'txt',x:r1(x),y:r1(y-30),s:'과열 분출!',c:'#ffb03a'});fx(inst,{k:'shake',v:3});
    const pe=inst._el,ps=inst._src;inst._el='blast';inst._src='gvent';try{aoe(inst,P,x,y,46,1.5,{kb:8,boom:1});}finally{inst._el=pe;inst._src=ps;}}}
/* 총포 폭발: 크기(s 0~3)에 따라 소리·화면 흔들림이 커진다 */
function gBoom(inst,P,x,y,r,mult,o){o=o||{};r*=(P.S.boomR||1);const s=o.s!=null?o.s:r>50?2:r>30?1:0;fx(inst,{k:'gboom',x:r1(x),y:r1(y),r:Math.round(r),s});fx(inst,{k:'shake',v:o.sh||[1.5,2.5,5,8][s]});
  const pe=inst._el;inst._el='blast';try{return aoe(inst,P,x,y,r,mult,{kb:o.kb||4,stun:o.stun||0,boom:1});}finally{inst._el=pe;}}
function gunBasic(inst,P,a){const w=P.ch.eq.weapon;const kind=w&&w.fam==='gun'?w.kind:'rifle';const m0=CLASSES.gunner.basic.mult;const pe=inst._el;inst._el='shot';
  try{if(kind==='pistol'){fx(inst,{k:'gfire',id:P.id,a:r1(a),g:'p'});for(const o of[-0.16,0,0.16])spawnPProj(inst,P,'pellet',a+o+rf(-0.03,0.03),430,m0*0.42,{life:0.42,st:1.5});}
    else if(kind==='handcannon'){fx(inst,{k:'gfire',id:P.id,a:r1(a),g:'c'});inst._el='blast';spawnPProj(inst,P,'shell',a,320,m0*0.85,{boom:18,life:0.6,lb:1,gb:1,st:4});}
    else{fx(inst,{k:'gfire',id:P.id,a:r1(a),g:'r'});spawnPProj(inst,P,'bullet',a,500,m0,{life:0.7,st:4});}
    if(bOn(P,'sarmor')){inst._el='blast';spawnPProj(inst,P,'shell',a+rf(-0.05,0.05),340,0.8,{boom:22,life:0.55,lb:1,gb:1});}}finally{inst._el=pe;}}
function nearFoe(inst,P,r,a,arc){let T=null,bd=r;for(const m of inst.monsters){if(m.dead||m.hidden||!foe(inst,P,m))continue;const d=Math.hypot(m.x-P.x,m.y-P.y);if(d<bd&&(a==null||d<12||angDiff(Math.atan2(m.y-P.y,m.x-P.x),a)<arc)){bd=d;T=m;}}return T;}
const SK={
  // ----- 증기총사 -----
  gshot(inst,P,a,tx,ty,k){for(let i=0;i<3;i++)later(inst,i*0.08,()=>{if(!alive(inst,P))return;const aa=a+rf(-0.035,0.035);fx(inst,{k:'gfire',id:P.id,a:r1(aa),g:'r',n:i});spawnPProj(inst,P,'bullet',aa,520,0.85*k,{life:0.7});});addSteam(inst,P,9);},
  gbuck(inst,P,a,tx,ty,k){fx(inst,{k:'gfire',id:P.id,a:r1(a),g:'p',big:1});fx(inst,{k:'gcone',x:r1(P.x),y:r1(P.y),a:r1(a),r:60});cone(inst,P,a,60,0.55,2.2*k,{kb:10});dashTo(inst,P,a+Math.PI,10);addSteam(inst,P,12);},
  ggren(inst,P,a,tx,ty,k){[tx,ty]=clampTarget(P,tx,ty,170);const d=0.22+Math.hypot(tx-P.x,ty-P.y)/520;fx(inst,{k:'gfire',id:P.id,a:r1(a),g:'c'});fx(inst,{k:'glob',x1:r1(P.x),y1:r1(P.y-6),x2:r1(tx),y2:r1(ty),d:r1(d)});later(inst,d,()=>{if(P.inst!==inst)return;gBoom(inst,P,tx,ty,38,2.4*k,{kb:6});});addSteam(inst,P,10);},
  grecoil(inst,P,a,tx,ty,k){fx(inst,{k:'gfire',id:P.id,a:r1(a),g:'p',big:1});fx(inst,{k:'gcone',x:r1(P.x),y:r1(P.y),a:r1(a),r:56});cone(inst,P,a,56,0.6,1.8*k,{kb:8});const[ox,oy]=dashTo(inst,P,a+Math.PI,80);fx(inst,{k:'gleap',x1:r1(ox),y1:r1(oy),x2:r1(P.x),y2:r1(P.y)});P.dodgeT=Math.max(P.dodgeT,0.3);addSteam(inst,P,8);},
  gturret(inst,P,a,tx,ty,k){[tx,ty]=clampTarget(P,tx,ty,130);if(SH.blocked(inst.map,tx,ty,4)){tx=P.x;ty=P.y;}const cap=P.S.turrets||1;const mine=inst.zones.filter(z=>z.turret&&z.pid===P.id);while(mine.length>=cap){const o=mine.shift();inst.zones.splice(inst.zones.indexOf(o),1);}
    addZone(inst,P,{x:tx,y:ty,r:150,t:10,iv:0.5,tick:0.45,dmg:0.7*k,vis:40,turret:1,src:'gturret'});fx(inst,{k:'gdeploy',x:r1(tx),y:r1(ty)});},
  gslug(inst,P,a,tx,ty,k){fx(inst,{k:'gfire',id:P.id,a:r1(a),g:'s',big:1});fx(inst,{k:'gtracer',x:r1(P.x),y:r1(P.y-6),x2:r1(P.x+Math.cos(a)*230),y2:r1(P.y-6+Math.sin(a)*230),w:3});const ca=Math.cos(a),sa=Math.sin(a);
    for(const m of inst.monsters){if(m.dead)continue;const dx=m.x-P.x,dy=m.y-P.y,t=dx*ca+dy*sa;if(t<-m.r||t>230+m.r)continue;if(Math.abs(-dx*sa+dy*ca)<10+m.r){hitMonster(inst,m,P,3*k,{kb:6});if(!m.dead){if(!(m.brk>inst.time))fx(inst,{k:'txt',x:r1(m.x),y:r1(m.y-(m.boss?40:24)),s:'파쇄!',c:'#ffb03a'});m.brk=inst.time+6;}}}addSteam(inst,P,12);},
  ggatling(inst,P,a,tx,ty,k){P.slowV=Math.max(P.slowV||0,0.5);P.slowT=Math.max(P.slowT||0,2.1);fx(inst,{k:'ggat',id:P.id,a:r1(a),d:2});for(let i=0;i<20;i++)later(inst,0.05+i*0.1,()=>{if(!alive(inst,P))return;const aa=a+rf(-0.12,0.12);fx(inst,{k:'gfire',id:P.id,a:r1(aa),g:'g',n:i});spawnPProj(inst,P,'bullet',aa,540,0.55*k,{life:0.6});addSteam(inst,P,2);});},
  gkick(inst,P,a,tx,ty,k){const b=nearFoe(inst,P,40,a,1.0);fx(inst,{k:'gkick',id:P.id,a:r1(a)});const pe=inst._el;inst._el='blunt';try{if(b)hitMonster(inst,b,P,1.5*k,{kb:14,stun:0.6});else cone(inst,P,a,30,0.8,1.5*k,{kb:14,stun:0.6});}finally{inst._el=pe;}
    later(inst,0.2,()=>{if(!alive(inst,P))return;fx(inst,{k:'gfire',id:P.id,a:r1(a),g:'p',big:1});fx(inst,{k:'gcone',x:r1(P.x),y:r1(P.y),a:r1(a),r:62});cone(inst,P,a,62,0.5,2.6*k,{kb:8});});addSteam(inst,P,12);},
  gvent(inst,P,a,tx,ty,k){const s=Math.floor(P.steam||0);P.steam=0;const hi=s>=70;fx(inst,{k:'gvent',x:r1(P.x),y:r1(P.y),a:r1(a),r:70,s});fx(inst,{k:'shake',v:2+Math.round(s/25)});cone(inst,P,a,70,0.7,(1.8+0.03*s)*k,{kb:10,stun:hi?1:0,boom:1});},
  gcluster(inst,P,a,tx,ty,k){[tx,ty]=clampTarget(P,tx,ty,190);const d=0.25+Math.hypot(tx-P.x,ty-P.y)/500;fx(inst,{k:'gfire',id:P.id,a:r1(a),g:'c',big:1});fx(inst,{k:'glob',x1:r1(P.x),y1:r1(P.y-6),x2:r1(tx),y2:r1(ty),d:r1(d),big:1});
    later(inst,d,()=>{if(P.inst!==inst)return;gBoom(inst,P,tx,ty,42,2.5*k,{kb:6});for(let i=0;i<6;i++){const q=i/6*Math.PI*2+rf(-0.3,0.3),rr=rf(28,54);const bx=tx+Math.cos(q)*rr,by=ty+Math.sin(q)*rr*0.8;const dt=0.28+i*0.07;fx(inst,{k:'glob',x1:r1(tx),y1:r1(ty),x2:r1(bx),y2:r1(by),d:r1(dt),sm:1});later(inst,dt,()=>{if(P.inst!==inst)return;gBoom(inst,P,bx,by,22,1.3*k,{kb:3});});}});addSteam(inst,P,15);},
  goverdrive(inst,P,a,tx,ty,k,rank){buff(P,'as',0.3,10);buff(P,'sdmg',0.2+0.015*((rank|0)-1),10);buff(P,'odrive',1,10);fx(inst,{k:'godrive',id:P.id,d:10});},
  grail(inst,P,a,tx,ty,k){P.rootT=Math.max(P.rootT||0,0.5);fx(inst,{k:'grailc',id:P.id,a:r1(a),d:0.5});later(inst,0.5,()=>{if(!alive(inst,P))return;fx(inst,{k:'grail',id:P.id,x:r1(P.x),y:r1(P.y-6),a:r1(a),len:260});fx(inst,{k:'shake',v:5});lineHit(inst,P,P.x,P.y,a,260,12,3.8*k,{kb:8});dashTo(inst,P,a+Math.PI,10);addSteam(inst,P,20);});},
  steamarmor(inst,P){buff(P,'sarmor',1,12);buff(P,'sdmg',0.25,12);buff(P,'red',0.3,12);fx(inst,{k:'garmor',id:P.id,d:12});later(inst,0.35,()=>{if(P.inst!==inst)return;gBoom(inst,P,P.x,P.y,70,4,{kb:12,s:3,sh:9});});},
  bigbarrage(inst,P,a,tx,ty){[tx,ty]=clampTarget(P,tx,ty,200);fx(inst,{k:'gbarrage',x:r1(tx),y:r1(ty),d:3.4});
    for(let i=0;i<8;i++)later(inst,0.4+i*0.25,()=>{if(P.inst!==inst)return;const c=inst.monsters.filter(m=>!m.dead&&!m.hidden&&Math.hypot(m.x-tx,m.y-ty)<110);let x=tx+rf(-60,60),y=ty+rf(-40,40);if(c.length){const m=c[(R()*c.length)|0];x=m.x+rf(-6,6);y=m.y+rf(-6,6);}fx(inst,{k:'gshellfall',x:r1(x),y:r1(y),d:0.35});later(inst,0.35,()=>{if(P.inst!==inst)return;gBoom(inst,P,x,y,34,3,{kb:5});});});
    later(inst,2.8,()=>{if(P.inst!==inst)return;fx(inst,{k:'gshellfall',x:r1(tx),y:r1(ty),d:0.55,big:1});later(inst,0.55,()=>{if(P.inst!==inst)return;gBoom(inst,P,tx,ty,72,7,{kb:12,stun:1.5,s:3,sh:11});});});},
  siegecannon(inst,P,a,tx,ty){P.rootT=Math.max(P.rootT||0,2.6);fx(inst,{k:'gsiege',id:P.id,x:r1(P.x),y:r1(P.y),a:r1(a),d:2.8});fx(inst,{k:'sv',s:'siege',x:r1(P.x),y:r1(P.y),a:r1(a),d:2.8});
    for(let i=0;i<5;i++)later(inst,0.55+i*0.42,()=>{if(P.inst!==inst)return;const T=nearFoe(inst,P,240,a,0.6);const x=T?T.x:P.x+Math.cos(a)*170,y=T?T.y:P.y+Math.sin(a)*170;const aa=Math.atan2(y-P.y,x-P.x);fx(inst,{k:'gfire',id:P.id,a:r1(aa),g:'x',big:2});fx(inst,{k:'sv',s:'siegeshot',x1:r1(P.x+Math.cos(aa)*14),y1:r1(P.y-10+Math.sin(aa)*7),x2:r1(x),y2:r1(y-6),d:0.5});later(inst,0.08,()=>{if(P.inst!==inst)return;fx(inst,{k:'sv',s:'siegeboom',x:r1(x),y:r1(y),r:58,d:1.1});gBoom(inst,P,x,y,58,6,{kb:10,s:3,sh:8});});});},
  bulletballet(inst,P){buff(P,'hdance',1,3.3);P.dodgeT=Math.max(P.dodgeT,3.3);fx(inst,{k:'gballet',id:P.id,d:3.2});fx(inst,{k:'sv',s:'ballet',id:P.id,d:3.2});
    for(let i=0;i<18;i++)later(inst,0.1+i*0.16,()=>{if(P.inst!==inst)return;const c=inst.monsters.filter(m=>!m.dead&&!m.hidden&&foe(inst,P,m)&&Math.hypot(m.x-P.x,m.y-P.y)<160);if(!c.length)return;const m=c[i%c.length];const aa=Math.atan2(m.y-P.y,m.x-P.x);fx(inst,{k:'gfire',id:P.id,a:r1(aa),g:'k',n:i});fx(inst,{k:'sv',s:'tracer2',x1:r1(P.x+Math.cos(aa)*8),y1:r1(P.y-8),x2:r1(m.x),y2:r1(m.y-8),d:0.24});hitMonster(inst,m,P,1.5,{kb:2,el:'shot'});});
    later(inst,3.1,()=>{if(P.inst!==inst)return;fx(inst,{k:'gspin',id:P.id,d:0.5,big:1});fx(inst,{k:'sv',s:'balletfin',x:r1(P.x),y:r1(P.y),d:0.65});fx(inst,{k:'shake',v:7});const pe=inst._el;inst._el='shot';try{aoe(inst,P,P.x,P.y,90,6,{kb:10});}finally{inst._el=pe;}});},
  gmortar(inst,P,a,tx,ty,k){[tx,ty]=clampTarget(P,tx,ty,200);fx(inst,{k:'gfire',id:P.id,a:r1(a),g:'c',up:1});for(let i=0;i<3;i++){const x=tx+rf(-18,18),y=ty+rf(-12,12);const d=0.6+i*0.35;fx(inst,{k:'gshellfall',x:r1(x),y:r1(y),d:r1(d)});later(inst,d,()=>{if(P.inst!==inst)return;gBoom(inst,P,x,y,34,2*k,{kb:5});});}addSteam(inst,P,12);},
  gscald(inst,P,a,tx,ty,k){P.slowV=Math.max(P.slowV||0,0.4);P.slowT=Math.max(P.slowT||0,2.5);fx(inst,{k:'gscald',id:P.id,a:r1(a),d:2.5});for(let i=0;i<10;i++)later(inst,0.1+i*0.25,()=>{if(!alive(inst,P))return;cone(inst,P,a,64,0.5,0.65*k,{slow:1});addSteam(inst,P,2);});},
  gshell(inst,P,a,tx,ty,k){fx(inst,{k:'gfire',id:P.id,a:r1(a),g:'c',big:1});spawnPProj(inst,P,'shell',a,380,3.2*k,{boom:40,life:0.7,lb:1,gb:1,stun:1.5});addSteam(inst,P,12);},
  gricochet(inst,P,a,tx,ty,k){let T=nearFoe(inst,P,230,a,0.6)||nearFoe(inst,P,120);if(!T)return false;fx(inst,{k:'gfire',id:P.id,a:r1(Math.atan2(T.y-P.y,T.x-P.x)),g:'k',big:1});const hit=new Set();let px=P.x,py=P.y-6;
    for(let i=0;i<6;i++)later(inst,0.05+i*0.075,()=>{if(P.inst!==inst||!T||T.dead)return;const m=T;fx(inst,{k:'gtracer',x:r1(px),y:r1(py),x2:r1(m.x),y2:r1(m.y-6),w:i===5?2:1});fx(inst,{k:'gric',x:r1(m.x),y:r1(m.y-6),n:i});hitMonster(inst,m,P,0.7*(1+0.15*i)*k,{kb:1});hit.add(m.id);px=m.x;py=m.y-6;
      if(i===5){gBoom(inst,P,m.x,m.y,22,1.2*k,{kb:3});return;}let nx=null,nd=110;for(const o of inst.monsters){if(o.dead||o.hidden||hit.has(o.id)||!foe(inst,P,o))continue;const d=Math.hypot(o.x-m.x,o.y-m.y);if(d<nd){nd=d;nx=o;}}T=nx||(m.dead?null:m);});addSteam(inst,P,12);},
  gslide(inst,P,a,tx,ty,k){const[ox,oy]=dashTo(inst,P,a,100);P.dodgeT=Math.max(P.dodgeT,0.35);fx(inst,{k:'gslide',x1:r1(ox),y1:r1(oy),x2:r1(P.x),y2:r1(P.y)});for(let i=0;i<4;i++)later(inst,0.05+i*0.07,()=>{if(!alive(inst,P))return;const T=nearFoe(inst,P,170);const aa=T?Math.atan2(T.y-P.y,T.x-P.x):a;fx(inst,{k:'gfire',id:P.id,a:r1(aa),g:'k',n:i});spawnPProj(inst,P,'bullet',aa,560,1.1*k,{life:0.5});});addSteam(inst,P,10);},
  gfan(inst,P,a,tx,ty,k){const T=nearFoe(inst,P,200);if(!T)return false;for(let i=0;i<6;i++)later(inst,i*0.07,()=>{if(!alive(inst,P)||T.dead)return;const aa=Math.atan2(T.y-P.y,T.x-P.x);fx(inst,{k:'gfire',id:P.id,a:r1(aa),g:'k',n:i});fx(inst,{k:'gtracer',x:r1(P.x),y:r1(P.y-6),x2:r1(T.x),y2:r1(T.y-6),w:i===5?2:1});hitMonster(inst,T,P,(i===5?2:0.85)*k,{kb:1,fcrit:i===5});});addSteam(inst,P,12);},
  // ================= 전직 스킬 =================
  // 광전사
  bfrenzy(inst,P,a,tx,ty,k){const low=P.hp<P.S.maxHp*0.5?1.4:1;for(let i=0;i<3;i++)later(inst,i*0.13,()=>{if(!alive(inst,P))return;fx(inst,{k:'swing',id:P.id,a:r1(a+(i-1)*0.35),d:0.18});fx(inst,{k:'cleave',x:r1(P.x),y:r1(P.y),a:r1(a+(i-1)*0.3),s:1});fx(inst,{k:'sv',s:'crimslash',x:r1(P.x),y:r1(P.y),a:r1(a+(i-1)*0.5),d:0.24});cone(inst,P,a,40,0.9,1.2*k*low,{kb:2});});},
  bloodroar(inst,P,a,tx,ty,k){fx(inst,{k:'sv',s:'roar',x:r1(P.x),y:r1(P.y),r:62,d:0.85});fx(inst,{k:'sfx',n:'shout'});fx(inst,{k:'shake',v:3});aoe(inst,P,P.x,P.y,56,1.6*k,{kb:6});buff(P,'lsb',0.12,8);},
  rampage(inst,P,a,tx,ty,k){for(let i=0;i<3;i++)later(inst,i*0.22,()=>{if(!alive(inst,P))return;const ox=P.x,oy=P.y;dashHit(inst,P,a,52,1.4*k,{kb:5});fx(inst,{k:'dash',x1:r1(ox),y1:r1(oy),x2:r1(P.x),y2:r1(P.y)});fx(inst,{k:'sv',s:'rampdash',x1:r1(ox),y1:r1(oy),x2:r1(P.x),y2:r1(P.y),d:0.4});send(P,{t:'tp',x:P.x,y:P.y});});},
  // 검성
  flurry(inst,P,a,tx,ty,k){for(let i=0;i<5;i++)later(inst,i*0.07,()=>{if(!alive(inst,P))return;const aa=a+rf(-0.15,0.15);fx(inst,{k:'kslash',x1:r1(P.x+Math.cos(aa)*44),y1:r1(P.y-8+Math.sin(aa)*44),x2:r1(P.x),y2:r1(P.y-8)});fx(inst,{k:'sv',s:'qslash',x:r1(P.x),y:r1(P.y),a:r1(a+(i%2?0.5:-0.5)+rf(-0.2,0.2)),d:0.17});cone(inst,P,a,46,0.35,0.55*k,{});});},
  iaido(inst,P,a,tx,ty,k){const st=P.comboT>inst.time?(P.combo|0):0;P.comboEat=1;P.rootT=Math.max(P.rootT,0.4);fx(inst,{k:'tele',x:r1(P.x+Math.cos(a)*50),y:r1(P.y+Math.sin(a)*50),r:12,d:0.4,c:'c'});fx(inst,{k:'sv',s:'iaicharge',id:P.id,a:r1(a),d:0.4});
    later(inst,0.4,()=>{if(!alive(inst,P))return;fx(inst,{k:'lspear',x:r1(P.x),y:r1(P.y-6),a:r1(a),len:120});fx(inst,{k:'sv',s:'iaido',x:r1(P.x),y:r1(P.y),a:r1(a),len:120,d:0.6});fx(inst,{k:'shake',v:4+st});lineHit(inst,P,P.x,P.y,a,120,12,3.2*k*(1+0.2*st),{kb:8});if(st>=3)fx(inst,{k:'txt',x:r1(P.x),y:r1(P.y-30),s:`발도 · ${st}연격!`,c:'#bfe3ff'});});},
  parry(inst,P,a,tx,ty,k){P.dodgeT=Math.max(P.dodgeT,1.2);fx(inst,{k:'sv',s:'parrystance',id:P.id,d:1.2});fx(inst,{k:'sfx',n:'shield'});later(inst,1.2,()=>{if(!alive(inst,P))return;fx(inst,{k:'whirl',id:P.id});fx(inst,{k:'sv',s:'parrywhirl',x:r1(P.x),y:r1(P.y),d:0.45});aoe(inst,P,P.x,P.y,44,2.2*k,{kb:8});});},
  // 철벽
  aegislink(inst,P,a,tx,ty,k){fx(inst,{k:'shieldfx',x:r1(P.x),y:r1(P.y)});fx(inst,{k:'sv',s:'aegis',x:r1(P.x),y:r1(P.y),r:90,d:0.95});for(const q of partyNear(inst,P,130)){q.shield=Math.max(q.shield,Math.round(q.S.maxHp*0.18*k));q.shieldT=6;q.shieldBy=P.id;fx(inst,{k:'shieldfx',x:r1(q.x),y:r1(q.y)});}},
  bigtaunt(inst,P){fx(inst,{k:'taunt',x:r1(P.x),y:r1(P.y)});fx(inst,{k:'sv',s:'taunt',x:r1(P.x),y:r1(P.y),r:150,d:0.85});buff(P,'tred',0.3,6);for(const m of inst.monsters)if(!m.dead&&Math.hypot(m.x-P.x,m.y-P.y)<160){m.taunt={pid:P.id,t:6};m.tgt=P;if(!m.alert)alertPack(inst,m);}},
  guardleap(inst,P,a,tx,ty,k){let T=null,bd=220;for(const q of partyNear(inst,P,240)){if(q===P)continue;const d=Math.hypot(q.x-tx,q.y-ty);if(d<bd){bd=d;T=q;}}const gx=T?T.x:tx,gy=T?T.y:ty;const [cx,cy]=clampTarget(P,gx,gy,200);const aa=Math.atan2(cy-P.y,cx-P.x);const ox=P.x,oy=P.y;dashTo(inst,P,aa,Math.max(0,Math.hypot(cx-P.x,cy-P.y)-10));
    fx(inst,{k:'leap',x1:r1(ox),y1:r1(oy),x2:r1(P.x),y2:r1(P.y)});send(P,{t:'tp',x:P.x,y:P.y});later(inst,0.2,()=>{if(!alive(inst,P))return;fx(inst,{k:'quake',x:r1(P.x),y:r1(P.y),r:40});fx(inst,{k:'sv',s:'gleap',x:r1(P.x),y:r1(P.y),d:0.6});aoe(inst,P,P.x,P.y,40,1.5*k,{kb:8});if(T&&!T.downed){buff(T,'red',0.4,4);fx(inst,{k:'shieldfx',x:r1(T.x),y:r1(T.y)});}});},
  // 심판자
  hammerthrow(inst,P,a,tx,ty,k){fx(inst,{k:'shot',id:P.id,a:r1(a)});fx(inst,{k:'sv',s:'hthrow',x:r1(P.x),y:r1(P.y),a:r1(a),d:0.25});spawnPProj(inst,P,'hammer',a,240,2.2*k,{pierce:true,r:5,life:1.4});},
  verdict(inst,P,a,tx,ty,k){/* 앞쪽 부채꼴(거리 60 · 좌우 ±0.9rad) 안의 적 전부 */const L=[];for(const m of inst.monsters){if(m.dead||m.hidden)continue;const d=Math.hypot(m.x-P.x,m.y-P.y);if(d<60+m.r&&angDiff(Math.atan2(m.y-P.y,m.x-P.x),a)<0.9)L.push([d,m]);}if(!L.length)return false;L.sort((p,q)=>p[0]-q[0]);
    L.forEach(([d,T],i)=>{if(i<8)fx(inst,{k:'hammer',x:r1(T.x),y:r1(T.y),d:0.25,big:0});});later(inst,0.25,()=>{if(!alive(inst,P))return;L.forEach(([d,T],i)=>{if(T.dead)return;if(i<8){fx(inst,{k:'execute',x:r1(T.x),y:r1(T.y)});fx(inst,{k:'sv',s:'verdict',x:r1(T.x),y:r1(T.y),d:0.6});}hitMonster(inst,T,P,4*k*(T.boss?1.3:1),{kb:10,stun:0.6});});});},
  holyground(inst,P,a,tx,ty,k){fx(inst,{k:'sv',s:'hground',x:r1(P.x),y:r1(P.y),r:50,d:5});addZone(inst,P,{x:P.x,y:P.y,r:50,t:5,iv:0.5,dmg:0.6*k,dr:0.15,vis:5});},
  // 저격수
  aimshot(inst,P,a,tx,ty,k){P.rootT=Math.max(P.rootT,0.8);fx(inst,{k:'teleline',x1:r1(P.x),y1:r1(P.y-6),x2:r1(P.x+Math.cos(a)*300),y2:r1(P.y-6+Math.sin(a)*300),w:4,d:0.8});later(inst,0.8,()=>{if(!alive(inst,P))return;fx(inst,{k:'shot',id:P.id,a:r1(a)});fx(inst,{k:'shake',v:3});fx(inst,{k:'sv',s:'beamshot',x1:r1(P.x),y1:r1(P.y-6),x2:r1(P.x+Math.cos(a)*300),y2:r1(P.y-6+Math.sin(a)*300),d:0.45});spawnPProj(inst,P,'pierce',a,560,6*k,{pierce:true,life:0.8});});},
  weakmark(inst,P,a,tx,ty,k){const T=nearMon(inst,tx,ty,70);if(!T)return false;T.lmarkT=inst.time+8;fx(inst,{k:'lmarkm',ids:[T.id],d:8});fx(inst,{k:'sv',s:'wmark',x:r1(T.x),y:r1(T.y),d:0.55});hitMonster(inst,T,P,1.5*k,{});},
  headshot(inst,P,a,tx,ty,k){const T=nearMon(inst,P.x,P.y,230);if(!T)return false;const aa=Math.atan2(T.y-P.y,T.x-P.x);fx(inst,{k:'shot',id:P.id,a:r1(aa)});fx(inst,{k:'sv',s:'hshot',x1:r1(P.x),y1:r1(P.y-8),x2:r1(T.x),y2:r1(T.y-12),d:0.4});hitMonster(inst,T,P,3*k,{fcrit:1});},
  // 덫 사냥꾼
  bombtrap(inst,P,a,tx,ty,k){[tx,ty]=clampTarget(P,tx,ty,200);trapCap(inst,P);addZone(inst,P,{x:tx,y:ty,r:12,t:30,trap:true,dmg:3*k*(P.S.trapMul||1),br:40,vis:8});fx(inst,{k:'sv',s:'trapset',x:r1(tx),y:r1(ty),c:'#ff8a3a',n:4,d:0.6});fx(inst,{k:'sfx',n:'equip'});},
  nettrap(inst,P,a,tx,ty,k){[tx,ty]=clampTarget(P,tx,ty,200);trapCap(inst,P);addZone(inst,P,{x:tx,y:ty,r:12,t:30,trap:true,dmg:1.5*k*(P.S.trapMul||1),stun:3,slow:3,vis:8});fx(inst,{k:'sv',s:'trapset',x:r1(tx),y:r1(ty),c:'#9be06a',n:6,d:0.6});fx(inst,{k:'sfx',n:'equip'});},
  hawk(inst,P,a,tx,ty,k){fx(inst,{k:'sv',s:'hawk',id:P.id,d:8});addZone(inst,P,{x:P.x,y:P.y,r:70,t:8,iv:0.5,dmg:0.8*k,follow:true,vis:0});fx(inst,{k:'sfx',n:'bow'});},
  // 원소술사
  infernoball(inst,P,a,tx,ty,k){fx(inst,{k:'shot',id:P.id,a:r1(a)});spawnPProj(inst,P,'fire',a,200,3.8*P.S.spell*k,{r:5,life:1.4,boom:50});fx(inst,{k:'sv',s:'castfire',x:r1(P.x),y:r1(P.y),a:r1(a),d:0.35});const sp=P.S.spell;later(inst,0.5,()=>{if(!alive(inst,P))return;});fx(inst,{k:'sfx',n:'fire'});
    const [fx2,fy2]=clampTarget(P,tx,ty,200);later(inst,Math.hypot(fx2-P.x,fy2-P.y)/200,()=>{if(!alive(inst,P))return;addZone(inst,P,{x:fx2,y:fy2,r:40,t:3,iv:0.5,dmg:0.5*sp*k,vis:2});fx(inst,{k:'sv',s:'firepool',x:r1(fx2),y:r1(fy2),r:40,d:3});});},
  glacialspike(inst,P,a,tx,ty,k){fx(inst,{k:'shot',id:P.id,a:r1(a)});fx(inst,{k:'sv',s:'icecast',x:r1(P.x),y:r1(P.y),a:r1(a),d:0.35});spawnPProj(inst,P,'frostorb',a,300,2.6*P.S.spell*k,{pierce:true,slow:2,life:1});},
  elemstorm(inst,P,a,tx,ty,k){[tx,ty]=clampTarget(P,tx,ty,220);fx(inst,{k:'tele',x:r1(tx),y:r1(ty),r:60,d:4,c:'o'});const sp=P.S.spell;for(let i=0;i<10;i++)later(inst,0.2+i*0.4,()=>{if(!P.inst||P.inst!==inst)return;const x=tx+rf(-40,40),y=ty+rf(-26,26);fx(inst,{k:'sv',s:'estrike',x:r1(x),y:r1(y),el:i%2,d:0.45});aoe(inst,P,x,y,30,1.1*sp*k,{});});},
  // 점성술사
  starmark(inst,P,a,tx,ty,k){const ms=inst.monsters.filter(m=>!m.dead&&!m.hidden&&Math.hypot(m.x-tx,m.y-ty)<90).sort((p,q)=>Math.hypot(p.x-tx,p.y-ty)-Math.hypot(q.x-tx,q.y-ty)).slice(0,3);if(!ms.length)return false;
    for(const m of ms){m.starT=inst.time+10;m.starBy=P.id;fx(inst,{k:'sv',s:'starmark',x:r1(m.x),y:r1(m.y),d:0.7});hitMonster(inst,m,P,1.2*P.S.spell*k,{});}fx(inst,{k:'mmark',ids:ms.map(m=>m.id),d:10,sym:'star'});},
  constellation(inst,P,a,tx,ty,k){const ms=inst.monsters.filter(m=>!m.dead&&m.starT>inst.time&&Math.hypot(m.x-P.x,m.y-P.y)<260);if(!ms.length){msg(P,'별 표식이 새겨진 적이 없어요','#9e937a');return false;}const sp=P.S.spell;
    const pts=[[P.x,P.y-8]].concat(ms.map(m=>[m.x,m.y-8]));for(let i=0;i<pts.length-1;i++){fx(inst,{k:'sv',s:'constline',x1:r1(pts[i][0]),y1:r1(pts[i][1]),x2:r1(pts[i+1][0]),y2:r1(pts[i+1][1]),d:0.55});const [x1,y1]=pts[i],[x2,y2]=pts[i+1];const aa=Math.atan2(y2-y1,x2-x1);lineHit(inst,P,x1,y1+8,aa,Math.hypot(x2-x1,y2-y1),10,1.5*sp*k,{});}
    later(inst,0.3,()=>{if(P.inst!==inst)return;for(const m of ms){if(m.dead)continue;m.starT=0;fx(inst,{k:'sv',s:'starburst',x:r1(m.x),y:r1(m.y),r:34,d:0.55});hitMonster(inst,m,P,3*sp*k,{kb:4});}fx(inst,{k:'shake',v:3+ms.length});fx(inst,{k:'mmark',ids:[],d:0,sym:'star'});});},
  starshower(inst,P,a,tx,ty,k){const sp=P.S.spell;for(let i=0;i<10;i++)later(inst,0.2+i*0.5,()=>{if(!alive(inst,P))return;const mk=inst.monsters.filter(m=>!m.dead&&m.starT>inst.time&&Math.hypot(m.x-P.x,m.y-P.y)<260);let x,y;if(mk.length){const m=pick(mk);x=m.x;y=m.y;}else{x=P.x+rf(-90,90);y=P.y+rf(-60,60);}
      fx(inst,{k:'meteor',x:r1(x),y:r1(y),d:0.3});fx(inst,{k:'sv',s:'starfall',x:r1(x),y:r1(y),d:0.32});later(inst,0.3,()=>{if(!P.inst||P.inst!==inst)return;fx(inst,{k:'sv',s:'starburst',x:r1(x),y:r1(y),r:24,d:0.45});aoe(inst,P,x,y,28,1.5*sp*k,{});});});},
  // 대사제
  greatheal(inst,P,a,tx,ty,k){fx(inst,{k:'healburst',x:r1(P.x),y:r1(P.y)});fx(inst,{k:'sv',s:'gheal',x:r1(P.x),y:r1(P.y),r:110,d:1.1});for(const q of partyNear(inst,P,130))healPlayer(inst,q,P.S.healPow*2.2*k,P);},
  lightaegis(inst,P,a,tx,ty,k){fx(inst,{k:'shieldfx',x:r1(P.x),y:r1(P.y)});fx(inst,{k:'sv',s:'laegis',x:r1(P.x),y:r1(P.y),r:110,d:0.95});for(const q of partyNear(inst,P,130)){q.shield=Math.max(q.shield,Math.round(P.S.healPow*1.5*k*(P.S.shieldMul||1)));q.shieldT=6;q.shieldBy=P.id;}},
  resurrect(inst,P,a,tx,ty,k){const ds=instPlayers(inst).filter(q=>q.downed&&q!==P&&(!inst.arena||q.arenaTeam===P.arenaTeam)&&Math.hypot(q.x-P.x,q.y-P.y)<160);if(!ds.length){msg(P,'근처에 쓰러진 동료가 없어요','#9e937a');return false;}
    for(const q of ds){q.downed=false;q.rev=0;q.hp=Math.round(q.S.maxHp*0.5);q.dodgeT=Math.max(q.dodgeT,1.5);fx(inst,{k:'revive',id:q.id});fx(inst,{k:'sv',s:'resur',x:r1(q.x),y:r1(q.y),d:1.4});}fx(inst,{k:'sfx',n:'holy'});},
  // 퇴마사
  curse(inst,P,a,tx,ty,k){const T=nearMon(inst,tx,ty,80);if(!T)return false;T.curseT=inst.time+10;fx(inst,{k:'mmark',ids:[T.id],d:10,sym:'curse'});fx(inst,{k:'sv',s:'curse',x:r1(T.x),y:r1(T.y),d:0.8});hitMonster(inst,T,P,0.5*P.S.spell*k,{dot:{mult:3*P.S.spell*k,dur:10,c:'p'}});},
  exorcise(inst,P,a,tx,ty,k){[tx,ty]=clampTarget(P,tx,ty,200);fx(inst,{k:'smite',x:r1(tx),y:r1(ty)});fx(inst,{k:'sv',s:'exorcise',x:r1(tx),y:r1(ty),d:0.6});for(const m of inst.monsters)if(!m.dead&&Math.hypot(m.x-tx,m.y-ty)<34+m.r)hitMonster(inst,m,P,2.8*P.S.spell*k*(m.curseT>inst.time?1.5:1),{});},
  soulchain(inst,P,a,tx,ty,k){const ms=inst.monsters.filter(m=>!m.dead&&!m.hidden&&Math.hypot(m.x-P.x,m.y-P.y)<120).slice(0,5);if(!ms.length)return false;const sp=P.S.spell;
    for(let i=0;i<10;i++)later(inst,i*0.5,()=>{if(!alive(inst,P))return;const live=ms.filter(m=>!m.dead);if(!live.length)return;{const pts=[[r1(P.x),r1(P.y-8)]].concat(live.map(m=>[r1(m.x),r1(m.y-8)]));fx(inst,{k:'chain',pts});fx(inst,{k:'sv',s:'chainp',pts,x:pts[0][0],y:pts[0][1],d:0.5});}for(const m of live)hitMonster(inst,m,P,0.5*sp*k,{});for(const q of partyNear(inst,P,140))healPlayer(inst,q,P.S.healPow*0.12*k*live.length/3,P);});},
  // 새벽 기사단장
  dawnbanner(inst,P,a,tx,ty,k){fx(inst,{k:'lpillar',x:r1(P.x),y:r1(P.y),r:46});fx(inst,{k:'sv',s:'banner',x:r1(P.x),y:r1(P.y),r:70,d:10});addZone(inst,P,{x:P.x,y:P.y,r:70,t:10,iv:1,heal:P.S.maxHp*0.02*k,dmgb:0.2,vis:5});addHoly(P,10);},
  charge2(inst,P){fx(inst,{k:'warcry',id:P.id});fx(inst,{k:'sv',s:'warhorn',x:r1(P.x),y:r1(P.y),r:110,d:0.9});for(const q of partyNear(inst,P,150))buff(q,'as',0.25,6);addHoly(P,10);},
  radiantslash(inst,P,a,tx,ty,k){fx(inst,{k:'sv',s:'rslash',x:r1(P.x),y:r1(P.y),a:r1(a),r:56,d:0.32});cone(inst,P,a,56,1.1,2.8*k,{kb:5});addHoly(P,12);},
  // 태양검
  solarflare(inst,P,a,tx,ty,k){const h=P.holy|0;P.holy=0;const r=46+h*0.4;fx(inst,{k:'sv',s:'sflare',x:r1(P.x),y:r1(P.y),r:Math.round(r),d:0.7});fx(inst,{k:'shake',v:3+h/20});aoe(inst,P,P.x,P.y,r,(2+h*0.04)*k*1.2,{kb:8});},
  sunpierce(inst,P,a,tx,ty,k){P.rootT=Math.max(P.rootT,0.3);fx(inst,{k:'tele',x:r1(P.x),y:r1(P.y),r:14,d:0.3,c:'y'});later(inst,0.3,()=>{if(!alive(inst,P))return;const ox=P.x,oy=P.y;dashHit(inst,P,a,110,4.5*k,{kb:8});fx(inst,{k:'sv',s:'spierce',x1:r1(ox),y1:r1(oy),x2:r1(P.x),y2:r1(P.y),d:0.5});send(P,{t:'tp',x:P.x,y:P.y});addHoly(P,20);});},
  corona(inst,P,a,tx,ty,k){fx(inst,{k:'sv',s:'corona',id:P.id,r:46,d:6});addZone(inst,P,{x:P.x,y:P.y,r:46,t:6,iv:0.5,dmg:0.9*k,follow:true,vis:0});for(let i=0;i<12;i++)later(inst,i*0.5,()=>{if(alive(inst,P))addHoly(P,3);});},
  // ---------- 전직 궁극기 ----------
  redmoon(inst,P){fx(inst,{k:'ultart',s:'redmoon',pid:P.id,r:70,d:10,spin:0.4});fx(inst,{k:'redsky',d:10});fx(inst,{k:'burst',x:r1(P.x),y:r1(P.y),r:90,cs:['#ff4a3a','#b3282b','#1b0a0a']});fx(inst,{k:'shake',v:8});buff(P,'sdmg',0.5,10);buff(P,'dmg',0.5,10);buff(P,'as',0.4,10);P.undyT=inst.time+4;fx(inst,{k:'god',id:P.id,d:10});},
  thousandcuts(inst,P){fx(inst,{k:'ultart',s:'thousandcuts',pid:P.id,r:66,d:3,spin:6});P.dodgeT=Math.max(P.dodgeT,3);fx(inst,{k:'lstorm',x:r1(P.x),y:r1(P.y),r:70});addZone(inst,P,{x:P.x,y:P.y,r:62,t:3,iv:0.12,dmg:0.7,follow:true,vis:7});fx(inst,{k:'shake',v:5});for(let i=0;i<24;i++)later(inst,i*0.12,()=>{if(!alive(inst,P))return;const a1=rf(0,Math.PI*2),r1_=rf(10,58),a2=a1+rf(2.2,4);fx(inst,{k:'kslash',x1:r1(P.x+Math.cos(a1)*r1_),y1:r1(P.y-6+Math.sin(a1)*r1_*0.6),x2:r1(P.x+Math.cos(a2)*r1_),y2:r1(P.y-6+Math.sin(a2)*r1_*0.6)});if(i%6===0)fx(inst,{k:'ring',x:r1(P.x),y:r1(P.y),r:60,c:'c',c2:'w'});});},
  fortress(inst,P){fx(inst,{k:'ultart',s:'fortress',pid:P.id,r:100,d:10,spin:0});fx(inst,{k:'dome',x:r1(P.x),y:r1(P.y),r:100,d:10});addZone(inst,P,{x:P.x,y:P.y,r:100,t:10,iv:0.25,vis:11,dr:0.5,follow:true});for(const m of inst.monsters)if(!m.dead&&Math.hypot(m.x-P.x,m.y-P.y)<220){m.taunt={pid:P.id,t:10};m.tgt=P;}fx(inst,{k:'taunt',x:r1(P.x),y:r1(P.y)});},
  finaljudge(inst,P,a,tx,ty){[tx,ty]=clampTarget(P,tx,ty,160);for(let i=0;i<5;i++){const last=i===4;later(inst,0.2+i*0.42,()=>{if(!P.inst||P.inst!==inst)return;const near=inst.monsters.filter(m=>!m.dead&&Math.hypot(m.x-tx,m.y-ty)<120);const T=near.length?pick(near):null;const x=T?T.x:tx+rf(-30,30),y=T?T.y:ty+rf(-20,20);
      fx(inst,{k:'hammer',x:r1(x),y:r1(y),d:0.3,big:last?1:0});fx(inst,{k:'ultart',s:'finaljudge',x:r1(x),y:r1(y-30),r:last?60:44,d:0.7,drop:1});later(inst,0.3,()=>{if(!P.inst||P.inst!==inst)return;fx(inst,{k:'quake',x:r1(x),y:r1(y),r:50});fx(inst,{k:'shake',v:last?9:5});aoe(inst,P,x,y,50,4.5,{kb:8,stun:last?2:0});});});}},
  deadeye(inst,P){P.rootT=Math.max(P.rootT,2);fx(inst,{k:'aim',id:P.id,d:2});const ms=inst.monsters.filter(m=>!m.dead&&!m.hidden&&Math.hypot(m.x-P.x,m.y-P.y)<260).sort((p,q)=>(q.boss?1:0)-(p.boss?1:0)).slice(0,6);for(const m of ms){fx(inst,{k:'tele',x:r1(m.x),y:r1(m.y),r:14,d:2,c:'y'});fx(inst,{k:'ultart',s:'deadeye',mid:m.id,r:22,d:2.3,spin:1});}
    ms.forEach((m,i)=>later(inst,2+i*0.12,()=>{if(m.dead||!alive(inst,P))return;fx(inst,{k:'laser',x1:r1(P.x),y1:r1(P.y-8),x2:r1(m.x),y2:r1(m.y-8)});fx(inst,{k:'shake',v:4});hitMonster(inst,m,P,8,{fcrit:1,kb:6});}));if(ms.length&&ms.length<6){const b=ms[0];for(let j=ms.length;j<6;j++)later(inst,2+j*0.12,()=>{if(b.dead||!alive(inst,P))return;fx(inst,{k:'laser',x1:r1(P.x),y1:r1(P.y-8),x2:r1(b.x),y2:r1(b.y-8)});hitMonster(inst,b,P,4,{fcrit:1});});}},
  killzone(inst,P,a,tx,ty){[tx,ty]=clampTarget(P,tx,ty,200);fx(inst,{k:'tele',x:r1(tx),y:r1(ty),r:80,d:3,c:'z'});fx(inst,{k:'ultart',s:'killzone',x:r1(tx),y:r1(ty),r:80,d:3.4,spin:0.2});const pts=[];for(let i=0;i<8;i++){const t=i/8*Math.PI*2;pts.push([tx+Math.cos(t)*50,ty+Math.sin(t)*32]);}for(const [x,y] of pts)fx(inst,{k:'boom',x:r1(x),y:r1(y),r:8,cs:['z','Z','w']});
    later(inst,3,()=>{if(!P.inst||P.inst!==inst)return;fx(inst,{k:'shake',v:9});for(const [x,y] of pts){fx(inst,{k:'boom',x:r1(x),y:r1(y),r:40});aoe(inst,P,x,y,40,4*(P.S.trapMul||1)/1.4,{kb:6});}});},
  cataclysm(inst,P){const sp=P.S.spell;const cs=[['#ffffff','#ffd35a','#ff4a3a'],['#ffffff','#bfe3ff','#3a6fb8'],['#ffffff','#fff2b0','#c9a0e8']];for(let i=0;i<3;i++)later(inst,0.3+i*0.7,()=>{if(!alive(inst,P))return;fx(inst,{k:'ultart',s:'cataclysm',x:r1(P.x),y:r1(P.y),r:150,d:0.8,spin:i%2?-1:1,burst:1,el:i});fx(inst,{k:'burst',x:r1(P.x),y:r1(P.y),r:150,cs:cs[i]});fx(inst,{k:'shake',v:8});aoe(inst,P,P.x,P.y,150,7*sp,{kb:10,slow:i===1?3:0});});},
  supernova(inst,P){const sp=P.S.spell;fx(inst,{k:'tele',x:r1(P.x),y:r1(P.y),r:140,d:1,c:'w'});later(inst,1,()=>{if(!alive(inst,P))return;fx(inst,{k:'ultart',s:'supernova',x:r1(P.x),y:r1(P.y),r:160,d:1.2,spin:0.8,burst:1});fx(inst,{k:'burst',x:r1(P.x),y:r1(P.y),r:160,cs:['#ffffff','#e6d8ff','#8fd0ff']});fx(inst,{k:'flash'});fx(inst,{k:'shake',v:12});
      const nm=inst.monsters.filter(m=>!m.dead&&m.starT>inst.time).length;for(const m of inst.monsters)if(!m.dead&&Math.hypot(m.x-P.x,m.y-P.y)<150+m.r){hitMonster(inst,m,P,12*sp*(1+0.3*nm)/(1+0.3*Math.min(nm,1)),{kb:12});m.starT=0;}});},
  sanctum(inst,P){fx(inst,{k:'ultart',s:'sanctum',x:r1(P.x),y:r1(P.y),r:110,d:10,spin:0.15,ground:1});fx(inst,{k:'lpillar',x:r1(P.x),y:r1(P.y),r:110});addZone(inst,P,{x:P.x,y:P.y,r:110,t:10,iv:1,heal:P.S.maxHp*0.08,dr:0.3,vis:5});fx(inst,{k:'sfx',n:'holy'});},
  purgatory(inst,P){fx(inst,{k:'ultart',s:'purgatory',x:r1(P.x),y:r1(P.y),r:110,d:6,spin:0.3,ground:1});fx(inst,{k:'redsky',d:6});addZone(inst,P,{x:P.x,y:P.y,r:110,t:6,iv:0.5,dmg:1.5*P.S.spell,heal:P.S.healPow*0.25,vis:14});fx(inst,{k:'shake',v:6});},
  dawnlegion(inst,P){fx(inst,{k:'ultart',s:'dawnlegion',pid:P.id,r:70,d:8,spin:0});fx(inst,{k:'lorbit',id:P.id,d:8});fx(inst,{k:'burst',x:r1(P.x),y:r1(P.y),r:90,cs:['#ffffff','#ffe9a8','#ffd35a']});for(const q of partyNear(inst,P,160))buff(q,'dmg',0.25,8);addZone(inst,P,{x:P.x,y:P.y,r:70,t:8,iv:0.4,dmg:2.4,follow:true,vis:0});addHoly(P,30);for(let i=0;i<20;i++)later(inst,i*0.4,()=>{if(!alive(inst,P))return;const T=inst.monsters.filter(m=>!m.dead&&Math.hypot(m.x-P.x,m.y-P.y)<80);const m=T.length?pick(T):null;const a=m?Math.atan2(m.y-P.y,m.x-P.x):rf(0,6.28);const t0=i/20*Math.PI*2;const hx=P.x+Math.cos(t0)*30,hy=P.y+Math.sin(t0)*18;fx(inst,{k:'lcut',x:r1(m?m.x:hx),y:r1(m?m.y:hy),a:r1(a),r:34});});},
  eclipsebreak(inst,P,a,tx,ty){[tx,ty]=clampTarget(P,tx,ty,180);fx(inst,{k:'tele',x:r1(tx),y:r1(ty),r:110,d:1.5,c:'o'});fx(inst,{k:'ultart',s:'eclipsebreak',x:r1(tx),y:r1(ty),r:110,d:1.9,drop:1.5,spin:0.5,burst:1});later(inst,1.5,()=>{if(!P.inst||P.inst!==inst)return;fx(inst,{k:'burst',x:r1(tx),y:r1(ty),r:130,cs:['#ffffff','#ffd35a','#ff4a3a']});fx(inst,{k:'flash'});fx(inst,{k:'shake',v:14});aoe(inst,P,tx,ty,120,15,{kb:14});P.holy=100;});},
  // ----- 빛의 기사 -----
  lslash(inst,P,a,tx,ty,k){fx(inst,{k:'swing',id:P.id,a:r1(a),d:0.22});fx(inst,{k:'lcut',x:r1(P.x),y:r1(P.y),a:r1(a),r:50});cone(inst,P,a,50,0.95,1.9*k,{kb:4});addHoly(P,8);},
  flashdash(inst,P,a,tx,ty,k){const[ox,oy]=dashHit(inst,P,a,110,2.1*k,{kb:5});fx(inst,{k:'lwave',x1:r1(ox),y1:r1(oy-6),x2:r1(P.x),y2:r1(P.y-6),dash:1});addHoly(P,10);},
  lmark(inst,P,a,tx,ty,k){[tx,ty]=clampTarget(P,tx,ty,150);const ids=[];for(const m of inst.monsters){if(m.dead||Math.hypot(m.x-tx,m.y-ty)>42+m.r)continue;m.lmarkT=inst.time+8;ids.push(m.id);hitMonster(inst,m,P,1.2*k,{});}
    fx(inst,{k:'lrune',x:r1(tx),y:r1(ty),r:42});if(ids.length)fx(inst,{k:'lmarkm',ids,d:8});addHoly(P,6);},
  crossslash(inst,P,a,tx,ty,k){fx(inst,{k:'swing',id:P.id,a:r1(a),d:0.2});fx(inst,{k:'lcut',x:r1(P.x),y:r1(P.y),a:r1(a),r:46,tilt:1});cone(inst,P,a,46,0.8,1.7*k,{kb:2});
    later(inst,0.16,()=>{if(!alive(inst,P))return;fx(inst,{k:'lcut',x:r1(P.x),y:r1(P.y),a:r1(a),r:46,tilt:-1});cone(inst,P,a,46,0.8,1.7*k,{stun:0.6,kb:4});});addHoly(P,12);},
  skyfall(inst,P,a,tx,ty,k){[tx,ty]=clampTarget(P,tx,ty,130);const[ox,oy]=dashTo(inst,P,Math.atan2(ty-P.y,tx-P.x),Math.hypot(tx-P.x,ty-P.y));fx(inst,{k:'leap',x1:r1(ox),y1:r1(oy),x2:r1(P.x),y2:r1(P.y)});P.dodgeT=Math.max(P.dodgeT,0.3);
    later(inst,0.3,()=>{if(!alive(inst,P))return;fx(inst,{k:'lpillar',x:r1(P.x),y:r1(P.y),r:46});fx(inst,{k:'shake',v:4});aoe(inst,P,P.x,P.y,46,2.6*k,{stun:1,kb:6});addHoly(P,10);});},
  bladedance(inst,P,a,tx,ty,k){addZone(inst,P,{r:40,t:3,iv:0.25,dmg:0.5*k,vis:7,follow:true});fx(inst,{k:'lorbit',id:P.id,d:3});fx(inst,{k:'sfx',n:'whirl'});addHoly(P,15);},
  dawnawaken(inst,P,a,tx,ty,k,rank){buff(P,'sdmg',0.3+0.02*((rank|0)-1),10);buff(P,'as',0.25,10);buff(P,'dawn',1,10);fx(inst,{k:'lpillar',x:r1(P.x),y:r1(P.y),r:30,soft:1});fx(inst,{k:'sfx',n:'holy'});},
  judgment(inst,P,a,tx,ty,k){const h=Math.floor(P.holy||0);P.holy=0;fx(inst,{k:'lsword',x:r1(P.x),y:r1(P.y),a:r1(a),len:84,h});fx(inst,{k:'shake',v:3+Math.round(h/20)});
    later(inst,0.22,()=>{if(!alive(inst,P))return;cone(inst,P,a,84,0.42,(3+0.035*h)*k,{stun:h>=100?1.2:0,kb:8});});},
  lastflash(inst,P,a,tx,ty,k){let b=null,bd=1e9;for(const m of inst.monsters){if(m.dead)continue;const d=Math.hypot(m.x-P.x,m.y-P.y);if(d<140+m.r&&(d<12||angDiff(Math.atan2(m.y-P.y,m.x-P.x),a)<0.9)&&d<bd){bd=d;b=m;}}
    if(!b)return false;const aa=Math.atan2(b.y-P.y,b.x-P.x);const[ox,oy]=dashTo(inst,P,aa,Math.max(0,bd-12));fx(inst,{k:'lwave',x1:r1(ox),y1:r1(oy-6),x2:r1(P.x),y2:r1(P.y-6),dash:1});
    const low=b.hp/b.maxHp<0.35;fx(inst,{k:'lcut',x:r1(b.x),y:r1(b.y),a:r1(aa),r:30,big:1});hitMonster(inst,b,P,4.2*k*(low?1.5:1),{exec:true,kb:6});fx(inst,{k:'shake',v:4});addHoly(P,10);},
  lightstorm(inst,P,a,tx,ty,k){fx(inst,{k:'lstorm',x:r1(P.x),y:r1(P.y),r:80});fx(inst,{k:'shake',v:6});aoe(inst,P,P.x,P.y,80,4.0*k,{stun:1.5,kb:8});addHoly(P,20);},
  radiantspear(inst,P,a,tx,ty,k){fx(inst,{k:'lspear',x:r1(P.x),y:r1(P.y-6),a:r1(a),len:210});lineHit(inst,P,P.x,P.y,a,210,12,3.2*k,{kb:4});addHoly(P,10);},
  excalibur(inst,P,a,tx,ty,k,rank){buff(P,'excal',1,8);buff(P,'sdmg',0.2+0.015*((rank|0)-1),8);fx(inst,{k:'lpillar',x:r1(P.x),y:r1(P.y),r:36});fx(inst,{k:'excal',id:P.id,d:8});fx(inst,{k:'sfx',n:'holy'});},
  dawnblade(inst,P,a,tx,ty){[tx,ty]=clampTarget(P,tx,ty,160);fx(inst,{k:'kdawn',x:r1(tx),y:r1(ty),d:1.0});
    later(inst,1.0,()=>{if(!P.inst||P.inst!==inst)return;fx(inst,{k:'boom',x:r1(tx),y:r1(ty),r:70,c:1});fx(inst,{k:'shake',v:11});
      for(const m of inst.monsters){if(m.dead||Math.hypot(m.x-tx,m.y-ty)>70+m.r)continue;hitMonster(inst,m,P,7*(P.S.rad||1),{kb:10,stun:2});if(m.boss){m.grog=Math.max(m.grog||0,inst.time+2.5);fx(inst,{k:'txt',x:r1(m.x),y:r1(m.y-40),s:'휘청!',c:'#ffe9a8'});}}
      [95,120,145].forEach((r,i)=>later(inst,0.28*(i+1),()=>{if(!P.inst||P.inst!==inst)return;fx(inst,{k:'kwave',x:r1(tx),y:r1(ty),r});fx(inst,{k:'shake',v:4});aoe(inst,P,tx,ty,r,3*(P.S.rad||1),{kb:6});}));});},
  heavendance(inst,P){buff(P,'hdance',1,3.4);P.dodgeT=Math.max(P.dodgeT,3.4);const ox=P.x,oy=P.y;fx(inst,{k:'kdance',id:P.id,d:3.3});const hit=new Map();
    for(let i=0;i<12;i++)later(inst,0.1+i*0.25,()=>{if(!P.inst||P.inst!==inst)return;const c=inst.monsters.filter(m=>!m.dead&&Math.hypot(m.x-ox,m.y-oy)<180);if(!c.length)return;c.sort((p,q)=>(hit.get(p.id)||0)-(hit.get(q.id)||0)||Math.hypot(p.x-P.x,p.y-P.y)-Math.hypot(q.x-P.x,q.y-P.y));const m=c[0];hit.set(m.id,(hit.get(m.id)||0)+1);
      const aa=Math.atan2(m.y-P.y,m.x-P.x);const d=Math.hypot(m.x-P.x,m.y-P.y);const x1=P.x,y1=P.y;dashTo(inst,P,aa,d+14);fx(inst,{k:'kslash',x1:r1(x1),y1:r1(y1-8),x2:r1(P.x),y2:r1(P.y-8)});hitMonster(inst,m,P,2.5*(P.S.rad||1),{kb:3});aoe(inst,P,m.x,m.y,24,1.0*(P.S.rad||1),{});});
    later(inst,3.2,()=>{if(!P.inst||P.inst!==inst)return;fx(inst,{k:'burst',x:r1(P.x),y:r1(P.y),r:90,cs:['#ffffff','#fff6d0','#ffd35a']});fx(inst,{k:'shake',v:9});aoe(inst,P,P.x,P.y,90,5*(P.S.rad||1),{kb:12});});},
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
  starfall(inst,P,a,tx,ty,k){[tx,ty]=clampTarget(P,tx,ty,220);for(let n=0;n<3;n++){const x=tx+rf(-12,12),y=ty+rf(-8,8);fx(inst,{k:'tele',x:r1(x),y:r1(y),r:36,d:0.4+n*0.4});later(inst,0.4+n*0.4,()=>{if(!P.inst||P.inst!==inst)return;fx(inst,{k:'sv',s:'starburst',x:r1(x),y:r1(y),r:36,d:0.6});fx(inst,{k:'shake',v:3});aoe(inst,P,x,y,36,3*k,{kb:5});});}},
  // ----- 마법사 -----
  fireball(inst,P,a,tx,ty,k){fx(inst,{k:'shot',id:P.id,a:r1(a)});spawnPProj(inst,P,'fire',a,210,1.7*P.S.spell*k,{r:3,life:1.4,boom:24});fx(inst,{k:'sfx',n:'fire'});},
  nova(inst,P,a,tx,ty,k){fx(inst,{k:'nova',x:r1(P.x),y:r1(P.y)});aoe(inst,P,P.x,P.y,66,1.2*P.S.spell*k,{slow:3});},
  chain(inst,P,a,tx,ty,k){[tx,ty]=clampTarget(P,tx,ty,180);let cur=null,bd=70;for(const m of inst.monsters){if(m.dead)continue;const d=Math.hypot(m.x-tx,m.y-ty);if(d<bd&&SH.los(inst.map,P.x,P.y,m.x,m.y)){bd=d;cur=m;}}
    const pts=[[r1(P.x),r1(P.y-6)]];if(!cur){pts.push([r1(tx),r1(ty)]);fx(inst,{k:'chain',pts});return;}const hit=new Set();
    for(let n=0;n<4&&cur;n++){hit.add(cur);pts.push([r1(cur.x),r1(cur.y-6)]);hitMonster(inst,cur,P,1.3*P.S.spell*k,{});let nx=null,nd=75;for(const m of inst.monsters){if(m.dead||hit.has(m))continue;const d=Math.hypot(m.x-cur.x,m.y-cur.y);if(d<nd){nd=d;nx=m;}}cur=nx;}
    fx(inst,{k:'chain',pts});fx(inst,{k:'sv',s:'awchain',pts,x:pts[0][0],y:pts[0][1],c:'#bfe3ff',bolt:1,d:0.5});},
  blink(inst,P,a,tx,ty){const d=Math.min(130,Math.hypot(tx-P.x,ty-P.y));let nx=P.x,ny=P.y;for(let s=d;s>=0;s-=4){const x=P.x+Math.cos(a)*s,y=P.y+Math.sin(a)*s;if(!SH.blocked(inst.map,x,y,4)){nx=x;ny=y;break;}}fx(inst,{k:'tp',x:r1(P.x),y:r1(P.y)});P.x=nx;P.y=ny;send(P,{t:'tp',x:nx,y:ny});fx(inst,{k:'tp',x:r1(nx),y:r1(ny)});},
  meteor(inst,P,a,tx,ty,k){[tx,ty]=clampTarget(P,tx,ty,220);fx(inst,{k:'tele',x:r1(tx),y:r1(ty),r:40,d:1,c:'o'});fx(inst,{k:'sv',s:'awdrop',x:r1(tx),y:r1(ty),r:30,f:'boomfire',sid:'awMeteorFall',c:'#ff8a3a',fall:1,d:1.05});
    later(inst,1,()=>{if(!P.inst||P.inst!==inst)return;fx(inst,{k:'sv',s:'siegeboom',x:r1(tx),y:r1(ty),r:46,d:1.1});fx(inst,{k:'shake',v:5});aoe(inst,P,tx,ty,40,4*P.S.spell*k,{kb:6});addZone(inst,P,{x:tx,y:ty,r:34,t:3,iv:0.5,dmg:0.3*P.S.spell*k,vis:2});});},
  frostorb(inst,P,a,tx,ty,k){fx(inst,{k:'shot',id:P.id,a:r1(a)});fx(inst,{k:'sfx',n:'ice'});spawnPProj(inst,P,'frostorb',a,90,0,{r:4,life:2.6,ghost:true,aura:{r:34,mult:0.4*P.S.spell*k,iv:0.25,tick:0}});},
  flamewall(inst,P,a,tx,ty,k){[tx,ty]=clampTarget(P,tx,ty,200);addZone(inst,P,{x:tx,y:ty,r:34,t:4,iv:0.25,dmg:0.35*P.S.spell*k,vis:2});fx(inst,{k:'sfx',n:'fire'});},
  blizzard(inst,P,a,tx,ty,k){[tx,ty]=clampTarget(P,tx,ty,220);addZone(inst,P,{x:tx,y:ty,r:60,t:5,iv:0.25,dmg:0.25*P.S.spell*k,slow:1,vis:3});fx(inst,{k:'sfx',n:'ice'});},
  thunder(inst,P,a,tx,ty,k){[tx,ty]=clampTarget(P,tx,ty,220);const tg=inst.monsters.filter(m=>!m.dead&&Math.hypot(m.x-tx,m.y-ty)<70).sort((p,q)=>Math.hypot(p.x-tx,p.y-ty)-Math.hypot(q.x-tx,q.y-ty)).slice(0,6);
    if(!tg.length)fx(inst,{k:'strike',x:r1(tx),y:r1(ty)});tg.forEach((m,i)=>later(inst,i*0.08,()=>{if(m.dead||P.inst!==inst)return;fx(inst,{k:'strike',x:r1(m.x),y:r1(m.y)});fx(inst,{k:'sv',s:'estrike',x:r1(m.x),y:r1(m.y),el:1,d:0.45});hitMonster(inst,m,P,2.2*P.S.spell*k,{stun:0.3});}));fx(inst,{k:'sfx',n:'bolt'});},
  armageddon(inst,P,a,tx,ty,k){fx(inst,{k:'shake',v:2});fx(inst,{k:'msg',m:`${P.ch.name}: 종말이 온다!`,c:'#ff8a3a'});
    for(let n=0;n<20;n++)later(inst,n*0.25,()=>{if(!P.inst||P.inst!==inst)return;const near=inst.monsters.filter(m=>!m.dead&&Math.hypot(m.x-P.x,m.y-P.y)<150);let x,y;if(near.length&&R()<0.7){const m=pick(near);x=m.x+rf(-8,8);y=m.y+rf(-8,8);}else{x=P.x+rf(-110,110);y=P.y+rf(-70,70);}
      fx(inst,{k:'tele',x:r1(x),y:r1(y),r:26,d:0.5,c:'o'});fx(inst,{k:'sv',s:'awdrop',x:r1(x),y:r1(y),r:24,f:'boomfire',sid:'awMeteorFall',c:'#ff8a3a',fall:0.5,d:1.2});later(inst,0.5,()=>{if(!P.inst||P.inst!==inst)return;aoe(inst,P,x,y,26,2.5*P.S.spell*k,{kb:3});});});},
  // ----- 사제 -----
  heal(inst,P,a,tx,ty,k){[tx,ty]=clampTarget(P,tx,ty,200);fx(inst,{k:'healburst',x:r1(tx),y:r1(ty)});fx(inst,{k:'sv',s:'healspot',x:r1(tx),y:r1(ty),d:1});let any=false;for(const q of livingPlayers(inst))if(Math.hypot(q.x-tx,q.y-ty)<42){healPlayer(inst,q,P.S.healPow*1.6*k,P);any=true;}
    if(!any){let b=null,bd=90;for(const q of livingPlayers(inst)){const d=Math.hypot(q.x-tx,q.y-ty);if(d<bd){bd=d;b=q;}}if(b)healPlayer(inst,b,P.S.healPow*1.6*k,P);}},
  smite(inst,P,a,tx,ty,k){[tx,ty]=clampTarget(P,tx,ty,200);fx(inst,{k:'smite',x:r1(tx),y:r1(ty)});fx(inst,{k:'sv',s:'verdict',x:r1(tx),y:r1(ty),d:0.6});aoe(inst,P,tx,ty,26,1.8*P.S.spell*k,{});},
  shield(inst,P,a,tx,ty,k){fx(inst,{k:'shieldfx',x:r1(P.x),y:r1(P.y)});for(const q of partyNear(inst,P,120)){q.shield=Math.max(q.shield,Math.round(P.S.healPow*1.5*k));q.shieldT=6;q.shieldBy=P.id;}},
  sanctuary(inst,P,a,tx,ty,k){[tx,ty]=clampTarget(P,tx,ty,200);addZone(inst,P,{x:tx,y:ty,r:40,t:5,iv:0.5,heal:P.S.healPow*0.35*k,vis:0});},
  renew(inst,P){const dn=instPlayers(inst).filter(q=>q.downed&&(!inst.arena||q.arenaTeam===P.arenaTeam)&&Math.hypot(q.x-P.x,q.y-P.y)<90);if(!dn.length){msg(P,'주변에 쓰러진 동료가 없습니다','#9e937a');return false;}
    for(const q of dn){q.downed=false;q.rev=0;q.hp=Math.round(q.S.maxHp*0.5);addMeter(inst,P,'heal',q.hp);fx(inst,{k:'revive',id:q.id});fx(inst,{k:'msg',m:`${P.ch.name}님이 ${q.ch.name}님을 일으켰습니다`,c:'#7fd05a'});}},
  purify(inst,P,a,tx,ty,k){fx(inst,{k:'ring',x:r1(P.x),y:r1(P.y),r:80,c:'y',c2:'w'});fx(inst,{k:'sfx',n:'holy'});for(const q of partyNear(inst,P,80))healPlayer(inst,q,P.S.healPow*1.2*k,P);aoe(inst,P,P.x,P.y,80,1.2*P.S.spell*k,{});},
  holyfire(inst,P,a,tx,ty,k){fx(inst,{k:'shot',id:P.id,a:r1(a)});fx(inst,{k:'sfx',n:'holy'});spawnPProj(inst,P,'holybeam',a,380,2.5*P.S.spell*k,{pierce:true,r:3,life:0.8});},
  blessing(inst,P,a,tx,ty,k,rank){fx(inst,{k:'ring',x:r1(P.x),y:r1(P.y),r:200,c:'y',c2:'w'});fx(inst,{k:'sfx',n:'revive'});for(const q of partyNear(inst,P,200)){buff(q,'bdmg',0.2+0.02*(rank-1),10);buff(q,'red',0.2+0.02*(rank-1),10);}},
  lightpillar(inst,P,a,tx,ty,k){[tx,ty]=clampTarget(P,tx,ty,200);addZone(inst,P,{x:tx,y:ty,r:30,t:5,iv:0.25,dmg:0.3*P.S.spell*k,heal:P.S.healPow*0.12*k,vis:5});fx(inst,{k:'sfx',n:'holy'});},
  miracle(inst,P,a,tx,ty,k){fx(inst,{k:'msg',m:`${P.ch.name}: 기적이여!`,c:'#ffe9a8'});fx(inst,{k:'sfx',n:'revive'});for(const q of livingPlayers(inst)){if(!(!inst.arena||q.arenaTeam===P.arenaTeam))continue;/* 결투장에서 상대에게도 보호막이 가던 문제 */healPlayer(inst,q,q.S.maxHp,P);q.shield=Math.max(q.shield,Math.round(q.S.maxHp*0.25*k));q.shieldT=8;q.shieldBy=P.id;fx(inst,{k:'revive',id:q.id});}},
  // ----- 38·42 신규 -----
  rageleap(inst,P,a,tx,ty,k){for(let i=0;i<3;i++)later(inst,i*0.3,()=>{if(!alive(inst,P))return;const[ox,oy]=dashTo(inst,P,a,38);P.dodgeT=Math.max(P.dodgeT,0.22);fx(inst,{k:'leap',x1:r1(ox),y1:r1(oy),x2:r1(P.x),y2:r1(P.y)});
    later(inst,0.18,()=>{if(!alive(inst,P))return;fx(inst,{k:'quake',x:r1(P.x),y:r1(P.y),r:34});fx(inst,{k:'shake',v:2});aoe(inst,P,P.x,P.y,34,1.5*k,{kb:5});});});},
  shatter(inst,P,a,tx,ty,k){let b=null,bd=1e9;for(const m of inst.monsters){if(m.dead)continue;const d=Math.hypot(m.x-P.x,m.y-P.y);if(d<36+m.r&&(d<10||angDiff(Math.atan2(m.y-P.y,m.x-P.x),a)<0.8)&&d<bd){bd=d;b=m;}}
    fx(inst,{k:'swing',id:P.id,a:r1(a),d:0.3});if(b){fx(inst,{k:'execute',x:r1(b.x),y:r1(b.y)});fx(inst,{k:'boom',x:r1(b.x),y:r1(b.y),r:18,c:1});hitMonster(inst,b,P,5*k,{kb:6});b.brk=inst.time+5;fx(inst,{k:'txt',x:r1(b.x),y:r1(b.y-30),s:'파쇄!',c:'#ffb03a'});fx(inst,{k:'shake',v:4});}},
  shieldrush(inst,P,a,tx,ty,k){const[ox,oy]=dashTo(inst,P,a,80);fx(inst,{k:'dash',x1:r1(ox),y1:r1(oy),x2:r1(P.x),y2:r1(P.y)});fx(inst,{k:'quake',x:r1(P.x+Math.cos(a)*10),y:r1(P.y+Math.sin(a)*10),r:30});fx(inst,{k:'shake',v:3});
    aoe(inst,P,P.x+Math.cos(a)*10,P.y+Math.sin(a)*10,30,2.0*k,{stun:1,kb:16});},
  judgechain(inst,P,a,tx,ty,k){[tx,ty]=clampTarget(P,tx,ty,200);const ts=inst.monsters.filter(m=>!m.dead&&Math.hypot(m.x-tx,m.y-ty)<60+m.r).slice(0,5);if(!ts.length){msg(P,'사슬로 묶을 적이 없습니다','#9e937a');return false;}
    const pts=[[r1(P.x),r1(P.y-8)]];for(const m of ts){pts.push([r1(m.x),r1(m.y-8)]);hitMonster(inst,m,P,1.5*k,{stun:3});fx(inst,{k:'txt',x:r1(m.x),y:r1(m.y-26),s:'속박',c:'#ffe9a8'});}fx(inst,{k:'sv',s:'awchain',pts,x:pts[0][0],y:pts[0][1],c:'#ffd35a',d:0.8});fx(inst,{k:'sfx',n:'hook'});},
  shadowshot(inst,P,a,tx,ty,k){buff(P,'shadow',0.6*k,6);fx(inst,{k:'ring',x:r1(P.x),y:r1(P.y),r:30,c:'p',c2:'k'});fx(inst,{k:'sfx',n:'bow'});},
  galearrow(inst,P,a,tx,ty,k){fx(inst,{k:'shot',id:P.id,a:r1(a)});addZone(inst,P,{x:P.x+Math.cos(a)*10,y:P.y+Math.sin(a)*10,r:26,t:2.2,iv:0.25,dmg:0.5*k,vis:16,vx:Math.cos(a)*100,vy:Math.sin(a)*100,pull:55});fx(inst,{k:'sfx',n:'whirl'});},
  overload(inst,P,a,tx,ty,k){buff(P,'sdmg',0.3*k,6);buff(P,'as',0.2,6);fx(inst,{k:'ring',x:r1(P.x),y:r1(P.y),r:44,c:'p',c2:'c'});fx(inst,{k:'sfx',n:'cast'});},
  blackhole(inst,P,a,tx,ty,k){[tx,ty]=clampTarget(P,tx,ty,200);addZone(inst,P,{x:tx,y:ty,r:46,t:3,iv:0.25,dmg:0.3*P.S.spell*k,vis:10,pull:75});
    later(inst,3,()=>{if(!P.inst||P.inst!==inst)return;fx(inst,{k:'sv',s:'awnova',x:r1(tx),y:r1(ty),r:60,c:'#b07aff',d:0.8});fx(inst,{k:'shake',v:4});aoe(inst,P,tx,ty,56,3.0*P.S.spell*k,{kb:10});});},
  lightchain(inst,P,a,tx,ty,k){const ts=livingPlayers(inst).filter(q=>Math.hypot(q.x-P.x,q.y-P.y)<180&&(!inst.arena||q.arenaTeam===P.arenaTeam)).sort((x,y)=>x.hp/x.S.maxHp-y.hp/y.S.maxHp).slice(0,4);
    const pts=[[r1(P.x),r1(P.y-8)]];for(const q of ts){pts.push([r1(q.x),r1(q.y-8)]);healPlayer(inst,q,P.S.healPow*1.2*k,P);}fx(inst,{k:'chain',pts});fx(inst,{k:'sv',s:'awchain',pts,x:pts[0][0],y:pts[0][1],c:'#fff2b0',d:0.7});fx(inst,{k:'sfx',n:'holy'});},
  holyburst(inst,P,a,tx,ty,k){fx(inst,{k:'ring',x:r1(P.x),y:r1(P.y),r:60,c:'y',c2:'w'});fx(inst,{k:'smite',x:r1(P.x),y:r1(P.y)});fx(inst,{k:'shake',v:3});aoe(inst,P,P.x,P.y,50,2.5*P.S.spell*k,{kb:12});
    for(const q of partyNear(inst,P,60)){q.shield=Math.max(q.shield,Math.round(q.S.maxHp*0.1*k));q.shieldT=5;q.shieldBy=P.id;}},
  // ----- 궁극기 -----
  ragnarok(inst,P,a,tx,ty){[tx,ty]=clampTarget(P,tx,ty,140);if(SH.blocked(inst.map,tx,ty,4)){tx=P.x;ty=P.y;}P.dodgeT=Math.max(P.dodgeT,1.3);fx(inst,{k:'rag',id:P.id,x:r1(tx),y:r1(ty),a:r1(a)});
    later(inst,0.95,()=>{if(!P.inst||P.inst!==inst)return;P.x=tx;P.y=ty;send(P,{t:'tp',x:tx,y:ty});fx(inst,{k:'boom',x:r1(tx),y:r1(ty),r:60});fx(inst,{k:'quake',x:r1(tx),y:r1(ty),r:70});fx(inst,{k:'shake',v:9});aoe(inst,P,tx,ty,60,13,{kb:10});
      for(let i=1;i<=3;i++)later(inst,i*0.22,()=>{if(!P.inst||P.inst!==inst)return;const x=tx+Math.cos(a)*i*40,y=ty+Math.sin(a)*i*40;fx(inst,{k:'fissure',x:r1(x),y:r1(y),a:r1(a)});fx(inst,{k:'shake',v:5});aoe(inst,P,x,y,40,7.5,{kb:6});addZone(inst,P,{x,y,r:30,t:3,iv:0.5,dmg:1,vis:14});});});},
  wargod(inst,P){buff(P,'god',1,12);buff(P,'sdmg',0.3,12);P.rootT=0;P.slowT=0;fx(inst,{k:'god',id:P.id,d:12});fx(inst,{k:'shake',v:6});},
  aegisdome(inst,P){const x=P.x,y=P.y;addZone(inst,P,{x,y,r:72,t:8,iv:0.25,vis:11,dr:0.6});fx(inst,{k:'dome',x:r1(x),y:r1(y),r:72,d:8});
    later(inst,8,()=>{if(!P.inst||P.inst!==inst)return;fx(inst,{k:'domeburst',x:r1(x),y:r1(y),r:80});fx(inst,{k:'shake',v:7});aoe(inst,P,x,y,80,4,{kb:18});});},
  judgehammer(inst,P,a,tx,ty){[tx,ty]=clampTarget(P,tx,ty,160);for(let i=0;i<3;i++){const last=i===2;later(inst,0.15+i*0.55,()=>{if(!P.inst||P.inst!==inst)return;fx(inst,{k:'hammer',x:r1(tx),y:r1(ty),d:0.35,big:last?1:0});
      later(inst,0.35,()=>{if(!P.inst||P.inst!==inst)return;fx(inst,{k:'boom',x:r1(tx),y:r1(ty),r:54,c:1});fx(inst,{k:'quake',x:r1(tx),y:r1(ty),r:60});fx(inst,{k:'shake',v:last?9:6});
        for(const m of inst.monsters){if(m.dead||Math.hypot(m.x-tx,m.y-ty)>54+m.r)continue;hitMonster(inst,m,P,6.2,{kb:8,stun:last?3:0});if(last&&m.boss){m.grog=Math.max(m.grog||0,inst.time+2.5);fx(inst,{k:'txt',x:r1(m.x),y:r1(m.y-40),s:'휘청!',c:'#ffe9a8'});}}});});}},
  skyrain(inst,P,a,tx,ty){[tx,ty]=clampTarget(P,tx,ty,200);addZone(inst,P,{x:tx,y:ty,r:100,t:5,iv:0.25,dmg:3.8,vis:12});fx(inst,{k:'sfx',n:'bow'});},
  dragonarrow(inst,P,a,tx,ty){P.rootT=Math.max(P.rootT,0.8);fx(inst,{k:'dcharge',id:P.id,d:0.8,a:r1(a)});
    later(inst,0.8,()=>{if(!alive(inst,P))return;const len=360,sp=240,BODY=190,x0=P.x+Math.cos(a)*10,y0=P.y-4+Math.sin(a)*10;fx(inst,{k:'dragon',x:r1(x0),y:r1(y0),a:r1(a),len,sp});fx(inst,{k:'shake',v:5});
      /* 다단히트: 용의 몸통(머리~꼬리 190px)이 지나가는 동안 0.1초마다 닿은 적에게 피해, 적마다 최대 10회 */
      const cnt=new Map(),T=(len+BODY)/sp,N=Math.ceil(T/0.1);const ca=Math.cos(a),sa=Math.sin(a);
      for(let j=1;j<=N;j++)later(inst,j*0.1,()=>{if(!P.inst||P.inst!==inst)return;const hd=Math.min(len,j*0.1*sp),tl=Math.max(0,j*0.1*sp-BODY);if(tl>=len)return;
        for(const m of inst.monsters){if(m.dead)continue;const n=cnt.get(m.id)|0;if(n>=10)continue;const rx=m.x-x0,ry=m.y-y0;const along=rx*ca+ry*sa,perp=Math.abs(-rx*sa+ry*ca);if(along<tl-m.r||along>hd+m.r+8||perp>18+m.r)continue;
          cnt.set(m.id,n+1);hitMonster(inst,m,P,n===0?9.5:7.6,{kb:n===0?8:2});}});
      later(inst,len/sp,()=>{if(!P.inst||P.inst!==inst)return;const x=x0+ca*len,y=y0+sa*len;fx(inst,{k:'boom',x:r1(x),y:r1(y),r:70});fx(inst,{k:'shake',v:8});aoe(inst,P,x,y,70,6,{kb:10});});});},
  apocalypse(inst,P,a,tx,ty){fx(inst,{k:'redsky',d:4.6});fx(inst,{k:'shake',v:3});
    for(let n=0;n<12;n++)later(inst,0.3+n*0.25,()=>{if(!P.inst||P.inst!==inst)return;const near=inst.monsters.filter(m=>!m.dead&&Math.hypot(m.x-P.x,m.y-P.y)<180);let x,y;if(near.length){const m=pick(near);x=m.x+rf(-6,6);y=m.y+rf(-6,6);}else{x=P.x+rf(-120,120);y=P.y+rf(-80,80);}
      fx(inst,{k:'tele',x:r1(x),y:r1(y),r:32,d:0.6,c:'o'});fx(inst,{k:'sv',s:'awdrop',x:r1(x),y:r1(y),r:30,f:'boomfire',sid:'awMeteorFall',c:'#ff8a3a',fall:0.6,d:1.4});later(inst,0.6,()=>{if(!P.inst||P.inst!==inst)return;fx(inst,{k:'shake',v:3});aoe(inst,P,x,y,32,4*P.S.spell,{kb:4});});});
    [tx,ty]=clampTarget(P,tx,ty,180);later(inst,3.4,()=>{if(!P.inst||P.inst!==inst)return;fx(inst,{k:'tele',x:r1(tx),y:r1(ty),r:72,d:1.1,c:'o'});fx(inst,{k:'bigmeteor',x:r1(tx),y:r1(ty),d:1.1});
      later(inst,1.1,()=>{if(!P.inst||P.inst!==inst)return;fx(inst,{k:'boom',x:r1(tx),y:r1(ty),r:72});fx(inst,{k:'quake',x:r1(tx),y:r1(ty),r:90});fx(inst,{k:'shake',v:10});aoe(inst,P,tx,ty,72,10*P.S.spell,{kb:14});addZone(inst,P,{x:tx,y:ty,r:50,t:3,iv:0.5,dmg:0.6*P.S.spell,vis:14});});});},
  absolutezero(inst,P){const x=P.x,y=P.y,R0=140;const ids=[];for(const m of inst.monsters){if(m.dead||Math.hypot(m.x-x,m.y-y)>R0+m.r)continue;ids.push(m.id);if(m.boss)m.slow=Math.max(m.slow,3);else m.stun=Math.max(m.stun,3);}
    fx(inst,{k:'freeze',x:r1(x),y:r1(y),r:R0,d:3,ids});addZone(inst,P,{x,y,r:R0,t:3,iv:9,vis:13});
    later(inst,3,()=>{if(!P.inst||P.inst!==inst)return;fx(inst,{k:'shatter',x:r1(x),y:r1(y),r:R0,ids});fx(inst,{k:'shake',v:9});aoe(inst,P,x,y,R0,40*P.S.spell,{kb:6});});},
  angel(inst,P){addZone(inst,P,{r:150,t:10,iv:0.5,heal:P.S.healPow*0.6,vis:15,follow:true,revive:true});fx(inst,{k:'angel',id:P.id,d:10});reviveNear(inst,P,150);},
  divinejudge(inst,P,a,tx,ty){for(const q of partyNear(inst,P,200)){q.shield=Math.max(q.shield,Math.round(q.S.maxHp*0.2));q.shieldT=8;q.shieldBy=P.id;fx(inst,{k:'shieldfx',x:r1(q.x),y:r1(q.y)});}
    for(let n=0;n<10;n++)later(inst,0.2+n*0.4,()=>{if(!P.inst||P.inst!==inst)return;const near=inst.monsters.filter(m=>!m.dead&&Math.hypot(m.x-P.x,m.y-P.y)<200);let x,y;if(near.length){const m=pick(near);x=m.x;y=m.y;}else{x=P.x+rf(-100,100);y=P.y+rf(-70,70);}
      fx(inst,{k:'dpillar',x:r1(x),y:r1(y),d:0.3});later(inst,0.3,()=>{if(!P.inst||P.inst!==inst)return;fx(inst,{k:'boom',x:r1(x),y:r1(y),r:26,c:1});fx(inst,{k:'shake',v:3});aoe(inst,P,x,y,26,3*P.S.spell,{kb:3});});});},
};
function reviveNear(inst,P,r){for(const q of instPlayers(inst)){if(!q.downed||Math.hypot(q.x-P.x,q.y-P.y)>r||!(!inst.arena||q.arenaTeam===P.arenaTeam))continue;q.downed=false;q.rev=0;q.hp=Math.round(q.S.maxHp*0.6);addMeter(inst,P,'heal',q.hp);fx(inst,{k:'revive',id:q.id});fx(inst,{k:'msg',m:`천사가 ${q.ch.name}님을 일으켰습니다`,c:'#ffe9a8'});}}
// ---------- 3차 각성 스킬: shared의 ops 목록을 실행 ----------
function awkK(P,k){return k*(1+(P.S.awkArt||0))*(CLASSES[P.ch.cls].prim==='ene'?(P.S.spell||1):1);}
function awkHpCol(col){return [col,'#ffffff','#ffd35a'];}
function awkOp(inst,P,a,tx,ty,K,op,col,sid){
  const at=op.at==='tgt'?[tx,ty]:[P.x,P.y];const ho={kb:op.kb||0,stun:op.stun||0,slow:op.slow||0};const SV=(o)=>fx(inst,Object.assign({k:'sv',c:col,sid},o));
  switch(op.o){
    case 'hpcost':P.hp=Math.max(1,P.hp-P.S.maxHp*op.p);fx(inst,{k:'txt',x:r1(P.x),y:r1(P.y-26),s:'피의 대가',c:'#ff6a5a'});break;
    case 'cone':{const n=op.n||1;for(let i=0;i<n;i++)later(inst,i*(op.gap||0.12),()=>{if(!alive(inst,P))return;let mul=1;if(op.low){const lost=1-P.hp/Math.max(1,P.S.maxHp);mul=1+Math.min(op.low,lost*op.low/0.6);}
        if(op.fx==='whirl')fx(inst,{k:'whirl',id:P.id});else fx(inst,{k:'swing',id:P.id,a:r1(a),d:0.18});SV({s:'awcone',x:r1(P.x),y:r1(P.y),a:r1(a+(i%2?0.4:0)),r:op.r,arc:op.arc,w:op.fx==='whirl'?1:0,d:op.fx==='whirl'?0.45:0.35});
        cone(inst,P,a,op.r,op.arc,op.m*K*mul,ho);});break;}
    case 'nova':{const [x,y]=at;if(op.fx==='quake'){fx(inst,{k:'quake',x:r1(x),y:r1(y),r:op.r});fx(inst,{k:'shake',v:5});}
      SV({s:'awnova',x:r1(x),y:r1(y),r:op.r,f:op.fx||'',d:op.fx==='lpillar'?0.9:0.7});
      aoe(inst,P,x,y,op.r,op.m*K,ho);if(op.curse)for(const m of inst.monsters)if(!m.dead&&Math.hypot(m.x-x,m.y-y)<op.r+m.r)m.curseT=inst.time+6;break;}
    case 'zone':{const [x,y]=at;addZone(inst,P,{x,y,r:op.r,t:op.t,iv:op.iv,dmg:op.m*K,slow:op.slow||0,follow:!!op.follow,vis:op.vis||7});SV(op.follow?{s:'awzone',id:P.id,r:op.r,d:op.t}:{s:'awzone',x:r1(x),y:r1(y),r:op.r,d:op.t});break;}
    case 'buff':buff(P,op.k,op.v,op.t);break;
    case 'pbuff':{for(const q of partyNear(inst,P,op.r))buff(q,op.k,op.v,op.t);SV({s:'awpbuff',x:r1(P.x),y:r1(P.y),r:op.r,d:0.9});break;}
    case 'shield':{const ts=op.self?[P]:partyNear(inst,P,op.r||110);for(const q of ts){const amt=op.hp?P.S.healPow*op.hp*K*(P.S.shieldMul||1):q.S.maxHp*op.p;q.shield=Math.max(q.shield||0,Math.round(amt));q.shieldT=6;q.shieldBy=P.id;SV({s:'awshield',id:q.id,d:1});}break;}
    case 'heal':{fx(inst,{k:'healburst',x:r1(P.x),y:r1(P.y)});SV({s:'awheal',x:r1(P.x),y:r1(P.y),r:op.r,d:1.2});for(const q of partyNear(inst,P,op.r))healPlayer(inst,q,P.S.healPow*op.hp*K,P);break;}
    case 'hot':{for(let i=1;i<=op.n;i++)later(inst,i*op.iv,()=>{if(!alive(inst,P))return;for(const q of partyNear(inst,P,op.r))healPlayer(inst,q,P.S.healPow*op.hp*K,P);SV({s:'awhot',x:r1(P.x),y:r1(P.y),r:op.r,d:0.8});});break;}
    case 'dash':{const [ox,oy]=dashHit(inst,P,a,op.d,op.m*K,{kb:4});fx(inst,{k:'dash',x1:r1(ox),y1:r1(oy),x2:r1(P.x),y2:r1(P.y)});SV({s:'awdash',x1:r1(ox),y1:r1(oy),x2:r1(P.x),y2:r1(P.y),a:r1(a),d:0.5});break;}
    case 'dodge':P.dodgeT=Math.max(P.dodgeT||0,op.t);break;
    case 'beam':{const x2=P.x+Math.cos(a)*op.len,y2=P.y+Math.sin(a)*op.len;SV({s:'awbeam',x1:r1(P.x),y1:r1(P.y-6),x2:r1(x2),y2:r1(y2-6),w:op.w,d:0.55});fx(inst,{k:'shake',v:3});lineHit(inst,P,P.x,P.y,a,op.len,op.w,op.m*K,ho);break;}
    case 'rain':{const fall=op.fx==='kslash'?0:0.28;for(let i=0;i<op.n;i++)later(inst,i*op.gap,()=>{if(!alive(inst,P))return;const t=rf(0,Math.PI*2),d=Math.sqrt(R())*op.r;const x=tx+Math.cos(t)*d,y=ty+Math.sin(t)*d*0.8;
        SV({s:'awdrop',x:r1(x),y:r1(y),r:op.rr,f:op.fx||'',fall,i,d:fall+0.5});
        const hitf=()=>{if(P.inst!==inst)return;if(op.fx!=='kslash'&&i%2===0)fx(inst,{k:'shake',v:2});aoe(inst,P,x,y,op.rr,op.m*K,ho);if(op.star)for(const m of inst.monsters)if(!m.dead&&Math.hypot(m.x-x,m.y-y)<op.rr+m.r)m.starT=inst.time+6;};if(fall)later(inst,fall,hitf);else hitf();});break;}
    case 'chain':{let cur=null,bd=140;for(const m of inst.monsters){if(m.dead||(m.pvp&&!foe(inst,P,m)))continue;const d=Math.hypot(m.x-tx,m.y-ty);if(d<bd){bd=d;cur=m;}}if(!cur)break;const hit=new Set(),pts=[[r1(P.x),r1(P.y-6)]];
      for(let n=0;n<op.n&&cur;n++){hit.add(cur);pts.push([r1(cur.x),r1(cur.y-6)]);hitMonster(inst,cur,P,op.m*K,{slow:op.slow||0});let nx=null,nd=op.r;for(const m of inst.monsters){if(m.dead||hit.has(m)||(m.pvp&&!foe(inst,P,m)))continue;const d=Math.hypot(m.x-cur.x,m.y-cur.y);if(d<nd){nd=d;nx=m;}}if(!nx&&cur&&!cur.dead&&n<op.n-1){nx=cur;hit.delete(cur);}cur=nx;}
      SV({s:'awchain',pts,x:pts[0][0],y:pts[0][1],d:0.7});break;}
    case 'proj':{const types=op.ps||[op.p];const n=op.n||types.length;for(let i=0;i<n;i++){const go=()=>{if(!alive(inst,P))return;let aa=a;if(op.aim){const T=nearFoe(inst,P,220);if(T)aa=Math.atan2(T.y-P.y,T.x-P.x);aa+=rf(-0.06,0.06);}
        else if(op.spread&&types.length>1)aa=a+(i-(types.length-1)/2)*op.spread;fx(inst,{k:'shot',id:P.id,a:r1(aa)});SV({s:'awmuzzle',x:r1(P.x),y:r1(P.y),a:r1(aa),i,d:op.pierce?0.4:0.3});
        const o={life:op.life||1.2};if(op.pierce)o.pierce=true;if(op.boom)o.boom=op.boom;if(op.r)o.r=op.r;spawnPProj(inst,P,types[i%types.length],aa,op.sp,op.m*K,o);};
        if(op.gap)later(inst,i*op.gap,go);else go();}break;}
    case 'fx':break;}}
function awkCast(inst,P,a,tx,ty,k,sid){const sk=SKILLS[sid],W=SH.AWK[sk.adv];[tx,ty]=clampTarget(P,tx,ty,150);const K=awkK(P,k);
  fx(inst,{k:'awkcast',id:P.id,c:W.col});for(const op of sk.ops)awkOp(inst,P,a,tx,ty,K,op,W.col,sid);}
const AWK_CUT=0.85;
for(const a in SH.AWK){const W=SH.AWK[a];
  for(const s of W.sk)if(!s.pas)SK[s.id]=function(inst,P,a2,tx,ty,k){awkCast(inst,P,a2,tx,ty,k,s.id);};
  SK[W.ult]=function(inst,P,a2,tx,ty,k,r){const base=SK[W.base];if(!base)return;const um=1.25*(1+(P.S.awkArt||0));const pu=inst._um;inst._um=(pu||1)*um;
    /* 초각성기 컷씬: 0.85초 연출 동안 제자리 고정 · 시전자 무적(약 1.9초) → 본 궁극기 → 1.4초 뒤 마무리 일격 */
    const D=AWK_CUT;P.gmLock=Math.max(P.gmLock||0,inst.time+D);P.awkInv=inst.time+D+1.05;P.moving=false;
    fx(inst,{k:'awkult',id:P.id,c:W.col,n:SKILLS[W.ult].n,b:P.ch.adv,an:W.n,d:D});try{later(inst,D,()=>{if(!alive(inst,P))return;withFoes(inst,P,()=>base(inst,P,a2,tx,ty,k,r));});}finally{inst._um=pu;}
    const sp=CLASSES[P.ch.cls].prim==='ene'?(P.S.spell||1):1;
    later(inst,D+1.4,()=>{if(!alive(inst,P))return;const x=P.x,y=P.y;fx(inst,{k:'burst',x:r1(x),y:r1(y),r:110,cs:awkHpCol(W.col)});fx(inst,{k:'ring',x:r1(x),y:r1(y),r:100,c:'w',c2:'y'});fx(inst,{k:'shake',v:9});
      aoe(inst,P,x,y,96,4.0*sp*um,{kb:6});if(W.sup)for(const q of partyNear(inst,P,140)){q.shield=Math.max(q.shield||0,Math.round(q.S.maxHp*0.25));q.shieldT=8;q.shieldBy=P.id;fx(inst,{k:'shieldfx',x:r1(q.x),y:r1(q.y)});}});};}
const ULT_OK=new Set(['ragnarok','wargod','aegisdome','judgehammer','skyrain','dragonarrow','apocalypse','absolutezero','angel','divinejudge','dawnblade','heavendance','redmoon','thousandcuts','fortress','finaljudge','deadeye','killzone','cataclysm','supernova','sanctum','purgatory','dawnlegion','eclipsebreak','steamarmor','bigbarrage','siegecannon','bulletballet'].concat((process.env.ULT_OK||'').split(',').filter(Boolean)));;/* 사용자 승인된 궁극기 */function ultOk(id){return ULT_OK.has(id)||!!process.env.BC_DEBUG;}
for(const a in SH.AWK)ULT_OK.add(SH.AWK[a].ult);
/* 1차·공통 스킬 시그니처 이펙트 (castSkill 성공 시 fx k:'sv') */
const BSV={
  whirl:{s:'awcone',w:1,r:40,c:'#e6dcc3',d:0.45},charge:{s:'awdash',at:'dash',c:'#ffb03a',d:0.45},warcry:{s:'selfbuff',follow:1,c:'#ff6a3a',r:120,d:1},
  cleave:{s:'awcone',r:58,arc:0.75,c:'#ffb03a',d:0.35},leap:{s:'awnova',f:'quake',r:40,c:'#ffb03a',delay:0.3,d:0.7},rend:{s:'crimslash',d:0.26},
  berserk:{s:'selfbuff',follow:1,c:'#ff3a4a',d:1},bladestorm:{s:'awzone',st:'blades',follow:1,r:36,c:'#d8e0e8',d:3},execute:{s:'awcone',r:42,arc:0.6,c:'#ff4a3a',d:0.35},
  earthsplit:{s:'awnova',f:'quake',r:72,c:'#ffb03a',d:0.8},rageleap:{s:'awnova',f:'quake',r:34,c:'#ff6a3a',n:3,gap:0.3,delay:0.18,d:0.6},shatter:{s:'awnova',at:'front',off:22,r:26,c:'#ffb03a',d:0.5},
  taunt:{s:'taunt',r:95,d:0.8},bash:{s:'awnova',at:'front',off:16,r:22,c:'#8fd0ff',d:0.45},bulwark:{s:'awpbuff',r:120,c:'#8fd0ff',d:0.9},hook:{s:'awmuzzle',c:'#c8c0b0',d:0.3},
  shieldwall:{s:'awshield',c:'#8fd0ff',d:1.3},consecrate:{s:'hground',r:44,d:5},slam:{s:'awnova',f:'quake',r:50,c:'#8fd0ff',d:0.7},rally:{s:'awpbuff',r:120,c:'#ffd35a',d:0.9},
  shieldthrow:{s:'awmuzzle',c:'#8fd0ff',d:0.3},bastion:[{s:'taunt',r:150,d:0.85},{s:'awpbuff',r:150,c:'#ffd35a',d:0.9}],shieldrush:[{s:'awdash',at:'dash',c:'#8fd0ff',d:0.45},{s:'awnova',at:'front',off:10,r:30,f:'quake',c:'#8fd0ff',d:0.6}],
  multishot:{s:'arrowfan',n:5,sp:0.13,c:'#ffe9a8',d:0.35},pierce:{s:'beamshot',at:'line',len:220,d:0.4},rain:{s:'arrowrain',at:'tgt',range:220,r:34,d:2.5},vault:[{s:'blinkfx',at:'dash',c:'#bfe3ff',d:0.5},{s:'arrowfan',n:3,sp:0.1,c:'#ffe9a8',d:0.35}],
  trap:{s:'trapset',at:'tgt',range:200,c:'#ff8a3a',d:0.6},poison:{s:'arrowfan',n:1,sp:0,c:'#7fd05a',d:0.45},volley:{s:'arrowfan',n:9,sp:0.11,c:'#ffe9a8',d:0.4},sniper:{s:'beamshot',at:'line',len:320,delay:1,d:0.45},
  barrage:{s:'awmuzzle',c:'#e6dcc3',n:12,gap:0.125,d:0.2},shadowshot:{s:'selfbuff',follow:1,c:'#9a7ad8',d:1},galearrow:{s:'gale',r:26,d:2.2},
  fireball:{s:'castfire',d:0.35},nova:{s:'frostnova',r:66,d:0.7},blink:{s:'blinkfx',at:'dash',c:'#c9a0ff',d:0.5},frostorb:{s:'icecast',d:0.35},flamewall:{s:'firepool',at:'tgt',range:200,r:34,d:4},
  blizzard:{s:'frostzone',at:'tgt',range:220,r:60,d:5},overload:{s:'selfbuff',follow:1,c:'#c9a0ff',d:1},blackhole:{s:'vortex',at:'tgt',range:200,r:46,d:3.4},
  shield:{s:'laegis',r:120,d:0.95},sanctuary:{s:'hground',at:'tgt',range:200,r:40,d:5},purify:{s:'gheal',r:80,d:1},holyfire:{s:'beamshot',at:'line',len:300,d:0.4},
  blessing:{s:'awpbuff',r:200,c:'#ffe9a8',d:1},lightpillar:{s:'lpzone',at:'tgt',range:200,r:30,d:5},miracle:{s:'awheal',r:170,c:'#fff2b0',d:1.4},holyburst:{s:'awnova',r:56,c:'#ffe9a8',d:0.7},
  flashdash:{s:'awdash',at:'dash',c:'#ffe9a8',d:0.45},radiantspear:{s:'awbeam',at:'line',len:210,w:12,c:'#ffe9a8',d:0.5},bladedance:{s:'awzone',st:'blades',follow:1,r:40,c:'#ffe9a8',d:3},dawnawaken:{s:'selfbuff',follow:1,c:'#ffd35a',d:1},
};
function baseSV(inst,P,sid,a,tx,ty,ox,oy){const L=BSV[sid];if(!L)return;for(const S of (Array.isArray(L)?L:[L])){const n=S.n||1;for(let i=0;i<n;i++){const go=()=>{if(P.inst!==inst)return;const o={k:'sv',s:S.s,d:S.d||0.6,a:r1(a)};for(const f of ['c','r','arc','f','st','w','n','sp'])if(S[f]!=null)o[f]=S[f];const at=S.at||'self';
  if(S.follow||S.s==='awshield')o.id=P.id;else if(at==='self'){o.x=r1(P.x);o.y=r1(P.y);}else if(at==='front'){o.x=r1(P.x+Math.cos(a)*(S.off||20));o.y=r1(P.y+Math.sin(a)*(S.off||20));}
  else if(at==='tgt'){const[cx,cy]=clampTarget(P,tx,ty,S.range||200);o.x=r1(cx);o.y=r1(cy);}else if(at==='dash'){o.x1=r1(ox);o.y1=r1(oy);o.x2=r1(P.x);o.y2=r1(P.y);}
  else if(at==='line'){o.x1=r1(P.x);o.y1=r1(P.y-6);o.x2=r1(P.x+Math.cos(a)*S.len);o.y2=r1(P.y-6+Math.sin(a)*S.len);}
  if(S.s==='gale'){o.vx=r1(Math.cos(a)*100);o.vy=r1(Math.sin(a)*100);o.x=r1(P.x+Math.cos(a)*10);o.y=r1(P.y+Math.sin(a)*10);}fx(inst,o);};const dl=(S.delay||0)+i*(S.gap||0);if(dl>0)later(inst,dl,go);else go();}}}
function castSkill(inst,P,i,tx,ty){const sid=i===SH.BAR_SIZE?P.ch.rmb:(P.ch.bar&&P.ch.bar[i]);if(!sid)return;const sk=SKILLS[sid];if(!sk||sk.pas||!SK[sid]){skSync(P,sid);return;}const rank=(P.ch.sk&&P.ch.sk[sid])|0;if(rank<1){skSync(P,sid);return;}
  if((P.scd[sid]||0)>0.25){skSync(P,sid);return;}if(P.mp<sk.mp){msg(P,'마나가 부족합니다','#7aa2ff');skSync(P,sid);return;}
  P.mp-=sk.mp;P.scd[sid]=sk.cd*(1-(P.S.cdr||0))*(bOn(P,'clock')?0.5:1);const VR=SH.advVar(P.ch,sid);if(VR&&VR.cd)P.scd[sid]*=VR.cd;const s3=P.S.set3||[];let kk=SH.skillMul(rank)*(P.S.rad||1)*(VR&&VR.mul||1);if(s3.includes('twins')&&P.lastSk&&P.lastSk!==sid)kk*=1.4;const prevSk=P.lastSk;P.lastSk=sid;const a=Math.atan2(ty-P.y,tx-P.x);P.face=Math.cos(a)<0?-1:1;
  inst._el=SKILL_EL[sid]||null;inst._ctr=sk.ctr?1:null;inst._sk=1;inst._src=sid;CUR_CASTER=P;let ok;const ox0=P.x,oy0=P.y;try{ok=withFoes(inst,P,()=>SK[sid](inst,P,a,tx,ty,kk,rank));}finally{inst._el=null;inst._ctr=null;inst._sk=null;inst._src=null;CUR_CASTER=null;}/* 실패한 시전(대상 없음 등)은 태엽·쌍둥이 세트 카운트에 안 들어가게 (예전엔 공짜 실패 시전으로 태엽 폭주를 마음대로 켰음) */if(ok===false)P.lastSk=prevSk;else if(s3.includes('clock')){P.clockN=(P.clockN|0)+1;if(P.clockN>=10){P.clockN=0;buff(P,'clock',1,6);fx(inst,{k:'txt',x:r1(P.x),y:r1(P.y-30),s:'태엽 폭주!',c:'#ffd35a'});fx(inst,{k:'ring',x:r1(P.x),y:r1(P.y),r:36,c:'y',c2:'o'});}}
  if(ok!==false)baseSV(inst,P,sid,a,tx,ty,ox0,oy0);if(ok!==false&&P.S.kata)buff(P,'kms',0.15,2);if(ok!==false&&P.S.adv==='blademaster'){if(P.comboEat){P.comboEat=0;P.combo=0;}else{P.combo=Math.min(5,(P.comboT>inst.time?P.combo|0:0)+(sid==='parry'?2:1));}P.comboT=inst.time+3.5;send(P,{t:'combo',n:P.combo,t2:3.5});}if(ok===false){P.mp+=sk.mp;P.scd[sid]=0;send(P,{t:'cdr',sid});}else{if(VR&&VR.post)varPost(inst,P,VR.post,tx,ty,kk);skSync(P,sid);}}
/* 클라이언트 쿨타임을 서버 실제 값에 맞춘다 (서버가 시전을 거절했는데 클라이언트만 쿨이 돌던 버그) */
function skSync(P,sid){send(P,{t:'scd',sid,left:Math.max(0,Math.round((P.scd[sid]||0)*100)/100)});}
function skBarId(P,i){return i===SH.BAR_SIZE?P.ch.rmb:(P.ch.bar&&P.ch.bar[i]);}
function varPost(inst,P,o,tx,ty,kk){if(o.selfHeal)healPlayer(inst,P,P.S.maxHp*o.selfHeal,P);if(o.selfShield){P.shield=Math.max(P.shield,Math.round(P.S.maxHp*o.selfShield));P.shieldT=5;fx(inst,{k:'shieldfx',x:r1(P.x),y:r1(P.y)});}if(o.buff)buff(P,o.buff[0],o.buff[1],o.buff[2]);if(o.partyBuff){const[k,v,t,r]=o.partyBuff;for(const q of partyNear(inst,P,r))buff(q,k,v,t);fx(inst,{k:'ring',x:r1(P.x),y:r1(P.y),r:r*0.6,c:'y',c2:'w'});}if(o.burst){const[r,m]=o.burst;[tx,ty]=clampTarget(P,tx,ty,220);later(inst,0.25,()=>{if(P.inst!==inst)return;fx(inst,{k:'boom',x:r1(tx),y:r1(ty),r});aoe(inst,P,tx,ty,r,m*kk);});}if(o.healLow){let lo=null;for(const q of partyNear(inst,P,220))if(!lo||q.hp/q.S.maxHp<lo.hp/lo.S.maxHp)lo=q;if(lo)healPlayer(inst,lo,(P.S.healPow||P.S.maxHp*0.05)*o.healLow*kk,P);}}



// ================= 전직 시험: 그림자 분신 =================
const SHADOW_FAM={warrior:'melee',guardian:'melee',knight:'melee',archer:'bow',gunner:'bow',mage:'mage',priest:'priest'};
/* 목표 전투 시간 8분.
   1) 레이드 기록(data/raidlog.jsonl · 보스전 60초 이상 115건)에서 직업별 '보스 DPS ÷ 전투력(SH.power)' 중앙값으로 출발 (공격력 기준보다 흩어짐이 작음)
   2) 레이드 봇과 똑같이 만든 캐릭터로 실제 그림자를 끝까지 잡는 시뮬레이션(피하기 없음·완벽한 위치)을 돌려 직업별로 약 7분이 되게 보정
      → 사람은 예고 장판 피하기·분열·성역 등으로 딜이 끊겨 약 8분 예상. 마법사·빛의 기사는 레이드 기록이 없어 시뮬레이션만으로 맞춤
   체력 = 비율 × 전투력 × 레벨 보정 × 480초 × 0.85 */
const SHADOW_K={warrior:0.074,guardian:0.041,archer:0.053,priest:0.021,mage:0.026,knight:0.05,gunner:0.05},SHADOW_SEC=+(process.env.SHADOW_SEC||480),SHADOW_UP=0.85,SHADOW_ENRAGE=600;
function shadowHp(P){const lv=clamp(Math.pow(P.ch.lvl/40,0.35),0.8,1.15);/* 레벨이 낮을수록 전투력 대비 딜이 낮음(시뮬 30·40·50레벨로 보정) */return Math.round(Math.max(3000,(SHADOW_K[P.ch.cls]||0.06)*SH.power(P.ch)*lv*SHADOW_SEC*SHADOW_UP));}
function spawnShadow(inst,P,advId){const r=inst.map.bossRoom||inst.map.start;const x=r.cx*TS+8,y=r.cy*TS+8;const m=spawnMonster(inst,'shadow',x,y,false);
  const S=P.S,avg=(S.dmgBase||10)*(S.dmgMul||1);m.boss=true;m.home={x,y};inst.bossId=m.id;
  m.maxHp=m.hp=shadowHp(P);m.dmg=m.baseDmg=S.maxHp*0.05;m.spd=Math.max(46,(S.spd||50)*0.9);m.xp=Math.round(40+P.ch.lvl*12);
  m.sa={fam:SHADOW_FAM[P.ch.cls]||'melee',adv:advId,pid:P.id,atk:1.6,pat:4,mim:9,ult:0,busy:0,said:0,split:0,woke:0,heal:null};
  return m;}
// ---------- 그림자의 거울 시전: 플레이어의 스킬을 그대로 실행하되, 목표를 몬스터 대신 그 플레이어로 ----------
function withMirror(inst,ctx,f){const sm=inst.monsters,sx=inst._mir;inst.monsters=[ctx.tp];inst._mir=ctx;try{return f();}finally{inst.monsters=sm;inst._mir=sx;}}
function mirrorCtx(inst,m,T,sid){const Q={id:m.id,inst,ch:T.ch,S:T.S,buffs:{},scd:{},mp:9999,hp:1,dodgeT:0,rootT:0,face:m.face||1,steam:0,holy:0,ws:{readyState:0},mirror:m,combo:0,
    get x(){return m.x;},set x(v){if(!SH.blocked(inst.map,v,m.y,m.r))m.x=v;},get y(){return m.y;},set y(v){if(!SH.blocked(inst.map,m.x,v,m.r))m.y=v;},get downed(){return !!m.dead;}};
  const tp={id:'mir'+m.id,mirrorOf:T,r:4,boss:false,d:{},get x(){return T.x;},set x(v){},get y(){return T.y;},set y(v){},get hp(){return T.hp;},set hp(v){},get maxHp(){return T.S.maxHp;},get dead(){return !!(T.downed||T.inst!==inst||m.dead);},set dead(v){}};
  return{Q,tp,m,sid,dealt:0,cap:m.dmg*5};}
function mirrorHit(inst,tp,Q,mult,o){const ctx=inst._mir;const T=tp.mirrorOf,m=Q&&Q.mirror;if(!m||m.dead||!T||T.downed||T.inst!==inst)return;const c=ctx&&ctx.tp===tp?ctx:null;
  let v=m.dmg*clamp(mult,0.2,3)*0.5*(m.fake?0.6:1);if(c){v=Math.min(v,Math.max(0,c.cap-c.dealt));c.dealt+=v;}if(v<1)return;
  const nm=SKILLS[(c&&c.sid)||inst._src]?SKILLS[(c&&c.sid)||inst._src].n:'기술';hurtPlayer(inst,T,v,m,{what:`그림자가 따라 한 ${nm}`});if(o.slow&&T.dodgeT<=0){T.slowV=Math.max(T.slowV||0,0.3);T.slowT=Math.max(T.slowT||0,Math.min(2,o.slow));}}
/* 따라 할 수 있는 스킬: 적을 공격하는 스킬만 (치유·파티 버프·부활은 제외) */
const MIRROR_OK={};function mirrorOk(sid){if(sid in MIRROR_OK)return MIRROR_OK[sid];const sk=SKILLS[sid],f=SK[sid];let ok=!!(sk&&f&&!sk.pas&&!sk.ult);if(ok){const src=f.toString();ok=/(hitMonster|cone\(|aoe\(|lineHit|dashHit|spawnPProj|gBoom|dmg:)/.test(src)&&!/(healPlayer|reviveNear|partyNear|livingPlayers)/.test(src);}return MIRROR_OK[sid]=ok;}
function shadowMirror(inst,m,T,sid,line,rk){const A=m.sa,sk=SKILLS[sid];const rank=rk||Math.max(1,(T.ch.sk&&T.ch.sk[sid])|0);A.busy=1.1;m.atkT=0.7;
  fx(inst,{k:'bsay',id:m.id,m:line||`「${sk.n}」`});fx(inst,{k:'tele',x:r1(m.x),y:r1(m.y),r:20,d:0.7,c:'p'});const tx=T.x,ty=T.y;fx(inst,{k:'tele',x:r1(tx),y:r1(ty),r:16,d:0.7,c:'o'});
  later(inst,0.7,()=>{if(m.dead||T.downed||T.inst!==inst)return;const ctx=mirrorCtx(inst,m,T,sid);const Q=ctx.Q;const a=Math.atan2(ty-m.y,tx-m.x);Q.face=Math.cos(a)<0?-1:1;m.face=Q.face;
    const pe=inst._el,ps=inst._src,pk=inst._sk,pc=inst._ctr;inst._el=SKILL_EL[sid]||null;inst._src=sid;inst._sk=1;inst._ctr=null;
    try{withMirror(inst,ctx,()=>SK[sid](inst,Q,a,tx,ty,SH.skillMul(rank)*(T.S.rad||1),rank));}catch(e){console.error('mirror',sid,e);}finally{inst._el=pe;inst._src=ps;inst._sk=pk;inst._ctr=pc;}});}
function shadowTarget(inst,m){const P=players.get(m.sa.pid);return P&&P.inst===inst&&!P.downed?P:null;}
function shadowHit(inst,m,x,y,r,mul,what){hitCircle(inst,x,y,r,m.dmg*mul*(m.fake?0.6:1),m,{what});}
function shadowAI(inst,m,dt){const A=m.sa,T=shadowTarget(inst,m);if(m.fake){const R0=inst.monsters.find(q=>q.id===m.cloneOf&&!q.dead);if(!R0||inst.time>A.until||R0.hp<A.endHp){m.dead=true;fx(inst,{k:'blink',x:r1(m.x),y:r1(m.y)});fx(inst,{k:'mdie',id:m.id});inst.monsters=inst.monsters.filter(q=>q!==m);return;}m.hp=R0.hp;}
  if(!T)return;const d=Math.hypot(T.x-m.x,T.y-m.y);
  if(!m.alert){if(d>150&&!(A.dmgIn>0))return;m.alert=true;if(!m.fake){inst.bossMeter=new Map();inst.bossStart=inst.time;fx(inst,{k:'bsay',id:m.id,m:'나는 너다. 네가 걸어온 모든 길의 그림자.'});fx(inst,{k:'sfx',n:'boss'});}}
  A.atk-=dt;A.pat-=dt;A.mim-=dt;A.ult-=dt;if(!m.fake&&!A.rage&&inst.time-(inst.bossStart||inst.time)>SHADOW_ENRAGE){A.rage=1;m.baseDmg*=2;m.dmg*=2;fx(inst,{k:'bsay',id:m.id,m:'더는 기다리지 않겠다.'});fx(inst,{k:'msg',m:'그림자의 폭주 · 10분이 지나 분신의 공격력이 두 배가 됩니다',c:'#ff6a5a'});}if(A.busy>0){A.busy-=dt;return;}
  const f=m.hp/m.maxHp;
  // 기믹 2: 거울 분열 (50%)
  if(!m.fake&&!A.split&&f<=0.5){A.split=1;shadowSplit(inst,m,T);return;}
  // 기믹 3: 미래의 궁극기 (25%부터 반복)
  if(!m.fake&&f<=0.25){if(!A.woke){A.woke=1;m.phase=2;fx(inst,{k:'bsay',id:m.id,m:'보아라. 네가 손에 넣게 될 힘을.'});fx(inst,{k:'shake',v:6});A.ult=0.8;A.busy=1;return;}if(A.ult<=0){A.ult=14;shadowUlt(inst,m,T);return;}}
  // 사제 계열: 자가 치유 채널링 (피해를 넣어 끊기)
  if(A.heal){A.heal.t-=dt;if(A.dmgIn-A.heal.h0>=3||m.hp<A.heal.hp0-m.maxHp*0.015){fx(inst,{k:'txt',x:r1(m.x),y:r1(m.y-30),s:'치유가 끊겼다!',c:'#7fd05a'});A.heal=null;A.busy=0.6;return;}if(A.heal.t<=0){const v=Math.round(m.maxHp*0.04);m.hp=Math.min(m.maxHp,m.hp+v);fx(inst,{k:'heal',x:r1(m.x),y:r1(m.y-20),v});A.heal=null;}return;}
  // 기믹 1: 따라 하기 — 내가 방금 쓴 스킬을 되갚음
  if(!m.fake&&A.mim<=0&&T.lastSk&&mirrorOk(T.lastSk)){A.mim=8;shadowMirror(inst,m,T,T.lastSk,`「${SKILLS[T.lastSk].n}」… 그 기술, 나도 안다.`);return;}
  if(!m.fake&&A.mim<=0&&T.lastSk&&SKILLS[T.lastSk]){A.mim=10;const sk=SKILLS[T.lastSk];const x=T.x,y=T.y;fx(inst,{k:'bsay',id:m.id,m:`「${sk.n}」… 그 기술, 나도 안다.`});fx(inst,{k:'tele',x:r1(x),y:r1(y),r:40,d:1.1,c:'o'});A.busy=0.5;m.atkT=0.5;later(inst,1.1,()=>{if(m.dead)return;fx(inst,{k:'boom',x:r1(x),y:r1(y),r:40,cs:['#ffffff','#9a7ad8','#2a1840']});fx(inst,{k:'shake',v:4});shadowHit(inst,m,x,y,40,2.6,`그림자가 따라 한 ${sk.n}`);});return;}
  // 이동
  const want=A.fam==='melee'?20:A.fam==='bow'?110:95;
  if(d>want+14)chase(inst,m,T,dt,1);else if(A.fam!=='melee'&&d<want-40){const a=Math.atan2(m.y-T.y,m.x-T.x);SH.moveEnt(inst.map,m,Math.cos(a)*m.spd*dt,Math.sin(a)*m.spd*dt);m.moving=true;}
  if(Math.abs(T.x-m.x)>1)m.face=T.x<m.x?-1:1;
  // 직업 계열 패턴
  if(A.pat<=0){A.pat=rf(4.5,6);shadowPattern(inst,m,T);return;}
  // 기본 공격
  if(A.atk<=0){const a=Math.atan2(T.y-m.y,T.x-m.x);
    if(A.fam==='melee'){if(d<30){A.atk=1.5;m.atkT=0.35;later(inst,0.3,()=>{if(m.dead)return;const t2=shadowTarget(inst,m);if(t2&&Math.hypot(t2.x-m.x,t2.y-m.y)<32)hurtPlayer(inst,t2,m.dmg*0.8*(m.fake?0.6:1),m,{what:'그림자의 일격'});});}}
    else{A.atk=A.fam==='bow'?1.3:1.5;m.atkT=0.3;mproj(inst,m,A.fam==='bow'?'arrow':A.fam==='mage'?'fireb':'orb',a,A.fam==='bow'?190:140,m.dmg*(A.fam==='bow'?0.7:0.9)*(m.fake?0.6:1),{sn:'그림자의 '+(A.fam==='bow'?'화살':'주문'),src:m});fx(inst,{k:'sfx',n:A.fam==='bow'?'bow':'cast'});}}}
function shadowPattern(inst,m,T){const A=m.sa;if(A.awk&&A.sib&&R()<0.35){const sk2=SH.ADV[A.sib].sk.filter(s2=>!SKILLS[s2].pas&&SK[s2]&&mirrorOk(s2));if(sk2.length){const s2=sk2[(R()*sk2.length)|0];shadowMirror(inst,m,T,s2,`「${SKILLS[s2].n}」 — 네가 걷지 않은 길이다`,5);return;}}{const bar=(T.ch.bar||[]).concat([T.ch.rmb]).filter(s2=>s2&&mirrorOk(s2)&&((T.ch.sk||{})[s2]|0)>0);if(bar.length&&R()<0.55){shadowMirror(inst,m,T,bar[(R()*bar.length)|0]);return;}}A.busy=0.8;m.atkT=0.5;
  if(A.fam==='melee'){if(R()<0.5){// 돌진 베기
      const x=T.x,y=T.y;fx(inst,{k:'tele',x:r1(x),y:r1(y),r:26,d:0.8,c:'r'});later(inst,0.8,()=>{if(m.dead)return;fx(inst,{k:'blink',x:r1(m.x),y:r1(m.y)});if(!SH.blocked(inst.map,x,y,m.r)){m.x=x;m.y=y;}fx(inst,{k:'slam',x:r1(x),y:r1(y)});shadowHit(inst,m,x,y,26,1.8,'그림자의 돌진 베기');});}
    else{fx(inst,{k:'tele',x:r1(m.x),y:r1(m.y),r:46,d:0.9,c:'r'});later(inst,0.9,()=>{if(m.dead)return;fx(inst,{k:'ring',x:r1(m.x),y:r1(m.y),r:46,c:'r',c2:'k'});shadowHit(inst,m,m.x,m.y,46,1.6,'그림자의 회전베기');});}}
  else if(A.fam==='bow'){if(R()<0.5){const a0=Math.atan2(T.y-m.y,T.x-m.x);for(let i=-3;i<=3;i++)mproj(inst,m,'arrow',a0+i*0.16,180,m.dmg*0.8*(m.fake?0.6:1),{sn:'그림자의 부채 사격',src:m});fx(inst,{k:'sfx',n:'bow'});}
    else{for(let i=0;i<3;i++){const x=T.x+rf(-26,26),y=T.y+rf(-18,18);fx(inst,{k:'tele',x:r1(x),y:r1(y),r:28,d:1,c:'y'});later(inst,1,()=>{if(m.dead)return;fx(inst,{k:'boom',x:r1(x),y:r1(y),r:28});shadowHit(inst,m,x,y,28,1.4,'그림자의 화살비');});}}}
  else if(A.fam==='mage'){if(R()<0.5){const n=12,off=R()*6.28;for(let k=0;k<n;k++){const a=off+k/n*Math.PI*2;mproj(inst,m,'orb',a,90,m.dmg*0.8*(m.fake?0.6:1),{src:m});}fx(inst,{k:'sfx',n:'boss'});}
    else{const x=T.x,y=T.y;fx(inst,{k:'tele',x:r1(x),y:r1(y),r:36,d:1.2,c:'o'});later(inst,1.2,()=>{if(m.dead)return;fx(inst,{k:'boom',x:r1(x),y:r1(y),r:36});fx(inst,{k:'shake',v:4});shadowHit(inst,m,x,y,36,2,'그림자의 운석');});}}
  else{if(!m.fake&&R()<0.5&&m.hp<m.maxHp*0.9&&inst.time>(A.healCd||0)){A.healCd=inst.time+16;A.heal={t:2.2,h0:A.dmgIn||0,hp0:m.hp};A.busy=0;fx(inst,{k:'bsay',id:m.id,m:'빛이여… 나를 다시 세워라.'});fx(inst,{k:'txt',x:r1(m.x),y:r1(m.y-30),s:'치유 영창 · 공격해서 끊으세요!',c:'#ffd35a'});}
    else{const x=T.x,y=T.y;fx(inst,{k:'tele',x:r1(x),y:r1(y),r:34,d:1,c:'y'});later(inst,1,()=>{if(m.dead)return;fx(inst,{k:'lpillar',x:r1(x),y:r1(y),r:34});shadowHit(inst,m,x,y,34,1.8,'그림자의 심판');});}}}
function shadowSplit(inst,m,T){const A=m.sa;A.busy=1.2;fx(inst,{k:'bsay',id:m.id,m:'어느 쪽이 진짜일까?'});fx(inst,{k:'shake',v:5});
  const c=spawnMonster(inst,'shadow',m.x,m.y,false);c.fake=true;c.cloneOf=m.id;c.alert=true;c.maxHp=m.maxHp;c.hp=m.hp;c.dmg=c.baseDmg=m.dmg;c.spd=m.spd;c.xp=0;
  c.sa=Object.assign({},A,{busy:1.2,atk:1.5,pat:3,mim:99,split:1,woke:1,heal:null,until:inst.time+22,endHp:m.hp-m.maxHp*0.15});
  for(const q of [m,c]){for(let t=0;t<20;t++){const p=roomPoint(inst,T,50);if(!SH.blocked(inst.map,p.x,p.y,q.r)){fx(inst,{k:'blink',x:r1(q.x),y:r1(q.y)});q.x=p.x;q.y=p.y;fx(inst,{k:'blink',x:r1(q.x),y:r1(q.y)});break;}}}
  fx(inst,{k:'msg',m:'거울 분열 · 허상을 치면 피해가 반사됩니다',c:'#c9a0e8'});
  later(inst,5,()=>{if(!c.dead)fx(inst,{k:'msg',m:'힌트: 진짜 그림자만 발밑에 그림자가 드리워져 있다',c:'#9e937a'});});}
// 미래의 궁극기: 고른 갈래의 궁극기를 분신이 먼저 보여 준다 (적용 버전 · 예고 후 피할 수 있음)
function shadowUlt(inst,m,T){const A=m.sa,U=SH.ADV[A.adv].ult,sk=SKILLS[U];A.busy=1.4;m.atkT=0.8;
  fx(inst,{k:'msg',m:`미래의 궁극기 · 「${sk.n}」 — 전직하면 네가 쓰게 될 힘이다`,c:SH.ADV[A.adv].col});fx(inst,{k:'bsay',id:m.id,m:`「${sk.n}」!`});fx(inst,{k:'sfx',n:'ult'});
  const mx=m.x,my=m.y,tx=T.x,ty=T.y;const H=(x,y,r,mul,w)=>shadowHit(inst,m,x,y,r,mul,`그림자의 ${sk.n}`);
  switch(U){
    case 'redmoon':fx(inst,{k:'ultart',s:U,mid:m.id,r:70,d:6,spin:0.4});fx(inst,{k:'redsky',d:6});fx(inst,{k:'burst',x:r1(mx),y:r1(my),r:90,cs:['#ff4a3a','#b3282b','#1b0a0a']});m.dmg=m.baseDmg*1.5;A.atk=0;later(inst,6,()=>{m.dmg=m.baseDmg;});fx(inst,{k:'msg',m:'핏빛 광폭화 · 6초간 거리를 벌리세요',c:'#ff6a5a'});break;
    case 'thousandcuts':fx(inst,{k:'ultart',s:U,mid:m.id,r:66,d:3,spin:6});for(let i=0;i<12;i++)later(inst,0.3+i*0.22,()=>{if(m.dead)return;const t2=shadowTarget(inst,m);if(t2&&i%4===0&&!SH.blocked(inst.map,t2.x,t2.y,m.r)){m.x+=(t2.x-m.x)*0.5;m.y+=(t2.y-m.y)*0.5;}const a1=rf(0,6.28),a2=a1+rf(2.2,4);fx(inst,{k:'kslash',x1:r1(m.x+Math.cos(a1)*40),y1:r1(m.y+Math.sin(a1)*24),x2:r1(m.x+Math.cos(a2)*40),y2:r1(m.y+Math.sin(a2)*24)});H(m.x,m.y,50,0.35);});break;
    case 'fortress':fx(inst,{k:'ultart',s:U,mid:m.id,r:100,d:6,spin:0});fx(inst,{k:'dome',x:r1(mx),y:r1(my),r:100,d:6});m.drT=inst.time+6;fx(inst,{k:'msg',m:'불굴의 요새 · 6초간 분신이 받는 피해 -70%',c:'#8fd0ff'});break;
    case 'finaljudge':for(let i=0;i<5;i++){const last=i===4;later(inst,0.2+i*0.5,()=>{if(m.dead)return;const t2=shadowTarget(inst,m)||T;const x=t2.x+rf(-10,10),y=t2.y+rf(-8,8);fx(inst,{k:'tele',x:r1(x),y:r1(y),r:34,d:0.6,c:'y'});fx(inst,{k:'ultart',s:U,x:r1(x),y:r1(y-30),r:last?60:44,d:0.9,drop:1});later(inst,0.6,()=>{if(m.dead)return;fx(inst,{k:'quake',x:r1(x),y:r1(y),r:40});fx(inst,{k:'shake',v:last?8:4});H(x,y,34,last?2.2:1.2);});});}break;
    case 'deadeye':fx(inst,{k:'aim',id:T.id,d:2});fx(inst,{k:'ultart',s:U,pid:T.id,r:22,d:1.6,spin:1});later(inst,1.6,()=>{if(m.dead)return;const t2=shadowTarget(inst,m)||T;const x=t2.x,y=t2.y;fx(inst,{k:'tele',x:r1(x),y:r1(y),r:18,d:0.5,c:'y'});for(let i=0;i<5;i++)later(inst,0.5+i*0.12,()=>{if(m.dead)return;fx(inst,{k:'laser',x1:r1(m.x),y1:r1(m.y-8),x2:r1(x),y2:r1(y-8)});H(x,y,18,0.9);});});fx(inst,{k:'msg',m:'필살 조준 · 조준점이 고정되면 옆으로 피하세요',c:'#ffe9a8'});break;
    case 'killzone':{fx(inst,{k:'tele',x:r1(tx),y:r1(ty),r:80,d:3,c:'z'});fx(inst,{k:'ultart',s:U,x:r1(tx),y:r1(ty),r:80,d:3.4,spin:0.2});const pts=[];for(let i=0;i<8;i++){const t=i/8*Math.PI*2;pts.push([tx+Math.cos(t)*56,ty+Math.sin(t)*36]);}for(const[x,y]of pts)fx(inst,{k:'boom',x:r1(x),y:r1(y),r:8,cs:['z','Z','w']});later(inst,3,()=>{if(m.dead)return;fx(inst,{k:'shake',v:8});for(const[x,y]of pts){fx(inst,{k:'boom',x:r1(x),y:r1(y),r:26});H(x,y,26,1.3);}});fx(inst,{k:'msg',m:'사냥터 · 덫 고리의 한가운데가 안전합니다',c:'#7fd05a'});break;}
    case 'cataclysm':fx(inst,{k:'tele',x:r1(mx),y:r1(my),r:120,d:1.2,c:'o'});for(let i=0;i<3;i++)later(inst,1.2+i*0.7,()=>{if(m.dead)return;fx(inst,{k:'ultart',s:U,x:r1(m.x),y:r1(m.y),r:120,d:0.8,spin:i%2?-1:1,burst:1});fx(inst,{k:'burst',x:r1(m.x),y:r1(m.y),r:120,cs:['#ffffff','#ffd35a','#ff4a3a']});fx(inst,{k:'shake',v:7});H(m.x,m.y,120,1.1);});fx(inst,{k:'msg',m:'대재앙 · 분신에게서 멀리 떨어지세요',c:'#ff8a3a'});break;
    case 'supernova':fx(inst,{k:'tele',x:r1(mx),y:r1(my),r:130,d:1.6,c:'w'});later(inst,1.6,()=>{if(m.dead)return;fx(inst,{k:'ultart',s:U,x:r1(m.x),y:r1(m.y),r:140,d:1.2,spin:0.8,burst:1});fx(inst,{k:'burst',x:r1(m.x),y:r1(m.y),r:140,cs:['#ffffff','#e6d8ff','#8fd0ff']});fx(inst,{k:'flash'});fx(inst,{k:'shake',v:10});H(m.x,m.y,130,3);});fx(inst,{k:'msg',m:'초신성 · 빛이 터지기 전에 범위 밖으로!',c:'#c9a0e8'});break;
    case 'sanctum':fx(inst,{k:'ultart',s:U,x:r1(mx),y:r1(my),r:110,d:5,spin:0.15,ground:1});fx(inst,{k:'lpillar',x:r1(mx),y:r1(my),r:110});{let last=m.sa.dmgIn||0;for(let i=1;i<=5;i++)later(inst,i,()=>{if(m.dead)return;const n=(m.sa.dmgIn||0)-last;last=m.sa.dmgIn||0;const t2=shadowTarget(inst,m);if(n>=3||(t2&&Math.hypot(t2.x-mx,t2.y-my)<110)){fx(inst,{k:'txt',x:r1(m.x),y:r1(m.y-30),s:'성역이 흔들린다!',c:'#7fd05a'});return;}const v=Math.round(m.maxHp*0.01);m.hp=Math.min(m.maxHp,m.hp+v);fx(inst,{k:'heal',x:r1(m.x),y:r1(m.y-20),v});});}fx(inst,{k:'msg',m:'성역 · 빛의 원 안으로 들어가면 분신이 회복하지 못합니다',c:'#fff2b0'});break;
    case 'purgatory':fx(inst,{k:'ultart',s:U,x:r1(tx),y:r1(ty),r:100,d:5,spin:0.3,ground:1});fx(inst,{k:'redsky',d:5});for(let i=0;i<10;i++)later(inst,0.8+i*0.45,()=>{if(m.dead)return;H(tx,ty,100,0.35);});fx(inst,{k:'msg',m:'연옥 · 보랏빛 불꽃 밖으로 나가세요',c:'#9a7ad8'});break;
    case 'dawnlegion':fx(inst,{k:'ultart',s:U,mid:m.id,r:70,d:6,spin:0});fx(inst,{k:'burst',x:r1(mx),y:r1(my),r:90,cs:['#ffffff','#ffe9a8','#ffd35a']});for(let i=0;i<14;i++)later(inst,0.4+i*0.4,()=>{if(m.dead)return;const a=rf(0,6.28),x=m.x+Math.cos(a)*rf(20,60),y=m.y+Math.sin(a)*rf(14,40);fx(inst,{k:'lcut',x:r1(x),y:r1(y),a:r1(a),r:30});H(x,y,24,0.8);});fx(inst,{k:'msg',m:'새벽 군단 · 분신 곁의 빛의 검을 피하세요',c:'#ffe9a8'});break;
    case 'siegecannon':{fx(inst,{k:'gsiege',id:m.id,x:r1(mx),y:r1(my),a:r1(Math.atan2(ty-my,tx-mx)),d:2.8});fx(inst,{k:'msg',m:'공성포 강림 · 붉은 표적을 피해 움직이세요',c:'#ff9a4a'});for(let i=0;i<5;i++)later(inst,0.6+i*0.45,()=>{if(m.dead)return;const t2=shadowTarget(inst,m)||T;const x=t2.x+rf(-8,8),y=t2.y+rf(-6,6);fx(inst,{k:'tele',x:r1(x),y:r1(y),r:36,d:0.55,c:'o'});later(inst,0.55,()=>{if(m.dead)return;fx(inst,{k:'gfire',x:r1(m.x),y:r1(m.y-8),a:r1(Math.atan2(y-m.y,x-m.x)),g:'x',big:2});fx(inst,{k:'gtracer',x:r1(m.x),y:r1(m.y-8),x2:r1(x),y2:r1(y),w:4});fx(inst,{k:'gboom',x:r1(x),y:r1(y),r:36,s:2});fx(inst,{k:'shake',v:6});H(x,y,36,1.4);});});break;}
    case 'bulletballet':{fx(inst,{k:'gballet',id:m.id,d:3.2});fx(inst,{k:'msg',m:'탄환 발레 · 분신의 사선에서 벗어나세요',c:'#8fd0ff'});for(let i=0;i<9;i++)later(inst,0.5+i*0.3,()=>{if(m.dead)return;const t2=shadowTarget(inst,m)||T;const a=Math.atan2(t2.y-m.y,t2.x-m.x)+rf(-0.25,0.25);fx(inst,{k:'gfire',x:r1(m.x),y:r1(m.y-8),a:r1(a),g:'k'});mproj(inst,m,'arrow',a,210,m.dmg*0.45*(m.fake?0.6:1),{sn:'그림자의 탄환 발레',src:m});});later(inst,3.3,()=>{if(m.dead)return;fx(inst,{k:'tele',x:r1(m.x),y:r1(m.y),r:80,d:0.6,c:'c'});later(inst,0.6,()=>{if(m.dead)return;fx(inst,{k:'gspin',id:m.id,d:0.5,big:1});fx(inst,{k:'shake',v:6});H(m.x,m.y,80,1.6);});});break;}
    case 'eclipsebreak':fx(inst,{k:'tele',x:r1(tx),y:r1(ty),r:90,d:1.8,c:'o'});fx(inst,{k:'ultart',s:U,x:r1(tx),y:r1(ty),r:90,d:1.9,drop:1.8});later(inst,1.8,()=>{if(m.dead)return;fx(inst,{k:'boom',x:r1(tx),y:r1(ty),r:90});fx(inst,{k:'flash'});fx(inst,{k:'shake',v:12});H(tx,ty,90,3);});fx(inst,{k:'msg',m:'일식 붕괴 · 떨어지는 태양을 피하세요',c:'#ffb03a'});break;
  }}
// ================= 전직 적용 · 전직 시험 =================
function applyAwk(P){const W=SH.AWK[P.ch.adv];if(!W)return;P.ch.awk=1;P.ch.awl=P.ch.awl|0;P.ch.awx=P.ch.awx|0;P.ch.awn=P.ch.awn||{};P.ch.spts=(P.ch.spts|0)+3;const A=SH.ADV[P.ch.adv];if(P.ch.ult===A.ult)P.ch.ult=W.ult;recalc(P);markDirty(P);
  if(P.inst){bcastRoster(P.inst);fx(P.inst,{k:'burst',x:r1(P.x),y:r1(P.y),r:110,cs:['#ffffff',W.col,'#ffd35a']});fx(P.inst,{k:'awkcast',id:P.id,c:W.col,big:1});fx(P.inst,{k:'sfx',n:'ult'});}
  msg(P,`${W.n}(으)로 각성했습니다! 스킬 포인트 +3 · 스킬 창(K)의 [각성] 탭에서 새 스킬과 각성 포인트를 확인하세요`,'#ffd35a');fx(hub,{k:'msg',m:`${P.ch.name}님이 ${W.n}(으)로 각성했습니다!`,c:W.col});}
function applyAdv(P,id){const A=SH.ADV[id];P.ch.adv=id;recalc(P);markDirty(P);if(P.inst)bcastRoster(P.inst);fx(P.inst,{k:'burst',x:r1(P.x),y:r1(P.y),r:70,cs:['#ffffff',A.col,'#ffd35a']});fx(P.inst,{k:'sfx',n:'ult'});msg(P,`${A.n}(으)로 전직했습니다! 스킬 창(K)의 [전직] 탭에서 새 스킬을 배우세요`,'#ffd35a');
  for(const q of players.values())if(q.ch&&q!==P)msg(q,`${P.ch.name}님이 ${A.n}(으)로 전직했습니다`,'#c9a0e8');}
function startTrial(P,id,re,awk){const A=SH.ADV[id],pt=P.party;const W=awk?SH.AWK[id]:null;
  if(pt.members.size>1){msg(P,'전직 시험은 혼자서만 도전할 수 있어요 · 파티를 떠난 뒤 다시 시도하세요','#ff6a5a');return;}
  if(pt.inst){msg(P,'이미 던전에 있어요','#ff6a5a');return;}
  const inst=createDungeon(pt);inst.trial={adv:id,pid:P.id,cls:P.ch.cls,look:lookOf(P),re:!!re,awk:awk?1:0};
  leaveInst(P);P.inst=inst;inst.players.add(P.id);resetCombat(P);P.hp=P.S.maxHp;P.mp=P.S.maxMp;
  const fl=clamp(5*Math.floor(Math.min(P.ch.best||10,P.ch.lvl+5)/5),10,95);
  loadFloor(inst,fl);
  // 시험장: 잡몹은 치우고 보스(시험관)만 남김 · 혼자 상대하므로 체력 80%
  inst.monsters=[];const sm=spawnShadow(inst,P,id);if(W){sm.maxHp=sm.hp=Math.round(sm.maxHp*1.6);sm.dmg=sm.baseDmg=sm.dmg*1.3;sm.sa.awk=1;sm.sa.sib=Object.keys(SH.ADV).find(k=>k!==id&&SH.ADV[k].cls===P.ch.cls)||null;}
  fx(inst,{k:'msg',m:W?`각성의 시련 · ${W.n} — 흑월 아래, 두 갈래의 힘을 모두 가진 그림자가 기다린다`:`${re?'그림자 재도전':'전직 시험'} · ${A.n} — 가장 깊은 곳에서 너의 그림자가 기다린다`,c:W?W.col:A.col});
  if(re){const R0=P.ch.trl||{};msg(P,`다시 너 자신과 마주한다. ${R0.b?`최고 기록 ${fmtSec(R0.b)} · `:''}쓰러져도 잃는 것은 없다.`,'#e6dcc3');}
  else if(W)msg(P,`「${W.idn}」에 닿고 싶다면, 걷지 않은 길의 너까지 넘어서라. 그림자는 다른 갈래의 기술도 쓴다. 쓰러지면 시련은 실패한다.`,'#e6dcc3');
  else msg(P,`「${A.idn}」의 길을 걷고 싶다면, 먼저 너 자신을 넘어서라. 쓰러지면 시험은 실패한다.`,'#e6dcc3');
  bcastRoster(hub);sendParty(pt);}
function trialWin(inst){const T=inst.trial;if(!T||T.done)return;T.done=1;const P=players.get(T.pid);
  fx(inst,{k:'shake',v:6});fx(inst,{k:'msg',m:'시험 통과! 잠시 후 마을로 돌아갑니다',c:'#ffd35a'});
  if(P&&P.inst===inst){const sec=Math.max(1,Math.round(inst.time-(inst.bossStart||0)));const R0=P.ch.trl||(P.ch.trl={b:0,n:0,d:''});const nb=!R0.b||sec<R0.b;R0.n++;if(nb)R0.b=sec;
    if(T.awk){applyAwk(P);msg(P,`각성의 시련 기록 ${fmtSec(sec)}`,'#c9a0e8');}
    else if(!T.re){applyAdv(P,T.adv);msg(P,`시험 기록 ${fmtSec(sec)} · 한스에게서 언제든 그림자에 재도전할 수 있어요`,'#c9a0e8');}
    else{let g=0;if(R0.d!==dayKey()){R0.d=dayKey();g=Math.round(300+P.ch.lvl*P.ch.lvl*2);P.ch.gold+=g;}
      msg(P,`그림자 재도전 성공 · ${fmtSec(sec)}${nb?' · 최고 기록 갱신!':` (최고 ${fmtSec(R0.b)})`}${g?` · 오늘의 첫 승리 보상 ${g.toLocaleString()}골드`:''}`,'#ffd35a');}
    markDirty(P);}
  inst.trans={t:4,by:'trial'};}
function fmtSec(s){s=Math.round(s);return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;}
function trialFail(inst){const re=inst.trial&&inst.trial.re;for(const P of instPlayers(inst)){joinHub(P);msg(P,inst.trial&&inst.trial.awk?'각성의 시련에 실패했습니다 · 장비와 스킬을 다듬은 뒤 한스에게 다시 도전하세요':re?'그림자에게 패배했습니다 · 한스에게서 언제든 다시 도전할 수 있어요':'전직 시험에 실패했습니다 · 준비를 갖춘 뒤 한스에게 다시 도전하세요','#ff6a5a');if(P.party)sendParty(P.party);}}
// ================= 인스턴스 업데이트 =================
function updatePlayers(inst,dt){
  for(const P of instPlayers(inst)){
    /* 벽 속에 1초 넘게 있으면 가장 가까운 빈칸으로 꺼낸다 */if(!P.downed&&SH.blocked(inst.map,P.x,P.y,3)){P.stuckT=(P.stuckT||0)+dt;if(P.stuckT>1){P.stuckT=0;unstick(inst,P);}}else P.stuckT=0;
    P.atkCd-=dt;P.potCd-=dt;P.dodgeT-=dt;P.dodgeCd-=dt;if(P.undyCd>0)P.undyCd-=dt;if(P.S.aura&&!P.downed){P.auraT=(P.auraT||0)-dt;if(P.auraT<=0){P.auraT=0.5;for(const q of partyNear(inst,P,110)){buff(q,'dmg',P.S.aura,0.8);buff(q,'red',P.S.aura,0.8);}}}if(P.slowT>0){P.slowT-=dt;if(P.slowT<=0)P.slowV=0;}if(P.steam>0&&inst.time-(P.actT||0)>3)P.steam=Math.max(0,P.steam-10*dt);if(P.rootT>0){P.rootT-=dt;if(livingPlayers(inst).some(q=>q!==P&&Math.hypot(q.x-P.x,q.y-P.y)<20)){P.rootT=0;fx(inst,{k:'txt',x:r1(P.x),y:r1(P.y-24),s:'풀려남',c:'#7fd05a'});}}for(const k in P.scd)P.scd[k]-=dt;
    const b=P.buffs;for(const k in b)if(k.endsWith('T'))b[k]-=dt;if(P.shieldT>0){P.shieldT-=dt;if(P.shieldT<=0)P.shield=0;}
    if(P.downed){if(inst.arena)continue;const helpers=livingPlayers(inst).filter(q=>Math.hypot(q.x-P.x,q.y-P.y)<22);
      if(helpers.length){P.rev+=dt*(helpers.some(q=>q.ch.cls==='priest')?2:1);if(P.rev>=3){P.downed=false;P.rev=0;P.hp=Math.round(P.S.maxHp*0.4);fx(inst,{k:'revive',id:P.id});fx(inst,{k:'msg',m:`${P.ch.name}님이 일어났습니다`,c:'#7fd05a'});}}
      else P.rev=Math.max(0,P.rev-dt*0.5);continue;}
    mythTick(inst,P,dt);if(bOn(P,'god')){P.rootT=0;P.slowT=0;P.slowV=0;}P.hp=Math.min(P.S.maxHp,P.hp+P.S.maxHp*0.006*dt*synMods(inst,P).regen*(P.S.regen||1));P.mp=Math.min(P.S.maxMp,P.mp+P.S.mpRegen*dt);
    for(let i=inst.drops.length-1;i>=0;i--){const d=inst.drops[i];if(d.kind==='item'||d.owner!==P.id||inst.time-d.born<0.45)continue;if(Math.hypot(d.x-P.x,d.y-P.y)<((P.ch.pet&&(d.kind==='gold'||d.kind==='gem'))?46:12)){
      if(d.kind==='gold'){P.ch.gold+=d.amt;send(P,{t:'fxp',k:'gold',x:d.x,y:d.y,v:d.amt});}
      else if(d.kind==='gem'){P.ch.gems[d.g]=(P.ch.gems[d.g]|0)+1;send(P,{t:'fxp',k:'gem',x:d.x,y:d.y,g:d.g});msg(P,`${SH.gemName(d.g)} 획득`,SH.GEM_COL[d.g[0]]);bump(P,'gem',1);}
      else{if(P.ch.pots[d.kind]>=9)continue;P.ch.pots[d.kind]++;msg(P,d.kind==='hp'?'체력 물약 획득':'마나 물약 획득',d.kind==='hp'?'#ff7a6a':'#8fd0ff');send(P,{t:'fxp',k:'pot'});}
      markDirty(P);inst.drops.splice(i,1);send(P,{t:'drem',id:d.id});}}
    {const onS=inst.stairsOpen&&inst.map.tiles[Math.floor(P.y/TS)*inst.map.w+Math.floor(P.x/TS)]===2;if(onS&&!P.onStairs&&!inst.trans)send(P,{t:'stairsAsk',floor:inst.floor+1});P.onStairs=onS;}
  }}
function updateDots(inst,dt){for(const m of inst.monsters){if(m.dead||!m.dots||!m.dots.length)continue;for(let i=m.dots.length-1;i>=0;i--){const d=m.dots[i];d.t-=dt;if(d.t>0)continue;d.t=0.5;d.n--;const P=players.get(d.pid);if(P&&P.inst===inst)hitMonster(inst,m,P,d.per,{dotHit:true,src:d.src});if(d.n<=0||m.dead)m.dots.splice(i,1);if(m.dead)break;}}}
function updateProjs(inst,dt){const map=inst.map;
  for(let i=inst.projs.length-1;i>=0;i--){const p=inst.projs[i];p.life-=dt;let dead=p.life<=0;if(dead&&p.lb&&p.boom&&p.owner==='p'){if(p.mir)withMirror(inst,p.mir,()=>explode(inst,p));else explode(inst,p);}
    if(p.aura&&!dead){const P=players.get(p.pid);p.aura.tick-=dt;if(p.aura.tick<=0&&P&&P.inst===inst){p.aura.tick=p.aura.iv;fx(inst,{k:'shards',x:r1(p.x),y:r1(p.y)});aoe(inst,P,p.x,p.y,p.aura.r,p.aura.mult,{slow:1.5});}}
    for(let s=0;s<2&&!dead;s++){p.x+=p.vx*dt/2;p.y+=p.vy*dt/2;
      if(SH.solidAt(map,p.x,p.y)){dead=true;if(p.boom){if(p.mir)withMirror(inst,p.mir,()=>explode(inst,p));else explode(inst,p);}else fx(inst,{k:'spark',x:r1(p.x),y:r1(p.y),c:'W'});break;}
      if(p.ghost)continue;
      if(p.owner==='p'){const P=p.mir?p.mir.Q:players.get(p.pid);if(!P||P.inst!==inst||P.downed&&p.mir){dead=true;break;}
        for(const m of (p.mir?[p.mir.tp]:inst.monsters)){if(m.dead||p.hit.has(m.id)||(m.pvp&&!foe(inst,P,m)))continue;if(Math.hypot(m.x-p.x,m.y-(p.y+2))<m.r+p.r+3){
          if(p.boom){dead=true;if(p.mir)withMirror(inst,p.mir,()=>explode(inst,p));else explode(inst,p);break;}
          p.hit.add(m.id);hitMonster(inst,m,P,p.mult,{kb:p.pierce?0:1,dot:p.dot,slow:p.slow,el:p.el||PROJ_EL[p.type],ctr:p.ctr,src:p.src||'atk',px:p.ctr?p.x-p.vx*0.06:undefined,py:p.ctr?p.y-p.vy*0.06:undefined});if(p.st)addSteam(inst,P,p.st);
          if(p.pierce)continue;
          if(p.bounce>0){p.bounce--;let nx=null,nd=90;for(const o of (p.mir?[]:inst.monsters)){if(o.dead||p.hit.has(o.id))continue;const d=Math.hypot(o.x-p.x,o.y-p.y);if(d<nd){nd=d;nx=o;}}
            if(nx){const sp=Math.hypot(p.vx,p.vy),a=Math.atan2(nx.y-p.y,nx.x-p.x);p.vx=Math.cos(a)*sp;p.vy=Math.sin(a)*sp;p.life=Math.max(p.life,0.8);break;}}
          dead=true;break;}}}
      else{if(p.homing){const ps=livingPlayers(inst);if(ps.length){const T=ps.reduce((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)<Math.hypot(b.x-p.x,b.y-p.y)?a:b);const want=Math.atan2(T.y-p.y,T.x-p.x),cur=Math.atan2(p.vy,p.vx);let da=want-cur;while(da>Math.PI)da-=Math.PI*2;while(da<-Math.PI)da+=Math.PI*2;const na=cur+clamp(da,-p.homing*dt/2,p.homing*dt/2),sp=Math.hypot(p.vx,p.vy);p.vx=Math.cos(na)*sp;p.vy=Math.sin(na)*sp;}}
        for(const P of livingPlayers(inst)){if(Math.hypot(P.x-p.x,P.y-p.y)<4+p.r+1){if(p.burstR){fx(inst,{k:'boom',x:r1(p.x),y:r1(p.y),r:p.burstR});hitCircle(inst,p.x,p.y,p.burstR,p.dmg,null);dead=true;break;}if(p.root&&P.dodgeT<=0){P.rootT=p.root;fx(inst,{k:'txt',x:r1(P.x),y:r1(P.y-24),s:'속박!',c:'#e6dcc3'});}hurtPlayer(inst,P,p.dmg,p.src||null,p.sn?{what:p.sn}:undefined);fx(inst,{k:'spark',x:r1(p.x),y:r1(p.y),c:p.type==='orb'?'p':'W'});dead=true;break;}}}}
    if(dead)inst.projs.splice(i,1);}}
function explode(inst,p){const P=p.mir?p.mir.Q:players.get(p.pid);if(p.gb){if(!P||P.inst!==inst)return;const pe=inst._ctr,ps=inst._src;inst._ctr=p.ctr;inst._src=p.src||'atk';try{gBoom(inst,P,p.x,p.y,p.boom,p.mult,{kb:p.boom>30?8:3,stun:p.stun});}finally{inst._ctr=pe;inst._src=ps;}if(p.st)addSteam(inst,P,p.st);return;}fx(inst,{k:'boom',x:r1(p.x),y:r1(p.y),r:p.boom});fx(inst,{k:'shake',v:1.5});if(!P||P.inst!==inst)return;aoe(inst,P,p.x,p.y,p.boom,p.mult,{kb:4,el:p.el||PROJ_EL[p.type],ctr:p.ctr});}
function updateZones(inst,dt){for(let i=inst.zones.length-1;i>=0;i--){const z=inst.zones[i];if(z.mir)withMirror(inst,z.mir,()=>zoneStep(inst,z,i,dt));else zoneStep(inst,z,i,dt);}}
function zoneStep(inst,z,i,dt){z.t-=dt;const P=z.mir?z.mir.Q:players.get(z.pid);
  if(!P||P.inst!==inst||z.t<=0){inst.zones.splice(i,1);return;}
  if(z.follow){z.x=P.x;z.y=P.y;}
  if(z.vx){const nx=z.x+z.vx*dt,ny=z.y+z.vy*dt;if(SH.blocked(inst.map,nx,ny,4)){z.vx=0;z.vy=0;}else{z.x=nx;z.y=ny;}}
  if(z.pull)for(const m of inst.monsters){if(m.dead||m.boss||m.dummy||m.d.stat)continue;const dx=z.x-m.x,dy=z.y-m.y,d=Math.hypot(dx,dy);if(d<4||d>z.r+34)continue;SH.moveEnt(inst.map,m,dx/d*z.pull*dt,dy/d*z.pull*dt);}
  if(z.dmgb){for(const q of livingPlayers(inst))if(Math.hypot(q.x-z.x,q.y-z.y)<z.r&&(!inst.arena||q.arenaTeam===P.arenaTeam))buff(q,'dmg',z.dmgb,0.6);}
  if(z.dr){CUR_CASTER=P;for(const q of livingPlayers(inst))if(Math.hypot(q.x-z.x,q.y-z.y)<z.r&&(!inst.arena||q.arenaTeam===P.arenaTeam))buff(q,'tred',z.dr,0.35);CUR_CASTER=null;}
  if(z.turret){z.tick-=dt;if(z.tick>0)return;z.tick=z.iv;let T=null,bd=z.r;for(const m of inst.monsters){if(m.dead||m.hidden||!foe(inst,P,m))continue;const d=Math.hypot(m.x-z.x,m.y-z.y);if(d<bd&&SH.los(inst.map,z.x,z.y,m.x,m.y,2)){bd=d;T=m;}}
    if(T){const a=Math.atan2(T.y-z.y,T.x-z.x);fx(inst,{k:'gfire',x:r1(z.x),y:r1(z.y-7),a:r1(a),g:'t'});inst._el='shot';const p=spawnPProj(inst,P,'bullet',a,480,z.dmg,{life:0.6});inst._el=null;p.x=z.x+Math.cos(a)*7;p.y=z.y-9+Math.sin(a)*7;p.src='gturret';p.el='shot';}return;}
  if(z.trap){const hit=inst.monsters.find(m=>!m.dead&&foe(inst,P,m)&&Math.hypot(m.x-z.x,m.y-z.y)<z.r+m.r);if(hit){fx(inst,{k:'boom',x:r1(z.x),y:r1(z.y),r:30});fx(inst,{k:'shake',v:2});aoe(inst,P,z.x,z.y,z.br||30,z.dmg,{slow:z.slow,stun:z.stun,kb:3,src:z.src});if(z.br)fx(inst,{k:'boom',x:r1(z.x),y:r1(z.y),r:z.br});inst.zones.splice(i,1);}return;}
  z.tick-=dt;if(z.tick>0)return;z.tick=z.iv;
  if(z.dmg)aoe(inst,P,z.x,z.y,z.r,z.dmg,{slow:z.slow,ctr:z.ctr,src:z.src});
  if(z.heal)for(const q of livingPlayers(inst))if(Math.hypot(q.x-z.x,q.y-z.y)<z.r)healPlayer(inst,q,z.heal,P);
  if(z.revive)reviveNear(inst,P,z.r);}
function updateTimers(inst,dt){for(let i=inst.timers.length-1;i>=0;i--){const t=inst.timers[i];t.t-=dt;if(t.t<=0){inst.timers.splice(i,1);inst._el=t.el;inst._ctr=t.ctr;inst._sk=t.sk;inst._um=t.um;inst._src=t.src;try{const run=()=>{if(t.mir)withMirror(inst,t.mir,t.f);else t.f();};/* 결투장: 지연된 스킬도 시전자 기준 적만 대상으로 (예전엔 자기 팀 허수아비를 노렸음) */if(t.foe&&inst.arena&&t.foe.inst===inst)withFoes(inst,t.foe,run);else run();}catch(e){console.error('timer',e);}inst._el=null;inst._ctr=null;inst._sk=null;inst._um=null;inst._src=null;}}}
function updateDungeon(inst,dt){
  if(inst.arena){updateArena(inst,dt);return;}
  if(inst.raid){updateRaid(inst,dt);return;}
  if(inst.field){updateField(inst,dt);return;}
  if(inst.paused)return;
  inst.time+=dt;
  if(inst.trans){inst.trans.t-=dt;if(inst.trans.t<=0){if(inst.trial){for(const P of instPlayers(inst)){joinHub(P);if(P.party)sendParty(P.party);}return;}if(inst.floor>=100){victory(inst);return;}loadFloor(inst,inst.floor+1);return;}}
  if(inst.dark>0)inst.dark-=dt;
  updatePlayers(inst,dt);updateMonsters(inst,dt);bossRoomRules(inst);updateEvents(inst,dt);updateDots(inst,dt);updateProjs(inst,dt);updateZones(inst,dt);updateHazards(inst,dt);updateTimers(inst,dt);
  const all=instPlayers(inst);
  if(all.length&&all.every(p=>p.downed)){inst.wipeT+=dt;if(inst.wipeT>=3){inst.wipeT=0;if(inst.trial){trialFail(inst);return;}wipe(inst);}}else inst.wipeT=0;
  inst.meterT-=dt;if(inst.meterT<=0){inst.meterT=1;const bm=inst.bossMeter&&inst.bossId?{name:SH.bossOf(inst.floor).n,floor:inst.floor,time:Math.round(inst.time-inst.bossStart),rows:meterRows(inst.bossMeter)}:null;bcast(inst,{t:'meter',rows:meterRows(inst.meter),boss:bm,hist:inst.bossHist||[]});}
}
// ================= DLC 4막 · 잿빛 황야 (넓은 필드 · 거점 탈환) =================
const FB_R=70,FB_DUR=40,FB_WAVE=5;
function fieldOwned(pt,members){const s=new Set();for(const q of members)for(const id of (q.ch.fbase||[]))s.add(id);return s;}
function createField(pt,members){const inst=createDungeon(pt);inst.dlc=true;inst.map=SH.genField();inst.seed=0;inst.floor=SH.FIELD_FLOOR[0];inst.stairsOpen=false;
  const own=fieldOwned(pt,members);inst.field={bases:inst.map.bases.map(b=>({id:b.id,reg:b.reg,x:b.x,y:b.y,st:own.has(b.id)?'ours':'lost',ev:null})),lairs:inst.map.lairs.map(l=>({reg:l.reg,open:false})),respT:5,healCd:{}};
  for(const q of members){leaveInst(q);q.inst=inst;inst.players.add(q.id);resetCombat(q);q.hp=q.S.maxHp;q.mp=q.S.maxMp;}
  for(let r=0;r<4;r++)fieldLairCheck(inst,r,true);
  fieldPopulate(inst,true);let k=0;for(const P of instPlayers(inst)){placeStart(inst,P,k++);sendMap(P);}bcastRoster(inst);return inst;}
function fieldPub(inst){const F=inst.field;return{b:F.bases.map(b=>[b.id,b.st==='ours'?2:b.ev?1:0,b.ev?Math.max(0,Math.round(b.ev.t)):0,b.ev?b.ev.kills:0,b.ev?b.ev.need:0]),l:F.lairs.map(l=>l.open?1:0),fb:fbPub(inst)};}
function fieldSend(inst){bcast(inst,{t:'fld',st:fieldPub(inst)});}
function fieldNear(inst,x,y,r){for(const P of instPlayers(inst))if(!P.downed&&Math.hypot(P.x-x,P.y-y)<r)return true;return false;}
function fieldSpawn(inst,reg,type,x,y,elite){const f0=inst.floor;inst.floor=SH.FIELD_FLOOR[reg];const m=spawnMonster(inst,type,x,y,elite);inst.floor=f0;m.f=SH.FIELD_FLOOR[reg];m.reg=reg;return m;}
function fieldFreeSpot(inst,reg,minFromPlayers){const map=inst.map,g=map.regions[reg];for(let t=0;t<60;t++){const tx=ri(g.x0+2,g.x1-2),ty=ri(g.y0+2,g.y1-2);if(SH.tileAt(map,tx,ty)!==1)continue;const x=tx*TS+8,y=ty*TS+8;
    if(Math.hypot(x-map.camp.x,y-map.camp.y)<320)continue;if(inst.field.bases.some(b=>Math.hypot(b.x-x,b.y-y)<FB_R+60))continue;if(map.lairs.some(l=>tx>=l.room.x-1&&tx<=l.room.x+l.room.w&&ty>=l.room.y-1&&ty<=l.room.y+l.room.h))continue;
    if(minFromPlayers&&fieldNear(inst,x,y,minFromPlayers))continue;return{x,y};}return null;}
const FIELD_PACKS=16;
function fieldPopulate(inst,init){for(let reg=0;reg<4;reg++){const have=inst.monsters.filter(m=>!m.dead&&m.reg===reg&&!m.fev).length;const want=FIELD_PACKS*3.5;let tries=init?FIELD_PACKS:Math.min(2,Math.ceil((want-have)/3.5));
    for(let p=0;p<tries&&(init||have<want);p++){const sp=fieldFreeSpot(inst,reg,init?0:520);if(!sp)continue;const n=ri(3,4)+(inst.players.size>4?1:0);const el=R()<0.1;for(let i=0;i<n;i++){let x=sp.x+rf(-24,24),y=sp.y+rf(-24,24);if(SH.blocked(inst.map,x,y,5)){x=sp.x;y=sp.y;}fieldSpawn(inst,reg,pickType(30+reg*10),x,y,el&&i===0);}}}}
function fieldLairCheck(inst,reg,quiet){const F=inst.field,L=F.lairs[reg];if(L.open)return;if(!F.bases.filter(b=>b.reg===reg).every(b=>b.st==='ours'))return;L.open=true;const ml=inst.map.lairs[reg];for(const i of ml.door)tileSet(inst,i,1,quiet);
  if(!quiet){fx(inst,{k:'msg',m:`${inst.map.regions[reg].n}의 보스 둥지가 열렸다!`,c:'#ffd35a'});fx(inst,{k:'sfx',n:'boss'});}}
function fieldBaseStart(inst,P,b){if(b.st==='ours'||b.ev)return;const n=Math.max(1,instPlayers(inst).filter(q=>!q.downed&&Math.hypot(q.x-b.x,q.y-b.y)<FB_R*2).length);
  b.ev={t:FB_DUR,wave:1.5,kills:0,need:10+n*4,away:0};fx(inst,{k:'msg',m:`${P.ch.name}님이 꺼진 화로에 불을 붙였다! ${FB_DUR}초 동안 지켜 내세요`,c:'#ff9a5a'});fx(inst,{k:'sfx',n:'boss'});fieldSend(inst);}
function fieldBaseTick(inst,b,dt){const E=b.ev;E.t-=dt;E.wave-=dt;const reg=b.reg;
  if(E.wave<=0&&E.t>4){E.wave=FB_WAVE;const n=Math.max(1,instPlayers(inst).filter(q=>!q.downed&&Math.hypot(q.x-b.x,q.y-b.y)<FB_R*2).length);const c=3+n;
    for(let i=0;i<c;i++){const a=R()*Math.PI*2;let x=b.x+Math.cos(a)*150,y=b.y+Math.sin(a)*150;for(let t=0;t<8&&SH.blocked(inst.map,x,y,5);t++){const a2=R()*Math.PI*2;x=b.x+Math.cos(a2)*rf(90,160);y=b.y+Math.sin(a2)*rf(90,160);}if(SH.blocked(inst.map,x,y,5))continue;const m=fieldSpawn(inst,reg,pickType(30+reg*10),x,y,R()<0.12);m.fev=b.id;m.alert=true;fx(inst,{k:'blink',x:r1(x),y:r1(y)});}}
  if(!fieldNear(inst,b.x,b.y,FB_R*2.4)){E.away+=dt;if(E.away>6){b.ev=null;for(const m of inst.monsters)if(m.fev===b.id)m.fev=null;fx(inst,{k:'msg',m:'화로를 지키지 못했다… 불이 다시 꺼졌다',c:'#ff6a5a'});fieldSend(inst);return;}}else E.away=0;
  if(E.t<=0){if(E.kills>=E.need){fieldBaseWin(inst,b);}else{E.t=8;fx(inst,{k:'msg',m:`조금만 더! 적을 ${E.need-E.kills}마리 더 쓰러뜨리세요`,c:'#ffb03a'});}}
  if(((E.t*2)|0)!==E.lt){E.lt=(E.t*2)|0;fieldSend(inst);}}
/* 화로 기록: 처음이면 기록하고 유물 가방을 넓힘 (true 반환) */function fbaseCredit(P,b){const fb=P.ch.fbase||(P.ch.fbase=[]);if(fb.includes(b.id))return false;fb.push(b.id);const lv=Math.min(SH.RBAG_SZ.length-1,Math.floor(fb.length/3));if(lv>(P.ch.rbagLv|0)){P.ch.rbagLv=lv;P.ch.rbag=SH.relicResize(P.ch.rbag,lv);const s=SH.RBAG_SZ[lv];msg(P,`유물 가방이 ${s[0]}×${s[1]}로 넓어졌다!`,'#ffd35a');}markDirty(P);return true;}
function fieldBaseWin(inst,b){b.ev=null;b.st='ours';for(const m of inst.monsters)if(m.fev===b.id){m.fev=null;}
  fx(inst,{k:'msg',m:`거점 탈환! 화로가 다시 타오른다 (${inst.map.regions[b.reg].n})`,c:'#7fd05a'});fx(inst,{k:'boom',x:r1(b.x),y:r1(b.y),r:60,c:1});fx(inst,{k:'sfx',n:'legend'});
    for(const P of instPlayers(inst)){if(Math.hypot(P.x-b.x,P.y-b.y)>FB_R*4)continue;/* 보상(유물·골드)은 내가 처음 되찾을 때만 */if(fbaseCredit(P,b)){relicGain(P,SH.randRelicDrop(R));P.ch.gold+=400+b.reg*150;send(P,{t:'fxp',k:'gold'});}markDirty(P);}
  fieldLairCheck(inst,b.reg,false);fieldSend(inst);}
function updateField(inst,dt){if(inst.paused)return;inst.time+=dt;const F=inst.field;/* 황야는 층이 바뀌지 않아 바닥 아이템이 끝없이 쌓였음 → 5분 지나면 사라짐 */if(((inst.time*2)|0)!==((inst.time*2-dt*2)|0))for(let i=inst.drops.length-1;i>=0;i--)if(inst.time-(inst.drops[i].born||0)>300)remDrop(inst,inst.drops[i]);
  updatePlayers(inst,dt);updateMonsters(inst,dt);updateDots(inst,dt);updateProjs(inst,dt);updateZones(inst,dt);updateHazards(inst,dt);updateTimers(inst,dt);
  for(const b of F.bases)if(b.ev)fieldBaseTick(inst,b,dt);
  // 되찾은 화로: 곁에 있으면 회복 · 물약 보충(60초마다)
  for(const P of instPlayers(inst)){if(P.downed){if(!P.fDown){P.fDown=true;P.raidRev=inst.time+5;send(P,{t:'rrev',at:5,auto:0,field:1});}continue;}P.fDown=false;
        const nb=F.bases.find(b=>b.st==='ours'&&Math.hypot(P.x-b.x,P.y-b.y)<46)||(Math.hypot(P.x-inst.map.camp.x,P.y-inst.map.camp.y)<46?{id:'camp'}:null);
    /* 파티원이 이미 켜 둔 화로라도, 곁에 가면 내 기록에도 남음 (신규 캐릭터가 고수와 함께 가도 유물 가방 진행이 쌓이게) */if(nb&&nb.id!=='camp'&&fbaseCredit(P,nb))msg(P,`화로를 기록했어요 (${(P.ch.fbase||[]).length}/${F.bases.length})`,'#ffd35a');
    if(nb){P.hp=Math.min(P.S.maxHp,P.hp+P.S.maxHp*0.08*dt);P.mp=Math.min(P.S.maxMp,P.mp+P.S.maxMp*0.08*dt);const k=P.id;if(!(F.healCd[k]>inst.time)){F.healCd[k]=inst.time+60;let g=0;for(const t of ['hp','mp'])if(P.ch.pots[t]<5){g+=5-P.ch.pots[t];P.ch.pots[t]=5;}if(g){msg(P,'화로의 온기 · 물약을 채웠다','#ffd35a');markDirty(P);}}}}
  F.respT-=dt;if(F.respT<=0){F.respT=8;fieldPopulate(inst,false);}
  for(let reg=0;reg<4;reg++){const L=F.lairs[reg];if(L.open&&(!L.boss||L.boss.dead)&&(L.resp||0)<=inst.time){const ml=inst.map.lairs[reg];if(fieldNear(inst,ml.cx,ml.cy,260))fieldBossSpawn(inst,reg);}}
  inst.monsters=inst.monsters.filter(m=>!m.dead||inst.time-(m.deadT||(m.deadT=inst.time))<2);
  const all=instPlayers(inst);if(all.length&&all.every(p=>p.downed)){inst.wipeT+=dt;if(inst.wipeT>=20){inst.wipeT=0;for(const P of all){msg(P,'일행이 모두 쓰러졌다 · 가까운 화로에서 다시 일어난다','#ff6a5a');fieldRevive(inst,P);}}}else inst.wipeT=0;
  inst.meterT-=dt;if(inst.meterT<=0){inst.meterT=1;bcast(inst,{t:'meter',rows:meterRows(inst.meter),boss:null,hist:[]});}}
// 필드 부활: 가장 가까운 되찾은 화로(없으면 야영지)
function fieldRevive(inst,P){const F=inst.field;let best=inst.map.camp,bd=Math.hypot(P.x-best.x,P.y-best.y);for(const b of F.bases)if(b.st==='ours'){const d=Math.hypot(P.x-b.x,P.y-b.y);if(d<bd){bd=d;best=b;}}
  P.downed=false;P.fDown=false;P.rev=0;P.hp=Math.round(P.S.maxHp*0.5);P.x=best.x+rf(-12,12);P.y=best.y+rf(10,20);unstick(inst,P,true);P.awkInv=inst.time+2;send(P,{t:'tp',x:P.x,y:P.y});send(P,{t:'rrev',at:-1});fx(inst,{k:'revive',id:P.id});}
// ===== 잿빛 황야 · 둥지 보스 4종 =====
function lairPt(inst,reg,a,b){const L=inst.map.lairs[reg].room;return{x:(L.x+L.w*a)*TS,y:(L.y+L.h*b)*TS};}
function inLair(inst,reg,x,y,pad){const L=inst.map.lairs[reg].room;pad=pad||0;return x>=L.x*TS-pad&&x<(L.x+L.w)*TS+pad&&y>=L.y*TS-pad&&y<(L.y+L.h)*TS+pad;}
function lairPlayers(inst,reg){return livingPlayers(inst).filter(p=>inLair(inst,reg,p.x,p.y,4));}
function fieldBossSpawn(inst,reg){const F=inst.field,L=F.lairs[reg];if(!L.open||L.boss&&!L.boss.dead||(L.resp||0)>inst.time)return;const c=lairPt(inst,reg,0.5,0.4);
  const b=fieldSpawn(inst,reg,'boss',c.x,c.y,false);const n=Math.max(1,inst.players.size);b.boss=true;b.home={x:b.x,y:b.y};b.lair=reg;b.hp=b.maxHp=Math.round(b.maxHp*2.4*(1+0.15*reg)*(1+BAL.bossPartyHp*(n-1)));b.dmg*=1.25*(1+0.06*reg)*(1+BAL.bossPartyDmg*(n-1));b.baseDmg=b.dmg;b.partyCd=1/(1+BAL.bossPartyTempo*(n-1));b.r=13;b.raidAI=fieldBossAI;b.fs={t:6,t2:9,t3:14};
  const S=b.fs;if(reg===1)S.cand=[[0.12,0.2],[0.5,0.12],[0.88,0.2],[0.12,0.85],[0.5,0.92],[0.88,0.85]].map(([a,c2])=>Object.assign(lairPt(inst,reg,a,c2),{lit:1}));
  if(reg===2)S.pil=[[0.2,0.28],[0.8,0.28],[0.2,0.75],[0.8,0.75]].map(([a,c2])=>Object.assign(lairPt(inst,reg,a,c2),{ok:1}));
  if(reg===0)S.safe=[lairPt(inst,reg,0.2,0.5),lairPt(inst,reg,0.8,0.5)];L.boss=b;fieldSend(inst);}
function fbPub(inst){const out=[];for(const L of inst.field.lairs){const b=L.boss;if(!b||b.dead){out.push(0);continue;}const S=b.fs;out.push({id:b.id,cand:S.cand?S.cand.map(c=>[r1(c.x),r1(c.y),c.lit]):null,pil:S.pil?S.pil.map(p=>[r1(p.x),r1(p.y),p.ok]):null,safe:S.safe&&S.tomb?S.safe.map(s=>[r1(s.x),r1(s.y)]):null,duel:S.duel?[r1(S.duel.x),r1(S.duel.y),S.duel.r,S.duel.pid,r1(S.duel.t)]:null});}return out;}
function fieldBossAI(inst,m,T,d,dt,sm){const reg=m.lair,S=m.fs;inst.map.bossRoom=inst.map.lairs[reg].room;
  // 둥지 밖으로는 쫓아가지 않음
  if(!lairPlayers(inst,reg).length){m.alert=false;m.tgt=null;if(Math.hypot(m.x-m.home.x,m.y-m.home.y)>8){const a=Math.atan2(m.home.y-m.y,m.home.x-m.x);SH.moveEnt(inst.map,m,Math.cos(a)*60*dt,Math.sin(a)*60*dt);m.moving=true;}if(m.hp<m.maxHp)m.hp=Math.min(m.maxHp,m.hp+m.maxHp*0.05*dt);if(S.duel)S.duel=null;return;}
  if(T&&!inLair(inst,reg,T.x,T.y,4)){const ps=lairPlayers(inst,reg);T=ps[0];m.tgt=T;}
  if(m.stun>0)return;
  S.t-=dt;S.t2-=dt;S.t3-=dt;const ph2=m.hp/m.maxHp<0.5;
  if(reg===0){ // 재의 거인
    if(S.t<=0&&!(m.busy>0)){S.t=ph2?15:19;S.tomb=1;fx(inst,{k:'bsay',id:m.id,m:'재로 돌아가라!'});fx(inst,{k:'msg',m:'재의 무덤! 작은 화로 곁으로!',c:'#ff9a5a'});for(const s of S.safe)fx(inst,{k:'tele',x:r1(s.x),y:r1(s.y),r:34,d:3.5,c:'y'});fieldSend(inst);m.busy=3.6;
      later(inst,3.5,()=>{S.tomb=0;fieldSend(inst);if(m.dead)return;fx(inst,{k:'shake',v:8});const c=lairPt(inst,reg,0.5,0.5);fx(inst,{k:'boom',x:r1(c.x),y:r1(c.y),r:160,c:1});for(const p of lairPlayers(inst,reg))if(!S.safe.some(s=>Math.hypot(p.x-s.x,p.y-s.y)<34))hurtPlayer(inst,p,p.S.maxHp*0.75,m,{what:'재의 무덤',nododge:true});});return;}
    if(S.t2<=0){S.t2=ph2?7:9;for(const p of lairPlayers(inst,reg)){fx(inst,{k:'tele',x:r1(p.x),y:r1(p.y),r:26,d:1,c:'o'});addHz(inst,{x:p.x,y:p.y,r:26,t:6,arm:1,dmg:m.dmg*0.3,slow:0.45,vis:21,src:m});}}
    if(ph2&&S.t3<=0){S.t3=24;inst.dark=6;fx(inst,{k:'msg',m:'재 폭풍이 몰아친다! 시야가 흐려진다',c:'#9e937a'});}}
  if(reg===1){ // 촛불 사제
    const out=S.cand.filter(c=>!c.lit).length;m.dmg=m.baseDmg*(1+0.08*out);
    if(S.t<=0){S.t=ph2?5:7;const lit=S.cand.filter(c=>c.lit);if(lit.length){const c=pick(lit);c.lit=0;fx(inst,{k:'blink',x:r1(c.x),y:r1(c.y)});fx(inst,{k:'msg',m:`촛불이 꺼졌다… (${S.cand.filter(c=>!c.lit).length}/6) G로 다시 붙이세요`,c:'#8fd0ff'});fieldSend(inst);}
      if(S.cand.every(c=>!c.lit)){fx(inst,{k:'bsay',id:m.id,m:'어둠이여, 모두 삼켜라!'});fx(inst,{k:'shake',v:10});const c0=lairPt(inst,reg,0.5,0.5);fx(inst,{k:'boom',x:r1(c0.x),y:r1(c0.y),r:180});for(const p of lairPlayers(inst,reg))hurtPlayer(inst,p,p.S.maxHp*0.6,m,{what:'어둠의 의식',nododge:true});for(let i=0;i<3;i++)S.cand[i*2].lit=1;fieldSend(inst);}}
    if(S.t2<=0){S.t2=6;const k=Math.floor(out/2);for(let i=0;i<k;i++){const c=pick(S.cand);const a=fieldSpawn(inst,reg,'zombie',c.x,c.y+10,false);a.alert=true;a.summ=1;fx(inst,{k:'blink',x:r1(a.x),y:r1(a.y)});}}
    if(ph2&&S.t3<=0){S.t3=11;const c=lairPt(inst,reg,0.5,0.5);for(const [dx,dy] of [[1,0],[0,1]])for(let k=-5;k<=5;k++){const x=m.x+dx*k*22,y=m.y+dy*k*22;if(!inLair(inst,reg,x,y))continue;addHz(inst,{x,y,r:14,t:0.1,arm:1.3,burst:m.dmg*1.4,vis:21,src:m});}fx(inst,{k:'msg',m:'화염 십자!',c:'#ff8a3a'});}}
  if(reg===2){ // 유리 전갈 여왕
    if(S.t<=0&&!(m.busy>0)&&T){S.t=ph2?9:12;const tx=T.x,ty=T.y;const x0=m.x,y0=m.y;m.busy=1.6;m.faceLock=inst.time+1.6;fx(inst,{k:'bsay',id:m.id,m:'찢어발겨 주마!'});
      for(let k=1;k<=8;k++){const x=x0+(tx-x0)*k/8,y=y0+(ty-y0)*k/8;fx(inst,{k:'tele',x:r1(x),y:r1(y),r:16,d:1.2,c:'r'});}
      later(inst,1.2,()=>{if(m.dead)return;const L=Math.hypot(tx-x0,ty-y0)||1;let hit=null,ht=1;for(const p of S.pil){if(!p.ok)continue;const t=Math.max(0,Math.min(1,((p.x-x0)*(tx-x0)+(p.y-y0)*(ty-y0))/(L*L)));const px=x0+(tx-x0)*t,py=y0+(ty-y0)*t;if(Math.hypot(p.x-px,p.y-py)<22&&t<ht){ht=t;hit=p;}}
        const ex=x0+(tx-x0)*ht,ey=y0+(ty-y0)*ht;for(const p of lairPlayers(inst,reg)){const t=Math.max(0,Math.min(ht,((p.x-x0)*(tx-x0)+(p.y-y0)*(ty-y0))/(L*L)));if(Math.hypot(p.x-(x0+(tx-x0)*t),p.y-(y0+(ty-y0)*t))<20)hurtPlayer(inst,p,p.S.maxHp*0.45,m,{what:'돌진'});}
        m.x=ex;m.y=ey;if(SH.blocked(inst.map,m.x,m.y,6)){m.x=x0;m.y=y0;}fx(inst,{k:'tp',x:r1(m.x),y:r1(m.y)});
        if(hit){hit.ok=0;m.stun=4;m.vuln=5;fx(inst,{k:'boom',x:r1(hit.x),y:r1(hit.y),r:40,c:1});fx(inst,{k:'shake',v:8});fx(inst,{k:'msg',m:'유리 기둥에 부딪혔다! 기절 · 받는 피해 2배',c:'#7fd05a'});fieldSend(inst);}});return;}
    if(S.t2<=0){S.t2=10;const ps=lairPlayers(inst,reg);if(ps.length){const P=pick(ps);fx(inst,{k:'mark',id:P.id,d:3,c:'g',txt:'독침'});later(inst,3,()=>{if(P.downed||m.dead)return;const x=P.x,y=P.y;fx(inst,{k:'boom',x:r1(x),y:r1(y),r:40,c:1});hitCircle(inst,x,y,40,m.dmg*1.8,m);addHz(inst,{x,y,r:34,t:5,arm:0.2,dmg:m.dmg*0.25,vis:21,src:m});});}}
    if(ph2&&S.t3<=0&&!(m.busy>0)&&T){S.t3=16;m.hidden=true;m.busy=2.4;fx(inst,{k:'msg',m:'여왕이 모래 속으로 숨었다!',c:'#d8c890'});later(inst,1.4,()=>{if(m.dead)return;const ps=lairPlayers(inst,reg);const P=ps.length?pick(ps):T;fx(inst,{k:'tele',x:r1(P.x),y:r1(P.y),r:44,d:1,c:'r'});const x=P.x,y=P.y;later(inst,1,()=>{if(m.dead)return;m.hidden=false;m.x=x;m.y=y;if(SH.blocked(inst.map,x,y,6)){m.x=m.home.x;m.y=m.home.y;}fx(inst,{k:'boom',x:r1(x),y:r1(y),r:44});hitCircle(inst,x,y,44,m.dmg*2,m);});});return;}}
  if(reg===3){ // 꺼진 성주
    if(S.duel){S.duel.t-=dt;const D=S.duel;const P=players.get(D.pid);for(const p of lairPlayers(inst,reg)){const dd=Math.hypot(p.x-D.x,p.y-D.y);if(p.id===D.pid){if(dd>D.r-6){const a=Math.atan2(p.y-D.y,p.x-D.x);p.x=D.x+Math.cos(a)*(D.r-10);p.y=D.y+Math.sin(a)*(D.r-10);send(p,{t:'tp',x:p.x,y:p.y});}}else if(dd<D.r+6){const a=Math.atan2(p.y-D.y,p.x-D.x)||0;p.x=D.x+Math.cos(a)*(D.r+12);p.y=D.y+Math.sin(a)*(D.r+12);if(SH.blocked(inst.map,p.x,p.y,4))unstick(inst,p,true);send(p,{t:'tp',x:p.x,y:p.y});}}
      if(Math.hypot(m.x-D.x,m.y-D.y)>D.r-14){m.x=D.x;m.y=D.y;}if(D.t<=0||!P||P.downed){S.duel=null;fx(inst,{k:'msg',m:P&&!P.downed?'결투에서 살아남았다!':'결투가 끝났다',c:P&&!P.downed?'#7fd05a':'#ff6a5a'});fieldSend(inst);}else if(((D.t*2)|0)!==D.lt){D.lt=(D.t*2)|0;fieldSend(inst);}
      if(P&&!P.downed){m.tgt=P;}}
    else if(S.t<=0&&!(m.busy>0)){S.t=ph2?18:23;const ps=lairPlayers(inst,reg);if(ps.length){const P=pick(ps);S.duel={pid:P.id,x:P.x,y:P.y,r:64,t:12};m.x=P.x+30*(P.x<m.x?1:-1);m.y=P.y;if(SH.blocked(inst.map,m.x,m.y,6)){m.x=P.x;m.y=P.y-20;}fx(inst,{k:'tp',x:r1(m.x),y:r1(m.y)});fx(inst,{k:'bsay',id:m.id,m:`${P.ch.name}, 나와 겨뤄라!`});fx(inst,{k:'msg',m:`성주의 결투! ${P.ch.name}님과 일대일 · 바깥은 망령을 막으세요`,c:'#ffd35a'});
        for(let i=0;i<4;i++){const c=lairPt(inst,reg,[0.1,0.9,0.1,0.9][i],[0.15,0.15,0.85,0.85][i]);const a=fieldSpawn(inst,reg,'skel',c.x,c.y,false);a.alert=true;a.summ=1;}fieldSend(inst);m.busy=0.8;return;}}
    if(S.t2<=0){S.t2=ph2?6:8;const L=inst.map.lairs[reg].room;const horiz=R()<0.5;for(let k=0;k<3;k++){const v=horiz?(L.y+1+R()*(L.h-2))*TS:(L.x+1+R()*(L.w-2))*TS;for(let s=0;s<(horiz?L.w:L.h);s+=1.5){const x=horiz?(L.x+s)*TS:v,y=horiz?v:(L.y+s)*TS;addHz(inst,{x,y,r:12,t:0.1,arm:1.4,burst:m.dmg*1.3,vis:21,src:m});}}fx(inst,{k:'msg',m:'성채 포격!',c:'#ffb03a'});}}
  bossAI(inst,m,T,d,dt,sm);}
// 결투 중: 결투자 말고는 피해 없음
function fieldDuelBlock(m,P){if(!m.fs||!m.fs.duel)return false;return P&&P.id!==m.fs.duel.pid;}
function fieldBossKill(inst,m){const reg=m.lair,F=inst.field;const L=F.lairs[reg];L.boss=null;L.resp=inst.time+180;fx(inst,{k:'msg',m:`${inst.map.regions[reg].n}의 보스를 쓰러뜨렸다! (3분 뒤 다시 깨어남)`,c:'#ffd35a'});fx(inst,{k:'sfx',n:'legend'});
  for(const P of instPlayers(inst)){if(Math.hypot(P.x-m.x,P.y-m.y)>500)continue;const n=2+(reg>=2?1:0);for(let i=0;i<n;i++)relicGain(P,SH.randRelicDrop(R));if(R()<0.35){const fam=CLASSES[P.ch.cls].fam;const sl=['weapon','armor','ring',null][reg];const it=SH.genSet('ember',SH.FIELD_LV[reg]+1,fam,R,sl||undefined);addDrop(inst,{kind:'item',owner:P.id,it},m.x,m.y);msg(P,`잿불 세트 「${it.name}」을(를) 얻었다!`,'#4ad86a');}const fbs=P.ch.fboss||(P.ch.fboss={});fbs[reg]=(fbs[reg]|0)+1;P.ch.gold+=1500*(reg+1);send(P,{t:'fxp',k:'gold'});markDirty(P);}
  fieldSend(inst);}
function victory(inst){const ps=instPlayers(inst);for(const P of ps){P.ch.cleared=(P.ch.cleared|0)+1;markDirty(P);}for(const P of ps){joinHub(P);send(P,{t:'victory'});msg(P,'지하 100층 정복! 심연의 심장이 멈췄다','#ffd35a');if(P.party)sendParty(P.party);}}
function wipe(inst){fx(inst,{k:'msg',m:'파티가 전멸했습니다 · 입구에서 다시 시작합니다',c:'#ff6a5a'});
  inst.projs=[];inst.zones=[];inst.timers=[];inst.hz=[];inst.dark=0;
  for(const m of inst.monsters){m.dots=null;if(m.boss){m.hp=m.maxHp;m.alert=false;m.x=m.home.x;m.y=m.home.y;m.wind=0;m.charge=0;m.bossInit=false;m.busy=0;m.invul=0;m.vuln=0;m.hidden=false;m.didSplit=false;m.didDoom=false;m.burnOn=false;m.enraged=false;m.dmg=m.baseDmg||m.dmg;}m.taunt=null;m.tgt=null;}
  inst.monsters=inst.monsters.filter(m=>!m.summ);
  for(const m of inst.monsters)if(!m.boss)m.alert=false;
  inst.bossMeter=null;let k=0;
  for(const P of instPlayers(inst)){P.downed=false;P.rev=0;P.hp=Math.round(P.S.maxHp*0.6);P.mp=P.S.maxMp;placeStart(inst,P,k++);send(P,{t:'tp',x:P.x,y:P.y});}}

// ================= 레이드 =================
const RAID_TF={bell:1,mirror:36,clock:31,moon:46}; // 타일 테마용 층
const PARTY_MAX=8;
function raidScale(L,n,hard){const f=L;return (1+BAL.monHpPerFloor*(f-1))*(1+BAL.monHpCurve*(f-1))*(1+BAL.bossHpCurve*(f-1))*BAL.bossHp*(hard?40:32)*[0,0.22,0.5,0.76,1,1.22,1.44,1.66,1.88][clamp(n,1,PARTY_MAX)];}
function createRaid(pt,id,mode,members){const def=SH.RAIDS.find(r=>r.id===id);const seed=(Math.random()*2147483647)|0;const hard=mode==='hard',practice=mode==='practice';const day=dayKey();
  const inst={id:'r'+(nextId++),type:'dungeon',party:pt,players:new Set(),floor:def.lvl,seed,map:SH.genRaid(id,seed),monsters:[],projs:[],drops:[],zones:[],timers:[],hz:[],dark:0,fx:[],paused:null,mid:1,pid:1,did:1,time:0,flows:new Map(),meter:new Map(),bossMeter:null,bossStart:0,trans:null,wipeT:0,meterT:0,stairsOpen:false,ev:null,traps:[],
    raid:{id,def,mode,hard,practice,deaths:members.length>4?3+Math.ceil((members.length-4)*0.75):3,stage:'gate',bossT:0,enr:Math.round(((RAID_TUNE[id]||{}).enr||540)*(hard?0.8:1)),day,elig:members.filter(q=>!practice&&SH.raidLeft(q.ch,id,day)>0).map(q=>q.ch.id)/* 보상은 레이드마다 하루 3회 */,done:false,fail:false,endT:0,rings:[],tethers:[],bb:null,pz:null,gT:4,auc:null,n:members.length}};
  dungeons.set(inst.id,inst);pt.inst=inst;
  for(const q of members){leaveInst(q);q.inst=inst;inst.players.add(q.id);resetCombat(q);q.hp=q.S.maxHp;q.mp=q.S.maxMp;q.raidRev=0;q.raidDown=false;}
  let k=0;for(const q of members){q.x=inst.map.startPt.x+(k%2?12:-12);q.y=inst.map.startPt.y-(k>>1)*12;k++;}
  RAIDX[id].init(inst);
  for(const q of members){sendMap(q);}bcastRoster(inst);bcastRoster(hub);sendParty(pt);raidState(inst);
    fx(inst,{k:'msg',m:`${def.n} (${hard?'하드':practice?'연습':'노말'}) · 파티 데스 카운트 ${practice?'무제한':inst.raid.deaths}`,c:'#ffd35a'});
  if(!practice)for(const q of members){const left=SH.raidLeft(q.ch,id,day);msg(q,left>0?`오늘 이 레이드 보상 ${left}/${SH.RAID_DAILY}회 남음`:`오늘 이 레이드 보상 ${SH.RAID_DAILY}회를 모두 받았어요 · 보상 없이 함께 진행합니다`,left>0?'#ffd35a':'#ff9a5a');}
  }
function rst(inst,P){const r=inst.raid;if(!r||!P||!P.ch)return null;const S=r.st||(r.st={});return S[P.id]||(S[P.id]={ctr:0,gim:0,deaths:0,mit:0});}
function raidMvp(inst){const r=inst.raid;const ps=instPlayers(inst);const T=Math.max(1,r.bossT||1);const rows=ps.map(P=>{const m=inst.meter.get(P.id)||{dmg:0,taken:0,heal:0,shield:0};const s=rst(inst,P);return{id:P.id,name:P.ch.name,cls:P.ch.cls,dmg:Math.round(m.dmg),dps:Math.round(m.dmg/Math.max(1,inst.time)),heal:Math.round(m.heal),shield:Math.round(m.shield),taken:Math.round(m.taken),mit:Math.round(s.mit),ctr:s.ctr,gim:s.gim,deaths:s.deaths};});
  const mx=k=>Math.max(1,...rows.map(x=>x[k]));for(const x of rows)x.score=Math.round(x.dmg/mx('dmg')*50+(x.heal+x.shield+x.mit)/mx2(rows)*30+x.taken/mx('taken')*8+x.ctr*4+x.gim*3-x.deaths*6);
  const best=rows.reduce((a,b)=>b.score>a.score?b:a,rows[0]);bcast(inst,{t:'mvp',rows,mvp:best?best.id:null,title:`${r.def.n} · ${r.hard?'하드':r.practice?'연습':'노말'}`,time:Math.round(inst.time),boss:Math.round(r.bossT)});}
function mx2(rows){return Math.max(1,...rows.map(x=>x.heal+x.shield+x.mit));}
function votePub(inst){const v=inst.raid.vote;return v?{by:v.by,yes:[...v.yes],no:[...v.no],n:inst.players.size,t:Math.ceil(v.t)}:null;}
function voteCheck(inst){const r=inst.raid,v=r.vote;if(!v)return;/* 떠난 사람의 표는 빼고 셈 (예전엔 찬성한 둘이 나가면 남은 둘의 뜻과 상관없이 포기됐음) */for(const s of[v.yes,v.no])for(const id of[...s])if(!inst.players.has(id))s.delete(id);const n=inst.players.size;if(v.yes.size*2>n){r.vote=null;bcast(inst,{t:'rvote',st:null});raidFail(inst,'파티가 포기에 동의했습니다');return;}
  if(v.no.size*2>=n||v.t<=0){r.vote=null;r.voteCd=inst.time+30;fx(inst,{k:'msg',m:'포기 투표가 부결되었습니다 · 계속 도전합니다',c:'#9e937a'});}bcast(inst,{t:'rvote',st:votePub(inst)});}
function raidPub(inst){const r=inst.raid;const pz=r.pz;return{id:r.id,clash:!!(r.clash||r.beat),mode:r.mode,deaths:r.practice?-1:r.deaths,stage:r.stage,bossT:Math.round(r.bossT),enr:r.enr,done:r.done,fail:r.fail,retry:r.fail&&r.retry?Math.max(0,Math.ceil(r.endT)):0,
  hl:r.hl||null,x:RAIDX[r.id]&&RAIDX[r.id].pub?RAIDX[r.id].pub(inst):null,pz:(r.id==='bell'&&pz)?{round:pz.round,total:pz.rounds.length,st:pz.st,n:pz.inp.length,len:pz.seq.length}:null,bb:r.bb?{need:r.bb.need,hit:Object.keys(r.bb.hit).map(Number),t:Math.max(0,Math.round(r.bb.t))}:null,door:!!r.doorOpen,elig:r.elig,gm:gmPub(inst)};}
/* 레이드 부활: 쓰러지고 RREV_WAIT초 뒤 직접 [부활] (단체 기믹·격돌 중에는 잠김) · 전멸은 7초 뒤 자동 */
const RREV_WAIT=5,RREV_PEN=30;
function raidRevBlock(inst){const r=inst.raid;if(!r)return null;if(r.gm)return `${r.gm.name} 진행 중`;if(r.clash)return '격돌 진행 중';if(r.beat)return '역격돌 진행 중';return null;}
function raidRevive(inst,P){const r=inst.raid;P.downed=false;P.raidDown=false;P.raidWipe=false;P.rev=0;P.hp=Math.round(P.S.maxHp*0.6);P.gmLock=0;P.rootT=0;
  const pt=r.stage==='boss'?inst.map.bossEntry:inst.map.startPt;let x=pt.x,y=pt.y;
  if(r.split&&inst.map.bossRoom){const br=inst.map.bossRoom,mid=(br.x+Math.floor(br.w/2))*TS;const ps=livingPlayers(inst).filter(q=>q!==P);const L=ps.filter(q=>q.x<mid).length,Rn=ps.length-L;x=L<=Rn?mid-TS*3:mid+TS*3;}
  P.x=x;P.y=y;unstick(inst,P,true);P.awkInv=inst.time+2;P.dodgeT=Math.max(P.dodgeT||0,0.3);send(P,{t:'tp',x:P.x,y:P.y});send(P,{t:'rrev',at:-1});fx(inst,{k:'revive',id:P.id});fx(inst,{k:'txt',x:r1(P.x),y:r1(P.y-26),s:'부활! (2초 무적)',c:'#7fd05a'});}
// 벽(막힌 칸)에 겹친 사람을 가장 가까운 빈자리로 옮김
function unstick(inst,P,quiet){const map=inst.map;const rad=P.r||4;if(!SH.blocked(map,P.x,P.y,rad))return false;const tx0=Math.floor(P.x/TS),ty0=Math.floor(P.y/TS);
  const seen=new Set([tx0+','+ty0]);const q=[[tx0,ty0]];while(q.length){const [tx,ty]=q.shift();const cx=tx*TS+8,cy=ty*TS+8;if(!SH.blocked(map,cx,cy,rad)){P.x=cx;P.y=cy;if(!quiet)send(P,{t:'tp',x:P.x,y:P.y});return true;}
    if(seen.size>900)break;for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=tx+dx,ny=ty+dy;const k=nx+','+ny;if(nx<0||ny<0||nx>=map.w||ny>=map.h||seen.has(k))continue;seen.add(k);q.push([nx,ny]);}}return false;}
function unstickAll(inst){for(const P of instPlayers(inst))unstick(inst,P);}
function raidState(inst){bcast(inst,{t:'raid',st:raidPub(inst)});}
function openRaidDoor(inst){const r=inst.raid;if(r.doorOpen)return;r.doorOpen=true;for(const i of inst.map.door)tileSet(inst,i,1);fx(inst,{k:'msg',m:'문이 열렸다! 보스방으로',c:'#ffd35a'});fx(inst,{k:'shake',v:3});raidState(inst);}
function raidFail(inst,why){const r=inst.raid;if(r.fail||r.done)return;r.fail=true;for(const b of inst.monsters)if(b.boss&&!b.dead)b.invul=99;raidLog(inst,'fail',why);r.retry=r.doorOpen&&!/포기/.test(why||'')?1:0;r.endT=r.retry?30:6;fx(inst,{k:'msg',m:`공략 실패 · ${why}`,c:'#ff4a3a'});if(r.retry)fx(inst,{k:'msg',m:'[2관문부터 재도전]을 누르면 퍼즐 없이 보스방 앞에서 바로 다시 시작해요 (30초)',c:'#ffd35a'});fx(inst,{k:'sfx',n:'boss'});raidState(inst);}
function updateRaid(inst,dt){const r=inst.raid;inst.time+=dt;
  if(r.fail||(r.done&&!r.auc)){r.endT-=dt;if(r.endT<=0){for(const P of instPlayers(inst)){joinHub(P);if(P.party)sendParty(P.party);}return;}}
  if(r.auc)updateAuction(inst,dt);
  if(r.vote){const b=Math.ceil(r.vote.t);r.vote.t-=dt;if(r.vote.t<=0)voteCheck(inst);else if(Math.ceil(r.vote.t)!==b)bcast(inst,{t:'rvote',st:votePub(inst)});}
  updatePlayers(inst,dt);if(!r.fail&&!r.done){updateMonsters(inst,dt);bossRoomRules(inst);}
  updateDots(inst,dt);updateProjs(inst,dt);updateZones(inst,dt);updateHazards(inst,dt);updateTimers(inst,dt);
  // 데스 카운트
  for(const P of instPlayers(inst)){if(P.downed&&!P.raidDown){P.raidDown=true;P.raidRev=inst.time+RREV_WAIT;P.raidPen=inst.time+RREV_WAIT+RREV_PEN;P.raidWipe=false;send(P,{t:'rrev',at:RREV_WAIT,pen:RREV_WAIT+RREV_PEN,auto:0});rst(inst,P).deaths++;if(!r.practice&&!r.done&&!r.fail){r.deaths--;fx(inst,{k:'msg',m:r.deaths>=0?`${P.ch.name}님이 쓰러졌습니다 · 남은 데스 카운트 ${r.deaths}`:`${P.ch.name}님이 쓰러졌습니다 · 데스 카운트 초과`,c:'#ff6a5a'});if(r.deaths<0){raidFail(inst,'데스 카운트를 모두 썼습니다');}raidState(inst);}}
    if(!P.downed&&P.raidDown)P.raidDown=false;
    if(P.downed&&P.raidDown&&P.raidWipe&&inst.time>=P.raidRev&&!r.fail)raidRevive(inst,P);
    else if(P.downed&&P.raidDown&&!P.raidWipe&&!r.fail&&!r.done&&P.raidPen){if(raidRevBlock(inst))P.raidPen+=dt;else if(inst.time>=P.raidPen){P.raidPen=0;
      if(!r.practice){r.deaths--;rst(inst,P).deaths++;fx(inst,{k:'msg',m:`${P.ch.name}님이 30초 안에 일어나지 않아 데스 카운트 1 추가 차감 (남은 ${Math.max(0,r.deaths)})`,c:'#ff6a5a'});if(r.deaths<0){raidFail(inst,'데스 카운트를 모두 썼습니다');raidState(inst);continue;}raidState(inst);}
      raidRevive(inst,P);}}}
  if(r.fail||r.done)return;
  // 보스전 시작·광폭화
  const b=inst.monsters.find(m=>m.boss&&!m.dead);if(b&&b.alert&&r.stage!=='boss'){r.stage='boss';raidState(inst);}
  if(r.stage==='boss'&&b){r.bossT+=dt;if(r.bossT>=r.enr&&!r.enraged){r.enraged=true;fx(inst,{k:'msg',m:'광폭화했다! 서두르세요',c:'#ff4a3a'});for(const bb of bossList(inst))bb.dmg*=6;}}
  if(RAIDX[r.id].update)RAIDX[r.id].update(inst,dt);
  if(r.stage==='boss'&&!r.fail&&!r.done)gmUpdate(inst,dt);
  // 종소리 고리
  for(let i=r.rings.length-1;i>=0;i--){const g=r.rings[i];g.r+=g.v*dt;if(g.r>g.max){r.rings.splice(i,1);continue;}for(const P of livingPlayers(inst)){if(g.hit.has(P.id))continue;const d=Math.hypot(P.x-g.x,P.y-g.y);if(Math.abs(d-g.r)<7){g.hit.add(P.id);hurtPlayer(inst,P,g.dmg,null,{what:'종소리 파동'});}}}
  // 쇠사슬
  for(let i=r.tethers.length-1;i>=0;i--){const t=r.tethers[i];const A=players.get(t.a),B=t.b==='boss'?b:players.get(t.b);if(!A||!B||A.inst!==inst||A.downed){r.tethers.splice(i,1);continue;}const d=Math.hypot(A.x-B.x,A.y-B.y);t.ok=d>=t.len;t.t-=dt;t.tk-=dt;
    if(t.tk<=0){t.tk=0.5;if(!t.ok){hurtPlayer(inst,A,t.dmg*0.15,null,{what:'조여 오는 쇠사슬',quiet:true});if(B.ch&&!B.downed)hurtPlayer(inst,B,t.dmg*0.15,null,{what:'조여 오는 쇠사슬',quiet:true});}}
    if(t.t<=0){r.tethers.splice(i,1);if(!t.ok){fx(inst,{k:'boom',x:r1(A.x),y:r1(A.y),r:20});hurtPlayer(inst,A,t.dmg*1.6,null,{what:'쇠사슬 폭발'});if(B.ch&&!B.downed)hurtPlayer(inst,B,t.dmg*1.6,null,{what:'쇠사슬 폭발'});}else{fx(inst,{k:'txt',x:r1(A.x),y:r1(A.y-24),s:'사슬 끊음!',c:'#7fd05a'});rst(inst,A).gim++;if(B.ch)rst(inst,B).gim++;}}}
  inst.meterT-=dt;if(inst.meterT<=0){inst.meterT=1;const bm=inst.bossMeter&&b?{name:b.bname,floor:inst.floor,time:Math.round(inst.time-inst.bossStart),rows:meterRows(inst.bossMeter)}:null;bcast(inst,{t:'meter',rows:meterRows(inst.meter),boss:bm,hist:inst.bossHist||[]});raidState(inst);}
  if(!instPlayers(inst).length)return;}
// ---- 종탑: 1관문 퍼즐 · 잡몹 ----
const BELL_TONE=[0,1,2,3];
function updateBellRaid(inst,dt){const r=inst.raid,pz=r.pz;
  if(r.stage==='gate'){r.gT-=dt;if(r.gT<=0){r.gT=r.hard?6:8;const alive=inst.monsters.filter(m=>!m.dead&&m.type==='ghoul').length;if(alive<(r.hard?7:5)){const map=inst.map;for(let k=0;k<2;k++){const x=(map.start.x+1+ri(0,map.start.w-3))*TS+8,y=(map.start.y+1+ri(0,2))*TS+8;if(SH.blocked(map,x,y,5))continue;const m=spawnMonster(inst,'ghoul',x,y,false);m.alert=true;fx(inst,{k:'blink',x:r1(x),y:r1(y)});}}}}
  if(!pz||pz.st==='done')return;pz.t-=dt;
  if(pz.st==='wait'&&pz.t<=0){const len=pz.rounds[pz.round];pz.seq=[];for(let i=0;i<len;i++)pz.seq.push(ri(0,3));pz.inp=[];pz.st='show';pz.t=0.9+len*0.75;bcast(inst,{t:'bseq',seq:pz.seq,step:0.75});raidState(inst);}
  else if(pz.st==='show'&&pz.t<=0){pz.st='input';pz.t=r.hard?14:22;raidState(inst);hint(inst,'bellseq','#ffd35a');}
  else if(pz.st==='input'&&pz.t<=0){bellWrong(inst,'시간 초과');}}
function bellWrong(inst,why){const r=inst.raid,pz=r.pz;hintUp(inst,'bellseq');fx(inst,{k:'msg',m:`틀렸다! (${why}) 종소리가 망자를 깨운다`,c:'#ff6a5a'});fx(inst,{k:'shake',v:4});
  for(const P of livingPlayers(inst))hurtPlayer(inst,P,P.S.maxHp*(r.hard?0.4:0.22),null,{what:'성난 종소리',nododge:true});
  const bb=inst.map.bigBell;for(let k=0;k<3;k++){const m=spawnMonster(inst,'ghoul',bb.x+rf(-30,30),bb.y+rf(10,30),false);m.alert=true;}
  pz.st='wait';pz.t=2.5;raidState(inst);}
function ringBell(inst,P,i){const r=inst.raid;const map=inst.map;
  if(r.stage==='gate'&&r.pz&&!r.doorOpen){const b=map.bells[i];if(!b||Math.hypot(P.x-b.x,P.y-b.y)>30)return;fx(inst,{k:'bell',c:b.c,x:b.x,y:b.y});const pz=r.pz;if(pz.st!=='input')return;
    const want=pz.seq[pz.inp.length];if(b.c!==want){bellWrong(inst,'순서가 틀림');return;}pz.inp.push(b.c);rst(inst,P).gim++;
    if(pz.inp.length>=pz.seq.length){pz.round++;if(pz.round>=pz.rounds.length){pz.st='done';openRaidDoor(inst);}else{pz.st='wait';pz.t=1.8;fx(inst,{k:'msg',m:`정답! ${pz.round}/${pz.rounds.length}`,c:'#7fd05a'});}}raidState(inst);return;}
  const bb=r.bb;if(!bb)return;const b=map.bossBells[i];if(!b||i>=bb.need||Math.hypot(P.x-b.x,P.y-b.y)>30)return;fx(inst,{k:'bell',c:b.c,x:b.x,y:b.y});
  rst(inst,P).gim++;const now=inst.time;for(const k in bb.hit)if(now-bb.hit[k]>bb.win)delete bb.hit[k];bb.hit[i]=now;
  if(Object.keys(bb.hit).length>=bb.need){const m=inst.monsters.find(x=>x.boss&&!x.dead);r.bb=null;if(m){m.invul=0;m.stun=4;m.grog=inst.time+5;m.busy=0;fx(inst,{k:'counter',id:m.id,x:r1(m.x),y:r1(m.y),by:''});fx(inst,{k:'msg',m:'종이 동시에 울렸다! 보호막이 깨지고 그레고르가 휘청인다',c:'#8fd0ff'});}}
  raidState(inst);}
// ---- 그레고르 AI ----
const RAID_AI={r_greg:gregAI,r_lyra:lyraAI,r_nora:noraAI,r_valen:valenAI,r_golem:valenAI,r_karnas:karnasAI};
const RAID_LINES={bell:['또 종을 울리러 왔나… 이번엔 너희 장례식 종이다!','종소리가… 멈춘다… 드디어… 조용하구나…']};
function gregAI(inst,m,T,d,dt,sm){const r=inst.raid;if(!(m.faceLock>inst.time))m.face=T.x<m.x?-1:1;m.fightT+=dt;const hpf=m.hp/m.maxHp;
  if(m.phase===1&&hpf<0.5){m.phase=2;m.patCd=0.6;bossCard(inst,'bell2');fx(inst,{k:'bsay',id:m.id,m:'종탑이… 무너진다! 너희도 함께!'});fx(inst,{k:'shake',v:5});}
  // 종 동시 타격 (무적 보호막)
  const marks=r.hard?[0.85,0.55,0.25]:[0.7,0.35];m.bbDone=m.bbDone||0;
  if(!r.bb){gmTrig(inst,'sil1',hpf<(r.hard?0.88:0.8),'silence');gmTrig(inst,'fun1',m.phase>1&&hpf<0.45,'funeral');if(r.hard){gmTrig(inst,'sil2',hpf<0.3,'silence');gmTrig(inst,'fun2',hpf<0.14,'funeral');}}
  if(m.bbDone<marks.length&&hpf<marks[m.bbDone]&&!r.bb&&!r.gm){m.bbDone++;const need=Math.max(1,Math.min(4,livingPlayers(inst).length));r.bb={need,hit:{},win:r.hard?1.5:4,t:12};m.invul=99;m.busy=0;m.atkT=0;
    fx(inst,{k:'bsay',id:m.id,m:'내 종을 멈출 수 있겠느냐!'});hint(inst,'bb','#8fd0ff',{need,win:r.hard?'1.5':'4'},{open:()=>!!inst.raid.bb,wait:6});raidState(inst);}
  if(r.bb){r.bb.t-=dt;r.bb.need=Math.max(1,Math.min(r.bb.need,livingPlayers(inst).length));/* 중간에 누가 떠나거나 쓰러지면 필요한 종 수도 줄임 */if(r.bb.t<=0){const bb=r.bb;r.bb=null;m.invul=0;hintUp(inst,'bb');fx(inst,{k:'msg',m:'종을 멈추지 못했다! 파멸의 종소리',c:'#ff4a3a'});fx(inst,{k:'shake',v:8});fx(inst,{k:'boom',x:r1(m.x),y:r1(m.y),r:200});
      for(const P of livingPlayers(inst))hurtPlayer(inst,P,r.hard?P.S.maxHp*3:P.S.maxHp*0.75,null,{what:'파멸의 종소리',nododge:true});raidState(inst);}
    if(m.busy>0)m.busy-=dt;else{const st=m.spd*0.6*dt;if(d>30)chase(inst,m,T,dt,sm*0.6);}return;}
  if(m.busy>0){m.busy-=dt;return;}
  m.ctrCd=(m.ctrCd==null?rf(10,14):m.ctrCd)-dt;if(m.ctrCd<=0){m.ctrCd=rf(14,19)*(m.phase>1?0.85:1);m.busy=counterWindow(inst,m,T);return;}
  m.patCd-=dt;if(m.patCd<=0){const pool=m.phase>1?['wave','chain','march','collapse','collapse','slam']:['wave','chain','march','slam'];let opts=pool.filter(p=>p!==m.last);if(livingPlayers(inst).length<2&&R()<0.5)opts=opts.filter(p=>p!=='chain');const name=pick(opts);m.last=name;
    m.busy=GREG[name](inst,m,T);m.patCd=rf(1.8,2.8)*(r.hard?0.8:1)*(m.phase>1?0.85:1);return;}
  if(d<m.r+4+18&&m.cd<=0){m.cd=m.d.cd;m.busy=BP.swipe(inst,m,T);return;}
  chase(inst,m,T,dt,sm*(r.enraged?1.5:1));}
const GREG={
  wave(inst,m){const r=inst.raid;const t=0.7*m.tf;m.atkT=t;fx(inst,{k:'tele',x:r1(m.x),y:r1(m.y),r:30,d:t,c:'y'});fx(inst,{k:'sfx',n:'boss'});
    later(inst,t,()=>{if(m.dead)return;r.rings.push({x:m.x,y:m.y,r:12,v:120,max:300,dmg:m.dmg*1.3,hit:new Set()});fx(inst,{k:'bell',c:4,x:m.x,y:m.y});if(r.hard||m.phase>1)later(inst,0.7,()=>{if(!m.dead)r.rings.push({x:m.x,y:m.y,r:12,v:120,max:300,dmg:m.dmg*1.3,hit:new Set()});});});return t+0.5;},
  chain(inst,m){const r=inst.raid;const ps=livingPlayers(inst);if(!ps.length)return 0.3;const len=r.hard?110:90;
    if(ps.length>=2){const a=ps.splice(ri(0,ps.length-1),1)[0],b=ps[ri(0,ps.length-1)];r.tethers.push({a:a.id,b:b.id,t:6,tk:0.5,len,dmg:m.dmg,ok:false});hint(inst,'chain','#ffb03a',{who:`${a.ch.name}님과 ${b.ch.name}님`},{occ:1});}
    else{const a=ps[0];r.tethers.push({a:a.id,b:'boss',t:6,tk:0.5,len:110,dmg:m.dmg,ok:false});hint(inst,'chain','#ffb03a',{who:`${a.ch.name}님과 그레고르`},{occ:1});}
    fx(inst,{k:'sfx',n:'hook'});return 0.6;},
  march(inst,m){const map=inst.map,br=map.bossRoom;const x0=(br.x)*TS+10,x1=(br.x+br.w)*TS-10,y0=br.y*TS+12,y1=(br.y+br.h)*TS-12;const fromLeft=R()<0.5;const n=Math.floor((y1-y0)/22);const gap=ri(1,n-3);const t=(x1-x0)/58;
    hint(inst,'march','#c9a0e8',null,{occ:1});
    for(let k=0;k<n;k++){if(k===gap||k===gap+1)continue;addHz(inst,{x:fromLeft?x0:x1,y:y0+k*22+11,r:10,t,arm:1.0,iv:0.3,dmg:m.dmg*0.9,vx:fromLeft?58:-58,vy:0,vis:25,src:m});}return 0.8;},
  collapse(inst,m){const map=inst.map,br=map.bossRoom;const pts=[];for(const P of livingPlayers(inst))pts.push([P.x,P.y]);for(let k=0;k<(inst.raid.hard?10:7);k++)pts.push([(br.x+1+R()*(br.w-2))*TS,(br.y+1+R()*(br.h-2))*TS]);
    for(const [x,y] of pts)addHz(inst,{x,y,r:22,t:0.1,arm:1.4*m.tf,burst:m.dmg*2.1,vis:21,src:m});fx(inst,{k:'msg',m:'바닥이 무너진다!',c:'#ff8a5a'});return 1.2;},
  slam(inst,m){return BP.slam(inst,m);}};
// ================= 단체 기믹 (실패 시 전멸) =================
const GM_NAME={funeral:'장례의 종',silence:'침묵의 종소리',prison:'거울 감옥',chorus:'자매의 합창',core:'과열 코어',gears:'톱니 행진',moonfall:'흑월 강림',shadow:'그림자 대역',eclipse:'일식',absorb:'흑월 흡수'};
function brPt(inst,a,b){const br=inst.map.bossRoom;return{x:(br.x+br.w*a)*TS,y:(br.y+br.h*b)*TS};}
function gmPlayers(inst){return livingPlayers(inst);}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(R()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
// 전멸: 살아 있는 모두 쓰러짐 → 데스 카운트 1만 차감 → 7초 뒤 보스방 입구에서 부활 · 보스 체력 5% 회복
function groupWipe(inst,why){const r=inst.raid;if(r.done||r.fail)return;fx(inst,{k:'msg',m:`전멸! ${why}`,c:'#ff2a2a'});fx(inst,{k:'shake',v:14});const c=brPt(inst,0.5,0.5);fx(inst,{k:'boom',x:r1(c.x),y:r1(c.y),r:280});fx(inst,{k:'gmwipe'});const wiped=livingPlayers(inst).length>0;
  for(const P of livingPlayers(inst)){P.raidDown=true;P.raidWipe=true;P.raidRev=inst.time+7;send(P,{t:'rrev',at:7,auto:1});P.hp=0;P.downed=true;P.rev=0;P.shield=0;P.gmLock=0;fx(inst,{k:'pdown',id:P.id});const s=rst(inst,P);if(s)s.deaths++;}
  for(const b of bossList(inst)){b.hp=Math.min(b.maxHp,b.hp+b.maxHp*0.05);b.busy=Math.max(b.busy||0,7);}
  /* 이미 모두 쓰러져 개별로 차감됐으면 전멸로 또 빼지 않음 */if(!r.practice&&wiped){r.deaths--;if(r.deaths<0)raidFail(inst,'전멸 · 데스 카운트를 모두 썼습니다');else fx(inst,{k:'msg',m:`파티 전멸 · 데스 카운트 1 차감 (남은 ${r.deaths}) · 7초 뒤 입구에서 다시 일어납니다`,c:'#ff6a5a'});}
  raidState(inst);}
function gmStart(inst,k,o){const r=inst.raid;if(r.gm||r.done||r.fail)return false;const g=Object.assign({k,name:GM_NAME[k],t:0,T:0,st:'on',idle:true,invul:true},o||{});if(GM[k].start(inst,g)===false)return false;g.T=g.T||g.t;r.gm=g;
  if(g.idle||g.invul)for(const b of bossList(inst)){if(g.invul)b.invul=99;if(g.idle){b.busy=g.T+0.6;b.atkT=0;}}
  fx(inst,{k:'gmstart',n:g.name});fx(inst,{k:'sfx',n:'boss'});fx(inst,{k:'shake',v:4});hint(inst,k,GM[k].col||'#ff8a5a',GM[k].hv?GM[k].hv(inst,g):null,{open:()=>inst.raid.gm===g,wait:Math.max(4,g.T*0.45)});raidState(inst);return true;}
function gmEnd(inst,ok,why){const r=inst.raid,g=r.gm;if(!g)return;r.gm=null;for(const P of instPlayers(inst)){if(P.gmLock)P.gmLock=0;}
  for(const b of bossList(inst)){if(g.invul&&b.invul>=90)b.invul=0;if(g.idle)b.busy=0;}
  if(GM[g.k].end)GM[g.k].end(inst,g,ok);
  if(ok){fx(inst,{k:'msg',m:`${g.name} 성공!${GM[g.k].okMsg?' '+GM[g.k].okMsg:''}`,c:'#7fd05a'});for(const P of livingPlayers(inst))rst(inst,P).gim++;
    if(!GM[g.k].noStun)for(const b of bossList(inst)){b.stun=Math.max(b.stun||0,3.5);b.grog=inst.time+4.5;fx(inst,{k:'counter',id:b.id,x:r1(b.x),y:r1(b.y),by:''});}}
  else{hintUp(inst,g.k);groupWipe(inst,why||GM[g.k].why);}
  raidState(inst);}
function gmUpdate(inst,dt){const r=inst.raid,g=r.gm;if(!g)return;g.t-=dt;if(process.env.GM_AUTO&&g.t<g.T*0.45){gmEnd(inst,true);return;}/* 측정용: 기믹을 잘 푸는 파티 가정 */const res=GM[g.k].tick(inst,g,dt);if(res==='ok')gmEnd(inst,true);else if(res)gmEnd(inst,false,res===true?null:res);else if(g.t<=0)gmEnd(inst,false,GM[g.k].timeout||GM[g.k].why);
  else if(((g.t*4)|0)!==g.lt){g.lt=(g.t*4)|0;raidState(inst);}}
function gmAct(inst,P,i){const g=inst.raid.gm;if(!g||!GM[g.k].act)return;if(P.gmLock>inst.time){msg(P,'갇혀 있어서 움직일 수 없어요','#9e937a');return;}GM[g.k].act(inst,g,P,i);raidState(inst);}
function gmHit(inst,m,P,v){const g=inst.raid&&inst.raid.gm;if(g&&GM[g.k].onHit)GM[g.k].onHit(inst,g,m,P,v);}
function gmHurt(inst,P,v){const g=inst.raid&&inst.raid.gm;if(g&&GM[g.k].onHurt&&v>0)GM[g.k].onHurt(inst,g,P,v);}
function gmTrig(inst,key,cond,k,o){const r=inst.raid;const D=r.gmDone||(r.gmDone={});if(D[key]||!cond||r.gm||(r.cardT>inst.time))return false;if(!livingPlayers(inst).length)return false;/* 모두 쓰러져 있을 땐 시작하지 않고, 시작 못 했으면 다음에 다시 시도 */if(gmStart(inst,k,o)){D[key]=1;return true;}return false;}
function gmPub(inst){const g=inst.raid.gm;if(!g)return null;const o={k:g.k,n:g.name,t:Math.max(0,Math.round(g.t*10)/10),T:g.T};if(GM[g.k].pub)Object.assign(o,GM[g.k].pub(inst,g));return o;}
function inCircle(p,c){return Math.hypot(p.x-c.x,p.y-c.y)<=c.r;}
const GM={
  // 종지기: 원마다 정확히 그 인원
  funeral:{col:'#c9a0e8',why:'장례의 종이 무너졌다 — 원마다 인원이 맞지 않았다',
    hv:(inst,g)=>({txt:g.circles.map(c=>c.need).join('·')}),
    start(inst,g){const r=inst.raid;const n=Math.max(1,gmPlayers(inst).length);const S={1:[1],2:[1,1],3:[2,1],4:r.hard?[3,1]:[2,1,1],5:r.hard?[3,2]:[2,2,1],6:r.hard?[4,2]:[2,2,2],7:r.hard?[4,3]:[3,2,2],8:r.hard?[5,3]:[3,3,2]}[Math.min(PARTY_MAX,n)];const need=shuffle(S.slice());
      const spots=shuffle([[0.2,0.35],[0.8,0.35],[0.5,0.82],[0.5,0.3]]);g.circles=need.map((nd,i)=>{const p=brPt(inst,spots[i][0],spots[i][1]);return{x:p.x,y:p.y,r:24+Math.max(0,nd-2)*5,need:nd,have:0};});g.t=r.hard?8:11;
      fx(inst,{k:'bsay',id:inst.bossId,m:'너희 장례식이다… 관 자리를 정확히 채워라!'});},
    tick(inst,g){const ps=gmPlayers(inst);/* 중간에 누가 떠나거나 쓰러지면 필요 인원을 줄여 맞출 수 있게 */{let tot=g.circles.reduce((a,c)=>a+c.need,0);while(tot>ps.length&&tot>0){const c=g.circles.reduce((a,b)=>b.need>a.need?b:a);c.need--;tot--;}while(tot<ps.length&&g.circles.length){const c=g.circles.reduce((a,b)=>b.need<a.need?b:a);c.need++;tot++;}}for(const c of g.circles)c.have=ps.filter(p=>inCircle(p,c)).length;
      if(g.t<=0){const all=ps.every(p=>g.circles.some(c=>inCircle(p,c)));return all&&g.circles.every(c=>c.have===c.need)?'ok':true;}return null;},
    pub:(inst,g)=>({circles:g.circles.map(c=>[r1(c.x),r1(c.y),c.r,c.need,c.have])})},
  // 종지기: 종이 울리는 동안 움직이거나 공격하면 전멸
  silence:{col:'#8fd0ff',why:'종이 울릴 때 누군가 움직였다',idleBoss:true,
    start(inst,g){const r=inst.raid;const n=r.hard?4:3;g.tolls=[];for(let i=0;i<n;i++)g.tolls.push(2.6+i*2.3);g.win=r.hard?1.5:1.25;g.t=g.T=2.6+(n-1)*2.3+g.win+0.4;g.el=0;g.cur=-1;g.snap=null;g.idle=true;
      fx(inst,{k:'bsay',id:inst.bossId,m:'쉿… 종소리를 들어라. 숨소리 하나라도 내면…'});},
    tick(inst,g,dt){g.el+=dt;const ps=gmPlayers(inst);const b=bossList(inst)[0];
      if(b&&ps.length){const T=ps.reduce((a,p)=>Math.hypot(p.x-b.x,p.y-b.y)<Math.hypot(a.x-b.x,a.y-b.y)?p:a,ps[0]);const d=Math.hypot(T.x-b.x,T.y-b.y);if(d>30)SH.moveEnt(inst.map,b,(T.x-b.x)/d*28*dt,(T.y-b.y)/d*28*dt);}
      const i=g.tolls.findIndex(t=>g.el>=t&&g.el<t+g.win);
      if(i!==g.cur){g.cur=i;if(i>=0){g.snap={};g.ws=inst.time;for(const p of ps)g.snap[p.id]=[p.x,p.y];fx(inst,{k:'bell',c:4,x:r1(b?b.x:0),y:r1(b?b.y:0)});fx(inst,{k:'shake',v:3});fx(inst,{k:'gmtoll'});}else g.snap=null;}
      if(g.snap){for(const p of ps){const s=g.snap[p.id];if(!s){g.snap[p.id]=[p.x,p.y];continue;}if(Math.hypot(p.x-s[0],p.y-s[1])>4||(p.actT||-9)>g.ws)return `종이 울릴 때 ${p.ch.name}님이 움직였다`;}}
      if(g.el>=g.tolls[g.tolls.length-1]+g.win)return 'ok';return null;},
    pub:(inst,g)=>({toll:g.cur>=0?1:0,next:g.tolls.map(t=>r1(t-g.el)).filter(v=>v>-0.1)[0]??null,cnt:g.tolls.filter(t=>g.el>=t).length,tot:g.tolls.length})},
  // 쌍둥이: 갇힌 사람이 비친 거울만 깨기
  prison:{col:'#ffe9a8',why:'거울 감옥이 닫혔다',
    start(inst,g){const r=inst.raid;const ps=gmPlayers(inst);if(ps.length<2)return false;const big=ps.length>4;const k=Math.min(big?3:2,ps.length-1);const NM=big?6:4;const sh=shuffle(ps.slice());g.jail=sh.slice(0,k).map(p=>p.id);const out=sh.slice(k);
      const corners=shuffle(big?[[0.1,0.2],[0.9,0.2],[0.1,0.85],[0.9,0.85],[0.5,0.12],[0.5,0.92]]:[[0.1,0.2],[0.9,0.2],[0.1,0.85],[0.9,0.85]]);const shows=shuffle(g.jail.map(id=>({id,real:1})).concat(out.slice(0,NM-k).map(p=>({id:p.id,real:0}))));
      while(shows.length<NM)shows.push({id:null,real:0,cls:pick(Object.keys(CLASSES))});
      g.mir=shows.map((s,i)=>{const p=brPt(inst,corners[i][0],corners[i][1]);const P=s.id&&players.get(s.id);return{x:p.x,y:p.y,id:s.id,real:s.real,cls:P?P.ch.cls:s.cls,name:P?P.ch.name:'?',broken:false};});
      g.freed={};for(const id of g.jail){const P=players.get(id);if(P){P.gmLock=inst.time+60;P.rootT=Math.max(P.rootT,60);P.dodgeT=Math.max(P.dodgeT,60);fx(inst,{k:'txt',x:r1(P.x),y:r1(P.y-30),s:'거울에 갇힘!',c:'#ffe9a8'});}}
      g.t=r.hard?15:22;g.idle=false;g.invul=true;fx(inst,{k:'bsay',id:inst.bossId,m:'거울 속에서 영원히 우리 자매와 함께 살아라…'});},
    act(inst,g,P,i){const q=g.mir[i];if(!q||q.broken||Math.hypot(P.x-q.x,P.y-q.y)>34)return;q.broken=true;fx(inst,{k:'boom',x:r1(q.x),y:r1(q.y),r:22,c:1});fx(inst,{k:'shake',v:3});
      if(q.real){g.freed[q.id]=1;const J=players.get(q.id);if(J){J.gmLock=0;J.rootT=0;J.dodgeT=0.5;fx(inst,{k:'txt',x:r1(J.x),y:r1(J.y-30),s:'풀려남!',c:'#7fd05a'});}}else g.bad=`${P.ch.name}님이 엉뚱한 거울을 깼다`;},
    tick(inst,g){if(g.bad)return g.bad;if(g.jail.every(id=>g.freed[id]||!players.get(id)))return 'ok';return null;},
    end(inst,g){for(const id of g.jail){const J=players.get(id);if(J){J.gmLock=0;J.rootT=0;J.dodgeT=0;}}},
    pub:(inst,g)=>({mir:g.mir.map(q=>[r1(q.x),r1(q.y),q.cls,q.name,q.broken?1:0]),jail:g.jail.filter(id=>!g.freed[id])})},
  // 쌍둥이: 두 마녀의 영창을 5초 안에 모두 끊기
  chorus:{col:'#c9a0e8',why:'자매의 합창이 완성되었다',okMsg:'두 영창이 함께 끊겼다!',
    start(inst,g){const r=inst.raid;const bs=bossList(inst).filter(b=>b.type==='r_lyra'||b.type==='r_nora');if(bs.length<2)return false;g.ch=bs.map(b=>({id:b.id,dmg:0,thr:b.maxHp*(r.hard?0.07:0.05),bt:null}));g.invul=false;g.idle=true;g.t=r.hard?12:15;g.gap=r.hard?4:5;
      for(const b of bs)fx(inst,{k:'bsay',id:b.id,m:b.type==='r_lyra'?'노라, 함께 노래하자…':'언니, 끝을 노래하자…'});},
    onHit(inst,g,m,P,v){const c=g.ch.find(x=>x.id===m.id);if(!c||c.bt!=null)return;c.dmg+=v;if(c.dmg>=c.thr){c.bt=inst.time;fx(inst,{k:'counter',id:m.id,x:r1(m.x),y:r1(m.y),by:P.ch.name});fx(inst,{k:'msg',m:`${m.bname}의 영창이 끊겼다! 다른 마녀도 ${g.gap}초 안에!`,c:'#ffe9a8'});raidState(inst);}},
    tick(inst,g){const b=g.ch.filter(c=>c.bt!=null);if(b.length===2)return 'ok';if(b.length===1&&inst.time-b[0].bt>g.gap)return '한쪽 마녀의 영창만 끊겼다';if(g.ch.some(c=>!inst.monsters.find(m=>m.id===c.id&&!m.dead)))return 'ok';return null;},
    pub:(inst,g)=>({chant:g.ch.map(c=>[c.id,Math.min(1,r1(c.dmg/c.thr*100)/100),c.bt!=null?1:0]),gap:g.ch.some(c=>c.bt!=null)?r1(g.gap-(inst.time-g.ch.find(c=>c.bt!=null).bt)):null})},
  // 기사단장: 밸브를 각자 하나씩
  core:{col:'#ffb03a',why:'코어가 과열되어 공장이 폭발했다',
    start(inst,g){const r=inst.raid;const n=Math.max(1,Math.min(PARTY_MAX,gmPlayers(inst).length));const spots=shuffle([[0.06,0.5],[0.94,0.5],[0.5,0.1],[0.5,0.92]]).concat(shuffle([[0.12,0.15],[0.88,0.15],[0.12,0.85],[0.88,0.85]])).slice(0,n);
      g.valves=spots.map(([a,b])=>{const p=brPt(inst,a,b);return{x:p.x,y:p.y,by:null};});g.used={};g.t=r.hard?12:16;g.st=0;fx(inst,{k:'bsay',id:inst.bossId,m:'코어 출력 최대! 모두 불타 버려라!'});},
    act(inst,g,P,i){const v=g.valves[i];if(!v||v.by||Math.hypot(P.x-v.x,P.y-v.y)>34)return;if(g.used[P.id]){msg(P,'밸브는 한 사람당 하나만 돌릴 수 있어요!','#ff8a5a');fx(inst,{k:'txt',x:r1(P.x),y:r1(P.y-26),s:'한 사람당 하나!',c:'#ff8a5a'});return;}
      g.used[P.id]=1;v.by=P.ch.name;fx(inst,{k:'bell',c:3,x:r1(v.x),y:r1(v.y)});fx(inst,{k:'txt',x:r1(v.x),y:r1(v.y-22),s:'냉각!',c:'#8fd0ff'});},
    tick(inst,g,dt){g.st-=dt;if(g.st<=0){g.st=1.4;const b=bossList(inst)[0];const br=inst.map.bossRoom;for(let k=0;k<3;k++){const x=(br.x+1+R()*(br.w-2))*TS,y=(br.y+1+R()*(br.h-2))*TS;addHz(inst,{x,y,r:20,t:0.1,arm:1.1,burst:(b?b.dmg:30)*1.3,vis:21,src:b});}}
      if(g.valves.every(v=>v.by))return 'ok';/* 중간에 누가 떠나면 밸브가 남아 무조건 실패하던 문제 → 남은 사람이 모두 하나씩 돌렸으면 성공 */{const ps=gmPlayers(inst);if(ps.length&&g.valves.some(v=>v.by)&&ps.every(p=>g.used[p.id]))return 'ok';}return null;},
    pub:(inst,g)=>({valves:g.valves.map(v=>[r1(v.x),r1(v.y),v.by?1:0,v.by||''])})},
  // 기사단장: 전원이 한 줄에
  gears:{col:'#ffd35a',why:'톱니벽에 짓눌렸다 — 모두 한 줄에 있지 않았다',
    start(inst,g){const r=inst.raid,br=inst.map.bossRoom;g.lanes=[0,1,2].map(i=>[(br.y+br.h*i/3)*TS,(br.y+br.h*(i+1)/3)*TS]);g.x0=(br.x)*TS;g.x1=(br.x+br.w)*TS;g.fromL=R()<0.5;g.t=r.hard?7.5:10;fx(inst,{k:'bsay',id:inst.bossId,m:'톱니여, 쓸어버려라!'});},
    lane(g,p){return g.lanes.findIndex(([a,b])=>p.y>=a&&p.y<b);},
    tick(inst,g){const ps=gmPlayers(inst);const ls=new Set(ps.map(p=>GM.gears.lane(g,p)));g.gap=ls.size===1?[...ls][0]:-1;if(g.t<=0)return g.gap>=0?'ok':true;return null;},
    pub:(inst,g)=>{const k=1-Math.max(0,g.t)/g.T;return{lanes:g.lanes.map(l=>[r1(l[0]),r1(l[1])]),wx:r1(g.fromL?g.x0+(g.x1-g.x0)*k:g.x1-(g.x1-g.x0)*k),gap:g.gap};},
    okMsg:'한 줄로 모여 톱니벽을 넘겼다!'},
  // 흑왕: 등불 기둥에 불 옮기기 (맞으면 꺼짐) — 보스는 계속 공격
  moonfall:{col:'#ffe9a8',why:'흑월이 떨어졌다 — 등불이 모자랐다',okMsg:'등불의 빛이 흑월을 밀어냈다!',
    start(inst,g){const r=inst.raid;const n=Math.max(1,gmPlayers(inst).length);const np=n>=6?6:n>=3?4:n===2?3:2;const sp=shuffle([[0.2,0.3],[0.8,0.3],[0.2,0.8],[0.8,0.8]]).concat([[0.05,0.55],[0.95,0.55]]).slice(0,np);
      g.pil=sp.map(([a,b])=>{const p=brPt(inst,a,b);return{x:p.x,y:p.y,lit:false};});const c=brPt(inst,0.5,0.6);g.br={x:c.x,y:c.y};g.carry={};g.idle=false;g.invul=false;g.t=r.hard?26:32;
      fx(inst,{k:'bsay',id:inst.bossId,m:'보아라, 흑월이 내려온다. 너희의 작은 불씨로 무엇을 막겠느냐!'});fx(inst,{k:'redsky',d:g.t});},
    act(inst,g,P,i){if(i===0){if(Math.hypot(P.x-g.br.x,P.y-g.br.y)>34||g.carry[P.id])return;g.carry[P.id]=1;fx(inst,{k:'txt',x:r1(P.x),y:r1(P.y-30),s:'등불을 들었다',c:'#ffe9a8'});return;}
      const q=g.pil[i-1];if(!q||q.lit||!g.carry[P.id]||Math.hypot(P.x-q.x,P.y-q.y)>34)return;q.lit=true;delete g.carry[P.id];fx(inst,{k:'boom',x:r1(q.x),y:r1(q.y),r:26,c:1});fx(inst,{k:'txt',x:r1(q.x),y:r1(q.y-30),s:'점화!',c:'#ffe9a8'});},
    onHurt(inst,g,P){if(g.carry[P.id]){delete g.carry[P.id];fx(inst,{k:'txt',x:r1(P.x),y:r1(P.y-30),s:'등불이 꺼졌다!',c:'#ff6a5a'});raidState(inst);}},
    tick(inst,g){if(g.pil.every(q=>q.lit))return 'ok';return null;},
    end(inst,g,ok){if(ok)for(const b of bossList(inst)){b.hp=Math.max(1,b.hp-b.maxHp*0.06);b.stun=5;b.grog=inst.time+6;}},noStun:true,
    pub:(inst,g)=>({pil:g.pil.map(q=>[r1(q.x),r1(q.y),q.lit?1:0]),br:[r1(g.br.x),r1(g.br.y)],carry:Object.keys(g.carry)})},
  // 흑왕: 일식 — 시간이 끝날 때 전원이 빛 웅덩이 안에 (보스는 계속 공격)
  eclipse:{col:'#ffe9a8',why:'일식에 삼켜졌다 — 빛 밖에 있었다',okMsg:'모두 빛 속에서 일식을 견뎠다!',noStun:true,
    start(inst,g){const r=inst.raid;const ps=gmPlayers(inst);if(!ps.length)return false;const br=inst.map.bossRoom;const n=Math.max(2,Math.min(4,Math.ceil(ps.length/2)));g.lights=[];
      for(let i=0;i<n;i++){let best=null;for(let t=0;t<40;t++){const x=(br.x+3+R()*(br.w-6))*TS,y=(br.y+3+R()*(br.h-6))*TS;if(SH.blocked(inst.map,x,y,6))continue;const dm=Math.min(999,...g.lights.map(l=>Math.hypot(l.x-x,l.y-y)));if(!best||dm>best.d)best={x,y,d:dm};if(dm>90)break;}g.lights.push({x:best.x,y:best.y,r:r.hard?22:26});}
      g.t=r.hard?6.5:8.5;g.idle=false;g.invul=false;fx(inst,{k:'bsay',id:inst.bossId,m:'해가 진다. 너희의 빛도 함께 꺼지리라.'});fx(inst,{k:'redsky',d:g.t});},
    tick(inst,g){const ps=gmPlayers(inst);for(const l of g.lights)l.have=ps.filter(p=>Math.hypot(p.x-l.x,(p.y-l.y)*1.4)<l.r).length;
      if(g.t<=0){const out=ps.filter(p=>!g.lights.some(l=>Math.hypot(p.x-l.x,(p.y-l.y)*1.4)<l.r));return out.length?`일식에 삼켜졌다 — ${out[0].ch.name}님이 빛 밖에 있었다`:'ok';}return null;},
    pub:(inst,g)=>({lights:g.lights.map(l=>[r1(l.x),r1(l.y),l.r,l.have|0]),tot:gmPlayers(inst).length})},
  // 흑왕: 흑월 흡수 — 제한 시간 안에 보호막만큼 피해 (보스는 제자리에서 흡수)
  absorb:{col:'#9a7ad8',why:'흑월이 빛을 삼켰다 — 보호막을 깨지 못했다',okMsg:'흑월의 보호막이 산산조각 났다!',
    start(inst,g){const r=inst.raid;const b=bossList(inst)[0];if(!b)return false;g.thr=Math.round(b.maxHp*(r.hard?0.032:0.024));g.dmg=0;g.t=r.hard?13:16;g.idle=true;g.invul=false;
      fx(inst,{k:'bsay',id:b.id,m:'달빛이여, 내게로…'});fx(inst,{k:'ring',x:r1(b.x),y:r1(b.y),r:60,c:'p',c2:'w'});},
    onHit(inst,g,m,P,v){if(m.id===inst.bossId)g.dmg+=v;},
    tick(inst,g){if(g.dmg>=g.thr)return 'ok';return null;},
    end(inst,g,ok){if(ok)for(const b of bossList(inst)){b.hp=Math.max(1,b.hp-Math.round(b.maxHp*0.03));}},
    pub:(inst,g)=>({sh:Math.max(0,Math.round((1-g.dmg/g.thr)*100))})},
  // 흑왕: 자기 그림자만 만지기 — 보스는 계속 공격
  shadow:{col:'#9a7ad8',why:'그림자가 뒤바뀌었다',okMsg:'모두 자기 그림자를 되찾았다!',
    start(inst,g){const r=inst.raid;const ps=gmPlayers(inst);if(!ps.length)return false;const br=inst.map.bossRoom;g.sh=[];
      for(const p of ps){let best=null;for(let t=0;t<40;t++){const x=(br.x+2+R()*(br.w-4))*TS,y=(br.y+2+R()*(br.h-4))*TS;if(SH.blocked(inst.map,x,y,5))continue;const dmin=Math.min(...ps.map(q=>Math.hypot(q.x-x,q.y-y)),...g.sh.map(s=>Math.hypot(s.x-x,s.y-y)));if(!best||dmin>best.d)best={x,y,d:dmin};if(dmin>70)break;}
        g.sh.push({pid:p.id,x:best.x,y:best.y,cls:p.ch.cls,name:p.ch.name,ok:false});}
      g.idle=false;g.invul=false;g.t=r.hard?8:11;g.grace=inst.time+1.2;fx(inst,{k:'bsay',id:inst.bossId,m:'너희 그림자는 이제 내 것이다.'});},
    tick(inst,g){if(inst.time<g.grace)return null;for(const p of gmPlayers(inst))for(const s of g.sh){if(s.ok||Math.hypot(p.x-s.x,p.y-s.y)>11)continue;if(s.pid===p.id){s.ok=true;fx(inst,{k:'txt',x:r1(p.x),y:r1(p.y-30),s:'그림자를 되찾았다',c:'#c9a0e8'});raidState(inst);}else return `${p.ch.name}님이 남의 그림자에 닿았다`;}
      /* 마을로 떠난 사람의 그림자도 끝난 것으로 (예전엔 떠난 사람이 있으면 기믹이 무조건 실패) */if(g.sh.every(s=>{if(s.ok)return true;const Q=players.get(s.pid);return !Q||Q.inst!==inst||Q.downed;}))return 'ok';return null;},
    pub:(inst,g)=>({sh:g.sh.map(s=>[r1(s.x),r1(s.y),s.cls,s.name,s.ok?1:0,s.pid])})}};
// ================= 레이드 모듈 (공통 훅) =================
const RAID_DMG=+(process.env.RAID_DMG||1);/* 측정용 추가 배율 */
/* 레이드별 보스 공격력·체력 배율 (호흡 8~15분, 보통 실력으로는 못 깨는 선) · 흑왕은 절망 난이도 */
const RAID_TUNE={bell:{dmg:1.35,hp:1.35,enr:780},mirror:{dmg:1.35,hp:1.5,enr:780},clock:{dmg:1.35,hp:1.9,enr:780},moon:{dmg:1.6,hp:3.0,enr:1260,hHp:1.6,hDmg:1.6}};/* hHp·hDmg: 하드 전용 추가 배율 · 흑왕 하드는 권장 전투력 12만 기준 (예전 7.56만의 약 1.6배) */
function raidBoss(inst,type,x,y,share){const r=inst.raid;const b=spawnMonster(inst,type,x,y,false);b.boss=true;b.home={x,y};const TU=RAID_TUNE[r.id]||{dmg:1,hp:1};b.maxHp=b.hp=Math.round(SH.MT[type].hp*raidScale(r.def.lvl,r.n,r.hard)*(share||1)*TU.hp*(r.hard&&TU.hHp||1));
  b.dmg*=(r.hard?2.6:1.8)*[0,0.55,0.78,0.9,1,1.04,1.08,1.12,1.15][clamp(r.n,1,PARTY_MAX)]*(r.id==='moon'?1.6:r.id==='clock'?1.15:1)*RAID_DMG*TU.dmg*(r.hard&&TU.hDmg||1);b.baseDmg=b.dmg;b.r=SH.MT[type].r;b.raidAI=RAID_AI[type];b.bname=SH.MT[type].n;b.tf=r.hard?0.85:1;b.phase=1;b.fightT=0;b.patCd=2.5;b.spdMul=1;return b;}
function raidAdds(inst,dt,type,cap){const r=inst.raid;if(r.stage!=='gate')return;r.gT-=dt;if(r.gT>0)return;r.gT=r.hard?6:8;const alive=inst.monsters.filter(m=>!m.dead&&m.type===type).length;if(alive>=(r.hard?cap+2:cap))return;const map=inst.map;
  for(let k=0;k<2;k++){const x=(map.start.x+1+ri(0,map.start.w-3))*TS+8,y=(map.start.y+1+ri(0,2))*TS+8;if(SH.blocked(map,x,y,5))continue;const m=spawnMonster(inst,type,x,y,false);m.alert=true;fx(inst,{k:'blink',x:r1(x),y:r1(y)});}}
/* 바뀐 타일은 기억해 두었다가 지도 보낼 때 같이 보낸다 (입장 직후 레버·거울·제단이 클라이언트에서 사라지던 버그) */
function tileSet(inst,i,v,quiet){inst.map.tiles[i]=v;(inst.tmod||(inst.tmod=new Map())).set(i,v);if(!quiet)bcast(inst,{t:'tile',i,v});for(const P of instPlayers(inst))unstick(inst,P);}
function setTile(inst,tx,ty,v){const i=ty*inst.map.w+tx;if(inst.map.tiles[i]===v)return;tileSet(inst,i,v);}
function near2(P,o,r){return Math.hypot(P.x-o.x,P.y-o.y)<=r;}
function bossList(inst){return inst.monsters.filter(m=>m.boss&&!m.dead);}
// 공통 보스 AI 틀: 패턴 목록·카운터·추적
function raidAIcore(inst,m,T,d,dt,sm,o){const r=inst.raid;if(m.invul>0&&m.invul<90){m.invul-=dt;if(m.invul<0)m.invul=0;}if(!(m.faceLock>inst.time))m.face=T.x<m.x?-1:1;m.fightT+=dt;
  const CB=o.ctrBase||[15,20];if(o.ctrBase&&m.ctrCd!=null&&!m.hidden&&!(m.stun>0))m.ctrCd-=dt;/* 흑왕: 패턴 중에도 카운터 쿨이 돈다 */
  if(m.busy>0){m.busy-=dt;return;}if(m.hidden||m.invul>=90){if(o.idle)o.idle();return;}
  m.ctrCd=(m.ctrCd==null?rf(CB[0]*0.6,CB[1]*0.7)*(o.ctrMul||1):m.ctrCd)-(o.ctrBase?0:dt);if(o.noCtr)m.ctrCd=Math.max(m.ctrCd,o.noCtr);if(m.ctrCd<=0){m.ctrCd=rf(CB[0],CB[1])*(m.phase>1?0.85:1)*(o.ctrMul||1);m.chainLeft=null;m.patT=inst.time;m.busy=counterWindow(inst,m,T);return;}
  m.patCd-=dt;if(m.patCd<=0){let pool=o.pool(m).filter(p=>p!==m.last);const name=pick(pool);m.last=name;m.patT=inst.time;m.busy=(o.P[name]||BP[name])(inst,m,T)||0.5;m.patCd=rf(1.9,2.9)*(r.hard?0.8:1)*(m.phase>1?0.85:1)*(o.tempo?o.tempo(m):1)*(o.patMul||1);return;}
  if(d<m.r+4+18&&m.cd<=0){m.cd=m.d.cd;m.busy=BP.swipe(inst,m,T);return;}
  chase(inst,m,T,dt,sm*(r.enraged?1.5:1)*(o.spd||1));}

// ---------- 20 종탑 (기존 로직 연결) ----------
const RAIDX={};
RAIDX.bell={init(inst){const r=inst.raid;const b=raidBoss(inst,'r_greg',inst.map.bossPt.x,inst.map.bossPt.y);inst.bossId=b.id;r.pz={round:0,rounds:r.hard?[4,5,6]:[3,4,5],seq:[],inp:[],st:'wait',t:2.5};},
  update(inst,dt){updateBellRaid(inst,dt);},act(inst,P,i){ringBell(inst,P,i);}};

// ---------- 30 거울 미궁: 쌍둥이 마녀 ----------
const MDIR=[[1,0],[0,1],[-1,0],[0,-1]]; // 동·남·서·북
function mirRefl(t,di){// t0='/' t1='\'
  if(t===0)return[3,2,1,0][di];return[1,0,3,2][di];}
function genMirrorStage(inst,k){const map=inst.map,W=map.w;const x0=10,x1=29,y0=29,y1=37;const inb=(x,y)=>x>=x0&&x<=x1&&y>=y0&&y<=y1;
  for(let tries=0;tries<400;tries++){const r0=ri(y0+1,y1-1);let x=x0,y=r0,di=0;const vis=new Set([x+','+y]);const mir=[];let ok=true;
    for(let m=0;m<k&&ok;m++){const L=ri(3,6);for(let s=0;s<L;s++){x+=MDIR[di][0];y+=MDIR[di][1];if(!inb(x,y)||vis.has(x+','+y)){ok=false;break;}vis.add(x+','+y);}if(!ok)break;
      const opts=di%2===0?[1,3]:[0,2];const nd=pick(opts);const nx=x+MDIR[nd][0],ny=y+MDIR[nd][1];if(!inb(nx,ny)||vis.has(nx+','+ny)){ok=false;break;}
      const t=[0,1].find(tt=>mirRefl(tt,di)===nd);mir.push({tx:x,ty:y,want:t,t:0});di=nd;}
    if(!ok)continue;let steps=0;while(true){const nx=x+MDIR[di][0],ny=y+MDIR[di][1];if(!inb(nx,ny))break;if(vis.has(nx+','+ny)){ok=false;break;}x=nx;y=ny;vis.add(x+','+y);steps++;}
    if(!ok||steps<2)continue;const rcv={tx:x,ty:y};if(Math.abs(rcv.tx-x0)+Math.abs(rcv.ty-r0)<5)continue;
    // 가짜 거울 2개
    for(let d2=0;d2<2;d2++){for(let t2=0;t2<30;t2++){const fx2=ri(x0+1,x1-1),fy2=ri(y0,y1);const key=fx2+','+fy2;if(vis.has(key)||Math.abs(fx2-19)<2&&fy2>=36)continue;vis.add(key);mir.push({tx:fx2,ty:fy2,want:-1,t:ri(0,1)});break;}}
    for(const m2 of mir)if(m2.want>=0)m2.t=R()<0.5?0:1;if(mir.filter(q=>q.want>=0).every(q=>q.t===q.want))mir.find(q=>q.want>=0).t^=1;
    {const occ=new Set();for(const P of instPlayers(inst)){const ptx=Math.floor(P.x/TS),pty=Math.floor(P.y/TS);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)occ.add((ptx+dx)+','+(pty+dy));}
      if(tries<300&&(mir.some(q=>occ.has(q.tx+','+q.ty))||occ.has(rcv.tx+','+rcv.ty)||occ.has((x0-1)+','+r0)))continue;}
    return{src:{tx:x0-1,ty:r0},mir,rcv};}
  return null;}
function mirBeam(inst){const r=inst.raid,pz=r.pz;const map=inst.map,W=map.w;const mm=new Map(pz.mir.map((q,i)=>[q.tx+','+q.ty,q]));let x=pz.src.tx,y=pz.src.ty,di=0;const pts=[[x*TS+8,y*TS+8]];let hit=false;
  for(let s=0;s<120;s++){x+=MDIR[di][0];y+=MDIR[di][1];if(x===pz.rcv.tx&&y===pz.rcv.ty){hit=true;pts.push([x*TS+8,y*TS+8]);break;}const q=mm.get(x+','+y);if(q){pts.push([x*TS+8,y*TS+8]);di=mirRefl(q.t,di);continue;}
    const t=map.tiles[y*W+x];if(!(t===1||t===2)){pts.push([x*TS+8-MDIR[di][0]*8,y*TS+8-MDIR[di][1]*8]);break;}}
  if(!hit&&pts.length&&pts[pts.length-1][0]!==x*TS+8)pts.push([x*TS+8,y*TS+8]);pz.beam=pts;pz.hit=hit;return hit;}
function mirPlace(inst,on){const pz=inst.raid.pz;for(const q of pz.mir)setTile(inst,q.tx,q.ty,on?3:1);setTile(inst,pz.src.tx,pz.src.ty,on?3:1);setTile(inst,pz.rcv.tx,pz.rcv.ty,on?3:1);}
function mirStage(inst){const r=inst.raid,pz=r.pz;if(pz.mir)mirPlace(inst,false);const g=genMirrorStage(inst,pz.stages[pz.stage]);if(!g){pz.st='done';openRaidDoor(inst);return;}Object.assign(pz,g);pz.st='play';mirPlace(inst,true);unstickAll(inst);mirBeam(inst);raidState(inst);
  const stg=pz.stage;hint(inst,'mirror','#ffe9a8',{i:stg+1,n:pz.stages.length},{open:()=>inst.raid.pz.stage===stg&&inst.raid.pz.st==='play',wait:25});}
function twinSide(inst,m){const br=inst.map.bossRoom;const mid=(br.x+br.w/2)*TS;return m.type==='r_lyra'?-1:1;}
function twinTarget(inst,m){const r=inst.raid;if(!r.split)return m.tgt;const br=inst.map.bossRoom,mid=(br.x+br.w/2)*TS;const side=twinSide(inst,m);const ps=livingPlayers(inst).filter(p=>(p.x<mid?-1:1)===side);if(!ps.length)return null;return ps.reduce((a,b)=>Math.hypot(a.x-m.x,a.y-m.y)<Math.hypot(b.x-m.x,b.y-m.y)?a:b);}
RAIDX.mirror={init(inst){const r=inst.raid,bp=inst.map.bossPt;const a=raidBoss(inst,'r_lyra',bp.x-50,bp.y,0.55),b=raidBoss(inst,'r_nora',bp.x+50,bp.y,0.55);a.col='y';b.col='p';for(const x of[a,b]){x.dmg*=0.5;x.baseDmg=x.dmg;}inst.bossId=a.id;
    r.pz={stage:0,stages:r.hard?[4,5]:[3,4],mir:null,beam:[],hit:false,st:'play'};r.markT=14;r.marks=null;mirStage(inst);},
  update(inst,dt){const r=inst.raid,pz=r.pz;raidAdds(inst,dt,'shade',5);
    if(r.stage!=='boss')return;const bs=bossList(inst);
    // 표식
    if(!r.split&&!r.marks&&bs.length){const avg=bs.reduce((a,x)=>a+x.hp/x.maxHp,0)/bs.length;gmTrig(inst,'pr1',avg<0.75,'prison');gmTrig(inst,'ch1',avg<0.45&&bs.length===2,'chorus');if(r.hard){gmTrig(inst,'pr2',avg<0.3,'prison');gmTrig(inst,'ch2',avg<0.18&&bs.length===2,'chorus');}}
    r.markT-=dt;if(r.markT<=0&&!r.split&&!r.gm){r.markT=r.hard?26:32;const ps=livingPlayers(inst);if(ps.length){const sh=ps.slice().sort(()=>R()-0.5);r.marks={};const solo=ps.length===1;sh.forEach((p,i)=>{r.marks[p.id]=solo?(R()<0.5?'L':'S'):(i%2?'S':'L');});r.markEnd=inst.time+14;
      for(const p of ps)fx(inst,{k:'mark',id:p.id,d:8,c:r.marks[p.id]==='L'?'y':'c',txt:r.marks[p.id]==='L'?'빛':'그림자'});hint(inst,'marks','#ffe9a8',null,{occ:1});raidState(inst);
      const br=inst.map.bossRoom;const zs=[{x:(br.x+br.w*0.25)*TS,y:(br.y+br.h*0.62)*TS,c:'L'},{x:(br.x+br.w*0.75)*TS,y:(br.y+br.h*0.62)*TS,c:'S'}];if(R()<0.5){const t=zs[0].c;zs[0].c=zs[1].c;zs[1].c=t;}r.cz=zs;
      later(inst,4,()=>{if(r.done||r.fail)return;for(const z of zs)fx(inst,{k:'tele',x:r1(z.x),y:r1(z.y),r:44,d:4,c:z.c==='L'?'y':'p'});raidState(inst);});
      later(inst,8,()=>{if(r.done||r.fail||!r.marks)return;for(const p of livingPlayers(inst)){const mk=r.marks[p.id];if(!mk)continue;const z=zs.find(z=>z.c===mk);if(z&&Math.hypot(p.x-z.x,p.y-z.y)<46){rst(inst,p).gim++;fx(inst,{k:'txt',x:r1(p.x),y:r1(p.y-26),s:'안전!',c:'#7fd05a'});continue;}
          hurtPlayer(inst,p,p.S.maxHp*(r.hard?0.9:0.5),null,{what:'색 폭발',nododge:true});}for(const z of zs)fx(inst,{k:'boom',x:r1(z.x),y:r1(z.y),r:44,c:1});fx(inst,{k:'shake',v:5});r.cz=null;raidState(inst);});}}
    if(r.marks&&inst.time>r.markEnd){r.marks=null;raidState(inst);}
    // 거울 분리
    const marks=r.hard?[0.6,0.3]:[0.6];r.spN=r.spN||0;if(!r.split&&!r.gm&&!r.marks&&!r.cz&&r.spN<marks.length&&bs.some(m=>m.hp/m.maxHp<marks[r.spN])){r.spN++;RAIDX.mirror.split(inst);}
    if(r.split){r.split.t-=dt;if(r.split.t<=0)RAIDX.mirror.unsplit(inst);}
    // 쌍둥이 부활
    if(r.twinDead){r.twinDead.t-=dt;if(r.twinDead.t<=0){const tp=r.twinDead.type;r.twinDead=null;const o=bs[0];if(o){o.sad=false;if(o.rageMul){o.dmg/=o.rageMul;o.rageMul=0;}/* 동생이 살아나면 분노 배율을 되돌림 (예전엔 죽을 때마다 1.4배씩 쌓였음) */const nb=raidBoss(inst,tp,o.x+(tp==='r_lyra'?-50:50),o.y,0.55);nb.hp=Math.round(nb.maxHp*0.4);nb.dmg*=0.5;nb.baseDmg=nb.dmg;nb.col=tp==='r_lyra'?'y':'p';nb.alert=true;fx(inst,{k:'bsay',id:nb.id,m:'언니, 혼자 두지 않아…!'});fx(inst,{k:'msg',m:`${nb.bname}이(가) 되살아났다! (체력 40%)`,c:'#ff6a5a'});raidState(inst);}}}},
  split(inst){const r=inst.raid,br=inst.map.bossRoom;const mid=br.x+Math.floor(br.w/2);r.split={t:20};const bs=bossList(inst);
    const lx=(br.x+br.w*0.25)*TS,rx=(br.x+br.w*0.75)*TS,cy=(br.y+br.h/2)*TS;for(const m of bs){m.x=m.type==='r_lyra'?lx:rx;m.y=cy;m.busy=0.8;fx(inst,{k:'tp',x:r1(m.x),y:r1(m.y)});}
    const ps=livingPlayers(inst).concat(instPlayers(inst).filter(p=>p.downed)).sort((a,b)=>a.x-b.x);const half=Math.ceil(ps.length/2);ps.forEach((p,i)=>{const left=i<half||ps.length===1&&p.x<mid*TS;const wantL=ps.length===1?p.x<mid*TS:left;
      if((p.x<mid*TS)!==wantL||Math.abs(p.x-mid*TS-8)<24){p.x=wantL?lx+ri(-20,20):rx+ri(-20,20);p.y=cy+50;send(p,{t:'tp',x:p.x,y:p.y});}});
    for(let y=br.y;y<br.y+br.h;y++){setTile(inst,mid-1,y,6);setTile(inst,mid,y,6);}unstickAll(inst);hint(inst,'split','#8fd0ff');fx(inst,{k:'shake',v:5});
    const b0=bs[0],b1=bs[1];if(b0&&b1)r.split.d0=[b0.hp/b0.maxHp,b1.hp/b1.maxHp];raidState(inst);},
  unsplit(inst){const r=inst.raid,br=inst.map.bossRoom,mid=br.x+Math.floor(br.w/2);r.split=null;for(let y=br.y;y<br.y+br.h;y++){setTile(inst,mid-1,y,1);setTile(inst,mid,y,1);}
    const bs=bossList(inst);if(bs.length===2){const a=bs[0].hp/bs[0].maxHp,b=bs[1].hp/bs[1].maxHp;if(Math.abs(a-b)>0.2){hintUp(inst,'split');fx(inst,{k:'msg',m:'쌍둥이의 원한! 체력 차이가 너무 크다',c:'#ff4a3a'});fx(inst,{k:'shake',v:8});for(const p of livingPlayers(inst))hurtPlayer(inst,p,p.S.maxHp*(r.hard?0.9:0.5),null,{what:'쌍둥이의 원한',nododge:true});}
      else{fx(inst,{k:'msg',m:'균형을 지켰다! 거울벽이 무너진다',c:'#7fd05a'});for(const p of livingPlayers(inst))rst(inst,p).gim++;}}raidState(inst);},
  act(inst,P,i){const r=inst.raid,pz=r.pz;if(r.doorOpen||pz.st!=='play')return;const q=pz.mir[i];if(!q)return;const cx=q.tx*TS+8,cy=q.ty*TS+8;if(Math.hypot(P.x-cx,P.y-cy)>30)return;q.t^=1;rst(inst,P).gim++;fx(inst,{k:'bell',c:1,x:cx,y:cy});
    if(mirBeam(inst)){pz.st='ok';fx(inst,{k:'msg',m:'빛이 수정에 닿았다!',c:'#ffe9a8'});fx(inst,{k:'boom',x:r1(pz.rcv.tx*TS+8),y:r1(pz.rcv.ty*TS+8),r:24,c:1});raidState(inst);
      later(inst,1.6,()=>{if(r.doorOpen)return;pz.stage++;if(pz.stage>=pz.stages.length){mirPlace(inst,false);pz.st='done';pz.mir=[];pz.beam=[];openRaidDoor(inst);}else mirStage(inst);});}else raidState(inst);},
  pub(inst){const r=inst.raid,pz=r.pz;return{mir:pz.mir?pz.mir.map(q=>[q.tx*TS+8,q.ty*TS+8,q.t]):[],src:pz.src&&!r.doorOpen?[pz.src.tx*TS+8,pz.src.ty*TS+8]:null,rcv:pz.rcv&&!r.doorOpen?[pz.rcv.tx*TS+8,pz.rcv.ty*TS+8]:null,beam:r.doorOpen?[]:pz.beam,hit:pz.hit,stage:pz.stage,total:pz.stages.length,
    marks:r.marks||null,cz:r.cz?r.cz.map(z=>[r1(z.x),r1(z.y),z.c]):null,split:r.split?Math.ceil(r.split.t):0,twin:r.twinDead?Math.ceil(r.twinDead.t):0};},
  dmgMod(inst,m,P){const sad=m.sad&&inst.raid.twinDead?1.5:1;const mk=inst.raid.marks&&inst.raid.marks[P.id];if(!mk||!m.boss)return sad;if(m.type==='r_lyra')return sad*(mk==='S'?1.5:0.4);if(m.type==='r_nora')return sad*(mk==='L'?1.5:0.4);return sad;},
  bossDied(inst,m){const r=inst.raid;const o=bossList(inst).find(x=>x!==m);if(o){r.twinDead={type:m.type,t:33};if(!o.rageMul){o.rageMul=1.4;o.dmg*=1.4;}o.sad=true;bossCard(inst,o.type==='r_lyra'?'lyraAlone':'noraAlone');fx(inst,{k:'bsay',id:o.id,m:m.type==='r_lyra'?'리라…! 용서하지 않겠어!':'노라…! 너희 모두 빛에 타 버려라!'});fx(inst,{k:'msg',m:`${o.bname}이(가) 분노했다! 30초 안에 쓰러뜨리지 않으면 ${m.bname}이(가) 되살아난다 (슬픔으로 받는 피해 +50%)`,c:'#ffb03a'});raidState(inst);return false;}return true;}};
const TWIN_P={};
function lyraAI(inst,m,T0,d,dt,sm){const T=twinTarget(inst,m);if(!T){return;}const dd=Math.hypot(T.x-m.x,T.y-m.y);if(m.phase===1&&m.hp/m.maxHp<0.5){m.phase=2;bossCard(inst,'lyra2');fx(inst,{k:'bsay',id:m.id,m:'빛이여, 모두 눈멀게 하라!'});}
  raidAIcore(inst,m,T,dd,dt,sm,{pool:m2=>m2.phase>1?['lines','homing','circles','sweep','lines']:['lines','homing','circles'],P:TWIN_P,ctrMul:1.6});}
function noraAI(inst,m,T0,d,dt,sm){const T=twinTarget(inst,m);if(!T){return;}const dd=Math.hypot(T.x-m.x,T.y-m.y);if(m.phase===1&&m.hp/m.maxHp<0.5){m.phase=2;bossCard(inst,'nora2');fx(inst,{k:'bsay',id:m.id,m:'그림자 속으로 가라앉아라…'});}
  raidAIcore(inst,m,T,dd,dt,sm,{pool:m2=>m2.phase>1?['voidOrb','poisonPools','markSpread','circles','voidOrb']:['voidOrb','poisonPools','circles'],P:TWIN_P,ctrMul:1.6});}

// ---------- 40 태엽 심장 공장: 기사단장 발렌 ----------
function clockRound(inst){const r=inst.raid,pz=r.pz;const n=pz.sizes[pz.round];const map=inst.map;
  if(pz.lev)for(const q of pz.lev)setTile(inst,Math.floor(q.x/TS),Math.floor(q.y/TS),1);
  pz.lev=[];pz.lamp=[];const x0=19.5-(n-1)*2.5;for(let i=0;i<n;i++){const tx=Math.round(x0+i*5);pz.lev.push({x:tx*TS+8,y:31*TS+8});pz.lamp.push({x:tx*TS+8,y:28*TS+4});setTile(inst,tx,31,3);}
  let st=new Array(n).fill(1);const presses=ri(2,Math.min(4,n));for(let k=0;k<presses;k++){const i=ri(0,n-1);for(const j of[i-1,i,i+1])if(j>=0&&j<n)st[j]^=1;}if(st.every(v=>v)){const i=ri(0,n-1);for(const j of[i-1,i,i+1])if(j>=0&&j<n)st[j]^=1;}/* 한 칸만 뒤집으면 레버 5개일 때 풀 수 없는 판이 나왔음 → 진짜 한 번 누른 것처럼 */pz.st2=st;pz.st='play';pz.t=r.hard?40:55;raidState(inst);
  const rd=pz.round;hint(inst,'clockpz','#ffd35a',{i:rd+1,n:pz.sizes.length},{open:()=>inst.raid.pz.round===rd&&inst.raid.pz.st==='play'&&!inst.raid.doorOpen,wait:22});}
const PLATE_OFS=[[0.12,0.2],[0.88,0.2],[0.12,0.85],[0.88,0.85]];
RAIDX.clock={init(inst){const r=inst.raid;const b=raidBoss(inst,'r_valen',inst.map.bossPt.x,inst.map.bossPt.y,1);b.col='o';inst.bossId=b.id;const br=inst.map.bossRoom;r.plates=(r.n>4?PLATE_OFS.concat([[0.35,0.12],[0.65,0.12],[0.35,0.92],[0.65,0.92]]):PLATE_OFS).map(([a,c])=>({x:(br.x+br.w*a)*TS,y:(br.y+br.h*c)*TS}));r.pz={round:0,sizes:r.hard?[4,5,5]:[4,5],st:'play',t:55,lev:null};clockRound(inst);},
  update(inst,dt){const r=inst.raid,pz=r.pz;raidAdds(inst,dt,'cog',5);
    if(pz.st==='play'&&!r.doorOpen){pz.t-=dt;if(pz.t<=0){hintUp(inst,'clockpz');fx(inst,{k:'msg',m:'증기가 폭발했다! 장치가 다시 섞인다',c:'#ff6a5a'});fx(inst,{k:'shake',v:4});for(const p of livingPlayers(inst))if(p.y>27*TS)hurtPlayer(inst,p,p.S.maxHp*(r.hard?0.4:0.22),null,{what:'과열 증기',nododge:true});clockRound(inst);}}
    const b=bossList(inst)[0];if(!b||r.stage!=='boss')return;
    const hpf=b.hp/b.maxHp;const marks=r.hard?[0.8,0.5,0.2]:[0.7,0.35];r.plN=r.plN||0;
    if(!r.pl){gmTrig(inst,'g1',hpf<0.86,'gears');gmTrig(inst,'c1',hpf<0.58,'core');gmTrig(inst,'g2',hpf<0.42,'gears');if(r.hard){gmTrig(inst,'c2',hpf<0.22,'core');gmTrig(inst,'g3',hpf<0.12,'gears');}}
    if(!r.pl&&!r.gm&&r.plN<marks.length&&hpf<marks[r.plN]){r.plN++;const need=Math.max(1,Math.min(r.plates.length,livingPlayers(inst).length));r.pl={need,t:16,hold:0};b.invul=99;b.busy=0;fx(inst,{k:'bsay',id:b.id,m:'과열 코어 가동! 막을 수 있겠나!'});hint(inst,'plates','#8fd0ff',{need},{open:()=>!!inst.raid.pl,wait:7});raidState(inst);}
    if(r.pl){const pl=r.pl;pl.t-=dt;pl.need=Math.max(1,Math.min(pl.need,livingPlayers(inst).length));const on=r.plates.filter(q=>livingPlayers(inst).some(p=>Math.hypot(p.x-q.x,p.y-q.y)<18)).length;pl.on=on;if(on>=pl.need){pl.hold+=dt;if(pl.hold>=1.5){r.pl=null;b.invul=0;b.stun=4;b.grog=inst.time+5;fx(inst,{k:'counter',id:b.id,x:r1(b.x),y:r1(b.y),by:''});fx(inst,{k:'msg',m:'압력이 빠졌다! 발렌이 휘청인다',c:'#7fd05a'});for(const p of livingPlayers(inst))rst(inst,p).gim++;raidState(inst);}}else pl.hold=0;
      if(r.pl&&pl.t<=0){r.pl=null;b.invul=0;hintUp(inst,'plates');fx(inst,{k:'msg',m:'과열 폭발!',c:'#ff4a3a'});fx(inst,{k:'shake',v:9});fx(inst,{k:'boom',x:r1(b.x),y:r1(b.y),r:200});for(const p of livingPlayers(inst))hurtPlayer(inst,p,p.S.maxHp*(r.hard?3:0.75),null,{what:'과열 폭발',nododge:true});raidState(inst);}
      if(r.pl&&(((pl.t*2)|0)!==pl.lt)){pl.lt=(pl.t*2)|0;raidState(inst);}}
    if(b.type==='r_valen'&&hpf<0.5&&!r.golem&&!r.pl&&!r.gm){r.golem=true;b.busy=2.2;b.invul=2.2;bossCard(inst,'golem');fx(inst,{k:'bsay',id:b.id,m:'태엽 심장이여, 나와 하나가 되어라!'});fx(inst,{k:'shake',v:8});fx(inst,{k:'boom',x:r1(b.x),y:r1(b.y),r:60});
      later(inst,1.2,()=>{if(b.dead)return;b.type='r_golem';b.tc=SH.MT_LIST.indexOf('r_golem');b.d=SH.MT.r_golem;b.r=SH.MT.r_golem.r;b.bname='태엽 거인 발렌';b.spd=SH.MT.r_golem.spd*(1+BAL.monDmgPerFloor*0);b.phase=2;fx(inst,{k:'msg',m:'발렌이 태엽 거인과 합체했다!',c:'#ffb03a'});});}},
  act(inst,P,i){const r=inst.raid,pz=r.pz;if(r.doorOpen||pz.st!=='play')return;const q=pz.lev[i];if(!q||Math.hypot(P.x-q.x,P.y-q.y)>30)return;for(const j of[i-1,i,i+1])if(j>=0&&j<pz.st2.length)pz.st2[j]^=1;rst(inst,P).gim++;fx(inst,{k:'bell',c:3,x:q.x,y:q.y});
    if(pz.st2.every(v=>v)){pz.st='ok';fx(inst,{k:'msg',m:'등불이 모두 켜졌다!',c:'#7fd05a'});raidState(inst);later(inst,1.4,()=>{if(r.doorOpen)return;pz.round++;if(pz.round>=pz.sizes.length){for(const q2 of pz.lev)setTile(inst,Math.floor(q2.x/TS),Math.floor(q2.y/TS),1);pz.lev=[];pz.st='done';openRaidDoor(inst);}else clockRound(inst);});}else raidState(inst);},
  pub(inst){const r=inst.raid,pz=r.pz;return{lev:r.doorOpen?[]:pz.lev.map(q=>[q.x,q.y]),lamp:r.doorOpen?[]:pz.lamp.map((q,i)=>[q.x,q.y,pz.st2[i]]),t:Math.ceil(pz.t),round:pz.round,total:pz.sizes.length,
    plates:r.plates.map(q=>[r1(q.x),r1(q.y)]),pl:r.pl?{need:r.pl.need,on:r.pl.on|0,t:Math.ceil(r.pl.t),hold:r1(r.pl.hold)}:null};}};
function valenAI(inst,m,T,d,dt,sm){if(m.invul>0&&m.invul<90){m.invul-=dt;if(m.invul<0)m.invul=0;}if(m.invul>=90){if(m.busy>0)m.busy-=dt;return;}
  raidAIcore(inst,m,T,d,dt,sm,{pool:m2=>m2.type==='r_golem'?['slam','inout','lines','rewind','circles']:['sweep','lungeFar','chainMark','rewind','circles'],P:{},spd:m.type==='r_golem'?0.8:1});}

// ---------- 50 흑월의 왕좌: 흑왕 카르나스 ----------
function moonRound(inst){const r=inst.raid,pz=r.pz;const ph=[0,1,2,3].sort(()=>R()-0.5);pz.ph=ph;pz.inp=[];pz.rev=pz.round===pz.rounds-1&&r.hard;pz.st='play';raidState(inst);
  {const rd=pz.round;hint(inst,'moonpz','#c9a0e8',{i:rd+1,n:pz.rounds,rev:pz.rev},{open:()=>inst.raid.pz.round===rd&&inst.raid.pz.st==='play'&&!inst.raid.doorOpen,wait:25});}}
RAIDX.moon={init(inst){const r=inst.raid;const b=raidBoss(inst,'r_karnas',inst.map.bossPt.x,inst.map.bossPt.y,1.6);b.col='p';inst.bossId=b.id;
    r.pz={round:0,rounds:r.hard?4:3,ph:[],inp:[],st:'play'};r.alt=[[12,31],[26,31],[12,37],[26,37]].map(([x,y])=>({x:x*TS+8,y:y*TS+8}));for(const a of r.alt)setTile(inst,Math.floor(a.x/TS),Math.floor(a.y/TS),3);moonRound(inst);
    r.ev={done:{}};r.clash=null;r.half=null;r.beat=null;r.ella=false;r.ellaT=12;},
  update(inst,dt){const r=inst.raid;raidAdds(inst,dt,'wraith',5);const b=bossList(inst)[0];if(!b||r.stage!=='boss')return;const hpf=b.hp/b.maxHp;const E=r.ev.done;
    const trig=(k,cond,f)=>{if(!E[k]&&cond&&livingPlayers(inst).length&&!r.clash&&!r.beat&&!r.clones&&!r.gm&&!(r.cardT>inst.time)&&!(b.cwEnd>inst.time)&&inst.time-(b.patT||-9)>1.6){E[k]=1;f();}};
    const calmB=!(b.cwEnd>inst.time)&&inst.time-(b.patT||-9)>1.6;/* 카운터 자세·패턴 직후에는 기믹을 시작하지 않음 (겹침 방지) */
    if(!r.clash&&!r.beat&&calmB){if(r.hard)gmTrig(inst,'s0',hpf<0.92,'shadow');gmTrig(inst,'s1',hpf<0.66,'shadow');gmTrig(inst,'s2',hpf<0.36,'shadow');if(!r.clones){gmTrig(inst,'mf',hpf<0.2,'moonfall');gmTrig(inst,'ec1',hpf<0.78,'eclipse');gmTrig(inst,'ab1',hpf<0.6,'absorb');gmTrig(inst,'ec2',hpf<0.32,'eclipse');gmTrig(inst,'ab2',hpf<0.12,'absorb');if(r.hard){gmTrig(inst,'ec3',hpf<0.52,'eclipse');gmTrig(inst,'ab3',hpf<0.42,'absorb');}}if(r.hard&&!r.clones)gmTrig(inst,'mf2',hpf<0.05,'moonfall');}trig('p2',hpf<0.5,()=>bossCard(inst,'karnas2'));trig('p3',hpf<0.26,()=>bossCard(inst,'karnas3'));
    trig('c1',hpf<0.85,()=>RAIDX.moon.clash(inst,b,1));trig('k1',hpf<0.7,()=>RAIDX.moon.clones(inst,b));trig('c2',hpf<0.55,()=>RAIDX.moon.clash(inst,b,1));
    if(hpf<0.5&&!r.ella){r.ella=true;fx(inst,{k:'msg',m:'빛의 기사 엘라가 나타났다! "제가 곁에 있을게요!"',c:'#ffe9a8'});fx(inst,{k:'sfx',n:'holy'});raidState(inst);}
    trig('k2',hpf<0.4,()=>RAIDX.moon.clones(inst,b));trig('b1',hpf<0.25,()=>RAIDX.moon.rhythm(inst,b));trig('c3',hpf<0.15,()=>RAIDX.moon.clash(inst,b,1));trig('fin',hpf<0.08,()=>RAIDX.moon.clash(inst,b,3));
    if(r.ella){r.ellaT-=dt;if(r.ellaT<=0){r.ellaT=12;fx(inst,{k:'ellaheal'});for(const p of livingPlayers(inst)){const h=Math.round(p.S.maxHp*0.2);p.hp=Math.min(p.S.maxHp,p.hp+h);fx(inst,{k:'heal',x:r1(p.x),y:r1(p.y-30),v:h});p.shield=Math.max(p.shield,Math.round(p.S.maxHp*0.1));p.shieldT=5;}}}
    if(r.clones)for(const k of r.clones){if(k.dead||k.faceLock>inst.time)continue;let T=null,bd=1e9;for(const p of livingPlayers(inst)){const dd=Math.hypot(p.x-k.x,p.y-k.y);if(dd<bd){bd=dd;T=p;}}if(T)k.face=T.x<k.x?-1:1;}/* 분신: 늘 가장 가까운 사람을 바라본다 */
    if(r.clash)RAIDX.moon.clashTick(inst,b,dt);
    if(r.beat){r.beat.t-=dt;if(r.beat.t<=0)RAIDX.moon.rhythmEnd(inst,b);}},
  clash(inst,b,n){const r=inst.raid;const br=inst.map.bossRoom;b.x=(br.x+br.w/2)*TS;b.y=(br.y+3)*TS;b.busy=99;b.invul=99;fx(inst,{k:'tp',x:r1(b.x),y:r1(b.y)});b.face=1;
    if(n>1)n=r.hard?5:4;const fin=n>1?1:0;const dur=fin?(r.hard?0.48:0.55):(r.hard?0.62:0.72);let tol=r.hard?0.11:0.16;if(r.ella&&!r.hard)tol+=0.04;const zone=[1-tol/dur,1+tol/dur];const nk=r.hard?8:4;
    /* 1단계: 흑왕이 격돌 자세 → 곁에서 상호작용을 누른 한 사람만 1:1 격돌 */
    const wait=fin?3:(r.hard?4:5);r.clash={ph:'wait',n,i:0,fin,dur,zone,tol,nk,key:(Math.random()*nk)|0,t:wait,who:0,ok:false,bad:false,res:[]};
    bcast(inst,{t:'clashw',bid:b.id,n,fin,d:wait});fx(inst,{k:'bsay',id:b.id,m:fin?'이것이 마지막이다! 나와 맞설 자, 앞으로 나와라!':'격돌하라, 필멸자여! 누가 내 칼을 받겠느냐!'});hint(inst,'clash','#c9a0e8',{n,h:r.hard?1:0});fx(inst,{k:'sfx',n:'boss'});},
  clashGo(inst,P){const r=inst.raid,c=r.clash;if(!c||c.ph!=='wait'||P.downed)return;const b=bossList(inst)[0];if(!b||Math.hypot(P.x-b.x,P.y-b.y)>84)return;
    c.ph='notes';c.who=P.id;const sd=P.x>=b.x?1:-1;let x=b.x+sd*46,y=b.y;if(SH.blocked(inst.map,x,y,3))x=b.x-sd*46;b.face=x>=b.x?1:-1;P.x=x;P.y=y;P.face=-b.face;P.moving=false;P.gmLock=inst.time+40;P.clashLk=1;send(P,{t:'tp',x:P.x,y:P.y});
    const dl=c.fin?0.55:0.45;c.t=c.dur+c.tol+0.3+dl;bcast(inst,{t:'clash',who:P.id,wn:P.ch.name,n:c.n,i:0,dur:c.dur,zone:c.zone,k:c.key,fin:c.fin,delay:dl});
    fx(inst,{k:'msg',m:`${P.ch.name}님이 흑왕과 격돌한다!`,c:'#ffe9a8'});fx(inst,{k:'bsay',id:b.id,m:'오너라!'});},
  clashPress(inst,P,v,ki){const r=inst.raid,c=r.clash;if(!c||c.ph!=='notes'||P.id!==c.who||P.downed)return;if(c.ok||c.bad)return;
    const say=(s,col)=>fx(inst,{k:'txt',x:r1(P.x),y:r1(P.y-30),s,c:col});let perf=false;
    if(ki!==c.key){c.bad=true;say('다른 키!','#e0574a');}
    else if(v>=c.zone[0]&&v<=c.zone[1]){c.ok=true;rst(inst,P).ctr++;perf=Math.abs(v-1)*c.dur<=c.tol*0.45;say(perf?'완벽!':'격돌 성공!','#ffe9a8');}else{c.bad=true;say(v<c.zone[0]?'너무 빨라':'늦었다','#9e937a');}
    bcast(inst,{t:'clashr',ok:c.ok?1:0,perf:perf?1:0,i:c.i});},
  clashTick(inst,b,dt){const r=inst.raid,c=r.clash;if(c.ph==='notes'){const P=players.get(c.who);if(!P||P.inst!==inst||P.downed)c.t=Math.min(c.t,0);}c.t-=dt;if(c.t<=0)RAIDX.moon.clashEnd(inst,b);},
  clashEnd(inst,b){const r=inst.raid,c=r.clash;const win=c.ph==='notes'&&c.ok;const nobody=c.ph==='wait';c.res.push(win);
    if(win&&c.i<c.n-1){c.i++;c.ok=false;c.bad=false;let k=(Math.random()*(c.nk-1))|0;if(k>=c.key)k++;c.key=k;c.t=c.dur+c.tol+0.3+0.15;const P=players.get(c.who);bcast(inst,{t:'clash',who:c.who,wn:P&&P.ch?P.ch.name:'',n:c.n,i:c.i,dur:c.dur,zone:c.zone,k:c.key,fin:1,delay:0.15});fx(inst,{k:'shake',v:4});return;}
    r.clash=null;b.busy=win?0.5:1.2;b.invul=0;for(const P of instPlayers(inst))if(P.clashLk){P.clashLk=0;P.gmLock=Math.min(P.gmLock||0,inst.time+0.9);}bcast(inst,{t:'clash',end:1,win,bid:b.id});
    if(win){fx(inst,{k:'counter',id:b.id,x:r1(b.x),y:r1(b.y),by:''});fx(inst,{k:'shake',v:10});b.stun=4;b.grog=inst.time+5;
      if(c.n>1){b.hp=Math.max(1,Math.round(b.maxHp*0.01));fx(inst,{k:'msg',m:'최후의 격돌에서 이겼다! 흑왕에게 마지막 일격을!',c:'#ffd35a'});fx(inst,{k:'bsay',id:b.id,m:'이럴 수가… 빛이… 흑월을…'});}else{b.hp=Math.max(1,b.hp-Math.round(b.maxHp*0.06));fx(inst,{k:'msg',m:'격돌 성공! 흑왕이 무너진다',c:'#ffd35a'});}}
    else{hintUp(inst,'clash');fx(inst,{k:'bsay',id:b.id,m:nobody?'겁쟁이들… 흑월에 삼켜져라.':'흑월이여, 모든 것을 삼켜라.'});
      if(c.fin||r.hard){/* 최후의 격돌(하드는 모든 격돌) 실패 = 파티 전멸 + 데스 카운트 소멸 (연습은 전멸 후 부활) */fx(inst,{k:'msg',m:nobody?'아무도 나서지 않았다… 흑월이 모든 것을 삼킨다':c.fin?'최후의 격돌 실패… 흑월이 모든 것을 삼킨다':'격돌 실패… 흑월이 모든 것을 삼킨다',c:'#ff4a3a'});
        if(!r.practice)r.deaths=0;groupWipe(inst,r.practice?'흑월의 일격 (연습: 7초 뒤 다시 일어납니다)':'흑월의 일격 · 데스 카운트가 모두 사라졌습니다');if(r.practice&&c.fin)r.ev.done.fin=0;}
      else{fx(inst,{k:'msg',m:nobody?'아무도 나서지 않았다! 흑월의 일격':'격돌 실패! 흑월의 일격',c:'#ff4a3a'});fx(inst,{k:'boom',x:r1(b.x),y:r1(b.y),r:220});fx(inst,{k:'shake',v:12});
        for(const p of livingPlayers(inst))hurtPlayer(inst,p,p.S.maxHp*0.45,b,{what:'흑월의 일격',nododge:true});b.hp=Math.min(b.maxHp,b.hp+Math.round(b.maxHp*0.03));
        if(!r.practice){r.deaths-=1;fx(inst,{k:'msg',m:`데스 카운트 -1 (남은 ${Math.max(0,r.deaths)}) · 흑왕 체력 3% 회복`,c:'#ff6a5a'});if(r.deaths<0)raidFail(inst,'격돌에서 패배했습니다');}}}
    raidState(inst);},
  half(inst,b){const r=inst.raid;const a=b.face<0?Math.PI:0;const ang=pick([0,Math.PI/2,Math.PI,-Math.PI/2]);const t=1.7*b.tf;r.half={a:ang,x:b.x,y:b.y};bcast(inst,{t:'half',a:ang,x:r1(b.x),y:r1(b.y),d:t});
    later(inst,t,()=>{if(b.dead)return;r.half=null;fx(inst,{k:'shake',v:7});for(const p of livingPlayers(inst)){const dx=p.x-b.x,dy=p.y-b.y;if(dx*Math.cos(ang)+dy*Math.sin(ang)>-6)hurtPlayer(inst,p,p.S.maxHp*(r.hard?3:0.75),b,{what:'반월 베기',nododge:true});}});return t+0.5;},
  clones(inst,b){const r=inst.raid;const br=inst.map.bossRoom;b.hidden=true;b.invul=99;b.busy=99;fx(inst,{k:'tp',x:r1(b.x),y:r1(b.y)});fx(inst,{k:'bsay',id:b.id,m:'네 개의 달이 너희를 심판한다'});
    hint(inst,'clones','#8fd0ff',null,{occ:1});r.clones=[];
    const pts=[[0.25,0.3],[0.75,0.3],[0.25,0.75],[0.75,0.75]];for(const [a,c] of pts){const x=(br.x+br.w*a)*TS,y=(br.y+br.h*c)*TS;const k=spawnMonster(inst,'r_karnas',x,y,false);k.summ=true;k.invul=99;k.ctrable=true;k.dmg=b.dmg;k.spd=0;k.bname='흑왕의 분신';k.alert=true;k.xp=0;k.maxHp=k.hp=1000;k.frozen=true;k.face=x<(br.x+br.w/2)*TS?1:-1;r.clones.push(k);fx(inst,{k:'blink',x:r1(x),y:r1(y)});}
    const ord=r.clones.slice().sort(()=>R()-0.5);ord.forEach((k,i)=>later(inst,1.2+i*(r.hard?1.5:1.9),()=>{if(k.dead)return;const ps=livingPlayers(inst);if(!ps.length)return;const T=ps.reduce((a,c)=>Math.hypot(a.x-k.x,a.y-k.y)<Math.hypot(c.x-k.x,c.y-k.y)?a:c);counterWindow(inst,k,T);}));
    later(inst,1.2+4*(r.hard?1.5:1.9)+1.5,()=>{for(const k of r.clones){k.dead=true;fx(inst,{k:'mdie',id:k.id});}r.clones=null;b.hidden=false;b.invul=0;b.busy=0.6;fx(inst,{k:'tp',x:r1(b.x),y:r1(b.y)});});},
  rhythm(inst,b){const r=inst.raid;const n=r.hard?8:6;const beats=[];let t=1.4;for(let i=0;i<n;i++){beats.push(r1(t));t+=rf(0.45,0.8);}b.busy=99;b.invul=99;r.beat={beats,t:t+1.2,hits:{},sent:new Set()};
    bcast(inst,{t:'beats',beats,win:r.hard?0.13:0.17});fx(inst,{k:'bsay',id:b.id,m:'흑월의 박동을 견뎌 봐라!'});hint(inst,'beats','#c9a0e8');},
  beatRes(inst,P,hit){const r=inst.raid;if(!r.beat||r.beat.sent.has(P.id))return;r.beat.sent.add(P.id);r.beat.hits[P.id]=clamp(hit|0,0,r.beat.beats.length);},
  rhythmEnd(inst,b){const r=inst.raid,B=r.beat;r.beat=null;b.invul=0;b.busy=0.6;const ps=livingPlayers(inst);const tot=ps.reduce((a,p)=>a+(B.hits[p.id]|0),0);const rate=ps.length?tot/(ps.length*B.beats.length):0;const win=rate>=(r.hard?0.75:0.6);
    for(const p of ps)if((B.hits[p.id]|0)>=B.beats.length*0.6)rst(inst,p).gim++;bcast(inst,{t:'beats',end:1,win,rate:Math.round(rate*100)});
    if(win){b.stun=4;b.grog=inst.time+5;b.hp=Math.max(1,b.hp-Math.round(b.maxHp*0.05));fx(inst,{k:'counter',id:b.id,x:r1(b.x),y:r1(b.y),by:''});fx(inst,{k:'msg',m:`역격돌 성공! (${Math.round(rate*100)}%)`,c:'#ffd35a'});}
    else{fx(inst,{k:'shake',v:9});hintUp(inst,'beats');fx(inst,{k:'msg',m:`역격돌 실패 (${Math.round(rate*100)}%)`,c:'#ff4a3a'});for(const p of ps)hurtPlayer(inst,p,p.S.maxHp*(r.hard?1.5:0.6),b,{what:'흑월의 박동',nododge:true});}},
  act(inst,P,i){const r=inst.raid,pz=r.pz;if(r.doorOpen||pz.st!=='play')return;const a=r.alt[i];if(!a||Math.hypot(P.x-a.x,P.y-a.y)>30)return;const ph=pz.ph[i];const want=pz.rev?3-pz.inp.length:pz.inp.length;fx(inst,{k:'bell',c:ph,x:a.x,y:a.y});
    if(pz.inp.includes(i))return;if(ph!==want){hintUp(inst,'moonpz');fx(inst,{k:'msg',m:'달의 순서가 틀렸다! 흑월 망령이 깨어난다',c:'#ff6a5a'});for(const p of livingPlayers(inst))hurtPlayer(inst,p,p.S.maxHp*(r.hard?0.4:0.22),null,{what:'어긋난 달빛',nododge:true});for(let k=0;k<2;k++){const m=spawnMonster(inst,'wraith',a.x+rf(-20,20),a.y+rf(-10,10),false);m.alert=true;}pz.inp=[];moonRound(inst);return;}
    pz.inp.push(i);rst(inst,P).gim++;if(pz.inp.length>=4){pz.st='ok';fx(inst,{k:'msg',m:'달이 차올랐다!',c:'#c9a0e8'});raidState(inst);later(inst,1.4,()=>{if(r.doorOpen)return;pz.round++;if(pz.round>=pz.rounds){for(const a2 of r.alt)setTile(inst,Math.floor(a2.x/TS),Math.floor(a2.y/TS),1);pz.st='done';openRaidDoor(inst);}else moonRound(inst);});}else raidState(inst);},
  pub(inst){const r=inst.raid,pz=r.pz;return{alt:r.doorOpen?[]:r.alt.map((a,i)=>[a.x,a.y,pz.ph[i],pz.inp.includes(i)?1:0]),round:pz.round,total:pz.rounds,rev:pz.rev?1:0,n:pz.inp.length,ella:r.ella?1:0};}};
/* 흑왕: 자리 잡기 기믹(그림자·일식·흑월 낙하) 중에는 카운터·광역기를 쉬고, 피할 수 있는 견제만 한다 (기믹 끝나고 2.5초 뒤부터 카운터) */
const MOON_POS_GM={shadow:1,eclipse:1,moonfall:1};
function karnasAI(inst,m,T,d,dt,sm){const r=inst.raid;m.ctrMode='moon';if(m.busy>=90||m.hidden)return;const gp=r.gm&&MOON_POS_GM[r.gm.k];if(gp)m.posGmT=inst.time;const calm=gp||inst.time-(m.posGmT||-9)<2.5;if(m.phase===1&&m.hp/m.maxHp<0.5){m.phase=2;fx(inst,{k:'bsay',id:m.id,m:'흑월이 차오른다… 이제부터가 진짜다'});}
  const hpf=m.hp/m.maxHp;if(m.phase===2&&hpf<0.26){m.phase=3;fx(inst,{k:'bsay',id:m.id,m:'절망하라. 새벽은 오지 않는다.'});}
  raidAIcore(inst,m,T,d,dt,sm,{noCtr:calm?2.5:0,pool:m2=>gp?['swipe','voidOrb','homing']:m2.phase>2?['lungeFar','sweep','circles','half','markSpread','half','circles','homing','portals','meteorRain','doom','collapse','stackMark']:m2.phase>1?['swipe','lungeFar','sweep','circles','half','half','markSpread','chainMark','collapse','stackMark','voidOrb']:['swipe','lungeFar','sweep','circles','half','voidOrb','meteorRain'],P:{half:(i,mm)=>RAIDX.moon.half(i,mm)},tempo:m2=>{if(gp)return 1.6;const f=m2.hp/m2.maxHp;return f<0.26?0.45+f*1.6:1;},ctrBase:[7,10],ctrMul:(hpf<0.26?0.7:1)*(r.hard?0.85:1),patMul:0.8});}

// ---- 클리어 · 경매 ----
function raidClear(inst,m){const r=inst.raid;if(r.done||r.fail)return;/* 실패한 뒤 남은 시간에 보스를 잡아 보상을 받던 문제 */r.done=true;raidLog(inst,'clear');
  if(r.id==='moon'&&!r.practice){const names=instPlayers(inst).map(P=>P.ch.name);const m2=`${names.join(', ')} 파티가 흑월을 껐다!${r.hard?' (하드 · 새벽을 부른 자)':''}`;for(const q of players.values())if(q.ch)send(q,{t:'msg',m:m2,c:'#ffe9a8'});bcast(hub,{t:'fameann',m:m2});FAME.push({ts:new Date().toISOString(),names,hard:!!r.hard,t:Math.round(r.bossT||0)});if(FAME.length>200)FAME.shift();try{fs.mkdirSync(path.dirname(FAME_F),{recursive:true});fs.writeFileSync(FAME_F,JSON.stringify(FAME));}catch(e){}}r.endT=r.practice?8:30;const def=r.def;
  fx(inst,{k:'bsay',id:m.id,x:r1(m.x),y:r1(m.y),m:(RAID_LINES[r.id]||['',''])[1],dead:1});fx(inst,{k:'shake',v:7});r.rings=[];r.tethers=[];inst.hz=[];r.bb=null;
  {const rows=inst.bossMeter?meterRows(inst.bossMeter):[];const res={title:`${m.bname} 처치 · ${def.n} (${r.hard?'하드':r.practice?'연습':'노말'})`,floor:def.lvl,time:Math.round(r.bossT),rows};(inst.bossHist=inst.bossHist||[]).push(res);bcast(inst,Object.assign({t:'result'},res));inst.bossMeter=null;inst.bossId=null;}
  fx(inst,{k:'msg',m:`${def.n} 클리어!`,c:'#ffd35a'});fx(inst,{k:'sfx',n:'legend'});
  const ps=instPlayers(inst);for(const P of ps){if(!r.elig.includes(P.ch.id))continue;(P.ch.raidD=P.ch.raidD||{})[r.id]=r.day;{let N=P.ch.raidN;if(!N||N.d!==r.day||!N.n)N=P.ch.raidN={d:r.day,n:{}};N.n[r.id]=(N.n[r.id]|0)+1;msg(P,`오늘 이 레이드 보상 ${Math.max(0,SH.RAID_DAILY-N.n[r.id])}/${SH.RAID_DAILY}회 남음`,'#9e937a');}if(!r.practice){const RC=P.ch.rclr||(P.ch.rclr={});RC[r.id]=(RC[r.id]|0)+1;if(r.hard){const RH=P.ch.rclrH||(P.ch.rclrH={});RH[r.id]=(RH[r.id]|0)+1;if(RH[r.id]===1){const LK={moon:'shadow',mirror:'stars',clock:'ember',bell:'ghost'}[r.id];if(LK&&SH.LEGENDS[LK])msg(P,`전설 외형 「${SH.LEGENDS[LK].n}」을 얻었어요! (외형 › 전설)`,'#ffd35a');}}if(r.id==='moon'&&r.hard)P.ch.moonH=(P.ch.moonH|0)+1;if(r.id==='moon'&&RC.moon===1)send(P,{t:'ending',id:'end2'});}P.ch.gold+=def.lvl*40;P.ch.mats.myth=(P.ch.mats.myth|0)+(r.hard?2:1);P.ch.mats.ess+=1;stInc(P,'raid');markDirty(P);msg(P,`클리어 보상: ${def.lvl*40}골드 · 신화의 파편 ${r.hard?2:1} · 핏빛 정수 1`,'#ffd35a');}
  raidState(inst);raidMvp(inst);
  if(r.practice||!r.elig.length)return;
  const fams=[...new Set(ps.map(P=>CLASSES[P.ch.cls].fam))];const L=def.lvl+5;const items=[];
  items.push(SH.genItem(L,pick(fams),3,0,R,3));for(let i=0;i<4;i++)items.push(SH.genItem(L,pick(fams),2,30,R,2));
  {const sid=SH.RAID_SET[r.id];if(sid)for(let i=0;i<(r.hard?2:1);i++)items[1+i]=SH.genSet(sid,L,pick(fams),R);}
  const mythic=R()<(r.hard?0.08:0.05);if(mythic){items[items.length-1]=SH.genMythic(L,pick(fams),R);}
  const eligP=ps.filter(P=>r.elig.includes(P.ch.id));
  if(eligP.length===1&&ps.length===1){const W=eligP[0];for(const it of items){giveLoot(inst,W,it);if(it.rar===4){stInc(W,'myth');bcast(hub,{t:'msg',m:`${W.ch.name}님이 레이드에서 신화 '${it.name}'을(를) 얻었다!!`,c:'#ff3a5a'});}}markDirty(W);
    fx(inst,{k:'msg',m:`혼자 클리어 · 전리품 ${items.length}개를 모두 가져갑니다${mythic?' (★신화 포함!)':''}`,c:mythic?'#ff3a5a':'#ffd35a'});r.endT=25;return;}
  r.auc={items:items.map(it=>({it,high:0,by:null,byN:null,done:false,win:null})),cur:0,t:18,gap:2};
  if(mythic)fx(inst,{k:'msg',m:'★ 신화 아이템이 경매에 등장했다! ★',c:'#ff3a5a'});
  aucState(inst);}
function aucPub(inst){const a=inst.raid.auc;return{cur:a.cur,t:Math.max(0,Math.round(a.t*10)/10),items:a.items.map(x=>({it:x.it,high:x.high,byN:x.byN,done:x.done,winN:x.winN||null,paid:x.paid||0})),elig:inst.raid.elig};}
function aucState(inst){bcast(inst,{t:'auc',st:aucPub(inst)});}
function aucMin(x){return x.high?Math.max(x.high+10,Math.round(x.high*1.1)):Math.max(20,Math.round(x.it.value*0.5));}
/* 레이드 보상 지급: 가방이 차면 창고로, 창고도 차면 바닥에 (레이드는 곧 닫혀 바닥 아이템이 사라지므로) */function giveLoot(inst,W,it){if(addBag(W,it))return;const k=W.stash?W.stash.indexOf(null):-1;if(k>=0){W.stash[k]=it;saveNow(W);send(W,{t:'stash',s:W.stash,save:1});msg(W,`가방이 가득 차 '${it.name}'을(를) 창고로 보냈어요`,'#ffd35a');return;}addDrop(inst,{kind:'item',owner:W.id,it},W.x,W.y);msg(W,`가방·창고가 가득 차 '${it.name}'이(가) 바닥에 떨어졌어요. 마을로 돌아가기 전에 주우세요!`,'#ff6a5a');}
function updateAuction(inst,dt){const a=inst.raid.auc;if(a.cur>=a.items.length)return;a.t-=dt;if(a.t>0)return;const x=a.items[a.cur];
  const ps=instPlayers(inst);const elig=ps.filter(P=>inst.raid.elig.includes(P.ch.id));
  /* 최고 입찰자가 떠났거나 골드가 모자라면 다음 입찰자에게 (예전엔 남은 입찰이 모두 무시되고 주사위로 공짜가 됐음) */let W=null,price=0;for(const b of (x.bids||[]).slice().sort((p,q)=>q.amt-p.amt)){const Q=players.get(b.id);if(Q&&Q.inst===inst&&Q.ch&&Q.ch.gold>=b.amt){W=Q;price=b.amt;break;}}
  if(W){W.ch.gold-=price;x.high=price;x.paid=price;const others=ps.filter(P=>P!==W);const share=others.length?Math.floor(price/others.length):0;for(const P of others){P.ch.gold+=share;markDirty(P);msg(P,`분배금 +${share}골드 (${x.it.name})`,'#ffd35a');}}
  else if(elig.length){W=pick(elig);x.paid=0;fx(inst,{k:'msg',m:`입찰자가 없어 ${W.ch.name}님이 주사위로 가져갑니다`,c:'#9e937a'});}
  if(W){giveLoot(inst,W,x.it);if(x.it.rar===4){stInc(W,'myth');bcast(hub,{t:'msg',m:`${W.ch.name}님이 레이드에서 신화 '${x.it.name}'을(를) 얻었다!!`,c:'#ff3a5a'});}markDirty(W);x.winN=W.ch.name;fx(inst,{k:'msg',m:`${x.it.name} → ${W.ch.name}${x.paid?` (${x.paid}골드)`:''}`,c:x.it.rar>=3?'#ff8a1f':'#ffd35a'});}
  x.done=true;a.cur++;a.t=a.cur<a.items.length?14:0;if(a.cur>=a.items.length){inst.raid.auc=null;inst.raid.endT=20;fx(inst,{k:'msg',m:'경매가 끝났습니다 · 20초 뒤 마을로 돌아갑니다',c:'#9e937a'});bcast(inst,{t:'auc',st:null,end:1});return;}aucState(inst);}

// ---- 신화 고유 효과 ----
function mythOn(P,k){return !!(P&&P.S&&P.S.myth&&P.S.myth.includes(k));}
function mythKill(inst,m,P){if(!P||!P.S||!P.S.myth||!P.S.myth.length||P.downed)return;
  if(mythOn(P,'vamp')){P.hp=Math.min(P.S.maxHp,P.hp+P.S.maxHp*0.03);}
  if(mythOn(P,'blast')&&!m.dummy){const x=m.x,y=m.y;later(inst,0.08,()=>{if(P.inst!==inst)return;fx(inst,{k:'boom',x:r1(x),y:r1(y),r:34});for(const o of inst.monsters)if(!o.dead&&o!==m&&Math.hypot(o.x-x,o.y-y)<34+o.r)hitMonster(inst,o,P,0.8,{myth:1});});}}
function mythCrit(inst,m,P,v){if(!mythOn(P,'chainz'))return;if(P._chzT&&inst.time-P._chzT<0.25)return;P._chzT=inst.time;const ts=inst.monsters.filter(o=>!o.dead&&o!==m&&!o.pvp&&Math.hypot(o.x-m.x,o.y-m.y)<80).sort((a,b)=>Math.hypot(a.x-m.x,a.y-m.y)-Math.hypot(b.x-m.x,b.y-m.y)).slice(0,3);
  for(const o of ts){fx(inst,{k:'chain',pts:[[r1(m.x),r1(m.y-10)],[r1(o.x),r1(o.y-10)]]});hitMonster(inst,o,P,0.6,{myth:1,el:'light'});}}
function mythTick(inst,P,dt){if(!mythOn(P,'aegis')||P.downed)return;P._aeg=(P._aeg||0)+dt;if(P._aeg>=5){P._aeg=0;const v=Math.round(P.S.maxHp*0.1);if(P.shield<v){P.shield=v;P.shieldT=5;fx(inst,{k:'txt',x:r1(P.x),y:r1(P.y-28),s:'불멸의 가호',c:'#ff8aa0'});}}}
// ---- 레이드 핸들러 ----
const RAID_H={
  raidenter(P,d){if(P.inst!==hub)return;if(!near(P,hub.map.raid,60)){msg(P,'레이드 석판에 더 가까이 가세요','#9e937a');return;}
    const def=SH.RAIDS.find(r=>r.id===d.id);if(!def||!def.ready){msg(P,'아직 열리지 않은 레이드입니다','#ff6a5a');return;}const mode=['normal','hard','practice'].includes(d.mode)?d.mode:'normal';
    const pt=P.party;if(pt.inst){msg(P,'파티가 이미 던전이나 레이드에 있습니다','#ff6a5a');return;}if(pt.leader!==P.id){msg(P,'파티장만 레이드를 열 수 있습니다','#ff6a5a');return;}
    const members=partyList(pt).filter(q=>q.inst===hub);const low=members.filter(q=>q.ch.lvl<def.lvl);if(low.length){msg(P,`레벨 ${def.lvl} 이상만 입장할 수 있어요 (${low.map(q=>q.ch.name).join(', ')})`,'#ff6a5a');return;}
    if(members.some(q=>q.fishing||q.duelLock&&Date.now()<q.duelLock)){msg(P,'결투·낚시 중인 파티원이 있어요','#ff6a5a');return;}
    createRaid(pt,def.id,mode,members);},
  rgiveup(P,d){const inst=P.inst;if(!inst||!inst.raid)return;const r=inst.raid;if(r.done||r.fail)return;const n=inst.players.size;
    if(d.a==='start'){if(n<=1){raidFail(inst,'공략을 포기했습니다');return;}if(r.vote)return;if(inst.time<(r.voteCd||0)){msg(P,`${Math.ceil(r.voteCd-inst.time)}초 뒤에 다시 투표할 수 있어요`,'#9e937a');return;}
      r.vote={by:P.ch.name,yes:new Set([P.id]),no:new Set(),t:20};fx(inst,{k:'msg',m:`${P.ch.name}님이 레이드 포기를 제안했습니다`,c:'#ffb03a'});voteCheck(inst);return;}
    if(!r.vote)return;if(d.a==='yes'){r.vote.no.delete(P.id);r.vote.yes.add(P.id);}else if(d.a==='no'){r.vote.yes.delete(P.id);r.vote.no.add(P.id);}voteCheck(inst);},
  rbell(P,d){const inst=P.inst;if(!inst||!inst.raid||P.downed||inst.raid.fail||inst.raid.done)return;const i=d.i|0;if(i>=100){gmAct(inst,P,i-100);return;}RAIDX[inst.raid.id].act(inst,P,i);},
  clashp(P,d){const inst=P.inst;if(!inst||!inst.raid||inst.raid.id!=='moon')return;RAIDX.moon.clashPress(inst,P,+d.v||0,d.ki|0);},
  clashgo(P){const inst=P.inst;if(!inst||!inst.raid||inst.raid.id!=='moon')return;RAIDX.moon.clashGo(inst,P);},
  beatres(P,d){const inst=P.inst;if(!inst||!inst.raid||inst.raid.id!=='moon')return;RAIDX.moon.beatRes(inst,P,d.hit|0);},
  bid(P,d){const inst=P.inst;if(!inst||!inst.raid||!inst.raid.auc)return;const a=inst.raid.auc,x=a.items[a.cur];if(!x||x.done)return;
    if(!inst.raid.elig.includes(P.ch.id)){msg(P,'이 레이드의 보상 대상이 아니에요','#9e937a');return;}
    const amt=Math.floor(+d.amt||0);const mn=aucMin(x);if(amt<mn){msg(P,`최소 입찰가는 ${mn}골드입니다`,'#ff6a5a');return;}if(P.ch.gold<amt){msg(P,'골드가 부족합니다','#ff6a5a');return;}if(x.by===P.id){msg(P,'이미 최고 입찰자입니다','#9e937a');return;}
    x.high=amt;x.by=P.id;x.byN=P.ch.name;(x.bids=x.bids||[]).push({id:P.id,amt});if(a.t<4)a.t=4;fx(inst,{k:'msg',m:`${P.ch.name}님 입찰 ${amt}골드 · ${x.it.name}`,c:'#ffd35a'});aucState(inst);},
  aucpass(P){const inst=P.inst;if(!inst||!inst.raid||!inst.raid.auc)return;const a=inst.raid.auc;(a.pass=a.pass||{})[a.cur+':'+P.id]=1;const ps=instPlayers(inst).filter(q=>inst.raid.elig.includes(q.ch.id));const x=a.items[a.cur];if(ps.every(q=>a.pass[a.cur+':'+q.id]||x.by===q.id)&&a.t>1.5){a.t=1.5;aucState(inst);}}
};

// ================= 스냅샷 =================
function snapshot(inst){
  const ps=instPlayers(inst).map(p=>[p.id,r1(p.x),r1(p.y),p.face,Math.ceil(p.hp),p.S.maxHp,(p.downed?1:0)|(p.dodgeT>0?2:0)|(p.moving?4:0)|(p.shield>0?8:0)|(p.buffs.godT>0?16:0),r1(p.rev/3)]);
  const base={t:'s',p:ps,fx:inst.fx};
  if(inst.type==='hub'){base.m=inst.monsters.map(m=>[m.id,m.tc,r1(m.x),r1(m.y),1,1,m.face,(m.flash>0?8:0)|(m.slow>0?2:0)|(m.stun>0?4:0),0,0,m.r]);base.j=inst.projs.map(p=>[p.id,SH.PROJ_LIST.indexOf(p.type),r1(p.x),r1(p.y),Math.round(p.vx),Math.round(p.vy),p.h]);base.z=inst.zones.map(z=>[z.vis,r1(z.x),r1(z.y),z.r,r1(z.t),z.pid]);}
  if(inst.type==='dungeon'){
    base.m=inst.monsters.filter(m=>!m.pvp).map(m=>[m.id,m.tc,r1(m.x),r1(m.y),Math.ceil(m.hp),m.maxHp,m.face,(m.elite?1:0)|(m.slow>0?2:0)|(m.stun>0?4:0)|(m.flash>0?8:0)|(m.alert?16:0)|(m.charge>0?32:0)|(m.moving?64:0)|(m.invul>0?128:0)|(m.vuln>0?256:0)|(m.hidden?512:0)|(m.cloneOf?1024:0)|(m.phase>1?2048:0)|(m.cwEnd&&inst.time<m.cwEnd?4096:0),SH.WIND_LIST.indexOf(m.windType)*(m.wind>0?1:0),r1(Math.max(0,m.atkT)),m.r,(m.ea||0)|(m.shT>0&&m.shV>0?256:0)]);
    base.j=inst.projs.map(p=>[p.id,SH.PROJ_LIST.indexOf(p.type),r1(p.x),r1(p.y),Math.round(p.vx),Math.round(p.vy),p.h]);
    base.z=inst.zones.map(z=>[z.vis,r1(z.x),r1(z.y),z.r,r1(z.t),z.pid]);for(const h of inst.hz)base.z.push([h.vis,r1(h.x),r1(h.y),Math.min(h.r,400),r1(h.t),h.arm>0?1:0]);base.dark=inst.dark>0?1:0;
    base.pause=inst.paused;base.trans=inst.trans?r1(inst.trans.t):0;if(inst.allies&&inst.allies.length)base.al=inst.allies.map(a=>[a.id,a.type,r1(a.x),r1(a.y),Math.ceil(a.hp),a.maxHp,a.face,(a.downed?1:0)|(a.atk>0?2:0)|(a.mv?4:0),a.owner]);if(inst.traps&&inst.traps.length)base.tr=inst.traps.map(t=>[t.k,r1(t.x),r1(t.y),t.st]);
    if(inst.raid){const r=inst.raid;if(r.rings.length)base.rg=r.rings.map(g=>[r1(g.x),r1(g.y),Math.round(g.r)]);if(r.tethers.length)base.tt=r.tethers.map(t=>[t.a,t.b==='boss'?0:t.b,t.ok?1:0,r1(t.t)]);}
  }
  const fm=inst.field?base.m:null,fj=inst.field?base.j:null;const s0=inst.field?null:JSON.stringify(base).slice(0,-1);
  for(const P of instPlayers(inst)){if(P.ws.readyState!==1)continue;let s1=s0;if(fm){base.m=fm.filter(q=>Math.abs(q[2]-P.x)<420&&Math.abs(q[3]-P.y)<300);base.j=fj.filter(q=>Math.abs(q[2]-P.x)<460&&Math.abs(q[3]-P.y)<320);s1=JSON.stringify(base).slice(0,-1);}
    const b=P.buffs,mx=(...ks)=>{let v=0;for(const k of ks)if(b[k+'T']>v)v=b[k+'T'];return r1(v);};const me=[Math.ceil(P.hp),P.S.maxHp,Math.floor(P.mp),P.S.maxMp,Math.round(P.shield),mx('dmg','sdmg','bdmg'),mx('red','wred','tred'),r1(atkMul(P)),mx('as'),P.rootT>0?0:r1((1-(P.slowV||0)*(P.slowT>0?1:0))*(1+bOn(P,'kms'))),P.burn||0,Math.floor(P.holy||0),Math.floor(P.steam||0)];
    P.ws.send(s1+',"me":'+JSON.stringify(me)+'}');}
  inst.fx=[];
}

// ================= 메시지 처리 =================
function sanitizeChar(o){if(!SH.validChar(o))return null;const C=CLASSES[o.cls];
  const ch={v:1,id:String(o.id||SH.rid()).slice(0,24),name:String(o.name).slice(0,12)||'모험가',cls:o.cls,lvl:clamp(o.lvl|0,1,SH.LVL_CAP),xp:Math.max(0,o.xp|0),pts:Math.max(0,o.pts|0),
    str:o.str|0||C.base.str,dex:o.dex|0||C.base.dex,vit:o.vit|0||C.base.vit,ene:o.ene|0||C.base.ene,gold:Math.max(0,o.gold|0),pots:{hp:clamp((o.pots&&o.pots.hp)|0,0,9),mp:clamp((o.pots&&o.pots.mp)|0,0,9)},
    eq:{weapon:fixItem(o.eq.weapon),armor:fixItem(o.eq.armor),ring:fixItem(o.eq.ring)},bag:new Array(20).fill(null),cps:Array.isArray(o.cps)&&o.cps.length?o.cps.filter(n=>Number.isInteger(n)&&n>=1&&n<=100):[1],best:o.best|0,kills:o.kills|0,created:o.created||Date.now()};
  for(let i=0;i<SH.BAG_N;i++)ch.bag[i]=fixItem(o.bag[i]);for(const k of['weapon','armor','ring'])if(ch.eq[k]&&ch.eq[k].slot!==k)ch.eq[k]=null;/* 아이템 레벨 상한(만렙) 맞추기 */for(const k of['weapon','armor','ring'])SH.itemCapLv(ch.eq[k]);for(const it of ch.bag)SH.itemCapLv(it);if(!ch.cps.includes(1))ch.cps.unshift(1);
  ch.adv=(typeof o.adv==='string'&&SH.ADV[o.adv]&&SH.ADV[o.adv].cls===o.cls&&ch.lvl>=SH.ADV_LVL)?o.adv:null;/* 전직 */
  ch.awk=o.awk&&ch.adv&&ch.lvl>=SH.AWK_LVL?1:0;ch.awl=ch.awk?clamp(o.awl|0,0,SH.AWL_MAX):0;ch.awx=ch.awk?Math.max(0,o.awx|0):0;ch.awn={};if(ch.awk&&o.awn&&typeof o.awn==='object'){let left=ch.awl;for(const k in SH.AWN){const v=Math.min(clamp(o.awn[k]|0,0,SH.AWN_MAX),left);if(v>0){ch.awn[k]=v;left-=v;}}}/* 3차 각성 */
  const cs=C.skills.concat(ch.adv?SH.ADV[ch.adv].sk:[]).concat(ch.awk?SH.AWK[ch.adv].ids:[]),def=SH.defaultSkills(o.cls);let sk={};if(o.sk&&typeof o.sk==='object')for(const s of cs){const r=clamp(o.sk[s]|0,0,SH.MAX_RANK);if(r>0&&SKILLS[s].lvl<=ch.lvl)sk[s]=r;}
  for(const s in def.sk)if(!sk[s])sk[s]=1;const spent=Object.values(sk).reduce((a,b)=>a+b,0)-2,total=SH.spTotal(ch);
  if(spent>total){sk=def.sk;ch.spts=total;}else ch.spts=total-spent;ch.sk=sk;
  ch.bar=new Array(SH.BAR_SIZE).fill(null);const src=Array.isArray(o.bar)?o.bar:def.bar;const used=new Set();for(let i=0;i<SH.BAR_SIZE;i++){const s=src[i];if(s==='ctr'&&!used.has(s)){ch.bar[i]=s;used.add(s);continue;}if(s&&sk[s]&&!SKILLS[s].pas&&!used.has(s)){ch.bar[i]=s;used.add(s);}}
  ch.ctrb=1;if(!o.ctrb&&!used.has('ctr')){const e=ch.bar.indexOf(null);if(e>=0)ch.bar[e]='ctr';}/* 카운터 스킬을 단축키 칸으로: 예전 캐릭터는 빈 칸에 자동 배치 (한 번만) */
  if(!ch.bar.some(Boolean))ch.bar=def.bar.slice();
  ch.rmb=null;{const rm=(typeof o.rmb==='string'&&sk[o.rmb]&&SKILLS[o.rmb]&&!SKILLS[o.rmb].pas)?o.rmb:null;if(rm&&!ch.bar.includes(rm)){const e=ch.bar.indexOf(null);if(e>=0)ch.bar[e]=rm;}}/* 우클릭 전용 칸은 이동으로 바뀌어 폐지 → 빈 단축키 칸으로 옮김 *//* 우클릭 전용 스킬 */
  const mt=o.mats||{};ch.mats={iron:clamp(mt.iron|0,0,99999),dust:clamp(mt.dust|0,0,99999),ess:clamp(mt.ess|0,0,99999),myth:clamp(mt.myth|0,0,99999)};
  ch.gems={};if(o.gems&&typeof o.gems==='object')for(const g in o.gems)if(SH.gemOk(g)){const n=clamp(o.gems[g]|0,0,9999);if(n)ch.gems[g]=n;}
  if(o.bty&&typeof o.bty==='object'&&typeof o.bty.d==='string'&&o.bty.d===dayKey()&&Array.isArray(o.bty.q)){/* 진행도(n)·받음(cl)만 가져오고 종류·목표·보상은 서버가 다시 만듦 */const q=genBtyQ(ch.id,clamp(o.best|0,1,100),o.bty.d);q.forEach((x,i)=>{const c=o.bty.q[i];if(c&&typeof c==='object'&&c.t===x.t){x.n=clamp(c.n|0,0,x.need);x.cl=!!c.cl;}});ch.bty={d:o.bty.d,q,all:!!o.bty.all&&q.every(x=>x.cl)};}
  ch.bossK=Math.max(0,o.bossK|0);
  ch.pvp={w:Math.max(0,(o.pvp&&o.pvp.w)|0),l:Math.max(0,(o.pvp&&o.pvp.l)|0)};
  ch.fish={};if(o.fish&&typeof o.fish==='object')for(const f of SH.FISH){const n=clamp(o.fish[f.id]|0,0,9999);if(n)ch.fish[f.id]=n;}ch.fishN=Math.max(0,o.fishN|0);ch.fishXp=o.fishXp!=null&&isFinite(+o.fishXp)?clamp(+o.fishXp|0,0,999999):Math.min(999999,ch.fishN*6);ch.fishBest=o.fishBest&&typeof o.fishBest==='object'?{id:String(o.fishBest.id).slice(0,4),cm:clamp(+o.fishBest.cm||0,0,200)}:null;ch.cprBest=o.cprBest&&typeof o.cprBest==='object'?{s:clamp(o.cprBest.s|0,0,5e7),best:clamp(o.cprBest.best|0,0,99999),p:clamp(o.cprBest.p|0,0,99999)}:null;
  ch.dyes=Array.isArray(o.dyes)?o.dyes.filter(i=>Number.isInteger(i)&&i>0&&i<SH.DYES.length):[];ch.dye=Number.isInteger(o.dye)&&(o.dye===0||ch.dyes.includes(o.dye))?o.dye:0;
  {const tr=SH.TALENTS[ch.cls];ch.tal={};if(o.tal&&typeof o.tal==='object')for(const br of tr)for(const nd of br.n){const r=clamp(o.tal[nd.id]|0,0,nd.max);if(r)ch.tal[nd.id]=r;}if(SH.talentSpent(ch)>SH.talentPts(ch.lvl))ch.tal={};}
  ch.ach=Array.isArray(o.ach)?o.ach.filter(id=>SH.ACH.some(a=>a.id===id)):[];ch.title=typeof o.title==='string'&&ch.ach.includes(o.title)?o.title:null;
  {const ok=new Set(SH.codexList().map(c=>c.k));ch.cdx=Array.isArray(o.cdx)?[...new Set(o.cdx.filter(k=>ok.has(k)))]:[];}
  ch.st={};if(o.st&&typeof o.st==='object')for(const k of['gob','alt','sec','bty','gam','leg','maxUp','ctr','raid','myth'])ch.st[k]=Math.max(0,o.st[k]|0);ch.cleared=Math.max(0,o.cleared|0);
  ch.pets=Array.isArray(o.pets)?o.pets.filter(id=>SH.PETS.some(p=>p.id===id)):[];ch.pet=ch.pets.includes(o.pet)?o.pet:null;
  ch.lore=Array.isArray(o.lore)?[...new Set(o.lore.filter(i=>Number.isInteger(i)&&i>=0&&i<SH.LORE.length))]:[];
  ch.merc=typeof o.merc==='string'&&SH.MERCS[o.merc]?o.merc:null;
  ch.raidN=null;if(o.raidN&&typeof o.raidN==='object'&&o.raidN.d===SH.kstDay()&&o.raidN.n&&typeof o.raidN.n==='object'){ch.raidN={d:o.raidN.d,n:{}};for(const r of SH.RAIDS){const v=clamp(o.raidN.n[r.id]|0,0,SH.RAID_DAILY);if(v)ch.raidN.n[r.id]=v;}}
  ch.raidD={};if(o.raidD&&typeof o.raidD==='object')for(const r of SH.RAIDS)if(typeof o.raidD[r.id]==='string')ch.raidD[r.id]=o.raidD[r.id].slice(0,10);
  ch.moonH=Math.max(0,o.moonH|0);ch.rclr={};if(o.rclr&&typeof o.rclr==='object')for(const r of SH.RAIDS){const v=Math.max(0,o.rclr[r.id]|0);if(v)ch.rclr[r.id]=v;}ch.rclrH={};if(o.rclrH&&typeof o.rclrH==='object')for(const r of SH.RAIDS){const v=Math.min(ch.rclr[r.id]|0,Math.max(0,o.rclrH[r.id]|0));if(v)ch.rclrH[r.id]=v;}if(!ch.rclrH.moon&&(o.moonH|0)>0&&(ch.rclr.moon|0)>0)ch.rclrH.moon=Math.min(ch.rclr.moon,o.moonH|0);
  if((o.lvl|0)>SH.LVL_CAP){const C0=CLASSES[ch.cls];ch.str=C0.base.str;ch.dex=C0.base.dex;ch.vit=C0.base.vit;ch.ene=C0.base.ene;ch.pts=3*(SH.LVL_CAP-1);ch.xp=0;ch.tal={};ch.sk=SH.defaultSkills(ch.cls).sk;ch.spts=SH.skillPointsTotal(SH.LVL_CAP)-(Object.values(ch.sk).reduce((a,b)=>a+b,0)-2);ch.bar=SH.defaultSkills(ch.cls).bar.slice();while(ch.bar.length<SH.BAR_SIZE)ch.bar.push(null);ch._capped=1;}
  {let u=o.ult;if(ch.awk&&SH.AWK[ch.adv]&&u===SH.ADV[ch.adv].ult)u=SH.AWK[ch.adv].ult;ch.ult=typeof u==='string'&&SH.ultsOf(ch).includes(u)&&ch.lvl>=SH.ULT_LVL?u:null;}
  ch.cos={cape:!(o.cos&&o.cos.cape===0)?1:0,glow:!(o.cos&&o.cos.glow===0)?1:0,shield:!(o.cos&&o.cos.shield===0)?1:0};
  {const okItem=q=>q&&typeof q==='object'&&((q.t==='r'&&SH.RELICS[q.id])||(q.t==='s'&&SH.TABLETS[q.id]));const fix=q=>q.t==='r'?{t:'r',id:q.id,lv:clamp(q.lv|0,1,SH.RELICS[q.id].max)}:{t:'s',id:q.id,r:(q.r|0)&3};
    ch.rbagLv=clamp(o.rbagLv|0,0,SH.RBAG_SZ.length-1);const nb=SH.relicNewBag(ch.rbagLv);if(o.rbag&&Array.isArray(o.rbag.c)&&o.rbag.w===nb.w&&o.rbag.h===nb.h)nb.c=o.rbag.c.slice(0,nb.w*nb.h).map(q=>okItem(q)?fix(q):null);while(nb.c.length<nb.w*nb.h)nb.c.push(null);ch.rbag=nb;
    ch.fbase=Array.isArray(o.fbase)?[...new Set(o.fbase.map(v=>v|0).filter(v=>v>=0&&v<12))]:[];
    ch.rinv=Array.isArray(o.rinv)?o.rinv.filter(okItem).map(fix).slice(0,SH.RINV_MAX):[];}
  ch.cst=Array.isArray(o.cst)?[...new Set(o.cst.filter(k=>typeof k==='string'&&SH.COSTUMES[k]))]:[];ch.cstOn=typeof o.cstOn==='string'&&ch.cst.includes(o.cstOn)?o.cstOn:null;
  ch.mts=Array.isArray(o.mts)?[...new Set(o.mts.filter(k=>typeof k==='string'&&SH.MOUNTS[k]))]:[];ch.mtOn=typeof o.mtOn==='string'&&ch.mts.includes(o.mtOn)?o.mtOn:null;
  ch.fps=Array.isArray(o.fps)?[...new Set(o.fps.filter(k=>typeof k==='string'&&SH.FOOTS[k]))]:[];ch.fpOn=typeof o.fpOn==='string'&&ch.fps.includes(o.fpOn)?o.fpOn:null;
  ch.cprTop1=o.cprTop1?1:0;ch.fishLeg=o.fishLeg?1:0;ch.lgOn=typeof o.lgOn==='string'&&SH.LEGENDS[o.lgOn]?o.lgOn:null;
  ch.skins=Array.isArray(o.skins)?[...new Set(o.skins.filter(k=>typeof k==='string'&&SH.SKINS[k]))]:[];ch.skinOn={};if(o.skinOn&&typeof o.skinOn==='object')for(const f in SH.FAMN){const k=o.skinOn[f];if(typeof k==='string'&&ch.skins.includes(k)&&SH.SKINS[k].fam===f)ch.skinOn[f]=k;}/* 꾸미기 무기 외형 */
  /* 이름 중복 수정: 예전엔 '천사의 날개 활'이 'angelbow'(천상의 활)와 같은 이름이라 구분 불가 → 'angelbow' 보유자에게 두 활 모두 한 번만 지급 */if(!o.wbfix&&ch.skins.includes('angelbow')&&!ch.skins.includes('wingbow'))ch.skins.push('wingbow');ch.wbfix=1;
  ch.trl={b:Math.max(0,(o.trl&&o.trl.b)|0),n:Math.max(0,(o.trl&&o.trl.n)|0),d:o.trl&&typeof o.trl.d==='string'?o.trl.d.slice(0,10):''};/* 그림자 시험 기록 */
  return ch;}
const own=(T,k)=>typeof k==='string'&&Object.prototype.hasOwnProperty.call(T,k);
function okItem(it){return !!(it&&typeof it==='object'&&['weapon','armor','ring'].includes(it.slot)&&Number.isInteger(it.rar)&&it.rar>=0&&it.rar<=4&&(it.rar<4||own(SH.MYTH,it.myth))&&(!it.set||own(SH.SETS,it.set))&&it.base&&typeof it.base==='object'&&Array.isArray(it.aff)&&typeof it.name==='string');}
/* 저장에서 온 아이템 다듬기: 숫자가 아닌 값·빈 능력·이상한 보석을 걸러 냄 (예전엔 가방·장비를 그대로 믿어 판매가를 바꿔 골드를 무한히 얻거나 골드가 NaN이 되어 모든 구매가 공짜가 될 수 있었음) */
function fixItem(it){if(!okItem(it))return null;const o=Object.assign({},it);o.id=String(o.id||SH.rid()).slice(0,24);o.name=o.name.slice(0,40);o.value=clamp(Math.round(+o.value)||0,0,50000);o.L=Math.max(1,o.L|0);if(o.up!=null)o.up=clamp(o.up|0,0,SH.TRANS_MAX||15);if(o.tp!=null)o.tp=clamp(o.tp|0,0,100);
  o.base=Object.assign({},o.base);for(const k in o.base){const v=+o.base[k];if(!Number.isFinite(v))delete o.base[k];else o.base[k]=v;}
  o.aff=o.aff.filter(a=>a&&typeof a==='object'&&own(SH.AFF,a.k)&&Number.isFinite(+a.v)).slice(0,8).map(a=>Object.assign({},a,{v:+a.v}));
  if(o.so!=null){o.so=Array.isArray(o.so)?o.so.slice(0,(SH.SOCK_MAX&&SH.SOCK_MAX[o.slot])||3).map(g=>typeof g==='string'&&SH.gemOk(g)?g:null):[];}
  return o;}
const STASH_N=40;
function sanitizeStash(a){const out=new Array(STASH_N).fill(null);if(Array.isArray(a))for(let i=0;i<STASH_N;i++){let it=null;try{it=fixItem(a[i]);if(it)it=SH.itemCapLv(it);}catch(e){it=null;}out[i]=it;}return out;}
function near(P,pt,r){return Math.hypot(P.x-pt.x,P.y-pt.y)<=r;}
function addBag(P,it){const i=P.ch.bag.indexOf(null);if(i<0)return false;P.ch.bag[i]=it;return true;}

// ================= 업적 · 도감 =================
function addCdx(P,k){const c=P.ch.cdx||(P.ch.cdx=[]);if(c.includes(k))return;const e=SH.codexList().find(x=>x.k===k);if(!e)return;/* 도감에 없는 항목(황야 몬스터 등)이 쌓여 도감 업적이 부풀던 문제 */c.push(k);if(e)msg(P,`도감 등록: ${e.n} (${c.length}/${SH.codexList().length})`,'#c9a0e8');markDirty(P);}
function stInc(P,k,n){const st=P.ch.st||(P.ch.st={});st[k]=(st[k]|0)+(n==null?1:n);markDirty(P);}
function checkAch(P){const ch=P.ch;ch.ach=ch.ach||[];for(const a of SH.ACH){if(ch.ach.includes(a.id))continue;if((a.c(ch)|0)<a.need)continue;ch.ach.push(a.id);
    msg(P,`업적 달성: ${a.n} · 칭호 '${a.t}' 획득`,'#ffd35a');send(P,{t:'ach',id:a.id});
    if(a.pet&&!(ch.pets||[]).includes(a.pet)){(ch.pets=ch.pets||[]).push(a.pet);const pt=SH.PETS.find(x=>x.id===a.pet);msg(P,`새 펫: ${pt.n}! 기록 창(J)에서 데리고 다닐 수 있어요`,'#7fd05a');}
    if(P.inst)for(const q of instPlayers(P.inst))if(q!==P)msg(q,`${ch.name}님이 업적 '${a.n}'을(를) 달성했습니다`,'#c9a0e8');}}

// ================= 현상금 게시판 (하루 3개, 한국 시간 자정 초기화) =================
const BTY_T={kill:{n:'몬스터 처치',need:[60,100,150]},elite:{n:'정예 몬스터 처치',need:[6,10,15]},boss:{n:'보스 처치',need:[1,2,3]},floor:{n:'던전 층 내려가기',need:[5,8,12]},gem:{n:'보석 줍기',need:[2,3,5]}};
function dayKey(){return new Date(Date.now()+9*3600e3).toISOString().slice(0,10);}
/* 오늘의 의뢰는 날짜·캐릭터로 정해짐 → 보상은 항상 서버가 다시 만듦 (예전엔 클라이언트 저장값의 보상을 그대로 믿어 금액을 바꿀 수 있었음) */
function genBtyQ(id,best,d){
  let h=2166136261;for(const c of d+id)h=Math.imul(h^c.charCodeAt(0),16777619);const rr=SH.mulberry(h>>>0);
  const types=Object.keys(BTY_T);const q=[];best=Math.max(1,best|0);
  while(q.length<3){const t=types.splice(Math.floor(rr()*types.length),1)[0];const lv=Math.floor(rr()*3);const need=BTY_T[t].need[lv];
    const r={gold:Math.round((80+best*30)*(1+lv*0.6)*(t==='boss'?1.5:1)),iron:3+lv*2,dust:1+lv,gem:SH.GEM_T[Math.floor(rr()*6)]+SH.gemTierFor(best,rr)};if(t==='boss')r.ess=1+lv;
    q.push({t,n:0,need,cl:false,r});}
  return q;}
function ensureBty(P){const ch=P.ch,d=dayKey();if(ch.bty&&ch.bty.d===d)return ch.bty;ch.bty={d,q:genBtyQ(ch.id,ch.best,d),all:false};markDirty(P);return ch.bty;}
function bump(P,t,n){if(!P.ch)return;const b=ensureBty(P);for(const q of b.q){if(q.t!==t||q.n>=q.need)continue;q.n=Math.min(q.need,q.n+n);if(q.n>=q.need)msg(P,`의뢰 완료: ${BTY_T[t].n} ${q.need} · 마을 게시판에서 보상을 받으세요`,'#ffd35a');markDirty(P);}}
function giveR(P,r){const ch=P.ch,got=[];if(r.gold){ch.gold+=r.gold;got.push(`${r.gold}골드`);}for(const k of['iron','dust','ess'])if(r[k]){ch.mats[k]+=r[k];got.push(`${MAT_N[k]} ${r[k]}`);}
  if(r.gem&&SH.gemOk(r.gem)){ch.gems[r.gem]=(ch.gems[r.gem]|0)+1;got.push(SH.gemName(r.gem));}markDirty(P);return got.join(', ');}
const MAT_N={iron:'철 조각',dust:'마력 가루',ess:'핏빛 정수',myth:'신화의 파편'};

// ================= 대장간 =================
function refItem(P,d){if(d.w==='eq'){if(!['weapon','armor','ring'].includes(d.s))return null;return P.ch.eq[d.s]||null;}const i=d.i|0;if(i<0||i>=SH.BAG_N)return null;return P.ch.bag[i]||null;}
function findItemById(P,id){for(const s2 of['weapon','armor','ring'])if(P.ch.eq[s2]&&P.ch.eq[s2].id===id)return P.ch.eq[s2];return P.ch.bag.find(x=>x&&x.id===id)||null;}
function pay(P,c){const ch=P.ch,m=ch.mats;if((c.gold|0)>ch.gold){msg(P,'골드가 부족합니다','#ff6a5a');return false;}for(const k of['iron','dust','ess','myth'])if((c[k]|0)>(m[k]|0)){msg(P,`${MAT_N[k]}이(가) 부족합니다`,'#ff6a5a');return false;}
  ch.gold-=c.gold|0;for(const k of['iron','dust','ess','myth'])m[k]=(m[k]|0)-(c[k]|0);markDirty(P);return true;}
function afterItem(P,it){const eqd=['weapon','armor','ring'].some(s2=>P.ch.eq[s2]===it);if(eqd){recalc(P);if(P.inst)bcastRoster(P.inst);}else markDirty(P);}
function salvageItem(P,i){const it=P.ch.bag[i];if(!it)return null;const y=SH.salvageOf(it);const m=P.ch.mats;m.iron+=y.iron;m.dust+=y.dust;m.ess+=y.ess;if(y.myth)m.myth=(m.myth|0)+y.myth;let dust2=0;if(y.dustP&&R()<y.dustP){m.dust++;dust2=1;}
  const gems=[];for(const g of it.so||[])if(g){P.ch.gems[g]=(P.ch.gems[g]|0)+1;gems.push(g);}if(it.rar>=1&&R()<0.15){const g=SH.randGem(it.L|0);P.ch.gems[g]=(P.ch.gems[g]|0)+1;gems.push(g);}
  P.ch.bag[i]=null;markDirty(P);return{iron:y.iron,dust:y.dust+dust2,ess:y.ess,gems};}
const BS={
  lvup(P,d){const it=refItem(P,d);if(!it)return;const cap=Math.min(SH.LVL_CAP,P.ch.lvl|0);const L=it.L|0;if(L>=cap){msg(P,`아이템 레벨은 캐릭터 레벨(${cap})까지만 올릴 수 있어요`,'#9e937a');return;}const n=d.max?cap-L:Math.min(clamp(d.n|0,1,50),cap-L);const c=SH.lvCost(it,n);if(!pay(P,c))return;SH.itemLvUp(it,n);markDirty(P);msg(P,`${it.name} · 아이템 레벨 ${L} → ${it.L}`,'#7fd05a');send(P,{t:'fxp',k:'gold'});afterItem(P,it);send(P,{t:'bsr',op:'lvup',L:it.L});},
  enh(P,d){const it=refItem(P,d);if(!it)return;const up=it.up|0;if(up>=SH.enhMax(it)){msg(P,up>=SH.ENH_MAX&&!SH.canTrans(it)?'초월 강화는 전설·신화·세트 장비만 할 수 있어요':'이미 최대 강화입니다','#9e937a');return;}const c=SH.enhCost(it);if(!pay(P,c))return;
    const ok=R()*100<SH.enhRate(it);if(!ok&&up>=SH.ENH_MAX)it.tp=(it.tp|0)+5;if(ok){it.up=up+1;it.tp=0;if(it.up===SH.TRANS_MAX)bcast(hub,{t:'msg',m:`${P.ch.name}님이 '${it.name}'을(를) +15 초월했다!`,c:'#ffd35a'});if(it.up>((P.ch.st&&P.ch.st.maxUp)|0))stInc(P,'maxUp',it.up-((P.ch.st&&P.ch.st.maxUp)|0));msg(P,`강화 성공! ${SH.itemName(it)}`,'#ffd35a');}else msg(P,`강화 실패 · 재료만 사라졌습니다 (+${up} 유지)`,'#ff6a5a');afterItem(P,it);send(P,{t:'bsr',op:'enh',ok,up:it.up|0});},
  rr(P,d){const it=refItem(P,d);if(!it)return;const a=d.a|0,cur=it.aff[a];if(!cur)return;/* 재련 능력 제한 없음: 어느 능력이든 매번 고를 수 있음 */
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
  salvAll(P,d){const mx=clamp(d.max|0,0,2);let n=0;const tot={iron:0,dust:0,ess:0,g:0};for(let i=0;i<SH.BAG_N;i++){const it=P.ch.bag[i];if(!it||it.rar>mx||(it.so||[]).some(Boolean))continue;const y=salvageItem(P,i);n++;tot.iron+=y.iron;tot.dust+=y.dust;tot.ess+=y.ess;tot.g+=y.gems.length;}
    if(!n){msg(P,'분해할 아이템이 없습니다','#9e937a');return;}msg(P,`${n}개 분해 · 철 조각 ${tot.iron}${tot.dust?`, 마력 가루 ${tot.dust}`:''}${tot.g?`, 보석 ${tot.g}`:''}`,'#d2c7ab');send(P,{t:'bsr',op:'salv'});}
};
function msUntilReset(){const n=Date.now()+9*3600e3;return 86400e3-(n%86400e3);}
function inYard(P){return P.inst===hub&&hub.map.dummies.some(d=>Math.hypot(P.x-d.x,P.y-d.y)<130);}
const H={
  bsort(P){const b=P.ch.bag;while(b.length<SH.BAG_N)b.push(null);const SO={weapon:0,armor:1,ring:2};const its=b.filter(Boolean).sort((a,c)=>(SO[a.slot]??3)-(SO[c.slot]??3)||(c.rar|0)-(a.rar|0)||(c.L|0)-(a.L|0)||String(a.name).localeCompare(String(c.name)));for(let i=0;i<SH.BAG_N;i++)b[i]=its[i]||null;markDirty(P);},
  mv(P,d){const inst=P.inst;if(!inst||P.downed)return;if(inst.type==='dungeon'&&(inst.paused||inst.trans&&inst.trans.t<0.3))return;
    const x=+d.x,y=+d.y;if(!isFinite(x)||!isFinite(y))return;if(d.q!=null&&(d.q|0)!==(P.tpSeq|0))return;/* 속박 중에는 제자리 */if(P.rootT>0&&Math.hypot(x-P.x,y-P.y)>3){if(inst.time-(P.lkT||0)>0.4){P.lkT=inst.time;send(P,{t:'tp',x:P.x,y:P.y});}return;}if(P.gmLock>inst.time){if(Math.hypot(x-P.x,y-P.y)>3&&inst.time-(P.lkT||0)>0.4){P.lkT=inst.time;send(P,{t:'tp',x:P.x,y:P.y});}return;}const nb=SH.blocked(inst.map,x,y,3);const esc=nb&&SH.blocked(inst.map,P.x,P.y,3)&&SH.blockedN(inst.map,x,y,3)<=SH.blockedN(inst.map,P.x,P.y,3);/* 닫힌 문·벽을 건너뛰는 이동(조작된 클라이언트) 막기: 지나온 길에 벽이 있으면 거부 (벽에 끼어 빠져나오는 중이면 예외) */const thru=!nb&&Math.hypot(x-P.x,y-P.y)>10&&!SH.blocked(inst.map,P.x,P.y,3)&&!SH.los(inst.map,P.x,P.y,x,y);if(Math.hypot(x-P.x,y-P.y)>90||(nb&&!esc)||thru){P.bad=(P.bad||0)+1;if(P.bad>=3){P.bad=0;if(!unstick(inst,P))send(P,{t:'tp',x:P.x,y:P.y});}return;}P.bad=0;P.x=x;P.y=y;P.face=d.f<0?-1:1;P.moving=!!d.m;},
  atk(P,d){const inst=P.inst;if(!inst||P.downed||inst.paused)return;if(inst.type!=='dungeon'&&!inYard(P))return;if(inst.arena&&(inst.arena.cd>0||inst.arena.over))return;if(P.gmLock>inst.time)return;P.actT=inst.time;inst._src='atk';try{withFoes(inst,P,()=>basicAttack(inst,P,+d.a||0));}finally{inst._src=null;}},
  sk(P,d){const inst=P.inst;const i=d.i|0;if(i<0||i>SH.BAR_SIZE)return;const no=()=>{const sid=skBarId(P,i);if(sid)skSync(P,sid);};if(!inst||P.downed){no();return;}if(inst.type!=='dungeon'&&!inYard(P)){msg(P,'마을에서는 훈련장에서만 스킬을 쓸 수 있습니다','#9e937a');no();return;}if(inst.arena&&(inst.arena.cd>0||inst.arena.over)){no();return;}if(inst.paused||P.gmLock>inst.time){no();return;}P.actT=inst.time;castSkill(inst,P,i,+d.x||P.x,+d.y||P.y);},
  dodge(P){if(P.downed||P.dodgeCd>0.1||P.rootT>0)return;P.dodgeT=0.35;P.dodgeCd=0.9;if(P.inst&&P.S.rl)relicDodge(P.inst,P);if(P.burn){P.burn=0;if(P.inst)fx(P.inst,{k:'txt',x:r1(P.x),y:r1(P.y-30),s:'화상 해제',c:'#8fd0ff'});}},
  pot(P,d){if(P.downed||P.potCd>0)return;const k=d.k==='mp'?'mp':'hp';if(P.ch.pots[k]<=0){msg(P,k==='hp'?'체력 물약이 없습니다':'마나 물약이 없습니다','#ff6a5a');return;}
    if(k==='hp'){if(P.hp>=P.S.maxHp)return;P.hp=Math.min(P.S.maxHp,P.hp+P.S.maxHp*0.45);}else{if(P.mp>=P.S.maxMp)return;P.mp=Math.min(P.S.maxMp,P.mp+P.S.maxMp*0.5);}
    P.ch.pots[k]--;P.potCd=0.4;markDirty(P);if(P.inst)fx(P.inst,{k:'potion',id:P.id,c:k});},
  pick(P,d){const inst=P.inst;if(!inst)return;const dr=inst.drops.find(x=>x.id===d.id);if(!dr||dr.kind!=='item'||(dr.owner!=null&&dr.owner!==P.id))return;if(Math.hypot(dr.x-P.x,dr.y-P.y)>28)return;
    const it=dr.it;if(!P.ch.eq[it.slot]&&SH.canEquip(it,P.ch.cls)){P.ch.eq[it.slot]=it;recalc(P);msg(P,`${it.name} 장착`,null);bcastRoster(inst);}else if(!addBag(P,it)){msg(P,'가방이 가득 찼습니다','#ff6a5a');return;}else msg(P,`${it.name} 획득`,null);
    if(it.rar===3){stInc(P,'leg');const ln=SH.codexList().find(c=>c.k==='l:'+it.name);if(ln)addCdx(P,ln.k);}
    markDirty(P);remDrop(inst,dr);send(P,{t:'fxp',k:'pick',r:it.rar});},
  drop(P,d){const inst=P.inst;if(!inst)return;const i=d.bi|0,it=P.ch.bag[i];if(!it)return;P.ch.bag[i]=null;saveNow(P);addDrop(inst,{kind:'item',owner:null,it,by:P.ch.name},P.x,P.y);msg(P,`${it.name}을(를) 바닥에 내려놓았습니다`,'#9e937a');},
  eq(P,d){const i=d.bi|0,it=P.ch.bag[i];if(!it)return;if(!SH.canEquip(it,P.ch.cls)){msg(P,`${CLASSES[P.ch.cls].n}은(는) ${SH.FAMN[it.fam]}을(를) 쓸 수 없습니다`,'#ff6a5a');return;}
    const old=P.ch.eq[it.slot];P.ch.eq[it.slot]=it;P.ch.bag[i]=old||null;recalc(P);if(P.inst)bcastRoster(P.inst);},
  uneq(P,d){const s=d.s;if(!['weapon','armor','ring'].includes(s))return;const it=P.ch.eq[s];if(!it)return;if(!addBag(P,it)){msg(P,'가방이 가득 찼습니다','#ff6a5a');return;}P.ch.eq[s]=null;recalc(P);if(P.inst)bcastRoster(P.inst);},
  stat(P,d){if(!['str','dex','vit','ene'].includes(d.k)||P.ch.pts<=0)return;P.ch[d.k]++;P.ch.pts--;recalc(P);},
  buy(P,d){if(P.inst!==hub||!near(P,hub.map.merchant,48))return;const k=d.k==='mp'?'mp':'hp';const price=SH.potPrice(P.ch.lvl);if(P.ch.pots[k]>=9){msg(P,'더 들 수 없습니다','#ff6a5a');return;}if(P.ch.gold<price){msg(P,'골드가 부족합니다','#ff6a5a');return;}P.ch.gold-=price;P.ch.pots[k]++;markDirty(P);send(P,{t:'fxp',k:'gold'});},
  skbuy(P,d){if(P.inst!==hub||!near(P,hub.map.merchant,48)){msg(P,'외형은 상인 근처에서 살 수 있어요','#ff6a5a');return;}const k=String(d.id||''),S0=SH.SKINS[k];if(!S0)return;P.ch.skins=P.ch.skins||[];if(P.ch.skins.includes(k))return;if(P.ch.gold<SH.SKIN_PRICE){msg(P,`골드가 부족해요 (${SH.SKIN_PRICE.toLocaleString()} 골드)`,'#ff6a5a');return;}
    P.ch.gold-=SH.SKIN_PRICE;P.ch.skins.push(k);P.ch.skinOn=P.ch.skinOn||{};if(S0.fam===CLASSES[P.ch.cls].fam)P.ch.skinOn[S0.fam]=k;markDirty(P);bcastRoster(hub);msg(P,`외형 「${S0.n}」 구입 · -${SH.SKIN_PRICE.toLocaleString()} 골드`,'#ffd35a');send(P,{t:'fxp',k:'gold'});},
  csbuy(P,d){if(P.inst!==hub||!near(P,hub.map.merchant,48)){msg(P,'의상은 상인 근처에서 살 수 있어요','#ff6a5a');return;}const k=String(d.id||''),C0=SH.COSTUMES[k];if(!C0)return;P.ch.cst=P.ch.cst||[];if(P.ch.cst.includes(k))return;if(P.ch.gold<SH.COS_PRICE){msg(P,`골드가 부족해요 (${SH.COS_PRICE.toLocaleString()} 골드)`,'#ff6a5a');return;}
    P.ch.gold-=SH.COS_PRICE;P.ch.cst.push(k);P.ch.cstOn=k;markDirty(P);bcastRoster(hub);msg(P,`의상 「${C0.n}」 구입 · -${SH.COS_PRICE.toLocaleString()} 골드`,'#ffd35a');send(P,{t:'fxp',k:'gold'});},
  cson(P,d){const k=d.id==null?null:String(d.id);if(k!=null&&(!SH.COSTUMES[k]||!(P.ch.cst||[]).includes(k)))return;P.ch.cstOn=k;markDirty(P);if(P.inst)bcastRoster(P.inst);if(P.inst!==hub)bcastRoster(hub);},
  mtbuy(P,d){if(P.inst!==hub||!near(P,hub.map.merchant,48)){msg(P,'탈것은 상인 근처에서 살 수 있어요','#ff6a5a');return;}const k=String(d.id||''),M=SH.MOUNTS[k];if(!M)return;P.ch.mts=P.ch.mts||[];if(P.ch.mts.includes(k))return;if(P.ch.gold<SH.MOUNT_PRICE){msg(P,`골드가 부족해요 (${SH.MOUNT_PRICE.toLocaleString()} 골드)`,'#ff6a5a');return;}
    P.ch.gold-=SH.MOUNT_PRICE;P.ch.mts.push(k);P.ch.mtOn=k;markDirty(P);bcastRoster(hub);msg(P,`탈것 「${M.n}」 구입 · -${SH.MOUNT_PRICE.toLocaleString()} 골드`,'#ffd35a');send(P,{t:'fxp',k:'gold'});},
  mton(P,d){const k=d.id==null?null:String(d.id);if(k!=null&&(!SH.MOUNTS[k]||!(P.ch.mts||[]).includes(k)))return;P.ch.mtOn=k;markDirty(P);if(P.inst)bcastRoster(P.inst);},
  fpbuy(P,d){if(P.inst!==hub||!near(P,hub.map.merchant,48)){msg(P,'발자국은 상인 근처에서 살 수 있어요','#ff6a5a');return;}const k=String(d.id||''),F=SH.FOOTS[k];if(!F)return;P.ch.fps=P.ch.fps||[];if(P.ch.fps.includes(k))return;if(P.ch.gold<SH.FOOT_PRICE){msg(P,`골드가 부족해요 (${SH.FOOT_PRICE.toLocaleString()} 골드)`,'#ff6a5a');return;}
    P.ch.gold-=SH.FOOT_PRICE;P.ch.fps.push(k);P.ch.fpOn=k;markDirty(P);bcastRoster(hub);msg(P,`발자국 「${F.n}」 구입 · -${SH.FOOT_PRICE.toLocaleString()} 골드`,'#ffd35a');send(P,{t:'fxp',k:'gold'});},
  fpon(P,d){const k=d.id==null?null:String(d.id);if(k!=null&&(!SH.FOOTS[k]||!(P.ch.fps||[]).includes(k)))return;P.ch.fpOn=k;markDirty(P);if(P.inst)bcastRoster(P.inst);},
  lgon(P,d){const k=d.id==null?null:String(d.id);if(k!=null&&!SH.legendOk(P.ch,k)){msg(P,'아직 얻지 못한 전설 외형이에요','#ff6a5a');return;}P.ch.lgOn=k;markDirty(P);if(P.inst)bcastRoster(P.inst);if(P.inst!==hub)bcastRoster(hub);},
  skon(P,d){const f=String(d.f||'');if(!SH.FAMN[f])return;P.ch.skinOn=P.ch.skinOn||{};const k=d.id==null?null:String(d.id);if(k==null){delete P.ch.skinOn[f];}else{if(!SH.SKINS[k]||SH.SKINS[k].fam!==f||!(P.ch.skins||[]).includes(k))return;P.ch.skinOn[f]=k;}markDirty(P);if(P.inst)bcastRoster(P.inst);},
  sell(P,d){if(P.inst!==hub||!near(P,hub.map.merchant,48))return;const i=d.bi|0,it=P.ch.bag[i];if(!it)return;P.ch.bag[i]=null;P.ch.gold+=Math.max(0,it.value|0);markDirty(P);msg(P,`${it.name} 판매 · +${it.value} 골드`,'#ffd35a');send(P,{t:'fxp',k:'gold'});},
  chat(P,d){const m=String(d.m||'').replace(/\s+/g,' ').trim().slice(0,80);if(!m||!P.inst)return;bcast(P.inst,{t:'chat',id:P.id,name:P.ch.name,m});},
  inv(P,d){const T=players.get(d.id);if(!T||T===P)return;if(P.inst!==hub||T.inst!==hub){msg(P,'마을에서만 초대할 수 있습니다','#ff6a5a');return;}
    if(P.party.members.size>=PARTY_MAX){msg(P,`파티가 가득 찼습니다 (최대 ${PARTY_MAX}명)`,'#ff6a5a');return;}if(T.party.members.size>1){msg(P,`${T.ch.name}님은 이미 파티 중입니다`,'#ff6a5a');return;}
    if(P.party.inst){msg(P,'파티가 던전에 있을 때는 초대할 수 없습니다','#ff6a5a');return;}
    T.invite={from:P.id,pt:P.party.id,t:Date.now()};send(T,{t:'invite',from:P.id,name:P.ch.name});msg(P,`${T.ch.name}님에게 파티 초대를 보냈습니다`,'#9e937a');},
  ians(P,d){const iv=P.invite;P.invite=null;if(!iv||iv.from!==d.from)return;const F=players.get(iv.from);if(!F){msg(P,'초대가 만료되었습니다','#ff6a5a');return;}
    if(!d.ok){msg(F,`${P.ch.name}님이 파티 초대를 거절했습니다`,'#9e937a');return;}
    const pt=parties.get(iv.pt);if(!pt||!pt.members.has(F.id)||pt.members.size>=PARTY_MAX||pt.inst||P.inst!==hub||P.party.members.size>1){msg(P,'파티에 들어갈 수 없습니다','#ff6a5a');return;}
    leaveParty(P);pt.members.add(P.id);P.party=pt;sendParty(pt);bcastRoster(hub);for(const q of partyList(pt))msg(q,`${P.ch.name}님이 파티에 들어왔습니다`,'#7fd05a');},
  leave(P){if(P.inst!==hub){msg(P,'마을에서만 파티를 나갈 수 있습니다','#ff6a5a');return;}if(P.party.members.size<=1)return;leaveParty(P);newParty(P);sendParty(P.party);bcastRoster(hub);msg(P,'파티에서 나왔습니다','#9e937a');},
  kick(P,d){const pt=P.party;if(pt.leader!==P.id||P.inst!==hub||pt.inst)return;const T=players.get(d.id);if(!T||T.party!==pt||T===P)return;leaveParty(T);newParty(T);sendParty(T.party);msg(T,'파티에서 추방되었습니다','#ff6a5a');bcastRoster(hub);},
  enter(P,d){if(P.inst!==hub)return;if(P.duelLock&&Date.now()<P.duelLock)return;if(!near(P,hub.map.portal,56)){msg(P,'던전 입구에 더 가까이 가세요','#9e937a');return;}const pt=P.party;
    if(pt.inst&&pt.inst.raid){msg(P,'파티가 레이드 중이라 합류할 수 없어요','#ff6a5a');return;}
    if(pt.inst&&pt.inst.field){H.fenter(P);return;}/* 파티의 황야 합류는 황야 입장 조건(흑월 클리어·레벨 50)을 거치게 */
    if(pt.inst){const inst=pt.inst;leaveInst(P);P.inst=inst;inst.players.add(P.id);resetCombat(P);placeStart(inst,P,inst.players.size);sendMap(P);bcastRoster(inst);bcastRoster(hub);sendParty(pt);msg(P,'파티의 던전에 합류했습니다','#7fd05a');return;}
    if(pt.leader!==P.id){msg(P,'파티장만 던전을 열 수 있습니다','#ff6a5a');return;}
    const floor=d.floor|0;if(!P.ch.cps.includes(floor)){msg(P,'열리지 않은 체크포인트입니다','#ff6a5a');return;}
    const members=partyList(pt).filter(q=>q.inst===hub);const inst=createDungeon(pt);
    for(const q of members){leaveInst(q);q.inst=inst;inst.players.add(q.id);resetCombat(q);q.hp=q.S.maxHp;q.mp=q.S.maxMp;}
    loadFloor(inst,floor);bcastRoster(hub);sendParty(pt);},
  pause(P){const inst=P.inst;if(!inst||inst.type!=='dungeon')return;if(inst.paused){inst.paused=null;bcast(inst,{t:'paused',by:null});return;}if(inst.arena||inst.raid||inst.players.size>1){send(P,{t:'paused',self:1});return;}inst.paused=P.ch.name;bcast(inst,{t:'paused',by:inst.paused});},
  unlearn(P,d){const sid=d.sid;const sk=SKILLS[sid];if(!sk||sk.cls!==P.ch.cls||sk.ult)return;if(P.inst!==hub){msg(P,'스킬 포인트 빼기는 마을에서만 할 수 있어요','#9e937a');return;}
    const r=P.ch.sk[sid]|0;const min=(SH.defaultSkills(P.ch.cls).sk[sid])|0;if(r<=min){msg(P,min?'기본 스킬은 1 아래로 뺄 수 없어요':'뺄 포인트가 없어요','#9e937a');return;}
    const cost=3*P.ch.lvl;if(P.ch.gold<cost){msg(P,`골드가 부족합니다 (${cost}골드)`,'#ff6a5a');return;}P.ch.gold-=cost;
    if(r-1<=0){delete P.ch.sk[sid];P.ch.bar=P.ch.bar.map(x=>x===sid?null:x);if(P.ch.rmb===sid)P.ch.rmb=null;}else P.ch.sk[sid]=r-1;
    P.ch.spts=(P.ch.spts|0)+1;recalc(P);markDirty(P);msg(P,`${sk.n} ${r} → ${r-1} · 스킬 포인트 1 돌려받음 (-${cost}골드)`,'#ffd35a');},
  rretry(P,d){const inst=P.inst,r=inst&&inst.raid;if(!r||!r.fail||!r.retry||r.retrying)return;const pt=inst.party;if(!pt)return;r.retrying=1;const members=instPlayers(inst).filter(q=>q.ch);if(!members.length)return;
    createRaid(pt,r.id,r.mode,members);const ni=pt.inst;if(!ni||!ni.raid)return;if(ni.raid.pz)ni.raid.pz.st='done';openRaidDoor(ni);
    const W0=ni.map.w,dr=ni.map.door||[];if(dr.length){const i0=dr[(dr.length/2)|0];const dx=(i0%W0)*TS+8,dy=Math.floor(i0/W0)*TS+8;const sp=ni.map.startPt;const ux=Math.sign(sp.x-dx),uy=Math.sign(sp.y-dy);let k=0;for(const q of members){q.x=dx+ux*12+((k%3)-1)*12;q.y=dy+uy*12+(Math.floor(k/3))*10*(uy||1);if(SH.blocked(ni.map,q.x,q.y,4)){q.x=dx;q.y=dy;}send(q,{t:'tp',x:q.x,y:q.y});k++;}}
    fx(ni,{k:'msg',m:`${P.ch.name}님이 2관문 재도전을 시작했어요 · 보스방이 열려 있어요`,c:'#ffd35a'});},
  awktrial(P,d){if(P.inst!==hub||!near(P,hub.map.merc,60)){msg(P,'용병 대장 한스 곁에서 도전할 수 있어요','#9e937a');return;}if(!P.ch.adv||!SH.AWK[P.ch.adv])return;if(P.ch.awk)return;if(P.ch.lvl<SH.AWK_LVL){msg(P,`${SH.AWK_LVL}레벨부터 각성의 시련에 도전할 수 있어요`,'#ff6a5a');return;}startTrial(P,P.ch.adv,false,true);},
  awn(P,d){if(!SH.awkOf(P.ch))return;P.ch.awn=P.ch.awn||{};if(d.reset){if(P.inst!==hub){msg(P,'각성 포인트는 마을에서 다시 찍을 수 있어요','#9e937a');return;}P.ch.awn={};recalc(P);markDirty(P);return;}const k=String(d.k||'');if(!SH.AWN[k])return;if(SH.awnSpent(P.ch)>=(P.ch.awl|0)){msg(P,'각성 포인트가 없어요 · 각성 레벨을 올리면 얻어요','#ff6a5a');return;}if((P.ch.awn[k]|0)>=SH.AWN_MAX)return;P.ch.awn[k]=(P.ch.awn[k]|0)+1;recalc(P);markDirty(P);},
  trialre(P,d){if(P.inst!==hub||!near(P,hub.map.merc,60)){msg(P,'용병 대장 한스 곁에서 도전할 수 있어요','#9e937a');return;}if(!P.ch.adv||!SH.ADV[P.ch.adv])return;startTrial(P,P.ch.adv,true);},
  advsel(P,d){if(P.inst!==hub||!near(P,hub.map.merc,60)){msg(P,'용병 대장 한스 곁에서 전직할 수 있어요','#9e937a');return;}const A=SH.ADV[d.id];if(!A||A.cls!==P.ch.cls)return;if(P.ch.lvl<SH.ADV_LVL){msg(P,`${SH.ADV_LVL}레벨부터 전직할 수 있어요`,'#ff6a5a');return;}if(P.ch.adv===d.id)return;
    if(!P.ch.adv){startTrial(P,d.id);return;}
    if(P.ch.adv){const cost=SH.advChangeCost(P.ch.lvl);if(P.ch.gold<cost){msg(P,`갈래를 바꾸려면 ${cost.toLocaleString()}골드가 필요해요`,'#ff6a5a');return;}P.ch.gold-=cost;const old=SH.ADV[P.ch.adv];let back=0;for(const s of old.sk){back+=P.ch.sk[s]|0;delete P.ch.sk[s];}P.ch.spts=(P.ch.spts|0)+back;P.ch.bar=P.ch.bar.map(x=>old.sk.includes(x)?null:x);if(old.sk.includes(P.ch.rmb))P.ch.rmb=null;if(P.ch.ult===old.ult)P.ch.ult=null;if(P.ch.awk&&SH.AWK[P.ch.adv]){const OW=SH.AWK[P.ch.adv];for(const s2 of OW.ids){P.ch.spts=(P.ch.spts|0)+(P.ch.sk[s2]|0);delete P.ch.sk[s2];}P.ch.bar=P.ch.bar.map(x=>OW.ids.includes(x)?null:x);if(OW.ids.includes(P.ch.rmb))P.ch.rmb=null;if(P.ch.ult===OW.ult)P.ch.ult=SH.AWK[d.id]?SH.AWK[d.id].ult:null;}}
    applyAdv(P,d.id);},
  learn(P,d){const sid=d.sid;const sk=SKILLS[sid];if(!sk||sk.cls!==P.ch.cls||sk.ult)return;if(sk.adv&&sk.adv!==P.ch.adv){msg(P,`${SH.ADV[sk.adv].n}으로 전직해야 배울 수 있어요`,'#ff6a5a');return;}if(sk.awk&&!SH.awkOf(P.ch)){msg(P,`각성의 시련을 넘어 ${SH.AWK[sk.adv].n}(으)로 각성해야 배울 수 있어요`,'#ff6a5a');return;}if(P.ch.lvl<sk.lvl){msg(P,`레벨 ${sk.lvl}에 해금됩니다`,'#ff6a5a');return;}if((P.ch.spts|0)<=0){msg(P,'스킬 포인트가 없습니다','#ff6a5a');return;}
    const r=P.ch.sk[sid]|0;if(r>=SH.MAX_RANK)return;P.ch.sk[sid]=r+1;P.ch.spts--;if(r===0&&!sk.pas&&!P.ch.bar.includes(sid)){const e=P.ch.bar.indexOf(null);if(e>=0)P.ch.bar[e]=sid;}recalc(P);send(P,{t:'fxp',k:'learn'});},
  rmb(P,d){const sid=d.sid||null;if(sid){const sk=SKILLS[sid];if(!sk||sk.cls!==P.ch.cls||sk.pas||!(P.ch.sk[sid]>0))return;}P.ch.rmb=sid;markDirty(P);},
  bar(P,d){const i=d.i|0;if(i<0||i>=SH.BAR_SIZE)return;const sid=d.sid||null;if(sid&&sid!=='ctr'){const sk=SKILLS[sid];if(!sk||sk.cls!==P.ch.cls||sk.pas||!(P.ch.sk[sid]>0))return;}if(sid){const j=P.ch.bar.indexOf(sid);if(j>=0)P.ch.bar[j]=P.ch.bar[i];}P.ch.bar[i]=sid;markDirty(P);},
  shop(P){if(P.inst!==hub||!near(P,hub.map.merchant,48))return;const lvl=P.ch.lvl;if(!P.stock||P.stockLvl!==lvl||Date.now()-P.stockT>300000){P.stock=[];const fam=CLASSES[P.ch.cls].fam;for(let i=0;i<6;i++){const it=SH.genItem(lvl+ri(0,2),fam,i<2?1:0,i===5?15:5,R,2);it.price=it.value*4;P.stock.push(it);}P.stockLvl=lvl;P.stockT=Date.now();}
    send(P,{t:'shop',items:P.stock,refresh:Math.max(0,Math.round((300000-(Date.now()-P.stockT))/1000)),respec:30*lvl});},
  shopbuy(P,d){if(P.inst!==hub||!near(P,hub.map.merchant,48)||!P.stock)return;const i=P.stock.findIndex(x=>x.id===d.id);if(i<0)return;const it=P.stock[i];if(P.ch.gold<it.price){msg(P,'골드가 부족합니다','#ff6a5a');return;}
    const copy=Object.assign({},it);delete copy.price;if(!addBag(P,copy)){msg(P,'가방이 가득 찼습니다','#ff6a5a');return;}P.ch.gold-=it.price;P.stock.splice(i,1);markDirty(P);msg(P,`${it.name} 구입`,'#ffd35a');send(P,{t:'fxp',k:'gold'});H.shop(P);},
  respec(P){if(P.inst!==hub||!near(P,hub.map.merchant,48))return;const cost=30*P.ch.lvl;if(P.ch.gold<cost){msg(P,'골드가 부족합니다','#ff6a5a');return;}const def=SH.defaultSkills(P.ch.cls);P.ch.gold-=cost;P.ch.sk=def.sk;P.ch.bar=def.bar.slice();P.ch.rmb=null;P.ch.spts=SH.spTotal(P.ch);recalc(P);msg(P,'스킬을 초기화했습니다','#ffd35a');H.shop(P);},
  srespec(P){if(P.inst!==hub||!near(P,hub.map.merchant,48))return;const cost=30*P.ch.lvl;if(P.ch.gold<cost){msg(P,'골드가 부족합니다','#ff6a5a');return;}const C0=CLASSES[P.ch.cls];let back=P.ch.pts|0;for(const k of['str','dex','vit','ene']){back+=Math.max(0,(P.ch[k]|0)-C0.base[k]);P.ch[k]=C0.base[k];}P.ch.gold-=cost;P.ch.pts=back;recalc(P);markDirty(P);msg(P,`능력치를 초기화했습니다 · ${back}포인트 돌려받음`,'#ffd35a');H.shop(P);},
  dbg(P,d){if(!process.env.BC_DEBUG)return;const inst=P.inst;if(d.tiles&&inst){send(P,{t:'tiles',w:inst.map.w,tiles:Array.from(inst.map.tiles),px:P.x,py:P.y,bad:P.bad|0,lock:P.gmLock>inst.time,scd:P.scd,time:inst.time});return;}if(d.clash&&inst&&inst.raid&&inst.raid.id==='moon'&&!inst.raid.clash){const b=bossList(inst)[0];if(b)RAIDX.moon.clash(inst,b,d.clash|0);}if(d.fkill&&inst&&inst.field){for(const m of inst.monsters)if(!m.dead&&Math.hypot(m.x-P.x,m.y-P.y)<320)killMonster(inst,m,P);}if(d.fwin&&inst&&inst.field){for(const b of inst.field.bases)if(b.st!=='ours'&&(d.fwin==='all'||Math.hypot(b.x-P.x,b.y-P.y)<200))fieldBaseWin(inst,b);}if(d.relicall){P.relicForce=1;P.ch.rbagLv=3;P.ch.rbag=SH.relicResize(P.ch.rbag,3);P.ch.rinv=[];for(const id of Object.keys(SH.RELICS).slice(0,8))P.ch.rinv.push({t:'r',id,lv:2});for(const id of Object.keys(SH.TABLETS).slice(0,8))P.ch.rinv.push({t:'s',id,r:0});recalc(P);send(P,{t:'ch',ch:P.ch,S:P.S});}if(d.eset){const fam=CLASSES[P.ch.cls].fam;for(const sl of['weapon','armor','ring'])P.ch.eq[sl]=SH.genSet('ember',60,fam,R,sl);recalc(P);send(P,{t:'ch',ch:P.ch,S:P.S});}if(d.skall){P.ch.skins=Object.keys(SH.SKINS);P.ch.cst=Object.keys(SH.COSTUMES);P.ch.mts=Object.keys(SH.MOUNTS);P.ch.fps=Object.keys(SH.FOOTS);P.ch.cprTop1=1;P.ch.fishLeg=1;P.ch.rclr=Object.assign({},P.ch.rclr,{bell:1,mirror:1,clock:1,moon:1});P.ch.rclrH=Object.assign({},P.ch.rclrH,{bell:1,mirror:1,clock:1,moon:1});markDirty(P);send(P,{t:'msg',m:'외형 전부 해금 (디버그)',c:'#fff'});}if(d.gm&&inst&&inst.raid){if(inst.raid.gm)gmEnd(inst,true);inst.raid.stage='boss';inst.raid.cardT=0;const ok=gmStart(inst,d.gm);send(P,{t:'msg',m:'gm '+d.gm+' '+ok,c:'#fff'});}if(d.raiddoor&&inst&&inst.raid){if(inst.raid.pz)inst.raid.pz.st='done';openRaidDoor(inst);}if(d.tp){P.x=d.tp[0];P.y=d.tp[1];send(P,{t:'tp',x:P.x,y:P.y});}if(d.bosshp&&inst&&inst.monsters){for(const m of inst.monsters)if(m.boss)m.hp=Math.min(m.hp,d.bosshp);}if(d.god){P.S.maxHp=99999;P.hp=99999;}if(d.ultcd)P.ucdEnd=0;if(d.lvl){P.ch.lvl=clamp(d.lvl|0,1,SH.LVL_CAP);P.ch.spts=(P.ch.spts|0)+d.lvl;recalc(P);}if(d.gold){P.ch.gold+=d.gold;markDirty(P);}if(d.xp){gainXP(P,d.xp|0);markDirty(P);}if(d.rfail&&inst&&inst.raid)raidFail(inst,'데스 카운트를 모두 썼습니다');if(d.floor&&inst&&inst.type==='dungeon'&&!inst.field&&!inst.raid&&!inst.arena)loadFloor(inst,d.floor);if(d.bossfrac&&inst&&inst.monsters){for(const m of inst.monsters)if(m.boss)m.hp=Math.round(m.maxHp*d.bossfrac);}if(d.fullhp){P.hp=P.S.maxHp;}if(d.killboss&&inst&&inst.monsters){const m=inst.monsters.find(m=>m.boss&&!m.dead);if(m){m.hp=0;killMonster(inst,m,P);}}if(d.down){P.hp=0;P.downed=true;}if(d.probe)send(P,{t:'probe',v:{scd:P.scd,b:P.buffs,sh:P.shield,hp:P.hp,max:P.S.maxHp,mp:Math.round(P.mp),mmp:P.S.maxMp}});if(d.sethp){P.hp=d.sethp;}if(d.kills){P.ch.kills=d.kills;markDirty(P);}if(d.pets){P.ch.pets=SH.PETS.map(p=>p.id);markDirty(P);}if(d.mats){P.ch.mats.iron+=500;P.ch.mats.dust+=200;P.ch.mats.ess+=20;for(const g of['r1','s2','t3','e1','a1','d4'])P.ch.gems[g]=(P.ch.gems[g]|0)+4;markDirty(P);}if(d.ev&&inst&&inst.type==='dungeon'){const e=inst.ev;if(d.ev==='altar')e.altar={x:P.x+40,y:P.y,st:0,wave:0,t:0,ids:[]};if(d.ev==='trader')e.trader={x:P.x+30,y:P.y,stock:{}};if(d.ev==='goblin'){spawnMonster(inst,'goblin',P.x+60,P.y,false);}bcastEv(inst);}
    if(d.killboss&&inst&&inst.monsters){for(const m of inst.monsters.slice())if(!m.dead&&m.boss){m.hp=0;killMonster(inst,m,P);}}
    if(d.killall&&inst&&inst.type==='dungeon'){for(const m of inst.monsters.slice())if(!m.dead&&!m.boss)killMonster(inst,m,P);}
    if(d.elite&&inst&&inst.type==='dungeon'){const m=spawnMonster(inst,'zombie',P.x+50,P.y,true);m.ea=d.elite;m.alert=true;}
    if(d.item!=null){addBag(P,SH.genItem(P.ch.lvl,CLASSES[P.ch.cls].fam,d.item,0,R,3,d.slot||null));markDirty(P);}},
  descend(P){const inst=P.inst;if(!inst||inst.type!=='dungeon'||!inst.stairsOpen||inst.trans||P.downed)return;const tx=Math.floor(P.x/TS),ty=Math.floor(P.y/TS);let near2=false;for(let j=-1;j<=1&&!near2;j++)for(let i=-1;i<=1;i++)if(inst.map.tiles[(ty+j)*inst.map.w+tx+i]===2){near2=true;break;}if(!near2)return;
    inst.trans={t:3,by:P.ch.name};bcast(inst,{t:'trans',t0:3,by:P.ch.name});},
  bs(P,d){if(P.inst!==hub||!near(P,hub.map.forge,60)){msg(P,'대장간 가까이에서만 할 수 있습니다','#9e937a');return;}const f=BS[d.op];if(f)f(P,d);},
  stash(P){if(P.inst!==hub||!near(P,hub.map.vault,60))return;send(P,{t:'stash',s:P.stash});},
  stput(P,d){if(P.inst!==hub||!near(P,hub.map.vault,60))return;const i=d.bi|0,it=P.ch.bag[i];if(!it)return;const k=P.stash.indexOf(null);if(k<0){msg(P,'창고가 가득 찼습니다','#ff6a5a');return;}P.stash[k]=it;P.ch.bag[i]=null;saveNow(P);send(P,{t:'stash',s:P.stash,save:1});},
  sttake(P,d){if(P.inst!==hub||!near(P,hub.map.vault,60))return;const k=d.si|0,it=P.stash[k];if(!it)return;if(!addBag(P,it)){msg(P,'가방이 가득 찼습니다','#ff6a5a');return;}P.stash[k]=null;saveNow(P);send(P,{t:'stash',s:P.stash,save:1});},
  gamble(P,d){if(P.inst!==hub||!near(P,hub.map.tent,60))return;const slot=['weapon','armor','ring'].includes(d.s)?d.s:'weapon';const cost=SH.gambleCost(slot,P.ch.lvl);if(P.ch.gold<cost){msg(P,'골드가 부족합니다','#ff6a5a');return;}if(P.ch.bag.indexOf(null)<0){msg(P,'가방이 가득 찼습니다','#ff6a5a');return;}
    stInc(P,'gam');P.ch.gold-=cost;const jack=R()<0.001;const it=jack?SH.genItem(P.ch.lvl+ri(0,3),CLASSES[P.ch.cls].fam,3,0,R,3,slot):SH.genItem(P.ch.lvl+ri(0,3),CLASSES[P.ch.cls].fam,0,20,R,2,slot);if(jack){bcast(hub,{t:'msg',m:`${P.ch.name}님이 도박에서 전설 '${it.name}'을(를) 뽑았다!!`,c:'#ff8a1f'});bcast(hub,{t:'fxp',k:'pick',r:3});}addBag(P,it);markDirty(P);send(P,{t:'gam',it});send(P,{t:'fxp',k:'pick',r:it.rar});},
  bty(P){if(P.inst!==hub||!near(P,hub.map.board,60))return;const b=ensureBty(P);send(P,{t:'bty',b,names:Object.fromEntries(Object.entries(BTY_T).map(([k,v])=>[k,v.n])),reset:msUntilReset()});},
  btyc(P,d){if(P.inst!==hub||!near(P,hub.map.board,60))return;const b=ensureBty(P);const q=b.q[d.i|0];if(!q||q.cl||q.n<q.need)return;q.cl=true;stInc(P,'bty');const got=giveR(P,q.r);msg(P,`의뢰 보상: ${got}`,'#ffd35a');send(P,{t:'fxp',k:'gold'});
    if(!b.all&&b.q.every(x=>x.cl)){b.all=true;const g2=SH.GEM_T[ri(0,5)]+Math.min(5,SH.gemTierFor(P.ch.best|0)+1);const got2=giveR(P,{ess:1,gem:g2,dust:3});msg(P,`오늘의 의뢰 모두 완료! 추가 보상: ${got2}`,'#ff9a5a');}H.bty(P);},
  evx(P,d){const inst=P.inst;if(!inst||inst.type!=='dungeon'||!inst.ev||P.downed||inst.paused)return;const e=inst.ev;
    if(d.k==='wall'&&e.secret&&!e.secret.open){const i=inst.map.secret.door,tx=i%inst.map.w,ty=(i/inst.map.w)|0;if(Math.hypot(P.x-(tx*TS+8),P.y-(ty*TS+8))>30)return;tileSet(inst,i,1,true);e.secret.open=true;for(const Q of instPlayers(inst))stInc(Q,'sec');bcast(inst,{t:'tile',i,v:1});fx(inst,{k:'boom',x:tx*TS+8,y:ty*TS+8,r:18});fx(inst,{k:'shake',v:3});fx(inst,{k:'msg',m:`${P.ch.name}님이 비밀 통로를 찾았다!`,c:'#ffd35a'});bcastEv(inst);return;}
    if(d.k==='chest'&&e.secret&&e.secret.open){const c=e.secret.chests[d.i|0];if(!c||c.open||Math.hypot(P.x-c.x,P.y-c.y)>26)return;c.open=true;fx(inst,{k:'sfx',n:'legend'});for(const Q of instPlayers(inst))lootFor(inst,Q,c.x,c.y+6,{items:1,minR:R()<0.35?2:1,gold:3,gems:R()<0.5?1:0});bcastEv(inst);return;}
    if(d.k==='lore'&&e.lore){if(Math.hypot(P.x-e.lore.x,P.y-e.lore.y)>30)return;const i=e.lore.i;const L=P.ch.lore||(P.ch.lore=[]);const first=!L.includes(i);if(first){L.push(i);L.sort((a,b)=>a-b);markDirty(P);}send(P,{t:'lore',i,first});return;}
    if(d.k==='altar'&&e.altar&&e.altar.st===0){if(Math.hypot(P.x-e.altar.x,P.y-e.altar.y)>34)return;e.altar.st=1;e.altar.t=1.2;fx(inst,{k:'msg',m:`${P.ch.name}님이 저주받은 제단을 건드렸다! 몰려오는 괴물을 모두 물리쳐라`,c:'#ff6a5a'});fx(inst,{k:'sfx',n:'boss'});bcastEv(inst);}},
  trader(P){const inst=P.inst;if(!inst||!inst.ev||!inst.ev.trader||Math.hypot(P.x-inst.ev.trader.x,P.y-inst.ev.trader.y)>40)return;send(P,{t:'trd',items:traderStock(inst,P),pot:Math.round(SH.potPrice(P.ch.lvl)*0.8)});},
  tbuy(P,d){const inst=P.inst;if(!inst||!inst.ev||!inst.ev.trader||Math.hypot(P.x-inst.ev.trader.x,P.y-inst.ev.trader.y)>40)return;
    if(d.k){const k=d.k==='mp'?'mp':'hp',pr=Math.round(SH.potPrice(P.ch.lvl)*0.8);if(P.ch.pots[k]>=9){msg(P,'더 들 수 없습니다','#ff6a5a');return;}if(P.ch.gold<pr){msg(P,'골드가 부족합니다','#ff6a5a');return;}P.ch.gold-=pr;P.ch.pots[k]++;markDirty(P);send(P,{t:'fxp',k:'gold'});return;}
    const st=traderStock(inst,P),i=st.findIndex(x=>x.id===d.id);if(i<0)return;const it=st[i];if(P.ch.gold<it.price){msg(P,'골드가 부족합니다','#ff6a5a');return;}const cp=Object.assign({},it);delete cp.price;if(!addBag(P,cp)){msg(P,'가방이 가득 찼습니다','#ff6a5a');return;}P.ch.gold-=it.price;st.splice(i,1);markDirty(P);msg(P,`${it.name} 구입`,'#ffd35a');send(P,{t:'fxp',k:'gold'});H.trader(P);},
  lat(P,d){send(P,{t:'lat',c:+d.c||0});},
  ping(P,d){const inst=P.inst;if(!inst)return;const now=Date.now();if(now-(P.pingT||0)<700)return;P.pingT=now;const x=+d.x,y=+d.y;if(!isFinite(x)||!isFinite(y))return;const k=clamp(d.k|0,0,2);
    const o={t:'ping',x:r1(x),y:r1(y),k,id:P.id,name:P.ch.name};const tg=P.party?partyList(P.party).filter(q=>q.inst===inst):[P];for(const q of tg)send(q,o);},
  fame(P){send(P,{t:'fame',list:FAME.slice(-30).reverse()});},
  ranks(P){send(P,{t:'ranks',cpr:RANKS.cpr,fish:RANKS.fish,me:P.ch&&P.ch.id});},
  cprsc(P,d){if(P.inst!==hub||!P.ch||!near(P,hub.map.clashpr,160))return;const s=d.s|0,p=clamp(d.p|0,0,5000),g=clamp(d.g|0,0,5000),best=clamp(d.best|0,0,10000);if(s<=0||s>(p*300+g*100)*2*2.25+10||best>p+g)return;
    const ch=P.ch;let pb=false,rank=-1;if(!ch.cprBest||s>ch.cprBest.s){ch.cprBest={s,best,p};pb=true;markDirty(P);rank=rankPut('cpr',{id:ch.id,n:ch.name,cls:ch.cls,s,best,p,ts:Date.now()});if(rank===0&&!ch.cprTop1){ch.cprTop1=1;msg(P,'전설 외형 「글리치」를 얻었어요! (외형 › 전설)','#ffd35a');}}send(P,{t:'cprres',s,pb,rank,top:ch.cprBest?ch.cprBest.s:s});},
  who(P){const L=[];for(const q of players.values()){if(!q.ch)continue;const i=q.inst;const where=!i?'-':i===hub?'마을':i.raid?'레이드':i.arena?'결투장':i.type==='dungeon'?`던전 지하 ${i.floor|0}층`:'마을';L.push({id:q.id,name:q.ch.name,cls:q.ch.cls,lvl:q.ch.lvl,where,hub:i===hub,pt:q.party?q.party.members.size:0,me:q===P});if(L.length>=100)break;}send(P,{t:'who',list:L});},
  fadd(P,d){if(typeof d.n!=='string')return;for(const q of players.values())if(q.ch&&q.ch.name===d.n&&q!==P){msg(q,`${P.ch.name}님이 당신을 친구로 추가했어요`,'#8fd0ff');break;}},
  an(P){const A=P.an||{by:{},n:0};send(P,{t:'an',by:A.by,n:A.n|0,dur:A.n?Math.max(1,(A.t1-A.t0)/1000):0});},
  anreset(P){P.an=null;H.an(P);},
  insp(P,d){let T=d.id!=null?players.get(d.id):null;if(!T&&typeof d.n==='string')for(const q of players.values())if(q.ch&&q.ch.name===d.n){T=q;break;}if(!T||!T.ch){msg(P,'접속 중인 플레이어가 아니에요','#9e937a');return;}const c=T.ch;send(P,{t:'insp',v:{id:T.id,name:c.name,cls:c.cls,adv:SH.advOf(c)?c.adv:null,awk:c.awk?1:0,lvl:c.lvl,title:c.title||null,eq:c.eq,S:T.S,cp:SH.power(c),str:c.str,dex:c.dex,vit:c.vit,ene:c.ene,best:c.best|0,kills:c.kills|0,rclr:c.rclr||{},ult:c.ult||null,bar:c.bar||[],sk:c.sk||{},pvp:c.pvp||null}});},
  treq(P,d){const T=players.get(d.id);if(!T||T===P||!T.ch)return;if(P.inst!==hub||T.inst!==hub){msg(P,'마을에서만 거래할 수 있습니다','#ff6a5a');return;}
    if(P.trade||T.trade){msg(P,T.trade?`${T.ch.name}님은 다른 사람과 거래 중입니다`:'이미 거래 중입니다','#ff6a5a');return;}
    T.treq={from:P.id,t:Date.now()};send(T,{t:'treq',from:P.id,name:P.ch.name});msg(P,`${T.ch.name}님에게 거래를 신청했습니다`,'#9e937a');},
  tans(P,d){const rq=P.treq;P.treq=null;if(!rq||rq.from!==d.from)return;const F=players.get(rq.from);if(!F||!F.ch){msg(P,'거래 신청이 만료되었습니다','#ff6a5a');return;}
    if(!d.ok){msg(F,`${P.ch.name}님이 거래를 거절했습니다`,'#9e937a');return;}if(Date.now()-rq.t>35000){msg(P,'거래 신청이 만료되었습니다','#ff6a5a');return;}
    if(P.inst!==hub||F.inst!==hub||P.trade||F.trade){msg(P,'지금은 거래할 수 없습니다','#ff6a5a');return;}
    P.trade={with:F.id,ids:[],gold:0,lock:false,ok:false};F.trade={with:P.id,ids:[],gold:0,lock:false,ok:false};tradeSync(P);},
  tset(P,d){if(!P.trade)return;const T=tradeOther(P);if(!T||!T.trade){cancelTrade(P);return;}const ids=Array.isArray(d.ids)?[...new Set(d.ids.map(String))].filter(id=>P.ch.bag.some(it=>it&&it.id===id)).slice(0,TRADE_MAX):P.trade.ids;
    const gold=d.gold==null?P.trade.gold:clamp(Math.floor(+d.gold||0),0,P.ch.gold);P.trade.ids=ids;P.trade.gold=gold;tradeUnlock(P);tradeSync(P);},
  tlock(P){if(!P.trade)return;const T=tradeOther(P);if(!T||!T.trade){cancelTrade(P);return;}P.trade.lock=true;P.trade.snap=JSON.stringify(P.trade.ids.map(id=>P.ch.bag.find(it=>it&&it.id===id)||null));tradeSync(P);},
  tok(P){if(!P.trade)return;const T=tradeOther(P);if(!T||!T.trade){cancelTrade(P);return;}if(!P.trade.lock||!T.trade.lock)return;P.trade.ok=true;if(T.trade.ok)doTrade(P,T);else tradeSync(P);},
  tcancel(P){if(P.trade)cancelTrade(P,`${P.ch.name}님이 거래를 취소했습니다`);},
  duel(P,d){const T=players.get(d.id);if(!T||T===P||!T.ch)return;if(P.inst!==hub||T.inst!==hub){msg(P,'마을에서만 결투를 신청할 수 있습니다','#ff6a5a');return;}
    const [A,B]=duelTeams(P,T);if(A.some(q=>B.includes(q))){msg(P,'같은 파티끼리는 결투할 수 없습니다','#ff6a5a');return;}
    T.duelInv={from:P.id,t:Date.now(),n:A.length};send(T,{t:'duelInv',from:P.id,name:P.ch.name,n:A.length});msg(P,`${T.ch.name}님에게 ${A.length}:${A.length} 결투를 신청했습니다`,'#9e937a');},
  duelAns(P,d){const iv=P.duelInv;P.duelInv=null;if(!iv||iv.from!==d.from||Date.now()-iv.t>30000)return;const F=players.get(iv.from);if(!F||!F.ch){msg(P,'결투 신청이 만료되었습니다','#ff6a5a');return;}
    if(!d.ok){msg(F,`${P.ch.name}님이 결투를 거절했습니다`,'#9e937a');return;}if(F.inst!==hub||P.inst!==hub){msg(P,'결투를 시작할 수 없습니다','#ff6a5a');return;}
    const [A,B]=duelTeams(F,P);if(A.some(q=>B.includes(q))||A.some(q=>q.inst!==hub)||B.some(q=>q.inst!==hub))return;startArena(A,B);},
  fcand(P,d){const inst=P.inst;if(!inst||!inst.field||P.downed)return;const L=inst.field.lairs[1];const b=L.boss;if(!b||b.dead||!b.fs.cand)return;const c=b.fs.cand[d.i|0];if(!c||c.lit||Math.hypot(P.x-c.x,P.y-c.y)>26)return;c.lit=1;fx(inst,{k:'txt',x:r1(c.x),y:r1(c.y-16),s:'다시 타오른다!',c:'#ffd35a'});fieldSend(inst);},
  fact(P,d){const inst=P.inst;if(!inst||!inst.field||P.downed)return;const b=inst.field.bases[d.i|0];if(!b||Math.hypot(P.x-b.x,P.y-b.y)>44)return;if(b.st!=='ours')fieldBaseStart(inst,P,b);},
  ftp(P,d){const inst=P.inst;if(!inst||!inst.field||P.downed)return;const F=inst.field;const here=F.bases.find(b=>b.st==='ours'&&Math.hypot(P.x-b.x,P.y-b.y)<50)||(Math.hypot(P.x-inst.map.camp.x,P.y-inst.map.camp.y)<50?inst.map.camp:null);if(!here){msg(P,'되찾은 화로 곁에서만 이동할 수 있어요','#9e937a');return;}
    let to=null;if(d.i==='camp')to=inst.map.camp;else{const b=F.bases[d.i|0];if(b&&b.st==='ours')to=b;}if(!to)return;P.x=to.x+rf(-10,10);P.y=to.y+rf(12,20);unstick(inst,P,true);send(P,{t:'tp',x:P.x,y:P.y});fx(inst,{k:'blink',x:r1(P.x),y:r1(P.y)});},
  fleave(P){const inst=P.inst;if(!inst||!inst.field)return;if(Math.hypot(P.x-inst.map.camp.x,P.y-inst.map.camp.y)>60){msg(P,'야영지의 귀환 화로에서만 돌아갈 수 있어요','#9e937a');return;}joinHub(P);if(P.party)sendParty(P.party);},
  fenter(P){if(P.inst!==hub)return;if(!near(P,hub.map.portal,56)){msg(P,'던전 입구에 더 가까이 가세요','#9e937a');return;}const pt=P.party;if(!process.env.BC_DEBUG&&!((P.ch.rclr||{}).moon>0)){msg(P,'흑월의 왕좌를 클리어하면 잿빛 황야가 열려요','#ff6a5a');return;}if(P.ch.lvl<50){msg(P,'레벨 50부터 들어갈 수 있어요','#ff6a5a');return;}
    if(pt.inst){if(pt.inst.field){const inst=pt.inst;leaveInst(P);P.inst=inst;inst.players.add(P.id);resetCombat(P);placeStart(inst,P,inst.players.size);sendMap(P);bcastRoster(inst);bcastRoster(hub);sendParty(pt);msg(P,'파티의 잿빛 황야에 합류했습니다','#7fd05a');}else msg(P,'파티가 다른 곳에 있어요','#ff6a5a');return;}
    if(pt.leader!==P.id){msg(P,'파티장만 황야로 떠날 수 있습니다','#ff6a5a');return;}const members=partyList(pt).filter(q=>q.inst===hub);createField(pt,members);bcastRoster(hub);sendParty(pt);},
  rmove(P,d){const ch=P.ch;if(!ch.rbag)return;const B=ch.rbag,I=ch.rinv||(ch.rinv=[]);const get=w=>w&&w.w==='b'?B.c[w.i|0]:w&&w.w==='i'?I[w.i|0]:undefined;const okIdx=w=>w&&(w.w==='b'?(w.i|0)>=0&&(w.i|0)<B.c.length:w.w==='i'?(w.i|0)>=0&&(w.i|0)<=I.length&&(w.i|0)<SH.RINV_MAX:false);
    if(!okIdx(d.a)||!okIdx(d.b))return;const A=get(d.a),Bq=get(d.b);if(!A)return;
    const put=(w,v)=>{if(w.w==='b')B.c[w.i|0]=v||null;else{if(v)I[w.i|0]=v;else I.splice(w.i|0,1);}};
    if(d.a.w==='i'&&d.b.w==='i')return;
    if(d.a.w==='i'&&!Bq){B.c[d.b.i|0]=A;I.splice(d.a.i|0,1);}else if(d.b.w==='i'&&d.a.w==='b'&&Bq){/* 가방 → 차 있는 보관 칸: 서로 바꿈 (예전엔 맨 뒤에 붙고 가방 칸이 비었음) */B.c[d.a.i|0]=Bq;I[d.b.i|0]=A;}else if(d.b.w==='i'&&d.a.w==='b'){B.c[d.a.i|0]=null;if(I.length>=SH.RINV_MAX){msg(P,'유물 보관함이 가득 찼어요','#ff6a5a');B.c[d.a.i|0]=A;return;}I.push(A);}else{put(d.a,Bq);put(d.b,A);I.splice(0,I.length,...I.filter(Boolean));}
    recalc(P);send(P,{t:'ch',ch:P.ch,S:P.S});},
  rrot(P,d){const B=P.ch.rbag;if(!B)return;const q=B.c[d.i|0];if(!q||q.t!=='s')return;q.r=((q.r|0)+(d.ccw?3:1))&3;recalc(P);send(P,{t:'ch',ch:P.ch,S:P.S});},
  rdel(P,d){const I=P.ch.rinv||[];const i=d.i|0;if(!I[i])return;const q=I[i];I.splice(i,1);const g=q.t==='r'?40*(q.lv|0):30;P.ch.mats.dust=(P.ch.mats.dust|0)+Math.ceil(g/20);msg(P,`${q.t==='r'?SH.RELICS[q.id].n:SH.TABLETS[q.id].n} 분해 · 마력 가루 +${Math.ceil(g/20)}`,'#c9a0e8');markDirty(P);send(P,{t:'ch',ch:P.ch,S:P.S});},
  rrev(P){const inst=P.inst;if(inst&&inst.field&&P.downed){if(inst.time<P.raidRev){msg(P,`${Math.ceil(P.raidRev-inst.time)}초 뒤에 부활할 수 있어요`,'#9e937a');return;}fieldRevive(inst,P);return;}if(!inst||!inst.raid||!P.downed||!P.raidDown||P.raidWipe)return;const r=inst.raid;if(r.fail||r.done)return;if(inst.time<P.raidRev){msg(P,`${Math.ceil(P.raidRev-inst.time)}초 뒤에 부활할 수 있어요`,'#9e937a');return;}const why=raidRevBlock(inst);if(why){msg(P,`${why} · 기믹이 끝나면 부활할 수 있어요`,'#ff9a5a');return;}raidRevive(inst,P);},
  fish(P,d){if(P.inst!==hub||!near(P,hub.map.fish,40))return;const now=Date.now();
    if(d.op==='cast'){if(now<(P.fishCastT||0))return;P.fishCastT=now+1500;/* 던지고 바로 다시 던지며 좋은 물고기만 고르던 것 방지 */const FL=SH.fishLvOf(P.ch.fishXp|0).lv;const f=SH.rollFish(R,FL);P.fishing={bite:now+rf(2200,6500),f,cm:SH.rollFishCm(R,f,FL)};send(P,{t:'fish',st:'cast',wait:Math.round(P.fishing.bite-now)});return;}
    if(d.op==='reel'){const fs=P.fishing;P.fishing=null;if(!fs)return;if(now<fs.bite-400){msg(P,'너무 일찍 당겼어요! 물고기가 도망갔습니다','#ff6a5a');send(P,{t:'fish',st:'miss'});return;}if(!d.ok||now>fs.bite+12000){send(P,{t:'fish',st:'miss'});msg(P,'놓쳤다...','#9e937a');return;}
      const f=fs.f,ch=P.ch;ch.fish[f.id]=(ch.fish[f.id]|0)+1;addCdx(P,'f:'+f.id);ch.fishN=(ch.fishN|0)+1;let extra='';if(f.gem){for(let i=0;i<f.gem;i++){const g=SH.randGem(Math.max(1,ch.best|0)+10);ch.gems[g]=(ch.gems[g]|0)+1;extra+=` · ${SH.gemName(g)}`;}}if(f.dust){ch.mats.dust+=f.dust;extra+=` · 마력 가루 ${f.dust}`;}
      const g=SH.fishGrade(f,fs.cm);if((g>=3||f.r>=3)&&!ch.fishLeg){ch.fishLeg=1;msg(P,'전설 외형 「황금 낚시왕」을 얻었어요! (외형 › 전설)','#ffd35a');}let best=false,rank=-1;if(!ch.fishBest||fs.cm>ch.fishBest.cm){ch.fishBest={id:f.id,cm:fs.cm};best=true;rank=rankPut('fish',{id:ch.id,n:ch.name,cls:ch.cls,s:fs.cm,f:f.id,g,ts:Date.now()});}const lv0=SH.fishLvOf(ch.fishXp|0).lv;const gx=SH.fishXpGain(f,g);ch.fishXp=(ch.fishXp|0)+gx;const lv1=SH.fishLvOf(ch.fishXp).lv;if(lv1>lv0){msg(P,`낚시 레벨 ${lv1} 달성! 높은 등급 물고기가 더 자주 나타나요`,'#7fd0ff');}
      markDirty(P);send(P,{t:'fish',st:'got',id:f.id,cm:fs.cm,g,best,rank,extra,gx,fxp:ch.fishXp,lvup:lv1>lv0?lv1:0});
      if(f.r>=2||g>=2)bcast(hub,{t:'msg',m:`${P.ch.name}님이 ${g>=2?SH.FISH_GN[g]+' ':''}${SH.FISH_RN[f.r]} 물고기 '${f.n}'(${fs.cm}cm)을 낚았다!`,c:g>=3?SH.FISH_GC[3]:SH.FISH_RC[f.r]});return;}
    if(d.op==='bite'){const fs=P.fishing;if(!fs||now<fs.bite-400)return;/* 입질 전에 물고기 등급을 미리 알려 주던 문제 */send(P,{t:'fish',st:'bite',r:fs.f.r});}},
  sellfish(P){if(P.inst!==hub||!near(P,hub.map.merchant,48))return;let g=0,n=0;for(const f of SH.FISH){const c=P.ch.fish[f.id]|0;if(c){g+=c*f.v;n+=c;}}if(!n){msg(P,'팔 물고기가 없습니다','#9e937a');return;}P.ch.fish={};P.ch.gold+=g;markDirty(P);msg(P,`물고기 ${n}마리 판매 · +${g}골드`,'#ffd35a');send(P,{t:'fxp',k:'gold'});},
  emo(P,d){const inst=P.inst;if(!inst)return;const now=Date.now();if(now-(P.emoT||0)<1200)return;P.emoT=now;const i=clamp(d.i|0,0,SH.EMOTES.length-1);bcast(inst,{t:'emo',id:P.id,i});},
  dye(P,d){if(P.inst!==hub||!near(P,hub.map.tailor,48))return;const i=d.i|0;if(i<0||i>=SH.DYES.length)return;const ch=P.ch;
    if(i>0&&!ch.dyes.includes(i)){if(ch.gold<SH.DYE_COST){msg(P,'골드가 부족합니다','#ff6a5a');return;}ch.gold-=SH.DYE_COST;ch.dyes.push(i);msg(P,`'${SH.DYES[i].n}' 염료를 샀습니다`,'#ffd35a');send(P,{t:'fxp',k:'gold'});}
    ch.dye=i;markDirty(P);bcastRoster(hub);},
  cos(P,d){if(P.inst!==hub)return;const k=d.k==='glow'?'glow':d.k==='shield'?'shield':'cape';P.ch.cos[k]=P.ch.cos[k]?0:1;markDirty(P);bcastRoster(hub);},
  tal(P,d){const e=SH.canTalent(P.ch,String(d.id));if(e){msg(P,e,'#ff6a5a');return;}P.ch.tal[d.id]=(P.ch.tal[d.id]|0)+1;recalc(P);send(P,{t:'fxp',k:'learn'});},
  talreset(P){if(P.inst!==hub){msg(P,'마을에서만 초기화할 수 있습니다','#ff6a5a');return;}const cost=50*P.ch.lvl;if(P.ch.gold<cost){msg(P,'골드가 부족합니다','#ff6a5a');return;}P.ch.gold-=cost;P.ch.tal={};recalc(P);msg(P,`특성을 초기화했습니다 (-${cost}골드)`,'#ffd35a');},
  title(P,d){const id=d.id||null;if(id&&!(P.ch.ach||[]).includes(id))return;P.ch.title=id;markDirty(P);if(P.inst)bcastRoster(P.inst);},
  pet(P,d){const id=d.id||null;if(id&&!(P.ch.pets||[]).includes(id))return;P.ch.pet=id;markDirty(P);if(P.inst)bcastRoster(P.inst);},
  merc(P,d){if(P.inst!==hub||!near(P,hub.map.merc,50))return;if(!d.k){P.ch.merc=null;markDirty(P);msg(P,'용병을 돌려보냈습니다','#9e937a');return;}const M=SH.MERCS[d.k];if(!M)return;const cost=SH.mercCost(P.ch.lvl);
    if(P.ch.gold<cost){msg(P,'골드가 부족합니다','#ff6a5a');return;}P.ch.gold-=cost;P.ch.merc=d.k;markDirty(P);send(P,{t:'fxp',k:'gold'});msg(P,`${M.n} 용병을 고용했습니다 · 혼자 던전에 들어가면 함께 싸웁니다`,'#7fd05a');},
  ult(P,d){const inst=P.inst;if(!inst||P.downed||inst.paused)return;if(inst.type!=='dungeon'&&!inYard(P))return;if(inst.arena&&(inst.arena.cd>0||inst.arena.over))return;
    const id=P.ch.ult;if(!id||P.ch.lvl<SH.ULT_LVL||!SK[id]||!ultOk(id))return;if(P.gmLock>inst.time)return;P.actT=inst.time;const sk=SKILLS[id];const now=Date.now();if(now<(P.ucdEnd||0)-150){send(P,{t:'ucd',left:Math.round((P.ucdEnd-now)/100)/10});return;}
    const cd=sk.cd*(1-Math.min(0.3,P.S.cdr||0));P.ucdEnd=now+cd*1000;send(P,{t:'ucd',left:cd});const tx=+d.x||P.x,ty=+d.y||P.y;const a=Math.atan2(ty-P.y,tx-P.x);P.face=Math.cos(a)<0?-1:1;
    fx(inst,{k:'ult',id:P.id,n:sk.n,s:id});fx(inst,{k:'sfx',n:'ult'});inst._el=SKILL_EL[id]||null;inst._um=SH.ultPow(P.ch.lvl);inst._src=id;try{withFoes(inst,P,()=>SK[id](inst,P,a,tx,ty,1,1));}finally{inst._el=null;inst._um=null;inst._src=null;}},
  ultsel(P,d){if(!SH.ultsOf(P.ch).includes(d.id)||!ultOk(d.id))return;if(P.ch.lvl<SH.ULT_LVL){msg(P,`궁극기는 ${SH.ULT_LVL}레벨에 배웁니다`,'#ff6a5a');return;}
    if(P.ch.ult&&P.ch.ult!==d.id&&P.inst!==hub){msg(P,'궁극기는 마을에서만 바꿀 수 있어요','#ff6a5a');return;}if(P.ch.ult===d.id)return;P.ch.ult=d.id;markDirty(P);msg(P,`궁극기: ${SKILLS[d.id].n}`,'#ffd35a');},
  ctr(P,d){const inst=P.inst;if(!inst||P.downed||inst.paused){if(P.ch)send(P,{t:'ctrReset'});return;}if(P.gmLock>inst.time){send(P,{t:'ctrReset'});return;}/* 감옥·검 맞부딪치기 중 카운터로 빠져나가던 문제 */if((inst.type!=='dungeon'&&!inYard(P))||(inst.arena&&(inst.arena.cd>0||inst.arena.over))){send(P,{t:'ctrReset'});return;}const now=Date.now();if(now-(P.ctrT||0)<SH.CTR_CD*1000-150)return;P.ctrT=now;
    const tx=+d.x||P.x,ty=+d.y||P.y;const a=Math.atan2(ty-P.y,tx-P.x);P.face=Math.cos(a)<0?-1:1;const cls=P.ch.cls;inst._ctr=1;
    try{withFoes(inst,P,()=>{
      if(cls==='warrior'){const dd=Math.hypot(tx-P.x,ty-P.y);dashTo(inst,P,a,clamp(dd-14,0,22));inst._el='slash';const a2=dd>14?Math.atan2(ty-P.y,tx-P.x):a;cone(inst,P,a2,38,0.95,1.8,{});fx(inst,{k:'cleave',x:r1(P.x),y:r1(P.y),a:r1(a2),s:1});}
      else if(cls==='knight'){const dd=Math.hypot(tx-P.x,ty-P.y);const[ox,oy]=dashTo(inst,P,a,clamp(dd-14,0,26));inst._el='slash';cone(inst,P,a,40,0.95,2.2*(P.S.rad||1),{kb:4});fx(inst,{k:'lcut',x:r1(P.x),y:r1(P.y),a:r1(a),r:40});fx(inst,{k:'lwave',x1:r1(ox),y1:r1(oy-6),x2:r1(P.x),y2:r1(P.y-6),dash:1});addHoly(P,15);}
      else if(cls==='gunner'){inst._el='shot';fx(inst,{k:'gfire',id:P.id,a:r1(a),g:'r',big:1});spawnPProj(inst,P,'slug',a,640,1.9,{life:0.6});addSteam(inst,P,15);}
      else if(cls==='guardian'){inst._el='blunt';cone(inst,P,a,34,1.0,1.4,{kb:10,stun:0.6});fx(inst,{k:'bash',x:r1(P.x+Math.cos(a)*14),y:r1(P.y+Math.sin(a)*14)});}
      else if(cls==='archer'){inst._el='arrow';spawnPProj(inst,P,'pierce',a,420,1.7,{life:0.9});fx(inst,{k:'sfx',n:'bow'});}
      else if(cls==='mage'){inst._el='magic';spawnPProj(inst,P,'bolt',a,380,1.8,{life:0.9,r:3});}
      else{inst._el='holy';spawnPProj(inst,P,'holy',a,360,1.6,{life:0.9,r:3});}});}
    finally{inst._ctr=null;inst._el=null;}fx(inst,{k:'ctrcast',id:P.id,a:r1(a)});},
  town(P){if(!P.inst||P.inst===hub)return;const inst=P.inst;if(inst.arena){if(!inst.arena.over){P.ch.pvp.l++;P._arenaQuit=true;markDirty(P);msg(P,'결투를 포기했습니다 (패배)','#ff6a5a');}P.arenaTeam=null;}const wasPauser=inst.paused===P.ch.name;joinHub(P);if(wasPauser&&inst.players.size){inst.paused=null;bcast(inst,{t:'paused',by:null});}if(P.party)sendParty(P.party);}
};
Object.assign(H,RAID_H);

wss.on('connection',ws=>{
  const P={id:'p'+(nextId++),ws,ch:null,S:null,x:0,y:0,r:4,face:1,moving:false,inst:null,party:null,hp:1,mp:1,shield:0,shieldT:0,shieldBy:null,downed:false,rev:0,dodgeT:0,dodgeCd:0,atkCd:0,potCd:0,scd:{},buffs:{},dirty:false,invite:null,alive:true,msgs:0};
  ws.on('pong',()=>{P.alive=true;});
  ws.on('message',raw=>{let d;try{d=JSON.parse(raw);}catch(e){return;}if(!d||typeof d.t!=='string')return;
    if(++P.msgs>200)return;
    if(!P.ch){if(d.t==='join'){/* 접속 처리 중 예외가 나면 서버 전체가 꺼지던 문제 → 막고 접속만 거절 */let ch=null;try{ch=sanitizeChar(d.ch);if(ch)SH.calcStats(ch,true);}catch(e){console.error('join sanitize',e);ch=null;}if(!ch){send(P,{t:'err',m:'캐릭터 정보가 올바르지 않습니다'});return;}
    /* 같은 캐릭터가 두 곳에서 동시에 접속하면 아이템이 복사되던 문제 → 먼저 접속한 쪽을 끊음 */for(const Q of [...players.values()])if(Q!==P&&Q.ch&&Q.ch.id===ch.id){send(Q,{t:'kicked',m:'다른 곳에서 같은 캐릭터로 접속해 이 창의 연결을 끊었어요'});try{Q.ws.terminate();}catch(e){}if(players.get(Q.id)===Q){try{leaveInst(Q);leaveParty(Q);}catch(e){}players.delete(Q.id);}}
    try{P.ch=ch;P.S=SH.calcStats(ch,true);P.stash=sanitizeStash(d.stash);players.set(P.id,P);newParty(P);send(P,{t:'welcome',id:P.id,ver:BUILD,ultok:process.env.BC_DEBUG?null:[...ULT_OK]});if(ch._capped){delete ch._capped;markDirty(P);setTimeout(()=>{msg(P,`만렙이 ${SH.LVL_CAP}으로 정해져 레벨이 ${SH.LVL_CAP}이 되었어요`,'#ffd35a');msg(P,'스탯·스킬·특성 포인트를 모두 돌려드렸어요. 다시 찍어 주세요 (C · K · N)','#ffd35a');},1500);}joinHub(P);rankSeed(P);P.prevParty=Array.isArray(d.prev)?d.prev.slice(0,PARTY_MAX).map(String):null;restoreParty(P);sendParty(P.party);send(P,{t:'ch',ch:P.ch,S:P.S});send(P,{t:'stash',s:P.stash});}catch(e){console.error('join',e);try{if(players.get(P.id)===P){leaveInst(P);leaveParty(P);players.delete(P.id);}}catch(e2){}P.ch=null;send(P,{t:'err',m:'접속 중 오류가 났어요. 다시 시도해 주세요'});}}return;}
    const h=H[d.t];if(h){try{h(P,d);}catch(e){console.error('handler',d.t,e);}}});
  ws.on('close',()=>{if(!P.ch)return;leaveInst(P);const pt=P.party;leaveParty(P);players.delete(P.id);});
});
setInterval(()=>{for(const P of players.values()){if(!P.alive){P.ws.terminate();continue;}P.alive=false;try{P.ws.ping();}catch(e){}}},25000);

// ================= 메인 루프 =================
const DT=0.05;let flushT=0;
/* 서버 성능 기록: 접속자가 있을 때 1분마다 [PERF] 로그 (틱 처리 시간 평균·최대 · 접속자 · 던전 수 · 메모리) */
let PERF={n:0,sum:0,max:0,t:Date.now()};
setInterval(()=>{const pf0=process.hrtime.bigint();
  for(const P of players.values())P.msgs=0;
  /* 한 인스턴스가 틱마다 계속 에러를 내면(2초 이상) 그 안의 플레이어가 영영 멈춰 버리므로 → 마을로 구출하고 인스턴스를 닫는다 */
  for(const inst of [...dungeons.values()]){try{updateDungeon(inst,DT);snapshot(inst);inst._errN=0;}catch(e){inst._errN=(inst._errN|0)+1;if(inst._errN<=3||inst._errN%100===0)console.error('tick',e);
    if(inst._errN>=40){console.error('[RESCUE] 인스턴스 '+inst.id+' 오류 반복 → 플레이어 마을로 구출');for(const P of instPlayers(inst)){try{joinHub(P);msg(P,'오류가 생겨 마을로 돌아왔어요. 불편을 드려 죄송해요','#ff6a5a');if(P.party)sendParty(P.party);}catch(e2){}}dungeons.delete(inst.id);if(inst.party&&inst.party.inst===inst){inst.party.inst=null;try{sendParty(inst.party);}catch(e3){}}}}}
  hub.time+=DT;
  for(let i=hub.drops.length-1;i>=0;i--)if(hub.time-hub.drops[i].born>300)remDrop(hub,hub.drops[i]);
  for(const P of instPlayers(hub)){P.hp=P.S.maxHp;P.mp=P.S.maxMp;/* 마을(훈련장)에서도 속박·둔화가 풀리게 — 용의 화살 뒤 멈춰 있던 버그 */if(P.rootT>0)P.rootT-=DT;if(P.slowT>0){P.slowT-=DT;if(P.slowT<=0)P.slowV=0;}P.atkCd-=DT;P.potCd-=DT;P.dodgeT-=DT;P.dodgeCd-=DT;for(const k in P.scd)P.scd[k]-=DT;const b=P.buffs;for(const k in b)if(k.endsWith('T'))b[k]-=DT;if(P.shieldT>0){P.shieldT-=DT;if(P.shieldT<=0)P.shield=0;}
    const w=P.dps;if(w){while(w.win.length&&hub.time-w.win[0][0]>5)w.win.shift();if(hub.time-w.last<=4.5&&((hub.time*2)|0)!==w.sent){w.sent=(hub.time*2)|0;const span=Math.min(5,Math.max(1,hub.time-w.t0));send(P,{t:'dps',v:Math.round(w.win.reduce((a,b)=>a+b[1],0)/span),tot:Math.round(w.tot),dur:Math.round((w.last-w.t0)*10)/10});}}}
  try{updateDots(hub,DT);updateProjs(hub,DT);updateZones(hub,DT);updateTimers(hub,DT);for(const m of hub.monsters){m.flash-=DT;m.slow-=DT;m.stun-=DT;}}catch(e){console.error('hub',e);}
  snapshot(hub);
  flushT-=DT;if(flushT<=0){flushT=0.5;for(const P of players.values())if(P.dirty){P.dirty=false;checkAch(P);send(P,{t:'ch',ch:P.ch,S:P.S});}}
  {const ms=Number(process.hrtime.bigint()-pf0)/1e6;PERF.n++;PERF.sum+=ms;if(ms>PERF.max)PERF.max=ms;const now=Date.now();if(now-PERF.t>=60000){if(players.size)console.log(`[PERF] 틱 평균 ${(PERF.sum/PERF.n).toFixed(2)}ms 최대 ${PERF.max.toFixed(1)}ms · 틱 ${PERF.n}/${Math.round((now-PERF.t)/1000/DT)} · 접속 ${players.size} · 던전 ${dungeons.size} · 메모리 ${Math.round(process.memoryUsage().rss/1048576)}MB`);PERF={n:0,sum:0,max:0,t:now};}}
},DT*1000);

server.listen(PORT,()=>console.log('달 없는 밤: 등불을 든 자 서버 실행 중 · 포트 '+PORT));
