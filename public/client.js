// 핏빛 카타콤 — 클라이언트 (렌더링 · 입력 · 네트워크 · UI)
'use strict';
(()=>{
const W=480,H=270,TS=16,SC=2;
const cv=document.getElementById('game');
const ctx=cv.getContext('2d');
function mk(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.imageSmoothingEnabled=false;return [c,x];}
ctx.imageSmoothingEnabled=false;
const [wc,wx]=mk(W,H),[lc,lx]=mk(W,H);
const lightImg=lx.createImageData(W,H);
for(let i=0;i<W*H;i++){lightImg.data[i*4]=5;lightImg.data[i*4+1]=4;lightImg.data[i*4+2]=8;}
const lightArr=new Float32Array(W*H);
const BAYER=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
const R=Math.random,ri=(a,b)=>a+Math.floor(R()*(b-a+1)),rf=(a,b)=>a+R()*(b-a),pick=a=>a[Math.floor(R()*a.length)],clamp=(v,a,b)=>v<a?a:v>b?b:v;
const {CLASSES,SKILLS}=SH;

// ================= 팔레트 · 스프라이트 =================
const PAL={k:'#0e0b12',d:'#1b1622',D:'#272030',m:'#3a3144',s:'#cdc6d2',S:'#7b7486',f:'#e8b796',r:'#b3282b',R:'#5e1519',o:'#ff8a3a',y:'#ffd35a',g:'#d49a2a',G:'#7d5418',b:'#6b4a2e',B:'#3b281a',w:'#e6dcc3',W:'#9e937a',z:'#7a9a55',Z:'#3f5a2c',p:'#7a3a8c',P:'#b86ad0',c:'#8fd0ff',C:'#3a6fb8',n:'#22386e',e:'#ff4a3a'};
const col=c=>PAL[c]||c;
function rgb(h){return [parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];}
function makeSprite(rows,flip){
  const h=rows.length,w=Math.max(...rows.map(r=>r.length));
  const [c,x]=mk(w,h),[fc,fx]=mk(w,h);const px=[];
  for(let j=0;j<h;j++){const row=rows[j];for(let i=0;i<w;i++){const ch=row[i];if(!ch||ch==='.')continue;const cc=PAL[ch];if(!cc)continue;const ii=flip?w-1-i:i;x.fillStyle=cc;x.fillRect(ii,j,1,1);fx.fillStyle='#fff6ea';fx.fillRect(ii,j,1,1);px.push(ii,j,cc);}}
  return {c,fc,px,w,h};
}
function shiftRows(rows,dy,dx){const w=Math.max(...rows.map(r=>r.length));const blank='.'.repeat(w);const out=[];for(let j=0;j<rows.length;j++){let s=(rows[j-dy]??blank).padEnd(w,'.');if(dx>0)s=('.'.repeat(dx)+s).slice(0,w);else if(dx<0)s=s.slice(-dx)+'.'.repeat(-dx);out.push(s);}return out;}
function buildFrames(body,legs,walk){
  const f=r=>({r:makeSprite(r,false),l:makeSprite(r,true)});
  return {idle:[f(body.concat(legs)),f(shiftRows(body,1,0).concat(legs))],walk:walk.map((lg,i)=>f((i%2?shiftRows(body,1,0):body).concat(lg))),
    atk:[f(shiftRows(body,0,-1).concat(legs)),f(shiftRows(body,1,1).concat(legs)),f(shiftRows(body,0,1).concat(legs))]};
}
function bipedLegs(a,b){const t=r=>r.map(s=>s.replace(/B/g,a).replace(/b/g,b));
  const idle=t([".....kBk.kBk....",".....kBk.kBk....",".....kbk.kbk....","....kkkk.kkkk..."]);
  const A=t([".....kBk.kBk....",".....kbk.kBk....",".....kkk.kbk....",".........kkkk..."]);
  const Bf=t([".....kBk.kBk....",".....kBk.kbk....",".....kbk.kkk....","....kkkk........"]);
  return {idle,walk:[A,idle,Bf,idle]};}
function swingLegs(idle){const s=d=>idle.map((r,i)=>i===0?r:shiftRows([r],0,d)[0]);return {idle,walk:[s(1),idle,s(-1),idle]};}
const remap=(rows,m)=>rows.map(s=>s.replace(/./g,c=>m[c]||c));

const PLAYER_BODY=["......kkkk......",".....kssSSk.....","....kssssSSk....","....kkkkkkkk....","....kskffkSk....","....kSSSSSSk....","...kgkrrrrkgk...","..kSskrrgrkSSk..","..kfkrrggrrkfk..","..kfkBbggbBkfk..","..kk.krrrrk.kk..",".....kRrrRk....."];
const HOOD_BODY=["......kkkk......",".....kzzZZk.....","....kzzzzZZk....","....kzkkkkZk....","....kkffffkk....","....kZffffZk....","...kbkZzzZkbk...","..kbbkzzGzkbbk..","..kfkzzGGzzkfk..","..kfkBbGGbBkfk..","..kk.kzzzzk.kk..",".....kZzzZk....."];
const HAT_BODY=[".......kk.......","......kppk......",".....kppPpk.....","...kkppppppkk...","..kpppppppppPk..","....kffffffk....","...kPkppppkPk...","..kpPkppypkPpk..","..kfkppyypPkfk..","..kfkPpyypPkfk..","..kk.kppppk.kk..",".....kPppPk....."];
const CLASS_BODY={
  warrior:PLAYER_BODY,
  guardian:remap(PLAYER_BODY,{r:'C',R:'n',g:'y',B:'n',b:'C'}),
  archer:HOOD_BODY,
  mage:HAT_BODY,
  priest:remap(PLAYER_BODY,{s:'w',S:'W',r:'w',R:'W',g:'y',B:'W',b:'g'})
};
const CLASS_LEG={warrior:['B','b'],guardian:['n','C'],archer:['B','Z'],mage:['p','P'],priest:['W','w']};
const CLASS_COL={warrior:'#e0574a',guardian:'#7aa2ff',archer:'#9ccf6a',mage:'#c77ad8',priest:'#ffe9a8'};
const FRP={};for(const c of SH.CLASS_ORDER){const lg=bipedLegs(CLASS_LEG[c][0],CLASS_LEG[c][1]);FRP[c]=buildFrames(CLASS_BODY[c],lg.idle,lg.walk);}

const ZOMBIE_BODY=["................","......kkkk......",".....kzzzzk.....","....kzzzzzZk....","....kzekezZk....","....kZzzzzZk....",".....kZkkZk.....","..kkkbbbbbbkkk..",".kzZkbbBbbbkZzk.",".kk.kbbbbBbk.kk.","....kbBbbbBk....","....kBBBBBBk...."];
const SKEL_BODY=["......kkkk......",".....kwwwwk.b...","....kwwwwwWk.bk.","....kekwekWk.bk.","....kWwwwwWk.bk.",".....kwkwkk..bk.","......kWk....bk.","...kwkwWwkwkwbk.","...kWkWwWkWk.bk.","....kwWwWwk..bk.",".....kWwWk...bk.","......kWk...b..."];
const HOUND_BODY=["................","................","................","..........k.k...",".........krkrk..",".........krrrrk.","..k.....krrerRk.",".krk...krrrrrrok",".kRrkkkrrrrrRkkk","..kRrrrrrrrrk...","..kRrrrrrrrRk...","...kRRrrrRRk...."];
const HOUND_LEGS=["...kRkRk..kRkRk.","...kRkRk..kRkRk.","...kRkRk..kRkRk.","...kkkkk..kkkkk."];
const BOSS_L=["................","...kk...........","..kwWk..........","..kwWk..........","..kwWWk.........","...kwWWk........","...kwWWWk...kkkk","....kWWWWkkkRRRR",".....kkWWkRRrrrr",".......kkRrrrrrr","........kRrrrrrr","........kRrkkkrr","........kRkyyykr","........kRrkkkrr","........kRRrrrrr",".........kRRkwkw","..kkkk....kRRkkk",".kSsssk..kkkRRRR","kSssssSkkSSkkRRR","kSsSSSSkSssSkkgg",".kSSkkkkSsSSkgRR",".kkRRkpkSSSkRRRg","..kRrkpkkkkRRrRR","..kRrkppkRRRrrRg","..kRrkppkRRRRRRR","..kwkkppkkRRRRRR",".kwkwkpppkBbbbbb","..k.kkpppkRRRk..",".....kpppkRRk...",".....kpppkRRk...",".....kpppkSSk...",".....kkkkkkkk..."];
const BOSS=BOSS_L.map(s=>s+s.split('').reverse().join(''));
const MERCHANT_BODY=["................",".....kkkkk......","....kbbbbbk.....","...kbBBBBbbk....","...kbkffkBbk....","...kbffffkbk....","..kkbbbbbbbkk...",".kgkBbbbbbBkbk..",".kykBbGbbbBkbbk.",".kgkBbGbbbBkbbk.","..kkBbbbbbBkkk..","...kBbbbbbBk....","...kBBbbbBBk....","...kBBBBBBBk....","....kkkkkkk.....","................"];
const zl=bipedLegs('B','Z'),sl=bipedLegs('W','w'),hl=swingLegs(HOUND_LEGS),bl=swingLegs(BOSS.slice(28));
const FRM={zombie:buildFrames(ZOMBIE_BODY,zl.idle,zl.walk),skel:buildFrames(SKEL_BODY,sl.idle,sl.walk),hound:buildFrames(HOUND_BODY,hl.idle,hl.walk),boss:buildFrames(BOSS.slice(0,28),bl.idle,bl.walk)};
const MERCHANT=makeSprite(MERCHANT_BODY);
const PROP={
  barrel:makeSprite(["..kkkkkk..",".kbbBbbBk.","kbbbBbbbBk","kGGGGGGGGk","kbbbBbbbBk","kbbbBbbbBk","kGGGGGGGGk","kbbbBbbbBk",".kbbBbbBk.","..kkkkkk.."]),
  crate:makeSprite(["kkkkkkkkkk","kbBbbbbBbk","kBbBbbBbBk","kbbBbbBbbk","kbbbBBbbbk","kbbbBBbbbk","kbbBbbBbbk","kBbBbbBbBk","kbBbbbbBbk","kkkkkkkkkk"]),
  banner:makeSprite(["kkkkkkkk","kgggggggk","krrrrrrk.","krryyrrk.","kryyyyrk.","krryyrrk.","krrrrrrk.","krrrrrrk.","krrkkrrk.","krk..krk.","kk....kk."]),
};
const FOUNTAIN=pcan(34,26,q=>{for(let j=0;j<26;j++)for(let i=0;i<34;i++){const dx=(i-17)/16,dy=(j-15)/10;const d=dx*dx+dy*dy;if(d<=1){q(i,j,d>0.72?'s':d>0.6?'S':((i*3+j*5)%7===0?'c':'C'));}}
  for(let j=2;j<16;j++){q(16,j,'S');q(17,j,'s');q(18,j,'S');}discP(q,17,3,3,'S');discP(q,17,3,2,'s');for(let i=10;i<25;i++)q(i,15,'m');});

function pcan(w,h,fn){const [c,x]=mk(w,h);const q=(i,j,cc)=>{i=Math.round(i);j=Math.round(j);if(i<0||j<0||i>=w||j>=h)return;x.fillStyle=col(cc);x.fillRect(i,j,1,1);};fn(q,x,c);return c;}
function outlineC(c){const x=c.getContext('2d'),w=c.width,h=c.height,d=x.getImageData(0,0,w,h).data,add=[];const o=(a,b)=>a>=0&&b>=0&&a<w&&b<h&&d[(b*w+a)*4+3];for(let j=0;j<h;j++)for(let i=0;i<w;i++){if(d[(j*w+i)*4+3])continue;if(o(i-1,j)||o(i+1,j)||o(i,j-1)||o(i,j+1))add.push(i,j);}x.fillStyle=PAL.k;for(let k=0;k<add.length;k+=2)x.fillRect(add[k],add[k+1],1,1);return c;}
function lineP(q,x0,y0,x1,y1,cc){x0=Math.round(x0);y0=Math.round(y0);x1=Math.round(x1);y1=Math.round(y1);let dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1,e=dx+dy;for(let n=0;n<400;n++){q(x0,y0,cc);if(x0===x1&&y0===y1)break;const e2=2*e;if(e2>=dy){e+=dy;x0+=sx;}if(e2<=dx){e+=dx;y0+=sy;}}}
function discP(q,cx,cy,r,cc){for(let j=-r;j<=r;j++)for(let i=-r;i<=r;i++)if(i*i+j*j<=r*r+r*0.8)q(cx+i,cy+j,cc);}
function ringP(q,cx,cy,r,cc){for(let a=0;a<64;a++){const t=a/64*Math.PI*2;q(cx+Math.cos(t)*r,cy+Math.sin(t)*r,cc);}}

function makeFloor(v){const rr=SH.mulberry(v*7919+13);return pcan(16,16,q=>{
  for(let j=0;j<16;j++)for(let i=0;i<16;i++){const off=(j>>3)&1?4:0;const ii=(i+off)&7,jj=j&7;let c='d';if(jj===7||ii===7)c='k';else if((jj===0||ii===0)&&rr()<.7)c='D';else if(rr()<.05)c=rr()<.5?'D':'k';q(i,j,c);}
  if(v%4===1){let cx=2+Math.floor(rr()*11),cy=2+Math.floor(rr()*6);for(let k=0;k<6;k++){q(cx,cy,'k');cx+=Math.floor(rr()*3)-1;cy++;}}
  if(v===7){q(4,10,'W');q(5,10,'w');q(6,10,'w');q(7,10,'W');q(4,9,'w');q(7,11,'w');}
  if(v===11){q(9,5,'w');q(10,5,'w');q(11,5,'w');q(9,6,'w');q(10,6,'k');q(11,6,'w');q(10,7,'W');}
  if(v===9){for(let k=0;k<5;k++)q(2+Math.floor(rr()*12),2+Math.floor(rr()*12),'Z');}});}
function makeWall(v){const rr=SH.mulberry(v*104729+7);return pcan(16,16,q=>{
  for(let j=0;j<16;j++)for(let i=0;i<16;i++){const row=j>>2;const off=row&1?4:0;const ii=(i+off)&7,jj=j&3;let c='m';if(jj===3)c='k';else if(ii===7)c='d';else if(jj===0&&rr()<.35)c='S';else if(rr()<.07)c='D';if(j>=13)c=j===15?'k':(((i+j)&1)?'d':'D');if(j===0)c=(i&1)?'D':'m';q(i,j,c);}});}
const FLOORS=[];for(let v=0;v<40;v++)FLOORS.push(makeFloor(v));
const WALLS=[];for(let v=0;v<4;v++)WALLS.push(makeWall(v));
const STAIRS=pcan(16,16,q=>{for(let j=0;j<16;j++)for(let i=0;i<16;i++)q(i,j,'k');for(let s=0;s<5;s++){const y=1+s*3;for(let i=1+s;i<15-s;i++){q(i,y,s===0?'S':'m');q(i,y+1,'D');}}for(let j=0;j<16;j++){q(0,j,'g');q(15,j,'g');}});
const HUBFLOOR=[0,1,2,3].map(v=>{const rr=SH.mulberry(v*31+5);return pcan(16,16,q=>{for(let j=0;j<16;j++)for(let i=0;i<16;i++){let c=((i>>2)+(j>>2))&1?'D':'m';if((i&3)===3||(j&3)===3)c='d';if(rr()<.04)c='S';q(i,j,c);}});});
function torchF(f){return pcan(7,12,q=>{q(3,5,'b');q(3,6,'b');q(3,7,'b');q(3,8,'B');q(2,5,'G');q(4,5,'G');q(2,9,'G');q(3,9,'G');q(4,9,'G');q(3,10,'k');
  const fl=f?[[3,0,'y'],[2,1,'o'],[3,1,'y'],[4,1,'o'],[2,2,'o'],[3,2,'y'],[4,2,'r'],[2,3,'r'],[3,3,'o'],[4,3,'r'],[3,4,'r']]:[[3,0,'o'],[4,0,'y'],[2,1,'o'],[3,1,'y'],[4,1,'y'],[2,2,'r'],[3,2,'y'],[4,2,'o'],[2,3,'r'],[3,3,'o'],[4,3,'o'],[3,4,'r']];
  fl.forEach(([i,j,c])=>q(i,j,c));});}
const TORCH=[torchF(0),torchF(1)];
const SH_S=pcan(12,4,q=>{const c='rgba(0,0,0,0.5)';for(let i=3;i<9;i++){q(i,0,c);q(i,3,c);}for(let i=1;i<11;i++){q(i,1,c);q(i,2,c);}});
const SH_B=pcan(28,7,q=>{const c='rgba(0,0,0,0.5)';for(let j=0;j<7;j++){const hw=Math.round(14*Math.sqrt(1-((j-3)/3.6)**2));for(let i=14-hw;i<14+hw;i++)q(i,j,c);}});

// 아이콘
const ICONS=new Map();
function weaponIcon(kind){return outlineC(pcan(16,16,q=>{
  if(kind==='axe'){lineP(q,3,13,11,5,'b');discP(q,11,4,3,'S');lineP(q,13,2,14,6,'s');q(11,4,'s');q(10,3,'s');}
  else if(kind==='mace'){lineP(q,3,13,9,7,'b');discP(q,11,5,3,'S');q(10,4,'s');q(11,4,'s');q(10,5,'s');q(14,5,'s');q(11,1,'s');q(8,5,'S');}
  else if(kind==='shortbow'||kind==='longbow'){const L=kind==='longbow'?7:5;for(let t=-L;t<=L;t++){const x=8-Math.round(Math.sqrt(Math.max(0,L*L-t*t))*0.55)+3,y=8+t;q(x,y,'b');}lineP(q,11,8-L,11,8+L,'w');q(6,8,'G');q(7,8,'G');}
  else if(kind==='crossbow'){lineP(q,3,12,11,4,'b');lineP(q,6,5,13,11,'S');lineP(q,6,5,4,8,'w');lineP(q,13,11,10,13,'w');q(9,8,'G');}
  else if(kind==='wand'){lineP(q,4,12,11,5,'b');discP(q,12,4,1,'c');q(12,3,'w');}
  else if(kind==='staff'){lineP(q,3,14,12,3,'b');lineP(q,4,14,13,3,'B');discP(q,12,3,2,'p');q(12,2,'P');}
  else if(kind==='scepter'){lineP(q,4,13,10,7,'g');discP(q,11,5,2,'y');q(11,2,'y');q(14,5,'y');q(8,5,'y');q(11,4,'w');}
  else{const [hx,hy,tx,ty]=kind==='dagger'?[6,10,11,5]:kind==='great'?[4,11,14,1]:[5,10,13,2];
    lineP(q,hx+1,hy-1,tx,ty,'s');lineP(q,hx+2,hy-1,tx,ty+1,'S');if(kind==='great')lineP(q,hx+1,hy-2,tx-1,ty,'s');
    lineP(q,hx-2,hy-2,hx+2,hy+2,'g');lineP(q,hx-1,hy+1,hx-3,hy+3,'b');q(hx-4,hy+4,'g');}}));}
const ARMOR_HALF=["........","..kkk...",".kSSSk..",".kSsSSkk",".kSssSSS","kSSsssSS","kSkSssss","kk.kSsss","...kSsss","...kSsgg","...kSsss","...kSSss","...kSSSS","...kkkkk"];
function armorIcon(kind){const map={leather:{s:'b',S:'B',g:'G'},chain:{},plate:{g:'y'},robe:{s:'p',S:'R'}}[kind]||{};
  const rows=["................"].concat(ARMOR_HALF.map(h=>(h+h.split('').reverse().join('')).replace(/[sSg]/g,c=>map[c]||c)));return makeSprite(rows).c;}
function ringIcon(gem){return outlineC(pcan(16,16,q=>{ringP(q,8,10,4,'g');ringP(q,8,10,3,'G');discP(q,8,5,2,gem||'r');q(7,4,'w');}));}
function iconFor(it){const key=it.slot+it.kind+(it.gem||'');let c=ICONS.get(key);if(c)return c;c=it.slot==='weapon'?weaponIcon(it.kind):it.slot==='armor'?armorIcon(it.kind):ringIcon(it.gem);ICONS.set(key,c);return c;}
const POT=["......kkk.......","......kWk.......",".....kkbkk......","....krrrrrk.....","...krorrrrrk....","...korrrrrrk....","...krrrrrRRk....","....kRRRRRk.....",".....kkkkk......"];
const POT_HP=makeSprite(POT).c,POT_MP=makeSprite(POT.map(s=>s.replace(/r/g,'c').replace(/R/g,'C').replace(/o/g,'w'))).c;
const GOLD=makeSprite([".kkk....","kyygk...","kgyGkkk.",".kkgyygk","..kkkkk."]).c;
const SKILL_ICON={};
(function(){const bg=q=>{for(let j=0;j<16;j++)for(let k=0;k<16;k++)q(k,j,'d');};const I={
  whirl:q=>{ringP(q,8,8,5,'S');for(let a=0;a<14;a++){const t=a/14*Math.PI*1.3-1;q(8+Math.cos(t)*5,8+Math.sin(t)*5,'s');q(8+Math.cos(t)*6,8+Math.sin(t)*6,a>9?'w':'S');}discP(q,8,8,1,'g');},
  charge:q=>{for(let i=0;i<4;i++)lineP(q,2,5+i*2,9,5+i*2,i%2?'S':'W');lineP(q,9,12,14,3,'s');lineP(q,10,12,15,3,'S');q(8,13,'g');q(9,13,'g');},
  warcry:q=>{discP(q,6,8,3,'r');q(5,7,'k');q(7,7,'k');lineP(q,5,10,7,10,'k');for(let k=0;k<3;k++){ringP(q,6,8,5+k*2,k===0?'o':'r');}},
  cleave:q=>{for(let a=0;a<18;a++){const t=-2.4+a*0.1;q(4+Math.cos(t)*9,13+Math.sin(t)*9,'s');q(4+Math.cos(t)*8,13+Math.sin(t)*8,'w');}lineP(q,2,14,14,14,'b');lineP(q,4,12,6,14,'o');lineP(q,9,11,10,14,'o');},
  taunt:q=>{discP(q,8,8,5,'R');discP(q,8,8,4,'r');lineP(q,8,4,8,8,'w');q(8,10,'w');q(8,11,'w');},
  bash:q=>{for(let j=3;j<14;j++)for(let i=4;i<12;i++)q(i,j,(i===4||i===11||j===3||j===13)?'g':'C');lineP(q,8,4,8,12,'y');lineP(q,5,8,10,8,'y');},
  bulwark:q=>{for(let a=0;a<30;a++){const t=Math.PI+a/29*Math.PI;q(8+Math.cos(t)*6,11+Math.sin(t)*6,'c');q(8+Math.cos(t)*5,11+Math.sin(t)*5,'C');}lineP(q,2,12,14,12,'c');discP(q,8,9,1,'w');},
  hook:q=>{for(let i=0;i<5;i++){ringP(q,3+i*2,12-i*2,1,i%2?'S':'s');}lineP(q,12,4,13,2,'s');lineP(q,13,4,14,6,'s');q(11,3,'S');},
  multishot:q=>{for(const d of[-3,0,3]){lineP(q,2,8,13,8+d,'b');q(13,8+d,'s');q(14,8+d,'s');}q(2,7,'w');q(2,9,'w');},
  pierce:q=>{lineP(q,1,14,14,1,'b');q(14,1,'w');q(13,1,'s');q(14,2,'s');q(12,3,'s');for(let k=0;k<3;k++)ringP(q,5+k*3,10-k*3,1,'c');},
  rain:q=>{for(let k=0;k<5;k++){const x=2+k*3,y=2+(k%2)*3;lineP(q,x,y,x+2,y+6,'b');q(x+2,y+7,'s');}for(let i=1;i<15;i++)q(i,14,'W');},
  vault:q=>{lineP(q,11,13,4,6,'W');for(let i=0;i<3;i++)q(12-i,13-i,'S');lineP(q,4,6,13,4,'b');q(13,4,'s');q(14,4,'w');},
  fireball:q=>{discP(q,9,7,4,'r');discP(q,9,7,3,'o');discP(q,10,6,1,'y');q(4,11,'o');q(3,12,'r');q(5,11,'r');q(2,13,'R');q(4,12,'R');},
  nova:q=>{lineP(q,8,2,8,14,'c');lineP(q,2,8,14,8,'c');lineP(q,4,4,12,12,'C');lineP(q,12,4,4,12,'C');discP(q,8,8,2,'w');},
  chain:q=>{lineP(q,3,2,7,7,'y');lineP(q,7,7,5,9,'y');lineP(q,5,9,11,14,'y');lineP(q,4,2,8,7,'w');q(12,4,'c');q(13,6,'c');q(11,10,'c');},
  blink:q=>{ringP(q,8,8,5,'p');ringP(q,8,8,2,'c');q(8,8,'w');q(3,3,'c');q(13,12,'c');q(12,3,'w');q(2,12,'w');},
  heal:q=>{discP(q,8,8,5,'Z');for(let i=4;i<=12;i++){q(8,i,'w');q(i,8,'w');q(7,i,'z');q(i,7,'z');}},
  shield:q=>{for(let a=0;a<40;a++){const t=a/40*Math.PI*2;q(8+Math.cos(t)*6,8+Math.sin(t)*6,'c');}discP(q,8,8,4,'n');lineP(q,8,5,8,11,'y');lineP(q,6,7,10,7,'y');},
  sanctuary:q=>{for(let a=0;a<40;a++){const t=a/40*Math.PI*2;q(8+Math.cos(t)*6,10+Math.sin(t)*3,'y');}for(let k=0;k<5;k++)q(4+k*2,4+(k%2)*2,'w');lineP(q,8,2,8,9,'g');},
  smite:q=>{for(let j=0;j<11;j++){q(7,j,'y');q(8,j,'w');q(9,j,'y');}discP(q,8,12,3,'g');discP(q,8,12,2,'y');}
};for(const k in I)SKILL_ICON[k]=pcan(16,16,q=>{bg(q);I[k](q);});})();
const CUR=["k........","kwk......","kwwk.....","kwwwk....","kwwwwk...","kwwwwwk..","kwwwkkkk.","kwkwk....","kk.kwk...","....kk..."];
const CURSOR=makeSprite(CUR).c,CURSOR_A=makeSprite(CUR.map(s=>s.replace(/w/g,'e'))).c,CURSOR_P=makeSprite(CUR.map(s=>s.replace(/w/g,'y'))).c;
function orbImg(hi,mid,dk){return pcan(41,41,q=>{for(let j=0;j<41;j++)for(let i=0;i<41;i++){const dx=i-20,dy=j-20;if(dx*dx+dy*dy>420)continue;const sh=dx*0.55+dy*0.45;let c=mid;if(sh>10)c=dk;else if(sh>5&&((i+j)&1))c=dk;else if(sh<-12)c=hi;else if(sh<-8&&!((i+j)&1))c=hi;q(i,j,c);}});}
const ORB_HP=orbImg('e','r','R'),ORB_MP=orbImg('c','C','n');
const ORB_FRAME=pcan(49,49,q=>{for(let j=0;j<49;j++)for(let i=0;i<49;i++){const dx=i-24,dy=j-24,d=Math.hypot(dx,dy);if(d<=20.6)q(i,j,'d');else if(d<=22.2)q(i,j,(dx+dy<0)?'g':'G');else if(d<=23.6)q(i,j,'k');}
  [[24,1],[24,47],[1,24],[47,24]].forEach(([x,y])=>{q(x,y,'y');q(x,y+(y<24?1:y>24?-1:0),'y');});});
const ORB_GLASS=pcan(41,41,q=>{for(let a=0;a<12;a++){const t=Math.PI*1.1+a/12*0.9;q(20+Math.cos(t)*16,20+Math.sin(t)*16,'rgba(255,255,255,0.45)');}q(11,12,'rgba(255,255,255,0.6)');q(12,11,'rgba(255,255,255,0.35)');});

// ================= 도트 텍스트 =================
const TXT=new Map();
function fontStr(size,font){return font==='px'?`${size}px Silkscreen, "Courier New", monospace`:`800 ${size}px "Nanum Gothic", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif`;}
const [,mcx]=mk(8,8);
function tbitmap(str,size,color,font){font=font||'kr';
  const key=str+'|'+size+'|'+color+'|'+font;let b=TXT.get(key);if(b)return b;if(TXT.size>1200)TXT.clear();
  mcx.font=fontStr(size,font);const tw=Math.ceil(mcx.measureText(str).width);const w=Math.max(4,tw+6),h=Math.ceil(size*1.35)+6;
  const [c,x]=mk(w,h);x.font=fontStr(size,font);x.textBaseline='middle';x.fillStyle='#fff';x.fillText(str,3,Math.round(h/2)+1);
  const id=x.getImageData(0,0,w,h),a=id.data,n=w*h,mask=new Uint8Array(n);for(let i=0;i<n;i++)mask[i]=a[i*4+3]>110?1:0;
  const [cr,cg,cb]=rgb(color);
  for(let i=0;i<n;i++){const p=i*4;if(mask[i]){a[p]=cr;a[p+1]=cg;a[p+2]=cb;a[p+3]=255;}else{const X=i%w,Y=(i/w)|0;let o=0;for(let dy=-1;dy<=1&&!o;dy++)for(let dx=-1;dx<=1;dx++){const xx=X+dx,yy=Y+dy;if(xx>=0&&yy>=0&&xx<w&&yy<h&&mask[yy*w+xx]){o=1;break;}}if(o){a[p]=8;a[p+1]=5;a[p+2]=10;a[p+3]=255;}else a[p+3]=0;}}
  x.putImageData(id,0,0);TXT.set(key,c);return c;}
function txt(str,x,y,size,color,align,font){size=size||12;color=color||'#e6dcc3';const b=tbitmap(String(str),size,color,font);let dx=x*SC;if(align==='center')dx-=b.width/2;else if(align==='right')dx-=b.width;ctx.drawImage(b,Math.round(dx),Math.round(y*SC-b.height/2));return b.width/SC;}
function tw(str,size){return tbitmap(String(str),size||12,'#ffffff').width/SC;}
function bigTxt(str,x,y,size,color,scale,font){const b=tbitmap(str,size,color,font);ctx.drawImage(b,Math.round(x*SC-b.width*scale/2),Math.round(y*SC-b.height*scale/2),b.width*scale,b.height*scale);}
if(document.fonts){Promise.all([document.fonts.load('800 13px "Nanum Gothic"','가나'),document.fonts.load('16px Silkscreen','0')]).then(()=>TXT.clear()).catch(()=>{});document.fonts.addEventListener&&document.fonts.addEventListener('loadingdone',()=>TXT.clear());}

// ================= 사운드 =================
let AC=null,NB=null,SFXG=null,soundMode=0;const lastS={};
try{soundMode=+localStorage.getItem('bc_sound')||0;}catch(e){}
function initAudio(){if(AC){if(AC.state==='suspended')AC.resume();return;}try{AC=new(window.AudioContext||window.webkitAudioContext)();SFXG=AC.createGain();SFXG.connect(AC.destination);const n=AC.sampleRate*0.6;NB=AC.createBuffer(1,n,AC.sampleRate);const d=NB.getChannelData(0);for(let i=0;i<n;i++)d[i]=Math.random()*2-1;startMusic();}catch(e){AC=null;}}
function tone(type,f1,f2,dur,vol,delay){delay=delay||0;const t=AC.currentTime+delay;const o=AC.createOscillator(),g=AC.createGain();o.type=type;o.frequency.setValueAtTime(f1,t);o.frequency.exponentialRampToValueAtTime(Math.max(20,f2),t+dur);g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);o.connect(g).connect(SFXG);o.start(t);o.stop(t+dur+0.03);}
function noise(dur,vol,freq,delay){freq=freq||1500;delay=delay||0;const t=AC.currentTime+delay;const s=AC.createBufferSource();s.buffer=NB;const f=AC.createBiquadFilter();f.type='lowpass';f.frequency.value=freq;const g=AC.createGain();g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);s.connect(f).connect(g).connect(SFXG);s.start(t);s.stop(t+dur+0.03);}
let MUS=null;
function makeImpulse(sec){const len=Math.floor(AC.sampleRate*sec),b=AC.createBuffer(2,len,AC.sampleRate);for(let c=0;c<2;c++){const d=b.getChannelData(c);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,3);}return b;}
function startMusic(){if(MUS)return;
  const out=AC.createGain();out.gain.value=0;out.connect(AC.destination);
  const rev=AC.createConvolver();rev.buffer=makeImpulse(3.5);rev.connect(out);
  const dry=AC.createGain();dry.gain.value=0.5;dry.connect(out);
  const dl=AC.createDelay(2);dl.delayTime.value=0.52;const fb=AC.createGain();fb.gain.value=0.4;dl.connect(fb);fb.connect(dl);dl.connect(rev);
  const dF=AC.createBiquadFilter();dF.type='lowpass';dF.frequency.value=240;dF.Q.value=5;const dG=AC.createGain();dG.gain.setValueAtTime(0,AC.currentTime);dG.gain.linearRampToValueAtTime(0.06,AC.currentTime+4);dF.connect(dG);dG.connect(dry);dG.connect(rev);
  const lfo=AC.createOscillator();lfo.frequency.value=0.05;const lg=AC.createGain();lg.gain.value=120;lfo.connect(lg);lg.connect(dF.frequency);lfo.start();
  [[55,'sawtooth'],[55.4,'sawtooth'],[27.5,'sine'],[82.6,'triangle']].forEach(([f,t])=>{const o=AC.createOscillator();o.type=t;o.frequency.value=f;o.connect(dF);o.start();});
  const t=AC.currentTime;MUS={out,rev,dry,dl,dF,chordT:t+0.3,ci:0,mel:t+4,drip:t+6,beat:t+1,mode:'',cur:null};
  setInterval(musicTick,120);}
const CHORDS={calm:[[110,130.8,164.8],[87.3,110,130.8],[73.4,87.3,110],[82.4,103.8,123.5]],boss:[[110,130.8,164.8],[116.5,146.8,174.6],[110,130.8,164.8],[103.8,123.5,155.6]],town:[[110,130.8,164.8],[98,123.5,146.8],[87.3,110,130.8],[82.4,103.8,123.5]]};
function pad(freqs,t,dur,vol){for(const f of freqs)for(const dt of[-7,7]){const o=AC.createOscillator();o.type='sawtooth';o.frequency.value=f;o.detune.value=dt;const fl=AC.createBiquadFilter();fl.type='lowpass';fl.frequency.value=520;const g=AC.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+2.5);g.gain.setValueAtTime(vol,t+dur-3);g.gain.linearRampToValueAtTime(0,t+dur);o.connect(fl).connect(g);g.connect(MUS.rev);g.connect(MUS.dry);o.start(t);o.stop(t+dur+0.1);}}
function bell(f,t,vol){[[1,vol,3],[2.76,vol*0.25,1.2],[5.4,vol*0.08,0.8]].forEach(([m,v,d])=>{const o=AC.createOscillator();o.type='sine';o.frequency.value=f*m;const g=AC.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+0.006);g.gain.exponentialRampToValueAtTime(0.0001,t+d);o.connect(g);g.connect(MUS.dl);g.connect(MUS.rev);g.connect(MUS.dry);o.start(t);o.stop(t+d+0.05);});}
function thump(t,vol){const o=AC.createOscillator();o.type='sine';o.frequency.setValueAtTime(75,t);o.frequency.exponentialRampToValueAtTime(32,t+0.18);const g=AC.createGain();g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(0.0001,t+0.25);o.connect(g);g.connect(MUS.dry);o.start(t);o.stop(t+0.3);}
function drip(t){const o=AC.createOscillator();o.type='sine';o.frequency.setValueAtTime(rf(1500,2200),t);o.frequency.exponentialRampToValueAtTime(600,t+0.06);const g=AC.createGain();g.gain.setValueAtTime(0.025,t);g.gain.exponentialRampToValueAtTime(0.0001,t+0.1);o.connect(g);g.connect(MUS.rev);o.start(t);o.stop(t+0.12);}
function musicTick(){if(!MUS||!AC)return;try{const t=AC.currentTime,ahead=t+0.4;
  const bossOn=[...G.monsters.values()].some(m=>m.tc===3&&(m.fl&16));
  const mode=scene!=='game'?'calm':G.kind==='hub'?'town':meDowned()?'dead':bossOn?'boss':'calm';
  if(mode!==MUS.mode){MUS.mode=mode;MUS.dF.frequency.setTargetAtTime(mode==='boss'?420:mode==='dead'?150:mode==='town'?300:240,t,1.5);}
  MUS.out.gain.setTargetAtTime(soundMode===0?0.55:0,t,0.4);
  const set=CHORDS[mode==='boss'?'boss':mode==='town'?'town':'calm'];
  if(MUS.chordT<t)MUS.chordT=t+0.1;
  if(MUS.chordT<ahead){const len=mode==='boss'?4:8;MUS.cur=set[MUS.ci%set.length];pad(MUS.cur,MUS.chordT,len+2.5,mode==='boss'?0.03:0.024);MUS.ci++;MUS.chordT+=len;}
  if(MUS.mel<t)MUS.mel=t+0.2;
  if(MUS.mel<ahead){if(mode!=='dead'&&R()<(mode==='boss'?0.8:mode==='town'?0.7:0.55))bell(pick(MUS.cur||set[0])*pick([4,4,8]),MUS.mel,0.03);MUS.mel+=mode==='boss'?pick([0.5,0.5,1]):pick([1,1.5,2,3]);}
  if(MUS.drip<t)MUS.drip=t+1;
  if(MUS.drip<ahead){if(mode!=='boss')drip(MUS.drip);MUS.drip+=rf(2.5,8);}
  if(mode==='boss'){if(MUS.beat<t)MUS.beat=t+0.1;if(MUS.beat<ahead){thump(MUS.beat,0.22);thump(MUS.beat+0.22,0.14);MUS.beat+=0.9;}}}catch(e){}}
function sfx(n){if(!AC||soundMode===2)return;const now=AC.currentTime;if(lastS[n]&&now-lastS[n]<0.045)return;lastS[n]=now;try{switch(n){
  case'swing':noise(0.07,0.05,2500);break;
  case'hit':noise(0.09,0.12,900);tone('square',180,90,0.06,0.03);break;
  case'crit':noise(0.12,0.16,1400);tone('square',520,260,0.1,0.05);break;
  case'mdie':noise(0.25,0.1,500);tone('sawtooth',160,50,0.25,0.04);break;
  case'hurt':tone('square',140,70,0.14,0.07);noise(0.08,0.08,700);break;
  case'fire':tone('sawtooth',300,90,0.22,0.05);noise(0.2,0.06,1800);break;
  case'boom':noise(0.3,0.16,600);tone('sine',120,40,0.3,0.1);break;
  case'ice':tone('triangle',1400,300,0.35,0.06);noise(0.25,0.05,4000);break;
  case'whirl':noise(0.2,0.08,3000);tone('sawtooth',200,500,0.18,0.03);break;
  case'tp':tone('sine',300,1400,0.2,0.07);break;
  case'pick':tone('square',660,990,0.07,0.04);break;
  case'gold':tone('triangle',1300,1300,0.05,0.05);tone('triangle',1750,1750,0.07,0.05,0.05);break;
  case'lvl':[523,659,784,1046].forEach((f,i)=>tone('square',f,f,0.14,0.05,i*0.08));break;
  case'potion':tone('sine',400,800,0.18,0.08);break;
  case'bow':tone('triangle',700,300,0.08,0.04);break;
  case'cast':tone('sine',500,900,0.12,0.04);break;
  case'dash':noise(0.2,0.08,1200);tone('sawtooth',100,220,0.2,0.04);break;
  case'stairs':tone('sine',220,70,0.7,0.1);break;
  case'boss':tone('sawtooth',70,40,0.9,0.1);noise(0.6,0.1,300);break;
  case'no':tone('square',140,120,0.1,0.04);break;
  case'rare':[880,1320].forEach((f,i)=>tone('triangle',f,f,0.18,0.05,i*0.09));break;
  case'legend':[660,880,1320,1760].forEach((f,i)=>tone('triangle',f,f,0.22,0.06,i*0.1));break;
  case'equip':noise(0.06,0.06,3000);tone('square',300,300,0.04,0.03);break;
  case'pdie':tone('sawtooth',200,40,1.2,0.1);break;
  case'heal':[660,880,990].forEach((f,i)=>tone('sine',f,f*1.02,0.2,0.04,i*0.05));break;
  case'shield':tone('triangle',500,1000,0.25,0.05);break;
  case'shout':noise(0.3,0.1,600);tone('sawtooth',160,120,0.3,0.06);break;
  case'bolt':noise(0.15,0.12,5000);tone('square',900,200,0.12,0.04);break;
  case'holy':tone('sine',880,1760,0.3,0.05);noise(0.2,0.06,3000);break;
  case'chat':tone('sine',1200,1200,0.04,0.03);break;
  case'revive':[523,784,1046].forEach((f,i)=>tone('sine',f,f,0.25,0.05,i*0.08));break;
  case'dodge':noise(0.15,0.06,2000);break;
}}catch(e){}}

// ================= 게임 상태 =================
let scene='select',myId=null,ws=null,time=0,shake=0,banner=null,curSlot=null;
const G={kind:null,map:null,floor:0,players:new Map(),ros:new Map(),monsters:new Map(),deadM:new Set(),projs:new Map(),drops:new Map(),zones:[],party:null,ch:null,S:null,
  mev:[1,1,1,1,0,0,0],paused:null,trans:0,meter:[],result:null,invite:null,ctxMenu:null,bubbles:new Map(),chatLog:[],explored:null,stairsOpen:false,panel:null,portalMenu:false,escMenu:false};
const me={x:0,y:0,r:4,face:1,animT:0,moving:false,atkAnim:0,atkDur:0.3,atkKind:'',atkAngle:0,spin:0,dodgeT:0,dodgeCd:0,dodx:0,dody:0,flash:0,atkCd:0,path:null,pickTarget:null,goal:null,sendT:0,lastSent:''};
let parts=[],effects=[],texts=[],msgs=[],torches=[];
let showInv=false,showChar=false,showShop=false,showMeter=false,uiRects=[],dropLabels=[],hoverMon=null,hoverDrop=null,hoverPl=null,pressMode='move';
const localCd={};let potCd=0;
const mouse={x:240,y:135,wx:0,wy:0},input={left:false};
const keys=new Set();
let camX=0,camY=0;
const [miniC,miniX]=mk(60,60);

function meDowned(){const p=G.players.get(myId);return !!(p&&p.downed);}
function myCls(){return G.ch?G.ch.cls:'warrior';}
function inDungeon(){return G.kind==='dungeon';}
function net(o){if(ws&&ws.readyState===1)ws.send(JSON.stringify(o));}
function msg(t,c){msgs.unshift({t,c:c||'#e6dcc3',life:3.4});if(msgs.length>4)msgs.pop();}
function ftext(x,y,s,c,size,font){texts.push({x,y,s,c,size,font:font||'kr',t:0,vx:rf(-14,14),vy:-60});}
function part(x,y,vx,vy,c,life,o){o=o||{};if(parts.length>1600)return;parts.push({x,y,vx,vy,c,life,max:life,z:o.z||0,vz:o.vz||0,g:o.g||0,glow:!!o.glow,ground:!!o.ground});}
function sparks(x,y,c,n){for(let k=0;k<n;k++)part(x+rf(-2,2),y,rf(-60,60),rf(-40,40),k%2?c:'w',rf(.12,.3),{z:rf(5,10),vz:rf(20,70),g:-200,glow:true});}
function deathBurst(e,s,big){if(!s)return;const ox=Math.round(e.x)-(s.w>>1),oy=Math.round(e.y)-s.h+2;const step=big?6:3;
  for(let k=0;k<s.px.length;k+=step){const px=s.px[k],py=s.px[k+1],c=s.px[k+2];part(ox+px,e.y+rf(-2,2),(px-s.w/2)*rf(3,7)+rf(-8,8),rf(-14,14),c,rf(0.9,1.8),{z:Math.max(0,(e.y+2)-(oy+py)),vz:rf(20,80),g:-280,ground:true});}
  if(big)for(let k=0;k<50;k++)part(e.x,e.y,rf(-90,90),rf(-60,60),pick(['r','e','y','o']),rf(.5,1.2),{z:rf(4,20),vz:rf(20,100),g:-120,glow:true});}
function toast(t){const el=document.getElementById('toast');el.textContent=t;el.style.display='block';clearTimeout(toast.h);toast.h=setTimeout(()=>el.style.display='none',2600);}

// ================= 저장 =================
const SAVE_KEY='bc_chars_v1';
function loadChars(){try{const a=JSON.parse(localStorage.getItem(SAVE_KEY)||'[]');return Array.isArray(a)?a.filter(SH.validChar):[];}catch(e){return [];}}
function saveChars(a){try{localStorage.setItem(SAVE_KEY,JSON.stringify(a));return true;}catch(e){return false;}}
function saveCurrent(ch){const a=loadChars();const i=a.findIndex(c=>c.id===ch.id);if(i>=0)a[i]=ch;else a.push(ch);saveChars(a);}

// ================= 캐릭터 선택 화면 =================
const selEl=document.getElementById('select');
let chosenCls='warrior',delArm=null;
function clsPreview(cls){const c=document.createElement('canvas');c.width=16;c.height=16;const x=c.getContext('2d');x.drawImage(FRP[cls].idle[0].r.c,0,0);return c;}
function renderSelect(){
  const slots=document.getElementById('slots');slots.innerHTML='';const a=loadChars();
  document.getElementById('noSlots').hidden=a.length>0;
  a.forEach(ch=>{const d=document.createElement('div');d.className='slot';
    const top=document.createElement('div');top.className='row';top.appendChild(clsPreview(ch.cls));top.lastChild.style.cssText='width:40px;height:40px;image-rendering:pixelated';
    const t=document.createElement('div');t.innerHTML=`<div class="nm"></div><div class="meta"></div>`;t.querySelector('.nm').textContent=ch.name;t.querySelector('.meta').textContent=`${CLASSES[ch.cls].n} · 레벨 ${ch.lvl} · 최고 지하 ${ch.best||0}층`;top.appendChild(t);d.appendChild(top);
    const row=document.createElement('div');row.className='row';
    const b1=document.createElement('button');b1.className='main';b1.textContent='입장';b1.onclick=()=>startGame(ch.id);
    const b2=document.createElement('button');b2.textContent='저장 코드 복사';b2.onclick=()=>{const code=SH.encodeSave(ch);(navigator.clipboard?navigator.clipboard.writeText(code):Promise.reject()).then(()=>toast('저장 코드를 복사했습니다')).catch(()=>{document.getElementById('importCode').value=code;toast('복사가 막혀 있어 아래 칸에 코드를 넣어 두었습니다');});};
    const b3=document.createElement('button');b3.className='warn';b3.textContent=delArm===ch.id?'정말 삭제':'삭제';b3.onclick=()=>{if(delArm===ch.id){saveChars(loadChars().filter(c=>c.id!==ch.id));delArm=null;}else delArm=ch.id;renderSelect();};
    row.append(b1,b2,b3);d.appendChild(row);slots.appendChild(d);});
  const cl=document.getElementById('classes');if(!cl.childElementCount){SH.CLASS_ORDER.forEach(k=>{const C=CLASSES[k];const b=document.createElement('button');b.className='cls';b.type='button';b.dataset.k=k;
    const cvs=clsPreview(k);b.appendChild(cvs);const n=document.createElement('div');n.innerHTML=`<div class="nm" style="font-size:15px"></div><div class="role"></div><div class="d"></div>`;n.querySelector('.nm').textContent=C.n;n.querySelector('.role').textContent=C.role;n.querySelector('.d').textContent=C.desc;b.appendChild(n);
    b.onclick=()=>{chosenCls=k;[...cl.children].forEach(x=>x.setAttribute('aria-pressed',x.dataset.k===k?'true':'false'));};cl.appendChild(b);});}
  [...cl.children].forEach(x=>x.setAttribute('aria-pressed',x.dataset.k===chosenCls?'true':'false'));
}
document.getElementById('createBtn').onclick=()=>{const name=document.getElementById('newName').value.trim();const err=document.getElementById('createErr');
  if(!name){err.textContent='이름을 입력하세요';return;}if(loadChars().length>=8){err.textContent='캐릭터는 8개까지 만들 수 있습니다';return;}
  const ch=SH.newChar(name.slice(0,10),chosenCls);const a=loadChars();a.push(ch);if(!saveChars(a)){err.textContent='이 브라우저에 저장할 수 없습니다. 시크릿 창이면 일반 창에서 열어 주세요';return;}err.textContent='';document.getElementById('newName').value='';renderSelect();};
document.getElementById('importBtn').onclick=()=>{const e=document.getElementById('importErr');const ch=SH.decodeSave(document.getElementById('importCode').value);if(!ch||!SH.validChar(ch)){e.textContent='올바른 저장 코드가 아닙니다';return;}
  const a=loadChars();const i=a.findIndex(c=>c.id===ch.id);if(i>=0)a[i]=ch;else a.push(ch);saveChars(a);e.textContent='';document.getElementById('importCode').value='';toast(`${ch.name} 캐릭터를 불러왔습니다`);renderSelect();};

function startGame(id){const ch=loadChars().find(c=>c.id===id);if(!ch)return;curSlot=id;initAudio();selEl.hidden=true;scene='connecting';cv.focus();
  const proto=location.protocol==='https:'?'wss':'ws';ws=new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen=()=>net({t:'join',ch});
  ws.onmessage=e=>{let d;try{d=JSON.parse(e.data);}catch(er){return;}try{handle(d);}catch(er){console.error(er);}};
  ws.onclose=()=>{if(scene==='select')return;scene='select';selEl.hidden=false;renderSelect();toast('서버와 연결이 끊겼습니다. 다시 입장해 주세요');};}
function quitToSelect(){scene='select';if(ws){try{ws.close();}catch(e){}}ws=null;selEl.hidden=false;renderSelect();resetWorld();}
function resetWorld(){G.players.clear();G.monsters.clear();G.projs.clear();G.drops.clear();G.zones=[];parts=[];effects=[];texts=[];G.result=null;G.invite=null;G.ctxMenu=null;showInv=showChar=showShop=false;G.portalMenu=false;G.escMenu=false;}

// ================= 네트워크 메시지 =================
function ensurePlayer(id){let p=G.players.get(id);if(!p){p={id,x:0,y:0,dx:0,dy:0,face:1,hp:1,maxHp:1,downed:false,dodge:false,moving:false,shield:false,rev:0,animT:R()*3,atkAnim:0,atkDur:0.3,atkKind:'',atkAngle:0,spin:0,flash:0};G.players.set(id,p);}return p;}
function handle(d){switch(d.t){
  case 'welcome':myId=d.id;scene='game';break;
  case 'err':toast(d.m);break;
  case 'map':{G.kind=d.kind;G.paused=d.paused||null;G.trans=0;G.monsters.clear();G.deadM.clear();G.projs.clear();G.drops.clear();G.zones=[];parts=[];effects=[];texts=[];G.portalMenu=false;showShop=false;
    if(d.kind==='hub'){G.map=SH.genHub();G.floor=0;banner={t:0,a:'던전 입구 광장',b:'동료를 모아 포탈로 들어가세요'};}
    else{G.map=SH.genFloor(d.seed,d.floor);G.floor=d.floor;G.stairsOpen=!!d.stairs;if(d.stairs)SH.openStairs(G.map);banner={t:0,a:`지하 ${d.floor}층`,b:G.map.boss?'피의 군주 모르가스가 기다린다':pick(['망자들이 속삭인다','피 냄새가 짙어진다','횃불이 흔들린다','더 깊은 어둠으로','뼈 부딪히는 소리가 들린다'])};}
    torches=G.map.torches;G.explored=new Uint8Array(G.map.w*G.map.h);me.x=d.x;me.y=d.y;me.path=null;me.pickTarget=null;me.goal=null;me.dodgeT=0;
    for(const o of d.drops||[])addDropC(o,true);
    for(const p of G.players.values()){p.dx=p.x;p.dy=p.y;}
    explore();drawMini();break;}
  case 'ros':{G.ros=new Map(d.list.map(r=>[r.id,r]));for(const id of [...G.players.keys()])if(!G.ros.has(id))G.players.delete(id);for(const r of d.list){const p=ensurePlayer(r.id);p.name=r.name;p.cls=r.cls;p.lvl=r.lvl;p.pt=r.pt;p.look=r.look;}break;}
  case 'party':G.party=d;break;
  case 's':onSnap(d);break;
  case 'ch':{const firstCh=!G.ch;const old=G.ch;G.ch=d.ch;G.S=d.S;if(old&&d.ch.lvl>old.lvl){}saveCurrent(d.ch);break;}
  case 'tp':me.x=d.x;me.y=d.y;me.path=null;me.lastSent='';break;
  case 'dadd':for(const o of d.d)addDropC(o,false);break;
  case 'drem':G.drops.delete(d.id);break;
  case 'msg':msg(d.m,d.c||'#e6dcc3');break;
  case 'chat':{G.chatLog.push({name:d.name,m:d.m,t:time});if(G.chatLog.length>40)G.chatLog.shift();G.bubbles.set(d.id,{m:d.m,t:time});sfx('chat');break;}
  case 'invite':G.invite={from:d.from,name:d.name,t:time};sfx('chat');break;
  case 'stairs':G.stairsOpen=true;SH.openStairs(G.map);drawMini();break;
  case 'trans':msg(`${d.by}님이 계단에 도착 · ${d.t0}초 후 다음 층으로`,'#ffd35a');sfx('stairs');break;
  case 'result':G.result=d;break;
  case 'meter':G.meter=d.rows;break;
  case 'paused':G.paused=d.by;if(d.by)msg(`${d.by}님이 일시정지했습니다`,'#9e937a');break;
  case 'fxp':if(d.k==='gold'){if(d.v)ftext(d.x,d.y-10,`+${d.v}`,'#ffd35a',16,'px');sfx('gold');}else if(d.k==='pick'){sfx(d.r>=3?'legend':d.r>=2?'rare':'pick');}else sfx('pick');break;
}}
function addDropC(o,instant){const d=Object.assign({},o);d.t=instant?1:0;G.drops.set(d.id,d);if(!instant&&d.kind==='item'){if(d.it.rar===3)sfx('legend');else if(d.it.rar===2)sfx('rare');}}
const WIND_DUR=[0,0.3,0.45,0.45,0.75,0.6];
function onSnap(d){
  const seen=new Set();
  for(const a of d.p){const [id,x,y,f,hp,mhp,fl,rev]=a;seen.add(id);const p=ensurePlayer(id);
    if(p.hp>hp&&id!==myId)p.flash=0.1;p.x=x;p.y=y;if(id!==myId)p.face=f;p.hp=hp;p.maxHp=mhp;const wasDown=p.downed;p.downed=!!(fl&1);p.dodge=!!(fl&2);if(id!==myId)p.moving=!!(fl&4);p.shield=!!(fl&8);p.rev=rev;
    if(Math.hypot(p.dx-x,p.dy-y)>60){p.dx=x;p.dy=y;}
    if(id===myId&&p.downed&&!wasDown){me.path=null;}}
  for(const id of [...G.players.keys()])if(!seen.has(id))G.players.delete(id);
  if(d.m){const ms=new Set();
    for(const a of d.m){const [id,tc,x,y,hp,mhp,face,fl,wc,atkT]=a;if(G.deadM.has(id))continue;ms.add(id);let m=G.monsters.get(id);
      if(!m){m={id,tc,type:SH.MT_LIST[tc],x,y,dx:x,dy:y,animT:R()*3,flash:0};G.monsters.set(id,m);}
      m.x=x;m.y=y;m.hp=hp;m.maxHp=mhp;m.face=face;m.fl=fl;m.wc=wc;m.atkT=atkT;if(fl&8)m.flash=0.09;if(Math.hypot(m.dx-x,m.dy-y)>60){m.dx=x;m.dy=y;}}
    for(const id of [...G.monsters.keys()])if(!ms.has(id))G.monsters.delete(id);}
  if(d.j){const js=new Set();for(const a of d.j){const [id,tc,x,y,vx,vy,h]=a;js.add(id);let p=G.projs.get(id);if(!p){p={id,type:SH.PROJ_LIST[tc],dx:x,dy:y};G.projs.set(id,p);}p.x=x;p.y=y;p.vx=vx;p.vy=vy;p.h=h;p.st=time;}
    for(const id of [...G.projs.keys()])if(!js.has(id))G.projs.delete(id);}
  if(d.z)G.zones=d.z.map(a=>({type:a[0],x:a[1],y:a[2],r:a[3],t:a[4]}));
  if(d.me)G.mev=d.me;
  if(inDungeon()){G.paused=d.pause||null;G.trans=d.trans||0;}
  for(const o of d.fx||[])onFx(o);
}
function playerPos(id){if(id===myId)return me;return G.players.get(id);}
function onFx(o){const k=o.k;
  if(k==='dmg'){ftext(o.x+rf(-3,3),o.y,String(o.v),o.c?'#ffd35a':'#f2eadb',o.c?24:16,'px');sparks(o.x,o.y+10,o.c?'y':'r',o.c?9:5);sfx(o.c?'crit':'hit');if(o.c)shake=Math.max(shake,1.5);}
  else if(k==='pdmg'){const p=playerPos(o.id);if(p){ftext(p.x,p.y-18,String(o.v),'#ff5a4a',16,'px');}if(o.id===myId){me.flash=0.1;shake=Math.max(shake,2);sfx('hurt');}else{const q=G.players.get(o.id);if(q)q.flash=0.1;}}
  else if(k==='heal'){ftext(o.x,o.y,'+'+o.v,'#7fd05a',16,'px');for(let n=0;n<6;n++)part(o.x+rf(-5,5),o.y+18,0,0,pick(['z','w']),rf(.4,.8),{z:rf(0,10),vz:rf(20,40),glow:true});}
  else if(k==='txt')ftext(o.x,o.y,o.s,o.c,14,'kr');
  else if(k==='mdie'){const m=G.monsters.get(o.id);if(m){deathBurst({x:m.dx,y:m.dy},m._s,m.tc===3);G.monsters.delete(o.id);}G.deadM.add(o.id);sfx('mdie');}
  else if(k==='swing'){const p=o.id===myId?me:G.players.get(o.id);if(p&&!(o.id===myId&&me.atkAnim>0)){p.atkKind='swing';p.atkAngle=o.a;p.atkDur=o.d;p.atkAnim=o.d;p.face=Math.cos(o.a)<0?-1:1;effects.push({type:'slash',pid:o.id,a:o.a,t:0,d:o.d,max:o.d+0.08});sfx('swing');}}
  else if(k==='shot'){const p=o.id===myId?me:G.players.get(o.id);if(p){p.atkKind='cast';p.atkAngle=o.a;p.atkDur=0.18;p.atkAnim=0.18;p.face=Math.cos(o.a)<0?-1:1;}const cls=o.id===myId?myCls():(G.players.get(o.id)||{}).cls;sfx(cls==='archer'?'bow':'cast');}
  else if(k==='whirl'){const p=playerPos(o.id);if(p){p.spin=0.3;effects.push({type:'whirl',pid:o.id,t:0,max:0.3,a0:rf(0,6)});}sfx('whirl');}
  else if(k==='dash'){effects.push({type:'dash',x1:o.x1,y1:o.y1,x2:o.x2,y2:o.y2,t:0,max:0.35});sfx('dash');}
  else if(k==='warcry'){effects.push({type:'ring',x:o.x,y:o.y,t:0,max:0.5,r:120,c:'r',c2:'o'});sfx('shout');shake=Math.max(shake,1.5);}
  else if(k==='bulwark'){effects.push({type:'ring',x:o.x,y:o.y,t:0,max:0.5,r:120,c:'c',c2:'C'});sfx('shield');}
  else if(k==='shieldfx'){effects.push({type:'ring',x:o.x,y:o.y,t:0,max:0.45,r:120,c:'c',c2:'w'});sfx('shield');}
  else if(k==='taunt'){effects.push({type:'ring',x:o.x,y:o.y,t:0,max:0.4,r:95,c:'e',c2:'r'});sfx('shout');}
  else if(k==='cleave'){effects.push({type:'cleave',x:o.x,y:o.y,a:o.a,t:0,max:0.3});shake=Math.max(shake,2);sfx('boom');}
  else if(k==='bash'){effects.push({type:'star',x:o.x,y:o.y,t:0,max:0.25});shake=Math.max(shake,1.5);sfx('hit');}
  else if(k==='hook'){effects.push({type:'hook',x1:o.x1,y1:o.y1,x2:o.x2,y2:o.y2,t:0,max:0.35});sfx('dash');}
  else if(k==='chain'){effects.push({type:'chain',pts:o.pts,t:0,max:0.3});sfx('bolt');}
  else if(k==='nova'){effects.push({type:'nova',x:o.x,y:o.y,t:0,max:0.35,under:true});for(let n=0;n<40;n++){const t=R()*Math.PI*2,sp=rf(60,130);part(o.x,o.y,Math.cos(t)*sp,Math.sin(t)*sp*0.6,pick(['c','w','C']),rf(.3,.6),{z:3,glow:true});}shake=Math.max(shake,1.5);sfx('ice');}
  else if(k==='tp'){effects.push({type:'tp',x:o.x,y:o.y,t:0,max:0.4});sfx('tp');}
  else if(k==='healburst'){effects.push({type:'ring',x:o.x,y:o.y,t:0,max:0.4,r:42,c:'z',c2:'w'});for(let n=0;n<18;n++)part(o.x+rf(-30,30),o.y+rf(-14,14),0,0,pick(['z','w','y']),rf(.5,.9),{z:rf(0,6),vz:rf(20,50),glow:true});sfx('heal');}
  else if(k==='smite'){effects.push({type:'smite',x:o.x,y:o.y,t:0,max:0.4});shake=Math.max(shake,1.5);sfx('holy');}
  else if(k==='boom'){effects.push({type:'boom',x:o.x,y:o.y,t:0,max:0.28,r:o.r||22});for(let n=0;n<16;n++)part(o.x,o.y,rf(-70,70),rf(-50,50),pick(['o','y','r']),rf(.2,.5),{z:6,vz:rf(10,60),g:-160,glow:true});sfx('boom');}
  else if(k==='slam'){shake=Math.max(shake,5);for(let n=0;n<30;n++){const t=R()*Math.PI*2,sp=rf(40,110);part(o.x,o.y,Math.cos(t)*sp,Math.sin(t)*sp*0.6,pick(['m','S','r','k']),rf(.3,.7),{z:2,vz:rf(20,70),g:-240,ground:true});}sfx('boom');}
  else if(k==='tele')effects.push({type:'tele',x:o.x,y:o.y,r:o.r,t:0,max:o.d,under:true});
  else if(k==='summon'){for(let n=0;n<10;n++)part(o.x,o.y,rf(-20,20),rf(-10,10),pick(['p','R','k']),rf(.4,.8),{z:rf(0,8),vz:rf(20,50),g:-80});}
  else if(k==='spark')sparks(o.x,o.y,o.c,4);
  else if(k==='lvl'){const p=playerPos(o.id);if(p){ftext(p.x,p.y-28,'LEVEL UP','#ffd35a',16,'px');effects.push({type:'lvl',pid:o.id,t:0,max:0.7});for(let n=0;n<30;n++)part(p.x+rf(-6,6),p.y,rf(-20,20),rf(-10,10),pick(['y','g','w']),rf(.5,1),{z:rf(0,10),vz:rf(40,90),g:-60,glow:true});}if(o.id===myId)sfx('lvl');}
  else if(k==='pdown'){const p=playerPos(o.id);const q=G.players.get(o.id);if(p&&q)deathBurst({x:p.x,y:p.y},FRP[q.cls||'warrior'].idle[0].r,false);sfx('pdie');if(o.id===myId)shake=5;}
  else if(k==='revive'){const p=playerPos(o.id);if(p){effects.push({type:'pillar',pid:o.id,t:0,max:0.8});}sfx('revive');}
  else if(k==='potion'){const p=playerPos(o.id);if(p)for(let n=0;n<14;n++)part(p.x+rf(-5,5),p.y,0,0,o.c==='hp'?'e':'c',rf(.4,.8),{z:rf(0,12),vz:rf(20,50),glow:true});if(o.id===myId)sfx('potion');}
  else if(k==='msg')msg(o.m,o.c);
  else if(k==='sfx')sfx(o.n);
  else if(k==='shake')shake=Math.max(shake,o.v);
}

// ================= 경로 탐색 (아이템·NPC로 걸어가기) =================
class Heap{constructor(){this.a=[];}get size(){return this.a.length;}push(n,f){const a=this.a;a.push([f,n]);let i=a.length-1;while(i>0){const p=(i-1)>>1;if(a[p][0]<=a[i][0])break;[a[p],a[i]]=[a[i],a[p]];i=p;}}
  pop(){const a=this.a,top=a[0],last=a.pop();if(a.length){a[0]=last;let i=0;for(;;){const l=2*i+1,r=l+1;let m=i;if(l<a.length&&a[l][0]<a[m][0])m=l;if(r<a.length&&a[r][0]<a[m][0])m=r;if(m===i)break;[a[m],a[i]]=[a[i],a[m]];i=m;}}return top[1];}}
function findPath(sx,sy,gx,gy){const map=G.map,MW=map.w;
  const s0=Math.floor(sx/TS),s1=Math.floor(sy/TS),g0=Math.floor(gx/TS),g1=Math.floor(gy/TS);if(!SH.walk(map,g0,g1))return null;
  const si=s1*MW+s0,gi=g1*MW+g0;if(si===gi)return[{x:gx,y:gy}];
  const N=MW*map.h,Gs=new Float32Array(N).fill(1e9),from=new Int32Array(N).fill(-1),closed=new Uint8Array(N);
  const hf=i=>{const x=i%MW,y=(i/MW)|0,dx=Math.abs(x-g0),dy=Math.abs(y-g1);return Math.max(dx,dy)+0.414*Math.min(dx,dy);};
  const hp=new Heap();Gs[si]=0;hp.push(si,hf(si));let it=0,found=false;
  while(hp.size&&it++<6000){const c=hp.pop();if(closed[c])continue;closed[c]=1;if(c===gi){found=true;break;}const cx=c%MW,cy=(c/MW)|0;
    for(const[dx,dy]of SH.D8){const nx=cx+dx,ny=cy+dy;if(!SH.walk(map,nx,ny))continue;if(dx&&dy&&(!SH.walk(map,cx+dx,cy)||!SH.walk(map,cx,cy+dy)))continue;const n=ny*MW+nx;if(closed[n])continue;const ng=Gs[c]+(dx&&dy?1.414:1);if(ng<Gs[n]){Gs[n]=ng;from[n]=c;hp.push(n,ng+hf(n));}}}
  if(!found)return null;const pts=[];let c=gi;while(c!==si&&c>=0){pts.push({x:(c%MW)*TS+8,y:((c/MW)|0)*TS+8});c=from[c];}pts.reverse();
  if(!SH.blocked(map,gx,gy,me.r))pts[pts.length-1]={x:gx,y:gy};
  const out=[];let cx=sx,cy=sy,i=0;while(i<pts.length){let j=pts.length-1;while(j>i&&!SH.los(map,cx,cy,pts[j].x,pts[j].y,me.r))j--;out.push(pts[j]);cx=pts[j].x;cy=pts[j].y;i=j+1;}return out;}
function nearestWalkTile(tx,ty){for(let r=0;r<=4;r++)for(let j=-r;j<=r;j++)for(let i=-r;i<=r;i++){if(Math.max(Math.abs(i),Math.abs(j))!==r)continue;if(SH.walk(G.map,tx+i,ty+j))return[tx+i,ty+j];}return null;}
function setGoal(x,y){let gx=x,gy=y;if(SH.blocked(G.map,gx,gy,me.r)){const t=nearestWalkTile(Math.floor(gx/TS),Math.floor(gy/TS));if(!t){me.path=null;return;}gx=t[0]*TS+8;gy=t[1]*TS+8;}
  if(SH.los(G.map,me.x,me.y,gx,gy,me.r)){me.path=[{x:gx,y:gy}];return;}me.path=findPath(me.x,me.y,gx,gy);}

// ================= 입력 =================
const MOVEK={KeyW:[0,-1],KeyA:[-1,0],KeyS:[0,1],KeyD:[1,0],ArrowUp:[0,-1],ArrowLeft:[-1,0],ArrowDown:[0,1],ArrowRight:[1,0]};
const chatBox=document.getElementById('chatBox');
function setMouse(e){const r=cv.getBoundingClientRect();mouse.x=(e.clientX-r.left)/r.width*W;mouse.y=(e.clientY-r.top)/r.height*H;}
function uiHit(){for(let i=uiRects.length-1;i>=0;i--){const r=uiRects[i];if(mouse.x>=r.x&&mouse.x<r.x+r.w&&mouse.y>=r.y&&mouse.y<r.y+r.h&&(r.click||r.right||r.block))return r;}return null;}
function dropUnderMouse(){for(let i=dropLabels.length-1;i>=0;i--){const l=dropLabels[i];if(mouse.x>=l.x&&mouse.x<=l.x+l.w&&mouse.y>=l.y&&mouse.y<=l.y+l.h)return l.d;}for(const d of G.drops.values()){if(d.kind==='item'&&d.t>=0.45&&Math.abs(d.x-mouse.wx)<8&&mouse.wy>d.y-14&&mouse.wy<d.y+3)return d;}return null;}
function monsterAt(x,y){let b=null,bd=1e9;for(const m of G.monsters.values()){const boss=m.tc===3;const hw=boss?13:7,top=boss?30:15;if(x>=m.dx-hw&&x<=m.dx+hw&&y>=m.dy-top&&y<=m.dy+3){const d=Math.abs(x-m.dx)+Math.abs(y-(m.dy-top/2));if(d<bd){bd=d;b=m;}}}return b;}
function playerAt(x,y){for(const p of G.players.values()){if(p.id===myId)continue;if(Math.abs(x-p.dx)<7&&y>p.dy-15&&y<p.dy+3)return p;}return null;}
function nearNpc(){if(G.kind!=='hub')return null;const m=G.map;if(Math.hypot(me.x-m.merchant.x,me.y-m.merchant.y)<40)return 'merchant';if(Math.hypot(me.x-m.portal.x,me.y-m.portal.y)<48)return 'portal';return null;}
function npcAt(x,y){if(G.kind!=='hub')return null;const m=G.map;if(Math.abs(x-m.merchant.x)<9&&y>m.merchant.y-16&&y<m.merchant.y+3)return 'merchant';if(Math.hypot(x-m.portal.x,y-m.portal.y)<16)return 'portal';return null;}
function openNpc(n){if(n==='merchant'){showShop=true;showInv=true;G.portalMenu=false;}else if(n==='portal'){G.portalMenu=true;showShop=false;}}
function interact(){const n=nearNpc();if(n){openNpc(n);return;}let b=null,bd=26;for(const d of G.drops.values()){if(d.kind!=='item'||d.t<0.45)continue;const dd=Math.hypot(d.x-me.x,d.y-me.y);if(dd<bd){bd=dd;b=d;}}if(b)net({t:'pick',id:b.id});}
function anyPanel(){return showInv||showChar||showShop||G.portalMenu||G.escMenu||G.ctxMenu||G.result;}
cv.addEventListener('pointermove',e=>setMouse(e));
cv.addEventListener('pointerdown',e=>{e.preventDefault();setMouse(e);initAudio();if(chatBox.style.display==='block'){chatBox.style.display='none';chatBox.value='';}cv.focus();if(scene!=='game')return;
  mouse.wx=mouse.x+camX;mouse.wy=mouse.y+camY;
  if(e.button===2){const r=uiHit();if(r){r.right&&r.right();return;}if(G.ctxMenu){G.ctxMenu=null;return;}if(G.paused&&inDungeon())return;castSkill(G.sel||0,mouse.wx,mouse.wy);return;}
  if(e.button!==0)return;
  const r=uiHit();if(r){r.click&&r.click();return;}
  if(G.ctxMenu){G.ctxMenu=null;return;}
  if(G.result){G.result=null;return;}
  if(inDungeon()&&G.paused)return;
  const dd=dropUnderMouse();if(dd){me.pickTarget=dd;setGoal(dd.x,dd.y);pressMode='pick';return;}
  const pl=playerAt(mouse.wx,mouse.wy);if(pl){G.ctxMenu={id:pl.id,x:mouse.x,y:mouse.y};return;}
  const npc=npcAt(mouse.wx,mouse.wy);if(npc){if(nearNpc()===npc)openNpc(npc);else{me.goal=npc;const t=npc==='merchant'?G.map.merchant:G.map.portal;setGoal(t.x,t.y+(npc==='merchant'?10:14));}return;}
  if(inDungeon()){input.left=true;pressMode='attack';}});
window.addEventListener('pointerup',e=>{if(e.button===0)input.left=false;});
cv.addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('blur',()=>{keys.clear();input.left=false;showMeter=false;});
window.addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='Tab')showMeter=false;});
window.addEventListener('keydown',e=>{
  if(scene!=='game')return;
  if(document.activeElement===chatBox){if(e.key==='Enter'){const m=chatBox.value.trim();if(m)net({t:'chat',m});chatBox.value='';chatBox.style.display='none';cv.focus();e.preventDefault();}else if(e.key==='Escape'){chatBox.value='';chatBox.style.display='none';cv.focus();e.preventDefault();}return;}
  const c=e.code;initAudio();
  if(MOVEK[c]){keys.add(c);e.preventDefault();}
  if(c==='Space'||c==='Tab')e.preventDefault();
  if(c==='Enter'){openChat();e.preventDefault();return;}
  if(c==='Tab'){showMeter=true;return;}
  if(c==='Escape'){
    if(G.ctxMenu){G.ctxMenu=null;return;}if(G.result){G.result=null;return;}
    if(showInv||showChar||showShop||G.portalMenu){showInv=showChar=showShop=false;G.portalMenu=false;return;}
    if(inDungeon()){net({t:'pause'});return;}
    G.escMenu=!G.escMenu;return;}
  if(c==='KeyM'){soundMode=(soundMode+1)%3;try{localStorage.setItem('bc_sound',String(soundMode));}catch(er){}msg(['소리 켬','배경음 끔 · 효과음만','소리 끔'][soundMode]);return;}
  if(c==='KeyI'){showInv=!showInv;if(!showInv)showShop=false;return;}
  if(c==='KeyC'){showChar=!showChar;return;}
  if(G.invite&&(c==='KeyY'||c==='KeyN')){net({t:'ians',from:G.invite.from,ok:c==='KeyY'});G.invite=null;return;}
  if(inDungeon()&&G.paused)return;
  if(c.startsWith('Digit')){const i=+c.slice(5)-1;if(i>=0&&i<4){G.sel=i;castSkill(i,mouse.wx,mouse.wy);}}
  else if(c==='KeyQ')usePot('hp');else if(c==='KeyE')usePot('mp');
  else if(c==='KeyF')interact();
  else if(c==='Space')dodge();});
function openChat(){const r=cv.getBoundingClientRect();const s=r.width/W;chatBox.style.left=(r.left+6*s)+'px';chatBox.style.top=(r.top+208*s)+'px';chatBox.style.width=(170*s)+'px';chatBox.style.display='block';chatBox.focus();}

// ================= 로컬 행동 =================
function usePot(k){if(meDowned()||potCd>0)return;if(!G.ch)return;if(G.ch.pots[k]<=0){msg(k==='hp'?'체력 물약이 없습니다':'마나 물약이 없습니다','#ff6a5a');sfx('no');return;}potCd=0.4;net({t:'pot',k});}
function castSkill(i,tx,ty){if(!G.ch||meDowned())return;if(!inDungeon()){msg('마을에서는 스킬을 쓸 수 없습니다','#9e937a');return;}
  const sid=CLASSES[G.ch.cls].skills[i];const sk=SKILLS[sid];if((localCd[sid]||0)>time){return;}if(G.mev[2]<sk.mp){msg('마나가 부족합니다','#7aa2ff');sfx('no');return;}
  localCd[sid]=time+sk.cd;G.sel=i;me.face=tx<me.x?-1:1;net({t:'sk',i,x:Math.round(tx),y:Math.round(ty)});me.path=null;me.pickTarget=null;}
function dodge(){if(meDowned()||me.dodgeCd>0||!G.map)return;let vx=0,vy=0;for(const k of keys){const v=MOVEK[k];if(v){vx+=v[0];vy+=v[1];}}
  if(!vx&&!vy){vx=mouse.wx-me.x;vy=mouse.wy-me.y;}const l=Math.hypot(vx,vy)||1;me.dodx=vx/l;me.dody=vy/l;me.dodgeT=0.28;me.dodgeCd=0.9;me.path=null;net({t:'dodge'});sfx('dodge');}
function tryAttack(){if(!G.ch||!G.S||meDowned()||me.atkCd>0)return;const a=Math.atan2(mouse.wy-(me.y-6),mouse.wx-me.x);me.atkCd=1/G.S.atkRate;net({t:'atk',a:Math.round(a*100)/100});
  if(CLASSES[G.ch.cls].basic.kind==='melee'){const dur=clamp(0.3*1.25/G.S.atkRate,0.13,0.36);me.atkKind='swing';me.atkAngle=a;me.atkDur=dur;me.atkAnim=dur;me.face=Math.cos(a)<0?-1:1;effects.push({type:'slash',pid:myId,a,t:0,d:dur,max:dur+0.08});sfx('swing');}}
function updateMe(dt){
  me.animT+=dt;me.flash=Math.max(0,me.flash-dt);me.atkCd-=dt;me.dodgeCd-=dt;potCd-=dt;if(me.atkAnim>0)me.atkAnim-=dt;if(me.spin>0)me.spin-=dt;
  const frozen=meDowned()||(inDungeon()&&(G.paused||G.trans>0&&G.trans<0.3))||!G.map||!G.S;
  me.moving=false;
  if(frozen){me.dodgeT=0;return;}
  if(me.dodgeT>0){me.dodgeT-=dt;const st=250*dt;SH.moveEnt(G.map,me,me.dodx*st,me.dody*st);me.moving=true;if(R()<0.7)part(me.x+rf(-3,3),me.y,0,0,'W',0.25,{z:rf(0,6)});}
  else{
    if(input.left&&pressMode==='attack'&&inDungeon()&&!uiHit())tryAttack();
    let kx=0,ky=0;for(const k of keys){const v=MOVEK[k];if(v){kx+=v[0];ky+=v[1];}}
    const slow=me.atkAnim>0?0.45:1;
    if(kx||ky){const l=Math.hypot(kx,ky),st=G.S.ms*dt*slow;SH.moveEnt(G.map,me,kx/l*st,ky/l*st);me.moving=true;me.path=null;me.pickTarget=null;me.goal=null;if(me.atkAnim<=0&&kx)me.face=kx<0?-1:1;}
    else if(me.path&&me.path.length&&me.atkAnim<=0){const wp=me.path[0],dx=wp.x-me.x,dy=wp.y-me.y,d=Math.hypot(dx,dy),st=G.S.ms*dt;if(Math.abs(dx)>0.3)me.face=dx<0?-1:1;
      if(d<=st){if(!SH.blocked(G.map,wp.x,wp.y,me.r)){me.x=wp.x;me.y=wp.y;}me.path.shift();}else{const ox=me.x,oy=me.y;SH.moveEnt(G.map,me,dx/d*st,dy/d*st);if(Math.hypot(me.x-ox,me.y-oy)<st*0.2)me.path.shift();}me.moving=true;}
  }
  if(me.pickTarget){const d=me.pickTarget;if(!G.drops.has(d.id))me.pickTarget=null;else if(Math.hypot(d.x-me.x,d.y-me.y)<18){net({t:'pick',id:d.id});me.pickTarget=null;me.path=null;}}
  if(me.goal&&nearNpc()===me.goal){openNpc(me.goal);me.goal=null;me.path=null;}
  me.sendT-=dt;if(me.sendT<=0){me.sendT=0.05;const s=`${Math.round(me.x*10)},${Math.round(me.y*10)},${me.face},${me.moving?1:0}`;if(s!==me.lastSent||R()<0.05){me.lastSent=s;net({t:'mv',x:Math.round(me.x*10)/10,y:Math.round(me.y*10)/10,f:me.face,m:me.moving?1:0});}}
}

// ================= 업데이트 =================
function explore(){if(!G.map||!G.explored)return;const tx=Math.floor(me.x/TS),ty=Math.floor(me.y/TS);let ch=false;for(let j=-7;j<=7;j++)for(let i=-10;i<=10;i++){if(i*i*0.5+j*j>52)continue;const x=tx+i,y=ty+j;if(x<0||y<0||x>=G.map.w||y>=G.map.h)continue;const k=y*G.map.w+x;if(!G.explored[k]){G.explored[k]=1;ch=true;}}if(ch)drawMini();}
function drawMini(){if(!G.map||G.kind!=='dungeon')return;const MW=G.map.w,MH=G.map.h;const id=miniX.createImageData(60,60),a=id.data;for(let y=0;y<MH&&y<60;y++)for(let x=0;x<MW&&x<60;x++){const k=y*MW+x;if(!G.explored[k])continue;const t=G.map.tiles[k];let c=null;if(t===1)c=[78,66,92];else if(t===2)c=[212,154,42];else if(SH.walk(G.map,x+1,y)||SH.walk(G.map,x-1,y)||SH.walk(G.map,x,y+1)||SH.walk(G.map,x,y-1))c=[30,24,38];if(c){const p=(y*60+x)*4;a[p]=c[0];a[p+1]=c[1];a[p+2]=c[2];a[p+3]=255;}}miniX.putImageData(id,0,0);}
let exploreT=0;
function updateParts(dt){for(let i=parts.length-1;i>=0;i--){const p=parts[i];p.life-=dt;if(p.life<=0){parts.splice(i,1);continue;}p.x+=p.vx*dt;p.y+=p.vy*dt;
  if(p.g||p.vz){p.vz+=p.g*dt;p.z+=p.vz*dt;if(p.z<0){p.z=0;if(p.ground){p.vz=-p.vz*0.35;p.vx*=0.5;p.vy*=0.5;}else p.vz=0;}}
  if(!p.g){p.vx*=1-dt*3;p.vy*=1-dt*3;}}}
function update(dt){
  time+=dt;
  updateMe(dt);
  const lerp=1-Math.exp(-dt*14);
  for(const p of G.players.values()){if(p.id===myId){p.dx=me.x;p.dy=me.y;continue;}p.dx+=(p.x-p.dx)*lerp;p.dy+=(p.y-p.dy)*lerp;p.animT+=dt;p.flash=Math.max(0,p.flash-dt);if(p.atkAnim>0)p.atkAnim-=dt;if(p.spin>0)p.spin-=dt;}
  for(const m of G.monsters.values()){m.dx+=(m.x-m.dx)*lerp;m.dy+=(m.y-m.dy)*lerp;m.animT+=dt;m.flash=Math.max(0,m.flash-dt);if((m.fl&1)&&R()<dt*8)part(m.dx+rf(-5,5),m.dy,0,0,'c',0.7,{z:rf(0,12),vz:18,glow:true});if((m.fl&2)&&R()<dt*8)part(m.dx+rf(-5,5),m.dy,0,0,'w',0.5,{z:rf(0,12),vz:8});}
  for(const p of G.projs.values()){const age=Math.min(0.12,time-p.st);const tx=p.x+p.vx*age,ty=p.y+p.vy*age;p.dx+=(tx-p.dx)*Math.min(1,dt*25);p.dy+=(ty-p.dy)*Math.min(1,dt*25);
    if(p.type==='fire'&&R()<0.9)part(p.dx,p.dy,rf(-10,10),rf(-10,10),pick(['o','r','y']),rf(.15,.35),{z:p.h,vz:rf(0,20),glow:true});
    if(p.type==='orb'&&R()<0.6)part(p.dx,p.dy,rf(-6,6),rf(-6,6),pick(['p','e']),rf(.15,.3),{z:p.h,glow:true});
    if(p.type==='bolt'&&R()<0.6)part(p.dx,p.dy,0,0,pick(['c','P']),rf(.15,.3),{z:p.h,glow:true});
    if(p.type==='holy'&&R()<0.6)part(p.dx,p.dy,0,0,pick(['y','w']),rf(.15,.3),{z:p.h,glow:true});
    if(p.type==='pierce'&&R()<0.8)part(p.dx,p.dy,0,0,'c',rf(.15,.3),{z:p.h,glow:true});}
  for(const d of G.drops.values()){d.t+=dt;if(d.kind==='item'&&d.it.rar>=2&&d.t>0.45&&R()<dt*6)part(d.x+rf(-2,2),d.y,0,0,d.it.rar===3?'o':'y',0.8,{z:rf(0,6),vz:rf(15,30),glow:true});}
  for(const z of G.zones){if(z.type===0&&R()<dt*20)part(z.x+rf(-z.r,z.r)*0.8,z.y+rf(-z.r,z.r)*0.5,0,0,pick(['y','w','z']),rf(.5,.9),{z:0,vz:rf(15,35),glow:true});
    if(z.type===1)for(let n=0;n<2;n++)if(R()<dt*30){const x=z.x+rf(-z.r,z.r)*0.9,y=z.y+rf(-z.r,z.r)*0.55;effects.push({type:'arrowfall',x,y,t:0,max:0.18});}}
  updateParts(dt);
  for(let i=effects.length-1;i>=0;i--){effects[i].t+=dt;if(effects[i].t>=effects[i].max)effects.splice(i,1);}
  for(let i=texts.length-1;i>=0;i--){const t=texts[i];t.t+=dt;t.x+=t.vx*dt;t.y+=t.vy*dt;t.vy+=120*dt;if(t.t>0.95)texts.splice(i,1);}
  for(let i=msgs.length-1;i>=0;i--){msgs[i].life-=dt;if(msgs[i].life<=0)msgs.splice(i,1);}
  for(const [id,b] of G.bubbles)if(time-b.t>5)G.bubbles.delete(id);
  exploreT-=dt;if(exploreT<=0){exploreT=0.2;explore();}
  if(banner){banner.t+=dt;if(banner.t>3)banner=null;}
  shake=Math.max(0,shake-dt*10);
  camX=me.x-W/2;camY=me.y-H/2+10;
  mouse.wx=mouse.x+camX;mouse.wy=mouse.y+camY;
  const onUI=uiHit();hoverMon=onUI?null:monsterAt(mouse.wx,mouse.wy);hoverDrop=onUI?null:dropUnderMouse();hoverPl=onUI?null:playerAt(mouse.wx,mouse.wy);
}

// ================= 렌더링 =================
function pr(x,y,w,h,c){ctx.fillStyle=col(c);ctx.fillRect(Math.round(x*SC),Math.round(y*SC),Math.round(w*SC),Math.round(h*SC));}
function pimg(img,x,y,s){s=s||1;ctx.drawImage(img,Math.round(x*SC),Math.round(y*SC),img.width*SC*s,img.height*SC*s);}
function wpx(x,y,c){wx.fillStyle=col(c);wx.fillRect(x|0,y|0,1,1);}
function drawTiles(icx,icy){const map=G.map,hub=!!map.hub;const x0=Math.floor(icx/TS)-1,y0=Math.floor(icy/TS)-1,x1=x0+Math.ceil(W/TS)+2,y1=y0+Math.ceil(H/TS)+2;
  for(let ty=y0;ty<=y1;ty++)for(let tx=x0;tx<=x1;tx++){const t=SH.tileAt(map,tx,ty),sx=tx*TS-icx,sy=ty*TS-icy,h=((tx*73856093)^(ty*19349663))>>>0;
    if(t===1||t===3)wx.drawImage(hub?HUBFLOOR[h%4]:FLOORS[h%FLOORS.length],sx,sy);
    else if(t===2)wx.drawImage(STAIRS,sx,sy);
    else if(SH.tileAt(map,tx,ty+1)>0)wx.drawImage(WALLS[h%WALLS.length],sx,sy);
    else{let nb=false;for(let j=-1;j<=1&&!nb;j++)for(let i=-1;i<=1;i++)if(SH.tileAt(map,tx+i,ty+j)>0){nb=true;break;}
      if(nb){wx.fillStyle=PAL.k;wx.fillRect(sx,sy,16,16);wx.fillStyle=PAL.m;if(SH.tileAt(map,tx-1,ty)>0)wx.fillRect(sx,sy,1,16);if(SH.tileAt(map,tx+1,ty)>0)wx.fillRect(sx+15,sy,1,16);if(SH.tileAt(map,tx,ty-1)>0)wx.fillRect(sx,sy,16,1);
        wx.fillStyle=PAL.D;if(SH.tileAt(map,tx-1,ty)>0)wx.fillRect(sx+1,sy,1,16);if(SH.tileAt(map,tx+1,ty)>0)wx.fillRect(sx+14,sy,1,16);if(SH.tileAt(map,tx,ty-1)>0)wx.fillRect(sx,sy+1,16,1);}}}}
function pickFrame(e,fr){let set,idx;if(e.atkAnim>0){set=fr.atk;idx=Math.min(2,Math.floor((1-e.atkAnim/e.atkDur)*3));}else if(e.moving){set=fr.walk;idx=Math.floor(e.animT*(e.fast?16:8))%4;}else{set=fr.idle;idx=Math.floor(e.animT*2)%2;}const f=set[idx];return e.face<0?f.l:f.r;}
function drawPlayer(p,icx,icy,isMe){const cls=isMe?myCls():(p.cls||'warrior');const src=isMe?me:p;const fr=FRP[cls];
  const e={atkAnim:src.atkAnim,atkDur:src.atkDur,moving:isMe?me.moving:p.moving,animT:src.animT,face:isMe?me.face:p.face};const s=pickFrame(e,fr);
  const bx=Math.round(isMe?me.x:p.dx)-icx,by=Math.round(isMe?me.y:p.dy)-icy;
  wx.drawImage(SH_S,bx-6,by-1);
  if(p&&p.downed){wx.save();wx.translate(bx,by-3);wx.rotate(Math.PI/2*(p.face<0?-1:1));wx.globalAlpha=0.75;wx.drawImage(s.c,-s.w/2,-s.h/2);wx.restore();wx.globalAlpha=1;
    if((time*3|0)%2===0){wpx(bx,by-12,'e');wpx(bx,by-13,'e');wpx(bx,by-14,'e');wpx(bx,by-10,'e');}return s;}
  const dodging=isMe?me.dodgeT>0:p.dodge;if(dodging)wx.globalAlpha=((time*30|0)&1)?0.35:0.7;
  const flash=isMe?me.flash:p.flash;
  const sx=bx-(s.w>>1),sy=by-s.h+2;
  if(cls==='guardian'&&!(src.spin>0))drawShield(bx,by,e.face,false);
  wx.drawImage(flash>0?s.fc:s.c,sx,sy);
  drawWeapon(cls,src,bx,by,e.face,isMe?(G.ch&&G.ch.eq.weapon):null,p&&p.look);
  if(cls==='guardian'&&!(src.spin>0))drawShield(bx,by,e.face,true);
  if(p&&p.shield){wx.globalAlpha=0.5;for(let n=0;n<24;n++){const t=n/24*Math.PI*2+time*2;if(n%2)wpx(Math.round(bx+Math.cos(t)*9),Math.round(by-6+Math.sin(t)*10),'c');}}
  wx.globalAlpha=1;return s;}
function drawShield(bx,by,face,front){if(front!==(face>0))return;const x=bx+(face>0?4:-8),y=by-9;wx.fillStyle=PAL.k;wx.fillRect(x-1,y-1,6,8);wx.fillStyle=PAL.C;wx.fillRect(x,y,4,6);wx.fillStyle=PAL.y;wx.fillRect(x+1,y+1,2,4);wx.fillStyle=PAL.n;wx.fillRect(x,y+5,4,1);}
function drawWeapon(cls,src,bx,by,f,wItem,look){const fam=CLASSES[cls].fam;const kind=wItem?wItem.kind:look&&look.w?look.w:(fam==='melee'?'sword':fam==='bow'?'shortbow':'staff');
  if(fam==='bow'){const hx=bx+(f>0?5:-6),hy=by-7;let a=src.atkAnim>0?src.atkAngle:(f>0?0:Math.PI);const L=kind==='longbow'?7:5;const ca=Math.cos(a),sa=Math.sin(a),pa=a+Math.PI/2;
    for(let t=-L;t<=L;t++){const bend=Math.sqrt(Math.max(0,L*L-t*t))*0.5;wpx(Math.round(hx+Math.cos(pa)*t+ca*bend),Math.round(hy+Math.sin(pa)*t+sa*bend),kind==='crossbow'?'S':'b');}
    const pull=src.atkAnim>0?-2:0;lineP(wpx,Math.round(hx+Math.cos(pa)*L+ca*pull),Math.round(hy+Math.sin(pa)*L+sa*pull),Math.round(hx-Math.cos(pa)*L+ca*pull),Math.round(hy-Math.sin(pa)*L+sa*pull),'w');return;}
  if(fam==='staff'){const hx=bx+(f>0?4:-5),hy=by-3;const tilt=src.atkAnim>0?(f>0?0.6:-0.6):(f>0?0.15:-0.15);const len=kind==='wand'?7:12;const tx=Math.round(hx+Math.sin(tilt)*len),ty=Math.round(hy-Math.cos(tilt)*len);
    lineP(wpx,hx,hy+2,tx,ty,kind==='scepter'?'g':'b');const gem=cls==='priest'?'y':kind==='wand'?'c':'p';wx.fillStyle=PAL.k;wx.fillRect(tx-2,ty-2,4,4);wx.fillStyle=PAL[gem];wx.fillRect(tx-1,ty-1,2,2);wpx(tx-1,ty-1,'w');
    if(src.atkAnim>0){for(let n=0;n<3;n++)wpx(tx+ri(-2,2),ty+ri(-2,2),gem);}return;}
  const hx=bx+(f>0?4:-5),hy=by-5;const len={dagger:6,sword:9,great:12,axe:9,mace:9}[kind]||9;let a,world=false;const swing=src.atkAnim>0&&src.atkKind==='swing';
  if(src.spin>0)a=(1-src.spin/0.3)*Math.PI*2.4;else if(swing){const prog=1-src.atkAnim/src.atkDur;a=src.atkAngle+f*(-1.7+prog*3.4);world=true;}else a=-1.0+(src.moving?Math.sin(src.animT*10)*0.15:0);
  if(f<0&&!world)a=Math.PI-a;const ca=Math.cos(a),sa=Math.sin(a);
  if(swing){const prog=1-src.atkAnim/src.atkDur;if(prog>0.3&&prog<0.8){wx.globalAlpha=0.5;for(let k=1;k<8;k++){const aa=a-(f>0?1:-1)*k*0.13;wpx(Math.round(hx+Math.cos(aa)*(len-1)),Math.round(hy+Math.sin(aa)*(len-1)),'w');}wx.globalAlpha=1;}}
  const blade=kind==='axe'||kind==='mace'?'b':'s';
  for(let i=2;i<=len;i++)wpx(Math.round(hx+ca*i),Math.round(hy+sa*i)+1,'k');
  for(let i=1;i<=len;i++){const x=Math.round(hx+ca*i),y=Math.round(hy+sa*i);wpx(x,y,i===1?'g':i===len&&blade==='s'?'w':blade);}
  const pa=a+Math.PI/2;wpx(Math.round(hx+ca*2+Math.cos(pa)*1.6),Math.round(hy+sa*2+Math.sin(pa)*1.6),'g');wpx(Math.round(hx+ca*2-Math.cos(pa)*1.6),Math.round(hy+sa*2-Math.sin(pa)*1.6),'g');
  if(kind==='axe'){for(let k=-2;k<=2;k++)for(let j=0;j<2;j++)wpx(Math.round(hx+ca*(len-j)+Math.cos(pa)*k),Math.round(hy+sa*(len-j)+Math.sin(pa)*k),k>0?'s':'S');}
  if(kind==='mace'){const tx=Math.round(hx+ca*len),ty=Math.round(hy+sa*len);wx.fillStyle=PAL.S;wx.fillRect(tx-1,ty-1,3,3);wpx(tx-1,ty-1,'s');}}
function drawMonster(m,icx,icy){const fr=FRM[m.type];const boss=m.tc===3;const wd=WIND_DUR[m.wc]||0.35;
  const e={atkAnim:m.atkT>0?m.atkT:0,atkDur:m.atkT>0?Math.max(m.atkT,wd):1,moving:!!(m.fl&(64|32)),animT:m.animT,face:m.face,fast:!!(m.fl&32)};const s=pickFrame(e,fr);m._s=s;
  const bx=Math.round(m.dx)-icx,by=Math.round(m.dy)-icy;const sh=boss?SH_B:SH_S;wx.drawImage(sh,bx-(sh.width>>1),by-(sh.height>>1)+1);
  let sx=bx-(s.w>>1),sy=by-s.h+2;if(m.wc===3)sx+=(Math.floor(time*30)&1)?1:-1;if(m.wc===5)sy+=(Math.floor(time*20)&1);
  wx.drawImage(m.flash>0?s.fc:s.c,sx,sy);
  if((m.fl&1)&&m.flash<=0){wx.globalAlpha=0.35;wx.drawImage(s.fc,sx,sy);wx.globalAlpha=1;}
  if(m.fl&4){for(let n=0;n<3;n++){const t=time*5+n*2.1;wpx(Math.round(bx+Math.cos(t)*5),Math.round(sy-2+Math.sin(t)*1.5),'y');}}}
function drawMerchant(icx,icy){const m=G.map.merchant;const bx=Math.round(m.x)-icx,by=Math.round(m.y)-icy;wx.drawImage(SH_S,bx-6,by-1);const bob=(time*2|0)%2;wx.drawImage(MERCHANT.c,bx-8,by-14+bob);
  const lx0=bx+6,ly0=by-10+bob;wx.fillStyle=PAL.k;wx.fillRect(lx0-1,ly0-1,4,5);wx.fillStyle=((time*6)|0)%3?PAL.y:PAL.o;wx.fillRect(lx0,ly0,2,3);}
function drawProps(icx,icy,ents){for(const p of G.map.props||[]){const sx=Math.round(p.x)-icx,sy=Math.round(p.y)-icy;if(sx<-40||sx>W+40||sy<-40||sy>H+40)continue;
  if(p.t==='fountain')ents.push({y:p.y+2,f:()=>{wx.drawImage(FOUNTAIN,sx-17,sy-18);for(let n=0;n<10;n++){const t=(time*1.3+n/10)%1;const a=n/10*Math.PI*2;wpx(Math.round(sx+Math.cos(a)*t*9),Math.round(sy-16+t*t*14-t*6),t>0.7?'C':'c');}if((time*4|0)%2)wpx(sx,sy-18,'w');}});
  else if(p.t==='banner'){wx.drawImage(PROP.banner.c,sx-4,sy);}
  else{const sp=PROP[p.t];ents.push({y:p.y,f:()=>{wx.drawImage(SH_S,sx-6,sy+2);wx.drawImage(sp.c,sx-5,sy-6);}});}}}
function drawPortal(icx,icy,glow){const p=G.map.portal;const cx=Math.round(p.x)-icx,cy=Math.round(p.y)-icy;
  if(!glow){for(let j=-14;j<=6;j++)for(let i=-12;i<=12;i++){const d=Math.hypot(i,(j+4)*0.9);if(d<=12&&d>10)wpx(cx+i,cy+j,((i+j)&1)?'S':'m');}
    for(let j=-12;j<=4;j++)for(let i=-10;i<=10;i++){const d=Math.hypot(i,(j+4)*0.9);if(d<=10)wpx(cx+i,cy+j,'k');}return;}
  for(let n=0;n<60;n++){const t=n/60*Math.PI*2+time*(n%2?2:-1.4);const r=3+((n*7)%8)+Math.sin(time*3+n)*0.8;wpx(Math.round(cx+Math.cos(t)*r),Math.round(cy-4+Math.sin(t)*r*0.9),n%3===0?'e':n%3===1?'p':'r');}
  wpx(cx,cy-4,'w');}
function drawDrop(d,icx,icy){let x=d.x,y=d.y,z=0;if(d.t<0.45){const k=d.t/0.45;x=d.sx+(d.x-d.sx)*k;y=d.sy+(d.y-d.sy)*k;z=Math.sin(k*Math.PI)*16;}
  const sx=Math.round(x)-icx,sy=Math.round(y-z)-icy;if(sx<-20||sy<-20||sx>W+20||sy>H+20)return;
  if(d.kind==='gold')wx.drawImage(GOLD,sx-4,sy-4);else if(d.kind==='hp')wx.drawImage(POT_HP,sx-8,sy-8);else if(d.kind==='mp')wx.drawImage(POT_MP,sx-8,sy-8);else wx.drawImage(iconFor(d.it),sx-8,sy-13);}
const RAR=[{n:'일반',c:'#e6dcc3',bg:'#241e2b'},{n:'마법',c:'#7aa2ff',bg:'#1c2440'},{n:'희귀',c:'#ffd35a',bg:'#3a3016'},{n:'전설',c:'#ff8a1f',bg:'#40220c'}];
function drawBeam(d,icx,icy){if(d.kind!=='item'||d.it.rar<1||d.t<0.45)return;const hgt=[0,16,34,56][d.it.rar];const sx=Math.round(d.x)-icx,sy=Math.round(d.y)-icy;if(sx<-5||sx>W+5||sy<-5||sy>H+hgt)return;
  const pulse=0.7+0.3*Math.sin(time*4+d.x);wx.fillStyle=RAR[d.it.rar].c;wx.globalAlpha=0.2*pulse;wx.fillRect(sx-1,sy-hgt,3,hgt);wx.globalAlpha=0.6*pulse;for(let yy=(time*20|0)%2;yy<hgt;yy+=2)wx.fillRect(sx,sy-yy,1,1);wx.globalAlpha=1;}
function drawProj(p,icx,icy,glow){const sx=Math.round(p.dx)-icx,sy=Math.round(p.dy-p.h)-icy;
  if(!glow){wx.fillStyle='rgba(0,0,0,0.4)';wx.fillRect(Math.round(p.dx)-icx-1,Math.round(p.dy)-icy,3,1);}
  if(p.type==='arrow'||p.type==='parrow'){if(glow)return;const l=Math.hypot(p.vx,p.vy)||1,ux=p.vx/l,uy=p.vy/l;for(let i=0;i<6;i++)wpx(Math.round(sx-ux*i),Math.round(sy-uy*i),i===0?'s':i>=4?(p.type==='parrow'?'z':'w'):'W');}
  else if(p.type==='pierce'){if(!glow)return;const l=Math.hypot(p.vx,p.vy)||1,ux=p.vx/l,uy=p.vy/l;for(let i=0;i<9;i++)wpx(Math.round(sx-ux*i),Math.round(sy-uy*i),i<2?'w':i<5?'c':'C');}
  else if(glow){const [a,b,c]=p.type==='fire'?['r','o','y']:p.type==='orb'?['p','e','y']:p.type==='bolt'?['C','c','w']:['g','y','w'];wx.fillStyle=PAL[a];wx.fillRect(sx-2,sy-1,5,3);wx.fillRect(sx-1,sy-2,3,5);wx.fillStyle=PAL[b];wx.fillRect(sx-1,sy-1,3,3);wpx(sx,sy,c);if((time*20|0)&1)wpx(sx-1,sy,c);}}
function drawZone(z,icx,icy){const sx=Math.round(z.x)-icx,sy=Math.round(z.y)-icy;const r=z.r,ry=Math.round(r*0.6);
  const c=z.type===0?'y':'W';for(let n=0;n<72;n++){const t=n/72*Math.PI*2+(z.type===0?time*0.8:0);if(n%2)wpx(Math.round(sx+Math.cos(t)*r),Math.round(sy+Math.sin(t)*ry),c);}
  if(z.type===0){wx.globalAlpha=0.35;for(let j=-ry;j<=ry;j++)for(let i=-r;i<=r;i++){if(i*i+(j/0.6)**2>r*r)continue;if(((i+j+(time*6|0))&3)===0)wpx(sx+i,sy+j,'z');}wx.globalAlpha=1;}}
function epos(e){if(e.pid!=null){const p=e.pid===myId?me:G.players.get(e.pid);if(p)return [e.pid===myId?me.x:p.dx,e.pid===myId?me.y:p.dy];}return [e.x,e.y];}
function drawEffect(e,icx,icy){const [ex,ey]=epos(e);const sx=Math.round(ex)-icx,sy=Math.round(ey)-icy,k=e.t/e.max;
  if(e.type==='tele'){const r=e.r,rr=r*k,ry=Math.ceil(r*0.6);for(let j=-ry;j<=ry;j++)for(let i=-r;i<=r;i++){const e2=i*i+(j/0.6)**2;if(e2>r*r)continue;if(e2>=(r-1.5)**2)wpx(sx+i,sy+j,'e');else if(e2<=rr*rr&&((i+j+(time*10|0))&3)===0)wpx(sx+i,sy+j,'r');}}
  else if(e.type==='boom'){const r=Math.round(4+(e.r-4)*Math.min(1,k*2)),ry=Math.ceil(r*0.7);for(let j=-ry;j<=ry;j++)for(let i=-r;i<=r;i++){const d=Math.sqrt(i*i+(j/0.7)**2)/r;if(d>1)continue;if(k>0.5&&((i+j)&1))continue;wpx(sx+i,sy+j-3,d<0.35?'y':d<0.7?'o':'r');}}
  else if(e.type==='nova'){const r=66*k;wx.globalAlpha=1-k*0.6;for(let n=0;n<96;n++){const t=n/96*Math.PI*2;wpx(Math.round(sx+Math.cos(t)*r),Math.round(sy+Math.sin(t)*r*0.6),'c');wpx(Math.round(sx+Math.cos(t)*(r-2)),Math.round(sy+Math.sin(t)*(r-2)*0.6),n%2?'C':'w');}wx.globalAlpha=1;}
  else if(e.type==='ring'){const r=e.r*Math.min(1,k*1.4);wx.globalAlpha=1-k;for(let n=0;n<110;n++){const t=n/110*Math.PI*2;wpx(Math.round(sx+Math.cos(t)*r),Math.round(sy-4+Math.sin(t)*r*0.55),n%2?e.c:e.c2);}wx.globalAlpha=1;}
  else if(e.type==='whirl'){for(let n=0;n<34;n++){const t=e.a0+k*Math.PI*2.2-n*0.08;wx.globalAlpha=Math.max(0,1-n/34);wpx(Math.round(sx+Math.cos(t)*20),Math.round(sy-5+Math.sin(t)*12),n<8?'w':'s');wpx(Math.round(sx+Math.cos(t)*17),Math.round(sy-5+Math.sin(t)*10),'S');}wx.globalAlpha=1;}
  else if(e.type==='slash'){const s0=e.d*0.35;if(e.t<s0)return;const k2=(e.t-s0)/(e.max-s0),px=sx,py=sy-6;wx.globalAlpha=Math.max(0,1-k2);for(let n=0;n<22;n++){const t=e.a-1.1+n*0.1,r=14+(n%3===0?1:0);wpx(Math.round(px+Math.cos(t)*r),Math.round(py+Math.sin(t)*r*0.8),n>8&&n<14?'w':'s');wpx(Math.round(px+Math.cos(t)*(r-2)),Math.round(py+Math.sin(t)*(r-2)*0.8),'S');}wx.globalAlpha=1;}
  else if(e.type==='cleave'){wx.globalAlpha=1-k;for(let rr=20;rr<=58;rr+=3)for(let n=0;n<26;n++){const t=e.a-0.75+n*0.06;if(((n+rr)&1))continue;wpx(Math.round(sx+Math.cos(t)*rr*(0.4+k*0.6)),Math.round(sy-3+Math.sin(t)*rr*0.6*(0.4+k*0.6)),rr>50?'w':rr>35?'o':'r');}wx.globalAlpha=1;}
  else if(e.type==='star'){const r=Math.round(3+k*8);for(let n=0;n<8;n++){const t=n/8*Math.PI*2;lineP(wpx,sx,sy-6,Math.round(sx+Math.cos(t)*r),Math.round(sy-6+Math.sin(t)*r),n%2?'y':'w');}}
  else if(e.type==='dash'){wx.globalAlpha=1-k;const x1=e.x1-icx,y1=e.y1-icy,x2=e.x2-icx,y2=e.y2-icy;for(let o=-3;o<=3;o+=2)lineP(wpx,x1,y1-5+o,x2,y2-5+o,o===-1||o===1?'w':'S');wx.globalAlpha=1;}
  else if(e.type==='hook'){const x1=e.x1-icx,y1=e.y1-icy-4,x2=e.x2-icx,y2=e.y2-icy-4;const kk=k<0.5?k*2:2-k*2;const mx=x1+(x2-x1)*kk,my=y1+(y2-y1)*kk;const n=Math.max(2,Math.round(Math.hypot(mx-x1,my-y1)/3));for(let i=0;i<=n;i++){const t=i/n;wpx(Math.round(x1+(mx-x1)*t),Math.round(y1+(my-y1)*t),i%2?'S':'s');}wpx(Math.round(mx),Math.round(my),'w');}
  else if(e.type==='chain'){wx.globalAlpha=1-k;for(let i=0;i<e.pts.length-1;i++){const [ax,ay]=e.pts[i],[bx2,by2]=e.pts[i+1];let px=ax-icx,py=ay-icy;const segs=6;for(let s=1;s<=segs;s++){const t=s/segs;const nx=ax-icx+(bx2-ax)*t+(s<segs?rf(-3,3):0),ny=ay-icy+(by2-ay)*t+(s<segs?rf(-3,3):0);lineP(wpx,px,py,nx,ny,s%2?'y':'w');px=nx;py=ny;}}wx.globalAlpha=1;}
  else if(e.type==='smite'){wx.globalAlpha=1-k;for(let j=0;j<60;j++){wpx(sx,sy-j,'w');wpx(sx-1,sy-j,'y');wpx(sx+1,sy-j,'y');if(j%3===0){wpx(sx-2,sy-j,'g');wpx(sx+2,sy-j,'g');}}const r=Math.round(6+k*20);for(let n=0;n<48;n++){const t=n/48*Math.PI*2;wpx(Math.round(sx+Math.cos(t)*r),Math.round(sy+Math.sin(t)*r*0.6),'y');}wx.globalAlpha=1;}
  else if(e.type==='arrowfall'){const y0=sy-30+k*30;for(let i=0;i<5;i++)wpx(sx+Math.round(i*0.3),Math.round(y0-i),i===0?'s':'b');if(k>0.9){wpx(sx-1,sy,'W');wpx(sx+1,sy,'W');}}
  else if(e.type==='click'){const r=Math.round(4*(1-k))+1;wpx(sx-r,sy,'g');wpx(sx+r,sy,'g');wpx(sx,sy-r,'g');wpx(sx,sy+r,'g');}
  else if(e.type==='tp'){wx.globalAlpha=1-k;for(let n=0;n<14;n++){const yy=Math.round(-k*24-rf(0,18)),xx=Math.round(rf(-5,5));wpx(sx+xx,sy+yy,n%3?'p':'c');}wx.globalAlpha=1;}
  else if(e.type==='pillar'){wx.globalAlpha=1-k;for(let j=0;j<40;j++){if(((j+(time*20|0))&1))continue;wpx(sx-3,sy-j,'y');wpx(sx+3,sy-j,'y');wpx(sx,sy-j-rf(0,4),'w');}wx.globalAlpha=1;}
  else if(e.type==='lvl'){const r=6+k*22;wx.globalAlpha=1-k;for(let n=0;n<40;n++){const t=n/40*Math.PI*2;wpx(Math.round(sx+Math.cos(t)*r),Math.round(sy+Math.sin(t)*r*0.5-k*10),'y');}wx.globalAlpha=1;}}
function drawParts(icx,icy,glow){for(const p of parts){if(p.glow!==glow)continue;const x=Math.round(p.x)-icx,y=Math.round(p.y-p.z)-icy;if(x<0||y<0||x>=W||y>=H)continue;wx.globalAlpha=p.life<p.max*0.35?p.life/(p.max*0.35):1;wx.fillStyle=col(p.c);wx.fillRect(x,y,1,1);}wx.globalAlpha=1;}
function computeLights(icx,icy){const L=[];
  L.push({x:me.x-icx,y:me.y-8-icy,r:meDowned()?100:150,i:1});
  for(const p of G.players.values()){if(p.id===myId)continue;L.push({x:p.dx-icx,y:p.dy-8-icy,r:110,i:0.95});}
  for(const t of torches){const x=t.x-icx,y=t.y+4-icy;if(x<-80||x>W+80||y<-80||y>H+80)continue;L.push({x,y,r:66+Math.sin(time*9+t.ph)*3+Math.sin(time*23+t.ph)*2,i:1});}
  for(const p of G.projs.values()){if(p.type!=='arrow'&&p.type!=='parrow')L.push({x:p.dx-icx,y:p.dy-p.h-icy,r:p.type==='fire'?46:32,i:1});}
  for(const e of effects){if(e.type==='boom')L.push({x:e.x-icx,y:e.y-icy,r:70*(1-e.t/e.max)+10,i:1});else if(e.type==='nova'||e.type==='smite')L.push({x:e.x-icx,y:e.y-icy,r:90*(1-e.t/e.max)+10,i:.9});}
  for(const z of G.zones)L.push({x:z.x-icx,y:z.y-icy,r:z.r+20,i:z.type===0?0.9:0.6});
  if(G.kind==='dungeon'&&G.stairsOpen){const x=(G.map.stairsIdx%G.map.w)*TS+8-icx,y=((G.map.stairsIdx/G.map.w)|0)*TS+8-icy;L.push({x,y,r:40+Math.sin(time*3)*3,i:.9});}
  if(G.kind==='hub'){const p=G.map.portal;L.push({x:p.x-icx,y:p.y-4-icy,r:60+Math.sin(time*2)*4,i:1});const m=G.map.merchant;L.push({x:m.x+7-icx,y:m.y-9-icy,r:56,i:1});for(const pr0 of G.map.props||[])if(pr0.t==='fountain')L.push({x:pr0.x-icx,y:pr0.y-10-icy,r:50,i:0.9});}
  for(const d of G.drops.values())if(d.kind==='item'&&d.it.rar===3)L.push({x:d.x-icx,y:d.y-icy,r:28,i:.9});
  lightArr.fill(0);
  for(const l of L){const x0=Math.max(0,Math.floor(l.x-l.r)),x1=Math.min(W-1,Math.ceil(l.x+l.r)),y0=Math.max(0,Math.floor(l.y-l.r)),y1=Math.min(H-1,Math.ceil(l.y+l.r)),r2=l.r*l.r;
    for(let y=y0;y<=y1;y++){const dy=y-l.y,dy2=dy*dy;let idx=y*W+x0;for(let x=x0;x<=x1;x++,idx++){const dx=x-l.x,d2=dx*dx+dy2;if(d2<r2){const v=(1-d2/r2)*l.i;if(v>lightArr[idx])lightArr[idx]=v;}}}}
  const amb=G.kind==='hub'?0.42:0;const a=lightImg.data;let i=0;for(let y=0;y<H;y++){const by=(y&3)<<2;for(let x=0;x<W;x++,i++){const b=Math.max(lightArr[i],amb)*1.7;const q=b>=1?16:((b*5)|0)*4;a[i*4+3]=BAYER[by|(x&3)]>=q?255:0;}}
  lx.putImageData(lightImg,0,0);wx.drawImage(lc,0,0);}
function lit(x,y){x=Math.round(x);y=Math.round(y);if(x<0||y<0||x>=W||y>=H)return 0;return lightArr[y*W+x];}
function renderWorld(){const sx=shake>0?Math.round(rf(-shake,shake)):0,sy=shake>0?Math.round(rf(-shake,shake)):0;const icx=Math.round(camX)+sx,icy=Math.round(camY)+sy;
  wx.fillStyle='#050407';wx.fillRect(0,0,W,H);drawTiles(icx,icy);
  for(const t of torches){const x=t.x-icx-3,y=t.y-icy-4;if(x<-10||y<-14||x>W||y>H)continue;wx.drawImage(TORCH[(Math.floor(time*8+t.ph))&1],x,y);}
  if(G.kind==='hub')drawPortal(icx,icy,false);
  for(const z of G.zones)drawZone(z,icx,icy);
  for(const e of effects)if(e.under)drawEffect(e,icx,icy);
  for(const d of G.drops.values())drawDrop(d,icx,icy);
  const ents=[];for(const m of G.monsters.values())ents.push({y:m.dy,f:()=>drawMonster(m,icx,icy)});
  for(const p of G.players.values()){const isMe=p.id===myId;ents.push({y:isMe?me.y:p.dy,f:()=>drawPlayer(p,icx,icy,isMe)});}
  if(G.kind==='hub'){ents.push({y:G.map.merchant.y,f:()=>drawMerchant(icx,icy)});drawProps(icx,icy,ents);}
  ents.sort((a,b)=>a.y-b.y);for(const e of ents)e.f();
  for(const p of G.projs.values())drawProj(p,icx,icy,false);drawParts(icx,icy,false);
  for(const e of effects)if(!e.under)drawEffect(e,icx,icy);
  computeLights(icx,icy);
  if(G.kind==='hub')drawPortal(icx,icy,true);
  for(const d of G.drops.values())drawBeam(d,icx,icy);for(const p of G.projs.values())drawProj(p,icx,icy,true);drawParts(icx,icy,true);
  for(const t of torches){const x=t.x-icx-3,y=t.y-icy-4;if(x<-10||y<-14||x>W||y>H)continue;wx.drawImage(TORCH[(Math.floor(time*8+t.ph))&1],0,0,7,5,x,y,7,5);}
  ctx.drawImage(wc,0,0,W*SC,H*SC);return[icx,icy];}

// ================= UI =================
function slotBox(x,y,w,h,hl){pr(x,y,w,h,hl?PAL.y:PAL.k);pr(x+1,y+1,w-2,h-2,PAL.m);pr(x+2,y+2,w-4,h-4,PAL.k);}
function panel(x,y,w,h,title){pr(x,y,w,h,PAL.k);pr(x+1,y+1,w-2,h-2,PAL.G);pr(x+2,y+2,w-4,h-4,PAL.k);pr(x+3,y+3,w-6,h-6,PAL.d);for(const[cx,cy]of[[x+1,y+1],[x+w-3,y+1],[x+1,y+h-3],[x+w-3,y+h-3]])pr(cx,cy,2,2,PAL.y);uiRects.push({x,y,w,h,block:true});if(title)txt(title,x+w/2,y+10,14,'#ffd35a','center');}
function button(x,y,w,h,label,onClick,opt){opt=opt||{};const hov=mouse.x>=x&&mouse.x<x+w&&mouse.y>=y&&mouse.y<y+h;pr(x,y,w,h,PAL.k);pr(x+1,y+1,w-2,h-2,opt.dis?PAL.D:hov?'#5a4466':opt.main?'#6e1a1e':PAL.m);pr(x+1,y+h-2,w-2,1,PAL.k);txt(label,x+w/2,y+h/2,opt.size||12,opt.dis?'#6b6275':'#f2eadb','center');if(!opt.dis)uiRects.push({x,y,w,h,click:onClick,tip:opt.tip});}
function drawOrb(cx,cy,frac,img,label){ctx.drawImage(ORB_FRAME,(cx-24)*SC,(cy-24)*SC,49*SC,49*SC);const sy=Math.round(41*(1-clamp(frac,0,1)));
  if(sy<41)ctx.drawImage(img,0,sy,41,41-sy,(cx-20)*SC,(cy-20+sy)*SC,41*SC,(41-sy)*SC);
  if(sy>0&&sy<41){const yy=cy-20+sy,half=Math.sqrt(Math.max(0,420-(sy-20)**2));for(let x=-Math.floor(half)+1;x<half-1;x++)if(((x+Math.floor(time*6))&3)===0)pr(cx+x,yy,1,1,'rgba(255,255,255,0.4)');}
  ctx.drawImage(ORB_GLASS,(cx-20)*SC,(cy-20)*SC,41*SC,41*SC);txt(label,cx,cy+1,12,'#f2eadb','center');}
function skillTip(sid,i){const s=SKILLS[sid];return[[s.n,'#ffd35a',14],[s.desc,'#e6dcc3',12],[`마나 ${s.mp}  ·  재사용 ${s.cd}초`,'#7aa2ff',12],[`${i+1} 키로 사용  ·  클릭하면 우클릭 스킬로 선택`,'#6b6275',11]];}
function baseLine(k,v){if(k==='dmg')return`공격력 ${v}`;if(k==='armor')return`방어력 ${v}`;if(k==='as')return`${v>0?'+':''}${v}% 공격 속도`;if(k==='ms')return`${v}% 이동 속도`;if(k==='mp')return`+${v} 마나`;return'';}
function diffLine(k,d){const lab=SH.AFF[k].f(Math.abs(d)).replace(/^\+/,d>0?'+':'-');return(d>0?'▲ ':'▼ ')+lab;}
function itemTip(it,where,by){const cls=myCls();const L=[[it.name,RAR[it.rar].c,14],[`${RAR[it.rar].n} ${it.slot==='weapon'?SH.FAMN[it.fam]:SH.SLOTN[it.slot]}  ·  아이템 레벨 ${it.L}`,'#9e937a',11]];
  for(const k in it.base)L.push([baseLine(k,it.base[k]),'#f2eadb',12]);for(const a of it.aff)L.push([SH.AFF[a.k].f(a.v),'#7aa2ff',12]);
  if(!SH.canEquip(it,cls))L.push([`${CLASSES[cls].n}은(는) 착용 불가`,'#e0574a',12]);
  else if(where!=='eq'&&G.ch){const cur=G.ch.eq[it.slot];if(!cur)L.push(['빈 칸 · 바로 장착 가능','#7fd05a',11]);else if(cur!==it){L.push(['장착 중인 아이템과 비교','#9e937a',11]);const a=SH.itemStats(it),b=SH.itemStats(cur);let any=false;for(const k of new Set([...Object.keys(a),...Object.keys(b)])){const d=(a[k]||0)-(b[k]||0);if(d){any=true;L.push([diffLine(k,d),d>0?'#7fd05a':'#e0574a',12]);}}if(!any)L.push(['차이 없음','#9e937a',11]);}}
  if(by)L.push([`${by}님이 내려놓은 아이템`,'#c77ad8',11]);
  L.push([where==='bag'?(showShop?`클릭: 장착   우클릭: 판매 ${it.value}골드`:'클릭: 장착   우클릭: 바닥에 내려놓기 (거래)'):where==='ground'?'클릭해서 줍기 (F)':'클릭: 장착 해제','#6b6275',11]);return L;}
function drawTip(lines){const bms=lines.map(l=>tbitmap(l[0],l[2]||12,l[1],'kr'));let w=0,h=0;bms.forEach(b=>{w=Math.max(w,b.width);h+=b.height-4;});const pad=12;w+=pad*2;h+=pad*2;
  let x=mouse.x*SC+24,y=mouse.y*SC+8;if(x+w>W*SC-4)x=mouse.x*SC-w-12;if(y+h>H*SC-4)y=H*SC-h-4;x=Math.max(4,Math.round(x/2)*2);y=Math.max(4,Math.round(y/2)*2);
  ctx.fillStyle=PAL.k;ctx.fillRect(x,y,w,h);ctx.fillStyle=PAL.G;ctx.fillRect(x+2,y+2,w-4,h-4);ctx.fillStyle='rgba(14,11,18,0.97)';ctx.fillRect(x+4,y+4,w-8,h-8);
  let yy=y+pad-2;bms.forEach(b=>{ctx.drawImage(b,Math.round(x+w/2-b.width/2),Math.round(yy));yy+=b.height-4;});}
function drawHUD(){const mv=G.mev,cls=myCls(),skills=CLASSES[cls].skills;
  pr(44,232,392,38,PAL.k);pr(45,233,390,37,PAL.d);pr(45,233,390,1,PAL.m);pr(45,234,390,1,PAL.D);pr(50,238,2,2,PAL.g);pr(428,238,2,2,PAL.g);
  uiRects.push({x:44,y:232,w:392,h:38,block:true});
  drawOrb(26,246,mv[0]/mv[1],ORB_HP,`${mv[0]}/${mv[1]}`);drawOrb(454,246,mv[2]/mv[3],ORB_MP,`${mv[2]}/${mv[3]}`);
  if(mv[4]>0){txt(`보호막 ${mv[4]}`,26,218,11,'#bfe3ff','center');}
  uiRects.push({x:2,y:222,w:48,h:48,block:true,tip:()=>[['체력',"#ff7a6a",13],[`${mv[0]} / ${mv[1]}`,'#e6dcc3',12],['Q: 체력 물약 (45% 회복)','#6b6275',11]]});
  uiRects.push({x:430,y:222,w:48,h:48,block:true,tip:()=>[['마나',"#8fd0ff",13],[`${mv[2]} / ${mv[3]}`,'#e6dcc3',12],['E: 마나 물약 (50% 회복)','#6b6275',11]]});
  const slots=[{t:'pot',k:'hp'},{t:'sk',i:0},{t:'sk',i:1},{t:'sk',i:2},{t:'sk',i:3},{t:'pot',k:'mp'}],sw=20,gap=4,x0=240-(6*sw+5*gap)/2;
  slots.forEach((s,n)=>{const x=x0+n*(sw+gap),y=237;
    if(s.t==='sk'){const i=s.i,sid=skills[i],sk=SKILLS[sid];slotBox(x,y,sw,sw,(G.sel||0)===i);pimg(SKILL_ICON[sid],x+2,y+2);const left=(localCd[sid]||0)-time;if(left>0)pr(x+2,y+2,16,Math.ceil(16*left/sk.cd),'rgba(5,4,8,0.72)');if(mv[2]<sk.mp)pr(x+2,y+2,16,16,'rgba(30,50,150,0.5)');txt(String(i+1),x+2,y+5,8,'#e6dcc3','left','px');
      uiRects.push({x,y,w:sw,h:sw,click:()=>{G.sel=i;},right:()=>{G.sel=i;},tip:()=>skillTip(sid,i)});}
    else{slotBox(x,y,sw,sw,false);pimg(s.k==='hp'?POT_HP:POT_MP,x+2,y+6);txt(String(G.ch?G.ch.pots[s.k]:0),x+18,y+16,8,'#ffffff','right','px');txt(s.k==='hp'?'Q':'E',x+2,y+5,8,'#e6dcc3','left','px');
      uiRects.push({x,y,w:sw,h:sw,click:()=>usePot(s.k),tip:()=>[[s.k==='hp'?'체력 물약':'마나 물약',s.k==='hp'?'#ff7a6a':'#8fd0ff',13],[s.k==='hp'?'최대 체력의 45% 회복':'최대 마나의 50% 회복','#e6dcc3',12],[`보유 ${G.ch?G.ch.pots[s.k]:0} / 9  ·  마을 상인에게서 구입`,'#9e937a',11]]});}});
  if(G.ch){const xf=G.ch.xp/SH.xpFor(G.ch.lvl);pr(64,261,352,5,PAL.k);pr(65,262,Math.round(350*xf),3,PAL.G);pr(65,262,Math.round(350*xf),1,PAL.y);for(let i=1;i<10;i++)pr(64+Math.round(i*35.2),261,1,5,PAL.k);
    uiRects.push({x:64,y:259,w:352,h:9,block:true,tip:()=>[[`레벨 ${G.ch.lvl}`,'#ffd35a',13],[`경험치 ${G.ch.xp} / ${SH.xpFor(G.ch.lvl)}`,'#e6dcc3',12]]});}
  // 버프
  let bx=150;if(mv[5]>0){txt(`피해 증가 ${Math.ceil(mv[5])}초`,bx,226,11,'#ff9a6a');bx+=70;}if(mv[6]>0){txt(`피해 감소 ${Math.ceil(mv[6])}초`,bx,226,11,'#8fd0ff');}
  // 왼쪽 위 정보
  pr(4,4,100,32,'rgba(8,6,12,0.72)');txt(G.kind==='hub'?'던전 입구 광장':`지하 ${G.floor}층`,8,11,13,'#e6dcc3');if(G.ch){txt(`${G.ch.name} · ${CLASSES[cls].n} ${G.ch.lvl}`,8,21,12,'#9e937a');pimg(GOLD,8,27);txt(String(G.ch.gold),19,30,12,'#ffd35a');
    if(G.ch.pts>0){const bl=(time*3|0)%2===0;pr(52,221,38,10,bl?PAL.y:PAL.g);pr(53,222,36,8,PAL.k);txt(`+${G.ch.pts} 스탯`,71,226,11,'#ffd35a','center');uiRects.push({x:52,y:221,w:38,h:10,click:()=>{showChar=true;}});}}
  drawPartyFrames();
  if(G.kind==='dungeon'){pr(412,4,64,64,PAL.k);pr(413,5,62,62,'rgba(12,9,16,0.85)');ctx.drawImage(miniC,414*SC,6*SC,60*SC,60*SC);
    for(const p of G.players.values()){if(p.id===myId)continue;pr(414+Math.floor(p.x/TS),6+Math.floor(p.y/TS),1,1,'#7fd05a');}
    if((time*4|0)%2===0)pr(414+Math.floor(me.x/TS),6+Math.floor(me.y/TS),1,1,PAL.e);}
  const boss=[...G.monsters.values()].find(m=>m.tc===3&&(m.fl&16));
  if(boss){const f=boss.hp/boss.maxHp;pr(138,6,204,12,PAL.g);pr(139,7,202,10,PAL.k);pr(140,8,Math.round(200*f),8,PAL.R);pr(140,8,Math.round(200*f),2,PAL.r);txt(SH.MT.boss.n,240,12,12,'#ffd35a','center');}
  if(hoverMon&&!(boss&&hoverMon===boss)){const m=hoverMon,y=boss?22:6,f=m.hp/m.maxHp;pr(170,y,140,11,PAL.k);pr(171,y+1,Math.round(138*f),9,PAL.R);pr(171,y+1,Math.round(138*f),2,PAL.r);
    const nm=((m.fl&1)?['광폭한 ','저주받은 ','불타는 ','굶주린 '][m.id%4]:'')+SH.MT[m.type].n;txt(nm,240,y+5.5,12,(m.fl&1)?'#8fd0ff':'#e6dcc3','center');}}
function drawPartyFrames(){const pt=G.party;if(!pt||pt.members.length<=1)return;let y=40;
  for(const mb of pt.members){const p=G.players.get(mb.id);const here=!!p;pr(4,y,100,15,'rgba(8,6,12,0.72)');pr(4,y,2,15,CLASS_COL[mb.cls]);
    txt((mb.id===pt.leader?'★ ':'')+mb.name,9,y+4.5,11,here?'#e6dcc3':'#6b6275');txt(`${CLASSES[mb.cls].n} ${mb.lvl}`,102,y+4.5,10,'#9e937a','right');
    if(here){const f=p.maxHp?p.hp/p.maxHp:0;pr(9,y+10,92,3,PAL.k);pr(9,y+10,Math.round(92*f),3,p.downed?'#6b6275':'#c0392b');if(p.downed)txt('쓰러짐',102,y+11,9,'#ff6a5a','right');}
    else txt(G.kind==='hub'?'던전에 있음':'마을에 있음',9,y+11,9,'#6b6275');
    y+=17;}
  if(G.kind==='hub'){button(4,y,48,11,'파티 나가기',()=>net({t:'leave'}),{size:10});}}
function drawChar(){const S=G.S,ch=G.ch;if(!S||!ch)return;const x=6,y=38,w=172,h=194;panel(x,y,w,h,'캐릭터');let ly=y+24;const row=(a,b,c)=>{txt(a,x+10,ly,12,'#9e937a');txt(b,x+w-10,ly,12,c||'#e6dcc3','right');ly+=10;};
  row(`${CLASSES[ch.cls].n} · ${CLASSES[ch.cls].role}`,`레벨 ${ch.lvl}`,'#ffd35a');ly+=1;txt(ch.pts>0?`스탯 포인트 ${ch.pts}`:'스탯 포인트 없음',x+10,ly,12,ch.pts>0?'#ffd35a':'#6b6275');ly+=11;
  for(const[k,l,dsc]of[['str','힘',CLASSES[ch.cls].prim==='str'?'주 능력치 · 피해':'근접 피해'],['dex','민첩',CLASSES[ch.cls].prim==='dex'?'주 능력치 · 치명타':'치명타 · 공속'],['vit','활력','체력 +4'],['ene','에너지',CLASSES[ch.cls].prim==='ene'?'주 능력치 · 주문':'마나 · 주문']]){txt(l,x+10,ly,12,'#e6dcc3');txt(dsc,x+48,ly,11,'#6b6275');txt(String(S[k]),x+w-(ch.pts>0?24:10),ly,12,'#f2eadb','right');
    if(ch.pts>0){const bx=x+w-20,by=ly-5;pr(bx,by,10,10,PAL.g);pr(bx+1,by+1,8,8,PAL.k);pr(bx+4,by+2,2,6,PAL.y);pr(bx+2,by+4,6,2,PAL.y);uiRects.push({x:bx,y:by,w:10,h:10,click:()=>net({t:'stat',k})});}ly+=11;}
  ly+=1;pr(x+8,ly-5,w-16,1,PAL.m);ly+=2;const r2=(a,b,c)=>{row(a,b,c);ly-=1;};const mn=Math.round(S.dmgBase*0.8*S.dmgMul),mx=Math.round(S.dmgBase*1.2*S.dmgMul);
  r2('공격력',`${mn} - ${mx}`);r2('치명타',`${S.crit.toFixed(1)}%  x${S.critMul.toFixed(2)}`);r2('공격 속도',`${S.atkRate.toFixed(2)} / 초`);r2('방어력',`${S.armor}  (피해 -${Math.round(SH.dmgReduce(S,Math.max(1,G.floor))*100)}%)`);
  r2('체력',`${G.mev[0]} / ${S.maxHp}`,'#ff7a6a');r2('마나',`${G.mev[2]} / ${S.maxMp}`,'#8fd0ff');r2('주문 피해',`+${Math.round((S.spell-1)*100)}%`);r2('치유력',String(S.healPow),'#7fd05a');r2('생명력 흡수',`${S.ls}%`);
  ly+=1;txt(`처치 ${ch.kills}  ·  최고 기록 지하 ${ch.best}층`,x+w/2,ly,11,'#6b6275','center');}
function itemSlot(x,y,s,it,click,right,where){const hov=mouse.x>=x&&mouse.x<x+s&&mouse.y>=y&&mouse.y<y+s;pr(x,y,s,s,hov?PAL.y:PAL.k);pr(x+1,y+1,s-2,s-2,it?RAR[it.rar].bg:PAL.D);if(it){pimg(iconFor(it),x+(s-16)/2,y+(s-16)/2);if(!SH.canEquip(it,myCls()))pr(x+1,y+s-3,s-2,2,'#e0574a');}
  uiRects.push({x,y,w:s,h:s,block:true,click:it?click:null,right:it?right:null,tip:it?()=>itemTip(it,where):null});}
function drawInv(){const ch=G.ch;if(!ch)return;const x=294,y=38,w=180,h=194;panel(x,y,w,h,'인벤토리');
  [['weapon','무기'],['armor','갑옷'],['ring','반지']].forEach(([s,l],i)=>{const sx=x+w/2-51+i*38,sy=y+22;itemSlot(sx,sy,26,ch.eq[s],()=>{net({t:'uneq',s});sfx('equip');},null,'eq');txt(l,sx+13,sy+33,11,'#9e937a','center');});
  const gx=x+w/2-64,gy=y+64;for(let i=0;i<20;i++){const c=i%5,r=(i/5)|0;itemSlot(gx+c*26,gy+r*26,24,ch.bag[i],()=>{net({t:'eq',bi:i});sfx('equip');},()=>{net(showShop?{t:'sell',bi:i}:{t:'drop',bi:i});},'bag');}
  pimg(GOLD,x+10,y+h-15);txt(String(ch.gold),x+21,y+h-12,12,'#ffd35a');txt(showShop?'우클릭: 판매':'우클릭: 내려놓기',x+w-8,y+h-12,11,'#9e937a','right');}
function drawShop(){const x=6,y=38,w=172,h=120;panel(x,y,w,h,'상인');const price=SH.potPrice(G.ch?G.ch.lvl:1);
  txt('어둠 속에선 물약이 곧 목숨이지.',x+w/2,y+24,11,'#9e937a','center');
  pimg(POT_HP,x+12,y+36);txt('체력 물약',x+32,y+42,12,'#ff7a6a');txt(`${price}골드`,x+32,y+52,11,'#ffd35a');button(x+w-58,y+38,48,16,'구입',()=>net({t:'buy',k:'hp'}));
  pimg(POT_MP,x+12,y+62);txt('마나 물약',x+32,y+68,12,'#8fd0ff');txt(`${price}골드`,x+32,y+78,11,'#ffd35a');button(x+w-58,y+64,48,16,'구입',()=>net({t:'buy',k:'mp'}));
  txt('장비 판매: 인벤토리에서 우클릭',x+w/2,y+98,11,'#9e937a','center');txt('물약은 최대 9개까지',x+w/2,y+109,11,'#6b6275','center');}
function drawPortalMenu(){const pt=G.party,leader=!pt||pt.leader===myId;const cps=G.ch?G.ch.cps:[1];const rows=Math.ceil(cps.length/3);const w=200,h=64+rows*20+(pt&&pt.inDungeon?22:0),x=240-w/2,y=60;
  panel(x,y,w,h,'던전 입구');
  if(pt&&pt.inDungeon){button(x+20,y+24,w-40,16,'파티의 던전에 합류',()=>{net({t:'enter'});G.portalMenu=false;},{main:true});}
  const oy=y+24+(pt&&pt.inDungeon?22:0);
  txt(leader?'시작할 층을 고르세요 (체크포인트)':'파티장이 층을 고릅니다',x+w/2,oy+4,11,'#9e937a','center');
  cps.forEach((f,i)=>{const c=i%3,r=(i/3)|0;button(x+14+c*58,oy+14+r*20,54,16,`지하 ${f}층`,()=>{net({t:'enter',floor:f});G.portalMenu=false;},{dis:!leader||(pt&&pt.inDungeon)});});
  txt(pt&&pt.members.length>1?`파티원 ${pt.members.length}명이 함께 들어갑니다`:'혼자 들어갑니다 · 다른 사람을 클릭해 파티 초대',x+w/2,y+h-10,11,'#6b6275','center');}
function drawMeterTable(title,rows,x,y,w,sub){const h=46+Math.max(1,rows.length)*22;panel(x,y,w,h,title);if(sub)txt(sub,x+w/2,y+21,11,'#9e937a','center');
  const cols=[['dmg','피해','#ff9a6a'],['taken','받은 피해','#e0574a'],['heal','치유','#7fd05a'],['shield','보호막','#8fd0ff']];const cx0=x+96,cw=(w-106)/4;
  cols.forEach(([k,l,c],i)=>txt(l,cx0+i*cw+cw/2,y+32,11,c,'center'));
  const max={};for(const[k]of cols)max[k]=Math.max(1,...rows.map(r=>r[k]));
  rows.forEach((r,n)=>{const ry=y+42+n*22;pr(x+8,ry,w-16,18,n%2?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.2)');pr(x+8,ry,2,18,CLASS_COL[r.cls]||'#fff');txt(r.name,x+14,ry+6,12,'#e6dcc3');txt(CLASSES[r.cls]?CLASSES[r.cls].n:'',x+14,ry+14,10,'#9e937a');
    cols.forEach(([k,l,c],i)=>{const bx=cx0+i*cw+4,bw=cw-8;pr(bx,ry+12,bw,3,PAL.k);pr(bx,ry+12,Math.round(bw*r[k]/max[k]),3,c);txt(r[k].toLocaleString(),bx+bw/2,ry+6,12,'#f2eadb','center');});});
  if(!rows.length)txt('아직 기록이 없습니다',x+w/2,y+52,12,'#6b6275','center');return h;}
function drawCtxMenu(){const c=G.ctxMenu;const p=G.players.get(c.id);if(!p){G.ctxMenu=null;return;}const pt=G.party;const inMy=pt&&pt.members.some(m=>m.id===c.id);
  const items=[];if(!inMy)items.push(['파티 초대',()=>net({t:'inv',id:c.id})]);if(inMy&&pt.leader===myId&&G.kind==='hub')items.push(['파티에서 추방',()=>net({t:'kick',id:c.id})]);items.push(['닫기',()=>{}]);
  const w=80,h=16+items.length*16;let x=Math.min(c.x,W-w-2),y=Math.min(c.y,H-h-2);panel(x,y,w,h);txt(p.name||'',x+w/2,y+8,11,'#ffd35a','center');
  items.forEach(([l,f],i)=>button(x+4,y+14+i*16,w-8,14,l,()=>{f();G.ctxMenu=null;},{size:11}));}
function drawInvite(){const iv=G.invite;if(!iv)return;if(time-iv.t>30){net({t:'ians',from:iv.from,ok:false});G.invite=null;return;}const w=200,h=40,x=240-w/2,y=30;panel(x,y,w,h);
  txt(`${iv.name}님이 파티에 초대했습니다`,x+w/2,y+10,12,'#ffd35a','center');button(x+30,y+20,64,15,'수락 (Y)',()=>{net({t:'ians',from:iv.from,ok:true});G.invite=null;},{main:true});button(x+106,y+20,64,15,'거절 (N)',()=>{net({t:'ians',from:iv.from,ok:false});G.invite=null;});}
function drawChat(){const open=document.activeElement===chatBox;const lines=G.chatLog.filter(l=>open||time-l.t<12).slice(-6);let y=200-lines.length*10;
  if(open)pr(4,y-6,176,lines.length*10+8,'rgba(8,6,12,0.7)');
  for(const l of lines){ctx.globalAlpha=open?1:Math.min(1,(12-(time-l.t))/2);const nw=txt(l.name+':',8,y,11,'#ffd35a');txt(l.m,10+nw,y,11,'#e6dcc3');y+=10;}ctx.globalAlpha=1;}
function drawWorldUI(icx,icy){
  for(const m of G.monsters.values()){if(m.hp>=m.maxHp||m.tc===3)continue;if(lit(m.dx-icx,m.dy-8-icy)<0.2)continue;const bx=Math.round(m.dx-icx)-6,by=Math.round(m.dy-icy)-19;pr(bx,by,12,2,PAL.k);pr(bx,by,Math.max(1,Math.round(12*m.hp/m.maxHp)),2,PAL.e);}
  for(const p of G.players.values()){const isMe=p.id===myId;const px=(isMe?me.x:p.dx)-icx,py=(isMe?me.y:p.dy)-icy;
    if(!isMe||G.kind==='hub'){txt(p.name||'',px,py-22,11,isMe?'#ffd35a':(G.party&&G.party.members.some(m=>m.id===p.id))?'#7fd05a':'#e6dcc3','center');}
    if(!isMe&&G.kind==='dungeon'){const f=p.maxHp?p.hp/p.maxHp:0;pr(px-6,py-18,12,2,PAL.k);pr(px-6,py-18,Math.max(0,Math.round(12*f)),2,'#7fd05a');}
    if(p.downed&&p.rev>0){pr(px-10,py+4,20,3,PAL.k);pr(px-10,py+4,Math.round(20*p.rev),3,PAL.y);}
    const b=G.bubbles.get(p.id);if(b){const bw=Math.min(150,tw(b.m,11)+8);const bx=px-bw/2,by=py-40;pr(bx,by,bw,12,PAL.k);pr(bx+1,by+1,bw-2,10,'#e6dcc3');pr(px-1,by+12,3,2,'#e6dcc3');const b2=tbitmap(b.m,11,'#1b1622');ctx.save();ctx.beginPath();ctx.rect((bx+1)*SC,(by+1)*SC,(bw-2)*SC,10*SC);ctx.clip();ctx.drawImage(tbitmap(b.m,11,'#0e0b12'),Math.round((px)*SC-Math.min(b2.width,(bw-2)*SC)/2),Math.round((by+6)*SC-b2.height/2));ctx.restore();}}
  if(G.kind==='hub'){const m=G.map.merchant;txt('상인',m.x-icx,m.y-icy-20,11,'#ffd35a','center');const p=G.map.portal;txt('던전 입구',p.x-icx,p.y-icy-22,12,'#ff8a7a','center');
    const n=nearNpc();if(n)txt(n==='merchant'?'F: 상인과 거래':'F: 던전 입장',me.x-icx,me.y-icy+10,11,'#ffd35a','center');}
  dropLabels=[];const placed=[];
  for(const d of G.drops.values()){if(d.kind!=='item'||d.t<0.45)continue;const sx=d.x-icx,sy=d.y-icy;if(sx<-40||sx>W+40||sy<-20||sy>H+30)continue;if(Math.hypot(d.x-me.x,d.y-me.y)>210)continue;
    const b=tbitmap(d.it.name,12,RAR[d.it.rar].c,'kr');const w=b.width/SC+2,h=9;let lxx=Math.round(sx-w/2),ly=Math.round(sy-25);
    for(let t=0;t<8;t++){const hit=placed.find(p=>lxx<p.x+p.w&&lxx+w>p.x&&ly<p.y+p.h&&ly+h>p.y);if(!hit)break;ly=hit.y-h-1;}
    placed.push({x:lxx,y:ly,w,h});const hov=mouse.x>=lxx&&mouse.x<=lxx+w&&mouse.y>=ly&&mouse.y<=ly+h;
    pr(lxx,ly,w,h,hov?'rgba(70,50,80,0.95)':'rgba(10,7,14,0.85)');if(hov){pr(lxx,ly,w,1,PAL.g);pr(lxx,ly+h-1,w,1,PAL.g);}if(d.owner==null&&d.by){pr(lxx,ly,1,h,'#c77ad8');}txt(d.it.name,lxx+1,ly+h/2,12,RAR[d.it.rar].c);dropLabels.push({d,x:lxx,y:ly,w,h});}
  for(const t of texts){const a=t.t>0.6?1-(t.t-0.6)/0.35:1;ctx.globalAlpha=clamp(a,0,1);const b=tbitmap(t.s,t.size,t.c,t.font);const k=t.t<0.08?1.3:1;ctx.drawImage(b,Math.round((t.x-icx)*SC-b.width*k/2),Math.round((t.y-icy)*SC-b.height*k/2),b.width*k,b.height*k);}ctx.globalAlpha=1;}
function drawEsc(){const w=160,h=86,x=240-w/2,y=80;panel(x,y,w,h,'메뉴');button(x+16,y+22,w-32,16,'계속하기',()=>{G.escMenu=false;},{main:true});button(x+16,y+42,w-32,16,'소리: '+['켬','효과음만','끔'][soundMode],()=>{soundMode=(soundMode+1)%3;try{localStorage.setItem('bc_sound',String(soundMode));}catch(e){}});button(x+16,y+62,w-32,16,'캐릭터 선택 화면으로',quitToSelect);}
function drawPause(){pr(0,0,W,H,'rgba(5,4,8,0.62)');bigTxt('일시정지',240,96,16,'#e6dcc3',2);txt(`${G.paused}님이 게임을 멈췄습니다`,240,120,12,'#9e937a','center');
  const x=180,w=120;button(x,136,w,16,'계속하기 (ESC)',()=>net({t:'pause'}),{main:true});button(x,156,w,16,'마을로 귀환',()=>net({t:'town'}));button(x,176,w,16,'소리: '+['켬','효과음만','끔'][soundMode],()=>{soundMode=(soundMode+1)%3;try{localStorage.setItem('bc_sound',String(soundMode));}catch(e){}});}
function render(){
  uiRects=[];
  if(scene!=='game'||!G.map){ctx.fillStyle='#050407';ctx.fillRect(0,0,cv.width,cv.height);if(scene==='connecting')txt('접속 중...',240,135,14,'#9e937a','center');return;}
  const [icx,icy]=renderWorld();
  drawWorldUI(icx,icy);drawHUD();drawChat();
  if(showChar)drawChar();else if(showShop)drawShop();
  if(showInv)drawInv();
  if(G.portalMenu)drawPortalMenu();
  msgs.forEach((m,i)=>{ctx.globalAlpha=Math.min(1,m.life);txt(m.t,240,48+i*11,13,m.c,'center');});ctx.globalAlpha=1;
  if(banner){const a=banner.t<0.4?banner.t/0.4:banner.t>2.3?Math.max(0,(3-banner.t)/0.7):1;ctx.globalAlpha=a;bigTxt(banner.a,240,92,16,'#e6dcc3',2);txt(banner.b,240,112,13,'#9e937a','center');ctx.globalAlpha=1;}
  if(G.trans>0&&inDungeon()){txt(`${Math.ceil(G.trans)}초 후 다음 층으로 내려갑니다`,240,150,14,'#ffd35a','center');}
  if(meDowned()&&inDungeon()){pr(0,0,W,H,'rgba(40,4,8,0.35)');bigTxt('쓰러졌습니다',240,100,16,'#e0473a',2);txt('동료가 곁에 서 있으면 일어납니다 (사제는 두 배 빠름)',240,122,12,'#e6dcc3','center');}
  if(showMeter){const rows=G.meter.slice().sort((a,b)=>b.dmg-a.dmg);drawMeterTable('이번 원정 기록',rows,90,50,300,'Tab을 떼면 닫힙니다');}
  if(G.result){const r=G.result;const rows=r.rows.slice().sort((a,b)=>b.dmg-a.dmg);const m=Math.floor(r.time/60),s=r.time%60;drawMeterTable(r.title,rows,80,46,320,`지하 ${r.floor}층 · 전투 시간 ${m}분 ${String(s).padStart(2,'0')}초 · 클릭해서 닫기`);}
  if(G.ctxMenu)drawCtxMenu();
  drawInvite();
  if(G.escMenu&&G.kind==='hub')drawEsc();
  if(G.paused&&inDungeon())drawPause();
  if(!G.paused&&!showMeter){let tip=null;for(let i=uiRects.length-1;i>=0;i--){const r=uiRects[i];if(mouse.x>=r.x&&mouse.x<r.x+r.w&&mouse.y>=r.y&&mouse.y<r.y+r.h&&(r.tip||r.block)){if(r.tip)tip=r.tip();break;}}
    if(!tip&&hoverDrop&&hoverDrop.kind==='item')tip=itemTip(hoverDrop.it,'ground',hoverDrop.by);if(tip)drawTip(tip);}
  pimg(hoverMon&&inDungeon()?CURSOR_A:(hoverDrop||hoverPl)?CURSOR_P:CURSOR,mouse.x,mouse.y);}

// ================= 루프 =================
let last=performance.now();
function frame(ts){const dt=Math.min(0.05,(ts-last)/1000)||0;last=ts;
  try{if(scene==='game'&&G.map)update(dt);else time+=dt;render();}catch(err){console.error(err);}
  requestAnimationFrame(frame);}
function fit(){const vw=window.innerWidth,vh=window.innerHeight;let s=Math.min(vw/W,vh/H);if(s>=1&&Math.floor(s)/s>=0.8)s=Math.floor(s);cv.style.width=Math.floor(W*s)+'px';cv.style.height=Math.floor(H*s)+'px';}
window.addEventListener('resize',fit);fit();
renderSelect();
requestAnimationFrame(frame);
window.__BC={G,me,net,get myId(){return myId;},startGame,loadChars,saveChars,get scene(){return scene;}};
})();
