// 달 없는 밤: 등불을 든 자 — 서버와 클라이언트가 함께 쓰는 게임 규칙
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
  map.secret=null;
  if(!boss){const R2=mulberry((seed^0x5ec2e7)>>>0);if(R2()<0.22){
    for(let t=0;t<60&&!map.secret;t++){const r=rooms[Math.floor(R2()*rooms.length)];if(r===start)continue;const dir=Math.floor(R2()*4),w=5,h=4;let dx,dy,sx,sy;
      if(dir===0){dx=r.x+1+Math.floor(R2()*(r.w-2));dy=r.y-1;sx=dx-2;sy=dy-h;}
      else if(dir===1){dx=r.x+1+Math.floor(R2()*(r.w-2));dy=r.y+r.h;sx=dx-2;sy=dy+1;}
      else if(dir===2){dy=r.y+1+Math.floor(R2()*(r.h-2));dx=r.x-1;sx=dx-w;sy=dy-1;}
      else{dy=r.y+1+Math.floor(R2()*(r.h-2));dx=r.x+r.w;sx=dx+1;sy=dy-1;}
      if(sx<3||sy<3||sx+w>W-3||sy+h>H-3||tiles[dy*W+dx]!==0)continue;let ok=true;
      for(let y=sy-1;y<=sy+h&&ok;y++)for(let x=sx-1;x<=sx+w;x++){if(x===dx&&y===dy)continue;const inside=x>=sx&&x<sx+w&&y>=sy&&y<sy+h;if(tiles[y*W+x]!==0&&!(inside&&false)){ok=false;break;}}
      if(!ok)continue;
      for(let y=sy;y<sy+h;y++)for(let x=sx;x<sx+w;x++)tiles[y*W+x]=1;tiles[dy*W+dx]=4;
      map.secret={door:dy*W+dx,room:{x:sx,y:sy,w,h},chests:[{x:(sx+1)*TS+8,y:(sy+1)*TS+8},{x:(sx+w-2)*TS+8,y:(sy+h-2)*TS+8}]};}}}
  return map;
}
function openStairs(map){map.tiles[map.stairsIdx]=2;}

// ---------- 마을 (던전 입구 광장) ----------
// ---------- 특성 나무 (직업마다 3갈래 × 3단계) ----------
const TN={dmgPct:v=>`공격력 +${v}%`,crit:v=>`치명타 확률 +${v}%`,critDmg:v=>`치명타 피해 +${v}%`,as:v=>`공격 속도 +${v}%`,ms:v=>`이동 속도 +${v}%`,ls:v=>`생명력 흡수 +${v}%`,hpPct:v=>`최대 체력 +${v}%`,mpPct:v=>`최대 마나 +${v}%`,armorPct:v=>`방어력 +${v}%`,dr:v=>`받는 피해 -${v}%`,cdr:v=>`스킬 재사용 대기 -${v}%`,healPct:v=>`치유력 +${v}%`,spellPct:v=>`주문 피해 +${v}%`,regen:v=>`체력 재생 +${v}%`,holy:v=>`신성력 획득 +${v}%`,mpRegen:v=>`마나 재생 +${v}%`};
const tn=(id,n,k,v)=>({id,n,k,v,max:5});
const TALENTS={
  warrior:[{b:'학살자',n:[tn('w1','무기 숙련','dmgPct',3),tn('w2','처형자의 눈','critDmg',8),tn('w3','광란의 칼날','as',3)]},{b:'불굴',n:[tn('w4','강철 피부','hpPct',4),tn('w5','버티기','dr',2),tn('w6','피의 갈증','ls',0.5)]},{b:'돌격대장',n:[tn('w7','질주','ms',2),tn('w8','전투 감각','cdr',3),tn('w9','급소 찌르기','crit',1.5)]}],
  guardian:[{b:'성벽',n:[tn('g1','두꺼운 갑옷','armorPct',6),tn('g2','굳건함','dr',2),tn('g3','거인의 체력','hpPct',4)]},{b:'응징',n:[tn('g4','방패 강타','dmgPct',4),tn('g5','약점 간파','critDmg',8),tn('g6','연속 타격','as',3)]},{b:'수호 서약',n:[tn('g7','회복의 맹세','regen',15),tn('g8','숙련된 방어','cdr',3),tn('g9','신성한 보호','healPct',5)]}],
  archer:[{b:'저격수',n:[tn('a1','정밀 사격','critDmg',10),tn('a2','매의 눈','crit',1.5),tn('a3','관통 화살','dmgPct',3)]},{b:'사냥꾼',n:[tn('a4','속사','as',3),tn('a5','바람 걸음','ms',2),tn('a6','포식자','ls',0.5)]},{b:'생존술',n:[tn('a7','질긴 몸','hpPct',4),tn('a8','몸 낮추기','dr',2),tn('a9','사냥 본능','cdr',3)]}],
  mage:[{b:'파괴',n:[tn('m1','화염 친화','spellPct',4),tn('m2','불안정한 마력','critDmg',8),tn('m3','집중','crit',1.5)]},{b:'비전',n:[tn('m4','마력 저장소','mpPct',6),tn('m5','시간 왜곡','cdr',3),tn('m6','마나 순환','mpRegen',10)]},{b:'마법 방벽',n:[tn('m7','비전 갑옷','armorPct',8),tn('m8','마력 보호막','dr',2),tn('m9','생명 흡수술','hpPct',4)]}],
  knight:[{b:'성검',n:[tn('k1','성검 숙련','dmgPct',4),tn('k2','빛의 일격','critDmg',10),tn('k3','검무','as',3)]},{b:'신성력',n:[tn('k4','깊은 신앙','holy',10),tn('k5','빛의 권능','crit',1.5),tn('k6','찬란한 심판','cdr',3)]},{b:'섬광',n:[tn('k7','섬광 걸음','ms',2),tn('k8','잔광','ls',0.6),tn('k9','빛의 보호','dr',2)]}],
  priest:[{b:'신성',n:[tn('p1','축복의 손','healPct',5),tn('p2','빛의 권능','spellPct',3),tn('p3','기도의 시간','cdr',3)]},{b:'응징자',n:[tn('p4','심판','dmgPct',4),tn('p5','성스러운 분노','crit',1.5),tn('p6','천벌','critDmg',8)]},{b:'인내',n:[tn('p7','순교자의 몸','hpPct',4),tn('p8','깊은 신앙','mpPct',6),tn('p9','고행','dr',2)]}]};
const TAL_NEED=[0,5,10];
const LVL_CAP=50;
function talentPts(lvl){return Math.min(20,Math.max(0,Math.floor(((lvl|0)-8)/2)));}
function talentSpent(ch){let n=0;if(ch.tal)for(const k in ch.tal)n+=ch.tal[k]|0;return n;}
function talentSums(ch){const T={};const tr=TALENTS[ch.cls];if(!tr||!ch.tal)return T;for(const br of tr)for(const nd of br.n){const r=ch.tal[nd.id]|0;if(r)T[nd.k]=(T[nd.k]||0)+nd.v*r;}return T;}
function branchSpent(ch,bi){const br=TALENTS[ch.cls][bi];let n=0;for(const nd of br.n)n+=(ch.tal&&ch.tal[nd.id])|0;return n;}
function canTalent(ch,id){const tr=TALENTS[ch.cls];for(let bi=0;bi<3;bi++){const k=tr[bi].n.findIndex(x=>x.id===id);if(k<0)continue;const nd=tr[bi].n[k];const r=(ch.tal&&ch.tal[id])|0;if(r>=nd.max)return '이미 최대입니다';if(talentSpent(ch)>=talentPts(ch.lvl))return '특성 포인트가 없습니다';
  let before=0;for(let j=0;j<k;j++)before+=(ch.tal&&ch.tal[tr[bi].n[j].id])|0;if(before<TAL_NEED[k])return `이 갈래 윗단계에 ${TAL_NEED[k]}포인트가 필요합니다`;return null;}return '없는 특성입니다';}
// ---------- 업적 · 칭호 · 도감 · 펫 ----------
const PETS=[{id:'slime',n:'꼬마 슬라임'},{id:'bat',n:'아기 박쥐'},{id:'crow',n:'해골 까마귀'},{id:'cat',n:'유령 고양이'},{id:'fox',n:'여우 정령'},{id:'dragon',n:'아기 용'}];
const ACH=[
  {id:'k100',n:'첫 사냥',d:'몬스터 100마리 처치',t:'사냥꾼',c:ch=>ch.kills,need:100},
  {id:'k1000',n:'학살',d:'몬스터 1,000마리 처치',t:'학살자',c:ch=>ch.kills,need:1000,pet:'bat'},
  {id:'k5000',n:'끝없는 전투',d:'몬스터 5,000마리 처치',t:'끝없는 칼날',c:ch=>ch.kills,need:5000},
  {id:'b1',n:'첫 보스',d:'보스 1마리 처치',t:'보스 사냥꾼',c:ch=>ch.bossK,need:1},
  {id:'b10',n:'군주 살해',d:'보스 10마리 처치',t:'군주 살해자',c:ch=>ch.bossK,need:10,pet:'crow'},
  {id:'b50',n:'심연의 공포',d:'보스 50마리 처치',t:'심연의 공포',c:ch=>ch.bossK,need:50},
  {id:'f10',n:'첫걸음',d:'지하 10층 도달',t:'초보 탐험가',c:ch=>ch.best,need:10},
  {id:'f25',n:'깊은 곳으로',d:'지하 25층 도달',t:'심층 탐험가',c:ch=>ch.best,need:25},
  {id:'f50',n:'타락의 문턱',d:'지하 50층 도달',t:'타락을 본 자',c:ch=>ch.best,need:50,pet:'dragon'},
  {id:'f100',n:'심연 정복',d:'지하 100층 정복',t:'심연 정복자',c:ch=>ch.cleared|0,need:1},
  {id:'lv30',n:'성장',d:'레벨 30 달성',t:'숙련자',c:ch=>ch.lvl,need:30},
  {id:'lv60',n:'베테랑',d:'레벨 60 달성',t:'베테랑',c:ch=>ch.lvl,need:60},
  {id:'fish10',n:'낚시 입문',d:'물고기 10마리 낚기',t:'낚시꾼',c:ch=>ch.fishN|0,need:10,pet:'slime'},
  {id:'fish100',n:'연못의 주인',d:'물고기 100마리 낚기',t:'연못의 주인',c:ch=>ch.fishN|0,need:100},
  {id:'pvp1',n:'첫 승리',d:'결투 1승',t:'결투가',c:ch=>ch.pvp?ch.pvp.w:0,need:1},
  {id:'pvp10',n:'투기장의 별',d:'결투 10승',t:'투기장의 별',c:ch=>ch.pvp?ch.pvp.w:0,need:10},
  {id:'up10',n:'전설의 망치',d:'장비 +10 강화 성공',t:'전설의 대장장이',c:ch=>ch.st&&ch.st.maxUp|0,need:10},
  {id:'leg1',n:'전설과의 만남',d:'전설 장비 줍기',t:'전설의 주인',c:ch=>ch.st&&ch.st.leg|0,need:1},
  {id:'gob5',n:'보물 사냥',d:'보물 고블린 5마리 처치',t:'보물 사냥꾼',c:ch=>ch.st&&ch.st.gob|0,need:5,pet:'fox'},
  {id:'alt3',n:'저주 파괴',d:'저주받은 제단 3번 정화',t:'저주 파괴자',c:ch=>ch.st&&ch.st.alt|0,need:3},
  {id:'sec3',n:'비밀 탐험',d:'비밀방 3곳 발견',t:'비밀 탐험가',c:ch=>ch.st&&ch.st.sec|0,need:3},
  {id:'bty10',n:'현상금',d:'의뢰 10개 완료',t:'현상금 사냥꾼',c:ch=>ch.st&&ch.st.bty|0,need:10},
  {id:'gam20',n:'운명의 주사위',d:'도박 20번',t:'도박꾼',c:ch=>ch.st&&ch.st.gam|0,need:20},
  {id:'cdx30',n:'박물학',d:'도감 30종 채우기',t:'박물학자',c:ch=>(ch.cdx||[]).length,need:30,pet:'cat'}];
let _cdx=null;function codexList(){if(_cdx)return _cdx;const L=[];THEMES.forEach((th,i)=>{for(const t of['zombie','skel','hound'])L.push({k:`m:${i}:${t}`,n:th.mon[t],g:'몬스터'});});THEMES.forEach((th,i)=>L.push({k:`b:${i}`,n:th.boss.n,g:'보스'}));L.push({k:'b:fin',n:FINAL_BOSS.n,g:'보스'});L.push({k:'gob',n:'보물 고블린',g:'몬스터'});
  for(const k in LEG)for(const n of LEG[k])L.push({k:'l:'+n,n,g:'전설 장비'});for(const f of FISH)L.push({k:'f:'+f.id,n:f.n,g:'물고기'});return _cdx=L;}
function titleOf(id){const a=ACH.find(x=>x.id===id);return a?a.t:null;}
// ---------- 이야기: 알드릭의 일지 (테마마다 한 장, 3·8·13…98층) ----------
const LORE=[
 ['첫째 장','흑월이 뜬 지 백 일째. 해는 여전히 떠오르지 않는다.','이 끝나지 않는 밤은 지하묘지 아래에서 시작되었다고 한다.','누이 엘라가 마지막으로 향한 곳도 여기다. 반드시 데려오겠다.'],
 ['둘째 장','숨이 얼어붙는다. 여기 묻힌 자들은 추위 속에서도 잠들지 못한다.','얼음 속에서 엘라의 머리띠를 찾았다. 그녀는 더 아래로 갔다.','서리 여왕은 "심장의 부름"이라는 말을 중얼거렸다.'],
 ['셋째 장','열기에 갑옷이 달아오른다. 불길 속 해골들이 누군가를 찬양한다.','"심연의 심장이 깨어나면 모든 피가 그분께 돌아가리라."','흑월은 저주가 아니었다. 부름이었다.'],
 ['넷째 장','늪이 숨을 쉰다. 구울들이 무언가를 제물처럼 끌고 간다.','동료 기사 브란이 이곳에서 쓰러졌다. 그의 검을 대신 챙긴다.','끝까지 가야 할 이유가 하나 늘었다.'],
 ['다섯째 장','물에 잠긴 신전. 이곳의 사제들은 스스로 가라앉았다고 한다.','벽화 속 붉은 심장 아래 사람들이 무릎 꿇고 있다.','그중 한 명의 얼굴이 엘라를 닮았다. 착각이겠지.'],
 ['여섯째 장','고치마다 사람이 들어 있다. 아직 숨이 붙은 자도 있었다.','구해 낸 소년이 말했다. "흰 옷 입은 누나가 노래를 부르며 더 아래로 갔어요."','엘라는 노래를 좋아했다.'],
 ['일곱째 장','누군가 이곳에서 태엽과 톱니로 심장을 "만들려" 했다.','설계도 여백의 글씨: "진짜 심장은 피로만 뛴다."','이 필체는… 기사단장의 것이다.'],
 ['여덟째 장','금서 한 권이 내 이름을 불렀다.','"심장은 문이다. 백 개의 층은 백 개의 자물쇠. 수호자가 쓰러질 때마다 하나씩 풀린다."','…우리가 내려갈수록 그것을 깨우고 있는 건가?'],
 ['아홉째 장','지하인데 번개가 친다. 이 탑은 아래로 솟아 있다.','토르강이 쓰러지자 벽 너머에서 심장 뛰는 소리가 들렸다.','쿵. 쿵. 내 심장도 그 박자를 따라가기 시작했다.'],
 ['열째 장','왕좌는 비어 있어야 했다.','공허 속에서 엘라가 불렀다. "오빠, 여기 따뜻해. 이리 와."','나는 칼을 들었다. 그리고… 기억이 끊겼다.'],
 ['열한째 장 · 붉은 잉크','다시 첫 번째 방이다. 하지만 모든 것이 붉다.','모르가스는 죽지 않았다. 심장이 그를 되살렸다.','손이 떨려 글씨가 비뚤다. 잉크에서 피 냄새가 난다.'],
 ['열두째 장','서리가 녹지 않는다. 대신 피가 언다.','나는 더 이상 추위를 느끼지 않는다.','엘라의 머리띠를 꺼내 봤다. 얼굴이 잘 기억나지 않는다.'],
 ['열셋째 장','불길 속 해골들이 나를 보고 고개를 숙였다.','"돌아오셨군요, 사도여." 나는 사도가 아니다. 나는…','나는 누구였더라.'],
 ['열넷째 장','브란의 검이 무겁다. 브란이… 누구였지?','늪이 내 발을 붙잡지 않는다. 나를 알아보는 것처럼.','이 일지를 읽는 자여. 나를 만나면 망설이지 마라.'],
 ['열다섯째 장','신전 벽화를 다시 봤다. 무릎 꿇은 사람들 사이에 나도 있었다.','언제 그려진 걸까. 백 년 전? 어제?','심장은 시간을 먹는다.'],
 ['열여섯째 장','고치 속 소년을 다시 찾아갔다. 소년은 없었다.','작은 고치에 내 글씨가 적혀 있었다. "흰 옷 입은 누나는 심장이 되었다."','아니야. 아니야.'],
 ['열일곱째 장','기사단장의 설계도를 끝까지 읽었다.','그는 밤을 끝낼 심장을 만들려고 엘라를 바쳤다. 흑월은 그 대가였다.','용서하지 않는다. 그도 이 아래 어딘가에 있다.'],
 ['열여덟째 장','금서가 마지막 쪽을 보여 주었다.','"심장을 멈추는 방법은 하나. 심장이 사랑했던 것이 그것을 베는 것."','엘라가 사랑했던 것. 노래, 봄꽃, 그리고… 나.'],
 ['열아홉째 장','번개 속 거울에 비친 내 눈이 붉게 빛났다.','내가 나를 잃기 전에 백 층에 닿아야 한다.','이 일지를 발견한 모험가여, 부디 끝까지 가 다오.'],
 ['마지막 장','문 너머에서 노랫소리가 들린다. 엘라의 목소리다.','나는 들어가지 못했다. 손이 이미 심장의 것이 되었다.','심장을 베는 자여, 엘라에게 전해 줘. 오빠가 끝까지 왔다고.']];
function loreFloor(i){return i*5+3;}
const BOSS_LINES=[['피가… 신선한 피가 내려왔구나!','심장이여… 내 피를… 받아 주소서…'],['여기선 아무도 따뜻할 수 없다.','드디어… 녹는구나…'],['재가 되어 심장의 불씨가 되어라!','불꽃은 꺼져도… 심장은 타오른다…'],['내 아이들이 배고프단다. 너를 먹여야겠구나.','꾸르륵… 아이들아… 흩어져라…'],['깊은 곳으로 가라앉아라. 거기서 심장이 기다린다.','물이… 빠져나간다…'],
 ['좋은 고치가 되겠구나, 작은 벌레야.','내 실이… 끊어지다니…'],['시간 오차 발견. 제거를 시작한다.','태엽… 정지… 설계자님… 죄송…'],['네 이름은 이미 금서에 적혀 있다.','마지막 쪽이… 찢어지는구나…'],['천둥이 네 심장을 멈추리라!','하늘도 땅도 아닌 곳에서… 쓰러지다니…'],['공허가 너를 삼킨다. 아무것도 남지 않으리라.','텅 빈 곳으로… 돌아간다…']];
const FINAL_LINES=['왔구나… 여기까지. 이리 와, 여기 따뜻해.','고마워… 이제… 다시 노래할 수 있어…'];
// ---------- 용병 ----------
const MERCS={w:{n:'방패병',cls:'guardian',hp:1.0,mult:0.5,d:'적의 공격을 대신 받아 주는 근접 용병'},a:{n:'궁수',cls:'archer',hp:0.6,mult:0.42,d:'멀리서 화살을 쏘는 원거리 용병'},p:{n:'사제',cls:'priest',hp:0.7,mult:0.22,d:'체력이 줄면 치유해 주는 용병'}};
function mercCost(lvl){return 150+(lvl|0)*25;}
// ---------- 카운터 전용 스킬 (1레벨부터, R키) ----------
const CTR_SKILL={warrior:{n:'저지 베기',d:'앞으로 짧게 파고들며 베어 180% 피해'},guardian:{n:'방패 밀치기',d:'방패로 밀쳐 140% 피해와 짧은 기절'},archer:{n:'견제 사격',d:'아주 빠른 화살 한 발, 170% 피해'},mage:{n:'마력 충격',d:'순식간에 날아가는 마력탄, 180% 피해'},priest:{n:'신성한 일격',d:'빛의 탄환을 쏘아 160% 피해'},knight:{n:'섬광 반격',d:'빛처럼 파고들며 베어 220% 피해 · 신성력 +15'}};
const CTR_CD=6;
// ---------- 레이드 ----------
const RAIDS=[{id:'bell',n:'잊힌 종탑',boss:'종지기 그레고르',lvl:20,ready:1},{id:'mirror',n:'거울 미궁',boss:'쌍둥이 마녀 리라와 노라',lvl:30,ready:1},{id:'clock',n:'태엽 심장 공장',boss:'기사단장 발렌',lvl:40,ready:1},{id:'moon',n:'흑월의 왕좌',boss:'흑왕 카르나스',lvl:50,ready:1}];
function genRaid(id,seed){const W=40,H=44,tiles=new Uint8Array(W*H);const map={w:W,h:H,tiles,boss:true,floor:1,raid:id};
  const rect=(x0,y0,x1,y1,v)=>{for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)tiles[y*W+x]=v;};
  rect(5,4,34,20,1);rect(18,21,21,27,1);rect(9,28,30,40,1);
  // 관문 문 (퍼즐을 풀면 열림)
  for(let x=18;x<=21;x++)tiles[24*W+x]=5;
  const gate={x:9,y:28,w:22,h:13,cx:19,cy:34},boss={x:5,y:4,w:30,h:17,cx:19,cy:11};map.rooms=[gate,boss];map.start=gate;map.bossRoom=boss;map.stairsIdx=-1;map.secret=null;
  map.door=[24*W+18,24*W+19,24*W+20,24*W+21];map.startPt={x:19*TS+8,y:38*TS+8};map.bossPt={x:19*TS+8,y:9*TS+8};map.bossEntry={x:19*TS+8,y:19*TS+8};
  map.torches=[];for(const x of[7,12,19,26,32])map.torches.push({x:x*TS+8,y:3*TS+4,ph:x});for(const x of[11,19,28])map.torches.push({x:x*TS+8,y:27*TS+4,ph:x*2});
  if(id==='bell'){map.bells=[{x:11*TS+8,y:30*TS+8,c:0},{x:27*TS+8,y:30*TS+8,c:1},{x:11*TS+8,y:39*TS+8,c:2},{x:27*TS+8,y:39*TS+8,c:3}];map.bigBell={x:19*TS+8,y:33*TS+8};
    map.bossBells=[{x:7*TS+8,y:6*TS+8,c:0},{x:32*TS+8,y:6*TS+8,c:1},{x:7*TS+8,y:19*TS+8,c:2},{x:32*TS+8,y:19*TS+8,c:3}];
    for(const b of map.bells.concat([map.bigBell]))tiles[Math.floor(b.y/TS)*W+Math.floor(b.x/TS)]=3;}
  return map;}
function walkRaid(){}
// ---------- 결투장 ----------
function genArena(seed){const R=mulberry(seed);const W=32,H=22,tiles=new Uint8Array(W*H);const map={w:W,h:H,tiles,boss:false,floor:1,arena:true};
  for(let y=4;y<=17;y++)for(let x=3;x<=28;x++)tiles[y*W+x]=1;
  const pil=[[9,7],[21,7],[9,13],[21,13]];if(R()<0.5)pil.push([15,10]);for(const[x,y]of pil){tiles[y*W+x]=0;tiles[y*W+x+1]=0;tiles[(y+1)*W+x]=0;tiles[(y+1)*W+x+1]=0;}
  const room={x:3,y:4,w:26,h:14,cx:16,cy:11};map.rooms=[room];map.start=room;map.bossRoom=null;map.stairsIdx=-1;map.secret=null;
  map.torches=[];for(const x of[5,10,16,22,27])map.torches.push({x:x*TS+8,y:3*TS+4,ph:x});
  map.spawns=[{x:6*TS+8,y:11*TS+8},{x:26*TS+8,y:11*TS+8}];return map;}
// ---------- 낚시 ----------
const FISH=[{id:'f0',n:'진흙 메기',r:0,v:8},{id:'f1',n:'비늘 붕어',r:0,v:10},{id:'f2',n:'동굴 송사리',r:0,v:6},{id:'f3',n:'늪 장어',r:0,v:12},
  {id:'f4',n:'은빛 송어',r:1,v:30},{id:'f5',n:'피눈 농어',r:1,v:36},{id:'f6',n:'얼음 연어',r:1,v:40},
  {id:'f7',n:'반짝이는 조개',r:2,v:60,gem:1},{id:'f8',n:'마력 해파리',r:2,v:70,dust:2},{id:'f9',n:'유령 잉어',r:2,v:120},
  {id:'f10',n:'심연의 아귀',r:3,v:400,dust:4},{id:'f11',n:'황금 비늘 용어',r:3,v:600,gem:2}];
const FISH_RN=['일반','고급','희귀','전설'],FISH_RC=['#e6dcc3','#7aa2ff','#ffd35a','#ff8a1f'];
function rollFish(R,lvl){R=R||Math.random;const x=R()*100;const b=Math.min(4,(lvl|0)/25);const r=x<2+b?3:x<12+b*2?2:x<40?1:0;const pool=FISH.filter(f=>f.r===r);return pool[Math.floor(R()*pool.length)];}
// ---------- 염색 · 감정표현 ----------
const DYES=[{n:'기본'},{n:'핏빛',h:0},{n:'황금',h:44},{n:'숲',h:110},{n:'청록',h:172},{n:'바다',h:212},{n:'자수정',h:276},{n:'장미',h:330},{n:'칠흑',dark:1},{n:'설원',light:1}];
const DYE_COST=800;
const EMOTES=['인사','웃음','하트','화남','슬픔','좋아','물음표','졸림'];
// 로비 그림 크기 [폭, 높이] — 발밑(아래 가운데)이 좌표. 발자국(fp)=[반폭 여백, 깊이]만큼 못 지나간다
const LOBBY_SZ={wardrobe:[22,32],aboard:[23,36],vault:[94,84],tent:[80,81],stall:[84,78],gate:[92,74],tree:[30,50],lamp:[14,42],board:[23,36],well:[24,36],dummy:[17,30],cart:[23,22],grave:[13,22],bench:[20,20],logs:[14,18],planter:[15,16],fire:[13,16]};
const LOBBY_FP={wardrobe:[3,8],aboard:[8,6],vault:[8,38],tent:[8,34],stall:[6,32],gate:[4,44],tree:[11,8],lamp:[5,5],board:[8,6],well:[9,14],cart:[8,8],grave:[5,6],bench:[7,6],logs:[5,6],planter:[5,6],fire:[5,6]};
function genHub(){
  const W=60,H=42,tiles=new Uint8Array(W*H);const map={w:W,h:H,tiles,hub:true,floor:0};
  const rect=(x0,y0,x1,y1,v)=>{for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)tiles[y*W+x]=v;};
  rect(2,8,57,39,1);rect(26,2,33,7,1);
  const P=[],add=(t,x,y)=>{P.push({t,x,y});};
  add('gate',480,112);
  add('forge',150,178);add('vault',812,178);add('stall',150,322);add('tent',812,322);
  add('board',392,244);
  add('fountain',480,272);
  // 훈련장(남동): 허수아비는 서버 몬스터로 그린다
  add('logs',700,510);add('logs',870,600);add('planter',720,600);add('bench',860,500);
  // 쉼터(남서)
  add('well',180,520);add('fire',260,560);add('bench',230,590);add('bench',290,590);add('logs',120,600);
  // 묘지(북동 구석)
  add('grave',900,230);add('grave',924,244);add('grave',900,262);add('tree',940,220);
  // 나무·가로등·수레
  add('tree',60,190);add('tree',50,600);add('tree',930,420);add('tree',620,640);add('tree',330,640);
  for(const[x,y]of[[400,130],[560,130],[300,300],[660,300],[300,470],[690,470],[540,450]])add('lamp',x,y);
  add('cart',236,300);add('planter',92,322);add('planter',256,190);add('logs',236,160);
  add('wardrobe',740,200);add('aboard',620,500);
  map.props=P;
  for(const p of P){const fp=LOBBY_FP[p.t],sz=LOBBY_SZ[p.t];if(p.t==='fountain'){rect(29,16,30,16,3);continue;}if(!fp||!sz)continue;
    const x0=Math.floor((p.x-sz[0]/2+fp[0])/TS),x1=Math.floor((p.x+sz[0]/2-fp[0]-1)/TS),y0=Math.floor((p.y-fp[1])/TS),y1=Math.floor((p.y-2)/TS);
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)if(x>=0&&y>=0&&x<W&&y<H&&tiles[y*W+x]!==0)tiles[y*W+x]=3;}
  // 문 위쪽은 막힌 벽 대신 돌바닥처럼 보이게(못 지나감)
  for(let y=2;y<=6;y++)for(let x=26;x<=33;x++)tiles[y*W+x]=3;
  // 바닥 종류: 0 돌길, 1 흙 (그림만)
  const g=new Uint8Array(W*H);for(let y=0;y<H;y++)for(let x=0;x<W;x++){const h=((x*73856093)^(y*19349663))>>>0;const n=(h%7)/7;
    const road=Math.abs(x-30)<=4+n*1.5||Math.abs(y-20)<=3+n*1.5||(y<=13&&(Math.abs(x-9)<=6+n||Math.abs(x-51)<=6+n))||(y>=14&&y<=22&&(Math.abs(x-9)<=6+n||Math.abs(x-51)<=6+n))||Math.hypot(x-30,y-17)<9+n*2;
    g[y*W+x]=road?0:1;}
  // 연못 (낚시터)
  const pond={cx:430,cy:584,rx:66,ry:30};for(let y=0;y<H;y++)for(let x=0;x<W;x++){const px=x*TS+8,py=y*TS+8;const d=((px-pond.cx)/pond.rx)**2+((py-pond.cy)/pond.ry)**2;if(d<=1){g[y*W+x]=2;tiles[y*W+x]=3;}else if(d<=1.5&&g[y*W+x]===0)g[y*W+x]=1;}
  map.ground=g;map.pond=pond;map.fish={x:430,y:540};map.merc={x:566,y:176};map.arena={x:620,y:510};map.tailor={x:742,y:212};map.raid={x:320,y:188};map.raidStone={x:320,y:176};for(const tx of[19,20])tiles[10*W+tx]=3;
  map.portal={x:480,y:100};map.merchant={x:206,y:330};map.spawn={x:480,y:356};map.board={x:392,y:252};
  map.forge={x:150,y:190};map.vault={x:812,y:190};map.tent={x:812,y:334};map.dummies=[{x:760,y:548},{x:820,y:548}];
  map.torches=[];
  map.stairsIdx=-1;map.start={cx:30,cy:22};
  return map;
}

// ---------- 직업 ----------
const CLASSES={
  warrior:{n:'전사',role:'근거리 딜러',fam:'melee',prim:'str',range:'melee',base:{str:16,dex:10,vit:12,ene:6},hpMul:1.2,armorMul:1.1,atkRate:1.35,ms:80,
    basic:{kind:'melee',mult:1.2},skills:['whirl','charge','warcry','cleave','bloodlust','leap','rend','berserk','frenzy','bladestorm','execute','earthsplit','rageleap','shatter','endless'],ults:['ragnarok','wargod'],
    desc:'강력한 근접 공격과 돌진으로 적진을 가르는 딜러'},
  guardian:{n:'수호자',role:'탱커',fam:'melee',prim:'str',range:'melee',base:{str:12,dex:8,vit:18,ene:6},hpMul:1.4,armorMul:1.7,atkRate:1.1,ms:76,
    basic:{kind:'melee',mult:0.8},skills:['taunt','bash','bulwark','hook','ironskin','shieldwall','consecrate','slam','undying','rally','shieldthrow','bastion','shieldrush','judgechain','willpower'],ults:['aegisdome','judgehammer'],
    desc:'적의 공격을 끌어당기고 파티를 지키는 방패. 적은 수호자를 먼저 노린다'},
  archer:{n:'궁수',role:'원거리 딜러',fam:'bow',prim:'dex',range:'ranged',base:{str:8,dex:18,vit:10,ene:8},hpMul:0.85,armorMul:0.9,atkRate:1.45,ms:82,
    basic:{kind:'shot',proj:1,speed:280,mult:0.9},skills:['multishot','pierce','rain','vault','eagle','trap','poison','volley','swift','sniper','barrage','starfall','shadowshot','galearrow','instinct'],ults:['skyrain','dragonarrow'],
    desc:'멀리서 화살을 퍼붓는 딜러. 체력이 낮아 위치 선정이 중요하다'},
  mage:{n:'마법사',role:'원거리 광역',fam:'staff',prim:'ene',range:'ranged',base:{str:5,dex:10,vit:9,ene:20},hpMul:0.8,armorMul:0.8,atkRate:1.2,ms:78,
    basic:{kind:'shot',proj:2,speed:230,mult:0.85},skills:['fireball','nova','chain','blink','arcane','meteor','frostorb','flamewall','manaflow','blizzard','thunder','armageddon','overload','blackhole','resonance'],ults:['apocalypse','absolutezero'],
    desc:'화염과 얼음, 번개로 적 무리를 쓸어버리는 광역 딜러'},
  priest:{n:'사제',role:'힐러',fam:'staff',prim:'ene',range:'ranged',base:{str:6,dex:9,vit:13,ene:18},hpMul:0.95,armorMul:1,atkRate:1.1,ms:78,
    basic:{kind:'shot',proj:3,speed:230,mult:0.7},skills:['heal','smite','shield','sanctuary','devotion','renew','purify','holyfire','grace','blessing','lightpillar','miracle','lightchain','holyburst','saint'],ults:['angel','divinejudge'],
    desc:'파티를 치유하고 보호막을 씌운다. 쓰러진 동료를 두 배 빨리 일으킨다'},
  knight:{n:'빛의 기사',role:'근거리 딜러 · 히든',fam:'melee',prim:'str',range:'melee',base:{str:17,dex:12,vit:12,ene:7},hpMul:1.15,armorMul:1.05,atkRate:1.45,ms:84,hidden:1,
    basic:{kind:'melee',mult:1.35},skills:['lslash','flashdash','lmark','crossslash','holyblade','skyfall','bladedance','dawnawaken','dawnward','judgment','lastflash','lightstorm','radiantspear','excalibur','dawnoath'],ults:['dawnblade','heavendance'],
    desc:'엘라에게 새벽의 맹세를 받은 기사. 빛의 검으로 신성력을 모아 한 번에 쏟아내는 최강의 딜러'}
};
// 직업별 피해 보정 (허수아비 기준: 원거리 딜러 100 · 전사 115 · 빛의 기사 125 · 수호자 55 · 사제 45)
// 레벨 10·20·35·50 기준값 사이를 이어서 쓴다 (허수아비 측정으로 맞춤)
const DK_LV=[10,20,27,35,42,50];
const CLASS_DK={warrior:[1.14,1.331,1.519,1.62,1.689,1.565],guardian:[1.37,1.193,1.70,1.947,1.863,1.767],archer:[0.936,1.012,1.029,0.983,1.132,1.036],mage:[1.12,1.037,0.899,0.80,0.589,0.488],priest:[1.135,0.914,1.311,1.078,0.834,0.755],knight:[0.747,0.794,0.768,0.871,0.772,0.672]};
function classDk(cls,lvl){const d=CLASS_DK[cls];if(!d)return 1;lvl=lvl|0;if(lvl<=DK_LV[0])return d[0];for(let i=1;i<DK_LV.length;i++)if(lvl<=DK_LV[i]){const t=(lvl-DK_LV[i-1])/(DK_LV[i]-DK_LV[i-1]);return d[i-1]+(d[i]-d[i-1])*t;}return d[d.length-1];}
const CLASS_ORDER=['warrior','guardian','archer','mage','priest','knight'];
const UNLOCK=[1,1,3,5,8,11,14,18,22,26,30,35,38,42,46];const ULT_LVL=20;
// 궁극기 위력: 20레벨 55% → 50레벨 100%
function ultPow(lvl){return Math.min(1,0.55+0.45*Math.max(0,(lvl|0)-20)/30);}
const MAX_RANK=10,BAR_SIZE=6,BAG_N=40;/* 인벤토리 40칸(20칸 × 2쪽) */
// lvl: 해금 레벨, pas: 패시브, per: 등급당 효과 설명
const SKILLS={
  // 전사
  whirl:{n:'회전베기',mp:8,cd:1.2,desc:'주변의 모든 적에게 무기 피해 160%'},
  charge:{ctr:1,n:'돌진 베기',mp:10,cd:4,desc:'커서 방향으로 돌진하며 경로의 적에게 180% 피해'},
  warcry:{n:'전쟁의 함성',mp:15,cd:14,desc:'주변 파티원의 피해 +25% (8초)'},
  cleave:{n:'대지 가르기',mp:14,cd:6,desc:'전방 부채꼴에 250% 피해, 1.2초 기절'},
  bloodlust:{n:'피의 갈증',pas:1,desc:'생명력 흡수',per:'등급당 생명력 흡수 +1.5%'},
  leap:{ctr:1,n:'도약 강타',mp:16,cd:7,desc:'커서 위치로 뛰어올라 착지 지점에 200% 피해와 1초 기절'},
  rend:{n:'출혈 베기',mp:12,cd:4,desc:'전방의 적을 베어 80% 피해, 5초간 출혈 250%'},
  berserk:{n:'광전사',mp:20,cd:20,desc:'8초간 공격 속도 +40%, 피해 +20%'},
  frenzy:{n:'전투 광기',pas:1,desc:'치명타 확률과 치명타 피해 증가',per:'등급당 치명타 +1.5%, 치명타 피해 +5%'},
  bladestorm:{n:'칼날 폭풍',mp:28,cd:14,desc:'3초간 몸을 회전하며 주변에 초당 150% 피해'},
  execute:{n:'처형',mp:18,cd:8,desc:'앞의 적 하나에 400% 피해. 체력 30% 이하 적에게는 두 배'},
  earthsplit:{n:'대지 분쇄',mp:35,cd:18,desc:'넓은 범위에 350% 피해와 2초 기절'},
  // 수호자
  taunt:{n:'도발',mp:6,cd:8,desc:'주변 적이 5초간 나만 노린다. 3초간 받는 피해 -30%'},
  bash:{ctr:1,n:'방패 강타',mp:8,cd:3,desc:'앞의 적에게 140% 피해, 2초 기절'},
  bulwark:{n:'수호의 오라',mp:18,cd:18,desc:'주변 파티원이 받는 피해 -35% (6초)'},
  hook:{n:'쇠사슬 끌기',mp:10,cd:6,desc:'커서 방향 첫 적을 끌어오고 3초 도발'},
  ironskin:{n:'강철 피부',pas:1,desc:'방어력 증가',per:'등급당 방어력 +8%'},
  shieldwall:{n:'방패벽',mp:14,cd:16,desc:'4초간 받는 피해 -60%'},
  consecrate:{n:'신성한 땅',mp:20,cd:12,desc:'발밑에 5초간 장판. 적에게 초당 60% 피해, 아군 소량 회복'},
  slam:{n:'대지 강타',mp:14,cd:6,desc:'주변 적에게 180% 피해, 3초 둔화'},
  undying:{n:'불굴',pas:1,desc:'치명상을 입으면 한 번 체력 30%로 버틴다',per:'등급당 재사용 대기 -8초 (기본 120초)'},
  rally:{n:'결집의 외침',mp:22,cd:20,desc:'주변 파티원에게 최대 체력 20% 보호막 (8초)'},
  shieldthrow:{ctr:1,n:'방패 투척',mp:12,cd:4,desc:'적 사이를 3번 튕기는 방패, 각 150% 피해'},
  bastion:{n:'최후의 보루',mp:40,cd:40,desc:'8초간 파티 받는 피해 -40%, 주변 모든 적 도발'},
  // 궁수
  multishot:{n:'다중 사격',mp:8,cd:1,desc:'부채꼴로 화살 5발, 각 70% 피해'},
  pierce:{ctr:1,n:'관통 화살',mp:10,cd:3,desc:'모든 적을 꿰뚫는 화살, 220% 피해'},
  rain:{n:'화살비',mp:16,cd:8,desc:'커서 위치에 2.5초간 화살비, 초당 120% 피해'},
  vault:{n:'후퇴 사격',mp:8,cd:5,desc:'뒤로 도약하며 화살 3발 발사'},
  eagle:{n:'매의 눈',pas:1,desc:'치명타 피해 증가',per:'등급당 치명타 피해 +8%'},
  trap:{n:'폭발 덫',mp:12,cd:6,desc:'커서 위치에 덫 설치. 적이 밟으면 250% 폭발과 둔화'},
  poison:{n:'독화살',mp:10,cd:3,desc:'맞은 적에게 100% 피해와 5초간 독 300%'},
  volley:{n:'일제 사격',mp:18,cd:6,desc:'넓은 부채꼴로 화살 9발, 각 60% 피해'},
  swift:{n:'바람걸음',pas:1,desc:'이동 속도와 공격 속도 증가',per:'등급당 이동 속도 +3%, 공격 속도 +2%'},
  sniper:{ctr:1,n:'저격',mp:22,cd:10,desc:'1초 조준 후 모든 적을 꿰뚫는 600% 탄환'},
  barrage:{n:'연사',mp:24,cd:12,desc:'1.5초간 커서 방향으로 화살 12발, 각 80%'},
  starfall:{n:'별똥별 화살',mp:40,cd:22,desc:'커서 지역에 거대한 폭발 3회, 각 300%'},
  // 마법사
  fireball:{n:'화염구',mp:10,cd:0.6,desc:'폭발하는 화염구, 주문 피해 170%'},
  nova:{n:'얼음 폭발',mp:18,cd:5,desc:'주변 적에게 120% 피해, 3초간 50% 둔화'},
  chain:{ctr:1,n:'연쇄 번개',mp:14,cd:2,desc:'적 사이를 4번 튀는 번개, 각 130% 피해'},
  blink:{n:'순간이동',mp:12,cd:3,desc:'커서 방향으로 최대 8칸 순간 이동'},
  arcane:{n:'비전 지식',pas:1,desc:'주문 피해 증가',per:'등급당 주문 피해 +6%'},
  meteor:{n:'운석',mp:26,cd:8,desc:'1초 뒤 커서 위치에 400% 폭발, 3초간 불바다'},
  frostorb:{n:'서리 구체',mp:20,cd:6,desc:'천천히 날아가며 주변 적에게 얼음 파편, 초당 160%와 둔화'},
  flamewall:{n:'화염 벽',mp:18,cd:7,desc:'커서 위치에 4초간 불 장판, 초당 140%'},
  manaflow:{n:'마나 흐름',pas:1,desc:'마나 재생 증가',per:'등급당 마나 재생 +15%, 최대 마나 +5'},
  blizzard:{n:'눈보라',mp:30,cd:14,desc:'넓은 지역에 5초간 눈보라. 초당 100% 피해와 둔화'},
  thunder:{ctr:1,n:'뇌우',mp:26,cd:9,desc:'커서 주변 적 최대 6명에게 낙뢰, 각 220%'},
  armageddon:{n:'종말',mp:60,cd:45,desc:'5초간 주변에 운석이 쏟아진다. 각 250%'},
  // 사제
  heal:{n:'치유의 빛',mp:12,cd:1.5,desc:'커서 주변 파티원을 치유'},
  smite:{ctr:1,n:'심판',mp:10,cd:2.5,desc:'커서 위치에 신성 폭발, 주문 피해 180%'},
  shield:{n:'보호의 축복',mp:16,cd:10,desc:'주변 파티원에게 6초간 보호막'},
  sanctuary:{n:'치유의 장',mp:20,cd:14,desc:'커서 위치에 5초간 치유 장판'},
  devotion:{n:'헌신',pas:1,desc:'치유량과 보호막량 증가',per:'등급당 치유력 +6%'},
  renew:{n:'소생의 기도',mp:30,cd:45,desc:'주변에 쓰러진 파티원을 즉시 일으킨다 (체력 50%)'},
  purify:{n:'정화의 파동',mp:18,cd:6,desc:'주변 파티원 치유, 주변 적에게 120% 피해'},
  holyfire:{n:'성화',mp:14,cd:3,desc:'커서 방향으로 적을 꿰뚫는 빛줄기, 250% 피해'},
  grace:{n:'은총',pas:1,desc:'받는 피해 감소와 최대 마나 증가',per:'등급당 받는 피해 -2%, 최대 마나 +5'},
  blessing:{n:'축복',mp:28,cd:30,desc:'10초간 주변 파티원 피해 +20%, 받는 피해 -20%'},
  lightpillar:{ctr:1,n:'빛의 기둥',mp:26,cd:12,desc:'커서 위치에 5초간 빛기둥. 적 초당 120%, 아군 지속 치유'},
  miracle:{n:'기적',mp:50,cd:90,desc:'던전의 모든 파티원 체력 완전 회복과 보호막'},
  // ----- 38·42·46 신규 -----
  rageleap:{n:'분노의 도약',mp:20,cd:9,desc:'커서 방향으로 세 번 연속 도약, 착지마다 충격파 150%'},
  shatter:{n:'파쇄 일격',mp:22,cd:10,desc:'앞의 적 하나에 500% 피해, 5초간 받는 피해 +15% (파쇄)'},
  endless:{n:'끝없는 분노',pas:1,desc:'피해와 생명력 흡수 증가',per:'등급당 피해 +2%, 생명력 흡수 +0.5%'},
  shieldrush:{n:'방패 돌격',mp:16,cd:8,desc:'방패를 앞세워 돌진, 끝에서 200% 충격과 1초 기절, 적을 밀쳐냄'},
  judgechain:{n:'심판의 사슬',mp:20,cd:12,desc:'커서 주변 적 최대 5명을 빛의 사슬로 묶어 150% 피해와 3초 속박'},
  willpower:{n:'철벽 의지',pas:1,desc:'최대 체력 증가와 받는 피해 감소',per:'등급당 최대 체력 +3%, 받는 피해 -1%'},
  shadowshot:{n:'그림자 사격',mp:18,cd:16,desc:'6초간 그림자 분신이 기본 공격을 따라 쏜다 (추가 화살 60%)'},
  galearrow:{n:'폭풍 화살',mp:22,cd:11,desc:'천천히 나아가는 회오리 화살. 주변 적을 끌어당기며 초당 200%'},
  instinct:{n:'사냥꾼의 직감',pas:1,desc:'치명타 확률과 보스 피해 증가',per:'등급당 치명타 +1%, 보스 피해 +2%'},
  overload:{n:'마력 폭주',mp:25,cd:20,desc:'6초간 모든 피해 +30%, 공격 속도 +20%'},
  blackhole:{n:'블랙홀',mp:30,cd:14,desc:'커서 위치에 3초간 블랙홀. 적을 끌어당기며 초당 120%, 끝에 300% 폭발'},
  resonance:{n:'원소 공명',pas:1,desc:'주문 피해와 재사용 대기 감소',per:'등급당 주문 피해 +3%, 재사용 대기 -1%'},
  lightchain:{n:'빛의 사슬',mp:18,cd:6,desc:'가장 다친 파티원부터 최대 4명에게 튀는 치유'},
  holyburst:{n:'신성 폭발',mp:24,cd:10,desc:'주변 적에게 250% 피해와 밀치기, 주변 파티원에게 보호막'},
  saint:{n:'성인의 가호',pas:1,desc:'치유력 증가와 받는 피해 감소',per:'등급당 치유력 +4%, 받는 피해 -1%'},
  // ----- 빛의 기사 (히든) -----
  lslash:{n:'빛의 참격',mp:8,cd:1,desc:'앞을 넓게 베는 빛의 검격, 190% 피해 · 신성력 +8'},
  flashdash:{ctr:1,n:'섬광 돌진',mp:10,cd:4,desc:'빛처럼 커서 방향으로 돌진, 경로의 적에게 210% 피해 · 신성력 +10'},
  lmark:{n:'빛의 표식',mp:12,cd:8,desc:'커서 위치에 빛의 표식. 120% 피해, 8초간 표식된 적이 받는 피해 +25%'},
  crossslash:{n:'십자 베기',mp:14,cd:5,desc:'십자로 두 번 베어 각 170% 피해와 짧은 기절 · 신성력 +12'},
  holyblade:{n:'신성한 칼날',pas:1,desc:'치명타 피해와 신성력 획득 증가',per:'등급당 치명타 피해 +6%, 신성력 획득 +5%'},
  skyfall:{ctr:1,n:'천공의 낙하',mp:16,cd:7,desc:'커서 위치로 뛰어올라 빛기둥과 함께 내려찍는다. 260% 피해와 1초 기절'},
  bladedance:{n:'빛의 검무',mp:22,cd:12,desc:'3초간 빛의 칼날이 몸을 감싸며 주변 적에게 초당 200%'},
  dawnawaken:{n:'새벽의 각성',mp:20,cd:24,desc:'10초간 피해 +30%, 공격 속도 +25%, 신성력 획득 두 배'},
  dawnward:{n:'여명의 가호',pas:1,desc:'피해 증가와 받는 피해 감소',per:'등급당 피해 +3%, 받는 피해 -1%'},
  judgment:{n:'심판의 검',mp:18,cd:9,desc:'신성력을 모두 쏟아 거대한 빛의 검을 내려친다. 300% + 신성력 1당 3.5% (최대 650%)'},
  lastflash:{ctr:1,n:'최후의 일섬',mp:16,cd:10,desc:'앞의 적에게 순식간에 파고들어 420% 피해. 체력 35% 이하의 적에게는 1.5배'},
  lightstorm:{n:'빛의 폭풍',mp:30,cd:16,desc:'주변을 빛으로 뒤덮어 400% 피해와 1.5초 기절 · 신성력 +20'},
  radiantspear:{n:'광휘의 창',mp:20,cd:8,desc:'빛의 창을 던져 경로의 모든 적에게 320% 피해'},
  excalibur:{n:'성검 해방',mp:30,cd:30,desc:'8초간 피해 +20%, 기본 공격마다 빛의 파동이 뻗어 나간다 (100%)'},
  dawnoath:{n:'새벽의 맹세',pas:1,desc:'보스 피해와 치명타 확률 증가',per:'등급당 보스 피해 +2%, 치명타 +1%'},
  // ----- 20레벨 궁극기 (V) -----
  ragnarok:{ult:1,n:'라그나로크',mp:0,cd:100,desc:'하늘로 도약해 불꽃 대검을 내려찍는다(600%). 땅이 세 번 갈라지며 폭발(각 300%)하고 불길이 남는다'},
  wargod:{ult:1,n:'전쟁신 강림',mp:0,cd:110,desc:'12초간 거대해진다. 피해 +30%, 모든 공격이 충격파를 일으키고 속박·둔화 면역'},
  aegisdome:{ult:1,n:'천상의 방벽',mp:0,cd:110,desc:'8초간 황금 방패 돔. 안의 파티원 받는 피해 -60%, 끝날 때 폭발(400%)해 적을 밀어낸다'},
  judgehammer:{ult:1,n:'심판의 망치',mp:0,cd:100,desc:'거대한 빛의 망치로 세 번 내려찍는다(각 350%). 마지막 일격은 적을 기절시키고 보스를 휘청이게 한다'},
  skyrain:{ult:1,n:'천공의 폭우',mp:0,cd:90,desc:'5초간 넓은 지역에 빛의 화살비. 초당 360%'},
  dragonarrow:{ult:1,n:'용의 화살',mp:0,cd:90,desc:'1초간 힘을 모아 용의 형상을 한 화살을 쏜다. 경로의 모든 적 800%, 끝에서 400% 폭발'},
  apocalypse:{ult:1,n:'아마겟돈',mp:0,cd:110,desc:'하늘이 붉게 물들며 운석 12개가 적을 노려 떨어지고(각 400%), 마지막에 거대 운석(1000%)'},
  absolutezero:{ult:1,n:'절대 영도',mp:0,cd:100,desc:'주변을 3초간 얼린다(보스는 둔화). 얼음이 산산조각 나며 700% 폭발'},
  angel:{ult:1,n:'천사 강림',mp:0,cd:120,desc:'10초간 천사가 내려와 주변 파티원을 계속 치유하고, 쓰러진 동료를 즉시 일으킨다'},
  divinejudge:{ult:1,n:'신의 심판',mp:0,cd:100,desc:'빛기둥 10개가 적을 쫓아 떨어진다(각 300%). 주변 파티원에게 최대 체력 20% 보호막'},
  dawnblade:{ult:1,n:'여명의 성검',mp:0,cd:100,desc:'하늘에서 거대한 빛의 성검을 내려꽂는다(700%, 2초 기절). 이어서 빛의 파동이 세 번 퍼진다(각 300%)'},
  heavendance:{ult:1,n:'천상의 검무',mp:0,cd:100,desc:'3초간 빛이 되어 주변 적 사이를 12번 오가며 벤다(각 250%). 마지막에 빛이 폭발한다(500%). 그동안 무적'}
};
for(const c in CLASSES){CLASSES[c].skills.forEach((s,i)=>{SKILLS[s].lvl=UNLOCK[i];SKILLS[s].cls=c;});(CLASSES[c].ults||[]).forEach(s=>{SKILLS[s].lvl=ULT_LVL;SKILLS[s].cls=c;});}
function skillMul(rank){return 1+0.12*Math.max(0,rank-1);}
function defaultSkills(cls){const s=CLASSES[cls].skills;return{sk:{[s[0]]:1,[s[1]]:1},bar:[s[0],s[1],null,null,null,null]};}
function skillPointsTotal(lvl){return Math.max(0,lvl-1);}

// ---------- 시너지 ----------
function synergies(clsList){const has=c=>clsList.includes(c);const out=[];
  if(has('guardian'))out.push({id:'wall',n:'철벽 대형',d:'파티 받는 피해 -10%'});
  if(has('priest'))out.push({id:'grace',n:'신의 가호',d:'파티 체력 재생 두 배'});
  if(has('warrior')&&has('guardian'))out.push({id:'van',n:'선봉대',d:'근접 직업 피해 +15%'});
  if(has('archer')&&has('mage'))out.push({id:'art',n:'원거리 포격',d:'원거리 직업 피해 +15%'});
  if(has('knight')&&has('priest'))out.push({id:'dawnpray',n:'새벽의 기도',d:'모든 피해 +8%, 받는 피해 -5%'});
  if(has('guardian')&&has('priest')&&has('warrior')&&(has('archer')||has('mage')))out.push({id:'full',n:'완벽한 파티',d:'모든 피해 +10%, 받는 피해 -10%'});
  const cnt={};for(const c of clsList)cnt[c]=(cnt[c]||0)+1;for(const c in cnt)if(cnt[c]>=2)out.push({id:'bro_'+c,n:CLASSES[c].n+' 형제단',d:CLASSES[c].n+' 피해 +8%'});
  return out;}
const SYN_INFO=[{id:'wall',n:'철벽 대형',req:[['guardian']],d:'파티 받는 피해 -10%'},{id:'grace',n:'신의 가호',req:[['priest']],d:'파티 체력 재생 두 배'},{id:'van',n:'선봉대',req:[['warrior'],['guardian']],d:'근접 직업 피해 +15%'},{id:'art',n:'원거리 포격',req:[['archer'],['mage']],d:'원거리 직업 피해 +15%'},{id:'dawnpray',n:'새벽의 기도',req:[['knight'],['priest']],d:'모든 피해 +8%, 받는 피해 -5%',hidden:1},{id:'full',n:'완벽한 파티',req:[['guardian'],['priest'],['warrior'],['archer','mage']],d:'모든 피해 +10%, 받는 피해 -10%'},{id:'bro',n:'○○ 형제단',req:[],d:'같은 직업 2명 이상: 그 직업 피해 +8%'}];
function synergyMods(list,cls){let dmg=1,dr=0,regen=1;const ids=new Set(list.map(s=>s.id));
  if(ids.has('wall'))dr+=0.1;if(ids.has('grace'))regen=2;
  if(ids.has('van')&&CLASSES[cls].range==='melee')dmg*=1.15;if(ids.has('art')&&CLASSES[cls].range==='ranged')dmg*=1.15;
  if(ids.has('full')){dmg*=1.1;dr+=0.1;}if(ids.has('dawnpray')){dmg*=1.08;dr+=0.05;}if(ids.has('bro_'+cls))dmg*=1.08;return{dmg,dr,regen};}

// ---------- 몬스터 ----------
const MT={
  zombie:{n:'굶주린 시체',hp:24,dmg:6,spd:30,r:5,xp:9,cd:1.3},
  skel:{n:'해골 궁수',hp:18,dmg:5,spd:36,r:5,xp:12,cd:1.9},
  hound:{n:'지옥 사냥개',hp:22,dmg:7,spd:46,r:5,xp:14,cd:1.0},
  boss:{n:'피의 군주 모르가스',hp:520,dmg:14,spd:28,r:11,xp:400,cd:1.6},
  egg:{n:'알',hp:30,dmg:0,spd:0,r:5,xp:4,cd:99,stat:1},
  tentacle:{n:'촉수',hp:60,dmg:8,spd:0,r:6,xp:8,cd:1.8,stat:1},
  guard:{n:'수호 해골',hp:40,dmg:6,spd:32,r:5,xp:6,cd:1.3},
  clone:{n:'환영',hp:60,dmg:8,spd:30,r:11,xp:0,cd:1.6},
  goblin:{n:'보물 고블린',hp:55,dmg:0,spd:60,r:5,xp:60,cd:99},
  r_greg:{n:'종지기 그레고르',hp:520,dmg:14,spd:26,r:12,xp:900,cd:1.8,rb:1},
  r_lyra:{n:'빛의 마녀 리라',hp:520,dmg:14,spd:30,r:10,xp:900,cd:1.6,rb:1},
  r_nora:{n:'그림자 마녀 노라',hp:520,dmg:14,spd:30,r:10,xp:900,cd:1.6,rb:1},
  r_valen:{n:'기사단장 발렌',hp:520,dmg:14,spd:32,r:11,xp:900,cd:1.5,rb:1},
  r_golem:{n:'태엽 거인 발렌',hp:520,dmg:14,spd:22,r:15,xp:900,cd:2,rb:1},
  r_karnas:{n:'흑왕 카르나스',hp:520,dmg:14,spd:30,r:14,xp:1200,cd:1.6,rb:1},
  r_ella:{n:'빛의 기사 엘라',hp:520,dmg:0,spd:0,r:10,xp:0,cd:99,rb:1},
  ghoul:{n:'종탑의 망자',hp:26,dmg:7,spd:32,r:5,xp:10,cd:1.3},
  shade:{n:'거울 망령',hp:30,dmg:8,spd:36,r:5,xp:12,cd:1.2},
  cog:{n:'태엽 사냥개',hp:30,dmg:8,spd:48,r:5,xp:12,cd:1.1},
  wraith:{n:'흑월 망령',hp:36,dmg:9,spd:36,r:5,xp:14,cd:1.2}
};
const MT_LIST=['zombie','skel','hound','boss','egg','tentacle','guard','clone','goblin','r_greg','r_lyra','r_nora','r_valen','r_golem','r_karnas','r_ella','ghoul','shade','cog','wraith'];
// 엘리트 특성 (비트)
const EAFF=[['frost','빙결',1],['split','분열',2],['vamp','흡혈',4],['tele','순간이동',8],['shield','보호막',16],['bomb','자폭',32],['fast','신속',64],['tough','강철',128]];
function eaffNames(mask){return EAFF.filter(a=>mask&a[2]).map(a=>a[1]);}
const WIND_LIST=['','melee','shoot','charge','slam','ring','cast'];
// 타격음 종류 (서버가 번호로 보냄)
const EL_LIST=['slash','blunt','heavy','arrow','magic','zap','fire','ice','holy','poison','void','quake'];
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
const RAR_N=['일반','마법','희귀','전설','신화'];
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
// 등급: 0 일반, 1 마법, 2 희귀(영웅), 3 전설 — 전설은 maxR=3일 때(보스)만 나온다
function rollRarity(R,bonus,maxR){const x=R()*100-bonus;const r=x<2?3:x<7?2:x<35?1:0;return Math.min(maxR==null?2:maxR,r);}
function genItem(L,fam,minR,bonus,R,maxR,fslot){
  R=R||Math.random;minR=minR||0;bonus=bonus||0;
  const slot=fslot||pk(R,['weapon','weapon','armor','armor','ring']);
  let rar=Math.max(minR,rollRarity(R,bonus,maxR));if(slot==='ring'&&rar===0)rar=1;
  const it={id:rid(),slot,rar,L,base:{},aff:[]};
  if(slot==='weapon'){const b=pk(R,WEAPONS[fam]);it.fam=fam;it.kind=b.kind;it.bn=b.n;it.base.dmg=Math.max(1,Math.round((3+L*1.6)*b.d*(0.85+R()*0.3)));if(b.as)it.base.as=b.as;if(b.mp)it.base.mp=b.mp;}
  else if(slot==='armor'){const b=pk(R,ARMORS);it.kind=b.kind;it.bn=b.n;it.base.armor=Math.max(1,Math.round((4+L*3)*b.a*(0.85+R()*0.3)));if(b.ms)it.base.ms=b.ms;if(b.mp)it.base.mp=b.mp;}
  else{it.kind='ring';it.bn='반지';it.gem=pk(R,GEMS);}
  const n=rar===0?0:rar===1?ri(R,1,2):rar===2?3:4;
  const pool=AFF_POOL[slot].slice();
  for(let i=0;i<n&&pool.length;i++){const k=pool.splice(Math.floor(R()*pool.length),1)[0];let v=AFF[k].r(L,R);if(rar===3)v=Math.round(v*1.35)+1;it.aff.push({k,v});}
  it.name=rar===0?it.bn:rar===1?PREFIX[it.aff[0].k]+' '+it.bn:rar===2?pk(R,RN1)+'의 '+pk(R,RN2[slot]):pk(R,LEG[slot==='weapon'?fam:slot]);
  it.value=Math.round((5+L*3)*(1+rar*rar*1.5));
  const x=R();let ns=rar===1?(x<0.15?1:0):rar===2?(x<0.1?2:x<0.4?1:0):rar===3?(x<0.3?2:1):0;ns=Math.min(ns,SOCK_MAX[slot]);if(ns)it.so=new Array(ns).fill(null);
  return it;
}
// ---------- 신화 (레이드 경매 전용) ----------
const MYTH={blast:{n:'핏빛 폭발',d:'적을 처치하면 주변에 폭발 (공격력 80%)'},aegis:{n:'불멸의 가호',d:'5초마다 최대 체력 10% 보호막'},chainz:{n:'천둥의 연쇄',d:'치명타 시 번개가 주변 적 3명에게 튄다 (60%)'},vamp:{n:'피의 계약',d:'생명력 흡수 +4%, 처치 시 체력 3% 회복'},haste:{n:'시간의 톱니',d:'스킬 재사용 대기 -15%'},wrath:{n:'군주 사냥꾼',d:'보스에게 주는 피해 +20%'}};
const MYTH_N={melee:['흑월의 대검','종말의 도끼'],bow:['별을 삼킨 활','피안의 석궁'],staff:['심연의 왕홀','시간을 먹는 지팡이'],armor:['불멸 군주의 갑주','새벽 기사단의 흉갑'],ring:['신들의 반지','엘라의 약속']};
// ---------- 세트 아이템 (레이드) ----------
const SETS={
  bell:{n:'종지기',raid:'bell',lvl:20,nm:{melee:'종지기의 망치',bow:'종탑 파수꾼의 활',staff:'종소리 지팡이',armor:'종지기의 누더기 갑옷',ring:'녹슨 종 반지'},b2:{hpPct:15,armorPct:10},b2d:'체력 +15%, 방어력 +10%',b3d:'스킬이 적에게 맞으면 5초마다 종소리 파동 (주변 피해 150%)'},
  twins:{n:'쌍둥이 마녀',raid:'mirror',lvl:30,nm:{melee:'황혼의 쌍검',bow:'빛과 그림자의 활',staff:'쌍둥이 달의 지팡이',armor:'마녀의 거울 드레스',ring:'엇갈린 달 반지'},b2:{crit:8},b2d:'치명타 확률 +8%',b3d:'직전과 다른 스킬을 쓰면 그 스킬 피해 +40%'},
  clock:{n:'태엽 기사',raid:'clock',lvl:40,nm:{melee:'태엽 기사의 창',bow:'태엽 석궁',staff:'톱니 왕홀',armor:'태엽 기사단 흉갑',ring:'멈추지 않는 톱니 반지'},b2:{as:12},b2d:'공격 속도 +12%',b3d:'스킬 10번 사용마다 6초간 태엽 폭주 (재사용 대기 -50%)'},
  moon:{n:'흑월',raid:'moon',lvl:50,nm:{melee:'흑월의 처형검',bow:'흑월 사냥꾼의 활',staff:'흑월의 홀',armor:'흑왕의 갑주',ring:'꺼지지 않는 흑월 반지'},b2:{bossDmg:15},b2d:'보스에게 주는 피해 +15%',b3d:'카운터 성공 시 10초간 모든 피해 +35%, 카운터 재사용 초기화'}};
const RAID_SET={bell:'bell',mirror:'twins',clock:'clock',moon:'moon'};
function genSet(id,L,fam,R,slot){R=R||Math.random;const S0=SETS[id];const it=genItem(L,fam,3,0,R,3,slot);it.set=id;it.name=it.slot==='weapon'?S0.nm[fam]:S0.nm[it.slot];it.value=Math.round(it.value*1.5);return it;}
function setCount(ch,id){let n=0;for(const s of['weapon','armor','ring']){const it=ch.eq[s];if(it&&it.set===id&&canEquip(it,ch.cls))n++;}return n;}
function genMythic(L,fam,R,slot){R=R||Math.random;const it=genItem(L,fam,3,0,R,3,slot);it.rar=4;for(const k in it.base)if(k==='dmg'||k==='armor')it.base[k]=Math.round(it.base[k]*1.25);for(const a of it.aff)a.v=Math.round(a.v*1.25);
  const keys=Object.keys(MYTH);it.myth=keys[Math.floor(R()*keys.length)];const pool=MYTH_N[it.slot==='weapon'?fam:it.slot];it.name=pool[Math.floor(R()*pool.length)];it.value=Math.round(it.value*2);if(!it.so)it.so=[null];return it;}
function starterWeapon(fam){const b=WEAPONS[fam][fam==='melee'?1:fam==='bow'?0:1];return{id:rid(),slot:'weapon',rar:0,L:1,fam,kind:b.kind,bn:b.n,name:'낡은 '+b.n,base:{dmg:4},aff:[],value:3};}
function starterArmor(cls){const k=cls==='mage'||cls==='priest'?ARMORS[3]:ARMORS[0];return{id:rid(),slot:'armor',rar:0,L:1,kind:k.kind,bn:k.n,name:'해진 '+k.n,base:{armor:3},aff:[],value:3};}
function itemStats(it){const s={};const em=enhMul(it.up|0);for(const k in it.base){const v=it.base[k];s[k]=(s[k]||0)+((k==='dmg'||k==='armor')?Math.round(v*em):v);}let rm=it.slot==='ring'&&it.up?1+0.05*it.up:1;if((it.up|0)>=TRANS_MAX){rm*=1.05;for(const k in s)s[k]=Math.round(s[k]*1.05);}for(const a of it.aff)s[a.k]=(s[a.k]||0)+(rm===1?a.v:Math.round(a.v*rm));
  if(it.so)for(const g of it.so){const e=gemEff(g,it.slot);if(e)s[e.k]=(s[e.k]||0)+e.v;}return s;}

// ---------- 대장간: 강화 · 재련 · 분해 · 소켓/보석 ----------
const ENH_MAX=10,ENH_RATE=[100,100,95,90,80,70,60,50,40,30],TRANS_MAX=15,TRANS_RATE=[50,40,30,20,10];
function canTrans(it){return !!it&&(it.rar>=3||!!it.set);}function enhMax(it){return canTrans(it)?TRANS_MAX:ENH_MAX;}
function enhRate(it){const up=it.up|0;return up<ENH_MAX?ENH_RATE[up]:Math.min(100,TRANS_RATE[up-ENH_MAX]+(it.tp|0));}
function enhMul(up){return up<=10?1+0.1*up:2+0.15*(up-10);}
function enhCost(it){const up=it.up|0,L=it.L|0;if(up>=ENH_MAX){const t=up-ENH_MAX;return{gold:Math.round((20+L*8)*(1+up)*(1+it.rar*0.5)*1.5),iron:3+t,dust:up,ess:2+t,myth:(it.rar===4?2:1)+t};}return{gold:Math.round((20+L*8)*(1+up)*(1+it.rar*0.5)),iron:1+Math.floor(up/2),dust:up>=5?up-3:0,ess:it.rar>=3&&up>=7?1:0,myth:it.rar===4&&up>=5?1+Math.floor((up-5)/2):0};}
function affScale(it,v){if(it.rar===3)return Math.round(v*1.35)+1;if(it.rar===4)return Math.round((v*1.35+1)*1.25);return v;}
function affRange(it,k){const L=it.L|0;const lo=AFF[k].r(L,()=>0),hi=AFF[k].r(L,()=>0.999999);return[affScale(it,lo),affScale(it,hi)];}
/* 아이템 레벨 올리기: 기본 수치·능력 수치를 굴림 위치(품질) 그대로 새 레벨 범위로 옮김 */
function lvCost1(it,L){const r=it.rar|0;return{gold:Math.round((10+L*5)*(1+r*0.6)),iron:1,dust:r>=2?1:0,ess:r>=3&&L%5===4?1:0,myth:r===4&&L%10===9?1:0};}
function lvCost(it,n){const c={gold:0,iron:0,dust:0,ess:0,myth:0};for(let i=0;i<n;i++){const d=lvCost1(it,(it.L|0)+i);for(const k in c)c[k]+=d[k];}return c;}
function itemLvUp(it,n){const L0=it.L|0,L1=L0+n;if(n<=0)return it;
  if(it.base.dmg)it.base.dmg=Math.max(1,Math.round(it.base.dmg*(3+L1*1.6)/(3+L0*1.6)));if(it.base.armor)it.base.armor=Math.max(1,Math.round(it.base.armor*(4+L1*3)/(4+L0*3)));
  const old=it.aff.map(a=>affRange(it,a.k));it.L=L1;it.aff.forEach((a,i)=>{const [lo,hi]=old[i],[lo2,hi2]=affRange(it,a.k);if(hi>lo){const t=Math.max(0,Math.min(1,(a.v-lo)/(hi-lo)));a.v=Math.round(lo2+t*(hi2-lo2));}else if(lo>0)a.v=Math.round(a.v*lo2/lo);else a.v=Math.max(a.v,lo2);});return it;}
function rollAff(it,k,R){R=R||Math.random;return affScale(it,AFF[k].r(it.L|0,R));}
function rerollCost(it,swap){const n=it.rc|0,L=it.L|0,leg=it.rar>=3;if(it.rar===4){const g=Math.round((30+L*10)*(1+n*0.5)*(swap?2:1));return swap?{gold:g,dust:3,ess:2+n,myth:1}:{gold:g,dust:2+Math.floor(n/3),myth:1};}const g=Math.round((15+L*6)*(1+n*0.5)*(swap?2:1)*(leg?2:1));
  if(swap)return leg?{gold:g,dust:2,ess:2+n}:{gold:g,dust:2+Math.floor(n/3)};return{gold:g,dust:(leg?2:1)+Math.floor(n/3)};}
function salvageOf(it){const r=it.rar,up=it.up|0;const o={iron:[1,2,3,1,2][r]+up,dust:[0,0,2,4,6][r],ess:r===3?1:r===4?2:0,myth:r===4?1:0,dustP:r===1?0.3:0};return o;}
// 보석: r 루비, s 사파이어, t 토파즈, e 에메랄드, a 자수정, d 다이아몬드 · 등급 1~5
const GEM_T=['r','s','t','e','a','d'];
const GEM_N={r:'루비',s:'사파이어',t:'토파즈',e:'에메랄드',a:'자수정',d:'다이아몬드'};
const GEM_TIER=['','조각난','흠 있는','','완벽한','황실'];
const GEM_COL={r:'#e0574a',s:'#4a8aff',t:'#ffd35a',e:'#4ad07a',a:'#b35ae0',d:'#eaf2ff'};
const GEM_FX={r:{w:['dmgPct',[4,7,11,16,24]],o:['str',[3,6,11,18,28]]},s:{w:['critDmg',[8,14,22,32,45]],o:['ene',[3,6,11,18,28]]},t:{w:['as',[2,4,6,8,11]],o:['dex',[3,6,11,18,28]]},
  e:{w:['crit',[1,2,3,4,6]],o:['vit',[3,6,11,18,28]]},a:{w:['ls',[1,1,2,2,3]],o:['hp',[15,35,70,130,220]]},d:{w:['dmg',[3,7,14,26,42]],o:['armor',[8,20,40,75,125]]}};
function gemOk(g){return typeof g==='string'&&g.length===2&&GEM_FX[g[0]]&&+g[1]>=1&&+g[1]<=5;}
function gemEff(g,slot){if(!gemOk(g))return null;const f=GEM_FX[g[0]][slot==='weapon'?'w':'o'];return{k:f[0],v:f[1][+g[1]-1]};}
function gemName(g){if(!gemOk(g))return '?';const t=GEM_TIER[+g[1]];return (t?t+' ':'')+GEM_N[g[0]];}
function gemTierFor(floor,R){R=R||Math.random;let t=1+Math.floor((Math.max(1,floor)-1)/20);if(R()<0.2)t++;return Math.max(1,Math.min(5,t));}
function randGem(floor,R){R=R||Math.random;return GEM_T[Math.floor(R()*GEM_T.length)]+gemTierFor(floor,R);}
const SOCK_MAX={weapon:2,armor:2,ring:1};
function socketCost(it){const n=(it.so||[]).length,L=it.L|0;return{gold:Math.round((30+L*10)*(n+1)),dust:2*(n+1)};}
function combineCost(t){return 50*t*t;}
function unsocketCost(g){return 20*(+g[1])*(+g[1]);}
function gambleCost(slot,lvl){return slot==='ring'?90+lvl*20:60+lvl*15;}
function itemName(it){return (it.up?`+${it.up} `:'')+it.name;}
function canEquip(it,cls){if(!it)return false;if(it.slot!=='weapon')return true;return CLASSES[cls].fam===it.fam;}

// ---------- 캐릭터 ----------
function xpFor(l){return Math.floor(35*Math.pow(l,1.55));}
function newChar(name,cls){const C=CLASSES[cls];return{v:1,id:rid(),name,cls,lvl:1,xp:0,pts:0,str:C.base.str,dex:C.base.dex,vit:C.base.vit,ene:C.base.ene,gold:20,pots:{hp:3,mp:2},
  eq:{weapon:starterWeapon(C.fam),armor:starterArmor(cls),ring:null},bag:new Array(BAG_N).fill(null),cps:[1],best:0,kills:0,created:Date.now(),...defaultSkills(cls),spts:0,mats:{iron:0,dust:0,ess:0},gems:{}};}
function calcStats(ch){
  const C=CLASSES[ch.cls],g={};
  for(const s of['weapon','armor','ring']){const it=ch.eq[s];if(!it||!canEquip(it,ch.cls))continue;const st=itemStats(it);for(const k in st)g[k]=(g[k]||0)+st[k];}
  const T=talentSums(ch);for(const k of['dmgPct','crit','critDmg','as','ms','ls'])if(T[k])g[k]=(g[k]||0)+T[k];
  const str=ch.str+(g.str||0),dex=ch.dex+(g.dex||0),vit=ch.vit+(g.vit||0),ene=ch.ene+(g.ene||0);
  const S={str,dex,vit,ene};const prim=S[C.prim];
  S.maxHp=Math.round((40+vit*4+(ch.lvl-1)*6+(g.hp||0))*C.hpMul);
  S.maxMp=Math.round(20+ene*2+(ch.lvl-1)*2+(g.mp||0));
  S.dmgBase=2+(g.dmg||0);S.dmgMul=1+(prim+(g.dmgPct||0))/100;
  S.crit=Math.min(75,5+dex*0.1+(g.crit||0));S.critMul=1.5+(g.critDmg||0)/100;
  S.atkRate=C.atkRate*(1+((g.as||0)+dex*0.3)/100);
  S.armor=Math.round(((g.armor||0)+dex*0.5)*C.armorMul);
  S.ms=C.ms*(1+(g.ms||0)/100);S.ls=g.ls||0;S.spell=1+ene*0.004;S.mpRegen=1.2+ene*0.06;
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
  if(T.hpPct)S.maxHp=Math.round(S.maxHp*(1+T.hpPct/100));if(T.mpPct)S.maxMp=Math.round(S.maxMp*(1+T.mpPct/100));if(T.armorPct)S.armor=Math.round(S.armor*(1+T.armorPct/100));
  if(T.dr)S.dr=(S.dr||0)+T.dr/100;S.cdr=Math.min(0.4,(T.cdr||0)/100);if(T.healPct)S.healPow=Math.round(S.healPow*(1+T.healPct/100));if(T.spellPct)S.spell*=1+T.spellPct/100;
  if(r('endless')){S.dmgMul*=1+0.02*r('endless');S.ls+=0.5*r('endless');}if(r('willpower')){S.maxHp=Math.round(S.maxHp*(1+0.03*r('willpower')));S.dr=(S.dr||0)+0.01*r('willpower');}
  S.holyGain=1+(T.holy||0)/100;S.rad=ch.cls==='knight'?1+str*0.012:1;if(r('holyblade')){S.critMul+=0.06*r('holyblade');S.holyGain+=0.05*r('holyblade');}if(r('dawnward')){S.dmgMul*=1+0.03*r('dawnward');S.dr=(S.dr||0)+0.01*r('dawnward');}if(r('dawnoath')){S.bossDmg=(S.bossDmg||0)+0.02*r('dawnoath');S.crit=Math.min(75,S.crit+r('dawnoath'));}
  if(r('instinct')){S.crit=Math.min(75,S.crit+r('instinct'));S.bossDmg=0.02*r('instinct');}if(r('resonance')){S.spell*=1+0.03*r('resonance');S.cdr=Math.min(0.45,S.cdr+0.01*r('resonance'));}if(r('saint')){S.healPow=Math.round(S.healPow*(1+0.04*r('saint')));S.dr=(S.dr||0)+0.01*r('saint');}
  S.regen=1+(T.regen||0)/100;if(T.mpRegen)S.mpRegen*=1+T.mpRegen/100;
  S.dmgMul*=classDk(ch.cls,ch.lvl);
  S.set3=[];for(const id in SETS){const n=setCount(ch,id);if(n<2)continue;const b=SETS[id].b2;if(b.hpPct)S.maxHp=Math.round(S.maxHp*(1+b.hpPct/100));if(b.armorPct)S.armor=Math.round(S.armor*(1+b.armorPct/100));if(b.crit)S.crit=Math.min(75,S.crit+b.crit);if(b.as)S.atkRate*=1+b.as/100;if(b.bossDmg)S.bossDmg=(S.bossDmg||0)+b.bossDmg/100;if(n>=3)S.set3.push(id);}
  S.myth=[];for(const s2 of['weapon','armor','ring']){const it=ch.eq[s2];if(it&&it.rar===4&&it.myth&&MYTH[it.myth]&&canEquip(it,ch.cls))S.myth.push(it.myth);}
  if(S.myth.includes('vamp'))S.ls+=4;if(S.myth.includes('haste'))S.cdr=Math.min(0.5,(S.cdr||0)+0.15);
  return S;
}
function dmgReduce(S,floor){return Math.min(0.75,S.armor/(S.armor+40+12*Math.max(1,floor)));}
/* 종합 전투력: 공격(평균 피해×치명×공속×주문/신성×쿨감×흡혈) + 생존(체력÷받는 피해율) + 치유(사제) — 같은 직업 안에서 장비 비교용 */
function power(ch,eqOver){const c=eqOver?Object.assign({},ch,{eq:Object.assign({},ch.eq,eqOver)}):ch;const S=calcStats(c);const C=CLASSES[c.cls];
  const crit=1+Math.min(100,S.crit)/100*(S.critMul-1);const main=C.prim==='ene'?S.spell:1;
  const off=S.dmgBase*S.dmgMul*crit*(0.6+0.4*S.atkRate)*main*(S.rad||1)*(1+(S.cdr||0)*0.5)*(1+(S.ls||0)*0.005);
  const lv=Math.max(1,c.lvl|0);const def=S.maxHp/(1-dmgReduce(S,Math.ceil(lv/2)))/(1-Math.min(0.5,S.dr||0));
  const heal=c.cls==='priest'?S.healPow*4:0;return Math.round(Math.pow(off*10,0.6)*Math.pow(def,0.4)*6+heal+S.maxMp);}/* 공격 60% · 생존 40% 비중(곱) */
function potPrice(lvl){return 15+lvl*3;}

// ---------- 저장 코드 ----------
function encodeSave(ch){const s=JSON.stringify(ch);const b=typeof btoa!=='undefined'?btoa(unescape(encodeURIComponent(s))):Buffer.from(s,'utf8').toString('base64');return 'BC1:'+b;}
function decodeSave(code){code=String(code||'').trim();if(!code.startsWith('BC1:'))return null;try{const b=code.slice(4);const s=typeof atob!=='undefined'?decodeURIComponent(escape(atob(b))):Buffer.from(b,'base64').toString('utf8');return JSON.parse(s);}catch(e){return null;}}
function validChar(o){return !!(o&&typeof o==='object'&&CLASSES[o.cls]&&typeof o.name==='string'&&o.eq&&Array.isArray(o.bag));}

const SH={ultPow,CLASS_DK,classDk,SYN_INFO,TS,LVL_CAP,ULT_LVL,mulberry,rid,tileAt,walk,solidAt,blocked,moveEnt,los,bfs,D4,D8,genFloor,openStairs,genHub,LOBBY_SZ,RAIDS,genRaid,TALENTS,TN,TAL_NEED,talentPts,talentSpent,talentSums,branchSpent,canTalent,PETS,ACH,codexList,titleOf,LORE,loreFloor,BOSS_LINES,CTR_SKILL,CTR_CD,FINAL_LINES,MERCS,mercCost,genArena,FISH,FISH_RN,FISH_RC,rollFish,DYES,DYE_COST,EMOTES,
  CLASSES,CLASS_ORDER,SKILLS,MT,MT_LIST,EAFF,eaffNames,WIND_LIST,PROJ_LIST,EL_LIST,RAR_N,SLOTN,FAMN,AFF,WEAPONS,ARMORS,genItem,starterWeapon,starterArmor,itemStats,power,lvCost,itemLvUp,canEquip,
  THEMES,FINAL_BOSS,themeOf,MYTH,genMythic,SETS,RAID_SET,genSet,setCount,affScale,ENH_MAX,ENH_RATE,TRANS_MAX,TRANS_RATE,canTrans,enhMax,enhRate,enhMul,enhCost,affRange,rollAff,rerollCost,salvageOf,GEM_T,GEM_N,GEM_COL,GEM_FX,gemOk,gemEff,gemName,gemTierFor,randGem,SOCK_MAX,socketCost,combineCost,unsocketCost,gambleCost,itemName,AFF_POOL,bossOf,monName,xpFor,newChar,calcStats,dmgReduce,potPrice,encodeSave,decodeSave,validChar,UNLOCK,MAX_RANK,BAR_SIZE,BAG_N,skillMul,defaultSkills,skillPointsTotal,synergies,synergyMods};
if(typeof module!=='undefined'&&module.exports)module.exports=SH;else root.SH=SH;
})(typeof self!=='undefined'?self:this);
