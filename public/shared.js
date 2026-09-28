// 핏빛 카타콤 — 서버와 클라이언트가 함께 쓰는 게임 규칙
(function(root){
'use strict';
const TS=16;

// ---------- 난수 ----------
function mulberry(a){a=a>>>0;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function rid(){return Math.random().toString(36).slice(2,10)+Math.random().toString(36).slice(2,6);}

// ---------- 맵 도구 ----------
function tileAt(map,tx,ty){if(tx<0||ty<0||tx>=map.w||ty>=map.h)return 0;return map.tiles[ty*map.w+tx];}
function walk(map,tx,ty){const t=tileAt(map,tx,ty);return t===1||t===2;}
function solidAt(map,x,y){return !walk(map,Math.floor(x/TS),Math.floor(y/TS));}
function blocked(map,x,y,r){return solidAt(map,x-r,y-r)||solidAt(map,x+r,y-r)||solidAt(map,x-r,y+r)||solidAt(map,x+r,y+r);}
function moveEnt(map,e,dx,dy){let mv=false;if(dx&&!blocked(map,e.x+dx,e.y,e.r)){e.x+=dx;mv=true;}if(dy&&!blocked(map,e.x,e.y+dy,e.r)){e.y+=dy;mv=true;}return mv;}
function los(map,ax,ay,bx,by,r){const d=Math.hypot(bx-ax,by-ay);const n=Math.ceil(d/4);for(let i=1;i<=n;i++){const t=i/n,x=ax+(bx-ax)*t,y=ay+(by-ay)*t;if(r?blocked(map,x,y,r):solidAt(map,x,y))return false;}return true;}
const D4=[[1,0],[-1,0],[0,1],[0,-1]],D8=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
function bfs(map,sx,sy,maxD){maxD=maxD||9999;const W=map.w,H=map.h,d=new Int16Array(W*H).fill(-1);if(!walk(map,sx,sy))return d;const q=new Int32Array(W*H);let h=0,t=0;const s=sy*W+sx;d[s]=0;q[t++]=s;
  while(h<t){const c=q[h++],cd=d[c];if(cd>=maxD)continue;const cx=c%W,cy=(c/W)|0;for(const[dx,dy]of D4){const nx=cx+dx,ny=cy+dy;if(nx<0||ny<0||nx>=W||ny>=H)continue;const n=ny*W+nx;if(d[n]<0&&(map.tiles[n]===1||map.tiles[n]===2)){d[n]=cd+1;q[t++]=n;}}}return d;}

// ---------- 던전 생성 (시드가 같으면 서버와 클라이언트가 같은 맵을 만든다) ----------
function genFloor(seed,fl){
  const R=mulberry(seed);const ri=(a,b)=>a+Math.floor(R()*(b-a+1));const pick=a=>a[Math.floor(R()*a.length)];
  const W=60,H=60,boss=fl%5===0;let tiles,rooms;
  const map={w:W,h:H,tiles:null,boss,floor:fl};
  for(let attempt=0;attempt<30;attempt++){
    tiles=new Uint8Array(W*H);rooms=[];const target=ri(10,13);
    for(let t=0;t<700&&rooms.length<target;t++){
      const big=boss&&rooms.length===0;const w=big?16:ri(6,12),h=big?12:ri(5,9);const x=ri(3,W-w-4),y=ri(3,H-h-4);
      if(rooms.some(o=>x<o.x+o.w+2&&x+w+2>o.x&&y<o.y+o.h+2&&y+h+2>o.y))continue;
      rooms.push({x,y,w,h,cx:x+(w>>1),cy:y+(h>>1),big});
    }
    if(rooms.length>=7)break;
  }
  map.tiles=tiles;
  const carve=(x,y)=>{for(let j=0;j<2;j++)for(let i=0;i<2;i++){const tx=x+i,ty=y+j;if(tx>1&&ty>1&&tx<W-2&&ty<H-2)tiles[ty*W+tx]=1;}};
  const corridor=(a,b)=>{let x=a.cx,y=a.cy;if(R()<.5){while(x!==b.cx){carve(x,y);x+=Math.sign(b.cx-x);}while(y!==b.cy){carve(x,y);y+=Math.sign(b.cy-y);}}else{while(y!==b.cy){carve(x,y);y+=Math.sign(b.cy-y);}while(x!==b.cx){carve(x,y);x+=Math.sign(b.cx-x);}}carve(x,y);};
  for(const r of rooms)for(let j=r.y;j<r.y+r.h;j++)for(let i=r.x;i<r.x+r.w;i++)tiles[j*W+i]=1;
  const conn=[rooms[0]],rest=rooms.slice(1);
  while(rest.length){let bd=1e9,bi=0,bc=null;for(let i=0;i<rest.length;i++)for(const c of conn){const d=Math.abs(rest[i].cx-c.cx)+Math.abs(rest[i].cy-c.cy);if(d<bd){bd=d;bi=i;bc=c;}}const r=rest.splice(bi,1)[0];corridor(r,bc);conn.push(r);}
  for(let k=0;k<2;k++){const a=pick(rooms),b=pick(rooms);if(a!==b)corridor(a,b);}
  let start,stairsRoom,bossRoom=null;
  if(boss){bossRoom=rooms[0];const dB=bfs(map,bossRoom.cx,bossRoom.cy);let fd=-1;for(const r of rooms){const v=dB[r.cy*W+r.cx];if(r!==bossRoom&&v>fd){fd=v;start=r;}}stairsRoom=bossRoom;}
  else{start=pick(rooms);const dS=bfs(map,start.cx,start.cy);let fd=-1;for(const r of rooms){const v=dS[r.cy*W+r.cx];if(r!==start&&v>fd){fd=v;stairsRoom=r;}}}
  map.rooms=rooms;map.start=start;map.bossRoom=bossRoom;map.stairsIdx=stairsRoom.cy*W+stairsRoom.cx;
  map.torches=[];
  for(const r of rooms){const cand=[];for(let i=r.x+1;i<r.x+r.w-1;i++)if(tileAt(map,i,r.y-1)===0&&tileAt(map,i,r.y)>0)cand.push(i);let last=-99;const want=r.w>9?2:1;let placed=0;
    for(let t=0;t<10&&placed<want&&cand.length;t++){const i=pick(cand);if(Math.abs(i-last)<4)continue;last=i;placed++;map.torches.push({x:i*TS+8,y:(r.y-1)*TS+4,ph:R()*6});}}
  return map;
}
function openStairs(map){map.tiles[map.stairsIdx]=2;}

// ---------- 마을 (던전 입구 광장) ----------
function genHub(){
  const W=44,H=32,tiles=new Uint8Array(W*H);const map={w:W,h:H,tiles,hub:true,floor:0};
  const rect=(x0,y0,x1,y1,v)=>{for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)tiles[y*W+x]=v;};
  rect(4,7,39,27,1);rect(18,3,25,6,1);
  for(const[x,y]of[[10,11],[33,11],[10,22],[33,22]])rect(x,y,x+1,y+1,0);
  rect(21,12,22,13,3);
  map.props=[{t:'fountain',x:22*TS,y:13*TS+8},{t:'barrel',x:5*TS+8,y:13*TS+8},{t:'barrel',x:5*TS+8,y:16*TS+8},{t:'crate',x:6*TS+8,y:17*TS+8},{t:'crate',x:38*TS+8,y:25*TS+8},{t:'barrel',x:37*TS+8,y:25*TS+8},{t:'banner',x:12*TS+8,y:6*TS+2},{t:'banner',x:31*TS+8,y:6*TS+2}];
  for(const p of map.props)if(p.t==='barrel'||p.t==='crate'){const tx=Math.floor(p.x/TS),ty=Math.floor(p.y/TS);tiles[ty*W+tx]=3;}
  map.portal={x:22*TS,y:4*TS+4};map.merchant={x:8*TS,y:15*TS};map.spawn={x:22*TS,y:19*TS};map.board={x:36*TS,y:15*TS};
  map.torches=[];for(const x of[6,9,13,16,27,30,34,37])map.torches.push({x:x*TS+8,y:6*TS+4,ph:x});
  for(const x of[18,25])map.torches.push({x:x*TS+8,y:2*TS+4,ph:x*3});
  map.stairsIdx=-1;map.start={cx:22,cy:19};
  return map;
}

// ---------- 직업 ----------
const CLASSES={
  warrior:{n:'전사',role:'근거리 딜러',fam:'melee',prim:'str',range:'melee',base:{str:16,dex:10,vit:12,ene:6},hpMul:1.1,armorMul:1,atkRate:1.3,ms:80,
    basic:{kind:'melee',mult:1},skills:['whirl','charge','warcry','cleave','bloodlust','leap','rend','berserk','frenzy','bladestorm','execute','earthsplit'],
    desc:'강력한 근접 공격과 돌진으로 적진을 가르는 딜러'},
  guardian:{n:'수호자',role:'탱커',fam:'melee',prim:'str',range:'melee',base:{str:12,dex:8,vit:18,ene:6},hpMul:1.4,armorMul:1.7,atkRate:1.1,ms:76,
    basic:{kind:'melee',mult:0.8},skills:['taunt','bash','bulwark','hook','ironskin','shieldwall','consecrate','slam','undying','rally','shieldthrow','bastion'],
    desc:'적의 공격을 끌어당기고 파티를 지키는 방패. 적은 수호자를 먼저 노린다'},
  archer:{n:'궁수',role:'원거리 딜러',fam:'bow',prim:'dex',range:'ranged',base:{str:8,dex:18,vit:10,ene:8},hpMul:0.85,armorMul:0.9,atkRate:1.45,ms:82,
    basic:{kind:'shot',proj:1,speed:280,mult:0.9},skills:['multishot','pierce','rain','vault','eagle','trap','poison','volley','swift','sniper','barrage','starfall'],
    desc:'멀리서 화살을 퍼붓는 딜러. 체력이 낮아 위치 선정이 중요하다'},
  mage:{n:'마법사',role:'원거리 광역',fam:'staff',prim:'ene',range:'ranged',base:{str:5,dex:10,vit:9,ene:20},hpMul:0.8,armorMul:0.8,atkRate:1.2,ms:78,
    basic:{kind:'shot',proj:2,speed:230,mult:0.85},skills:['fireball','nova','chain','blink','arcane','meteor','frostorb','flamewall','manaflow','blizzard','thunder','armageddon'],
    desc:'화염과 얼음, 번개로 적 무리를 쓸어버리는 광역 딜러'},
  priest:{n:'사제',role:'힐러',fam:'staff',prim:'ene',range:'ranged',base:{str:6,dex:9,vit:13,ene:18},hpMul:0.95,armorMul:1,atkRate:1.1,ms:78,
    basic:{kind:'shot',proj:3,speed:230,mult:0.7},skills:['heal','smite','shield','sanctuary','devotion','renew','purify','holyfire','grace','blessing','lightpillar','miracle'],
    desc:'파티를 치유하고 보호막을 씌운다. 쓰러진 동료를 두 배 빨리 일으킨다'}
};
const CLASS_ORDER=['warrior','guardian','archer','mage','priest'];
const UNLOCK=[1,1,3,5,8,11,14,18,22,26,30,35];
const MAX_RANK=10,BAR_SIZE=6;
// lvl: 해금 레벨, pas: 패시브, per: 등급당 효과 설명
const SKILLS={
  // 전사
  whirl:{n:'회전베기',mp:8,cd:1.2,desc:'주변의 모든 적에게 무기 피해 160%'},
  charge:{n:'돌진 베기',mp:10,cd:4,desc:'커서 방향으로 돌진하며 경로의 적에게 180% 피해'},
  warcry:{n:'전쟁의 함성',mp:15,cd:14,desc:'주변 파티원의 피해 +25% (8초)'},
  cleave:{n:'대지 가르기',mp:14,cd:6,desc:'전방 부채꼴에 250% 피해, 1.2초 기절'},
  bloodlust:{n:'피의 갈증',pas:1,desc:'생명력 흡수',per:'등급당 생명력 흡수 +1.5%'},
  leap:{n:'도약 강타',mp:16,cd:7,desc:'커서 위치로 뛰어올라 착지 지점에 200% 피해와 1초 기절'},
  rend:{n:'출혈 베기',mp:12,cd:4,desc:'전방의 적을 베어 80% 피해, 5초간 출혈 250%'},
  berserk:{n:'광전사',mp:20,cd:20,desc:'8초간 공격 속도 +40%, 피해 +20%'},
  frenzy:{n:'전투 광기',pas:1,desc:'치명타 확률과 치명타 피해 증가',per:'등급당 치명타 +1.5%, 치명타 피해 +5%'},
  bladestorm:{n:'칼날 폭풍',mp:28,cd:14,desc:'3초간 몸을 회전하며 주변에 초당 150% 피해'},
  execute:{n:'처형',mp:18,cd:8,desc:'앞의 적 하나에 400% 피해. 체력 30% 이하 적에게는 두 배'},
  earthsplit:{n:'대지 분쇄',mp:35,cd:18,desc:'넓은 범위에 350% 피해와 2초 기절'},
  // 수호자
  taunt:{n:'도발',mp:6,cd:8,desc:'주변 적이 5초간 나만 노린다. 3초간 받는 피해 -30%'},
  bash:{n:'방패 강타',mp:8,cd:3,desc:'앞의 적에게 140% 피해, 2초 기절'},
  bulwark:{n:'수호의 오라',mp:18,cd:18,desc:'주변 파티원이 받는 피해 -35% (6초)'},
  hook:{n:'쇠사슬 끌기',mp:10,cd:6,desc:'커서 방향 첫 적을 끌어오고 3초 도발'},
  ironskin:{n:'강철 피부',pas:1,desc:'방어력 증가',per:'등급당 방어력 +8%'},
  shieldwall:{n:'방패벽',mp:14,cd:16,desc:'4초간 받는 피해 -60%'},
  consecrate:{n:'신성한 땅',mp:20,cd:12,desc:'발밑에 5초간 장판. 적에게 초당 60% 피해, 아군 소량 회복'},
  slam:{n:'대지 강타',mp:14,cd:6,desc:'주변 적에게 180% 피해, 3초 둔화'},
  undying:{n:'불굴',pas:1,desc:'치명상을 입으면 한 번 체력 30%로 버틴다',per:'등급당 재사용 대기 -8초 (기본 120초)'},
  rally:{n:'결집의 외침',mp:22,cd:20,desc:'주변 파티원에게 최대 체력 20% 보호막 (8초)'},
  shieldthrow:{n:'방패 투척',mp:12,cd:4,desc:'적 사이를 3번 튕기는 방패, 각 150% 피해'},
  bastion:{n:'최후의 보루',mp:40,cd:40,desc:'8초간 파티 받는 피해 -40%, 주변 모든 적 도발'},
  // 궁수
  multishot:{n:'다중 사격',mp:8,cd:1,desc:'부채꼴로 화살 5발, 각 70% 피해'},
  pierce:{n:'관통 화살',mp:10,cd:3,desc:'모든 적을 꿰뚫는 화살, 220% 피해'},
  rain:{n:'화살비',mp:16,cd:8,desc:'커서 위치에 2.5초간 화살비, 초당 120% 피해'},
  vault:{n:'후퇴 사격',mp:8,cd:5,desc:'뒤로 도약하며 화살 3발 발사'},
  eagle:{n:'매의 눈',pas:1,desc:'치명타 피해 증가',per:'등급당 치명타 피해 +8%'},
  trap:{n:'폭발 덫',mp:12,cd:6,desc:'커서 위치에 덫 설치. 적이 밟으면 250% 폭발과 둔화'},
  poison:{n:'독화살',mp:10,cd:3,desc:'맞은 적에게 100% 피해와 5초간 독 300%'},
  volley:{n:'일제 사격',mp:18,cd:6,desc:'넓은 부채꼴로 화살 9발, 각 60% 피해'},
  swift:{n:'바람걸음',pas:1,desc:'이동 속도와 공격 속도 증가',per:'등급당 이동 속도 +3%, 공격 속도 +2%'},
  sniper:{n:'저격',mp:22,cd:10,desc:'1초 조준 후 모든 적을 꿰뚫는 600% 탄환'},
  barrage:{n:'연사',mp:24,cd:12,desc:'1.5초간 커서 방향으로 화살 12발, 각 80%'},
  starfall:{n:'별똥별 화살',mp:40,cd:22,desc:'커서 지역에 거대한 폭발 3회, 각 300%'},
  // 마법사
  fireball:{n:'화염구',mp:10,cd:0.6,desc:'폭발하는 화염구, 주문 피해 170%'},
  nova:{n:'얼음 폭발',mp:18,cd:5,desc:'주변 적에게 120% 피해, 3초간 50% 둔화'},
  chain:{n:'연쇄 번개',mp:14,cd:2,desc:'적 사이를 4번 튀는 번개, 각 130% 피해'},
  blink:{n:'순간이동',mp:12,cd:3,desc:'커서 방향으로 최대 8칸 순간 이동'},
  arcane:{n:'비전 지식',pas:1,desc:'주문 피해 증가',per:'등급당 주문 피해 +6%'},
  meteor:{n:'운석',mp:26,cd:8,desc:'1초 뒤 커서 위치에 400% 폭발, 3초간 불바다'},
  frostorb:{n:'서리 구체',mp:20,cd:6,desc:'천천히 날아가며 주변 적에게 얼음 파편, 초당 160%와 둔화'},
  flamewall:{n:'화염 벽',mp:18,cd:7,desc:'커서 위치에 4초간 불 장판, 초당 140%'},
  manaflow:{n:'마나 흐름',pas:1,desc:'마나 재생 증가',per:'등급당 마나 재생 +15%, 최대 마나 +5'},
  blizzard:{n:'눈보라',mp:30,cd:14,desc:'넓은 지역에 5초간 눈보라. 초당 100% 피해와 둔화'},
  thunder:{n:'뇌우',mp:26,cd:9,desc:'커서 주변 적 최대 6명에게 낙뢰, 각 220%'},
  armageddon:{n:'종말',mp:60,cd:45,desc:'5초간 주변에 운석이 쏟아진다. 각 250%'},
  // 사제
  heal:{n:'치유의 빛',mp:12,cd:1.5,desc:'커서 주변 파티원을 치유'},
  smite:{n:'심판',mp:10,cd:2.5,desc:'커서 위치에 신성 폭발, 주문 피해 180%'},
  shield:{n:'보호의 축복',mp:16,cd:10,desc:'주변 파티원에게 6초간 보호막'},
  sanctuary:{n:'치유의 장',mp:20,cd:14,desc:'커서 위치에 5초간 치유 장판'},
  devotion:{n:'헌신',pas:1,desc:'치유량과 보호막량 증가',per:'등급당 치유력 +6%'},
  renew:{n:'소생의 기도',mp:30,cd:45,desc:'주변에 쓰러진 파티원을 즉시 일으킨다 (체력 50%)'},
  purify:{n:'정화의 파동',mp:18,cd:6,desc:'주변 파티원 치유, 주변 적에게 120% 피해'},
  holyfire:{n:'성화',mp:14,cd:3,desc:'커서 방향으로 적을 꿰뚫는 빛줄기, 250% 피해'},
  grace:{n:'은총',pas:1,desc:'받는 피해 감소와 최대 마나 증가',per:'등급당 받는 피해 -2%, 최대 마나 +5'},
  blessing:{n:'축복',mp:28,cd:30,desc:'10초간 주변 파티원 피해 +20%, 받는 피해 -20%'},
  lightpillar:{n:'빛의 기둥',mp:26,cd:12,desc:'커서 위치에 5초간 빛기둥. 적 초당 120%, 아군 지속 치유'},
  miracle:{n:'기적',mp:50,cd:90,desc:'던전의 모든 파티원 체력 완전 회복과 보호막'}
};
for(const c in CLASSES)CLASSES[c].skills.forEach((s,i)=>{SKILLS[s].lvl=UNLOCK[i];SKILLS[s].cls=c;});
function skillMul(rank){return 1+0.12*Math.max(0,rank-1);}
function defaultSkills(cls){const s=CLASSES[cls].skills;return{sk:{[s[0]]:1,[s[1]]:1},bar:[s[0],s[1],null,null,null,null]};}
function skillPointsTotal(lvl){return Math.max(0,lvl-1);}

// ---------- 시너지 ----------
function synergies(clsList){const has=c=>clsList.includes(c);const out=[];
  if(has('guardian'))out.push({id:'wall',n:'철벽 대형',d:'파티 받는 피해 -10%'});
  if(has('priest'))out.push({id:'grace',n:'신의 가호',d:'파티 체력 재생 두 배'});
  if(has('warrior')&&has('guardian'))out.push({id:'van',n:'선봉대',d:'근접 직업 피해 +15%'});
  if(has('archer')&&has('mage'))out.push({id:'art',n:'원거리 포격',d:'원거리 직업 피해 +15%'});
  if(has('guardian')&&has('priest')&&has('warrior')&&(has('archer')||has('mage')))out.push({id:'full',n:'완벽한 파티',d:'모든 피해 +10%, 받는 피해 -10%'});
  const cnt={};for(const c of clsList)cnt[c]=(cnt[c]||0)+1;for(const c in cnt)if(cnt[c]>=2)out.push({id:'bro_'+c,n:CLASSES[c].n+' 형제단',d:CLASSES[c].n+' 피해 +8%'});
  return out;}
function synergyMods(list,cls){let dmg=1,dr=0,regen=1;const ids=new Set(list.map(s=>s.id));
  if(ids.has('wall'))dr+=0.1;if(ids.has('grace'))regen=2;
  if(ids.has('van')&&CLASSES[cls].range==='melee')dmg*=1.15;if(ids.has('art')&&CLASSES[cls].range==='ranged')dmg*=1.15;
  if(ids.has('full')){dmg*=1.1;dr+=0.1;}if(ids.has('bro_'+cls))dmg*=1.08;return{dmg,dr,regen};}

// ---------- 몬스터 ----------
const MT={
  zombie:{n:'굶주린 시체',hp:24,dmg:6,spd:30,r:5,xp:9,cd:1.3},
  skel:{n:'해골 궁수',hp:18,dmg:5,spd:36,r:5,xp:12,cd:1.9},
  hound:{n:'지옥 사냥개',hp:22,dmg:7,spd:46,r:5,xp:14,cd:1.0},
  boss:{n:'피의 군주 모르가스',hp:520,dmg:14,spd:28,r:11,xp:400,cd:1.6},
  egg:{n:'알',hp:30,dmg:0,spd:0,r:5,xp:4,cd:99,stat:1},
  tentacle:{n:'촉수',hp:60,dmg:8,spd:0,r:6,xp:8,cd:1.8,stat:1},
  guard:{n:'수호 해골',hp:40,dmg:6,spd:32,r:5,xp:6,cd:1.3},
  clone:{n:'환영',hp:60,dmg:8,spd:30,r:11,xp:0,cd:1.6}
};
const MT_LIST=['zombie','skel','hound','boss','egg','tentacle','guard','clone'];
const WIND_LIST=['','melee','shoot','charge','slam','ring','cast'];
const PROJ_LIST=['arrow','parrow','bolt','holy','fire','orb','pierce','shieldp','poison','frostorb','holybeam','ice','web','page','void','fireb'];

// ---------- 테마 · 보스 ----------
// 5층마다 테마가 바뀌고, 51층부터는 같은 테마의 타락한 버전이 나온다. 100층은 최종 보스.
const THEMES=[
  {n:'핏빛 지하묘지',col:{d:'#1b1622',D:'#272030',k:'#0e0b12',m:'#3a3144',S:'#7b7486'},flame:null,
    mon:{zombie:'굶주린 시체',skel:'해골 궁수',hound:'지옥 사냥개'},mrm:{},
    boss:{n:'피의 군주 모르가스',pats:['slam','bloodring','summon','lungeFar'],p2:['bloodpool','inout'],brm:{}},
    lines:['망자들이 속삭인다','피 냄새가 짙어진다','뼈 부딪히는 소리가 들린다']},
  {n:'서리 무덤',col:{d:'#1a2230',D:'#243246',k:'#0b1018',m:'#3a5068',S:'#9cc4e0'},flame:{o:'c',y:'w',r:'C'},
    mon:{zombie:'얼어붙은 망자',skel:'서리 해골 궁수',hound:'설원 늑대'},mrm:{zombie:{z:'c',Z:'C',b:'n',B:'n'},skel:{w:'c',W:'C'},hound:{r:'s',R:'S',o:'c'}},
    boss:{n:'서리 여왕 이셀라',pats:['iceSpears','markSpread','cone','slam'],p2:['blizzard','circles'],brm:{r:'c',R:'C',p:'n',B:'n',b:'C'}},
    lines:['숨결이 하얗게 얼어붙는다','얼음 아래에서 무언가 움직인다','뼛속까지 시리다']},
  {n:'불타는 심연',col:{d:'#2a1010',D:'#3a1612',k:'#120606',m:'#4a1a14',S:'#a0402a'},flame:{},
    mon:{zombie:'불타는 시체',skel:'화염 해골 궁수',hound:'화염 사냥개'},mrm:{zombie:{z:'o',Z:'r',b:'R',B:'k'},skel:{w:'o',W:'r'},hound:{r:'o',R:'r',o:'y'}},
    boss:{n:'화염 군주 이그나르',pats:['cone','meteorRain','lavaLines','slam'],p2:['burnMark','lungeFar'],brm:{r:'o',R:'r',p:'R',w:'y',W:'o'}},
    lines:['발밑에서 용암이 끓는다','공기가 타들어 간다','재가 눈처럼 내린다']},
  {n:'역병 늪지',col:{d:'#1a2214',D:'#243018',k:'#0c120a',m:'#2e3a1e',S:'#6a7a3a'},flame:{o:'z',y:'w',r:'Z'},
    mon:{zombie:'역병 구울',skel:'독침 궁수',hound:'늪 도마뱀'},mrm:{zombie:{z:'z',Z:'Z',e:'y'},skel:{w:'z',W:'Z'},hound:{r:'z',R:'Z',o:'y'}},
    boss:{n:'역병 모체 불루그',pats:['poisonPools','eggs','sweep','ring'],p2:['split','poisonPools'],brm:{r:'z',R:'Z',p:'Z',w:'y',W:'g'}},
    lines:['썩은 물이 발목을 붙잡는다','숨 쉬기가 괴롭다','무언가 알을 까고 있다']},
  {n:'가라앉은 신전',col:{d:'#10262a',D:'#1a3438',k:'#081416',m:'#1e3a40',S:'#4a8a8a'},flame:{o:'c',y:'w',r:'C'},
    mon:{zombie:'익사한 사제',skel:'산호 궁수',hound:'심해 상어'},mrm:{zombie:{z:'c',Z:'C',b:'n',B:'k'},skel:{w:'P',W:'p'},hound:{r:'C',R:'n',o:'w'}},
    boss:{n:'심해의 사제 오르무스',pats:['tentacles','tide','pull','ring'],p2:['guards','circles'],brm:{r:'C',R:'n',p:'c',w:'w',W:'c'}},
    lines:['물방울이 천장에서 떨어진다','먼 곳에서 노랫소리가 들린다','바닥이 축축하다']},
  {n:'거미 굴',col:{d:'#221a18',D:'#2e2420',k:'#100c0a',m:'#3a2a24',S:'#8a7a70'},flame:{},
    mon:{zombie:'고치 속 시체',skel:'거미 사수',hound:'독거미'},mrm:{zombie:{z:'w',Z:'W',b:'W',B:'S'},skel:{w:'B',W:'k',e:'e'},hound:{r:'B',R:'k',o:'e'}},
    boss:{n:'거미 여왕 아라크네아',pats:['webShot','summon','ceiling','cone'],p2:['webPools','eggs'],brm:{r:'B',R:'k',p:'p',w:'e',W:'R'}},
    lines:['끈적한 줄이 얼굴에 걸린다','수많은 다리가 긁는 소리','고치들이 꿈틀거린다']},
  {n:'태엽 공방',col:{d:'#2a2214',D:'#3a2e1a',k:'#140f08',m:'#4a3a20',S:'#b08a3a'},flame:{o:'y',y:'w',r:'g'},
    mon:{zombie:'태엽 병사',skel:'석궁 자동인형',hound:'돌진 골렘'},mrm:{zombie:{z:'g',Z:'G',b:'S',B:'m'},skel:{w:'g',W:'G'},hound:{r:'S',R:'m',o:'y'}},
    boss:{n:'태엽 골렘 크로노스',pats:['sweep','lines','overheat','slam'],p2:['rewind','ring'],brm:{r:'g',R:'G',p:'S',w:'y',W:'g'}},
    lines:['톱니바퀴가 맞물려 돈다','증기가 뿜어져 나온다','째깍, 째깍, 째깍']},
  {n:'망령의 도서관',col:{d:'#161430',D:'#201c40',k:'#0a0818',m:'#2a2450',S:'#6a5aa0'},flame:{o:'P',y:'w',r:'p'},
    mon:{zombie:'망령 사서',skel:'저주받은 마도사',hound:'날뛰는 마도서'},mrm:{zombie:{z:'P',Z:'p',b:'n',B:'k'},skel:{w:'P',W:'p'},hound:{r:'p',R:'n',o:'y'}},
    boss:{n:'금서의 리치 말라카르',pats:['homing','pages','guards','markSpread'],p2:['clones','homing'],brm:{r:'p',R:'n',p:'P',w:'c',W:'P'}},
    lines:['책장이 스스로 넘어간다','속삭이는 글자들','잉크 냄새가 난다']},
  {n:'폭풍 첨탑',col:{d:'#22262e',D:'#2e343e',k:'#101218',m:'#4a4e5a',S:'#9aa6b8'},flame:{o:'c',y:'w',r:'y'},
    mon:{zombie:'폭풍 전사',skel:'번개 사수',hound:'바람 정령'},mrm:{zombie:{z:'s',Z:'S',b:'C',B:'n'},skel:{w:'y',W:'g'},hound:{r:'c',R:'C',o:'w'}},
    boss:{n:'폭풍 거인 토르강',pats:['stackMark','chainMark','whirlwind','slam'],p2:['collapse','lines'],brm:{r:'s',R:'S',p:'C',w:'y',W:'c'}},
    lines:['천둥이 탑을 흔든다','바람이 비명을 지른다','번개가 번뜩인다']},
  {n:'공허의 왕좌',col:{d:'#140a1e',D:'#1e1030',k:'#06020a',m:'#2a1640',S:'#6a3aa0'},flame:{o:'P',y:'w',r:'p'},
    mon:{zombie:'공허 망자',skel:'공허 사수',hound:'공허 사냥개'},mrm:{zombie:{z:'p',Z:'k',b:'k',B:'k',e:'P'},skel:{w:'p',W:'k',e:'P'},hound:{r:'p',R:'k',o:'P'}},
    boss:{n:'공허의 군주 자르곤',pats:['voidOrb','portals','lungeFar','inout'],p2:['darkness','circles'],p3:['doom'],brm:{r:'p',R:'k',p:'P',w:'P',W:'p',y:'P'}},
    lines:['빛이 빨려 들어간다','발밑이 사라지는 것 같다','무(無)가 부른다']}
];
const FINAL_BOSS={n:'심연의 심장',pats:['bloodring','iceSpears','meteorRain','poisonPools','pull','webShot','sweep','homing','chainMark','voidOrb'],p2:['circles','inout','lines'],p3:['doom'],brm:{r:'e',R:'R',p:'k',w:'y',W:'o'}};
function themeOf(floor){const i=Math.floor((Math.max(1,floor)-1)/5);return{idx:i%10,corrupt:floor>50,t:THEMES[i%10],final:floor===100};}
function bossOf(floor){const th=themeOf(floor);if(th.final)return Object.assign({final:true},FINAL_BOSS);const b=th.t.boss;return Object.assign({},b,{n:(th.corrupt?'타락한 ':'')+b.n});}
function monName(floor,type,elite,id){const th=themeOf(floor);const base=type==='boss'?bossOf(floor).n:(th.t.mon[type]||(MT[type]&&MT[type].n)||type);return (th.corrupt&&type!=='boss'?'타락한 ':'')+(elite?['광폭한 ','저주받은 ','불타는 ','굶주린 '][id%4]:'')+base;}

// ---------- 아이템 ----------
const RAR_N=['일반','마법','희귀','전설'];
const SLOTN={weapon:'무기',armor:'갑옷',ring:'반지'};
const FAMN={melee:'근접 무기',bow:'활',staff:'지팡이'};
const AFF={
  dmg:{f:v=>`+${v} 공격력`,r:(L,R)=>ri(R,1+Math.floor(L*0.6),3+Math.floor(L*1.3))},
  dmgPct:{f:v=>`+${v}% 공격력`,r:(L,R)=>ri(R,5,10+L*2)},
  crit:{f:v=>`+${v}% 치명타 확률`,r:(L,R)=>ri(R,2,Math.min(9,4+Math.floor(L/3)))},
  critDmg:{f:v=>`+${v}% 치명타 피해`,r:(L,R)=>ri(R,10,20+L*2)},
  hp:{f:v=>`+${v} 체력`,r:(L,R)=>ri(R,6+L*2,14+L*5)},
  mp:{f:v=>`+${v} 마나`,r:(L,R)=>ri(R,5+L,10+L*3)},
  armor:{f:v=>`+${v} 방어력`,r:(L,R)=>ri(R,3+L*2,8+L*4)},
  ms:{f:v=>`+${v}% 이동 속도`,r:(L,R)=>ri(R,3,8)},
  as:{f:v=>`+${v}% 공격 속도`,r:(L,R)=>ri(R,4,12)},
  ls:{f:v=>`+${v}% 생명력 흡수`,r:(L,R)=>ri(R,1,3)},
  str:{f:v=>`+${v} 힘`,r:(L,R)=>ri(R,2,4+L)},dex:{f:v=>`+${v} 민첩`,r:(L,R)=>ri(R,2,4+L)},vit:{f:v=>`+${v} 활력`,r:(L,R)=>ri(R,2,4+L)},ene:{f:v=>`+${v} 에너지`,r:(L,R)=>ri(R,2,4+L)}
};
function ri(R,a,b){return a+Math.floor(R()*(b-a+1));}
function pk(R,a){return a[Math.floor(R()*a.length)];}
const AFF_POOL={weapon:['dmg','dmgPct','crit','critDmg','as','ls','str','dex','ene'],armor:['hp','armor','mp','ms','vit','ene','dex','str'],ring:['dmg','dmgPct','crit','critDmg','hp','mp','ls','as','ms','str','dex','vit','ene']};
const PREFIX={dmg:'날카로운',dmgPct:'잔혹한',crit:'정밀한',critDmg:'치명적인',hp:'튼튼한',mp:'신비한',armor:'견고한',ms:'날렵한',as:'신속한',ls:'흡혈의',str:'강인한',dex:'민첩한',vit:'활기찬',ene:'현명한'};
const RN1=['피','재','그림자','망자','서리','심연','해골','까마귀','강철','저주'];
const RN2={weapon:['송곳니','절단기','포효','이빨','심판'],armor:['외피','수의','껍질','요새','비늘'],ring:['고리','인장','눈','약속','굴레']};
const LEG={melee:['그림자 송곳니','왕의 처형검','불타는 심장'],bow:['별을 꿰는 활','까마귀 여왕의 활','폭풍 사수'],staff:['망자의 탄식','서리 군주의 홀','새벽의 지팡이'],armor:['피의 군주의 갑주','서리 파수꾼','심연의 외투'],ring:['영원의 고리','흡혈귀의 인장','별빛 반지']};
const WEAPONS={
  melee:[{n:'단검',d:0.8,as:15,kind:'dagger'},{n:'장검',d:1,kind:'sword'},{n:'전투 도끼',d:1.2,as:-5,kind:'axe'},{n:'철퇴',d:1.1,kind:'mace'},{n:'대검',d:1.45,as:-12,kind:'great'}],
  bow:[{n:'단궁',d:0.85,as:10,kind:'shortbow'},{n:'장궁',d:1.15,as:-5,kind:'longbow'},{n:'석궁',d:1.35,as:-15,kind:'crossbow'}],
  staff:[{n:'마법봉',d:0.85,as:10,kind:'wand'},{n:'지팡이',d:1.1,kind:'staff'},{n:'성물 홀',d:1,mp:10,kind:'scepter'}]
};
const ARMORS=[{n:'가죽 갑옷',a:0.8,kind:'leather'},{n:'사슬 갑옷',a:1,kind:'chain'},{n:'판금 갑옷',a:1.3,ms:-3,kind:'plate'},{n:'룬 로브',a:0.6,mp:10,kind:'robe'}];
const GEMS=['r','c','z','p','y'];
function rollRarity(R,bonus){const x=R()*100-bonus;return x<2.5?3:x<12?2:x<42?1:0;}
function genItem(L,fam,minR,bonus,R){
  R=R||Math.random;minR=minR||0;bonus=bonus||0;
  const slot=pk(R,['weapon','weapon','armor','armor','ring']);
  let rar=Math.max(minR,rollRarity(R,bonus));if(slot==='ring'&&rar===0)rar=1;
  const it={id:rid(),slot,rar,L,base:{},aff:[]};
  if(slot==='weapon'){const b=pk(R,WEAPONS[fam]);it.fam=fam;it.kind=b.kind;it.bn=b.n;it.base.dmg=Math.max(1,Math.round((3+L*1.6)*b.d*(0.85+R()*0.3)));if(b.as)it.base.as=b.as;if(b.mp)it.base.mp=b.mp;}
  else if(slot==='armor'){const b=pk(R,ARMORS);it.kind=b.kind;it.bn=b.n;it.base.armor=Math.max(1,Math.round((4+L*3)*b.a*(0.85+R()*0.3)));if(b.ms)it.base.ms=b.ms;if(b.mp)it.base.mp=b.mp;}
  else{it.kind='ring';it.bn='반지';it.gem=pk(R,GEMS);}
  const n=rar===0?0:rar===1?ri(R,1,2):rar===2?3:4;
  const pool=AFF_POOL[slot].slice();
  for(let i=0;i<n&&pool.length;i++){const k=pool.splice(Math.floor(R()*pool.length),1)[0];let v=AFF[k].r(L,R);if(rar===3)v=Math.round(v*1.35)+1;it.aff.push({k,v});}
  it.name=rar===0?it.bn:rar===1?PREFIX[it.aff[0].k]+' '+it.bn:rar===2?pk(R,RN1)+'의 '+pk(R,RN2[slot]):pk(R,LEG[slot==='weapon'?fam:slot]);
  it.value=Math.round((5+L*3)*(1+rar*rar*1.5));
  return it;
}
function starterWeapon(fam){const b=WEAPONS[fam][fam==='melee'?1:fam==='bow'?0:1];return{id:rid(),slot:'weapon',rar:0,L:1,fam,kind:b.kind,bn:b.n,name:'낡은 '+b.n,base:{dmg:4},aff:[],value:3};}
function starterArmor(cls){const k=cls==='mage'||cls==='priest'?ARMORS[3]:ARMORS[0];return{id:rid(),slot:'armor',rar:0,L:1,kind:k.kind,bn:k.n,name:'해진 '+k.n,base:{armor:3},aff:[],value:3};}
function itemStats(it){const s={};for(const k in it.base)s[k]=(s[k]||0)+it.base[k];for(const a of it.aff)s[a.k]=(s[a.k]||0)+a.v;return s;}
function canEquip(it,cls){if(!it)return false;if(it.slot!=='weapon')return true;return CLASSES[cls].fam===it.fam;}

// ---------- 캐릭터 ----------
function xpFor(l){return Math.floor(35*Math.pow(l,1.55));}
function newChar(name,cls){const C=CLASSES[cls];return{v:1,id:rid(),name,cls,lvl:1,xp:0,pts:0,str:C.base.str,dex:C.base.dex,vit:C.base.vit,ene:C.base.ene,gold:20,pots:{hp:3,mp:2},
  eq:{weapon:starterWeapon(C.fam),armor:starterArmor(cls),ring:null},bag:new Array(20).fill(null),cps:[1],best:0,kills:0,created:Date.now(),...defaultSkills(cls),spts:0};}
function calcStats(ch){
  const C=CLASSES[ch.cls],g={};
  for(const s of['weapon','armor','ring']){const it=ch.eq[s];if(!it||!canEquip(it,ch.cls))continue;const st=itemStats(it);for(const k in st)g[k]=(g[k]||0)+st[k];}
  const str=ch.str+(g.str||0),dex=ch.dex+(g.dex||0),vit=ch.vit+(g.vit||0),ene=ch.ene+(g.ene||0);
  const S={str,dex,vit,ene};const prim=S[C.prim];
  S.maxHp=Math.round((40+vit*4+(ch.lvl-1)*6+(g.hp||0))*C.hpMul);
  S.maxMp=Math.round(20+ene*2+(ch.lvl-1)*2+(g.mp||0));
  S.dmgBase=2+(g.dmg||0);S.dmgMul=1+(prim+(g.dmgPct||0))/100;
  S.crit=Math.min(75,5+dex*0.1+(g.crit||0));S.critMul=1.5+(g.critDmg||0)/100;
  S.atkRate=C.atkRate*(1+((g.as||0)+dex*0.3)/100);
  S.armor=Math.round(((g.armor||0)+dex*0.5)*C.armorMul);
  S.ms=C.ms*(1+(g.ms||0)/100);S.ls=g.ls||0;S.spell=1+ene*0.015;S.mpRegen=1.2+ene*0.06;
  S.healPow=Math.round((8+ch.lvl*2.5+S.dmgBase*1.1)*(1+ene/100));
  const r=k=>(ch.sk&&ch.sk[k])||0;S.dr=0;
  if(r('bloodlust'))S.ls+=1.5*r('bloodlust');
  if(r('frenzy')){S.crit=Math.min(75,S.crit+1.5*r('frenzy'));S.critMul+=0.05*r('frenzy');}
  if(r('ironskin'))S.armor=Math.round(S.armor*(1+0.08*r('ironskin')));
  if(r('eagle'))S.critMul+=0.08*r('eagle');
  if(r('swift')){S.ms*=1+0.03*r('swift');S.atkRate*=1+0.02*r('swift');}
  if(r('arcane'))S.spell*=1+0.06*r('arcane');
  if(r('manaflow')){S.mpRegen*=1+0.15*r('manaflow');S.maxMp+=5*r('manaflow');}
  if(r('devotion'))S.healPow=Math.round(S.healPow*(1+0.06*r('devotion')));
  if(r('grace')){S.dr=0.02*r('grace');S.maxMp+=5*r('grace');}
  return S;
}
function dmgReduce(S,floor){return Math.min(0.75,S.armor/(S.armor+40+12*Math.max(1,floor)));}
function potPrice(lvl){return 15+lvl*3;}

// ---------- 저장 코드 ----------
function encodeSave(ch){const s=JSON.stringify(ch);const b=typeof btoa!=='undefined'?btoa(unescape(encodeURIComponent(s))):Buffer.from(s,'utf8').toString('base64');return 'BC1:'+b;}
function decodeSave(code){code=String(code||'').trim();if(!code.startsWith('BC1:'))return null;try{const b=code.slice(4);const s=typeof atob!=='undefined'?decodeURIComponent(escape(atob(b))):Buffer.from(b,'base64').toString('utf8');return JSON.parse(s);}catch(e){return null;}}
function validChar(o){return !!(o&&typeof o==='object'&&CLASSES[o.cls]&&typeof o.name==='string'&&o.eq&&Array.isArray(o.bag));}

const SH={TS,mulberry,rid,tileAt,walk,solidAt,blocked,moveEnt,los,bfs,D4,D8,genFloor,openStairs,genHub,
  CLASSES,CLASS_ORDER,SKILLS,MT,MT_LIST,WIND_LIST,PROJ_LIST,RAR_N,SLOTN,FAMN,AFF,WEAPONS,ARMORS,genItem,starterWeapon,starterArmor,itemStats,canEquip,
  THEMES,FINAL_BOSS,themeOf,bossOf,monName,xpFor,newChar,calcStats,dmgReduce,potPrice,encodeSave,decodeSave,validChar,UNLOCK,MAX_RANK,BAR_SIZE,skillMul,defaultSkills,skillPointsTotal,synergies,synergyMods};
if(typeof module!=='undefined'&&module.exports)module.exports=SH;else root.SH=SH;
})(typeof self!=='undefined'?self:this);
