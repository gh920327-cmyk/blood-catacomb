// 핏빛 카타콤 — 클라이언트 (렌더링 · 입력 · 네트워크 · UI)
'use strict';
(()=>{
const W=480,H=270,TS=16;let SC=2; // SC: 화면 해상도에 맞춰 2~4 (글자를 선명하게)
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
const TRIM={warrior:'g',guardian:'y',archer:'G',mage:'y',priest:'y'};
const RTRIM=[null,'C','y','o'];
const HELM={plate:{s:'w',S:'s'},leather:{s:'b',S:'B'},robe:{s:'p',S:'P'}};
const PF_CACHE={};
function lookOfMe(){const e=G.ch?G.ch.eq:{};return{w:e.weapon?e.weapon.kind:null,wr:e.weapon?e.weapon.rar:-1,wid:e.weapon?e.weapon.id:null,a:e.armor?e.armor.kind:null,ar:e.armor?e.armor.rar:-1,rr:e.ring?e.ring.rar:-1};}
function playerFrames(cls,look){look=look||{};const ar=Math.max(0,look.ar|0),a=look.a||'';const key=(SPR.ready?'ai|':'')+cls+'|'+a+'|'+ar;if(PF_CACHE[key])return PF_CACHE[key];
  if(SPR.ready){const hi=SH.CLASS_ORDER.indexOf(cls)*4+Math.min(3,ar);const fr=SPR.heroBare&&SPR.heroBare[hi]?animFrames(SPR.heroBare[hi]):SPR.heroAnim&&SPR.heroAnim[hi]?animFrames(SPR.heroAnim[hi]):aiFrames(SPR.heroes[hi]);PF_CACHE[key]=fr;return fr;}
  let body=CLASS_BODY[cls].slice();const m={};if(ar>0)m[TRIM[cls]]=RTRIM[ar];body=remap(body,m);
  if((cls==='warrior'||cls==='guardian')&&HELM[a])body=body.map((r,i)=>i<=5?remap([r],HELM[a])[0]:r);
  if(ar>=2&&(cls==='warrior'||cls==='guardian'))body[0]=body[0].slice(0,7)+(ar===3?'oo':'yy')+body[0].slice(9);
  if(ar===3&&(cls==='mage'||cls==='priest'))body[0]=body[0].slice(0,7)+'o'+body[0].slice(8);
  if(ar===3&&cls==='archer')body[1]=body[1].slice(0,5)+'y'+body[1].slice(6);
  const lg=bipedLegs(CLASS_LEG[cls][0],CLASS_LEG[cls][1]);const fr=buildFrames(body,lg.idle,lg.walk);PF_CACHE[key]=fr;return fr;}
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
// ---- 힉스필드로 만든 도트 스프라이트 시트 ----
const SPR={ready:false};
function spriteFromCanvas(c,flip){const S=c.width,H=c.height;const [o,ox]=mk(S,H),[f,fx]=mk(S,H);if(flip){ox.translate(S,0);ox.scale(-1,1);}ox.drawImage(c,0,0);
  const d=ox.getImageData(0,0,S,H);const px=[];const fd=fx.createImageData(S,H);for(let y=0;y<H;y++)for(let x=0;x<S;x++){const i=(y*S+x)*4;if(d.data[i+3]<128)continue;fd.data[i]=255;fd.data[i+1]=246;fd.data[i+2]=234;fd.data[i+3]=255;if(((x+y)&1)===0)px.push(x,y,`rgb(${d.data[i]},${d.data[i+1]},${d.data[i+2]})`);}
  fx.putImageData(fd,0,0);return{c:o,fc:f,px,w:S,h:H,ai:true};}
function sliceAtlas(img,S){const n=Math.floor(img.width/S),out=[];for(let i=0;i<n;i++){const [c,x]=mk(S,S);x.drawImage(img,i*S,0,S,S,0,0,S,S);out.push({r:spriteFromCanvas(c,false),l:spriteFromCanvas(c,true)});}return out;}
function tintCopy(sp){const cp=o=>{const c=cloneC(o.c);const x=c.getContext('2d');x.globalCompositeOperation='source-atop';x.fillStyle='rgba(110,0,10,0.34)';x.fillRect(0,0,c.width,c.height);return Object.assign({},o,{c});};return{r:cp(sp.r),l:cp(sp.l)};}
function aiFrames(sp){const f=(dx,dy,ks,kh)=>({r:Object.assign({},sp.r,{dx,dy,ks:ks||1,kh:kh||1}),l:Object.assign({},sp.l,{dx:-dx,dy,ks:ks||1,kh:kh||1})});return{idle:[f(0,0),f(0,0,1.04,0.96)],walk:[f(0,-1,0.95,1.05),f(0,0,1.04,0.96),f(0,-1,0.95,1.05),f(0,0,1.04,0.96)],atk:[f(-2,0,0.9,1.07),f(4,0,1.12,0.93),f(1,0,1.02,0.98)],ai:true};}
// 스케일(찌그러짐) 적용해서 그리기: 발 위치 기준
function blitS(img,s,sx,sy,hit){let ks=s.ks||1,kh=s.kh||1;if(hit>0){ks*=1.1;kh*=0.9;}if(ks===1&&kh===1){wx.drawImage(img,sx,sy);return;}const w=Math.round(s.w*ks),h=Math.round(s.h*kh);wx.drawImage(img,Math.round(sx+(s.w-w)/2),sy+(s.h-h),w,h);}
const bossFx=[];let screenFlash=0;
// 4동작 시트(가만히·걷기A·걷기B·공격) → 프레임 세트
function sliceAnim(img,Wf,H){const rows=Math.floor(img.height/H),out=[];for(let r=0;r<rows;r++){const fs=[];for(let k=0;k<4;k++){const [c,x]=mk(Wf,H);x.drawImage(img,k*Wf,r*H,Wf,H,0,0,Wf,H);fs.push({r:spriteFromCanvas(c,false),l:spriteFromCanvas(c,true)});}out.push(fs);}return out;}
// 맨손 시트: 프레임마다 손 위치(앞쪽 팔 끝) 계산
function handAnchor(sp,atk){const c=sp.c,W2=c.width,H2=c.height,d=c.getContext('2d').getImageData(0,0,W2,H2).data;let top=H2,bot=0;for(let j=0;j<H2;j++)for(let i=0;i<W2;i++)if(d[(j*W2+i)*4+3]>0){if(j<top)top=j;if(j>bot)bot=j;}
  const hgt=bot-top+1,b0=Math.floor(top+hgt*(atk?0.22:0.42)),b1=Math.ceil(top+hgt*(atk?0.6:0.66));let bx=-1,by=b0;for(let j=b0;j<=b1;j++)for(let i=W2-1;i>=0;i--)if(d[(j*W2+i)*4+3]>0){if(i>bx){bx=i;by=j;}break;}
  return{hx:Math.max(0,bx-1),hy:by};}
function sliceBare(img,Wf,H){const rows=sliceAnim(img,Wf,H);for(const fs of rows)fs.forEach((f,k)=>{const a=handAnchor(f.r,k===3);f.r.hx=a.hx;f.r.hy=a.hy;f.l.hx=f.r.w-1-a.hx;f.l.hy=a.hy;f.r.bare=f.l.bare=true;});return rows;}
function animFrames(fs){const f=(i,dx,dy,ks,kh)=>({r:Object.assign({},fs[i].r,{dx:dx||0,dy:dy||0,ks:ks||1,kh:kh||1,anim:true,fi:i}),l:Object.assign({},fs[i].l,{dx:-(dx||0),dy:dy||0,ks:ks||1,kh:kh||1,anim:true,fi:i})});
  return{idle:[f(0),f(0,0,0,1.03,0.97)],walk:[f(1),f(0,0,-1),f(2),f(0,0,-1)],atk:[f(0,-1,0,0.95,1.04),f(3,1),f(3)],ai:true,anim:true};}
function loadImg(src){return new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.onerror=()=>r(null);i.src=src;});}
const EGG_ROWS=["................","................","................","................","......kkkk......",".....kwwwwk.....","....kwwzwwWk....","....kwwwwwWk....","...kwzwwwwzWk...","...kwwwwwwwWk...","...kWwwwzwWWk...","....kWwwwwWk....",".....kkkkkk....."];
const TENT_A=["................","......kk........",".....kpPk.......",".....kppk.......","......kpPk......","......kppk......",".....kpPk.......",".....kppk.......","......kpPk......","......kppk......",".....kpPk.......","....kppppk......","...kppppppk.....","...kkkkkkkk....."];
const TENT_B=TENT_A.map((r,i)=>i>0&&i<11?shiftRows([r],0,(i%4<2)?1:-1)[0]:r);
function themedMonsterFrames(type,floor){const A=themeAssets(floor);if(A.mon[type])return A.mon[type];const th=A.th;let fr;
  if(SPR.ready){let sp=null;const ti={zombie:0,skel:1,guard:1,hound:2}[type];if(ti!=null&&SPR.monAnim&&SPR.monAnim[th.idx*3+ti]){let fs=SPR.monAnim[th.idx*3+ti];if(th.corrupt)fs=fs.map(tintCopy);fr=animFrames(fs);A.mon[type]=fr;return fr;}if(ti!=null)sp=SPR.mons[th.idx*3+ti];else if(type==='boss'||type==='clone'){const bi=floor>=100?10:th.idx;if(SPR.bossAnim&&SPR.bossAnim[bi]){let fs=SPR.bossAnim[bi];if(th.corrupt)fs=fs.map(tintCopy);fr=animFrames(fs);A.mon[type]=fr;return fr;}sp=SPR.bosses[bi];}
    if(sp){if(th.corrupt)sp=tintCopy(sp);fr=aiFrames(sp);A.mon[type]=fr;return fr;}}
  const rm=(rows,m)=>m?remap(rows,m):rows;
  if(type==='zombie'){const m=th.t.mrm.zombie;const lg=bipedLegs(m&&m.B||'B',m&&m.Z||'Z');fr=buildFrames(rm(ZOMBIE_BODY,m),lg.idle,lg.walk);}
  else if(type==='skel'||type==='guard'){const m=th.t.mrm.skel;const lg=bipedLegs(m&&m.W||'W',m&&m.w||'w');fr=buildFrames(rm(SKEL_BODY,m),lg.idle,lg.walk);}
  else if(type==='hound'){const m=th.t.mrm.hound;const hl2=swingLegs(rm(HOUND_LEGS,m));fr=buildFrames(rm(HOUND_BODY,m),hl2.idle,hl2.walk);}
  else if(type==='boss'||type==='clone'){const m=(SH.bossOf(floor).brm)||{};const b2=rm(BOSS,m);const bl2=swingLegs(b2.slice(28));fr=buildFrames(b2.slice(0,28),bl2.idle,bl2.walk);}
  else if(type==='egg'){const e=rm(EGG_ROWS,th.idx===5?{w:'W',z:'B'}:null);const f=r=>({r:makeSprite(r),l:makeSprite(r,true)});const a=f(e),b=f(shiftRows(e,0,1));fr={idle:[a,b],walk:[a,b,a,b],atk:[a,b,a]};}
  else if(type==='tentacle'){const m=th.idx===4?{p:'C',P:'c'}:null;const f=r=>({r:makeSprite(rm(r,m)),l:makeSprite(rm(r,m),true)});const a=f(TENT_A),b=f(TENT_B);fr={idle:[a,b],walk:[a,b,a,b],atk:[b,a,b]};}
  else fr=FRM[type]||FRM.zombie;
  if(th.corrupt&&type!=='egg')tintFrames(fr);A.mon[type]=fr;return fr;}
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
const PILLAR_TOP=pcan(16,16,q=>{for(let j=0;j<16;j++)for(let i=0;i<16;i++){let c=((i>>2)+(j>>2))&1?'S':'m';if(i===0||j===0)c='s';if(i===15||j===15)c='D';q(i,j,c);}});
const HUBFLOOR=[0,1,2,3].map(v=>{const rr=SH.mulberry(v*31+5);return pcan(16,16,q=>{for(let j=0;j<16;j++)for(let i=0;i<16;i++){let c=((i>>2)+(j>>2))&1?'D':'m';if((i&3)===3||(j&3)===3)c='d';if(rr()<.04)c='S';q(i,j,c);}});});
function torchF(f,fm){fm=fm||{};return pcan(7,12,q=>{q(3,5,'b');q(3,6,'b');q(3,7,'b');q(3,8,'B');q(2,5,'G');q(4,5,'G');q(2,9,'G');q(3,9,'G');q(4,9,'G');q(3,10,'k');
  const fl=f?[[3,0,'y'],[2,1,'o'],[3,1,'y'],[4,1,'o'],[2,2,'o'],[3,2,'y'],[4,2,'r'],[2,3,'r'],[3,3,'o'],[4,3,'r'],[3,4,'r']]:[[3,0,'o'],[4,0,'y'],[2,1,'o'],[3,1,'y'],[4,1,'y'],[2,2,'r'],[3,2,'y'],[4,2,'o'],[2,3,'r'],[3,3,'o'],[4,3,'o'],[3,4,'r']];
  fl.forEach(([i,j,c])=>q(i,j,fm[c]||c));});}
const TORCH=[torchF(0),torchF(1)];
function recolor(c,map,corrupt){const x=c.getContext('2d'),d=x.getImageData(0,0,c.width,c.height),a=d.data;const m={};for(const k in map){const f=rgb(PAL[k]||k),t=rgb(map[k]);m[f.join(',')]=t;}
  for(let i=0;i<a.length;i+=4){if(!a[i+3])continue;const t=m[a[i]+','+a[i+1]+','+a[i+2]];if(t){a[i]=t[0];a[i+1]=t[1];a[i+2]=t[2];}if(corrupt){a[i]=Math.min(255,a[i]*1.05+10);a[i+1]=a[i+1]*0.72;a[i+2]=a[i+2]*0.78;}}x.putImageData(d,0,0);return c;}
function cloneC(c){const [n,x]=mk(c.width,c.height);x.drawImage(c,0,0);return n;}
const THEME_CACHE={};
function themeAssets(floor){const th=SH.themeOf(floor||1);const key=th.idx+(th.corrupt?'c':'');if(THEME_CACHE[key])return THEME_CACHE[key];const col=th.t.col;
  const map={d:col.d,D:col.D,k:col.k,m:col.m,S:col.S};const A={floors:FLOORS.map(f=>recolor(cloneC(f),map,th.corrupt)),walls:WALLS.map(w=>recolor(cloneC(w),map,th.corrupt)),stairs:recolor(cloneC(STAIRS),{m:col.m,S:col.S,D:col.D},th.corrupt)};
  if(SPR.tiles){const mir=(sx,sy,w,h)=>{const [c,x]=mk(w*2,h*2);for(let q=0;q<4;q++){x.save();x.translate((q&1)?w*2:0,(q&2)?h*2:0);x.scale((q&1)?-1:1,(q&2)?-1:1);x.drawImage(SPR.tiles,sx,sy,w,h,0,0,w,h);x.restore();}
    const d=x.getImageData(0,0,w*2,h*2),a=d.data;let L=0;for(let i=0;i<a.length;i+=4)L+=a[i]*.3+a[i+1]*.59+a[i+2]*.11;L/=a.length/4;const F=Math.max(.45,Math.min(.86,52/L));for(let i=0;i<a.length;i+=4){let r=a[i]*F,g=a[i+1]*F,b=a[i+2]*F;if(th.corrupt){r=Math.min(255,r*1.05+10);g*=.72;b*=.78;}a[i]=r;a[i+1]=g;a[i+2]=b;}x.putImageData(d,0,0);return c;};
    A.ftex=mir(th.idx*128,0,128,128);const w=mir(th.idx*128,128,128,16);const [wc,wx2]=mk(256,16);wx2.drawImage(w,0,0,256,16,0,0,256,16);A.wtex=wc;}
  const fm=th.t.flame;A.torch=fm?[torchF(0,fm),torchF(1,fm)]:TORCH;A.mon={};A.th=th;THEME_CACHE[key]=A;return A;}
function tintSprite(sp){const x=sp.c.getContext('2d');x.globalCompositeOperation='source-atop';x.fillStyle='rgba(110,0,10,0.32)';x.fillRect(0,0,sp.c.width,sp.c.height);x.globalCompositeOperation='source-over';return sp;}
function tintFrames(fr){for(const k in fr)for(const f of fr[k]){tintSprite(f.r);tintSprite(f.l);}return fr;}
const SH_S=pcan(12,4,q=>{const c='rgba(0,0,0,0.5)';for(let i=3;i<9;i++){q(i,0,c);q(i,3,c);}for(let i=1;i<11;i++){q(i,1,c);q(i,2,c);}});
const SH_B=pcan(28,7,q=>{const c='rgba(0,0,0,0.5)';for(let j=0;j<7;j++){const hw=Math.round(14*Math.sqrt(1-((j-3)/3.6)**2));for(let i=14-hw;i<14+hw;i++)q(i,j,c);}});

// 아이콘
const ICONS=new Map();
// ---- 힉스필드 무기 그림: 종류 12행(방패 포함) × 등급 4열, 칸 24x24, 아래 정렬 ----
const W_ORDER=['dagger','sword','axe','mace','great','shortbow','longbow','crossbow','wand','staff','scepter','shield'],W_H=[14,18,17,16,22,18,22,10,14,22,17,13];
const WSPR=new Map();
function idHash(id){let h=2166136261;const s2=String(id||'').slice(0,12);for(let i=0;i<s2.length;i++){h^=s2.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
// 무기 한 개(종류·등급·아이템 id) → {c:그림, g:빛 테두리, px:그립 x, py:그립 y, h:높이}
function weapSprite(kind,rar,id){if(!SPR.weap)return null;rar=Math.max(0,Math.min(3,rar|0));const hh=idHash(id);const key=kind+'|'+rar+'|'+(hh%7);let w=WSPR.get(key);if(w)return w;
  const row=W_ORDER.indexOf(kind);if(row<0)return null;const H=W_H[row];const [c,x]=mk(24,24);
  const hue=rar<3?((hh%7)-3)*5:0;if(hue)x.filter=`hue-rotate(${hue}deg)`;x.drawImage(SPR.weap,rar*24,row*24,24,24,0,0,24,24);x.filter='none';
  const d=x.getImageData(0,0,24,24).data;let x0=24,x1=0,y0=24;for(let j=0;j<24;j++)for(let i=0;i<24;i++)if(d[(j*24+i)*4+3]>0){if(i<x0)x0=i;if(i>x1)x1=i;if(j<y0)y0=j;}
  const bow=kind==='shortbow'||kind==='longbow',xb=kind==='crossbow',sh=kind==='shield';
  const px=xb?x0+Math.round((x1-x0)*0.3):Math.round((x0+x1)/2),py=(bow||sh||xb)?Math.round((y0+23)/2):22;
  const LEG_GLOW=['#ff8a1f','#ffd35a','#ff4a3a','#c77ad8','#5ad8ff'];const glowCol=rar===3?LEG_GLOW[hh%LEG_GLOW.length]:rar===2?'#ffd35a':rar===1?'#7aa2ff':null;let g=null;
  if(glowCol){const [gc,gx]=mk(24,24);gx.drawImage(c,0,0);gx.globalCompositeOperation='source-in';gx.fillStyle=glowCol;gx.fillRect(0,0,24,24);g=gc;}
  w={c,g,px,py,h:24-y0,col:glowCol,x0,x1,y0};WSPR.set(key,w);return w;}
// 손에 든 무기 그리기: ax,ay=손 위치(월드→화면), ang=0이면 그림 그대로(날이 위), face=좌우
const W_SCALE={great:0.85,staff:0.9,longbow:0.9,shield:0.72,scepter:0.95};
function drawHeld(ws,ax,ay,ang,face,rar,glowT,kind){if(!ws)return;wx.save();wx.translate(ax,ay);const sc=W_SCALE[kind]||1;wx.scale((face<0?-1:1)*sc,sc);wx.rotate(ang);
  if(ws.g&&rar>=1){const a=rar===3?0.4+0.25*Math.sin(glowT*7):rar===2?0.25+0.15*Math.sin(glowT*4):0.18;wx.globalAlpha=a;for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]])wx.drawImage(ws.g,-ws.px+dx,-ws.py+dy);wx.globalAlpha=1;}
  wx.drawImage(ws.c,-ws.px,-ws.py);wx.restore();}
// 인벤토리 아이콘: 무기 그림을 16칸에 맞춰 (근접·지팡이는 비스듬히)
function weaponIconAI(it){const ws=weapSprite(it.kind,it.rar,it.id);if(!ws)return null;const [c,x]=mk(16,16);const diag=!['shortbow','longbow','crossbow'].includes(it.kind);
  x.save();x.translate(8,8);if(diag)x.rotate(Math.PI/4);const hgt=ws.h,wid=ws.x1-ws.x0+1;const k=Math.min(1,(diag?20:15)/Math.max(hgt,wid));x.scale(k,k);x.drawImage(ws.c,-(ws.x0+ws.x1+1)/2,-(ws.y0+24)/2);x.restore();return c;}
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
function iconFor(it){if(it.slot==='weapon'&&SPR.weap){const k2='w|'+it.kind+'|'+it.rar+'|'+(idHash(it.id)%7);let c2=ICONS.get(k2);if(!c2){c2=weaponIconAI(it);if(c2)ICONS.set(k2,c2);}if(c2)return c2;}
  const key=it.slot+it.kind+(it.gem||'');let c=ICONS.get(key);if(c)return c;c=it.slot==='weapon'?weaponIcon(it.kind):it.slot==='armor'?armorIcon(it.kind):ringIcon(it.gem);ICONS.set(key,c);return c;}
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
  smite:q=>{for(let j=0;j<11;j++){q(7,j,'y');q(8,j,'w');q(9,j,'y');}discP(q,8,12,3,'g');discP(q,8,12,2,'y');},
  bloodlust:q=>{discP(q,8,10,4,'r');lineP(q,8,2,4,9,'r');lineP(q,8,2,12,9,'r');lineP(q,8,3,5,9,'e');q(6,9,'w');discP(q,9,11,2,'R');},
  leap:q=>{for(let i=0;i<=20;i++){const t=i/20,x=2+t*11,y=13-Math.sin(t*Math.PI)*10;q(x,y,i>14?'w':'W');}for(const[a,b]of[[10,14],[12,11],[15,12]])lineP(q,13,14,a,b,'y');},
  rend:q=>{for(let k=0;k<3;k++)lineP(q,3+k*3,3,7+k*3,13,k===1?'e':'r');q(4,12,'R');q(10,14,'R');},
  berserk:q=>{discP(q,8,9,5,'R');discP(q,8,9,4,'r');q(6,8,'y');q(10,8,'y');lineP(q,6,11,10,11,'k');for(let i=3;i<14;i+=2)q(i,3+(i%3),'o');q(8,2,'y');},
  frenzy:q=>{lineP(q,2,2,13,13,'s');lineP(q,13,2,2,13,'s');lineP(q,3,2,14,13,'S');lineP(q,14,2,3,13,'S');discP(q,8,8,2,'e');},
  bladestorm:q=>{for(let a=0;a<3;a++){const t=a/3*Math.PI*2;lineP(q,8,8,8+Math.cos(t)*7,8+Math.sin(t)*7,'s');lineP(q,8+Math.cos(t)*7,8+Math.sin(t)*7,8+Math.cos(t+0.7)*6,8+Math.sin(t+0.7)*6,'w');}ringP(q,8,8,3,'S');},
  execute:q=>{discP(q,8,7,5,'w');q(6,7,'k');q(10,7,'k');q(6,6,'k');q(10,6,'k');q(8,9,'k');for(let i=5;i<=11;i+=2)q(i,12,'w');lineP(q,1,15,15,1,'e');},
  earthsplit:q=>{for(let i=1;i<15;i++)q(i,12,'b');lineP(q,8,12,5,6,'o');lineP(q,5,6,7,3,'o');lineP(q,8,12,11,7,'y');lineP(q,11,7,10,2,'o');q(3,11,'B');q(13,11,'B');},
  ironskin:q=>{for(let j=3;j<14;j++)for(let i=4;i<12;i++)q(i,j,(i+j)%3?'S':'s');for(const[a,b]of[[5,4],[10,4],[5,12],[10,12]])q(a,b,'y');lineP(q,4,3,11,3,'w');},
  shieldwall:q=>{for(let j=2;j<15;j++)for(let i=3;i<13;i++)q(i,j,(i===3||i===12||j===2||j===14)?'y':'C');lineP(q,8,3,8,13,'c');lineP(q,4,8,11,8,'c');},
  consecrate:q=>{for(let a=0;a<40;a++){const t=a/40*Math.PI*2;q(8+Math.cos(t)*6,11+Math.sin(t)*3,'y');}lineP(q,8,2,8,10,'w');lineP(q,5,5,11,5,'w');},
  slam:q=>{for(let j=2;j<9;j++)for(let i=6;i<11;i++)q(i,j,'S');lineP(q,6,2,10,2,'s');for(let a=0;a<30;a++){const t=a/30*Math.PI*2;q(8+Math.cos(t)*6,12+Math.sin(t)*2,'W');}},
  undying:q=>{discP(q,8,9,3,'e');q(7,8,'w');for(let i=0;i<6;i++){q(1+i,5+i*0.5,'w');q(15-i,5+i*0.5,'w');q(2+i,7+i*0.4,'W');q(14-i,7+i*0.4,'W');}},
  rally:q=>{lineP(q,4,2,4,14,'b');for(let j=2;j<9;j++)for(let i=5;i<13;i++)q(i,j,j===2?'y':'r');q(8,5,'y');q(9,5,'y');},
  shieldthrow:q=>{discP(q,10,8,4,'C');ringP(q,10,8,4,'y');q(10,8,'c');for(let i=0;i<3;i++)lineP(q,1,5+i*3,5,5+i*3,'W');},
  bastion:q=>{for(let j=5;j<15;j++)for(let i=3;i<13;i++)q(i,j,(i+j)%4?'S':'m');for(let i=3;i<13;i+=3){q(i,3,'S');q(i,4,'S');q(i+1,3,'S');q(i+1,4,'S');}for(let j=9;j<15;j++){q(7,j,'k');q(8,j,'k');}},
  eagle:q=>{for(let i=2;i<15;i++){const h=Math.round(Math.sin((i-2)/12*Math.PI)*4);q(i,8-h,'w');q(i,8+h,'w');}discP(q,8,8,2,'y');q(8,8,'k');},
  trap:q=>{for(let i=2;i<15;i++){q(i,11,'S');if(i%2)q(i,10-((i>>1)%2),'s');}lineP(q,2,11,5,5,'S');lineP(q,14,11,11,5,'S');for(let i=5;i<12;i+=2)q(i,5,'s');q(8,13,'e');},
  poison:q=>{lineP(q,2,13,12,3,'b');q(13,2,'z');q(12,2,'Z');q(13,3,'Z');discP(q,4,5,1,'z');discP(q,11,11,2,'z');q(11,10,'w');},
  volley:q=>{for(let k=-2;k<=2;k++){lineP(q,2,8,14,8+k*3,'b');q(14,8+k*3,'s');}},
  swift:q=>{for(let j=0;j<4;j++)lineP(q,1+j,4+j*3,10+j,4+j*3,j%2?'c':'w');discP(q,12,11,2,'C');},
  sniper:q=>{ringP(q,8,8,5,'e');lineP(q,8,1,8,15,'e');lineP(q,1,8,15,8,'e');q(8,8,'w');},
  barrage:q=>{for(let k=0;k<5;k++){lineP(q,2+k,2+k*3,11+k,2+k*3,'b');q(12+k,2+k*3,'s');}},
  starfall:q=>{const st=[[12,3],[11,4],[12,4],[13,4],[12,5]];st.forEach(([a,b])=>q(a,b,'y'));q(12,4,'w');lineP(q,2,14,11,5,'y');lineP(q,3,14,11,6,'o');lineP(q,2,13,10,5,'w');},
  arcane:q=>{for(let j=4;j<14;j++)for(let i=3;i<13;i++)q(i,j,i===8?'P':'p');lineP(q,3,4,12,4,'P');discP(q,8,8,1,'c');q(5,7,'c');q(11,10,'c');},
  meteor:q=>{discP(q,11,11,3,'o');discP(q,11,11,2,'y');for(let i=0;i<6;i++){q(8-i,8-i,i<3?'o':'r');q(9-i,8-i,'r');q(8-i,9-i,'R');}},
  frostorb:q=>{discP(q,8,8,4,'C');discP(q,8,8,3,'c');q(7,7,'w');for(const[a,b]of[[2,2],[14,3],[2,13],[14,14],[8,1],[1,8]])q(a,b,'w');},
  flamewall:q=>{for(let i=1;i<15;i++){const h=3+((i*5)%4);for(let j=0;j<h;j++)q(i,13-j,j>h-2?'y':j>1?'o':'r');}},
  manaflow:q=>{for(let k=0;k<3;k++)for(let i=1;i<15;i++)q(i,4+k*4+Math.round(Math.sin(i*0.8+k)*1.2),k===1?'c':'C');},
  blizzard:q=>{for(let j=0;j<16;j++)for(let i=0;i<16;i++)if((i+j*3)%7===0)q(i,j,'n');for(const[a,b]of[[4,4],[11,6],[6,11],[12,12]]){q(a,b,'w');q(a-1,b,'c');q(a+1,b,'c');q(a,b-1,'c');q(a,b+1,'c');}},
  thunder:q=>{discP(q,6,4,3,'S');discP(q,10,4,3,'S');discP(q,8,3,3,'s');lineP(q,9,7,6,11,'y');lineP(q,6,11,10,11,'y');lineP(q,10,11,7,15,'y');},
  armageddon:q=>{for(const[x,y]of[[4,4],[11,6],[7,11]]){discP(q,x,y,2,'o');q(x,y,'y');q(x-2,y-2,'r');q(x-3,y-3,'R');}for(let i=0;i<16;i++)q(i,15,'r');},
  devotion:q=>{discP(q,6,7,3,'y');discP(q,10,7,3,'y');for(let j=0;j<5;j++)lineP(q,3+j,9+j,13-j,9+j,'y');q(7,6,'w');},
  renew:q=>{lineP(q,8,2,8,14,'y');lineP(q,4,6,12,6,'y');ringP(q,8,4,2,'w');for(const[a,b]of[[3,12],[13,12],[4,14],[12,14]])q(a,b,'z');},
  purify:q=>{for(let k=1;k<4;k++)ringP(q,8,8,k*2+1,k%2?'y':'w');q(8,8,'w');},
  holyfire:q=>{lineP(q,1,14,14,1,'y');lineP(q,2,14,14,2,'w');lineP(q,1,13,13,1,'g');discP(q,14,2,1,'w');},
  grace:q=>{lineP(q,4,14,12,2,'W');for(let i=0;i<9;i++){q(12-i,2+i*1.3+1,'w');q(13-i,3+i*1.3,'w');}},
  blessing:q=>{discP(q,8,8,3,'y');q(8,8,'w');for(let a=0;a<8;a++){const t=a/8*Math.PI*2;lineP(q,8+Math.cos(t)*5,8+Math.sin(t)*5,8+Math.cos(t)*7,8+Math.sin(t)*7,'g');}},
  lightpillar:q=>{for(let j=1;j<14;j++){q(7,j,'y');q(8,j,'w');q(9,j,'y');}for(let i=3;i<14;i++)q(i,14,'g');ringP(q,8,14,3,'y');},
  miracle:q=>{for(let a=0;a<5;a++){const t=a/5*Math.PI*2-Math.PI/2;lineP(q,8,8,8+Math.cos(t)*6,8+Math.sin(t)*6,'y');}discP(q,8,8,2,'w');ringP(q,8,8,7,'g');}
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
// 설명 글씨가 어두워서 안 보이던 색을 밝게
const TXT_BRIGHT={'#6b6275':'#a79db3','#9e937a':'#d2c7ab','#9e937a ':'#d2c7ab'};
function fontStr(size,font){return font==='px'?`${size}px Silkscreen, "Courier New", monospace`:`800 ${size}px "Nanum Gothic", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif`;}
const [,mcx]=mk(8,8);
function tbitmap(str,size,color,font){font=font||'kr';
  const key=str+'|'+size+'|'+color+'|'+font+'|'+SC;let b=TXT.get(key);if(b)return b;if(TXT.size>1500)TXT.clear();
  color=TXT_BRIGHT[color]||color;size=(font==='px'?size:(size<=12?size+1:size))*SC/2;
  mcx.font=fontStr(size,font);const tw=Math.ceil(mcx.measureText(str).width);const w=Math.max(4,tw+6),h=Math.ceil(size*1.35)+6;
  const [c,x]=mk(w,h);x.font=fontStr(size,font);x.textBaseline='middle';x.fillStyle='#fff';x.fillText(str,3,Math.round(h/2)+1);
  const id=x.getImageData(0,0,w,h),a=id.data,n=w*h,mask=new Uint8Array(n),al=new Uint8Array(n);for(let i=0;i<n;i++){al[i]=a[i*4+3];mask[i]=al[i]>110?1:0;}const smooth=font!=='px'&&SC>2;const rad=SC>=4?2:1;
  const [cr,cg,cb]=rgb(color);
  for(let i=0;i<n;i++){const p=i*4;if(mask[i]||(smooth&&al[i]>50)){a[p]=cr;a[p+1]=cg;a[p+2]=cb;a[p+3]=mask[i]?255:al[i]*2;}else{const X=i%w,Y=(i/w)|0;let o=0;for(let dy=-rad;dy<=rad&&!o;dy++)for(let dx=-rad;dx<=rad;dx++){const xx=X+dx,yy=Y+dy;if(xx>=0&&yy>=0&&xx<w&&yy<h&&mask[yy*w+xx]){o=1;break;}}if(o){a[p]=8;a[p+1]=5;a[p+2]=10;a[p+3]=255;}else a[p+3]=0;}}
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
  const drones=[[1,'sawtooth'],[1.0073,'sawtooth'],[0.5,'sine'],[1.5,'triangle']].map(([r,t])=>{const o=AC.createOscillator();o.type=t;o.frequency.value=55*r;o.connect(dF);o.start();return{o,r};});
  const t=AC.currentTime;MUS={out,rev,dry,dl,dF,drones,chordT:t+0.3,ci:0,mel:t+4,drip:t+6,beat:t+1,mode:'',prof:'',cur:null};
  setInterval(musicTick,120);}
// 테마별 음악: 근음, 화음(반음 단위), 멜로디 음색, 주변음, 보스 박자
// ---- 테마별 배경음: 스텝 시퀀서(템포·음계·베이스·멜로디·타악기·악기가 전부 테마마다 다름) ----
const SCALES={minor:[0,2,3,5,7,8,10],phryg:[0,1,3,5,7,8,10],dorian:[0,2,3,5,7,9,10],harm:[0,2,3,5,7,8,11],locr:[0,1,3,5,6,8,10],lyd:[0,2,4,6,7,9,11],whole:[0,2,4,6,8,10,12]};
const _=null;
const MPROF={
  town:{root:55,sc:'dorian',bpm:84,bar:8,chords:[0,3,4,0],pad:'warm',cut:320,bass:{ins:'pluck',p:[0,_,4,_,7,_,4,_]},lead:{ins:'harp',ph:[[7,_,9,_,11,_,9,7],[9,_,7,_,4,_,_,_],[11,_,12,11,9,_,7,_],[7,_,_,4,7,_,_,_]]},dr:{},amb:'drip',boss:{}},
  0:{root:55,sc:'minor',bpm:62,bar:8,chords:[0,5,3,4],pad:'organ',cut:240,bass:{ins:'sub',p:[0,_,_,_,_,_,_,_]},lead:{ins:'bell',ph:[[7,_,_,9,8,_,7,_],[5,_,4,_,2,_,_,_],[7,_,9,_,11,_,10,_],[9,_,_,7,_,_,_,_]]},dr:{k:'x.......'},amb:'drip',
     boss:{bpm:92,bass:{ins:'saw',p:[0,0,_,0,0,_,5,_]},dr:{k:'x..x..x.',s:'....x...',h:'x.x.x.x.'}}},
  1:{root:61.7,sc:'lyd',bpm:70,bar:8,chords:[0,4,5,3],pad:'glass',cut:420,bass:{ins:'sub',p:[0,_,_,_,4,_,_,_]},lead:{ins:'celesta',ph:[[7,9,11,14,11,9,7,_],[14,_,13,_,11,_,_,_],[4,7,9,11,9,7,4,_],[11,_,_,_,9,_,_,_]]},dr:{},amb:'wind',
     boss:{bpm:100,bass:{ins:'pluck',p:[0,7,0,7,4,11,4,11]},dr:{h:'x.xxx.xx',k:'x...x...'}}},
  2:{root:41.2,sc:'phryg',bpm:96,bar:8,chords:[0,1,0,6],pad:'saw',cut:220,bass:{ins:'saw',p:[0,_,0,1,0,_,_,6]},lead:{ins:'horn',ph:[[7,_,8,_,7,_,5,_],[4,_,_,_,5,_,_,_],[7,8,10,8,7,_,5,_],[1,_,_,_,0,_,_,_]]},dr:{t:'x..x..x.',k:'x.......'},amb:'crackle',
     boss:{bpm:124,dr:{t:'x.xx.xx.',k:'x..x..x.',s:'....x..x'}}},
  3:{root:46.2,sc:'locr',bpm:78,bar:6,chords:[0,1,4,0],pad:'wobble',cut:230,bass:{ins:'wobble',p:[0,_,4,0,_,4]},lead:{ins:'pluck',ph:[[4,_,3,_,1,_],[0,_,_,4,_,_],[7,_,6,_,4,_],[3,_,_,_,_,_]]},dr:{w:'x..x.x'},amb:'bubble',
     boss:{bpm:108,dr:{w:'x.xx.x',k:'x.....',s:'...x..'}}},
  4:{root:58.3,sc:'dorian',bpm:64,bar:8,chords:[0,3,6,4],pad:'choir',cut:360,bass:{ins:'sub',p:[0,_,_,_,_,_,4,_]},lead:{ins:'harp',ph:[[0,2,4,7,9,7,4,2],[9,_,_,_,7,_,_,_],[2,4,7,9,11,9,7,4],[7,_,_,_,_,_,_,_]]},dr:{},amb:'drip',wet:1,
     boss:{bpm:92,bass:{ins:'saw',p:[0,_,0,_,3,_,4,_]},dr:{k:'x...x...',t:'..x...x.'}}},
  5:{root:43.7,sc:'harm',bpm:112,bar:8,chords:[0,0,5,4],pad:'none',cut:260,bass:{ins:'pizz',p:[0,1,0,1,0,1,4,3]},lead:{ins:'pizz',ph:[[7,_,8,_,7,_,6,_],[4,_,_,_,_,_,_,_],[11,_,10,_,8,_,7,_],[6,_,_,_,_,_,_,_]]},dr:{h:'x.x.x.x.'},amb:'skitter',
     boss:{bpm:138,dr:{h:'xxxxxxxx',k:'x..x....',s:'....x...'}}},
  6:{root:65.4,sc:'major',bpm:118,bar:8,chords:[0,5,3,4],pad:'none',cut:360,bass:{ins:'pluck',p:[0,_,4,_,0,_,4,_]},lead:{ins:'musicbox',ph:[[7,9,11,9,7,4,7,_],[11,_,9,_,7,_,_,_],[14,11,9,7,9,11,14,_],[7,_,_,_,4,_,_,_]]},dr:{tick:'x.x.x.x.',w:'....x...'},amb:'tick',
     boss:{bpm:140,bass:{ins:'saw',p:[0,0,4,4,5,5,4,4]},dr:{tick:'xxxxxxxx',k:'x...x...',s:'..x...x.'}}},
  7:{root:55,sc:'harm',bpm:78,bar:6,chords:[0,3,4,0],pad:'organ',cut:280,bass:{ins:'sub',p:[0,_,_,4,_,_]},lead:{ins:'musicbox',ph:[[7,_,6,7,9,_],[8,_,_,7,_,_],[4,_,7,11,10,_],[9,_,_,_,_,_]]},dr:{w:'x.....'},amb:'whisper',
     boss:{bpm:108,dr:{k:'x..x..',s:'...x..',w:'x.xx.x'}}},
  8:{root:73.4,sc:'minor',bpm:128,bar:8,chords:[0,5,6,4],pad:'saw',cut:340,bass:{ins:'saw',p:[0,0,0,0,5,5,6,6]},lead:{ins:'horn',ph:[[7,_,_,9,10,_,9,_],[7,_,_,_,5,_,_,_],[10,_,12,_,14,_,12,10],[9,_,_,_,_,_,_,_]]},dr:{k:'x...x...',h:'..x...x.'},amb:'thunder',
     boss:{bpm:150,dr:{k:'x.x.x.x.',s:'....x...',h:'xxxxxxxx'}}},
  9:{root:36.7,sc:'whole',bpm:50,bar:8,chords:[0,3,1,4],pad:'void',cut:180,bass:{ins:'sub',p:[0,_,_,_,_,_,_,_]},lead:{ins:'glass',ph:[[6,_,_,_,5,_,_,_],[_,_,3,_,_,_,_,_],[8,_,_,7,_,_,_,_],[_,_,_,_,_,_,_,_]]},dr:{},amb:'hum',
     boss:{bpm:84,bass:{ins:'saw',p:[0,_,0,1,_,0,4,_]},dr:{t:'x...x.x.',k:'x.......'}}},
};
MPROF[6].sc='major';SCALES.major=[0,2,4,5,7,9,11];
function degHz(P,deg,oct){const sc=SCALES[P.sc]||SCALES.minor,n=sc.length;const o=Math.floor(deg/n),d=((deg%n)+n)%n;return P.root*Math.pow(2,(oct||0)+o+sc[d]/12);}
function chordHz(p,st){return st.map(x=>p.root*2*Math.pow(2,x/12));}
function pad(freqs,t,dur,vol){for(const f of freqs)for(const dt of[-7,7]){const o=AC.createOscillator();o.type='sawtooth';o.frequency.value=f;o.detune.value=dt;const fl=AC.createBiquadFilter();fl.type='lowpass';fl.frequency.value=520;const g=AC.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+2.5);g.gain.setValueAtTime(vol,t+dur-3);g.gain.linearRampToValueAtTime(0,t+dur);o.connect(fl).connect(g);g.connect(MUS.rev);g.connect(MUS.dry);o.start(t);o.stop(t+dur+0.1);}}
function voice(parts,f,t,vol,type,att,wetDl){parts.forEach(([m,v,d])=>{const o=AC.createOscillator();o.type=type||'sine';o.frequency.value=f*m;const g=AC.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol*v,t+(att||0.006));g.gain.exponentialRampToValueAtTime(0.0001,t+d);o.connect(g);if(wetDl!==false)g.connect(MUS.dl);g.connect(MUS.rev);g.connect(MUS.dry);o.start(t);o.stop(t+d+0.05);});}
function bell(f,t,vol){voice([[1,1,3],[2.76,0.25,1.2],[5.4,0.08,0.8]],f,t,vol);}
function playMel(kind,f,t,vol){
  if(kind==='bell')bell(f,t,vol);
  else if(kind==='glass')voice([[1,1,4.5],[3,0.18,2.5],[4.2,0.06,1.4]],f,t,vol*0.9,'sine',0.35);
  else if(kind==='chime')voice([[1,1,1.8],[3.01,0.35,1],[6.2,0.1,0.5]],f,t,vol);
  else if(kind==='musicbox')voice([[1,1,1.1],[4,0.3,0.5]],f,t,vol*1.1,'sine',0.004);
  else if(kind==='pluck'){const o=AC.createOscillator();o.type='triangle';o.frequency.setValueAtTime(f*1.01,t);o.frequency.exponentialRampToValueAtTime(f*0.985,t+0.35);const g=AC.createGain();g.gain.setValueAtTime(vol*1.4,t);g.gain.exponentialRampToValueAtTime(0.0001,t+0.4);o.connect(g);g.connect(MUS.dl);g.connect(MUS.dry);o.start(t);o.stop(t+0.45);}
  else if(kind==='horn'){const o=AC.createOscillator();o.type='sawtooth';o.frequency.value=f/2;const fl=AC.createBiquadFilter();fl.type='lowpass';fl.frequency.setValueAtTime(300,t);fl.frequency.linearRampToValueAtTime(900,t+0.3);fl.frequency.linearRampToValueAtTime(400,t+1.6);const g=AC.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol*0.9,t+0.2);g.gain.exponentialRampToValueAtTime(0.0001,t+1.8);o.connect(fl).connect(g);g.connect(MUS.rev);g.connect(MUS.dry);o.start(t);o.stop(t+1.9);}}
function nz(t,dur,vol,type,freq,q,dest){const s2=AC.createBufferSource();s2.buffer=NB;s2.loop=true;const f=AC.createBiquadFilter();f.type=type;f.frequency.value=freq;if(q)f.Q.value=q;const g=AC.createGain();g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(vol,t+Math.min(dur*0.4,1.2));g.gain.exponentialRampToValueAtTime(0.0001,t+dur);s2.connect(f).connect(g);g.connect(dest||MUS.rev);s2.start(t);s2.stop(t+dur+0.05);return f;}
function drip(t){const o=AC.createOscillator();o.type='sine';o.frequency.setValueAtTime(rf(1500,2200),t);o.frequency.exponentialRampToValueAtTime(600,t+0.06);const g=AC.createGain();g.gain.setValueAtTime(0.025,t);g.gain.exponentialRampToValueAtTime(0.0001,t+0.1);o.connect(g);g.connect(MUS.rev);o.start(t);o.stop(t+0.12);}
function ambient(kind,t){
  if(kind==='drip')drip(t);
  else if(kind==='wind'){const f=nz(t,4,0.05,'bandpass',500,3);f.frequency.setValueAtTime(rf(300,500),t);f.frequency.linearRampToValueAtTime(rf(700,1100),t+2);f.frequency.linearRampToValueAtTime(rf(300,500),t+4);}
  else if(kind==='crackle'){for(let i=0;i<5;i++)nz(t+rf(0,0.8),0.03,0.05,'highpass',2500,0,MUS.dry);}
  else if(kind==='bubble'){for(let i=0;i<3;i++){const tt=t+i*rf(0.08,0.2);const o=AC.createOscillator();o.type='sine';o.frequency.setValueAtTime(rf(180,260),tt);o.frequency.exponentialRampToValueAtTime(rf(500,800),tt+0.08);const g=AC.createGain();g.gain.setValueAtTime(0.03,tt);g.gain.exponentialRampToValueAtTime(0.0001,tt+0.1);o.connect(g);g.connect(MUS.rev);o.start(tt);o.stop(tt+0.12);}}
  else if(kind==='skitter'){const n=4+(R()*5|0);for(let i=0;i<n;i++)nz(t+i*0.045,0.02,0.035,'highpass',4000,0,MUS.dry);}
  else if(kind==='tick'){nz(t,0.02,0.05,'highpass',3000,0,MUS.dry);nz(t+0.5,0.02,0.035,'highpass',2200,0,MUS.dry);}
  else if(kind==='whisper')nz(t,2.2,0.035,'bandpass',rf(900,1600),9);
  else if(kind==='thunder'){if(R()<0.35)nz(t,3,0.14,'lowpass',180,1);else ambient('wind',t);}
  else if(kind==='hum'){const o=AC.createOscillator();o.type='sine';o.frequency.value=rf(108,112);const tr=AC.createOscillator();tr.frequency.value=rf(3,6);const tg=AC.createGain();tg.gain.value=0.012;const g=AC.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(0.02,t+1);g.gain.linearRampToValueAtTime(0,t+3);tr.connect(tg).connect(g.gain);o.connect(g);g.connect(MUS.rev);o.start(t);tr.start(t);o.stop(t+3.1);tr.stop(t+3.1);}}
function thump(t,vol){const o=AC.createOscillator();o.type='sine';o.frequency.setValueAtTime(75,t);o.frequency.exponentialRampToValueAtTime(32,t+0.18);const g=AC.createGain();g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(0.0001,t+0.25);o.connect(g);g.connect(MUS.dry);o.start(t);o.stop(t+0.3);}
// 악기들
function padVoice(kind,freqs,t,dur,vol){if(kind==='none')return;for(const f of freqs){
  if(kind==='organ'){for(const[m,v]of[[1,1],[2,0.5],[3,0.25],[4,0.15]])env('sine',f*m,t,dur,vol*v*0.8,1.2,2.5);}
  else if(kind==='glass'){env('sine',f*2,t,dur,vol*0.7,1.8,3);env('triangle',f*4,t,dur,vol*0.15,2.5,3);}
  else if(kind==='choir'){for(const dt of[-8,0,8]){const o=AC.createOscillator();o.type='sawtooth';o.frequency.value=f;o.detune.value=dt;const bp=AC.createBiquadFilter();bp.type='bandpass';bp.frequency.value=750;bp.Q.value=1.2;const g=AC.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol*0.9,t+2);g.gain.setValueAtTime(vol*0.9,t+dur-2.5);g.gain.linearRampToValueAtTime(0,t+dur);o.connect(bp).connect(g);g.connect(MUS.rev);o.start(t);o.stop(t+dur+0.1);}}
  else if(kind==='wobble'){const o=AC.createOscillator();o.type='triangle';o.frequency.value=f;const lf=AC.createOscillator();lf.frequency.value=5.5;const lg=AC.createGain();lg.gain.value=f*0.02;lf.connect(lg).connect(o.frequency);const g=AC.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+1.5);g.gain.linearRampToValueAtTime(0,t+dur);o.connect(g);g.connect(MUS.rev);g.connect(MUS.dry);o.start(t);lf.start(t);o.stop(t+dur+0.1);lf.stop(t+dur+0.1);}
  else if(kind==='void'){env('sine',f,t,dur,vol*1.2,dur*0.7,dur*0.3);env('sine',f*1.414,t,dur,vol*0.4,dur*0.8,dur*0.2);}
  else if(kind==='warm'){env('triangle',f,t,dur,vol*0.9,1,2);env('sine',f*2,t,dur,vol*0.4,1,2);}
  else pad([f],t,dur,vol);}}
function env(type,f,t,dur,vol,att,rel){const o=AC.createOscillator();o.type=type;o.frequency.value=f;const g=AC.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+att);g.gain.setValueAtTime(vol,t+Math.max(att,dur-rel));g.gain.linearRampToValueAtTime(0,t+dur);o.connect(g);g.connect(MUS.rev);g.connect(MUS.dry);o.start(t);o.stop(t+dur+0.05);}
function bassVoice(ins,f,t,dur,vol){
  if(ins==='sub'){const o=AC.createOscillator();o.type='sine';o.frequency.value=f;const g=AC.createGain();g.gain.setValueAtTime(vol*1.6,t);g.gain.exponentialRampToValueAtTime(0.0001,t+dur*3);o.connect(g);g.connect(MUS.dry);o.start(t);o.stop(t+dur*3+0.05);}
  else if(ins==='saw'){const o=AC.createOscillator();o.type='sawtooth';o.frequency.value=f;const fl=AC.createBiquadFilter();fl.type='lowpass';fl.frequency.setValueAtTime(900,t);fl.frequency.exponentialRampToValueAtTime(180,t+dur);const g=AC.createGain();g.gain.setValueAtTime(vol*0.9,t);g.gain.exponentialRampToValueAtTime(0.0001,t+dur*0.95);o.connect(fl).connect(g);g.connect(MUS.dry);o.start(t);o.stop(t+dur);}
  else if(ins==='wobble'){const o=AC.createOscillator();o.type='triangle';o.frequency.setValueAtTime(f*1.03,t);o.frequency.exponentialRampToValueAtTime(f*0.97,t+dur*1.5);const g=AC.createGain();g.gain.setValueAtTime(vol*1.4,t);g.gain.exponentialRampToValueAtTime(0.0001,t+dur*1.6);o.connect(g);g.connect(MUS.dry);o.start(t);o.stop(t+dur*1.7);}
  else if(ins==='pizz'){const o=AC.createOscillator();o.type='triangle';o.frequency.value=f*2;const g=AC.createGain();g.gain.setValueAtTime(vol*1.3,t);g.gain.exponentialRampToValueAtTime(0.0001,t+0.18);o.connect(g);g.connect(MUS.dry);g.connect(MUS.rev);o.start(t);o.stop(t+0.2);}
  else{const o=AC.createOscillator();o.type='triangle';o.frequency.value=f*2;const g=AC.createGain();g.gain.setValueAtTime(vol*1.1,t);g.gain.exponentialRampToValueAtTime(0.0001,t+0.45);o.connect(g);g.connect(MUS.dry);g.connect(MUS.dl);o.start(t);o.stop(t+0.5);}}
function leadVoice(ins,f,t,vol){
  if(ins==='celesta')voice([[1,1,1.6],[4,0.2,0.4]],f,t,vol*1.1,'sine',0.003);
  else if(ins==='harp'){const o=AC.createOscillator();o.type='triangle';o.frequency.value=f;const g=AC.createGain();g.gain.setValueAtTime(vol*1.2,t);g.gain.exponentialRampToValueAtTime(0.0001,t+1.4);o.connect(g);g.connect(MUS.dl);g.connect(MUS.rev);g.connect(MUS.dry);o.start(t);o.stop(t+1.5);}
  else if(ins==='pizz')bassVoice('pizz',f/2,t,0.2,vol);
  else playMel(ins,f,t,vol);}
function drum(k,t,v){
  if(k==='k')thump(t,0.22*v);
  else if(k==='t'){const o=AC.createOscillator();o.type='sine';o.frequency.setValueAtTime(110,t);o.frequency.exponentialRampToValueAtTime(48,t+0.35);const g=AC.createGain();g.gain.setValueAtTime(0.26*v,t);g.gain.exponentialRampToValueAtTime(0.0001,t+0.45);o.connect(g);g.connect(MUS.dry);g.connect(MUS.rev);o.start(t);o.stop(t+0.5);nz(t,0.08,0.05*v,'lowpass',400,0,MUS.dry);}
  else if(k==='s'){nz(t,0.14,0.09*v,'bandpass',1800,0.8,MUS.dry);const o=AC.createOscillator();o.type='triangle';o.frequency.setValueAtTime(220,t);o.frequency.exponentialRampToValueAtTime(120,t+0.08);const g=AC.createGain();g.gain.setValueAtTime(0.06*v,t);g.gain.exponentialRampToValueAtTime(0.0001,t+0.1);o.connect(g);g.connect(MUS.dry);o.start(t);o.stop(t+0.12);}
  else if(k==='h')nz(t,0.03,0.035*v,'highpass',7000,0,MUS.dry);
  else if(k==='tick'){nz(t,0.015,0.05*v,'highpass',3500,0,MUS.dry);const o=AC.createOscillator();o.type='square';o.frequency.value=2200;const g=AC.createGain();g.gain.setValueAtTime(0.012*v,t);g.gain.exponentialRampToValueAtTime(0.0001,t+0.02);o.connect(g);g.connect(MUS.dry);o.start(t);o.stop(t+0.03);}
  else if(k==='w'){const o=AC.createOscillator();o.type='triangle';o.frequency.value=rf(760,860);const g=AC.createGain();g.gain.setValueAtTime(0.05*v,t);g.gain.exponentialRampToValueAtTime(0.0001,t+0.05);o.connect(g);g.connect(MUS.dry);o.start(t);o.stop(t+0.06);}}
function musicTick(){if(!MUS||!AC)return;try{const t=AC.currentTime,ahead=t+0.45;
  const bossOn=[...G.monsters.values()].some(m=>m.tc===3&&(m.fl&16));
  const mode=scene!=='game'?'calm':G.kind==='hub'?'town':meDowned()?'dead':bossOn?'boss':'calm';
  const pk=scene==='game'&&G.kind==='dungeon'?String(SH.themeOf(G.floor||1).idx):'town';const base=MPROF[pk]||MPROF[0];const fin=scene==='game'&&G.floor>=100;const boss=mode==='boss';
  const P=boss?Object.assign({},base,base.boss,{dr:Object.assign({},base.dr,(base.boss||{}).dr)}):base;const bpm=P.bpm*(fin&&boss?1.1:1);const step=60/bpm/2;
  if(mode!==MUS.mode||pk!==MUS.prof){MUS.mode=mode;MUS.prof=pk;MUS.dF.frequency.setTargetAtTime(boss?P.cut*1.7:mode==='dead'?150:P.cut,t,1.5);for(const d of MUS.drones)d.o.frequency.setTargetAtTime(base.root*d.r*(fin?0.94:1),t,2);MUS.dl.delayTime.setTargetAtTime(P.wet?0.78:step*3,t,1);MUS.st=0;MUS.bar=0;MUS.stT=Math.max(t+0.05,MUS.stT||0);}
  MUS.out.gain.setTargetAtTime(soundMode===0?0.55:0,t,0.4);
  if(!MUS.stT||MUS.stT<t)MUS.stT=t+0.05;
  while(MUS.stT<ahead){const st=MUS.st%P.bar,bar=MUS.bar,T=MUS.stT;
    if(st===0){const ch=P.chords[bar%P.chords.length];padVoice(P.pad,[degHz(P,ch,1),degHz(P,ch+2,1),degHz(P,ch+4,1)],T,step*P.bar+1.5,boss?0.022:0.018);MUS.chRoot=ch;MUS.phr=pick(P.lead.ph);MUS.leadOn=mode!=='dead'&&(boss||(bar%4)<2||pk==='town');}
    const bd=P.bass.p[st];if(bd!=null&&mode!=='dead')bassVoice(P.bass.ins,degHz(P,bd+(MUS.chRoot||0),0),T,step,0.09);
    const ld=MUS.phr&&MUS.phr[st];if(ld!=null&&MUS.leadOn)leadVoice(P.lead.ins,degHz(P,ld+(MUS.chRoot||0)*0,2),T,0.028);
    for(const k in P.dr){const pat=P.dr[k];if(pat&&pat[st%pat.length]==='x')drum(k,T,boss?1:0.8);}
    MUS.st++;if(MUS.st%P.bar===0)MUS.bar++;MUS.stT+=step;}
  if(MUS.drip<t)MUS.drip=t+1;
  if(MUS.drip<ahead){if(!boss&&P.amb!=='tick')ambient(P.amb,MUS.drip);MUS.drip+=P.amb==='skitter'?rf(1.5,5):rf(2.5,8);}
  }catch(e){if(!MUS.err){MUS.err=1;console.error('music',e);}}}
// ---- 속성별 타격음 ----
const EL_SPARK={zap:'c',fire:'o',ice:'C',holy:'y',poison:'z',void:'P',magic:'p',arrow:'w',blunt:'S',quake:'S'};
function nzF(dur,vol,type,freq,q,delay){const t=AC.currentTime+(delay||0);const s2=AC.createBufferSource();s2.buffer=NB;const f=AC.createBiquadFilter();f.type=type;f.frequency.value=freq;if(q)f.Q.value=q;const g=AC.createGain();g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);s2.connect(f).connect(g).connect(SFXG);s2.start(t,R()*0.3);s2.stop(t+dur+0.03);}
function hitSfx(el,crit){if(!AC||soundMode===2)return;const now=AC.currentTime,key='h_'+el;if(lastS[key]&&now-lastS[key]<0.05)return;lastS[key]=now;const v=rf(0.9,1.12);try{switch(el){
  case'slash':nzF(0.06,0.11,'highpass',2600*v);tone('sawtooth',1100*v,350,0.05,0.022);tone('triangle',2200*v,1900*v,0.09,0.012);break;
  case'blunt':tone('sine',130*v,48,0.13,0.13);noise(0.1,0.12,520*v);break;
  case'heavy':tone('sine',95*v,35,0.2,0.15);noise(0.16,0.15,700);nzF(0.08,0.08,'highpass',2400);break;
  case'arrow':nzF(0.045,0.11,'bandpass',1900*v,3);tone('square',300*v,120,0.04,0.03);break;
  case'magic':tone('sine',820*v,320,0.12,0.05);nzF(0.08,0.05,'bandpass',2600*v,2);break;
  case'zap':for(let i=0;i<6;i++)tone('square',rf(1500,4200),rf(250,900),0.022,0.032,i*rf(0.012,0.028));nzF(0.2,0.075,'highpass',3600);tone('sawtooth',130,95,0.16,0.028);break;
  case'fire':noise(0.24,0.1,1300*v);tone('sawtooth',210*v,70,0.2,0.04);for(let i=0;i<3;i++)nzF(0.015,0.06,'highpass',3200,0,0.03+i*rf(0.03,0.07));break;
  case'ice':tone('triangle',2300*v,1100,0.18,0.05);tone('sine',3300*v,3000,0.12,0.02,0.03);nzF(0.1,0.06,'highpass',5200);break;
  case'holy':{const f=1080*v;tone('sine',f,f*1.01,0.26,0.04);tone('sine',f*1.5,f*1.5,0.2,0.025,0.02);nzF(0.12,0.04,'highpass',4200);break;}
  case'poison':tone('sine',230*v,560,0.08,0.05);tone('sine',260*v,620,0.08,0.04,0.07);noise(0.12,0.05,700);break;
  case'void':tone('sine',560*v,60,0.3,0.07);nzF(0.2,0.05,'bandpass',320,4);break;
  case'quake':tone('sine',72*v,30,0.35,0.15);noise(0.3,0.14,320);break;
  default:noise(0.09,0.12,900);tone('square',180,90,0.06,0.03);}
  if(crit){tone('square',rf(700,900),280,0.1,0.05);nzF(0.1,0.08,'highpass',3000);}}catch(e){}}
// ---- 몬스터 소리: 종류별(시체·해골·짐승·알·촉수·수호·환영·보스) × 테마별 음높이 ----
const TH_PITCH=[1,1.25,0.8,0.9,0.85,1.1,1.15,1.05,1.2,0.7];
function monSfx(tc,kind,wc){if(!AC||soundMode===2)return;const type=SH.MT_LIST[tc]||'zombie';const key='m_'+type+kind;const now=AC.currentTime;if(lastS[key]&&now-lastS[key]<0.12)return;lastS[key]=now;
  const th=G.kind==='dungeon'?SH.themeOf(G.floor||1):null;const p=(th?TH_PITCH[th.idx]:1)*rf(0.9,1.1);try{
  if(kind==='atk'){
    if(type==='zombie'||type==='guard'){if(type==='guard')tone('square',900*p,700*p,0.04,0.03);const o=AC.createOscillator();o.type='sawtooth';o.frequency.setValueAtTime(110*p,now);o.frequency.linearRampToValueAtTime(80*p,now+0.35);const lf=AC.createOscillator();lf.frequency.value=18;const lg=AC.createGain();lg.gain.value=12;lf.connect(lg).connect(o.frequency);const fl=AC.createBiquadFilter();fl.type='lowpass';fl.frequency.value=700;const g=AC.createGain();g.gain.setValueAtTime(0.0001,now);g.gain.exponentialRampToValueAtTime(0.05,now+0.05);g.gain.exponentialRampToValueAtTime(0.0001,now+0.4);o.connect(fl).connect(g).connect(SFXG);o.start();lf.start();o.stop(now+0.45);lf.stop(now+0.45);}
    else if(type==='skel'){if(wc===2){tone('triangle',520*p,180,0.09,0.04);nzF(0.05,0.05,'bandpass',2400,4);}else for(let i=0;i<4;i++)nzF(0.02,0.05,'bandpass',rf(1800,3200)*p,6,i*0.035);}
    else if(type==='hound'){nzF(0.18,0.07,'bandpass',420*p,3);tone('sawtooth',210*p,140*p,0.16,0.035);}
    else if(type==='tentacle'){tone('sine',180*p,420*p,0.2,0.05);noise(0.2,0.05,600);}
    else if(type==='clone'){tone('sine',700*p,300*p,0.35,0.035);nzF(0.3,0.03,'highpass',3000);}
    else if(type==='boss'){const o=AC.createOscillator();o.type='sawtooth';o.frequency.setValueAtTime(70*p,now);o.frequency.linearRampToValueAtTime(55*p,now+0.6);const fl=AC.createBiquadFilter();fl.type='lowpass';fl.frequency.value=500;const g=AC.createGain();g.gain.setValueAtTime(0.0001,now);g.gain.exponentialRampToValueAtTime(0.09,now+0.08);g.gain.exponentialRampToValueAtTime(0.0001,now+0.7);o.connect(fl).connect(g).connect(SFXG);o.start();o.stop(now+0.75);noise(0.4,0.06,350);}}
  else{
    if(type==='skel'||type==='guard'){for(let i=0;i<6;i++)nzF(0.025,0.06,'bandpass',rf(1500,3500)*p,6,i*rf(0.03,0.06));tone('triangle',300*p,120,0.2,0.03);}
    else if(type==='hound'){tone('sawtooth',300*p,90*p,0.3,0.05);nzF(0.2,0.05,'bandpass',600*p,2);}
    else if(type==='egg'){tone('sine',260*p,90,0.15,0.06);noise(0.12,0.08,900);}
    else if(type==='tentacle'){tone('sine',320*p,60,0.35,0.06);noise(0.25,0.06,500);}
    else if(type==='clone'){tone('sine',900*p,200,0.4,0.04);nzF(0.35,0.04,'highpass',2500);}
    else if(type==='boss'){}
    else{tone('sawtooth',140*p,50,0.4,0.05);noise(0.3,0.07,420);}}}catch(e){}}
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
let showInv=false,showChar=false,showShop=false,showMeter=false,showSkills=false,uiRects=[],dropLabels=[],hoverMon=null,hoverDrop=null,hoverPl=null,pressMode='move';
const localCd={};let potCd=0;
const mouse={x:240,y:135,wx:0,wy:0},input={left:false};
const keys=new Set();
let camX=0,camY=0;
const [miniC,miniX]=mk(60,60);

function meDowned(){const p=G.players.get(myId);return !!(p&&p.downed);}
function myCls(){return G.ch?G.ch.cls:'warrior';}
function inDungeon(){return G.kind==='dungeon';}
function net(o){if(ws&&ws.readyState===1)ws.send(JSON.stringify(o));if(o&&o.t)tutSaw(o.t);}
// ---- 처음 하는 사람용 안내 (브라우저마다 한 번) ----
const TUT_STEPS=[
  {k:'move',m:'W A S D 로 움직여 보세요',ok:()=>TUT.moved>50},
  {k:'enter',m:'위쪽 소용돌이(던전 입구)로 가서 F 키나 클릭으로 들어가세요',ok:()=>G.kind==='dungeon'},
  {k:'atk',m:'마우스 왼쪽 클릭으로 공격해요. 몬스터를 향해 눌러 보세요',ok:()=>TUT.saw.atk},
  {k:'sk',m:'우클릭이나 숫자 1~6 으로 스킬을 써요',ok:()=>TUT.saw.sk},
  {k:'dodge',m:'스페이스바로 구르면 잠깐 무적이에요. 빨간 경고 범위는 굴러서 피하세요',ok:()=>TUT.saw.dodge},
  {k:'pick',m:'떨어진 물건은 클릭하거나 F 로 줍고, I 로 장비를 확인해요',ok:()=>TUT.saw.pick||TUT.t>25},
  {k:'more',m:'K 로 스킬을 배우고 강화해요. 5층마다 보스, Q/E 는 물약이에요',ok:()=>TUT.t>9},
];
const TUT={i:0,t:0,moved:0,saw:{},off:false,lx:null,ly:null};
try{const v=localStorage.getItem('bc_tut');if(v==='done')TUT.off=true;else if(v)TUT.i=Math.min(TUT_STEPS.length,+v||0);}catch(e){}
function tutSaw(t){TUT.saw[t]=true;}
function tutUpdate(dt){if(TUT.off||scene!=='game'||TUT.i>=TUT_STEPS.length)return;TUT.t+=dt;if(TUT.lx!=null)TUT.moved+=Math.hypot(me.x-TUT.lx,me.y-TUT.ly);TUT.lx=me.x;TUT.ly=me.y;
  if(TUT_STEPS[TUT.i].ok()){TUT.i++;TUT.t=0;TUT.saw={};sfx('pick');try{localStorage.setItem('bc_tut',TUT.i>=TUT_STEPS.length?'done':String(TUT.i));}catch(e){}}}
function tutSkip(){TUT.off=true;try{localStorage.setItem('bc_tut','done');}catch(e){}}
function drawTut(){if(TUT.off||scene!=='game'||TUT.i>=TUT_STEPS.length||showInv||showChar||showSkills||showShop||G.stairsAsk)return;const st=TUT_STEPS[TUT.i];const y=62,w=Math.min(470,tw(st.m,12)+24);
  pr(240-w/2,y-12,w,30,'rgba(10,7,14,0.82)');pr(240-w/2,y-12,w,1,PAL.y);pr(240-w/2,y+17,w,1,PAL.y);
  txt(`안내 ${TUT.i+1}/${TUT_STEPS.length}`,240-w/2+6,y-5,10,'#ffd35a');txt(st.m,240,y+5,12,'#f2eadb','center');txt('H: 안내 끄기',240+w/2-6,y-5,10,'#6b6275','right');}
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
function clsPreview(cls,ch){const c=document.createElement('canvas');c.width=16;c.height=16;const x=c.getContext('2d');const lk=ch?{a:ch.eq.armor&&ch.eq.armor.kind,ar:ch.eq.armor?ch.eq.armor.rar:0}:{};x.drawImage(playerFrames(cls,lk).idle[0].r.c,0,0);return c;}
function renderSelect(){
  const slots=document.getElementById('slots');slots.innerHTML='';const a=loadChars();
  document.getElementById('noSlots').hidden=a.length>0;
  a.forEach(ch=>{const d=document.createElement('div');d.className='slot';
    const top=document.createElement('div');top.className='row';top.appendChild(clsPreview(ch.cls,ch));top.lastChild.style.cssText='width:40px;height:40px;image-rendering:pixelated';
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

let conn={t0:0,recon:false,tries:0};
function startGame(id){const ch=loadChars().find(c=>c.id===id);if(!ch)return;curSlot=id;initAudio();selEl.hidden=true;scene='connecting';cv.focus();conn={t0:performance.now(),recon:false,tries:0};openWs();}
function openWs(){const ch=loadChars().find(c=>c.id===curSlot);if(!ch){backToSelect('캐릭터를 찾을 수 없습니다');return;}
  const proto=location.protocol==='https:'?'wss':'ws';let s2;try{s2=new WebSocket(`${proto}://${location.host}/ws`);}catch(e){retryWs();return;}ws=s2;let opened=false;
  s2.onopen=()=>{opened=true;conn.tries=0;net(conn.prevParty?{t:'join',ch,prev:conn.prevParty}:{t:'join',ch});};
  s2.onmessage=e=>{if(ws!==s2)return;let d;try{d=JSON.parse(e.data);}catch(er){return;}try{handle(d);}catch(er){console.error(er);}};
  s2.onclose=()=>{if(ws!==s2||scene==='select')return;
    if(scene==='game'){const pp=G.party&&G.party.members&&G.party.members.length>1?G.party.members.map(m=>m.cid).filter(Boolean):null;scene='connecting';conn={t0:performance.now(),recon:true,tries:0,prevParty:pp};resetWorld();}
    retryWs();};}
function retryWs(){const el=(performance.now()-conn.t0)/1000;if(el>120){backToSelect('서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요');return;}conn.tries++;setTimeout(()=>{if(scene==='connecting')openWs();},Math.min(4000,800+conn.tries*600));}
function backToSelect(m){scene='select';try{if(ws)ws.close();}catch(e){}ws=null;selEl.hidden=false;renderSelect();if(m)toast(m);}
function quitToSelect(){scene='select';if(ws){try{ws.close();}catch(e){}}ws=null;selEl.hidden=false;renderSelect();resetWorld();}
function resetWorld(){G.block=null;me.inBoss=false;G.bossLive=null;G.players.clear();G.monsters.clear();G.projs.clear();G.drops.clear();G.zones=[];parts=[];effects=[];texts=[];G.result=null;G.invite=null;G.ctxMenu=null;showInv=showChar=showShop=false;G.portalMenu=false;G.escMenu=false;}

// ================= 네트워크 메시지 =================
function ensurePlayer(id){let p=G.players.get(id);if(!p){p={id,x:0,y:0,dx:0,dy:0,face:1,hp:1,maxHp:1,downed:false,dodge:false,moving:false,shield:false,rev:0,animT:R()*3,atkAnim:0,atkDur:0.3,atkKind:'',atkAngle:0,spin:0,flash:0};G.players.set(id,p);}return p;}
function handle(d){switch(d.t){
  case 'welcome':myId=d.id;scene='game';break;
  case 'err':toast(d.m);break;
  case 'map':{G.block=null;me.inBoss=false;G.bossLive=null;G.kind=d.kind;G.paused=d.paused||null;G.trans=0;G.monsters.clear();G.deadM.clear();G.projs.clear();G.drops.clear();G.zones=[];parts=[];effects=[];texts=[];G.portalMenu=false;showShop=false;
    if(d.kind==='hub'){G.map=SH.genHub();G.floor=0;banner={t:0,a:'던전 입구 광장',b:'동료를 모아 포탈로 들어가세요'};}
    else{G.map=SH.genFloor(d.seed,d.floor);G.floor=d.floor;G.stairsOpen=!!d.stairs;if(d.stairs)SH.openStairs(G.map);const th=SH.themeOf(d.floor);banner={t:0,a:`지하 ${d.floor}층 · ${th.corrupt?'타락한 ':''}${th.t.n}`,b:G.map.boss?`${SH.bossOf(d.floor).n}이(가) 기다린다`:pick(th.t.lines)};}
    torches=G.map.torches;G.explored=new Uint8Array(G.map.w*G.map.h);me.x=d.x;me.y=d.y;me.path=null;me.pickTarget=null;me.goal=null;me.dodgeT=0;
    for(const o of d.drops||[])addDropC(o,true);
    for(const p of G.players.values()){p.dx=p.x;p.dy=p.y;}
    explore();drawMini();break;}
  case 'ros':{G.syn=d.syn||null;G.ros=new Map(d.list.map(r=>[r.id,r]));for(const id of [...G.players.keys()])if(!G.ros.has(id))G.players.delete(id);for(const r of d.list){const p=ensurePlayer(r.id);p.name=r.name;p.cls=r.cls;p.lvl=r.lvl;p.pt=r.pt;p.look=r.look;}break;}
  case 'party':G.party=d;break;
  case 'shop':G.shop=d;break;
  case 'cdr':localCd[d.sid]=0;break;
  case 's':onSnap(d);break;
  case 'ch':{const firstCh=!G.ch;const old=G.ch;G.ch=d.ch;G.S=d.S;if(old&&d.ch.lvl>old.lvl){}saveCurrent(d.ch);break;}
  case 'tp':me.x=d.x;me.y=d.y;me.path=null;me.lastSent='';break;
  case 'force':me.force={vx:d.vx,vy:d.vy,t:d.d};break;
  case 'victory':G.victory=time;sfx('legend');break;
  case 'dadd':for(const o of d.d)addDropC(o,false);break;
  case 'drem':G.drops.delete(d.id);break;
  case 'msg':msg(d.m,d.c||'#e6dcc3');break;
  case 'chat':{G.chatLog.push({name:d.name,m:d.m,t:time});if(G.chatLog.length>40)G.chatLog.shift();G.bubbles.set(d.id,{m:d.m,t:time});sfx('chat');break;}
  case 'invite':G.invite={from:d.from,name:d.name,t:time};sfx('chat');break;
  case 'stairs':G.stairsOpen=true;SH.openStairs(G.map);drawMini();break;
  case 'stairsAsk':G.stairsAsk={floor:d.floor};sfx('stairs');break;
  case 'trans':G.stairsAsk=null;msg(`${d.by}님이 계단에 도착 · ${d.t0}초 후 다음 층으로`,'#ffd35a');sfx('stairs');break;
  case 'result':clearTimeout(G.resT);G.resT=setTimeout(()=>{G.result=d;},1800);break;
  case 'meter':G.meter=d.rows;G.bossLive=d.boss||null;G.bossHist=d.hist||[];break;
  case 'block':G.block=d.r;if(!d.r)me.inBoss=false;break;
  case 'paused':G.paused=d.by;if(d.by)msg(`${d.by}님이 일시정지했습니다`,'#9e937a');break;
  case 'fxp':if(d.k==='learn'){sfx('equip');sfx('cast');}else if(d.k==='gold'){if(d.v)ftext(d.x,d.y-10,`+${d.v}`,'#ffd35a',16,'px');sfx('gold');}else if(d.k==='pick'){sfx(d.r>=3?'legend':d.r>=2?'rare':'pick');}else sfx('pick');break;
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
    for(const a of d.m){const [id,tc,x,y,hp,mhp,face,fl,wc,atkT,mr]=a;if(G.deadM.has(id))continue;ms.add(id);let m=G.monsters.get(id);
      if(!m){m={id,tc,type:SH.MT_LIST[tc],x,y,dx:x,dy:y,animT:R()*3,flash:0};G.monsters.set(id,m);}
      if(wc&&!m.wc&&Math.hypot(x-me.x,y-me.y)<220)monSfx(m.tc,'atk',wc);m.x=x;m.y=y;m.hp=hp;m.maxHp=mhp;m.face=face;m.fl=fl;m.wc=wc;m.atkT=atkT;if(fl&8)m.flash=0.09;if(Math.hypot(m.dx-x,m.dy-y)>60){m.dx=x;m.dy=y;}}
    for(const id of [...G.monsters.keys()])if(!ms.has(id))G.monsters.delete(id);}
  if(d.j){const js=new Set();for(const a of d.j){const [id,tc,x,y,vx,vy,h]=a;js.add(id);let p=G.projs.get(id);if(!p){p={id,type:SH.PROJ_LIST[tc],dx:x,dy:y};G.projs.set(id,p);}p.x=x;p.y=y;p.vx=vx;p.vy=vy;p.h=h;p.st=time;}
    for(const id of [...G.projs.keys()])if(!js.has(id))G.projs.delete(id);}
  if(d.z)G.zones=d.z.map(a=>({vis:a[0],x:a[1],y:a[2],r:a[3],t:a[4],pid:a[5],arm:a[0]>=20&&a[5]===1}));
  if(d.me)G.mev=d.me;
  if(inDungeon()){G.paused=d.pause||null;G.trans=d.trans||0;G.dark=!!d.dark;}
  for(const o of d.fx||[])onFx(o);
}
function playerPos(id){if(id===myId)return me;return G.players.get(id);}
function onFx(o){const k=o.k;
  if(k==='dmg'){if(o.c===2){ftext(o.x+rf(-4,4),o.y+4,String(o.v),'#c9a0e8',12,'px');return;}ftext(o.x+rf(-3,3),o.y,String(o.v),o.c?'#ffd35a':'#f2eadb',o.c?24:16,'px');const el=SH.EL_LIST[o.e]||'slash';sparks(o.x,o.y+10,o.c?'y':(EL_SPARK[el]||'r'),o.c?9:5);hitSfx(el,o.c);if(o.c)shake=Math.max(shake,1.5);}
  else if(k==='pdmg'){const p=playerPos(o.id);if(p&&!(o.q&&o.id!==myId)){ftext(p.x,p.y-18,String(o.v),'#ff5a4a',16,'px');}if(o.id===myId){me.flash=0.1;shake=Math.max(shake,2);sfx('hurt');}else{const q=G.players.get(o.id);if(q)q.flash=0.1;}}
  else if(k==='heal'){ftext(o.x,o.y,'+'+o.v,'#7fd05a',16,'px');for(let n=0;n<6;n++)part(o.x+rf(-5,5),o.y+18,0,0,pick(['z','w']),rf(.4,.8),{z:rf(0,10),vz:rf(20,40),glow:true});}
  else if(k==='txt')ftext(o.x,o.y,o.s,o.c,14,'kr');
  else if(k==='mdie'){const m=G.monsters.get(o.id);const LB=G.lastBoss&&G.lastBoss.id===o.id?G.lastBoss:null;if(m){deathBurst({x:m.dx,y:m.dy},m._s,m.tc===3);if(Math.hypot(m.dx-me.x,m.dy-me.y)<260)monSfx(m.tc,'die');G.monsters.delete(o.id);}else if(LB)deathBurst({x:LB.x,y:LB.y},LB.s,true);
    if(LB){bossFx.push({s:LB.s,x:LB.x,y:LB.y,t0:time});shake=Math.max(shake,7);screenFlash=0.5;G.lastBoss=null;}G.deadM.add(o.id);sfx('mdie');}
  else if(k==='swing'){const p=o.id===myId?me:G.players.get(o.id);if(p&&!(o.id===myId&&me.atkAnim>0)){p.atkKind='swing';p.atkAngle=o.a;p.atkDur=o.d;p.atkAnim=o.d;p.face=Math.cos(o.a)<0?-1:1;effects.push({type:'slash',pid:o.id,a:o.a,t:0,d:o.d,max:o.d+0.08});sfx('swing');}}
  else if(k==='shot'){const p=o.id===myId?me:G.players.get(o.id);if(p){p.atkKind='cast';p.atkAngle=o.a;p.atkDur=0.18;p.atkAnim=0.18;p.face=Math.cos(o.a)<0?-1:1;}const cls=o.id===myId?myCls():(G.players.get(o.id)||{}).cls;sfx(cls==='archer'?'bow':'cast');}
  else if(k==='whirl'){const p=playerPos(o.id);if(p){p.spin=0.3;effects.push({type:'whirl',pid:o.id,t:0,max:0.3,a0:rf(0,6)});}sfx('whirl');}
  else if(k==='dash'){effects.push({type:'dash',x1:o.x1,y1:o.y1,x2:o.x2,y2:o.y2,t:0,max:0.35});sfx('dash');}
  else if(k==='warcry'){effects.push({type:'ring',x:o.x,y:o.y,t:0,max:0.5,r:120,c:'r',c2:'o'});sfx('shout');shake=Math.max(shake,1.5);}
  else if(k==='bulwark'){effects.push({type:'ring',x:o.x,y:o.y,t:0,max:0.5,r:120,c:'c',c2:'C'});sfx('shield');}
  else if(k==='shieldfx'){effects.push({type:'ring',x:o.x,y:o.y,t:0,max:0.45,r:120,c:'c',c2:'w'});sfx('shield');}
  else if(k==='taunt'){effects.push({type:'ring',x:o.x,y:o.y,t:0,max:0.4,r:95,c:'e',c2:'r'});sfx('shout');}
  else if(k==='cleave'){effects.push({type:'cleave',x:o.x,y:o.y,a:o.a,t:0,max:0.3,s:o.s?0.6:1});if(!o.s){shake=Math.max(shake,2);sfx('boom');}}
  else if(k==='bash'){effects.push({type:'star',x:o.x,y:o.y,t:0,max:0.25});shake=Math.max(shake,1.5);sfx('hit');}
  else if(k==='hook'){effects.push({type:'hook',x1:o.x1,y1:o.y1,x2:o.x2,y2:o.y2,t:0,max:0.35});sfx('dash');}
  else if(k==='chain'){effects.push({type:'chain',pts:o.pts,t:0,max:0.3});sfx('bolt');}
  else if(k==='nova'){effects.push({type:'nova',x:o.x,y:o.y,t:0,max:0.35,under:true});for(let n=0;n<40;n++){const t=R()*Math.PI*2,sp=rf(60,130);part(o.x,o.y,Math.cos(t)*sp,Math.sin(t)*sp*0.6,pick(['c','w','C']),rf(.3,.6),{z:3,glow:true});}shake=Math.max(shake,1.5);sfx('ice');}
  else if(k==='tp'){effects.push({type:'tp',x:o.x,y:o.y,t:0,max:0.4});sfx('tp');}
  else if(k==='healburst'){effects.push({type:'ring',x:o.x,y:o.y,t:0,max:0.4,r:42,c:'z',c2:'w'});for(let n=0;n<18;n++)part(o.x+rf(-30,30),o.y+rf(-14,14),0,0,pick(['z','w','y']),rf(.5,.9),{z:rf(0,6),vz:rf(20,50),glow:true});sfx('heal');}
  else if(k==='smite'){effects.push({type:'smite',x:o.x,y:o.y,t:0,max:0.4});shake=Math.max(shake,1.5);sfx('holy');}
  else if(k==='boom'){const cs=o.c?['w','y','c']:['o','y','r'];effects.push({type:'boom',x:o.x,y:o.y,t:0,max:0.28,r:o.r||22,cs:o.c?['w','y','c']:null});for(let n=0;n<16;n++)part(o.x,o.y,rf(-70,70),rf(-50,50),pick(cs),rf(.2,.5),{z:6,vz:rf(10,60),g:-160,glow:true});sfx('boom');}
  else if(k==='slam'){shake=Math.max(shake,5);for(let n=0;n<30;n++){const t=R()*Math.PI*2,sp=rf(40,110);part(o.x,o.y,Math.cos(t)*sp,Math.sin(t)*sp*0.6,pick(['m','S','r','k']),rf(.3,.7),{z:2,vz:rf(20,70),g:-240,ground:true});}sfx('boom');}
  else if(k==='tele')effects.push({type:'tele',x:o.x,y:o.y,r:o.r,t:0,max:o.d,under:true,c:o.c});
  else if(k==='summon'){for(let n=0;n<10;n++)part(o.x,o.y,rf(-20,20),rf(-10,10),pick(['p','R','k']),rf(.4,.8),{z:rf(0,8),vz:rf(20,50),g:-80});}
  else if(k==='spark')sparks(o.x,o.y,o.c,4);
  else if(k==='lvl'){const p=playerPos(o.id);if(p){ftext(p.x,p.y-28,'LEVEL UP','#ffd35a',16,'px');effects.push({type:'lvl',pid:o.id,t:0,max:0.7});for(let n=0;n<30;n++)part(p.x+rf(-6,6),p.y,rf(-20,20),rf(-10,10),pick(['y','g','w']),rf(.5,1),{z:rf(0,10),vz:rf(40,90),g:-60,glow:true});}if(o.id===myId)sfx('lvl');}
  else if(k==='pdown'){const p=playerPos(o.id);const q=G.players.get(o.id);if(p&&q)deathBurst({x:p.x,y:p.y},(SPR.ready?playerFrames(q.cls||'warrior',q.look||{}):FRP[q.cls||'warrior']).idle[0].r,false);sfx('pdie');if(o.id===myId)shake=5;}
  else if(k==='revive'){const p=playerPos(o.id);if(p){effects.push({type:'pillar',pid:o.id,t:0,max:0.8});}sfx('revive');}
  else if(k==='potion'){const p=playerPos(o.id);if(p)for(let n=0;n<14;n++)part(p.x+rf(-5,5),p.y,0,0,o.c==='hp'?'e':'c',rf(.4,.8),{z:rf(0,12),vz:rf(20,50),glow:true});if(o.id===myId)sfx('potion');}
  else if(k==='leap'){effects.push({type:'leapfx',x1:o.x1,y1:o.y1,x2:o.x2,y2:o.y2,t:0,max:0.3});sfx('dash');}
  else if(k==='quake'){effects.push({type:'quake',x:o.x,y:o.y,r:o.r,t:0,max:0.45,under:true,seed:R()*1000});for(let n=0;n<o.r;n++){const t=R()*Math.PI*2,sp=rf(30,90);part(o.x,o.y,Math.cos(t)*sp,Math.sin(t)*sp*0.6,pick(['m','S','b','k']),rf(.3,.7),{z:2,vz:rf(20,80),g:-240,ground:true});}sfx('boom');}
  else if(k==='aim')effects.push({type:'aim',pid:o.id,a:o.a,t:0,max:1});
  else if(k==='strike'){effects.push({type:'strike',x:o.x,y:o.y,t:0,max:0.25,seed:R()*1000});sparks(o.x,o.y,'y',6);sfx('bolt');shake=Math.max(shake,1.5);}
  else if(k==='meteor')effects.push({type:'meteorfall',x:o.x,y:o.y,t:0,max:o.d});
  else if(k==='shards'){for(let n=0;n<6;n++){const t=R()*Math.PI*2;part(o.x,o.y,Math.cos(t)*70,Math.sin(t)*45,pick(['c','w']),0.3,{z:6,glow:true});}}
  else if(k==='execute'){effects.push({type:'star',x:o.x,y:o.y+6,t:0,max:0.3,c:'e'});sfx('crit');}
  else if(k==='ring'){effects.push({type:'ring',x:o.x,y:o.y,t:0,max:0.5,r:o.r,c:o.c,c2:o.c2});}
  else if(k==='teleline')effects.push({type:'teleline',x1:o.x1,y1:o.y1,x2:o.x2,y2:o.y2,w:o.w,t:0,max:o.d,under:true});
  else if(k==='telecone')effects.push({type:'telecone',x:o.x,y:o.y,a:o.a,r:o.r,arc:o.arc,t:0,max:o.d,under:true});
  else if(k==='laser'){effects.push({type:'laser',x1:o.x1,y1:o.y1,x2:o.x2,y2:o.y2,t:0,max:0.3});sfx('bolt');shake=Math.max(shake,2);}
  else if(k==='sweep'){effects.push({type:'sweep',x:o.x,y:o.y,a0:o.a0,a1:o.a1,len:o.len,t:-o.pre,max:o.d});}
  else if(k==='donut')effects.push({type:'donut',x:o.x,y:o.y,r1:o.r1,r2:o.r2,t:0,max:o.d,under:true});
  else if(k==='donutboom'){effects.push({type:'donutboom',x:o.x,y:o.y,r1:o.r1,r2:o.r2,t:0,max:0.35});sfx('boom');}
  else if(k==='nova2'){effects.push({type:'boom',x:o.x,y:o.y,t:0,max:0.3,r:o.r,cs:['y','e','R']});sfx('boom');shake=Math.max(shake,3);}
  else if(k==='mark'){effects.push({type:'mark',pid:o.id,c:o.c,txt:o.txt,t:0,max:o.d});if(o.id===myId){msg(o.txt,o.c==='y'?'#ffd35a':'#8fd0ff');sfx('no');}}
  else if(k==='doom'){G.doom={t:o.d,max:o.d};sfx('boss');}
  else if(k==='flash'){G.flash=0.4;}
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
function setMouse(e){mouse.shift=!!e.shiftKey;const r=cv.getBoundingClientRect();mouse.x=(e.clientX-r.left)/r.width*W;mouse.y=(e.clientY-r.top)/r.height*H;}
function uiHit(){for(let i=uiRects.length-1;i>=0;i--){const r=uiRects[i];if(mouse.x>=r.x&&mouse.x<r.x+r.w&&mouse.y>=r.y&&mouse.y<r.y+r.h&&(r.click||r.right||r.block))return r;}return null;}
function dropUnderMouse(){for(let i=dropLabels.length-1;i>=0;i--){const l=dropLabels[i];if(mouse.x>=l.x&&mouse.x<=l.x+l.w&&mouse.y>=l.y&&mouse.y<=l.y+l.h)return l.d;}for(const d of G.drops.values()){if(d.kind==='item'&&d.t>=0.45&&Math.abs(d.x-mouse.wx)<8&&mouse.wy>d.y-14&&mouse.wy<d.y+3)return d;}return null;}
function monsterAt(x,y){let b=null,bd=1e9;for(const m of G.monsters.values()){if(m.fl&512)continue;const boss=m.tc===3||m.tc===7;const hw=boss?(SPR.ready?18:13):(SPR.ready?9:7),top=boss?(SPR.ready?44:30):(SPR.ready?20:15);if(x>=m.dx-hw&&x<=m.dx+hw&&y>=m.dy-top&&y<=m.dy+3){const d=Math.abs(x-m.dx)+Math.abs(y-(m.dy-top/2));if(d<bd){bd=d;b=m;}}}return b;}
function playerAt(x,y){const top=SPR.ready?20:15;for(const p of G.players.values()){if(p.id===myId)continue;if(Math.abs(x-p.dx)<8&&y>p.dy-top&&y<p.dy+3)return p;}return null;}
function nearNpc(){if(G.kind!=='hub')return null;const m=G.map;if(Math.hypot(me.x-m.merchant.x,me.y-m.merchant.y)<40)return 'merchant';if(Math.hypot(me.x-m.portal.x,me.y-m.portal.y)<48)return 'portal';return null;}
function npcAt(x,y){if(G.kind!=='hub')return null;const m=G.map;if(Math.abs(x-m.merchant.x)<9&&y>m.merchant.y-16&&y<m.merchant.y+3)return 'merchant';if(Math.hypot(x-m.portal.x,y-m.portal.y)<16)return 'portal';return null;}
function openNpc(n){if(n==='merchant'){showShop=true;showInv=true;showSkills=false;G.portalMenu=false;net({t:'shop'});}else if(n==='portal'){G.portalMenu=true;showShop=false;}}
function interact(){const n=nearNpc();if(n){openNpc(n);return;}let b=null,bd=26;for(const d of G.drops.values()){if(d.kind!=='item'||d.t<0.45)continue;const dd=Math.hypot(d.x-me.x,d.y-me.y);if(dd<bd){bd=dd;b=d;}}if(b)net({t:'pick',id:b.id});}
function anyPanel(){return showInv||showChar||showShop||showSkills||G.portalMenu||G.escMenu||G.ctxMenu||G.result;}
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
// 게임 중엔 화면 어디를 우클릭해도 브라우저 메뉴가 뜨지 않게 (캔버스 바깥 여백·겹친 요소 포함)
document.addEventListener('contextmenu',e=>{if(scene!=='select'&&e.target!==chatBox)e.preventDefault();},true);
window.addEventListener('auxclick',e=>{if(scene!=='select')e.preventDefault();},true);
document.addEventListener('mouseup',e=>{if(scene!=='select'&&e.button===2)e.preventDefault();},true);
window.addEventListener('blur',()=>{keys.clear();input.left=false;showMeter=false;});
window.addEventListener('keydown',e=>{if(showMeter&&(e.code==='ArrowLeft'||e.code==='ArrowRight')){const n=(G.bossHist||[]).length;if(n){G.histIdx=((G.histIdx==null?n-1:G.histIdx)+(e.code==='ArrowLeft'?-1:1)+n)%n;}e.preventDefault();}});
window.addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='Tab')showMeter=false;});
window.addEventListener('keydown',e=>{
  if(scene!=='game')return;
  if(document.activeElement===chatBox){if(e.key==='Enter'){const m=chatBox.value.trim();if(m)net({t:'chat',m});chatBox.value='';chatBox.style.display='none';cv.focus();e.preventDefault();}else if(e.key==='Escape'){chatBox.value='';chatBox.style.display='none';cv.focus();e.preventDefault();}return;}
  const c=e.code;initAudio();
  if(MOVEK[c]){keys.add(c);e.preventDefault();}
  if(c==='Space'||c==='Tab')e.preventDefault();
  if(c==='Enter'){openChat();e.preventDefault();return;}
  if(c==='Tab'){showMeter=true;return;}
  if(G.stairsAsk&&(c==='KeyF'||c==='Enter'||c==='Space')){net({t:'descend'});G.stairsAsk=null;e.preventDefault();return;}
  if(G.stairsAsk&&c==='Escape'){G.stairsAsk=null;return;}
  if(c==='Escape'){
    if(G.ctxMenu){G.ctxMenu=null;return;}if(G.result){G.result=null;return;}
    if(showInv||showChar||showShop||showSkills||G.portalMenu){showInv=showChar=showShop=showSkills=false;G.portalMenu=false;return;}
    if(inDungeon()){net({t:'pause'});return;}
    G.escMenu=!G.escMenu;return;}
  if(c==='KeyM'){soundMode=(soundMode+1)%3;try{localStorage.setItem('bc_sound',String(soundMode));}catch(er){}msg(['소리 켬','배경음 끔 · 효과음만','소리 끔'][soundMode]);return;}
  if(c==='KeyI'){showInv=!showInv;if(!showInv)showShop=false;if(showInv)showSkills=false;return;}
  if(c==='KeyH'&&!TUT.off){tutSkip();toast('안내를 껐어요');return;}
  if(c==='KeyK'){showSkills=!showSkills;if(showSkills){showInv=showChar=showShop=false;}return;}
  if(c==='KeyC'){showChar=!showChar;if(showChar)showSkills=false;return;}
  if(G.invite&&(c==='KeyY'||c==='KeyN')){net({t:'ians',from:G.invite.from,ok:c==='KeyY'});G.invite=null;return;}
  if(inDungeon()&&G.paused)return;
  if(c.startsWith('Digit')){const i=+c.slice(5)-1;if(i>=0&&i<SH.BAR_SIZE){G.sel=i;castSkill(i,mouse.wx,mouse.wy);}}
  else if(c==='KeyQ')usePot('hp');else if(c==='KeyE')usePot('mp');
  else if(c==='KeyF')interact();
  else if(c==='Space')dodge();});
function openChat(){const r=cv.getBoundingClientRect();const s=r.width/W;chatBox.style.left=(r.left+6*s)+'px';chatBox.style.top=(r.top+208*s)+'px';chatBox.style.width=(170*s)+'px';chatBox.style.display='block';chatBox.focus();}

// ================= 로컬 행동 =================
function usePot(k){if(meDowned()||potCd>0)return;if(!G.ch)return;if(G.ch.pots[k]<=0){msg(k==='hp'?'체력 물약이 없습니다':'마나 물약이 없습니다','#ff6a5a');sfx('no');return;}potCd=0.4;net({t:'pot',k});}
function castSkill(i,tx,ty){if(!G.ch||meDowned())return;if(!inDungeon()){msg('마을에서는 스킬을 쓸 수 없습니다','#9e937a');return;}
  const sid=G.ch.bar&&G.ch.bar[i];if(!sid){msg(`${i+1}번 칸이 비어 있습니다 · K에서 스킬을 넣으세요`,'#9e937a');return;}const sk=SKILLS[sid];if((localCd[sid]||0)>time){return;}if(G.mev[2]<sk.mp){msg('마나가 부족합니다','#7aa2ff');sfx('no');return;}
  localCd[sid]=time+sk.cd;G.sel=i;me.face=tx<me.x?-1:1;net({t:'sk',i,x:Math.round(tx),y:Math.round(ty)});me.path=null;me.pickTarget=null;}
function dodge(){if(meDowned()||me.dodgeCd>0||!G.map||G.mev[9]===0)return;let vx=0,vy=0;for(const k of keys){const v=MOVEK[k];if(v){vx+=v[0];vy+=v[1];}}
  if(!vx&&!vy){vx=mouse.wx-me.x;vy=mouse.wy-me.y;}const l=Math.hypot(vx,vy)||1;me.dodx=vx/l;me.dody=vy/l;me.dodgeT=0.28;me.dodgeCd=0.9;me.path=null;net({t:'dodge'});sfx('dodge');}
function tryAttack(){if(!G.ch||!G.S||meDowned()||me.atkCd>0)return;const a=Math.atan2(mouse.wy-(me.y-6),mouse.wx-me.x);me.atkCd=1/(G.S.atkRate*(G.mev[7]||1));net({t:'atk',a:Math.round(a*100)/100});
  if(CLASSES[G.ch.cls].basic.kind==='melee'){const dur=clamp(0.3*1.25/(G.S.atkRate*(G.mev[7]||1)),0.12,0.36);me.atkKind='swing';me.atkAngle=a;me.atkDur=dur;me.atkAnim=dur;me.face=Math.cos(a)<0?-1:1;effects.push({type:'slash',pid:myId,a,t:0,d:dur,max:dur+0.08});sfx('swing');}}
function updateMe(dt){
  me.animT+=dt;me.flash=Math.max(0,me.flash-dt);me.atkCd-=dt;me.dodgeCd-=dt;potCd-=dt;if(me.atkAnim>0)me.atkAnim-=dt;if(me.spin>0)me.spin-=dt;
  const frozen=meDowned()||(inDungeon()&&(G.paused||G.trans>0&&G.trans<0.3))||!G.map||!G.S;
  me.moving=false;
  if(frozen){me.dodgeT=0;return;}
  if(me.force&&me.force.t>0){me.force.t-=dt;SH.moveEnt(G.map,me,me.force.vx*dt,me.force.vy*dt);}
  if(me.dodgeT>0){me.dodgeT-=dt;const st=250*dt;SH.moveEnt(G.map,me,me.dodx*st,me.dody*st);me.moving=true;if(R()<0.7)part(me.x+rf(-3,3),me.y,0,0,'W',0.25,{z:rf(0,6)});}
  else{
    if(input.left&&pressMode==='attack'&&inDungeon()&&!uiHit())tryAttack();
    let kx=0,ky=0;for(const k of keys){const v=MOVEK[k];if(v){kx+=v[0];ky+=v[1];}}
    const slow=(me.atkAnim>0?0.45:1)*(G.mev[9]==null?1:G.mev[9]);
    if(kx||ky){const l=Math.hypot(kx,ky),st=G.S.ms*dt*slow;SH.moveEnt(G.map,me,kx/l*st,ky/l*st);me.moving=true;me.path=null;me.pickTarget=null;me.goal=null;if(me.atkAnim<=0&&kx)me.face=kx<0?-1:1;}
    else if(me.path&&me.path.length&&me.atkAnim<=0){const wp=me.path[0],dx=wp.x-me.x,dy=wp.y-me.y,d=Math.hypot(dx,dy),st=G.S.ms*dt;if(Math.abs(dx)>0.3)me.face=dx<0?-1:1;
      if(d<=st){if(!SH.blocked(G.map,wp.x,wp.y,me.r)){me.x=wp.x;me.y=wp.y;}me.path.shift();}else{const ox=me.x,oy=me.y;SH.moveEnt(G.map,me,dx/d*st,dy/d*st);if(Math.hypot(me.x-ox,me.y-oy)<st*0.2)me.path.shift();}me.moving=true;}
  }
  if(me.pickTarget){const d=me.pickTarget;if(!G.drops.has(d.id))me.pickTarget=null;else if(Math.hypot(d.x-me.x,d.y-me.y)<18){net({t:'pick',id:d.id});me.pickTarget=null;me.path=null;}}
  if(me.goal&&nearNpc()===me.goal){openNpc(me.goal);me.goal=null;me.path=null;}
  if(G.block){const b=G.block;const ins=me.x>=b.x+2&&me.x<b.x+b.w-2&&me.y>=b.y+2&&me.y<b.y+b.h-2;if(ins)me.inBoss=true;else if(me.inBoss){me.x=clamp(me.x,b.x+6,b.x+b.w-6);me.y=clamp(me.y,b.y+6,b.y+b.h-6);me.path=null;}}else me.inBoss=false;
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
    if(p.type==='frostorb'&&R()<0.8)part(p.dx+rf(-3,3),p.dy,rf(-8,8),rf(-8,8),pick(['c','w']),rf(.2,.4),{z:p.h,glow:true});
    if(p.type==='holybeam'&&R()<0.8)part(p.dx,p.dy,0,0,pick(['y','w']),rf(.1,.25),{z:p.h,glow:true});
    if(p.type==='poison'&&R()<0.5)part(p.dx,p.dy,0,0,'z',rf(.2,.4),{z:p.h});
    if(p.type==='pierce'&&R()<0.8)part(p.dx,p.dy,0,0,'c',rf(.15,.3),{z:p.h,glow:true});}
  for(const d of G.drops.values()){d.t+=dt;if(d.kind==='item'&&d.it.rar>=2&&d.t>0.45&&R()<dt*6)part(d.x+rf(-2,2),d.y,0,0,d.it.rar===3?'o':'y',0.8,{z:rf(0,6),vz:rf(15,30),glow:true});}
  for(const z of G.zones){if(z.arm)continue;if(z.vis===22&&R()<dt*6)part(z.x+rf(-z.r,z.r)*0.7,z.y+rf(-z.r,z.r)*0.4,0,0,'z',rf(.4,.8),{z:0,vz:12});if(z.vis===21&&R()<dt*3)part(z.x,z.y,0,0,pick(['o','y']),0.5,{vz:25,glow:true});if(z.vis===29&&R()<dt*60)part(me.x+rf(-240,240),me.y+rf(-140,100),rf(-40,-10),rf(30,60),pick(['w','c']),rf(.6,1.2),{z:0,glow:true});
    if(z.vis===2&&R()<dt*25)part(z.x+rf(-z.r,z.r)*0.8,z.y+rf(-z.r,z.r)*0.5,0,0,pick(['o','y','r']),rf(.3,.6),{z:0,vz:rf(20,45),glow:true});
    if(z.vis===3&&R()<dt*30)part(z.x+rf(-z.r,z.r),z.y+rf(-z.r,z.r)*0.6-20,rf(-10,10),20,pick(['w','c']),rf(.5,.9),{z:10,glow:true});
    if((z.vis===0||z.vis===5||z.vis===6)&&R()<dt*20)part(z.x+rf(-z.r,z.r)*0.8,z.y+rf(-z.r,z.r)*0.5,0,0,pick(['y','w','z']),rf(.5,.9),{z:0,vz:rf(15,35),glow:true});
    if(z.vis===1)for(let n=0;n<2;n++)if(R()<dt*30){const x=z.x+rf(-z.r,z.r)*0.9,y=z.y+rf(-z.r,z.r)*0.55;effects.push({type:'arrowfall',x,y,t:0,max:0.18});}}
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
function drawTiles(icx,icy){const map=G.map,hub=!!map.hub;const TA=hub?null:themeAssets(G.floor);const FL=TA?TA.floors:FLOORS,WL=TA?TA.walls:WALLS,ST=TA?TA.stairs:STAIRS;const x0=Math.floor(icx/TS)-1,y0=Math.floor(icy/TS)-1,x1=x0+Math.ceil(W/TS)+2,y1=y0+Math.ceil(H/TS)+2;
  for(let ty=y0;ty<=y1;ty++)for(let tx=x0;tx<=x1;tx++){const t=SH.tileAt(map,tx,ty),sx=tx*TS-icx,sy=ty*TS-icy,h=((tx*73856093)^(ty*19349663))>>>0;
    if(t===1||t===3){if(TA&&TA.ftex)wx.drawImage(TA.ftex,(((tx%16)+16)%16)*16,(((ty%16)+16)%16)*16,16,16,sx,sy,16,16);else wx.drawImage(hub?HUBFLOOR[h%4]:FL[h%FL.length],sx,sy);}
    else if(t===2)wx.drawImage(ST,sx,sy);
    else if(SH.tileAt(map,tx,ty+1)>0){if(TA&&TA.wtex)wx.drawImage(TA.wtex,(((tx%16)+16)%16)*16,0,16,16,sx,sy,16,16);else wx.drawImage(WL[h%WL.length],sx,sy);}
    else{let nb=false;for(let j=-1;j<=1&&!nb;j++)for(let i=-1;i<=1;i++)if(SH.tileAt(map,tx+i,ty+j)>0){nb=true;break;}
      if(nb&&hub){wx.drawImage(PILLAR_TOP,sx,sy);continue;}
      if(nb){wx.fillStyle=PAL.k;wx.fillRect(sx,sy,16,16);wx.fillStyle=PAL.m;if(SH.tileAt(map,tx-1,ty)>0)wx.fillRect(sx,sy,1,16);if(SH.tileAt(map,tx+1,ty)>0)wx.fillRect(sx+15,sy,1,16);if(SH.tileAt(map,tx,ty-1)>0)wx.fillRect(sx,sy,16,1);
        wx.fillStyle=PAL.D;if(SH.tileAt(map,tx-1,ty)>0)wx.fillRect(sx+1,sy,1,16);if(SH.tileAt(map,tx+1,ty)>0)wx.fillRect(sx+14,sy,1,16);if(SH.tileAt(map,tx,ty-1)>0)wx.fillRect(sx,sy+1,16,1);}}}}
function pickFrame(e,fr){let set,idx;if(e.atkAnim>0){set=fr.atk;idx=Math.min(2,Math.floor((1-e.atkAnim/e.atkDur)*3));}else if(e.moving){set=fr.walk;idx=Math.floor(e.animT*(e.fast?16:8))%4;}else{set=fr.idle;idx=Math.floor(e.animT*2)%2;}const f=set[idx];return e.face<0?f.l:f.r;}
function drawPlayer(p,icx,icy,isMe){const cls=isMe?myCls():(p.cls||'warrior');const src=isMe?me:p;const look=isMe?lookOfMe():(p.look||{});const fr=playerFrames(cls,look);
  const e={atkAnim:src.atkAnim,atkDur:src.atkDur,moving:isMe?me.moving:p.moving,animT:src.animT,face:isMe?me.face:p.face};const s=pickFrame(e,fr);
  const bx=Math.round(isMe?me.x:p.dx)-icx,by=Math.round(isMe?me.y:p.dy)-icy;
  wx.drawImage(SH_S,bx-6,by-1);
  if(p&&p.downed){wx.save();wx.translate(bx,by-(s.ai?5:3));wx.rotate(Math.PI/2*(p.face<0?-1:1));wx.globalAlpha=0.75;wx.drawImage(s.c,-s.w/2,-s.h/2);wx.restore();wx.globalAlpha=1;
    if((time*3|0)%2===0){wpx(bx,by-12,'e');wpx(bx,by-13,'e');wpx(bx,by-14,'e');wpx(bx,by-10,'e');}return s;}
  const dodging=isMe?me.dodgeT>0:p.dodge;if(dodging)wx.globalAlpha=((time*30|0)&1)?0.35:0.7;
  const flash=isMe?me.flash:p.flash;
  const sx=bx-(s.w>>1)+(s.dx||0),sy=by-s.h+2+(s.dy||0);
  if(look.ar>=2&&!s.ai)drawCape(bx,by,e.face,look.ar,e.moving,src.animT);
  if(cls==='guardian'&&!(src.spin>0)&&!s.anim)drawShield(bx,by,e.face,false,look.ar);
  blitS(flash>0?s.fc:s.c,s,sx-(flash>0&&s.ai?e.face:0),sy,flash);
  if(s.bare&&SPR.weap){drawHeldGear(cls,src,s,sx,sy,e,look);}
  else{if(!s.anim||src.spin>0)drawWeapon(cls,src,bx,by,e.face,isMe?(G.ch&&G.ch.eq.weapon):null,look);else weaponTrail(cls,src,bx,by,e.face);
  if(cls==='guardian'&&!(src.spin>0)&&!s.anim)drawShield(bx,by,e.face,true,look.ar);}
  if(look.ar===3||look.wr===3){if(R()<0.35)part((isMe?me.x:p.dx)+rf(-6,6),(isMe?me.y:p.dy),rf(-4,4),0,pick(['o','y','o','w']),rf(.5,.9),{z:rf(0,6),vz:rf(18,34),glow:true});}
  if(look.rr>=2&&((time*4|0)%3===0)){wpx(bx+(e.face>0?-4:3),by-5,look.rr===3?'o':'c');}
  if(p&&p.shield){wx.globalAlpha=0.5;for(let n=0;n<24;n++){const t=n/24*Math.PI*2+time*2;if(n%2)wpx(Math.round(bx+Math.cos(t)*9),Math.round(by-6+Math.sin(t)*10),'c');}}
  wx.globalAlpha=1;return s;}
function drawShield(bx,by,face,front,ar){if(front!==(face>0))return;if(SPR.ready)by-=2;ar=ar|0;const x=bx+(face>0?4:-8),y=by-9;const big=ar>=2;const w=big?5:4,h=big?7:6;wx.fillStyle=PAL.k;wx.fillRect(x-1,y-1,w+2,h+2);wx.fillStyle=PAL[['C','C','n','R'][ar]];wx.fillRect(x,y,w,h);wx.fillStyle=PAL[['y','c','y','o'][ar]];wx.fillRect(x+1,y+1,w-2,h-2);wx.fillStyle=PAL[['n','n','C','r'][ar]];wx.fillRect(x+Math.floor(w/2),y+1,1,h-2);if(ar===3&&((time*6|0)%2))wpx(x+Math.floor(w/2),y+2,'w');}
function drawCape(bx,by,face,ar,moving,animT){const c1=ar===3?'r':'R',c2=ar===3?'o':'y';const dir=face>0?-1:1;const sway=moving?Math.round(Math.sin(animT*12)*1):0;
  for(let j=0;j<9;j++){const w=2+Math.floor(j/3);const x0=bx+dir*(3+Math.floor(j/4))+sway*(j>5?1:0);for(let i=0;i<w;i++){const x=x0+(dir>0?i:-i);wpx(x,by-11+j,j===8||i===w-1?c2:c1);}}}
// 동작 그림을 쓸 때: 무기는 그림에 있으니 휘두르는 궤적만 그린다
// 맨손 캐릭터 + 장착 무기 그림
function drawHeldGear(cls,src,s,sx,sy,e,look){const fam=CLASSES[cls].fam;const kind=look.w||(fam==='melee'?'sword':fam==='bow'?'shortbow':'staff');const rar=Math.max(0,look.wr|0);
  const ws=weapSprite(kind,rar,look.wid);const f=e.face;const ks=s.ks||1,kh=s.kh||1;const ax=sx+Math.round(s.hx*ks+(s.w-s.w*ks)/2),ay=sy+Math.round(s.hy*kh+s.h*(1-kh));
  const atk=src.atkAnim>0,prog=atk?1-src.atkAnim/src.atkDur:0,bob=e.moving?Math.sin(src.animT*10)*0.12:0;let ang;
  if(src.spin>0)ang=(1-src.spin/0.3)*Math.PI*2.4;
  else if(fam==='melee'){ang=atk&&src.atkKind==='swing'?-1.3+prog*3.1:atk?1.35:0.35+bob;}
  else if(kind==='crossbow'){ang=0;}
  else if(fam==='bow'){ang=atk?0:0.12+bob*0.5;}
  else{ang=atk?0.95:0.12+bob*0.5;}
  if(cls==='guardian'){const shW=weapSprite('shield',Math.max(0,look.ar|0),'s'+(look.ar|0));const scx=sx+(f>0?Math.round(s.w/2)+5:Math.round(s.w/2)-5),scy=sy+s.h-7;
    drawHeld(ws,ax,ay,ang,f,rar,time,kind);if(shW)drawHeld(shW,atk?ax+(f>0?3:-3):scx,atk?ay+1:scy,0,f,Math.max(0,look.ar|0),time+1,'shield');}
  else drawHeld(ws,ax,ay,ang,f,rar,time,kind);
  if(rar===3&&ws&&R()<0.5){const L=ws.h*0.7,aa=ang*(f<0?-1:1);part(ax+Math.sin(aa)*rf(2,L)*(f<0?-1:1)+ (0),ay-Math.cos(aa)*rf(2,L),rf(-6,6),rf(-6,6),pick(['o','y','w','r']),rf(.3,.6),{z:0,glow:true});}
  else if(rar===2&&ws&&R()<0.12)part(ax+rf(-2,2),ay-rf(2,ws.h*0.8),0,rf(-8,-3),'y',0.4,{glow:true});
  if(fam==='melee'&&atk&&src.atkKind==='swing'&&prog>0.25&&prog<0.85){const L=(ws?ws.h:12)-2;wx.globalAlpha=0.45;for(let k=0;k<8;k++){const aa=-1.3+(prog-k*0.035)*3.1;const px=ax+Math.sin(aa)*L*f,py=ay-Math.cos(aa)*L;wpx(Math.round(px),Math.round(py),rar===3?'o':rar===2?'y':k<3?'w':'s');}wx.globalAlpha=1;}}
function weaponTrail(cls,src,bx,by,f){const fam=CLASSES[cls].fam;if(!(src.atkAnim>0))return;const prog=1-src.atkAnim/src.atkDur;
  if(fam==='melee'&&src.atkKind==='swing'){if(prog<0.25||prog>0.85)return;const hx=bx+(f>0?4:-5),hy=by-8,len=11;wx.globalAlpha=0.55;for(let k=0;k<9;k++){const aa=src.atkAngle+f*(-1.7+prog*3.4)-(f>0?1:-1)*k*0.13;wpx(Math.round(hx+Math.cos(aa)*len),Math.round(hy+Math.sin(aa)*len),k<3?'w':'s');}wx.globalAlpha=1;}
  else if(fam==='staff'&&prog>0.3){const tx=bx+(f>0?12:-12),ty=by-12;for(let n=0;n<3;n++)wpx(tx+ri(-2,2),ty+ri(-2,2),cls==='priest'?'y':'p');}}
function drawWeapon(cls,src,bx,by,f,wItem,look){if(SPR.ready)by-=3;const fam=CLASSES[cls].fam;const kind=wItem?wItem.kind:look&&look.w?look.w:(fam==='melee'?'sword':fam==='bow'?'shortbow':'staff');const wr=Math.max(0,(look&&look.wr)|0);const BL=['s','c','y','o'],BL2=['S','C','g','r'];
  if(fam==='bow'){const hx=bx+(f>0?5:-6),hy=by-7;let a=src.atkAnim>0?src.atkAngle:(f>0?0:Math.PI);const L=kind==='longbow'?7:5;const ca=Math.cos(a),sa=Math.sin(a),pa=a+Math.PI/2;
    for(let t=-L;t<=L;t++){const bend=Math.sqrt(Math.max(0,L*L-t*t))*0.5;wpx(Math.round(hx+Math.cos(pa)*t+ca*bend),Math.round(hy+Math.sin(pa)*t+sa*bend),wr>=2&&Math.abs(t)>=L-1?BL[wr]:kind==='crossbow'?'S':wr===3?'r':'b');}
    const pull=src.atkAnim>0?-2:0;lineP(wpx,Math.round(hx+Math.cos(pa)*L+ca*pull),Math.round(hy+Math.sin(pa)*L+sa*pull),Math.round(hx-Math.cos(pa)*L+ca*pull),Math.round(hy-Math.sin(pa)*L+sa*pull),'w');return;}
  if(fam==='staff'){const hx=bx+(f>0?4:-5),hy=by-3;const tilt=src.atkAnim>0?(f>0?0.6:-0.6):(f>0?0.15:-0.15);const len=kind==='wand'?7:12;const tx=Math.round(hx+Math.sin(tilt)*len),ty=Math.round(hy-Math.cos(tilt)*len);
    lineP(wpx,hx,hy+2,tx,ty,kind==='scepter'||wr>=2?'g':'b');const gem=wr===3?'o':wr===2?'y':cls==='priest'?'y':kind==='wand'?'c':'p';if(wr>=2&&((time*5|0)%2))wpx(tx+(f>0?2:-2),ty-2,'w');wx.fillStyle=PAL.k;wx.fillRect(tx-2,ty-2,4,4);wx.fillStyle=PAL[gem];wx.fillRect(tx-1,ty-1,2,2);wpx(tx-1,ty-1,'w');
    if(src.atkAnim>0){for(let n=0;n<3;n++)wpx(tx+ri(-2,2),ty+ri(-2,2),gem);}return;}
  const hx=bx+(f>0?4:-5),hy=by-5;const len={dagger:6,sword:9,great:12,axe:9,mace:9}[kind]||9;let a,world=false;const swing=src.atkAnim>0&&src.atkKind==='swing';
  if(src.spin>0)a=(1-src.spin/0.3)*Math.PI*2.4;else if(swing){const prog=1-src.atkAnim/src.atkDur;a=src.atkAngle+f*(-1.7+prog*3.4);world=true;}else a=-1.0+(src.moving?Math.sin(src.animT*10)*0.15:0);
  if(f<0&&!world)a=Math.PI-a;const ca=Math.cos(a),sa=Math.sin(a);
  if(swing){const prog=1-src.atkAnim/src.atkDur;if(prog>0.3&&prog<0.8){wx.globalAlpha=0.5;for(let k=1;k<8;k++){const aa=a-(f>0?1:-1)*k*0.13;wpx(Math.round(hx+Math.cos(aa)*(len-1)),Math.round(hy+Math.sin(aa)*(len-1)),'w');}wx.globalAlpha=1;}}
  const blade=kind==='axe'||kind==='mace'?(wr>=2?BL2[wr]:'b'):BL[wr];
  for(let i=2;i<=len;i++)wpx(Math.round(hx+ca*i),Math.round(hy+sa*i)+1,'k');
  for(let i=1;i<=len;i++){const x=Math.round(hx+ca*i),y=Math.round(hy+sa*i);wpx(x,y,i===1?'g':i===len&&(blade==='s'||wr>=2)?'w':blade);}
  if(wr===3&&R()<0.4)part(bx+ca*len*0.7+(hx-bx),by+sa*len*0.7-5+(hy-by)+5,0,0,pick(['o','y']),0.35,{z:5,vz:10,glow:true});
  const pa=a+Math.PI/2;wpx(Math.round(hx+ca*2+Math.cos(pa)*1.6),Math.round(hy+sa*2+Math.sin(pa)*1.6),'g');wpx(Math.round(hx+ca*2-Math.cos(pa)*1.6),Math.round(hy+sa*2-Math.sin(pa)*1.6),'g');
  if(kind==='axe'){for(let k=-2;k<=2;k++)for(let j=0;j<2;j++)wpx(Math.round(hx+ca*(len-j)+Math.cos(pa)*k),Math.round(hy+sa*(len-j)+Math.sin(pa)*k),k>0?BL[wr]:BL2[wr]);}
  if(kind==='mace'){const tx=Math.round(hx+ca*len),ty=Math.round(hy+sa*len);wx.fillStyle=PAL.S;wx.fillRect(tx-1,ty-1,3,3);wpx(tx-1,ty-1,'s');}}
function drawMonster(m,icx,icy){if(m.fl&512)return;const fr=themedMonsterFrames(m.type,G.floor);const boss=m.tc===3||m.tc===7;const wd=WIND_DUR[m.wc]||0.35;
  const e={atkAnim:m.atkT>0?m.atkT:0,atkDur:m.atkT>0?Math.max(m.atkT,wd):1,moving:!!(m.fl&(64|32)),animT:m.animT,face:m.face,fast:!!(m.fl&32)};const s=pickFrame(e,fr);m._s=s;if(m.tc===3)G.lastBoss={id:m.id,s,x:m.dx,y:m.dy};
  const bx=Math.round(m.dx)-icx,by=Math.round(m.dy)-icy;const sh=boss?SH_B:SH_S;if(!(m.fl&1024))wx.drawImage(sh,bx-(sh.width>>1),by-(sh.height>>1)+1);
  let sx=bx-(s.w>>1)+(s.dx||0),sy=by-s.h+2+(s.dy||0);if(m.wc===3)sx+=(Math.floor(time*30)&1)?1:-1;if(m.wc===5)sy+=(Math.floor(time*20)&1);
  if(m.flash>0&&s.ai)sx-=(m.face||1)*(boss?1:2);
  blitS(m.flash>0?s.fc:s.c,s,sx,sy,boss?0:m.flash);
  if((m.fl&1)&&m.flash<=0){wx.globalAlpha=0.35;wx.drawImage(s.fc,sx,sy);wx.globalAlpha=1;}
  if(m.fl&128){wx.globalAlpha=0.45;for(let n=0;n<40;n++){const t=n/40*Math.PI*2+time;if(n%2)wpx(Math.round(bx+Math.cos(t)*(s.w/2+2)),Math.round(by-s.h/2+Math.sin(t)*(s.h/2+2)),'c');}wx.globalAlpha=1;}
  if(m.fl&256&&R()<0.3)part(m.dx+rf(-8,8),m.dy,0,0,'y',0.4,{z:rf(4,24),vz:20,glow:true});
  if(m.fl&4){for(let n=0;n<3;n++){const t=time*5+n*2.1;wpx(Math.round(bx+Math.cos(t)*5),Math.round(sy-2+Math.sin(t)*1.5),'y');}}}
function drawMerchant(icx,icy){const m=G.map.merchant;const bx=Math.round(m.x)-icx,by=Math.round(m.y)-icy;wx.drawImage(SH_S,bx-6,by-1);const bob=(time*2|0)%2;if(SPR.ready){wx.drawImage(SPR.heroes[20].r.c,bx-12,by-22+bob);return;}wx.drawImage(MERCHANT.c,bx-8,by-14+bob);
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
  if(p.type==='web'){if(glow)return;for(let i=-2;i<=2;i++){wpx(sx+i,sy,'w');wpx(sx,sy+i,'w');}wpx(sx-1,sy-1,'W');wpx(sx+1,sy+1,'W');wpx(sx+1,sy-1,'W');wpx(sx-1,sy+1,'W');return;}
  if(p.type==='page'){if(glow)return;const f=(time*12|0)%2;wx.fillStyle=PAL.k;wx.fillRect(sx-3,sy-2,7,5);wx.fillStyle=PAL.w;wx.fillRect(sx-2,sy-1,f?5:3,3);wpx(sx,sy,'P');return;}
  if(p.type==='void'){if(!glow)return;const r=p.id%3===0?4:3;wx.fillStyle=PAL.P;wx.fillRect(sx-r,sy-r+1,r*2+1,r*2-1);wx.fillRect(sx-r+1,sy-r,r*2-1,r*2+1);wx.fillStyle=PAL.k;wx.fillRect(sx-r+2,sy-r+2,r*2-3,r*2-3);return;}
  if(p.type==='ice'){if(!glow)return;const l=Math.hypot(p.vx,p.vy)||1,ux=p.vx/l,uy=p.vy/l;for(let i=0;i<6;i++){wpx(Math.round(sx-ux*i),Math.round(sy-uy*i),i<2?'w':'c');}return;}
  if(p.type==='fireb'){if(!glow)return;wx.fillStyle=PAL.r;wx.fillRect(sx-2,sy-2,5,5);wx.fillStyle=PAL.o;wx.fillRect(sx-1,sy-1,3,3);wpx(sx,sy,'y');return;}
  if(p.type==='shieldp'){if(glow)return;const t=(time*20|0)%2;wx.fillStyle=PAL.k;wx.fillRect(sx-2,sy-2,5,5);wx.fillStyle=PAL.C;wx.fillRect(sx-1,sy-1,3,3);wpx(sx+(t?1:-1),sy,'y');return;}
  if(p.type==='poison'){if(glow)return;const l=Math.hypot(p.vx,p.vy)||1,ux=p.vx/l,uy=p.vy/l;for(let i=0;i<6;i++)wpx(Math.round(sx-ux*i),Math.round(sy-uy*i),i===0?'z':i>=4?'Z':'W');return;}
  if(p.type==='frostorb'){if(!glow)return;wx.fillStyle=PAL.C;wx.fillRect(sx-3,sy-2,7,5);wx.fillRect(sx-2,sy-3,5,7);wx.fillStyle=PAL.c;wx.fillRect(sx-2,sy-2,5,5);wpx(sx-1,sy-1,'w');return;}
  if(p.type==='holybeam'){if(!glow)return;const l=Math.hypot(p.vx,p.vy)||1,ux=p.vx/l,uy=p.vy/l;for(let i=0;i<14;i++){wpx(Math.round(sx-ux*i),Math.round(sy-uy*i),i<3?'w':'y');if(i<8)wpx(Math.round(sx-ux*i),Math.round(sy-uy*i)+1,'g');}return;}
  if(p.type==='arrow'||p.type==='parrow'){if(glow)return;const l=Math.hypot(p.vx,p.vy)||1,ux=p.vx/l,uy=p.vy/l;for(let i=0;i<6;i++)wpx(Math.round(sx-ux*i),Math.round(sy-uy*i),i===0?'s':i>=4?(p.type==='parrow'?'z':'w'):'W');}
  else if(p.type==='pierce'){if(!glow)return;const l=Math.hypot(p.vx,p.vy)||1,ux=p.vx/l,uy=p.vy/l;for(let i=0;i<9;i++)wpx(Math.round(sx-ux*i),Math.round(sy-uy*i),i<2?'w':i<5?'c':'C');}
  else if(glow){const [a,b,c]=p.type==='fire'?['r','o','y']:p.type==='orb'?['p','e','y']:p.type==='bolt'?['C','c','w']:['g','y','w'];wx.fillStyle=PAL[a];wx.fillRect(sx-2,sy-1,5,3);wx.fillRect(sx-1,sy-2,3,5);wx.fillStyle=PAL[b];wx.fillRect(sx-1,sy-1,3,3);wpx(sx,sy,c);if((time*20|0)&1)wpx(sx-1,sy,c);}}
const ZVIS={0:['y','z',0.35],1:['W',null,0],2:['o','r',0.5],3:['c','w',0.45],5:['y','y',0.3],6:['y','w',0.3],7:['S',null,0],8:['S',null,0]};
const HZ={20:['R','r'],21:['o','r'],22:['Z','z'],23:['w','W'],24:['C','n'],25:['k','S'],26:['p','P'],27:['S','w'],28:['o','y']};
function drawHazard(z,icx,icy){const sx=Math.round(z.x)-icx,sy=Math.round(z.y)-icy;if(z.vis===29){return;}const r=Math.min(z.r,200),ry=Math.round(r*0.6);const c=HZ[z.vis]||HZ[20];const fl=(time*6|0);
  if(z.arm){if(z.vis===25)return;for(let n=0;n<64;n++){if(((n+fl)&3)!==0)continue;const t=n/64*Math.PI*2;wpx(Math.round(sx+Math.cos(t)*r),Math.round(sy+Math.sin(t)*ry),'e');}return;}
  if(z.vis===26){for(let n=0;n<30;n++){const t=n/30*Math.PI*2+time*3;const rr=3+(n%4)*2;wpx(Math.round(sx+Math.cos(t)*rr),Math.round(sy-6+Math.sin(t)*rr),n%2?'p':'P');}return;}
  if(z.vis===27){for(let n=0;n<40;n++){const t=n/40*Math.PI*6+time*9;const h=n/40*22;const rr=3+h*0.4;wpx(Math.round(sx+Math.cos(t)*rr),Math.round(sy-h),n%3?'S':'w');}return;}
  if(z.vis===28){for(let n=0;n<48;n++){const t=n/48*Math.PI*2;if(n%2)wpx(Math.round(sx+Math.cos(t)*r),Math.round(sy+Math.sin(t)*ry),'y');}wx.fillStyle=PAL.b;wx.fillRect(sx-4,sy-1,9,2);for(let n=0;n<10;n++)wpx(sx+ri(-3,3),sy-2-ri(0,6),pick(['o','y','r']));return;}
  for(let j=-ry;j<=ry;j++)for(let i=-r;i<=r;i++){const e2=i*i+(j/0.6)**2;if(e2>r*r)continue;const edge=e2>(r-2)*(r-2);
    if(z.vis===25){wpx(sx+i,sy+j,edge?'S':'k');continue;}
    if(z.vis===23){if(((i+j)%6===0)||((i-j)%6===0))wpx(sx+i,sy+j,edge?'W':'w');continue;}
    if(edge){wpx(sx+i,sy+j,c[1]);continue;}if(((i+j*3+fl)&3)===0||((i*5+j+fl)%7===0))wpx(sx+i,sy+j,((i*7+j*3+fl)%9===0)?c[1]:c[0]);}}
// 보스방 봉인: 방 경계의 통로 칸에 붉은 결계
function drawBossSeal(icx,icy){const b=G.block,tx0=Math.round(b.x/TS),ty0=Math.round(b.y/TS),tx1=Math.round((b.x+b.w)/TS),ty1=Math.round((b.y+b.h)/TS);const cells=[];
  for(let x=tx0;x<tx1;x++){cells.push([x,ty0-1,0]);cells.push([x,ty1,0]);}for(let y=ty0;y<ty1;y++){cells.push([tx0-1,y,1]);cells.push([tx1,y,1]);}
  const a=0.55+0.35*Math.sin(time*6);for(const[x,y,v]of cells){const tt=SH.tileAt(G.map,x,y);if(!(tt===1||tt===2||tt===3))continue;const sx=x*TS-icx,sy=y*TS-icy;if(sx<-16||sy<-16||sx>W||sy>H)continue;
    wx.globalAlpha=a*0.35;wx.fillStyle='#e0303a';wx.fillRect(sx,sy,16,16);wx.globalAlpha=a;for(let k=0;k<16;k+=3){const o=Math.floor((time*20+k*3)%16);if(v)wpx(sx+8,sy+((k+o)%16),'r');else wpx(sx+((k+o)%16),sy+8,'r');}
    if(R()<0.15)part(x*TS+rf(2,14),y*TS+rf(2,14),0,0,'r',0.5,{z:rf(0,8),vz:rf(10,30),glow:true});}wx.globalAlpha=1;}
function drawZone(z,icx,icy){if(z.vis>=20){drawHazard(z,icx,icy);return;}const sx=Math.round(z.x)-icx,sy=Math.round(z.y)-icy;const r=z.r,ry=Math.round(r*0.6);const v=ZVIS[z.vis]||ZVIS[0];
  if(z.vis===8){const bl=(time*3|0)%2;wpx(sx-3,sy,'S');wpx(sx+3,sy,'S');for(let i=-4;i<=4;i++)wpx(sx+i,sy+1,'S');for(let i=-3;i<=3;i+=2)wpx(sx+i,sy-1,'s');if(bl)wpx(sx,sy,'e');return;}
  if(z.vis===7){for(let n=0;n<3;n++){const t=time*14+n/3*Math.PI*2;for(let i=6;i<r;i+=2)wpx(Math.round(sx+Math.cos(t)*i),Math.round(sy-5+Math.sin(t)*i*0.6),i>r-6?'w':'s');}return;}
  for(let n=0;n<72;n++){const t=n/72*Math.PI*2+(z.vis===0||z.vis===6?time*0.8:0);if(n%2)wpx(Math.round(sx+Math.cos(t)*r),Math.round(sy+Math.sin(t)*ry),v[0]);}
  if(v[1]){wx.globalAlpha=v[2];const fl=(time*6|0);for(let j=-ry;j<=ry;j++)for(let i=-r;i<=r;i++){if(i*i+(j/0.6)**2>r*r)continue;if(((i+j+fl)&3)===0)wpx(sx+i,sy+j,z.vis===2&&((i*7+j+fl)%5===0)?'y':v[1]);}wx.globalAlpha=1;}
  if(z.vis===5){wx.globalAlpha=0.55;for(let j=0;j<70;j++){if(((j+(time*20|0))&3)===0)continue;wpx(sx-2,sy-j,'y');wpx(sx+2,sy-j,'y');wpx(sx,sy-j,'w');}wx.globalAlpha=1;}}
function epos(e){if(e.pid!=null){const p=e.pid===myId?me:G.players.get(e.pid);if(p)return [e.pid===myId?me.x:p.dx,e.pid===myId?me.y:p.dy];}return [e.x,e.y];}
function drawEffect(e,icx,icy){const [ex,ey]=epos(e);const sx=Math.round(ex)-icx,sy=Math.round(ey)-icy,k=e.t/e.max;
  if(e.type==='tele'){const c1=e.c||'e',c2=e.c?'r':'r';const r=e.r,rr=r*k,ry=Math.ceil(r*0.6);for(let j=-ry;j<=ry;j++)for(let i=-r;i<=r;i++){const e2=i*i+(j/0.6)**2;if(e2>r*r)continue;if(e2>=(r-1.5)**2)wpx(sx+i,sy+j,c1);else if(e2<=rr*rr&&((i+j+(time*10|0))&3)===0)wpx(sx+i,sy+j,c2);}}
  else if(e.type==='boom'){const cs=e.cs||['y','o','r'];const r=Math.round(4+(e.r-4)*Math.min(1,k*2)),ry=Math.ceil(r*0.7);for(let j=-ry;j<=ry;j++)for(let i=-r;i<=r;i++){const d=Math.sqrt(i*i+(j/0.7)**2)/r;if(d>1)continue;if(k>0.5&&((i+j)&1))continue;wpx(sx+i,sy+j-3,d<0.35?cs[0]:d<0.7?cs[1]:cs[2]);}}
  else if(e.type==='nova'){const r=66*k;wx.globalAlpha=1-k*0.6;for(let n=0;n<96;n++){const t=n/96*Math.PI*2;wpx(Math.round(sx+Math.cos(t)*r),Math.round(sy+Math.sin(t)*r*0.6),'c');wpx(Math.round(sx+Math.cos(t)*(r-2)),Math.round(sy+Math.sin(t)*(r-2)*0.6),n%2?'C':'w');}wx.globalAlpha=1;}
  else if(e.type==='ring'){const r=e.r*Math.min(1,k*1.4);wx.globalAlpha=1-k;for(let n=0;n<110;n++){const t=n/110*Math.PI*2;wpx(Math.round(sx+Math.cos(t)*r),Math.round(sy-4+Math.sin(t)*r*0.55),n%2?e.c:e.c2);}wx.globalAlpha=1;}
  else if(e.type==='whirl'){for(let n=0;n<34;n++){const t=e.a0+k*Math.PI*2.2-n*0.08;wx.globalAlpha=Math.max(0,1-n/34);wpx(Math.round(sx+Math.cos(t)*20),Math.round(sy-5+Math.sin(t)*12),n<8?'w':'s');wpx(Math.round(sx+Math.cos(t)*17),Math.round(sy-5+Math.sin(t)*10),'S');}wx.globalAlpha=1;}
  else if(e.type==='slash'){const s0=e.d*0.35;if(e.t<s0)return;const k2=(e.t-s0)/(e.max-s0),px=sx,py=sy-6;wx.globalAlpha=Math.max(0,1-k2);for(let n=0;n<22;n++){const t=e.a-1.1+n*0.1,r=14+(n%3===0?1:0);wpx(Math.round(px+Math.cos(t)*r),Math.round(py+Math.sin(t)*r*0.8),n>8&&n<14?'w':'s');wpx(Math.round(px+Math.cos(t)*(r-2)),Math.round(py+Math.sin(t)*(r-2)*0.8),'S');}wx.globalAlpha=1;}
  else if(e.type==='cleave'){const sc=e.s||1;wx.globalAlpha=1-k;for(let rr=20*sc;rr<=58*sc;rr+=3)for(let n=0;n<26;n++){const t=e.a-0.75+n*0.06;if(((n+rr)&1))continue;wpx(Math.round(sx+Math.cos(t)*rr*(0.4+k*0.6)),Math.round(sy-3+Math.sin(t)*rr*0.6*(0.4+k*0.6)),rr>50?'w':rr>35?'o':'r');}wx.globalAlpha=1;}
  else if(e.type==='star'){const r=Math.round(3+k*8);for(let n=0;n<8;n++){const t=n/8*Math.PI*2;lineP(wpx,sx,sy-6,Math.round(sx+Math.cos(t)*r),Math.round(sy-6+Math.sin(t)*r),n%2?(e.c||'y'):'w');}}
  else if(e.type==='dash'){wx.globalAlpha=1-k;const x1=e.x1-icx,y1=e.y1-icy,x2=e.x2-icx,y2=e.y2-icy;for(let o=-3;o<=3;o+=2)lineP(wpx,x1,y1-5+o,x2,y2-5+o,o===-1||o===1?'w':'S');wx.globalAlpha=1;}
  else if(e.type==='hook'){const x1=e.x1-icx,y1=e.y1-icy-4,x2=e.x2-icx,y2=e.y2-icy-4;const kk=k<0.5?k*2:2-k*2;const mx=x1+(x2-x1)*kk,my=y1+(y2-y1)*kk;const n=Math.max(2,Math.round(Math.hypot(mx-x1,my-y1)/3));for(let i=0;i<=n;i++){const t=i/n;wpx(Math.round(x1+(mx-x1)*t),Math.round(y1+(my-y1)*t),i%2?'S':'s');}wpx(Math.round(mx),Math.round(my),'w');}
  else if(e.type==='chain'){wx.globalAlpha=1-k;for(let i=0;i<e.pts.length-1;i++){const [ax,ay]=e.pts[i],[bx2,by2]=e.pts[i+1];let px=ax-icx,py=ay-icy;const segs=6;for(let s=1;s<=segs;s++){const t=s/segs;const nx=ax-icx+(bx2-ax)*t+(s<segs?rf(-3,3):0),ny=ay-icy+(by2-ay)*t+(s<segs?rf(-3,3):0);lineP(wpx,px,py,nx,ny,s%2?'y':'w');px=nx;py=ny;}}wx.globalAlpha=1;}
  else if(e.type==='smite'){wx.globalAlpha=1-k;for(let j=0;j<60;j++){wpx(sx,sy-j,'w');wpx(sx-1,sy-j,'y');wpx(sx+1,sy-j,'y');if(j%3===0){wpx(sx-2,sy-j,'g');wpx(sx+2,sy-j,'g');}}const r=Math.round(6+k*20);for(let n=0;n<48;n++){const t=n/48*Math.PI*2;wpx(Math.round(sx+Math.cos(t)*r),Math.round(sy+Math.sin(t)*r*0.6),'y');}wx.globalAlpha=1;}
  else if(e.type==='arrowfall'){const y0=sy-30+k*30;for(let i=0;i<5;i++)wpx(sx+Math.round(i*0.3),Math.round(y0-i),i===0?'s':'b');if(k>0.9){wpx(sx-1,sy,'W');wpx(sx+1,sy,'W');}}
  else if(e.type==='leapfx'){const x1=e.x1-icx,y1=e.y1-icy,x2=e.x2-icx,y2=e.y2-icy;wx.globalAlpha=1-k;for(let i=0;i<=16;i++){const t=i/16;wpx(Math.round(x1+(x2-x1)*t),Math.round(y1+(y2-y1)*t-Math.sin(t*Math.PI)*22-6),i%2?'W':'w');}wx.globalAlpha=1;}
  else if(e.type==='quake'){const rr=SH.mulberry(e.seed|0);wx.globalAlpha=1-k;for(let n=0;n<10;n++){const t=rr()*Math.PI*2;let x=sx,y=sy;const L=e.r*(0.5+rr()*0.5)*Math.min(1,k*3);for(let s=0;s<L;s+=3){const a=t+(rr()-0.5)*0.6;const nx=x+Math.cos(a)*3,ny=y+Math.sin(a)*2;lineP(wpx,x,y,nx,ny,s>L*0.6?'o':'k');x=nx;y=ny;}}wx.globalAlpha=1;}
  else if(e.type==='aim'){const p=e.pid===myId?me:G.players.get(e.pid);if(!p)return;const bx=Math.round(e.pid===myId?me.x:p.dx)-icx,by=Math.round(e.pid===myId?me.y:p.dy)-icy-6;for(let i=6;i<160;i+=3){if(((i+(time*40|0))&7)>3)continue;wpx(Math.round(bx+Math.cos(e.a)*i),Math.round(by+Math.sin(e.a)*i),k>0.7?'w':'e');}}
  else if(e.type==='strike'){const rr=SH.mulberry(e.seed|0);let x=sx,y=sy-90;wx.globalAlpha=1-k;while(y<sy){const nx=x+Math.round((rr()-0.5)*8),ny=y+8;lineP(wpx,x,y,nx,Math.min(ny,sy),'y');lineP(wpx,x+1,y,nx+1,Math.min(ny,sy),'w');x=nx;y=ny;}wx.globalAlpha=1;}
  else if(e.type==='meteorfall'){const x=sx-60*(1-k),y=sy-90*(1-k);for(let i=1;i<8;i++)wpx(Math.round(x-i*2*0.66),Math.round(y-i*2),i<3?'o':'r');wx.fillStyle=PAL.o;wx.fillRect(Math.round(x)-2,Math.round(y)-2,5,5);wx.fillStyle=PAL.y;wx.fillRect(Math.round(x)-1,Math.round(y)-1,3,3);}
  else if(e.type==='teleline'){const x1=e.x1-icx,y1=e.y1-icy,x2=e.x2-icx,y2=e.y2-icy;const L=Math.hypot(x2-x1,y2-y1)||1,ux=(x2-x1)/L,uy=(y2-y1)/L,px=-uy,py=ux,w=e.w/2;
    for(let s2=0;s2<L;s2+=2){const ax=x1+ux*s2,ay=y1+uy*s2;wpx(Math.round(ax+px*w),Math.round(ay+py*w),'e');wpx(Math.round(ax-px*w),Math.round(ay-py*w),'e');if(s2<L*k&&((s2>>1)+(time*10|0))%3===0)wpx(Math.round(ax),Math.round(ay),'r');}}
  else if(e.type==='telecone'){for(let rr=6;rr<=e.r;rr+=3){const n=Math.ceil(rr*e.arc);for(let i=-n;i<=n;i++){const t=e.a+i/n*e.arc;const edge=rr>e.r-3||Math.abs(i)===n;if(!edge&&(rr>e.r*k||((i+rr+(time*10|0))&3)))continue;wpx(Math.round(sx+Math.cos(t)*rr),Math.round(sy+Math.sin(t)*rr*0.8),edge?'e':'r');}}}
  else if(e.type==='laser'){wx.globalAlpha=1-k;const x1=e.x1-icx,y1=e.y1-icy-6,x2=e.x2-icx,y2=e.y2-icy-6;for(let o2=-2;o2<=2;o2++)lineP(wpx,x1,y1+o2,x2,y2+o2,Math.abs(o2)<1?'w':Math.abs(o2)<2?'y':'o');wx.globalAlpha=1;}
  else if(e.type==='sweep'){if(e.t<0)return;const a=e.a0+(e.a1-e.a0)*Math.min(1,k);const x2=sx+Math.cos(a)*e.len,y2=sy+Math.sin(a)*e.len;for(let o2=-2;o2<=2;o2++)lineP(wpx,sx,sy-6+o2,Math.round(x2),Math.round(y2-6+o2),Math.abs(o2)<1?'w':Math.abs(o2)<2?'y':'e');}
  else if(e.type==='donut'){for(let n=0;n<120;n++){const t=n/120*Math.PI*2;wpx(Math.round(sx+Math.cos(t)*e.r1),Math.round(sy+Math.sin(t)*e.r1*0.6),'e');wpx(Math.round(sx+Math.cos(t)*e.r2),Math.round(sy+Math.sin(t)*e.r2*0.6),'e');}
    const rr=e.r2-(e.r2-e.r1)*k;for(let n=0;n<120;n++){if(n%3)continue;const t=n/120*Math.PI*2;wpx(Math.round(sx+Math.cos(t)*rr),Math.round(sy+Math.sin(t)*rr*0.6),'r');}}
  else if(e.type==='donutboom'){wx.globalAlpha=1-k;for(let rr=e.r1;rr<e.r2;rr+=4)for(let n=0;n<90;n++){if((n+rr)%3)continue;const t=n/90*Math.PI*2;wpx(Math.round(sx+Math.cos(t)*rr),Math.round(sy+Math.sin(t)*rr*0.6),rr%8?'o':'y');}wx.globalAlpha=1;}
  else if(e.type==='mark'){const cc=e.c==='y'?'y':'c';const left=e.max-e.t;const top=sy-26-Math.round(Math.sin(time*6)*1.5);for(let n=0;n<16;n++){const t=n/16*Math.PI*2+time*3;wpx(Math.round(sx+Math.cos(t)*7),Math.round(sy+Math.sin(t)*4),cc);}
    wx.fillStyle=PAL.k;wx.fillRect(sx-2,top-1,5,7);wx.fillStyle=PAL[cc];wx.fillRect(sx-1,top,3,4);wx.fillRect(sx-1,top+5,3,1);if(left<1&&((time*10|0)&1))wx.fillRect(sx-3,top-2,7,9);}
  else if(e.type==='click'){const r=Math.round(4*(1-k))+1;wpx(sx-r,sy,'g');wpx(sx+r,sy,'g');wpx(sx,sy-r,'g');wpx(sx,sy+r,'g');}
  else if(e.type==='tp'){wx.globalAlpha=1-k;for(let n=0;n<14;n++){const yy=Math.round(-k*24-rf(0,18)),xx=Math.round(rf(-5,5));wpx(sx+xx,sy+yy,n%3?'p':'c');}wx.globalAlpha=1;}
  else if(e.type==='pillar'){wx.globalAlpha=1-k;for(let j=0;j<40;j++){if(((j+(time*20|0))&1))continue;wpx(sx-3,sy-j,'y');wpx(sx+3,sy-j,'y');wpx(sx,sy-j-rf(0,4),'w');}wx.globalAlpha=1;}
  else if(e.type==='lvl'){const r=6+k*22;wx.globalAlpha=1-k;for(let n=0;n<40;n++){const t=n/40*Math.PI*2;wpx(Math.round(sx+Math.cos(t)*r),Math.round(sy+Math.sin(t)*r*0.5-k*10),'y');}wx.globalAlpha=1;}}
function drawParts(icx,icy,glow){for(const p of parts){if(p.glow!==glow)continue;const x=Math.round(p.x)-icx,y=Math.round(p.y-p.z)-icy;if(x<0||y<0||x>=W||y>=H)continue;wx.globalAlpha=p.life<p.max*0.35?p.life/(p.max*0.35):1;wx.fillStyle=col(p.c);wx.fillRect(x,y,1,1);}wx.globalAlpha=1;}
function computeLights(icx,icy){const L=[];
  L.push({x:me.x-icx,y:me.y-8-icy,r:G.dark?64:meDowned()?100:150,i:1});
  for(const p of G.players.values()){if(p.id===myId)continue;L.push({x:p.dx-icx,y:p.dy-8-icy,r:G.dark?40:110,i:0.95});}
  {const lk=lookOfMe();if((lk.ar===3||lk.wr===3)&&!G.dark)L.push({x:me.x-icx,y:me.y-8-icy,r:175,i:1});}
  for(const t of torches){const x=t.x-icx,y=t.y+4-icy;if(G.dark||x<-80||x>W+80||y<-80||y>H+80)continue;L.push({x,y,r:66+Math.sin(time*9+t.ph)*3+Math.sin(time*23+t.ph)*2,i:1});}
  for(const p of G.projs.values()){if(p.type!=='arrow'&&p.type!=='parrow'&&p.type!=='poison'&&p.type!=='shieldp'&&p.type!=='web'&&p.type!=='page')L.push({x:p.dx-icx,y:p.dy-p.h-icy,r:p.type==='fire'?46:32,i:1});}
  for(const e of effects){if(e.type==='boom')L.push({x:e.x-icx,y:e.y-icy,r:70*(1-e.t/e.max)+10,i:1});else if(e.type==='nova'||e.type==='smite')L.push({x:e.x-icx,y:e.y-icy,r:90*(1-e.t/e.max)+10,i:.9});}
  for(const z of G.zones)if(z.vis===28)L.push({x:z.x-icx,y:z.y-icy,r:60,i:1});else if(z.vis===21&&!z.arm)L.push({x:z.x-icx,y:z.y-icy,r:22,i:0.7});else if(z.vis<20&&z.vis!==8)L.push({x:z.x-icx,y:z.y-icy,r:z.r+20,i:z.vis===1||z.vis===7?0.5:0.9});
  if(G.kind==='dungeon'&&G.stairsOpen){const x=(G.map.stairsIdx%G.map.w)*TS+8-icx,y=((G.map.stairsIdx/G.map.w)|0)*TS+8-icy;L.push({x,y,r:40+Math.sin(time*3)*3,i:.9});}
  if(G.kind==='hub'){const p=G.map.portal;L.push({x:p.x-icx,y:p.y-4-icy,r:60+Math.sin(time*2)*4,i:1});const m=G.map.merchant;L.push({x:m.x+7-icx,y:m.y-9-icy,r:56,i:1});for(const pr0 of G.map.props||[])if(pr0.t==='fountain')L.push({x:pr0.x-icx,y:pr0.y-10-icy,r:50,i:0.9});}
  for(const d of G.drops.values())if(d.kind==='item'&&d.it.rar===3)L.push({x:d.x-icx,y:d.y-icy,r:28,i:.9});
  lightArr.fill(0);
  for(const l of L){const x0=Math.max(0,Math.floor(l.x-l.r)),x1=Math.min(W-1,Math.ceil(l.x+l.r)),y0=Math.max(0,Math.floor(l.y-l.r)),y1=Math.min(H-1,Math.ceil(l.y+l.r)),r2=l.r*l.r;
    for(let y=y0;y<=y1;y++){const dy=y-l.y,dy2=dy*dy;let idx=y*W+x0;for(let x=x0;x<=x1;x++,idx++){const dx=x-l.x,d2=dx*dx+dy2;if(d2<r2){const v=(1-d2/r2)*l.i;if(v>lightArr[idx])lightArr[idx]=v;}}}}
  const amb=G.kind==='hub'?0.42:0;const a=lightImg.data;let i=0;for(let y=0;y<H;y++){const by=(y&3)<<2;for(let x=0;x<W;x++,i++){const b=Math.max(lightArr[i],amb)*1.7;const q=b>=1?16:((b*5)|0)*4;a[i*4+3]=BAYER[by|(x&3)]>=q?255:0;}}
  lx.putImageData(lightImg,0,0);wx.drawImage(lc,0,0);}
function lit(x,y){x=Math.round(x);y=Math.round(y);if(x<0||y<0||x>=W||y>=H)return 0;return lightArr[y*W+x];}
function curTorch(){return G.kind==='dungeon'?themeAssets(G.floor).torch:TORCH;}
function renderWorld(){const sx=shake>0?Math.round(rf(-shake,shake)):0,sy=shake>0?Math.round(rf(-shake,shake)):0;const icx=Math.round(camX)+sx,icy=Math.round(camY)+sy;
  wx.fillStyle='#050407';wx.fillRect(0,0,W,H);drawTiles(icx,icy);
  for(const t of torches){const x=t.x-icx-3,y=t.y-icy-4;if(x<-10||y<-14||x>W||y>H)continue;wx.drawImage(curTorch()[(Math.floor(time*8+t.ph))&1],x,y);}
  if(G.kind==='hub')drawPortal(icx,icy,false);
  if(G.block)drawBossSeal(icx,icy);
  for(const z of G.zones)drawZone(z,icx,icy);
  for(const e of effects)if(e.under)drawEffect(e,icx,icy);
  for(const d of G.drops.values())drawDrop(d,icx,icy);
  const ents=[];for(const m of G.monsters.values())ents.push({y:m.dy,f:()=>drawMonster(m,icx,icy)});
  for(const p of G.players.values()){const isMe=p.id===myId;ents.push({y:isMe?me.y:p.dy,f:()=>drawPlayer(p,icx,icy,isMe)});}
  if(G.kind==='hub'){ents.push({y:G.map.merchant.y,f:()=>drawMerchant(icx,icy)});drawProps(icx,icy,ents);}
  ents.sort((a,b)=>a.y-b.y);for(const e of ents)e.f();
  drawBossFx(icx,icy);
  for(const p of G.projs.values())drawProj(p,icx,icy,false);drawParts(icx,icy,false);
  for(const e of effects)if(!e.under)drawEffect(e,icx,icy);
  computeLights(icx,icy);
  if(G.kind==='hub')drawPortal(icx,icy,true);
  if(G.zones.some(z=>z.vis===29&&!z.arm)){wx.fillStyle='rgba(140,190,230,0.12)';wx.fillRect(0,0,W,H);}
  for(const d of G.drops.values())drawBeam(d,icx,icy);for(const p of G.projs.values())drawProj(p,icx,icy,true);drawParts(icx,icy,true);
  for(const t of torches){const x=t.x-icx-3,y=t.y-icy-4;if(x<-10||y<-14||x>W||y>H)continue;wx.drawImage(curTorch()[(Math.floor(time*8+t.ph))&1],0,0,7,5,x,y,7,5);}
  if(screenFlash>0){wx.fillStyle=`rgba(255,246,234,${Math.min(0.6,screenFlash)})`;wx.fillRect(0,0,W,H);screenFlash-=1/60;}
  ctx.drawImage(wc,0,0,W*SC,H*SC);return[icx,icy];}
// 보스 사망: 몸이 한 줄씩 흩어지며 위로 사라짐
function drawBossFx(icx,icy){for(let i=bossFx.length-1;i>=0;i--){const f=bossFx[i],a=time-f.t0,D=1.6;if(a>D){bossFx.splice(i,1);continue;}const s=f.s,k=a/D;
  const bx=Math.round(f.x)-icx,by=Math.round(f.y)-icy,ox=bx-(s.w>>1),oy=by-s.h+2-Math.round(k*10);
  for(let y=0;y<s.h;y++){const hsh=((y*2654435761)>>>0)%1000/1000;if(hsh<k*1.15)continue;const jit=Math.round(Math.sin(y*1.7+a*40)*k*6);wx.globalAlpha=1-k*0.6;wx.drawImage((((a*14)|0)&1)?s.fc:s.c,0,y,s.w,1,ox+jit,oy+y,s.w,1);}
  wx.globalAlpha=1;if(R()<0.8){const n=(R()*s.px.length/3|0)*3;if(s.px.length)part(f.x-(s.w>>1)+s.px[n],f.y,rf(-10,10),rf(-6,6),s.px[n+2],rf(.6,1.2),{z:s.h-s.px[n+1],vz:rf(30,70),g:20,glow:true});}}}

// ================= UI =================
function slotBox(x,y,w,h,hl){pr(x,y,w,h,hl?PAL.y:PAL.k);pr(x+1,y+1,w-2,h-2,PAL.m);pr(x+2,y+2,w-4,h-4,PAL.k);}
function panel(x,y,w,h,title){pr(x,y,w,h,PAL.k);pr(x+1,y+1,w-2,h-2,PAL.G);pr(x+2,y+2,w-4,h-4,PAL.k);pr(x+3,y+3,w-6,h-6,PAL.d);for(const[cx,cy]of[[x+1,y+1],[x+w-3,y+1],[x+1,y+h-3],[x+w-3,y+h-3]])pr(cx,cy,2,2,PAL.y);uiRects.push({x,y,w,h,block:true});if(title)txt(title,x+w/2,y+10,14,'#ffd35a','center');}
function button(x,y,w,h,label,onClick,opt){opt=opt||{};const hov=mouse.x>=x&&mouse.x<x+w&&mouse.y>=y&&mouse.y<y+h;pr(x,y,w,h,PAL.k);pr(x+1,y+1,w-2,h-2,opt.dis?PAL.D:hov?'#5a4466':opt.main?'#6e1a1e':PAL.m);pr(x+1,y+h-2,w-2,1,PAL.k);txt(label,x+w/2,y+h/2,opt.size||12,opt.dis?'#6b6275':'#f2eadb','center');if(!opt.dis)uiRects.push({x,y,w,h,click:onClick,tip:opt.tip});}
function drawOrb(cx,cy,frac,img,label){ctx.drawImage(ORB_FRAME,(cx-24)*SC,(cy-24)*SC,49*SC,49*SC);const sy=Math.round(41*(1-clamp(frac,0,1)));
  if(sy<41)ctx.drawImage(img,0,sy,41,41-sy,(cx-20)*SC,(cy-20+sy)*SC,41*SC,(41-sy)*SC);
  if(sy>0&&sy<41){const yy=cy-20+sy,half=Math.sqrt(Math.max(0,420-(sy-20)**2));for(let x=-Math.floor(half)+1;x<half-1;x++)if(((x+Math.floor(time*6))&3)===0)pr(cx+x,yy,1,1,'rgba(255,255,255,0.4)');}
  ctx.drawImage(ORB_GLASS,(cx-20)*SC,(cy-20)*SC,41*SC,41*SC);txt(label,cx,cy+1,12,'#f2eadb','center');}
function skillTip(sid,i){const s=SKILLS[sid];const rank=(G.ch&&G.ch.sk&&G.ch.sk[sid])||0;const L=[[s.n+(rank?`  ${rank}/${SH.MAX_RANK}`:''),'#ffd35a',14],[s.pas?'패시브':`마나 ${s.mp}  ·  재사용 ${s.cd}초`,s.pas?'#c77ad8':'#7aa2ff',12],[s.desc,'#e6dcc3',12]];
  if(s.pas)L.push([s.per,'#9e937a',11]);else L.push([`등급마다 효과 +12%${rank?` (현재 +${Math.round((SH.skillMul(rank)-1)*100)}%)`:''}`,'#9e937a',11]);
  if(G.ch&&G.ch.lvl<s.lvl)L.push([`레벨 ${s.lvl}에 해금`,'#e0574a',11]);if(i!=null)L.push([`${i+1} 키로 사용  ·  클릭하면 우클릭 스킬로 선택`,'#6b6275',11]);return L;}
// 화면 밖 파티원 방향 화살표 (가장자리에 이름·거리)
function drawPartyArrows(icx,icy){const pt=G.party;if(!pt||pt.members.length<2)return;const ids=new Set(pt.members.map(m=>m.id));const cx=W/2,cy=H/2-10,mx=18,myT=22,myB=H-44;
  for(const p of G.players.values()){if(p.id===myId||!ids.has(p.id))continue;const sx=p.dx-icx,sy=p.dy-icy-8;if(sx>4&&sx<W-4&&sy>14&&sy<H-40)continue;
    const dx=sx-cx,dy=sy-cy;const a=Math.atan2(dy,dx);let k=Infinity;if(dx)k=Math.min(k,((dx>0?W-mx:mx)-cx)/dx);if(dy)k=Math.min(k,((dy>0?myB:myT)-cy)/dy);const ex=cx+dx*k,ey=cy+dy*k;
    const c=CLASS_COL[p.cls]||'#e6dcc3';const pulse=0.75+0.25*Math.sin(time*6);ctx.save();ctx.translate(ex*SC,ey*SC);ctx.rotate(a);ctx.globalAlpha=pulse;ctx.fillStyle='#0e0b12';ctx.beginPath();ctx.moveTo(9*SC,0);ctx.lineTo(-5*SC,-6*SC);ctx.lineTo(-2*SC,0);ctx.lineTo(-5*SC,6*SC);ctx.closePath();ctx.fill();
    ctx.fillStyle=c;ctx.beginPath();ctx.moveTo(7*SC,0);ctx.lineTo(-4*SC,-4.5*SC);ctx.lineTo(-1.5*SC,0);ctx.lineTo(-4*SC,4.5*SC);ctx.closePath();ctx.fill();ctx.restore();
    const dist=Math.round(Math.hypot(p.dx-me.x,p.dy-me.y)/16);const lx=clamp(ex-Math.cos(a)*18,24,W-24),ly=clamp(ey-Math.sin(a)*14,myT+4,myB-4);const nm=(p.name||'')+(p.downed?' (쓰러짐)':'')+`  ${dist}칸`;const w=tw(nm,10)+6;
    pr(lx-w/2,ly-5,w,10,'rgba(8,6,12,0.75)');txt(nm,lx,ly,10,p.downed?'#ff6a5a':c,'center');}}
function drawSynergy(){let list=null;if(G.kind==='dungeon')list=G.syn;else if(G.party&&G.party.members.length>1)list=SH.synergies(G.party.members.map(m=>m.cls));
  const solo={guardian:70,priest:40}[myCls()];if(G.kind==='dungeon'&&solo&&G.players.size<=1)list=(list||[]).concat([{n:'홀로 선 자',d:`혼자 던전에 있으면 피해 +${solo}%`}]);if(!list||!list.length)return;
  const x=G.kind==='dungeon'?412:376,y0=G.kind==='dungeon'?72:6;txt(G.kind==='dungeon'?'시너지':'파티 시너지',x+64,y0+4,10,'#ffd35a','right');
  list.forEach((sy,i)=>{const y=y0+10+i*10;const w=tw(sy.n,10)+6;pr(x+64-w,y-4,w,9,'rgba(8,6,12,0.72)');txt(sy.n,x+61,y,10,'#e6dcc3','right');uiRects.push({x:x+64-w,y:y-4,w,h:9,block:true,tip:()=>[[sy.n,'#ffd35a',13],[sy.d,'#e6dcc3',12]]});});}
function drawSkills(){const ch=G.ch;if(!ch)return;const x=70,y=22,w=340,h=212;panel(x,y,w,h,'스킬');txt(`스킬 포인트 ${ch.spts||0}`,x+w-10,y+10,12,(ch.spts||0)>0?'#8fd0ff':'#6b6275','right');txt(`${CLASSES[ch.cls].n}`,x+10,y+10,12,CLASS_COL[ch.cls]);
  const list=CLASSES[ch.cls].skills;const cw=80,chh=40,gx=x+10,gy=y+22;
  list.forEach((sid,n)=>{const c=n%4,r=(n/4)|0,cx=gx+c*cw,cy=gy+r*chh;const sk=SKILLS[sid],rank=ch.sk[sid]||0,locked=ch.lvl<sk.lvl,sel=G.skSel===sid;
    pr(cx,cy,cw-4,chh-4,sel?PAL.y:PAL.k);pr(cx+1,cy+1,cw-6,chh-6,locked?'#15111b':rank?'#231b2c':PAL.D);
    pimg(SKILL_ICON[sid],cx+3,cy+3);if(sk.pas){pr(cx+2,cy+2,18,1,PAL.g);pr(cx+2,cy+19,18,1,PAL.g);pr(cx+2,cy+2,1,18,PAL.g);pr(cx+19,cy+2,1,18,PAL.g);}
    if(locked)pr(cx+3,cy+3,16,16,'rgba(5,4,8,0.7)');
    txt(sk.n,cx+22,cy+8,11,locked?'#6b6275':'#e6dcc3');
    txt(locked?`레벨 ${sk.lvl}`:sk.pas?`패시브 ${rank}/${SH.MAX_RANK}`:`${rank}/${SH.MAX_RANK}`,cx+22,cy+18,10,locked?'#6b6275':rank?'#ffd35a':'#9e937a');
    for(let k=0;k<SH.MAX_RANK;k++)pr(cx+3+k*7,cy+30,6,2,k<rank?PAL.y:PAL.m);
    const can=!locked&&(ch.spts||0)>0&&rank<SH.MAX_RANK;
    uiRects.push({x:cx,y:cy,w:cw-4,h:chh-4,click:()=>{G.skSel=sid;},right:()=>{if(!sk.pas&&rank>0){const e=ch.bar.indexOf(null);if(e>=0)net({t:'bar',i:e,sid});}},tip:()=>skillTip(sid,null)});
    if(can){const bx=cx+cw-16,by=cy+3;const hov=mouse.x>=bx&&mouse.x<bx+10&&mouse.y>=by&&mouse.y<by+10;pr(bx,by,10,10,hov?PAL.y:PAL.g);pr(bx+1,by+1,8,8,PAL.k);pr(bx+4,by+2,2,6,'#8fd0ff');pr(bx+2,by+4,6,2,'#8fd0ff');uiRects.push({x:bx,y:by,w:10,h:10,click:()=>net({t:'learn',sid}),tip:()=>[[rank?'등급 올리기':'배우기','#8fd0ff',12],['스킬 포인트 1 사용','#9e937a',11]]});}});
  const by=y+h-34;txt('단축키',x+10,by+10,11,'#9e937a');
  for(let i=0;i<SH.BAR_SIZE;i++){const sx=x+56+i*26;const sid=ch.bar[i];slotBox(sx,by,22,22,false);if(sid)pimg(SKILL_ICON[sid],sx+3,by+3);txt(String(i+1),sx+2,by+5,8,'#e6dcc3','left','px');
    uiRects.push({x:sx,y:by,w:22,h:22,click:()=>{const s2=G.skSel;if(s2&&!SKILLS[s2].pas&&(ch.sk[s2]||0)>0)net({t:'bar',i,sid:s2});else if(s2&&SKILLS[s2].pas)msg('패시브는 단축키에 넣지 않아도 항상 적용됩니다','#9e937a');},right:()=>net({t:'bar',i,sid:null}),tip:sid?()=>skillTip(sid,i):null});}
  txt('스킬 클릭 후 단축키 칸 클릭: 배치  ·  우클릭: 비우기',x+w-10,by+28,10,'#6b6275','right');
  txt('+ 버튼: 스킬 포인트로 배우기·강화',x+w-10,by+10,10,'#6b6275','right');}

function baseLine(k,v){if(k==='dmg')return`공격력 ${v}`;if(k==='armor')return`방어력 ${v}`;if(k==='as')return`${v>0?'+':''}${v}% 공격 속도`;if(k==='ms')return`${v}% 이동 속도`;if(k==='mp')return`+${v} 마나`;return'';}
function diffLine(k,d){const lab=SH.AFF[k].f(Math.abs(d)).replace(/^\+/,d>0?'+':'-');return(d>0?'▲ ':'▼ ')+lab;}
function itemTip(it,where,by){const cls=myCls();const L=[[it.name,RAR[it.rar].c,14],[`${RAR[it.rar].n} ${it.slot==='weapon'?SH.FAMN[it.fam]:SH.SLOTN[it.slot]}  ·  아이템 레벨 ${it.L}`,'#9e937a',11]];
  for(const k in it.base)L.push([baseLine(k,it.base[k]),'#f2eadb',12]);for(const a of it.aff)L.push([SH.AFF[a.k].f(a.v),'#7aa2ff',12]);
  if(!SH.canEquip(it,cls))L.push([`${CLASSES[cls].n}은(는) 착용 불가`,'#e0574a',12]);
  else if(where!=='eq'&&G.ch){const cur=G.ch.eq[it.slot];if(!cur)L.push(['빈 칸 · 바로 장착 가능','#7fd05a',11]);else if(cur!==it){L.push(['장착 중인 아이템과 비교','#9e937a',11]);const a=SH.itemStats(it),b=SH.itemStats(cur);let any=false;for(const k of new Set([...Object.keys(a),...Object.keys(b)])){const d=(a[k]||0)-(b[k]||0);if(d){any=true;L.push([diffLine(k,d),d>0?'#7fd05a':'#e0574a',12]);}}if(!any)L.push(['차이 없음','#9e937a',11]);}}
  if(by)L.push([`${by}님이 내려놓은 아이템`,'#c77ad8',11]);
  if(where==='shop')L.push([`가격 ${it.price}골드 · 클릭해서 구입`,'#ffd35a',12]);else L.push([where==='bag'?(showShop?`클릭: 장착   우클릭·Shift+클릭: 판매 ${it.value}골드`:'클릭: 장착   우클릭·Shift+클릭: 바닥에 버리기 (거래)'):where==='ground'?'클릭해서 줍기 (F)':'클릭: 장착 해제','#6b6275',11]);return L;}
function drawTip(lines){const k=SC/2;const bms=lines.map(l=>tbitmap(l[0],(l[2]||12)+1,l[1],'kr'));let w=0,h=0;bms.forEach(b=>{w=Math.max(w,b.width);h+=b.height-3*k;});const pad=12*k;w+=pad*2;h+=pad*2;
  let x=mouse.x*SC+24*k,y=mouse.y*SC+8*k;if(x+w>W*SC-4)x=mouse.x*SC-w-12*k;if(y+h>H*SC-4)y=H*SC-h-4;x=Math.max(4,Math.round(x/2)*2);y=Math.max(4,Math.round(y/2)*2);
  ctx.fillStyle=PAL.k;ctx.fillRect(x,y,w,h);ctx.fillStyle=PAL.G;ctx.fillRect(x+2*k,y+2*k,w-4*k,h-4*k);ctx.fillStyle='rgba(8,6,12,0.985)';ctx.fillRect(x+4*k,y+4*k,w-8*k,h-8*k);
  let yy=y+pad-2*k;bms.forEach(b=>{ctx.drawImage(b,Math.round(x+w/2-b.width/2),Math.round(yy));yy+=b.height-3*k;});}
function drawHUD(){const mv=G.mev,cls=myCls(),skills=CLASSES[cls].skills;
  pr(44,232,392,38,PAL.k);pr(45,233,390,37,PAL.d);pr(45,233,390,1,PAL.m);pr(45,234,390,1,PAL.D);pr(50,238,2,2,PAL.g);pr(428,238,2,2,PAL.g);
  uiRects.push({x:44,y:232,w:392,h:38,block:true});
  drawOrb(26,246,mv[0]/mv[1],ORB_HP,`${mv[0]}/${mv[1]}`);drawOrb(454,246,mv[2]/mv[3],ORB_MP,`${mv[2]}/${mv[3]}`);
  if(mv[4]>0){txt(`보호막 ${mv[4]}`,26,218,11,'#bfe3ff','center');}
  uiRects.push({x:2,y:222,w:48,h:48,block:true,tip:()=>[['체력',"#ff7a6a",13],[`${mv[0]} / ${mv[1]}`,'#e6dcc3',12],['Q: 체력 물약 (45% 회복)','#6b6275',11]]});
  uiRects.push({x:430,y:222,w:48,h:48,block:true,tip:()=>[['마나',"#8fd0ff",13],[`${mv[2]} / ${mv[3]}`,'#e6dcc3',12],['E: 마나 물약 (50% 회복)','#6b6275',11]]});
  const slots=[{t:'pot',k:'hp'}];for(let i=0;i<SH.BAR_SIZE;i++)slots.push({t:'sk',i});slots.push({t:'pot',k:'mp'});const sw=20,gap=3,x0=240-(slots.length*sw+(slots.length-1)*gap)/2;
  slots.forEach((s,n)=>{const x=x0+n*(sw+gap),y=237;
    if(s.t==='sk'){const i=s.i,sid=G.ch&&G.ch.bar?G.ch.bar[i]:null;slotBox(x,y,sw,sw,(G.sel||0)===i);
      if(sid){const sk=SKILLS[sid];pimg(SKILL_ICON[sid],x+2,y+2);const left=(localCd[sid]||0)-time;if(left>0){pr(x+2,y+2,16,Math.ceil(16*left/sk.cd),'rgba(5,4,8,0.72)');if(left>1.5)txt(String(Math.ceil(left)),x+10,y+11,8,'#ffffff','center','px');}if(mv[2]<sk.mp)pr(x+2,y+2,16,16,'rgba(30,50,150,0.5)');
        uiRects.push({x,y,w:sw,h:sw,click:()=>{G.sel=i;},right:()=>{G.sel=i;},tip:()=>skillTip(sid,i)});}
      else uiRects.push({x,y,w:sw,h:sw,click:()=>{showSkills=true;showInv=showChar=showShop=false;},tip:()=>[['빈 칸','#9e937a',13],['K를 눌러 스킬을 넣으세요','#6b6275',11]]});
      txt(String(i+1),x+2,y+5,8,'#e6dcc3','left','px');}
    else{slotBox(x,y,sw,sw,false);pimg(s.k==='hp'?POT_HP:POT_MP,x+2,y+6);txt(String(G.ch?G.ch.pots[s.k]:0),x+18,y+16,8,'#ffffff','right','px');txt(s.k==='hp'?'Q':'E',x+2,y+5,8,'#e6dcc3','left','px');
      uiRects.push({x,y,w:sw,h:sw,click:()=>usePot(s.k),tip:()=>[[s.k==='hp'?'체력 물약':'마나 물약',s.k==='hp'?'#ff7a6a':'#8fd0ff',13],[s.k==='hp'?'최대 체력의 45% 회복':'최대 마나의 50% 회복','#e6dcc3',12],[`보유 ${G.ch?G.ch.pots[s.k]:0} / 9  ·  마을 상인에게서 구입`,'#9e937a',11]]});}});
  if(G.ch&&G.ch.spts>0){const bl=(time*3|0)%2===0;pr(388,221,40,10,bl?'#8fd0ff':PAL.C);pr(389,222,38,8,PAL.k);txt(`+${G.ch.spts} 스킬`,408,226,11,'#8fd0ff','center');uiRects.push({x:388,y:221,w:40,h:10,click:()=>{showSkills=true;showInv=showChar=showShop=false;}});}
  drawSynergy();
  if(G.ch){const xf=G.ch.xp/SH.xpFor(G.ch.lvl);pr(64,261,352,5,PAL.k);pr(65,262,Math.round(350*xf),3,PAL.G);pr(65,262,Math.round(350*xf),1,PAL.y);for(let i=1;i<10;i++)pr(64+Math.round(i*35.2),261,1,5,PAL.k);
    uiRects.push({x:64,y:259,w:352,h:9,block:true,tip:()=>[[`레벨 ${G.ch.lvl}`,'#ffd35a',13],[`경험치 ${G.ch.xp} / ${SH.xpFor(G.ch.lvl)}`,'#e6dcc3',12]]});}
  // 버프
  let bx=150;if(mv[5]>0){txt(`피해 증가 ${Math.ceil(mv[5])}초`,bx,226,11,'#ff9a6a');bx+=70;}if(mv[6]>0){txt(`피해 감소 ${Math.ceil(mv[6])}초`,bx,226,11,'#8fd0ff');}
  // 왼쪽 위 정보
  pr(4,4,124,32,'rgba(8,6,12,0.72)');txt(G.kind==='hub'?'던전 입구 광장':`지하 ${G.floor}층 · ${SH.themeOf(G.floor).t.n}`,8,11,13,SH.themeOf(G.floor).corrupt&&G.kind!=='hub'?'#ff8a7a':'#e6dcc3');if(G.ch){txt(`${G.ch.name} · ${CLASSES[cls].n} ${G.ch.lvl}`,8,21,12,'#9e937a');pimg(GOLD,8,27);txt(String(G.ch.gold),19,30,12,'#ffd35a');
    if(G.ch.pts>0){const bl=(time*3|0)%2===0;pr(52,221,38,10,bl?PAL.y:PAL.g);pr(53,222,36,8,PAL.k);txt(`+${G.ch.pts} 스탯`,71,226,11,'#ffd35a','center');uiRects.push({x:52,y:221,w:38,h:10,click:()=>{showChar=true;}});}}
  drawPartyFrames();
  if(G.kind==='dungeon'){pr(412,4,64,64,PAL.k);pr(413,5,62,62,'rgba(12,9,16,0.85)');ctx.drawImage(miniC,414*SC,6*SC,60*SC,60*SC);
    for(const p of G.players.values()){if(p.id===myId)continue;pr(414+Math.floor(p.x/TS),6+Math.floor(p.y/TS),1,1,'#7fd05a');}
    if((time*4|0)%2===0)pr(414+Math.floor(me.x/TS),6+Math.floor(me.y/TS),1,1,PAL.e);}
  const boss=[...G.monsters.values()].find(m=>m.tc===3&&(m.fl&16));
  if(boss){const f=boss.hp/boss.maxHp;pr(138,6,204,12,PAL.g);pr(139,7,202,10,PAL.k);pr(140,8,Math.round(200*f),8,(boss.fl&128)?'#3a3144':PAL.R);pr(140,8,Math.round(200*f),2,(boss.fl&128)?'#7b7486':PAL.r);pr(239,7,1,10,PAL.k);txt(SH.bossOf(G.floor).n+((boss.fl&128)?' · 무적':(boss.fl&256)?' · 약점 노출':(boss.fl&2048)?' · 격노':''),240,12,12,(boss.fl&256)?'#ffe9a8':'#ffd35a','center');}
  if(hoverMon&&!(boss&&hoverMon===boss)){const m=hoverMon,y=boss?22:6,f=m.hp/m.maxHp;pr(170,y,140,11,PAL.k);pr(171,y+1,Math.round(138*f),9,PAL.R);pr(171,y+1,Math.round(138*f),2,PAL.r);
    const nm=m.type==='clone'?SH.bossOf(G.floor).n:SH.monName(G.floor,m.type,!!(m.fl&1),m.id);txt(nm,240,y+5.5,12,(m.fl&1)?'#8fd0ff':'#e6dcc3','center');}}
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
  const gx=x+w/2-64,gy=y+64;for(let i=0;i<20;i++){const c=i%5,r=(i/5)|0;itemSlot(gx+c*26,gy+r*26,24,ch.bag[i],()=>{if(mouse.shift){net(showShop?{t:'sell',bi:i}:{t:'drop',bi:i});return;}net({t:'eq',bi:i});sfx('equip');},()=>{net(showShop?{t:'sell',bi:i}:{t:'drop',bi:i});},'bag');}
  pimg(GOLD,x+10,y+h-15);txt(String(ch.gold),x+21,y+h-12,12,'#ffd35a');txt(showShop?'우클릭·Shift+클릭: 판매':'우클릭·Shift+클릭: 버리기',x+w-8,y+h-12,10,'#9e937a','right');}
function drawShop(){const x=6,y=38,w=172,h=194;panel(x,y,w,h,'상인');const price=SH.potPrice(G.ch?G.ch.lvl:1);
  pimg(POT_HP,x+8,y+18);txt('체력 물약',x+26,y+24,11,'#ff7a6a');txt(`${price}골드`,x+26,y+33,10,'#ffd35a');button(x+w-50,y+20,42,14,'구입',()=>net({t:'buy',k:'hp'}),{size:11});
  pimg(POT_MP,x+8,y+38);txt('마나 물약',x+26,y+44,11,'#8fd0ff');txt(`${price}골드`,x+26,y+53,10,'#ffd35a');button(x+w-50,y+40,42,14,'구입',()=>net({t:'buy',k:'mp'}),{size:11});
  pr(x+8,y+62,w-16,1,PAL.m);txt('장비',x+10,y+70,11,'#9e937a');const sh=G.shop;
  if(sh){txt(`새 물건까지 ${Math.floor(sh.refresh/60)}분`,x+w-10,y+70,10,'#6b6275','right');
    sh.items.forEach((it,i)=>{const c=i%3,r=(i/3)|0,sx=x+14+c*52,sy=y+78+r*40;itemSlot(sx,sy,24,it,()=>net({t:'shopbuy',id:it.id}),null,'shop');txt(`${it.price}`,sx+12,sy+30,10,G.ch&&G.ch.gold>=it.price?'#ffd35a':'#e0574a','center');});
    button(x+10,y+h-20,w-20,14,`스킬 초기화 (${sh.respec}골드)`,()=>net({t:'respec'}),{size:10});}
  else txt('불러오는 중...',x+w/2,y+100,11,'#6b6275','center');
  txt('판매: 인벤토리에서 우클릭',x+w/2,y+h-28,10,'#9e937a','center');}
// 계단 위에 서면: 내려갈지 묻기
function drawStairsAsk(){if(G.kind!=='dungeon'||!G.map){G.stairsAsk=null;return;}const tx=Math.floor(me.x/TS),ty=Math.floor(me.y/TS);let on=false;for(let j=-1;j<=1&&!on;j++)for(let i=-1;i<=1;i++)if(SH.tileAt(G.map,tx+i,ty+j)===2){on=true;break;}if(!on){G.stairsAsk=null;return;}
  const f=G.stairsAsk.floor,th=SH.themeOf(f);const w=210,h=84,x=240-w/2,y=26;panel(x,y,w,h,null);txt(`지하 ${f}층으로 내려가시겠습니까?`,240,y+16,13,'#ffd35a','center');
  txt((f%5===0?'보스가 기다리는 층 · ':'')+(th.corrupt?'타락한 ':'')+th.t.n,240,y+31,11,f%5===0?'#ff6a5a':'#d2c7ab','center');const pt=G.party;if(pt&&pt.members.length>1)txt('파티 전원이 3초 뒤 함께 내려갑니다',240,y+44,10,'#a79db3','center');
  button(x+14,y+h-24,86,16,'내려가기 (F)',()=>{net({t:'descend'});G.stairsAsk=null;},{main:true,size:11});button(x+w-100,y+h-24,86,16,'머무르기 (Esc)',()=>{G.stairsAsk=null;},{size:11});}
function drawPortalMenu(){const pt=G.party,leader=!pt||pt.leader===myId;const cps=G.ch?G.ch.cps:[1];const rows=Math.ceil(cps.length/3);const w=200,h=64+rows*20+(pt&&pt.inDungeon?22:0),x=240-w/2,y=60;
  panel(x,y,w,h,'던전 입구');
  if(pt&&pt.inDungeon){button(x+20,y+24,w-40,16,'파티의 던전에 합류',()=>{net({t:'enter'});G.portalMenu=false;},{main:true});}
  const oy=y+24+(pt&&pt.inDungeon?22:0);
  txt(leader?'시작할 층을 고르세요 (체크포인트)':'파티장이 층을 고릅니다',x+w/2,oy+4,11,'#9e937a','center');
  cps.forEach((f,i)=>{const c=i%3,r=(i/3)|0;button(x+14+c*58,oy+14+r*20,54,16,`지하 ${f}층`,()=>{net({t:'enter',floor:f});G.portalMenu=false;},{dis:!leader||(pt&&pt.inDungeon)});});
  txt(pt&&pt.members.length>1?`파티원 ${pt.members.length}명이 함께 들어갑니다`:'혼자 들어갑니다 · 다른 사람을 클릭해 파티 초대',x+w/2,y+h-10,11,'#6b6275','center');}
const fmtT=s2=>`${Math.floor(s2/60)}분 ${String(s2%60).padStart(2,'0')}초`;
// Tab: 일반층은 처치 수, 보스전은 보스마다 피해·치유 표
function drawTabMeter(){const B=G.bossLive;if(B){drawMeterTable(`보스전 · ${B.name}`,B.rows.slice().sort((a,b)=>b.dmg-a.dmg),90,40,300,`지하 ${B.floor}층 · ${fmtT(B.time)} 진행 중`);return;}
  const rows=(G.meter||[]).slice().sort((a,b)=>(b.kills+b.elites*3)-(a.kills+a.elites*3));const x=8,y=40,w=196,h=46+Math.max(1,rows.length)*20;panel(x,y,w,h,'이번 원정 처치');
  const cols=[['kills','잡몹','#d2c7ab'],['elites','엘리트','#ffd35a']];cols.forEach(([k,l,c],i)=>txt(l,x+120+i*38,y+30,11,c,'center'));
  rows.forEach((r,n)=>{const ry=y+38+n*20;pr(x+6,ry,w-12,17,n%2?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.2)');pr(x+6,ry,2,17,CLASS_COL[r.cls]||'#fff');txt(r.name,x+12,ry+8,12,'#e6dcc3');cols.forEach(([k],i)=>txt(String(r[k]||0),x+120+i*38,ry+8,12,'#f2eadb','center'));});
  const hist=G.bossHist||[];if(!hist.length){txt('보스를 잡으면 여기 보스별 기록이 생겨요',x+w/2,y+h+10,10,'#a79db3','center');return;}
  if(G.histIdx==null||G.histIdx>=hist.length)G.histIdx=hist.length-1;const hb=hist[G.histIdx];
  drawMeterTable(`${hb.title}`,hb.rows.slice().sort((a,b)=>b.dmg-a.dmg),210,40,264,`지하 ${hb.floor}층 · ${fmtT(hb.time)}${hist.length>1?`  ·  ← → 다른 보스 (${G.histIdx+1}/${hist.length})`:''}`);}
function drawMeterTable(title,rows,x,y,w,sub){const h=46+Math.max(1,rows.length)*22;panel(x,y,w,h,title);if(sub)txt(sub,x+w/2,y+21,11,'#9e937a','center');
  const cols=[['dmg','피해','#ff9a6a'],['taken','받은 피해','#e0574a'],['heal','치유','#7fd05a'],['shield','보호막','#8fd0ff']];const nm=w<300?74:96,cx0=x+nm,cw=(w-nm-10)/4;
  cols.forEach(([k,l,c],i)=>txt(l,cx0+i*cw+cw/2,y+32,11,c,'center'));
  const max={};for(const[k]of cols)max[k]=Math.max(1,...rows.map(r=>r[k]));
  rows.forEach((r,n)=>{const ry=y+42+n*22;pr(x+8,ry,w-16,18,n%2?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.2)');pr(x+8,ry,2,18,CLASS_COL[r.cls]||'#fff');txt(r.name,x+14,ry+6,12,'#e6dcc3');txt(CLASSES[r.cls]?CLASSES[r.cls].n:'',x+14,ry+14,10,'#9e937a');
    cols.forEach(([k,l,c],i)=>{const bx=cx0+i*cw+4,bw=cw-8;pr(bx,ry+12,bw,3,PAL.k);pr(bx,ry+12,Math.round(bw*r[k]/max[k]),3,c);txt(r[k]>=100000?Math.round(r[k]/1000)+'k':r[k].toLocaleString(),bx+bw/2,ry+6,w<300?11:12,'#f2eadb','center');});});
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
  for(const m of G.monsters.values()){if(m.hp>=m.maxHp||m.tc===3)continue;if(lit(m.dx-icx,m.dy-8-icy)<0.2)continue;const bx=Math.round(m.dx-icx)-6,by=Math.round(m.dy-icy)-(SPR.ready?24:19);pr(bx,by,12,2,PAL.k);pr(bx,by,Math.max(1,Math.round(12*m.hp/m.maxHp)),2,PAL.e);}
  for(const p of G.players.values()){const isMe=p.id===myId;const px=(isMe?me.x:p.dx)-icx,py=(isMe?me.y:p.dy)-icy;
    if(!isMe||G.kind==='hub'){txt(p.name||'',px,py-(SPR.ready?27:22),11,isMe?'#ffd35a':(G.party&&G.party.members.some(m=>m.id===p.id))?'#7fd05a':'#e6dcc3','center');}
    if(!isMe&&G.kind==='dungeon'){const f=p.maxHp?p.hp/p.maxHp:0;const hy=SPR.ready?23:18;pr(px-6,py-hy,12,2,PAL.k);pr(px-6,py-hy,Math.max(0,Math.round(12*f)),2,'#7fd05a');}
    if(p.downed&&p.rev>0){pr(px-10,py+4,20,3,PAL.k);pr(px-10,py+4,Math.round(20*p.rev),3,PAL.y);}
    const b=G.bubbles.get(p.id);if(b){const bw=Math.min(150,tw(b.m,11)+8);const bx=px-bw/2,by=py-40;pr(bx,by,bw,12,PAL.k);pr(bx+1,by+1,bw-2,10,'#e6dcc3');pr(px-1,by+12,3,2,'#e6dcc3');const b2=tbitmap(b.m,11,'#1b1622');ctx.save();ctx.beginPath();ctx.rect((bx+1)*SC,(by+1)*SC,(bw-2)*SC,10*SC);ctx.clip();ctx.drawImage(tbitmap(b.m,11,'#0e0b12'),Math.round((px)*SC-Math.min(b2.width,(bw-2)*SC)/2),Math.round((by+6)*SC-b2.height/2));ctx.restore();}}
  if(G.kind==='hub'){const m=G.map.merchant;txt('상인',m.x-icx,m.y-icy-(SPR.ready?26:20),11,'#ffd35a','center');const p=G.map.portal;txt('던전 입구',p.x-icx,p.y-icy-22,12,'#ff8a7a','center');
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
  if(scene!=='game'||!G.map){ctx.fillStyle='#050407';ctx.fillRect(0,0,cv.width,cv.height);if(scene==='connecting'){const el=Math.floor((performance.now()-conn.t0)/1000);txt(conn.recon?'서버와 다시 연결하는 중...':'접속 중...',240,122,14,'#e6dcc3','center');
    if(conn.recon||el>=4){txt(conn.recon?'서버가 업데이트됐거나 잠깐 끊겼어요. 캐릭터는 저장돼 있어요':'서버가 잠들어 있으면 깨어나는 데 최대 1분쯤 걸려요',240,142,11,'#9e937a','center');txt(el+'초',240,158,11,'#6b6275','center');}
    const n=Math.floor(time*3)%4;txt('.'.repeat(n),240,106,14,'#ffd35a','center');}return;}
  const [icx,icy]=renderWorld();
  drawWorldUI(icx,icy);drawPartyArrows(icx,icy);drawHUD();drawTut();drawChat();
  if(showSkills)drawSkills();else if(showChar)drawChar();else if(showShop)drawShop();
  if(showInv&&!showSkills)drawInv();
  if(G.portalMenu)drawPortalMenu();
  if(G.stairsAsk)drawStairsAsk();
  msgs.forEach((m,i)=>{ctx.globalAlpha=Math.min(1,m.life);txt(m.t,240,48+i*11,13,m.c,'center');});ctx.globalAlpha=1;
  if(banner&&!(showInv||showChar||showSkills||showShop||G.stairsAsk)){const a=banner.t<0.4?banner.t/0.4:banner.t>2.3?Math.max(0,(3-banner.t)/0.7):1;ctx.globalAlpha=a;bigTxt(banner.a,240,92,16,'#e6dcc3',2);txt(banner.b,240,112,13,'#9e937a','center');ctx.globalAlpha=1;}
  for(const e of effects)if(e.type==='mark'){const p=e.pid===myId?me:G.players.get(e.pid);if(!p)continue;const px=(e.pid===myId?me.x:p.dx)-icx,py=(e.pid===myId?me.y:p.dy)-icy;txt(`${e.txt} ${Math.ceil(e.max-e.t)}`,px,py-36,11,e.c==='y'?'#ffd35a':'#8fd0ff','center');}
  if(G.doom){G.doom.t-=1/60;if(G.doom.t<=0)G.doom=null;else{const n=Math.ceil(G.doom.t);ctx.globalAlpha=0.9;bigTxt(String(n),240,70,18,'#ff4a3a',3,'px');txt('방어 스킬을 쓰세요!',240,96,13,'#ff8a7a','center');ctx.globalAlpha=1;}}
  if(G.flash>0){G.flash-=1/60;pr(0,0,W,H,`rgba(255,240,220,${Math.max(0,G.flash)*1.5})`);}
  if(G.mev[10]>0){txt(`화상 ${G.mev[10]}/5 · 구르면 해제`,240,218,12,'#ff8a3a','center');}
  if(G.mev[9]===0&&inDungeon()&&!meDowned()){txt('속박됨 · 동료가 곁에 오면 풀립니다',240,218,12,'#e6dcc3','center');}
  if(G.victory&&time-G.victory<8){ctx.globalAlpha=Math.min(1,(8-(time-G.victory))/1.5);bigTxt('지하 100층 정복',240,100,18,'#ffd35a',3);txt('심연의 심장이 멈췄다. 당신의 이름이 전설로 남는다.',240,130,13,'#e6dcc3','center');ctx.globalAlpha=1;}
  if(G.trans>0&&inDungeon()){txt(`${Math.ceil(G.trans)}초 후 다음 층으로 내려갑니다`,240,150,14,'#ffd35a','center');}
  if(meDowned()&&inDungeon()){pr(0,0,W,H,'rgba(40,4,8,0.35)');bigTxt('쓰러졌습니다',240,100,16,'#e0473a',2);txt('동료가 곁에 서 있으면 일어납니다 (사제는 두 배 빠름)',240,122,12,'#e6dcc3','center');}
  if(showMeter)drawTabMeter();
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
  try{if(scene==='game'&&G.map){update(dt);tutUpdate(dt);}else time+=dt;render();}catch(err){console.error(err);}
  requestAnimationFrame(frame);}
function fit(){const vw=window.innerWidth,vh=window.innerHeight;let s=Math.min(vw/W,vh/H);if(s>=1&&Math.floor(s)/s>=0.8)s=Math.floor(s);cv.style.width=Math.floor(W*s)+'px';cv.style.height=Math.floor(H*s)+'px';
  const ns=Math.max(2,Math.min(4,Math.round(s*(window.devicePixelRatio||1))));if(ns!==SC||cv.width!==W*ns){SC=ns;cv.width=W*SC;cv.height=H*SC;ctx.imageSmoothingEnabled=false;TXT.clear();}}
window.addEventListener('resize',fit);fit();
renderSelect();
Promise.all([loadImg('sprites/heroes_anim.png'),loadImg('sprites/bosses_anim.png'),loadImg('sprites/heroes_bare.png'),loadImg('sprites/weapons.png'),loadImg('sprites/mons_anim.png')]).then(([h,b,hb,wp,ma])=>{if(h)SPR.heroAnim=sliceAnim(h,40,24);if(ma)SPR.monAnim=sliceAnim(ma,36,24);if(hb&&wp){SPR.heroBare=sliceBare(hb,40,24);SPR.weap=wp;ICONS.clear();}if(b)SPR.bossAnim=sliceAnim(b,72,48);for(const k in THEME_CACHE)THEME_CACHE[k].mon={};for(const k in PF_CACHE)delete PF_CACHE[k];if(scene==='select')renderSelect();});
loadImg('sprites/tiles.png').then(t=>{if(!t)return;SPR.tiles=t;for(const k in THEME_CACHE)delete THEME_CACHE[k];});
Promise.all([loadImg('sprites/heroes.png'),loadImg('sprites/mons.png'),loadImg('sprites/bosses.png')]).then(([h,m,b])=>{if(!h||!m||!b)return;SPR.heroes=sliceAtlas(h,24);SPR.mons=sliceAtlas(m,24);SPR.bosses=sliceAtlas(b,48);SPR.ready=true;for(const k in THEME_CACHE)THEME_CACHE[k].mon={};for(const k in PF_CACHE)delete PF_CACHE[k];if(scene==='select')renderSelect();});
requestAnimationFrame(frame);
window.__BC={G,me,net,get myId(){return myId;},startGame,loadChars,saveChars,get scene(){return scene;},get mus(){return MUS?{mode:MUS.mode,prof:MUS.prof,err:!!MUS.err,state:AC&&AC.state}:null;}};
})();
