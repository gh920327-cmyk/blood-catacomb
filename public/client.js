// 달 없는 밤: 등불을 든 자 — 클라이언트 (렌더링 · 입력 · 네트워크 · UI)
'use strict';
(()=>{
const W=480,H=270,TS=16;let SC=2; // SC: 화면 해상도에 맞춰 2~4 (글자를 선명하게)
const cv=document.getElementById('game');
const ctx=cv.getContext('2d');
const ERR1=new Set();function errOnce(k,e){if(ERR1.has(k))return;ERR1.add(k);console.error('['+k+']',e);}
function mk(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.imageSmoothingEnabled=false;return [c,x];}
ctx.imageSmoothingEnabled=false;
let [wc,wx]=mk(W,H);const [lc,lx]=mk(W,H);
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
  priest:remap(PLAYER_BODY,{s:'w',S:'W',r:'w',R:'W',g:'y',B:'W',b:'g'}),
  knight:remap(PLAYER_BODY,{r:'w',R:'W',g:'y',B:'s',b:'c'}),
  gunner:["......kkkk......",".....kBBBBk.....",".....kBBBBk.....","...kkkggggkkk...","....kfgcgcfk....","....kffffffk....","...kbkBBBBkbk...","..kbbkBgGBkbbk..","..kfkbBggBbkfk..","..kfkbBGGBbkfk..","..kk.kbBBbk.kk..",".....kBbbBk....."]
};
const CLASS_LEG={warrior:['B','b'],guardian:['n','C'],archer:['B','Z'],mage:['p','P'],priest:['W','w'],knight:['s','S'],gunner:['B','b']};
const CLASS_COL={warrior:'#e0574a',guardian:'#7aa2ff',archer:'#9ccf6a',mage:'#c77ad8',priest:'#ffe9a8',knight:'#fff6d0',gunner:'#d49a2a'};
const TRIM={warrior:'g',guardian:'y',archer:'G',mage:'y',priest:'y',knight:'y',gunner:'g'};
const RTRIM=[null,'C','y','o'];
const HELM={plate:{s:'w',S:'s'},leather:{s:'b',S:'B'},robe:{s:'p',S:'P'}};
const PF_CACHE={};
function lookOfMe(){const e=G.ch?G.ch.eq:{};return{w:e.weapon?e.weapon.kind:null,wr:e.weapon?e.weapon.rar:-1,wid:e.weapon?e.weapon.id:null,a:e.armor?e.armor.kind:null,ar:e.armor?e.armor.rar:-1,rr:e.ring?e.ring.rar:-1,dy:G.ch?G.ch.dye|0:0,cp:G.ch&&G.ch.cos&&G.ch.cos.cape===0?0:1,gl:G.ch&&G.ch.cos&&G.ch.cos.glow===0?0:1,sh:G.ch&&G.ch.cos&&G.ch.cos.shield===0?0:1,adv:G.ch&&SH.advOf(G.ch)?G.ch.adv:null,aw:G.ch&&SH.awkOf(G.ch)?1:0,sk:G.ch&&G.ch.skinOn?G.ch.skinOn[CLASSES[G.ch.cls].fam]||null:null,cs:G.ch&&G.ch.cstOn||null,mt:G.ch&&G.ch.mtOn||null,fp:G.ch&&G.ch.fpOn||null,lg:G.ch&&G.ch.lgOn&&SH.legendOk(G.ch,G.ch.lgOn)?G.ch.lgOn:null};}
const ADV_KEYS=Object.keys(SH.ADV);
function playerFrames(cls,look){look=look||{};if(look.cs&&SPR.cost&&SH.COSTUMES[look.cs]){const ck='cs|'+look.cs;if(PF_CACHE[ck])return PF_CACHE[ck];const row=SPR.cost[SH.COSTUMES[look.cs].row];if(row){const fr=animFrames(row);PF_CACHE[ck]=fr;return fr;}}const ar=Math.max(0,look.ar|0),a=look.a||'';const dy=look.dy|0;const adv=look.adv&&SH.ADV[look.adv]&&SH.ADV[look.adv].cls===cls?look.adv:'';const key=(SPR.ready?'ai|':'')+cls+'|'+a+'|'+ar+'|'+dy+'|'+(SPR.heroAdv?adv:'');if(PF_CACHE[key])return PF_CACHE[key];
  if(dy>0&&SH.DYES[dy]){const base=playerFrames(cls,Object.assign({},look,{dy:0}));const fr2=dyeFrames(base,SH.DYES[dy]);PF_CACHE[key]=fr2;return fr2;}
  if(SPR.ready&&adv&&SPR.heroAdv){const ai=ADV_KEYS.indexOf(adv)*4+Math.min(3,ar);if(SPR.heroAdv[ai]){const fr=animFrames(SPR.heroAdv[ai]);PF_CACHE[key]=fr;return fr;}}
  const hi0=SH.CLASS_ORDER.indexOf(cls)*4+Math.min(3,ar);if(SPR.ready&&((SPR.heroBare&&SPR.heroBare[hi0])||(SPR.heroAnim&&SPR.heroAnim[hi0])||(SPR.heroes&&SPR.heroes[hi0]))){const hi=hi0;const fr=SPR.heroBare&&SPR.heroBare[hi]?animFrames(SPR.heroBare[hi]):SPR.heroAnim&&SPR.heroAnim[hi]?animFrames(SPR.heroAnim[hi]):aiFrames(SPR.heroes[hi]);PF_CACHE[key]=fr;return fr;}
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
function themedMonsterFrames(type,floor){if(type.startsWith('r_'))return raidFrames(type,floor);if(type==='ghoul'||type==='wraith')return themedMonsterFrames('zombie',floor);if(type==='shade')return themedMonsterFrames('skel',floor);if(type==='cog')return themedMonsterFrames('hound',floor);const A=themeAssets(floor);if(A.mon[type])return A.mon[type];const th=A.th;let fr;const MI=th.t.tile!=null?th.t.tile:th.idx;
  if(th.waste&&(type==='boss'||type==='clone')&&WBSPR&&WBSPR[th.idx-10]){fr=animFrames(WBSPR[th.idx-10]);A.mon[type]=fr;return fr;}
  if(SPR.ready){let sp=null;const ti={zombie:0,skel:1,guard:1,hound:2}[type];if(ti!=null&&SPR.monAnim&&SPR.monAnim[MI*3+ti]){let fs=SPR.monAnim[MI*3+ti];if(th.corrupt)fs=fs.map(tintCopy);fr=animFrames(fs);A.mon[type]=fr;return fr;}if(ti!=null)sp=SPR.mons[MI*3+ti];else if(type==='boss'||type==='clone'){const bi=floor>=100?10:th.idx;if(SPR.bossAnim&&SPR.bossAnim[bi]){let fs=SPR.bossAnim[bi];if(th.corrupt)fs=fs.map(tintCopy);fr=animFrames(fs);A.mon[type]=fr;return fr;}sp=SPR.bosses[bi];}
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
    const d=x.getImageData(0,0,w*2,h*2),a=d.data;let L=0;for(let i=0;i<a.length;i+=4)L+=a[i]*.3+a[i+1]*.59+a[i+2]*.11;L/=a.length/4;const F=Math.max(.45,Math.min(.86,52/L))*(th.t.lit||1);const TT=th.t.tint;for(let i=0;i<a.length;i+=4){let r=a[i]*F,g=a[i+1]*F,b=a[i+2]*F;if(th.corrupt){r=Math.min(255,r*1.05+10);g*=.72;b*=.78;}if(TT){const y=r*.3+g*.59+b*.11;r=y*(1-TT[3])+r*TT[3]+TT[0];g=y*(1-TT[3])+g*TT[3]+TT[1];b=y*(1-TT[3])+b*TT[3]+TT[2];}a[i]=Math.min(255,r);a[i+1]=Math.min(255,g);a[i+2]=Math.min(255,b);}x.putImageData(d,0,0);return c;};
    const TI=th.t.tile!=null?th.t.tile:th.idx;A.ftex=mir(TI*128,0,128,128);const w=mir(TI*128,128,128,16);const [wc,wx2]=mk(256,16);wx2.drawImage(w,0,0,256,16,0,0,256,16);A.wtex=wc;}
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
function weapSprite(kind,rar,id){if(GUN_TPL[kind])return gunSprite(kind,rar);if(!SPR.weap)return null;rar=Math.max(0,Math.min(3,rar|0));const hh=idHash(id);const key=kind+'|'+rar+'|'+(hh%7);let w=WSPR.get(key);if(w)return w;
  const row=W_ORDER.indexOf(kind);if(row<0)return null;const H=W_H[row];const [c,x]=mk(24,24);
  const hue=rar<3?((hh%7)-3)*5:0;if(hue)x.filter=`hue-rotate(${hue}deg)`;x.drawImage(SPR.weap,rar*24,row*24,24,24,0,0,24,24);x.filter='none';
  const d=x.getImageData(0,0,24,24).data;let x0=24,x1=0,y0=24;for(let j=0;j<24;j++)for(let i=0;i<24;i++)if(d[(j*24+i)*4+3]>0){if(i<x0)x0=i;if(i>x1)x1=i;if(j<y0)y0=j;}
  const bow=kind==='shortbow'||kind==='longbow',xb=kind==='crossbow',sh=kind==='shield';
  const px=xb?x0+Math.round((x1-x0)*0.3):Math.round((x0+x1)/2),py=(bow||sh||xb)?Math.round((y0+23)/2):22;
  const LEG_GLOW=['#ff8a1f','#ffd35a','#ff4a3a','#c77ad8','#5ad8ff'];const glowCol=rar===4?'#ff3a5a':rar===3?LEG_GLOW[hh%LEG_GLOW.length]:rar===2?'#ffd35a':rar===1?'#7aa2ff':null;let g=null;
  if(glowCol){const [gc,gx]=mk(24,24);gx.drawImage(c,0,0);gx.globalCompositeOperation='source-in';gx.fillStyle=glowCol;gx.fillRect(0,0,24,24);g=gc;}
  w={c,g,px,py,h:24-y0,col:glowCol,x0,x1,y0};WSPR.set(key,w);return w;}
// ---- 꾸미기 무기 외형 (sprites/skins.png 24x24 칸) · 능력치 변화 없음, 등급 빛 테두리는 무기 등급 그대로 ----
const SKSPR=new Map();
function skinOk(id,cls){const K=id&&SH.SKINS[id];return !!(K&&SPR.skins&&(!cls||K.fam===CLASSES[cls].fam));}
function skinSprite(id,rar){const K=SH.SKINS[id];if(!K||!SPR.skins)return null;rar=Math.max(0,Math.min(4,rar|0));const key=id+'|'+rar;let w=SKSPR.get(key);if(w)return w;
  let [c0,x0c]=mk(24,24);x0c.drawImage(SPR.skins,K.col*24,0,24,24,0,0,24,24);
  if(K.fy||K.mx){/* 뒤집어 쥐기: 손잡이 쪽이 아래로 오게(fy) · 활 등이 앞쪽으로 휘게(mx) — 뒤집은 뒤에도 그림 바닥을 원래 바닥 줄에 맞춤 */const od=x0c.getImageData(0,0,24,24).data;let oy0=24,oy1=-1;for(let j=0;j<24;j++)for(let i=0;i<24;i++)if(od[(j*24+i)*4+3]>0){if(j<oy0)oy0=j;if(j>oy1)oy1=j;}
    const [c1,x1c]=mk(24,24);x1c.save();x1c.translate(K.mx?24:0,K.fy?(oy0+oy1+1):0);x1c.scale(K.mx?-1:1,K.fy?-1:1);x1c.drawImage(c0,0,0);x1c.restore();c0=c1;x0c=x1c;}
  const d=x0c.getImageData(0,0,24,24).data;let x0=24,x1=-1,y0=24,y1=-1;for(let j=0;j<24;j++)for(let i=0;i<24;i++)if(d[(j*24+i)*4+3]>0){if(i<x0)x0=i;if(i>x1)x1=i;if(j<y0)y0=j;if(j>y1)y1=j;}if(x1<0)return null;
  const glowCol=rar===4?'#ff3a5a':rar===3?'#ff8a1f':rar===2?'#ffd35a':rar===1?'#7aa2ff':null;
  if(K.fam==='gun'){const ww=x1-x0+1,hh=y1-y0+1;const [c,x]=mk(ww,hh);x.drawImage(c0,x0,y0,ww,hh,0,0,ww,hh);let g=null;if(glowCol){const [gc,gx]=mk(ww,hh);gx.drawImage(c,0,0);gx.globalCompositeOperation='source-in';gx.fillStyle=glowCol;gx.fillRect(0,0,ww,hh);g=gc;}
    w={c,g,px:Math.round(ww*0.28),py:Math.round(hh*0.62),h:hh,x0:0,x1:ww-1,y0:0,gun:1,ai:1,col:glowCol,skin:1};SKSPR.set(key,w);return w;}
  const bow=K.fam==='bow';const px=Math.round((x0+x1)/2),py=bow?Math.round((y0+y1)/2):Math.min(23,y1-1);let g=null;
  if(glowCol){const [gc,gx]=mk(24,24);gx.drawImage(c0,0,0);gx.globalCompositeOperation='source-in';gx.fillStyle=glowCol;gx.fillRect(0,0,24,24);g=gc;}
  w={c:c0,g,px,py,h:24-y0,col:glowCol,x0,x1,y0,skin:1};SKSPR.set(key,w);return w;}
// 손에 든 무기 그리기: ax,ay=손 위치(월드→화면), ang=0이면 그림 그대로(날이 위), face=좌우
const W_SCALE={skin:0.9,great:0.85,staff:0.9,longbow:0.9,shield:0.72,scepter:0.95};
function drawHeld(ws,ax,ay,ang,face,rar,glowT,kind){if(!ws)return;wx.save();wx.translate(ax,ay);const sc=W_SCALE[kind]||1;wx.scale((face<0?-1:1)*sc,sc);wx.rotate(ang);
  if(ws.g&&rar>=1){const a=rar>=3?0.4+0.25*Math.sin(glowT*7):rar===2?0.25+0.15*Math.sin(glowT*4):0.18;wx.globalAlpha=a;for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]])wx.drawImage(ws.g,-ws.px+dx,-ws.py+dy);wx.globalAlpha=1;}
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
function iconFor(it){if(it.slot==='weapon'&&GUN_TPL[it.kind]){const k3='gi|'+it.kind+'|'+it.rar;let c3=ICONS.get(k3);if(!c3){c3=gunIcon(it);ICONS.set(k3,c3);}return c3;}if(it.slot==='weapon'&&SPR.weap){const k2='w|'+it.kind+'|'+it.rar+'|'+(idHash(it.id)%7);let c2=ICONS.get(k2);if(!c2){c2=weaponIconAI(it);if(c2)ICONS.set(k2,c2);}if(c2)return c2;}
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
function fontStr(size,font){if(font==='brush')return `${size}px "Nanum Brush Script", "Nanum Myeongjo", serif`;if(font==='serif')return `800 ${size}px "Nanum Myeongjo", "Noto Serif KR", "Noto Serif CJK KR", serif`;return font==='px'?`${size}px Silkscreen, "Courier New", monospace`:`800 ${size}px "Nanum Gothic", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif`;}
const [,mcx]=mk(8,8);
function tbitmap(str,size,color,font){font=font||'kr';
  const key=str+'|'+size+'|'+color+'|'+font+'|'+SC;let b=TXT.get(key);if(b)return b;if(TXT.size>1500)TXT.clear();
  color=TXT_BRIGHT[color]||color;size=(font==='px'?size:(size<=12?size+1:size))*SC/2;
  mcx.font=fontStr(size,font);const tw=Math.ceil(mcx.measureText(str).width);const w=Math.max(4,tw+6),h=Math.ceil(size*1.35)+6;
  const [c,x]=mk(w,h);x.font=fontStr(size,font);x.textBaseline='middle';x.fillStyle='#fff';x.fillText(str,3,Math.round(h/2)+1);
  const id=x.getImageData(0,0,w,h),a=id.data,n=w*h,mask=new Uint8Array(n),al=new Uint8Array(n);for(let i=0;i<n;i++){al[i]=a[i*4+3];mask[i]=al[i]>110?1:0;}const smooth=font!=='px'&&SC>2;const rad=SC>=4?2:1;
  const [cr,cg,cb]=rgb(color);
  /* 밝은 바탕(일지·말풍선)에 쓰는 어두운 글자는 검은 테두리 없이 부드럽게 — 번져 보이던 문제 */
  if(cr*0.3+cg*0.59+cb*0.11<100){for(let i=0;i<n;i++){const p=i*4;a[p]=cr;a[p+1]=cg;a[p+2]=cb;a[p+3]=Math.min(255,al[i]*1.25);}x.putImageData(id,0,0);TXT.set(key,c);return c;}
  for(let i=0;i<n;i++){const p=i*4;if(mask[i]||(smooth&&al[i]>50)){a[p]=cr;a[p+1]=cg;a[p+2]=cb;a[p+3]=mask[i]?255:al[i]*2;}else{const X=i%w,Y=(i/w)|0;let o=0;for(let dy=-rad;dy<=rad&&!o;dy++)for(let dx=-rad;dx<=rad;dx++){const xx=X+dx,yy=Y+dy;if(xx>=0&&yy>=0&&xx<w&&yy<h&&mask[yy*w+xx]){o=1;break;}}if(o){a[p]=8;a[p+1]=5;a[p+2]=10;a[p+3]=255;}else a[p+3]=0;}}
  x.putImageData(id,0,0);TXT.set(key,c);return c;}
function txt(str,x,y,size,color,align,font){size=size||12;color=color||'#e6dcc3';const b=tbitmap(String(str),size,color,font);let dx=x*SC;if(align==='center')dx-=b.width/2;else if(align==='right')dx-=b.width;ctx.drawImage(b,Math.round(dx),Math.round(y*SC-b.height/2));return b.width/SC;}
/* 공백 기준 줄바꿈(한 단어가 너무 길면 글자 단위로 자름) */
function wrapTxt(str,size,maxW){const out=[];let cur='';for(const w of String(str).split(' ')){const t=cur?cur+' '+w:w;if(tw(t,size)<=maxW){cur=t;continue;}if(cur)out.push(cur);cur=w;while(tw(cur,size)>maxW&&cur.length>1){let k=cur.length-1;while(k>1&&tw(cur.slice(0,k),size)>maxW)k--;out.push(cur.slice(0,k));cur=cur.slice(k);}}if(cur)out.push(cur);return out.length?out:[''];}
function tw(str,size){return tbitmap(String(str),size||12,'#ffffff').width/SC;}
function bigTxt(str,x,y,size,color,scale,font){const b=tbitmap(str,size,color,font);ctx.drawImage(b,Math.round(x*SC-b.width*scale/2),Math.round(y*SC-b.height*scale/2),b.width*scale,b.height*scale);}
if(document.fonts){Promise.all([document.fonts.load('800 13px "Nanum Gothic"','가나'),document.fonts.load('16px Silkscreen','0'),document.fonts.load('800 20px "Nanum Myeongjo"','종지기 그레고르'),document.fonts.load('30px "Nanum Brush Script"',Object.values(SH.AWK).map(w=>(SKILLS[w.ult]||{}).n||'').join('')+'초각성')]).then(()=>TXT.clear()).catch(()=>{});document.fonts.addEventListener&&document.fonts.addEventListener('loadingdone',()=>TXT.clear());}

// ================= 사운드 =================
let AC=null,NB=null,SFXG=null,soundMode=0;const lastS={};
try{soundMode=+localStorage.getItem('bc_sound')||0;}catch(e){}
function initAudio(){if(AC){if(AC.state==='suspended')AC.resume();return;}try{AC=new(window.AudioContext||window.webkitAudioContext)();SFXG=AC.createGain();SFXG.gain.value=OPT.sfx;SFXG.connect(AC.destination);const n=AC.sampleRate*0.6;NB=AC.createBuffer(1,n,AC.sampleRate);const d=NB.getChannelData(0);for(let i=0;i<n;i++)d[i]=Math.random()*2-1;startMusic();}catch(e){AC=null;}}
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
/* 그림자 시험 전용 BGM: 0 신비(조우 전) → 1 대면 → 2 거울 분열(50%) → 3 선각성(25%) 으로 갈수록 빠르고 거칠어짐 */
Object.assign(MPROF,{
  sh0:{root:49,sc:'whole',bpm:54,bar:8,chords:[0,2,1,3],pad:'glass',cut:240,bass:{ins:'sub',p:[0,_,_,_,_,_,_,_]},lead:{ins:'glass',ph:[[9,_,_,8,_,_,6,_],[_,_,4,_,_,5,_,_],[10,_,9,_,_,_,11,_],[_,_,_,_,6,_,_,_]]},dr:{},amb:'whisper',wet:1},
  sh1:{root:49,sc:'harm',bpm:80,bar:8,chords:[0,5,3,4],pad:'choir',cut:280,bass:{ins:'sub',p:[0,_,_,0,_,_,4,_]},lead:{ins:'musicbox',ph:[[7,_,8,_,7,_,4,_],[6,_,_,_,4,_,_,_],[11,_,10,_,8,_,7,_],[6,_,_,5,4,_,_,_]]},dr:{k:'x.......',tick:'..x...x.'},amb:'whisper'},
  sh2:{root:49,sc:'phryg',bpm:108,bar:8,chords:[0,1,0,6],pad:'wobble',cut:330,bass:{ins:'saw',p:[0,_,0,1,0,_,_,6]},lead:{ins:'bell',ph:[[7,_,8,_,7,_,5,_],[4,_,_,_,5,_,_,_],[8,7,_,5,7,_,4,_],[1,_,_,_,0,_,_,_]]},dr:{k:'x..x..x.',s:'....x...',tick:'x.x.x.x.'},amb:'whisper'},
  sh3:{root:49,sc:'harm',bpm:144,bar:8,chords:[0,5,6,4],pad:'saw',cut:420,bass:{ins:'saw',p:[0,0,0,0,5,5,6,6]},lead:{ins:'horn',ph:[[7,_,_,8,11,_,8,_],[7,_,_,_,6,_,_,_],[11,_,12,_,14,_,12,11],[10,_,_,_,_,_,_,_]]},dr:{k:'x.x.x.x.',s:'....x..x',h:'xxxxxxxx',t:'x......x'},amb:'thunder'}});
function shadowStage(){if(window.__shStage!=null)return window.__shStage;if(!G.trial||G.kind!=='dungeon')return -1;let st=0,fake=false;for(const m of G.monsters.values()){if(m.tc!==SHADOW_TC)continue;if(m.fl&1024){fake=true;continue;}if(m.fl&2048)return 3;if(m.maxHp&&m.hp/m.maxHp<=0.5)st=Math.max(st,2);else if(m.fl&16)st=Math.max(st,1);}return fake?Math.max(st,2):st;}
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
  const bossOn=[...G.monsters.values()].some(m=>isBossTc(m.tc)&&(m.fl&16));
  const mode=scene!=='game'?'calm':G.kind==='hub'?'town':meDowned()?'dead':bossOn?'boss':'calm';
  const shs=scene==='game'?shadowStage():-1;const pk=shs>=0?'sh'+shs:scene==='game'&&G.kind==='dungeon'?String(SH.themeOf(G.floor||1).idx):'town';const base=MPROF[pk]||MPROF[0];const fin=scene==='game'&&G.floor>=100&&shs<0;const boss=mode==='boss'&&shs<0;
  const P=boss?Object.assign({},base,base.boss,{dr:Object.assign({},base.dr,(base.boss||{}).dr)}):base;const bpm=P.bpm*(fin&&boss?1.1:1);const step=60/bpm/2;
  if(mode!==MUS.mode||pk!==MUS.prof){MUS.mode=mode;MUS.prof=pk;MUS.dF.frequency.setTargetAtTime(boss?P.cut*1.7:mode==='dead'?150:P.cut,t,1.5);for(const d of MUS.drones)d.o.frequency.setTargetAtTime(base.root*d.r*(fin?0.94:1),t,2);MUS.dl.delayTime.setTargetAtTime(P.wet?0.78:step*3,t,1);MUS.st=0;MUS.bar=0;MUS.stT=Math.max(t+0.05,MUS.stT||0);}
  MUS.out.gain.setTargetAtTime(soundMode===0?0.55*OPT.bgm:0,t,0.4);
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
const EL_SPARK={zap:'c',fire:'o',ice:'C',holy:'y',poison:'z',void:'P',magic:'p',arrow:'w',blunt:'S',quake:'S',shot:'y',blast:'o'};
function nzF(dur,vol,type,freq,q,delay){const t=AC.currentTime+(delay||0);const s2=AC.createBufferSource();s2.buffer=NB;const f=AC.createBiquadFilter();f.type=type;f.frequency.value=freq;if(q)f.Q.value=q;const g=AC.createGain();g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);s2.connect(f).connect(g).connect(SFXG);s2.start(t,R()*0.3);s2.stop(t+dur+0.03);}
function hitThump(f,vol,dur){tone('sine',f,f*0.45,dur,vol);}
function hitSfx(el,crit,mine,boss){if(!AC||soundMode===2)return;const now=AC.currentTime,key='h_'+el+(mine?'m':'');if(lastS[key]&&now-lastS[key]<(mine?0.06:0.09))return;lastS[key]=now;const v=rf(0.9,1.12);const lv=mine?1:0.55;
  try{if(mine){nzF(0.05,0.07,'lowpass',900*v);hitThump((boss?62:84)*v,(crit?0.16:0.1),boss?0.18:0.12);}}catch(e){}
  try{switch(el){
  case'slash':nzF(0.09,0.09*lv,'bandpass',1500*v,1.4);nzF(0.05,0.05*lv,'lowpass',700*v);tone('triangle',520*v,260,0.06,0.02*lv);break;
  case'blunt':tone('sine',130*v,48,0.13,0.13);noise(0.1,0.12,520*v);break;
  case'heavy':tone('sine',95*v,35,0.2,0.15);noise(0.16,0.15,700);nzF(0.08,0.08,'highpass',2400);break;
  case'arrow':nzF(0.06,0.08*lv,'bandpass',1300*v,2);tone('triangle',260*v,110,0.05,0.03*lv);break;
  case'magic':tone('sine',820*v,320,0.12,0.05);nzF(0.08,0.05,'bandpass',2600*v,2);break;
  case'zap':for(let i=0;i<6;i++)tone('square',rf(1500,4200),rf(250,900),0.022,0.032,i*rf(0.012,0.028));nzF(0.2,0.075,'highpass',3600);tone('sawtooth',130,95,0.16,0.028);break;
  case'fire':noise(0.24,0.1,1300*v);tone('sawtooth',210*v,70,0.2,0.04);for(let i=0;i<3;i++)nzF(0.015,0.06,'highpass',3200,0,0.03+i*rf(0.03,0.07));break;
  case'ice':tone('triangle',2300*v,1100,0.18,0.05);tone('sine',3300*v,3000,0.12,0.02,0.03);nzF(0.1,0.06,'highpass',5200);break;
  case'holy':{const f=1080*v;tone('sine',f,f*1.01,0.26,0.04);tone('sine',f*1.5,f*1.5,0.2,0.025,0.02);nzF(0.12,0.04,'highpass',4200);break;}
  case'poison':tone('sine',230*v,560,0.08,0.05);tone('sine',260*v,620,0.08,0.04,0.07);noise(0.12,0.05,700);break;
  case'void':tone('sine',560*v,60,0.3,0.07);nzF(0.2,0.05,'bandpass',320,4);break;
  case'quake':tone('sine',72*v,30,0.35,0.15);noise(0.3,0.14,320);break;
  case'shot':nzF(0.05,0.1*lv,'bandpass',1700*v,1.3);tone('sine',240*v,90,0.05,0.07*lv);nzF(0.03,0.06*lv,'highpass',3500);break;
  case'blast':tone('sine',110*v,45,0.12,0.09*lv);noise(0.08,0.08*lv,700);break;
  default:noise(0.09,0.12,900);tone('square',180,90,0.06,0.03);}
  if(crit){tone('triangle',rf(620,720),300,0.12,0.04);nzF(0.12,0.06,'bandpass',1100,1.2);hitThump(55,0.16,0.24);}}catch(e){}}
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
  case'swing':nzF(0.12,0.045,'bandpass',rf(700,1000),1.1);break;
  case'hit':noise(0.09,0.12,900);tone('square',180,90,0.06,0.03);break;
  case'crit':noise(0.12,0.16,1400);tone('square',520,260,0.1,0.05);break;
  case'mdie':noise(0.25,0.1,500);tone('sawtooth',160,50,0.25,0.04);tone('sine',90,35,0.22,0.12);break;
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
  case'bow':tone('triangle',rf(650,760),280,0.09,0.045);nzF(0.05,0.05,'bandpass',rf(1800,2400),2);tone('sine',180,120,0.05,0.04);break;
  case'cast':tone('sine',500,900,0.12,0.04);break;
  case'dash':noise(0.2,0.08,1200);tone('sawtooth',100,220,0.2,0.04);break;
  case'stairs':tone('sine',220,70,0.7,0.1);break;
  case'boss':tone('sawtooth',70,40,0.9,0.1);noise(0.6,0.1,300);break;
  case'no':tone('square',140,120,0.1,0.04);break;
  case'rare':[880,1320].forEach((f,i)=>tone('triangle',f,f,0.18,0.05,i*0.09));break;
  case'ult':tone('sawtooth',90,40,0.9,0.09);tone('square',180,60,0.5,0.04);[392,523,659,784,1047].forEach((f,i)=>tone('triangle',f,f,0.3,0.05,0.12+i*0.06));break;
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
  case'clashP':tone('sine',150,38,0.45,0.28);noise(0.1,0.22,2600);nzF(0.05,0.3,'highpass',3200);[1870,2810,3950,5240,6600].forEach((f,i)=>tone('triangle',f,f*0.99,0.7-i*0.1,0.075-i*0.012));tone('sine',2470,2470,0.9,0.03,0.04);tone('square',95,45,0.12,0.06);break;
  case'clashG':tone('sine',130,45,0.28,0.18);nzF(0.05,0.2,'highpass',2600);[1620,2490,3410].forEach((f,i)=>tone('triangle',f,f*0.99,0.4-i*0.08,0.05-i*0.012));break;
  case'clashX':tone('square',150,70,0.16,0.07);noise(0.14,0.1,450);nzF(0.08,0.05,'bandpass',800,3);break;
  case'clashT':tone('triangle',1400,1400,0.03,0.025);break;
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
  {k:'move',m:'마우스 오른쪽 버튼으로 가고 싶은 곳을 눌러 움직여요 (누르고 있으면 계속 따라가요)',ok:()=>TUT.moved>50},
  {k:'enter',m:'위쪽 붉은 돌문(던전 입구)을 우클릭해 다가가고 G 키로 들어가세요',ok:()=>G.kind==='dungeon'},
  {k:'atk',m:'마우스 왼쪽 클릭으로 공격해요. 몬스터를 향해 눌러 보세요',ok:()=>TUT.saw.atk},
  {k:'sk',m:'Q W E R · A S D F 로 스킬을 써요 (K 스킬 창에서 칸에 넣기)',ok:()=>TUT.saw.sk},
  {k:'dodge',m:'스페이스바로 구르면 잠깐 무적이에요. 빨간 경고 범위는 굴러서 피하세요',ok:()=>TUT.saw.dodge},
  {k:'pick',m:'떨어진 물건은 X 로 줍고, I 로 장비를 확인해요',ok:()=>TUT.saw.pick||TUT.t>25},
  {k:'more',m:'K 로 스킬을 배우고 강화해요. 5층마다 보스, 1·2 는 물약 · V 궁극기 · 카운터는 스킬 칸(QWER ASDF)에 넣어 써요',ok:()=>TUT.t>9},
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
function ftext(x,y,s,c,size,font){const t={x,y,s,c,size,font:font||'kr',t:0,vx:rf(-14,14),vy:-60};texts.push(t);return t;}
// ---- 타격감: 히트스톱 · 타격 섬광 · 방향성 파편 · 숫자 튀어오름 ----
let HSTOP=0,lastHS=0;
function onHitJuice(o){const el=SH.EL_LIST[o.e]||'slash';const mine=o.p===myId;const crit=o.c===1;const m=o.id!=null?G.monsters.get(o.id):null;
  const boss=m&&isBossTc(m.tc);const heavy=el==='heavy'||el==='quake'||el==='blunt'||el==='blast';
  const t=ftext(o.x+rf(-3,3),o.y,crit?o.v+'!':String(o.v),crit?'#ffd35a':mine?'#ffffff':'#c9c1b2',crit?26:mine?17:14,'px');if(t){t.pop=crit?1.8:mine?1.45:1.2;t.vy=crit?-90:-65;}
  let ax=0,ay=0;if(mine){const dx=o.x-me.x,dy=o.y-(me.y-8),d=Math.hypot(dx,dy)||1;ax=dx/d;ay=dy/d;}
  const c=crit?'y':(EL_SPARK[el]||'r');const n=crit?12:mine?7:4;for(let k=0;k<n;k++){const sp=rf(50,crit?170:120);const a2=Math.atan2(ay,ax)+rf(-0.9,0.9);const vx=mine?Math.cos(a2)*sp:rf(-60,60),vy=mine?Math.sin(a2)*sp*0.6:rf(-40,40);part(o.x+rf(-2,2),o.y+10,vx,vy,k%3?c:'w',rf(.12,.32),{z:rf(5,12),vz:rf(20,80),g:-220,glow:true});}
  if(mine&&(el==='slash'||el==='heavy'||crit))HITFX.push({x:o.x,y:o.y+8,a:Math.atan2(ay,ax)+Math.PI/2+rf(-0.4,0.4),t0:time,big:crit||el==='heavy',c:crit?'#fff6d0':'#ffffff'});
  else if(mine){const kd=el==='arrow'||el==='shot'?'thrust':(el==='blunt'||el==='quake'||el==='blast')?'ring':'burst';HITFX.push({x:o.x,y:o.y+8,a:Math.atan2(ay,ax),t0:time,kind:kd,sk:!!o.sk,pc:EL_SPARK[el]||'w',c:EL_GLOW[el]||'#ffffff'});}
  if(m){if(!boss)m.flash=Math.max(m.flash||0,crit?0.1:0.07);else if(crit&&mine)m.flash=Math.max(m.flash||0,0.03);m.kx=ax*(crit?3:heavy?2.5:1.5);m.ky=ay*(crit?2:1);m.kt=time;}
  hitSfx(el,crit,mine,boss);
  if(mine){const now=performance.now()/1000;const hs=crit?0.075:heavy||o.sk?0.045:0.028;/* 궁극기 연출 중에는 역경직 없음(용이 멈춰 보이던 문제) · 치명타도 간격 제한 */if(!UFX.length&&now-lastHS>(crit?0.1:0.14)){HSTOP=Math.max(HSTOP,hs);lastHS=now;}shake=Math.max(shake,crit?3:heavy?1.8:0.8);if(crit)screenFlash=Math.max(screenFlash,0.05);}
  else if(crit)shake=Math.max(shake,1);}
const HITFX=[];
const EL_GLOW={arrow:'#f2eadb',magic:'#c98ae0',zap:'#9fdcff',fire:'#ffa050',ice:'#9fd8ff',holy:'#ffe39a',poison:'#a8d070',void:'#c58aff',blunt:'#e6dcc3',quake:'#e6dcc3',shot:'#ffe7a0',blast:'#ffb060'};
function drawHitFx2(h,t,icx,icy){const d=h.sk?0.16:0.12;if(t>d)return false;const k=t/d,x=Math.round(h.x-icx),y=Math.round(h.y-icy),ca=Math.cos(h.a),sa=Math.sin(h.a);wx.globalAlpha=1-k;
  if(h.kind==='thrust'){const L=(h.sk?11:8)*(1-k*0.4);lineP(wpx,x-ca*L,y-sa*L*0.8,x+ca*3,y+sa*2.4,'w');lineP(wpx,x-ca*L*0.6,y-sa*L*0.5+1,x,y+1,h.pc);wglow(x,y,h.sk?10:7,h.c,0.4*(1-k));}
  else{const r=(h.kind==='ring'?4:2)+k*(h.kind==='ring'?(h.sk?10:7):(h.sk?8:6)),n=h.kind==='ring'?12:8;for(let q=0;q<n;q++){const aa=q/n*Math.PI*2+h.a;wpx(Math.round(x+Math.cos(aa)*r),Math.round(y+Math.sin(aa)*r*0.7),q%2?h.pc:'w');}
   if(h.kind==='burst'&&k<0.5){for(let q=0;q<4;q++){const aa=q*Math.PI/2+Math.PI/4;lineP(wpx,x+Math.cos(aa)*2,y+Math.sin(aa)*1.6,x+Math.cos(aa)*(4+r*0.6),y+Math.sin(aa)*(3+r*0.45),h.pc);}}wglow(x,y,h.sk?12:8,h.c,0.45*(1-k));}
  wx.globalAlpha=1;return true;}
function drawHitFx(icx,icy){for(let i=HITFX.length-1;i>=0;i--){const h=HITFX[i];const t=time-h.t0,d=0.11;if(h.kind){if(!drawHitFx2(h,t,icx,icy))HITFX.splice(i,1);continue;}if(t>d){HITFX.splice(i,1);continue;}const k=t/d;const L=(h.big?14:9)*(1-k*0.3);const x=Math.round(h.x-icx),y=Math.round(h.y-icy);const ca=Math.cos(h.a),sa=Math.sin(h.a);
  wx.globalAlpha=1-k;lineP(wpx,x-ca*L,y-sa*L*0.8,x+ca*L,y+sa*L*0.8,'w');if(h.big){lineP(wpx,x-ca*L,y-sa*L*0.8+1,x+ca*L,y+sa*L*0.8+1,'y');}wglow(x,y,h.big?14:8,h.c,0.45*(1-k));wx.globalAlpha=1;}}

function part(x,y,vx,vy,c,life,o){o=o||{};if(parts.length>1600)return;parts.push({x,y,vx,vy,c,life,max:life,z:o.z||0,vz:o.vz||0,g:o.g||0,glow:!!o.glow,ground:!!o.ground});}
function sparks(x,y,c,n){for(let k=0;k<n;k++)part(x+rf(-2,2),y,rf(-60,60),rf(-40,40),k%2?c:'w',rf(.12,.3),{z:rf(5,10),vz:rf(20,70),g:-200,glow:true});}
function deathBurst(e,s,big){if(!s)return;const ox=Math.round(e.x)-(s.w>>1),oy=Math.round(e.y)-s.h+2;const step=big?6:3;
  for(let k=0;k<s.px.length;k+=step){const px=s.px[k],py=s.px[k+1],c=s.px[k+2];part(ox+px,e.y+rf(-2,2),(px-s.w/2)*rf(3,7)+rf(-8,8),rf(-14,14),c,rf(0.9,1.8),{z:Math.max(0,(e.y+2)-(oy+py)),vz:rf(20,80),g:-280,ground:true});}
  if(big)for(let k=0;k<50;k++)part(e.x,e.y,rf(-90,90),rf(-60,60),pick(['r','e','y','o']),rf(.5,1.2),{z:rf(4,20),vz:rf(20,100),g:-120,glow:true});}
function toast(t){const el=document.getElementById('toast');el.textContent=t;el.style.display='block';clearTimeout(toast.h);toast.h=setTimeout(()=>el.style.display='none',2600);}

// ================= 저장 =================
const SAVE_KEY='bc_chars_v1';
// 세이브 초기화: 이 값이 바뀌면 모든 브라우저의 캐릭터·창고·히든 해금이 한 번 지워진다
const SAVE_EPOCH='3';try{if(localStorage.getItem('bc_epoch')!==SAVE_EPOCH){localStorage.removeItem('bc_chars_v1');localStorage.removeItem('bc_stash');localStorage.removeItem('bc_knight');localStorage.removeItem('bc_gunner');localStorage.removeItem('bc_intro');localStorage.removeItem('bc_tut');localStorage.setItem('bc_epoch',SAVE_EPOCH);}}catch(e){}
function loadChars(){try{const a=JSON.parse(localStorage.getItem(SAVE_KEY)||'[]');return Array.isArray(a)?a.filter(SH.validChar):[];}catch(e){return [];}}
function saveChars(a){try{localStorage.setItem(SAVE_KEY,JSON.stringify(a));return true;}catch(e){return false;}}
function saveCurrent(ch){const a=loadChars();const i=a.findIndex(c=>c.id===ch.id);if(i>=0)a[i]=ch;else a.push(ch);saveChars(a);}

// ================= 캐릭터 선택 화면 =================
const selEl=document.getElementById('select');
let chosenCls='warrior',delArm=null;
function clsPreview(cls,ch){const c=document.createElement('canvas');c.width=16;c.height=16;const x=c.getContext('2d');const lk=ch?{a:ch.eq.armor&&ch.eq.armor.kind,ar:ch.eq.armor?ch.eq.armor.rar:0}:{};x.drawImage(playerFrames(cls,lk).idle[0].r.c,0,0);return c;}
/* 히든 직업: 빛의 기사(흑월 레이드) · 증기총사(태엽 레이드) */
/* 빛의 기사: 모든 레이드를 하드로 클리어(이 기기의 캐릭터들 합산) · 이미 해금한 기기는 유지 */
function knightHard(){const A=loadChars();return SH.RAIDS.map(r=>A.some(c=>((c.rclrH||{})[r.id]|0)>0));}
try{if(!localStorage.getItem('bc_kmig')){if(loadChars().some(c=>((c.rclr||{}).moon|0)>0||c.cls==='knight'))localStorage.setItem('bc_knight','1');localStorage.setItem('bc_kmig','1');}}catch(e){}
function clsUnlocked(k){const C=CLASSES[k];if(!C||!C.hidden)return true;const rid=C.unlock||'moon';try{if(localStorage.getItem('bc_'+k))return true;}catch(e){}if(loadChars().some(c=>c.cls===k))return true;if(k==='knight')return knightHard().every(Boolean);return loadChars().some(c=>((c.rclr||{})[rid]|0)>0);}
function knightUnlocked(){return clsUnlocked('knight');}
function unlockCls(k){try{localStorage.setItem('bc_'+k,'1');}catch(e){}}
function unlockKnight(){unlockCls('knight');}
function renderSyn(){const L=document.getElementById('synList'),Pk=document.getElementById('synPick'),O=document.getElementById('synOut');if(!L)return;const opts=SH.CLASS_ORDER.filter(c=>clsUnlocked(c));const un=opts.join(',');
  const chip=c=>`<span class="chip" style="color:${CLASS_COL[c]}">${CLASSES[c].n}</span>`;
  L.innerHTML=SH.SYN_INFO.map(sy=>{if(sy.hidden&&!clsUnlocked(sy.hidden===1?'knight':sy.hidden))return `<div class="it"><b>???</b><div class="d">히든 직업과 함께할 때 열리는 시너지</div></div>`;
    const req=sy.req.length?sy.req.map(g=>g.map(chip).join('<span style="color:#6b6275;font-size:11px">또는</span>')).join(''):'<span class="chip" style="color:#9e937a">같은 직업 2명</span>';
    return `<div class="it"><b>${sy.n}</b><div>${req}</div><div class="d">${sy.d}</div></div>`;}).join('');
  if(!Pk.childElementCount||Pk.dataset.un!==String(un)){Pk.dataset.un=String(un);const prev=[...Pk.querySelectorAll('select')].map(x=>x.value);Pk.innerHTML='';
    const def=['guardian','warrior','priest','mage'];for(let i=0;i<4;i++){const sel=document.createElement('select');sel.setAttribute('aria-label',`파티원 ${i+1}`);sel.innerHTML='<option value="">(비어 있음)</option>'+opts.map(c=>`<option value="${c}">${CLASSES[c].n}</option>`).join('');sel.value=prev[i]!=null&&(prev[i]===''||opts.includes(prev[i]))?prev[i]:def[i];sel.onchange=upd;Pk.appendChild(sel);}}
  function upd(){const list=[...Pk.querySelectorAll('select')].map(x=>x.value).filter(Boolean);const on=SH.synergies(list);O.innerHTML=on.length?on.map(x=>`<span class="on">✓ ${x.n} · ${x.d}</span>`).join(''):'<span class="none">켜지는 시너지가 없어요</span>';}
  upd();}
/* 캐릭터 선택창: 실제 모습(의상·무기 외형·염색·전직·각성)을 계속 움직이며 보여 줌 */
const SLOTPV=[];
function lookOfCh(ch){const e=ch.eq||{},c=ch.cos||{};return{w:e.weapon?e.weapon.kind:null,wr:e.weapon?e.weapon.rar:-1,wid:e.weapon?e.weapon.id:null,a:e.armor?e.armor.kind:null,ar:e.armor?e.armor.rar:-1,rr:e.ring?e.ring.rar:-1,dy:ch.dye|0,cp:1,gl:0,sh:c.shield===0?0:1,adv:SH.advOf(ch)?ch.adv:null,aw:SH.awkOf(ch)?1:0,sk:ch.skinOn&&CLASSES[ch.cls]?ch.skinOn[CLASSES[ch.cls].fam]||null:null,cs:ch.cstOn||null,mt:ch.mtOn||null,fp:null,lg:ch.lgOn&&SH.legendOk(ch,ch.lgOn)?ch.lgOn:null};}
function drawSlotChar(S){const c=S.c,x=c.getContext('2d');x.clearRect(0,0,c.width,c.height);if(!CLASSES[S.ch.cls])return;
  const t=time+S.ph,cyc=t%6,mv=cyc>=3.5;const face=mv?((t/6|0)%2?-1:1):1;
  const p={cls:S.ch.cls,look:lookOfCh(S.ch),dx:24,dy:29,moving:mv,animT:t,face,atkAnim:0,atkDur:1,selPv:1};
  const w0=wx,n0=parts.length;wx=x;try{drawPlayer0(p,0,0,false);}catch(err){}finally{wx=w0;parts.length=Math.min(parts.length,n0);}}
function drawSlotPreviews(){for(const S of SLOTPV)if(S.c.isConnected)drawSlotChar(S);}
function renderSelect(){
  const slots=document.getElementById('slots');slots.innerHTML='';SLOTPV.length=0;const a=loadChars();
  document.getElementById('noSlots').hidden=a.length>0;
  a.forEach(ch=>{const d=document.createElement('div');d.className='slot';
    const top=document.createElement('div');top.className='row';{const pc=document.createElement('canvas');pc.width=48;pc.height=32;pc.style.cssText='width:144px;height:96px;image-rendering:pixelated;background:#0b0810;border:1px solid #2a2330;flex:none';SLOTPV.push({c:pc,ch,ph:Math.random()*4});drawSlotChar(SLOTPV[SLOTPV.length-1]);top.appendChild(pc);}
    const t=document.createElement('div');t.innerHTML=`<div class="nm"></div><div class="meta"></div>`;t.querySelector('.nm').textContent=ch.name;t.querySelector('.meta').textContent=`${CLASSES[ch.cls].n} · 레벨 ${ch.lvl} · 최고 지하 ${ch.best||0}층`;top.appendChild(t);d.appendChild(top);
    const row=document.createElement('div');row.className='row';
    const b1=document.createElement('button');b1.className='main';b1.textContent='입장';b1.onclick=()=>startGame(ch.id);
    const b2=document.createElement('button');b2.textContent='저장 코드 복사';b2.onclick=()=>{const code=SH.encodeSave(ch);(navigator.clipboard?navigator.clipboard.writeText(code):Promise.reject()).then(()=>toast('저장 코드를 복사했습니다')).catch(()=>{document.getElementById('importCode').value=code;toast('복사가 막혀 있어 아래 칸에 코드를 넣어 두었습니다');});};
    const b3=document.createElement('button');b3.className='warn';b3.textContent=delArm===ch.id?'정말 삭제':'삭제';b3.onclick=()=>{if(delArm===ch.id){saveChars(loadChars().filter(c=>c.id!==ch.id));delArm=null;}else delArm=ch.id;renderSelect();};
    row.append(b1,b2,b3);d.appendChild(row);slots.appendChild(d);});
  const cl=document.getElementById('classes');if(!cl.childElementCount){SH.CLASS_ORDER.forEach(k=>{const C=CLASSES[k];const b=document.createElement('button');b.className='cls';b.type='button';b.dataset.k=k;
    const cvs=clsPreview(k);b.appendChild(cvs);const n=document.createElement('div');n.innerHTML=`<div class="nm" style="font-size:15px"></div><div class="role"></div><div class="df"></div><div class="d"></div>`;n.querySelector('.nm').textContent=C.n;n.querySelector('.role').textContent=C.role;n.querySelector('.d').textContent=C.desc;{const I=SH.CLASS_INFO[k];n.querySelector('.df').innerHTML=`조작 난이도 <b>${'★'.repeat(I.diff)}${'☆'.repeat(5-I.diff)}</b>`;}b.appendChild(n);
    if(C.hidden)b.classList.add('hid');b.onclick=()=>{chosenCls=k;[...cl.children].forEach(x=>x.setAttribute('aria-pressed',x.dataset.k===k?'true':'false'));renderClsDetail();};cl.appendChild(b);});}
  {[...cl.children].forEach(x=>{if(CLASSES[x.dataset.k].hidden)x.hidden=!clsUnlocked(x.dataset.k);});if(!clsUnlocked(chosenCls))chosenCls='warrior';}
  {let hh=document.getElementById('hidHint');if(!hh){hh=document.createElement('p');hh.id='hidHint';hh.className='note';hh.style.margin='8px 0 0';cl.after(hh);}if(clsUnlocked('knight'))hh.textContent='';else{const H=knightHard();hh.innerHTML='🔒 히든 직업 <b>빛의 기사</b> — 모든 레이드를 <b>하드</b>로 클리어하면 열려요 ('+SH.RAIDS.map((r,i)=>(H[i]?'✔ ':'· ')+r.n).join('  ')+') · 하드 클리어 '+H.filter(Boolean).length+'/'+SH.RAIDS.length;}}
  renderSyn();renderClsDetail();
  [...cl.children].forEach(x=>x.setAttribute('aria-pressed',x.dataset.k===chosenCls?'true':'false'));
}
/* 직업 상세: 추천·장단점·파티 역할·30레벨 전직 갈래 미리보기 */
function renderClsDetail(){const el=document.getElementById('clsDetail');if(!el)return;const k=chosenCls,C=CLASSES[k],I=SH.CLASS_INFO[k];if(!C||!I){el.textContent='';return;}const esc=t=>String(t).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const bars=(v,c)=>'<span class="bars">'+[0,1,2,3,4].map(i=>`<span style="background:${i<v?c:'#2a2330'}"></span>`).join('')+'</span>';
  const brs=(SH.ADV_OF[k]||[]).map(a=>{const A=SH.ADV[a];return `<span class="br" style="border-color:${A.col}"><b style="color:${A.col}">${esc(A.n)}</b> · ${esc(A.info.role)} · 조작 ${'★'.repeat(A.info.diff)}</span>`;}).join('');
  el.innerHTML=`<div class="t">${esc(C.n)} · ${esc(C.role)}</div>생존 ${bars(I.bars[0],'#8fd0ff')} 딜 ${bars(I.bars[1],'#ff8a5a')} 지원 ${bars(I.bars[2],'#7fd05a')}<br>이런 분께 추천: ${esc(I.rec)}<br><span class="p">장점</span> ${I.pros.map(esc).join(' · ')}  <span class="c">단점</span> ${I.cons.map(esc).join(' · ')}<br>파티에서: ${esc(I.party)}<br><span style="color:var(--gold)">30레벨 전직</span> ${brs}`;}
document.getElementById('createBtn').onclick=()=>{const name=document.getElementById('newName').value.trim();const err=document.getElementById('createErr');
  if(!name){err.textContent='이름을 입력하세요';return;}if(loadChars().length>=8){err.textContent='캐릭터는 8개까지 만들 수 있습니다';return;}
  const ch=SH.newChar(name.slice(0,10),chosenCls);const a=loadChars();a.push(ch);if(!saveChars(a)){err.textContent='이 브라우저에 저장할 수 없습니다. 시크릿 창이면 일반 창에서 열어 주세요';return;}err.textContent='';document.getElementById('newName').value='';renderSelect();};
document.getElementById('importBtn').onclick=()=>{const e=document.getElementById('importErr');const ch=SH.decodeSave(document.getElementById('importCode').value);if(!ch||!SH.validChar(ch)){e.textContent='올바른 저장 코드가 아닙니다';return;}
  const a=loadChars();const i=a.findIndex(c=>c.id===ch.id);if(i>=0)a[i]=ch;else a.push(ch);saveChars(a);e.textContent='';document.getElementById('importCode').value='';toast(`${ch.name} 캐릭터를 불러왔습니다`);renderSelect();};

let conn={t0:0,recon:false,tries:0};setInterval(()=>{if(ws&&ws.readyState===1&&scene==='game')net({t:'lat',c:Math.round(performance.now()*10)/10});},2000);
/* FPS·핑 표시 (렉이 내 PC 탓인지 서버·인터넷 탓인지 구분) */
function drawPerf(){if(scene!=='game')return;const f=FPSC.v,pg=G.ping==null?null:Math.round(G.ping);const lv=Math.max(f>=50?0:f>=30?1:2,pg==null?0:pg<120?0:pg<250?1:2);const col=['#7fd05a','#ffd35a','#e0574a'][lv];const y=G.kind==='dungeon'?75:9;txt(`FPS ${f} · 핑 ${pg==null?'-':pg+'ms'}`,476,y,9,col,'right');}let BC_VER=null;const IS_DESKTOP=/BCDesktop\//.test(navigator.userAgent);
function startGame(id){const ch=loadChars().find(c=>c.id===id);if(!ch)return;if(CINE.on)cineStop(true);curSlot=id;initAudio();selEl.hidden=true;scene='connecting';cv.focus();conn={t0:performance.now(),recon:false,tries:0};openWs();}
function openWs(){const ch=loadChars().find(c=>c.id===curSlot);if(!ch){backToSelect('캐릭터를 찾을 수 없습니다');return;}
  const proto=location.protocol==='https:'?'wss':'ws';let s2;try{s2=new WebSocket(`${proto}://${location.host}/ws`);}catch(e){retryWs();return;}ws=s2;let opened=false;
  s2.onopen=()=>{opened=true;conn.tries=0;const j={t:'join',ch,stash:loadStash()};if(conn.prevParty)j.prev=conn.prevParty;net(j);};
  s2.onmessage=e=>{if(ws!==s2)return;let d;try{d=JSON.parse(e.data);}catch(er){return;}try{handle(d);}catch(er){console.error(er);}};
  s2.onclose=()=>{if(ws!==s2||scene==='select')return;
    if(scene==='game'){const pp=G.party&&G.party.members&&G.party.members.length>1?G.party.members.map(m=>m.cid).filter(Boolean):null;scene='connecting';conn={t0:performance.now(),recon:true,tries:0,prevParty:pp};resetWorld();}
    retryWs();};}
function retryWs(){const el=(performance.now()-conn.t0)/1000;if(el>120){backToSelect('서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요');return;}conn.tries++;setTimeout(()=>{if(scene==='connecting')openWs();},Math.min(4000,800+conn.tries*600));}
function backToSelect(m){scene='select';try{if(ws)ws.close();}catch(e){}ws=null;selEl.hidden=false;renderSelect();if(m)toast(m);}
function quitToSelect(){scene='select';if(ws){try{ws.close();}catch(e){}}ws=null;selEl.hidden=false;renderSelect();resetWorld();}
function resetWorld(){G.clash=null;G.half=null;G.beats=null;G.beatRes=null;G.clashRes=null;G.clashW=null;G.clashSpec=null;G.cscn=null;G.rrev=null;G.block=null;me.inBoss=false;G.bossLive=null;G.players.clear();G.monsters.clear();G.projs.clear();G.drops.clear();G.zones=[];parts=[];effects=[];texts=[];G.result=null;G.invite=null;G.ctxMenu=null;showInv=showChar=showShop=false;G.portalMenu=false;G.escMenu=false;}

// ================= 네트워크 메시지 =================
function ensurePlayer(id){let p=G.players.get(id);if(!p){p={id,x:0,y:0,dx:0,dy:0,face:1,hp:1,maxHp:1,downed:false,dodge:false,moving:false,shield:false,rev:0,animT:R()*3,atkAnim:0,atkDur:0.3,atkKind:'',atkAngle:0,spin:0,flash:0};G.players.set(id,p);}return p;}
function handle(d){switch(d.t){
  case 'welcome':if(d.ver){if(!BC_VER)BC_VER=d.ver;else if(BC_VER!==d.ver){try{sessionStorage.setItem('bc_rejoin',JSON.stringify({id:curSlot,pp:conn.prevParty||null}));}catch(e){}scene='connecting';location.reload();return;}}myId=d.id;scene='game';G.ultOk=d.ultok?new Set(d.ultok):null;break;
  case 'ucd':ultEnd=time+d.left;break;
  case 'ctrReset':ctrCdEnd=0;break;
  case 'err':toast(d.m);break;
  case 'map':{if(!d.field)G.field=null;G.clash=null;G.half=null;G.beats=null;G.beatRes=null;G.clashRes=null;G.clashW=null;G.clashSpec=null;G.cscn=null;G.rrev=null;if(G.pendEnd&&d.kind==='hub'){const pe=G.pendEnd;G.pendEnd=null;setTimeout(()=>playEnding(pe,()=>{if(pe==='end2')onFirstDawn();}),1200);}closeFac();G.raid=null;G.rvote=null;G.mvp=null;G.auc=null;G.bseq=null;G.rings=[];G.tethers=[];G.block=null;me.inBoss=false;G.bossLive=null;G.kind=d.kind;G.trial=d.trial?d.trial.adv:null;G.trialRe=!!(d.trial&&d.trial.re);G.trialAw=!!(d.trial&&d.trial.aw);G.trialT0=null;G.shadowLook=d.trial?{cls:d.trial.cls,look:d.trial.look||{}}:null;G.paused=d.paused||null;G.selfPause=false;G.trans=0;G.monsters.clear();G.deadM.clear();G.projs.clear();G.drops.clear();G.zones=[];parts=[];effects=[];texts=[];G.portalMenu=false;showShop=false;
    if(!(G.clash&&G.clash.local))G.clash=null;G.clashW=null;G.clashSpec=null;G.cscn=null;
    if(d.kind==='hub'){G.arena=null;G.arenaRes=null;G.fishS=null;G.map=SH.genHub();G.floor=0;banner={t:0,a:'던전 입구 광장',b:'동료를 모아 포탈로 들어가세요'};}
    else if(d.raid){G.arena=null;G.arenaRes=null;G.map=SH.genRaid(d.raid.id,d.seed);G.floor=d.raid.tf;G.stairsOpen=false;G.raid=d.raid.st;G.auc=null;if(d.raid.door)for(const i of G.map.door)G.map.tiles[i]=1;const rd=SH.RAIDS.find(r=>r.id===d.raid.id);for(const k in BPH)artOf(BPH[k].img);G.halfN=0;banner={t:0,a:`${rd.n} · ${RAID_MODE_N[d.raid.mode]}`,b:`${rd.boss}이(가) 기다린다`};}
    else if(d.field){G.arena=null;G.arenaRes=null;G.map=SH.genField();G.field=d.field;G.fReg=-1;G.ftpMenu=false;G.floor=SH.FIELD_FLOOR[0];G.stairsOpen=false;(d.field.l||[]).forEach((o,i)=>{if(o)for(const k of G.map.lairs[i].door)G.map.tiles[k]=1;});banner={t:0,a:'4막 · 잿빛 황야',b:'꺼진 화로에 다시 불을 붙여라'};}
    else if(d.arena){G.map=SH.genArena(d.seed);G.floor=d.floor;G.stairsOpen=false;banner={t:0,a:'결투장',b:'상대 팀을 모두 쓰러뜨리세요'};}
    else{G.arena=null;G.arenaRes=null;G.map=SH.genFloor(d.seed,d.floor);G.floor=d.floor;G.stairsOpen=!!d.stairs;if(d.stairs)SH.openStairs(G.map);const th=SH.themeOf(d.floor);banner=d.trial&&SH.ADV[d.trial.adv]?{t:0,a:d.trial.aw&&SH.AWK[d.trial.adv]?`각성의 시련 · ${SH.AWK[d.trial.adv].n}`:`${d.trial.re?'그림자 재도전':'전직 시험'} · ${SH.ADV[d.trial.adv].n}`,b:'가장 깊은 곳에서 너의 그림자가 기다린다'}:{t:0,a:`지하 ${d.floor}층 · ${th.corrupt?'타락한 ':''}${th.t.n}`,b:G.map.boss?`${SH.bossOf(d.floor).n}이(가) 기다린다`:pick(th.t.lines)};}
    if(Array.isArray(d.tm))for(const [i,v] of d.tm)G.map.tiles[i]=v;/* 서버에서 바뀐 타일(레버·거울·제단·문) */
    torches=G.map.torches;G.explored=new Uint8Array(G.map.w*G.map.h);me.x=d.x;me.y=d.y;me.path=null;me.pickTarget=null;me.goal=null;me.dodgeT=0;
    G.ev=d.ev||null;G.pings=[];if(G.ev&&G.ev.secret&&G.ev.secret.open&&G.map.secret)G.map.tiles[G.map.secret.door]=1;
    for(const o of d.drops||[])addDropC(o,true);
    for(const p of G.players.values()){p.dx=p.x;p.dy=p.y;}
    explore();drawMini();break;}
  case 'ros':{G.syn=d.syn||null;G.ros=new Map(d.list.map(r=>[r.id,r]));for(const id of [...G.players.keys()])if(!G.ros.has(id))G.players.delete(id);for(const r of d.list){const p=ensurePlayer(r.id);p.name=r.name;p.cls=r.cls;p.lvl=r.lvl;p.pt=r.pt;p.look=r.look;}break;}
  case 'party':G.party=d;break;
  case 'shop':G.shop=d;break;
  case 'cdr':localCd[d.sid]=0;break;
  case 'scd':localCd[d.sid]=time+(+d.left||0);break;
  case 's':onSnap(d);break;
  case 'ch':{const firstCh=!G.ch;const old=G.ch;G.ch=d.ch;G.S=d.S;if(old&&!((old.rclr||{}).clock|0)&&((d.ch.rclr||{}).clock|0)>0&&!clsUnlocked('gunner'))onGunnerUnlock();if(old&&d.ch.lvl>old.lvl){}
    {const cp=SH.power(d.ch);const eqk=c=>['weapon','armor','ring'].map(s=>c.eq[s]?c.eq[s].id+'.'+(c.eq[s].up|0)+'.'+(c.eq[s].L|0)+'.'+(c.eq[s].so||[]).join(''):'-').join('|');if(old&&G.cp!=null&&cp!==G.cp&&eqk(old)!==eqk(d.ch)){const dv=cp-G.cp;msg(`전투력 ${dv>0?'+':''}${dv.toLocaleString()} ${dv>0?'▲':'▼'}  (${cp.toLocaleString()})`,dv>0?'#7fd05a':'#e0574a');}G.cp=cp;}
    saveCurrent(d.ch);if(old&&JSON.stringify(old.rclrH||{})!==JSON.stringify(d.ch.rclrH||{}))knightCheck();break;}
  case 'tp':me.x=d.x;me.y=d.y;me.path=null;me.lastSent='';break;
  case 'force':me.force={vx:d.vx,vy:d.vy,t:d.d};break;
  case 'victory':G.victory=time;sfx('legend');if(G.kind==='hub')setTimeout(()=>playEnding('end1'),3500);else G.pendEnd='end1';break;
  case 'ending':G.pendEnd=d.id;break;
  case 'dadd':for(const o of d.d)addDropC(o,false);break;
  case 'drem':G.drops.delete(d.id);break;
  case 'msg':msg(d.m,d.c||'#e6dcc3');break;
  case 'chat':{G.chatLog.push({name:d.name,m:d.m,t:time});if(G.chatLog.length>200)G.chatLog.shift();if(G.chatOff)G.chatOff++;G.bubbles.set(d.id,{m:d.m,t:time});sfx('chat');break;}
  case 'invite':G.invite={from:d.from,name:d.name,t:time};sfx('chat');break;
  case 'an':G.anD=d;break;
case 'combo':G.combo={n:d.n,t0:time,d:d.t2};break;
case 'fame':G.fame=d.list;break;
case 'lat':{const v=performance.now()-(+d.c||0);if(v>=0&&v<10000)G.ping=G.ping==null?v:G.ping*0.6+v*0.4;break;}
case 'ranks':G.ranks=d;break;
case 'cprres':if(d.rank>=0){msg(`격돌 무한 연습 ${d.s.toLocaleString()}점 · 랭킹 ${d.rank+1}위!`,'#ffd35a');sfx('legend');}else if(d.pb)msg(`개인 최고 기록 ${d.s.toLocaleString()}점!`,'#ffe9a8');else msg(`${d.s.toLocaleString()}점 · 개인 최고 ${d.top.toLocaleString()}점`,'#c9a0e8');break;
case 'fameann':G.gmBanner={n:'',t0:time,fame:d.m};sfx('holy');break;
case 'who':G.who=d.list;G.whoT=time;break;
case 'insp':G.insp=d.v;break;
case 'treq':G.treq={from:d.from,name:d.name,t:time};sfx('chat');break;
  case 'trade':{const was=G.trade;G.trade=d.st;if(d.st){showInv=true;showChar=false;showSkills=false;G.ctxMenu=null;closeFac();if(!was)sfx('pick');}if(d.done)sfx('gold');break;}
  case 'stairs':G.stairsOpen=true;SH.openStairs(G.map);drawMini();break;
  case 'stairsAsk':G.stairsAsk={floor:d.floor};sfx('stairs');break;
  case 'trans':G.stairsAsk=null;msg(`${d.by}님이 계단에 도착 · ${d.t0}초 후 다음 층으로`,'#ffd35a');sfx('stairs');break;
  case 'result':clearTimeout(G.resT);G.resT=setTimeout(()=>{G.result=d;},1800);break;
  case 'meter':G.meter=d.rows;G.bossLive=d.boss||null;G.bossHist=d.hist||[];break;
  case 'block':G.block=d.r;if(!d.r)me.inBoss=false;break;
  case 'paused':if(d.self){G.selfPause=!G.selfPause;break;}G.paused=d.by;if(d.by)msg(`${d.by}님이 일시정지했습니다`,'#9e937a');break;
  case 'ev':G.ev=d.ev;if(G.ev&&G.ev.secret&&G.ev.secret.open&&G.map&&G.map.secret&&G.map.tiles[G.map.secret.door]===4){G.map.tiles[G.map.secret.door]=1;drawMini();}break;
  case 'tile':if(G.map){G.map.tiles[d.i]=d.v;drawMini();}break;
  case 'fld':G.field=d.st;break;
  case 'rrev':G.rrev=d.at<0?null:{t:time+d.at,pen:d.pen?time+d.pen:0,auto:!!d.auto,lt:time};break;
  case 'raid':{const was=G.raid;G.raid=d.st;if(d.st&&d.st.done&&!(was&&was.done))G.raidDoneT=time;if(d.st&&d.st.bb&&!(was&&was.bb))sfx('shout');break;}
  case 'clash':case 'clashw':case 'clashr':case 'half':case 'beats':onRaid2Msg(d);break;
  case 'bseq':G.bseq={seq:d.seq,step:d.step,t0:time};break;
  case 'rvote':G.rvote=d.st?Object.assign(d.st,{t0:time}):null;if(d.st&&d.st.yes.length===1&&!d.st.no.length)sfx('shout');break;
  case 'mvp':G.mvp=Object.assign(d,{t0:time});G.mvpHide=false;sfx('legend');break;
  case 'auc':G.auc=d.st;G.aucT=time;if(d.st&&!G.aucSeen){G.aucSeen=1;}if(d.st){const x=d.st.items[d.st.cur];if(x&&x.it.rar===4&&G.aucMyth!==x.it.id){G.aucMyth=x.it.id;sfx('legend');}}break;
  case 'trd':G.trd=d;break;
  case 'ping':onPing(d);break;
  case 'lore':G.loreView={i:d.i,first:d.first};sfx(d.first?'rare':'pick');break;
  case 'ach':sfx('legend');for(let n=0;n<30;n++)part(me.x+rf(-8,8),me.y-10,rf(-40,40),rf(-30,10),pick(['y','p','w']),rf(.4,.9),{z:rf(4,16),vz:rf(30,70),g:-80,glow:true});break;
  case 'arena':onArena(d);break;
  case 'duelInv':G.duelInv={from:d.from,name:d.name,n:d.n,t:time};sfx('chat');break;
  case 'fish':onFish(d);break;
  case 'emo':onEmo(d);break;
  case 'stash':G.stash=d.s;if(d.save)saveStash(d.s);break;
  case 'bsr':if(d.op==='enh'){sfx(d.ok?'legend':'no');if(d.ok){for(let n=0;n<24;n++)part(me.x+rf(-8,8),me.y-6,rf(-40,40),rf(-30,10),pick(['y','o','w']),rf(.3,.7),{z:rf(4,14),vz:rf(20,60),g:-80,glow:true});}}else if(d.op==='rr'){G.pend=d.pend;sfx('cast');}else if(d.op==='salv'){sfx('hit');G.bs=G.bs&&G.bs.w==='eq'?G.bs:null;}else if(d.op==='gem'||d.op==='comb'||d.op==='sock'){sfx('rare');}else sfx('equip');break;
  case 'gam':G.gam=d.it;msg(`${d.it.name} (${RAR[d.it.rar].n})`,itemCol(d.it));break;
  case 'bty':G.bty={b:d.b,names:d.names,reset:d.reset,at:Date.now()};break;
  case 'dps':G.dps={v:d.v,tot:d.tot,dur:d.dur,at:time};break;
  case 'dsum':G.dsum=Object.assign({at:time},d);break;
  case 'fxp':if(d.k==='gem'){sfx('rare');if(d.x!=null)ftext(d.x,d.y-10,SH.gemName(d.g),SH.GEM_COL[d.g[0]],12,'kr');}else if(d.k==='learn'){sfx('equip');sfx('cast');}else if(d.k==='gold'){if(d.v)ftext(d.x,d.y-10,`+${d.v}`,'#ffd35a',16,'px');sfx('gold');}else if(d.k==='pick'){sfx(d.r>=3?'legend':d.r>=2?'rare':'pick');}else sfx('pick');break;
}}
function addDropC(o,instant){const d=Object.assign({},o);d.t=instant?1:0;G.drops.set(d.id,d);if(!instant&&d.kind==='item'){if(d.it.rar>=3)sfx('legend');else if(d.it.rar===2)sfx('rare');}}
const WIND_DUR=[0,0.3,0.45,0.45,0.75,0.6];
function onSnap(d){
  const seen=new Set();
  for(const a of d.p){const [id,x,y,f,hp,mhp,fl,rev]=a;seen.add(id);const p=ensurePlayer(id);
    if(p.hp>hp&&id!==myId)p.flash=0.1;p.x=x;p.y=y;if(id!==myId)p.face=f;p.hp=hp;p.maxHp=mhp;const wasDown=p.downed;p.downed=!!(fl&1);p.dodge=!!(fl&2);if(id!==myId)p.moving=!!(fl&4);p.shield=!!(fl&8);p.god=!!(fl&16);p.rev=rev;
    if(Math.hypot(p.dx-x,p.dy-y)>60){p.dx=x;p.dy=y;}
    if(id===myId&&p.downed&&!wasDown){me.path=null;}}
  for(const id of [...G.players.keys()])if(!seen.has(id))G.players.delete(id);
  if(d.m){const ms=new Set();
    for(const a of d.m){const [id,tc,x,y,hp,mhp,face,fl,wc,atkT,mr,ea]=a;if(G.deadM.has(id))continue;ms.add(id);let m=G.monsters.get(id);
      if(!m){m={id,tc,type:tc===99?'dummy':SH.MT_LIST[tc],x,y,dx:x,dy:y,animT:R()*3,flash:0};G.monsters.set(id,m);}else if(m.tc!==tc&&tc!==99){m.tc=tc;m.type=SH.MT_LIST[tc];}
      if(wc&&!m.wc&&Math.hypot(x-me.x,y-me.y)<220)monSfx(m.tc,'atk',wc);m.x=x;m.y=y;m.hp=hp;m.maxHp=mhp;m.face=face;m.fl=fl;m.ea=ea||0;m.wc=wc;m.atkT=atkT;if(fl&8)m.flash=0.09;if(Math.hypot(m.dx-x,m.dy-y)>60){m.dx=x;m.dy=y;}}
    for(const id of [...G.monsters.keys()])if(!ms.has(id))G.monsters.delete(id);}
  if(d.j){const js=new Set();for(const a of d.j){const [id,tc,x,y,vx,vy,h]=a;js.add(id);let p=G.projs.get(id);if(!p){p={id,type:SH.PROJ_LIST[tc],dx:x,dy:y};G.projs.set(id,p);}p.x=x;p.y=y;p.vx=vx;p.vy=vy;p.h=h;p.st=time;}
    for(const id of [...G.projs.keys()])if(!js.has(id))G.projs.delete(id);}
  if(d.z)G.zones=d.z.map(a=>({vis:a[0],x:a[1],y:a[2],r:a[3],t:a[4],pid:a[5],arm:a[0]>=20&&a[5]===1}));
  if(d.me)G.mev=d.me;
  G.rings=d.rg?d.rg.map(a=>({x:a[0],y:a[1],r:a[2]})):[];G.tethers=d.tt?d.tt.map(a=>({a:a[0],b:a[1],ok:a[2],t:a[3]})):[];G.traps=d.tr?d.tr.map(a=>({k:a[0],x:a[1],y:a[2],st:a[3]})):null;if(d.al)onAllies(d.al);else if(G.allies.size)G.allies.clear();
  if(inDungeon()){G.paused=d.pause||null;G.trans=d.trans||0;G.dark=!!d.dark;}
  for(const o of d.fx||[])onFx(o);
}
function playerPos(id){if(id===myId)return me;return G.players.get(id)||G.monsters.get(id);}
const AWK_ART_BASE='https://d8j0ntlcm91z4.cloudfront.net/user_3JPjZlP4lpNvC7U5QNUbJ2XVrJc/hf_';const AWK_ART={"berserker":"20261001_225828_82952740-0cb7-4dd4-938a-dd04446e5887","blademaster":"20261001_225754_de8751b6-e3d5-448c-8071-1239cd322156","bulwark":"20261001_225754_18252cc8-8eec-4ebc-b554-3ecde93b56bb","judicator":"20261001_225754_642aa3a2-0ec7-4bc1-859f-566e85a5a2c0","sniper":"20261001_225754_31b7dec5-aea8-45f8-a1bf-c21520bd8ea2","trapper":"20261001_225754_3db59a1b-a63d-4489-8a45-4cec72916fc4","elementalist":"20261001_225754_4ead5a8c-cba5-49ad-9ab0-8256cd8a3363","astrologer":"20261001_225754_d688d7f6-4c27-44f9-962d-738712d12916","hierophant":"20261001_225754_eae107a4-93ec-49db-8561-419346d9ba66","exorcist":"20261001_225754_ea16e964-099e-4ca8-b9f0-6e39d01443c1","dawncommander":"20261001_225754_014c3e0c-f710-4e48-89e1-5b4643ee5296","sunblade":"20261001_225754_e23cdee4-f79d-4c76-952f-1519671b5514","cannoneer":"20261001_225829_82efd6c4-913a-4582-ae40-d7afa843406e","gunkata":"20261001_225828_e3031c30-a688-4880-a200-8f5f25c8496a"};const AWK_IMG={};
function awkArt(b){if(!b||!AWK_ART[b])return null;let im=AWK_IMG[b];if(!im){im=new Image();im.crossOrigin='anonymous';im.src=AWK_ART_BASE+AWK_ART[b]+'_min.webp';AWK_IMG[b]=im;}return im.complete&&im.naturalWidth?im:null;}
// 초각성기 컷씬 (로스트아크 초각성기 모티브): 레터박스 · 암전 · 집중선 · 일러스트 컷인 · 붓글씨 기술명 · 섬광
let AWCUT=null;
function startAwkCut(o){const mine=o.id===myId;const p=playerPos(o.id);const nm=mine?(G.ch&&G.ch.name):((G.players.get(o.id)||{}).name||'');awkArt(o.b);
  if(!mine&&AWCUT&&AWCUT.mine&&time-AWCUT.t0<1.2)return;AWCUT={t0:time,mine,b:o.b,c:o.c||'#ffd35a',n:o.n||'',an:o.an||'',name:nm,d:o.d||0.85,flashed:false};UCUT=null;if(mine)shake=Math.max(shake,2);}
function drawAwkCut(){const A=AWCUT;if(!A)return;const t=time-A.t0;const c=A.c;const im=awkArt(A.b);
  if(!A.mine){const T=2.2;if(t>T){AWCUT=null;return;}const inA=Math.min(1,t/0.18),out=t>T-0.35?(T-t)/0.35:1;const off=(1-inA)*170+(1-out)*170;const x=296+off,y=66,w=176,h=40;
    ctx.save();ctx.globalAlpha=Math.max(0,out);ctx.beginPath();ctx.moveTo((x+14)*SC,y*SC);ctx.lineTo((x+w)*SC,y*SC);ctx.lineTo((x+w)*SC,(y+h)*SC);ctx.lineTo(x*SC,(y+h)*SC);ctx.closePath();ctx.fillStyle='rgba(8,5,12,0.88)';ctx.fill();ctx.clip();
    if(im){const iw=96,ih=iw*im.naturalHeight/im.naturalWidth;ctx.drawImage(im,(x+4)*SC,(y-ih*0.1)*SC,iw*SC,ih*SC);}
    const g=ctx.createLinearGradient((x+50)*SC,0,(x+110)*SC,0);g.addColorStop(0,'rgba(8,5,12,0)');g.addColorStop(1,'rgba(8,5,12,0.95)');ctx.fillStyle=g;ctx.fillRect(x*SC,y*SC,w*SC,h*SC);ctx.restore();
    ctx.globalAlpha=Math.max(0,out);pr(x+14,y,w-14,1,c);pr(x,y+h-1,w,1,c);txt(A.name+' · 초각성',x+w-6,y+11,9,'#e6dcc3','right');bigTxt(A.n,x+w-6-tbW(A.n,15,'brush')*0.55,y+27,15,'#ffffff',1.1,'brush');ctx.globalAlpha=1;return;}
  const T=A.d+0.32;if(t>T){AWCUT=null;return;}
  const inA=Math.min(1,t/0.14),outA=t>T-0.3?Math.max(0,(T-t)/0.3):1;const bar=34*inA*outA;
  // 암전 + 색 비네트
  pr(0,0,W,H,`rgba(4,3,8,${0.72*inA*outA})`);const rg=ctx.createRadialGradient(W*SC*0.62,H*SC*0.5,10*SC,W*SC*0.62,H*SC*0.5,300*SC);rg.addColorStop(0,hexA(c,0.32*inA*outA));rg.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=rg;ctx.fillRect(0,0,W*SC,H*SC);
  // 집중선
  ctx.save();ctx.globalAlpha=0.55*inA*outA;ctx.fillStyle=c;const cx=W*0.62*SC,cy=H*0.5*SC;for(let i=0;i<34;i++){const q=i/34*Math.PI*2+((i*7919)%13)*0.05+Math.floor(time*20)*0.13*(i%3);const r1=(70+((i*37+Math.floor(time*24)*11)%50))*SC,r2=330*SC,wd=0.012+(i%4)*0.006;ctx.beginPath();ctx.moveTo(cx+Math.cos(q)*r1,cy+Math.sin(q)*r1);ctx.lineTo(cx+Math.cos(q-wd)*r2,cy+Math.sin(q-wd)*r2);ctx.lineTo(cx+Math.cos(q+wd)*r2,cy+Math.sin(q+wd)*r2);ctx.fill();}ctx.restore();
  // 일러스트: 사선 띠 안에서 오른쪽→왼쪽으로 빠르게 들어와 천천히 흐른 뒤 빠져나감
  const ex=A.d-0.2;const slide=t<0.2?(1-Math.pow(1-t/0.2,3))*0:0;const ix=t<0.2?220*(1-Math.pow(t/0.2,0.5)):t<ex?-(t-0.2)*14:-(ex-0.2)*14-(t-ex)/0.2*360;
  ctx.save();ctx.globalAlpha=outA<1?outA:1;const bx0=150+ix*0.15,bw=250;ctx.beginPath();ctx.moveTo((bx0+46)*SC,bar*SC);ctx.lineTo((bx0+bw+46)*SC,bar*SC);ctx.lineTo((bx0+bw)*SC,(H-bar)*SC);ctx.lineTo(bx0*SC,(H-bar)*SC);ctx.closePath();
  ctx.fillStyle='rgba(10,6,16,0.92)';ctx.fill();ctx.clip();
  if(im){const iw=290,ih=iw*im.naturalHeight/im.naturalWidth;const px=bx0-6+ix,py=bar-16-Math.min(1,t/A.d)*12;ctx.drawImage(im,px*SC,py*SC,iw*SC,ih*SC);}
  else{ctx.fillStyle=hexA(c,0.5);ctx.fillRect((bx0+70)*SC,(bar+20)*SC,110*SC,(H-bar*2-20)*SC);}
  const sh=ctx.createLinearGradient(0,bar*SC,0,(H-bar)*SC);sh.addColorStop(0,'rgba(0,0,0,0)');sh.addColorStop(0.75,'rgba(0,0,0,0)');sh.addColorStop(1,hexA(c,0.5));ctx.fillStyle=sh;ctx.fillRect(0,0,W*SC,H*SC);ctx.restore();
  // 띠 테두리 광선
  ctx.save();ctx.globalAlpha=outA;ctx.strokeStyle=c;ctx.lineWidth=2*SC;ctx.beginPath();ctx.moveTo((bx0+46)*SC,bar*SC);ctx.lineTo(bx0*SC,(H-bar)*SC);ctx.moveTo((bx0+bw+46)*SC,bar*SC);ctx.lineTo((bx0+bw)*SC,(H-bar)*SC);ctx.stroke();ctx.restore();
  // 레터박스
  pr(0,0,W,bar,'#000000');pr(0,H-bar,W,bar,'#000000');if(bar>2){pr(0,bar-1,W,1,c);pr(0,H-bar,W,1,c);}
  // 붓글씨 기술명: 크게 찍혔다가 자리잡음
  if(t>0.18){const k=Math.min(1,(t-0.18)/0.12);const sc=2.6-1.3*(1-Math.pow(1-k,3));ctx.globalAlpha=Math.min(1,k*1.5)*outA;const jx=k<1?(R()-0.5)*4:0;
    bigTxt(A.n,128+jx,150,30,c,sc*0.8,'brush');bigTxt(A.n,126+jx,148,30,'#ffffff',sc*0.77,'brush');
    if(k>=1){txt(A.an+' · 초각성',126,112,11,c,'center');txt(A.name,126,190,10,'#cfc6b0','center');}ctx.globalAlpha=1;if(k<1&&!A.stamp){A.stamp=1;shake=Math.max(shake,5);}}
  // 섬광 (본 궁극기 발동 순간)
  if(t>=A.d&&!A.flashed){A.flashed=true;screenFlash=Math.max(screenFlash,0.55);shake=Math.max(shake,7);}
  if(t>A.d-0.06&&t<A.d+0.18){const f=1-Math.abs(t-A.d)/0.18;pr(0,0,W,H,`rgba(255,255,255,${0.75*Math.max(0,f)})`);}}
function hexA(h,a){if(h[0]!=='#'||h.length<7)return h;const n=parseInt(h.slice(1,7),16);return `rgba(${n>>16&255},${n>>8&255},${n&255},${a})`;}
function tbW(str,size,font){return tbitmap(str,size,'#ffffff',font).width/SC;}
function onAwkFx(o){const k=o.k;if(k!=='awkcast'&&k!=='awkult')return false;if(k==='awkult')startAwkCut(o);const p=playerPos(o.id);if(!p)return true;const c=o.c||'#ffd35a';const big=k==='awkult'||o.big;const n=big?70:16;
  for(let i=0;i<n;i++){const t=R()*Math.PI*2,sp=big?rf(40,140):rf(20,50);part(p.x+Math.cos(t)*4,p.y-8+Math.sin(t)*3,Math.cos(t)*sp,Math.sin(t)*sp*0.6-(big?20:10),i%3?c:'#ffffff',big?rf(0.5,1):rf(0.3,0.55),{glow:true});}
  if(big){ufx({type:'burst',x:p.x,y:p.y,r:o.big&&k==='awkcast'?90:60,max:0.6,cs:[ '#ffffff',c,'#ffd35a']});screenFlash=Math.max(screenFlash,0.25);shake=Math.max(shake,3);}return true;}
function onFx(o){const k=o.k;if(onAwkFx(o))return;if(onGunFx(o))return;if(onUltFx(o))return;if(onGMFx(o))return;if(onKnightFx(o))return;
  if(k==='dmg'){if(o.c===2){ftext(o.x+rf(-4,4),o.y+4,String(o.v),'#c9a0e8',12,'px');return;}onHitJuice(o);}
  else if(k==='pdmg'){const p=playerPos(o.id);if(p&&!(o.q&&o.id!==myId)){ftext(p.x,p.y-18,String(o.v),'#ff5a4a',16,'px');}if(o.id===myId){me.flash=0.1;shake=Math.max(shake,2);sfx('hurt');G.hurtT=time;G.hurtK=Math.min(0.55,0.2+(G.mev&&G.mev[1]?o.v/G.mev[1]*2:0));}else{const q=G.players.get(o.id);if(q)q.flash=0.1;}}
  else if(k==='heal'){ftext(o.x,o.y,'+'+o.v,'#7fd05a',16,'px');for(let n=0;n<6;n++)part(o.x+rf(-5,5),o.y+18,0,0,pick(['z','w']),rf(.4,.8),{z:rf(0,10),vz:rf(20,40),glow:true});}
  else if(k==='txt')ftext(o.x,o.y,o.s,o.c,14,'kr');
  else if(k==='mdie'){const m=G.monsters.get(o.id);const LB=G.lastBoss&&G.lastBoss.id===o.id?G.lastBoss:null;if(m){if(m.kt&&time-m.kt<0.35&&Math.hypot(m.dx-me.x,m.dy-me.y)<120){HSTOP=Math.max(HSTOP,isBossTc(m.tc)?0.25:0.06);shake=Math.max(shake,isBossTc(m.tc)?8:2.2);sfx('mdie');}deathBurst({x:m.dx,y:m.dy},m._s,isBossTc(m.tc));if(Math.hypot(m.dx-me.x,m.dy-me.y)<260)monSfx(m.tc,'die');G.monsters.delete(o.id);}else if(LB)deathBurst({x:LB.x,y:LB.y},LB.s,true);
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
  else if(k==='ctrwin'){G.ctrWin=time+o.d;sfx('shout');}
  else if(k==='bell'){raidBellFx(o);}
  else if(k==='counter'){G.ctrWin=0;effects=effects.filter(e=>!(e.type==='tele'&&e.c==='c'&&Math.hypot(e.x-o.x,e.y-o.y)<24));const m=G.monsters.get(o.id);const x=m?m.dx:o.x,y=m?m.dy:o.y;ftext(x,y-40,'카운터!','#8fd0ff',24,'kr');for(let n=0;n<40;n++){const t=R()*Math.PI*2,sp=rf(40,120);part(x,y-12,Math.cos(t)*sp,Math.sin(t)*sp*0.6,pick(['c','C','w']),rf(.3,.7),{z:rf(4,20),glow:true});}screenFlash=Math.max(screenFlash,0.25);sfx('legend');}
  else if(k==='ctrcast'){if(o.id!==myId){const p=G.players.get(o.id);if(p&&CLASSES[p.cls||'warrior'].basic.kind==='melee'){p.atkKind='swing';p.atkAngle=o.a;p.atkDur=0.22;p.atkAnim=0.22;}}}
  else if(k==='bsay')onBsay(o);
  else if(k==='bintro')onBossIntro(o);
  else if(k==='blink'){for(let n=0;n<18;n++){const t=R()*Math.PI*2,sp=rf(20,60);part(o.x,o.y-6,Math.cos(t)*sp,Math.sin(t)*sp*0.6,pick(['p','P','c']),rf(.25,.5),{z:rf(2,14),glow:true});}sfx('dash');}
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
const MOVEK={ArrowUp:[0,-1],ArrowLeft:[-1,0],ArrowDown:[0,1],ArrowRight:[1,0]};
const chatBox=document.getElementById('chatBox');const numBox=document.getElementById('numBox');let numCb=null;
/* 숫자 직접 입력 칸: 논리 좌표(x,y,w)에 띄우고 Enter로 확정 */
function askNumber(x,y,w,init,cb){const r=cv.getBoundingClientRect();const s=r.width/W;numBox.style.left=(r.left+x*s)+'px';numBox.style.top=(r.top+y*s)+'px';numBox.style.width=(w*s)+'px';numBox.value=init?String(init):'';numBox.style.display='block';numCb=cb;setTimeout(()=>{numBox.focus();numBox.select();},0);}
function closeNum(ok){if(numBox.style.display!=='block')return;const v=parseInt(String(numBox.value).replace(/[^0-9]/g,''),10);numBox.style.display='none';const cb=numCb;numCb=null;cv.focus();if(ok&&cb&&!isNaN(v))cb(v);}
numBox.addEventListener('input',()=>{const d=numBox.value.replace(/[^0-9]/g,'');if(d!==numBox.value)numBox.value=d;});
numBox.addEventListener('blur',()=>closeNum(true));
function setMouse(e){mouse.shift=!!e.shiftKey;const r=cv.getBoundingClientRect();mouse.x=(e.clientX-r.left)/r.width*W;mouse.y=(e.clientY-r.top)/r.height*H;mouse.wx=mouse.x+camX;mouse.wy=mouse.y+camY;}
function uiHit(){for(let i=uiRects.length-1;i>=0;i--){const r=uiRects[i];if(mouse.x>=r.x&&mouse.x<r.x+r.w&&mouse.y>=r.y&&mouse.y<r.y+r.h&&(r.click||r.right||r.block))return r;}return null;}
function dropUnderMouse(){for(let i=dropLabels.length-1;i>=0;i--){const l=dropLabels[i];if(mouse.x>=l.x&&mouse.x<=l.x+l.w&&mouse.y>=l.y&&mouse.y<=l.y+l.h)return l.d;}for(const d of G.drops.values()){if(d.kind==='item'&&d.t>=0.45&&Math.abs(d.x-mouse.wx)<8&&mouse.wy>d.y-14&&mouse.wy<d.y+3)return d;}return null;}
function monsterAt(x,y){let b=null,bd=1e9;for(const m of G.monsters.values()){if(m.fl&512)continue;const boss=isBossTc(m.tc)||m.tc===7;const hw=boss?(SPR.ready?18:13):(SPR.ready?9:7),top=boss?(SPR.ready?44:30):(SPR.ready?20:15);if(x>=m.dx-hw&&x<=m.dx+hw&&y>=m.dy-top&&y<=m.dy+3){const d=Math.abs(x-m.dx)+Math.abs(y-(m.dy-top/2));if(d<bd){bd=d;b=m;}}}return b;}
function playerAt(x,y){const top=SPR.ready?24:18;for(const p of G.players.values()){if(p.id===myId)continue;if(Math.abs(x-p.dx)<10&&y>p.dy-top&&y<p.dy+6)return p;}return null;}
function interact(){if(meDowned()&&(G.raid||inField())&&G.rrev&&!G.rrev.auto){net({t:'rrev'});return;}if(inField()&&!meDowned()&&fieldInteract())return;if(G.clashW&&clashWNear()){net({t:'clashgo'});return;}if(G.beats&&beatPress())return;if(G.fishS&&fishPress())return;if(G.emoWheel){G.emoWheel=false;return;}const n=nearNpc();if(n){openNpc(n);return;}const nb=nearBell();if(nb){net({t:'rbell',i:nb.i});return;}const eo=nearEv();if(eo){useEv(eo);return;}if(G.kind==='dungeon'&&G.raid&&G.raid.gm){return;}sendPing();}
/* 로스트아크식 이동: 우클릭한 곳으로 이동 · 누르고 있으면 커서를 따라감 · NPC·이벤트를 우클릭하면 그쪽으로 */
function rightMove(first){if(scene!=='game'||!G.map)return;const wx=mouse.x+camX,wy=mouse.y+camY;mouse.wx=wx;mouse.wy=wy;if(first){input.rmove=true;input.rmT=0.1;
    const npc=npcAt(wx,wy);if(npc){if(nearNpc()===npc)openNpc(npc);else goFac(npc);return;}const eo=evAt(wx,wy);if(eo){me.evGoal=eo;setGoal(eo.x,eo.y+8);return;}
    fx0Click(wx,wy);}
  me.pickTarget=null;me.goal=null;setGoal(wx,wy);}
function fx0Click(x,y){effects.push({type:'ring',x,y,t:0,max:0.3,r:5,c:'y',c2:'w'});}
function pickNear(){let b=null,bd=40;for(const d of G.drops.values()){if(d.t<0.45)continue;if(d.kind!=='item'&&d.kind!=='gold')continue;const dd=Math.hypot(d.x-me.x,d.y-me.y);if(dd<bd){bd=dd;b=d;}}
  if(b){net({t:'pick',id:b.id});TUT.saw.pick=1;return;}let f=null,fd=140;for(const d of G.drops.values()){if(d.kind!=='item'||d.t<0.45)continue;const dd=Math.hypot(d.x-me.x,d.y-me.y);if(dd<fd){fd=dd;f=d;}}if(f){me.pickTarget=f;setGoal(f.x,f.y);}}
function anyPanel(){return showInv||showChar||showShop||showSkills||G.portalMenu||G.escMenu||G.ctxMenu||G.result||G.fac||G.opts||G.talent||G.rec;}
cv.addEventListener('pointermove',e=>{setMouse(e);
  /* 다른 버튼을 누른 채 좌·우클릭을 추가로 누르거나 떼면 pointerdown/up 대신 pointermove(button=눌린 버튼)로만 들어옴 */
  if(e.button===0&&scene==='game'){if(e.buttons&1){if(!input.left&&canFight()&&!uiHit()&&!(inDungeon()&&(G.paused||G.selfPause))){input.left=true;pressMode='attack';me.path=null;me.goal=null;me.pickTarget=null;me.evGoal=null;input.rmove=false;}}else input.left=false;}
  else if(e.button===2&&scene==='game'){if(e.buttons&2){if(!uiHit()&&!(inDungeon()&&(G.paused||G.selfPause))){mouse.wx=mouse.x+camX;mouse.wy=mouse.y+camY;rightMove(true);}}else input.rmove=false;}});
cv.addEventListener('pointerdown',e=>{e.preventDefault();setMouse(e);initAudio();if(chatBox.style.display==='block'){chatBox.style.display='none';chatBox.value='';}cv.focus();if(scene!=='game')return;
  mouse.wx=mouse.x+camX;mouse.wy=mouse.y+camY;
  if(e.button===2){const r=uiHit();if(r){r.right&&r.right();return;}if(G.ctxMenu){G.ctxMenu=null;return;}if(G.emoWheel){G.emoWheel=false;return;}
    if(e.altKey){const pl=playerAt(mouse.wx,mouse.wy);if(pl)G.ctxMenu={id:pl.id,x:mouse.x,y:mouse.y};return;}
    if((G.paused||G.selfPause)&&inDungeon())return;rightMove(true);return;}
  if(e.button!==0)return;
  const r=uiHit();if(r){r.click&&r.click();return;}
  if(G.emoWheel){G.emoWheel=false;return;}if(G.fishS&&fishPress())return;
  if(G.ctxMenu){G.ctxMenu=null;return;}
  if(G.result){G.result=null;return;}
  if(inDungeon()&&(G.paused||G.selfPause))return;
  const npc=npcAt(mouse.wx,mouse.wy);if(npc){if(nearNpc()===npc)openNpc(npc);else goFac(npc);return;}
  const eo=evAt(mouse.wx,mouse.wy);if(eo){if(Math.hypot(me.x-eo.x,me.y-eo.y)<eo.r)useEv(eo);else{me.evGoal=eo;setGoal(eo.x,eo.y+8);}return;}
  if(canFight()){input.left=true;pressMode='attack';/* 평타를 누르면 이동 취소 → 그 자리에서 멈춰 싸움 */me.path=null;me.goal=null;me.pickTarget=null;me.evGoal=null;input.rmove=false;}});
window.addEventListener('pointerup',e=>{if(e.button===0)input.left=false;if(e.button===2)input.rmove=false;});
cv.addEventListener('contextmenu',e=>e.preventDefault());
// 게임 중엔 화면 어디를 우클릭해도 브라우저 메뉴가 뜨지 않게 (캔버스 바깥 여백·겹친 요소 포함)
document.addEventListener('contextmenu',e=>{if(scene!=='select'&&e.target!==chatBox)e.preventDefault();},true);
window.addEventListener('auxclick',e=>{if(scene!=='select')e.preventDefault();},true);
document.addEventListener('mouseup',e=>{if(scene!=='select'&&e.button===2)e.preventDefault();},true);
window.addEventListener('blur',()=>{keys.clear();input.left=false;input.rmove=false;showMeter=false;});
window.addEventListener('keydown',e=>{if(showMeter&&(e.code==='ArrowLeft'||e.code==='ArrowRight')){const n=(G.bossHist||[]).length;if(n){G.histIdx=((G.histIdx==null?n-1:G.histIdx)+(e.code==='ArrowLeft'?-1:1)+n)%n;}e.preventDefault();}});
window.addEventListener('keyup',e=>{keys.delete(e.code);if(e.code===kbCode('meter'))showMeter=false;});
window.addEventListener('keydown',e=>{
  if(scene!=='game')return;
  if(document.activeElement===numBox){if(e.key==='Enter'){closeNum(true);e.preventDefault();}else if(e.key==='Escape'){numCb=null;closeNum(false);e.preventDefault();}return;}
  if(document.activeElement===chatBox&&(e.key==='PageUp'||e.key==='PageDown')){chatScroll(e.key==='PageUp'?4:-4);e.preventDefault();return;}
  if(document.activeElement===chatBox){if(e.key==='Enter'){const m=chatBox.value.trim();if(m)net({t:'chat',m});chatBox.value='';chatBox.style.display='none';cv.focus();e.preventDefault();}else if(e.key==='Escape'){chatBox.value='';chatBox.style.display='none';cv.focus();e.preventDefault();}return;}
  const c=e.code;initAudio();
  if(G.rebind){rebindKey(c);e.preventDefault();return;}
  const act=kbAction(c);
  if(MOVEK[c]){keys.add(c);e.preventDefault();}
  if(c==='Space'||c==='Tab'||act)e.preventDefault();
  if(c==='Enter'&&!G.stairsAsk){openChat();e.preventDefault();return;}
  if(act==='meter'){showMeter=true;return;}
  if(G.stairsAsk&&(act==='act'||c==='Enter'||c==='Space')){net({t:'descend'});G.stairsAsk=null;e.preventDefault();return;}
  if(G.stairsAsk&&c==='Escape'){G.stairsAsk=null;return;}
  if(raidSelKey(c)){e.preventDefault();return;}
  if(c==='Escape'&&G.cpr){cprStop();return;}
  if(c==='Escape'&&G.awkView){G.awkView=null;return;}
  if(c==='Escape'&&G.loreView){G.loreView=null;return;}
  if(c==='Escape'&&G.insp){G.insp=null;return;}
  if(c==='Escape'&&G.trade){net({t:'tcancel'});return;}
  if(c==='Escape'){
    if(G.ftpMenu){G.ftpMenu=false;return;}if(G.opts){G.opts=false;return;}if(G.emoWheel){G.emoWheel=false;return;}if(G.chronD!=null&&G.chron){G.chronD=null;return;}if(G.talent||G.rec||G.chron){G.talent=false;G.rec=false;G.chron=false;return;}if(G.fishS){G.fishS=null;return;}
    if(G.ctxMenu){G.ctxMenu=null;return;}if(G.result){G.result=null;return;}
    if(G.fac){closeFac();showInv=false;return;}
    if(showInv||showChar||showShop||showSkills||G.portalMenu){showInv=showChar=showShop=showSkills=false;G.portalMenu=false;return;}
    if(inDungeon()){if(G.selfPause){G.selfPause=false;return;}net({t:'pause'});return;}
    G.escMenu=!G.escMenu;return;}
  if(c==='KeyM'){soundMode=(soundMode+1)%3;try{localStorage.setItem('bc_sound',String(soundMode));}catch(er){}msg(['소리 켬','배경음 끔 · 효과음만','소리 끔'][soundMode]);applyVolume();return;}
  if(act==='inv'){showInv=!showInv;if(!showInv){showShop=false;closeFac();}if(showInv)showSkills=false;return;}
  if(c==='KeyH'&&!TUT.off){tutSkip();toast('안내를 껐어요');return;}
  if(act==='skills'){showSkills=!showSkills;if(showSkills){showInv=showChar=showShop=false;closeFac();}return;}
  if(act==='char'){showChar=!showChar;if(showChar){showSkills=false;closeFac();showShop=false;}return;}
  if(G.duelInv&&(c==='KeyY'||c==='KeyN')){net({t:'duelAns',from:G.duelInv.from,ok:c==='KeyY'});G.duelInv=null;return;}
  if(G.emoWheel&&c.startsWith('Digit')){const i=+c.slice(5)-1;if(i>=0&&i<8){net({t:'emo',i});G.emoWheel=false;return;}}
  if(act==='emote'){G.emoWheel=!G.emoWheel;return;}
  if(act==='talent'){G.talent=!G.talent;if(G.talent){G.rec=false;showSkills=false;showChar=false;showInv=false;closeFac();}return;}
  if(act==='rec'){G.rec=!G.rec;if(G.rec){G.talent=false;G.chron=false;showSkills=false;showChar=false;showInv=false;closeFac();}return;}
  if(act==='chron'){openChron(!G.chron);return;}
  if(act==='comm'){openComm(!G.comm);return;}
  if(act==='anal'){openAnal(!G.anal);return;}
  if(G.treq&&!G.invite&&(c==='KeyY'||c==='KeyN')){net({t:'tans',from:G.treq.from,ok:c==='KeyY'});G.treq=null;return;}
  if(G.invite&&(c==='KeyY'||c==='KeyN')){net({t:'ians',from:G.invite.from,ok:c==='KeyY'});G.invite=null;return;}
  if(inDungeon()&&(G.paused||G.selfPause))return;
  if(act&&act.startsWith('sk')){const i=+act.slice(2);if(i>=0&&i<SH.BAR_SIZE){if(G.clash&&e.repeat)return;castSkill(i,mouse.wx,mouse.wy);}}
  else if(act==='potHp')usePot('hp');else if(act==='potMp')usePot('mp');
  else if(act==='act')interact();
  else if(act==='pick')pickNear();
  else if(act==='ctr')useCounter();
  else if(act==='ult')useUlt();
  else if(act==='dodge')dodge();});
function openChat(){const r=cv.getBoundingClientRect();const s=r.width/W;chatBox.style.left=(r.left+6*s)+'px';chatBox.style.top=(r.top+208*s)+'px';chatBox.style.width=(170*s)+'px';chatBox.style.display='block';chatBox.focus();}

// ================= 로컬 행동 =================
function usePot(k){if(meDowned()||potCd>0)return;if(!G.ch)return;if(G.ch.pots[k]<=0){msg(k==='hp'?'체력 물약이 없습니다':'마나 물약이 없습니다','#ff6a5a');sfx('no');return;}potCd=0.4;net({t:'pot',k});}
function castSkill(i,tx,ty){if(G.clash&&i<SH.BAR_SIZE){clashPress(i);return;}if(!G.ch||meDowned())return;if(!canFight()){msg('마을에서는 훈련장(허수아비 근처)에서만 스킬을 쓸 수 있어요','#9e937a');return;}
  const rmb=i===SH.BAR_SIZE;const sid=rmb?G.ch.rmb:(G.ch.bar&&G.ch.bar[i]);if(!sid){msg(`${keyLabel(kbCode('sk'+i))} 칸이 비어 있습니다 · K에서 스킬을 넣으세요`,'#9e937a');return;}if(sid==='ctr'){useCounter();return;}const sk=SKILLS[sid];if((localCd[sid]||0)>time){return;}if(G.mev[2]<sk.mp){msg('마나가 부족합니다','#7aa2ff');sfx('no');return;}
  localCd[sid]=time+sk.cd*(1-((G.S&&G.S.cdr)||0));me.face=tx<me.x?-1:1;net({t:'sk',i,x:Math.round(tx),y:Math.round(ty)});me.path=null;me.pickTarget=null;}
function dodge(){if(meDowned()||me.dodgeCd>0||!G.map||G.mev[9]===0)return;let vx=0,vy=0;for(const k of keys){const v=MOVEK[k];if(v){vx+=v[0];vy+=v[1];}}
  if(!vx&&!vy){vx=mouse.wx-me.x;vy=mouse.wy-me.y;}const l=Math.hypot(vx,vy)||1;me.dodx=vx/l;me.dody=vy/l;me.dodgeT=0.28;me.dodgeCd=0.9;me.path=null;net({t:'dodge'});sfx('dodge');}
function tryAttack(){if(!G.ch||!G.S||meDowned()||me.atkCd>0)return;const a=Math.atan2(mouse.wy-(me.y-6),mouse.wx-me.x);me.atkCd=1/(G.S.atkRate*(G.mev[7]||1));net({t:'atk',a:Math.round(a*100)/100});
  if(CLASSES[G.ch.cls].basic.kind==='melee'){const dur=clamp(0.3*1.25/(G.S.atkRate*(G.mev[7]||1)),0.12,0.36);me.atkKind='swing';me.atkAngle=a;me.atkDur=dur;me.atkAnim=dur;me.face=Math.cos(a)<0?-1:1;effects.push({type:'slash',pid:myId,a,t:0,d:dur,max:dur+0.08});sfx('swing');}}
function updateMe(dt){
  me.animT+=dt;me.flash=Math.max(0,me.flash-dt);me.atkCd-=dt;me.dodgeCd-=dt;potCd-=dt;if(me.atkAnim>0)me.atkAnim-=dt;if(me.spin>0)me.spin-=dt;
  const frozen=meDowned()||arenaFrozen()||(inDungeon()&&(G.paused||G.selfPause||G.trans>0&&G.trans<0.3))||!G.map||!G.S;
  me.moving=false;
  if(frozen){me.dodgeT=0;return;}
  if(me.force&&me.force.t>0){me.force.t-=dt;SH.moveEnt(G.map,me,me.force.vx*dt,me.force.vy*dt);}
  if(me.dodgeT>0){me.dodgeT-=dt;const st=250*dt;SH.moveEnt(G.map,me,me.dodx*st,me.dody*st);me.moving=true;if(R()<0.7)part(me.x+rf(-3,3),me.y,0,0,'W',0.25,{z:rf(0,6)});}
  else{
    if(input.left&&pressMode==='attack'&&canFight()&&!uiHit())tryAttack();
    if(input.rmove){input.rmT-=dt;if(input.rmT<=0){input.rmT=0.12;rightMove(false);}}
    let kx=0,ky=0;for(const k of keys){const v=MOVEK[k];if(v){kx+=v[0];ky+=v[1];}}
    const slow=(me.atkAnim>0?0.45:1)*(G.mev[9]==null?1:G.mev[9]);
    if(kx||ky){const l=Math.hypot(kx,ky),st=G.S.ms*dt*slow;SH.moveEnt(G.map,me,kx/l*st,ky/l*st);me.moving=true;me.path=null;me.pickTarget=null;me.goal=null;if(me.atkAnim<=0&&kx)me.face=kx<0?-1:1;}
    else if(me.path&&me.path.length&&me.atkAnim<=0){const wp=me.path[0],dx=wp.x-me.x,dy=wp.y-me.y,d=Math.hypot(dx,dy),st=G.S.ms*dt;if(Math.abs(dx)>0.3)me.face=dx<0?-1:1;
      if(d<=st){if(!SH.blocked(G.map,wp.x,wp.y,me.r)){me.x=wp.x;me.y=wp.y;}me.path.shift();}else{const ox=me.x,oy=me.y;SH.moveEnt(G.map,me,dx/d*st,dy/d*st);if(Math.hypot(me.x-ox,me.y-oy)<st*0.2)me.path.shift();}me.moving=true;}
  }
  if(me.pickTarget){const d=me.pickTarget;if(!G.drops.has(d.id))me.pickTarget=null;else if(Math.hypot(d.x-me.x,d.y-me.y)<18){net({t:'pick',id:d.id});me.pickTarget=null;me.path=null;}}
  if(me.goal&&nearNpc()===me.goal){openNpc(me.goal);me.goal=null;me.path=null;}
  if(me.evGoal){const o=nearEv();if(o&&o.k===me.evGoal.k&&o.i===me.evGoal.i){useEv(o);me.evGoal=null;me.path=null;}else if(!me.path)me.evGoal=null;}
  if(G.block){const b=G.block;const ins=me.x>=b.x+2&&me.x<b.x+b.w-2&&me.y>=b.y+2&&me.y<b.y+b.h-2;if(ins)me.inBoss=true;else if(me.inBoss){me.x=clamp(me.x,b.x+6,b.x+b.w-6);me.y=clamp(me.y,b.y+6,b.y+b.h-6);me.path=null;}}else me.inBoss=false;
  me.sendT-=dt;if(me.sendT<=0){me.sendT=0.05;const s=`${Math.round(me.x*10)},${Math.round(me.y*10)},${me.face},${me.moving?1:0}`;if(s!==me.lastSent||R()<0.05){me.lastSent=s;net({t:'mv',x:Math.round(me.x*10)/10,y:Math.round(me.y*10)/10,f:me.face,m:me.moving?1:0});}}
}

// ================= 업데이트 =================
function explore(){if(!G.map||!G.explored)return;const tx=Math.floor(me.x/TS),ty=Math.floor(me.y/TS);let ch=false;for(let j=-7;j<=7;j++)for(let i=-10;i<=10;i++){if(i*i*0.5+j*j>52)continue;const x=tx+i,y=ty+j;if(x<0||y<0||x>=G.map.w||y>=G.map.h)continue;const k=y*G.map.w+x;if(!G.explored[k]){G.explored[k]=1;ch=true;}}if(ch)drawMini();}
function drawMini(){if(G.map&&G.map.field){drawMiniField();return;}if(!G.map||G.kind!=='dungeon')return;const MW=G.map.w,MH=G.map.h;const id=miniX.createImageData(60,60),a=id.data;for(let y=0;y<MH&&y<60;y++)for(let x=0;x<MW&&x<60;x++){const k=y*MW+x;if(!G.explored[k])continue;const t=G.map.tiles[k];let c=null;if(t===1)c=[78,66,92];else if(t===2)c=[212,154,42];else if(t===4)c=[150,110,60];else if(SH.walk(G.map,x+1,y)||SH.walk(G.map,x-1,y)||SH.walk(G.map,x,y+1)||SH.walk(G.map,x,y-1))c=[30,24,38];if(c){const p=(y*60+x)*4;a[p]=c[0];a[p+1]=c[1];a[p+2]=c[2];a[p+3]=255;}}miniX.putImageData(id,0,0);}
let exploreT=0;
function updateParts(dt){updateGunFx(dt);for(let i=parts.length-1;i>=0;i--){const p=parts[i];p.life-=dt;if(p.life<=0){parts.splice(i,1);continue;}p.x+=p.vx*dt;p.y+=p.vy*dt;
  if(p.g||p.vz){p.vz+=p.g*dt;p.z+=p.vz*dt;if(p.z<0){p.z=0;if(p.ground){p.vz=-p.vz*0.35;p.vx*=0.5;p.vy*=0.5;}else p.vz=0;}}
  if(!p.g){p.vx*=1-dt*3;p.vy*=1-dt*3;}}}
function update(dt){updateNpcs(dt);cprTick();updateFish();updatePets(dt);updateAllyC(dt);
  time+=dt;
  updateMe(dt);
  const lerp=1-Math.exp(-dt*14);
  for(const p of G.players.values()){if(p.id===myId){p.dx=me.x;p.dy=me.y;continue;}p.dx+=(p.x-p.dx)*lerp;p.dy+=(p.y-p.dy)*lerp;p.animT+=dt;p.flash=Math.max(0,p.flash-dt);if(p.atkAnim>0)p.atkAnim-=dt;if(p.spin>0)p.spin-=dt;}
  for(const m of G.monsters.values()){m.dx+=(m.x-m.dx)*lerp;m.dy+=(m.y-m.dy)*lerp;m.animT+=dt;m.flash=Math.max(0,m.flash-dt);if((m.fl&1)&&R()<dt*8)part(m.dx+rf(-5,5),m.dy,0,0,'c',0.7,{z:rf(0,12),vz:18,glow:true});if((m.fl&2)&&R()<dt*8)part(m.dx+rf(-5,5),m.dy,0,0,'w',0.5,{z:rf(0,12),vz:8});}
  for(const p of G.projs.values()){const age=Math.min(0.12,time-p.st);const tx=p.x+p.vx*age,ty=p.y+p.vy*age;p.dx+=(tx-p.dx)*Math.min(1,dt*25);p.dy+=(ty-p.dy)*Math.min(1,dt*25);
    if(p.type==='fire'&&R()<0.9)part(p.dx,p.dy,rf(-10,10),rf(-10,10),pick(['o','r','y']),rf(.15,.35),{z:p.h,vz:rf(0,20),glow:true});
    if(p.type==='orb'&&R()<0.6)part(p.dx,p.dy,rf(-6,6),rf(-6,6),pick(['p','e']),rf(.15,.3),{z:p.h,glow:true});
    if(p.type==='bolt'&&R()<0.6)part(p.dx,p.dy,0,0,pick(['c','P']),rf(.15,.3),{z:p.h,glow:true});
    if(p.type==='hammer'&&R()<0.9)part(p.dx+rf(-3,3),p.dy,rf(-6,6),rf(-6,6),pick(['y','w','#ffe9a8']),rf(.2,.4),{z:p.h,glow:true});
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
  camX=me.x-W/2;camY=me.y-H/2+10;cscnCam();
  mouse.wx=mouse.x+camX;mouse.wy=mouse.y+camY;
  const onUI=uiHit();hoverMon=onUI?null:monsterAt(mouse.wx,mouse.wy);hoverDrop=onUI?null:dropUnderMouse();hoverPl=onUI?null:playerAt(mouse.wx,mouse.wy);
}

// ================= 렌더링 =================
function pr(x,y,w,h,c){ctx.fillStyle=col(c);ctx.fillRect(Math.round(x*SC),Math.round(y*SC),Math.round(w*SC),Math.round(h*SC));}
function pimg(img,x,y,s){s=s||1;ctx.drawImage(img,Math.round(x*SC),Math.round(y*SC),img.width*SC*s,img.height*SC*s);}
function wpx(x,y,c){wx.fillStyle=col(c);wx.fillRect(x|0,y|0,1,1);}
function drawTiles(icx,icy){const map=G.map,hub=!!map.hub;const TA=hub?null:themeAssets(G.floor);const FL=TA?TA.floors:FLOORS,WL=TA?TA.walls:WALLS,ST=TA?TA.stairs:STAIRS;const x0=Math.floor(icx/TS)-1,y0=Math.floor(icy/TS)-1,x1=x0+Math.ceil(W/TS)+2,y1=y0+Math.ceil(H/TS)+2;
  for(let ty=y0;ty<=y1;ty++)for(let tx=x0;tx<=x1;tx++){const t=SH.tileAt(map,tx,ty),sx=tx*TS-icx,sy=ty*TS-icy,h=((tx*73856093)^(ty*19349663))>>>0;
    if(map.field&&t===0){const col=TA&&TA.th?TA.th.t.col:{k:'#14110e',m:'#5a5248',S:'#a89c8c',D:'#3a342e'};if(TA&&TA.ftex)wx.drawImage(TA.ftex,(((tx%16)+16)%16)*16,(((ty%16)+16)%16)*16,16,16,sx,sy,16,16);wx.fillStyle='rgba(12,10,8,0.62)';wx.fillRect(sx,sy,16,16);
      wx.fillStyle=col.D;for(let k=0;k<5;k++){const q=(h>>>(k*5))&255;wx.fillRect(sx+(q&15),sy+(q>>4),2,2);}wx.fillStyle=col.m;for(let k=0;k<3;k++){const q=(h>>>(k*7+3))&255;wx.fillRect(sx+(q&15),sy+(q>>4),1,1);}
      if(SH.tileAt(map,tx,ty-1)>0){wx.fillStyle=col.S;wx.fillRect(sx,sy,16,1);wx.fillStyle=col.m;wx.fillRect(sx,sy+1,16,1);}if(SH.tileAt(map,tx,ty+1)>0){wx.fillStyle='rgba(0,0,0,0.5)';wx.fillRect(sx,sy+14,16,2);}
      if(SH.tileAt(map,tx-1,ty)>0){wx.fillStyle=col.m;wx.fillRect(sx,sy,1,16);}if(SH.tileAt(map,tx+1,ty)>0){wx.fillStyle=col.k;wx.fillRect(sx+15,sy,1,16);}continue;}
    if((t===1||t===3)&&hub&&lobbyTex()){const g=map.ground?map.ground[ty*map.w+tx]:0;if(g===2){drawWater(sx,sy,tx,ty);continue;}wx.drawImage(LOB.ftex[g],(((tx%16)+16)%16)*16,(((ty%16)+16)%16)*16,16,16,sx,sy,16,16);}
    else if(t===1||t===3){if(TA&&TA.ftex)wx.drawImage(TA.ftex,(((tx%16)+16)%16)*16,(((ty%16)+16)%16)*16,16,16,sx,sy,16,16);else wx.drawImage(hub?HUBFLOOR[h%4]:FL[h%FL.length],sx,sy);}
    else if(t===2)wx.drawImage(ST,sx,sy);
    else if(t===6){if(TA&&TA.ftex)wx.drawImage(TA.ftex,(((tx%16)+16)%16)*16,(((ty%16)+16)%16)*16,16,16,sx,sy,16,16);drawMirrorWall(sx,sy,tx,ty);}
    else if(t===5){if(TA&&TA.ftex)wx.drawImage(TA.ftex,(((tx%16)+16)%16)*16,(((ty%16)+16)%16)*16,16,16,sx,sy,16,16);else wx.drawImage(FL[h%FL.length],sx,sy);wx.fillStyle='rgba(5,4,8,0.5)';wx.fillRect(sx,sy,16,16);
      for(let i=1;i<16;i+=5){wx.fillStyle='#1a1620';wx.fillRect(sx+i,sy-12,3,28);wx.fillStyle='#6b6275';wx.fillRect(sx+i,sy-12,1,28);wx.fillStyle='#8a8196';wx.fillRect(sx+i,sy+15,1,1);}wx.fillStyle='#1a1620';wx.fillRect(sx,sy-6,16,3);wx.fillRect(sx,sy+6,16,3);wx.fillStyle='#4a4152';wx.fillRect(sx,sy-6,16,1);wx.fillRect(sx,sy+6,16,1);}
    else if(t===4){if(TA&&TA.wtex)wx.drawImage(TA.wtex,(((tx%16)+16)%16)*16,0,16,16,sx,sy,16,16);else wx.drawImage(WL[h%WL.length],sx,sy);wx.fillStyle='#0e0b12';for(const[a,b,c2,d2]of[[3,2,7,8],[7,8,5,13],[7,8,12,11],[12,11,13,15],[9,3,11,6]]){const n=6;for(let q=0;q<=n;q++)wx.fillRect(Math.round(sx+a+(c2-a)*q/n),Math.round(sy+b+(d2-b)*q/n),1,1);}}
    else if(hub&&LOB.ftex&&!(SH.tileAt(map,tx,ty+1)>0&&ty<9)){wx.drawImage(LOB.ftex[1],(((tx%16)+16)%16)*16,(((ty%16)+16)%16)*16,16,16,sx,sy,16,16);wx.fillStyle='rgba(6,5,9,0.6)';wx.fillRect(sx,sy,16,16);}
    else if(SH.tileAt(map,tx,ty+1)>0){if(TA&&TA.wtex)wx.drawImage(TA.wtex,(((tx%16)+16)%16)*16,0,16,16,sx,sy,16,16);else wx.drawImage(WL[h%WL.length],sx,sy);}
    else{let nb=false;for(let j=-1;j<=1&&!nb;j++)for(let i=-1;i<=1;i++)if(SH.tileAt(map,tx+i,ty+j)>0){nb=true;break;}
      if(nb&&hub){wx.drawImage(PILLAR_TOP,sx,sy);continue;}
      if(nb){wx.fillStyle=PAL.k;wx.fillRect(sx,sy,16,16);wx.fillStyle=PAL.m;if(SH.tileAt(map,tx-1,ty)>0)wx.fillRect(sx,sy,1,16);if(SH.tileAt(map,tx+1,ty)>0)wx.fillRect(sx+15,sy,1,16);if(SH.tileAt(map,tx,ty-1)>0)wx.fillRect(sx,sy,16,1);
        wx.fillStyle=PAL.D;if(SH.tileAt(map,tx-1,ty)>0)wx.fillRect(sx+1,sy,1,16);if(SH.tileAt(map,tx+1,ty)>0)wx.fillRect(sx+14,sy,1,16);if(SH.tileAt(map,tx,ty-1)>0)wx.fillRect(sx,sy+1,16,1);}}}}
function pickFrame(e,fr){let set,idx;if(e.atkAnim>0){set=fr.atk;idx=Math.min(2,Math.floor((1-e.atkAnim/e.atkDur)*3));}else if(e.moving){set=fr.walk;idx=Math.floor(e.animT*(e.fast?16:8))%4;}else{set=fr.idle;idx=Math.floor(e.animT*2)%2;}const f=set[idx];return e.face<0?f.l:f.r;}
function drawPlayer0(p,icx,icy,isMe){WFX_IC[0]=icx;WFX_IC[1]=icy;const cls=isMe?myCls():(p.cls||'warrior');const src=isMe?me:p;const look=isMe?lookOfMe():(p.look||{});const fr=playerFrames(cls,look);
  const riding=look.mt&&SH.MOUNTS[look.mt]&&(G.kind==='hub'||(p&&p.selPv))&&!(src.atkAnim>0)&&!(p&&p.downed);
  const e={atkAnim:src.atkAnim,atkDur:src.atkDur,moving:riding?false:(isMe?me.moving:p.moving),animT:src.animT,face:isMe?me.face:p.face};const s=pickFrame(e,fr);
  const bx=Math.round(isMe?me.x:p.dx)-icx,by0=Math.round(isMe?me.y:p.dy)-icy;const lift=riding?mountLift(look.mt,src.animT,isMe?me.moving:p.moving):0;const LG=look.lg&&SH.LEGENDS[look.lg]&&!(p&&p.downed)?look.lg:null;const by=by0-lift-(LG==='ghost'?Math.round(2+Math.sin(time*3)*1.5):0);
  if(!(p&&p.noSh))wx.drawImage(SH_S,bx-6,by0-1);
  if(riding)drawMount(look.mt,bx,by,e.face,src.animT,isMe?me.moving:p.moving,0);
  if(look.aw&&look.adv&&!AWK_IMG[look.adv])awkArt(look.adv);
  if(look.aw&&look.adv&&SH.AWK[look.adv]&&!(p&&p.downed)){const ac=SH.AWK[look.adv].col;wx.globalAlpha=0.22+0.08*Math.sin(time*3);wx.fillStyle=ac;wx.beginPath();wx.ellipse(bx,by,9,3,0,0,Math.PI*2);wx.fill();wx.globalAlpha=1;if(R()<0.22)part(bx+rf(-7,7),by-rf(0,6),rf(-3,3),rf(-22,-10),R()<0.3?'#ffffff':ac,rf(0.5,0.9),{glow:true});}
  if(p&&p.downed){wx.save();wx.translate(bx,by-(s.ai?5:3));wx.rotate(Math.PI/2*(p.face<0?-1:1));wx.globalAlpha=0.75;wx.drawImage(s.c,-s.w/2,-s.h/2);wx.restore();wx.globalAlpha=1;
    if((time*3|0)%2===0){wpx(bx,by-12,'e');wpx(bx,by-13,'e');wpx(bx,by-14,'e');wpx(bx,by-10,'e');}return s;}
  const dodging=isMe?me.dodgeT>0:p.dodge;if(dodging)wx.globalAlpha=((time*30|0)&1)?0.35:0.7;
  const flash=isMe?me.flash:p.flash;
  const sx=bx-(s.w>>1)+(s.dx||0),sy=by-s.h+2+(s.dy||0);
  if(look.ar>=2&&!s.ai)drawCape(bx,by,e.face,look.ar,e.moving,src.animT);
  if(cls==='guardian'&&!(src.spin>0)&&!s.anim)drawShield(bx,by,e.face,false,look.ar);
  if(look.cs&&COS_WING[look.cs])drawCosWings(src,look.cs,bx,by,e.face);
  if(LG&&!(flash>0)){const mv=isMe?me.moving:p.moving;drawLegend(LG,s,sx,sy,e.face,mv,isMe?me.x:p.dx,isMe?me.y:p.dy,!!(p&&p.selPv));}
  else blitS(flash>0?s.fc:s.c,s,sx-(flash>0&&s.ai?e.face:0),sy,flash);
  if(look.cs&&COS_WING[look.cs]&&!(flash>0))drawCosWingsFront(src);
  if(riding)drawMount(look.mt,bx,by,e.face,src.animT,isMe?me.moving:p.moving,1);
  const hideW=G.kind==='hub'&&look.cp===0&&!(src.atkAnim>0);
  if(hideW){}else if(s.bare&&SPR.weap){drawHeldGear(cls,src,s,sx,sy,e,look);}
  else{if(!s.anim||src.spin>0)drawWeapon(cls,src,bx,by,e.face,isMe?(G.ch&&G.ch.eq.weapon):null,look);else weaponTrail(cls,src,bx,by,e.face);
  if(cls==='guardian'&&!(src.spin>0)&&!s.anim)drawShield(bx,by,e.face,true,look.ar);}
  if((look.ar===3||look.wr===3)&&look.gl!==0){if(R()<0.35)part((isMe?me.x:p.dx)+rf(-6,6),(isMe?me.y:p.dy),rf(-4,4),0,pick(['o','y','o','w']),rf(.5,.9),{z:rf(0,6),vz:rf(18,34),glow:true});}
  if(look.rr>=2&&((time*4|0)%3===0)){wpx(bx+(e.face>0?-4:3),by-5,look.rr===3?'o':'c');}
  if(p&&p.shield){wx.globalAlpha=0.5;for(let n=0;n<24;n++){const t=n/24*Math.PI*2+time*2;if(n%2)wpx(Math.round(bx+Math.cos(t)*9),Math.round(by-6+Math.sin(t)*10),'c');}}
  wx.globalAlpha=1;return s;}
/* ===== 의상 연출: 대천사 — 공격할 때 등 뒤의 큰 날개가 펼쳐짐 ===== */
const COS_WING={archangel:1};const WING_C={};const WING_PH=16,WING_LV=8;
/* 천사 날개 날갯짓 (옆모습, 오른쪽을 볼 때 기준 · 날개는 등 뒤 왼쪽으로)
   - 어깨→손목(팔) · 손목→날개 끝(손) 두 마디. 각도는 '위'에서 '등 뒤'쪽으로 잰 값
   - 내려치기(주기의 60%): 날개를 끝까지 펴고 깃털을 부채처럼 벌림, 날개 끝은 살짝 늦게 따라옴
   - 올리기(40%, 빠르게): 손목을 접어 날개 끝이 아래로 늘어진 채 끌려 올라감, 깃털을 모음 */
// o: 펼친 정도(0=등에 접어 붙임, 1=활짝) · p: 편 상태에서의 날갯짓 위치(0~1)
function wingPose(p,o){p=((p%1)+1)%1;const sm=t=>t*t*(3-2*t);
  const F={t1:0.42,t2:2.7,c:0.6,fan:0.5,tk:1,sc:0.62};
  // 편 상태 날갯짓: 아치를 중심으로 위아래로만 작게 (한 바퀴 돌지 않음) · 내려치기 60% · 올리기 40%(살짝 오므림) · 날개 끝은 조금 늦게 따라옴
  const hOf=q=>{q=((q%1)+1)%1;return q<0.6?1-sm(q/0.6):sm((q-0.6)/0.4);};
  const up=p>=0.6?Math.sin(Math.PI*(p-0.6)/0.4):0;
  const Sp={t1:0.95-0.65*hOf(p),t2:1.8-0.75*hOf(p-0.08),c:1-0.12*up,fan:1.05-0.25*up,tk:0,sc:0.76};
  const e=sm(Math.max(0,Math.min(1,o)));const r={};for(const k in F)r[k]=F[k]+(Sp[k]-F[k])*e;return r;}
function wingCanvas(pi,lv,dir){const key=pi+'|'+lv+'|'+dir;if(WING_C[key])return WING_C[key];const W=78,H=74,ox=60,oy=38;const g=new Uint8Array(W*H);
  const put=(x,y,v)=>{x=Math.round(x);y=Math.round(y);if(x<0||y<0||x>=W||y>=H)return;g[y*W+x]=v;};
  const disc=(cx,cy,r,v)=>{const R2=r*r,n=Math.ceil(r);for(let dy=-n;dy<=n;dy++)for(let dx=-n;dx<=n;dx++)if(dx*dx+dy*dy<=R2)put(cx+dx,cy+dy,v);};
  const lerp=(a,b,t)=>a+(b-a)*t;const dirv=a=>[-Math.sin(a),-Math.cos(a)];
  const wing=(P,dx,dy,scm,dim)=>{const D=dim?10:0,sc=P.sc*scm;const a1=17*sc,a2=16*sc*P.c;
    const S=[ox+dx,oy+dy],v1=dirv(P.t1),Wp=[S[0]+v1[0]*a1,S[1]+v1[1]*a1],v2=dirv(P.t2),T=[Wp[0]+v2[0]*a2,Wp[1]+v2[1]*a2];
    const m=a1/(a1+a2);const edge=u=>u<m?[lerp(S[0],Wp[0],u/m),lerp(S[1],Wp[1],u/m),P.t1]:[lerp(Wp[0],T[0],(u-m)/(1-m)),lerp(Wp[1],T[1],(u-m)/(1-m)),P.t2];
    const feather=(u,len,beta,fill,shade,tip)=>{const[ex,ey,te]=edge(u);let a=Math.min(3.1,te+beta);a+=(Math.PI-0.42-a)*(P.tk||0);const[vx,vy]=dirv(a);
      for(const pass of[0,1])for(let r=0;r<=len;r+=0.4){const q=r/len;const w=lerp(1.45,1.0,u)*(q<0.7?1:Math.sqrt(Math.max(0,1-Math.pow((q-0.7)/0.3,2))))+0.25;disc(ex+vx*r,ey+vy*r,pass?w:w+0.7,pass?(q>0.82&&tip?tip:fill):shade);}};
    const NF=14;for(let i=NF-1;i>=0;i--){const u=0.04+0.96*i/(NF-1);feather(u,(9+16*Math.pow(u,1.5))*sc*(0.55+0.45*P.c),lerp(2.6,0.5,Math.pow(u,1.3))*P.fan,2+D,4+D,u>0.5?3+D:0);}
    for(let i=9;i>=0;i--){const u=0.03+0.92*i/9;feather(u,(4+5*u)*sc,lerp(2.4,0.6,u)*P.fan,1+D,4+D,0);}
    for(let u=0;u<=1;u+=0.02){const[ex,ey]=edge(u);disc(ex,ey,lerp(1.9,1.1,u),2+D);}};
  const ph=pi/WING_PH,oo=lv/(WING_LV-1);wing(wingPose(ph-0.05,oo),3,-2,0.86,1);wing(wingPose(ph,oo),0,0,1,0);
  const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');
  const col={1:'#fff6dc',2:'#ffffff',3:'#ffe08a',4:'#d9c69a',11:'#efe5ca',12:'#e4d9bb',13:'#d9b766',14:'#b9a576'};
  if(dir<0){x.translate(W,0);x.scale(-1,1);}
  for(let y=0;y<H;y++)for(let xx=0;xx<W;xx++){const v=g[y*W+xx];if(v){x.fillStyle=col[v];x.fillRect(xx,y,1,1);}else{let n=0;for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const X=xx+dx,Y=y+dy;if(X>=0&&Y>=0&&X<W&&Y<H&&g[Y*W+X])n=1;}if(n){x.fillStyle='#7a4e0c';x.fillRect(xx,y,1,1);}}}
  // 뿌리 덮개: 앞날개 뿌리(어깨뼈 깃털)만 테두리 없이 따로 — 캐릭터 위에 덧그려 등 테두리를 가림
  const cp=document.createElement('canvas');cp.width=W;cp.height=H;const xc=cp.getContext('2d');if(dir<0){xc.translate(W,0);xc.scale(-1,1);}
  for(let y=oy-7;y<=oy+6;y++)for(let xx=ox-6;xx<=ox;xx++){if(y<0||y>=H||xx<0)continue;const v=g[y*W+xx];if(v&&v<10&&(xx-ox)*(xx-ox)+(y-oy)*(y-oy)<=34){xc.fillStyle=col[v===4?1:v];xc.fillRect(xx,y,1,1);}}
  return(WING_C[key]={c,cap:cp,ox:dir<0?W-ox:ox,oy});}
function drawCosWings(src,cs,bx,by,face){if(!COS_WING[cs])return;const now=time,d=Math.max(0,Math.min(0.1,now-(src._wt||now)));src._wt=now;const f=face<0?-1:1;
  const ultW=(src._wUlt||0)>now;const atk=src.atkAnim>0||ultW;if(atk)src._wLast=now;
  // 평소엔 등에 접어 둠 · 공격하면 0.15초에 펴짐 · 공격이 끝나고 0.4초 뒤 0.35초에 걸쳐 접힘
  const hold=atk||now-(src._wLast||-9)<0.4;src._wo=Math.max(0,Math.min(1,(src._wo||0)+(hold?d/0.15:-d/0.35)));const o=src._wo;
  if(o>0.3)src._wph=((src._wph||0)+d/(ultW?0.42:0.5))%1;else src._wph=0.3;
  const oi=Math.round(o*(WING_LV-1)),pi=oi===0?0:Math.floor(src._wph*WING_PH)%WING_PH;
  const bkx=bx-f*3,bky=by-10;
  const pulse=0.5+0.5*Math.sin(now*2.6);const ga=0.2+0.12*pulse+0.15*o,gr0=12+o*16,gx=bkx-f*(2+o*10),gy=bky-4-o*2;
  wx.save();wx.globalAlpha=ga;const gr=wx.createRadialGradient(gx,gy,1,gx,gy,gr0);gr.addColorStop(0,'#fff6c8');gr.addColorStop(0.5,'rgba(255,224,138,0.55)');gr.addColorStop(1,'rgba(255,214,90,0)');wx.fillStyle=gr;wx.fillRect(gx-gr0,gy-gr0,gr0*2,gr0*2);wx.restore();
  if(ultW){wx.save();wx.globalAlpha=0.22+0.12*Math.sin(now*9);const g2=wx.createRadialGradient(bkx-f*12,bky-8,1,bkx-f*12,bky-8,36);g2.addColorStop(0,'#ffffff');g2.addColorStop(1,'rgba(255,224,138,0)');wx.fillStyle=g2;wx.fillRect(bkx-f*12-36,bky-44,72,72);wx.restore();}
  const w=wingCanvas(pi,oi,f);wx.drawImage(w.c,bkx-w.ox,bky-w.oy);src._wcap={c:w.cap,x:bkx-w.ox,y:bky-w.oy,t:now};
  if(o>0.6&&R()<(ultW?0.6:0.25))part(bkx-f*rf(8,24),bky-rf(-4,12),-f*rf(4,12),rf(-2,8),R()<0.6?'#ffffff':'#ffe08a',rf(0.5,0.9),{glow:true,z:rf(6,12),vz:rf(-8,2)});
  else if(o<0.1&&R()<0.03)part(bkx-f*rf(1,5),bky-rf(2,10),rf(-3,3),rf(-14,-6),R()<0.5?'#ffffff':'#ffe08a',rf(0.5,0.9),{glow:true});}
function drawCosWingsFront(src){const q=src._wcap;if(q&&q.t===time)wx.drawImage(q.c,q.x,q.y);}
/* ===== 무기 외형 이펙트 (전부 코드로 그림) =====
   무기 끝(총은 총구)에서 평소엔 은은하게, 공격할 땐 터지듯 · 휘두르는 동안엔 궤적처럼 뿜어 나옴 */
const WFX=[],WFX_IC=[0,0];
const WFX_SH={note:['..111','..1.1','..1..','111..','111..'],heart:['11.11','13111','11111','.111.','..1..'],star:['..1..','.121.','12321','.121.','..1..'],spark:['.1.','131','.1.'],
  flake:['1.1.1','.121.','12321','.121.','1.1.1'],petal:['.11','131','11.'],leaf:['..11','.131','131.','1...'],drop:['.1.','111','131','.1.'],bubble:['.111.','13..1','1...1','1...1','.111.'],
  gear:['.1.1.','11111','11.11','11111','.1.1.'],moon:['.11','1..','1..','.11'],feather:['..1','.13','.1.','13.','1..'],bolt:['..1','.1.','111','.1.','1..'],wisp:['.1.','131','111','1.1'],
  puff:['.1.','121','.1.'],conf:['12'],bone:['1...1','.111.','1...1']};
const WFX_TH={
  petal:{sh:['petal','petal','spark'],c:[['#ffb7d0','#ff7aa8','#ffffff']],mv:'drift',idle:3,atk:7,trail:22},
  rose:{sh:['petal','petal','leaf'],c:[['#e83a4a','#8a1020','#ff9aa8'],['#3f8a2c','#7ad84a','#c8f08a']],mv:'drift',idle:2.5,atk:7,trail:16},
  frost:{sh:['flake','spark','spark'],c:[['#bfe9ff','#5ad8ff','#ffffff']],mv:'drift',idle:3,atk:8,trail:22},
  flame:{sh:['spark','spark','puff'],c:[['#ffb03a','#ff5a1f','#fff3b0']],mv:'rise',idle:6,atk:10,trail:30,fl:1},
  lava:{sh:['spark','puff','spark'],c:[['#ff6a2a','#c8201a','#ffd35a']],mv:'rise',idle:6,atk:10,trail:30,fl:1},
  steam:{sh:['puff','puff','spark'],c:[['#ffffff','#f0e6d0','#ffffff'],['#ffd35a','#ff9a3a','#fff3b0']],mv:'rise',idle:2.5,atk:6,trail:12,al:0.75},
  leaf:{sh:['leaf','leaf','spark'],c:[['#7ad84a','#3f8a2c','#c8f08a']],mv:'drift',idle:2.5,atk:7,trail:16},
  rain:{sh:['drop','drop','spark'],c:[['#8fd0ff','#3a6fb8','#ffffff']],mv:'fall',idle:4,atk:8,trail:24},
  witch:{sh:['star','spark','puff'],c:[['#c77ad8','#7a3a8c','#ffffff'],['#ffd35a','#c77ad8','#ffffff']],mv:'float',idle:3,atk:7,trail:20},
  candy:{sh:['star','conf','heart','spark'],c:[['#ff9ad0','#8fd0ff','#ffffff'],['#8fd0ff','#ff9ad0','#ffffff'],['#ffe08a','#ff9ad0','#ffffff']],mv:'float',idle:3,atk:8,trail:20},
  heart:{sh:['heart','heart','spark'],c:[['#ff5a8a','#c8204a','#ffd0e0'],['#ff9ad0','#ff5a8a','#ffffff']],mv:'float',idle:2.5,atk:7,trail:16},
  star:{sh:['star','spark'],c:[['#ffd35a','#ff9a3a','#ffffff'],['#fff3b0','#ffd35a','#ffffff']],mv:'float',idle:3.5,atk:8,trail:24},
  bubble:{sh:['bubble','bubble','spark'],c:[['#9ae8ff','#5ad8ff','#ffffff'],['#ffb7e8','#ff9ad0','#ffffff']],mv:'float',idle:2.5,atk:8,trail:16},
  moon:{sh:['moon','puff','spark'],c:[['#b07ae8','#5a2a8a','#ffffff'],['#5a2a8a','#2a1040','#b07ae8']],mv:'float',idle:3,atk:8,trail:24},
  bone:{sh:['bone','spark','puff'],c:[['#f0e0c8','#c8b8a0','#ffffff'],['#ff5a3a','#c8201a','#ffd35a']],mv:'drift',idle:2.5,atk:7,trail:18},
  gear:{sh:['gear','spark','spark'],c:[['#e0b040','#8a5a18','#fff3b0']],mv:'drift',idle:2.5,atk:7,trail:18,spin:1},
  holy:{sh:['feather','star','spark'],c:[['#ffffff','#ffe08a','#ffffff'],['#ffd35a','#fff3b0','#ffffff']],mv:'drift',idle:3,atk:8,trail:24},
  music:{sh:['note','note','spark'],c:[['#ff5a5a'],['#ffd35a'],['#5aff8a'],['#5ad8ff'],['#c77ad8']],mv:'float',idle:2.5,atk:8,trail:14},
  bolt:{sh:['bolt','spark','spark'],c:[['#ffe84a','#ffffff','#ffffff'],['#ffffff','#ffe84a','#ffffff']],mv:'zap',idle:3.5,atk:10,trail:26,fl:1},
  ghost:{sh:['wisp','wisp','spark'],c:[['#7aff9a','#2a8a4a','#e0ffe8']],mv:'float',idle:3,atk:7,trail:18,al:0.85},
  prism:{sh:['spark','star'],c:[['#ff5a5a','#ffffff','#ffffff'],['#ffd35a','#ffffff','#ffffff'],['#5aff8a','#ffffff','#ffffff'],['#5ad8ff','#ffffff','#ffffff'],['#c77ad8','#ffffff','#ffffff']],mv:'float',idle:4,atk:10,trail:26},
  paper:{sh:['conf','conf','spark'],c:[['#ffffff','#d8d0c0'],['#ff9ad0','#ffffff'],['#8fd0ff','#ffffff'],['#ffe84a','#ffffff']],mv:'drift',idle:2.5,atk:8,trail:18},
  dust:{sh:['puff','puff','spark'],c:[['#e8e0d0','#b8a890','#ffffff']],mv:'drift',idle:2.5,atk:8,trail:16,al:0.8},
  banana:{sh:['spark','star'],c:[['#ffe84a','#ffd35a','#ffffff']],mv:'float',idle:3,atk:8,trail:20}};
const SKIN_FX={katana:'petal',tuna:'frost',pan:'steam',leek:'leaf',umbrella:'rain',baguette:'steam',broom:'witch',lollipop:'candy',catpaw:'heart',starwand:'star',heartbow:'heart',watergun:'rain',
  lampsword:'flame',lampbow:'flame',lampstaff:'flame',lampgun:'flame',tteok:'steam',friedbow:'steam',hotdog:'steam',bungeo:'steam',bmblade:'moon',bmbow:'moon',bmstaff:'moon',bmgun:'moon',
  bonesword:'bone',bonebow:'bone',bonestaff:'bone',bonegun:'bone',icesword:'frost',icebow:'frost',icestaff:'frost',icegun:'frost',clocksword:'gear',clockbow:'gear',clockstaff:'gear',clockgun:'gear',
  angelsword:'holy',angelbow:'holy',angelstaff:'holy',angelgun:'holy',pencil:'paper',rubberbow:'paper',pen:'paper',tapegun:'paper',cottoncandy:'candy',bananabow:'banana',carousel:'candy',bubblegun:'bubble',
  duster:'dust',brushbow:'dust',plunger:'bubble',spraygun:'bubble',guitar:'music',rosebow:'rose',boltumb:'bolt',crystalgun:'prism',lavabread:'lava',ghostlamp:'ghost',
  holysword:'holy',wingbow:'holy',haloscepter:'holy',holypistol:'holy'};
const WFX_CC=new Map();
function wfxShape(sh,cs){const key=sh+'|'+cs.join(',');let c=WFX_CC.get(key);if(c)return c;const rows=WFX_SH[sh];const w=rows[0].length,h=rows.length;const[cv,x]=mk(w,h);
  for(let j=0;j<h;j++)for(let i=0;i<w;i++){const ch=rows[j][i];if(ch==='.')continue;x.fillStyle=cs[(+ch-1)%cs.length]||cs[0];x.fillRect(i,j,1,1);}WFX_CC.set(key,cv);return cv;}
function wfxSpawn(th,x,y,o){if(WFX.length>520)return;const T=WFX_TH[th];o=o||{};const sh=o.sh||pick(T.sh);const cs=pick(T.c);const mv=T.mv;let vx=rf(-5,5),vy=0,g=0;
  if(mv==='drift'){vy=rf(3,9);}else if(mv==='float'){vy=rf(-14,-6);}else if(mv==='rise'){vy=rf(-24,-12);vx=rf(-3,3);}else if(mv==='fall'){vy=rf(2,10);g=70;}else if(mv==='zap'){vx=rf(-14,14);vy=rf(-14,6);}
  if(o.burst){const a=o.a!=null?o.a+rf(-0.5,0.5):R()*Math.PI*2,sp=rf(22,52)*(o.k||1);vx+=Math.cos(a)*sp;vy+=Math.sin(a)*sp;}
  const life=o.life||rf(0.6,1.2)*(mv==='rise'?0.8:1);WFX.push({x,y,vx,vy,g,life,max:life,cv:wfxShape(sh,cs),sw:rf(0,6.3),sa:mv==='drift'?rf(4,9):mv==='float'?rf(2,5):0,dr:o.burst?3.2:0,fl:!!T.fl,al:T.al||1,spin:T.spin&&sh==='gear'});}
function wfxDraw(icx,icy){const now=time,dt=Math.max(0,Math.min(0.05,now-(WFX.t||now)));WFX.t=now;
  for(let i=WFX.length-1;i>=0;i--){const p=WFX[i];p.life-=dt;if(p.life<=0){WFX.splice(i,1);continue;}if(p.dr){const k=Math.max(0,1-p.dr*dt);p.vx*=k;p.vy=p.vy*k+(1-k)*(p.g?p.vy:0);}p.vy+=p.g*dt;p.x+=(p.vx+Math.sin(now*3+p.sw)*p.sa)*dt;p.y+=p.vy*dt;
    const q=p.life/p.max;let a=(q<0.4?q/0.4:1)*p.al;if(p.fl)a*=0.65+0.35*Math.sin(now*30+p.sw*7);wx.globalAlpha=Math.max(0,Math.min(1,a));const w=p.cv.width,h=p.cv.height;
    if(p.spin){wx.save();wx.translate(Math.round(p.x-icx),Math.round(p.y-icy));wx.rotate(Math.round(now*6)%4*Math.PI/4);wx.drawImage(p.cv,-(w>>1),-(h>>1));wx.restore();}else wx.drawImage(p.cv,Math.round(p.x-icx-(w>>1)),Math.round(p.y-icy-(h>>1)));}
  wx.globalAlpha=1;}
// 무기 끝 위치(화면 좌표)를 받아 그 무기 외형의 이펙트를 뿜음. a: 공격 방향(총)
function skinFx(src,sk,tx,ty,o){const th=SKIN_FX[sk];if(!th)return;const T=WFX_TH[th];const now=time,dt=Math.max(0,Math.min(0.05,now-(src._fxT||now)));src._fxT=now;o=o||{};
  const wx0=tx+WFX_IC[0],wy0=ty+WFX_IC[1];const atk=src.atkAnim>0;
  const shot=o.gun&&src.gunT&&src.gunT!==src._fxG;if(o.gun)src._fxG=src.gunT;
  if((atk&&!src._fxA&&!o.gun)||shot){const n=T.atk;for(let i=0;i<n;i++)wfxSpawn(th,wx0+rf(-2,2),wy0+rf(-2,2),{burst:1,a:o.gun?o.a:null,k:o.gun?1.1:1});}
  src._fxA=atk;
  if(atk&&!o.gun){if(R()<T.trail*dt)wfxSpawn(th,wx0+rf(-1,1),wy0+rf(-1,1));}
  else if(R()<T.idle*dt){const sx=o.spread||2;wfxSpawn(th,wx0+rf(-sx,sx),wy0+rf(-sx,sx));}}
/* ===== 탈것 · 전설 외형 · 발자국 (전부 코드로 그림) ===== */
function fr_(x,y,w,h,c){wx.fillStyle=c;wx.fillRect(x,y,w,h);}
function mountLift(k,t,mv){t=t||0;if(k==='duck')return 1+Math.round(Math.sin(t*4)*0.8);if(k==='broom')return 7+Math.round(Math.sin(t*3)*1.2);if(k==='cloud')return 6+Math.round(Math.sin(t*2.5)*1);if(k==='carpet')return 6+Math.round(Math.sin(t*3.5)*0.8);if(k==='skate')return 3;return 0;}
// layer 0: 캐릭터 뒤 · 1: 앞  (by = 들어 올린 뒤의 발 기준선)
function drawMount(k,bx,by,f,t,mv,layer){t=t||0;const fy=by+2;
  if(k==='duck'){const K='#3a2408',Y='#ffd35a',S='#e0a828',Wt='#fff3b0';const cy=fy-4;
    if(layer===0){fr_(bx-7,cy-2,14,1,K);fr_(bx-6,cy-1,12,1,S);return;}
    fr_(bx-8,cy-1,1,4,K);fr_(bx+7,cy-1,1,4,K);fr_(bx-7,cy,14,3,Y);fr_(bx-7,cy+3,14,1,K);fr_(bx-5,cy,3,1,Wt);fr_(bx-7,cy+2,14,1,S);
    const hx=bx+f*7;fr_(hx-2,cy-5,5,5,K);fr_(hx-1,cy-4,3,4,Y);fr_(hx+(f>0?2:-3),cy-3,2,1,'#ff8a1f');fr_(hx+(f>0?1:-1),cy-4,1,1,K);
    if(mv&&((t*6|0)%2))fr_(bx-f*9,fy-1,2,1,'#bfe3ff');return;}
  if(k==='broom'){if(layer===0)return;const K='#2a1608',B='#9a6232',L='#c8884a',G='#e8c060',G2='#c09030';const x0=bx-f*10,x1=bx+f*8;
    for(let x=Math.min(x0,x1);x<=Math.max(x0,x1);x++){fr_(x,fy,1,1,B);fr_(x,fy-1,1,1,K);fr_(x,fy+1,1,1,K);}fr_(Math.min(x0,x1),fy,1,1,K);fr_(Math.max(x0,x1),fy,1,1,K);fr_(bx,fy,3,1,L);
    const sxb=x0-f*1;for(let i=0;i<5;i++){const xx=sxb-f*i;const h=2+Math.min(i,3);fr_(xx,fy-h+1,1,h*2-1,i%2?G:G2);}fr_(x0,fy-2,1,5,'#c0283a');
    if(mv&&R()<0.3)part(bx-f*16+icxW(),fy+icyW()+rf(-2,2),-f*rf(8,16),rf(-4,4),pick(['y','w']),0.4,{glow:true});return;}
  if(k==='cloud'){if(layer===0)return;const W1='#f6f8ff',W2='#d6dcf2',K='#6a7090';const pts=[[-7,1,3],[-3,0,4],[2,0,4],[6,1,3],[0,2,4]];
    for(const[dx,dy,r]of pts){wx.fillStyle=K;wx.beginPath();wx.arc(bx+dx,fy+dy,r+1,0,Math.PI*2);wx.fill();}
    for(const[dx,dy,r]of pts){wx.fillStyle=W2;wx.beginPath();wx.arc(bx+dx,fy+dy,r,0,Math.PI*2);wx.fill();}
    for(const[dx,dy,r]of pts){wx.fillStyle=W1;wx.beginPath();wx.arc(bx+dx,fy+dy-1,r-1,0,Math.PI*2);wx.fill();}return;}
  if(k==='carpet'){if(layer===0)return;const K='#3a0a14',R1='#c0283a',R2='#8a1428',Y='#ffd35a';
    for(let i=-9;i<=9;i++){const yy=fy+Math.round(Math.sin(i*0.55-t*8)*0.9);fr_(bx+i,yy-1,1,1,K);fr_(bx+i,yy,1,2,(i+9)%4<2?R1:R2);fr_(bx+i,yy+2,1,1,K);if(i%3===0)fr_(bx+i,yy,1,1,Y);
      if(i===-9||i===9){fr_(bx+i+(i<0?-1:1),yy,1,1,Y);fr_(bx+i+(i<0?-2:2),yy+1,1,1,Y);}}return;}
  if(k==='skate'){if(layer===0)return;const K='#1a1220',D='#4a2a6a',P2='#9a5ae0',Wh='#e6dcc3';fr_(bx-7,fy,15,1,K);fr_(bx-6,fy-1,13,1,P2);fr_(bx-8,fy-2,1,1,K);fr_(bx+8,fy-2,1,1,K);fr_(bx-7,fy-1,1,1,D);fr_(bx+7,fy-1,1,1,D);
    const sp=mv?(t*12|0)%2:0;for(const dx of[-4,4]){fr_(bx+dx-1,fy+1,3,2,K);fr_(bx+dx,fy+1,1,1,sp?'#9e937a':Wh);}return;}}
// 탈것 그리기 중 파티클 좌표 보정 (화면 → 월드)
let _icx=0,_icy=0;function icxW(){return _icx;}function icyW(){return _icy;}
// 전설 외형: 프레임 그림을 효과에 맞게 다시 칠한 캐시
const LGC=new WeakMap();
function lgBase(c,k){let m=LGC.get(c);if(!m){m={};LGC.set(c,m);}if(m[k])return m[k];const w=c.width,h=c.height;const src=c.getContext('2d').getImageData(0,0,w,h);const d=src.data;
  const [o,ox]=mk(w,h);const out=ox.createImageData(w,h);const q=out.data;const A=(x,y)=>x>=0&&y>=0&&x<w&&y<h&&d[(y*w+x)*4+3]>0;const pts=[];
  const hex=s=>[parseInt(s.slice(1,3),16),parseInt(s.slice(3,5),16),parseInt(s.slice(5,7),16)];
  const RAMP={shadow:['#0a0610','#140c20','#1e1230'],stars:['#0c1040','#141a5a','#1e2a78'],ember:['#1a0e0a','#2e1a12','#46281a'],gold:['#5a3a08','#a8740e','#e0a828','#ffd35a','#fff3b0'],ghost:['#4a7aa8','#7fb4dc','#bfe3ff','#eef8ff']}[k]||['#888'];
  const RIM={shadow:'#7a3ab8',stars:'#8fd0ff',ember:'#ff8a1f'}[k];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;if(!d[i+3])continue;const L=(d[i]*0.3+d[i+1]*0.59+d[i+2]*0.11)/255;let col;
    const edge=!A(x-1,y)||!A(x+1,y)||!A(x,y-1)||!A(x,y+1);
    if(k==='glitch'){q[i]=d[i];q[i+1]=d[i+1];q[i+2]=d[i+2];q[i+3]=255;continue;}
    if(RIM&&edge)col=hex(RIM);else col=hex(RAMP[Math.min(RAMP.length-1,Math.floor(L*RAMP.length*1.15))]);
    q[i]=col[0];q[i+1]=col[1];q[i+2]=col[2];q[i+3]=k==='ghost'?Math.round(255*Math.min(1,0.75*Math.min(1,(h-1-y)/7+0.25))):255;if(!edge&&((x*7+y*13)%11===0))pts.push([x,y]);}
  ox.putImageData(out,0,0);
  // 그림자 군주: 얼굴 앞쪽에 보라 눈 (얼굴 방향은 그리기 때 판단)
  let top=h,xl=w,xr=-1;for(let y=0;y<h&&top===h;y++)for(let x=0;x<w;x++)if(A(x,y)){top=y;break;}
  const ey=Math.min(h-1,top+4);for(let x=0;x<w;x++)if(A(x,ey)){if(x<xl)xl=x;if(x>xr)xr=x;}
  // 글리치용 빨강·청록 판
  let rC=null,cC=null;if(k==='glitch'){const mkT=(r,g,b)=>{const [t,tx]=mk(w,h);const im=tx.createImageData(w,h);for(let i=0;i<d.length;i+=4)if(d[i+3]){im.data[i]=r;im.data[i+1]=g;im.data[i+2]=b;im.data[i+3]=150;}tx.putImageData(im,0,0);return t;};rC=mkT(255,40,80);cC=mkT(40,230,255);}
  // 황금: 흰 실루엣 (빛줄기용)
  let wC=null;if(k==='gold'){const [t,tx]=mk(w,h);const im=tx.createImageData(w,h);for(let i=0;i<d.length;i+=4)if(d[i+3]){im.data[i]=255;im.data[i+1]=255;im.data[i+2]=240;im.data[i+3]=255;}tx.putImageData(im,0,0);wC=t;}
  return m[k]={c:o,pts,ey,xl,xr,rC,cC,wC,w,h};}
const LG_TMP=mk(48,32);
function drawLegend(k,s,sx,sy,f,mv,wxp,wyp,pv){const B=lgBase(s.c,k);const ks=s.ks||1,kh=s.kh||1;const dw=Math.round(s.w*ks),dh=Math.round(s.h*kh);const DX=sx,DY=sy+(s.h-dh);
  const put=(c,x,y,a)=>{if(a!=null){const ga=wx.globalAlpha;wx.globalAlpha=ga*a;wx.drawImage(c,x,y,dw,dh);wx.globalAlpha=ga;}else wx.drawImage(c,x,y,dw,dh);};
  if(k==='shadow'){if(mv){put(B.c,DX-f*6,DY,0.18);put(B.c,DX-f*3,DY,0.32);}put(B.c,DX,DY);const ex=f>0?B.xr-2:B.xl+2;if(B.xr>=0){fr_(DX+ex,DY+B.ey,1,1,'#d080ff');fr_(DX+ex-f*2,DY+B.ey,1,1,'#d080ff');if(R()<0.1&&!pv)part(wxp+rf(-5,5),wyp-rf(2,16),rf(-3,3),rf(-14,-6),'#7a3ab8',0.6,{});}return;}
  if(k==='stars'){put(B.c,DX,DY);B.pts.forEach(([x,y],i)=>{const v=Math.sin(time*3+i*1.7);if(v>0.3)fr_(DX+x,DY+y,1,1,v>0.85?'#ffffff':i%3?'#ffe9a0':'#bfe3ff');});return;}
  if(k==='ember'){put(B.c,DX,DY);const g=0.5+0.5*Math.sin(time*9);if(g>0.6)B.pts.forEach(([x,y],i)=>{if(i%3===0)fr_(DX+x,DY+y,1,1,'#ff6a1a');});if(!pv&&R()<(mv?0.5:0.3))part(wxp+rf(-5,5),wyp-rf(0,14),rf(-4,4),rf(-26,-12),pick(['o','y','r']),rf(0.4,0.8),{glow:true});return;}
  if(k==='ghost'){put(B.c,DX,DY,0.85);if(!pv&&R()<0.08)part(wxp+rf(-6,6),wyp-rf(0,10),0,rf(-10,-4),'#bfe3ff',0.8,{glow:true});return;}
  if(k==='glitch'){const ph=time%1.7;const burst=ph<0.14;put(B.rC,DX-1-(burst?1:0),DY,0.7);put(B.cC,DX+1+(burst?1:0),DY,0.7);
    if(burst){const n=Math.max(2,dh>>2);for(let j=0;j<4;j++){const y0=(j*n+((time*40)|0))%dh;const off=((j+((time*30)|0))%3-1)*2;wx.drawImage(B.c,0,y0,B.w,n,DX+off,DY+y0,dw,n);}}else put(B.c,DX,DY);return;}
  if(k==='gold'){put(B.c,DX,DY);const T=(time*0.6)%1.6;if(T<1){const [tc,tx]=LG_TMP;tx.clearRect(0,0,48,32);tx.globalCompositeOperation='source-over';tx.drawImage(B.wC,0,0,dw,dh);tx.globalCompositeOperation='destination-in';tx.fillStyle='#fff';const bxp=-8+T*(dw+16);tx.beginPath();tx.moveTo(bxp,0);tx.lineTo(bxp+4,0);tx.lineTo(bxp+4-10,dh);tx.lineTo(bxp-10,dh);tx.closePath();tx.fill();tx.globalCompositeOperation='source-over';const ga=wx.globalAlpha;wx.globalAlpha=ga*0.75;wx.drawImage(tc,0,0,dw,dh,DX,DY,dw,dh);wx.globalAlpha=ga;}
    if(!pv&&R()<0.06)part(wxp+rf(-6,6),wyp-rf(2,18),0,rf(-6,-2),'#fff3b0',0.5,{glow:true});return;}
  put(B.c,DX,DY);}
// 발자국
const FPM=[],FPL=new Map();
function fpTrack(id,x,y,k,moving){if(!k||!SH.FOOTS[k]){FPL.delete(id);return;}const L=FPL.get(id);if(!L){FPL.set(id,{x,y,n:0});return;}const dx=x-L.x,dy=y-L.y;if(dx*dx+dy*dy<49)return;L.n++;const side=L.n%2?1:-1;const a=Math.atan2(dy,dx);
  FPM.push({k,x:Math.round(x+Math.cos(a+Math.PI/2)*side*2),y:Math.round(y+Math.sin(a+Math.PI/2)*side*2),t:time,s:L.n});L.x=x;L.y=y;if(FPM.length>260)FPM.splice(0,FPM.length-260);}
function fpStamp(k,x,y,age,sd,a){const life=k==='ember'?0.9:1.6;if(age>life)return false;const fade=1-age/life;wx.globalAlpha=Math.max(0,Math.min(1,fade*1.3))*a;
  if(k==='petal'){const c=sd%2?'#ffb0d0':'#ff8ac0';fr_(x,y,2,1,c);fr_(x+1,y-1,1,1,'#ffd0e4');}
  else if(k==='snow'){fr_(x,y-1,1,3,'#eef8ff');fr_(x-1,y,3,1,'#eef8ff');fr_(x,y,1,1,'#bfe3ff');}
  else if(k==='note'){const yy=y-Math.round(age*6);const c=sd%2?'#ffd35a':'#8fd0ff';fr_(x+1,yy-4,1,4,c);fr_(x+2,yy-4,1,1,c);fr_(x+3,yy-3,1,1,c);fr_(x-1,yy-1,3,2,c);}
  else if(k==='ember'){const yy=y-Math.round(age*5);fr_(x,yy,1,1,age<0.3?'#ffd35a':'#ff8a1f');if(age<0.5)fr_(x+1,yy+1,1,1,'#c0283a');}
  else if(k==='heart'){fr_(x-1,y-1,1,1,'#ff5a8a');fr_(x+1,y-1,1,1,'#ff5a8a');fr_(x-1,y,3,1,'#ff5a8a');fr_(x,y+1,1,1,'#ff5a8a');fr_(x-1,y-1,1,1,'#ff9ab8');}
  else if(k==='star'){const c=(time*8+sd|0)%2?'#ffd35a':'#fff3b0';fr_(x,y-1,1,3,c);fr_(x-1,y,3,1,c);}
  else if(k==='paw'){const c='#f0d8c8';fr_(x-1,y,3,2,c);fr_(x-2,y-2,1,1,c);fr_(x,y-3,1,1,c);fr_(x+2,y-2,1,1,c);fr_(x,y,1,1,'#ff9ab8');}
  else if(k==='drop'){const r=1+Math.floor(age*2.5);wx.strokeStyle='#8fd0ff';wx.lineWidth=1;wx.beginPath();wx.ellipse(x+0.5,y+0.5,r+1,r*0.5+0.5,0,0,Math.PI*2);wx.stroke();if(age<0.4)fr_(x,y-1,1,1,'#eef8ff');}
  wx.globalAlpha=1;return true;}
function drawFoots(icx,icy){for(const p of G.players.values()){const isMe=p.id===myId;const look=isMe?lookOfMe():(p.look||{});const x=isMe?me.x:p.dx,y=isMe?me.y:p.dy;if(p.downed){continue;}fpTrack(p.id,x,y,look.fp,isMe?me.moving:p.moving);}
  for(let i=FPM.length-1;i>=0;i--){const m=FPM[i];if(!fpStamp(m.k,m.x-icx,m.y-icy,time-m.t,m.s,1))FPM.splice(i,1);}}
// 외형 창 아이콘 (20칸 안)
function drawMountIcon(k,cx,cy){drawMount(k,cx,cy+2,1,time,false,0);drawMount(k,cx,cy+2,1,time,false,1);}
function drawShield(bx,by,face,front,ar){if(front!==(face>0))return;if(SPR.ready)by-=2;ar=ar|0;const x=bx+(face>0?4:-8),y=by-9;const big=ar>=2;const w=big?5:4,h=big?7:6;wx.fillStyle=PAL.k;wx.fillRect(x-1,y-1,w+2,h+2);wx.fillStyle=PAL[['C','C','n','R'][ar]];wx.fillRect(x,y,w,h);wx.fillStyle=PAL[['y','c','y','o'][ar]];wx.fillRect(x+1,y+1,w-2,h-2);wx.fillStyle=PAL[['n','n','C','r'][ar]];wx.fillRect(x+Math.floor(w/2),y+1,1,h-2);if(ar===3&&((time*6|0)%2))wpx(x+Math.floor(w/2),y+2,'w');}
function drawCape(bx,by,face,ar,moving,animT){const c1=ar===3?'r':'R',c2=ar===3?'o':'y';const dir=face>0?-1:1;const sway=moving?Math.round(Math.sin(animT*12)*1):0;
  for(let j=0;j<9;j++){const w=2+Math.floor(j/3);const x0=bx+dir*(3+Math.floor(j/4))+sway*(j>5?1:0);for(let i=0;i<w;i++){const x=x0+(dir>0?i:-i);wpx(x,by-11+j,j===8||i===w-1?c2:c1);}}}
// 동작 그림을 쓸 때: 무기는 그림에 있으니 휘두르는 궤적만 그린다
// 맨손 캐릭터 + 장착 무기 그림
function drawHeldGear(cls,src,s,sx,sy,e,look){const fam=CLASSES[cls].fam;const kind=look.w||(fam==='melee'?'sword':fam==='bow'?'shortbow':'staff');const rar=Math.max(0,look.wr|0);
  const skin=skinOk(look.sk,cls)?look.sk:null;const ws=skin?skinSprite(skin,rar):weapSprite(kind,rar,look.wid);const f=e.face;const ks=s.ks||1,kh=s.kh||1;let ax=sx+Math.round(s.hx*ks+(s.w-s.w*ks)/2),ay=sy+Math.round(s.hy*kh+s.h*(1-kh));
  if(fam!=='gun'){ax+=f>0?3:-3;ay+=2;}/* 무기를 얼굴에서 떼어 몸 바깥·아래쪽으로 쥠 */
  if(fam==='gun'){drawGunHeld(cls,src,0,0,f,GUN_TPL[kind]?kind:'rifle',rar,look,{x:ax,y:ay});return;}
  const atk=src.atkAnim>0,prog=atk?1-src.atkAnim/src.atkDur:0,bob=e.moving?Math.sin(src.animT*10)*0.12:0;let ang;
  if(src.spin>0)ang=(1-src.spin/0.3)*Math.PI*2.4;
  else if(fam==='melee'){ang=atk&&src.atkKind==='swing'?-1.3+prog*3.1:atk?1.35:0.78+bob;}
  else if(kind==='crossbow'){ang=0;}
  else if(fam==='bow'){ang=atk?0:0.3+bob*0.5;}
  else{ang=atk?0.95:0.3+bob*0.5;}
  if(cls==='guardian'&&look.sh!==0){const shW=weapSprite('shield',Math.max(0,look.ar|0),'s'+(look.ar|0));const scx=sx+(f>0?Math.round(s.w/2)+5:Math.round(s.w/2)-5),scy=sy+s.h-7;
    drawHeld(ws,ax,ay,ang,f,rar,time,skin?'skin':kind);if(shW)drawHeld(shW,atk?ax+(f>0?3:-3):scx,atk?ay+1:scy,0,f,Math.max(0,look.ar|0),time+1,'shield');}
  else drawHeld(ws,ax,ay,ang,f,rar,time,skin?'skin':kind);
  if(skin&&ws&&SKIN_FX[skin]){const sc=W_SCALE.skin||1,bw=fam==='bow';const lx=bw?rf(ws.x0,ws.x1+1)-ws.px:(ws.x0+ws.x1+1)/2-ws.px,ly=bw?rf(ws.y0,ws.py*2-ws.y0)-ws.py:ws.y0+1-ws.py;const ca=Math.cos(ang),sa=Math.sin(ang);
    skinFx(src,skin,ax+f*sc*(lx*ca-ly*sa),ay+sc*(lx*sa+ly*ca),{spread:bw?1:2});}
  if(rar===3&&ws&&R()<0.5){const L=ws.h*0.7,aa=ang*(f<0?-1:1);part(ax+Math.sin(aa)*rf(2,L)*(f<0?-1:1)+ (0),ay-Math.cos(aa)*rf(2,L),rf(-6,6),rf(-6,6),pick(['o','y','w','r']),rf(.3,.6),{z:0,glow:true});}
  else if(rar===2&&ws&&R()<0.12)part(ax+rf(-2,2),ay-rf(2,ws.h*0.8),0,rf(-8,-3),'y',0.4,{glow:true});
  if(fam==='melee'&&atk&&src.atkKind==='swing'&&prog>0.25&&prog<0.85){const L=(ws?ws.h:12)-2;wx.globalAlpha=0.45;for(let k=0;k<8;k++){const aa=-1.3+(prog-k*0.035)*3.1;const px=ax+Math.sin(aa)*L*f,py=ay-Math.cos(aa)*L;wpx(Math.round(px),Math.round(py),rar===3?'o':rar===2?'y':k<3?'w':'s');}wx.globalAlpha=1;}}
function weaponTrail(cls,src,bx,by,f){const fam=CLASSES[cls].fam;if(!(src.atkAnim>0))return;const prog=1-src.atkAnim/src.atkDur;
  if(fam==='melee'&&src.atkKind==='swing'){if(prog<0.25||prog>0.85)return;const hx=bx+(f>0?4:-5),hy=by-8,len=11;wx.globalAlpha=0.55;for(let k=0;k<9;k++){const aa=src.atkAngle+f*(-1.7+prog*3.4)-(f>0?1:-1)*k*0.13;wpx(Math.round(hx+Math.cos(aa)*len),Math.round(hy+Math.sin(aa)*len),k<3?'w':'s');}wx.globalAlpha=1;}
  else if(fam==='staff'&&prog>0.3){const tx=bx+(f>0?12:-12),ty=by-12;for(let n=0;n<3;n++)wpx(tx+ri(-2,2),ty+ri(-2,2),cls==='priest'?'y':'p');}}
function drawWeapon(cls,src,bx,by,f,wItem,look){if(SPR.ready)by-=3;const fam=CLASSES[cls].fam;const kind=wItem?wItem.kind:look&&look.w?look.w:(fam==='melee'?'sword':fam==='bow'?'shortbow':fam==='gun'?'rifle':'staff');const wr=Math.max(0,(look&&look.wr)|0);const BL=['s','c','y','o'],BL2=['S','C','g','r'];
  if(fam==='gun'){drawGunHeld(cls,src,bx,by+(SPR.ready?3:0),f,GUN_TPL[kind]?kind:'rifle',wr,look);return;}
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
function drawMonster(m,icx,icy){if(m.fl&512)return;if(m.type==='dummy'){drawDummy(m,icx,icy);return;}if(m.type==='goblin'){drawGoblin(m,icx,icy);return;}if(m.type==='shadow'){drawShadowClone(m,icx,icy);return;}const fr=themedMonsterFrames(m.type,G.floor);const boss=isBossTc(m.tc)||m.tc===7;const wd=WIND_DUR[m.wc]||0.35;
  const e={atkAnim:m.atkT>0?m.atkT:0,atkDur:m.atkT>0?Math.max(m.atkT,wd):1,moving:!!(m.fl&(64|32)),animT:m.animT,face:m.face,fast:!!(m.fl&32)};let s=pickFrame(e,fr);const cp=(G.cscn||G.clashW)&&isBossTc(m.tc)&&fr.atk?cscnPose(m):null;if(cp){const f0=cp.fr==='wind'?fr.atk[1]:fr.idle[0];s=(m.face<0?f0.l:f0.r);}m._s=s;if(isBossTc(m.tc))G.lastBoss={id:m.id,s,x:m.dx,y:m.dy};
  const bx=Math.round(m.dx)-icx,by=Math.round(m.dy)-icy;const sh=boss?SH_B:SH_S;if(!(m.fl&1024))wx.drawImage(sh,bx-(sh.width>>1),by-(sh.height>>1)+1);
  let sx=bx-(s.w>>1)+(s.dx||0),sy=by-s.h+2+(s.dy||0);if(cp){sx+=cp.dx;sy+=cp.dy;}if(m.wc===3)sx+=(Math.floor(time*30)&1)?1:-1;if(m.wc===5)sy+=(Math.floor(time*20)&1);
  if(m.kt&&time-m.kt<0.12){const q=1-(time-m.kt)/0.12;sx+=Math.round((m.kx||0)*q*(boss?0.5:1));sy+=Math.round((m.ky||0)*q*(boss?0.5:1));}else if(m.flash>0&&s.ai)sx-=(m.face||1)*(boss?1:2);
  if(boss&&m.type!=='shadow')drawHeadBack(m,s,bx,by);
  blitS(m.flash>0||(cp&&cp.wf)?s.fc:s.c,s,sx,sy,boss?0:m.flash);drawCtrGlow(m,s,sx,sy,bx,by);if(cp&&cp.glow>0){const f=m.face<0?-1:1;wglow(bx+f*20+cp.dx,by-40,10+cp.glow*10,'#c9a0e8',0.5*cp.glow);if(R()<cp.glow*0.8)part(m.dx+f*rf(14,26),m.dy,rf(-10,10),0,pick(['p','w']),0.35,{z:rf(34,46),vz:rf(-20,20),glow:true});}
  if((m.fl&1)&&m.flash<=0){wx.globalAlpha=0.35;wx.drawImage(s.fc,sx,sy);wx.globalAlpha=1;}
  drawEliteFx(m,bx,by,s);
  if(m.fl&128){wx.globalAlpha=0.45;for(let n=0;n<40;n++){const t=n/40*Math.PI*2+time;if(n%2)wpx(Math.round(bx+Math.cos(t)*(s.w/2+2)),Math.round(by-s.h/2+Math.sin(t)*(s.h/2+2)),'c');}wx.globalAlpha=1;}
  if(m.fl&256&&R()<0.3)part(m.dx+rf(-8,8),m.dy,0,0,'y',0.4,{z:rf(4,24),vz:20,glow:true});
  if(m.fl&4){for(let n=0;n<3;n++){const t=time*5+n*2.1;wpx(Math.round(bx+Math.cos(t)*5),Math.round(sy-2+Math.sin(t)*1.5),'y');}}}
function drawMerchant(icx,icy){const m=G.map.merchant;const bx=Math.round(m.x)-icx,by=Math.round(m.y)-icy;wx.drawImage(SH_S,bx-6,by-1);const bob=(time*2|0)%2;if(SPR.ready){wx.drawImage(SPR.heroes[20].r.c,bx-12,by-22+bob);return;}wx.drawImage(MERCHANT.c,bx-8,by-14+bob);
  const lx0=bx+6,ly0=by-10+bob;wx.fillStyle=PAL.k;wx.fillRect(lx0-1,ly0-1,4,5);wx.fillStyle=((time*6)|0)%3?PAL.y:PAL.o;wx.fillRect(lx0,ly0,2,3);}
function drawPortal(icx,icy,glow){const p=G.map.portal;const cx=Math.round(p.x)-icx,cy=Math.round(p.y)-icy;
  if(!glow){for(let j=-14;j<=6;j++)for(let i=-12;i<=12;i++){const d=Math.hypot(i,(j+4)*0.9);if(d<=12&&d>10)wpx(cx+i,cy+j,((i+j)&1)?'S':'m');}
    for(let j=-12;j<=4;j++)for(let i=-10;i<=10;i++){const d=Math.hypot(i,(j+4)*0.9);if(d<=10)wpx(cx+i,cy+j,'k');}return;}
  for(let n=0;n<60;n++){const t=n/60*Math.PI*2+time*(n%2?2:-1.4);const r=3+((n*7)%8)+Math.sin(time*3+n)*0.8;wpx(Math.round(cx+Math.cos(t)*r),Math.round(cy-4+Math.sin(t)*r*0.9),n%3===0?'e':n%3===1?'p':'r');}
  wpx(cx,cy-4,'w');}
function drawDrop(d,icx,icy){let x=d.x,y=d.y,z=0;if(d.t<0.45){const k=d.t/0.45;x=d.sx+(d.x-d.sx)*k;y=d.sy+(d.y-d.sy)*k;z=Math.sin(k*Math.PI)*16;}
  const sx=Math.round(x)-icx,sy=Math.round(y-z)-icy;if(sx<-20||sy<-20||sx>W+20||sy>H+20)return;
  if(d.kind==='gold')wx.drawImage(GOLD,sx-4,sy-4);else if(d.kind==='hp')wx.drawImage(POT_HP,sx-8,sy-8);else if(d.kind==='mp')wx.drawImage(POT_MP,sx-8,sy-8);else if(d.kind==='gem'){wx.drawImage(gemIcon(d.g),sx-8,sy-10);if(R()<0.05)part(d.x+rf(-3,3),d.y-3,0,0,'w',0.3,{z:rf(2,8),vz:10,glow:true});}else wx.drawImage(iconFor(d.it),sx-8,sy-13);}
function itemCol(it){return it&&it.set?'#4ad86a':RAR[it.rar].c;}
const RAR=[{n:'일반',c:'#e6dcc3',bg:'#241e2b'},{n:'마법',c:'#7aa2ff',bg:'#1c2440'},{n:'희귀',c:'#ffd35a',bg:'#3a3016'},{n:'전설',c:'#ff8a1f',bg:'#40220c'},{n:'신화',c:'#ff3a5a',bg:'#3a0c18'}];
function drawBeam(d,icx,icy){if(d.kind!=='item'||d.it.rar<1||d.t<0.45)return;const hgt=[0,16,34,56][d.it.rar];const sx=Math.round(d.x)-icx,sy=Math.round(d.y)-icy;if(sx<-5||sx>W+5||sy<-5||sy>H+hgt)return;
  const pulse=0.7+0.3*Math.sin(time*4+d.x);wx.fillStyle=itemCol(d.it);wx.globalAlpha=0.2*pulse;wx.fillRect(sx-1,sy-hgt,3,hgt);wx.globalAlpha=0.6*pulse;for(let yy=(time*20|0)%2;yy<hgt;yy+=2)wx.fillRect(sx,sy-yy,1,1);wx.globalAlpha=1;}
function drawProj(p,icx,icy,glow){const sx=Math.round(p.dx)-icx,sy=Math.round(p.dy-p.h)-icy;if(GUN_PROJ[p.type]){if(!glow&&p.type!=='shell')return;if(!glow){wx.fillStyle='rgba(0,0,0,0.4)';wx.fillRect(Math.round(p.dx)-icx-1,Math.round(p.dy)-icy,3,1);}drawGunProj(p,sx,sy,glow);return;}
  if(!glow){wx.fillStyle='rgba(0,0,0,0.4)';wx.fillRect(Math.round(p.dx)-icx-1,Math.round(p.dy)-icy,3,1);}
  if(p.type==='web'){if(glow)return;for(let i=-2;i<=2;i++){wpx(sx+i,sy,'w');wpx(sx,sy+i,'w');}wpx(sx-1,sy-1,'W');wpx(sx+1,sy+1,'W');wpx(sx+1,sy-1,'W');wpx(sx-1,sy+1,'W');return;}
  if(p.type==='page'){if(glow)return;const f=(time*12|0)%2;wx.fillStyle=PAL.k;wx.fillRect(sx-3,sy-2,7,5);wx.fillStyle=PAL.w;wx.fillRect(sx-2,sy-1,f?5:3,3);wpx(sx,sy,'P');return;}
  if(p.type==='void'){if(!glow)return;const r=p.id%3===0?4:3;wx.fillStyle=PAL.P;wx.fillRect(sx-r,sy-r+1,r*2+1,r*2-1);wx.fillRect(sx-r+1,sy-r,r*2-1,r*2+1);wx.fillStyle=PAL.k;wx.fillRect(sx-r+2,sy-r+2,r*2-3,r*2-3);return;}
  if(p.type==='ice'){if(!glow)return;const l=Math.hypot(p.vx,p.vy)||1,ux=p.vx/l,uy=p.vy/l;for(let i=0;i<6;i++){wpx(Math.round(sx-ux*i),Math.round(sy-uy*i),i<2?'w':'c');}return;}
  if(p.type==='fireb'){if(!glow)return;wx.fillStyle=PAL.r;wx.fillRect(sx-2,sy-2,5,5);wx.fillStyle=PAL.o;wx.fillRect(sx-1,sy-1,3,3);wpx(sx,sy,'y');return;}
  if(p.type==='shieldp'){if(glow)return;const t=(time*20|0)%2;wx.fillStyle=PAL.k;wx.fillRect(sx-2,sy-2,5,5);wx.fillStyle=PAL.C;wx.fillRect(sx-1,sy-1,3,3);wpx(sx+(t?1:-1),sy,'y');return;}
  if(p.type==='poison'){if(glow)return;const l=Math.hypot(p.vx,p.vy)||1,ux=p.vx/l,uy=p.vy/l;for(let i=0;i<6;i++)wpx(Math.round(sx-ux*i),Math.round(sy-uy*i),i===0?'z':i>=4?'Z':'W');return;}
  if(p.type==='hammer'){if(!glow)return;uvGlow(sx,sy,12,'#ffd35a',0.55,1);drawRot(HAMMER,sx,sy,time*16,17,22,0.34);return;}
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
function drawZone(z,icx,icy){if(z.vis>=40){drawGunZone(z,icx,icy);return;}if(z.vis>=20){drawHazard(z,icx,icy);return;}if(z.vis>=10){drawUltZone(z,icx,icy);return;}const sx=Math.round(z.x)-icx,sy=Math.round(z.y)-icy;const r=z.r,ry=Math.round(r*0.6);const v=ZVIS[z.vis]||ZVIS[0];
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
  else if(e.type==='slash'){const s0=e.d*0.35;if(e.t<s0)return;const k2=(e.t-s0)/(e.max-s0),px=sx,py=sy-6;wx.globalAlpha=Math.max(0,1-k2);for(let n=0;n<22;n++){const t=e.a-1.1+n*0.1,r=14+(n%3===0?1:0),mid=n>6&&n<16;wpx(Math.round(px+Math.cos(t)*r),Math.round(py+Math.sin(t)*r*0.8),n>8&&n<14?'w':'s');wpx(Math.round(px+Math.cos(t)*(r-1)),Math.round(py+Math.sin(t)*(r-1)*0.8),mid?'s':'S');if(mid)wpx(Math.round(px+Math.cos(t)*(r-2)),Math.round(py+Math.sin(t)*(r-2)*0.8),'S');}wx.globalAlpha=1;}
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
  L.push({x:me.x-icx,y:me.y-8-icy,r:G.dark?64:meDowned()?100:visionR(),i:1});
  for(const p of G.players.values()){if(p.id===myId)continue;L.push({x:p.dx-icx,y:p.dy-8-icy,r:G.dark?40:110,i:0.95});}
  {const lk=lookOfMe();if((lk.ar===3||lk.wr===3)&&!G.dark)L.push({x:me.x-icx,y:me.y-8-icy,r:175,i:1});}
  for(const t of torches){const x=t.x-icx,y=t.y+4-icy;if(G.dark||x<-80||x>W+80||y<-80||y>H+80)continue;L.push({x,y,r:66+Math.sin(time*9+t.ph)*3+Math.sin(time*23+t.ph)*2,i:1});}
  for(const p of G.projs.values()){if(p.type==='pellet')continue;if(p.type!=='arrow'&&p.type!=='parrow'&&p.type!=='poison'&&p.type!=='shieldp'&&p.type!=='web'&&p.type!=='page')L.push({x:p.dx-icx,y:p.dy-p.h-icy,r:p.type==='fire'?46:p.type==='bullet'?18:32,i:1});}
  for(const e of effects){if(e.type==='boom')L.push({x:e.x-icx,y:e.y-icy,r:70*(1-e.t/e.max)+10,i:1});else if(e.type==='nova'||e.type==='smite')L.push({x:e.x-icx,y:e.y-icy,r:90*(1-e.t/e.max)+10,i:.9});}
  for(const z of G.zones)if(z.vis===28)L.push({x:z.x-icx,y:z.y-icy,r:60,i:1});else if(z.vis===21&&!z.arm)L.push({x:z.x-icx,y:z.y-icy,r:22,i:0.7});else if(z.vis<20&&z.vis!==8)L.push({x:z.x-icx,y:z.y-icy,r:z.r+20,i:z.vis===1||z.vis===7?0.5:0.9});
  if(G.map&&G.map.raid)raidDunLights(L,icx,icy);ultLights(L,icx,icy);gunLights(L,icx,icy);
  if(G.kind==='dungeon'&&G.stairsOpen){const x=(G.map.stairsIdx%G.map.w)*TS+8-icx,y=((G.map.stairsIdx/G.map.w)|0)*TS+8-icy;L.push({x,y,r:40+Math.sin(time*3)*3,i:.9});}
  evLights(L,icx,icy);trapLights(L,icx,icy);fieldLights(L,icx,icy);
  if(G.kind==='hub'){hubLights(L,icx,icy);raidLights(L,icx,icy);const m=G.map.merchant;L.push({x:m.x+7-icx,y:m.y-9-icy,r:44,i:0.9});}
  for(const d of G.drops.values())if(d.kind==='item'&&d.it.rar>=3)L.push({x:d.x-icx,y:d.y-icy,r:28,i:.9});
  lightArr.fill(0);
  for(const l of L){const x0=Math.max(0,Math.floor(l.x-l.r)),x1=Math.min(W-1,Math.ceil(l.x+l.r)),y0=Math.max(0,Math.floor(l.y-l.r)),y1=Math.min(H-1,Math.ceil(l.y+l.r)),r2=l.r*l.r;
    for(let y=y0;y<=y1;y++){const dy=y-l.y,dy2=dy*dy;let idx=y*W+x0;for(let x=x0;x<=x1;x++,idx++){const dx=x-l.x,d2=dx*dx+dy2;if(d2<r2){const v=(1-d2/r2)*l.i;if(v>lightArr[idx])lightArr[idx]=v;}}}}
  const amb=G.kind==='hub'?0.46:(G.map&&G.map.field?0.5:0);const a=lightImg.data;let i=0;for(let y=0;y<H;y++){const by=(y&3)<<2;for(let x=0;x<W;x++,i++){const b=Math.max(lightArr[i],amb)*1.7;const q=b>=1?16:((b*5)|0)*4;a[i*4+3]=BAYER[by|(x&3)]>=q?255:0;}}
  lx.putImageData(lightImg,0,0);wx.drawImage(lc,0,0);}
function lit(x,y){x=Math.round(x);y=Math.round(y);if(x<0||y<0||x>=W||y>=H)return 0;return lightArr[y*W+x];}
function curTorch(){return G.kind==='dungeon'?themeAssets(G.floor).torch:TORCH;}
function renderWorld(){const shk=shake*OPT.shake;const sx=shk>0.5?Math.round(rf(-shk,shk)):0,sy=shk>0.5?Math.round(rf(-shk,shk)):0;const icx=Math.round(camX)+sx,icy=Math.round(camY)+sy;
  wx.fillStyle='#050407';wx.fillRect(0,0,W,H);drawTiles(icx,icy);
  for(const t of torches){const x=t.x-icx-3,y=t.y-icy-4;if(x<-10||y<-14||x>W||y>H)continue;wx.drawImage(curTorch()[(Math.floor(time*8+t.ph))&1],x,y);}
  if(G.block)drawBossSeal(icx,icy);
  drawTraps(icx,icy);
  for(const z of G.zones)drawZone(z,icx,icy);
  drawGunUnder(icx,icy);
  for(const e of effects)if(e.under)drawEffect(e,icx,icy);
  for(const d of G.drops.values())drawDrop(d,icx,icy);
  _icx=icx;_icy=icy;drawFoots(icx,icy);
  const ents=[];for(const m of G.monsters.values())ents.push({y:m.dy,f:()=>drawMonster(m,icx,icy)});
  for(const p of G.players.values()){const isMe=p.id===myId;ents.push({y:isMe?me.y:p.dy,f:()=>drawPlayer(p,icx,icy,isMe)});}
  drawEvents(icx,icy,ents);drawFieldObjs(icx,icy,ents);drawRaidObjs(icx,icy,ents);drawRaidStone(icx,icy,ents);drawCprStone(icx,icy,ents);drawPets(icx,icy,ents);drawAllies(icx,icy,ents);drawLoreObj(icx,icy,ents);
  if(G.kind==='hub'){ents.push({y:G.map.merchant.y,f:()=>drawMerchant(icx,icy)});drawProps(icx,icy,ents);for(const n of NPCS)ents.push({y:n.y,f:()=>drawNpc(n,icx,icy)});}
  ents.sort((a,b)=>a.y-b.y);for(const e of ents)e.f();
  drawBossFx(icx,icy);drawFishWorld(icx,icy);drawRaidRings(icx,icy);
  for(const p of G.projs.values())drawProj(p,icx,icy,false);drawParts(icx,icy,false);
  for(const e of effects)if(!e.under)drawEffect(e,icx,icy);
  computeLights(icx,icy);drawEyes(icx,icy);
  if(G.kind==='hub')drawPortal(icx,icy,true);
  if(G.zones.some(z=>z.vis===29&&!z.arm)){wx.fillStyle='rgba(140,190,230,0.12)';wx.fillRect(0,0,W,H);}
  for(const d of G.drops.values())drawBeam(d,icx,icy);for(const p of G.projs.values())drawProj(p,icx,icy,true);drawParts(icx,icy,true);wfxDraw(icx,icy);drawUltWorld(icx,icy);drawKnightFx(icx,icy);drawGunFx(icx,icy);drawHitFx(icx,icy);drawUltStreaks(icx,icy);drawRaid2World(icx,icy);drawRaid2Marks(icx,icy);drawGMWorld(icx,icy);
  for(const t of torches){const x=t.x-icx-3,y=t.y-icy-4;if(x<-10||y<-14||x>W||y>H)continue;wx.drawImage(curTorch()[(Math.floor(time*8+t.ph))&1],0,0,7,5,x,y,7,5);}
  if(screenFlash>0){wx.fillStyle=`rgba(255,246,234,${Math.min(0.6,screenFlash)})`;wx.fillRect(0,0,W,H);screenFlash-=1/60;}
  if(G.hurtT&&time-G.hurtT<0.3){const a=(1-(time-G.hurtT)/0.3)*(G.hurtK||0.35);const g=wx.createRadialGradient(W/2,H/2,H*0.35,W/2,H/2,W*0.62);g.addColorStop(0,'rgba(180,20,20,0)');g.addColorStop(1,`rgba(180,20,20,${a})`);wx.fillStyle=g;wx.fillRect(0,0,W,H);}
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
function skillTip(sid,i){if(sid==='ctr')return ctrTip();const s=SKILLS[sid];const rank=(G.ch&&G.ch.sk&&G.ch.sk[sid])||0;const L=[[s.n+(rank?`  ${rank}/${SH.MAX_RANK}`:''),'#ffd35a',14],[s.pas?'패시브':`마나 ${s.mp}  ·  재사용 ${s.cd}초`,s.pas?'#c77ad8':'#7aa2ff',12],[s.desc,'#e6dcc3',12]];if(s.ctr)L.push(['◆ 카운터 가능 · 파랗게 빛나는 보스를 저지','#8fd0ff',11]);
  {const V=G.ch&&SH.advVar(G.ch,sid);if(V)L.push([`◈ ${V.n} (${SH.ADV[G.ch.adv].n} 변형): ${V.d}`,SH.ADV[G.ch.adv].col,11]);}
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
function drawAwkInfo(x,y,w,AW){const ch=G.ch;pr(x+10,y+60,w-20,76,'rgba(10,7,14,0.6)');pr(x+10,y+60,w-20,1,AW.col);
  txt(AW.n,x+18,y+69,13,AW.col);txt(`고유 효과 「${AW.idn}」 ${AW.idd}`,x+18,y+82,10,'#ffd35a');
  const L=ch.awl|0,need=SH.awNeed(L),f=L>=SH.AWL_MAX?1:Math.min(1,(ch.awx|0)/need);txt(`각성 레벨 ${L} / ${SH.AWL_MAX}`,x+w-18,y+69,11,'#e6dcc3','right');pr(x+w-158,y+76,140,4,PAL.k);pr(x+w-157,y+77,Math.round(138*f),2,AW.col);
  uiRects.push({x:x+w-158,y:y+73,w:140,h:9,tip:()=>[['각성 경험치','#ffd35a',12],[L>=SH.AWL_MAX?'최고 각성 레벨!':`${(ch.awx|0).toLocaleString()} / ${need.toLocaleString()}`,'#e6dcc3',11],['50레벨 이후 얻는 경험치로 올라요','#9e937a',11],['레벨마다 각성 포인트 +1 · 스킬 포인트 +1','#9e937a',11]]});
  const nd=ch.awn||{},left=L-SH.awnSpent(ch);txt(`각성 포인트 ${left}`,x+18,y+95,10,left>0?'#8fd0ff':'#6b6275');
  if(G.kind==='hub'&&SH.awnSpent(ch)>0)button(x+80,y+90,42,11,'초기화',()=>net({t:'awn',reset:1}),{size:9,tip:[['각성 포인트 초기화','#ffd35a',12],['마을에서 무료로 다시 찍을 수 있어요','#9e937a',11]]});
  Object.entries(SH.AWN).forEach(([k,N],i)=>{const bx=x+16+i*93,by=y+104;const v=nd[k]|0;pr(bx,by,89,28,PAL.k);pr(bx+1,by+1,87,26,'#1d1824');txt(N.n,bx+4,by+7,10,v?AW.col:'#e6dcc3');txt(`${v}/${SH.AWN_MAX}`,bx+84,by+7,9,'#9e937a','right');txt(N.d,bx+4,by+19,9,'#9e937a');
    for(let q=0;q<SH.AWN_MAX;q++)pr(bx+4+q*6,by+24,5,2,q<v?AW.col:PAL.m);
    if(left>0&&v<SH.AWN_MAX){const px=bx+74,py=by+12;const hov=mouse.x>=px&&mouse.x<px+11&&mouse.y>=py&&mouse.y<py+11;pr(px,py,11,11,hov?PAL.y:PAL.g);pr(px+1,py+1,9,9,PAL.k);pr(px+4,py+2,2,7,'#8fd0ff');pr(px+2,py+4,7,2,'#8fd0ff');uiRects.push({x:px,y:py,w:11,h:11,click:()=>{net({t:'awn',k});sfx('pick');},tip:[[`${N.n} +1`,'#8fd0ff',12],[N.d,'#e6dcc3',11]]});}});}
function drawSkills(){const ch=G.ch;if(!ch)return;const x=40,y=14,w=400,h=228;panel(x,y,w,h,'스킬');txt(`스킬 포인트 ${ch.spts||0}`,x+w-10,y+10,12,(ch.spts||0)>0?'#8fd0ff':'#6b6275','right');txt(`${CLASSES[ch.cls].n}`,x+10,y+10,12,CLASS_COL[ch.cls]);
  const AD=SH.advOf(ch);const AW=SH.awkOf(ch);const tabW=G.skTab==='awk'&&AW;const tabA=!tabW&&G.skTab==='adv'&&AD;const list=tabW?AW.ids:tabA?AD.sk:CLASSES[ch.cls].skills;const cw=77,chh=38,gx=x+10,gy=y+22;
  if(AD){button(x+58,y+4,34,12,'기본',()=>{G.skTab='base';G.skSel=null;},{size:9,main:!tabA&&!tabW});button(x+95,y+4,78,12,`전직·${AD.n}`,()=>{G.skTab='adv';G.skSel=null;},{size:9,main:!!tabA});
    if(AW)button(x+176,y+4,86,12,`각성·${AW.n}`,()=>{G.skTab='awk';G.skSel=null;},{size:9,main:!!tabW});else if(ch.lvl>=SH.AWK_LVL)txt('50레벨! 한스에게서 각성의 시련',x+178,y+10,9,'#ffd35a');}
  else if(ch.lvl>=SH.ADV_LVL)txt('30레벨 달성! 용병 대장 한스에게서 전직할 수 있어요',x+70,y+10,10,'#ffd35a');
  if(tabW)drawAwkInfo(x,y,w,AW);
  if(tabA){pr(x+10,y+64,w-20,70,'rgba(10,7,14,0.55)');txt(`${AD.n} · ${AD.info.role}`,x+18,y+74,12,AD.col);txt(`고유 효과 「${AD.idn}」`,x+18,y+89,11,'#ffd35a');wrapTxt(AD.idd,10,w-40).forEach((l,i)=>txt(l,x+18,y+102+i*11,10,'#e6dcc3'));txt(`전직 궁극기: ${SKILLS[AD.ult].n} (아래 궁극기에서 선택)`,x+18,y+128,10,'#9e937a');}
  list.forEach((sid,n)=>{const c=n%5,r=(n/5)|0,cx=gx+c*cw,cy=gy+r*chh;const sk=SKILLS[sid],rank=ch.sk[sid]||0,locked=ch.lvl<sk.lvl,sel=G.skSel===sid;
    pr(cx,cy,cw-4,chh-4,sel?PAL.y:PAL.k);pr(cx+1,cy+1,cw-6,chh-6,locked?'#15111b':rank?'#231b2c':PAL.D);
    pimg(SKILL_ICON[sid],cx+3,cy+3);if(sk.pas){pr(cx+2,cy+2,18,1,PAL.g);pr(cx+2,cy+19,18,1,PAL.g);pr(cx+2,cy+2,1,18,PAL.g);pr(cx+19,cy+2,1,18,PAL.g);}
    if(locked)pr(cx+3,cy+3,16,16,'rgba(5,4,8,0.7)');
    txt(sk.n,cx+22,cy+8,11,locked?'#6b6275':'#e6dcc3');
    txt(locked?`레벨 ${sk.lvl}`:sk.pas?`패시브 ${rank}/${SH.MAX_RANK}`:`${rank}/${SH.MAX_RANK}`,cx+22,cy+18,10,locked?'#6b6275':rank?'#ffd35a':'#9e937a');
    for(let k=0;k<SH.MAX_RANK;k++)pr(cx+3+k*7,cy+30,6,2,k<rank?PAL.y:PAL.m);
    const can=!locked&&(ch.spts||0)>0&&rank<SH.MAX_RANK;
    uiRects.push({x:cx,y:cy,w:cw-4,h:chh-4,click:()=>{G.skSel=sid;},right:()=>{if(!sk.pas&&rank>0){const e=ch.bar.indexOf(null);if(e>=0)net({t:'bar',i:e,sid});}},tip:()=>skillTip(sid,null)});
    {const min=(SH.defaultSkills(ch.cls).sk[sid])|0;if(!locked&&!sk.ult&&rank>min){const bx=cx+cw-28,by=cy+3;const hov=mouse.x>=bx&&mouse.x<bx+10&&mouse.y>=by&&mouse.y<by+10;pr(bx,by,10,10,hov?'#ff8a7a':PAL.g);pr(bx+1,by+1,8,8,PAL.k);pr(bx+2,by+4,6,2,'#ff8a7a');uiRects.push({x:bx,y:by,w:10,h:10,click:()=>net({t:'unlearn',sid}),tip:()=>[['포인트 1 빼기','#ff8a7a',12],[`스킬 포인트 1 돌려받기 · ${3*ch.lvl}골드`,'#e6dcc3',11],[G.kind==='hub'?'마을에서만 가능':'마을에서만 가능 (지금은 안 돼요)','#9e937a',11]]});}}
    if(can){const bx=cx+cw-16,by=cy+3;const hov=mouse.x>=bx&&mouse.x<bx+10&&mouse.y>=by&&mouse.y<by+10;pr(bx,by,10,10,hov?PAL.y:PAL.g);pr(bx+1,by+1,8,8,PAL.k);pr(bx+4,by+2,2,6,'#8fd0ff');pr(bx+2,by+4,6,2,'#8fd0ff');uiRects.push({x:bx,y:by,w:10,h:10,click:()=>net({t:'learn',sid}),tip:()=>[[rank?'등급 올리기':'배우기','#8fd0ff',12],['스킬 포인트 1 사용','#9e937a',11]]});}});
  drawUltPick(x+10,y+138,w-20);
  const by=y+h-34;txt('단축키',x+10,by+10,11,'#9e937a');
  {const cx=x+278,cy=by,sel=G.skSel==='ctr',hov=mouse.x>=cx&&mouse.x<cx+112&&mouse.y>=cy&&mouse.y<cy+22;pr(cx,cy,112,22,sel?PAL.y:hov?PAL.G:PAL.k);pr(cx+1,cy+1,110,20,'#1d2433');pimg(CTR_ICON,cx+3,cy+3);txt('카운터',cx+22,cy+7,10,'#8fd0ff');txt(SH.CTR_SKILL[ch.cls].n,cx+22,cy+16,9,'#9e937a');uiRects.push({x:cx,y:cy,w:112,h:22,click:()=>{G.skSel='ctr';},right:()=>{if(!ch.bar.includes('ctr')){const e=ch.bar.indexOf(null);if(e>=0)net({t:'bar',i:e,sid:'ctr'});}},tip:ctrTip});}
  for(let i=0;i<SH.BAR_SIZE;i++){const sx=x+56+i*26+(i>=4?8:0);const sid=ch.bar[i];slotBox(sx,by,22,22,false);if(sid)pimg(sid==='ctr'?CTR_ICON:SKILL_ICON[sid],sx+3,by+3);txt(keyLabel(kbCode('sk'+i)).slice(0,1),sx+2,by+5,8,'#ffd35a','left','px');
    uiRects.push({x:sx,y:by,w:22,h:22,click:()=>{const s2=G.skSel;if(s2==='ctr'){net({t:'bar',i,sid:'ctr'});return;}if(s2&&!SKILLS[s2].pas&&(ch.sk[s2]||0)>0)net({t:'bar',i,sid:s2});else if(s2&&SKILLS[s2].pas)msg('패시브는 단축키에 넣지 않아도 항상 적용됩니다','#9e937a');},right:()=>net({t:'bar',i,sid:null}),tip:sid?()=>skillTip(sid,i):null});}
  txt('스킬·카운터 클릭 → 칸 클릭: 배치 · 칸 우클릭: 비우기 · + 배우기 · − 1포인트 빼기(마을)',x+w-10,by+28,9,'#6b6275','right');}

function baseLine(k,v){if(k==='dmg')return`공격력 ${v}`;if(k==='armor')return`방어력 ${v}`;if(k==='as')return`${v>0?'+':''}${v}% 공격 속도`;if(k==='ms')return`${v}% 이동 속도`;if(k==='mp')return`+${v} 마나`;return'';}
function diffLine(k,d){const lab=SH.AFF[k].f(Math.abs(d)).replace(/^\+/,d>0?'+':'-');return(d>0?'▲ ':'▼ ')+lab;}
function itemTip(it,where,by){const cls=myCls();const L=[[SH.itemName(it),itemCol(it),14],[`${it.set?'세트':RAR[it.rar].n} ${it.slot==='weapon'?SH.FAMN[it.fam]:SH.SLOTN[it.slot]}  ·  아이템 레벨 ${it.L}`,'#9e937a',11]];
  for(const k in it.base){const v=(k==='dmg'||k==='armor')?Math.round(it.base[k]*SH.enhMul(it.up|0)):it.base[k];L.push([baseLine(k,v)+(it.up&&(k==='dmg'||k==='armor')?`  (+${it.up} 강화)`:''),'#f2eadb',12]);}it.aff.forEach((a,i)=>L.push([SH.AFF[a.k].f(it.slot==='ring'&&it.up?Math.round(a.v*(1+0.05*it.up)):a.v)+(it.rk===i?'  ◆':''),'#7aa2ff',12]));
  if(it.set&&SH.SETS[it.set]){const S0=SH.SETS[it.set];const n=G.ch?SH.setCount(G.ch,it.set):0;L.push([`${S0.n} 세트 (${n}/3)`,'#4ad86a',12]);for(const sl of['weapon','armor','ring']){const e=G.ch&&G.ch.eq[sl];const has=e&&e.set===it.set;L.push([`  ${sl==='weapon'?'무기':sl==='armor'?'갑옷':'반지'}: ${sl==='weapon'?(G.ch?S0.nm[CLASSES[G.ch.cls].fam]:'무기'):S0.nm[sl]}`,has?'#7fd05a':'#6b6275',11]);}L.push([`(2) ${S0.b2d}`,n>=2?'#7fd05a':'#9e937a',11]);L.push([`(3) ${S0.b3d}`,n>=3?'#7fd05a':'#9e937a',11]);}
  if(it.rar===4&&it.myth&&SH.MYTH[it.myth]){L.push([`★ ${SH.MYTH[it.myth].n}`,'#ff3a5a',12]);L.push([SH.MYTH[it.myth].d,'#ff9ab0',11]);}
  if(it.so&&it.so.length){for(const g of it.so){if(g){const e=SH.gemEff(g,it.slot);L.push([`◇ ${SH.gemName(g)}: ${SH.AFF[e.k].f(e.v)}`,SH.GEM_COL[g[0]],12]);}else L.push(['◇ 빈 소켓','#6b6275',11]);}}
  if(!SH.canEquip(it,cls))L.push([`${CLASSES[cls].n}은(는) 착용 불가`,'#e0574a',12]);
  else if(where!=='eq'&&G.ch){const cur=G.ch.eq[it.slot];if(cur!==it){const p0=SH.power(G.ch),p1=SH.power(G.ch,{[it.slot]:it}),dv=p1-p0;L.push([dv===0?'전투력 변화 없음':`전투력 ${dv>0?'+':''}${dv.toLocaleString()} ${dv>0?'▲':'▼'}  (${p1.toLocaleString()})`,dv>0?'#7fd05a':dv<0?'#e0574a':'#9e937a',13]);}if(!cur)L.push(['빈 칸 · 바로 장착 가능','#7fd05a',11]);else if(cur!==it){L.push(['장착 중인 아이템과 비교','#9e937a',11]);const a=SH.itemStats(it),b=SH.itemStats(cur);let any=false;for(const k of new Set([...Object.keys(a),...Object.keys(b)])){const d=(a[k]||0)-(b[k]||0);if(d){any=true;L.push([diffLine(k,d),d>0?'#7fd05a':'#e0574a',12]);}}if(!any)L.push(['차이 없음','#9e937a',11]);}}
  if(by)L.push([`${by}님이 내려놓은 아이템`,'#c77ad8',11]);if(where==='insp')return L;
  if(where==='forge'||where==='gam')return L;if(where==='stash'){L.push(['클릭: 가방으로 꺼내기','#6b6275',11]);return L;}
  if(G.fac==='forge'&&(where==='bag'||where==='eq')){L.push(['클릭: 대장간에 올리기','#ffd35a',11]);return L;}if(G.fac==='vault'&&where==='bag'){L.push(['클릭: 창고에 넣기','#ffd35a',11]);return L;}
  if(where==='shop')L.push([`가격 ${it.price}골드 · 클릭해서 구입`,'#ffd35a',12]);else L.push([where==='bag'?(showShop?`클릭: 장착   우클릭·Shift+클릭: 판매 ${it.value}골드`:'클릭: 장착   우클릭·Shift+클릭: 바닥에 버리기 (거래)'):where==='ground'?'클릭해서 줍기 (F)':'클릭: 장착 해제','#6b6275',11]);return L;}
function drawTip(lines){const k=SC/2;const bms=lines.map(l=>tbitmap(l[0],(l[2]||12)+1,l[1],'kr'));let w=0,h=0;bms.forEach(b=>{w=Math.max(w,b.width);h+=b.height-3*k;});const pad=12*k;w+=pad*2;h+=pad*2;
  let x=mouse.x*SC+24*k,y=mouse.y*SC+8*k;if(x+w>W*SC-4)x=mouse.x*SC-w-12*k;if(y+h>H*SC-4)y=H*SC-h-4;x=Math.max(4,Math.round(x/2)*2);y=Math.max(4,Math.round(y/2)*2);
  ctx.fillStyle=PAL.k;ctx.fillRect(x,y,w,h);ctx.fillStyle=PAL.G;ctx.fillRect(x+2*k,y+2*k,w-4*k,h-4*k);ctx.fillStyle='rgba(8,6,12,0.985)';ctx.fillRect(x+4*k,y+4*k,w-8*k,h-8*k);
  let yy=y+pad-2*k;bms.forEach(b=>{ctx.drawImage(b,Math.round(x+w/2-b.width/2),Math.round(yy));yy+=b.height-3*k;});}
function drawHUD(){const mv=G.mev,cls=myCls(),skills=CLASSES[cls].skills;
  /* 로스트아크식 아래 바: [궁극기 V · 카운터 Z] [Q W E R / A S D F] (레벨 문장) [물약 1 · 2] */
  pr(44,218,392,52,PAL.k);pr(45,219,390,51,PAL.d);pr(45,219,390,1,PAL.m);pr(45,220,390,1,PAL.D);pr(50,224,2,2,PAL.g);pr(428,224,2,2,PAL.g);
  uiRects.push({x:44,y:218,w:392,h:52,block:true});
  drawOrb(26,246,mv[0]/mv[1],ORB_HP,`${mv[0]}/${mv[1]}`);drawOrb(454,246,mv[2]/mv[3],ORB_MP,`${mv[2]}/${mv[3]}`);
  if(mv[4]>0){txt(`보호막 ${mv[4]}`,26,212,11,'#bfe3ff','center');}
  uiRects.push({x:2,y:222,w:48,h:48,block:true,tip:()=>[['체력',"#ff7a6a",13],[`${mv[0]} / ${mv[1]}`,'#e6dcc3',12],[`${keyLabel(kbCode('potHp'))}: 체력 물약 (45% 회복)`,'#6b6275',11]]});
  uiRects.push({x:430,y:222,w:48,h:48,block:true,tip:()=>[['마나',"#8fd0ff",13],[`${mv[2]} / ${mv[3]}`,'#e6dcc3',12],[`${keyLabel(kbCode('potMp'))}: 마나 물약 (50% 회복)`,'#6b6275',11]]});
  const sw=18,gap=2,gx=136,gy0=222;
  for(let i=0;i<SH.BAR_SIZE;i++){const x=gx+(i%4)*(sw+gap),y=gy0+((i/4)|0)*(sw+2);const sid=G.ch&&G.ch.bar?G.ch.bar[i]:null;slotBox(x,y,sw,sw,false);
    if(sid==='ctr'){pimg(CTR_ICON,x+1,y+1);const left=ctrCdEnd-time;if(left>0){pr(x+1,y+1,16,Math.ceil(16*left/SH.CTR_CD),'rgba(5,4,8,0.72)');if(left>1)txt(String(Math.ceil(left)),x+9,y+10,8,'#ffffff','center','px');}if(G.ctrWin&&time<G.ctrWin&&(time*8|0)%2){pr(x,y,sw,1,'#8fd0ff');pr(x,y+sw-1,sw,1,'#8fd0ff');pr(x,y,1,sw,'#8fd0ff');pr(x+sw-1,y,1,sw,'#8fd0ff');}uiRects.push({x,y,w:sw,h:sw,click:useCounter,tip:ctrTip});}
    else if(sid&&SKILLS[sid]){const sk=SKILLS[sid];pimg(SKILL_ICON[sid],x+1,y+1);if(sk.ctr){pr(x+sw-5,y+1,4,4,PAL.k);pr(x+sw-4,y+2,2,2,'#8fd0ff');}const left=(localCd[sid]||0)-time;if(left>0){pr(x+1,y+1,16,Math.ceil(16*left/sk.cd),'rgba(5,4,8,0.72)');if(left>1.5)txt(String(Math.ceil(left)),x+9,y+10,8,'#ffffff','center','px');}if(mv[2]<sk.mp)pr(x+1,y+1,16,16,'rgba(30,50,150,0.5)');
      uiRects.push({x,y,w:sw,h:sw,tip:()=>skillTip(sid,i)});}
    else uiRects.push({x,y,w:sw,h:sw,click:()=>{showSkills=true;showInv=showChar=showShop=false;},tip:()=>[['빈 칸','#9e937a',13],['K를 눌러 스킬을 넣으세요','#6b6275',11]]});
    pr(x+1,y+1,7,6,'rgba(10,7,14,0.75)');txt(keyLabel(kbCode('sk'+i)).slice(0,1),x+2,y+4,8,'#ffd35a','left','px');}
  /* 가운데 문장: 레벨 + 경험치 고리 */
  {const cx=240,cy=242,rr=16;const capd=G.ch&&G.ch.lvl>=SH.LVL_CAP;const xf=!G.ch?0:capd?1:G.ch.xp/SH.xpFor(G.ch.lvl);const cc=CLASS_COL[cls]||'#ffd35a';
    ctx.save();ctx.fillStyle='#0b0810';ctx.beginPath();ctx.arc(cx*SC,cy*SC,(rr+3)*SC,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#3a3144';ctx.lineWidth=3*SC;ctx.beginPath();ctx.arc(cx*SC,cy*SC,rr*SC,0,Math.PI*2);ctx.stroke();
    ctx.strokeStyle=capd?'#ffd35a':'#8fd0ff';ctx.beginPath();ctx.arc(cx*SC,cy*SC,rr*SC,-Math.PI/2,-Math.PI/2+Math.PI*2*clamp(xf,0,1));ctx.stroke();ctx.fillStyle=cc;ctx.globalAlpha=0.25;ctx.beginPath();ctx.arc(cx*SC,cy*SC,(rr-3)*SC,0,Math.PI*2);ctx.fill();ctx.restore();
    txt(G.ch?String(G.ch.lvl):'',cx,cy-2,13,'#ffe9a8','center');txt('LV',cx,cy+8,8,'#9e937a','center','px');
    uiRects.push({x:cx-rr,y:cy-rr,w:rr*2,h:rr*2,tip:()=>capd?[[`레벨 ${G.ch.lvl} (MAX)`,'#ffd35a',13],['만렙입니다 · 경험치는 골드와 마력 가루로 바뀝니다','#e6dcc3',12]]:[[`레벨 ${G.ch.lvl}`,'#ffd35a',13],[`경험치 ${G.ch.xp} / ${SH.xpFor(G.ch.lvl)} (${Math.floor(xf*100)}%)`,'#e6dcc3',12]]});}
  /* 오른쪽: 물약 1·2 + 조작 안내 */
  [['hp',266],['mp',288]].forEach(([k,x])=>{const y=226;slotBox(x,y,20,20,false);pimg(k==='hp'?POT_HP:POT_MP,x+2,y+6);txt(String(G.ch?G.ch.pots[k]:0),x+18,y+16,8,'#ffffff','right','px');txt(keyLabel(kbCode(k==='hp'?'potHp':'potMp')).slice(0,3),x+2,y+5,8,'#e6dcc3','left','px');
    uiRects.push({x,y,w:20,h:20,click:()=>usePot(k),tip:()=>[[k==='hp'?'체력 물약':'마나 물약',k==='hp'?'#ff7a6a':'#8fd0ff',13],[k==='hp'?'최대 체력의 45% 회복':'최대 마나의 50% 회복','#e6dcc3',12],[`보유 ${G.ch?G.ch.pots[k]:0} / 9  ·  마을 상인에게서 구입`,'#9e937a',11]]});});
  txt(`${keyLabel(kbCode('pick'))} 줍기`,316,232,9,'#9e937a');txt(`${keyLabel(kbCode('act'))} 상호작용`,316,242,9,'#9e937a');txt(`${keyLabel(kbCode('dodge'))} 구르기`,316,252,9,'#9e937a');txt('우클릭 이동',372,232,9,'#9e937a');txt('Alt+우클릭 유저',372,242,9,'#9e937a');
  if(G.ch&&G.ch.spts>0){const bl=(time*3|0)%2===0;pr(388,206,40,10,bl?'#8fd0ff':PAL.C);pr(389,207,38,8,PAL.k);txt(`+${G.ch.spts} 스킬`,408,211,11,'#8fd0ff','center');uiRects.push({x:388,y:206,w:40,h:10,click:()=>{showSkills=true;showInv=showChar=showShop=false;}});}
  if(G.ch&&talLeft()>0){const bl=(time*3|0)%2===0;pr(334,206,50,10,bl?'#c9a0e8':'#7a4a9a');pr(335,207,48,8,PAL.k);txt(`+${talLeft()} 특성`,359,211,11,'#c9a0e8','center');uiRects.push({x:334,y:206,w:50,h:10,click:()=>{G.talent=true;G.rec=false;showSkills=false;showInv=false;}});}
  drawUltSlot();drawHolyGauge();drawSteamGauge();
  drawSynergy();
  if(G.ch){const capd=G.ch.lvl>=SH.LVL_CAP;const xf=capd?1:G.ch.xp/SH.xpFor(G.ch.lvl);pr(64,265,352,4,PAL.k);pr(65,266,Math.round(350*xf),2,PAL.G);pr(65,266,Math.round(350*xf),1,PAL.y);for(let i=1;i<10;i++)pr(64+Math.round(i*35.2),265,1,4,PAL.k);
    uiRects.push({x:64,y:264,w:352,h:6,block:true,tip:()=>capd?[[`레벨 ${G.ch.lvl} (MAX)`,'#ffd35a',13],['만렙입니다 · 경험치는 골드와 마력 가루로 바뀝니다','#e6dcc3',12]]:[[`레벨 ${G.ch.lvl}`,'#ffd35a',13],[`경험치 ${G.ch.xp} / ${SH.xpFor(G.ch.lvl)}`,'#e6dcc3',12]]});}
  // 버프
  let bx=130;if(mv[5]>0){txt(`피해 증가 ${Math.ceil(mv[5])}초`,bx,200,11,'#ff9a6a');bx+=70;}if(mv[6]>0){txt(`피해 감소 ${Math.ceil(mv[6])}초`,bx,200,11,'#8fd0ff');}
  // 왼쪽 위 정보
  pr(4,4,124,32,'rgba(8,6,12,0.72)');txt(G.kind==='hub'?'던전 입구 광장':inField()?`잿빛 황야 · ${G.map.regions[G.fReg<0?0:G.fReg].n}`:G.map&&G.map.raid?`레이드 · ${(SH.RAIDS.find(r=>r.id===G.map.raid)||{}).n}`:inArena()?'결투장':G.trial&&SH.ADV[G.trial]?`${G.trialAw&&SH.AWK[G.trial]?'각성의 시련 · '+SH.AWK[G.trial].n:(G.trialRe?'그림자 재도전':'전직 시험')+' · '+SH.ADV[G.trial].n}${G.trialT0!=null?' · '+fmtMS(time-G.trialT0):''}`:`지하 ${G.floor}층 · ${SH.themeOf(G.floor).t.n}`,8,11,13,SH.themeOf(G.floor).corrupt&&G.kind!=='hub'&&!(G.map&&G.map.raid)?'#ff8a7a':G.map&&G.map.raid?'#ffd35a':'#e6dcc3');if(G.ch){txt(`${G.ch.name} · ${CLASSES[cls].n} ${G.ch.lvl}`,8,21,12,'#9e937a');pimg(GOLD,8,27);txt(String(G.ch.gold),19,30,12,'#ffd35a');
    if(G.ch.pts>0){const bl=(time*3|0)%2===0;pr(52,221,38,10,bl?PAL.y:PAL.g);pr(53,222,36,8,PAL.k);txt(`+${G.ch.pts} 스탯`,71,226,11,'#ffd35a','center');uiRects.push({x:52,y:221,w:38,h:10,click:()=>{showChar=true;}});}}
  drawPartyFrames();
  if(G.kind==='dungeon'&&inField()){drawFieldMiniHud();}
  else if(G.kind==='dungeon'){pr(412,4,64,64,PAL.k);pr(413,5,62,62,'rgba(12,9,16,0.85)');ctx.drawImage(miniC,414*SC,6*SC,60*SC,60*SC);
    for(const p of G.players.values()){if(p.id===myId)continue;pr(414+Math.floor(p.x/TS),6+Math.floor(p.y/TS),1,1,'#7fd05a');}
    if((time*4|0)%2===0)pr(414+Math.floor(me.x/TS),6+Math.floor(me.y/TS),1,1,PAL.e);}
  const boss=[...G.monsters.values()].find(m=>isBossTc(m.tc)&&(m.fl&16)&&!(m.fl&1024)&&(m.maxHp>2000||m.tc===SHADOW_TC));G.bossBarOn=!!boss;const bl=[...G.monsters.values()].filter(m=>RB_TC.has(m.tc)&&(m.fl&16)&&m.maxHp>2000);
  if(bl.length>=2){bl.slice(0,2).forEach((b,i)=>{const x=140+i*102,f=b.hp/b.maxHp;pr(x-2,6,100,12,PAL.g);pr(x-1,7,98,10,PAL.k);pr(x,8,Math.round(96*f),8,(b.fl&128)?'#3a3144':b.tc===SH.MT_LIST.indexOf('r_lyra')?'#b38a3a':'#6a3a8c');txt(`${bossNm(b)} ${Math.round(f*100)}%`,x+48,12,10,'#fff6d0','center');});}
  else if(boss){const f=boss.hp/boss.maxHp;pr(138,6,204,12,PAL.g);pr(139,7,202,10,PAL.k);pr(140,8,Math.round(200*f),8,(boss.fl&128)?'#3a3144':PAL.R);pr(140,8,Math.round(200*f),2,(boss.fl&128)?'#7b7486':PAL.r);pr(239,7,1,10,PAL.k);txt(bossNm(boss)+((boss.fl&128)?' · 무적':(boss.fl&256)?' · 약점 노출':(boss.fl&2048)?(boss.tc===SHADOW_TC?' · 선각성':' · 격노'):''),240,12,12,(boss.fl&256)?'#ffe9a8':'#ffd35a','center');}
  if(hoverMon&&!(boss&&hoverMon===boss)){const m=hoverMon,y=boss?22:6,f=m.hp/m.maxHp;pr(170,y,140,11,PAL.k);pr(171,y+1,Math.round(138*f),9,PAL.R);pr(171,y+1,Math.round(138*f),2,PAL.r);
    const nm=(m.ea&255?`[${SH.eaffNames(m.ea).join('·')}] `:'')+(m.type==='clone'?SH.bossOf(G.floor).n:SH.monName(G.floor,m.type,!!(m.fl&1),m.id));txt(nm,240,y+5.5,12,(m.fl&1)?'#8fd0ff':'#e6dcc3','center');}}
function drawPartyFrames(){const pt=G.party;if(!pt||pt.members.length<=1)return;let y=40;
  if(pt.members.length>4){/* 5~8명: 한 줄 압축 */
    for(const mb of pt.members){const p=G.players.get(mb.id);const here=!!p;pr(4,y,100,11,'rgba(8,6,12,0.72)');pr(4,y,2,11,CLASS_COL[mb.cls]);
      txt((mb.id===pt.leader?'★':'')+mb.name,8,y+3.5,10,here?'#e6dcc3':'#6b6275');txt(here?(p.downed?'쓰러짐':''+mb.lvl):(G.kind==='hub'?'던전':'마을'),102,y+3.5,9,here&&p.downed?'#ff6a5a':'#9e937a','right');
      if(here){const f=p.maxHp?p.hp/p.maxHp:0;pr(8,y+8,94,2,PAL.k);pr(8,y+8,Math.round(94*f),2,p.downed?'#6b6275':'#c0392b');}
      y+=12;}}
  else for(const mb of pt.members){const p=G.players.get(mb.id);const here=!!p;pr(4,y,100,15,'rgba(8,6,12,0.72)');pr(4,y,2,15,CLASS_COL[mb.cls]);
    txt((mb.id===pt.leader?'★ ':'')+mb.name,9,y+4.5,11,here?'#e6dcc3':'#6b6275');txt(`${CLASSES[mb.cls].n} ${mb.lvl}`,102,y+4.5,10,'#9e937a','right');
    if(here){const f=p.maxHp?p.hp/p.maxHp:0;pr(9,y+10,92,3,PAL.k);pr(9,y+10,Math.round(92*f),3,p.downed?'#6b6275':'#c0392b');if(p.downed)txt('쓰러짐',102,y+11,9,'#ff6a5a','right');}
    else txt(G.kind==='hub'?'던전에 있음':'마을에 있음',9,y+11,9,'#6b6275');
    y+=17;}
  if(G.kind==='hub'){button(4,y,48,11,'파티 나가기',()=>net({t:'leave'}),{size:10});}}
function drawChar(){const S=G.S,ch=G.ch;if(!S||!ch)return;const x=6,y=38,w=172,h=194;panel(x,y,w,h,'캐릭터');{const cp=G.cp!=null?G.cp:SH.power(ch);txt(`전투력 ${cp.toLocaleString()}`,x+w-8,y+9,11,'#ffd35a','right');uiRects.push({x:x+w-70,y:y+3,w:64,h:12,tip:()=>[['종합 전투력','#ffd35a',12],['공격(피해·치명·공속·주문) + 생존(체력·방어) + 치유','#e6dcc3',11],['장비를 바꾸면 오르내린 값이 표시돼요','#9e937a',11]]});}let ly=y+24;const row=(a,b,c)=>{txt(a,x+10,ly,12,'#9e937a');txt(b,x+w-10,ly,12,c||'#e6dcc3','right');ly+=10;};
  {const AD=SH.advOf(ch),AW=AD&&ch.awk&&SH.AWK[ch.adv];if(AD){txt(CLASSES[ch.cls].n,x+10,ly,12,'#9e937a');const w0=txt(`${CLASSES[ch.cls].n} › `,-999,-999,12,'#fff');txt('›',x+10+w0-txt('› ',-999,-999,12,'#fff'),ly,12,'#6b6275');txt(AW?AW.n:AD.n,x+10+w0,ly,12,AW?(AW.col||'#ffd35a'):(AD.col||'#e6dcc3'));txt(`레벨 ${ch.lvl}`,x+w-10,ly,12,'#ffd35a','right');ly+=10;uiRects.push({x:x+6,y:ly-15,w:w-60,h:11,tip:()=>[[AW?`${AD.n} → 각성 ${AW.n}`:`전직: ${AD.n}`,AW?AW.col:AD.col,12],[AD.info&&AD.info.role?AD.info.role:CLASSES[ch.cls].role,'#e6dcc3',11]]});}else row(`${CLASSES[ch.cls].n} · ${CLASSES[ch.cls].role}`,`레벨 ${ch.lvl}`,'#ffd35a');}ly+=1;txt(ch.pts>0?`스탯 포인트 ${ch.pts}`:'스탯 포인트 없음',x+10,ly,12,ch.pts>0?'#ffd35a':'#6b6275');ly+=11;
  for(const[k,l,dsc]of[['str','힘',CLASSES[ch.cls].prim==='str'?'주 능력치 · 피해':'근접 피해'],['dex','민첩',CLASSES[ch.cls].prim==='dex'?'주 능력치 · 치명타':'치명타 · 공속'],['vit','활력','체력 +4'],['ene','에너지',CLASSES[ch.cls].prim==='ene'?'주 능력치 · 주문':'마나 · 주문']]){txt(l,x+10,ly,12,'#e6dcc3');txt(dsc,x+48,ly,11,'#6b6275');txt(String(S[k]),x+w-(ch.pts>0?24:10),ly,12,'#f2eadb','right');
    if(ch.pts>0){const bx=x+w-20,by=ly-5;pr(bx,by,10,10,PAL.g);pr(bx+1,by+1,8,8,PAL.k);pr(bx+4,by+2,2,6,PAL.y);pr(bx+2,by+4,6,2,PAL.y);uiRects.push({x:bx,y:by,w:10,h:10,click:()=>net({t:'stat',k})});}ly+=11;}
  ly+=1;pr(x+8,ly-5,w-16,1,PAL.m);ly+=2;const r2=(a,b,c)=>{row(a,b,c);ly-=1;};const mn=Math.round(S.dmgBase*0.8*S.dmgMul),mx=Math.round(S.dmgBase*1.2*S.dmgMul);
  r2('공격력',`${mn} - ${mx}`);r2('치명타',`${S.crit.toFixed(1)}%  x${S.critMul.toFixed(2)}`);r2('공격 속도',`${S.atkRate.toFixed(2)} / 초`);r2('방어력',`${S.armor}  (피해 -${Math.round(SH.dmgReduce(S,Math.max(1,G.floor))*100)}%)`);
  r2('체력',`${G.mev[0]} / ${S.maxHp}`,'#ff7a6a');r2('마나',`${G.mev[2]} / ${S.maxMp}`,'#8fd0ff');r2('주문 피해',`+${Math.round((S.spell-1)*100)}%`);r2('치유력',String(S.healPow),'#7fd05a');r2('생명력 흡수',`${S.ls}%`);
  ly+=1;txt(`처치 ${ch.kills}  ·  최고 기록 지하 ${ch.best}층`,x+w/2,ly,11,'#6b6275','center');}
function itemSlot(x,y,s,it,click,right,where){const hov=mouse.x>=x&&mouse.x<x+s&&mouse.y>=y&&mouse.y<y+s;pr(x,y,s,s,hov?PAL.y:PAL.k);pr(x+1,y+1,s-2,s-2,it?RAR[it.rar].bg:PAL.D);if(it){if((it.up|0)>=SH.TRANS_MAX){const g=((time*6)|0)%2;pr(x,y,s,1,g?'#ffd35a':'#fff6a0');pr(x,y+s-1,s,1,g?'#ffd35a':'#fff6a0');pr(x,y,1,s,'#ffd35a');pr(x+s-1,y,1,s,'#ffd35a');}else if(it.set){pr(x+1,y+1,s-2,1,'#4ad86a');}pimg(iconFor(it),x+(s-16)/2,y+(s-16)/2);if(it.up>SH.ENH_MAX)txt('+'+it.up,x+s-2,y+s-4,8,'#ffd35a','right','px');if(!SH.canEquip(it,myCls()))pr(x+1,y+s-3,s-2,2,'#e0574a');}
  uiRects.push({x,y,w:s,h:s,block:true,click:it?click:null,right:it?right:null,tip:it?()=>itemTip(it,where):null});}
// ---- 잿불 유물 가방 (석판 배치) ----
const RGLYPH={fire:['...#....','..##....','..###.#.','.#####..','.######.','########','.######.','..####..'],
  frost:['...#....','.#.#.#..','..###...','#######.','..###...','.#.#.#..','...#....','........'],
  shadow:['..####..','.##.....','##......','##......','##......','##......','.##.....','..####..'],
  lamp:['...##...','..####..','.#....#.','.#.##.#.','.#.##.#.','.#....#.','..####..','...##...'],
  gear:['..#..#..','.######.','##.##.##','.##..##.','.##..##.','##.##.##','.######.','..#..#..']};
function rGlyph(tag,x,y,c,s){const g=RGLYPH[tag];if(!g)return;s=s||1;for(let j=0;j<8;j++)for(let i=0;i<8;i++)if(g[j][i]==='#')pr(x+i*s,y+j*s,s,s,c);}
function rArrow(cx,cy,dx,dy,v,far){const c=v>0?(v>=2?'#9aff7a':'#7fd05a'):'#ff6a5a';const n=Math.min(3,Math.abs(v));for(let k=0;k<n+1;k++){pr(cx+dx*(2+k*2)-1,cy+dy*(2+k*2)-1,2,2,c);}if(far>1)pr(cx+dx*8-1,cy+dy*8-1,2,2,'#bfe3ff');}
function rCell(q,sx,sy,sz,lv,act){if(!q)return;if(q.t==='r'){const R=SH.RELICS[q.id];const T=SH.RTAG[R.tag];pr(sx+1,sy+1,sz-2,sz-2,lv>0?'#2a2233':'#18131e');rGlyph(R.tag,sx+(sz-8)/2,sy+3,lv>0?T.c:'#4a4252');
    txt(lv>0?String(lv):'×',sx+sz-3,sy+sz-5,8,lv>0?(lv>=R.max?'#ffd35a':'#e6dcc3'):'#ff6a5a','right','px');}
  else{const Tb=SH.TABLETS[q.id];pr(sx+1,sy+1,sz-2,sz-2,act===false?'#2a2630':'#4a4554');pr(sx+2,sy+2,sz-4,1,'#6b6578');const cx=sx+sz/2,cy=sy+sz/2;for(const [ax,ay,v] of Tb.a){const [dx,dy]=SH.rotA(ax,ay,q.r|0);rArrow(cx,cy,Math.sign(dx),Math.sign(dy),v,Math.max(Math.abs(dx),Math.abs(dy)));}
    pr(cx-1,cy-1,2,2,'#e6dcc3');if(Tb.cond)pr(sx+2,sy+sz-4,2,2,'#ffd35a');}}
function rTip(q,lv){if(!q)return null;if(q.t==='r'){const R=SH.RELICS[q.id],T=SH.RTAG[R.tag];const L=lv==null?q.lv:lv;const rows=[[R.n,T.c,12],[`${T.n} 계열 · 레벨 ${L}/${R.max} (기본 ${q.lv}${L!==q.lv?` · 석판 ${L-q.lv>=0?'+':''}${L-q.lv}`:''})`,'#9e937a',10]];
    rows.push([L>0?R.d(L):'석판 때문에 레벨 0 · 효과 없음',L>0?'#e6dcc3':'#ff6a5a',11]);if(L<R.max)rows.push([`다음 레벨: ${R.d(Math.max(1,L+1))}`,'#6b6275',10]);return rows;}
  const Tb=SH.TABLETS[q.id];return[[Tb.n,'#e6dcc3',12],[Tb.d,'#bfe3ff',11],['우클릭: 회전 · 화살표 방향의 유물 레벨이 바뀌어요','#6b6275',10]];}
function drawRelicTab(x,y,w,h){const ch=G.ch;const B=ch.rbag;const I=ch.rinv||[];if(!B){txt('유물 가방이 아직 없어요',x+w/2,y+60,11,'#9e937a','center');return;}
  const E=SH.relicEval(ch);const sz=19,gx=x+6,gy=y+21;const sel=G.rsel;const pick=(a)=>{if(!G.rsel){const q=a.w==='b'?B.c[a.i]:I[a.i];if(q){G.rsel=a;sfx('pick');}return;}const s0=G.rsel;G.rsel=null;if(s0.w===a.w&&s0.i===a.i)return;net({t:'rmove',a:s0,b:a});sfx('equip');};
  let hovI=-1;
  for(let i=0;i<B.c.length;i++){const cx=i%B.w,cy=(i/B.w)|0;const sx=gx+cx*(sz+1),sy=gy+cy*(sz+1);const hov=mouse.x>=sx&&mouse.x<sx+sz&&mouse.y>=sy&&mouse.y<sy+sz;if(hov)hovI=i;const q=B.c[i];
    pr(sx,sy,sz,sz,sel&&sel.w==='b'&&sel.i===i?PAL.y:hov?PAL.G:PAL.k);if(!q)pr(sx+1,sy+1,sz-2,sz-2,'#15111a');
    rCell(q,sx,sy,sz,E.lv[i],q&&q.t==='s'?E.act.some(a=>a[0]===i):undefined);
    uiRects.push({x:sx,y:sy,w:sz,h:sz,click:()=>pick({w:'b',i}),right:()=>{if(q&&q.t==='s'){net({t:'rrot',i});sfx('pick');}else if(q){net({t:'rmove',a:{w:'b',i},b:{w:'i',i:I.length}});}},tip:q?rTip(q,q.t==='r'?E.lv[i]:null):[['빈 칸','#9e937a',11],['보관함의 유물·석판을 집어 이곳을 클릭','#6b6275',10]]});}
  // 석판 영향 표시
  if(hovI>=0){for(const [s0,t0,v] of E.act)if(s0===hovI||t0===hovI){const tx=gx+(t0%B.w)*(sz+1),ty=gy+((t0/B.w)|0)*(sz+1);pr(tx,ty,sz,1,v>0?'#7fd05a':'#ff6a5a');pr(tx,ty+sz-1,sz,1,v>0?'#7fd05a':'#ff6a5a');}}
  // 세트
  const sx0=gx+B.w*(sz+1)+4;let sy0=gy;txt('계열',sx0,sy0+3,9,'#9e937a');if(E.res){txt('공명+1',sx0+20,sy0+3,8,'#ff9a4a');uiRects.push({x:sx0,y:sy0,w:44,h:8,tip:[['잿불의 공명','#ff9a4a',12],['잿불 세트 3부위 효과',  '#c9c1b2',11],['켜진 계열마다 유물 1개를 더 센다','#7fd05a',11]]});}sy0+=10;
  for(const tg in SH.RTAG){const n=E.sets[tg]|0;const T=SH.RTAG[tg];const S2=SH.RSET[tg];const on2=n>=2,on4=n>=4;rGlyph(tg,sx0,sy0,n?T.c:'#3a3442');txt(`${n}`,sx0+11,sy0+4,9,on4?'#ffd35a':on2?T.c:'#6b6275');
    uiRects.push({x:sx0,y:sy0,w:28,h:9,tip:[[`${T.n} 계열 ${n}개`,T.c,12],...S2.map(([k,d2])=>[`${k}개: ${d2}`,n>=k?'#7fd05a':'#6b6275',11])]});sy0+=11;}
  // 보관함
  const iy=gy+B.h*(sz+1)+6;txt(`보관함 ${I.length}/${SH.RINV_MAX}`,x+6,iy+2,9,'#9e937a');const isz=18;
  for(let k=0;k<SH.RINV_MAX;k++){const c=k%8,r=(k/8)|0;const sx=x+6+c*(isz+2),sy=iy+8+r*(isz+2);const q=I[k];const hov=mouse.x>=sx&&mouse.x<sx+isz&&mouse.y>=sy&&mouse.y<sy+isz;
    pr(sx,sy,isz,isz,sel&&sel.w==='i'&&sel.i===k?PAL.y:hov?PAL.G:PAL.k);if(!q)pr(sx+1,sy+1,isz-2,isz-2,'#15111a');rCell(q,sx,sy,isz,q&&q.t==='r'?q.lv:null);
    uiRects.push({x:sx,y:sy,w:isz,h:isz,click:()=>{if(!q&&G.rsel&&G.rsel.w==='b'){const s0=G.rsel;G.rsel=null;net({t:'rmove',a:s0,b:{w:'i',i:I.length}});return;}if(q)pick({w:'i',i:k});},right:q&&q.t==='s'?null:null,tip:q?rTip(q):null});}
  const by=iy+8+2*(isz+2)+2;
  if(sel&&sel.w==='i'&&I[sel.i])button(x+w-50,by,44,12,'분해',()=>{const i=sel.i;G.rsel=null;net({t:'rdel',i});sfx('pick');},{size:9,tip:[['선택한 것을 분해','#ff9a7a',11],['마력 가루로 바꿔요 (되돌릴 수 없음)','#9e937a',10]]});
  txt(G.rsel?'놓을 칸을 클릭 (같은 칸: 취소)':'클릭: 집기·놓기 · 우클릭: 석판 회전 / 보관함으로',x+6,by+6,8,'#6b6275');
  txt(G.S&&G.S.rl?'유물 효과 켜짐 (결투장 제외 어디서나)':'결투장에서는 유물 효과가 꺼져요',x+w/2,y+h-8,9,G.S&&G.S.rl?'#7fd05a':'#c9a0e8','center');}
function drawInv(){const ch=G.ch;if(!ch)return;const x=294,y=38,w=180,h=194;panel(x,y,w,h,G.invTab==='skin'?'외형':G.invTab==='relic'?'':'인벤토리');if(G.invTab==='relic')txt('잿불 유물',x+w-8,y+10,12,'#ff9a5a','right');
  const tabs=!G.trade&&!G.fac;if(tabs){button(x+5,y+4,24,12,'가방',()=>{G.invTab='bag';sfx('pick');},{size:9,main:G.invTab!=='skin'&&G.invTab!=='relic'});button(x+31,y+4,24,12,'외형',()=>{G.invTab='skin';sfx('pick');},{size:9,main:G.invTab==='skin',tip:[['꾸미기','#ffd35a',12],['의상 · 무기 · 탈것 · 발자국 · 전설 외형','#e6dcc3',11]]});if(G.ch.rbag&&((G.ch.rinv&&G.ch.rinv.length)||G.ch.rbag.c.some(Boolean)))button(x+57,y+4,24,12,'유물',()=>{G.invTab='relic';G.rsel=null;sfx('pick');},{size:9,main:G.invTab==='relic',tip:[['잿불 유물 가방','#ff7a3a',12],['석판으로 이웃 유물의 레벨을 올려요','#e6dcc3',11]]});}
  if(tabs&&G.invTab==='skin'){drawSkinTab(x,y,w,h);return;}
  if(tabs&&G.invTab==='relic'){drawRelicTab(x,y,w,h);return;}
  const F=G.fac;const selR=G.bs;
  [['weapon','무기'],['armor','갑옷'],['ring','반지']].forEach(([s,l],i)=>{const sx=x+w/2-51+i*38,sy=y+22;itemSlot(sx,sy,26,ch.eq[s],()=>{if(F==='forge'){G.bs={w:'eq',s};G.bsArm=null;sfx('pick');return;}net({t:'uneq',s});sfx('equip');},null,'eq');if(F==='forge'&&selR&&selR.w==='eq'&&selR.s===s)selBox(sx,sy,26);txt(l,sx+13,sy+33,11,'#9e937a','center');});
  const gx=x+w/2-64,gy=y+64;const pg=G.invPg|0,off=pg*20;
  for(let p2=0;p2<2;p2++){const cnt=ch.bag.slice(p2*20,p2*20+20).filter(Boolean).length;button(x+5,gy+p2*30,18,26,String(p2+1),()=>{G.invPg=p2;},{size:10,main:pg===p2,tip:[[`가방 ${p2+1}쪽`,'#ffd35a',12],[`${cnt} / 20칸 사용 중`,'#9e937a',11]]});}
  button(x+w-23,gy,18,40,'정렬',()=>{net({t:'bsort'});G.bs=null;sfx('pick');},{size:9,tip:[['가방 정렬','#ffd35a',12],['무기 → 갑옷 → 반지 순, 같은 부위는 등급·레벨 높은 순','#e6dcc3',11]]});
  for(let q=0;q<20;q++){const i=off+q;const c=q%5,r=(q/5)|0;
    const click=()=>{if(G.trade){tradeToggle(ch.bag[i]);return;}if(F==='forge'){G.bs={w:'bag',i};G.bsArm=null;sfx('pick');return;}if(F==='vault'){net({t:'stput',bi:i});return;}if(mouse.shift){net(showShop?{t:'sell',bi:i}:{t:'drop',bi:i});return;}net({t:'eq',bi:i});sfx('equip');};
    const right=()=>{if(G.trade){tradeToggle(ch.bag[i]);return;}if(F==='forge'){G.bs={w:'bag',i};G.bsArm=null;return;}if(F==='vault'){net({t:'stput',bi:i});return;}net(showShop?{t:'sell',bi:i}:{t:'drop',bi:i});};
    itemSlot(gx+c*26,gy+r*26,24,ch.bag[i],click,right,'bag');if(F==='forge'&&selR&&selR.w==='bag'&&selR.i===i)selBox(gx+c*26,gy+r*26,24);if(G.trade&&ch.bag[i]&&G.trade.me.items.some(t=>t.id===ch.bag[i].id))selBox(gx+c*26,gy+r*26,24);}
  pimg(GOLD,x+10,y+h-15);txt(String(ch.gold),x+21,y+h-12,12,'#ffd35a');txt(G.trade?'클릭: 거래창에 올리기·내리기':F==='forge'?'클릭: 대장간에 올리기':F==='vault'?'클릭: 창고에 넣기':showShop?'우클릭·Shift+클릭: 판매':'우클릭·Shift+클릭: 버리기',x+w-8,y+h-12,10,'#9e937a','right');}
// ---- 외형 탭: 계열 탭 · 미리보기 · 칸 · 장착/해제/구입 ----
// 의상 외형 탭: 캐릭터 전체 모습을 바꾼다 (무기·무기 외형은 그대로)
function drawCosPanel(x,y,w,h){const ch=G.ch,own=ch.cst||[],on=ch.cstOn||null;const list=Object.keys(SH.COSTUMES);const sel=G.skSel&&SH.COSTUMES[G.skSel]?G.skSel:(on||list[0]);
  const bx=x+6,by=y+37;pr(bx,by,54,64,PAL.k);pr(bx+1,by+1,52,62,'#1d1824');
  {const fr=playerFrames(ch.cls,Object.assign(lookOfMe(),{cs:sel}));const ph=Math.floor(time*6)%4;const seq=fr&&fr.walk?fr.walk:null;const s0=seq?seq[ph%seq.length]:null;const s=s0?(s0.r||s0):null;
    if(s&&s.c){const sc=2,sx=bx+27-Math.round(s.w*sc/2),sy=by+60-s.h*sc;pimg(s.c,sx,sy,sc);const ws=SPR.skins&&lookOfMe().sk?skinSprite(lookOfMe().sk,Math.max(0,(ch.eq.weapon&&ch.eq.weapon.rar)|0)):null;if(ws){const hx=sx+(s.hx!=null?s.hx:s.w*0.7)*sc,hy=sy+(s.hy!=null?s.hy:s.h*0.55)*sc;pimg(ws.c,hx-ws.px*sc*0.9,hy-ws.py*sc*0.9,sc*0.9);}}}
  const ix=x+66,iy=y+38,K=SH.COSTUMES[sel],has=own.includes(sel);txt(K.n,ix,iy+3,12,has?'#ffd35a':'#e6dcc3');let ly=iy+17;for(const l of wrapTxt(K.d,10,w-74).slice(0,2)){txt(l,ix,ly,10,'#9e937a');ly+=11;}txt('능력치 변화 없음 · 무기는 그대로',ix,ly,9,'#6b6275');
  txt(has?(on===sel?'입는 중':'보유 중'):`${SH.COS_PRICE.toLocaleString()} 골드`,ix,iy+52,10,has?(on===sel?'#7fd05a':'#bfe3ff'):'#ffd35a');
  if(has){if(on===sel)button(ix,iy+60,50,13,'벗기',()=>{net({t:'cson',id:null});sfx('equip');},{size:9});else button(ix,iy+60,50,13,'입기',()=>{net({t:'cson',id:sel});sfx('equip');},{size:9,main:true});}
  else button(ix,iy+60,64,13,'구입',()=>{if(ch.gold<SH.COS_PRICE){msg('골드가 부족해요','#ff6a5a');return;}net({t:'csbuy',id:sel});sfx('pick');},{size:9,main:true,tip:[['상인 근처에서 살 수 있어요','#ffd35a',11],['의상은 캐릭터마다 따로 모아요','#9e937a',10]]});
  const PER=24,np=Math.max(1,Math.ceil(list.length/PER));if(G.csPgS!==sel){G.csPgS=sel;const si=list.indexOf(sel);if(si>=0)G.csPg=(si/PER)|0;}const pg=Math.max(0,Math.min(np-1,G.csPg|0));G.csPg=pg;
  if(np>1){const py=y+h-15;button(x+w/2-44,py,18,12,'◀',()=>{G.csPg=(pg+np-1)%np;sfx('pick');},{size:9});txt(`${pg+1} / ${np}`,x+w/2,py+7,10,'#e6dcc3','center');button(x+w/2+26,py,18,12,'▶',()=>{G.csPg=(pg+1)%np;sfx('pick');},{size:9});}
  txt(`보유 ${own.length} / ${list.length}`,x+w-8,y+h-12,10,'#9e937a','right');
  const gx=x+7,gy=y+115;list.slice(pg*PER,pg*PER+PER).forEach((k,i)=>{const sx=gx+(i%8)*21,sy=gy+((i/8)|0)*21;const hov=mouse.x>=sx&&mouse.x<sx+20&&mouse.y>=sy&&mouse.y<sy+20;const hv=own.includes(k);
    pr(sx,sy,20,20,k===sel?PAL.y:hov?PAL.G:PAL.k);pr(sx+1,sy+1,18,18,hv?'#2a2233':'#15111a');const fr=SPR.cost&&SPR.cost[SH.COSTUMES[k].row];const s=fr?fr[0].r:null;
    if(s&&s.c){if(!hv)ctx.globalAlpha=0.4;ctx.save();ctx.beginPath();ctx.rect((sx+1)*SC,(sy+1)*SC,18*SC,18*SC);ctx.clip();pimg(s.c,sx+10-s.w/2,sy+22-s.h);ctx.restore();ctx.globalAlpha=1;}
    if(on===k){pr(sx+14,sy+1,5,5,PAL.k);pr(sx+15,sy+2,3,3,'#7fd05a');}
    uiRects.push({x:sx,y:sy,w:20,h:20,click:()=>{G.skSel=k;sfx('pick');},tip:[[SH.COSTUMES[k].n,hv?'#ffd35a':'#e6dcc3',12],[hv?(on===k?'입는 중':'보유 중'):`${SH.COS_PRICE.toLocaleString()} 골드 · 상인에게서 구입`,'#9e937a',11]]});});}
// ---- 외형 창: 탈것 · 발자국 · 전설 ----
const XPV=mk(48,34),XIC=new Map();
function xRender(c,fn){const x=c.getContext('2d');x.clearRect(0,0,c.width,c.height);const w0=wx,n0=parts.length;wx=x;try{fn();}catch(err){}finally{wx=w0;parts.length=Math.min(parts.length,n0);}}
function xPreview(kind,k){const [c]=XPV;const lk=Object.assign({},lookOfMe());if(kind==='mt'){lk.mt=k;lk.lg=null;}else if(kind==='lg'){lk.lg=k;lk.mt=null;}else{lk.mt=null;}
  const cx=kind==='fp'?28:kind==='mt'&&k==='broom'?27:24;
  xRender(c,()=>{if(kind==='fp'&&k){for(let i=0;i<4;i++){const ph=(time*12+i*4.5)%18;const age=ph/12;fpStamp(k,Math.round(23-ph),31+(i%2?1:-1),age,i,1);}}
    drawPlayer0({cls:myCls(),look:lk,dx:cx,dy:30,moving:kind!=='mt',animT:time,face:1,atkAnim:0,atkDur:1,selPv:1},0,0,false);});return c;}
function xIcon(kind,k){let c=XIC.get(kind+k);if(!c){c=kind==='lg'?mk(40,30)[0]:mk(18,18)[0];XIC.set(kind+k,c);}
  xRender(c,()=>{if(kind==='mt'){drawMount(k,9,9,1,time,false,0);drawMount(k,9,9,1,time,false,1);}
    else if(kind==='fp'){for(let i=0;i<3;i++)fpStamp(k,4+i*5,9+(i%2?3:-2),((time*0.8+i*0.3)%1.4),i,1);}
    else{const lk=Object.assign({},lookOfMe(),{lg:k,mt:null});drawPlayer0({cls:myCls(),look:lk,dx:20,dy:27,moving:false,animT:time,face:1,atkAnim:0,atkDur:1,selPv:1,noSh:1},0,0,false);}});return c;}
function drawXPanel(kind,x,y,w,h){const ch=G.ch;const T=kind==='mt'?SH.MOUNTS:kind==='fp'?SH.FOOTS:SH.LEGENDS;const list=Object.keys(T);
  const own=kind==='mt'?(ch.mts||[]):kind==='fp'?(ch.fps||[]):list.filter(k=>SH.legendOk(ch,k));const on=kind==='mt'?ch.mtOn||null:kind==='fp'?ch.fpOn||null:ch.lgOn||null;
  const price=kind==='mt'?SH.MOUNT_PRICE:kind==='fp'?SH.FOOT_PRICE:0;const sel=G.skSel&&T[G.skSel]?G.skSel:(on||list[0]);const K=T[sel];const has=own.includes(sel);
  const bx=x+6,by=y+37;pr(bx,by,54,64,PAL.k);pr(bx+1,by+1,52,62,'#1d1824');{const c=xPreview(kind,sel);ctx.save();ctx.beginPath();ctx.rect((bx+1)*SC,(by+1)*SC,52*SC,62*SC);ctx.clip();pimg(c,bx+27-c.width,by+62-c.height*2+2,2);ctx.restore();}
  const ix=x+66,iy=y+38;txt(K.n,ix,iy+3,12,has?'#ffd35a':'#e6dcc3');let ly=iy+17;for(const l of wrapTxt(K.d,10,w-74).slice(0,2)){txt(l,ix,ly,10,'#9e937a');ly+=11;}
  const sub=kind==='mt'?'마을에서만 타요 · 속도 변화 없음':kind==='fp'?'걸으면 잠깐 남았다 사라져요':'획득: '+K.how;txt(sub,ix,iy+40,9,kind==='lg'&&!has?'#ff9a7a':'#6b6275');
  const OK={mt:['mton','탈것'],fp:['fpon','발자국'],lg:['lgon','전설 외형']}[kind];
  txt(has?(on===sel?'사용 중':'보유 중'):kind==='lg'?'아직 얻지 못했어요':`${price.toLocaleString()} 골드`,ix,iy+52,10,has?(on===sel?'#7fd05a':'#bfe3ff'):kind==='lg'?'#9e937a':'#ffd35a');
  if(has){if(on===sel)button(ix,iy+60,50,13,'해제',()=>{net({t:OK[0],id:null});sfx('equip');},{size:9});else button(ix,iy+60,50,13,kind==='mt'?'타기':'사용',()=>{net({t:OK[0],id:sel});sfx('equip');},{size:9,main:true});}
  else if(kind!=='lg')button(ix,iy+60,64,13,'구입',()=>{if(ch.gold<price){msg('골드가 부족해요','#ff6a5a');return;}net({t:kind==='mt'?'mtbuy':'fpbuy',id:sel});sfx('pick');},{size:9,main:true,tip:[['상인 근처에서 살 수 있어요','#ffd35a',11],[`${OK[1]}은 캐릭터마다 따로 모아요`,'#9e937a',10]]});
  const gx=x+7,gy=y+115;list.forEach((k,i)=>{const sx=gx+(i%8)*21,sy=gy+((i/8)|0)*21;const hov=mouse.x>=sx&&mouse.x<sx+20&&mouse.y>=sy&&mouse.y<sy+20;const hv=own.includes(k);
    pr(sx,sy,20,20,k===sel?PAL.y:hov?PAL.G:PAL.k);pr(sx+1,sy+1,18,18,hv?'#2a2233':'#15111a');const c=xIcon(kind,k);if(!hv)ctx.globalAlpha=0.4;ctx.save();ctx.beginPath();ctx.rect((sx+1)*SC,(sy+1)*SC,18*SC,18*SC);ctx.clip();if(kind==='lg')pimg(c,sx+10-c.width*0.25,sy+9-c.height*0.25,0.5);else pimg(c,sx+1,sy+1);ctx.restore();ctx.globalAlpha=1;
    if(on===k){pr(sx+14,sy+1,5,5,PAL.k);pr(sx+15,sy+2,3,3,'#7fd05a');}
    uiRects.push({x:sx,y:sy,w:20,h:20,click:()=>{G.skSel=k;sfx('pick');},tip:[[T[k].n,hv?'#ffd35a':'#e6dcc3',12],[kind==='lg'?(hv?(on===k?'사용 중':'보유 중'):'획득: '+T[k].how):hv?(on===k?'사용 중':'보유 중'):`${price.toLocaleString()} 골드 · 상인에게서 구입`,'#9e937a',11]]});});
  if(kind==='lg')txt('전설 외형은 돈으로 살 수 없어요 · 의상 위에 덮어써요',x+w/2,y+h-28,9,'#9e937a','center');
  pimg(GOLD,x+10,y+h-15);txt(String(ch.gold),x+21,y+h-12,12,'#ffd35a');txt(`보유 ${own.length} / ${list.length}`,x+w-8,y+h-12,10,'#9e937a','right');}
function drawSkinTab(x,y,w,h){const ch=G.ch;const myF=CLASSES[ch.cls].fam;const fam=G.skFam||myF;const own=ch.skins||[],on=(ch.skinOn||{})[fam]||null;
  const isW=!!SH.FAMN[fam];const FT=[['cos','의상'],['w','무기'],['mt','탈것'],['fp','발자국'],['lg','전설']];FT.forEach(([f,l],i)=>button(x+6+i*34,y+20,32,13,l,()=>{G.skFam=f==='w'?(G.skWf||myF):f;G.skSel=null;sfx('pick');},{size:9,main:f==='w'?isW:fam===f}));
  if(fam==='cos'){drawCosPanel(x,y,w,h);return;}
  if(fam==='mt'||fam==='fp'||fam==='lg'){drawXPanel(fam,x,y,w,h);return;}
  G.skWf=fam;[['melee','근접'],['bow','활'],['staff','지팡이'],['gun','총']].forEach(([f,l],i)=>button(x+w/2-80+i*40,y+h-30,38,12,l+(f===myF?'★':''),()=>{G.skFam=f;G.skWf=f;G.skSel=null;sfx('pick');},{size:8,main:fam===f,tip:f===myF?[['내 직업 계열','#ffd35a',11]]:undefined}));
  const list=Object.keys(SH.SKINS).filter(k=>SH.SKINS[k].fam===fam);const sel=G.skSel&&SH.SKINS[G.skSel]&&SH.SKINS[G.skSel].fam===fam?G.skSel:(on||list[0]||null);
  // 미리보기: 내 직업 계열이면 내 캐릭터가 든 모습, 아니면 무기만 크게
  const bx=x+6,by=y+37;pr(bx,by,54,64,PAL.k);pr(bx+1,by+1,52,62,'#1d1824');
  if(sel&&SPR.skins){const rar=Math.max(0,(ch.eq.weapon&&ch.eq.weapon.rar)|0);const ws=skinSprite(sel,rar);
    if(fam===myF){const fr=playerFrames(ch.cls,Object.assign(lookOfMe(),{sk:sel}));const s=fr&&fr.idle?(fr.idle[0].r||fr.idle[0]):null;
      if(s&&s.c){const sc=2,sx=bx+27-Math.round(s.w*sc/2),sy=by+60-s.h*sc;pimg(s.c,sx,sy,sc);if(ws){const hx=sx+(s.hx!=null?s.hx:s.w*0.7)*sc,hy=sy+(s.hy!=null?s.hy:s.h*0.55)*sc;pimg(ws.c,hx-ws.px*sc*0.9,hy-ws.py*sc*0.9,sc*0.9);}}
      else if(ws)pimg(ws.c,bx+27-ws.c.width,by+8,2);}
    else if(ws)pimg(ws.c,bx+27-ws.c.width,by+32-ws.c.height,2);}
  // 정보
  const ix=x+66,iy=y+38;if(sel){const K=SH.SKINS[sel];const has=own.includes(sel);txt(K.n,ix,iy+3,12,has?'#ffd35a':'#e6dcc3');let ly=iy+17;for(const l of wrapTxt(K.d,10,w-74).slice(0,2)){txt(l,ix,ly,10,'#9e937a');ly+=11;}
    txt(has?(on===sel?'장착 중':'보유 중'):`${SH.SKIN_PRICE.toLocaleString()} 골드`,ix,iy+42,10,has?(on===sel?'#7fd05a':'#bfe3ff'):'#ffd35a');
    if(has){if(on===sel)button(ix,iy+50,50,13,'해제',()=>{net({t:'skon',f:fam,id:null});sfx('equip');},{size:9});else button(ix,iy+50,50,13,'장착',()=>{net({t:'skon',f:fam,id:sel});sfx('equip');},{size:9,main:true});}
    else button(ix,iy+50,64,13,'구입',()=>{if(ch.gold<SH.SKIN_PRICE){msg('골드가 부족해요','#ff6a5a');return;}net({t:'skbuy',id:sel});sfx('pick');},{size:9,main:true,tip:[['상인 근처에서 살 수 있어요','#ffd35a',11],['외형은 캐릭터마다 따로 모아요','#9e937a',10]]});}
  // 칸
  const PER=16,np=Math.max(1,Math.ceil(list.length/PER));if(G.skPgF!==fam){G.skPgF=fam;G.skPg=sel&&list.indexOf(sel)>=0?(list.indexOf(sel)/PER)|0:0;}const pg=Math.max(0,Math.min(np-1,G.skPg|0));G.skPg=pg;
  const gx=x+w/2-84,gy=y+106;list.slice(pg*PER,pg*PER+PER).forEach((k,i)=>{const c=i%8,r=(i/8)|0,sx=gx+c*21,sy=gy+r*21;const hov=mouse.x>=sx&&mouse.x<sx+20&&mouse.y>=sy&&mouse.y<sy+20;const has=own.includes(k);
    pr(sx,sy,20,20,k===sel?PAL.y:hov?PAL.G:PAL.k);pr(sx+1,sy+1,18,18,has?'#2a2233':'#15111a');const ws=SPR.skins&&skinSprite(k,0);
    if(ws){if(!has)ctx.globalAlpha=0.35;const sc=Math.min(1,17/Math.max(ws.c.width,ws.c.height));pimg(ws.c,sx+10-ws.c.width*sc/2,sy+10-ws.c.height*sc/2,sc);ctx.globalAlpha=1;}
    if(on===k){pr(sx+14,sy+1,5,5,PAL.k);pr(sx+15,sy+2,3,3,'#7fd05a');}
    uiRects.push({x:sx,y:sy,w:20,h:20,click:()=>{G.skSel=k;sfx('pick');},tip:[[SH.SKINS[k].n,has?'#ffd35a':'#e6dcc3',12],[has?(on===k?'장착 중':'보유 중'):`${SH.SKIN_PRICE.toLocaleString()} 골드 · 상인에게서 구입`,'#9e937a',11]]});});
  if(np>1){const py=gy+43;button(x+w/2-44,py,18,12,'◀',()=>{G.skPg=(pg+np-1)%np;sfx('pick');},{size:9});txt(`${pg+1} / ${np}`,x+w/2,py+7,10,'#e6dcc3','center');button(x+w/2+26,py,18,12,'▶',()=>{G.skPg=(pg+1)%np;sfx('pick');},{size:9});}
  if(!list.length)txt('이 계열 외형은 아직 없어요',x+w/2,gy+10,10,'#6b6275','center');
  pimg(GOLD,x+10,y+h-15);txt(String(ch.gold),x+21,y+h-12,12,'#ffd35a');txt(`보유 ${own.length} / ${Object.keys(SH.SKINS).length}`,x+w-8,y+h-12,10,'#9e937a','right');}
// ---- 플레이어 간 거래 ----
function tradeToggle(it){const T=G.trade;if(!T||!it)return;const ids=T.me.items.map(x=>x.id);const k=ids.indexOf(it.id);if(k>=0)ids.splice(k,1);else{if(ids.length>=6){msg('거래창에는 6개까지 올릴 수 있어요','#ff6a5a');return;}ids.push(it.id);}net({t:'tset',ids});sfx('pick');}
function tradeGold(v,set){const T=G.trade;if(!T)return;const g=v==='all'?G.ch.gold:set?Math.max(0,Math.min(G.ch.gold,v|0)):v===0?0:Math.min(G.ch.gold,T.me.gold+v);net({t:'tset',gold:g});}
function drawTradeReq(){const rq=G.treq;if(!rq)return;if(time-rq.t>30){net({t:'tans',from:rq.from,ok:false});G.treq=null;return;}const w=200,h=40,x=240-w/2,y=G.invite?74:30;panel(x,y,w,h);
  txt(`${rq.name}님이 거래를 신청했습니다`,x+w/2,y+10,12,'#ffd35a','center');button(x+30,y+20,64,15,'수락 (Y)',()=>{net({t:'tans',from:rq.from,ok:true});G.treq=null;},{main:true});button(x+106,y+20,64,15,'거절 (N)',()=>{net({t:'tans',from:rq.from,ok:false});G.treq=null;});}
function drawTrade(){const T=G.trade;if(!T||!G.ch)return;const x=6,y=38,w=284,h=194;panel(x,y,w,h,`거래 · ${T.name}`);
  const side=(S,ox,title,mine)=>{txt(title,ox+64,y+24,12,mine?'#ffd35a':'#8fd0ff','center');
    for(let i=0;i<6;i++){const c=i%3,r=(i/3)|0,sx=ox+14+c*34,sy=y+32+r*34;const it=S.items[i];itemSlot(sx,sy,28,it||null,mine&&it?()=>tradeToggle(it):null,mine&&it?()=>tradeToggle(it):null,'trade');}
    pimg(GOLD,ox+14,y+104);txt(S.gold.toLocaleString(),ox+26,y+107,13,'#ffd35a');
    const st=S.ok?['거래 확정','#7fd05a']:S.lock?['확인함','#ffd35a']:['올리는 중…','#9e937a'];pr(ox+10,y+116,108,14,S.ok?'rgba(60,110,40,0.6)':S.lock?'rgba(110,90,30,0.6)':'rgba(10,7,14,0.6)');txt(st[0],ox+64,y+123,11,st[1],'center');};
  side(T.me,x+8,'내가 줄 것',true);side(T.them,x+148,`${T.name}님이 줄 것`,false);pr(x+w/2,y+20,1,118,PAL.m);
  // 골드 조절
  const gy=y+140;txt('골드',x+14,gy+6,11,'#9e937a');button(x+40,gy,62,13,'직접 입력',()=>askNumber(x+40,gy-2,110,T.me.gold||'',v=>tradeGold(v,true)),{size:10,main:true,tip:[['보낼 골드를 숫자로 입력하고 Enter','#e6dcc3',11],[`보유 ${G.ch.gold.toLocaleString()} 골드까지`,'#9e937a',11]]});[['+1천',1000],['+1만',10000],['+10만',100000],['전부','all'],['0',0]].forEach(([l,v],i)=>button(x+106+i*34,gy,31,13,l,()=>tradeGold(v),{size:10}));
  const both=T.me.lock&&T.them.lock;
  if(!T.me.lock)button(x+14,y+h-24,120,16,'확인 (내용 잠그기)',()=>net({t:'tlock'}),{main:true,size:11,tip:[['양쪽 모두 확인하면 거래 확정 버튼이 열려요','#e6dcc3',11],['내용을 바꾸면 확인이 풀려요','#9e937a',11]]});
  else if(!T.me.ok)button(x+14,y+h-24,120,16,both?'거래 확정':'상대 확인 기다리는 중',()=>{if(both)net({t:'tok'});},{main:both,size:11,dis:!both});
  else txt('상대의 확정을 기다리는 중…',x+74,y+h-16,11,'#7fd05a','center');
  button(x+w-84,y+h-24,70,16,'취소 (Esc)',()=>net({t:'tcancel'}),{size:11});
  txt('인벤토리에서 아이템을 클릭해 올리세요',x+w/2,y+h-34,10,'#6b6275','center');}
function selBox(x,y,s){const c=(time*4|0)%2?'#ffd35a':'#ff8a1f';pr(x-1,y-1,s+2,1,c);pr(x-1,y+s,s+2,1,c);pr(x-1,y-1,1,s+2,c);pr(x+s,y-1,1,s+2,c);}
function drawShop(){const x=6,y=38,w=172,h=194;panel(x,y,w,h,'상인');const price=SH.potPrice(G.ch?G.ch.lvl:1);
  pimg(POT_HP,x+8,y+18);txt('체력 물약',x+26,y+24,11,'#ff7a6a');txt(`${price}골드`,x+26,y+33,10,'#ffd35a');button(x+w-50,y+20,42,14,'구입',()=>net({t:'buy',k:'hp'}),{size:11});
  pimg(POT_MP,x+8,y+38);txt('마나 물약',x+26,y+44,11,'#8fd0ff');txt(`${price}골드`,x+26,y+53,10,'#ffd35a');button(x+w-50,y+40,42,14,'구입',()=>net({t:'buy',k:'mp'}),{size:11});
  pr(x+8,y+62,w-16,1,PAL.m);txt('장비',x+10,y+70,11,'#9e937a');const sh=G.shop;
  if(sh){txt(`새 물건까지 ${Math.floor(sh.refresh/60)}분`,x+w-10,y+70,10,'#6b6275','right');
    sh.items.forEach((it,i)=>{const c=i%3,r=(i/3)|0,sx=x+14+c*52,sy=y+78+r*40;itemSlot(sx,sy,24,it,()=>net({t:'shopbuy',id:it.id}),null,'shop');txt(`${it.price}`,sx+12,sy+30,10,G.ch&&G.ch.gold>=it.price?'#ffd35a':'#e0574a','center');});
    const hw=(w-24)/2;button(x+10,y+h-20,hw,14,'스킬 초기화',()=>net({t:'respec'}),{size:10,tip:[['스킬 포인트를 모두 돌려받아요','#e6dcc3',11],[`비용 ${sh.respec} 골드`,'#ffd35a',11]]});button(x+14+hw,y+h-20,hw,14,'능력치 초기화',()=>net({t:'srespec'}),{size:10,tip:[['힘·민첩·체력·에너지에 쓴 포인트를 모두 돌려받아요','#e6dcc3',11],[`비용 ${sh.respec} 골드`,'#ffd35a',11]]});}
  else txt('불러오는 중...',x+w/2,y+100,11,'#6b6275','center');
  let fn=0,fg=0;if(G.ch&&G.ch.fish)for(const f of SH.FISH){const c=G.ch.fish[f.id]|0;fn+=c;fg+=c*f.v;}
  {const hw=(w-24)/2;button(x+10,y+h-35,hw,13,'외형 상점',()=>{showInv=true;G.invTab='skin';sfx('pick');},{size:10,main:true,tip:[['꾸미기 상점','#ffd35a',12],['의상 · 무기 외형 · 탈것 · 발자국','#e6dcc3',11],['능력치는 그대로, 모습만 바뀌어요 · 전설 외형은 업적으로만','#9e937a',10]]});
  if(fn)button(x+14+hw,y+h-35,hw,13,`물고기 팔기 +${fg}`,()=>net({t:'sellfish'}),{size:9,main:true,tip:[[`물고기 ${fn}마리 팔기`,'#ffd35a',11]]});else txt('판매: 가방에서 우클릭',x+14+hw+hw/2,y+h-28,9,'#9e937a','center');}}
// 계단 위에 서면: 내려갈지 묻기
function drawStairsAsk(){if(G.kind!=='dungeon'||!G.map){G.stairsAsk=null;return;}const tx=Math.floor(me.x/TS),ty=Math.floor(me.y/TS);let on=false;for(let j=-1;j<=1&&!on;j++)for(let i=-1;i<=1;i++)if(SH.tileAt(G.map,tx+i,ty+j)===2){on=true;break;}if(!on){G.stairsAsk=null;return;}
  const f=G.stairsAsk.floor,th=SH.themeOf(f);const w=210,h=84,x=240-w/2,y=26;panel(x,y,w,h,null);txt(`지하 ${f}층으로 내려가시겠습니까?`,240,y+16,13,'#ffd35a','center');
  txt((f%5===0?'보스가 기다리는 층 · ':'')+(th.corrupt?'타락한 ':'')+th.t.n,240,y+31,11,f%5===0?'#ff6a5a':'#d2c7ab','center');const pt=G.party;if(pt&&pt.members.length>1)txt('파티 전원이 3초 뒤 함께 내려갑니다',240,y+44,10,'#a79db3','center');
  button(x+14,y+h-24,86,16,'내려가기 (F)',()=>{net({t:'descend'});G.stairsAsk=null;},{main:true,size:11});button(x+w-100,y+h-24,86,16,'머무르기 (Esc)',()=>{G.stairsAsk=null;},{size:11});}
// ================= DLC 4막 · 잿빛 황야 (클라이언트) =================
function inField(){return !!(G.map&&G.map.field&&G.field&&G.kind==='dungeon');}
function fieldBases(){return inField()?G.map.bases:[];}
function fieldBaseSt(i){const r=G.field&&G.field.b&&G.field.b[i];return r?{st:r[1],t:r[2],k:r[3],need:r[4]}:{st:0};}
function fieldTick(){if(!inField())return;const r=SH.fieldRegion(G.map,me.x,me.y);if(r<0)return;if(r!==G.fReg){const first=G.fReg==null||G.fReg<0;G.fReg=r;G.floor=SH.FIELD_FLOOR[r];const R=G.map.regions[r];if(!first)banner={t:0,a:R.n,b:`권장 레벨 ${R.lv} · ${pick(SH.WASTE_THEMES[r].lines)}`};drawMini();}}
function nearFieldSpot(){if(!inField())return null;const c=G.map.camp;if(Math.hypot(me.x-c.x,me.y-c.y)<44)return{camp:1};for(const b of G.map.bases)if(Math.hypot(me.x-b.x,me.y-b.y)<42)return{b};return null;}
function fieldInteract(){{const FB=G.field&&G.field.fb;const S=FB&&FB[1];if(S&&S.cand){const i=S.cand.findIndex(([x,y,lit])=>!lit&&Math.hypot(me.x-x,me.y-y)<24);if(i>=0){net({t:'fcand',i});sfx('pick');return true;}}}const s=nearFieldSpot();if(!s)return false;if(s.camp){G.ftpMenu=true;return true;}const st=fieldBaseSt(s.b.id);if(st.st===2){G.ftpMenu=true;return true;}if(st.st===0){net({t:'fact',i:s.b.id});return true;}return true;}
function drawBrazier(sx,sy,lit,ev,big){const K='#14100c',S1='#4a4038',S2='#6b5e50';pr_w(sx-6,sy-3,13,4,K);pr_w(sx-5,sy-2,11,2,S1);pr_w(sx-4,sy-8,9,6,K);pr_w(sx-3,sy-7,7,4,S2);pr_w(sx-2,sy-1,5,4,S1);
  if(lit||ev){const t=time*8;for(let i=-2;i<=2;i++){const h=(lit?7:4)+Math.round(Math.sin(t+i*1.7)*2)-Math.abs(i);for(let j=0;j<h;j++)pr_w(sx+i,sy-8-j,1,1,j<h*0.4?'#ffd35a':j<h*0.75?'#ff8a1f':'#c0283a');}if(R()<(lit?0.3:0.15))part(sx+icxW()+rf(-3,3),sy+icyW()-12,rf(-4,4),rf(-22,-10),pick(['o','y']),rf(0.4,0.8),{glow:true});}
  else{pr_w(sx-2,sy-9,5,1,'#2a2622');if((time*2|0)%3===0)pr_w(sx,sy-10,1,1,'#5a5248');}}
function pr_w(x,y,w,h,c){wx.fillStyle=c;wx.fillRect(x|0,y|0,w,h);}
function drawFieldObjs(icx,icy,ents){if(!inField())return;fieldTick();const c=G.map.camp;
  ents.push({y:c.y,f:()=>{const sx=Math.round(c.x-icx),sy=Math.round(c.y-icy);drawBrazier(sx,sy,true,false,true);}});
  for(const b of G.map.bases){const sx=Math.round(b.x-icx),sy=Math.round(b.y-icy);if(sx<-80||sy<-80||sx>W+80||sy>H+80)continue;const st=fieldBaseSt(b.id);
    if(st.st===1){wx.save();wx.globalAlpha=0.25+0.1*Math.sin(time*5);wx.strokeStyle='#ff8a1f';wx.beginPath();wx.ellipse(sx,sy,70,40,0,0,Math.PI*2);wx.stroke();wx.restore();}
    else if(st.st===0){wx.save();wx.globalAlpha=0.18;wx.strokeStyle='#9e937a';wx.setLineDash&&wx.setLineDash([3,3]);wx.beginPath();wx.ellipse(sx,sy,22,12,0,0,Math.PI*2);wx.stroke();wx.setLineDash&&wx.setLineDash([]);wx.restore();}
    ents.push({y:b.y,f:()=>{drawBrazier(sx,sy,st.st===2,st.st===1,false);}});}drawFieldBossObjs(icx,icy,ents);}
function drawFieldBossObjs(icx,icy,ents){const FB=G.field&&G.field.fb;if(!FB)return;for(const S of FB){if(!S)continue;
    if(S.cand)S.cand.forEach(([x,y,lit],i)=>{const sx=Math.round(x-icx),sy=Math.round(y-icy);ents.push({y,f:()=>{pr_w(sx-2,sy-9,5,9,'#1a1420');pr_w(sx-1,sy-8,3,8,lit?'#e6dcc3':'#5a5248');if(lit){const h=3+((time*10+i)|0)%2;pr_w(sx-1,sy-9-h,3,h,'#8fd0ff');pr_w(sx,sy-10-h,1,2,'#eef8ff');}else if((time*2|0)%2)pr_w(sx,sy-11,1,1,'#3a3442');}});});
    if(S.pil)S.pil.forEach(([x,y,ok])=>{const sx=Math.round(x-icx),sy=Math.round(y-icy);ents.push({y,f:()=>{if(ok){pr_w(sx-4,sy-22,9,22,'#1a3a3a');pr_w(sx-3,sy-21,7,20,'#5ad8c8');pr_w(sx-2,sy-20,2,18,'#bff8f0');pr_w(sx+1,sy-14,1,6,'#2a8a80');}else{pr_w(sx-5,sy-4,11,4,'#2a6a64');pr_w(sx-3,sy-6,3,2,'#5ad8c8');pr_w(sx+2,sy-5,2,1,'#bff8f0');}}});});
    if(S.duel){const [x,y,r,pid,t]=S.duel;wx.save();wx.strokeStyle='#ffd35a';wx.globalAlpha=0.6+0.3*Math.sin(time*6);wx.lineWidth=2;wx.beginPath();wx.arc(x-icx,y-icy,r,0,Math.PI*2);wx.stroke();wx.restore();}}}
function fieldLights(L,icx,icy){if(!inField())return;{const FB=G.field&&G.field.fb;if(FB)for(const S of FB){if(!S)continue;if(S.cand)for(const [x,y,lit] of S.cand)if(lit)L.push({x:x-icx,y:y-icy-10,r:46,i:0.9});if(S.pil)for(const [x,y,ok] of S.pil)if(ok)L.push({x:x-icx,y:y-icy-12,r:30,i:0.6});}}const c=G.map.camp;L.push({x:c.x-icx,y:c.y-icy-8,r:90,i:1});for(const b of G.map.bases){const st=fieldBaseSt(b.id);if(st.st===2)L.push({x:b.x-icx,y:b.y-icy-8,r:96,i:1});else if(st.st===1)L.push({x:b.x-icx,y:b.y-icy-8,r:60+10*Math.sin(time*6),i:0.9});}}
function drawFieldHUD(){if(!inField())return;{const c=G.map.camp;const sx=c.x-camX,sy=c.y-camY;if(sx>-40&&sx<W+40&&sy>-40&&sy<H+40)txt('야영지',sx,sy-26,9,'#ffd35a','center');}const r=G.fReg|0;const R=G.map.regions[r];const bs=G.map.bases.filter(b=>b.reg===r);const own=bs.filter(b=>fieldBaseSt(b.id).st===2).length;const lair=G.field.l&&G.field.l[r];
  pr(150,4,180,24,'rgba(10,7,14,0.7)');txt(`${R.n}`,240,11,11,'#ffd35a','center');txt(`되찾은 화로 ${own}/${bs.length}${lair?' · 보스 둥지 열림':''} · 권장 Lv ${R.lv}`,240,22,9,lair?'#ff9a5a':'#9e937a','center');
  const evs=G.map.bases.filter(b=>fieldBaseSt(b.id).st===1);for(const b of evs){const st=fieldBaseSt(b.id);const d=Math.hypot(me.x-b.x,me.y-b.y);pr(150,30,180,14,'rgba(40,14,8,0.8)');txt(`화로 지키기 · ${st.t}초 · 처치 ${st.k}/${st.need}${d>200?' · 화로에서 멀어요!':''}`,240,37,10,st.k>=st.need?'#7fd05a':'#ffb03a','center');break;}
  {const FB=G.field.fb;const S=FB&&FB[1];if(S&&S.cand&&!meDowned()&&S.cand.some(([x,y,lit])=>!lit&&Math.hypot(me.x-x,me.y-y)<24))txt(`${keyLabel(kbCode('act'))}: 촛불 다시 붙이기`,me.x-camX,me.y-camY+12,10,'#8fd0ff','center');
    if(FB)FB.forEach((S2,ri)=>{if(S2&&S2.duel&&S2.duel[3]===myId)txt(`성주의 결투 · ${Math.ceil(S2.duel[4])}초 버티기`,240,52,12,'#ffd35a','center');});}
  const s=nearFieldSpot();if(s&&!meDowned()&&!G.ftpMenu){const K=keyLabel(kbCode('act'));const st=s.b?fieldBaseSt(s.b.id):null;txt(s.camp?`${K}: 야영지 (이동 · 마을로)`:st.st===2?`${K}: 화로 이동`:st.st===1?'화로를 지켜 내세요!':`${K}: 꺼진 화로에 불 붙이기 (적이 몰려와요)`,me.x-camX,me.y-camY+12,10,'#ffd35a','center');}
  if(meDowned()){const R2=G.rrev;const K=keyLabel(kbCode('act'));if(R2&&time<R2.t)txt(`${Math.ceil(R2.t-time)}초 뒤 가까운 화로에서 일어날 수 있어요`,240,138,12,'#ffd35a','center');else if(R2)button(170,132,140,18,`가까운 화로에서 부활 (${K})`,()=>net({t:'rrev'}),{main:true,size:11});}
  if(G.ftpMenu)drawFieldTp();}
function drawFieldTp(){const s=nearFieldSpot();if(!s||!(s.camp||fieldBaseSt(s.b.id).st===2)){G.ftpMenu=false;return;}const own=G.map.bases.filter(b=>fieldBaseSt(b.id).st===2);const w=210,h=60+Math.ceil((own.length+1)/2)*18+(s.camp?20:0),x=240-w/2,y=50;
  panel(x,y,w,h,'화로 이동');let i=0;const btn=(lab,fn,dis)=>{const c=i%2,r=(i/2)|0;button(x+10+c*98,y+24+r*18,94,15,lab,fn,{size:9,dis});i++;};
  btn('야영지',()=>{net({t:'ftp',i:'camp'});G.ftpMenu=false;},!!s.camp);for(const b of own)btn(`${G.map.regions[b.reg].n} ${b.id%3+1}`,()=>{net({t:'ftp',i:b.id});G.ftpMenu=false;},s.b&&s.b.id===b.id);
  if(s.camp)button(x+10,y+h-34,w-20,15,'마을로 돌아가기',()=>{net({t:'fleave'});G.ftpMenu=false;},{main:true,size:10});
  txt('Esc: 닫기',x+w/2,y+h-10,9,'#6b6275','center');}
// 필드 미니맵 (2타일 = 1픽셀)
const [fmC,fmX]=mk(80,60);
function drawMiniField(){if(!inField()||!G.explored)return;const MW=G.map.w;const id=fmX.createImageData(80,60),a=id.data;for(let y=0;y<60;y++)for(let x=0;x<80;x++){let e=0,w=0;for(let j=0;j<2;j++)for(let i=0;i<2;i++){const k=(y*2+j)*MW+x*2+i;if(G.explored[k])e++;if(G.map.tiles[k]===1)w++;}if(!e)continue;const p=(y*80+x)*4;const c=w>=2?[78,70,64]:[26,22,24];a[p]=c[0];a[p+1]=c[1];a[p+2]=c[2];a[p+3]=255;}fmX.putImageData(id,0,0);}
function drawFieldMiniHud(){pr(392,4,84,64,PAL.k);pr(393,5,82,62,'rgba(12,9,16,0.85)');ctx.drawImage(fmC,394*SC,6*SC,80*SC,60*SC);
  for(const b of G.map.bases){const st=fieldBaseSt(b.id).st;const e=G.explored&&G.explored[b.ty*G.map.w+b.tx];if(!e&&st!==2)continue;pr(394+Math.floor(b.tx/2)-1,6+Math.floor(b.ty/2)-1,3,3,st===2?'#ffd35a':st===1?'#ff8a1f':'#6b6275');}
  for(const l of G.map.lairs){const op=G.field.l&&G.field.l[l.reg];pr(394+Math.floor(l.room.x/2+l.room.w/4)-1,6+Math.floor(l.room.y/2+l.room.h/4)-1,3,3,op?'#c0283a':'#3a2a30');}
  pr(394+Math.floor(G.map.start.cx/2)-1,6+Math.floor(G.map.start.cy/2)-1,3,3,'#7fd05a');
  for(const p of G.players.values()){if(p.id===myId)continue;pr(394+Math.floor(p.x/TS/2),6+Math.floor(p.y/TS/2),1,1,'#7fd05a');}
  if((time*4|0)%2===0)pr(393+Math.floor(me.x/TS/2),5+Math.floor(me.y/TS/2),2,2,PAL.e);}
function drawPortalMenu(){const pt=G.party,leader=!pt||pt.leader===myId;const cps=G.ch?G.ch.cps:[1];const rows=Math.ceil(cps.length/3);const w=200,h=86+rows*20+(pt&&pt.inDungeon?22:0),x=240-w/2,y=60;
  panel(x,y,w,h,'던전 입구');
  if(pt&&pt.inDungeon){button(x+20,y+24,w-40,16,'파티의 던전에 합류',()=>{net({t:'enter'});G.portalMenu=false;},{main:true});}
  const oy=y+24+(pt&&pt.inDungeon?22:0);
  txt(leader?'시작할 층을 고르세요 (체크포인트)':'파티장이 층을 고릅니다',x+w/2,oy+4,11,'#9e937a','center');
  cps.forEach((f,i)=>{const c=i%3,r=(i/3)|0;button(x+14+c*58,oy+14+r*20,54,16,`지하 ${f}층`,()=>{net({t:'enter',floor:f});G.portalMenu=false;},{dis:!leader||(pt&&pt.inDungeon)});});
  {const okL=G.ch&&G.ch.lvl>=50;button(x+14,y+h-36,w-28,16,okL?'4막 · 잿빛 황야로 떠나기':'4막 · 잿빛 황야 (Lv50 · 흑월 클리어)',()=>{net({t:'fenter'});G.portalMenu=false;},{main:okL,dis:!okL||!leader&&!(pt&&pt.inDungeon),size:10,tip:[['4막 · 잿빛 황야','#ff9a5a',12],['넓은 황야에서 꺼진 화로를 되찾고 잿불 유물을 모아요','#e6dcc3',11]]});}
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
/* ---- 커뮤니티: 친구(이 브라우저에 저장) · 접속자 목록, 원거리 파티 초대·정보 보기 ---- */
function friends(){try{return JSON.parse(localStorage.getItem('bc_friends')||'[]');}catch(e){return [];}}
function setFriends(a){try{localStorage.setItem('bc_friends',JSON.stringify(a.slice(0,50)));}catch(e){}}
function openComm(on){G.comm=on;if(on){G.anal=false;G.chron=false;G.rec=false;G.talent=false;showSkills=false;showChar=false;closeFac();G.commT=G.commT||'all';G.commPg=0;net({t:'who'});}}
function drawComm(){const x=6,y=38,w=236,h=194;panel(x,y,w,h,'커뮤니티');uiRects.push({x,y,w,h,block:true});button(x+w-18,y+4,12,11,'×',()=>{G.comm=false;},{size:10});
  if(time-(G.whoT||0)>3&&time-(G.whoAsk||0)>3){G.whoAsk=time;net({t:'who'});}
  const fr=friends();const all=G.who||[];const T=G.commT;
  [['all',`접속자 ${all.length}`],['fr',`친구 ${fr.length}`]].forEach(([k,l],i)=>button(x+8+i*62,y+17,58,13,l,()=>{G.commT=k;G.commPg=0;},{size:10,main:T===k}));
  let rows;if(T==='fr'){rows=fr.map(n=>all.find(p=>p.name===n)||{name:n,off:true});rows.sort((a,b)=>(a.off?1:0)-(b.off?1:0));}else rows=all.slice().sort((a,b)=>(b.me?1:0)-(a.me?1:0)||(b.lvl-a.lvl));
  const per=8,pages=Math.max(1,Math.ceil(rows.length/per));G.commPg=Math.min(G.commPg|0,pages-1);const pg=G.commPg;
  const myHub=G.kind==='hub';const pt=G.party;
  rows.slice(pg*per,pg*per+per).forEach((r,i)=>{const ry=y+34+i*18;pr(x+6,ry,w-12,16,r.me?'rgba(90,64,16,0.45)':'rgba(10,7,14,0.5)');
    txt(r.name,x+10,ry+5,11,r.off?'#6b6275':(CLASS_COL[r.cls]||'#e6dcc3'));
    txt(r.off?'접속 안 함':`${CLASSES[r.cls]?CLASSES[r.cls].n:''} ${r.lvl} · ${r.where}${r.pt>1?' · 파티 '+r.pt+'명':''}`,x+10,ry+12,8,r.off?'#4a4452':'#9e937a','left','px');
    if(r.me){txt('나',x+w-12,ry+8,10,'#ffd35a','right');return;}
    let bx=x+w-10;const b=(l,f,o)=>{const bw=l.length>2?30:22;bx-=bw+2;button(bx,ry+2,bw,12,l,f,Object.assign({size:9},o||{}));};
    const isF=fr.includes(r.name);b(isF?'삭제':'친구+',()=>{const a=friends();if(isF)setFriends(a.filter(n=>n!==r.name));else if(!a.includes(r.name)){a.push(r.name);setFriends(a);net({t:'fadd',n:r.name});msg(`${r.name}님을 친구로 추가했어요`,'#8fd0ff');}},{tip:[[isF?'친구 목록에서 지우기':'친구로 추가 (이 기기에 저장돼요)','#e6dcc3',11]]});
    if(!r.off){b('정보',()=>net({t:'insp',id:r.id}));const inMy=pt&&pt.members.some(m=>m.id===r.id);if(!inMy)b('초대',()=>net({t:'inv',id:r.id}),{dis:!(myHub&&r.hub),tip:[[myHub&&r.hub?'파티 초대 보내기':'둘 다 마을에 있을 때 초대할 수 있어요','#e6dcc3',11]]});}});
  if(!rows.length)txt(T==='fr'?'아직 친구가 없어요 · 접속자 탭에서 [친구+]':'접속한 플레이어가 없어요',x+w/2,y+80,11,'#6b6275','center');
  if(pages>1){button(x+8,y+h-18,20,13,'◀',()=>{G.commPg=(pg-1+pages)%pages;},{size:9});txt(`${pg+1} / ${pages}`,x+w/2,y+h-12,10,'#9e937a','center');button(x+w-28,y+h-18,20,13,'▶',()=>{G.commPg=(pg+1)%pages;},{size:9});}
  else txt(`${keyLabel(kbCode('comm'))} 키로 열고 닫기`,x+w/2,y+h-12,9,'#6b6275','center');}
/* ---- 전투력 분석기: 스킬별 피해 비중 ---- */
function openAnal(on){G.anal=on;if(on){G.comm=false;G.chron=false;G.rec=false;G.talent=false;showSkills=false;showChar=false;closeFac();net({t:'an'});G.anAsk=time;}}
function anName(k){if(k==='atk')return'기본 공격';if(k==='etc')return'기타 (펫·반사·효과)';const s=SH.SKILLS[k];return s?s.n:k;}
function drawAnal(){const x=6,y=38,w=236,h=194;panel(x,y,w,h,'전투력 분석기');uiRects.push({x,y,w,h,block:true});button(x+w-18,y+4,12,11,'×',()=>{G.anal=false;},{size:10});
  if(time-(G.anAsk||0)>1){G.anAsk=time;net({t:'an'});}const D=G.anD;
  button(x+8,y+4,40,11,'초기화',()=>{net({t:'anreset'});},{size:9,tip:[['기록을 지우고 새로 재요','#e6dcc3',11]]});
  if(!D||!D.n){txt('아직 기록이 없어요',x+w/2,y+70,12,'#9e937a','center');txt('허수아비·던전·레이드에서 싸우면',x+w/2,y+88,11,'#6b6275','center');txt('스킬별로 넣은 피해가 여기에 쌓여요',x+w/2,y+100,11,'#6b6275','center');return;}
  const rows=Object.entries(D.by).map(([k,b])=>Object.assign({k},b)).sort((a,b)=>b.d-a.d);const tot=rows.reduce((a,b)=>a+b.d,0)||1;
  txt(`총 피해 ${Math.round(tot).toLocaleString()}  ·  ${Math.round(D.dur)}초  ·  초당 ${Math.round(tot/D.dur).toLocaleString()}`,x+w/2,y+22,11,'#ffd35a','center');
  const top=rows[0].d;rows.slice(0,8).forEach((r,i)=>{const ry=y+32+i*18;const pct=r.d/tot;pr(x+8,ry,w-16,16,'rgba(10,7,14,0.55)');pr(x+8,ry,Math.max(1,Math.round((w-16)*r.d/top)),16,i===0?'rgba(140,100,30,0.55)':'rgba(70,56,90,0.55)');
    txt(anName(r.k),x+12,ry+5,11,SH.SKILLS[r.k]&&SH.SKILLS[r.k].ult?'#ffd35a':'#f2eadb');txt(`${(pct*100).toFixed(1)}%`,x+w-12,ry+5,11,'#ffd35a','right');
    txt(`${Math.round(r.d).toLocaleString()}  ·  ${r.h}회  ·  평균 ${Math.round(r.d/r.h)}  ·  치명 ${Math.round(r.c/r.h*100)}%  ·  최대 ${r.mx}${r.dot?'  ·  지속 '+Math.round(r.dot/r.d*100)+'%':''}`,x+12,ry+12,8,'#9e937a','left','px');});
  if(rows.length>8)txt(`외 ${rows.length-8}개`,x+w/2,y+h-20,9,'#6b6275','center');
  txt('마을·던전을 오가도 기록은 이어져요 · 초기화로 새로 재기',x+w/2,y+h-9,9,'#6b6275','center');}
/* 다른 플레이어 정보(스펙) 보기 */
function drawInsp(){const v=G.insp;const AD=v.adv&&SH.ADV[v.adv],AW=AD&&v.awk&&SH.AWK[v.adv];const x=150,y0=30,w=180,h=204+(AD?11:0);panel(x,y0,w,h,`${v.name}`);uiRects.push({x,y:y0,w,h,block:true});button(x+w-18,y0+4,12,11,'×',()=>{G.insp=null;},{size:10});
  const C=CLASSES[v.cls]||{n:'?'};txt(`${C.n} · 레벨 ${v.lvl}${v.title?' · '+v.title:''}`,x+w/2,y0+21,11,CLASS_COL[v.cls]||'#e6dcc3','center');
  if(AD){const t1=`전직 ${AD.n}`,t2=AW?` · 각성 ${AW.n}`:'';const w1=txt(t1,-999,-999,10,'#fff'),w2=t2?txt(t2,-999,-999,10,'#fff'):0;const sx=x+w/2-(w1+w2)/2;txt(t1,sx,y0+32,10,AD.col||'#e6dcc3');if(t2)txt(t2,sx+w1,y0+32,10,AW.col||'#ffd35a');}
  const y=AD?y0+11:y0;
  txt(`전투력 ${(v.cp|0).toLocaleString()}`,x+w/2,y+34,14,'#ffd35a','center');if(G.cp!=null){const dv=v.cp-G.cp;txt(dv===0?'나와 같음':`나보다 ${Math.abs(dv).toLocaleString()} ${dv>0?'높음':'낮음'}`,x+w/2,y+45,10,dv>0?'#ff9a7a':'#7fd05a','center');}
  [['weapon','무기'],['armor','갑옷'],['ring','반지']].forEach(([sl,l],i)=>{const sx=x+w/2-51+i*38,sy=y+53;itemSlot(sx,sy,26,v.eq[sl]||null,null,null,'insp');txt(l,sx+13,sy+32,10,'#9e937a','center');});
  let ly=y+98;const S=v.S||{};const row=(a,b,c)=>{txt(a,x+12,ly,11,'#9e937a');txt(b,x+w-12,ly,11,c||'#e6dcc3','right');ly+=11;};
  row('힘 · 민첩 · 활력 · 에너지',`${S.str||v.str} · ${S.dex||v.dex} · ${S.vit||v.vit} · ${S.ene||v.ene}`);
  if(S.dmgBase)row('공격력',`${Math.round(S.dmgBase*0.8*S.dmgMul)} - ${Math.round(S.dmgBase*1.2*S.dmgMul)}`);if(S.crit!=null)row('치명타',`${S.crit.toFixed(1)}%  x${S.critMul.toFixed(2)}`);if(S.atkRate)row('공격 속도',`${S.atkRate.toFixed(2)} / 초`);
  row('체력 · 방어력',`${S.maxHp||'-'} · ${S.armor||0}`,'#ff9a8a');if(v.cls==='priest'&&S.healPow)row('치유력',String(S.healPow),'#7fd05a');
  const ul=v.ult&&SH.SKILLS[v.ult];row('궁극기',ul?ul.n:'없음',ul?'#ffd35a':'#6b6275');
  const rc=SH.RAIDS.map(r=>(v.rclr[r.id]|0)?`${r.n.split(' ').pop()} ${v.rclr[r.id]}`:null).filter(Boolean);row('최고 기록',`지하 ${v.best}층`);
  txt(rc.length?'레이드 클리어: '+rc.join(' · '):'레이드 클리어 기록 없음',x+w/2,ly+2,9,'#9e937a','center');
  txt('장비에 마우스를 올리면 내 장비와 비교해요 · Esc 닫기',x+w/2,y0+h-8,9,'#6b6275','center');}
function drawCtxMenu(){const c=G.ctxMenu;const p=G.players.get(c.id);if(!p){G.ctxMenu=null;return;}const pt=G.party;const inMy=pt&&pt.members.some(m=>m.id===c.id);
  const items=[];if(!inMy)items.push(['파티 초대',()=>net({t:'inv',id:c.id})]);if(inMy&&pt.leader===myId&&G.kind==='hub')items.push(['파티에서 추방',()=>net({t:'kick',id:c.id})]);if(G.kind==='hub'&&!G.trade)items.push(['거래 신청',()=>net({t:'treq',id:c.id})]);items.push(['정보 보기',()=>net({t:'insp',id:c.id})]);items.push(...duelMenuItems(c));items.push(['닫기',()=>{}]);
  const w=80,h=16+items.length*16;let x=Math.min(c.x,W-w-2),y=Math.min(c.y,H-h-2);panel(x,y,w,h);txt(p.name||'',x+w/2,y+8,11,'#ffd35a','center');
  items.forEach(([l,f],i)=>button(x+4,y+14+i*16,w-8,14,l,()=>{f();G.ctxMenu=null;},{size:11}));}
function drawInvite(){const iv=G.invite;if(!iv)return;if(time-iv.t>30){net({t:'ians',from:iv.from,ok:false});G.invite=null;return;}const w=200,h=40,x=240-w/2,y=30;panel(x,y,w,h);
  txt(`${iv.name}님이 파티에 초대했습니다`,x+w/2,y+10,12,'#ffd35a','center');button(x+30,y+20,64,15,'수락 (Y)',()=>{net({t:'ians',from:iv.from,ok:true});G.invite=null;},{main:true});button(x+106,y+20,64,15,'거절 (N)',()=>{net({t:'ians',from:iv.from,ok:false});G.invite=null;});}
/* 채팅: 열려 있거나(Enter) 채팅 영역에서 휠을 굴리면 이전 글을 스크롤해서 볼 수 있음 */
function chatRows(){const rows=[];for(const l of G.chatLog){const nw=tw(l.name+':',11);const ws=wrapTxt(l.m,11,168-nw);ws.forEach((m,k)=>rows.push({l,name:k===0?l.name+':':null,m,ind:k===0?0:nw+2}));}return rows;}
function chatOpenView(){return document.activeElement===chatBox||time-(G.chatPeek||-99)<6;}
function chatScroll(d){const n=chatRows().length;G.chatOff=Math.max(0,Math.min(Math.max(0,n-8),(G.chatOff|0)+d));G.chatPeek=time;}
function drawChat(){const open=chatOpenView();if(!open)G.chatOff=0;const rows=chatRows();let lines;
  if(open){const end=rows.length-(G.chatOff|0);lines=rows.slice(Math.max(0,end-8),end);}else lines=rows.filter(r=>time-r.l.t<12).slice(-6);
  let y=200-lines.length*10;if(open){pr(4,y-6,178,lines.length*10+8,'rgba(8,6,12,0.72)');uiRects.push({x:4,y:y-6,w:178,h:lines.length*10+8,block:true});
    const above=Math.max(0,rows.length-(G.chatOff|0)-lines.length);if(above>0)txt(`▲ 이전 글 ${above}줄 · 휠/PgUp`,178,y-11,9,'#9e937a','right');if(G.chatOff>0)txt(`▼ 최신 글 ${G.chatOff}줄 · 휠/PgDn`,178,y+lines.length*10-2,9,'#8fd0ff','right');}
  for(const r of lines){ctx.globalAlpha=open?1:Math.min(1,(12-(time-r.l.t))/2);let nw=r.ind;if(r.name)nw=txt(r.name,8,y,11,'#ffd35a')+2;txt(r.m,8+nw,y,11,'#e6dcc3');y+=10;}ctx.globalAlpha=1;}
cv.addEventListener('wheel',e=>{if(scene!=='game')return;const r=cv.getBoundingClientRect();const lx=(e.clientX-r.left)/r.width*W,ly=(e.clientY-r.top)/r.height*H;if(chatOpenView()||(lx<185&&ly>110&&ly<210)){chatScroll(e.deltaY<0?1:-1);e.preventDefault();}},{passive:false});
function drawWorldUI(icx,icy){drawGMLabels();
  for(const m of G.monsters.values()){if(!(m.ea&255)||Math.hypot(m.dx-me.x,m.dy-me.y)>150||lit(m.dx-icx,m.dy-8-icy)<0.2)continue;txt(SH.eaffNames(m.ea).join(' · '),m.dx-icx,m.dy-icy-(SPR.ready?30:25),9,'#8fd0ff','center');}
  for(const m of G.monsters.values()){if(m.hp>=m.maxHp||isBossTc(m.tc))continue;if(lit(m.dx-icx,m.dy-8-icy)<0.2)continue;const bx=Math.round(m.dx-icx)-6,by=Math.round(m.dy-icy)-(SPR.ready?24:19);pr(bx,by,12,2,PAL.k);pr(bx,by,Math.max(1,Math.round(12*m.hp/m.maxHp)),2,PAL.e);}
  for(const p of G.players.values()){const isMe=p.id===myId;const px=(isMe?me.x:p.dx)-icx,py=(isMe?me.y:p.dy)-icy;
    const foeP=inArena()&&teamOf(p.id)!==undefined&&teamOf(p.id)!==teamOf(myId);
    {const tt=isMe?myTitle():(p.look&&p.look.ttl);if(tt&&(!isMe||G.kind==='hub'))txt(tt,px,py-(SPR.ready?36:31),9,'#c9a0e8','center');}
    if(!isMe||G.kind==='hub'){txt(p.name||'',px,py-(SPR.ready?27:22),11,isMe?'#ffd35a':foeP?'#ff6a5a':(G.party&&G.party.members.some(m=>m.id===p.id))?'#7fd05a':'#e6dcc3','center');}
    if(!isMe&&G.kind==='dungeon'){const f=p.maxHp?p.hp/p.maxHp:0;const hy=SPR.ready?23:18;const bw=foeP?20:12;pr(px-bw/2,py-hy,bw,2,PAL.k);pr(px-bw/2,py-hy,Math.max(0,Math.round(bw*f)),2,foeP?'#e0303a':'#7fd05a');}
    if(p.downed&&p.rev>0){pr(px-10,py+4,20,3,PAL.k);pr(px-10,py+4,Math.round(20*p.rev),3,PAL.y);}
    const b=G.bubbles.get(p.id);if(b){const bw=Math.min(150,tw(b.m,11)+8);const bx=px-bw/2,by=py-40;pr(bx,by,bw,12,PAL.k);pr(bx+1,by+1,bw-2,10,'#e6dcc3');pr(px-1,by+12,3,2,'#e6dcc3');const b2=tbitmap(b.m,11,'#1b1622');ctx.save();ctx.beginPath();ctx.rect((bx+1)*SC,(by+1)*SC,(bw-2)*SC,10*SC);ctx.clip();ctx.drawImage(tbitmap(b.m,11,'#0e0b12'),Math.round((px)*SC-Math.min(b2.width,(bw-2)*SC)/2),Math.round((by+6)*SC-b2.height/2));ctx.restore();}}
  if(G.kind==='hub'){const m=G.map.merchant;txt('상인',m.x-icx,m.y-icy-(SPR.ready?26:20),11,'#ffd35a','center');
    if(G.map.fish)txt('낚시터',G.map.fish.x-icx,G.map.fish.y-icy+30,11,'#8fd0ff','center');
    for(const f of FAC){if(f.id==='merchant')continue;const p=facProp(f);if(!p)continue;const r=propSz(p.t);txt(f.n,p.x-icx,p.y-icy-(r?r[1]:30)-4,f.id==='portal'?12:11,f.id==='portal'?'#ff8a7a':'#ffd35a','center');}
    {const rs=G.map.raidStone;if(rs)txt('레이드 석판',rs.x-icx,rs.y-icy-46,11,'#ff8a9a','center');const cs=G.map.clashpr;if(cs&&!G.cpr)txt('격돌 수련석',cs.x-icx,cs.y-icy-34,10,'#c9a0e8','center');const rb=G.map.rank;if(rb)txt('마을 랭킹 게시판',rb.x-icx,rb.y-icy-52,10,'#ffd35a','center');}
    if(!(G.dps&&time-G.dps.at<5))for(const d of G.map.dummies||[])if(Math.hypot(me.x-d.x,me.y-d.y)<160)txt('훈련용 허수아비',d.x-icx,d.y-icy-34,10,'#c9bfa8','center');
    drawNpcUI(icx,icy);drawDpsUI(icx,icy);
    const n=nearNpc();if(n){const f=FAC.find(q=>q.id===n);txt((f?f.hint:'F').replace(/^F/,keyLabel(kbCode('act'))),me.x-icx,me.y-icy+10,11,'#ffd35a','center');}
    else if(inYardC()&&!(G.dps&&time-G.dps.at<5))txt('훈련장: 공격·스킬을 자유롭게 써 보세요',me.x-icx,me.y-icy+10,10,'#9e937a','center');}
  drawEvUI(icx,icy);drawPings(icx,icy);drawEmos(icx,icy);drawAllyUI(icx,icy);drawBsay(icx,icy);
  dropLabels=[];const placed=[];
  for(const d of G.drops.values()){if(d.kind!=='item'||d.t<0.45)continue;const sx=d.x-icx,sy=d.y-icy;if(sx<-40||sx>W+40||sy<-20||sy>H+30)continue;if(Math.hypot(d.x-me.x,d.y-me.y)>210)continue;
    const b=tbitmap(d.it.name,12,itemCol(d.it),'kr');const w=b.width/SC+2,h=9;let lxx=Math.round(sx-w/2),ly=Math.round(sy-25);
    for(let t=0;t<8;t++){const hit=placed.find(p=>lxx<p.x+p.w&&lxx+w>p.x&&ly<p.y+p.h&&ly+h>p.y);if(!hit)break;ly=hit.y-h-1;}
    placed.push({x:lxx,y:ly,w,h});const hov=mouse.x>=lxx&&mouse.x<=lxx+w&&mouse.y>=ly&&mouse.y<=ly+h;
    pr(lxx,ly,w,h,hov?'rgba(70,50,80,0.95)':'rgba(10,7,14,0.85)');if(hov){pr(lxx,ly,w,1,PAL.g);pr(lxx,ly+h-1,w,1,PAL.g);}if(d.owner==null&&d.by){pr(lxx,ly,1,h,'#c77ad8');}txt(d.it.name,lxx+1,ly+h/2,12,itemCol(d.it));dropLabels.push({d,x:lxx,y:ly,w,h});}
  for(const t of texts){const a=t.t>0.6?1-(t.t-0.6)/0.35:1;ctx.globalAlpha=clamp(a,0,1);const b=tbitmap(t.s,t.size,t.c,t.font);const pk=t.pop||1.3;const k=t.t<0.12?1+(pk-1)*(1-t.t/0.12):1;ctx.drawImage(b,Math.round((t.x-icx)*SC-b.width*k/2),Math.round((t.y-icy)*SC-b.height*k/2),b.width*k,b.height*k);}ctx.globalAlpha=1;}
function drawEsc(){const w=160,h=106,x=240-w/2,y=80;panel(x,y,w,h,'메뉴');button(x+16,y+22,w-32,16,'계속하기',()=>{G.escMenu=false;},{main:true});button(x+16,y+42,w-32,16,'소리: '+['켬','효과음만','끔'][soundMode],()=>{soundMode=(soundMode+1)%3;try{localStorage.setItem('bc_sound',String(soundMode));}catch(e){}applyVolume();});button(x+16,y+62,w-32,16,'설정 (볼륨·키)',()=>{G.opts=true;G.escMenu=false;});button(x+16,y+82,w-32,16,'캐릭터 선택 화면으로',quitToSelect);}
function drawPause(){const sp=G.selfPause&&!G.paused;pr(0,0,W,H,sp?'rgba(5,4,8,0.45)':'rgba(5,4,8,0.62)');bigTxt(sp?'메뉴':'일시정지',240,96,16,'#e6dcc3',2);txt(sp?'나만 멈춘 상태 · 파티원과 몬스터는 계속 움직여요':`${G.paused}님이 게임을 멈췄습니다`,240,120,sp?10:12,sp?'#ff9a7a':'#9e937a','center');
  const x=180,w=120;button(x,136,w,16,'계속하기 (ESC)',()=>{if(sp)G.selfPause=false;else net({t:'pause'});},{main:true});button(x,156,w,16,'마을로 귀환',()=>net({t:'town'}));button(x,176,w,16,'소리: '+['켬','효과음만','끔'][soundMode],()=>{soundMode=(soundMode+1)%3;try{localStorage.setItem('bc_sound',String(soundMode));}catch(e){}applyVolume();});button(x,196,w,16,'설정 (볼륨·키)',()=>{G.opts=true;});}
function render(){
  uiRects=[];
  if(scene!=='game'||!G.map){ctx.fillStyle='#050407';ctx.fillRect(0,0,cv.width,cv.height);if(scene==='connecting'){const el=Math.floor((performance.now()-conn.t0)/1000);txt(conn.recon?'서버와 다시 연결하는 중...':'접속 중...',240,122,14,'#e6dcc3','center');
    if(conn.recon||el>=4){txt(conn.recon?'서버가 업데이트됐거나 잠깐 끊겼어요. 캐릭터는 저장돼 있어요':'서버가 잠들어 있으면 깨어나는 데 최대 1분쯤 걸려요',240,142,11,'#9e937a','center');txt(el+'초',240,158,11,'#6b6275','center');}
    const n=Math.floor(time*3)%4;txt('.'.repeat(n),240,106,14,'#ffd35a','center');}return;}
  const [icx,icy]=renderWorld();drawClashScene(icx,icy);drawClashWait(icx,icy);drawUltScreen();
  drawWorldUI(icx,icy);drawPartyArrows(icx,icy);drawHUD();drawPerf();drawTut();drawChat();
  if(G.trade)drawTrade();if(G.talent)drawTalents();else if(G.chron)drawChron();else if(G.comm)drawComm();else if(G.anal)drawAnal();else if(G.rec)drawRecords();else if(showSkills)drawSkills();else if(showChar)drawChar();else if(showShop)drawShop();else if(G.fac)drawFacPanel();
  if(showInv&&!showSkills&&!G.talent&&!G.rec)drawInv();
  if(!G.anal&&!G.awkView)button(G.kind==='hub'?(!G.comm?198:130):372,G.kind==='hub'?3:192,60,13,`분석기 (${keyLabel(kbCode('anal'))})`,()=>openAnal(true),{size:9,tip:[['전투력 분석기','#ffd35a',12],['어떤 스킬이 피해를 얼마나 넣었는지 보여줘요','#e6dcc3',11]]});
  if(G.kind==='hub'&&!G.comm&&!G.awkView)button(130,3,66,13,`커뮤니티 (${keyLabel(kbCode('comm'))})`,()=>openComm(true),{size:9,tip:[['친구 · 접속자 목록','#ffd35a',12],['멀리 있어도 파티 초대 · 정보 보기','#e6dcc3',11]]});
  if(G.insp)drawInsp();
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
  if(G.trans>0&&inDungeon()){txt(G.trial?`${Math.ceil(G.trans)}초 후 마을로 돌아갑니다`:`${Math.ceil(G.trans)}초 후 다음 층으로 내려갑니다`,240,150,14,'#ffd35a','center');}
  if(meDowned()&&inArena()){pr(0,0,W,H,'rgba(40,4,8,0.3)');bigTxt('쓰러졌습니다',240,100,16,'#e0473a',2);txt('결투가 끝날 때까지 관전합니다',240,122,12,'#e6dcc3','center');}
  else if(meDowned()&&inDungeon()){pr(0,0,W,H,'rgba(40,4,8,0.35)');bigTxt('쓰러졌습니다',240,100,16,'#e0473a',2);txt(G.raid?'동료가 곁에 서 있으면 일으켜 줄 수 있어요':'동료가 곁에 서 있으면 일어납니다 (사제는 두 배 빠름)',240,122,12,'#e6dcc3','center');}
  drawDeathSum();drawCtrHint();drawFishUI();drawArenaUI();drawRaidUI();drawFieldHUD();drawGMScreen();drawRaid2Screen();drawAuction();drawRaidVote();drawMvp();drawEmoWheel();drawLoreView();drawBossIntro();
  if(showMeter)drawTabMeter();
  if(G.result){const r=G.result;const rows=r.rows.slice().sort((a,b)=>b.dmg-a.dmg);const m=Math.floor(r.time/60),s=r.time%60;drawMeterTable(r.title,rows,80,46,320,`지하 ${r.floor}층 · 전투 시간 ${m}분 ${String(s).padStart(2,'0')}초 · 클릭해서 닫기`);}
  drawAwkCut();
  if(G.ctxMenu)drawCtxMenu();
  drawInvite();drawDuelInv();drawTradeReq();
  if(G.escMenu&&G.kind==='hub')drawEsc();
  if((G.paused||G.selfPause)&&inDungeon())drawPause();
  if(G.opts)drawOpts();
  if(!G.paused&&!G.selfPause&&!showMeter){let tip=null;for(let i=uiRects.length-1;i>=0;i--){const r=uiRects[i];if(mouse.x>=r.x&&mouse.x<r.x+r.w&&mouse.y>=r.y&&mouse.y<r.y+r.h&&(r.tip||r.block)){if(r.tip)tip=typeof r.tip==='function'?r.tip():r.tip;break;}}
    if(!tip&&hoverDrop&&hoverDrop.kind==='item')tip=itemTip(hoverDrop.it,'ground',hoverDrop.by);if(tip)drawTip(tip);}
  pimg(hoverMon&&inDungeon()?CURSOR_A:(hoverDrop||hoverPl)?CURSOR_P:CURSOR,mouse.x,mouse.y);}

// ================= 마을: 건물·소품·주민·시설 창 =================
const LOBBY_R={"forge":[0,0,100,91],"vault":[101,0,94,84],"tent":[196,0,80,81],"stall":[277,0,84,78],"gate":[362,0,92,74],"tree":[455,0,30,50],"lamp":[486,0,14,42],"board":[0,92,23,36],"well":[24,92,24,36],"dummy":[49,92,17,30],"cart":[67,92,23,22],"grave":[91,92,13,22],"bench":[105,92,20,20],"logs":[126,92,14,18],"planter":[141,92,15,16],"fire":[157,92,13,16]};
const LOB={img:null,tiles:null,npc:null,ftex:null};
function lobbyTex(){if(LOB.ftex||!LOB.tiles)return LOB.ftex;const mir=(sx)=>{const w=128,h=128;const [c,x]=mk(w*2,h*2);for(let q=0;q<4;q++){x.save();x.translate((q&1)?w*2:0,(q&2)?h*2:0);x.scale((q&1)?-1:1,(q&2)?-1:1);x.drawImage(LOB.tiles,sx,0,w,h,0,0,w,h);x.restore();}
  const d=x.getImageData(0,0,w*2,h*2),a=d.data;let L=0;for(let i=0;i<a.length;i+=4)L+=a[i]*.3+a[i+1]*.59+a[i+2]*.11;L/=a.length/4;const F=Math.max(.5,Math.min(1.05,62/L));for(let i=0;i<a.length;i+=4){a[i]*=F;a[i+1]*=F;a[i+2]*=F;}x.putImageData(d,0,0);return c;};
  LOB.ftex=[mir(0),mir(128)];return LOB.ftex;}
function lobbySpr(t,sx,sy){if(t==='wardrobe'){wx.drawImage(WARDROBE,sx-11,sy-32);return true;}if(t==='aboard')t='board';const r=LOBBY_R[t];if(!r||!LOB.img)return false;wx.drawImage(LOB.img,r[0],r[1],r[2],r[3],sx-(r[2]>>1),sy-r[3],r[2],r[3]);return true;}
// 시설: 지도 좌표(G.map[id])에 가까이 가서 F
const FAC=[{id:'merchant',n:'상인',hint:'F: 상인과 거래',r:40},{id:'forge',n:'대장간',hint:'F: 대장간 (강화·재련·보석·분해)',r:50,prop:'forge'},{id:'vault',n:'공유 창고',hint:'F: 공유 창고',r:50,prop:'vault'},
  {id:'tent',n:'수상한 도박사',hint:'F: 도박 (무작위 장비)',r:50,prop:'tent'},{id:'tailor',n:'재단사 옷장',hint:'F: 옷장 (염색·겉모습)',r:44,prop:'wardrobe'},{id:'arena',n:'결투장',hint:'F: 결투장 안내·전적',r:40,prop:'aboard'},{id:'fish',n:'낚시터',hint:'F: 낚시하기',r:40},{id:'merc',n:'용병 대장',hint:'F: 용병 고용 (혼자일 때 동료)',r:40},{id:'clashpr',n:'격돌 수련석',hint:'F: 격돌 연습',r:34},{id:'rank',n:'마을 랭킹 게시판',hint:'F: 랭킹 보기',r:34},{id:'board',n:'현상금 게시판',hint:'F: 오늘의 의뢰',r:44,prop:'board'},{id:'portal',n:'던전 입구',hint:'F: 던전 입장',r:48,prop:'gate'},{id:'raid',n:'레이드 석판',hint:'F: 레이드 (20레벨부터)',r:40}];
function propSz(t){if(t==='aboard')t='board';const r=LOBBY_R[t];return r?[r[2],r[3]]:SH.LOBBY_SZ[t];}
function facProp(f){return f.prop?(G.map.props||[]).find(p=>p.t===f.prop):null;}
function nearNpc(){if(G.kind!=='hub')return null;let best=null,bd=1e9;for(const f of FAC){const p=G.map[f.id];if(!p)continue;const d=Math.hypot(me.x-p.x,me.y-p.y);if(d<f.r&&d<bd){bd=d;best=f.id;}}return best;}
function npcAt(x,y){if(G.kind!=='hub')return null;const m=G.map;if(Math.abs(x-m.merchant.x)<9&&y>m.merchant.y-22&&y<m.merchant.y+3)return 'merchant';
  for(const f of FAC){const p=facProp(f);if(!p)continue;const r=propSz(p.t);if(!r)continue;if(x>=p.x-r[0]/2+4&&x<=p.x+r[0]/2-4&&y>=p.y-r[1]+4&&y<=p.y)return f.id;}if(m.pond&&((x-m.pond.cx)/m.pond.rx)**2+((y-m.pond.cy)/m.pond.ry)**2<=1)return 'fish';if(m.merc&&Math.abs(x-m.merc.x)<10&&y>m.merc.y-26&&y<m.merc.y+4)return 'merc';if(m.rank&&Math.abs(x-m.rank.x)<13&&y>m.rank.y-48&&y<m.rank.y-6)return 'rank';if(m.clashpr&&Math.abs(x-m.clashpr.x)<10&&y>m.clashpr.y-30&&y<m.clashpr.y+3)return 'clashpr';if(m.raidStone&&Math.abs(x-m.raidStone.x)<11&&y>m.raidStone.y-40&&y<m.raidStone.y+2)return 'raid';return null;}
function goFac(id){const t=G.map[id];if(!t)return;me.goal=id;setGoal(t.x,t.y+(id==='portal'?20:6));}
function closeFac(){G.fac=null;G.advOpen=false;G.bs=null;G.bsArm=null;}
function openNpc(n){closeFac();showSkills=false;showChar=false;G.portalMenu=false;showShop=false;
  if(n==='merchant'){showShop=true;showInv=true;net({t:'shop'});}
  else if(n==='portal'){G.portalMenu=true;}
  else if(n==='fish'){if(!G.fishS)fishStart();}
  else if(n==='clashpr'){G.fac=n;G.facT=time;}
  else if(n==='rank'){G.fac=n;G.facT=time;G.rankTab=G.rankTab||'cpr';net({t:'ranks'});sfx('pick');}
  else if(n==='tailor'||n==='arena'||n==='merc'||n==='raid'){G.fac=n;G.facT=time;}
  else{G.fac=n;G.facT=time;showInv=n!=='board'&&n!=='tent'?true:showInv;if(n==='vault')net({t:'stash'});if(n==='board')net({t:'bty'});if(n==='tent')showInv=true;if(n==='forge'){G.bsTab=G.bsTab||'enh';}sfx('pick');}}
function inYardC(){return G.kind==='hub'&&G.map&&G.map.dummies&&G.map.dummies.some(d=>Math.hypot(me.x-d.x,me.y-d.y)<124);}
function canFight(){return inDungeon()||inYardC();}

// ---- 주민 (화면에서만 움직이는 NPC) ----
const NPC_DEF=[
  {row:0,n:'대장장이 브론',home:[206,196],rad:10,act:0.35,lines:['쇠는 뜨거울 때 두드려야지!','강화는 운이야. 하지만 운도 실력이지.','소켓 하나면 세상이 달라진다네.','전설 장비라고? 핏빛 정수만 가져오게.','분해하면 재료가 나온다네. 버리지 말고 가져와.']},
  {row:1,n:'재단사 마르타',home:[764,214],rad:6,act:0.08,lines:['옷 색이 칙칙하구나. 염색 한번 해 보겠니?','창고에 넣어 둔 건 다른 캐릭터도 꺼내 쓸 수 있단다.','요즘 지하에서 이상한 소리가 들려...','몸조심하렴. 너무 깊이 내려가지 말고.']},
  {row:2,n:'용병 대장 한스',home:[566,182],rad:6,act:0.1,lines:['혼자 내려가긴 위험하지. 내 부하를 붙여 주겠네.','던전 입구 이상 없음!','아래로 내려갈수록 괴물이 강해진다.','5층마다 무시무시한 놈이 기다리지.','51층부터는 모든 게 타락해 있다더군.']},
  {row:3,n:'도박사 제로',home:[770,344],rad:8,act:0.3,lines:['운명을 시험해 보겠나?','상자 안엔 뭐가 들었을까... 후후.','오늘은 운이 좋아 보이는군.','전설? 그건 보스 놈들만 갖고 있지.']},
  {row:4,n:'수녀 엘레나',home:[532,300],rad:36,act:0.12,lines:['빛이 그대와 함께하길.','쓰러진 동료 곁에 서 있으면 일으켜 세울 수 있어요.','분수의 물은 언제나 맑답니다.']},
  {row:5,n:'거지 톰',home:[430,420],rad:70,act:0.15,lines:['한 푼만 줍쇼...','내가 왕년에 30층까지 갔었다고!','게시판 의뢰는 매일 바뀐다네.','훈련장 허수아비는 아무리 때려도 안 쓰러져.','연못에서 황금 비늘 용어를 봤다니까!']}];
// 진행에 따라 바뀌는 마을 대사: 0 시작 · 1 지하 10층+ · 2 36층+(2막) · 3 100층 정복(엘라 해방) · 4 흑왕 처치(첫 새벽)
function storyStage(){const ch=G.ch;if(!ch)return 0;if(((ch.rclr||{}).moon|0)>0)return 4;if((ch.cleared|0)>0)return 3;if((ch.best|0)>=36)return 2;if((ch.best|0)>=10)return 1;return 0;}
const NPC_STORY=[
  {0:['흑월이 뜬 뒤로 풀무 불만이 이 마을의 유일한 해라네.','등불 기름이 모자라면 말하게. 쇠 다루는 손으로도 심지는 꼬거든.'],1:['알드릭 경의 검도 내가 벼렸지. 그 친구, 돌아오지 않았어.'],2:['벽 너머 쿵쿵 울리는 소리… 내 망치 소리가 아니야.','요즘은 나도 모르게 심장 소리에 맞춰 망치질을 해. 기분 나쁘게.'],3:['엘라 경이 돌아왔다고? 새 갑옷부터 벼려 줘야겠군!'],4:['해가 떴어! 풀무 불이 이렇게 초라해 보일 줄이야, 하하!']},
  {0:['밤이 끝나지 않으니 검은 옷만 팔려. 가끔은 밝은 색도 입어 보렴.'],1:['알드릭이 떠나기 전날, 누이에게 줄 머리띠를 맡겼었지…'],2:['밤마다 지하에서 노랫소리가 들려. 엘라가 부르던 노래야.'],3:['엘라 머리띠를 다시 만들어 줬단다. 너한테 고맙다고 전해 달래.'],4:['햇빛 아래서 보니 이 옷감 색이 원래 이랬구나!']},
  {0:['흑월 아래서는 망자도 잠들지 못한다. 등불을 꺼뜨리지 마라.'],1:['새벽 기사단? 이제 남은 건 나 같은 퇴물뿐이지.'],2:['36층 아래는 기사단도 못 내려갔던 곳이다. 대단하군.'],3:['엘라 경이 돌아왔다. 기사단이 다시 모인다!'],4:['흑왕을… 네가 쓰러뜨렸다고? 새벽 기사단의 이름으로 경례하지.']},
  {0:['해가 다시 뜰 확률? 후후, 그건 나도 못 걸겠군.'],2:['심장 소리에 판돈을 걸어 볼까? 쿵, 쿵…'],4:['해가 떴네. 이번 판은 내가 졌어. 기분 좋게 졌지.']},
  {0:['새벽의 종이 울리지 않은 지 오래예요. 그래도 기도는 멈추지 않아요.','등불은 작아도 어둠을 이겨요.'],1:['알드릭 경을 위해서도 기도하고 있어요.'],2:['심장에 삼켜진 이들에게도… 빛이 닿기를.'],3:['엘라 님이 성당에 오셨어요. 오랫동안 제단 앞에 계셨지요.'],4:['새벽의 종이 다시 울렸어요! 들리세요?']},
  {0:['흑월이 뜨던 밤, 종탑에서 종이 안 울렸어. 그레고르 영감이 멍하니 서 있더라고.'],1:['쌍둥이 점성술사 말이야, 그날 밤 거울 앞에서 웃고 있었다니까.'],2:['지하 36층이라고? 난 30층까지였는데… 흠흠.'],3:['엘라 아가씨가 돌아왔어! 나한테 동전을 줬다고!'],4:['해다! 해가 떴어! 오늘은 한 푼 안 줘도 괜찮아!']}];
const NPC_RAID={bell:[0,'종탑의 종소리가 멎었다더군. 그레고르… 그 늙은이도 이제 편히 쉬기를.'],mirror:[5,'거울 미궁이 조용해졌대. 쌍둥이도 이제 서로를 놓아줬겠지.'],clock:[2,'발렌 부단장… 태엽이 멈췄다니 다행이다. 그도 이제 명령에서 풀려났겠지.'],moon:[4,'흑월이 걷혔어요. 카르나스 경도… 언젠가 용서받을 수 있을까요.']};
function npcLine(i){const d=NPC_DEF[i],st=storyStage(),S=NPC_STORY[i]||{};let pool=[];for(let k=st;k>=0;k--)if(S[k]){pool=S[k];break;}
  const ch=G.ch||{};for(const id in NPC_RAID){const [ni,l]=NPC_RAID[id];if(ni===i&&((ch.rclr||{})[id]|0)>0)pool=pool.concat([l]);}
  if(i===2&&(ch.lvl|0)>=20&&!Object.keys(ch.rclr||{}).length)pool=pool.concat(['광장 석판이 붉게 빛나더군. 흑왕의 수하들이 너를 부르는 거다.']);
  return pool.length&&R()<0.55?pick(pool):pick(d.lines);}
const NPCS=NPC_DEF.map((d,i)=>({d,x:(d.home||d.path[0])[0],y:(d.home||d.path[0])[1],tx:null,ty:null,wait:rf(0,2),face:i%2?-1:1,walk:false,animT:R()*3,act:0,say:null,sayT:0,sayCd:rf(3,9),pi:0}));
let NPC_FR=null;
function npcFrames(){if(NPC_FR||!LOB.npc)return NPC_FR;NPC_FR=[];for(let r=0;r<6;r++){const row=[];for(let k=0;k<4;k++){const [c,x]=mk(36,34);x.drawImage(LOB.npc,k*36,r*34,36,34,0,0,36,34);const [f,fx2]=mk(36,34);fx2.translate(36,0);fx2.scale(-1,1);fx2.drawImage(c,0,0);row.push({r:c,l:f});}NPC_FR.push(row);}return NPC_FR;}
function updateNpcs(dt){if(G.kind!=='hub'||!G.map)return;for(const n of NPCS){const d=n.d;n.animT+=dt;n.walk=false;if(n.act>0)n.act-=dt;
  const near=Math.hypot(me.x-n.x,me.y-n.y)<110;
  if(n.sayT>0)n.sayT-=dt;else n.say=null;n.sayCd-=dt;if(n.sayCd<=0&&near){n.say=npcLine(NPC_DEF.indexOf(d));n.sayT=3.2;n.sayCd=rf(7,13);if(Math.abs(me.x-n.x)>4)n.face=me.x<n.x?-1:1;}
  if(n.wait>0){n.wait-=dt;if(n.wait<=0&&R()<d.act)n.act=1.2;continue;}
  if(n.tx==null){if(d.path){n.pi=(n.pi+1)%d.path.length;[n.tx,n.ty]=d.path[n.pi];}else{const a=R()*Math.PI*2,r=R()*d.rad;n.tx=d.home[0]+Math.cos(a)*r;n.ty=d.home[1]+Math.sin(a)*r*0.6;}}
  const dx=n.tx-n.x,dy=n.ty-n.y,dd=Math.hypot(dx,dy),st=17*dt;if(n.act>0||n.sayT>0&&near){continue;}
  if(dd<=st||SH.blocked(G.map,n.tx,n.ty,3)){n.tx=null;n.wait=d.path?rf(2,4):rf(1.5,5);continue;}
  const ox=n.x,oy=n.y;SH.moveEnt(G.map,n,dx/dd*st,dy/dd*st);if(Math.hypot(n.x-ox,n.y-oy)<st*0.3){n.tx=null;n.wait=rf(1,3);}else{n.walk=true;n.face=dx<0?-1:1;}}}
function drawNpc(n,icx,icy){const fr=npcFrames();const bx=Math.round(n.x)-icx,by=Math.round(n.y)-icy;if(bx<-30||bx>W+30||by<-40||by>H+40)return;wx.drawImage(SH_S,bx-6,by-1);
  if(!fr)return;const k=n.act>0?3:n.walk?1+((n.animT*6)|0)%2:0;const f=fr[n.d.row][k];wx.drawImage(n.face<0?f.l:f.r,bx-18,by-33+(k===0&&((n.animT*1.5)|0)%2?0:0));}
function drawNpcUI(icx,icy){for(const n of NPCS){const px=Math.round(n.x)-icx,py=Math.round(n.y)-icy;if(px<-60||px>W+60||py<-60||py>H+60)continue;
  if(Math.hypot(me.x-n.x,me.y-n.y)<90)txt(n.d.n,px,py-33,10,'#c9bfa8','center');
  if(n.say){const L=wrapTxt(n.say,12,170);const bw=Math.max(...L.map(l=>tw(l,12)))+12,bh=L.length*13+4,bx=Math.round(px-bw/2),by=py-38-bh;pr(bx,by,bw,bh,PAL.k);pr(bx+1,by+1,bw-2,bh-2,'#f4ecda');pr(px-1,by+bh,3,2,'#f4ecda');L.forEach((l,k)=>txt(l,px,by+8+k*13,12,'#1b1622','center'));}}}

// ---- 소품·건물 그리기 ----
function drawProps(icx,icy,ents){for(const p of G.map.props||[]){const sx=Math.round(p.x)-icx,sy=Math.round(p.y)-icy;const r=propSz(p.t);const hw=r?r[0]:40,hh=r?r[1]:40;if(sx<-hw||sx>W+hw||sy<-20||sy>H+hh)continue;
  if(p.t==='fountain')ents.push({y:p.y+2,f:()=>{wx.drawImage(FOUNTAIN,sx-17,sy-18);for(let n=0;n<10;n++){const t=(time*1.3+n/10)%1;const a=n/10*Math.PI*2;wpx(Math.round(sx+Math.cos(a)*t*9),Math.round(sy-16+t*t*14-t*6),t>0.7?'C':'c');}if((time*4|0)%2)wpx(sx,sy-18,'w');}});
  else if(r)ents.push({y:p.y-(p.t==='gate'?40:0),f:()=>{lobbySpr(p.t,sx,sy);
    if(p.t==='forge'&&R()<0.35)part(p.x-8+rf(-6,6),p.y-26,rf(-6,6),rf(-4,2),pick(['o','y','r']),rf(.2,.5),{z:rf(0,6),vz:rf(10,30),glow:true});
    if(p.t==='forge'&&R()<0.08)part(p.x+26+rf(-3,3),p.y-86,rf(-3,3),0,'S',rf(1.2,2),{z:0,vz:rf(8,14)});
    if(p.t==='fire'&&R()<0.5)part(p.x+rf(-3,3),p.y-4,rf(-5,5),0,pick(['o','y','r']),rf(.25,.6),{z:rf(0,4),vz:rf(18,36),glow:true});
    if(p.t==='tent'&&R()<0.06)part(p.x-26+rf(-4,4),p.y-24,0,0,pick(['p','P','c']),rf(.4,.9),{z:rf(0,6),vz:rf(6,14),glow:true});}});}}
function drawDummy(m,icx,icy){const bx=Math.round(m.dx)-icx,by=Math.round(m.dy)-icy;wx.drawImage(SH_S,bx-6,by-1);const sh=m.flash>0?((time*40|0)%2?1:-1):0;if(!lobbySpr('dummy',bx+sh,by+2)){wx.fillStyle='#8a6a3a';wx.fillRect(bx-3+sh,by-22,6,22);}}
function hubLights(L,icx,icy){const add=(x,y,r,i)=>{x-=icx;y-=icy;if(x<-r||x>W+r||y<-r||y>H+r)return;L.push({x,y,r,i});};const fl=Math.sin(time*9)*3+Math.sin(time*23)*2;
  for(const p of G.map.props||[]){if(p.t==='lamp')add(p.x+4,p.y-34,58+fl*0.5,1);else if(p.t==='forge')add(p.x-8,p.y-26,62+fl,1);else if(p.t==='fire')add(p.x,p.y-6,70+fl*1.5,1);else if(p.t==='tent')add(p.x-26,p.y-26,44+fl*0.5,0.9);else if(p.t==='vault')add(p.x+40,p.y-52,40,0.85);else if(p.t==='stall')add(p.x+32,p.y-50,44,0.85);else if(p.t==='gate')add(p.x,p.y-22,56+Math.sin(time*2)*4,1);else if(p.t==='fountain')add(p.x,p.y-10,50,0.9);}}

// ---- 아이콘: 보석·재료 ----
const GEMI=new Map();
function gemIcon(g){if(GEMI.has(g))return GEMI.get(g);const t=+g[1],c=SH.GEM_COL[g[0]];const r=2+t*0.9;const img=outlineC(pcan(16,16,q=>{for(let j=-6;j<=6;j++)for(let i=-6;i<=6;i++){const d=Math.abs(i)+Math.abs(j)*1.15;if(d<=r){const hi=i<0&&j<0&&d<r*0.55;q(8+i,9+j,hi?'#ffffff':(i+j>1?shade(c,0.6):c));}}if(t>=4){q(8,9-Math.round(r)-1,'#ffffff');}if(t>=5){q(8-Math.round(r)-1,9,'#fff4c0');q(8+Math.round(r)+1,9,'#fff4c0');}}));GEMI.set(g,img);return img;}
function shade(h,k){const [r,g,b]=rgb(h);return `rgb(${Math.round(r*k)},${Math.round(g*k)},${Math.round(b*k)})`;}
const MATI={iron:outlineC(pcan(10,10,q=>{for(let j=3;j<8;j++)for(let i=2;i<8;i++)q(i,j,(i+j)%3?'#8a8f99':'#c9ced8');q(3,3,'#ffffff');})),
  dust:outlineC(pcan(10,10,q=>{for(const[i,j]of[[5,2],[4,4],[5,4],[6,4],[3,5],[5,5],[7,5],[4,6],[5,6],[6,6],[5,8]])q(i,j,(i+j)%2?'#8fd0ff':'#4a7aff');q(5,5,'#ffffff');})),
  ess:outlineC(pcan(10,10,q=>{for(let j=2;j<9;j++)for(let i=2;i<9;i++){const dx=i-5,dy=j-6;if(dx*dx+dy*dy<=6||(j<5&&Math.abs(dx)<=(j-1)*0.5))q(i,j,dx<0&&dy<0?'#ff8a8a':'#c01a2a');}})),
  myth:outlineC(pcan(10,10,q=>{for(const[i,j]of[[5,1],[4,2],[5,2],[6,2],[4,3],[5,3],[6,3],[3,4],[4,4],[5,4],[6,4],[7,4],[4,5],[5,5],[6,5],[4,6],[5,6],[6,6],[5,7],[5,8]])q(i,j,i<5?'#ff9ab0':i>5?'#a0142e':'#ff3a5a');q(5,3,'#ffffff');}))};
const MAT_N={iron:'철 조각',dust:'마력 가루',ess:'핏빛 정수',myth:'신화의 파편'};
function costRow(x,y,c,sz){sz=sz||11;const ch=G.ch;let cx=x;const part2=(img,v,ok)=>{if(img)pimg(img,cx,y-5);cx+=img===GOLD?10:11;txt(String(v),cx,y,sz,ok?'#e6dcc3':'#e0574a');cx+=tw(String(v),sz)+7;};
  if(c.gold)part2(GOLD,c.gold,ch.gold>=c.gold);for(const k of['iron','dust','ess','myth'])if(c[k])part2(MATI[k],c[k],(ch.mats?ch.mats[k]:0)>=c[k]);return cx;}
function affTxt(a){return SH.AFF[a.k].f(a.v);}

// ---- 대장간 창 ----
function bsItem(){const r=G.bs;if(!r||!G.ch)return null;return r.w==='eq'?G.ch.eq[r.s]:G.ch.bag[r.i];}
function bsRef(){const r=G.bs;return r.w==='eq'?{w:'eq',s:r.s}:{w:'bag',i:r.i};}
function drawForge(){const ch=G.ch;if(!ch)return;const x=6,y=38,w=282,h=194;panel(x,y,w,h,'대장간');
  const tabs=[['enh','강화'],['lv','레벨'],['rr','재련'],['gem','보석'],['salv','분해']];tabs.forEach(([k,l],i)=>{const bx=x+8+i*54;button(bx,y+17,51,13,l,()=>{G.bsTab=k;G.bsArm=null;},{size:11,main:G.bsTab===k});});
  const it=bsItem();const tab=G.bsTab||'enh';const m=ch.mats||{iron:0,dust:0,ess:0};
  // 아래: 재료
  const fy=y+h-12;pr(x+6,fy-7,w-12,1,PAL.m);let cx=x+10;pimg(GOLD,cx,fy-4);txt(String(ch.gold),cx+10,fy,11,'#ffd35a');cx+=tw(String(ch.gold),11)+18;
  for(const k of['iron','dust','ess','myth']){if(k==='myth'&&!m.myth)continue;pimg(MATI[k],cx,fy-5);txt(`${MAT_N[k]} ${m[k]}`,cx+11,fy,10,'#d2c7ab');cx+=tw(`${MAT_N[k]} ${m[k]}`,10)+18;}
  if(tab==='gem'){drawGemTab(x,y,w,h,it);return;}
  if(tab==='salv'){drawSalvTab(x,y,w,h,it);return;}
  if(!it){txt('오른쪽 인벤토리에서 아이템을 클릭하세요',x+w/2,y+80,12,'#9e937a','center');txt('장착 중인 무기·갑옷·반지도 고를 수 있어요',x+w/2,y+94,11,'#6b6275','center');return;}
  itemSlot(x+10,y+36,24,it,null,null,'forge');txt(SH.itemName(it),x+40,y+42,13,itemCol(it));txt(`${RAR[it.rar].n} · 아이템 레벨 ${it.L}${G.bs.w==='eq'?' · 장착 중':''}`,x+40,y+53,10,'#9e937a');
  if(tab==='lv'){let ly=y+72;const cap=Math.min(SH.LVL_CAP,ch.lvl);const L=it.L|0;
    if(L>=cap){txt(L>=SH.LVL_CAP?'최고 레벨 아이템이에요':`캐릭터 레벨(${cap})까지 올렸어요`,x+w/2,ly+10,13,'#ffd35a','center');txt('아이템 레벨은 캐릭터 레벨까지 올릴 수 있어요',x+w/2,ly+26,10,'#9e937a','center');return;}
    const n1=1,nm=cap-L;const nx=JSON.parse(JSON.stringify(it));SH.itemLvUp(nx,nm);
    txt(`아이템 레벨 ${L}  →  최대 ${cap}`,x+12,ly,13,'#f2eadb');ly+=13;
    for(const k of['dmg','armor'])if(it.base[k]){txt(`${k==='dmg'?'공격력':'방어력'} ${it.base[k]} → ${nx.base[k]}  (레벨 ${cap} 기준)`,x+12,ly,11,'#7fd05a');ly+=11;}
    it.aff.forEach((a,i)=>{if(nx.aff[i].v!==a.v){txt(`${affTxt(a)} → ${affTxt(nx.aff[i])}`,x+12,ly,10,'#8fb8ff');ly+=10;}});
    txt('등급·능력 종류는 그대로, 수치만 새 레벨에 맞게 올라가요',x+12,ly+1,10,'#6b6275');ly+=12;
    const c1=SH.lvCost(it,n1),cm=SH.lvCost(it,nm);const hw=(w-30)/2;
    txt('+1',x+12,ly+4,11,'#9e937a');costRow(x+30,ly+4,c1);ly+=13;if(nm>1){txt(`+${nm}`,x+12,ly+4,11,'#9e937a');costRow(x+30,ly+4,cm);}ly+=14;
    button(x+12,ly,hw,16,`레벨 +1 (→ ${L+1})`,()=>net({t:'bs',op:'lvup',n:1,...bsRef()}),{main:true,size:11});if(nm>1)button(x+18+hw,ly,hw,16,`최대로 (→ ${cap})`,()=>net({t:'bs',op:'lvup',max:1,...bsRef()}),{size:11});return;}
  if(tab==='enh'){const up=it.up|0;let ly=y+72;
    const emax=SH.enhMax(it);if(up>=emax){txt(up>=SH.TRANS_MAX?'초월 완료 (+15) · 모든 능력치 +5%':'최대 강화 (+10)',x+w/2,ly+10,13,'#ffd35a','center');if(up<SH.TRANS_MAX)txt('초월 강화(+11~+15)는 전설·신화·세트 장비만 할 수 있어요',x+w/2,ly+26,10,'#9e937a','center');return;}
    const tr=up>=SH.ENH_MAX,rate=SH.enhRate(it);txt(`${tr?'초월 ':''}+${up}  →  +${up+1}`,x+12,ly,13,tr?'#ffd35a':'#f2eadb');txt(`성공 확률 ${rate}%${tr&&it.tp?` (장인의 기운 +${it.tp}%)`:''}`,x+w-12,ly,12,rate>=80?'#7fd05a':rate>=40?'#ffd35a':'#ff8a5a','right');ly+=13;
    for(const k of['dmg','armor'])if(it.base[k]){const a=Math.round(it.base[k]*SH.enhMul(up)),b=Math.round(it.base[k]*SH.enhMul(up+1));txt(`${k==='dmg'?'공격력':'방어력'} ${a} → ${b}`,x+12,ly,12,'#7fd05a');ly+=11;}
    if(it.slot==='ring'){txt(`모든 능력 +${up*5}% → +${(up+1)*5}%`,x+12,ly,12,'#7fd05a');ly+=11;}
    txt(tr?`초월: 기본 수치 +15%씩 · 실패해도 단계 유지, 실패마다 확률 +5% · +15 달성 시 모든 능력치 +5%`:it.slot==='ring'?'반지는 강화할 때마다 모든 능력 +5%':'강화할 때마다 기본 공격력·방어력 +10%',x+12,ly,10,tr?'#c9a0e8':'#6b6275');ly+=13;
    txt('비용',x+12,ly,11,'#9e937a');costRow(x+40,ly,SH.enhCost(it));ly+=16;
    button(x+12,ly,w-24,16,`강화하기 (+${up+1})`,()=>net({t:'bs',op:'enh',...bsRef()}),{main:true});ly+=22;
    txt('실패해도 단계는 내려가지 않고 재료만 사라집니다',x+w/2,ly+2,10,'#6b6275','center');return;}
  if(tab==='rr'){let ly=y+68;const pd=G.pend&&G.pend.id===it.id?G.pend:null;
    if(pd){txt('재련 결과를 고르세요',x+w/2,ly,12,'#ffd35a','center');ly+=14;
      pr(x+12,ly-6,w-24,34,'rgba(10,7,14,0.7)');txt('기존',x+18,ly+1,10,'#9e937a');txt(affTxt(pd.old),x+50,ly+1,12,'#e6dcc3');txt('새로',x+18,ly+15,10,'#9e937a');txt(affTxt(pd.nw),x+50,ly+15,12,'#7fd05a');ly+=34;
      button(x+12,ly,(w-30)/2,16,'새 능력 적용',()=>{net({t:'bs',op:'pick',keep:false});G.pend=null;},{main:true});button(x+18+(w-30)/2,ly,(w-30)/2,16,'기존 유지',()=>{net({t:'bs',op:'pick',keep:true});G.pend=null;});return;}
    if(!it.aff.length){txt('재련할 능력이 없는 아이템입니다 (일반 등급)',x+w/2,ly+14,11,'#9e937a','center');return;}
    txt('바꾸고 싶은 능력을 골라 재련하세요 (◆ 마지막으로 재련한 능력)',x+12,ly,10,'#6b6275');ly+=11;
    it.aff.forEach((a,i)=>{const lock=false;const rg=SH.affRange(it,a.k);pr(x+10,ly-5,w-20,14,i===it.rk?'rgba(90,60,20,0.45)':'rgba(10,7,14,0.5)');
      txt(affTxt(a),x+14,ly+2,11,lock?'#6b6275':'#8fb8ff');txt(`${rg[0]}~${rg[1]}`,x+150,ly+2,10,'#6b6275');
      if(!lock){button(x+w-86,ly-4,36,12,'수치',()=>net({t:'bs',op:'rr',a:i,swap:false,...bsRef()}),{size:10,tip:()=>[['수치 재련','#ffd35a',12],['같은 능력의 수치만 다시 굴립니다','#e6dcc3',11],['결과를 보고 적용/유지를 고를 수 있어요','#9e937a',11]]});
        button(x+w-48,ly-4,36,12,'교체',()=>net({t:'bs',op:'rr',a:i,swap:true,...bsRef()}),{size:10,tip:()=>[['능력 교체','#ffd35a',12],['다른 능력으로 무작위 교체합니다','#e6dcc3',11],it.rar===3?['전설: 핏빛 정수가 필요해요','#ff6a7a',11]:['결과를 보고 적용/유지를 고를 수 있어요','#9e937a',11]]});}
      else txt('고정됨',x+w-16,ly+2,10,'#6b6275','right');ly+=15;});
    ly+=2;txt('수치',x+12,ly,10,'#9e937a');costRow(x+40,ly,SH.rerollCost(it,false),10);ly+=12;txt('교체',x+12,ly,10,'#9e937a');costRow(x+40,ly,SH.rerollCost(it,true),10);
    if(it.rc)txt(`재련 ${it.rc}회 · 할수록 비용 증가`,x+w-12,ly,10,'#6b6275','right');}}
function drawGemTab(x,y,w,h,it){const ch=G.ch;let ly=y+38;
  if(it){itemSlot(x+10,ly-2,24,it,null,null,'forge');txt(SH.itemName(it),x+40,ly+3,12,itemCol(it));const so=it.so||[],mx=SH.SOCK_MAX[it.slot];
    for(let k=0;k<mx;k++){const sx=x+40+k*22,sy=ly+9;const g=so[k];const has=k<so.length;pr(sx,sy,18,18,has?PAL.y:PAL.k);pr(sx+1,sy+1,16,16,has?'#140f1a':'#241e2b');if(g)pimg(gemIcon(g),sx+1,sy+1);else if(!has)txt('×',sx+9,sy+9,10,'#3a3144','center');
      if(g)uiRects.push({x:sx,y:sy,w:18,h:18,click:()=>net({t:'bs',op:'ungem',k,...bsRef()}),tip:()=>{const e=SH.gemEff(g,it.slot);return[[SH.gemName(g),SH.GEM_COL[g[0]],13],[affTxt(e),'#8fb8ff',12],[`클릭: 빼내기 (${SH.unsocketCost(g)}골드, 보석은 돌려받음)`,'#9e937a',11]];}});}
    if(so.length<mx){const c=SH.socketCost(it);button(x+w-94,ly+10,84,14,'소켓 뚫기',()=>net({t:'bs',op:'sock',...bsRef()}),{size:10,tip:()=>[['소켓 뚫기','#ffd35a',12],[`무기·갑옷 최대 2개, 반지 1개`,'#e6dcc3',11],[`비용: ${c.gold}골드, 마력 가루 ${c.dust}`,'#9e937a',11]]});costRow(x+w-94,ly+31,c,10);}
    else txt('소켓 최대',x+w-12,ly+18,10,'#6b6275','right');}
  else txt('아이템을 고르면 보석을 박을 수 있어요',x+12,ly+6,11,'#9e937a');
  ly+=42;pr(x+8,ly-4,w-16,1,PAL.m);txt('보유 보석 · 클릭: 선택한 장비에 장착 · 우클릭: 3개 합성',x+12,ly+3,10,'#9e937a');ly+=10;
  const gs=Object.keys(ch.gems||{}).filter(g=>ch.gems[g]>0).sort((a,b)=>SH.GEM_T.indexOf(a[0])-SH.GEM_T.indexOf(b[0])||(+b[1])-(+a[1]));
  if(!gs.length){txt('아직 보석이 없어요 · 몬스터·보스·분해·의뢰에서 얻어요',x+w/2,ly+22,10,'#6b6275','center');return;}
  gs.slice(0,33).forEach((g,i)=>{const c=i%11,r=(i/11)|0,sx=x+10+c*24,sy=ly+r*24;pr(sx,sy,22,22,PAL.k);pr(sx+1,sy+1,20,20,'#1c1622');pimg(gemIcon(g),sx+3,sy+2);txt(String(ch.gems[g]),sx+20,sy+17,9,'#ffffff','right','px');
    uiRects.push({x:sx,y:sy,w:22,h:22,click:()=>{if(it)net({t:'bs',op:'gem',g,...bsRef()});else msg('먼저 장비를 고르세요','#9e937a');},right:()=>net({t:'bs',op:'comb',g}),
      tip:()=>{const a=SH.gemEff(g,'weapon'),b=SH.gemEff(g,'armor');const L=[[`${SH.gemName(g)} ×${ch.gems[g]}`,SH.GEM_COL[g[0]],13],[`무기: ${affTxt(a)}`,'#8fb8ff',11],[`갑옷·반지: ${affTxt(b)}`,'#8fb8ff',11]];if(+g[1]<5)L.push([`우클릭: 3개 → ${SH.gemName(g[0]+(+g[1]+1))} (${SH.combineCost(+g[1])}골드)`,'#9e937a',11]);return L;}});});}
function drawSalvTab(x,y,w,h,it){let ly=y+40;const isBag=G.bs&&G.bs.w==='bag'&&it;
  if(isBag){itemSlot(x+10,ly-4,24,it,null,null,'forge');txt(SH.itemName(it),x+40,ly+1,12,itemCol(it));const s=SH.salvageOf(it);let t=`철 조각 ${s.iron}`;if(s.dust)t+=`, 마력 가루 ${s.dust}`;if(s.dustP)t+=', 마력 가루(30%)';if(s.ess)t+=`, 핏빛 정수 ${s.ess}`;if(s.myth)t+=`, 신화의 파편 ${s.myth}`;if(it.rar>=1)t+=', 보석(15%)';
    txt(`얻는 재료: ${t}`,x+40,ly+12,10,'#d2c7ab');if((it.so||[]).some(Boolean))txt('박힌 보석은 돌려받아요',x+40,ly+23,10,'#7fd05a');ly+=32;
    const arm=G.bsArm===it.id;button(x+12,ly,w-24,16,it.rar>=2&&!arm?'분해하기 (한 번 더 눌러 확인)':'분해하기',()=>{if(it.rar>=2&&G.bsArm!==it.id){G.bsArm=it.id;return;}net({t:'bs',op:'salv',i:G.bs.i});G.bs=null;G.bsArm=null;},{main:arm||it.rar<2});ly+=24;}
  else{txt('인벤토리(가방)의 아이템을 클릭하면 분해할 수 있어요',x+w/2,ly+4,11,'#9e937a','center');txt('장착 중인 장비는 분해할 수 없어요',x+w/2,ly+16,10,'#6b6275','center');ly+=36;}
  pr(x+8,ly-4,w-16,1,PAL.m);txt('한꺼번에 분해 (보석이 박힌 아이템은 제외)',x+12,ly+4,10,'#9e937a');ly+=12;
  {const bw=(w-32)/3;button(x+12,ly,bw,16,'일반 전부',()=>net({t:'bs',op:'salvAll',max:0}),{size:10});button(x+16+bw,ly,bw,16,'마법 이하',()=>net({t:'bs',op:'salvAll',max:1}),{size:10});const arm=G.salvArm&&time-G.salvArm<3;button(x+20+bw*2,ly,bw,16,arm?'정말 분해?':'희귀 이하',()=>{if(arm){G.salvArm=0;net({t:'bs',op:'salvAll',max:2});}else G.salvArm=time;},{size:10,main:arm,tip:[['일반·마법·희귀 아이템을 모두 분해','#ffd35a',12],['한 번 더 누르면 실행 · 보석이 박힌 아이템은 제외','#9e937a',11]]});}ly+=24;
  txt('재료 쓰임: 철 조각 → 강화 · 마력 가루 → 재련·소켓 · 핏빛 정수 → 전설',x+w/2,ly+2,10,'#6b6275','center');}

// ---- 창고 · 도박 · 게시판 ----
let STASH=null;function loadStash(){try{const a=JSON.parse(localStorage.getItem('bc_stash')||'null');return Array.isArray(a)?a:[];}catch(e){return [];}}
function saveStash(a){try{localStorage.setItem('bc_stash',JSON.stringify(a));}catch(e){}}
function drawVault(){const x=6,y=38,w=226,h=194;panel(x,y,w,h,'공유 창고');txt('모든 캐릭터가 함께 쓰는 보관함',x+w/2,y+21,10,'#9e937a','center');const s=G.stash||[];
  const gx=x+9,gy=y+30;for(let i=0;i<40;i++){const c=i%8,r=(i/8)|0;itemSlot(gx+c*26,gy+r*26,24,s[i],()=>net({t:'sttake',si:i}),()=>net({t:'sttake',si:i}),'stash');}
  txt('창고 칸 클릭: 꺼내기 · 가방 칸 클릭: 넣기',x+w/2,y+h-10,10,'#6b6275','center');}
function drawTent(){const x=6,y=38,w=200,h=194;panel(x,y,w,h,'수상한 도박사');txt('무엇이 나올지는 아무도 모른다...',x+w/2,y+21,10,'#c77ad8','center');const lvl=G.ch?G.ch.lvl:1;
  [['weapon','무기'],['armor','갑옷'],['ring','반지']].forEach(([s,l],i)=>{const ly=y+36+i*26;pr(x+10,ly-2,w-20,22,'rgba(10,7,14,0.6)');txt(`수상한 ${l}`,x+18,ly+5,12,'#e6dcc3');const c=SH.gambleCost(s,lvl);pimg(GOLD,x+18,ly+11);txt(String(c),x+29,ly+14,10,G.ch&&G.ch.gold>=c?'#ffd35a':'#e0574a');
    button(x+w-62,ly+2,50,14,'사기',()=>net({t:'gamble',s}),{size:11,main:true});});
  const ly=y+118;txt('나오는 등급: 일반 ~ 희귀 · 아주 가끔 전설(0.1%)',x+w/2,ly,10,'#9e937a','center');txt('희귀가 나올 확률이 상점보다 높아요',x+w/2,ly+11,10,'#6b6275','center');
  if(G.gam){const it=G.gam;itemSlot(x+w/2-13,ly+22,26,G.ch&&G.ch.bag.find(b=>b&&b.id===it.id)||it,null,null,'gam');txt(it.name,x+w/2,ly+56,11,itemCol(it),'center');}}
function drawBoard(){const x=6,y=38,w=282,h=194;panel(x,y,w,h,'현상금 게시판');const B=G.bty;if(!B){txt('불러오는 중...',x+w/2,y+90,11,'#6b6275','center');return;}
  const left=Math.max(0,B.reset-(Date.now()-B.at));const hh=Math.floor(left/3600e3),mm=Math.floor(left%3600e3/60e3);txt(`새 의뢰까지 ${hh}시간 ${mm}분 (매일 자정)`,x+w/2,y+21,10,'#9e937a','center');
  B.b.q.forEach((q,i)=>{const ly=y+32+i*44;pr(x+8,ly,w-16,40,'rgba(10,7,14,0.6)');const done=q.n>=q.need;txt(`${B.names[q.t]||q.t} ${q.need}`,x+14,ly+8,12,q.cl?'#6b6275':done?'#7fd05a':'#e6dcc3');
    pr(x+14,ly+15,150,5,PAL.k);pr(x+15,ly+16,Math.round(148*Math.min(1,q.n/q.need)),3,done?'#7fd05a':PAL.y);txt(`${q.n}/${q.need}`,x+168,ly+17,10,'#9e937a');
    const r=q.r||{};const rw=[];if(r.gold)rw.push(`${r.gold}골드`);if(r.iron)rw.push(`철 ${r.iron}`);if(r.dust)rw.push(`가루 ${r.dust}`);if(r.ess)rw.push(`정수 ${r.ess}`);if(r.gem&&SH.gemOk(r.gem))rw.push(SH.gemName(r.gem));txt('보상: '+rw.join(' · '),x+14,ly+30,10,'#d2c7ab');
    if(q.cl)txt('받음',x+w-16,ly+12,11,'#6b6275','right');else button(x+w-66,ly+5,52,14,done?'보상 받기':'진행 중',()=>net({t:'btyc',i}),{size:10,main:done,dis:!done});});
  txt(B.b.all?'오늘의 의뢰를 모두 끝냈어요!':'세 개 모두 끝내면 추가 보상: 핏빛 정수 1 · 보석 · 마력 가루 3',x+w/2,y+h-10,10,B.b.all?'#ffd35a':'#6b6275','center');}
function drawFacPanel(){if(G.fac==='rank')drawRankPanel();else if(G.fac==='clashpr')drawCprPanel();else if(G.fac==='raid')drawRaidPanel();else if(G.fac==='merc')drawMercPanel();else if(G.fac==='tailor')drawTailor();else if(G.fac==='arena')drawArenaBoard();if(G.fac==='trader'){drawTrader();if(!G.ev||!G.ev.trader||Math.hypot(me.x-G.ev.trader.x,me.y-G.ev.trader.y)>70)closeFac();return;}if(G.fac==='forge')drawForge();else if(G.fac==='vault')drawVault();else if(G.fac==='tent')drawTent();else if(G.fac==='board')drawBoard();
  if(G.fac&&G.map&&G.map[G.fac]&&Math.hypot(me.x-G.map[G.fac].x,me.y-G.map[G.fac].y)>80)closeFac();}

// ---- 허수아비 DPS ----
function drawDpsUI(icx,icy){if(G.kind!=='hub'||!G.dps||time-G.dps.at>5)return;const d=G.map.dummies;if(!d)return;let b=d[0],bd=1e9;for(const q of d){const dd=Math.hypot(q.x-me.x,q.y-me.y);if(dd<bd){bd=dd;b=q;}}
  const px=b.x-icx,py=b.y-icy-54;const a=time-G.dps.at>4?Math.max(0,5-(time-G.dps.at)):1;ctx.globalAlpha=a;pr(px-44,py-8,88,20,'rgba(10,7,14,0.85)');txt(`초당 피해 ${G.dps.v.toLocaleString()}`,px,py-1,12,'#ffd35a','center');txt(`총 ${G.dps.tot.toLocaleString()} · ${G.dps.dur}초`,px,py+8,10,'#9e937a','center');ctx.globalAlpha=1;}

// ---- 사망 요약 ----
function drawDeathSum(){const D=G.dsum;if(!D)return;if(!meDowned()||!inDungeon()){if(time-D.at>0.5)G.dsum=null;return;}const x=130,y=134,w=220,h=26+Math.max(1,D.rows.length)*13+14;
  pr(x,y,w,h,'rgba(10,7,14,0.88)');pr(x,y,w,1,'#e0574a');txt(`최근 ${Math.max(1,Math.round(D.dur))}초 동안 받은 피해 ${D.tot.toLocaleString()} (최대 체력 ${D.maxHp})`,x+w/2,y+9,10,'#ff9a8a','center');
  const mx=Math.max(1,...D.rows.map(r=>r.v));D.rows.forEach((r,i)=>{const ly=y+22+i*13;pr(x+8,ly-4,Math.round((w-16)*r.v/mx),10,'rgba(160,30,40,0.55)');txt(r.n,x+12,ly+1,11,'#f2eadb');txt(`${r.v.toLocaleString()} (${r.c}회)`,x+w-12,ly+1,10,'#e6dcc3','right');});
  if(D.killer)txt(`마지막 일격: ${D.killer} (${D.kv})`,x+w/2,y+h-7,10,'#ffd35a','center');}

// ---- 설정 (볼륨·흔들림·키) ----
const OPT={bgm:0.8,sfx:0.8,shake:1,keys:{}};
try{const o=JSON.parse(localStorage.getItem('bc_opt')||'null');if(o){if(typeof o.bgm==='number')OPT.bgm=clamp(o.bgm,0,1);if(typeof o.sfx==='number')OPT.sfx=clamp(o.sfx,0,1);if(typeof o.shake==='number')OPT.shake=clamp(o.shake,0,1);if(o.keys&&typeof o.keys==='object'&&(o.kbv|0)>=2){OPT.keys=o.keys;if((o.kbv|0)<3&&OPT.keys.ctr==='KeyZ')delete OPT.keys.ctr;}}}catch(e){}OPT.kbv=3;
function saveOpt(){OPT.kbv=3;try{localStorage.setItem('bc_opt',JSON.stringify(OPT));}catch(e){}}
const SK_KEYS=['KeyQ','KeyW','KeyE','KeyR','KeyA','KeyS','KeyD','KeyF'];const KB_DEF=[];for(let i=0;i<SH.BAR_SIZE;i++)KB_DEF.push(['sk'+i,`스킬 ${i+1}`,SK_KEYS[i]||('Digit'+(i+1))]);
KB_DEF.push(['ctr','카운터 (단축키 칸 대신 쓸 때)',''],['talent','특성 창','KeyN'],['rec','기록 (업적·도감·펫)','KeyJ'],['chron','연대기 (이야기)','KeyL'],['comm','커뮤니티 (친구·접속자)','KeyO'],['anal','전투력 분석기','KeyU'],['emote','감정표현','KeyT'],['potHp','체력 물약','Digit1'],['potMp','마나 물약','Digit2'],['dodge','구르기','Space'],['act','상호작용 (NPC 없으면 핑)','KeyG'],['pick','아이템 줍기','KeyX'],['inv','인벤토리','KeyI'],['skills','스킬 창','KeyK'],['char','캐릭터 창','KeyC'],['meter','기록표(누르고 있기)','Tab']);
function kbCode(a){return OPT.keys[a]||KB_DEF.find(k=>k[0]===a)[2];}
function kbAction(code){for(const k of KB_DEF)if(kbCode(k[0])===code)return k[0];return null;}
function keyLabel(c){if(!c)return '-';if(c.startsWith('Key'))return c.slice(3);if(c.startsWith('Digit'))return c.slice(5);if(c.startsWith('Numpad'))return 'Num'+c.slice(6);return {Space:'Space',Tab:'Tab',ShiftLeft:'L-Shift',ShiftRight:'R-Shift',ControlLeft:'L-Ctrl',AltLeft:'L-Alt',Backquote:'`',Minus:'-',Equal:'=',BracketLeft:'[',BracketRight:']',Semicolon:';',Quote:"'",Comma:',',Period:'.',Slash:'/',CapsLock:'Caps'}[c]||c;}
function applyVolume(){if(!AC||!SFXG)return;SFXG.gain.setTargetAtTime(soundMode===2?0:OPT.sfx,AC.currentTime,0.05);}
function drawOpts(){const x=40,y=14,w=400,h=244;panel(x,y,w,h,'설정');let ly=y+26;
  const slider=(label,k)=>{txt(label,x+14,ly,12,'#e6dcc3');const sx=x+80,sw=150;for(let i=0;i<10;i++){const on=OPT[k]>=(i+1)/10-0.001;pr(sx+i*15,ly-5,13,10,on?'#b38a3a':PAL.k);pr(sx+i*15+1,ly-4,11,8,on?'#ffd35a':'#2a2230');uiRects.push({x:sx+i*15,y:ly-6,w:15,h:12,click:()=>{OPT[k]=(i+1)/10;if(OPT[k]<=0.1&&OPT[k]===(i+1)/10&&i===0&&false)OPT[k]=0;saveOpt();applyVolume();sfx('pick');}});}
    txt(`${Math.round(OPT[k]*100)}%`,sx+sw+18,ly,11,'#9e937a');button(sx+sw+34,ly-6,20,12,'끔',()=>{OPT[k]=0;saveOpt();applyVolume();},{size:10});ly+=15;};
  slider('배경음','bgm');slider('효과음','sfx');
  txt('화면 흔들림',x+14,ly,12,'#e6dcc3');[['끔',0],['약하게',0.5],['보통',1]].forEach(([l,v],i)=>button(x+80+i*52,ly-6,48,12,l,()=>{OPT.shake=v;saveOpt();},{size:10,main:OPT.shake===v}));ly+=16;
  pr(x+10,ly-4,w-20,1,PAL.m);txt(G.rebind?`'${KB_DEF.find(k=>k[0]===G.rebind)[1]}'에 쓸 키를 누르세요 (Esc: 취소)`:'키 설정 · 누른 뒤 원하는 키를 입력 (이동은 마우스 우클릭·방향키 고정)',x+w/2,ly+4,10,G.rebind?'#ffd35a':'#9e937a','center');ly+=12;
  KB_DEF.forEach((k,i)=>{const c=i%3,r=(i/3)|0,bx=x+10+c*128,by=ly+r*14;txt(k[1].length>11?k[1].slice(0,11)+'…':k[1],bx,by+5,9,'#d2c7ab');button(bx+80,by,44,12,G.rebind===k[0]?'...':keyLabel(kbCode(k[0])),()=>{G.rebind=k[0];},{size:10,main:G.rebind===k[0]});});
  ly+=Math.ceil(KB_DEF.length/3)*14+4;button(x+12,y+h-20,80,14,'키 기본값',()=>{OPT.keys={};saveOpt();G.rebind=null;},{size:10});button(x+w-92,y+h-20,80,14,'닫기',()=>{G.opts=false;G.rebind=null;},{size:11,main:true});}
function rebindKey(code){const a=G.rebind;G.rebind=null;if(code==='Escape')return;if(MOVEK[code]||code==='Enter'||code==='KeyM'||code==='KeyH'){msg('그 키는 쓸 수 없어요','#ff6a5a');return;}
  for(const k of KB_DEF)if(k[0]!==a&&kbCode(k[0])===code){OPT.keys[k[0]]=kbCode(a);}OPT.keys[a]=code;saveOpt();sfx('pick');}

// ================= 던전 돌발 이벤트 · 엘리트 특성 · 핑 =================
const ALTAR=[0,1].map(on=>outlineC(pcan(22,20,q=>{for(let j=8;j<19;j++)for(let i=2;i<20;i++)q(i,j,j===8||i===2?'#7b7486':(i+j)%5?'#4a4452':'#3a3444');for(let i=4;i<18;i++)q(i,8,'#9a93a6');
  for(let j=11;j<16;j++)for(let i=8;i<14;i++)if(Math.abs(i-10.5)+Math.abs(j-13)<3.2)q(i,j,on?'#ff3a2a':'#6e1a1e');
  for(const cx of[4,17]){for(let j=3;j<8;j++)q(cx,j,'#e6dcc3');q(cx,2,on?'#ffd35a':'#6b6275');q(cx,1,on?'#ff8a1f':'#3a3144');}})));
const CHEST=[0,1].map(op=>outlineC(pcan(16,14,q=>{for(let j=op?6:4;j<13;j++)for(let i=1;i<15;i++)q(i,j,(j===(op?6:4)||j===8)?'#5a3a1a':(i===1||i===14)?'#6a4a2a':'#8a5a2a');
  for(let i=1;i<15;i++){q(i,op?6:8,'#d4a02a');}if(!op){q(7,8,'#ffe9a8');q(8,8,'#ffe9a8');q(7,9,'#d4a02a');q(8,9,'#d4a02a');}else{for(let i=2;i<14;i++)q(i,7,'#ffd35a');for(let i=2;i<14;i++)for(let j=1;j<5;j++)if(j===1||i===2||i===13)q(i,j,'#6a4a2a');}})));
const GOB={fr:null};
function goblinFrames(){if(GOB.fr)return GOB.fr;const nf=npcFrames();if(!nf)return null;GOB.fr=nf[5].map(f=>{const mkT=src=>{const [c,x]=mk(29,27);x.drawImage(src,0,0,36,34,0,0,29,27);x.globalCompositeOperation='source-atop';x.fillStyle='rgba(120,190,40,0.42)';x.fillRect(0,0,29,27);x.globalCompositeOperation='source-over';
  x.fillStyle='#0e0b12';x.fillRect(4,9,8,8);x.fillStyle='#b38a3a';x.fillRect(5,10,6,6);x.fillStyle='#ffd35a';x.fillRect(6,11,2,2);x.fillRect(8,13,2,2);return c;};return{r:mkT(f.r),l:mkT(f.l)};});return GOB.fr;}
function drawGoblin(m,icx,icy){const bx=Math.round(m.dx)-icx,by=Math.round(m.dy)-icy;wx.drawImage(SH_S,bx-6,by-1);const fr=goblinFrames();
  if(fr){const k=(m.fl&64)?1+((time*10)|0)%2:0;const f=fr[k];wx.drawImage(m.face<0?f.l:f.r,bx-14,by-26+(m.flash>0?1:0));}else{wx.fillStyle='#7ab03a';wx.fillRect(bx-4,by-12,8,12);}
  if(R()<0.25)part(m.dx+rf(-5,5),m.dy-4,rf(-10,10),0,pick(['y','g','w']),rf(.3,.6),{z:rf(2,12),vz:rf(10,24),glow:true});}
function drawEliteFx(m,bx,by,s){const ea=m.ea|0;if(!ea)return;
  if(ea&256){wx.globalAlpha=0.35+0.15*Math.sin(time*8);for(let n=0;n<36;n++){const t=n/36*Math.PI*2;wpx(Math.round(bx+Math.cos(t)*(s.w/2+1)),Math.round(by-s.h/2+Math.sin(t)*(s.h/2+1)),'c');}wx.globalAlpha=1;}
  if(R()<0.12){const c=ea&1?'C':ea&4?'r':ea&32?'o':ea&8?'p':ea&64?'y':null;if(c)part(m.dx+rf(-6,6),m.dy,0,0,c,rf(.3,.6),{z:rf(2,16),vz:rf(8,20),glow:true});}}
function evObjs(){const e=G.ev,L=[];if(!e||G.kind!=='dungeon')return L;if(e.lore)L.push({k:'lore',x:e.lore.x,y:e.lore.y,r:24,ok:true});if(e.altar)L.push({k:'altar',x:e.altar.x,y:e.altar.y,r:30,ok:e.altar.st===0});if(e.trader)L.push({k:'trader',x:e.trader.x,y:e.trader.y,r:34,ok:true});
  const S=G.map&&G.map.secret;if(S&&e.secret){if(!e.secret.open){const i=S.door;L.push({k:'wall',x:(i%G.map.w)*TS+8,y:((i/G.map.w)|0)*TS+8,r:28,ok:true});}else e.secret.chests.forEach((c,i)=>L.push({k:'chest',i,x:c.x,y:c.y,r:22,ok:!c.open}));}return L;}
function nearEv(){let b=null,bd=1e9;for(const o of evObjs()){if(!o.ok)continue;const d=Math.hypot(me.x-o.x,me.y-o.y);if(d<o.r&&d<bd){bd=d;b=o;}}return b;}
function evAt(x,y){for(const o of evObjs()){if(!o.ok)continue;if(Math.abs(x-o.x)<12&&y>o.y-22&&y<o.y+8)return o;}return null;}
function useEv(o){if(o.k==='trader'){closeFac();G.fac='trader';showInv=true;showShop=false;showSkills=false;net({t:'trader'});return;}net({t:'evx',k:o.k,i:o.i});}
function evHint(o){return o.k==='lore'?'낡은 일지 읽기':o.k==='altar'?'저주받은 제단 건드리기 (괴물이 몰려옴)':o.k==='trader'?'떠돌이 상인과 거래':o.k==='wall'?'금 간 벽 부수기':'보물 상자 열기';}
function drawEvents(icx,icy,ents){const e=G.ev;if(!e||G.kind!=='dungeon')return;
  if(e.altar){const a=e.altar,sx=Math.round(a.x)-icx,sy=Math.round(a.y)-icy;ents.push({y:a.y,f:()=>{wx.drawImage(ALTAR[a.st===1?1:0],sx-11,sy-16);if(a.st===1&&R()<0.5)part(a.x+rf(-8,8),a.y-6,0,0,pick(['r','e','o']),rf(.3,.7),{z:rf(0,6),vz:rf(14,30),glow:true});}});}
  if(e.trader){const t=e.trader,sx=Math.round(t.x)-icx,sy=Math.round(t.y)-icy;ents.push({y:t.y,f:()=>{wx.drawImage(SH_S,sx-6,sy-1);const bob=(time*2|0)%2;if(SPR.ready)wx.drawImage(SPR.heroes[20].r.c,sx-12,sy-22+bob);else wx.drawImage(MERCHANT.c,sx-8,sy-14+bob);}});}
  const S=G.map.secret;if(S&&e.secret&&e.secret.open)e.secret.chests.forEach(c=>{const sx=Math.round(c.x)-icx,sy=Math.round(c.y)-icy;ents.push({y:c.y,f:()=>{wx.drawImage(CHEST[c.open?1:0],sx-8,sy-11);if(!c.open&&R()<0.06)part(c.x+rf(-5,5),c.y-8,0,0,'y',0.5,{z:rf(0,4),vz:12,glow:true});}});});
  if(S&&e.secret&&!e.secret.open&&R()<0.03){const i=S.door;part((i%G.map.w)*TS+rf(2,14),((i/G.map.w)|0)*TS+14,rf(-4,4),rf(2,8),'S',0.7,{z:rf(4,12),vz:-4});}}
function drawEvUI(icx,icy){const e=G.ev;if(!e||G.kind!=='dungeon')return;
  if(e.altar&&lit(e.altar.x-icx,e.altar.y-8-icy)>0.1)txt(e.altar.st===1?`저주받은 제단 · 물결 ${e.altar.wave}/3 · 남은 괴물 ${e.altar.left|0}`:e.altar.st===2?'정화된 제단':'저주받은 제단',e.altar.x-icx,e.altar.y-icy-22,10,e.altar.st===2?'#9e937a':'#ff8a7a','center');
  if(e.trader&&lit(e.trader.x-icx,e.trader.y-8-icy)>0.1)txt('떠돌이 상인',e.trader.x-icx,e.trader.y-icy-26,10,'#ffd35a','center');
  const o=nearEv();if(o)txt(`${keyLabel(kbCode('act'))}: ${evHint(o)}`,me.x-icx,me.y-icy+10,11,'#ffd35a','center');}
function evLights(L,icx,icy){const e=G.ev;if(!e||G.kind!=='dungeon'||G.dark)return;if(e.altar)L.push({x:e.altar.x-icx,y:e.altar.y-8-icy,r:e.altar.st===1?70:34,i:e.altar.st===2?0.5:0.9});if(e.trader)L.push({x:e.trader.x-icx,y:e.trader.y-10-icy,r:48,i:1});
  if(e.secret&&e.secret.open)for(const c of e.secret.chests)if(!c.open)L.push({x:c.x-icx,y:c.y-6-icy,r:26,i:0.8});}
function drawTrader(){const x=6,y=38,w=200,h=194;panel(x,y,w,h,'떠돌이 상인');const T=G.trd;const pr0=T?T.pot:0;
  pimg(POT_HP,x+8,y+18);txt('체력 물약',x+26,y+24,11,'#ff7a6a');txt(`${pr0}골드 (할인)`,x+26,y+33,10,'#ffd35a');button(x+w-50,y+20,42,14,'구입',()=>net({t:'tbuy',k:'hp'}),{size:11});
  pimg(POT_MP,x+8,y+38);txt('마나 물약',x+26,y+44,11,'#8fd0ff');txt(`${pr0}골드 (할인)`,x+26,y+53,10,'#ffd35a');button(x+w-50,y+40,42,14,'구입',()=>net({t:'tbuy',k:'mp'}),{size:11});
  pr(x+8,y+62,w-16,1,PAL.m);txt('귀한 물건 · 이 층에서만 팝니다',x+10,y+70,11,'#9e937a');
  if(T)T.items.forEach((it,i)=>{const c=i%4,sx=x+12+c*46,sy=y+80;itemSlot(sx,sy,24,it,()=>net({t:'tbuy',id:it.id}),null,'shop');txt(`${it.price}`,sx+12,sy+30,10,G.ch&&G.ch.gold>=it.price?'#ffd35a':'#e0574a','center');});
  if(T&&!T.items.length)txt('다 팔렸어요',x+w/2,y+100,11,'#6b6275','center');}
// ---- 핑 ----
const PING_K=[['여기로!','#8fd0ff','c'],['위험!','#ff5a4a','r'],['이 아이템!','#ffd35a','y']];
function sendPing(){if(!G.map)return;let k=0;if(monsterAt(mouse.wx,mouse.wy))k=1;else if(dropUnderMouse())k=2;net({t:'ping',x:Math.round(mouse.wx),y:Math.round(mouse.wy),k});}
function onPing(d){(G.pings=G.pings||[]).push({x:d.x,y:d.y,k:d.k,name:d.name,t:time,me:d.id===myId});if(G.pings.length>8)G.pings.shift();sfx(d.k===1?'no':'chat');}
function drawPings(icx,icy){const ps=G.pings;if(!ps)return;for(let i=ps.length-1;i>=0;i--){const p=ps[i],a=time-p.t;if(a>4){ps.splice(i,1);continue;}const K=PING_K[p.k]||PING_K[0];const sx=Math.round(p.x-icx),sy=Math.round(p.y-icy);
  const on=sx>-4&&sx<W+4&&sy>-4&&sy<H+4;ctx.globalAlpha=a>3.4?(4-a)/0.6:1;
  if(on){const r=4+((a*1.6)%1)*14;ctx.strokeStyle=K[1];ctx.lineWidth=SC*0.8;ctx.beginPath();ctx.ellipse(sx*SC,sy*SC,r*SC,r*0.55*SC,0,0,Math.PI*2);ctx.stroke();
    pr(sx-1,sy-14,3,10,K[1]);pr(sx-2,sy-16,5,3,K[1]);pr(sx-1,sy-4,3,3,K[1]);txt(`${p.name}: ${K[0]}`,sx,sy-22,11,K[1],'center');}
  else{const cx=clamp(sx,14,W-14),cy=clamp(sy,20,H-44);const an=Math.atan2(sy-cy,sx-cx);pr(cx-5,cy-5,10,10,'rgba(10,7,14,0.8)');for(let k=0;k<4;k++){pr(Math.round(cx+Math.cos(an)*(2+k)),Math.round(cy+Math.sin(an)*(2+k)),2,2,K[1]);}txt(K[0],cx,cy+10,10,K[1],'center');}
  ctx.globalAlpha=1;}}

// ================= 3단계: 결투장 · 낚시 · 감정표현 · 옷장 =================
// ---- 결투장 ----
function inArena(){return !!(G.map&&G.map.arena===true);}
function arenaFrozen(){return inArena()&&G.arena&&G.arena.cdEnd>time;}
function teamOf(id){return G.arena&&G.arena.teams?G.arena.teams[id]:undefined;}
function onArena(d){if(d.st==='cd'){G.arena={teams:d.teams,names:d.names,cdEnd:time+d.t0,start:time+d.t0};G.arenaRes=null;sfx('boss');}
  else if(d.st==='go'){if(G.arena){G.arena.cdEnd=0;G.arena.start=time;}sfx('shout');}
  else if(d.st==='end'){if(G.arena){G.arena.teams=d.teams||G.arena.teams;}const my=teamOf(myId);G.arenaRes={win:d.win===my,rows:d.rows,time:d.time,at:time,teams:d.teams};sfx(d.win===my?'legend':'no');}}
function drawArenaUI(){if(!inArena()||!G.arena)return;const A=G.arena;
  if(A.cdEnd>time){const n=Math.ceil(A.cdEnd-time);bigTxt(String(n),240,92,18,'#ffd35a',3,'px');txt(`${(A.names[0]||[]).join(', ')}  vs  ${(A.names[1]||[]).join(', ')}`,240,122,13,'#e6dcc3','center');}
  else if(!G.arenaRes){const left=Math.max(0,120-(time-A.start));txt(`결투 · 남은 시간 ${Math.floor(left/60)}:${String(Math.floor(left%60)).padStart(2,'0')}`,240,26,12,left<15?'#ff6a5a':'#ffd35a','center');if(time-A.start<1.2)bigTxt('시작!',240,92,18,'#ff6a5a',3);}
  if(G.arenaRes){const R2=G.arenaRes;const rows=(R2.rows||[]).slice().sort((a,b)=>b.dmg-a.dmg);bigTxt(R2.win?'승리!':'패배',240,58,18,R2.win?'#ffd35a':'#e0473a',3);
    drawMeterTable(R2.win?'결투 승리':'결투 패배',rows,100,82,280,`전투 시간 ${R2.time}초 · 잠시 후 마을로 돌아갑니다`);}}
function duelMenuItems(c){const it=[];if(G.kind==='hub'){const pt=G.party;const inMy=pt&&pt.members.some(m=>m.id===c.id);if(!inMy){it.push(['결투 신청',()=>net({t:'duel',id:c.id})]);}}return it;}
function drawDuelInv(){const iv=G.duelInv;if(!iv)return;if(time-iv.t>30){net({t:'duelAns',from:iv.from,ok:false});G.duelInv=null;return;}const w=220,h=40,x=240-w/2,y=74;panel(x,y,w,h);
  txt(`${iv.name}님이 ${iv.n}:${iv.n} 결투를 신청했습니다`,x+w/2,y+10,12,'#ff8a7a','center');button(x+36,y+20,68,15,'수락 (Y)',()=>{net({t:'duelAns',from:iv.from,ok:true});G.duelInv=null;},{main:true});button(x+116,y+20,68,15,'거절 (N)',()=>{net({t:'duelAns',from:iv.from,ok:false});G.duelInv=null;});}
function drawArenaBoard(){const x=6,y=38,w=226,h=194;panel(x,y,w,h,'결투장');const ch=G.ch;let ly=y+26;
  const L=['다른 플레이어를 클릭 → [결투 신청]','파티장끼리 같은 인원이면 파티 대결(2:2 등)','결투는 친선전 · 경험치·장비 손실 없음','쓰러진 동료는 일으킬 수 없어요 · 제한 시간 2분','피해는 몬스터에게보다 약하게 들어가요'];
  for(const l of L){txt('· '+l,x+10,ly,10,'#d2c7ab');ly+=12;}ly+=4;pr(x+8,ly-4,w-16,1,PAL.m);ly+=6;
  if(ch&&ch.pvp){const t=ch.pvp.w+ch.pvp.l;txt(`내 전적  ${ch.pvp.w}승 ${ch.pvp.l}패${t?`  (승률 ${Math.round(ch.pvp.w/t*100)}%)`:''}`,x+10,ly,12,'#ffd35a');ly+=16;}
  txt('마을에 있는 모험가',x+10,ly,10,'#9e937a');ly+=11;const list=[...G.ros.values()].filter(r=>r.pvp).sort((a,b)=>(b.pvp.w-a.pvp.w)).slice(0,6);
  for(const r of list){txt(`${r.name} (${CLASSES[r.cls].n} ${r.lvl})`,x+14,ly,10,r.id===myId?'#ffd35a':'#e6dcc3');txt(`${r.pvp.w}승 ${r.pvp.l}패`,x+w-12,ly,10,'#9e937a','right');ly+=11;}}

// ---- 낚시 ----
const FISHI={};function fishIcon(r){if(FISHI[r])return FISHI[r];const c=SH.FISH_RC[r];FISHI[r]=outlineC(pcan(14,9,q=>{for(let i=2;i<11;i++){const hh=Math.round(3*Math.sin((i-2)/9*Math.PI));for(let j=4-hh;j<=4+hh;j++)q(i,j,j<4?shade(c,1):shade(c,0.7));}q(1,2,shade(c,0.6));q(1,6,shade(c,0.6));q(0,1,shade(c,0.6));q(0,7,shade(c,0.6));q(9,3,'#0e0b12');}));return FISHI[r];}
function fishStart(){G.fishS={st:'cast',t:time};net({t:'fish',op:'cast'});sfx('swing');}
function onFish(d){const F=G.fishS||(G.fishS={});if(d.st==='cast'){F.st='wait';F.biteAt=time+d.wait/1000;F.t=time;}else if(d.st==='bite'){F.r=d.r;}
  else if(d.st==='got'){const f=SH.FISH.find(x=>x.id===d.id);G.fishS={st:'got',t:time,f,cm:d.cm,g:d.g,rank:d.rank==null?-1:d.rank,best:d.best,extra:d.extra,gx:d.gx|0};if(G.ch&&d.fxp!=null)G.ch.fishXp=d.fxp;if(d.lvup){G.fishLvUp={lv:d.lvup,t:time};setTimeout(()=>sfx('legend'),400);}sfx(f.r>=2||d.g>=2||d.rank>=0?'legend':'rare');}
  else if(d.st==='miss'){G.fishS={st:'miss',t:time};}}
const FISH_Z=[0.34,0.25,0.17,0.11],FISH_V=[1.1,1.5,2.0,2.6];
function fishPress(){const F=G.fishS;if(!F)return false;
  if(F.st==='wait'){net({t:'fish',op:'reel',ok:false});G.fishS={st:'miss',t:time};return true;}
  if(F.st==='bite'){F.st='game';F.t=time;F.ph=R()*6;return true;}
  if(F.st==='game'){const pos=(Math.sin((time-F.t)*FISH_V[F.r|0]*3+F.ph)+1)/2;const z=FISH_Z[F.r|0];const ok=Math.abs(pos-F.zc)<z/2;net({t:'fish',op:'reel',ok});if(!ok)G.fishS={st:'miss',t:time};else F.st='reel';sfx(ok?'pick':'no');return true;}
  if(F.st==='got'||F.st==='miss'){fishStart();return true;}return false;}
function updateFish(){const F=G.fishS;if(!F)return;if(G.kind!=='hub'||Math.hypot(me.x-G.map.fish.x,me.y-G.map.fish.y)>60){G.fishS=null;return;}
  if(F.st==='wait'&&time>=F.biteAt){F.st='bite';F.t=time;F.zc=0.2+R()*0.6;net({t:'fish',op:'bite'});sfx('chat');}
  if(F.st==='bite'&&time-F.t>1.4){net({t:'fish',op:'reel',ok:false});G.fishS={st:'miss',t:time};}
  if(F.st==='game'&&time-F.t>6){net({t:'fish',op:'reel',ok:false});G.fishS={st:'miss',t:time};}
  if((F.st==='got'||F.st==='miss')&&time-F.t>6)G.fishS=null;}
function drawFishWorld(icx,icy){const F=G.fishS;if(!F||G.kind!=='hub')return;const p=G.map.pond;const bx=Math.round(p.cx-12)-icx,by=Math.round(p.cy-14)-icy;const px=Math.round(me.x)-icx,py=Math.round(me.y)-icy-14;
  if(F.st==='cast'||F.st==='got'||F.st==='miss')return;const dip=F.st==='bite'||F.st==='game'?((time*12|0)%2)*2:Math.round(Math.sin(time*3));
  wx.strokeStyle='rgba(230,220,195,0.6)';wx.lineWidth=1;wx.beginPath();wx.moveTo(px+4,py);wx.quadraticCurveTo((px+bx)/2,Math.max(py,by)+8,bx,by+dip);wx.stroke();
  wpx(bx,by+dip-1,'e');wpx(bx,by+dip,'w');wpx(bx+1,by+dip,'e');if(F.st==='bite'&&R()<0.5)part(p.cx-12+rf(-4,4),p.cy-14,rf(-20,20),rf(-10,0),'c',0.35,{z:rf(0,6),vz:rf(20,40)});}
function drawFishUI(){const F=G.fishS;if(!F)return;const x=150,y=176,w=180,h=40;pr(x,y,w,h,'rgba(10,7,14,0.85)');pr(x,y,w,1,PAL.y);const K=keyLabel(kbCode('act'));
  {const L=SH.fishLvOf(G.ch&&G.ch.fishXp|0);const ly=y-13;pr(x,ly,w,12,'rgba(10,7,14,0.85)');const up=G.fishLvUp&&time-G.fishLvUp.t<3;txt(`낚시 Lv.${L.lv}`,x+5,ly+6,10,up&&((time*6|0)%2)?'#ffffff':'#7fd0ff');
    const bx=x+58,bw=w-64;pr(bx,ly+4,bw,4,PAL.k);if(L.need)pr(bx,ly+4,Math.round(bw*L.cur/L.need),4,'#4a9ad8');else pr(bx,ly+4,bw,4,'#ffd35a');txt(L.need?`${L.cur}/${L.need}`:'최고 레벨',bx+bw/2,ly+6,8,'#e6dcc3','center');
    const o=SH.fishOdds(L.lv);uiRects.push({x,y:ly,w,h:12,tip:[[`낚시 Lv.${L.lv} 등장 확률`,'#7fd0ff',12],[`전설 ${o[3].toFixed(1)}% · 희귀 ${o[2].toFixed(1)}% · 고급 ${o[1].toFixed(1)}% · 일반 ${o[0].toFixed(1)}%`,'#e6dcc3',11],['레벨이 오르면 높은 등급이 더 자주 나와요 (잡는 난이도는 그대로)','#9e937a',10],['경험치: 일반 5 · 고급 10 · 희귀 20 · 전설 40 (큰 물고기는 더)','#9e937a',10]]});
    if(up)bigTxt(`낚시 레벨 ${G.fishLvUp.lv}!`,x+w/2,ly-12,14,'#7fd0ff',2);}
  if(F.st==='cast')txt('낚싯대를 던지는 중...',x+w/2,y+20,12,'#e6dcc3','center');
  else if(F.st==='wait'){txt('찌를 지켜보세요...',x+w/2,y+14,12,'#e6dcc3','center');txt(`입질이 오면 ${K} 또는 클릭 (너무 일찍 당기면 놓쳐요)`,x+w/2,y+28,10,'#9e937a','center');}
  else if(F.st==='bite'){const b=(time*8|0)%2;bigTxt('입질!',x+w/2,y+16,16,b?'#ffd35a':'#ff8a1f',2);txt(`지금 ${K}!`,x+w/2,y+32,11,'#e6dcc3','center');}
  else if(F.st==='game'||F.st==='reel'){const z=FISH_Z[F.r|0];const bw=w-20,bx=x+10,by=y+14;pr(bx,by,bw,8,PAL.k);pr(bx+Math.round(bw*(F.zc-z/2)),by,Math.round(bw*z),8,'#3a9a4a');const pos=F.st==='reel'?F.zc:(Math.sin((time-F.t)*FISH_V[F.r|0]*3+F.ph)+1)/2;pr(bx+Math.round(bw*pos)-1,by-3,3,14,'#ffd35a');
    txt(F.st==='reel'?'끌어올리는 중...':`초록 칸에서 ${K}!`,x+w/2,y+32,11,'#e6dcc3','center');txt(SH.FISH_RN[F.r|0],x+w-8,y+6,9,SH.FISH_RC[F.r|0],'right');}
  else if(F.st==='got'){const f=F.f;pimg(fishIcon(f.r),x+10,y+10);const gw=txt(`${f.n} ${F.cm}cm`,x+30,y+12,12,SH.FISH_RC[f.r]);if(F.g!=null)txt(`[${SH.FISH_GN[F.g]}]`,x+34+gw,y+12,10,SH.FISH_GC[F.g]);txt(`${SH.FISH_RN[f.r]} · ${f.v}골드${F.gx?` · 경험치 +${F.gx}`:''}${F.extra||''}${F.rank>=0?` · 낚시 랭킹 ${F.rank+1}위!`:F.best?' · 최고 기록!':''}`,x+30,y+24,10,F.rank>=0?'#ffd35a':'#d2c7ab');txt(`${K}: 다시 던지기`,x+w-8,y+34,9,'#6b6275','right');}
  else if(F.st==='miss'){txt('놓쳤다...',x+w/2,y+14,12,'#9e937a','center');txt(`${K}: 다시 던지기`,x+w/2,y+28,10,'#6b6275','center');}}
function drawWater(sx,sy,tx,ty){const t=time*1.4;wx.fillStyle='#1c3a5a';wx.fillRect(sx,sy,16,16);for(let j=0;j<16;j+=4){const o=Math.round(Math.sin(t+(tx*16+j)*0.3+ty)*2);wx.fillStyle='#2a5a82';wx.fillRect(sx+((j*5+o+16)%16),sy+j,5,1);}if(((tx*7+ty*13+(t*2|0))%11)===0){wx.fillStyle='#8fd0ff';wx.fillRect(sx+6,sy+7,2,1);}}

// ---- 감정표현 ----
const EMOI=[pcan(12,12,q=>{for(let j=3;j<11;j++)for(let i=3;i<9;i++)q(i,j,'#f0c89a');for(let k=0;k<4;k++){q(3+k*2,1,'#f0c89a');q(3+k*2,2,'#f0c89a');}q(9,5,'#f0c89a');q(10,4,'#f0c89a');}),
  pcan(12,12,q=>{discP(q,6,6,5,'#ffd35a');q(4,4,'#0e0b12');q(8,4,'#0e0b12');for(let i=3;i<10;i++)q(i,7,'#0e0b12');for(let i=4;i<9;i++)q(i,8,'#b3282b');}),
  pcan(12,12,q=>{for(let j=0;j<12;j++)for(let i=0;i<12;i++){const x=(i-5.5)/5,y=(j-5)/5;if((x*x+y*y-1)**3-x*x*y*y*y<=0)q(i,j,j<4&&i<5?'#ff8a8a':'#e0303a');}}),
  pcan(12,12,q=>{discP(q,6,6,5,'#e0574a');q(3,3,'#0e0b12');q(4,4,'#0e0b12');q(9,3,'#0e0b12');q(8,4,'#0e0b12');for(let i=4;i<9;i++)q(i,8,'#0e0b12');}),
  pcan(12,12,q=>{discP(q,6,6,5,'#8fd0ff');q(4,5,'#0e0b12');q(8,5,'#0e0b12');for(let i=4;i<9;i++)q(i,9,'#0e0b12');q(3,7,'#2a6aff');q(3,8,'#2a6aff');}),
  pcan(12,12,q=>{for(let j=5;j<11;j++)for(let i=3;i<9;i++)q(i,j,'#f0c89a');for(let j=1;j<6;j++){q(4,j,'#f0c89a');q(5,j,'#f0c89a');}for(let j=6;j<11;j++)q(9,j,'#c89a6a');}),
  pcan(12,12,q=>{for(const[i,j]of[[4,1],[5,1],[6,1],[7,1],[8,2],[8,3],[7,4],[6,5],[6,6],[6,7],[6,9],[6,10]])q(i,j,'#ffd35a');q(3,2,'#ffd35a');}),
  pcan(12,12,q=>{for(const[i,j]of[[1,6],[2,6],[3,6],[3,7],[2,8],[1,9],[2,9],[3,9],[6,1],[7,1],[8,1],[8,2],[7,3],[6,4],[7,4],[8,4]])q(i,j,'#bfe3ff');})].map(outlineC);
function onEmo(d){G.emos=G.emos||new Map();G.emos.set(d.id,{i:d.i,t:time});sfx('chat');}
function drawEmos(icx,icy){if(!G.emos)return;for(const [id,e] of G.emos){const a=time-e.t;if(a>3){G.emos.delete(id);continue;}const p=id===myId?me:G.players.get(id);if(!p)continue;const px=Math.round(id===myId?me.x:p.dx)-icx,py=Math.round(id===myId?me.y:p.dy)-icy;
  const hop=a<0.5?Math.round(Math.sin(a/0.5*Math.PI)*5):0;const img=EMOI[e.i];pr(px-8,py-50-hop,16,16,'rgba(10,7,14,0.7)');pimg(img,px-6,py-48-hop);}}
function drawEmoWheel(){if(!G.emoWheel)return;const cx=240,cy=130,R0=46;pr(cx-60,cy-60,120,120,'rgba(8,6,12,0.55)');txt('감정표현',cx,cy,11,'#ffd35a','center');
  SH.EMOTES.forEach((n,i)=>{const a=-Math.PI/2+i/8*Math.PI*2,x=Math.round(cx+Math.cos(a)*R0),y=Math.round(cy+Math.sin(a)*R0);const hov=Math.hypot(mouse.x-x,mouse.y-y)<12;pr(x-11,y-11,22,22,hov?PAL.y:PAL.k);pr(x-10,y-10,20,20,'#241e2b');pimg(EMOI[i],x-6,y-8);txt(`${i+1}`,x-9,y-8,8,'#9e937a','left','px');
    uiRects.push({x:x-11,y:y-11,w:22,h:22,click:()=>{net({t:'emo',i});G.emoWheel=false;},tip:()=>[[n,'#ffd35a',12]]});});}

// ---- 옷장 · 염색 ----
const DYE_CACHE=new Map();
function rgb2hsl(r,g,b){r/=255;g/=255;b/=255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b);let h=0,s=0;const l=(mx+mn)/2;if(mx!==mn){const d=mx-mn;s=l>0.5?d/(2-mx-mn):d/(mx+mn);h=mx===r?(g-b)/d+(g<b?6:0):mx===g?(b-r)/d+2:(r-g)/d+4;h*=60;}return[h,s,l];}
function hsl2rgb(h,s,l){h=((h%360)+360)%360/360;if(s===0)return[l*255,l*255,l*255];const q2=l<0.5?l*(1+s):l+s-l*s,p2=2*l-q2;const f=t=>{t=(t+1)%1;return t<1/6?p2+(q2-p2)*6*t:t<1/2?q2:t<2/3?p2+(q2-p2)*(2/3-t)*6:p2;};return[f(h+1/3)*255,f(h)*255,f(h-1/3)*255];}
function dyeCanvas(c,D){const k=c;let m=DYE_CACHE.get(D.n);if(!m){m=new Map();DYE_CACHE.set(D.n,m);}if(m.has(k))return m.get(k);const [o,x]=mk(c.width,c.height);x.drawImage(c,0,0);const id=x.getImageData(0,0,c.width,c.height),a=id.data;
  for(let i=0;i<a.length;i+=4){if(a[i+3]<10)continue;let [h,s,l]=rgb2hsl(a[i],a[i+1],a[i+2]);if(l<0.1)continue;const skin=h>=8&&h<=45&&s>=0.18&&s<=0.8&&l>=0.38&&l<=0.88;if(skin)continue;
    if(s<0.14){if(D.dark)l*=0.62;else if(D.light)l=Math.min(0.95,l*1.15+0.08);else continue;}else{if(D.h!=null)h=D.h;if(D.dark){l*=0.5;s*=0.4;}if(D.light){s*=0.2;l=0.55+l*0.4;}}
    const [r,g,b]=hsl2rgb(h,s,l);a[i]=r;a[i+1]=g;a[i+2]=b;}x.putImageData(id,0,0);m.set(k,o);return o;}
function dyeFrames(fr,D){const out={};const seen=new Map();const cp=f=>{if(seen.has(f))return seen.get(f);const n=Object.assign({},f,{c:dyeCanvas(f.c,D)});seen.set(f,n);return n;};for(const key in fr)out[key]=Array.isArray(fr[key])?fr[key].map(f=>({r:cp(f.r),l:cp(f.l)})):fr[key];return out;}
function drawTailor(){const x=6,y=38,w=226,h=194;panel(x,y,w,h,'재단사 마르타의 옷장');const ch=G.ch;if(!ch)return;txt(`염료 하나당 ${SH.DYE_COST}골드 · 한 번 사면 계속 무료`,x+w/2,y+21,10,'#9e937a','center');
  SH.DYES.forEach((D,i)=>{const c=i%2,r=(i/2)|0,bx=x+10+c*104,by=y+30+r*20;const own=i===0||(ch.dyes||[]).includes(i),cur=(ch.dye|0)===i;pr(bx,by,100,18,cur?PAL.y:PAL.k);pr(bx+1,by+1,98,16,cur?'#3a3016':'#241e2b');
    const sw=D.h!=null?`hsl(${D.h},60%,45%)`:D.dark?'#26222c':D.light?'#dcd8e4':'#8a6a4a';pr(bx+4,by+4,10,10,PAL.k);pr(bx+5,by+5,8,8,sw);txt(D.n,bx+19,by+9,11,cur?'#ffd35a':'#e6dcc3');txt(cur?'착용 중':own?'보유':`${SH.DYE_COST}`,bx+96,by+9,9,cur?'#ffd35a':own?'#7fd05a':'#ffd35a','right');
    uiRects.push({x:bx,y:by,w:100,h:18,click:()=>net({t:'dye',i}),tip:()=>[[D.n+' 염료','#ffd35a',12],[own?'클릭: 입기':`클릭: ${SH.DYE_COST}골드에 사서 입기`,'#9e937a',11]]});});
  const cs=ch.cos||{};const ly=y+140;button(x+10,ly,w-100,14,`무기 보이기 (마을): ${cs.cape===0?'끔':'켬'}`,()=>net({t:'cos',k:'cape'}),{size:10});button(x+10,ly+18,w-100,14,`전설 불꽃 효과: ${cs.glow===0?'끔':'켬'}`,()=>net({t:'cos',k:'glow'}),{size:10});if(ch.cls==='guardian')button(x+10,ly+36,w-100,14,`방패 보이기: ${cs.shield===0?'끔':'켬'}`,()=>net({t:'cos',k:'shield'}),{size:10,tip:[['방패 외형만 숨겨요','#ffd35a',12],['방어력·막기 등 방패 기능은 그대로예요','#9e937a',11]]});
  const pv=playerFrames(ch.cls,lookOfMe());const s=pv.idle[((time*2)|0)%2].r;const sc=2;ctx.imageSmoothingEnabled=false;ctx.drawImage(s.c,Math.round((x+w-8-s.w*sc)*SC),Math.round((y+h-6-s.h*sc)*SC),s.w*sc*SC,s.h*sc*SC);}
const WARDROBE=outlineC(pcan(22,32,q=>{for(let j=2;j<31;j++)for(let i=1;i<21;i++)q(i,j,(i===1||i===20||j===2||j===30)?'#4a2e16':(i===10||i===11)?'#3a2210':(j%6===0)?'#6a4020':'#7a4a24');for(let j=8;j<22;j++)for(let i=3;i<9;i++)q(i,j,((i+j)%4)?'#9ab8d8':'#cfe2f2');q(9,16,'#d4a02a');q(12,16,'#d4a02a');for(let i=0;i<22;i++)q(i,1,'#5a3a1a');}));

// ================= 4단계: 특성 나무 · 업적/칭호 · 도감 · 펫 =================
// ---- 특성 ----
function talLeft(){return G.ch?SH.talentPts(G.ch.lvl)-SH.talentSpent(G.ch):0;}
function drawTalents(){const ch=G.ch;if(!ch)return;const x=70,y=22,w=340,h=212;panel(x,y,w,h,'특성');const left=talLeft();
  txt(`특성 포인트 ${left} / ${SH.talentPts(ch.lvl)}  ·  레벨 10부터 2레벨마다 1포인트 (최대 20)`,x+w/2,y+21,10,left>0?'#ffd35a':'#9e937a','center');
  const tr=SH.TALENTS[ch.cls];tr.forEach((br,bi)=>{const bx=x+10+bi*108,bw=104;const sp=SH.branchSpent(ch,bi);pr(bx,y+30,bw,160,'rgba(10,7,14,0.5)');txt(`${br.b} (${sp})`,bx+bw/2,y+38,12,'#ffd35a','center');
    br.n.forEach((nd,k)=>{const ny=y+50+k*46;const r=(ch.tal&&ch.tal[nd.id])|0;const err=SH.canTalent(ch,nd.id);const lock=err&&err.includes('윗단계');const hov=mouse.x>=bx+4&&mouse.x<bx+bw-4&&mouse.y>=ny&&mouse.y<ny+40;
      pr(bx+4,ny,bw-8,40,hov&&!err?PAL.y:r?'#b38a3a':PAL.k);pr(bx+5,ny+1,bw-10,38,lock?'#1b1622':r?'#2e2414':'#241e2b');
      txt(nd.n,bx+bw/2,ny+8,11,lock?'#6b6275':'#f2eadb','center');txt(SH.TN[nd.k](Math.round(nd.v*Math.max(1,r)*10)/10),bx+bw/2,ny+19,10,lock?'#4a4452':'#8fb8ff','center');
      for(let q=0;q<nd.max;q++)pr(bx+bw/2-22+q*9,ny+29,7,4,q<r?'#ffd35a':'#3a3144');
      if(k>0)txt(`${SH.TAL_NEED[k]}↑`,bx+bw-9,ny+5,8,lock?'#e0574a':'#6b6275','right','px');
      uiRects.push({x:bx+4,y:ny,w:bw-8,h:40,click:()=>net({t:'tal',id:nd.id}),tip:()=>[[nd.n,'#ffd35a',13],[`${r} / ${nd.max}단계`,'#9e937a',11],[`단계당 ${SH.TN[nd.k](nd.v)}`,'#8fb8ff',12],r?[`현재 ${SH.TN[nd.k](Math.round(nd.v*r*10)/10)}`,'#7fd05a',11]:['아직 배우지 않음','#6b6275',11],err?[err,'#e0574a',11]:['클릭: 1포인트 투자','#ffd35a',11]]});});});
  button(x+w-112,y+h-19,100,14,`초기화 (${50*ch.lvl}골드)`,()=>net({t:'talreset'}),{size:10,dis:G.kind!=='hub',tip:()=>[['마을에서만 초기화할 수 있어요','#9e937a',11]]});txt('N: 닫기',x+12,y+h-12,10,'#6b6275');}

// ---- 기록 창 (업적 · 칭호 · 도감 · 펫) ----
function myTitle(){return G.ch&&G.ch.title?SH.titleOf(G.ch.title):null;}
function drawRecords(){const ch=G.ch;if(!ch)return;const x=60,y=18,w=360,h=220;panel(x,y,w,h,'기록');const tab=G.recTab||'ach';
  [['ach','업적·칭호'],['cdx','도감'],['pet','펫'],['lore','이야기']].forEach(([k,l],i)=>button(x+10+i*80,y+17,76,13,l,()=>{G.recTab=k;G.cdxG=null;},{size:11,main:tab===k}));
  const done=new Set(ch.ach||[]);
  if(tab==='ach'){txt(`달성 ${done.size}/${SH.ACH.length}`,x+w-12,y+24,10,'#9e937a','right');const ct=myTitle();txt(ct?`칭호: ${ct}`:'칭호 없음',x+10,y+39,11,ct?'#c9a0e8':'#6b6275');if(ct)button(x+120,y+33,50,12,'해제',()=>net({t:'title',id:null}),{size:9});
    SH.ACH.forEach((a,i)=>{const c=i%2,r=(i/2)|0,bx=x+8+c*174,by=y+48+r*14;const ok=done.has(a.id);const v=Math.min(a.need,a.c(ch)|0);const cur=ch.title===a.id;
      pr(bx,by,170,13,cur?'rgba(120,80,150,0.55)':ok?'rgba(60,50,20,0.55)':'rgba(10,7,14,0.5)');txt((ok?'✓ ':'')+a.n,bx+4,by+6,10,ok?'#ffd35a':'#9e937a');txt(ok?`「${a.t}」`:`${v}/${a.need}`,bx+166,by+6,9,ok?'#c9a0e8':'#6b6275','right');
      uiRects.push({x:bx,y:by,w:170,h:13,click:ok?()=>net({t:'title',id:a.id}):null,tip:()=>{const L=[[a.n,ok?'#ffd35a':'#e6dcc3',12],[a.d,'#e6dcc3',11],[`칭호: ${a.t}`,'#c9a0e8',11],[`진행 ${v} / ${a.need}`,'#9e937a',11]];if(a.pet)L.push([`보상 펫: ${SH.PETS.find(p=>p.id===a.pet).n}`,'#7fd05a',11]);if(ok)L.push(['클릭: 이 칭호 달기','#ffd35a',11]);return L;}});});}
  else if(tab==='cdx'){const all=SH.codexList(),have=new Set(ch.cdx||[]);txt(`등록 ${have.size}/${all.length}`,x+w-12,y+24,10,'#9e937a','right');const groups=['몬스터','보스','전설 장비','물고기'];const g=G.cdxG||groups[0];
    groups.forEach((gn,i)=>{const n=all.filter(e=>e.g===gn),hv=n.filter(e=>have.has(e.k)).length;button(x+10+i*86,y+33,82,12,`${gn} ${hv}/${n.length}`,()=>{G.cdxG=gn;},{size:9,main:g===gn});});
    const list=all.filter(e=>e.g===g);list.forEach((e,i)=>{const c=i%3,r=(i/3)|0,bx=x+8+c*116,by=y+50+r*12;if(by>y+h-10)return;const k=have.has(e.k);txt(k?e.n:'???',bx+2,by+5,10,k?(g==='보스'?'#ff8a7a':g==='전설 장비'?'#ff8a1f':'#e6dcc3'):'#4a4452');});}
  else if(tab==='lore'){drawLoreTab(x,y,w,h);button(x+w/2-60,y+h-20,120,14,`연대기 열기 (${keyLabel(kbCode('chron'))})`,()=>openChron(true),{size:11,main:true});}
  else{const own=new Set(ch.pets||[]);txt('펫은 떨어진 골드·보석을 멀리서도 주워 줘요',x+w/2,y+38,10,'#9e937a','center');
    SH.PETS.forEach((p,i)=>{const c=i%4,r=(i/4)|0,bx=x+8+c*86,by=y+48+r*84;const has=own.has(p.id),cur=ch.pet===p.id;pr(bx,by,82,80,cur?PAL.y:PAL.k);pr(bx+1,by+1,80,78,cur?'#2e2414':'#1c1622');if(p.id==='moonlet'){ctx.globalAlpha=has?1:0.25;ctx.imageSmoothingEnabled=false;ctx.drawImage(MOONLET[0],Math.round((bx+41-15)*SC),Math.round((by+14)*SC),30*SC,30*SC);ctx.globalAlpha=1;}
      const fr=petFrames();if(fr&&fr[i]&&p.id!=='moonlet'){const f=fr[i][((time*4)|0)%4].r;ctx.globalAlpha=has?1:0.25;ctx.drawImage(f,Math.round((bx+41-f.width)*SC),Math.round((by+8)*SC),f.width*2*SC,f.height*2*SC);ctx.globalAlpha=1;}
      txt(has?p.n:'???',bx+41,by+54,11,has?'#e6dcc3':'#6b6275','center');const a=SH.ACH.find(q=>q.pet===p.id);
      if(has)button(bx+6,by+62,70,13,cur?'보내기':'데리고 다니기',()=>net({t:'pet',id:cur?null:p.id}),{size:10,main:!cur});else txt(a?`업적 '${a.n}'`:'',bx+41,by+68,9,'#9e937a','center');});}}

// ---- 펫 ----
const PET_R=['slime','bat','crow','cat','fox','dragon'];const PET_FLY={bat:1,cat:0.5};
let PET_FR=null;function petFrames(){if(PET_FR||!LOB.pets)return PET_FR;PET_FR=[];for(let r=0;r<6;r++){const row=[];for(let k=0;k<4;k++){const [c,x]=mk(28,24);x.drawImage(LOB.pets,k*28,r*24,28,24,0,0,28,24);const [f,fx2]=mk(28,24);fx2.translate(28,0);fx2.scale(-1,1);fx2.drawImage(c,0,0);row.push({r:c,l:f});}PET_FR.push(row);}return PET_FR;}
const PETST=new Map();
function updatePets(dt){if(!G.map)return;const own=[];if(G.ch&&G.ch.pet)own.push([myId,G.ch.pet,me.x,me.y,me.face,me.moving]);for(const p of G.players.values()){if(p.id===myId)continue;const pt=p.look&&p.look.pet;if(pt)own.push([p.id,pt,p.dx,p.dy,p.face,p.moving]);}
  const seen=new Set();for(const [id,pt,x,y,face] of own){seen.add(id);let s=PETST.get(id);if(!s||s.pt!==pt){s={pt,x:x-12,y,face:1,animT:R()*3,mv:false};PETST.set(id,s);}
    const tx=x-(face||1)*14,ty=y+3;const dx=tx-s.x,dy=ty-s.y,d=Math.hypot(dx,dy);s.animT+=dt;if(d>220){s.x=tx;s.y=ty;}else if(d>3){const sp=Math.min(d*4,160)*dt;s.x+=dx/d*sp;s.y+=dy/d*sp;s.mv=true;if(Math.abs(dx)>1)s.face=dx<0?-1:1;}else{s.mv=false;s.face=face||s.face;}}
  for(const id of [...PETST.keys()])if(!seen.has(id))PETST.delete(id);}
/* 새끼 흑월: 검은 초승달이 등불처럼 은은히 빛나며 떠다님 */
const MOONLET=[1,-1].map(dir=>pcan(15,15,q=>{const cx=7,cy=7;for(let y=0;y<15;y++)for(let x=0;x<15;x++){const d=Math.hypot(x-cx,y-cy),d2=Math.hypot(x-(cx+dir*3),y-(cy-2));if(d<=6.3&&d2>5.2){const rim=d>5.2||d2<6.2;q(x,y,rim?(d2<6.2?'P':'p'):'k');}}q(cx-dir*3,cy+3,'y');}));
function drawMoonlet(bx,by,s){const hov=10+Math.sin((s.animT||0)*3)*2.5;const cx=bx,cy=by-14-hov;wx.drawImage(SH_S,bx-6,by-1);wglow(cx,cy,16,'#b89ae8',0.35+0.1*Math.sin(time*3));
  wx.drawImage(MOONLET[s.face<0?1:0],Math.round(cx-7),Math.round(cy-7));
  if(R()<0.12)part(s.x+rf(-4,4),s.y-14-hov+rf(-3,3),rf(-6,6),rf(-8,-2),pick(['p','P','w']),0.6,{z:2,glow:true});}
function drawPets(icx,icy,ents){const fr=petFrames();for(const [id,s] of PETST){if(s.pt==='moonlet'){const bx=Math.round(s.x)-icx,by=Math.round(s.y)-icy;if(bx<-30||bx>W+30||by<-30||by>H+30)continue;ents.push({y:s.y,f:()=>drawMoonlet(bx,by,s)});continue;}const i=PET_R.indexOf(s.pt);if(i<0)continue;const fly=PET_FR&&PET_FLY[s.pt];const bx=Math.round(s.x)-icx,by=Math.round(s.y)-icy;if(bx<-30||bx>W+30||by<-30||by>H+30)continue;
  ents.push({y:s.y,f:()=>{wx.drawImage(SH_S,bx-6,by-1);if(!fr){wx.fillStyle='#7fd05a';wx.fillRect(bx-3,by-6,6,6);return;}const k=s.pt==='bat'?((s.animT*10)|0)%3:s.mv?1+((s.animT*8)|0)%2:((s.animT*0.5)|0)%6===5?3:0;const f=fr[i][k];const hov=fly?Math.round(8+Math.sin(s.animT*4)*2*fly):0;
    wx.drawImage(s.face<0?f.l:f.r,bx-14,by-23-hov);if(s.pt==='fox'&&R()<0.2)part(s.x-(s.face||1)*6,s.y-6,0,0,pick(['o','y']),0.4,{z:rf(2,6),vz:12,glow:true});if(s.pt==='cat'&&R()<0.1)part(s.x,s.y-8-hov,0,0,'C',0.5,{z:2,vz:8,glow:true});}});}}

// ================= 5단계: 함정 · 어둠 · 일지 · 보스 대사 · 용병 =================
// ---- 함정 ----
function drawTraps(icx,icy){const T=G.traps;if(!T||G.kind!=='dungeon')return;for(const t of T){const sx=Math.round(t.x)-icx,sy=Math.round(t.y)-icy;if(sx<-20||sx>W+20||sy<-20||sy>H+20)continue;
  if(t.k===0){wx.fillStyle='#2a2430';wx.fillRect(sx-7,sy-7,14,14);wx.fillStyle='#4a4452';wx.fillRect(sx-7,sy-7,14,1);wx.fillRect(sx-7,sy-7,1,14);
    for(const[a,b]of[[-4,-4],[2,-4],[-4,2],[2,2]]){wx.fillStyle='#0e0b12';wx.fillRect(sx+a,sy+b,2,2);if(t.st===2){wx.fillStyle='#c9ced8';wx.fillRect(sx+a,sy+b-3,2,3);wx.fillStyle='#ffffff';wx.fillRect(sx+a,sy+b-4,1,1);}}
    if(t.st===1&&((time*10)|0)%2){wx.fillStyle='rgba(224,60,50,0.55)';wx.fillRect(sx-7,sy-7,14,14);}}
  else if(t.k===1){wx.fillStyle='#1b1622';wx.fillRect(sx-6,sy-4,12,8);wx.fillStyle='#5a4a3a';for(let i=-5;i<=5;i+=2)wx.fillRect(sx+i,sy-3,1,6);
    if(t.st===1){if(R()<0.4)part(t.x+rf(-4,4),t.y,0,0,'S',0.5,{z:rf(0,4),vz:rf(10,20)});wx.fillStyle='rgba(255,138,31,0.35)';wx.fillRect(sx-6,sy-4,12,8);}
    if(t.st===2){for(let n=0;n<3;n++)part(t.x+rf(-6,6),t.y,rf(-6,6),rf(-4,4),pick(['o','y','r','e']),rf(.25,.5),{z:rf(0,6),vz:rf(40,80),glow:true});}}
  else{const rot=(t.x/5)|0;wx.drawImage(SH_S,sx-6,sy+2);wx.fillStyle='#0e0b12';for(let j=-7;j<=7;j++)for(let i=-7;i<=7;i++){const d=i*i+j*j;if(d>49)continue;const q=((i+rot)&3)===0;wx.fillStyle=d>36?'#0e0b12':j<-2&&i<0?'#9a93a6':q?'#4a4452':'#6a6474';wx.fillRect(sx+i,sy-7+j,1,1);}}}}
function trapLights(L,icx,icy){if(!G.traps||G.dark)return;for(const t of G.traps)if(t.k===1&&t.st===2)L.push({x:t.x-icx,y:t.y-10-icy,r:44,i:1});}
// ---- 어둠 속 눈 ----
function visionR(){if(inArena())return 170;if(G.kind!=='dungeon')return 150;const th=SH.themeOf(G.floor);return th.corrupt?112:136;}
function drawEyes(icx,icy){if(G.kind!=='dungeon')return;for(const m of G.monsters.values()){if(m.fl&512||m.type==='goblin')continue;const sx=Math.round(m.dx)-icx,sy=Math.round(m.dy)-icy;if(sx<0||sx>=W||sy<0||sy>=H)continue;
  if(lit(sx,sy-8)>0.12)continue;if(Math.hypot(m.dx-me.x,m.dy-me.y)>300)continue;const blink=((time*0.7+m.id*0.37)%3)<0.12;if(blink)continue;const boss=isBossTc(m.tc);const ey=sy-(boss?34:15),c=(m.fl&1)?'#8fd0ff':'#ff3a2a';wx.fillStyle=c;const f=m.face<0?-1:1;wx.fillRect(sx-1+f,ey,1,1);wx.fillRect(sx+2+f,ey,1,1);}}
// ---- 이야기 ----
const LORE_IMG=outlineC(pcan(12,9,q=>{for(let j=1;j<8;j++)for(let i=1;i<11;i++)q(i,j,(j===1||j===7)?'#b89a6a':'#e8d8b0');for(let i=3;i<9;i++){q(i,3,'#6a5a4a');q(i,5,'#6a5a4a');}q(2,1,'#8a6a4a');q(9,7,'#8a6a4a');}));
function drawLoreObj(icx,icy,ents){const e=G.ev;if(!e||!e.lore||G.kind!=='dungeon')return;const l=e.lore,sx=Math.round(l.x)-icx,sy=Math.round(l.y)-icy;const read=G.ch&&(G.ch.lore||[]).includes(l.i);
  ents.push({y:l.y-6,f:()=>{wx.drawImage(LORE_IMG,sx-6,sy-6);if(!read&&R()<0.08)part(l.x+rf(-4,4),l.y-4,0,0,'y',0.6,{z:rf(0,4),vz:10,glow:true});}});}
function drawLoreView(){const V=G.loreView;if(!V)return;const pg=SH.LORE[V.i];if(!pg)return;const x=80,y=34,w=320,h=166;pr(x,y,w,h,'#2a2014');pr(x+2,y+2,w-4,h-4,'#e8d8b0');pr(x+5,y+5,w-10,h-10,'#f2e6c8');
  txt(`알드릭의 일지 · ${pg[0]}`,x+w/2,y+18,14,'#4a1e0c','center');pr(x+30,y+29,w-60,1,'#b89a6a');{let yy=y+44;for(let k=1;k<pg.length;k++){for(const l of wrapTxt(pg[k],13,w-36)){txt(l,x+w/2,yy,13,'#1e140c','center');yy+=15;}yy+=7;}}
  txt(`${V.i+1} / ${SH.LORE.length}  ·  지하 ${SH.loreFloor(V.i)}층${V.first?'  ·  새로 기록됨':''}`,x+w/2,y+h-24,11,'#6a4a2a','center');uiRects.push({x,y,w,h,block:true});button(x+w/2-30,y+h-16,60,12,'닫기',()=>{G.loreView=null;},{size:10});}
function drawLoreTab(x,y,w,h){const read=new Set((G.ch&&G.ch.lore)||[]);txt(`읽은 일지 ${read.size}/${SH.LORE.length}  ·  테마마다 3번째 층(3·8·13…98층)에 떨어져 있어요`,x+w/2,y+38,10,'#9e937a','center');
  SH.LORE.forEach((pg,i)=>{const c=i%4,r=(i/4)|0,bx=x+10+c*86,by=y+48+r*32;const ok=read.has(i);pr(bx,by,82,28,ok?'#3a2e1a':'#1c1622');txt(ok?pg[0]:'???',bx+41,by+10,10,ok?'#f2e6c8':'#4a4452','center');txt(`${SH.loreFloor(i)}층`,bx+41,by+21,9,'#6b6275','center');
    if(ok)uiRects.push({x:bx,y:by,w:82,h:28,click:()=>{G.loreView={i,first:false};}});});}
// ---- 연대기 (이야기 흐름 · 일지 · 보스 도감 · 다시 보기) ----
const ACTS=[{n:'1막 · 꺼지지 않는 등불',r:'지하 1~35층',s:['알드릭의 일지를 주워 등불을 들고 지하묘지로 내려간다.','흑월 아래 되살아난 망자들과 서리, 불길의 층을 지나','일지에 남은 흔적을 따라 엘라의 행방을 쫓는다.'],ok:()=>true,done:ch=>(ch.best|0)>=36,hint:''},
  {n:'2막 · 심장의 부름',r:'지하 36~100층',s:['내려갈수록 벽 너머의 심장 소리가 커진다.','알드릭은 끝내 심장에 삼켜졌고, 엘라는 그 안에서 노래하고 있다.','백 번째 층에서 심장을 멈추고 엘라를 풀어 주어야 한다.'],ok:ch=>(ch.best|0)>=36,done:ch=>(ch.cleared|0)>0,hint:'지하 36층에 닿으면 열려요'},
  {n:'3막 · 흑월',r:'레이드 20·30·40·50',s:['풀려난 엘라와 함께, 흑왕의 편에 선 이들을 차례로 쓰러뜨린다.','종지기, 쌍둥이 마녀, 태엽 기사, 그리고 흑월의 왕좌.','흑왕이 쓰러질 때, 하렌에 첫 새벽이 온다.'],ok:ch=>(ch.lvl|0)>=20||(ch.cleared|0)>0,done:ch=>((ch.rclr||{}).moon|0)>0,hint:'레벨 20이 되면 열려요'}];
const BOSS_BIO={bell:['하렌의 종지기. 흑월이 뜨던 밤, 경고의 종을 울리지 않았다.','카르나스가 약속한 "영원한 새벽"을 믿었기 때문이다.','이제 그는 아무도 울릴 수 없는 종을 끌고 다닌다.'],
  mirror:['왕실 점성술사였던 쌍둥이. 둘 다 별에서 흑월을 먼저 읽었다.','언니 리라는 침묵했고, 동생 노라는 그것을 반겼다.','거울 속에서 서로를 비추며 영원히 같은 밤을 산다.'],
  clock:['새벽 기사단의 부단장. 명령을 끝까지 따르려고','멈추지 않는 태엽 심장을 제 몸에 박아 넣었다.','그 명령이 무엇이었는지는 이미 잊었다.'],
  moon:['새벽 기사단장이자 지금의 흑왕.','밤을 끝낼 힘을 원했고, 가장 아끼던 기사 엘라를 바쳐 심연의 심장을 빚었다.','흑월은 그가 스스로 연 문이다.']};
const ENDINGS=[{id:'end1',n:'엔딩 1 · 심장이 멈춘 날',hint:'지하 100층을 정복하면 열려요',ok:ch=>(ch.cleared|0)>0,title:['심장이 멈춘 날','2막 · 심장의 부름 끝'],list:[
    {img:'art/end1.jpg',t:'백 번째 층. 심연의 심장이 마침내 멈췄다.\n붉은 뿌리가 풀려나고, 그 안에서 엘라가 눈을 떴다.'},
    {img:'art/intro5.jpg',t:'엘라는 오빠의 일지를 끝까지 읽었다.\n"오빠가 끝까지 왔다고 전해 줘."\n마지막 장의 글씨는 떨리고 있었다.'},
    {img:'art/end1.jpg',t:'심장은 멈췄지만, 하늘의 흑월은 그대로였다.\n"흑왕이 아직 남아 있어요. 이번엔… 제가 함께 갈게요."'}]},
  {id:'end2',n:'엔딩 2 · 첫 새벽',thumb:'art/end2.jpg',hint:'흑왕 카르나스를 쓰러뜨리면 열려요',ok:ch=>((ch.rclr||{}).moon|0)>0,title:['첫 새벽','달 없는 밤이 끝났다'],list:[
    {img:'art/ph_karnas3.jpg',t:'흑왕 카르나스가 무릎을 꿇었다.\n깨어진 심장 조각 사이로, 그는 마지막으로 엘라의 이름을 불렀다.'},
    {img:'art/end2.jpg',t:'검은 달이 부서지고, 하렌에 첫 새벽이 왔다.\n사람들은 등불을 높이 들어 해를 맞았다.'},
    {img:'art/intro1.jpg',t:'새벽의 종이 다시 울린다.\n엘라는 등불을 든 자에게 새벽의 맹세를 건넸다.\n"이제 당신도 새벽 기사예요."'}]}];
function onFirstDawn(){if(clsUnlocked('knight'))return;const n=knightHard().filter(Boolean).length;msg(`새벽의 기사단이 지켜보고 있다 · 모든 레이드를 하드로 정복하면 「빛의 기사」가 응답한다 (하드 클리어 ${n}/${SH.RAIDS.length})`,'#ffd35a');}
function knightCheck(){let had=false;try{had=!!localStorage.getItem('bc_knight');}catch(e){}if(!had&&knightHard().every(Boolean)){unlockKnight();msg('모든 레이드를 하드로 정복했다 · 새벽의 맹세를 받았다 · 히든 직업 「빛의 기사」 해금!','#ffd35a');G.knightNew=time;sfx('legend');}}
function playEnding(id,done){const e=ENDINGS.find(q=>q.id===id);if(!e)return;playCine(e.list,{title:e.title,done});}
function openChron(on){if(on){G.comm=false;G.anal=false;}G.chron=on;G.chronD=null;if(on){G.rec=false;G.talent=false;showSkills=false;showChar=false;showInv=false;closeFac();G.chronT=G.chronT||'act';}}
function artCover(img,dx,dy,dw,dh,fx){const ir=img.width/img.height,r=dw/dh;let sw,sh,sx,sy;if(ir>r){sh=img.height;sw=sh*r;sx=Math.max(0,Math.min(img.width-sw,(fx==null?0.6:fx)*img.width-sw/2));sy=0;}else{sw=img.width;sh=sw/r;sx=0;sy=(img.height-sh)/2;}artDraw(img,sx,sy,sw,sh,dx,dy,dw,dh);}
function drawChron(){const ch=G.ch;if(!ch)return;const x=22,y=12,w=436,h=246;panel(x,y,w,h,'연대기');const tab=G.chronT||'act';
  txt('달 없는 밤: 등불을 든 자',x+w-10,y+10,12,'#6b6275','right','serif');
  [['act','이야기 흐름'],['lore','알드릭의 일지'],['boss','보스 도감'],['cine','다시 보기'],['fame','명예의 전당']].forEach(([k,l],i)=>button(x+8,y+24+i*20,76,16,l,()=>{G.chronT=k;G.chronD=null;if(k==='fame')net({t:'fame'});},{size:12,main:tab===k}));
  txt(`${keyLabel(kbCode('chron'))} / Esc: 닫기`,x+46,y+h-10,10,'#6b6275','center');
  const cx=x+92,cy=y+22,cw=w-100,chh=h-30;pr(cx-2,cy,1,chh,'#3a3144');
  if(tab==='fame'){txt('흑월을 끈 자들',cx+cw/2,cy+12,14,'#ffe9a8','center','serif');txt('흑왕 카르나스(절망)를 쓰러뜨린 파티가 이곳에 새겨집니다',cx+cw/2,cy+28,10,'#9e937a','center');const L=G.fame||[];if(!L.length)txt('아직 아무도 흑월을 끄지 못했습니다…',cx+cw/2,cy+80,12,'#6b6275','center');
    L.slice(0,9).forEach((f,i)=>{const by=cy+42+i*21;pr(cx+4,by,cw-8,18,f.hard?'rgba(90,64,16,0.55)':'rgba(40,28,50,0.55)');txt(`${f.hard?'☀ ':''}${f.names.join(' · ')}`,cx+10,by+6,11,f.hard?'#ffd35a':'#e6d8ff');txt(`${String(f.ts).slice(0,10)} · 보스전 ${Math.floor((f.t||0)/60)}분 ${(f.t||0)%60}초`,cx+cw-8,by+12,8,'#9e937a','right','px');});return;}
  if(tab==='act'){ACTS.forEach((a,i)=>{const by=cy+2+i*72,ok=a.ok(ch),dn=ok&&a.done(ch);pr(cx+4,by,cw-8,68,ok?'rgba(40,28,20,0.6)':'rgba(10,7,14,0.6)');pr(cx+4,by,2,68,dn?'#ffd35a':ok?'#e0574a':'#3a3144');
      txt(ok?a.n:'???',cx+12,by+10,20,ok?'#f2eadb':'#4a4452',null,'serif');txt(a.r,cx+cw-10,by+10,13,'#9e937a','right');
      if(ok){a.s.forEach((l,k)=>txt(l,cx+12,by+26+k*11,13,'#c9c1b2'));
        const st=i===0?(dn?'완료':`진행 중 · 가장 깊이 내려간 곳 지하 ${ch.best|0}층`):i===1?(dn?`완료 · 심장을 ${ch.cleared}번 멈춤`:`진행 중 · 가장 깊이 내려간 곳 지하 ${ch.best|0}층`):(dn?'완료 · 첫 새벽이 왔다':'진행 중 · '+SH.RAIDS.map(r=>(((ch.rclr||{})[r.id]|0)>0?'✓ ':'· ')+r.boss.split(' ').slice(-1)[0]).join('  '));
        txt(st,cx+12,by+61,12,dn?'#ffd35a':'#7fd05a');}
      else txt(a.hint,cx+12,by+36,13,'#6b6275');});}
  else if(tab==='lore'){const read=new Set(ch.lore||[]);txt(`읽은 일지 ${read.size}/${SH.LORE.length} · 테마마다 3번째 층(3·8·13…98층)에 떨어져 있어요`,cx+cw/2,cy+8,12,'#9e937a','center');
    SH.LORE.forEach((pg,i)=>{const c=i%4,r=(i/4)|0,bw=(cw-12)/4,bx=cx+4+c*(bw+1),by=cy+18+r*40;const ok=read.has(i);pr(bx,by,bw-2,37,ok?'#3a2e1a':'#1c1622');
      txt(ok?pg[0]:'???',bx+bw/2-1,by+11,13,ok?'#f2e6c8':'#4a4452','center','serif');txt(ok?pg[1].slice(0,14)+'…':`지하 ${SH.loreFloor(i)}층`,bx+bw/2-1,by+26,10,ok?'#9e8a6a':'#6b6275','center');
      if(ok)uiRects.push({x:bx,y:by,w:bw-2,h:37,click:()=>{G.loreView={i,first:false};}});});}
  else if(tab==='boss'){const D=G.chronD;
    if(D!=null){const r=SH.RAIDS[D],c=BCARD[r.id],img=bossArt(r.id);const n=((ch.rclr||{})[r.id]|0);const bh=112;pr(cx+4,cy+4,cw-8,bh,'#0a070e');
      if(img)artCover(img,cx+4,cy+4,cw-8,bh,0.62);const g=ctx.createLinearGradient((cx+4)*SC,0,(cx+170)*SC,0);g.addColorStop(0,'rgba(10,7,14,0.95)');g.addColorStop(1,'rgba(10,7,14,0)');ctx.fillStyle=g;ctx.fillRect((cx+4)*SC,(cy+4)*SC,166*SC,bh*SC);
      txt(`${r.n} · ${r.lvl}`,cx+12,cy+20,14,'#9e937a',null,'serif');txt(r.boss,cx+12,cy+44,r.boss.length>9?30:38,'#f2eadb',null,'serif');txt(c.ep,cx+12,cy+68,16,'#ffd35a',null,'serif');txt(c.q,cx+12,cy+84,13,'#c9a0e8',null,'serif');
      BOSS_BIO[r.id].forEach((l,k)=>txt(l,cx+10,cy+bh+18+k*14,14,'#c9c1b2'));txt(`처치 ${n}번`,cx+10,cy+bh+64,13,'#7fd05a');
      button(cx+cw-56,cy+bh+58,50,15,'목록',()=>{G.chronD=null;},{size:12});}
    else SH.RAIDS.forEach((r,i)=>{const c=i%2,rw=(cw-14)/2,bx=cx+4+c*(rw+6),by=cy+4+((i/2)|0)*108;const n=((ch.rclr||{})[r.id]|0),ok=n>0,img=bossArt(r.id);const C=BCARD[r.id];
      pr(bx,by,rw,104,ok?'#ffd35a':'#3a3144');pr(bx+1,by+1,rw-2,102,'#0a070e');
      if(img){ctx.globalAlpha=ok?1:0.18;artCover(img,bx+1,by+1,rw-2,64,0.62);ctx.globalAlpha=1;}
      txt(ok?r.boss:'???',bx+6,by+76,r.boss.length>9?15:18,ok?'#f2eadb':'#6b6275',null,'serif');txt(ok?C.ep:`레벨 ${r.lvl} 레이드 · ${r.n}`,bx+6,by+90,12,ok?'#ffd35a':'#6b6275');txt(ok?`처치 ${n}번`:'',bx+rw-6,by+90,11,'#7fd05a','right');
      if(ok)uiRects.push({x:bx,y:by,w:rw,h:104,click:()=>{G.chronD=i;},tip:[['클릭: 자세히 보기','#ffd35a',11]]});});}
  else{const items=[{n:'인트로 · 달 없는 밤',img:'art/intro6.jpg',ok:true,go:()=>playIntro()}].concat(ENDINGS.map(e=>({n:e.n,img:e.thumb||(e.list?e.list[e.list.length-1].img:null),ok:e.ok(ch)&&!!e.list,hint:e.list?e.hint:'준비 중',go:()=>playEnding(e.id)})));
    items.forEach((it,i)=>{const by=cy+4+i*70,bw=cw-8;pr(cx+4,by,bw,66,it.ok?'#ffd35a':'#3a3144');pr(cx+5,by+1,bw-2,64,'#0a070e');const im=it.img?artOf(it.img):null;
      if(im){ctx.globalAlpha=it.ok?1:0.15;artCover(im,cx+5,by+1,118,64,0.5);ctx.globalAlpha=1;}
      txt(it.n,cx+132,by+22,20,it.ok?'#f2eadb':'#6b6275',null,'serif');txt(it.ok?'클릭해서 다시 보기':it.hint,cx+132,by+42,13,it.ok?'#ffd35a':'#6b6275');
      if(it.ok)uiRects.push({x:cx+4,y:by,w:bw,h:66,click:it.go});});}}
// ---- 보스 대사 ----
function onBsay(o){G.bsay={id:o.id,m:o.m,t:time,x:o.x,y:o.y,dead:o.dead};if(o.dead)msg(`「${o.m}」`,'#c9bfa8');}
function drawBsay(icx,icy){const B=G.bsay;if(!B)return;if(time-B.t>4.5){G.bsay=null;return;}const m=G.monsters.get(B.id);const x=m?m.dx:B.x,y=m?m.dy:B.y;if(x==null)return;const px=Math.round(x-icx),py=Math.round(y-icy)-58;
  const bw=Math.min(240,tw(B.m,11)+12);ctx.globalAlpha=time-B.t>3.8?(4.5-(time-B.t))/0.7:1;pr(px-bw/2,py-7,bw,14,'#0e0b12');pr(px-bw/2+1,py-6,bw-2,12,B.dead?'#3a3144':'#4a0e12');pr(px-1,py+7,3,3,'#0e0b12');txt(B.m,px,py,11,B.dead?'#c9bfa8':'#ffd0c0','center');ctx.globalAlpha=1;}
// ---- 용병 ----
const MERC_FR={};function mercFrames(tp){if(MERC_FR[tp])return MERC_FR[tp];const M=SH.MERCS[tp];const fr=playerFrames(M.cls,{ar:1,a:'chain',dy:tp==='w'?6:tp==='a'?3:2});if(SPR.ready)MERC_FR[tp]=fr;return fr;}
function onAllies(al){const seen=new Set();for(const a of al){const [id,tp,x,y,hp,mhp,face,fl,owner]=a;seen.add(id);let o=G.allies.get(id);if(!o){o={id,tp,dx:x,dy:y,animT:R()*3,atkAnim:0,atkDur:0.3};G.allies.set(id,o);}
  o.x=x;o.y=y;o.hp=hp;o.maxHp=mhp;o.face=face;o.downed=!!(fl&1);o.moving=!!(fl&4);o.owner=owner;if((fl&2)&&!o.wasAtk){o.atkAnim=0.3;}o.wasAtk=!!(fl&2);if(Math.hypot(o.dx-x,o.dy-y)>60){o.dx=x;o.dy=y;}}for(const id of [...G.allies.keys()])if(!seen.has(id))G.allies.delete(id);}
function updateAllyC(dt){for(const o of G.allies.values()){o.animT+=dt;if(o.atkAnim>0)o.atkAnim-=dt;o.dx+=(o.x-o.dx)*Math.min(1,dt*12);o.dy+=(o.y-o.dy)*Math.min(1,dt*12);}}
function drawAllies(icx,icy,ents){for(const o of G.allies.values()){const bx=Math.round(o.dx)-icx,by=Math.round(o.dy)-icy;if(bx<-30||bx>W+30||by<-40||by>H+30)continue;ents.push({y:o.dy,f:()=>{const fr=mercFrames(o.tp);const s=pickFrame({atkAnim:o.atkAnim,atkDur:o.atkDur,moving:o.moving,animT:o.animT,face:o.face},fr);wx.drawImage(SH_S,bx-6,by-1);
  if(o.downed){wx.save();wx.translate(bx,by-4);wx.rotate(Math.PI/2*(o.face<0?-1:1));wx.globalAlpha=0.6;wx.drawImage(s.c,-s.w/2,-s.h/2);wx.restore();wx.globalAlpha=1;return;}blitS(s.c,s,bx-(s.w>>1)+(s.dx||0),by-s.h+2+(s.dy||0),0);}});}}
function drawAllyUI(icx,icy){for(const o of G.allies.values()){const px=Math.round(o.dx)-icx,py=Math.round(o.dy)-icy;if(lit(px,py-8)<0.15)continue;txt('용병 '+SH.MERCS[o.tp].n,px,py-(SPR.ready?27:22),10,'#7fd05a','center');const f=o.maxHp?o.hp/o.maxHp:0;pr(px-8,py-(SPR.ready?23:18),16,2,PAL.k);pr(px-8,py-(SPR.ready?23:18),Math.round(16*f),2,o.downed?'#6b6275':'#7fd05a');}}
/* ---- 전직 선택 창 (용병 대장 한스) ---- */
function drawStars(x,y,n,c){for(let i=0;i<5;i++)txt(i<n?'★':'☆',x+i*9,y,10,i<n?(c||'#ffd35a'):'#4a4452');}
function drawBars(x,y,bars){['생존','딜','지원'].forEach((l,i)=>{txt(l,x,y+i*9,9,'#9e937a');for(let k=0;k<5;k++)pr(x+24+k*9,y+i*9-3,8,5,k<bars[i]?['#8fd0ff','#ff8a5a','#7fd05a'][i]:'#2a2330');});}
// 전직 초상화: 6×2 격자(96×128)에서 잘라 왼쪽·아래를 흐리게 만든 캔버스를 캐시
const ADV_PORT={};
function advPortrait(k){if(ADV_PORT[k])return ADV_PORT[k];const im=SPR.advPort;if(!im)return null;const i=Object.keys(SH.ADV).indexOf(k);if(i<0||Math.floor(i/6)*128>=im.height)return null;
  const [c,x]=mk(96,128);x.drawImage(im,(i%6)*96,Math.floor(i/6)*128,96,128,0,0,96,128);x.globalCompositeOperation='destination-in';
  let g=x.createLinearGradient(0,0,96,0);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(0.45,'rgba(0,0,0,1)');g.addColorStop(1,'rgba(0,0,0,1)');x.fillStyle=g;x.fillRect(0,0,96,128);
  g=x.createLinearGradient(0,0,0,128);g.addColorStop(0,'rgba(0,0,0,0.6)');g.addColorStop(0.15,'rgba(0,0,0,1)');g.addColorStop(0.75,'rgba(0,0,0,1)');g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.fillRect(0,0,96,128);
  return ADV_PORT[k]=c;}
function drawAdvPanel(){const ch=G.ch;if(!ch)return;const x=14,y=12,w=452,h=232;panel(x,y,w,h,`전직 · ${CLASSES[ch.cls].n}`);uiRects.push({x,y,w,h,block:true});button(x+w-40,y+3,34,12,'닫기',()=>{G.advOpen=false;},{size:10});
  const brs=SH.ADV_OF[ch.cls]||[];const cur=ch.adv;const lvOk=ch.lvl>=SH.ADV_LVL;
  txt(lvOk?(cur?(ch.trl&&ch.trl.b?`그림자 최고 기록 ${fmtMS(ch.trl.b)} (${ch.trl.n}회 승리) · 갈래 변경은 골드가 들어요`:'지금 갈래로 그림자에 재도전할 수 있어요 · 갈래 변경은 골드가 들어요'):'갈래를 골라 시험 던전에 도전하세요 · 시험관을 쓰러뜨리면 전직 (혼자 입장)'):`${SH.ADV_LVL}레벨부터 전직할 수 있어요 (지금 ${ch.lvl}레벨)`,x+w/2,y+18,10,lvOk?'#e6dcc3':'#ff8a5a','center');
  brs.forEach((k,ci)=>{const A=SH.ADV[k],I=A.info;const cx=x+8+ci*(w/2-4),cw=w/2-12,cy=y+26;const mine=cur===k;pr(cx,cy,cw,h-34,mine?'rgba(90,64,16,0.45)':'rgba(10,7,14,0.55)');pr(cx,cy,cw,1,A.col);
    {const pc=advPortrait(k);if(pc){ctx.save();ctx.globalAlpha=mine||G.advPick===k?0.72:0.5;ctx.drawImage(pc,Math.round((cx+cw-100)*SC),Math.round((cy+36)*SC),Math.round(96*SC),Math.round(128*SC));ctx.restore();}}
    bigTxt(A.n,cx+cw/2,cy+12,15,A.col,1.3);txt(I.role,cx+cw/2,cy+27,10,'#e6dcc3','center');
    txt('조작 난이도',cx+8,cy+40,9,'#9e937a');drawStars(cx+60,cy+40,I.diff,A.col);drawBars(cx+112,cy+36,I.bars);
    txt('이런 분께 추천',cx+8,cy+60,9,'#ffd35a');wrapTxt(I.rec,9,cw-16).slice(0,2).forEach((l,i)=>txt(l,cx+8,cy+70+i*10,9,'#e6dcc3'));
    txt('장점',cx+8,cy+92,9,'#7fd05a');I.pros.forEach((l,i)=>txt('· '+l,cx+8,cy+101+i*9,9,'#d2c7ab'));
    txt('단점',cx+8,cy+122,9,'#ff8a7a');I.cons.forEach((l,i)=>txt('· '+l,cx+8,cy+131+i*9,9,'#d2c7ab'));
    txt('파티에서',cx+8,cy+152,9,'#8fd0ff');wrapTxt(I.party,9,cw-16).slice(0,1).forEach((l,i)=>txt(l,cx+8,cy+161,9,'#d2c7ab'));
    txt(`고유: ${A.idn} · 스킬 변형 ${Object.keys(SH.ADV_VAR[k]||{}).length}종 ▸`,cx+8,cy+173,9,A.col);uiRects.push({x:cx+6,y:cy+168,w:cw-12,h:10,tip:()=>{const L=[[A.idn,A.col,12],...wrapTxt(A.idd,11,220).map(l=>[l,'#e6dcc3',11])];const V=SH.ADV_VAR[k]||{};const ks=Object.keys(V);if(ks.length){L.push(['기본 스킬 변형','#ffd35a',12]);for(const sid of ks)L.push([`${SKILLS[sid].n} → ${V[sid].n}: ${V[sid].d}`,'#d2c7ab',11]);}return L;}});
    A.sk.concat([A.ult]).forEach((sid,i)=>{const ix=cx+8+i*20,iy=cy+180;const sk=SKILLS[sid];pr(ix-1,iy-1,18,18,sk.ult?'#ffd35a':PAL.k);pimg(SKILL_ICON[sid],ix,iy);uiRects.push({x:ix,y:iy,w:16,h:16,tip:()=>[[sk.n+(sk.ult?' (궁극기)':sk.pas?' (패시브)':''),A.col,13],[`${sk.lvl}레벨`,'#9e937a',11],...wrapTxt(sk.desc,11,230).map(l=>[l,'#e6dcc3',11]),...(sk.per?[[sk.per,'#8fd0ff',11]]:[])]});});
    const cost=cur&&!mine?SH.advChangeCost(ch.lvl):0;const bl=mine?'그림자 재도전':cur?`바꾸기 (${cost.toLocaleString()}G)`:'전직 시험 도전';
    const arm=G.advPick===k;button(cx+cw-78,cy+180,72,16,arm?(mine?'재도전 입장!':cur?'정말 바꿀까요?':'시험 입장!'):bl,()=>{if(!lvOk)return;if(!arm){G.advPick=k;return;}G.advPick=null;if(mine){net({t:'trialre'});G.advOpen=false;closeFac();return;}net({t:'advsel',id:k});G.advOpen=false;closeFac();if(cur)G.skTab='adv';},{size:10,main:lvOk,dis:!lvOk,tip:mine?()=>[['그림자 재도전','#c9a0e8',12],['지금 갈래의 모습을 한 그림자와 다시 싸워요 (혼자 입장)','#e6dcc3',11],['져도 잃는 것 없음 · 하루 첫 승리 시 골드 보상','#9e937a',11],...(ch.trl&&ch.trl.b?[[`최고 기록 ${fmtMS(ch.trl.b)} · ${ch.trl.n}회 승리`,'#ffd35a',11]]:[])]:null});});}
// ===== 각성의 시련 소개 창: 3차 각성 일러스트 + 각성 정보 + 시련 입장 =====
function awkWrap(str,maxW,size){const out=[];let line='';for(const ch of String(str)){const t=line+ch;if(line&&txt(t,-999,-999,size,'#fff')>maxW){out.push(line);line=ch.trim()?ch:'';}else line=t;}if(line)out.push(line);return out;}
function drawAwkView(){const ch=G.ch,V=G.awkView;if(!ch||!V)return;const AD=SH.advOf(ch),A=AD&&SH.AWK[ch.adv];if(!A){G.awkView=null;return;}const done=!!ch.awk,ok=ch.lvl>=SH.AWK_LVL;const t=time-V.t0,ea=Math.min(1,t/0.35),e3=1-Math.pow(1-ea,3);
  pr(0,0,W,H,`rgba(4,3,8,${0.86*ea})`);uiRects.push({x:0,y:0,w:W,h:H,block:true});
  const ax=14,ay=16,aw=262,ah=226,im=awkArt(ch.adv);
  ctx.save();ctx.globalAlpha=e3;ctx.beginPath();ctx.rect(ax*SC,ay*SC,aw*SC,ah*SC);ctx.clip();pr(ax,ay,aw,ah,'#0a0710');
  if(im){const z=1.12-0.08*Math.min(1,t/8),ir=im.width/im.height,rr=aw/ah;let sw,sh;if(ir>rr){sh=im.height/z;sw=sh*rr;}else{sw=im.width/z;sh=sw/rr;}const sx=(im.width-sw)/2,sy=Math.max(0,(im.height-sh)*0.3);artDraw(im,sx,sy,sw,sh,ax+(1-e3)*-18,ay,aw,ah);}
  else{txt('일러스트 불러오는 중…',ax+aw/2,ay+ah/2,11,'#6b6275','center');}
  const g=ctx.createLinearGradient((ax+aw-70)*SC,0,(ax+aw)*SC,0);g.addColorStop(0,'rgba(4,3,8,0)');g.addColorStop(1,'rgba(4,3,8,0.95)');ctx.fillStyle=g;ctx.fillRect((ax+aw-70)*SC,ay*SC,70*SC,ah*SC);
  const g2=ctx.createLinearGradient(0,(ay+ah-50)*SC,0,(ay+ah)*SC);g2.addColorStop(0,'rgba(4,3,8,0)');g2.addColorStop(1,'rgba(4,3,8,0.85)');ctx.fillStyle=g2;ctx.fillRect(ax*SC,(ay+ah-50)*SC,aw*SC,50*SC);ctx.restore();
  pr(ax,ay,aw,1,A.col);pr(ax,ay+ah-1,aw,1,A.col);
  if(done)bigTxt('각성 완료',ax+aw/2,ay+ah-16,11,'#ffd35a',1.3);
  // 오른쪽 정보
  const rx=286,rw=182;let y=ay+4;const ix=rx+(1-e3)*24;ctx.save();ctx.globalAlpha=e3;
  txt(done?'각성':'각성의 시련',ix,y+4,10,'#9e937a');y+=16;bigTxt(A.n,ix+txt(A.n,-999,-999,16,'#fff')*0.65,y+4,16,A.col,1.3);y+=18;
  txt(`${AD.n}의 각성`,ix,y,10,'#c9a0e8');y+=14;pr(ix,y,rw,1,'rgba(201,160,232,0.3)');y+=8;
  txt(`◆ ${A.idn}`,ix,y,10,'#ffe9a8');y+=11;txt(A.idd,ix+8,y,9,'#e6dcc3');y+=14;
  txt('새 스킬',ix,y,9,'#9e937a');y+=11;for(const k of A.sk||[]){txt(`${k.pas?'◇':'•'} ${k.n}${k.pas?' (패시브)':''}`,ix+4,y,10,k.pas?'#c9a0e8':'#ffffff');y+=11;if(!k.pas&&k.desc){for(const ln of awkWrap(k.desc,rw-14,8).slice(0,2)){txt(ln,ix+12,y,8,'#9e937a');y+=9;}}y+=1;}
  y+=3;txt('각성 궁극기',ix,y,9,'#9e937a');y+=11;txt(`★ ${(SH.AWK_ULT_N&&SH.AWK_ULT_N[A.ult])||'각성 궁극기'}`,ix+4,y,11,'#ffd35a');y+=14;ctx.restore();
  // 아래: 설명 + 버튼
  const by=H-30;if(!done){txt('두 갈래의 힘을 모두 가진 그림자와 혼자 싸워요 · 이기면 3차 전직 · 져도 잃는 것 없음',240,by-8,9,'#9e937a','center');
    button(rx,by,92,16,ok?'시련 입장':`${SH.AWK_LVL}레벨 필요`,()=>{if(!ok)return;G.awkView=null;net({t:'awktrial'});closeFac();},{main:ok,dis:!ok,size:11});button(rx+98,by,84,16,'닫기 (ESC)',()=>{G.awkView=null;},{size:10});}
  else button(rx+98,by,84,16,'닫기 (ESC)',()=>{G.awkView=null;},{size:10});}
function drawMercPanel(){const ch=G.ch;if(!ch)return;if(G.awkView){drawAwkView();return;}if(G.advOpen){drawAdvPanel();return;}const x=6,y=38,w=226,h=194;panel(x,y,w,h,'용병 대장 한스');{const AD=SH.advOf(ch);const AWK0=AD&&SH.AWK[ch.adv];if(AWK0&&!ch.awk){const ok=ch.lvl>=SH.AWK_LVL,arm=G.awkArm&&time-G.awkArm<4;button(x+4,y+3,70,12,'각성의 시련',()=>{G.awkView={t0:time};},{size:9,main:ok,tip:[[`각성의 시련 · ${AWK0.n}`,AWK0.col,12],[ok?'두 갈래의 힘을 모두 가진 그림자와 혼자 싸워요':`${SH.AWK_LVL}레벨부터 도전할 수 있어요`,'#e6dcc3',11],['이기면 3차 전직 · 새 스킬 2개 · 각성 패시브 · 각성 궁극기','#ffd35a',11],['져도 잃는 것은 없어요','#9e937a',11]]});}else if(AWK0&&ch.awk)button(x+4,y+3,90,12,`각성: ${AWK0.n}`,()=>{G.awkView={t0:time};},{size:9,tip:[['각성 정보 · 일러스트 보기',AWK0.col,12]]});button(x+w-70,y+3,64,12,AD?`전직: ${AD.n}`:'전직',()=>{G.advOpen=true;G.advPick=null;},{size:9,main:!AD&&ch.lvl>=SH.ADV_LVL,tip:[['전직','#ffd35a',12],[`${SH.ADV_LVL}레벨부터 두 갈래 중 하나를 골라요`,'#e6dcc3',11]]});}const cost=SH.mercCost(ch.lvl);txt('혼자 던전에 들어갈 때만 함께 싸웁니다',x+w/2,y+21,10,'#9e937a','center');
  Object.entries(SH.MERCS).forEach(([k,M],i)=>{const ly=y+32+i*42;const cur=ch.merc===k;pr(x+8,ly,w-16,38,cur?'#3a3016':'rgba(10,7,14,0.6)');if(cur){pr(x+8,ly,w-16,1,PAL.y);}
    const fr=mercFrames(k);const s=fr.idle[0].r;ctx.drawImage(s.c,Math.round((x+12)*SC),Math.round((ly+2)*SC),s.w*0.85*SC,s.h*0.85*SC);
    txt(M.n,x+48,ly+9,12,cur?'#ffd35a':'#e6dcc3');txt(M.d,x+48,ly+21,9,'#9e937a');txt(`체력: 내 체력의 ${Math.round(M.hp*100)}%`,x+48,ly+31,9,'#6b6275');
    if(cur)txt('고용 중',x+w-14,ly+10,10,'#ffd35a','right');else button(x+w-62,ly+4,50,13,`${cost}`,()=>net({t:'merc',k}),{size:10,main:true,tip:()=>[[`${M.n} 고용`,'#ffd35a',12],[`${cost}골드 · 한 번 고용하면 계속 함께합니다`,'#9e937a',11]]});});
  if(ch.merc)button(x+10,y+h-20,w-20,14,'용병 돌려보내기',()=>net({t:'merc',k:null}),{size:10});else txt('고용한 용병 없음',x+w/2,y+h-12,10,'#6b6275','center');}

G.allies=new Map();
// ================= 카운터 =================
const BLUE_T=new WeakMap();
function blueOf(c){let b=BLUE_T.get(c);if(b)return b;const [o,x]=mk(c.width,c.height);x.drawImage(c,0,0);x.globalCompositeOperation='source-atop';x.fillStyle='#4aa0ff';x.fillRect(0,0,c.width,c.height);BLUE_T.set(c,o);return o;}
// 보스 헤드(앞)·백(뒤) 표식
function drawHeadBack(m,s,bx,by){if(!isBossTc(m.tc)&&m.tc!==7)return;if(!(m.fl&16))return;const f=m.face<0?-1:1;const R0=Math.max(18,s.w/2+4),win=!!(m.fl&4096);
  for(let side=0;side<2;side++){const base=side===0?(f>0?0:Math.PI):(f>0?Math.PI:0);const head=side===0;const hot=head&&win;const col=head?(hot?((time*12|0)%2?'#ffe08a':'#ff9a2a'):'#b37a2a'):'#3a78c0';wx.globalAlpha=hot?0.95:0.45;
    for(let k=-10;k<=10;k++){const a=base+k*(Math.PI/3)/10;for(const rr of hot?[R0,R0+2]:[R0]){const x=Math.round(bx+Math.cos(a)*rr),y=Math.round(by+Math.sin(a)*rr*0.45);wx.fillStyle=col;wx.fillRect(x,y,1,1);}}
    const ax=Math.round(bx+Math.cos(base)*(R0+4)),ay=Math.round(by);wx.fillStyle=col;if(head){wx.fillRect(ax-1,ay-2,3,1);wx.fillRect(ax,ay-3,1,3);}else{wx.fillRect(ax-1,ay-1,3,3);}}wx.globalAlpha=1;}
function drawCtrGlow(m,s,sx,sy,bx,by){if(!(m.fl&4096))return;const k=0.45+0.3*Math.sin(time*30);wx.globalAlpha=k;wx.drawImage(blueOf(s.c),sx,sy);wx.globalAlpha=1;
  const top=sy-6;wx.fillStyle='#bfe3ff';wx.fillRect(bx-1,top-7,3,5);wx.fillRect(bx-1,top-1,3,2);if(R()<0.6)part(m.dx+rf(-s.w/3,s.w/3),m.dy-rf(4,s.h),0,0,pick(['c','C','w']),0.3,{z:0,vz:20,glow:true});}
let ctrCdEnd=0;
const CTR_ICON=outlineC(pcan(16,16,q=>{for(let j=2;j<14;j++)for(let i=3;i<13;i++){const e=Math.abs(i-7.5)+Math.max(0,j-9)*0.9;if(e<5.5)q(i,j,(i<7)?'#8fd0ff':'#4a8aff');}for(const[i,j]of[[8,3],[7,5],[8,6],[6,8],[7,9],[6,11]])q(i,j,'#ffffff');}));
function useCounter(){if(G.clash)return;if(!G.ch||meDowned())return;if(!canFight()){msg('카운터는 던전·훈련장에서만 쓸 수 있어요','#9e937a');return;}if(time<ctrCdEnd)return;ctrCdEnd=time+SH.CTR_CD;
  const a=Math.atan2(mouse.wy-(me.y-6),mouse.wx-me.x);me.face=Math.cos(a)<0?-1:1;net({t:'ctr',x:Math.round(mouse.wx),y:Math.round(mouse.wy)});
  if(CLASSES[myCls()].basic.kind==='melee'){me.atkKind='swing';me.atkAngle=a;me.atkDur=0.22;me.atkAnim=0.22;effects.push({type:'slash',pid:myId,a,t:0,d:0.22,max:0.3});}sfx('swing');}
function ctrKey(){const i=G.ch&&G.ch.bar?G.ch.bar.indexOf('ctr'):-1;return i>=0?keyLabel(kbCode('sk'+i)):(kbCode('ctr')?keyLabel(kbCode('ctr')):'카운터 칸');}
function ctrTip(){const cs=SH.CTR_SKILL[myCls()];return [[`${cs.n} (카운터)`,'#8fd0ff',14],[`재사용 ${SH.CTR_CD}초 · 마나 없음 · 1레벨부터 · 모든 직업`,'#7aa2ff',12],[cs.d,'#e6dcc3',12],['보스가 파랗게 빛날 때 헤드(보스 앞쪽)에서 맞히면 저지 → 그로기(피해 +30%)','#ffd35a',11],['흑왕은 무력화되지 않고 반격 · 2연속 성공 시 흑월 균열','#c9a0e8',11],['백(보스 뒤쪽)에서 때리면 항상 피해 +10%','#8fd0ff',11],['못 막으면 보스가 강공격을 합니다','#ff8a7a',11]];}
function drawCtrSlot(){if(!G.ch)return;const x=110,y=234,sw=20;slotBox(x,y,sw,sw,false);pimg(CTR_ICON,x+2,y+2);const left=ctrCdEnd-time;if(left>0){pr(x+2,y+2,16,Math.ceil(16*left/SH.CTR_CD),'rgba(5,4,8,0.72)');if(left>1)txt(String(Math.ceil(left)),x+10,y+11,8,'#ffffff','center','px');}
  txt(keyLabel(kbCode('ctr')).slice(0,3),x+2,y+5,8,'#e6dcc3','left','px');const cs=SH.CTR_SKILL[myCls()];
  uiRects.push({x,y,w:sw,h:sw,click:useCounter,tip:()=>[[`${cs.n} (카운터)`,'#8fd0ff',14],[`재사용 ${SH.CTR_CD}초 · 마나 없음 · 1레벨부터`,'#7aa2ff',12],[cs.d,'#e6dcc3',12],['보스가 파랗게 빛날 때 헤드(보스 앞쪽)에서 맞히면 저지 → 그로기(피해 +30%)','#ffd35a',11],['백(보스 뒤쪽)에서 때리면 항상 피해 +10%','#8fd0ff',11],['못 막으면 보스가 강공격을 합니다','#ff8a7a',11]]});}
function drawCtrHint(){if(!G.ctrWin||time>G.ctrWin)return;const b=(time*10|0)%2;txt(`헤드(앞쪽)에서 카운터! ${ctrKey()} 또는 카운터 가능 스킬`,240,208,14,b?'#ffd35a':'#ffffff','center');}

// ================= 레이드 =================
const RB_TC=new Set();SH.MT_LIST.forEach((t,i)=>{if(SH.MT[t]&&SH.MT[t].rb)RB_TC.add(i);});
const SHADOW_TC=SH.MT_LIST.indexOf('shadow');function isBossTc(tc){return tc===3||tc===SHADOW_TC||RB_TC.has(tc);}
// 그림자 분신: 내 캐릭터 도트를 어둡게 물들이고 붉은 눈 (선각성 후엔 고른 갈래의 모습)
function drawShadowClone(m,icx,icy){if(!(m.fl&1024)&&(m.fl&16)&&G.trialT0==null)G.trialT0=time;const L=G.shadowLook||{cls:myCls(),look:lookOfMe()};const awake=!!(m.fl&2048);const look=Object.assign({},L.look,{adv:awake?G.trial:null});const p={cls:L.cls,look,dx:m.dx,dy:m.dy,face:m.face||1,moving:!!(m.fl&64),animT:m.animT,atkAnim:m.atkT>0?m.atkT:0,atkDur:0.5,flash:m.flash,noSh:!!(m.fl&1024)};const [oc,ox]=SHC||(SHC=mk(96,96));ox.globalCompositeOperation='source-over';ox.clearRect(0,0,96,96);const bx=Math.round(m.dx)-icx,by=Math.round(m.dy)-icy;const W0=wx;wx=ox;let s;try{s=drawPlayer0(p,Math.round(m.dx)-48,Math.round(m.dy)-76,false);}finally{wx=W0;}ox.globalCompositeOperation='source-atop';ox.fillStyle=awake?'rgba(40,14,52,0.42)':(m.fl&1024)?'rgba(34,16,58,0.72)':'rgba(18,6,26,0.7)';ox.fillRect(0,0,96,96);ox.globalCompositeOperation='source-over';wx.drawImage(oc,bx-48,by-76);m._s=s;G.lastBoss={id:m.id,s,x:m.dx,y:m.dy};if(s){const f=m.face<0?-1:1;const ey=by-s.h+2+(s.dy||0)+5;const ex=bx+(f>0?1:-3);wx.fillStyle=awake?'#ffd35a':(m.fl&1024)?'#b08ad8':'#ff2a3a';wx.fillRect(ex,ey,2,1);}if(R()<(awake?0.5:0.3))part(m.dx+rf(-6,6),m.dy,rf(-4,4),0,awake?pick(['y','o','w']):pick(['k','D','m']),rf(.5,1),{z:rf(2,14),vz:rf(10,26),glow:awake});}
let SHC=null;
function bossNm(m){if(m&&m.tc===SHADOW_TC)return `나의 그림자 · ${SH.ADV[G.trial]?SH.ADV[G.trial].n+' 시험':''}`;return m&&RB_TC.has(m.tc)?SH.MT[SH.MT_LIST[m.tc]].n:SH.bossOf(G.floor).n;}
const RB_ORDER=['r_greg','r_lyra','r_nora','r_valen','r_golem','r_karnas','r_ella'];let RSPR=null;const RB_FR={};
loadImg('sprites/raid_bosses.png').then(i=>{if(i)RSPR=sliceAnim(i,72,48);});var WBSPR=null;loadImg('sprites/waste_bosses.png').then(i=>{if(i){WBSPR=sliceAnim(i,72,48);for(const k in THEME_CACHE)if(THEME_CACHE[k].th&&THEME_CACHE[k].th.waste)THEME_CACHE[k].mon={};}});
function raidFrames(type,floor){if(RB_FR[type])return RB_FR[type];const i=RB_ORDER.indexOf(type);if(RSPR&&RSPR[i]&&RSPR[i][0].r.w>0){RB_FR[type]=animFrames(RSPR[i]);return RB_FR[type];}return themedMonsterFrames('boss',floor);}
const RAID_MODE_N={normal:'노말',hard:'하드',practice:'연습'};
const BELL_COL=['#e0574a','#4a8aff','#7fd05a','#ffd35a'],BELL_DK=['#7a2420','#1e3a7a','#2e6a24','#8a6a1a'],BELL_TONE=[523,659,784,988],BELL_NM=['붉은','푸른','초록','노란'];
function mkBell(c,big){const w=big?26:16,h=big?28:19;const lip=big?4:3;return outlineC(pcan(w,h,q=>{const cx=(w-1)/2,top=2,body=h-lip-2;
  for(let j=top;j<h-1;j++){let hw;if(j<body){const t=(j-top)/(body-top);hw=(big?5.6:3.4)+Math.pow(t,2.4)*(big?5.4:3.1);if(j<top+2)hw-=(top+2-j)*(big?1.6:1.1);}else hw=(big?11.8:7.2)-(j-body)*0.2;
    for(let i=Math.ceil(cx-hw);i<=Math.floor(cx+hw);i++){const rel=(i-(cx-hw))/(2*hw);let col2=big?(rel<0.28?'#f0c070':rel<0.62?'#b07a30':'#6a4418'):(rel<0.28?'#ffffff':rel<0.62?BELL_COL[c]:BELL_DK[c]);if(j>=body)col2=big?'#8a5a22':BELL_DK[c];if(j===body-2&&!big)col2='#e6dcc3';if(big&&(j===body-3||j===Math.round(top+4)))col2='#5a3a14';q(i,j,col2);}}
  q(Math.round(cx),0,'#3a3144');q(Math.round(cx),1,'#3a3144');q(Math.round(cx),h-1,big?'#3a2410':'#2a2430');q(Math.round(cx)+1,h-1,big?'#3a2410':'#2a2430');}));}
let BELL_IMG=null;function bellImgs(){if(!BELL_IMG)BELL_IMG={s:[0,1,2,3].map(c=>mkBell(c)),big:mkBell(0,true)};return BELL_IMG;}
G.bellHit={};G.rings=[];G.tethers=[];
function raidBellFx(o){const k=o.c===4?'big':o.c;G.bellHit[k+'|'+Math.round(o.x)+'|'+Math.round(o.y)]=time;if(AC&&soundMode!==2){const f=o.c===4?196:BELL_TONE[o.c]||440;try{tone('sine',f,f*0.985,o.c===4?1.6:0.9,o.c===4?0.12:0.08);tone('triangle',f*2,f*1.97,0.5,0.025);}catch(e){}}
  for(let n=0;n<(o.c===4?30:12);n++){const a=R()*Math.PI*2,sp=rf(20,o.c===4?90:50);part(o.x,o.y-8,Math.cos(a)*sp,Math.sin(a)*sp*0.6,o.c===4?pick(['y','o','w']):pick(['w','y']),rf(.3,.6),{z:rf(4,12),glow:true});}}
function bseqLit(c){const q=G.bseq;if(!q)return false;const k=Math.floor((time-q.t0-0.35)/q.step);if(k<0||k>=q.seq.length){if(k>=q.seq.length)G.bseq=null;return false;}const ph=(time-q.t0-0.35)-k*q.step;return q.seq[k]===c&&ph<q.step*0.8;}
function drawRaidObjs(icx,icy,ents){const map=G.map;if(!map||!map.raid)return;if(map.raid!=='bell'){drawRaidObjs2(icx,icy,ents);return;}const B=bellImgs();const rs=G.raid||{};
  const one=(b,img,key,act,ped)=>{const bx=Math.round(b.x)-icx,by=Math.round(b.y)-icy;if(bx<-30||bx>W+30||by<-40||by>H+30)return;ents.push({y:b.y,f:()=>{
    const hit=G.bellHit[key+'|'+Math.round(b.x)+'|'+Math.round(b.y)];const sw=hit&&time-hit<0.8?Math.sin((time-hit)*30)*(1-(time-hit)/0.8)*2:0;const w=img.width,h=img.height;
    wx.fillStyle='#2a2430';wx.fillRect(bx-(ped?7:5),by-h-4,ped?14:10,2);wx.fillRect(bx-(ped?7:5),by-h-4,2,h+4);wx.fillRect(bx+(ped?5:3),by-h-4,2,h+4);wx.fillStyle='#4a4152';wx.fillRect(bx-(ped?7:5),by-h-4,ped?14:10,1);
    wx.drawImage(SH_S,bx-6,by-1);wx.drawImage(img,Math.round(bx-w/2+sw),by-h+1);
    const lit=act==='seq'||act==='hit';if(lit||act==='on'){wx.globalAlpha=act==='on'?0.25+0.2*Math.sin(time*8):0.75;wx.fillStyle=act==='hit'?'#8fd0ff':'#ffffff';for(let j=0;j<h;j+=2)wx.fillRect(Math.round(bx-w/2+sw),by-h+1+j,w,1);wx.globalAlpha=1;
      if(act==='seq'&&R()<0.5)part(b.x+rf(-6,6),b.y-rf(4,h),0,0,'w',0.4,{z:0,vz:20,glow:true});}}});};
  if(map.bells){for(const b of map.bells)one(b,B.s[b.c],b.c,bseqLit(b.c)?'seq':null,false);one(map.bigBell,B.big,'big',null,true);}
  if(map.bossBells){const bb=rs.bb;for(let i=0;i<map.bossBells.length;i++){const b=map.bossBells[i];const act=bb&&i<bb.need?(bb.hit.includes(i)?'hit':'on'):null;one(b,B.s[b.c],b.c,act,false);if(bb&&i<bb.need){const bx=b.x-icx,by=b.y-icy;ents.push({y:b.y+1,f:()=>{wx.fillStyle=bb.hit.includes(i)?'#8fd0ff':'#ffd35a';const k=((time*6)|0)%2;if(!bb.hit.includes(i)){wx.fillRect(bx-1,by-30-k,3,4);wx.fillRect(bx-1,by-25-k,3,2);}}});}}}}
function drawRaidRings(icx,icy){for(const g of G.rings){const cx=g.x-icx,cy=g.y-icy,r=g.r;const n=Math.max(40,Math.round(r*5));for(let k=0;k<n;k++){const a=k/n*Math.PI*2,x=Math.round(cx+Math.cos(a)*r),y=Math.round(cy+Math.sin(a)*r);if(x<-2||y<-2||x>W+2||y>H+2)continue;wx.fillStyle=k%3?'#ffd35a':'#ff8a3a';wx.fillRect(x-1,y-1,3,3);wx.fillStyle='rgba(255,230,160,0.5)';wx.fillRect(x-2,y,1,1);}}
  for(const t of G.tethers){const A=t.a===myId?me:G.players.get(t.a);let B=null;if(t.b===0){B=[...G.monsters.values()].find(m=>RB_TC.has(m.tc));}else B=t.b===myId?me:G.players.get(t.b);if(!A||!B)continue;
    const ax=(A===me?me.x:A.dx)-icx,ay=(A===me?me.y:A.dy)-icy-8,bx=(B===me?me.x:B.dx)-icx,by=(B===me?me.y:B.dy)-icy-8;const d=Math.hypot(bx-ax,by-ay),n=Math.max(2,Math.round(d/4));
    for(let k=0;k<=n;k++){const x=ax+(bx-ax)*k/n,y=ay+(by-ay)*k/n+Math.sin(k*0.9+time*8)*(t.ok?0:1.2);wx.fillStyle=t.ok?'#7fd05a':(k%2?'#c0c6d0':'#ff5a4a');wx.fillRect(Math.round(x)-1,Math.round(y)-1,2,2);}
    if(!t.ok){wx.globalAlpha=0.9;const mx=(ax+bx)/2,my=(ay+by)/2;wx.fillStyle='#ff5a4a';wx.fillRect(Math.round(mx)-1,Math.round(my)-7,3,3);wx.globalAlpha=1;}}}
function nearBell(){const map=G.map;if(!map||!map.raid||!G.raid||!inDungeon())return null;const rs=G.raid;let best=null,bd=28;if(rs.gm){const gn=gmNear();if(gn)return gn;}
  if(map.raid!=='bell'){for(const o of raidObjList()){const d=Math.hypot(me.x-o.x,me.y-o.y);if(d<bd){bd=d;best={i:o.i,b:{x:o.x,y:o.y},lab:o.lab};}}return best;}
  if(map.bells&&!rs.door&&rs.stage==='gate')map.bells.forEach((b,i)=>{const d=Math.hypot(me.x-b.x,me.y-b.y);if(d<bd){bd=d;best={i,b};}});
  if(map.bossBells&&rs.bb)map.bossBells.forEach((b,i)=>{if(i>=rs.bb.need)return;const d=Math.hypot(me.x-b.x,me.y-b.y);if(d<bd){bd=d;best={i,b};}});return best;}
function fmtMS(s){s=Math.max(0,Math.round(s));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;}
function drawRaidUI(){const rs=G.raid;if(!rs||!inDungeon()||!G.map||!G.map.raid)return;const def=SH.RAIDS.find(r=>r.id===rs.id)||{n:'레이드'};
  const y=G.bossBarOn?24:6;const lab=`${def.n} · ${RAID_MODE_N[rs.mode]||''}`;const w=Math.max(150,tw(lab,11)+100);const x=240-w/2;pr(x,y,w,13,'rgba(10,7,14,0.78)');txt(lab,x+5,y+6.5,11,'#ffd35a');
  if(rs.deaths<0)txt('데스 ∞',x+w-5,y+6.5,11,'#9e937a','right');else{txt('데스',x+w-50,y+6.5,10,'#9e937a','right');for(let i=0;i<3;i++){const on=i<rs.deaths;const hx=x+w-46+i*14;pr(hx,y+3,9,7,on?'#e0574a':'#3a3144');pr(hx+1,y+2,3,2,on?'#e0574a':'#3a3144');pr(hx+5,y+2,3,2,on?'#e0574a':'#3a3144');if(on)pr(hx+2,y+4,2,2,'#ff9a8a');}}
  let y2=y+15;
  if(rs.stage==='boss'&&!rs.done){const left=rs.enr-rs.bossT;txt(left>0?`보스 ${fmtMS(rs.bossT)} · 광폭화까지 ${fmtMS(left)}`:'광폭화!',240,y2+5,10,left<60?'#ff6a5a':'#e6dcc3','center');y2+=11;}
  else if(rs.stage==='gate'&&rs.pz&&!rs.door){const pz=rs.pz;const st=pz.st==='show'?'종소리를 잘 들으세요…':pz.st==='input'?`같은 순서로 치세요 ${pz.n}/${pz.len}`:'잠시 후 종이 울립니다';txt(`종 순서 퍼즐 ${Math.min(pz.round+1,pz.total)}/${pz.total} · ${st}`,240,y2+5,10,pz.st==='input'?'#ffd35a':'#e6dcc3','center');y2+=11;}
  else if(rs.door&&rs.stage==='gate'){txt('문이 열렸다 · 위쪽 보스방으로',240,y2+5,10,'#7fd05a','center');y2+=11;}
  if(rs.bb){const bb=rs.bb;const b2=((time*6)|0)%2;txt([`종소리의 장막 · 남은 ${bb.t}초`,`모서리의 종 ${bb.need}개 · 남은 ${bb.t}초`,`종 ${bb.need}개 동시 타격! (${keyLabel(kbCode('act'))})  남은 ${bb.t}초`][hintLvC('bb')],240,y2+7,13,b2?'#8fd0ff':'#ffffff','center');y2+=14;
    for(let i=0;i<bb.need;i++){const hx=240-bb.need*9+i*18;pr(hx,y2,14,10,PAL.k);pr(hx+1,y2+1,12,8,bb.hit.includes(i)?'#8fd0ff':BELL_DK[i]);}}
  y2=drawRaidX(rs,y2);
  const nb=nearBell();if(nb&&!meDowned())txt(`${keyLabel(kbCode('act'))}: ${nb.lab||BELL_NM[nb.b.c]+' 종 치기'}`,me.x-camX,me.y-camY+10,11,'#ffd35a','center');
  if(meDowned()){const R2=G.rrev,K=keyLabel(kbCode('act'));const dc=rs.deaths<0?'연습 모드':`남은 데스 카운트 ${Math.max(0,rs.deaths)}`;if(R2&&R2.pen){if(rs.gm||rs.clash)R2.pen+=time-R2.lt;R2.lt=time;}
    if(R2&&R2.pen&&!R2.auto&&rs.deaths>=0){const left=Math.max(0,Math.ceil(R2.pen-time));txt(rs.gm||rs.clash?'기믹 중에는 데스 카운트 시간이 멈춰요':`${left}초 안에 일어나지 않으면 데스 카운트 1 추가 차감`,240,174,10,left<=10&&!(rs.gm||rs.clash)&&((time*4|0)%2)?'#ff4a3a':'#ff9a7a','center');}
    if(!R2)txt(dc,240,138,12,'#ffd35a','center');
    else if(R2.auto)txt(`파티 전멸 · ${Math.max(0,Math.ceil(R2.t-time))}초 뒤 다 함께 일어납니다 · ${dc}`,240,138,12,'#ffd35a','center');
    else if(time<R2.t)txt(`${Math.ceil(R2.t-time)}초 뒤 부활할 수 있어요 · ${dc}`,240,138,12,'#ffd35a','center');
    else if(rs.gm||rs.clash)txt(`${rs.gm?rs.gm.n:'격돌'} 진행 중 · 끝나면 부활할 수 있어요 · ${dc}`,240,138,12,'#ff9a5a','center');
    else{button(195,132,90,18,`부활 (${K})`,()=>net({t:'rrev'}),{main:true,size:12});txt(dc,240,160,11,'#ffd35a','center');}}
  if(rs.fail){pr(0,0,W,H,'rgba(40,4,8,0.35)');bigTxt('공략 실패',240,96,16,'#e0473a',2);if(rs.retry){txt(`${rs.retry}초 뒤 마을로 돌아갑니다`,240,118,12,'#e6dcc3','center');button(170,128,140,18,'2관문부터 재도전',()=>{net({t:'rretry'});sfx('pick');},{size:12,main:true,tip:[['보스방 앞에서 바로 다시 시작','#ffd35a',12],['1관문 퍼즐 없이 · 데스 카운트와 보스 체력 초기화','#e6dcc3',11],['파티 누구든 누르면 모두 함께 재도전해요','#9e937a',11]]});}else txt('잠시 뒤 마을로 돌아갑니다',240,118,12,'#e6dcc3','center');}
  else if(rs.done&&!G.auc&&!G.mvp&&time-(G.raidDoneT||0)<6){bigTxt(`${def.n} 클리어!`,240,96,16,'#ffd35a',2);}
  /* 레이드 종료 후: 나가기 · 전투 결과 켜기/끄기 */
  if(rs.done||rs.fail){let bx=x+w+3;if(G.mvp){const on=!G.mvpHide;button(bx,y,56,13,on?'결과 숨기기':'전투 결과',()=>{G.mvpHide=on;if(!on)G.mvp.pin=1;},{size:9,main:!on});bx+=59;}
    button(bx,y,56,13,'마을로 나가기',()=>net({t:'town'}),{size:9,main:true,tip:()=>[['지금 바로 마을로 돌아가요','#e6dcc3',11]].concat(G.auc?[['진행 중인 경매는 입찰할 수 없게 돼요','#ffb03a',11]]:[])});}
  if(!rs.done&&!rs.fail&&!G.rvote){const armed=G.giveArm&&time-G.giveArm<3;button(x+w+3,y,armed?52:30,13,armed?'정말 포기?':'포기',()=>{if(armed){G.giveArm=0;net({t:'rgiveup',a:'start'});}else G.giveArm=time;},{size:9,main:armed,tip:()=>[['레이드 포기','#ffb03a',12],['파티원 과반수가 찬성하면 실패로 끝나요 (보상 없음)','#e6dcc3',11]]});}}
function drawRaidVote(){const v=G.rvote;if(!v||!inDungeon())return;const left=Math.max(0,v.t-(time-v.t0));const x=150,y=150,w=180,h=54;panel(x,y,w,h,null);txt(`${v.by}님이 레이드 포기를 제안했어요`,x+w/2,y+11,11,'#ffb03a','center');
  const need=Math.floor(v.n/2)+1;txt(`찬성 ${v.yes.length} · 반대 ${v.no.length} · 필요 ${need}명 · ${Math.ceil(left)}초`,x+w/2,y+24,10,'#e6dcc3','center');const mine=v.yes.includes(myId)?'yes':v.no.includes(myId)?'no':null;
  button(x+14,y+34,70,14,mine==='yes'?'찬성함':'찬성',()=>net({t:'rgiveup',a:'yes'}),{size:10,main:mine==='yes'});button(x+w-84,y+34,70,14,mine==='no'?'반대함':'반대',()=>net({t:'rgiveup',a:'no'}),{size:10,main:mine==='no'});}
function drawMvp(){const M=G.mvp;if(!M||!inDungeon()||G.mvpHide)return;if(!M.pin&&time-M.t0>40){G.mvpHide=true;return;}const rows=M.rows.slice().sort((a,b)=>b.score-a.score);const x=8,y=26,w=290,h=40+rows.length*40+14;panel(x,y,w,h,'전투 결과');
  txt(`${M.title} · 보스 ${fmtMS(M.boss)} · 전체 ${fmtMS(M.time)}`,x+w/2,y+21,10,'#9e937a','center');uiRects.push({x,y,w,h:40+rows.length*40+14,block:true});button(x+w-18,y+4,12,11,'×',()=>{G.mvpHide=true;},{size:10});
  const cols=[['dmg','딜'],['heal','힐'],['shield','보호막'],['mit','감소'],['taken','받은 피해'],['ctr','카운터'],['gim','기믹'],['deaths','사망']];const best={};for(const [k] of cols)best[k]=k==='deaths'?null:Math.max(...rows.map(r=>r[k]));
  rows.forEach((r,i)=>{const by=y+30+i*40;const isM=r.id===M.mvp;pr(x+6,by,w-12,37,isM?'rgba(90,64,16,0.7)':'rgba(10,7,14,0.55)');if(isM){pr(x+6,by,w-12,1,PAL.y);pr(x+6,by+36,w-12,1,PAL.y);}
    txt(r.name,x+12,by+8,12,CLASS_COL[r.cls]||'#e6dcc3');txt(CLASSES[r.cls].n,x+12+tw(r.name,12)+5,by+8,9,'#6b6275');if(isM){const b2=((time*4)|0)%2;txt('★ MVP',x+w-12,by+8,12,b2?'#ffd35a':'#fff6d0','right');}else txt(`점수 ${r.score}`,x+w-12,by+8,9,'#9e937a','right');
    cols.forEach(([k,l],j)=>{const cx=x+12+(j%4)*70,cy=by+19+((j/4)|0)*10;const v=r[k];const top=best[k]!=null&&v>0&&v===best[k];const s=v>=10000?(v/1000).toFixed(1)+'k':String(v);txt(`${l} ${s}`,cx,cy,9,top?'#ffd35a':k==='deaths'&&v>0?'#ff8a7a':'#d2c7ab');});});
  txt('노란 글씨: 항목 1등  ·  × 로 닫기 (위쪽 [전투 결과] 버튼으로 다시 열기)',x+w/2,y+h-7,9,'#6b6275','center');}
// ---- 경매 ----
function drawAuction(){const a=G.auc;if(!a||!inDungeon())return;const x=300,y=40,w=172,h=168;panel(x,y,w,h,'전리품 경매');const x0=a.items[a.cur];const elig=G.ch&&a.elig.includes(G.ch.id);
  a.items.forEach((q,i)=>{const bx=x+8+i*32,by=y+20;itemSlot(bx,by,26,q.it,null,null,'auc');if(q.done){pr(bx,by,26,26,'rgba(5,4,8,0.6)');txt(q.winN?q.winN.slice(0,4):'-',bx+13,by+31,8,'#9e937a','center','px');}if(i===a.cur)pr(bx,by+27,26,2,PAL.y);});
  if(!x0){txt('경매 종료',x+w/2,y+80,12,'#9e937a','center');return;}
  const it=x0.it;txt(SH.itemName(it),x+w/2,y+62,12,itemCol(it),'center');txt(`${RAR[it.rar].n} · 아이템 레벨 ${it.L}`,x+w/2,y+74,10,'#9e937a','center');
  const left=Math.max(0,a.t-(time-(G.aucT||time)));pr(x+10,y+84,w-20,4,PAL.k);pr(x+10,y+84,Math.round((w-20)*Math.min(1,left/18)),4,left<4?'#e0574a':PAL.y);txt(`${left.toFixed(1)}초`,x+w-10,y+94,10,'#e6dcc3','right');
  txt(x0.high?`최고 ${x0.high}골드 · ${x0.byN}`:'입찰 없음 (없으면 주사위)',x+10,y+94,10,x0.high?'#ffd35a':'#9e937a');
  const mn=x0.high?Math.max(x0.high+10,Math.round(x0.high*1.1)):Math.max(20,Math.round(it.value*0.5));const big=Math.round(mn*1.5);
  if(elig){const me2=x0.byN===G.ch.name;button(x+8,y+104,76,14,`입찰 ${mn}`,()=>net({t:'bid',amt:mn}),{size:10,main:true,dis:me2||G.ch.gold<mn});button(x+88,y+104,76,14,`크게 ${big}`,()=>net({t:'bid',amt:big}),{size:10,dis:me2||G.ch.gold<big});
    button(x+8,y+122,156,13,'패스 (관심 없음)',()=>net({t:'aucpass'}),{size:10});txt(`내 골드 ${G.ch.gold}`,x+w/2,y+144,10,'#9e937a','center');}
  else txt('보상 대상이 아니라 구경만 할 수 있어요',x+w/2,y+112,10,'#9e937a','center');
  txt('낙찰금은 나머지 파티원에게 나눠 줍니다',x+w/2,y+h-10,9,'#6b6275','center');}
// ---- 레이드 석판 (마을) ----
function raidToday(){return new Date(Date.now()+9*3600e3).toISOString().slice(0,10);}
// ---- 보스 카드 (석판 선택창 · 등장 씬) ----
const BCARD={bell:{img:'art/boss_bell.jpg',ep:'울리지 못한 종',q:'"또 종을 울리러 왔나…"',face:[805,228],z:2.6,spr:['r_greg']},
  mirror:{img:'art/boss_mirror.jpg',ep:'별을 읽던 자매',q:'"별이 말했어. 너희는 여기서 끝난다고."',face:[660,185],z:2.1,off:18,spr:['r_lyra','r_nora']},
  clock:{img:'art/boss_clock.jpg',ep:'멈추지 않는 태엽',q:'"명령은… 아직… 유효하다."',face:[717,105],z:2.6,spr:['r_valen']},
  moon:{img:'art/boss_moon.jpg',ep:'새벽을 버린 기사',q:'"등불 하나로 이 밤을 밝히겠다고?"',face:[731,125],z:2.6,spr:['r_karnas']}};
// 페이즈 카드 (보스 모습이 바뀔 때)
const BPH={bell2:{img:'art/ph_bell2.jpg',top:'2 페이즈 · 무너지는 종탑',n:'종지기 그레고르',q:'"종탑이… 무너진다! 너희도 함께!"',face:[756,156],z:2.6,spr:['r_greg']},
  lyra2:{img:'art/ph_lyra2.jpg',top:'각성 · 눈부신 빛',n:'빛의 마녀 리라',q:'"빛이여, 모두 눈멀게 하라!"',face:[690,150],z:2.2,spr:['r_lyra']},
  nora2:{img:'art/ph_nora2.jpg',top:'각성 · 가라앉는 그림자',n:'그림자 마녀 노라',q:'"그림자 속으로 가라앉아라…"',face:[739,111],z:2.6,spr:['r_nora']},
  lyraAlone:{img:'art/ph_lyra2.jpg',top:'홀로 남은 언니',n:'빛의 마녀 리라',q:'"노라…! 너희 모두 빛에 타 버려라!"',face:[690,150],z:2.2,spr:['r_lyra']},
  noraAlone:{img:'art/ph_nora2.jpg',top:'홀로 남은 동생',n:'그림자 마녀 노라',q:'"리라…! 용서하지 않겠어!"',face:[739,111],z:2.6,spr:['r_nora']},
  golem:{img:'art/ph_golem.jpg',top:'2 페이즈 · 태엽 심장과 하나로',n:'태엽 거인 발렌',q:'"태엽 심장이여, 나와 하나가 되어라!"',face:[680,80],z:2.1,spr:['r_golem']},
  karnas2:{img:'art/ph_karnas2.jpg',top:'2 페이즈 · 흑월이 차오른다',n:'흑왕 카르나스',q:'"이제부터가 진짜다."',face:[722,190],z:2.6,spr:['r_karnas']},
  karnas3:{img:'art/ph_karnas3.jpg',top:'마지막 페이즈 · 깨어지는 심장',n:'흑왕 카르나스',q:'"아직… 새벽은… 오지 않는다…!"',face:[739,127],z:2.6,spr:['r_karnas']}};
const BIMG={};setTimeout(()=>artOf(`art/dragon${DRAGON_SKIN}.png`),0);function artOf(src){if(!src)return null;if(!(src in BIMG)){BIMG[src]=null;loadImg(src).then(i=>{BIMG[src]=i||false;});}return BIMG[src]||null;}
function bossArt(id){const c=BCARD[id];return c?artOf(c.img):null;}
SH.RAIDS.forEach(r=>bossArt(r.id));
function artDraw(img,sx,sy,sw,sh,dx,dy,dw,dh){ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(img,sx,sy,sw,sh,dx*SC,dy*SC,dw*SC,dh*SC);ctx.imageSmoothingEnabled=false;}
function bossSprDraw(types,cx,by,sc){const n=types.length;types.forEach((t,k)=>{const i=RB_ORDER.indexOf(t);const f=RSPR&&RSPR[i]&&RSPR[i][((time*3)|0)%4];if(!f)return;const s=f.r;const x=cx+(k-(n-1)/2)*s.w*sc*0.7;ctx.drawImage(s.c,Math.round((x-s.w*sc/2)*SC),Math.round((by-s.h*sc)*SC),s.w*sc*SC,s.h*sc*SC);});}
function raidSelIdx(){const ch=G.ch;if(G.rsel==null){let k=0;SH.RAIDS.forEach((r,i)=>{if(ch&&ch.lvl>=r.lvl)k=i;});G.rsel=k;}return G.rsel;}
function drawRaidPanel(){const ch=G.ch;if(!ch)return;const pt=G.party;const lead=!pt||pt.leader===myId;const n=pt?pt.members.length:1;
  const i=raidSelIdx(),r=SH.RAIDS[i],c=BCARD[r.id]||{ep:'',q:'',spr:[]};const lvOk=ch.lvl>=r.lvl,got=false;/* 보상 횟수 제한 없음 */
  const y0=36,bh=198,t=Math.min(1,(time-(G.facT||0))/0.25);
  pr(0,0,W,H,`rgba(0,0,0,${0.55*t})`);uiRects.push({x:0,y:0,w:W,h:H,block:true});
  ctx.save();ctx.beginPath();ctx.rect(0,y0*SC,W*SC,bh*SC);ctx.clip();
  pr(0,y0,W,bh,'#0a070e');
  const img=bossArt(r.id);
  if(img){const dh=bh,dw=dh*img.width/img.height,dx=W-dw+(c.off||0)+(1-t)*30;ctx.globalAlpha=t;artDraw(img,0,0,img.width,img.height,dx,y0,dw,dh);ctx.globalAlpha=1;
    const g=ctx.createLinearGradient(dx*SC,0,(dx+190)*SC,0);g.addColorStop(0,'rgba(10,7,14,1)');g.addColorStop(0.55,'rgba(10,7,14,0.6)');g.addColorStop(1,'rgba(10,7,14,0)');ctx.fillStyle=g;ctx.fillRect(dx*SC,y0*SC,190*SC,bh*SC);}
  else{const g=ctx.createRadialGradient(360*SC,(y0+110)*SC,4*SC,360*SC,(y0+110)*SC,140*SC);g.addColorStop(0,'rgba(110,30,40,0.55)');g.addColorStop(1,'rgba(10,7,14,0)');ctx.fillStyle=g;ctx.fillRect(0,y0*SC,W*SC,bh*SC);bossSprDraw(c.spr,360,y0+bh-12,3);}
  ctx.restore();
  pr(0,y0-1,W,1,'#ffd35a');pr(0,y0+bh,W,1,'#ffd35a');
  // 레이드 넘기기 (레벨 탭)
  SH.RAIDS.forEach((q,k)=>{const x=22+k*44,y=y0+8,sel=k===i,ok=ch.lvl>=q.lvl;pr(x,y,40,15,sel?'#ffd35a':'#3a3144');pr(x+1,y+1,38,13,sel?'#2a1d12':'#120e18');txt(String(q.lvl),x+20,y+8,15,sel?'#ffd35a':ok?'#9e937a':'#4a4452','center');uiRects.push({x,y,w:40,h:15,click:()=>{G.rsel=k;G.facT=time;},tip:[[`Lv${q.lvl} ${q.n}`,'#ffd35a',12],[q.boss,'#e6dcc3',11]]});});
  const tx=24;txt(`${r.n} · ${r.lvl}`,tx,y0+44,20,'#9e937a',null,'serif');pr(tx,y0+53,16,1,'#e0574a');
  const nm=r.boss,ns=nm.length>9?38:52;txt(nm,tx-1,y0+76,ns,'#f2eadb',null,'serif');
  txt(c.ep,tx,y0+104,22,'#ffd35a',null,'serif');txt(c.q,tx,y0+123,18,'#c9a0e8',null,'serif');
  txt(`1~4인 · 약 ${r.id==='moon'?'15~20':'10~15'}분 · 데스 3 · 단체 기믹 실패 시 전멸 · 파티 ${n}명${r.id==='moon'?' · 절망':''}`,tx,y0+143,17,'#c9c1b2');
  {const rc=SH.raidCP(r.id,false),rh=SH.raidCP(r.id,true),my=G.cp!=null?G.cp:SH.power(ch);const col=my>=rc?'#7fd05a':my>=rc*0.8?'#ffd35a':'#ff6a5a';txt(`권장 전투력 ${rc.toLocaleString()} (하드 ${rh.toLocaleString()})  ·  내 전투력 ${my.toLocaleString()}`,tx,y0+33,13,col);uiRects.push({x:tx,y:y0+27,w:300,h:13,tip:()=>[['권장 전투력','#ffd35a',12],['파티원 한 명 기준이에요. 이보다 낮으면 보스 공격을 버티기 힘들어요','#e6dcc3',11],['초록: 충분 · 노랑: 빠듯 · 빨강: 부족','#9e937a',11]]});}
  const dis=!lvOk||!lead;
  [['normal','노말'],['hard','하드'],['practice','연습']].forEach(([m,l],k)=>button(tx+k*54,y0+154,50,18,l,()=>{net({t:'raidenter',id:r.id,mode:m});closeFac();},{size:13,main:m==='normal',dis,tip:()=>[[`${r.n} · ${l}`,'#ffd35a',12],[m==='hard'?'보스 체력·피해 증가, 기믹 판정이 엄격함 · 신화 8%':m==='practice'?'데스 카운트 무제한 · 보상과 경매 없음':'기본 난이도 · 신화 5%','#e6dcc3',11],!lvOk?[`레벨 ${r.lvl} 이상 필요`,'#e0574a',11]:!lead?['파티장만 열 수 있어요','#e0574a',11]:['파티원 모두 레벨 조건을 채워야 해요','#9e937a',11]]}));
  txt(!lvOk?`레벨 ${r.lvl}부터 입장`:!lead?'파티장만 열 수 있어요':got?'':'클리어할 때마다 보상',tx+166,y0+163,16,!lvOk||!lead?'#e0574a':got?'#9e937a':'#7fd05a');
  txt('클리어하면 전리품 경매 (전설 1개 확정, 낮은 확률로 신화)',tx,y0+186,15,'#8a7f99');
  button(W-44,y0+8,36,15,'닫기',closeFac,{size:12});}
function raidSelKey(c){if(G.fac!=='raid')return false;const n=SH.RAIDS.length;if(c==='ArrowLeft'||c==='ArrowRight'){G.rsel=(raidSelIdx()+(c==='ArrowLeft'?-1:1)+n)%n;G.facT=time;return true;}return false;}
// 보스 등장 씬 (약 3초, 클릭·Esc로 넘기기)
function onBossIntro(o){const rid=o.r||(G.map&&G.map.raid);const r=SH.RAIDS.find(q=>q.id===rid);let card;
  if(o.p){const P=BPH[o.p];if(!P)return;artOf(P.img);card={img:P.img,face:P.face,z:P.z,spr:P.spr,top:P.top,topC:'#ff6a5a',name:P.n,q:P.q,lc:'#e0473a'};}
  else{const c=BCARD[rid];if(!c||!r)return;card={img:c.img,face:c.face,z:c.z,spr:c.spr,top:r.n,topC:'#9e937a',name:r.boss,q:c.q,lc:'#ffd35a'};}
  card.id=rid;if(G.bintro&&time-G.bintro.t0<2.4){G.bq=G.bq||[];G.bq.push(card);return;}card.t0=time;G.bintro=card;}
function drawBossIntro(){let B=G.bintro;if(!B)return;const T=3.2;if(time-B.t0>T&&G.bq&&G.bq.length){B=G.bintro=G.bq.shift();B.t0=time;}const t=time-B.t0;if(t>T||!G.map||!G.map.raid){G.bintro=null;G.bq=null;return;}
  const c=B,img=artOf(B.img);
  const inA=Math.min(1,t/0.35),e=1-Math.pow(1-inA,3),out=t>T-0.45?Math.max(0,(T-t)/0.45):1;
  ctx.globalAlpha=out;pr(0,0,W,H,'rgba(0,0,0,0.55)');
  // 대각선 칸 (왼쪽 위) — 보스 얼굴
  const ax=W*0.78,ay=H*0.60,sl=(1-e)*-140;
  ctx.save();ctx.translate(sl*SC,sl*0.55*SC);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,ay*SC);ctx.lineTo(ax*SC,0);ctx.closePath();ctx.clip();
  pr(0,0,ax,ay,'#0a070e');
  if(img){const k=img.width/1024,L=c.z/3*(1+t*0.025);artDraw(img,0,0,img.width,img.height,100-c.face[0]*L,58-c.face[1]*L,1024*L,img.height/k*L);}
  else bossSprDraw(c.spr,110,ay-20,4);
  ctx.restore();
  ctx.save();ctx.translate(sl*SC,sl*0.55*SC);ctx.strokeStyle=B.lc;ctx.lineWidth=2*SC;ctx.beginPath();ctx.moveTo(-4*SC,(ay+4*ay/ax)*SC);ctx.lineTo((ax+4)*SC,-4*ay/ax*SC);ctx.stroke();ctx.restore();
  // 이름 상자 (왼쪽 아래)
  const nb=Math.min(1,Math.max(0,(t-0.25)/0.3)),ne=1-Math.pow(1-nb,3),bx=14-(1-ne)*280,by=186,bw=252,bh=66;
  pr(bx,by,bw,bh,'rgba(10,7,14,0.92)');pr(bx,by,bw,1,B.lc);pr(bx+bw-1,by,1,bh,B.lc);
  txt(B.top,bx+4,by+10,20,B.topC,null,'serif');const ns=B.name.length>9?38:50;txt(B.name,bx+2,by+32,ns,'#f2eadb',null,'serif');txt(B.q,bx+4,by+56,18,'#c9a0e8',null,'serif');
  ctx.globalAlpha=1;
  if(t>0.6)txt('클릭해서 넘기기',W-8,H-8,13,'#8a7f99','right');
  uiRects.push({x:0,y:0,w:W,h:H,block:true});}/* 클릭·Esc로 넘기지 않음 (보스가 무적인 3초 동안 그대로 보여줌) */
function drawRaidStone(icx,icy,ents){const p=G.map&&G.map.raidStone;if(!p||G.kind!=='hub')return;const bx=Math.round(p.x)-icx,by=Math.round(p.y)-icy;if(bx<-40||bx>W+40||by<-60||by>H+30)return;
  ents.push({y:p.y,f:()=>{wx.drawImage(SH_S,bx-6,by-1);wx.fillStyle='#0e0b12';wx.fillRect(bx-13,by-4,26,5);wx.fillStyle='#3a3144';wx.fillRect(bx-12,by-3,24,3);
    const H0=34;for(let j=0;j<H0;j++){const hw=Math.round(8-j*0.08);wx.fillStyle=j===0?'#0e0b12':'#0e0b12';wx.fillRect(bx-hw-1,by-4-j,hw*2+2,1);wx.fillStyle=j%9===0?'#4a4152':'#2e2838';wx.fillRect(bx-hw,by-4-j,hw*2,1);wx.fillStyle='#5a5066';wx.fillRect(bx-hw,by-4-j,2,1);}
    wx.fillStyle='#0e0b12';wx.fillRect(bx-6,by-4-H0-2,12,2);const pulse=0.5+0.5*Math.sin(time*3);
    for(const[i,j]of[[0,8],[-2,11],[2,11],[0,14],[-3,18],[3,18],[0,22],[-1,26],[1,26]]){wx.globalAlpha=0.5+pulse*0.5;wx.fillStyle='#ff4a5a';wx.fillRect(bx+i,by-4-j,1,2);}wx.globalAlpha=1;
    if(R()<0.15)part(p.x+rf(-5,5),p.y-rf(8,30),0,0,pick(['r','p']),0.6,{z:0,vz:14,glow:true});}});}
function gmLights(L,icx,icy){const g=G.raid&&G.raid.gm;if(!g)return;const P2=(x,y,r,i)=>L.push({x:x-icx,y:y-icy,r,i});
  if(g.circles)for(const c of g.circles)P2(c[0],c[1],60,0.9);if(g.valves)for(const v of g.valves)P2(v[0],v[1],50,0.8);if(g.mir)for(const q of g.mir)P2(q[0],q[1]-10,50,0.8);if(g.pil){for(const q of g.pil)P2(q[0],q[1]-20,q[2]?110:40,q[2]?1:0.6);P2(g.br[0],g.br[1],70,1);}
  if(g.k==='shadow'&&Array.isArray(g.sh))for(const q of g.sh)if(!q[4])P2(q[0],q[1],45,0.7);if(g.k==='gears'&&g.lanes)for(const l of g.lanes)P2(g.wx,(l[0]+l[1])/2,60,0.9);if(g.k==='silence'&&g.toll)for(let k=0;k<5;k++)P2(me.x+(k-2)*90,me.y,110,0.8);}
function raidDunLights(L,icx,icy){try{gmLights(L,icx,icy);}catch(e){errOnce('gmLights',e);}const map=G.map;const X=G.raid&&G.raid.x;if(X){for(const q of (X.beam||[]))L.push({x:q[0]-icx,y:q[1]-icy,r:34,i:0.8});for(const q of (X.mir||[]).concat(X.lev||[],X.alt||[]))L.push({x:q[0]-icx,y:q[1]-12-icy,r:36,i:0.7});for(const q of (X.lamp||[]))if(q[2])L.push({x:q[0]-icx,y:q[1]-icy,r:40,i:0.8});if(X.pl)for(const q of X.plates||[])L.push({x:q[0]-icx,y:q[1]-icy,r:34,i:0.8});}const bl=(map.bells||[]).concat(map.bossBells||[]);for(const b of bl){const x=b.x-icx,y=b.y-10-icy;if(x<-60||x>W+60||y<-60||y>H+60)continue;L.push({x,y,r:46,i:0.85});}
  if(map.bigBell)L.push({x:map.bigBell.x-icx,y:map.bigBell.y-14-icy,r:60,i:0.8});for(const m of G.monsters.values())if(RB_TC.has(m.tc))L.push({x:m.dx-icx,y:m.dy-20-icy,r:80,i:0.7});for(const g of G.rings)L.push({x:g.x-icx,y:g.y-icy,r:g.r+10,i:0.25});}
function raidLights(L,icx,icy){const p=G.map&&G.map.raidStone;if(p&&G.kind==='hub')L.push({x:p.x-icx,y:p.y-18-icy,r:30,i:0.7});const q=G.map&&G.map.clashpr;if(q&&G.kind==='hub')L.push({x:q.x-icx,y:q.y-20-icy,r:G.cpr?44:26,i:0.75});}

// ================= 신규 스킬 · 궁극기 =================
/* 전직 스킬 아이콘: 모양(glyph) + 갈래 색 */
const ADV_GLYPH={
  slash:(q,c)=>{for(let a=0;a<26;a++){const t=-1+a/25*2;q(5+Math.cos(t)*9,8+Math.sin(t)*6,a%3?c.m:c.l);q(5+Math.cos(t)*8,8+Math.sin(t)*5.4,c.d);}lineP(q,2,13,7,8,c.l);},
  multi:(q,c)=>{for(let k=0;k<3;k++)lineP(q,2+k*4,13,6+k*4,2,k%2?c.m:c.l);},
  dash:(q,c)=>{for(let i=0;i<4;i++)lineP(q,1,4+i*3,10,4+i*3,i%2?c.d:c.m);lineP(q,10,3,15,8,c.l);lineP(q,10,13,15,8,c.l);},
  roar:(q,c)=>{discP(q,5,8,2,c.l);for(let r=4;r<12;r+=3){for(let a=-8;a<=8;a++){const t=a/10;q(5+Math.cos(t)*r,8+Math.sin(t)*r,r%2?c.m:c.d);}}},
  eye:(q,c)=>{for(let i=2;i<14;i++){const h=Math.round(Math.sin((i-2)/11*Math.PI)*4);q(i,8-h,c.m);q(i,8+h,c.m);}discP(q,8,8,2,c.l);q(8,8,'#0e0b12');},
  shield:(q,c)=>{for(let j=2;j<14;j++)for(let i=3;i<13;i++){const e=Math.abs(i-7.5)+Math.max(0,j-8)*0.9;if(e<5.5)q(i,j,e>4.4?c.d:(i<8?c.l:c.m));}},
  leap:(q,c)=>{for(let a=0;a<20;a++){const t=Math.PI+a/19*Math.PI;q(8+Math.cos(t)*6,12+Math.sin(t)*9,c.m);}lineP(q,2,14,14,14,c.d);discP(q,14,12,1,c.l);},
  hammer:(q,c)=>{for(let j=2;j<7;j++)for(let i=3;i<13;i++)q(i,j,j===2||j===6?c.d:c.l);lineP(q,8,7,8,15,c.m);lineP(q,7,7,7,15,c.d);},
  ground:(q,c)=>{for(let a=0;a<48;a++){const t=a/48*Math.PI*2;q(8+Math.cos(t)*6,11+Math.sin(t)*3,c.m);}for(let j=2;j<11;j++)q(8,j,j%2?c.l:c.m);q(7,4,c.l);q(9,4,c.l);},
  cross:(q,c)=>{ringP(q,8,8,6,c.m);lineP(q,8,1,8,15,c.l);lineP(q,1,8,15,8,c.l);discP(q,8,8,1,'#ffffff');},
  bullet:(q,c)=>{lineP(q,1,14,14,1,c.m);lineP(q,2,14,14,2,c.l);discP(q,12,4,2,'#ffffff');for(const[a,b]of[[4,9],[6,12],[3,11]])q(a,b,c.d);},
  mark:(q,c)=>{ringP(q,8,8,6,c.m);ringP(q,8,8,3,c.l);lineP(q,8,0,8,4,c.l);lineP(q,8,12,8,16,c.l);lineP(q,0,8,4,8,c.l);lineP(q,12,8,16,8,c.l);},
  trap:(q,c)=>{lineP(q,2,12,14,12,c.d);for(let i=3;i<14;i+=2){q(i,11,c.m);q(i,10,c.l);}discP(q,8,7,2,c.m);q(8,6,'#ff4a3a');},
  net:(q,c)=>{for(let i=2;i<15;i+=3){lineP(q,i,2,i,14,c.m);lineP(q,2,i,14,i,c.m);}ringP(q,8,8,7,c.l);},
  bird:(q,c)=>{lineP(q,2,6,8,9,c.m);lineP(q,14,6,8,9,c.m);lineP(q,3,5,7,8,c.l);lineP(q,13,5,9,8,c.l);discP(q,8,10,1,c.l);q(8,12,c.d);},
  fireball:(q,c)=>{discP(q,9,8,4,c.m);discP(q,10,7,2,c.l);for(let i=0;i<6;i++)q(4-i*0.5,8+(i%2?1:-1),c.d);lineP(q,1,6,5,7,c.d);lineP(q,1,10,5,9,c.d);},
  spike:(q,c)=>{for(let i=1;i<14;i++){q(i,8,c.l);if(i>3&&i<12){q(i,7,c.m);q(i,9,c.m);}}q(14,8,'#ffffff');q(15,8,c.l);},
  storm:(q,c)=>{for(let i=0;i<3;i++){lineP(q,3+i*4,2,5+i*4,7,i%2?c.m:c.l);lineP(q,5+i*4,7,3+i*4,11,i%2?c.m:c.l);lineP(q,3+i*4,11,5+i*4,15,c.l);}},
  star:(q,c)=>{const P=[];for(let i=0;i<10;i++){const t=-Math.PI/2+i/10*Math.PI*2,r=i%2?3:7;P.push([8+Math.cos(t)*r,8+Math.sin(t)*r]);}for(let i=0;i<10;i++)lineP(q,P[i][0],P[i][1],P[(i+1)%10][0],P[(i+1)%10][1],c.l);discP(q,8,8,2,c.m);},
  constel:(q,c)=>{const P=[[2,12],[6,5],[10,9],[14,3]];for(let i=0;i<3;i++)lineP(q,P[i][0],P[i][1],P[i+1][0],P[i+1][1],c.d);for(const[a,b]of P){discP(q,a,b,1,c.l);q(a,b,'#ffffff');}},
  shower:(q,c)=>{for(let i=0;i<4;i++){lineP(q,2+i*4,1,5+i*3,6+i*2,c.m);discP(q,5+i*3,7+i*2,1,c.l);}},
  heal:(q,c)=>{for(let j=3;j<13;j++)for(let i=6;i<10;i++)q(i,j,c.l);for(let j=6;j<10;j++)for(let i=3;i<13;i++)q(i,j,c.l);ringP(q,8,8,7,c.m);},
  aegis:(q,c)=>{ringP(q,8,8,7,c.l);ringP(q,8,8,5,c.m);discP(q,8,8,2,c.l);},
  angel:(q,c)=>{for(let i=0;i<6;i++){lineP(q,7,7,1+i,3+i*1.5,c.l);lineP(q,9,7,15-i,3+i*1.5,c.l);}discP(q,8,5,1,c.m);lineP(q,8,7,8,14,c.m);ringP(q,8,2,2,'#ffd35a');},
  curse:(q,c)=>{discP(q,8,7,5,c.m);discP(q,6,7,1,'#0e0b12');discP(q,10,7,1,'#0e0b12');for(let i=5;i<12;i+=2)q(i,12,c.l);lineP(q,5,11,11,11,c.d);},
  burst:(q,c)=>{for(let a=0;a<12;a++){const t=a/12*Math.PI*2;lineP(q,8,8,8+Math.cos(t)*7,8+Math.sin(t)*7,a%2?c.m:c.l);}discP(q,8,8,2,'#ffffff');},
  chain:(q,c)=>{for(let i=0;i<4;i++){ringP(q,3+i*3.3,8+(i%2?2:-2),2,i%2?c.m:c.l);}},
  banner:(q,c)=>{lineP(q,4,1,4,15,c.d);for(let j=2;j<9;j++)for(let i=5;i<13-((j-2)%3);i++)q(i,j,j<4?c.l:c.m);},
  horn:(q,c)=>{for(let i=2;i<12;i++){const h=Math.round((i-2)*0.4);for(let j=-h;j<=h;j++)q(i,8+j,i>9?c.l:c.m);}lineP(q,12,4,15,2,c.l);lineP(q,12,12,15,14,c.l);},
  sun:(q,c)=>{discP(q,8,8,4,c.m);discP(q,8,8,2,c.l);for(let a=0;a<8;a++){const t=a/8*Math.PI*2;lineP(q,8+Math.cos(t)*6,8+Math.sin(t)*6,8+Math.cos(t)*7.5,8+Math.sin(t)*7.5,c.l);}},
  moon:(q,c)=>{for(let j=0;j<16;j++)for(let i=0;i<16;i++){const d=Math.hypot(i-8,j-8),d2=Math.hypot(i-10.5,j-6);if(d<=7&&d2>5.5)q(i,j,d>6?c.d:c.m);}q(4,11,c.l);},
  gem:(q,c)=>{for(let j=2;j<14;j++){const w=j<8?(j-2):(13-j);for(let i=8-w;i<=8+w;i++)q(i,j,i<8?c.l:c.m);}q(8,2,'#ffffff');},
  legion:(q,c)=>{for(let k=0;k<3;k++){const x=3+k*5;discP(q,x,5,1,c.l);lineP(q,x,7,x,13,c.m);lineP(q,x+2,3,x+2,11,c.l);}},
  blades:(q,c)=>{for(let a=0;a<6;a++){const t=a/6*Math.PI*2;lineP(q,8+Math.cos(t)*2,8+Math.sin(t)*2,8+Math.cos(t+0.5)*7,8+Math.sin(t+0.5)*7,a%2?c.m:c.l);}},
  fort:(q,c)=>{for(let j=4;j<15;j++)for(let i=2;i<14;i++)q(i,j,j===4||i===2||i===13?c.d:c.m);for(let i=2;i<14;i+=3){q(i,3,c.l);q(i+1,3,c.l);}for(let j=10;j<15;j++){q(7,j,'#0e0b12');q(8,j,'#0e0b12');}},
  nova:(q,c)=>{ringP(q,8,8,7,c.l);ringP(q,8,8,4,c.m);for(let a=0;a<4;a++){const t=a/4*Math.PI*2+0.78;lineP(q,8,8,8+Math.cos(t)*7,8+Math.sin(t)*7,'#ffffff');}discP(q,8,8,1,'#ffffff');}};
const ADV_ICON_MAP={bfrenzy:'multi',bloodroar:'roar',rampage:'dash',bloodboil:'gem',redmoon:'moon',flurry:'multi',iaido:'slash',parry:'shield',swordheart:'gem',thousandcuts:'blades',
  aegislink:'aegis',bigtaunt:'roar',guardleap:'leap',ironwill:'gem',fortress:'fort',hammerthrow:'hammer',verdict:'hammer',holyground:'ground',righteous:'gem',finaljudge:'hammer',
  aimshot:'bullet',weakmark:'mark',headshot:'eye',steadyaim:'gem',deadeye:'mark',bombtrap:'trap',nettrap:'net',hawk:'bird',huntcraft:'gem',killzone:'trap',
  infernoball:'fireball',glacialspike:'spike',elemstorm:'storm',elemmastery:'gem',cataclysm:'burst',starmark:'star',constellation:'constel',starshower:'shower',celestial:'gem',supernova:'nova',
  greatheal:'heal',lightaegis:'aegis',resurrect:'angel',blessedhands:'gem',sanctum:'cross',curse:'curse',exorcise:'burst',soulchain:'chain',banisher:'gem',purgatory:'curse',
  dawnbanner:'banner',charge2:'horn',radiantslash:'slash',command:'gem',dawnlegion:'legion',solarflare:'sun',sunpierce:'dash',corona:'sun',suncore:'gem',eclipsebreak:'moon'};
const AWK_ICON_MAP={awBloodmoon:'moon',awCrimson:'blades',awBerP:'gem',awRedmoon:'moon',awSkysplit:'slash',awBladeDance:'blades',awBladeP:'gem',awThousand:'blades',awBastion:'aegis',awShieldQuake:'ground',awBulwarkP:'gem',awFortress:'fort',
  awHolyVerdict:'hammer',awJudgeChain:'chain',awJudgeP:'gem',awFinaljudge:'hammer',awPierceShot:'bullet',awEagleRain:'bird',awSniperP:'gem',awDeadeye:'eye',awHuntField:'trap',awBeastFang:'dash',awTrapperP:'gem',awKillzone:'net',
  awTriElement:'fireball',awMeteorFall:'shower',awElemP:'gem',awCataclysm:'burst',awConstellation:'constel',awStarBeam:'star',awAstroP:'gem',awSupernova:'nova',awHolyRain:'heal',awSaintShield:'aegis',awSaintP:'gem',awSanctum:'cross',
  awAbyssBind:'curse',awSoulBurst:'burst',awExoP:'gem',awPurgatory:'curse',awDawnCharge:'horn',awBannerStrike:'banner',awDawnP:'gem',awDawnlegion:'legion',awSunWheel:'sun',awSolarPierce:'dash',awSunP:'gem',awEclipse:'moon',
  awSiegeShell:'burst',awBarrage:'shower',awCannonP:'gem',awSiege:'storm',awHundredShot:'bullet',awPhantomStep:'dash',awKataP:'gem',awBallet:'blades'};
function advIconCols(hex){const c=hex.replace('#','');const r=parseInt(c.slice(0,2),16),g=parseInt(c.slice(2,4),16),b=parseInt(c.slice(4,6),16);const f=(k)=>'#'+[r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v*k)))).map(v=>v.toString(16).padStart(2,'0')).join('');return{l:f(1.25),m:hex,d:f(0.55)};}
(function(){const I={
  lslash:q=>{for(let a=0;a<30;a++){const t=-1.1+a/29*2.2;q(3+Math.cos(t)*10,8+Math.sin(t)*6,a%4?'y':'w');q(3+Math.cos(t)*9,8+Math.sin(t)*5.4,'g');}lineP(q,2,12,6,8,'s');q(1,13,'g');},
  flashdash:q=>{for(let i=0;i<4;i++)lineP(q,1,5+i*2,9-i,5+i*2,i%2?'c':'w');for(let j=3;j<13;j++)q(12,j,'y');q(13,8,'w');q(14,8,'w');lineP(q,10,7,10,9,'g');},
  lmark:q=>{ringP(q,8,8,6,'y');ringP(q,8,8,4,'g');lineP(q,8,2,8,14,'w');lineP(q,2,8,14,8,'w');discP(q,8,8,1,'w');},
  crossslash:q=>{lineP(q,2,2,14,14,'w');lineP(q,3,2,14,13,'y');lineP(q,14,2,2,14,'w');lineP(q,13,2,2,13,'y');discP(q,8,8,1,'w');},
  holyblade:q=>{for(let j=1;j<11;j++){q(7,j,'w');q(8,j,'s');q(9,j,'c');}lineP(q,4,11,12,11,'g');q(8,12,'G');q(8,13,'G');q(8,14,'y');ringP(q,8,5,5,'y');},
  skyfall:q=>{for(let j=0;j<12;j++){q(7,j,j%2?'y':'w');q(8,j,'w');q(9,j,'y');}lineP(q,2,14,14,14,'y');lineP(q,4,13,12,13,'g');for(const [a,b] of[[4,10],[12,10],[3,6],[13,6]])q(a,b,'w');},
  bladedance:q=>{for(let i=0;i<4;i++){const t=i/4*Math.PI*2;lineP(q,8+Math.cos(t)*2,8+Math.sin(t)*2,8+Math.cos(t+0.6)*7,8+Math.sin(t+0.6)*7,i%2?'y':'w');}ringP(q,8,8,7,'g');discP(q,8,8,1,'y');},
  dawnawaken:q=>{discP(q,8,11,4,'o');discP(q,8,11,3,'y');for(let a=0;a<7;a++){const t=Math.PI+a/6*Math.PI;lineP(q,8+Math.cos(t)*5,11+Math.sin(t)*5,8+Math.cos(t)*7,11+Math.sin(t)*7,'w');}lineP(q,0,14,15,14,'g');},
  dawnward:q=>{for(let j=2;j<14;j++)for(let i=3;i<13;i++){const e=Math.abs(i-7.5)+Math.max(0,j-9)*0.9;if(e<5.5)q(i,j,(i<8)?'w':'s');}discP(q,8,7,2,'y');q(8,7,'w');},
  judgment:q=>{for(let j=0;j<12;j++)for(let i=6;i<11;i++)q(i,j,(i===6||i===10)?'y':j<2?'w':'c');lineP(q,3,12,13,12,'g');for(let j=13;j<16;j++)q(8,j,'G');ringP(q,8,5,6,'g');},
  lastflash:q=>{lineP(q,1,14,14,1,'w');lineP(q,1,13,13,1,'y');lineP(q,2,14,14,2,'c');discP(q,12,4,2,'w');for(const[a,b]of[[5,5],[10,11],[3,9]])q(a,b,'y');},
  lightstorm:q=>{for(let a=0;a<16;a++){const t=a/16*Math.PI*2;lineP(q,8,8,8+Math.cos(t)*7,8+Math.sin(t)*7,a%2?'y':'w');}discP(q,8,8,3,'w');ringP(q,8,8,7,'g');},
  radiantspear:q=>{lineP(q,1,14,12,3,'y');lineP(q,2,14,13,3,'w');for(const[a,b]of[[13,2],[14,1],[12,1],[14,3]])q(a,b,'w');lineP(q,1,12,3,14,'g');for(const[a,b]of[[6,6],[9,12],[4,4]])q(a,b,'c');},
  excalibur:q=>{for(let j=1;j<12;j++){q(7,j,'w');q(8,j,'w');q(9,j,'c');}lineP(q,4,11,12,11,'y');q(8,12,'g');q(8,13,'g');q(8,14,'y');for(let a=0;a<8;a++){const t=a/8*Math.PI*2;q(8+Math.cos(t)*7,6+Math.sin(t)*6,'y');}},
  dawnoath:q=>{discP(q,8,6,3,'y');discP(q,8,6,2,'w');for(let a=0;a<8;a++){const t=a/8*Math.PI*2;q(8+Math.cos(t)*5,6+Math.sin(t)*5,'g');}lineP(q,8,9,8,15,'s');lineP(q,5,12,11,12,'s');},
  dawnblade:q=>{for(let j=0;j<16;j++)for(let i=0;i<16;i++)if(j<5)q(i,j,j<2?'o':'y');for(let j=2;j<13;j++){q(7,j,'w');q(8,j,'w');q(9,j,'c');}lineP(q,4,12,12,12,'y');lineP(q,0,15,15,15,'g');for(const[a,b]of[[3,14],[13,14],[2,13],[14,13]])q(a,b,'w');},
  heavendance:q=>{const pts=[[2,12],[13,3],[4,4],[12,13],[8,1]];for(let i=0;i<4;i++)lineP(q,pts[i][0],pts[i][1],pts[i+1][0],pts[i+1][1],i%2?'y':'w');for(const[a,b]of pts){q(a,b,'w');}ringP(q,8,8,3,'g');},
  rageleap:q=>{for(let i=0;i<3;i++){for(let t=0;t<=6;t++){const x=2+i*4+t*0.66,y=12-Math.sin(t/6*Math.PI)*5;q(x,y,i===2?'w':'S');}}lineP(q,2,14,14,14,'o');q(6,13,'o');q(10,13,'o');q(14,13,'y');},
  shatter:q=>{lineP(q,3,13,12,4,'s');lineP(q,4,13,13,4,'S');for(let j=5;j<12;j+=2){q(12,j,'o');q(13,j-1,'y');}lineP(q,10,8,15,6,'w');lineP(q,10,9,14,12,'w');q(3,13,'g');},
  endless:q=>{discP(q,8,9,5,'R');discP(q,8,9,4,'r');for(let j=3;j<9;j++){q(8,j,'o');}q(7,4,'y');q(9,5,'y');q(8,2,'w');lineP(q,4,14,12,14,'e');},
  shieldrush:q=>{for(let j=3;j<14;j++)for(let i=7;i<13;i++)q(i,j,(i===7||i===12||j===3||j===13)?'g':'C');for(let i=0;i<3;i++)lineP(q,1,5+i*3,6,5+i*3,i===1?'w':'S');q(10,8,'y');},
  judgechain:q=>{for(let i=0;i<6;i++){ringP(q,2+i*2,13-i*2,1,i%2?'y':'g');}discP(q,13,3,2,'w');q(13,3,'y');},
  willpower:q=>{for(let j=2;j<14;j++)for(let i=3;i<13;i++){const e=Math.abs(i-7.5)+Math.max(0,j-9)*0.9;if(e<5.5)q(i,j,(i<7)?'C':'n');}lineP(q,8,4,8,12,'y');lineP(q,5,7,11,7,'y');},
  shadowshot:q=>{for(const [d,c] of[[0,'b'],[3,'p'],[-3,'p']]){lineP(q,2,8+d,12,8+d,c);q(13,8+d,'s');}q(1,7,'P');q(1,9,'P');discP(q,4,4,2,'P');},
  galearrow:q=>{for(let k=0;k<3;k++){for(let a=0;a<20;a++){const t=a/20*Math.PI*2;q(9+Math.cos(t)*(5-k*1.5),8+Math.sin(t)*(2.5-k*0.5)+k*2-2,k===1?'c':'w');}}lineP(q,1,8,6,8,'b');q(6,8,'s');},
  instinct:q=>{discP(q,8,8,5,'z');discP(q,8,8,3,'y');discP(q,8,8,1,'k');lineP(q,8,1,8,4,'e');lineP(q,8,12,8,15,'e');lineP(q,1,8,4,8,'e');lineP(q,12,8,15,8,'e');},
  overload:q=>{discP(q,8,8,4,'p');discP(q,8,8,2,'P');q(8,8,'w');for(let a=0;a<8;a++){const t=a/8*Math.PI*2;lineP(q,8+Math.cos(t)*5,8+Math.sin(t)*5,8+Math.cos(t)*7,8+Math.sin(t)*7,a%2?'c':'P');}},
  blackhole:q=>{discP(q,8,8,6,'p');discP(q,8,8,4,'k');for(let a=0;a<24;a++){const t=a/24*Math.PI*2,r=3+a/24*4;q(8+Math.cos(t+a*0.3)*r,8+Math.sin(t+a*0.3)*r,a%3?'P':'w');}},
  resonance:q=>{discP(q,5,6,2,'o');discP(q,11,6,2,'c');discP(q,8,11,2,'y');ringP(q,8,8,6,'P');q(8,8,'w');},
  lightchain:q=>{const pts=[[2,12],[6,5],[10,11],[14,4]];for(let i=0;i<3;i++)lineP(q,pts[i][0],pts[i][1],pts[i+1][0],pts[i+1][1],'y');for(const [a,b] of pts){q(a,b,'w');q(a+1,b,'z');}},
  holyburst:q=>{for(let a=0;a<12;a++){const t=a/12*Math.PI*2;lineP(q,8,8,8+Math.cos(t)*7,8+Math.sin(t)*7,a%2?'g':'y');}discP(q,8,8,2,'w');},
  saint:q=>{ringP(q,8,4,3,'y');for(let j=7;j<15;j++)for(let i=5;i<12;i++)if(Math.abs(i-8)<=(j-6)*0.5+1)q(i,j,'w');q(8,9,'y');},
  ragnarok:q=>{for(let j=1;j<12;j++){q(7,j,'w');q(8,j,'y');q(9,j,'o');}lineP(q,5,11,11,11,'g');q(8,12,'G');q(8,13,'G');for(const [a,b] of[[4,6],[12,4],[3,10],[13,9],[6,2],[11,1]])q(a,b,'o');lineP(q,2,15,14,15,'e');},
  wargod:q=>{discP(q,8,7,4,'r');discP(q,8,7,3,'e');q(7,6,'y');q(9,6,'y');lineP(q,6,9,10,9,'k');for(let j=11;j<16;j++)lineP(q,8-(j-9),j,8+(j-9),j,j%2?'R':'r');ringP(q,8,7,6,'o');},
  aegisdome:q=>{for(let a=0;a<40;a++){const t=Math.PI+a/39*Math.PI;q(8+Math.cos(t)*7,13+Math.sin(t)*9,'y');q(8+Math.cos(t)*6,13+Math.sin(t)*8,'g');}lineP(q,1,13,15,13,'y');for(let i=3;i<14;i+=3)lineP(q,i,5,i,12,'G');discP(q,8,9,1,'w');},
  judgehammer:q=>{for(let j=2;j<8;j++)for(let i=3;i<14;i++)q(i,j,(j===2||j===7||i===3||i===13)?'g':'y');lineP(q,8,8,8,15,'b');q(8,4,'w');q(7,5,'w');q(9,5,'w');},
  skyrain:q=>{for(let i=0;i<7;i++){const x=1+i*2,y=1+(i*5)%7;lineP(q,x,y,x+3,y+6,i%2?'y':'w');}lineP(q,0,15,15,15,'g');},
  dragonarrow:q=>{for(let i=0;i<10;i++){q(2+i,10-Math.sin(i*0.8)*2,'z');q(2+i,11-Math.sin(i*0.8)*2,'Z');}discP(q,13,6,2,'z');q(14,5,'y');lineP(q,12,3,11,1,'g');lineP(q,14,3,15,1,'g');q(15,7,'e');},
  apocalypse:q=>{for(let j=0;j<16;j++)for(let i=0;i<16;i++)if(j<6)q(i,j,j<3?'R':'r');discP(q,10,6,3,'o');discP(q,10,6,2,'y');for(let i=1;i<6;i++)q(10-i*1.2,6-i,'e');discP(q,4,12,2,'o');lineP(q,0,15,15,15,'k');},
  absolutezero:q=>{for(let a=0;a<6;a++){const t=a/6*Math.PI*2;lineP(q,8,8,8+Math.cos(t)*7,8+Math.sin(t)*7,'c');q(8+Math.cos(t)*5+Math.cos(t+1)*1.5,8+Math.sin(t)*5+Math.sin(t+1)*1.5,'w');}discP(q,8,8,2,'w');},
  angel:q=>{ringP(q,8,3,2,'y');discP(q,8,7,2,'w');for(let j=9;j<15;j++)lineP(q,8-(j-8)*0.5,j,8+(j-8)*0.5,j,'w');for(let i=0;i<6;i++){lineP(q,6,7,1,4+i,'W');lineP(q,10,7,15,4+i,'W');}},
  divinejudge:q=>{for(const x of[3,8,13]){for(let j=0;j<13;j++){q(x,j,'y');q(x+1,j,j%2?'w':'y');}}lineP(q,0,14,15,14,'g');ringP(q,8,13,2,'y');}
};for(const a in SH.ADV){const A=SH.ADV[a];const cs=advIconCols(A.col);for(const sid of A.sk.concat([A.ult])){const gl=ADV_GLYPH[ADV_ICON_MAP[sid]]||ADV_GLYPH.gem;I[sid]=q=>{gl(q,cs);if(SKILLS[sid].ult){q(0,0,cs.l);q(15,0,cs.l);q(0,15,cs.l);q(15,15,cs.l);}};}}
  for(const a in SH.AWK){const W=SH.AWK[a];const cs=advIconCols(W.col);for(const sid of W.ids.concat([W.ult])){const gl=ADV_GLYPH[AWK_ICON_MAP[sid]]||ADV_GLYPH.gem;I[sid]=q=>{gl(q,cs);for(let t=0;t<16;t+=3){q(t,0,'#ffd35a');q(t,15,'#ffd35a');q(0,t,'#ffd35a');q(15,t,'#ffd35a');}if(SKILLS[sid].ult){q(0,0,'#ffffff');q(15,0,'#ffffff');q(0,15,'#ffffff');q(15,15,'#ffffff');}};}}
  for(const k in I)SKILL_ICON[k]=pcan(16,16,q=>{for(let j=0;j<16;j++)for(let i=0;i<16;i++)q(i,j,'d');I[k](q);});})();
KB_DEF.push(['ult','궁극기','KeyV']);
G.ultOk=null;let ultEnd=0;const UFX=[];let UCUT=null;
function ultReady(id){return !G.ultOk||G.ultOk.has(id);}
function useUlt(){if(!G.ch||meDowned())return;if(!canFight()){msg('궁극기는 던전·훈련장에서만 쓸 수 있어요','#9e937a');return;}const id=G.ch.ult;
  if(!id){msg(G.ch.lvl>=SH.ULT_LVL?'스킬 창(K)에서 궁극기를 먼저 고르세요':`궁극기는 ${SH.ULT_LVL}레벨에 배웁니다`,'#9e937a');return;}if(time<ultEnd)return;ultEnd=time+1;net({t:'ult',x:Math.round(mouse.wx),y:Math.round(mouse.wy)});}
const ULT_FRAME=pcan(24,24,q=>{for(let i=0;i<24;i++){q(i,0,'g');q(i,23,'g');q(0,i,'g');q(23,i,'g');q(i,1,'G');q(i,22,'G');q(1,i,'G');q(22,i,'G');}for(const[a,b]of[[0,0],[23,0],[0,23],[23,23]])q(a,b,'y');});
function drawUltSlot(){if(!G.ch)return;const x=80,y=230,s=24;const id=G.ch.ult;pr(x,y,s,s,PAL.k);pimg(ULT_FRAME,x,y);if(id){pimg(SKILL_ICON[id],x+4,y+4);const left=ultEnd-time;if(left>0){const tot=SKILLS[id].cd;pr(x+4,y+4,16,Math.ceil(16*Math.min(1,left/tot)),'rgba(5,4,8,0.75)');if(left>1)txt(String(Math.ceil(left)),x+12,y+13,8,'#ffffff','center','px');}
    else if(((time*2)|0)%2)pr(x+2,y+2,20,1,'rgba(255,211,90,0.6)');}else{txt(G.ch.lvl>=SH.ULT_LVL?'?':String(SH.ULT_LVL),x+12,y+12,9,'#6b6275','center','px');}
  txt(keyLabel(kbCode('ult')).slice(0,3),x+3,y+6,8,'#ffd35a','left','px');
  uiRects.push({x,y,w:s,h:s,click:useUlt,tip:()=>id?[[`${SKILLS[id].n} (궁극기)`,'#ffd35a',14],[`재사용 ${SKILLS[id].cd}초 · 마나 없음`,'#7aa2ff',12],[SKILLS[id].desc,'#e6dcc3',12],[`현재 위력 ${Math.round(SH.ultPow(G.ch.lvl)*100)}% (레벨이 오를수록 강해져 50레벨에 100%)`,'#ffd35a',11]]:[['궁극기','#ffd35a',14],[`${SH.ULT_LVL}레벨에 스킬 창(K)에서 두 개 중 하나를 고릅니다`,'#e6dcc3',12]]});}
function drawUltPick(x,y,w){const ch=G.ch;const C=CLASSES[ch.cls];const ul=SH.ultsOf(ch);const nU=ul.length;txt(`궁극기  ·  ${SH.ULT_LVL}레벨  ·  ${keyLabel(kbCode('ult'))} 키`,x,y+5,11,'#ffd35a');if(ch.lvl<SH.ULT_LVL)txt(`${SH.ULT_LVL}레벨에 둘 중 하나를 고를 수 있어요 (마을에서 무료 변경)`,x+w,y+5,9,'#6b6275','right');
  ul.forEach((id,i)=>{const bx=x+i*(w/nU),by=y+11,bw=w/nU-4,bh=30;const sk=SKILLS[id],cur=ch.ult===id,lock=ch.lvl<SH.ULT_LVL,ready=ultReady(id);const hov=mouse.x>=bx&&mouse.x<bx+bw&&mouse.y>=by&&mouse.y<by+bh;
    pr(bx,by,bw,bh,cur?PAL.y:hov&&!lock?PAL.g:PAL.k);pr(bx+1,by+1,bw-2,bh-2,cur?'#3a2a10':lock||!ready?'#15111b':'#231b2c');pimg(ULT_FRAME,bx+3,by+3);pimg(SKILL_ICON[id],bx+7,by+7);if(lock||!ready)pr(bx+7,by+7,16,16,'rgba(5,4,8,0.6)');
    txt(sk.n,bx+31,by+9,nU>2?10:11,lock?'#6b6275':cur?'#ffd35a':sk.adv?(SH.ADV[sk.adv].col):'#e6dcc3');txt(!ready?'준비 중 (확인 대기)':cur?'선택됨':lock?`레벨 ${SH.ULT_LVL}`:'클릭해서 선택',bx+31,by+21,9,!ready?'#9e937a':cur?'#7fd05a':'#9e937a');
    uiRects.push({x:bx,y:by,w:bw,h:bh,click:()=>{if(!lock&&ready&&!cur)net({t:'ultsel',id});},tip:()=>[[sk.n+' (궁극기)','#ffd35a',14],[`재사용 ${sk.cd}초 · 마나 없음`,'#7aa2ff',12],[sk.desc,'#e6dcc3',12],[`현재 위력 ${Math.round(SH.ultPow(ch.lvl)*100)}% (20레벨 55% → 50레벨 100%)`,'#ffd35a',11],lock?[`레벨 ${SH.ULT_LVL}에 배웁니다`,'#e0574a',11]:!ready?['아직 준비 중인 궁극기예요','#9e937a',11]:cur?['선택된 궁극기','#7fd05a',11]:['클릭: 이 궁극기로 선택 (마을에서만 변경)','#ffd35a',11]]});});}
// ---- 연출 ----
const CLS_UC={warrior:'#e0574a',guardian:'#ffd35a',archer:'#7fd05a',mage:'#b86ad0',priest:'#ffe9a8',knight:'#fff6d0',gunner:'#ffb03a'};
// ================= 증기총사: 총소리 · 폭발음 · 총구 섬광 · 탄피 · 증기 =================
/* 총포 전용 소리 버스: 포화(찌그러짐)로 묵직하게 → 압축으로 펀치감 → 짧은 잔향 */
let GUNB=null;
function gunBus(){if(GUNB&&GUNB.ac===AC)return GUNB;const comp=AC.createDynamicsCompressor();comp.threshold.value=-16;comp.knee.value=6;comp.ratio.value=5;comp.attack.value=0.002;comp.release.value=0.14;
  const pre=AC.createGain();pre.gain.value=1;const post=AC.createGain();post.gain.value=0.42;pre.connect(comp);comp.connect(post).connect(SFXG);
  const sh=AC.createWaveShaper();const cv=new Float32Array(1024);for(let i=0;i<1024;i++){const x=i/511.5-1;cv[i]=Math.tanh(x*2.6)/Math.tanh(2.6);}sh.curve=cv;sh.oversample='2x';const sat=AC.createGain();sat.connect(sh).connect(pre);
  const rev=AC.createConvolver();rev.buffer=makeImpulse(1.5);const wet=AC.createGain();wet.gain.value=0.4;rev.connect(wet).connect(pre);
  GUNB={ac:AC,pre,sat,rev};return GUNB;}
function gT(dest,type,f1,f2,dur,vol,dl){const t=AC.currentTime+(dl||0);const o=AC.createOscillator(),g=AC.createGain();o.type=type;o.frequency.setValueAtTime(f1,t);o.frequency.exponentialRampToValueAtTime(Math.max(20,f2),t+dur);g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(0.0002,vol),t+0.004);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);o.connect(g).connect(dest);o.start(t);o.stop(t+dur+0.03);}
function gN(dest,dur,vol,ft,freq,q,dl,f2){const t=AC.currentTime+(dl||0);const s=AC.createBufferSource();s.buffer=NB;s.loop=true;const f=AC.createBiquadFilter();f.type=ft;f.frequency.setValueAtTime(freq,t);if(f2)f.frequency.exponentialRampToValueAtTime(f2,t+dur);if(q)f.Q.value=q;const g=AC.createGain();g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(0.0002,vol),t+0.003);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);s.connect(f).connect(g).connect(dest);s.start(t,R()*0.4);s.stop(t+dur+0.03);}
/* 총성: r 소총 · t 포탑 · g 개틀링 · p 산탄 · k 권총 · s 슬러그 · c 유탄 · x 공성포 */
function gunShot(g,big,v){if(!AC||soundMode===2)return;const now=AC.currentTime,key='gs'+g;const gap=g==='g'?0.05:g==='k'?0.028:0.035;if(lastS[key]&&now-lastS[key]<gap)return;lastS[key]=now;v=v==null?1:v;const B=gunBus(),o=B.pre,sat=B.sat,p=rf(0.93,1.07);
  try{switch(g){
  case'r':case't':case'g':{const q=g==='t'?0.5:g==='g'?0.72:1;/* 탕 */gN(o,0.03,0.5*v*q,'highpass',2600*p,0.7);gN(o,0.1,0.34*v*q,'bandpass',950*p,0.9,0,480);gT(sat,'sine',170*p,48,0.13,0.55*v*q);gN(B.rev,0.25,0.12*v*q,'lowpass',1600,0,0.01);
    if(g!=='g')gN(o,0.35,0.07*v*q,'lowpass',900,0,0.03);if(g==='t')gT(o,'square',2400,2100,0.02,0.05*v,0.05);if(big)gT(sat,'sine',120,36,0.22,0.5*v);break;}
  case'p':{/* 쾅 + 펌프 척-칵 */gN(o,0.035,0.62*v,'highpass',2200*p,0.6);gN(o,0.16,0.42*v,'bandpass',620*p,0.8,0,300);gT(sat,'sine',120*p,34,0.24,0.8*v);gN(o,0.55,0.12*v,'lowpass',800,0,0.02);gN(B.rev,0.4,0.2*v,'lowpass',1200,0,0.01);
    if(v>0.5){gN(o,0.04,0.09*v,'bandpass',1700,3,0.3);gT(o,'square',900,700,0.025,0.05*v,0.3);gN(o,0.03,0.1*v,'bandpass',2400,4,0.4);gT(o,'square',1300,1100,0.02,0.05*v,0.4);}break;}
  case'k':{gN(o,0.022,0.42*v,'highpass',3200*p,0.7);gN(o,0.07,0.25*v,'bandpass',1400*p,1);gT(sat,'sine',210*p,70,0.09,0.4*v);gN(B.rev,0.18,0.08*v,'lowpass',2000,0,0.01);break;}
  case's':{gN(o,0.04,0.6*v,'highpass',2000*p,0.6);gN(o,0.14,0.38*v,'bandpass',700*p,0.8,0,280);gT(sat,'sine',130*p,36,0.3,0.8*v);gT(o,'triangle',1900,1700,0.35,0.035*v,0.02);gN(B.rev,0.5,0.2*v,'lowpass',1000,0,0.01);break;}
  case'c':{/* 퐁 */gT(sat,'sine',260*p,80,0.12,0.6*v);gN(o,0.08,0.3*v,'lowpass',900*p,0.7);gN(o,0.25,0.06*v,'highpass',4200,0,0.03);gT(o,'triangle',520*p,300,0.06,0.08*v);break;}
  case'x':{gN(o,0.05,0.7*v,'highpass',1600,0.6);gT(sat,'sine',80,24,0.8,1*v);gN(o,1.1,0.3*v,'lowpass',500,0,0,120);gN(B.rev,1.2,0.35*v,'lowpass',700,0,0.02);gT(sat,'sawtooth',55,30,0.5,0.25*v);break;}}}catch(e){}}
/* 탄피가 바닥에 떨어지는 소리 (내 총만) */
function gunCasing(heavy,dl){if(!AC||soundMode===2)return;const B=gunBus();const n=heavy?2:3;for(let i=0;i<n;i++){const t=(dl||0.28)+i*rf(0.05,0.09);const f=heavy?rf(1500,2100):rf(3600,5400);gT(B.pre,'triangle',f,f*0.97,0.06,0.05-i*0.012,t);gT(B.pre,'sine',f*1.5,f*1.48,0.04,0.02,t);}}
/* 펑! 크기 0~3 */
function gunBoom(s,v){if(!AC||soundMode===2)return;const now=AC.currentTime,key='gb'+s;if(lastS[key]&&now-lastS[key]<(s>=2?0.08:0.045))return;lastS[key]=now;v=v==null?1:v;const B=gunBus(),o=B.pre,sat=B.sat,p=rf(0.9,1.1);
  try{const L=[0.3,0.5,0.8,1.2][s];gN(o,0.04,0.55*v,'highpass',1800,0.5);gT(sat,'sine',(100-s*12)*p,26,L*0.8,(0.6+s*0.15)*v);gN(o,L,(0.3+s*0.06)*v,'lowpass',(1500-s*250)*p,0.5,0.005,150);gN(B.rev,L*1.3,(0.18+s*0.08)*v,'lowpass',900,0,0.02);
    if(s>=1)gT(sat,'sawtooth',60*p,28,L*0.6,0.18*v);
    for(let i=0;i<3+s*3;i++)gN(o,0.015,rf(0.04,0.1)*v,'highpass',rf(2500,6000),0,rf(0.04,0.25+s*0.12));
    if(s>=2)gN(o,L*1.4,0.12*v,'bandpass',260,0.8,0.1,80);}catch(e){}}
function gunHiss(dur,v){if(!AC||soundMode===2)return;const B=gunBus();v=v||1;gN(B.pre,dur,0.12*v,'highpass',3500,0.5,0,6000);gN(B.pre,dur*0.8,0.07*v,'bandpass',2200,2,0.02,900);}
function gunClank(){if(!AC||soundMode===2)return;const B=gunBus();gT(B.pre,'square',320,240,0.08,0.08);gT(B.pre,'triangle',1250,1180,0.25,0.05,0.01);gT(B.pre,'triangle',1830,1790,0.2,0.03,0.02);gN(B.pre,0.05,0.1,'bandpass',3000,3);}
function gunWhistle(d,v){if(!AC||soundMode===2)return;const B=gunBus();gT(B.pre,'sine',1500,460,d,0.045*(v||1));gT(B.pre,'sine',1520,470,d,0.02*(v||1));}
function gunCharge(d){if(!AC||soundMode===2)return;const B=gunBus();const o=AC.createOscillator(),g=AC.createGain(),t=AC.currentTime;o.type='sawtooth';o.frequency.setValueAtTime(180,t);o.frequency.exponentialRampToValueAtTime(1400,t+d);g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(0.06,t+d*0.9);g.gain.exponentialRampToValueAtTime(0.0001,t+d+0.05);const f=AC.createBiquadFilter();f.type='lowpass';f.frequency.value=2500;o.connect(f).connect(g).connect(B.pre);o.start(t);o.stop(t+d+0.1);gunHiss(d,0.6);}
function gunKick(){if(!AC||soundMode===2)return;const B=gunBus();gT(B.sat,'sine',150,55,0.12,0.5);gN(B.pre,0.08,0.2,'lowpass',700);gN(B.pre,0.1,0.06,'bandpass',1200,1,0,400);}
function gunVol(x,y,mine){if(mine)return 1;const d=Math.hypot(x-me.x,y-me.y);return Math.max(0,1-d/340)*0.7;}

/* ---- 총 그림 (도트) : 총구가 오른쪽 · k 테두리 m 어두운 금속 S 금속 s 밝은 금속 b 나무 B 어두운 나무 g 황동 G 어두운 황동 c 등급 빛 ---- */
const GUN_TPL={
  pistol:{r:["............","..kkkkkkkkk.",".kgSSSSSSSsk","kGgmmgkkkkk.","kbBGk.......",".kbBk.......","..kk........"],px:2,py:4},
  rifle:{r:["....kkkkkkkkkkk.","kkkkgSSSSSSSSSsk","kbbBkGmmgkkkkkk.","kbBk.kck........",".kk..kk........."],px:4,py:2},
  handcannon:{r:[".....kkkkkkkk.","....kgSSSSSSsk","kkkkgmSSSSSSSk","kbBkGgmmmmmmsk",".kbk.kcckkkkk.",".kk..kk......."],px:2,py:3}};
const GUN_RAR=[{g:'G',G:'B',c:'m'},{c:'S'},{g:'y',G:'g',c:'c'},{g:'o',G:'g',m:'r',c:'y'}];
const GSPR=new Map();
const GUN_ROW={pistol:0,rifle:1,handcannon:2};
function gunSpriteAI(kind,rar){const row=GUN_ROW[kind];if(row==null||!SPR.guns)return null;const [c,x]=mk(24,12);x.drawImage(SPR.guns,rar*24,row*12,24,12,0,0,24,12);const d=x.getImageData(0,0,24,12).data;let x0=24,x1=-1,y0=12,y1=-1;for(let j=0;j<12;j++)for(let i=0;i<24;i++)if(d[(j*24+i)*4+3]>0){if(i<x0)x0=i;if(i>x1)x1=i;if(j<y0)y0=j;if(j>y1)y1=j;}if(x1<0)return null;
  const w=x1-x0+1,h=y1-y0+1;const [c2,x2]=mk(w,h);x2.drawImage(c,x0,y0,w,h,0,0,w,h);let g=null;if(rar>=1){const [gc,gx]=mk(w,h);gx.drawImage(c2,0,0);gx.globalCompositeOperation='source-in';gx.fillStyle=rar===3?'#ff8a1f':rar===2?'#ffd35a':'#7aa2ff';gx.fillRect(0,0,w,h);g=gc;}
  return{c:c2,g,px:Math.round(w*(kind==='rifle'?0.22:0.28)),py:Math.round(h*0.62),h,x0:0,x1:w-1,y0:0,gun:1,ai:1,col:rar===3?'#ff8a1f':rar===2?'#ffd35a':rar===1?'#7aa2ff':null};}
function gunSprite(kind,rar){rar=Math.max(0,Math.min(3,rar|0));const key=kind+'|'+rar+(SPR.guns?'|ai':'');let w=GSPR.get(key);if(w)return w;w=gunSpriteAI(kind,rar);if(w){GSPR.set(key,w);return w;}const T=GUN_TPL[kind]||GUN_TPL.rifle;const rows=T.r.map(s=>s.replace(/./g,ch=>GUN_RAR[rar][ch]||ch));
  const c=makeSprite(rows).c;let g=null;if(rar>=1){const [gc,gx]=mk(c.width,c.height);gx.drawImage(c,0,0);gx.globalCompositeOperation='source-in';gx.fillStyle=rar===3?'#ff8a1f':rar===2?'#ffd35a':'#7aa2ff';gx.fillRect(0,0,c.width,c.height);g=gc;}
  w={c,g,px:T.px,py:T.py,h:c.height,x0:0,x1:c.width-1,y0:0,gun:1,col:rar===3?'#ff8a1f':rar===2?'#ffd35a':rar===1?'#7aa2ff':null};GSPR.set(key,w);return w;}
function gunIcon(it){const ws=gunSprite(it.kind,it.rar);return pcan(16,16,(q,x)=>{x.drawImage(ws.c,Math.round((16-ws.c.width)/2),Math.round((16-ws.c.height)/2));});}
/* 손에 든 총: 공격 방향으로 겨누고, 쏠 때 총구가 튀어 오른다 */
function drawGunHeld(cls,src,bx,by,f,kind,wr,look,hand){const g=src.gunT&&time-src.gunT<0.7?src.gunG:null;const kd=g==='p'||g==='k'?'pistol':g==='c'||g==='x'?'handcannon':g?'rifle':kind;const gs=(look&&skinOk(look.sk,cls)&&skinSprite(look.sk,wr))||gunSprite(kd,wr);
  const hx=hand?hand.x:bx+(f>0?3:-4),hy=hand?hand.y:by-5;const aim=src.atkAnim>0||g;let a=aim?src.atkAngle:(f>0?0.25:Math.PI-0.25);if(a==null)a=f>0?0:Math.PI;const left=Math.cos(a)<0;const rec=src.atkAnim>0?Math.min(1,src.atkAnim/Math.max(0.05,src.atkDur)):0;const ra=a+(left?1:-1)*rec*0.45;
  const gsc=gs.ai?0.72:1;const draw=(ox,oy)=>{wx.save();wx.translate(hx+ox-Math.cos(a)*rec*2,hy+oy-Math.sin(a)*rec*2);wx.rotate(ra);wx.scale(gsc,left?-gsc:gsc);if(gs.g&&wr>=1){wx.globalAlpha=wr>=3?0.4+0.25*Math.sin(time*7):wr===2?0.3:0.18;for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]])wx.drawImage(gs.g,-gs.px+dx,-gs.py+dy);wx.globalAlpha=1;}wx.drawImage(gs.c,-gs.px,-gs.py);wx.restore();};
  if(look&&look.adv==='gunkata'&&kd==='pistol')draw(f>0?-3:3,2);draw(0,0);
  if(gs.skin&&look&&SKIN_FX[look.sk]){const lx=(gs.x1+1-gs.px)*gsc,ly=(Math.round(gs.h*0.3)-gs.py)*(left?-gsc:gsc);const c=Math.cos(ra),s2=Math.sin(ra);skinFx(src,look.sk,hx+lx*c-ly*s2,hy+lx*s2+ly*c,{gun:1,a:ra});}}

/* ---- 효과 ---- */
const GFX=[],GSMOKE=[],GLIGHT=[];function gfx(o){o.t0=time;GFX.push(o);return o;}
function gLight(x,y,r,d){GLIGHT.push({x,y,r,t0:time,max:d});}
function gSmoke(x,y,vx,vy,r,life,c,z){if(GSMOKE.length>260)return;GSMOKE.push({x,y,z:z||6,vx,vy,vz:rf(4,12),r,life,max:life,c:c||'#bdb6c4'});}
const GUN_MZ={r:[7,'#fff3c0'],t:[5,'#ffe7a0'],g:[6,'#ffe7a0'],p:[10,'#ffd07a'],k:[6,'#fff6d0'],s:[9,'#ffc070'],c:[8,'#ffb060'],x:[16,'#ffb060']};
const GUN_FXK=new Set(['gfire','gcone','glob','gboom','gtracer','gvent','gleap','gdeploy','ggat','gkick','godrive','grailc','grail','garmor','gbarrage','gshellfall','gsiege','gballet','gspin','gslide','gscald','gric']);
function gTip(p,a,g){const L=g==='x'?20:g==='c'?12:g==='p'||g==='k'?9:13;return{x:p.x+Math.cos(a)*L,y:p.y-7+Math.sin(a)*L*0.8};}
function onGunFx(o){const k=o.k;if(!GUN_FXK.has(k))return false;const mine=o.id===myId;
  if(k==='gfire'){const g=o.g;let x,y;if(o.id!=null){const p=kPos(o.id);if(!p)return true;const src=mine?me:G.players.get(o.id);const t=gTip(p,o.a,g);x=t.x;y=t.y;
      if(g==='x')G._siegeKick=time;if(src){src.atkKind='gun';src.atkAngle=o.a;src.atkDur=g==='g'||g==='k'?0.1:0.2;src.atkAnim=src.atkDur;src.face=Math.cos(o.a)<0?-1:1;src.gunG=g;src.gunT=time;}}else{x=o.x;y=o.y;}
    const [sz,col]=GUN_MZ[g]||GUN_MZ.r;gfx({type:'mz',x,y,a:o.a,sz:sz*(o.big?1.3:1),col,max:0.07});
    const ns=g==='x'?8:o.big?4:g==='g'||g==='k'?1:2;for(let n=0;n<ns;n++)gSmoke(x,y,Math.cos(o.a)*rf(14,40)+rf(-6,6),Math.sin(o.a)*rf(10,28)+rf(-6,6),rf(1.5,3)*(g==='x'?2:1),rf(0.35,0.7),null,6);
    for(let n=0;n<(o.big?6:3);n++){const aa=o.a+rf(-0.35,0.35),sp=rf(80,190);part(x,y+7,Math.cos(aa)*sp,Math.sin(aa)*sp*0.7,pick(['y','w','o']),rf(.06,.14),{z:8,glow:true});}
    if(g!=='c'&&g!=='x'&&g!=='t'&&(g!=='g'||R()<0.5)){const f=Math.cos(o.a)<0?1:-1;part(x-Math.cos(o.a)*7,y+7,f*rf(20,45),rf(-10,5),g==='p'?'r':'g',rf(.6,.9),{z:10,vz:rf(40,70),g:-240,ground:true});}
    const v=gunVol(x,y,mine);if(v>0.04){gunShot(g,o.big,v);if(mine&&g!=='g'&&g!=='t'&&R()<(g==='p'?1:0.55))gunCasing(g==='p',g==='p'?0.22:0.26);}
    if(mine){const sk={r:0.9,g:1,p:2.8,k:0.8,s:2.4,c:1.5,x:6}[g]||0;shake=Math.max(shake,sk*(o.big?1.3:1));if(g==='x')HSTOP=Math.max(HSTOP,0.05);}
    gLight(x,y,g==='x'?100:g==='p'||o.big?64:42,0.08);return true;}
  if(k==='gboom'){const s=o.s|0,r=o.r||20;gfx({type:'boom',x:o.x,y:o.y,r,s,max:0.42+s*0.12});gfx({type:'scorch',x:o.x,y:o.y,r:r*0.75,max:3.5,under:1});
    for(let i=0;i<14+s*12;i++){const t=R()*Math.PI*2,sp=rf(40,110+s*50);part(o.x,o.y,Math.cos(t)*sp,Math.sin(t)*sp*0.6,pick(['o','y','r','w']),rf(.2,.5+s*0.1),{z:rf(3,10),vz:rf(20,90+s*20),g:-200,glow:true});}
    for(let i=0;i<5+s*4;i++){const t=R()*Math.PI*2,sp=rf(8,30+s*6);gSmoke(o.x+Math.cos(t)*r*0.3,o.y+Math.sin(t)*r*0.2,Math.cos(t)*sp,Math.sin(t)*sp*0.5,rf(3,5)+s*1.5,rf(0.7,1.3)+s*0.2,pick(['#6b6275','#8a8294','#4a4252']),rf(4,12));}
    for(let i=0;i<3+s*3;i++){const t=R()*Math.PI*2,sp=rf(50,130);part(o.x,o.y,Math.cos(t)*sp,Math.sin(t)*sp*0.6,pick(['k','G','B','m']),rf(.5,.9),{z:2,vz:rf(40,110),g:-260,ground:true});}
    const v=Math.max(0.12,1-Math.hypot(o.x-me.x,o.y-me.y)/360);gunBoom(s,v);if(s>=3)screenFlash=Math.max(screenFlash,0.12);else if(s===2)screenFlash=Math.max(screenFlash,0.05);gLight(o.x,o.y,r*1.8+30,0.28+s*0.1);return true;}
  if(k==='gcone'){gfx({type:'cone',x:o.x,y:o.y-7,a:o.a,r:o.r,max:0.13,seed:R()*99});for(let n=0;n<10;n++){const aa=o.a+rf(-0.5,0.5),d=rf(10,o.r);part(o.x+Math.cos(aa)*d,o.y+Math.sin(aa)*d*0.7,Math.cos(aa)*60,Math.sin(aa)*40,pick(['y','o','w']),rf(.1,.25),{z:7,glow:true});}return true;}
  if(k==='glob'){gfx({type:'lob',x1:o.x1,y1:o.y1,x2:o.x2,y2:o.y2,d:o.d,big:o.big,sm:o.sm,max:o.d});return true;}
  if(k==='gtracer'){let x2=o.x2,y2=o.y2;if(x2==null){x2=o.x+Math.cos(o.a)*(o.len||200);y2=o.y+Math.sin(o.a)*(o.len||200);}gfx({type:'tracer',x1:o.x,y1:o.y,x2,y2,w:o.w||1,max:o.w>=3?0.2:0.1});return true;}
  if(k==='gvent'){const ring=!!o.ring;gfx({type:'vent',x:o.x,y:o.y,a:o.a||0,r:o.r,ring,max:0.35});const n=ring?26:22;for(let i=0;i<n;i++){const aa=ring?i/n*Math.PI*2:(o.a||0)+rf(-0.7,0.7),sp=rf(60,150)*(o.r/60);gSmoke(o.x+Math.cos(aa)*6,o.y+Math.sin(aa)*4,Math.cos(aa)*sp,Math.sin(aa)*sp*0.6,rf(2.5,5),rf(0.5,0.9),pick(['#f2eee8','#d8d2dc','#bdb6c4']),rf(4,10));}
    const v=gunVol(o.x,o.y,Math.hypot(o.x-me.x,o.y-me.y)<20);gunHiss(0.6,v*1.4);gunBoom((o.s|0)>=70?2:1,v*0.8);gLight(o.x,o.y,70,0.2);return true;}
  if(k==='gleap'){for(let i=0;i<10;i++){const f=i/10;gSmoke(o.x1+(o.x2-o.x1)*f,o.y1+(o.y2-o.y1)*f,rf(-6,6),rf(-4,4),rf(2,3.5),rf(0.4,0.7),null,2);}sfx('dash');return true;}
  if(k==='gdeploy'){gfx({type:'ring',x:o.x,y:o.y,r:18,c:'#d8d2dc',max:0.3});for(let i=0;i<8;i++){const aa=i/8*Math.PI*2;gSmoke(o.x,o.y,Math.cos(aa)*30,Math.sin(aa)*18,2.5,0.5,null,2);}if(gunVol(o.x,o.y,false)>0.05||1){gunClank();gunHiss(0.4,0.8);}return true;}
  if(k==='ggat'){gfx({type:'gat',pid:o.id,a:o.a,max:o.d});return true;}
  if(k==='gkick'){gfx({type:'kick',pid:o.id,a:o.a,max:0.16});if(gunVol(0,0,mine)>0)gunKick();return true;}
  if(k==='godrive'){gfx({type:'odrive',pid:o.id,max:o.d});gunHiss(0.7,1.2);gunClank();return true;}
  if(k==='grailc'){gfx({type:'railc',pid:o.id,a:o.a,max:o.d});if(mine||1)gunCharge(o.d);return true;}
  if(k==='grail'){gfx({type:'rail',x:o.x,y:o.y,a:o.a,len:o.len,max:0.4});for(let i=0;i<12;i++){const f=i/12;gSmoke(o.x+Math.cos(o.a)*o.len*f,o.y+6+Math.sin(o.a)*o.len*f,rf(-10,10),rf(-6,6),rf(2,4),rf(0.5,0.9),'#e8f6ff',8);}
    const v=gunVol(o.x,o.y,mine);gunShot('s',1,v);gunBoom(1,v*0.8);gLight(o.x,o.y,90,0.2);if(mine){shake=Math.max(shake,4);screenFlash=Math.max(screenFlash,0.1);}return true;}
  if(k==='garmor'){gfx({type:'armor',pid:o.id,max:o.d});gunClank();gunHiss(0.9,1.4);return true;}
  if(k==='gbarrage'){gfx({type:'target',x:o.x,y:o.y,r:110,max:o.d});return true;}
  if(k==='gshellfall'){gfx({type:'fall',x:o.x,y:o.y,d:o.d,big:o.big,max:o.d});const v=gunVol(o.x,o.y,false);if(v>0.05||o.big)gunWhistle(o.d,o.big?1.4:v+0.3);return true;}
  if(k==='gsiege'){gfx({type:'siege',pid:o.id,a:o.a,max:o.d});gunClank();return true;}
  if(k==='gballet'){gfx({type:'ballet',pid:o.id,max:o.d});return true;}
  if(k==='gspin'){gfx({type:'spin',pid:o.id,big:o.big,max:o.d||1.2});if(o.big){const p=kPos(o.id);if(p){gfx({type:'ring',x:p.x,y:p.y,r:90,c:'#8fd0ff',max:0.4});gunBoom(2,gunVol(p.x,p.y,mine));}}return true;}
  if(k==='gric'){gfx({type:'ric',x:o.x,y:o.y,max:0.18});for(let n=0;n<7;n++){const t=R()*Math.PI*2,sp=rf(60,150);part(o.x,o.y+6,Math.cos(t)*sp,Math.sin(t)*sp*0.6,pick(['w','y','c']),rf(.1,.25),{z:7,glow:true});}gLight(o.x,o.y,34,0.08);if(AC&&soundMode!==2){const v=gunVol(o.x,o.y,false)+0.25;const B=gunBus();const f=rf(2600,3400)*(1+0.04*(o.n|0));gT(B.pre,'triangle',f,f*0.55,0.12,0.09*v);gT(B.pre,'sine',f*1.5,f*0.9,0.08,0.04*v);gN(B.pre,0.03,0.12*v,'highpass',4500);}return true;}
  if(k==='gslide'){for(let i=0;i<8;i++){const f=i/8;gSmoke(o.x1+(o.x2-o.x1)*f,o.y1+(o.y2-o.y1)*f,rf(-5,5),rf(-3,3),rf(1.5,3),rf(0.3,0.6),'#a89f8a',1);}sfx('dash');return true;}
  if(k==='gscald'){gfx({type:'scald',pid:o.id,a:o.a,max:o.d});gunHiss(o.d,1.2);return true;}
  return true;}
function gPos(id){return kPos(id);}
/* 땅에 남는 그을음 (그림자 아래에) */
function drawGunUnder(icx,icy){for(const e of GFX){if(e.type!=='scorch')continue;const k=(time-e.t0)/e.max;if(k>1)continue;const x=Math.round(e.x)-icx,y=Math.round(e.y)-icy;wx.save();wx.globalAlpha=0.38*(1-k);wx.fillStyle='#0a0708';wx.beginPath();wx.ellipse(x,y,e.r,e.r*0.55,0,0,Math.PI*2);wx.fill();wx.globalAlpha=0.18*(1-k);wx.fillStyle='#3a1a08';wx.beginPath();wx.ellipse(x,y,e.r*0.6,e.r*0.33,0,0,Math.PI*2);wx.fill();wx.restore();}}
function updateGunFx(dt){for(let i=GSMOKE.length-1;i>=0;i--){const s=GSMOKE[i];s.life-=dt;if(s.life<=0){GSMOKE.splice(i,1);continue;}s.x+=s.vx*dt;s.y+=s.vy*dt;s.z+=s.vz*dt;s.vx*=1-dt*3.2;s.vy*=1-dt*3.2;s.vz*=1-dt*0.8;s.r+=dt*4;}
  for(let i=GLIGHT.length-1;i>=0;i--)if(time-GLIGHT[i].t0>GLIGHT[i].max)GLIGHT.splice(i,1);}
function gunLights(L,icx,icy){for(const l of GLIGHT){const k=(time-l.t0)/l.max;L.push({x:l.x-icx,y:l.y-icy,r:l.r*(1-k*0.6),i:1});}for(const e of GFX){if(e.type==='armor'||e.type==='odrive'){const p=gPos(e.pid);if(p)L.push({x:p.x-icx,y:p.y-8-icy,r:60,i:0.9});}}}
function drawGunSmoke(icx,icy){for(const s of GSMOKE){const k=1-s.life/s.max;const x=Math.round(s.x)-icx,y=Math.round(s.y-s.z)-icy;if(x<-20||y<-20||x>W+20||y>H+20)continue;wx.globalAlpha=Math.max(0,0.42*(1-k));wx.fillStyle=s.c;const r=Math.max(1,Math.round(s.r));wx.beginPath();wx.arc(x,y,r,0,Math.PI*2);wx.fill();}wx.globalAlpha=1;}
const SIEGE_GUN=pcan(30,14,q=>{for(let i=6;i<29;i++){q(i,4,'k');q(i,10,'k');for(let j=5;j<10;j++)q(i,j,j<7?'s':j<9?'S':'m');}for(let j=3;j<12;j++){q(29,j,'k');q(28,j,j===3||j===11?'k':'G');}for(const bx of[10,17,24])for(let j=4;j<11;j++)q(bx,j,j===4||j===10?'k':'g');for(let j=2;j<13;j++)for(let i=0;i<7;i++){const d=Math.hypot(i-3,j-7);if(d<5.2)q(i,j,d>4.3?'k':d<1.5?'y':'b');}});
function drawGunFx(icx,icy){drawGunSmoke(icx,icy);
  for(let i=GFX.length-1;i>=0;i--){const e=GFX[i];const t=time-e.t0;if(t>e.max){GFX.splice(i,1);continue;}const k=t/e.max;const sx=Math.round(e.x||0)-icx,sy=Math.round(e.y||0)-icy;
    if(e.type==='scorch')continue;
    if(e.type==='mz'){const ca=Math.cos(e.a),sa=Math.sin(e.a),L=e.sz*(1-k*0.5);wx.save();wx.globalCompositeOperation='lighter';wx.globalAlpha=1-k*0.6;
      for(const [ln,off,c] of [[L,0,'#ffffff'],[L*0.7,0.5,e.col],[L*0.7,-0.5,e.col],[L*0.4,1.3,e.col],[L*0.4,-1.3,e.col]]){lineP(wpx,sx,sy,sx+Math.cos(e.a+off)*ln,sy+Math.sin(e.a+off)*ln*0.8,c);}
      wx.fillStyle='#ffffff';wx.fillRect(sx-1,sy-1,3,3);wx.restore();wglow(sx,sy,e.sz*1.8,e.col,0.7*(1-k));wx.globalAlpha=1;}
    else if(e.type==='boom'){const s=e.s,r=e.r,y=sy-4;const ek=1-Math.pow(1-Math.min(1,k*1.6),3);
      if(k<0.18){wx.fillStyle=`rgba(255,250,235,${0.7*(1-k/0.18)})`;wx.beginPath();wx.ellipse(sx,y,r*0.55,r*0.4,0,0,Math.PI*2);wx.fill();}
      const fr=r*(0.35+0.55*ek);wx.save();wx.globalCompositeOperation='lighter';const g=wx.createRadialGradient(sx,y,0,sx,y,fr);g.addColorStop(0,`rgba(255,230,160,${0.8*(1-k)})`);g.addColorStop(0.45,`rgba(255,140,45,${0.75*(1-k)})`);g.addColorStop(1,'rgba(160,30,10,0)');wx.fillStyle=g;wx.beginPath();wx.ellipse(sx,y,fr,fr*0.75,0,0,Math.PI*2);wx.fill();wx.restore();
      wx.globalAlpha=Math.max(0,1-k*1.3);const rr=r*(0.3+1.1*ek);for(let n=0;n<48;n++){const q=n/48*Math.PI*2;wpx(Math.round(sx+Math.cos(q)*rr),Math.round(y+4+Math.sin(q)*rr*0.55),n%2?'w':'y');}
      if(s>=2){const r2=rr*0.8;for(let n=0;n<40;n++){const q=n/40*Math.PI*2;wpx(Math.round(sx+Math.cos(q)*r2),Math.round(y+4+Math.sin(q)*r2*0.55),'o');}}
      wx.globalAlpha=1;wglow(sx,y,r*1.4,'#ffa050',0.55*(1-k));}
    else if(e.type==='cone'){wx.globalAlpha=1-k;const n=9;for(let q=0;q<n;q++){const aa=e.a-0.5+q/(n-1),L=e.r*(0.55+0.45*((q*37+e.seed*7)%10)/10);const L0=L*Math.max(0,k*1.2-0.1);lineP(wpx,sx+Math.cos(aa)*L0,sy+Math.sin(aa)*L0*0.7,sx+Math.cos(aa)*L,sy+Math.sin(aa)*L*0.7,q%3?'y':'w');}wglow(sx+Math.cos(e.a)*e.r*0.4,sy+Math.sin(e.a)*e.r*0.3,e.r*0.6,'#ffd07a',0.5*(1-k));wx.globalAlpha=1;}
    else if(e.type==='lob'){const x1=e.x1,y1=e.y1,x2=e.x2,y2=e.y2,d=Math.hypot(x2-x1,y2-y1);const hh=e.sm?10+d*0.3:18+d*0.28;const x=x1+(x2-x1)*k,y=y1+(y2-y1)*k-4*hh*k*(1-k);const px=Math.round(x)-icx,py=Math.round(y)-icy;
      const r=e.big?3:e.sm?1:2;wx.fillStyle=PAL.k;wx.fillRect(px-r,py-r,r*2+1,r*2+1);wx.fillStyle=e.sm?PAL.G:PAL.m;wx.fillRect(px-r+1,py-r+1,r*2-1,r*2-1);if(r>=2)wpx(px-1,py-1,'S');if((time*20|0)%2)wpx(px+r,py-r-1,'y');
      if(R()<0.6)gSmoke(x,y+6,rf(-4,4),rf(-4,4),1.2,0.35,'#8a8294',6);const gx=Math.round(x2)-icx,gy=Math.round(y2)-icy;wx.globalAlpha=0.5*(1-k*0.5);for(let n=0;n<16;n++){if(((n+(time*12|0))&3))continue;const q=n/16*Math.PI*2;wpx(Math.round(gx+Math.cos(q)*(e.big?10:6)),Math.round(gy+Math.sin(q)*(e.big?6:4)),'o');}wx.globalAlpha=1;}
    else if(e.type==='tracer'){const x1=Math.round(e.x1)-icx,y1=Math.round(e.y1)-icy,x2=Math.round(e.x2)-icx,y2=Math.round(e.y2)-icy;wx.save();wx.globalCompositeOperation='lighter';wx.globalAlpha=1-k;wx.strokeStyle=e.w>=3?'rgba(255,190,110,0.9)':'rgba(255,236,170,0.85)';wx.lineWidth=e.w;wx.beginPath();wx.moveTo(x1,y1);wx.lineTo(x2,y2);wx.stroke();if(e.w>=2){wx.strokeStyle='rgba(255,255,255,0.9)';wx.lineWidth=1;wx.beginPath();wx.moveTo(x1,y1);wx.lineTo(x2,y2);wx.stroke();}wx.restore();wx.globalAlpha=1;}
    else if(e.type==='vent'){wx.globalAlpha=1-k;if(e.ring){const r=e.r*Math.min(1,k*2.2);for(let n=0;n<40;n++){const q=n/40*Math.PI*2;wpx(Math.round(sx+Math.cos(q)*r),Math.round(sy+Math.sin(q)*r*0.6),n%2?'w':'W');}}else{for(let n=0;n<7;n++){const aa=e.a-0.6+n*0.2,L=e.r*Math.min(1,k*2.5);lineP(wpx,sx+Math.cos(aa)*6,sy-6+Math.sin(aa)*4,sx+Math.cos(aa)*L,sy-6+Math.sin(aa)*L*0.7,n%2?'w':'W');}}wglow(sx,sy-6,e.r*0.7,'#ffe0c0',0.35*(1-k));wx.globalAlpha=1;}
    else if(e.type==='ric'){wx.save();wx.globalCompositeOperation='lighter';wx.globalAlpha=1-k;for(let q=0;q<6;q++){const aa=q/6*Math.PI*2+e.t0*7;lineP(wpx,sx+Math.cos(aa)*2,sy+Math.sin(aa)*2,sx+Math.cos(aa)*(4+k*6),sy+Math.sin(aa)*(4+k*6),q%2?'y':'w');}wx.restore();wx.globalAlpha=1;wglow(sx,sy,10,'#bfe6ff',0.6*(1-k));}
    else if(e.type==='ring'){const r=e.r*Math.min(1,k*2);wx.globalAlpha=1-k;wx.strokeStyle=e.c;wx.lineWidth=1;wx.beginPath();wx.ellipse(sx,sy,r,r*0.6,0,0,Math.PI*2);wx.stroke();wx.globalAlpha=1;}
    else if(e.type==='target'){const r=e.r;const bl=((time*6)|0)%2;wx.globalAlpha=0.55+0.25*bl;wx.strokeStyle='#ff5a3a';wx.setLineDash([4,3]);wx.beginPath();wx.ellipse(sx,sy,r,r*0.6,0,0,Math.PI*2);wx.stroke();wx.setLineDash([]);lineP(wpx,sx-8,sy,sx+8,sy,'e');lineP(wpx,sx,sy-5,sx,sy+5,'e');wx.globalAlpha=1;wglow(sx,sy,30,'#ff5a3a',0.15);}
    else if(e.type==='fall'){const y=sy-(1-k)*(1-k)*170;const big=e.big;const w=big?3:1;wx.fillStyle=PAL.k;wx.fillRect(sx-w-1,Math.round(y)-6-(big?4:0),w*2+3,big?12:8);wx.fillStyle=PAL.m;wx.fillRect(sx-w,Math.round(y)-5-(big?4:0),w*2+1,big?10:6);wpx(sx,Math.round(y)+1,'o');wx.globalAlpha=0.5;lineP(wpx,sx,Math.round(y)-8-(big?4:0),sx,Math.round(y)-22,'W');wx.globalAlpha=1;
      const r=(big?40:14)*(0.5+0.5*(1-k));wx.globalAlpha=0.6;for(let n=0;n<24;n++){if(n%2)continue;const q=n/24*Math.PI*2;wpx(Math.round(sx+Math.cos(q)*r),Math.round(sy+Math.sin(q)*r*0.55),'e');}wx.globalAlpha=1;}
    else if(e.pid!=null){const p=gPos(e.pid);if(!p){continue;}const px=Math.round(p.x)-icx,py=Math.round(p.y)-icy;
      if(e.type==='gat'){const tp=gTip(p,e.a,'g');wglow(Math.round(tp.x)-icx,Math.round(tp.y)-icy,8+((time*30|0)%2)*3,'#ffd07a',0.5);}
      else if(e.type==='kick'){const a=e.a;wx.globalAlpha=1-k;for(let n=0;n<8;n++){const q=a-0.8+n*0.2*(1+k);wpx(Math.round(px+Math.cos(q)*14),Math.round(py-4+Math.sin(q)*9),n%2?'w':'W');}wx.globalAlpha=1;}
      else if(e.type==='odrive'){wglow(px,py-8,20,'#ffb03a',0.2+0.08*Math.sin(time*9));if(R()<0.25)gSmoke(p.x+rf(-5,5),p.y-rf(10,14),rf(-8,8),rf(-6,0),1.5,0.5,'#e8e2ea',14);}
      else if(e.type==='railc'){const tp=gTip(p,e.a,'s');const tx=Math.round(tp.x)-icx,ty=Math.round(tp.y)-icy;wglow(tx,ty,4+k*14,'#bfe6ff',0.4+k*0.5);if(R()<0.8){const q=R()*Math.PI*2,d=rf(10,22)*(1-k);part(tp.x+Math.cos(q)*d,tp.y+7+Math.sin(q)*d,-Math.cos(q)*60,-Math.sin(q)*60,pick(['c','w']),0.18,{z:7,glow:true});}}
      else if(e.type==='armor'){const bl=0.6+0.4*Math.sin(time*8);const f=(e.pid===myId?me.face:(G.players.get(e.pid)||{}).face)||1;wglow(px,py-8,24,'#ffb03a',0.25*bl);
        for(const sd of[-1,1]){const ox=px+sd*5-(sd<0?3:0);wx.fillStyle=PAL.k;wx.fillRect(ox-1,py-10,5,4);wx.fillStyle=PAL.g;wx.fillRect(ox,py-9,3,2);wx.fillStyle=PAL.y;wx.fillRect(ox,py-9,3,1);}
        const bx2=px-f*6;wx.fillStyle=PAL.k;wx.fillRect(bx2-2,py-13,5,8);wx.fillStyle=PAL.G;wx.fillRect(bx2-1,py-12,3,6);wx.fillStyle=((time*6|0)%2)?PAL.o:PAL.y;wx.fillRect(bx2-1,py-10,3,2);wx.fillStyle=PAL.k;wx.fillRect(bx2-1,py-16,2,3);
        if(R()<0.35)gSmoke(p.x-f*6,p.y-17,rf(-4,4)-f*6,-2,1.6,0.6,'#f2eee8',16);}
      else if(e.type==='siege'){const a=e.a,left=Math.cos(a)<0;const last=G._siegeKick||0;const kb=Math.max(0,0.15-(time-last))*20;const cx=px+(left?10:-10),cy=py-6;wx.save();wx.translate(cx-Math.cos(a)*kb,cy-Math.sin(a)*kb*0.6);wx.rotate(a);if(left)wx.scale(1,-1);wx.drawImage(SIEGE_GUN,-6,-7);wx.restore();for(const sd of[-1,1]){wx.fillStyle=PAL.k;wx.fillRect(cx+sd*5-2,cy+3,5,5);wx.fillStyle=PAL.b;wx.fillRect(cx+sd*5-1,cy+4,3,3);}}
      else if(e.type==='ballet'){wglow(px,py-8,26,'#8fd0ff',0.25);if(R()<0.5)part(p.x+rf(-8,8),p.y-rf(2,18),rf(-20,20),0,pick(['c','w']),0.4,{z:0,vz:12,glow:true});}
      else if(e.type==='spin'){const n=e.big?16:6;wx.save();wx.globalCompositeOperation='lighter';for(let q=0;q<n;q++){const aa=time*14+q/n*Math.PI*2;const r=e.big?20+k*60:12;wpx(Math.round(px+Math.cos(aa)*r),Math.round(py-7+Math.sin(aa)*r*0.6),q%2?'y':'w');}wx.restore();}
      else if(e.type==='scald'){const tp=gTip(p,e.a,'c');for(let q=0;q<2;q++){const aa=e.a+rf(-0.45,0.45),sp=rf(90,150);gSmoke(tp.x,tp.y+7,Math.cos(aa)*sp,Math.sin(aa)*sp*0.6,rf(2,3.5),rf(0.35,0.55),pick(['#ffffff','#e8e2ea','#ffd8b0']),7);}}}}}
/* 투사체: 예광탄 · 산탄 · 포탄 · 슬러그 */
const GUN_PROJ={bullet:1,pellet:1,shell:1,slug:1};
function drawGunProj(p,sx,sy,glow){const l=Math.hypot(p.vx,p.vy)||1,ux=p.vx/l,uy=p.vy/l;
  if(p.type==='shell'){if(glow){if((time*20|0)%2)wpx(sx-Math.round(ux*3),sy-Math.round(uy*3),'y');return;}wx.fillStyle=PAL.k;wx.fillRect(sx-2,sy-2,5,5);wx.fillStyle=PAL.m;wx.fillRect(sx-1,sy-1,3,3);wpx(sx-1,sy-1,'S');if(R()<0.5)gSmoke(p.dx-ux*3,p.dy-uy*3,rf(-4,4),rf(-4,4),1.3,0.35,'#8a8294',p.h||6);return;}
  if(!glow)return;const L=p.type==='slug'?9:p.type==='pellet'?3:6;for(let i=0;i<L;i++)wpx(Math.round(sx-ux*i),Math.round(sy-uy*i),i===0?'w':i<L/2?'y':p.type==='slug'?'o':'g');if(p.type==='slug')for(let i=0;i<L-2;i++)wpx(Math.round(sx-ux*i),Math.round(sy-uy*i)+1,'o');}
/* 포탑 */
const TURRET=pcan(12,14,q=>{lineP(q,2,13,5,8,'k');lineP(q,9,13,6,8,'k');lineP(q,6,13,6,8,'k');for(let j=3;j<9;j++)for(let i=3;i<9;i++)q(i,j,(i===3||i===8||j===3||j===8)?'k':j<5?'g':'G');q(5,5,'o');q(6,5,'y');});
function drawGunZone(z,icx,icy){const sx=Math.round(z.x)-icx,sy=Math.round(z.y)-icy;if(z.vis===40){wx.fillStyle='rgba(0,0,0,0.4)';wx.fillRect(sx-5,sy,11,2);wx.drawImage(TURRET,sx-6,sy-13);
    let a=z._a||0;let best=null,bd=150;for(const m of G.monsters.values()){if(G.deadM.has(m.id))continue;const d=Math.hypot(m.dx-z.x,m.dy-z.y);if(d<bd){bd=d;best=m;}}if(best){const ta=Math.atan2(best.dy-z.y,best.dx-z.x);a=z._a=ta;}
    lineP(wpx,sx,sy-8,sx+Math.cos(a)*7,sy-8+Math.sin(a)*5,'S');wpx(Math.round(sx+Math.cos(a)*7),Math.round(sy-8+Math.sin(a)*5),'k');if(R()<0.06)gSmoke(z.x+rf(-2,2),z.y-12,rf(-3,3),-3,1.2,0.5,'#e8e2ea',12);
    if(z.t<2&&((time*6|0)%2)){wpx(sx,sy-14,'e');}}}
/* 증기압 게이지 */
function drawSteamGauge(){if(!G.ch||G.ch.cls!=='gunner'||!G.mev)return;const v=G.mev[12]|0;const x=182,y=212,w=116,h=4;const hi=v>=70;pr(x-1,y-1,w+2,h+2,PAL.k);pr(x,y,w,h,'#2a2230');pr(x+Math.round(w*0.7),y,1,h,'#6b6275');
  const col=v>=95?(((time*10)|0)%2?'#ffffff':'#ff6a3a'):hi?'#ffb03a':'#9ecfe0';pr(x,y,Math.round(w*v/100),h,col);pr(x,y,Math.round(w*v/100),1,hi?'#ffe0a0':'#e8f6ff');
  txt(hi?`고압! 증기압 ${v}`:`증기압 ${v}`,x+w/2,y-5,10,hi?'#ffb03a':'#b8d8e8','center');uiRects.push({x,y:y-8,w,h:12,tip:[['증기압','#ffb03a',12],['기본 공격 명중과 스킬로 차오른다','#e6dcc3',11],['70 이상이면 고압: 모든 피해 +10%','#ffd35a',11],['100이 되면 과열 분출(주변 150%) 후 40으로 · 증기 배출이 한 번에 쏟아 낸다','#9e937a',11]]});}
/* 증기총사 스킬 아이콘 */
function gunStamp(q,kind,ox,oy,rar){const T=GUN_TPL[kind];T.r.forEach((row,j)=>{for(let i=0;i<row.length;i++){const ch=row[i];if(ch==='.')continue;q(ox+i,oy+j,(GUN_RAR[rar==null?1:rar][ch])||ch);}});}
(function(){const I={
  gshot:q=>{gunStamp(q,'rifle',0,7);for(let i=0;i<3;i++)lineP(q,10+i,2+i*2,14,2+i*2,i===1?'w':'y');},
  gbuck:q=>{gunStamp(q,'pistol',0,7);for(let i=0;i<7;i++){const a=-0.6+i*0.2;q(12+Math.cos(a)*3,8+Math.sin(a)*4,'o');q(13+Math.cos(a)*1,8+Math.sin(a)*6,'y');}q(12,8,'w');},
  ggren:q=>{for(let i=0;i<8;i++)q(2+i,13-Math.round(Math.sin(i/8*Math.PI)*8),i%2?'W':'S');discP(q,11,5,3,'m');ringP(q,11,5,3,'k');lineP(q,8,5,14,5,'G');q(12,1,'y');q(13,2,'o');},
  grecoil:q=>{discP(q,11,8,3,'o');discP(q,11,8,1,'y');for(const [dx,dy] of[[4,0],[3,-3],[3,3]])lineP(q,11+dx,8+dy,11+dx*1.4,8+dy*1.4,'y');lineP(q,1,8,7,8,'w');q(2,7,'w');q(2,9,'w');q(3,6,'w');q(3,10,'w');},
  gsmith:q=>{ringP(q,9,7,4,'g');ringP(q,9,7,3,'G');for(let i=0;i<8;i++){const a=i/8*Math.PI*2;q(9+Math.cos(a)*5,7+Math.sin(a)*5,'g');}lineP(q,2,14,7,9,'S');lineP(q,3,14,8,9,'s');q(1,13,'S');q(2,12,'S');},
  gturret:q=>{lineP(q,3,14,6,9,'S');lineP(q,12,14,9,9,'S');lineP(q,8,14,8,9,'S');for(let j=4;j<10;j++)for(let i=4;i<11;i++)q(i,j,j<6?'g':'G');lineP(q,10,6,15,5,'s');q(7,7,'o');},
  gslug:q=>{for(let i=2;i<12;i++)for(let j=6;j<10;j++)q(i,j,i<8?'g':'G');for(let j=6;j<10;j++){q(12,j,'o');}q(13,7,'o');q(13,8,'o');q(14,7,'y');lineP(q,1,4,4,6,'w');lineP(q,1,12,4,10,'w');},
  gboiler:q=>{for(let j=3;j<14;j++)for(let i=3;i<13;i++)q(i,j,(i===3||i===12||j===3||j===13)?'k':'G');for(let i=4;i<12;i++)q(i,5,'g');discP(q,8,9,3,'w');lineP(q,8,9,10,7,'r');q(8,9,'k');q(6,1,'W');q(7,2,'W');q(9,1,'W');},
  ggatling:q=>{for(const j of[6,8,10])lineP(q,3,j,12,j,'S');for(let j=5;j<12;j++){q(3,j,'g');q(7,j,'G');}q(13,6,'y');q(13,8,'w');q(13,10,'y');q(14,8,'o');q(1,8,'b');q(2,8,'b');},
  gkick:q=>{for(let j=4;j<10;j++)for(let i=3;i<7;i++)q(i,j,'B');for(let i=3;i<11;i++){q(i,10,'b');q(i,11,'B');}q(11,11,'B');for(const [dx,dy] of[[0,-3],[3,0],[2,-2],[2,2]])lineP(q,12,9,12+dx,9+dy,'y');},
  gvent:q=>{discP(q,6,9,3,'w');discP(q,10,7,3,'W');discP(q,12,10,2,'w');discP(q,8,5,2,'s');lineP(q,1,12,4,10,'S');lineP(q,1,13,4,11,'m');},
  gcluster:q=>{discP(q,7,7,3,'m');ringP(q,7,7,3,'k');q(6,6,'S');for(const [x,y] of[[13,3],[13,12],[2,13],[12,8]]){q(x,y,'o');q(x+1,y,'y');}},
  goverdrive:q=>{ringP(q,8,9,5,'g');for(let i=0;i<7;i++){const a=Math.PI+i/6*Math.PI;q(8+Math.cos(a)*4,9+Math.sin(a)*4,i>4?'r':'w');}lineP(q,8,9,12,6,'e');q(8,9,'y');q(3,2,'y');q(13,2,'o');},
  grail:q=>{lineP(q,1,8,14,8,'w');lineP(q,1,7,14,7,'c');lineP(q,1,9,14,9,'c');for(const x of[4,8,12]){q(x,5,'S');q(x,11,'S');q(x,6,'s');q(x,10,'s');}},
  gpride:q=>{ringP(q,8,8,5,'w');ringP(q,8,8,2,'r');lineP(q,8,1,8,4,'w');lineP(q,8,12,8,15,'w');lineP(q,1,8,4,8,'w');lineP(q,12,8,15,8,'w');q(8,8,'y');},
  steamarmor:q=>{for(let j=3;j<13;j++)for(let i=3;i<13;i++){const d=Math.hypot(i-7.5,j-8);if(d<5.5)q(i,j,d>4.6?'k':j<8?'g':'G');}q(6,7,'o');q(9,7,'o');lineP(q,4,10,11,10,'k');q(2,2,'W');q(13,1,'W');},
  bigbarrage:q=>{for(const [x,y] of[[3,2],[8,1],[12,4]]){lineP(q,x,y,x+1,y+3,'m');q(x+1,y+4,'o');}discP(q,8,12,3,'o');discP(q,8,12,1,'y');lineP(q,3,14,13,14,'r');},
  siegecannon:q=>{for(let i=0;i<12;i++){q(3+i,11-i*0.6,'S');q(3+i,12-i*0.6,'m');q(3+i,10-i*0.6,'s');}ringP(q,5,12,3,'b');q(5,12,'g');q(15,4,'y');q(14,3,'o');},
  bulletballet:q=>{gunStamp(q,'pistol',1,3,3);gunStamp(q,'pistol',3,8,2);ringP(q,8,8,7,'c');},
  gmortar:q=>{for(let i=0;i<6;i++)lineP(q,4+i,13-i,5+i,13-i,'S');lineP(q,3,14,10,14,'k');for(let i=0;i<6;i++)q(9+i,5-Math.round(Math.sin(i/6*Math.PI)*3),'W');q(15,6,'o');},
  gscald:q=>{lineP(q,1,9,5,9,'G');lineP(q,1,10,5,10,'g');for(let i=0;i<5;i++)discP(q,7+i*2,9-i*0.5+(i%2),1+(i>>1),i%2?'w':'W');},
  gshell:q=>{for(let i=3;i<11;i++)for(let j=6;j<10;j++)q(i,j,'m');q(11,7,'S');q(11,8,'S');q(12,7,'s');ringP(q,12,8,3,'y');lineP(q,1,8,3,8,'o');},
  gordnance:q=>{for(let j=7;j<14;j++)for(let i=2;i<14;i++)q(i,j,(j===7||j===13||i===2||i===13)?'k':'b');for(const x of[4,7,10]){for(let j=2;j<7;j++)q(x,j,'g');q(x,1,'o');}lineP(q,3,10,12,10,'B');},
  gricochet:q=>{const pts=[[1,13],[5,4],[9,11],[12,3],[15,8]];for(let i=0;i<pts.length-1;i++)lineP(q,pts[i][0],pts[i][1],pts[i+1][0],pts[i+1][1],i%2?'y':'w');for(const [x,y] of pts.slice(1,4)){q(x,y,'c');q(x+1,y,'w');q(x-1,y,'c');q(x,y-1,'c');q(x,y+1,'c');}q(15,8,'o');q(14,8,'y');},
  gslide:q=>{for(const j of[9,11,13])lineP(q,1,j,6,j,'W');gunStamp(q,'pistol',4,4,1);q(15,5,'y');},
  gfan:q=>{gunStamp(q,'pistol',0,8,1);for(let i=0;i<6;i++){const a=-1+i*0.4;lineP(q,12,6,12+Math.cos(a)*3,6+Math.sin(a)*3,i===5?'r':'y');}},
  gkatam:q=>{gunStamp(q,'pistol',0,2,2);gunStamp(q,'pistol',3,8,2);q(14,8,'c');q(13,3,'c');}};
  for(const k in I)SKILL_ICON[k]=pcan(16,16,q=>{for(let j=0;j<16;j++)for(let i=0;i<16;i++)q(i,j,'d');I[k](q);});})();
/* 소리 점검용: 오프라인으로 렌더링해 최대치·50ms RMS 측정 (__BC.gunAudioTest) */
async function gunAudioTest(){const oA=AC,oS=SFXG,oN=NB,oG=GUNB,oM=soundMode;const res={};
  const cases=[['rifle',()=>gunShot('r')],['shotgun',()=>gunShot('p')],['pistol',()=>gunShot('k')],['slug',()=>gunShot('s')],['launcher',()=>gunShot('c')],['gatling',()=>gunShot('g')],['siege',()=>gunShot('x')],['boom0',()=>gunBoom(0)],['boom1',()=>gunBoom(1)],['boom2',()=>gunBoom(2)],['boom3',()=>gunBoom(3)],['casing',()=>gunCasing(false,0.01)],['hiss',()=>gunHiss(0.6)],['hit_shot',()=>hitSfx('shot',false,true,false)],['ref_boom',()=>sfx('boom')],['ref_slash',()=>hitSfx('slash',false,true,false)],['ref_bow',()=>sfx('bow')],['ref_crit',()=>hitSfx('heavy',true,true,false)]];
  try{for(const [n,f] of cases){const oc=new OfflineAudioContext(1,44100*1.6,44100);AC=oc;SFXG=oc.createGain();SFXG.gain.value=1;SFXG.connect(oc.destination);const nb=oc.createBuffer(1,oc.sampleRate*0.6,oc.sampleRate);const d=nb.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;NB=nb;GUNB=null;soundMode=0;for(const k in lastS)delete lastS[k];f();
    const buf=await oc.startRendering();const x=buf.getChannelData(0);let pk=0;for(let i=0;i<x.length;i++){const v=Math.abs(x[i]);if(v>pk)pk=v;}let mr=0,end=0;const w=2205;for(let i=0;i+w<x.length;i+=w){let s2=0;for(let j=0;j<w;j++)s2+=x[i+j]*x[i+j];const r=Math.sqrt(s2/w);mr=Math.max(mr,r);if(r>0.005)end=(i+w)/44100;}res[n]={peak:+pk.toFixed(3),rms50:+mr.toFixed(3),len:+end.toFixed(2)};}}
  finally{AC=oA;SFXG=oS;NB=oN;GUNB=oG;soundMode=oM;}return res;}
function onGunnerUnlock(){unlockCls('gunner');setTimeout(()=>{msg('태엽 기사단장의 증기총이 새 주인을 찾았다 · 히든 직업 「증기총사」 해금!','#ffb03a');G.gcut={g:'gunner',t0:time};screenFlash=Math.max(screenFlash,0.15);sfx('legend');try{gunBoom(2,0.8);}catch(e){}},2600);}

// ---- 빛의 기사 효과 ----
const KFX=[];function kfx(o){o.t0=time;KFX.push(o);return o;}
const LIGHT_SWORD=pcan(24,120,q=>{for(let j=0;j<120;j++){const w=j<14?Math.max(1,Math.round(j*0.5)):j<96?7:0;for(let i=-w;i<=w;i++){const x=12+i;const e=Math.abs(i)===w;q(x,j,e?'#ffd35a':Math.abs(i)<2?'#ffffff':i<0?'#fff6d0':'#bfe6ff');}}
  for(let i=0;i<24;i++){q(i,96,'#d49a2a');q(i,97,'#ffd35a');q(i,98,'#d49a2a');}for(let j=99;j<114;j++){q(11,j,'#7d5418');q(12,j,'#d49a2a');q(13,j,'#7d5418');}for(let i=9;i<16;i++)for(let j=114;j<119;j++)q(i,j,(i+j)%2?'#ffd35a':'#fff6d0');for(let j=40;j<90;j+=10){q(12,j,'#8fd0ff');q(12,j+1,'#bfe6ff');}});
function onKnightFx(o){const k=o.k;
  if(k==='lcut'){kfx({type:'cut',x:o.x,y:o.y,a:o.a,r:o.r,tilt:o.tilt||0,big:o.big,max:0.28});for(let n=0;n<10;n++){const t=o.a+rf(-0.9,0.9),d=rf(o.r*0.4,o.r);part(o.x+Math.cos(t)*d,o.y+Math.sin(t)*d*0.6,Math.cos(t)*30,Math.sin(t)*20,pick(['w','y','c']),rf(.2,.45),{z:rf(4,10),glow:true});}return true;}
  if(k==='lwave'){kfx({type:'wave',x1:o.x1,y1:o.y1,x2:o.x2,y2:o.y2,dash:o.dash,max:o.dash?0.4:0.3});for(let n=0;n<8;n++){const f=R();part(o.x1+(o.x2-o.x1)*f,o.y1+(o.y2-o.y1)*f,rf(-8,8),rf(-6,6),pick(['w','y']),rf(.25,.5),{z:rf(2,8),vz:10,glow:true});}return true;}
  if(k==='lrune'){kfx({type:'rune',x:o.x,y:o.y,r:o.r,max:0.9});sfx('holy');return true;}
  if(k==='lmarkm'){for(const id of o.ids||[])MARKS.set(id,time+o.d);return true;}
  if(k==='mmark'){const M=o.sym==='curse'?CURSEM:STARM;if(!(o.ids||[]).length&&o.sym==='star'){STARM.clear();return true;}for(const id of o.ids||[])M.set(id,time+o.d);return true;}
  if(k==='lpillar'){kfx({type:'pillar',x:o.x,y:o.y,r:o.r,soft:o.soft,max:0.8});if(!o.soft){for(let n=0;n<24;n++){const t=R()*Math.PI*2,sp=rf(30,90);part(o.x,o.y,Math.cos(t)*sp,Math.sin(t)*sp*0.6,pick(['w','y','c']),rf(.3,.7),{z:rf(2,20),vz:rf(20,60),glow:true});}sfx('boom');}return true;}
  if(k==='lorbit'){kfx({type:'orbit',pid:o.id,max:o.d});return true;}
  if(k==='excal'){kfx({type:'excal',pid:o.id,max:o.d});return true;}
  if(k==='lsword'){kfx({type:'bigsword',x:o.x,y:o.y,a:o.a,len:o.len,h:o.h||0,max:0.6});screenFlash=Math.max(screenFlash,0.08+(o.h||0)/800);sfx('boom');return true;}
  if(k==='lstorm'){kfx({type:'storm',x:o.x,y:o.y,r:o.r,max:0.7});screenFlash=Math.max(screenFlash,0.15);for(let n=0;n<60;n++){const t=R()*Math.PI*2,sp=rf(40,170);part(o.x,o.y-6,Math.cos(t)*sp,Math.sin(t)*sp*0.6,pick(['w','y','c']),rf(.3,.8),{z:rf(2,20),vz:rf(20,70),glow:true});}sfx('boom');return true;}
  if(k==='lspear'){kfx({type:'spear',x:o.x,y:o.y,a:o.a,len:o.len,max:0.45});sfx('cast');return true;}
  if(k==='kdawn'){kfx({type:'dawn',x:o.x,y:o.y,d:o.d,max:o.d+1.3});sfx('holy');return true;}
  if(k==='kwave'){kfx({type:'kwave',x:o.x,y:o.y,r:o.r,max:0.45});return true;}
  if(k==='kdance'){kfx({type:'kdance',pid:o.id,max:o.d});screenFlash=Math.max(screenFlash,0.12);return true;}
  if(k==='kslash'){kfx({type:'kslash',x1:o.x1,y1:o.y1,x2:o.x2,y2:o.y2,max:0.35});for(let n=0;n<6;n++)part(o.x2+rf(-6,6),o.y2+rf(-6,6),rf(-40,40),rf(-30,30),pick(['w','y']),rf(.2,.4),{z:rf(2,10),glow:true});sfx('hit');return true;}
  if(k==='burst'){ufx({type:'burst',x:o.x,y:o.y,r:o.r,max:0.6,cs:o.cs||['#ffffff','#fff6d0','#ffd35a']});screenFlash=Math.max(screenFlash,0.2);for(let n=0;n<70;n++){const t=R()*Math.PI*2,sp=rf(60,200);part(o.x,o.y-10,Math.cos(t)*sp,Math.sin(t)*sp*0.6,pick(['y','w','c']),rf(.4,1),{z:rf(4,20),vz:rf(20,80),glow:true});}sfx('boom');return true;}
  return false;}
const MARKS=new Map(),STARM=new Map(),CURSEM=new Map();
function arcPts(sx,sy,r,a0,a1,n,c,sq){for(let i=0;i<=n;i++){const t=a0+(a1-a0)*i/n;wpx(Math.round(sx+Math.cos(t)*r),Math.round(sy+Math.sin(t)*r*(sq||0.6)),c);}}
function kPos(id){if(id===myId)return{x:me.x,y:me.y};const p=G.players.get(id)||G.monsters.get(id);return p?{x:p.dx,y:p.dy}:null;}
function drawKnightFx(icx,icy){for(let i=KFX.length-1;i>=0;i--){const e=KFX[i];const t=time-e.t0;if(t>e.max){KFX.splice(i,1);continue;}const k=t/e.max;const sx=Math.round(e.x||0)-icx,sy=Math.round(e.y||0)-icy-6;
  if(e.type==='cut'){const sw=1.9,a0=e.a-sw/2,a1=e.a+sw/2,prog=Math.min(1,k*2.2),aa=a0+(a1-a0)*prog;wx.globalAlpha=1-k*0.8;for(let w2=0;w2<(e.big?6:4);w2++){const r=e.r-w2*2;arcPts(sx,sy+e.tilt*w2,r,Math.max(a0,aa-1.2),aa,Math.round(r*1.5),w2===0?'w':w2<2?'y':'g',0.6+e.tilt*0.15);}wglow(sx+Math.cos(e.a)*e.r*0.6,sy+Math.sin(e.a)*e.r*0.36,e.r*0.7,'#fff6d0',0.3*(1-k));wx.globalAlpha=1;}
  else if(e.type==='wave'){const x1=e.x1-icx,y1=e.y1-icy,x2=e.x2-icx,y2=e.y2-icy;wx.globalAlpha=1-k;for(const [o2,c] of[[0,'w'],[1,'y'],[-1,'y'],[2,'g'],[-2,'g']])lineP(wpx,x1,y1+o2,x2,y2+o2,c);wx.save();wx.globalCompositeOperation='lighter';wx.strokeStyle='rgba(255,246,208,0.35)';wx.lineWidth=7;wx.beginPath();wx.moveTo(x1,y1);wx.lineTo(x2,y2);wx.stroke();wx.restore();wx.globalAlpha=1;}
  else if(e.type==='rune'){const r=e.r*Math.min(1,k*3);wx.globalAlpha=1-k*k;arcPts(sx,sy+6,r,0,Math.PI*2,90,'y');arcPts(sx,sy+6,r*0.7,0,Math.PI*2,60,'w');for(let n=0;n<6;n++){const q=n/6*Math.PI*2+time*2;lineP(wpx,sx+Math.cos(q)*r*0.7,sy+6+Math.sin(q)*r*0.42,sx+Math.cos(q+2.1)*r*0.7,sy+6+Math.sin(q+2.1)*r*0.42,'g');}wglow(sx,sy+6,r,'#ffe9a8',0.25*(1-k));wx.globalAlpha=1;}
  else if(e.type==='pillar'){const w2=Math.max(2,Math.round(e.r*0.35*(1-k*0.6))),h=Math.round(150*Math.min(1,k*4));wx.save();wx.globalCompositeOperation='lighter';const g=wx.createLinearGradient(sx-w2,0,sx+w2,0);g.addColorStop(0,'rgba(255,233,168,0)');g.addColorStop(0.5,`rgba(255,250,230,${0.85*(1-k)})`);g.addColorStop(1,'rgba(255,233,168,0)');wx.fillStyle=g;wx.fillRect(sx-w2,sy+6-h,w2*2,h);wx.restore();
    wx.globalAlpha=1-k;arcPts(sx,sy+6,e.r*Math.min(1,k*2.5),0,Math.PI*2,90,'y');wglow(sx,sy+6,e.r,'#fff6d0',(e.soft?0.2:0.45)*(1-k));wx.globalAlpha=1;}
  else if(e.type==='orbit'||e.type==='excal'||e.type==='kdance'){const p=kPos(e.pid);if(!p)continue;const px=Math.round(p.x)-icx,py=Math.round(p.y)-icy-10;
    if(e.type==='orbit'){for(let n=0;n<4;n++){const q=time*9+n/4*Math.PI*2;const bx=px+Math.cos(q)*30,by=py+Math.sin(q)*18;lineP(wpx,bx,by,bx+Math.cos(q+1.6)*9,by+Math.sin(q+1.6)*5,n%2?'y':'w');wglow(bx,by,8,'#fff6d0',0.25);}}
    else if(e.type==='excal'){wglow(px,py,22,'#fff6d0',0.22+0.08*Math.sin(time*8));if(R()<0.5)part(p.x+rf(-7,7),p.y-rf(4,22),0,0,pick(['w','y','c']),0.6,{z:0,vz:18,glow:true});}
    else{wglow(px,py,34,'#ffffff',0.35);if(R()<0.9)part(p.x+rf(-10,10),p.y-rf(0,24),rf(-20,20),0,pick(['w','y']),0.5,{z:0,vz:20,glow:true});}}
  else if(e.type==='bigsword'){const a=e.a,L=e.len;const prog=Math.min(1,k*3.2);const fade=k>0.55?1-(k-0.55)/0.45:1;const sw=-1.4+2.1*prog;const ang=a+sw*0.5;const sc=0.55+Math.min(0.45,e.h/200);wx.globalAlpha=fade;wglow(sx+Math.cos(a)*L*0.5,sy+Math.sin(a)*L*0.3,L*0.8,'#fff6d0',0.3+e.h/400);
    drawRot(LIGHT_SWORD,sx,sy,ang+Math.PI/2,12,118,sc);if(k>0.25)arcPts(sx,sy,L,a-0.45,a+0.45,80,'w');wx.globalAlpha=1;}
  else if(e.type==='storm'){const r=e.r*Math.min(1,k*2);wx.globalAlpha=1-k;for(let q=0;q<3;q++)arcPts(sx,sy+6,r-q*5,0,Math.PI*2,160,q?'y':'w');for(let n=0;n<12;n++){const q=n/12*Math.PI*2;lineP(wpx,sx,sy,sx+Math.cos(q)*r,sy+Math.sin(q)*r*0.6,n%2?'y':'w');}wglow(sx,sy,r,'#fff6d0',0.5*(1-k));wx.globalAlpha=1;}
  else if(e.type==='spear'){const L=e.len*Math.min(1,k*3),a=e.a;const x2=sx+Math.cos(a)*L,y2=sy+Math.sin(a)*L;wx.globalAlpha=1-Math.max(0,k-0.4)/0.6;for(const [o2,c] of[[0,'w'],[1,'y'],[-1,'c']])lineP(wpx,sx,sy+o2,x2,y2+o2,c);for(let n=0;n<4;n++)lineP(wpx,x2,y2,x2-Math.cos(a+0.5*(n%2?1:-1))*6,y2-Math.sin(a+0.5*(n%2?1:-1))*6,'w');wglow(x2,y2,14,'#fff6d0',0.5);wx.globalAlpha=1;}
  else if(e.type==='dawn'){const d=e.d;wx.save();wx.globalAlpha=Math.min(0.35,t*0.6)*(t>d+0.8?Math.max(0,1-(t-d-0.8)/0.5):1);const g=wx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#ffd35a');g.addColorStop(1,'rgba(255,211,90,0)');wx.fillStyle=g;wx.fillRect(0,0,W,H);wx.restore();
    if(t<d){const kk=t/d;const y=sy-150+kk*kk*150;wx.globalAlpha=0.4;wglow(sx,sy+6,50*kk,'#fff6d0',0.5);arcPts(sx,sy+6,70,0,Math.PI*2,120,'y');wx.globalAlpha=1;drawRot(LIGHT_SWORD,sx,Math.round(y)+6,0,12,118,1.25);}
    else{const kk=(t-d);const a=Math.max(0,1-kk/1.3);wx.globalAlpha=a;drawRot(LIGHT_SWORD,sx,sy+6+Math.min(26,kk*80),0,12,118,1.25);wglow(sx,sy,90,'#ffffff',0.6*a);wx.globalAlpha=1;if(!e.boomed){e.boomed=1;screenFlash=Math.max(screenFlash,0.5);for(let n=0;n<90;n++){const q=R()*Math.PI*2,sp=rf(60,240);part(e.x,e.y,Math.cos(q)*sp,Math.sin(q)*sp*0.6,pick(['w','y','c']),rf(.4,1),{z:rf(2,24),vz:rf(20,90),glow:true});}}}}
  else if(e.type==='kwave'){const r=e.r*Math.min(1,k*1.8);wx.globalAlpha=1-k;arcPts(sx,sy+6,r,0,Math.PI*2,200,'w');arcPts(sx,sy+6,r-3,0,Math.PI*2,200,'y');wglow(sx,sy+6,r*0.4,'#fff6d0',0.3*(1-k));wx.globalAlpha=1;}
  else if(e.type==='kslash'){const x1=e.x1-icx,y1=e.y1-icy,x2=e.x2-icx,y2=e.y2-icy;wx.globalAlpha=1-k;for(const [o2,c] of[[0,'w'],[1,'y'],[-1,'c']])lineP(wpx,x1,y1+o2,x2,y2+o2,c);const mx=(x1+x2)/2,my=(y1+y2)/2;const a=Math.atan2(y2-y1,x2-x1)+Math.PI/2;lineP(wpx,mx-Math.cos(a)*12,my-Math.sin(a)*12,mx+Math.cos(a)*12,my+Math.sin(a)*12,'w');wglow(x2,y2,16,'#fff6d0',0.5*(1-k));wx.globalAlpha=1;}}
  // 빛의 표식이 붙은 적
  for(const [M,sym] of [[STARM,'star'],[CURSEM,'curse']])for(const [id,end] of M){if(time>end){M.delete(id);continue;}const m=G.monsters.get(id);if(!m){continue;}const bx=Math.round(m.dx)-icx,by=Math.round(m.dy)-icy-(isBossTc(m.tc)?58:32);const pl=0.6+0.4*Math.sin(time*6);
    if(sym==='star'){wglow(bx,by,12,'#e6d8ff',0.35*pl);wx.fillStyle='#ffffff';wx.fillRect(bx-1,by-4,2,8);wx.fillRect(bx-4,by-1,8,2);wx.fillStyle='#c9a0e8';wx.fillRect(bx-2,by-2,4,4);wx.fillStyle='#ffffff';wx.fillRect(bx-1,by-1,2,2);}
    else{wglow(bx,by,10,'#9a7ad8',0.3*pl);wx.fillStyle='#3a1e4a';wx.fillRect(bx-3,by-3,6,5);wx.fillStyle='#c9a0e8';wx.fillRect(bx-2,by-2,1,1);wx.fillRect(bx+1,by-2,1,1);wx.fillRect(bx-2,by+1,4,1);if(R()<0.1)part(m.dx+rf(-6,6),m.dy-10,0,-10,pick(['p','P']),0.5,{z:8,glow:true});}}
  for(const [id,end] of MARKS){if(time>end){MARKS.delete(id);continue;}const m=G.monsters.get(id);if(!m)continue;const bx=Math.round(m.dx)-icx,by=Math.round(m.dy)-icy;const boss=isBossTc(m.tc);const yy=by-(boss?52:26);wx.globalAlpha=0.7+0.3*Math.sin(time*6);arcPts(bx,yy,4,0,Math.PI*2,20,'y',1);wpx(bx,yy,'w');lineP(wpx,bx,yy-5,bx,yy+5,'w');lineP(wpx,bx-5,yy,bx+5,yy,'w');wx.globalAlpha=1;}}
function drawHolyGauge(){if(!G.ch||G.ch.cls!=='knight'||!G.mev)return;const v=G.mev[11]|0;const x=182,y=212,w=116,h=4;pr(x-1,y-1,w+2,h+2,PAL.k);pr(x,y,w,h,'#2a2230');pr(x,y,Math.round(w*v/100),h,v>=100?(((time*6)|0)%2?'#ffffff':'#ffd35a'):'#ffd35a');pr(x,y,Math.round(w*v/100),1,'#fff6d0');
  txt(`신성력 ${v}`,x+w/2,y-5,10,v>=100?'#fff6d0':'#d4b870','center');uiRects.push({x,y:y-8,w,h:12,tip:[['신성력','#ffd35a',12],['기본 공격과 스킬로 모이고, 심판의 검이 한 번에 쏟아 낸다','#e6dcc3',11],['100일 때 심판의 검 650%','#9e937a',11]]});}
function ufx(o){o.t0=time;UFX.push(o);return o;}
function onUltFx(o){const k=o.k;
  if(k==='ult'){{const ws=o.id===myId?me:G.players.get(o.id);if(ws)ws._wUlt=time+2.6;}const p=playerPos(o.id);const cls=o.id===myId?myCls():(G.players.get(o.id)||{}).cls||'warrior';UCUT={n:o.n,cls,t0:time,mine:o.id===myId,name:o.id===myId?(G.ch&&G.ch.name):((G.players.get(o.id)||{}).name||'')};screenFlash=Math.max(screenFlash,0.25);shake=Math.max(shake,4);
    if(p)for(let n=0;n<50;n++){const t=R()*Math.PI*2,sp=rf(40,140);part((o.id===myId?me.x:p.dx),(o.id===myId?me.y:p.dy)-8,Math.cos(t)*sp,Math.sin(t)*sp*0.6,pick(['y','w','o']),rf(.4,.9),{z:rf(2,14),vz:rf(20,60),glow:true});}return true;}
  if(k==='rag'){const p=playerPos(o.id);if(p){p.rag={t0:time,ox:o.id===myId?me.x:p.dx,oy:o.id===myId?me.y:p.dy,tx:o.x,ty:o.y};}ufx({type:'ragsword',x:o.x,y:o.y,max:2.2});ufx({type:'tgt',x:o.x,y:o.y,r:60,max:0.95,c:'#ff8a3a'});return true;}
  if(k==='fissure'){ufx({type:'fissure',x:o.x,y:o.y,a:o.a,max:1.2,seed:R()*999});for(let n=0;n<26;n++)part(o.x+rf(-10,10),o.y+rf(-4,4),rf(-20,20),0,pick(['o','y','e','r']),rf(.4,.9),{z:0,vz:rf(40,120),g:-60,glow:true});sfx('boom');return true;}
  if(k==='god'){const p=playerPos(o.id);if(p){p.godEnd=time+o.d;const x=o.id===myId?me.x:p.dx,y=o.id===myId?me.y:p.dy;ufx({type:'godburst',pid:o.id,x,y,max:0.9});ufx({type:'burst',x,y,r:70,max:0.5,cs:['#ffd35a','#ff8a3a','#e0574a']});for(let n=0;n<70;n++){const t=R()*Math.PI*2,sp=rf(40,160);part(x,y-10,Math.cos(t)*sp,Math.sin(t)*sp*0.6,pick(['e','o','r','y']),rf(.4,.9),{z:rf(2,20),vz:rf(20,90),glow:true});}}sfx('shout');return true;}
  if(k==='dome'){ufx({type:'dome',x:o.x,y:o.y,r:o.r,max:o.d});sfx('holy');return true;}
  if(k==='domeburst'){ufx({type:'burst',x:o.x,y:o.y,r:o.r,max:0.6,cs:['#ffffff','#ffe9a8','#ffd35a']});screenFlash=Math.max(screenFlash,0.2);for(let n=0;n<80;n++){const t=R()*Math.PI*2,sp=rf(60,200);part(o.x,o.y-10,Math.cos(t)*sp,Math.sin(t)*sp*0.6,pick(['y','w','g']),rf(.4,1),{z:rf(4,20),vz:rf(20,80),glow:true});}sfx('boom');return true;}
  if(k==='hammer'){ufx({type:'hammer',x:o.x,y:o.y,d:o.d,big:o.big,max:o.d+0.45});ufx({type:'tgt',x:o.x,y:o.y,r:54,max:o.d,c:'#ffe9a8'});return true;}
  if(k==='dcharge'){artOf(`art/dragon${DRAGON_SKIN}.png`);const p=playerPos(o.id);if(p)ufx({type:'dcharge',pid:o.id,max:o.d});sfx('cast');return true;}
  if(k==='sv'){if(SV[o.s])ufx(Object.assign({sd:R()*1000},o,{type:'sv',max:o.d||0.6}));return true;}
  if(k==='ultart'){ufx({type:'ultart',s:o.s,pid:o.pid,mid:o.mid,x:o.x,y:o.y,r:o.r||60,max:o.d||1,spin:o.spin||0,drop:o.drop===1?0.3:(o.drop||0),burst:!!o.burst,ground:!!o.ground,el:o.el|0,sd:R()*1000});return true;}
  if(k==='dragon'){ufx({type:'dragon',x:o.x,y:o.y,a:o.a,len:o.len,sp:o.sp,max:o.len/o.sp+0.75,seed:Math.random()*9});sfx('boss');return true;}
  if(k==='redsky'){ufx({type:'redsky',max:o.d});sfx('boss');return true;}
  if(k==='bigmeteor'){ufx({type:'bigmeteor',x:o.x,y:o.y,max:o.d});return true;}
  if(k==='freeze'){ufx({type:'freeze',x:o.x,y:o.y,r:o.r,ids:o.ids||[],max:o.d,seed:R()*999});sfx('ice');return true;}
  if(k==='shatter'){for(const u of UFX)if(u.type==='freeze')u.max=0;screenFlash=Math.max(screenFlash,0.18);const pts=[[o.x,o.y]];for(const id of o.ids||[]){const m=G.monsters.get(id);if(m)pts.push([m.dx,m.dy]);}
    for(const [x,y] of pts)for(let n=0;n<30;n++){const t=R()*Math.PI*2,sp=rf(40,160);part(x+rf(-6,6),y-6,Math.cos(t)*sp,Math.sin(t)*sp*0.6,pick(['c','w','C']),rf(.4,.9),{z:rf(2,16),vz:rf(30,90),g:-160});}
    for(let n=0;n<14;n++){const t=n/14*Math.PI*2;ufx({type:'shard',x:o.x+Math.cos(t)*o.r*rf(0.2,0.9),y:o.y+Math.sin(t)*o.r*0.6*rf(0.2,0.9),max:0.5});}sfx('ice');return true;}
  if(k==='angel'){const p=playerPos(o.id);if(p)ufx({type:'angel',pid:o.id,max:o.d});sfx('holy');return true;}
  if(k==='dpillar'){ufx({type:'dpillar',x:o.x,y:o.y,d:o.d,max:o.d+0.5});return true;}
  return false;}
// 픽셀 그림들
const RAG_SWORD=pcan(14,74,q=>{for(let j=0;j<60;j++){const w=j<4?j:4;for(let i=7-w;i<=6+w;i++){const e=Math.abs(i-6.5);q(i,j,e<1?'#ffffff':e<2.5?'#ffd35a':e<3.5?'#ff8a3a':'#b3282b');}}for(let i=0;i<14;i++){q(i,60,'#7d5418');q(i,61,'#d49a2a');}for(let j=62;j<72;j++){q(6,j,'#3b281a');q(7,j,'#6b4a2e');}q(6,72,'#d49a2a');q(7,72,'#ffd35a');q(6,73,'#d49a2a');q(7,73,'#d49a2a');});
const HAMMER=pcan(34,44,q=>{for(let j=0;j<16;j++)for(let i=0;i<34;i++){const edge=i<2||i>31||j<2||j>13;q(i,j,edge?'#d49a2a':j<5?'#ffffff':j<11?'#ffe9a8':'#ffd35a');}for(let i=6;i<28;i+=7){q(i,7,'#d49a2a');q(i+1,8,'#d49a2a');}for(let j=16;j<44;j++){q(16,j,'#7d5418');q(17,j,'#d49a2a');}for(let i=13;i<21;i++){q(i,17,'#ffd35a');q(i,42,'#ffd35a');}});
function mkAngel(fl){return pcan(72,56,q=>{const cx=36;const inE=(x,y,ex,ey,a,b,ang)=>{const c=Math.cos(ang),sn=Math.sin(ang);const dx=x-ex,dy=y-ey;const u=dx*c+dy*sn,v=-dx*sn+dy*c;return (u*u)/(a*a)+(v*v)/(b*b);};
  for(let j=0;j<56;j++)for(let i=0;i<72;i++){const x=i-cx;const ax=Math.abs(x);if(ax<4)continue;let best=9;for(let f=0;f<6;f++){const ex=6+f*3.6+fl*f,ey=20-f*3+f*f*0.55-fl*6,ang=-0.75+f*0.3+fl*0.4;const e=inE(ax,j,ex+7,ey,12+f*1.4,3.4,ang);if(e<best)best=e;}
    if(best<=1)q(i,j,best>0.72?'#d49a2a':best>0.5?'#e6dcc3':(j>26?'#f2eadb':'#ffffff'));}
  for(let a=0;a<60;a++){const t=a/60*Math.PI*2;q(cx+Math.cos(t)*7,5+Math.sin(t)*2,'#ffd35a');q(cx+Math.cos(t)*6,5+Math.sin(t)*1.5,'#fff6d0');}
  for(let j=9;j<17;j++)for(let i=-3;i<=3;i++)if(i*i+(j-13)*(j-13)<=10)q(cx+i,j,j<11?'#ffd35a':'#f2dcc0');q(cx-1,13,'#5a4a3a');q(cx+1,13,'#5a4a3a');
  for(let j=17;j<54;j++){const hw=3+(j-17)*0.3;for(let i=-hw;i<=hw;i++)q(cx+i,j,Math.abs(i)<1.2?'#ffe9a8':i<-hw+1.5?'#cdc6d2':i>hw-1.2?'#e6dcc3':'#ffffff');}for(let i=-14;i<=14;i++)q(cx+i,54,'#ffd35a');for(let j=24;j<34;j++){q(cx-5-((j-24)>>2),j,'#ffd35a');q(cx+5+((j-24)>>2),j,'#ffd35a');}});}
const ANGEL_F=[mkAngel(0),mkAngel(1)];
let DRAGON_SKIN=1;
/* 역동적인 이미지 용: 활에서 튀어나오며 커지고, 몸통 전체에 흐르는 파동 · 잔상 · 발광 맥동 · 비늘 불꽃 · 속도선 · 끝에서 흩어짐 */
function dragonBodyPts(e,dist,tt,BL,sc){const ca=Math.cos(e.a),sa=Math.sin(e.a);const M=56,out=[];
  for(let n=0;n<=M;n++){const u=n/M;const s1=dist-BL*(1-u);const amp=(15-u*9)*sc;const w=Math.sin(s1*0.05-tt*11+e.seed)*amp+Math.sin(tt*6+e.seed)*4*u*sc;out.push([e.x+ca*s1-sa*w,e.y+sa*s1+ca*w,s1]);}return out;}
function drawDragonStrips(img,P,bh,icx,icy,alpha,comp){const iw=img.width,ih=img.height,M=P.length-1;wx.save();wx.globalAlpha=alpha;if(comp)wx.globalCompositeOperation=comp;wx.imageSmoothingEnabled=true;
  for(let n=0;n<M;n++){const A=P[n],B=P[n+1];if(B[2]<=0)continue;let ax=A[0],ay=A[1],f0=0;if(A[2]<0){f0=-A[2]/(B[2]-A[2]);ax=A[0]+(B[0]-A[0])*f0;ay=A[1]+(B[1]-A[1])*f0;}
    const ang=Math.atan2(B[1]-ay,B[0]-ax),seg=Math.hypot(B[0]-ax,B[1]-ay);const sx=(n+f0)/M*iw,sw=(1-f0)/M*iw;
    const taper=0.55+0.45*Math.min(1,n/(M*0.35));wx.save();wx.translate(ax-icx,ay-icy);wx.rotate(ang);wx.drawImage(img,sx,0,Math.max(0.5,sw),ih,0,-bh*taper/2,seg+0.9,bh*taper);wx.restore();}
  wx.restore();}
function drawDragonImg(e,img,t,icx,icy){const T=e.len/e.sp;const ca=Math.cos(e.a),sa=Math.sin(e.a);
  const dist=e.sp*t+22*(1-Math.exp(-t*10));/* 발사 순간 튀어나가는 가속 */
  const grow=Math.min(1,0.3+t*4.5),out=t>T?Math.min(1,(t-T)/0.6):0;const fade=1-out;if(fade<=0)return;
  const BL=180*grow*(1+out*0.25),bh=BL*img.height/img.width*(1+0.05*Math.sin(t*30));
  // 발사 충격파
  if(t<0.35){const k=t/0.35;const ox=e.x-icx,oy=e.y-icy;wglow(ox,oy,70*(1-k)+10,'#dfffc0',0.7*(1-k));wx.save();wx.globalAlpha=(1-k)*0.9;wx.strokeStyle='#bff5a0';wx.lineWidth=3*(1-k)+1;wx.beginPath();wx.ellipse(ox,oy,10+k*70,(10+k*70)*0.55,e.a,0,Math.PI*2);wx.stroke();wx.strokeStyle='#ffe9a0';wx.lineWidth=1;wx.beginPath();wx.ellipse(ox,oy,6+k*44,(6+k*44)*0.55,e.a,0,Math.PI*2);wx.stroke();wx.restore();}
  // 속도선
  wx.save();wx.globalCompositeOperation='lighter';for(let q=0;q<7;q++){const off=((q*37+Math.floor(t*40)*13)%60)-30,back=dist-20-((q*53)%150);if(back<0)continue;const L2=26+(q%3)*14;const bx=e.x+ca*back-sa*off-icx,by=e.y+sa*back+ca*off-icy;wx.globalAlpha=0.35*fade;wx.strokeStyle=q%2?'#eaffd8':'#9fe8b0';wx.lineWidth=1;wx.beginPath();wx.moveTo(bx,by);wx.lineTo(bx-ca*L2,by-sa*L2);wx.stroke();}wx.restore();
  // 잔상 2겹 → 본체 → 발광 맥동
  for(const[dt2,al]of[[0.09,0.16],[0.045,0.3]]){const tt=Math.max(0,t-dt2);const d2=e.sp*tt+22*(1-Math.exp(-tt*10));drawDragonStrips(img,dragonBodyPts(e,d2,tt,BL,grow),bh,icx,icy,al*fade,'lighter');}
  const P=dragonBodyPts(e,dist,t,BL,grow);
  for(let n=0;n<P.length;n+=6){if(P[n][2]<0)continue;wglow(P[n][0]-icx,P[n][1]-icy,bh*0.75,'#7be89a',0.09*fade);}
  drawDragonStrips(img,P,bh,icx,icy,fade,null);
  drawDragonStrips(img,P,bh,icx,icy,(0.18+0.14*Math.sin(t*22))*fade,'lighter');
  // 머리 앞 기운 · 입김
  const H=P[P.length-1],H2=P[P.length-4];const ha=Math.atan2(H[1]-H2[1],H[0]-H2[0]);wglow(H[0]-icx+Math.cos(ha)*6,H[1]-icy+Math.sin(ha)*6,22,'#fff6c8',0.28*fade);
  // 비늘 불꽃·꼬리 흔적 (게임 속도와 무관하게 프레임당)
  if(fade>0.2){for(let q=0;q<3;q++){const n=Math.floor(R()*P.length);const Q=P[n];if(Q[2]<0)continue;const nx=-Math.sin(ha),ny=Math.cos(ha);const sd=R()<0.5?-1:1;part(Q[0]+nx*sd*bh*0.3,Q[1]+ny*sd*bh*0.3,nx*sd*rf(20,60)-ca*rf(20,70),ny*sd*rf(20,60)-sa*rf(20,70),pick(['y','o','z','w']),rf(.25,.55),{z:0,glow:true});}
    const Tl=P[0];if(Tl[2]>0)for(let q=0;q<2;q++)part(Tl[0]+rf(-4,4),Tl[1]+rf(-4,4),-ca*rf(10,40)+rf(-15,15),-sa*rf(10,40)+rf(-15,15),pick(['z','Z','y']),rf(.4,.8),{z:0,glow:true});}
  // 끝: 흩어지며 사라짐
  if(out>0&&out<0.9){for(let q=0;q<5;q++){const Q=P[Math.floor(R()*P.length)];part(Q[0]+rf(-6,6),Q[1]+rf(-6,6),rf(-70,70)+ca*40,rf(-70,70)+sa*40,pick(['z','y','w','o']),rf(.3,.7),{z:rf(0,6),vz:rf(20,60),glow:true});}}}/* 용의 화살 이미지 번호 (art/dragonN.png) */
const DRAGON_HEAD=pcan(52,36,q=>{const E=(x,y,cx,cy,a,b)=>((x-cx)/a)**2+((y-cy)/b)**2;
  for(let j=0;j<36;j++)for(let i=0;i<52;i++){const skull=E(i,j,20,15,14,9),snout=E(i,j,36,17,13,5.5),jaw=E(i,j,32,24,15,4);
    if(skull<=1||snout<=1){const top=j<13;q(i,j,skull>0.8&&snout>0.8?'#1f5a3a':top?'#6fd08a':j<18?'#3fa86a':'#2f8a5a');}else if(jaw<=1&&i>18)q(i,j,j<25?'#2f8a5a':'#1f5a3a');}
  for(let i=24;i<48;i+=3){q(i,21,'#ffffff');q(i+1,22,'#e6dcc3');}for(let i=22;i<44;i+=4){q(i,23,'#ffffff');}for(let i=26;i<48;i++)q(i,22,'#8a1a1a');
  for(const[a,b]of[[26,10],[27,10],[28,10],[26,11],[27,11],[28,11],[29,11],[27,12],[28,12]])q(a,b,'#fff6a0');q(28,11,'#ff2a1a');q(27,11,'#ff4a3a');for(let i=24;i<31;i++)q(i,9,'#1f5a3a');
  for(let k=0;k<20;k++){const y=9-k*0.5+k*k*0.012;q(15-k,y,'#fff6a0');q(16-k,y,'#ffd35a');q(15-k,y+1,'#d49a2a');}for(let k=0;k<15;k++){const y=7-k*0.75+k*k*0.02;q(20-k*0.8,y,'#fff6a0');q(21-k*0.8,y,'#ffd35a');q(20-k*0.8,y+1,'#d49a2a');}
  for(let k=0;k<14;k++){q(44+k*0.6,19+Math.sin(k*0.6)*2+k*0.3,'#ffe9a8');q(42+k*0.5,25+Math.sin(k*0.7+1)*2+k*0.4,'#ffd35a');}
  for(let j=6;j<30;j+=2){const L=4+((j*7)%5);for(let k=0;k<L;k++)q(6-k,j+(k>>1),k<2?'#ffd35a':k<4?'#ff8a3a':'#e0574a');}
  for(let i=10;i<34;i+=4){q(i,6+((i*3)%3),'#8fe0a8');}});
function wline(x0,y0,x1,y1,c){lineP(wpx,x0,y0,x1,y1,c);}
function wglow(x,y,r,c,a){if(r<=0||a<=0)return;wx.save();wx.globalCompositeOperation='lighter';const g=wx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,c);g.addColorStop(1,'rgba(0,0,0,0)');wx.globalAlpha=Math.min(1,a*1.6);wx.fillStyle=g;wx.beginPath();wx.ellipse(x,y,r,r*0.6,0,0,Math.PI*2);wx.fill();wx.restore();}
function drawRot(img,x,y,a,ax,ay,sc){wx.save();wx.translate(x,y);wx.rotate(a);if(sc)wx.scale(sc,sc);wx.drawImage(img,-ax,-ay);wx.restore();}
// ===== 궁극기 절차 이펙트 (그림 한 장 회전 방식 폐지) : 등장 → 유지 → 소멸 =====
function uvH(i){const s=Math.sin(i*127.1+311.7)*43758.5453;return s-Math.floor(s);}
function uvEase(k){k=Math.max(0,Math.min(1,k));return 1-Math.pow(1-k,3);}
function uvEnv(t,T,a,b){return Math.max(0,Math.min(1,t/a,(T-t)/b));}
function uvPx(x,y,c,a,sz){if(a<=0)return;wx.globalAlpha=Math.min(1,a);wx.fillStyle=c;wx.fillRect(Math.round(x),Math.round(y),sz||1,sz||1);}
/* 점선 타원: p=그려진 비율(0~1), rot=시작각, step=점 간격 */
function uvRing(cx,cy,r,c,a,sq,p,rot,step,sz){if(r<1||a<=0)return;wx.globalAlpha=Math.min(1,a);wx.fillStyle=c;const n=Math.max(16,Math.round(r*2*Math.PI/(step||1.5)));const m=Math.round(n*(p==null?1:Math.max(0,Math.min(1,p))));const s2=sz||1;for(let i=0;i<m;i++){const q=(rot||0)+i/n*Math.PI*2;wx.fillRect(Math.round(cx+Math.cos(q)*r),Math.round(cy+Math.sin(q)*r*sq),s2,s2);}}
function uvLine(x0,y0,x1,y1,c,a,p){if(a<=0)return;p=p==null?1:p;x1=x0+(x1-x0)*p;y1=y0+(y1-y0)*p;wx.globalAlpha=Math.min(1,a);lineP(wpx,x0,y0,x1,y1,c);}
function uvAdd(){wx.globalCompositeOperation='lighter';}
function uvNorm(){wx.globalCompositeOperation='source-over';}
function uvGlow(x,y,r,c,a,sq){if(r<=0||a<=0)return;uvAdd();const g=wx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,c);g.addColorStop(1,'rgba(0,0,0,0)');wx.globalAlpha=Math.min(1,a);wx.fillStyle=g;wx.beginPath();wx.ellipse(x,y,r,r*(sq||0.6),0,0,Math.PI*2);wx.fill();uvNorm();}
/* 빛기둥: 아래가 밝고 위로 사라짐 */
function uvPillar(x,y,w,h,c,a){if(h<=0||a<=0)return;uvAdd();const g=wx.createLinearGradient(0,y-h,0,y);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(0.7,c);g.addColorStop(1,'#ffffff');wx.globalAlpha=Math.min(1,a);wx.fillStyle=g;wx.fillRect(Math.round(x-w/2),Math.round(y-h),Math.max(1,Math.round(w)),Math.round(h));uvNorm();}
/* 충격파: 두께 있는 점 고리 */
function uvBand(cx,cy,r,w,c,a,sq){if(r<=1||a<=0)return;wx.save();wx.translate(cx,cy);wx.scale(1,sq);uvAdd();const ro=r+w*0.35,r0=Math.max(0,r-w);const g=wx.createRadialGradient(0,0,r0,0,0,ro);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(0.72,c);g.addColorStop(1,'rgba(0,0,0,0)');wx.globalAlpha=Math.min(1,a);wx.fillStyle=g;wx.beginPath();wx.arc(0,0,ro,0,Math.PI*2);wx.fill();wx.restore();}
/* 불꽃 혀: 아래 밝고 위로 가늘어짐, 흔들림 */
function uvFlame(x,y,h,w,cs,a,t,i){if(h<1||a<=0)return;uvAdd();for(let j=0;j<h;j++){const f=j/h;const ww=Math.max(1,Math.round(w*(1-f*0.85)));const sw=Math.round(Math.sin(t*8+i*1.3+j*0.45)*f*2);wx.globalAlpha=Math.min(1,a*(1-f*0.6));wx.fillStyle=f<0.2?cs[0]:f<0.55?cs[1]:cs[2];wx.fillRect(Math.round(x-ww/2+sw),Math.round(y-j),ww,1);}uvNorm();}
function uvWave(cx,cy,r,cs,a,sq){uvBand(cx,cy,r,Math.max(6,r*0.14),cs[Math.min(1,cs.length-1)],a*0.75,sq);for(let j=0;j<cs.length;j++)uvRing(cx,cy,r-j*3,cs[j],a*(1-j*0.25),sq,1,0,1.6,2);}
/* 바닥 마법진: 이중 고리 + 룬 눈금 + 다각 별, p로 그려짐 */
function uvSigil(cx,cy,R,c,c2,a,sq,p,rot,pts){uvRing(cx,cy,R,c,a,sq,p,rot,1.2);uvRing(cx,cy,R*0.9,c2,a*0.8,sq,p,-rot,2.4);uvRing(cx,cy,R*0.5,c,a*0.7,sq,p,rot*1.5,1.6);
  const tk=Math.round(R/4);for(let i=0;i<tk*p;i++){const q=rot+i/tk*Math.PI*2;uvLine(cx+Math.cos(q)*R*0.9,cy+Math.sin(q)*R*0.9*sq,cx+Math.cos(q)*R,cy+Math.sin(q)*R*sq,c2,a*0.8);}
  if(pts){const n=pts;const step=n===6?2:2;const V=[];for(let i=0;i<n;i++){const q=rot*-0.6+i/n*Math.PI*2-Math.PI/2;V.push([cx+Math.cos(q)*R*0.88,cy+Math.sin(q)*R*0.88*sq]);}
    for(let i=0;i<n;i++){const A=V[i],B=V[(i+step)%n];const lp=Math.max(0,Math.min(1,p*n-i*0.5));uvLine(A[0],A[1],B[0],B[1],c,a*0.75,Math.min(1,lp));}}}
function uvOnce(e,k,f){e._o=e._o||{};if(!e._o[k]){e._o[k]=1;f();}}

const ULTV={
  // 혈월 강림: 머리 위로 떠오르는 핏빛 달 + 발밑 핏빛 고리 + 피 안개
  redmoon(e,t,px,py,sx,sy){const T=e.max,a=uvEnv(t,T,0.4,0.8);const rise=uvEase(t/0.6);const my=sy-16-38*rise,mr=4+11*rise;const br=0.85+0.15*Math.sin(t*2.2);
    uvGlow(sx,sy-20,70,'#7a0a14',0.35*a*br,0.9);uvBand(sx,sy,36*rise,8,'#ff2a3a',0.5*a*br,0.42);
    uvGlow(sx,my,44*rise,'#ff2a3a',0.45*a*br,1);
    uvAdd();const g=wx.createRadialGradient(sx-3,my-3,0,sx,my,mr);g.addColorStop(0,'#ffd0c0');g.addColorStop(0.4,'#ff3a4a');g.addColorStop(1,'#4a0610');wx.globalAlpha=a;wx.fillStyle=g;wx.beginPath();wx.arc(sx,my,mr,0,Math.PI*2);wx.fill();uvNorm();
    for(let i=0;i<7;i++){const q=uvH(i+3)*6.28,d=uvH(i+9)*mr*0.65;uvPx(sx+Math.cos(q)*d,my+Math.sin(q)*d,'#6a0a14',a*0.7*rise,i%3?1:2);}
    uvRing(sx,sy,34,'#ff5a5a',0.6*a*br,0.42,uvEase(t/0.5),t*0.25,1.2);uvRing(sx,sy,40,'#7a0a14',0.5*a,0.42,uvEase(t/0.7),-t*0.2,2.4);
    const fl=[];for(let i=0;i<14;i++){const q=i/14*6.28;fl.push([sx+Math.cos(q)*14,sy+Math.sin(q)*6,i]);}fl.sort((p,q)=>p[1]-q[1]);
    for(const [x,y,i] of fl){const h=(10+8*(0.5+0.5*Math.sin(t*7+i*2.1)))*rise;uvFlame(x,y,h,3,['#ffb0a0','#ff3a4a','#7a0a14'],0.55*a,t,i);}
    for(let j=0;j<2;j++)for(let n=0;n<14;n++){const u=((t*0.9+n/14)%1),q=u*9+j*Math.PI+t*2,rr=16-u*6;uvPx(sx+Math.cos(q)*rr,sy-u*46+Math.sin(q)*rr*0.4,u<0.5?'#ff5a5a':'#b3282b',a*(1-u)*rise,2);}
    if(a>0.2&&R()<0.6){const q=R()*6.28;part(px+Math.cos(q)*34,py+Math.sin(q)*14,0,0,pick(['#ff3a4a','#b3282b','#ff8a7a']),rf(0.6,1.1),{z:1,vz:rf(14,30),glow:true});}},

  // 만검 귀일: 궤도를 도는 영검 10자루(잔상) + 마지막에 바깥으로 흩어짐
  thousandcuts(e,t,px,py,sx,sy){const T=e.max,a=uvEnv(t,T,0.25,0.35);const out=t>T-0.4?(t-(T-0.4))/0.4:0;uvGlow(sx,sy-8,40,'#bfe3ff',0.3*a,0.7);
    uvRing(sx,sy,62,'#bfe3ff',0.35*a,0.5,uvEase(t/0.4),t*0.6,2);
    for(let i=0;i<10;i++){const r0=(26+uvH(i)*26)*(1+out*1.6)*uvEase(t/0.3),h=6+uvH(i+20)*10;for(let j=4;j>=0;j--){const q=i/10*6.28+t*7-j*0.13;const x=sx+Math.cos(q)*r0,y=sy-h+Math.sin(q)*r0*0.5;const tx=-Math.sin(q),ty=Math.cos(q)*0.5;const L=14;
      const al=a*(j===0?1:0.35-j*0.06);uvAdd();uvLine(x,y,x-tx*L,y-ty*L,j===0?'#bfe3ff':'#5a8fc8',al);if(j===0){uvPx(x,y,'#ffffff',al,1);uvLine(x-tx*(L-2)-ty*2,y-ty*(L-2)+tx*2,x-tx*(L-2)+ty*2,y-ty*(L-2)-tx*2,'#e6f4ff',al);}uvNorm();}}
    if(a>0.3&&R()<0.6){const q=R()*6.28,d=rf(10,55);part(px+Math.cos(q)*d,py+Math.sin(q)*d*0.5,0,0,pick(['#ffffff','#bfe3ff']),rf(0.2,0.4),{z:rf(4,16),glow:true});}},

  // 불괴의 성채: 바닥 방벽진 + 둘레에서 솟는 얼음 결정 벽
  fortress(e,t,px,py,sx,sy){const T=e.max,a=uvEnv(t,T,0.3,0.8),R0=e.r;const rise=uvEase((t-0.1)/0.45)*(t>T-0.6?Math.max(0,(T-t)/0.6):1);
    uvSigil(sx,sy,R0,'#8fd0ff','#3a6fb8',0.6*a,0.5,uvEase(t/0.6),t*0.04,0);
    const N=16;const segs=[];for(let i=0;i<N;i++){const q=i/N*6.28+0.2;segs.push([q,sx+Math.cos(q)*R0*0.97,sy+Math.sin(q)*R0*0.97*0.5]);}
    segs.sort((p,q)=>p[2]-q[2]);
    for(const [q,x,y] of segs){const h=(14+uvH(q*7)*8)*rise;if(h<1)continue;uvAdd();wx.globalAlpha=0.55*a;wx.fillStyle='#3a6fb8';wx.fillRect(Math.round(x-2),Math.round(y-h),4,Math.round(h));wx.globalAlpha=0.8*a;wx.fillStyle='#8fd0ff';wx.fillRect(Math.round(x-1),Math.round(y-h),2,Math.round(h));uvNorm();uvPx(x-1,y-h-1,'#ffffff',a,2);}
    if(a>0.3&&R()<0.35){const q=R()*6.28;part(px+Math.cos(q)*R0*0.97,py+Math.sin(q)*R0*0.48,0,0,pick(['#ffffff','#8fd0ff']),rf(0.4,0.8),{z:rf(2,18),vz:rf(4,12),glow:true});}},

  // 최후의 대심판: 낙하 지점에 금빛 심판진 → 착탄 순간 십자 섬광·빛기둥·충격파
  finaljudge(e,t,px,py,sx,sy){const gy=sy+30,T=e.max,D=e.drop||0.3,big=e.r>50;const R0=big?52:40;
    if(t<D){const k=t/D;uvSigil(sx,gy,R0,'#ffd35a','#d49a2a',0.7,0.5,uvEase(k*1.3),k*0.6,4);uvGlow(sx,gy,R0*k,'#ffe9a8',0.25,0.5);return;}
    const k=(t-D)/(T-D),a=1-k;uvOnce(e,'hit',()=>{for(let i=0;i<(big?40:24);i++){const q=R()*6.28,v=rf(40,120);part(px+Math.cos(q)*6,py+30+Math.sin(q)*3,Math.cos(q)*v,Math.sin(q)*v*0.5,pick(['#ffffff','#ffd35a','#ffe9a8']),rf(0.4,0.8),{z:rf(2,10),vz:rf(20,70),g:-160,glow:true});}});
    uvSigil(sx,gy,R0,'#ffd35a','#d49a2a',0.7*a,0.5,1,0.6,4);
    uvPillar(sx,gy,(big?16:11)*(1-k*0.7),150,'#ffd35a',a*1.1);
    const cl=(big?70:50)*uvEase(k*3);uvAdd();wx.globalAlpha=a;wx.fillStyle='#ffffff';wx.fillRect(Math.round(sx-cl),gy-1,Math.round(cl*2),2);wx.fillRect(sx-1,Math.round(gy-cl*0.7),2,Math.round(cl*1.4));uvNorm();
    uvWave(sx,gy,R0*1.5*uvEase(k*1.4),['#ffffff','#ffd35a','#d49a2a'],a,0.5);uvGlow(sx,gy,R0*1.2,'#ffe9a8',0.5*a,0.5);},

  // 천리안 사격: 조준선이 좁혀지며 45° 돌아 고정, 빨간 점 점멸이 빨라지다 확정 섬광
  deadeye(e,t,px,py,sx,sy){const T=e.max,a=uvEnv(t,T,0.15,0.25),k=uvEase(t/0.7);const d=26-14*k,rot=k*Math.PI/4,c=t>T-0.45?'#ff4a3a':'#ffd35a';
    for(let i=0;i<4;i++){const q=rot+i*Math.PI/2+Math.PI/4,cx=sx+Math.cos(q)*d,cy=sy+Math.sin(q)*d,ux=Math.cos(q+Math.PI*0.75)*5,uy=Math.sin(q+Math.PI*0.75)*5,vx=Math.cos(q-Math.PI*0.75)*5,vy=Math.sin(q-Math.PI*0.75)*5;
      uvLine(cx,cy,cx+ux,cy+uy,c,a);uvLine(cx,cy,cx+vx,cy+vy,c,a);}
    uvRing(sx,sy,d*0.7,c,0.45*a,1,uvEase(t/0.5),rot,2.5);
    const bl=Math.sin(t*(8+t*14))>0;if(bl||t>T-0.3)uvPx(sx-1,sy-1,'#ff2a2a',a,2);
    uvLine(sx-d-6,sy,sx-d+2,sy,c,0.6*a);uvLine(sx+d-2,sy,sx+d+6,sy,c,0.6*a);uvLine(sx,sy-d-6,sx,sy-d+2,c,0.6*a);uvLine(sx,sy+d-2,sx,sy+d+6,c,0.6*a);
    if(t>T-0.3){const f=(t-(T-0.3))/0.3;uvGlow(sx,sy,10+20*f,'#ffffff',0.6*(1-f),1);}},

  // 왕의 사냥터: 초록 룬 고리 + 둘레에서 솟는 가시 덩굴 + 떨어지는 잎
  killzone(e,t,px,py,sx,sy){const T=e.max,a=uvEnv(t,T,0.3,0.5),R0=e.r;uvGlow(sx,sy,R0,'#3f5a2c',0.35*a,0.62);
    uvSigil(sx,sy,R0*0.8,'#9be06a','#3f7a2c',0.65*a,0.62,uvEase(t/0.5),-t*0.05,5);
    const N=20;for(let i=0;i<N;i++){const q=i/N*6.28+uvH(i)*0.2,x=sx+Math.cos(q)*R0*0.8,y=sy+Math.sin(q)*R0*0.8*0.62;const st=0.15+uvH(i+40)*0.25;const h=12*uvEase((t-st)/0.25)*(t>T-0.5?Math.max(0,(T-t)/0.5):1)*(0.7+uvH(i+5)*0.6);
      for(let j=0;j<h;j++){const w=Math.max(0,Math.round((1-j/h)*2));wx.globalAlpha=a;wx.fillStyle=j>h-3?'#c8f08a':j>h*0.5?'#7ab84a':'#2f6b2a';wx.fillRect(Math.round(x-w+Math.sin(j*0.4+i)*0.8),Math.round(y-j),w*2+1,1);}}
    if(a>0.3&&R()<0.3){const q=R()*6.28,d=R()*R0*0.8;part(px+Math.cos(q)*d,py+Math.sin(q)*d*0.62,rf(-8,8),0,pick(['#9be06a','#c8f08a','#5a8a3a']),rf(1,1.6),{z:rf(30,50),vz:rf(-16,-8),glow:false});}},

  // 원소 대재앙: el 0 화염 · 1 빙결 · 2 번개 — 한 번에 터지는 충격파 + 원소별 방사
  cataclysm(e,t,px,py,sx,sy){const T=e.max,k=t/T,a=1-k,R0=e.r,el=e.el%3;const P=[['#ffffff','#ffd35a','#ff4a3a','#8a1a10'],['#ffffff','#bfe3ff','#3a6fb8','#1a3060'],['#ffffff','#fff2b0','#c9a0e8','#5a3a8a']][el];const re=uvEase(k*1.6);
    uvGlow(sx,sy-6,40+30*k,P[1],0.8*a*a,0.8);uvWave(sx,sy,R0*re,[P[0],P[1],P[2]],a,0.55);uvWave(sx,sy,R0*0.6*uvEase(k*2.2),[P[1],P[2]],a*0.7,0.55);
    uvOnce(e,'p',()=>{for(let i=0;i<46;i++){const q=R()*6.28,v=rf(60,180);part(px+Math.cos(q)*8,py+Math.sin(q)*4,Math.cos(q)*v,Math.sin(q)*v*0.55,pick(P.slice(0,3)),rf(0.4,0.9),{z:rf(2,14),vz:el===0?rf(10,50):rf(-5,20),glow:true});}});
    const N=18;uvAdd();for(let i=0;i<N;i++){const q=i/N*6.28+uvH(i+e.sd)*0.3;const r1=R0*re*0.25,r2=R0*re*(0.7+uvH(i+e.sd+7)*0.3);const c=i%3===0?P[0]:P[1];
      if(el===0){for(let j=0;j<4;j++){const rr=r1+(r2-r1)*(0.2+j*0.25);uvGlow(sx+Math.cos(q)*rr,sy+Math.sin(q)*rr*0.55-j*2,7-j,j<2?P[1]:P[2],a*0.9,0.8);}uvLine(sx+Math.cos(q)*r1,sy+Math.sin(q)*r1*0.55,sx+Math.cos(q)*r2,sy+Math.sin(q)*r2*0.55-4,P[2],a*0.8);}
      else if(el===1){const x2=sx+Math.cos(q)*r2,y2=sy+Math.sin(q)*r2*0.55;uvLine(sx+Math.cos(q)*r1,sy+Math.sin(q)*r1*0.55,x2,y2,P[1],a*0.9);uvLine(x2,y2,x2+Math.cos(q+0.5)*-5,y2+Math.sin(q+0.5)*-3,P[0],a);uvLine(x2,y2,x2+Math.cos(q-0.5)*-5,y2+Math.sin(q-0.5)*-3,P[0],a);uvPx(x2,y2,'#ffffff',a,2);}
      else if(i%2===0){let x=sx,y=sy-4;const sg=6,fr=Math.floor(t*24);for(let j=1;j<=sg;j++){const rr=r2*j/sg;const nx=sx+Math.cos(q)*rr+(uvH(i*9+j+fr)-0.5)*10,ny=sy+Math.sin(q)*rr*0.55+(uvH(i*7+j+fr+3)-0.5)*7;uvLine(x,y,nx,ny,j<3?'#ffffff':P[1],a);x=nx;y=ny;}}}
    uvNorm();uvGlow(sx,sy,R0*0.8*re,P[2],0.3*a,0.55);uvRing(sx,sy,R0*0.95*re,P[3],0.35*a,0.55,1,0,3,2);},

  // 초신성 붕괴: 안으로 수축 → 폭발(코어·이중 충격파·빛살·별빛)
  supernova(e,t,px,py,sx,sy){const T=e.max,R0=e.r,cy=sy-10;const C=0.22;
    if(t<C){const k=t/C;const r=26*(1-k)+5;uvGlow(sx,cy,r*2.4,'#c9a0ff',0.7,1);uvAdd();wx.globalAlpha=1;wx.fillStyle='#ffffff';wx.beginPath();wx.arc(sx,cy,r*0.6,0,Math.PI*2);wx.fill();uvNorm();uvRing(sx,cy,r*2,'#e6d8ff',0.8,1,1,t*3,2,1);
      uvOnce(e,'in',()=>{for(let i=0;i<36;i++){const q=R()*6.28,d=rf(60,110);part(px+Math.cos(q)*d,py-10+Math.sin(q)*d*0.6,-Math.cos(q)*d*4,-Math.sin(q)*d*2.4,pick(['#ffffff','#c9a0ff','#8fd0ff']),0.22,{glow:true});}});return;}
    const k=(t-C)/(T-C),a=1-k;uvOnce(e,'out',()=>{for(let i=0;i<60;i++){const q=R()*6.28,v=rf(60,220);part(px+Math.cos(q)*4,py-10+Math.sin(q)*2,Math.cos(q)*v,Math.sin(q)*v*0.6,pick(['#ffffff','#e6d8ff','#8fd0ff','#c9a0ff']),rf(0.5,1.1),{glow:true});}});
    const cr=8+50*uvEase(k*2);uvGlow(sx,cy,cr*2.2,'#b07aff',0.9*a,0.9);uvAdd();wx.globalAlpha=a;wx.fillStyle='#ffffff';wx.beginPath();wx.ellipse(sx,cy,cr*0.7*(1-k*0.6),cr*0.6*(1-k*0.6),0,0,Math.PI*2);wx.fill();
    for(let i=0;i<14;i++){const q=i/14*6.28+0.25*k+uvH(i)*0.2,L=R0*(0.6+uvH(i+3)*0.6)*uvEase(k*1.8),w=0.025;wx.globalAlpha=0.55*a;wx.fillStyle=i%2?'#e6d8ff':'#8fd0ff';wx.beginPath();wx.moveTo(sx,cy);wx.lineTo(sx+Math.cos(q-w)*L,cy+Math.sin(q-w)*L*0.7);wx.lineTo(sx+Math.cos(q+w)*L,cy+Math.sin(q+w)*L*0.7);wx.fill();}uvNorm();
    uvWave(sx,sy,R0*uvEase(k*1.3),['#ffffff','#e6d8ff','#8fd0ff'],a,0.55);uvWave(sx,sy,R0*0.65*uvEase(k*1.8),['#c9a0ff','#7a5acf'],a*0.8,0.55);
    for(let i=0;i<10;i++){const q=uvH(i+e.sd)*6.28,d=R0*(0.3+uvH(i+e.sd+1)*0.6)*uvEase(k*1.5),x=sx+Math.cos(q)*d,y=cy+Math.sin(q)*d*0.6,s=2+Math.round(2*Math.sin(t*20+i)>0?1:0);uvAdd();uvLine(x-s,y,x+s,y,'#ffffff',a);uvLine(x,y-s,x,y+s,'#ffffff',a);uvNorm();}},

  // 성자의 성역: 금빛 성역진이 그려지고 둘레 빛기둥 6개, 빛 입자가 피어오름
  sanctum(e,t,px,py,sx,sy){const T=e.max,a=uvEnv(t,T,0.5,0.9),R0=e.r,sq=0.55,br=0.85+0.15*Math.sin(t*1.8),p=uvEase(t/0.7);const rot=t*0.05;
    uvGlow(sx,sy,R0*1.05,'#ffd35a',0.22*a*br,sq);uvGlow(sx,sy,R0*0.45,'#fff2c0',0.25*a*br,sq);
    uvSigil(sx,sy,R0,'#ffe9a8','#d49a2a',0.75*a,sq,p,rot,6);
    for(let i=0;i<6;i++){const q=rot*-0.6+i/6*6.28-Math.PI/2,x=sx+Math.cos(q)*R0*0.88,y=sy+Math.sin(q)*R0*0.88*sq;const h=(46+6*Math.sin(t*2+i))*uvEase((t-0.35-i*0.06)/0.5);uvPillar(x,y,3,h,'#ffe9a8',0.6*a);uvGlow(x,y,8,'#ffffff',0.35*a,0.5);}
    if(t<1.1){const k=t/1.1;uvPillar(sx,sy,24*(1-k)+4,180,'#fff2c0',(1-k)*0.9);}
    if(a>0.2&&R()<0.7){const q=R()*6.28,d=Math.sqrt(R())*R0*0.95;part(px+Math.cos(q)*d,py+Math.sin(q)*d*sq,0,0,pick(['#ffe9a8','#ffffff','#ffd35a']),rf(0.9,1.6),{z:1,vz:rf(14,32),glow:true});}},

  // 심연 연옥: 보랏빛 심연 웅덩이 + 둘레를 핥는 영혼 불꽃 + 떠오르는 영혼
  purgatory(e,t,px,py,sx,sy){const T=e.max,a=uvEnv(t,T,0.4,0.7),R0=e.r,sq=0.55,grow=uvEase(t/0.5);
    const g=wx.createRadialGradient(sx,sy,0,sx,sy,R0*grow);g.addColorStop(0,'rgba(10,0,20,0.75)');g.addColorStop(0.7,'rgba(50,10,80,0.45)');g.addColorStop(1,'rgba(90,30,140,0)');wx.globalAlpha=a;wx.fillStyle=g;wx.beginPath();wx.ellipse(sx,sy,R0*grow,R0*grow*sq,0,0,Math.PI*2);wx.fill();
    uvSigil(sx,sy,R0*0.62*grow,'#b05cff','#5a1a8a',0.55*a,sq,uvEase(t/0.8),-t*0.07,5);uvRing(sx,sy,R0*grow,'#d8a0ff',0.6*a,sq,1,0,1.4);
    uvBand(sx,sy,R0*grow,12,'#8a3ad0',0.6*a,sq);const N=40;const fl=[];for(let i=0;i<N;i++){const q=i/N*6.28,x=sx+Math.cos(q)*R0*grow,y=sy+Math.sin(q)*R0*grow*sq;fl.push([x,y,i]);}fl.sort((p,q)=>p[1]-q[1]);
    for(const [x,y,i] of fl){const h=(9+12*(0.5+0.5*Math.sin(t*9+i*1.7))*(0.6+0.4*Math.sin(t*5.3+i*0.9)))*grow;uvFlame(x,y,h,4,['#f0d8ff','#b05cff','#5a1a8a'],a,t,i);}
    for(let n=0;n<7;n++){const u=((t*0.35+uvH(n+e.sd))%1),q=uvH(n*3+e.sd)*6.28,d=uvH(n*5+e.sd)*R0*0.6;const gx=sx+Math.cos(q)*d+Math.sin(t*3+n)*3,gy=sy+Math.sin(q)*d*sq-u*60;const ga=a*Math.sin(u*Math.PI)*0.85;uvGlow(gx,gy,7,'#b05cff',ga*0.6,1);uvAdd();wx.globalAlpha=ga;wx.fillStyle='#f0e0ff';wx.fillRect(Math.round(gx-1),Math.round(gy-2),3,3);wx.fillRect(Math.round(gx-1+Math.sin(t*6+n)),Math.round(gy+1),2,2);wx.fillRect(Math.round(gx+Math.sin(t*6+n+1)),Math.round(gy+3),1,2);uvNorm();uvPx(gx-1,gy-1,'#3a0a5a',ga);uvPx(gx+1,gy-1,'#3a0a5a',ga);}
    if(a>0.2&&R()<0.35){const q=R()*6.28,d=Math.sqrt(R())*R0*0.8;part(px+Math.cos(q)*d,py+Math.sin(q)*d*sq,rf(-4,4),0,pick(['#e6d0ff','#b05cff','#ffffff']),rf(1,1.6),{z:2,vz:rf(16,30),glow:true});}},

  // 여명 대군세: 하늘에서 내려와 주위를 지키는 빛의 검 6자루 + 새벽빛 부채살
  dawnlegion(e,t,px,py,sx,sy){const T=e.max,a=uvEnv(t,T,0.4,0.7),br=0.85+0.15*Math.sin(t*2);uvGlow(sx,sy,56,'#ffd35a',0.28*a*br,0.5);
    uvAdd();for(let i=0;i<7;i++){const q=-Math.PI/2+(i-3)*0.32,L=60*uvEase(t/0.6);wx.globalAlpha=0.16*a*br;wx.fillStyle='#ffe9a8';wx.beginPath();wx.moveTo(sx,sy-6);wx.lineTo(sx+Math.cos(q-0.05)*L,sy-6+Math.sin(q-0.05)*L);wx.lineTo(sx+Math.cos(q+0.05)*L,sy-6+Math.sin(q+0.05)*L);wx.fill();}uvNorm();
    uvRing(sx,sy,34,'#ffd35a',0.5*a,0.5,uvEase(t/0.6),t*0.3,2);
    const bl=[];for(let i=0;i<6;i++){const st=i*0.08;const desc=uvEase((t-st)/0.5);const up=t>T-0.6?uvEase((t-(T-0.6))/0.6):0;const q=i/6*6.28+t*0.6;const x=sx+Math.cos(q)*34,y=sy+Math.sin(q)*17;const z=14+(1-desc)*70+up*50+Math.sin(t*2.4+i)*1.2;bl.push([x,y,z,desc*(1-up)]);}bl.sort((p,q)=>p[1]-q[1]);
    for(const [x,y,z,al] of bl){if(al<=0)continue;const by=y-z;uvGlow(x,by+4,7,'#ffe9a8',0.4*al*a,1);uvAdd();wx.globalAlpha=al*a;wx.fillStyle='#ffd35a';wx.fillRect(Math.round(x-1),Math.round(by-5),3,12);wx.fillStyle='#ffffff';wx.fillRect(Math.round(x),Math.round(by-4),1,11);wx.fillStyle='#ffe9a8';wx.fillRect(Math.round(x-3),Math.round(by-5),7,1);uvNorm();uvPx(x,by+8,'#ffffff',al*a);uvPx(x,y,'#ffd35a',0.5*al*a,1);}
    if(a>0.3&&R()<0.4){const q=R()*6.28,d=rf(10,50);part(px+Math.cos(q)*d,py+Math.sin(q)*d*0.5,0,0,pick(['#ffd35a','#ffe9a8','#ffffff']),rf(0.8,1.3),{z:1,vz:rf(12,26),glow:true});}},

  // 일륜 붕괴: 하늘에서 내려오는 검은 태양(불꽃 코로나) → 착탄 대폭발
  eclipsebreak(e,t,px,py,sx,sy){const D=e.drop||1.5,T=e.max,R0=e.r;
    if(t<D){const q=t/D,h=150*(1-q*q),cy=sy-20-h,r=10+14*uvEase(q*1.5);uvGlow(sx,sy,R0*q,'#ff8a3a',0.25*q,0.5);
      uvGlow(sx,cy,r*4.2,'#ff6a1a',0.85,1);uvGlow(sx,cy,r*2,'#ffd35a',0.8,1);uvAdd();for(let i=0;i<36;i++){const a2=i/36*6.28+t*0.8,L=r+5+9*(0.5+0.5*Math.sin(t*12+i*2.3));wx.globalAlpha=0.9;wx.fillStyle=i%2?'#ffd35a':'#ff6a1a';wx.beginPath();wx.moveTo(sx+Math.cos(a2-0.07)*r,cy+Math.sin(a2-0.07)*r);wx.lineTo(sx+Math.cos(a2)*L,cy+Math.sin(a2)*L);wx.lineTo(sx+Math.cos(a2+0.07)*r,cy+Math.sin(a2+0.07)*r);wx.fill();}uvNorm();
      wx.globalAlpha=1;wx.fillStyle='#120608';wx.beginPath();wx.arc(sx,cy,r,0,Math.PI*2);wx.fill();uvRing(sx,cy,r,'#ffe9a8',1,1,1,0,1.2);
      if(R()<0.8)part(px+rf(-r,r),py-20-h,rf(-10,10),0,pick(['#ff8a3a','#ffd35a','#ff4a3a']),rf(0.3,0.6),{z:rf(-4,4)+0,vz:rf(10,30),glow:true});return;}
    const k=(t-D)/(T-D),a=1-k;uvOnce(e,'b',()=>{shake=Math.max(shake,8);for(let i=0;i<60;i++){const q=R()*6.28,v=rf(60,200);part(px+Math.cos(q)*6,py+Math.sin(q)*3,Math.cos(q)*v,Math.sin(q)*v*0.55,pick(['#ffffff','#ffd35a','#ff8a3a','#ff4a3a']),rf(0.4,1),{z:rf(2,20),vz:rf(10,80),g:-140,glow:true});}});
    uvGlow(sx,sy-8,R0*0.9,'#ffd35a',0.9*a,0.8);uvAdd();for(let i=0;i<20;i++){const q=i/20*6.28+uvH(i)*0.15,L=R0*(0.7+uvH(i+4)*0.6)*uvEase(k*2);wx.globalAlpha=0.6*a;wx.fillStyle=i%2?'#ffd35a':'#ff8a3a';wx.beginPath();wx.moveTo(sx,sy-6);wx.lineTo(sx+Math.cos(q-0.03)*L,sy-6+Math.sin(q-0.03)*L*0.6);wx.lineTo(sx+Math.cos(q+0.03)*L,sy-6+Math.sin(q+0.03)*L*0.6);wx.fill();}uvNorm();
    uvWave(sx,sy,R0*1.2*uvEase(k*1.4),['#ffffff','#ffd35a','#ff4a3a'],a,0.55);uvRing(sx,sy,R0*0.7,'#3a1008',0.6*a,0.55,1,0,1.5,2);uvPillar(sx,sy,18*(1-k),170,'#ffd35a',a);},
};
// ===== 2차 직업 스킬 시그니처 이펙트 (fx k:'sv') =====
function svPos(id){if(id===myId)return [me.x,me.y];const p=G.players.get(id);return p?[p.dx,p.dy]:null;}
/* 초승달 베기: a=중심 방향, arc=호 각도, w=최대 두께, p=휘두른 정도 */
function svSlash(cx,cy,a,r,w,arc,c1,c2,al,p,sq){if(al<=0||p<=0)return;sq=sq||0.6;const n=20,a0=a-arc/2,span=arc*Math.min(1,p);
  uvAdd();wx.globalAlpha=Math.min(1,al);wx.fillStyle=c1;wx.beginPath();for(let i=0;i<=n;i++){const q=a0+span*i/n;wx.lineTo(cx+Math.cos(q)*r,cy+Math.sin(q)*r*sq);}
  for(let i=n;i>=0;i--){const u=i/n,q=a0+span*u,th=w*Math.sin(Math.PI*Math.pow(u,0.75));wx.lineTo(cx+Math.cos(q)*(r-th),cy+Math.sin(q)*(r-th)*sq);}wx.closePath();wx.fill();
  wx.strokeStyle=c2;wx.lineWidth=1.2;wx.beginPath();for(let i=0;i<=n;i++){const q=a0+span*i/n,x=cx+Math.cos(q)*(r-0.6),y=cy+Math.sin(q)*(r-0.6)*sq;i?wx.lineTo(x,y):wx.moveTo(x,y);}wx.stroke();uvNorm();}
/* 가운데가 굵고 끝이 가는 광선 */
function svBeam(x1,y1,x2,y2,w,c1,c2,al){if(al<=0||w<=0.2)return;const a=Math.atan2(y2-y1,x2-x1),nx=-Math.sin(a),ny=Math.cos(a),dx=x2-x1,dy=y2-y1;uvAdd();wx.globalAlpha=Math.min(1,al);wx.fillStyle=c1;wx.beginPath();wx.moveTo(x1,y1);wx.lineTo(x1+dx*0.12+nx*w/2,y1+dy*0.12+ny*w/2);wx.lineTo(x2+nx*w*0.2,y2+ny*w*0.2);wx.lineTo(x2-nx*w*0.2,y2-ny*w*0.2);wx.lineTo(x1+dx*0.12-nx*w/2,y1+dy*0.12-ny*w/2);wx.closePath();wx.fill();
  wx.strokeStyle=c2;wx.lineWidth=Math.max(1,w*0.28);wx.beginPath();wx.moveTo(x1,y1);wx.lineTo(x2,y2);wx.stroke();uvNorm();}
function svBolt(x1,y1,x2,y2,c,al,seed,n,jit){let px=x1,py=y1;n=n||7;uvAdd();wx.lineCap='round';for(let j=1;j<=n;j++){const u=j/n,nx=x1+(x2-x1)*u+(j<n?(uvH(seed+j)-0.5)*jit:0),ny=y1+(y2-y1)*u+(j<n?(uvH(seed+j+50)-0.5)*jit*0.6:0);wx.globalAlpha=Math.min(1,al);wx.strokeStyle=c;wx.lineWidth=2.4;wx.beginPath();wx.moveTo(px,py);wx.lineTo(nx,ny);wx.stroke();wx.strokeStyle='#ffffff';wx.lineWidth=1;wx.beginPath();wx.moveTo(px,py);wx.lineTo(nx,ny);wx.stroke();px=nx;py=ny;}uvNorm();}
function svSpray(x,y,n,cs,v0,v1,o){o=o||{};for(let i=0;i<n;i++){const q=o.a!=null?o.a+rf(-(o.sp||0.6),o.sp||0.6):R()*6.28,v=rf(v0,v1);part(x+Math.cos(q)*2,y+Math.sin(q),Math.cos(q)*v,Math.sin(q)*v*0.55,pick(cs),rf(o.l0||0.3,o.l1||0.7),{z:o.z!=null?o.z:rf(2,10),vz:o.vz!=null?o.vz:rf(0,40),g:o.g||0,glow:o.glow!==false});}}
function svStar(x,y,s,c,al){if(s<=0||al<=0)return;uvAdd();wx.globalAlpha=Math.min(1,al);wx.fillStyle=c;wx.beginPath();wx.moveTo(x,y-s);wx.lineTo(x+s*0.2,y-s*0.2);wx.lineTo(x+s,y);wx.lineTo(x+s*0.2,y+s*0.2);wx.lineTo(x,y+s);wx.lineTo(x-s*0.2,y+s*0.2);wx.lineTo(x-s,y);wx.lineTo(x-s*0.2,y-s*0.2);wx.closePath();wx.fill();uvNorm();}
function svHex(x,y,r,c,al,sq,fill){if(r<=0||al<=0)return;wx.beginPath();for(let i=0;i<6;i++){const q=i/6*6.28+Math.PI/6;wx.lineTo(x+Math.cos(q)*r,y+Math.sin(q)*r*(sq||1));}wx.closePath();uvAdd();if(fill){wx.globalAlpha=Math.min(1,al*0.25);wx.fillStyle=fill;wx.fill();}wx.globalAlpha=Math.min(1,al);wx.strokeStyle=c;wx.lineWidth=1;wx.stroke();uvNorm();}
function svFade(t,T,a,b){return Math.max(0,Math.min(1,a?t/a:1,(T-t)/(b||T)));}
const W2S=(x,y,icx,icy)=>[Math.round(x)-icx,Math.round(y)-icy];

const SV={
  // ---- 광전사 ----
  crimslash(e,t,px,py,sx,sy){const T=e.max,p=uvEase(t/0.09),al=t<0.09?1:1-(t-0.09)/(T-0.09);svSlash(sx,sy-8,e.a,42,10,2.0,'#ff3a4a','#ffd0c0',al,p,0.6);uvGlow(sx+Math.cos(e.a)*24,sy-8+Math.sin(e.a)*14,22,'#ff2a3a',0.35*al,0.7);
    uvOnce(e,'s',()=>svSpray(px+Math.cos(e.a)*26,py+Math.sin(e.a)*14,8,['#ff3a4a','#b3282b','#ff8a7a'],40,110,{a:e.a,sp:0.8,g:-150,vz:rf(20,50)}));},
  roar(e,t,px,py,sx,sy){const T=e.max,R0=e.r||60;for(let i=0;i<3;i++){const k=(t-i*0.11)/0.55;if(k<0||k>1)continue;uvWave(sx,sy,R0*uvEase(k)*(1-i*0.12),['#ffd0c0','#ff3a4a','#7a0a14'],(1-k)*0.9,0.5);}
    const a=svFade(t,T,0.05,0.4);for(let i=0;i<12;i++){const q=i/12*6.28;uvFlame(sx+Math.cos(q)*12,sy+Math.sin(q)*5,(10+8*Math.sin(t*12+i))*a,3,['#ffd0c0','#ff3a4a','#7a0a14'],a*0.8,t,i);}
    uvOnce(e,'s',()=>svSpray(px,py,26,['#ff3a4a','#ffd35a','#b3282b'],30,120,{vz:rf(30,70),g:-120}));},
  rampdash(e,t,px,py,sx,sy,icx,icy){const T=e.max,k=t/T,[x1,y1]=W2S(e.x1,e.y1,icx,icy),[x2,y2]=W2S(e.x2,e.y2,icx,icy);svBeam(x1,y1-8,x2,y2-8,12*(1-k),'#ff3a4a','#ffd0c0',1-k);
    for(let i=1;i<=3;i++){const u=i/4;uvGlow(x1+(x2-x1)*u,y1+(y2-y1)*u-8,8,'#ff4a3a',0.4*(1-k)*u,1);}uvWave(x2,y2,30*uvEase(k*1.6),['#ffd0c0','#ff6a3a','#7a0a14'],1-k,0.5);
    uvOnce(e,'s',()=>svSpray(e.x2,e.y2,14,['#ff6a3a','#ffd35a','#5a3a2a'],30,100,{g:-160,vz:rf(30,60)}));},
  // ---- 검성 ----
  qslash(e,t,px,py,sx,sy){const T=e.max,p=uvEase(t/0.06),al=t<0.06?1:1-(t-0.06)/(T-0.06);svSlash(sx,sy-8,e.a,32,6,1.5,'#8fd0ff','#ffffff',al,p,0.55);},
  iaicharge(e,t,px,py,sx,sy){const T=e.max,k=t/T;uvRing(sx,sy-8,28*(1-k)+5,'#bfe3ff',0.8*k+0.2,0.7,1,t*4,2);svStar(sx+Math.cos(e.a)*8,sy-10+Math.sin(e.a)*4,2+6*k,'#ffffff',0.5+0.5*k);
    if(R()<0.8){const q=R()*6.28,d=rf(26,40);part(px+Math.cos(q)*d,py-8+Math.sin(q)*d*0.6,-Math.cos(q)*d*3,-Math.sin(q)*d*1.8,pick(['#ffffff','#bfe3ff']),0.25,{glow:true});}},
  iaido(e,t,px,py,sx,sy){const T=e.max,len=e.len||120,ex=sx+Math.cos(e.a)*len,ey=sy-6+Math.sin(e.a)*len;const p=uvEase(t/0.05);const a=t<0.12?1:Math.max(0,1-(t-0.12)/(T-0.12));
    svBeam(sx,sy-6,sx+(ex-sx)*p,sy-6+(ey-sy+6)*p,5*a+1,'#8fd0ff','#ffffff',a);
    for(let i=0;i<5;i++){const st=0.08+i*0.035;if(t<st)continue;const k=Math.min(1,(t-st)/0.2),u=(i+1)/6,cx=sx+(ex-sx)*u,cy=sy-6+(ey-sy+6)*u,s=7*uvEase(k*2),al=1-k;uvAdd();uvLine(cx-s,cy-s,cx+s,cy+s,'#ffffff',al);uvLine(cx-s,cy+s,cx+s,cy-s,'#bfe3ff',al);uvNorm();}
    uvOnce(e,'s',()=>{for(let i=0;i<14;i++){const u=R();svSpray(e.x+Math.cos(e.a)*len*u,e.y-6+Math.sin(e.a)*len*u,1,['#ffffff','#bfe3ff'],10,40,{});}});},
  parrystance(e,t,px,py,sx,sy){const T=e.max,a=svFade(t,T,0.1,0.15),sh=0.6+0.4*Math.sin(t*14);uvRing(sx,sy-8,18,'#bfe3ff',0.7*a*sh,0.75,1,t*1.5,1.6);uvGlow(sx,sy-8,22,'#8fd0ff',0.25*a,0.8);
    for(let j=0;j<2;j++){const q=t*5+j*Math.PI;svStar(sx+Math.cos(q)*18,sy-8+Math.sin(q)*13,3,'#ffffff',a);}},
  parrywhirl(e,t,px,py,sx,sy){const T=e.max,p=uvEase(t/0.14),al=t<0.14?1:1-(t-0.14)/(T-0.14);for(let j=0;j<2;j++)svSlash(sx,sy-6,j*Math.PI+t*6+1.7,40,9,3.2,'#8fd0ff','#ffffff',al,p,0.6);uvWave(sx,sy,48*uvEase(t/T*1.5),['#ffffff','#bfe3ff','#3a6fb8'],al,0.5);},
  // ---- 수호기사 ----
  aegis(e,t,px,py,sx,sy){const T=e.max,R0=e.r||90,a=svFade(t,T,0.05,0.4);uvSigil(sx,sy,R0,'#8fd0ff','#3a6fb8',0.6*a,0.5,uvEase(t/0.3),t*0.2,6);uvBand(sx,sy,R0*uvEase(t/0.35),10,'#8fd0ff',0.5*a,0.5);
    for(let i=0;i<14;i++){const q=i/14*6.28,x=sx+Math.cos(q)*R0*0.95,y=sy+Math.sin(q)*R0*0.47;const h=uvEase((t-0.08-i*0.015)/0.3)*10;svHex(x,y-h-4,4,'#bfe3ff',a,1,'#8fd0ff');}
    uvOnce(e,'s',()=>svSpray(px,py,18,['#bfe3ff','#ffffff'],20,90,{vz:rf(20,50)}));},
  taunt(e,t,px,py,sx,sy){const T=e.max,R0=e.r||150;for(let i=0;i<2;i++){const k=(t-i*0.14)/0.55;if(k<0||k>1)continue;uvWave(sx,sy,R0*uvEase(k),['#ffd35a','#ff6a3a','#b3282b'],(1-k)*0.85,0.5);}
    const a=svFade(t,T,0.06,0.35);for(let i=0;i<9;i++){const q=i/9*6.28+0.3;svBolt(sx,sy,sx+Math.cos(q)*36*uvEase(t/0.2),sy+Math.sin(q)*18*uvEase(t/0.2),'#ff6a3a',0.5*a,i*13+e.sd,4,6);}
    const hy=sy-40-4*uvEase(t/0.15),s=t<0.15?1+(1-t/0.15):1;uvAdd();wx.globalAlpha=a;wx.fillStyle='#ff4a3a';wx.fillRect(Math.round(sx-2*s),Math.round(hy-10*s),Math.round(4*s),Math.round(9*s));wx.fillRect(Math.round(sx-2*s),Math.round(hy+1),Math.round(4*s),Math.round(3*s));uvNorm();uvGlow(sx,hy-4,14,'#ff4a3a',0.5*a,1);},
  gleap(e,t,px,py,sx,sy){const T=e.max,k=t/T,a=1-k;uvPillar(sx,sy,14*(1-k),110,'#8fd0ff',a);uvWave(sx,sy,46*uvEase(k*1.5),['#ffffff','#8fd0ff','#3a6fb8'],a,0.5);svHex(sx,sy-18,12*(1+k*0.5),'#ffffff',a,1.15,'#8fd0ff');
    uvOnce(e,'s',()=>svSpray(px,py,20,['#8fd0ff','#ffffff','#6b5a4a'],30,110,{g:-160,vz:rf(30,70)}));},
  // ---- 심판관 ----
  hthrow(e,t,px,py,sx,sy){const T=e.max,p=uvEase(t/0.08),al=t<0.08?1:1-(t-0.08)/(T-0.08);svSlash(sx,sy-8,e.a,28,7,2.0,'#ffd35a','#ffffff',al,p,0.6);uvGlow(sx,sy-8,18,'#ffe9a8',0.4*al,0.8);},
  verdict(e,t,px,py,sx,sy){const T=e.max,k=t/T,a=1-k;uvSigil(sx,sy,24,'#ffd35a','#d49a2a',a,0.5,uvEase(t/0.15),0,4);uvPillar(sx,sy,10*(1-k),120,'#ffd35a',a);const cl=36*uvEase(k*3);uvAdd();wx.globalAlpha=a;wx.fillStyle='#ffffff';wx.fillRect(Math.round(sx-cl),sy-9,Math.round(cl*2),2);wx.fillRect(sx-1,Math.round(sy-9-cl*0.6),2,Math.round(cl*1.2));uvNorm();
    uvWave(sx,sy,40*uvEase(k*1.5),['#ffffff','#ffd35a','#d49a2a'],a,0.5);uvOnce(e,'s',()=>svSpray(px,py-8,18,['#ffffff','#ffd35a'],40,120,{g:-140,vz:rf(20,60)}));},
  hground(e,t,px,py,sx,sy){const T=e.max,R0=e.r||50,a=svFade(t,T,0.3,0.6),br=0.85+0.15*Math.sin(t*2.4);uvGlow(sx,sy,R0,'#ffd35a',0.25*a*br,0.55);uvSigil(sx,sy,R0,'#ffe9a8','#d49a2a',0.7*a,0.55,uvEase(t/0.5),t*0.06,4);
    if(a>0.3&&R()<0.45){const q=R()*6.28,d=Math.sqrt(R())*R0;part(px+Math.cos(q)*d,py+Math.sin(q)*d*0.55,0,0,pick(['#ffe9a8','#ffd35a','#ffffff']),rf(0.8,1.3),{z:1,vz:rf(12,26),glow:true});}},
  // ---- 저격수 ----
  beamshot(e,t,px,py,sx,sy,icx,icy){const T=e.max,k=t/T,[x1,y1]=W2S(e.x1,e.y1,icx,icy),[x2,y2]=W2S(e.x2,e.y2,icx,icy);svBeam(x1,y1,x2,y2,8*Math.pow(1-k,0.6),'#ffd35a','#ffffff',1-k);
    uvRing(x1,y1,6+14*k,'#ffffff',1-k,1,1,0,1.5);for(let i=1;i<=3;i++){const u=i*0.22,cx=x1+(x2-x1)*u,cy=y1+(y2-y1)*u;uvRing(cx,cy,4+10*k,'#fff2b0',(1-k)*0.8,1,1,0,1.5);}
    uvOnce(e,'s',()=>svSpray(e.x1,e.y1,10,['#ffffff','#ffd35a'],30,90,{a:Math.atan2(e.y2-e.y1,e.x2-e.x1),sp:0.5}));},
  wmark(e,t,px,py,sx,sy){const T=e.max,k=uvEase(t/0.25),a=svFade(t,T,0.03,0.2),d=22-12*k;for(let i=0;i<4;i++){const q=i*Math.PI/2+Math.PI/4+k*Math.PI/4,cx=sx+Math.cos(q)*d,cy=sy-10+Math.sin(q)*d;uvLine(cx,cy,cx+Math.cos(q+2.36)*5,cy+Math.sin(q+2.36)*5,'#ffd35a',a);uvLine(cx,cy,cx+Math.cos(q-2.36)*5,cy+Math.sin(q-2.36)*5,'#ffd35a',a);}
    svStar(sx,sy-10,6*(1-k)+2,'#ffffff',a);uvOnce(e,'s',()=>svSpray(px,py-10,10,['#ffd35a','#ffffff'],20,70,{}));},
  starfall(e,t,px,py,sx,sy){const T=e.max,k=Math.min(1,t/T),hx=sx+70*(1-k),hy=sy-8-150*(1-k);svBeam(hx+26,hy-56,hx,hy,5,'#c9a0e8','#ffffff',0.8);svStar(hx,hy,6,'#ffffff',1);uvGlow(hx,hy,12,'#b07aff',0.6,1);if(R()<0.8)part(px+70*(1-k),py-8,rf(-8,8),0,pick(['#ffffff','#e6d8ff']),0.3,{z:150*(1-k),glow:true});},
  hshot(e,t,px,py,sx,sy,icx,icy){const T=e.max,k=t/T,[x1,y1]=W2S(e.x1,e.y1,icx,icy),[x2,y2]=W2S(e.x2,e.y2,icx,icy);svBeam(x1,y1,x2,y2,4*(1-k),'#fff2b0','#ffffff',1-k);svStar(x2,y2,14*(1-k)+3,'#ffffff',1-k);svStar(x2,y2,8*(1-k)+2,'#ff4a3a',(1-k)*0.8);
    uvOnce(e,'s',()=>svSpray(e.x2,e.y2,14,['#ffffff','#ffd35a','#ff4a3a'],40,130,{}));},
  // ---- 덫 사냥꾼 ----
  trapset(e,t,px,py,sx,sy){const T=e.max,a=svFade(t,T,0.02,0.3),c=e.c||'#ff8a3a';uvSigil(sx,sy,14,c,'#3f5a2c',a,0.55,uvEase(t/0.2),0,e.n||4);if(Math.floor(t*10)%3!==2)uvGlow(sx,sy-2,10,c,0.5*a,0.8);
    uvOnce(e,'s',()=>svSpray(px,py,10,['#8a7a5a','#5a4a3a','#b0a080'],15,50,{glow:false,vz:rf(10,30),g:-120}));},
  hawk(e,t,px,py,sx,sy){const T=e.max,a=svFade(t,T,0.4,0.5);const th=t*2.3,Rr=46+10*Math.sin(t*0.9),sw=Math.max(0,Math.sin(t*1.3))*14;const hx=sx+Math.cos(th)*Rr,hgy=sy+Math.sin(th)*Rr*0.45,hy=hgy-34+sw;
    wx.globalAlpha=0.3*a;wx.fillStyle='#000000';wx.beginPath();wx.ellipse(hx,hgy,5,2,0,0,Math.PI*2);wx.fill();
    const dir=-Math.sin(th)>0?1:-1,fl=Math.sin(t*14);uvGlow(hx,hy,14,'#d8f0a0',0.35*a,0.8);
    const R2=(x,y,w,h,c)=>{wx.fillStyle=c;wx.fillRect(Math.round(x),Math.round(y),w,h);};wx.globalAlpha=a;
    for(let j=0;j<6;j++){const wy=hy-1-fl*(j+1)*1.1;const c=j>3?'#2a1a10':'#5a3a20';R2(hx-3-j*2,wy,2,2,c);R2(hx+3+j*2,wy,2,2,c);if(j<4){R2(hx-3-j*2,wy+2,2,1,'#c8a878');R2(hx+3+j*2,wy+2,2,1,'#c8a878');}}
    R2(hx-3,hy-2,7,4,'#6b4a2e');R2(hx-2,hy+1,5,1,'#e6dcc3');R2(hx+dir*4-1,hy-3,3,3,'#f0ead8');R2(hx+dir*6-(dir<0?1:0),hy-2,2,1,'#ffd35a');R2(hx-dir*5-1,hy-1,3,2,'#3a2818');
    if(a>0.3&&R()<0.05)part(px+Math.cos(th)*Rr,py+Math.sin(th)*Rr*0.45,rf(-8,8),0,pick(['#8a6a4a','#e6dcc3']),1.2,{z:34-sw,vz:-12,glow:false});},
  // ---- 원소술사 ----
  castfire(e,t,px,py,sx,sy){const T=e.max,a=1-t/T,hx=sx+Math.cos(e.a)*8,hy=sy-10+Math.sin(e.a)*5;uvGlow(hx,hy,20,'#ff8a3a',0.7*a,1);for(let i=0;i<5;i++){const q=e.a+(i-2)*0.35,L=(10+uvH(i+e.sd)*8)*uvEase(t/0.1);svBeam(hx,hy,hx+Math.cos(q)*L,hy+Math.sin(q)*L*0.7,4,'#ff6a1a','#ffd35a',a);}
    uvOnce(e,'s',()=>svSpray(px+Math.cos(e.a)*8,py-10,10,['#ffd35a','#ff6a1a','#ff4a3a'],30,90,{a:e.a,sp:0.7,vz:rf(10,40)}));},
  firepool(e,t,px,py,sx,sy){const T=e.max,R0=e.r||40,a=svFade(t,T,0.2,0.6);uvGlow(sx,sy,R0,'#ff4a1a',0.35*a,0.55);uvBand(sx,sy,R0*0.9,8,'#ff6a1a',0.4*a,0.55);
    const fl=[];for(let i=0;i<18;i++){const q=i/18*6.28,d=R0*(0.35+0.6*uvH(i+e.sd));fl.push([sx+Math.cos(q)*d,sy+Math.sin(q)*d*0.55,i]);}fl.sort((p,q)=>p[1]-q[1]);for(const [x,y,i] of fl)uvFlame(x,y,(6+7*(0.5+0.5*Math.sin(t*8+i*1.9)))*a,3,['#ffe08a','#ff6a1a','#8a1a10'],a,t,i);},
  icecast(e,t,px,py,sx,sy){const T=e.max,a=1-t/T,hx=sx+Math.cos(e.a)*8,hy=sy-10+Math.sin(e.a)*5;uvGlow(hx,hy,16,'#8fd0ff',0.6*a,1);for(let i=0;i<6;i++){const q=e.a+(i-2.5)*0.45,L=(8+uvH(i+e.sd)*6)*uvEase(t/0.08);const x2=hx+Math.cos(q)*L,y2=hy+Math.sin(q)*L*0.7;svBeam(hx,hy,x2,y2,3,'#8fd0ff','#ffffff',a);uvPx(x2,y2,'#ffffff',a,1);}
    uvOnce(e,'s',()=>svSpray(px+Math.cos(e.a)*8,py-10,8,['#ffffff','#bfe3ff'],20,70,{a:e.a,sp:0.8}));},
  estrike(e,t,px,py,sx,sy){const T=e.max,k=t/T,a=1-k;if(e.el){const f=Math.floor(t*30);svBolt(sx+(uvH(e.sd)-0.5)*20,sy-150,sx,sy-2,'#c9a0ff',a,e.sd+f*0.01|0,8,16);uvGlow(sx,sy-4,26,'#e6d8ff',0.7*a,0.7);uvWave(sx,sy,30*uvEase(k*2),['#ffffff','#c9a0ff'],a,0.5);}
    else{uvGlow(sx,sy-6,26,'#ff8a3a',0.8*a,0.8);uvWave(sx,sy,30*uvEase(k*2),['#ffe08a','#ff6a1a','#8a1a10'],a,0.5);for(let i=0;i<8;i++){const q=i/8*6.28;uvFlame(sx+Math.cos(q)*12*uvEase(k*2),sy+Math.sin(q)*6*uvEase(k*2),12*a,3,['#ffe08a','#ff6a1a','#8a1a10'],a,t,i);}}
    uvOnce(e,'s',()=>svSpray(px,py,12,e.el?['#ffffff','#c9a0ff']:['#ffd35a','#ff6a1a'],30,110,{vz:rf(20,60),g:-120}));},
  // ---- 점성술사 ----
  starmark(e,t,px,py,sx,sy){const T=e.max,k=uvEase(t/0.3),a=svFade(t,T,0.02,0.3);svStar(sx,sy-10,14-8*k,'#e6d8ff',a);svStar(sx,sy-10,6-3*k,'#ffffff',a);uvRing(sx,sy-10,20-12*k,'#c9a0e8',a,0.8,1,t*3,2);uvGlow(sx,sy-10,16,'#b07aff',0.4*a,1);},
  constline(e,t,px,py,sx,sy,icx,icy){const T=e.max,[x1,y1]=W2S(e.x1,e.y1,icx,icy),[x2,y2]=W2S(e.x2,e.y2,icx,icy),p=uvEase(t/0.15),a=svFade(t,T,0,0.3);const ex=x1+(x2-x1)*p,ey=y1+(y2-y1)*p;svBeam(x1,y1,ex,ey,3,'#c9a0e8','#ffffff',a);svStar(x1,y1,5,'#ffffff',a);svStar(ex,ey,6,'#ffffff',a);
    for(let i=1;i<4;i++){const u=i/4;if(u>p)break;svStar(x1+(x2-x1)*u,y1+(y2-y1)*u,2+Math.sin(t*20+i),'#e6d8ff',a);}},
  starburst(e,t,px,py,sx,sy){const T=e.max,k=t/T,a=1-k,R0=e.r||30;svStar(sx,sy-6,R0*0.6*(1-k*0.5),'#ffffff',a);svStar(sx,sy-6,R0*0.35,'#c9a0e8',a*0.8);uvGlow(sx,sy-6,R0,'#b07aff',0.6*a,0.8);uvWave(sx,sy,R0*1.2*uvEase(k*1.6),['#ffffff','#c9a0e8','#5a3a8a'],a,0.5);
    uvOnce(e,'s',()=>svSpray(px,py-6,12,['#ffffff','#e6d8ff','#8fd0ff'],30,110,{}));},
  // ---- 성자(사제) ----
  gheal(e,t,px,py,sx,sy){const T=e.max,R0=e.r||110,a=svFade(t,T,0.05,0.5);uvWave(sx,sy,R0*uvEase(t/0.5),['#ffffff','#b8f0a0','#ffd35a'],a,0.5);uvGlow(sx,sy,R0*0.7,'#d8ffb0',0.3*a,0.5);
    for(let i=0;i<10;i++){const st=uvH(i+e.sd)*0.4,kk=(t-st)/0.7;if(kk<0||kk>1)continue;const q=uvH(i*3+e.sd)*6.28,d=uvH(i*7+e.sd)*R0*0.8,x=sx+Math.cos(q)*d,y=sy+Math.sin(q)*d*0.5-kk*26,al=Math.sin(kk*Math.PI);uvAdd();wx.globalAlpha=al;wx.fillStyle='#c8ffb0';wx.fillRect(Math.round(x-3),Math.round(y),7,2);wx.fillRect(Math.round(x),Math.round(y-3),2,8);uvNorm();uvGlow(x+1,y+1,6,'#a8ff90',0.4*al,1);}
    uvOnce(e,'s',()=>svSpray(px,py,24,['#d8ffb0','#ffffff','#ffd35a'],10,60,{vz:rf(20,45)}));},
  laegis(e,t,px,py,sx,sy){const T=e.max,R0=e.r||110,a=svFade(t,T,0.04,0.45),k=uvEase(t/0.35);svHex(sx,sy-10,R0*0.55*k,'#ffe9a8',a,0.62,'#ffd35a');svHex(sx,sy-10,R0*0.4*k,'#fff2c0',a*0.6,0.62);uvBand(sx,sy,R0*k,9,'#ffd35a',0.5*a,0.5);
    for(let i=0;i<8;i++){const q=i/8*6.28+t;svStar(sx+Math.cos(q)*R0*0.5*k,sy-10+Math.sin(q)*R0*0.3*k,3,'#ffffff',a);}},
  resur(e,t,px,py,sx,sy){const T=e.max,k=t/T,a=svFade(t,T,0.1,0.6);uvPillar(sx,sy,22*(1-k*0.6),200,'#fff2c0',a);uvRing(sx,sy-30,8,'#ffd35a',a,0.4,1,0,1.2);uvGlow(sx,sy-30,10,'#ffe9a8',0.6*a,0.5);
    if(a>0.3&&R()<0.5)part(px+rf(-14,14),py,rf(-6,6),0,pick(['#ffffff','#fff2c0']),rf(0.8,1.4),{z:rf(30,60),vz:-10,glow:true});},
  // ---- 퇴마사 ----
  curse(e,t,px,py,sx,sy){const T=e.max,a=svFade(t,T,0.05,0.35);uvSigil(sx,sy,18,'#b05cff','#5a1a8a',a,0.55,uvEase(t/0.25),-t*0.4,5);uvGlow(sx,sy-8,18,'#7a3a8c',0.5*a,1);
    if(t<0.3&&R()<0.9){const q=R()*6.28,d=rf(24,36);part(px+Math.cos(q)*d,py-8+Math.sin(q)*d*0.6,-Math.cos(q)*d*3,-Math.sin(q)*d*1.8,pick(['#3a1e4a','#9a7ad8','#5a1a8a']),0.3,{glow:true});}},
  exorcise(e,t,px,py,sx,sy){const T=e.max,k=t/T,a=1-k;const ty=sy-30+uvEase(t/0.12)*16;if(t<0.25){const al=1-t/0.25;wx.globalAlpha=al;wx.fillStyle='#fff2c0';wx.fillRect(sx-3,Math.round(ty-7),7,14);wx.fillStyle='#b3282b';wx.fillRect(sx,Math.round(ty-5),1,10);wx.fillRect(sx-2,Math.round(ty-2),5,1);}
    uvPillar(sx,sy,10*a,90,'#fff2c0',a);uvWave(sx,sy,40*uvEase(k*1.5),['#ffffff','#fff2b0','#9a7ad8'],a,0.5);uvGlow(sx,sy-6,22,'#e6d0ff',0.6*a,0.8);uvOnce(e,'s',()=>svSpray(px,py-6,14,['#ffffff','#fff2b0','#9a7ad8'],30,110,{vz:rf(20,60),g:-100}));},
  chainp(e,t,px,py,sx,sy,icx,icy){const T=e.max,a=svFade(t,T,0.05,0.25),P=e.pts||[];for(let i=0;i<P.length-1;i++){const [x1,y1]=W2S(P[i][0],P[i][1],icx,icy),[x2,y2]=W2S(P[i+1][0],P[i+1][1],icx,icy);
      for(let j=0;j<6;j++){const u=(t*2.5+j/6)%1;uvPx(x1+(x2-x1)*u,y1+(y2-y1)*u+Math.sin(u*12+t*10)*1.5,'#e6d0ff',a,2);}uvGlow(x2,y2,9,'#b05cff',0.6*a,1);}},
  // ---- 여명 지휘관 ----
  banner(e,t,px,py,sx,sy){const T=e.max,R0=e.r||70,a=svFade(t,T,0.3,0.6),g=uvEase(t/0.3),br=0.85+0.15*Math.sin(t*2);uvGlow(sx,sy,R0,'#ffd35a',0.22*a*br,0.5);uvRing(sx,sy,R0,'#ffe9a8',0.5*a,0.5,uvEase(t/0.5),t*0.1,2);
    const H=36*g,top=sy-H;wx.globalAlpha=a;wx.fillStyle='#5a3a1a';wx.fillRect(sx-1,Math.round(top),2,Math.round(H));wx.fillStyle='#ffd35a';wx.fillRect(sx-1,Math.round(top-3),3,3);
    if(g>0.9){for(let c=0;c<17;c++){const yo=Math.sin(t*5-c*0.45)*1.6*(c/16),x=sx+2+c;for(let r=0;r<10;r++){const edge=r===0||r===9||c===16;wx.fillStyle=edge?'#d49a2a':(Math.abs(c-8)<2&&Math.abs(r-4.5)<2?'#ffffff':(r<5?'#ffd35a':'#ff9a7a'));wx.fillRect(x,Math.round(top+1+r+yo),1,1);}}}
    if(a>0.3&&R()<0.35){const q=R()*6.28,d=Math.sqrt(R())*R0;part(px+Math.cos(q)*d,py+Math.sin(q)*d*0.5,0,0,pick(['#ffd35a','#ffe9a8']),rf(0.8,1.3),{z:1,vz:rf(10,24),glow:true});}},
  warhorn(e,t,px,py,sx,sy){const T=e.max,R0=e.r||110;for(let i=0;i<2;i++){const k=(t-i*0.15)/0.5;if(k<0||k>1)continue;uvWave(sx,sy,R0*uvEase(k),['#ffffff','#ffd35a','#d49a2a'],(1-k)*0.85,0.5);}
    const a=svFade(t,T,0.02,0.4);uvAdd();for(let i=0;i<18;i++){const q=i/18*6.28,u=(t*2+uvH(i))%1,r1=R0*(0.2+u*0.6),r2=r1+10;uvLine(sx+Math.cos(q)*r1,sy-6+Math.sin(q)*r1*0.5,sx+Math.cos(q)*r2,sy-6+Math.sin(q)*r2*0.5,'#ffe9a8',a*(1-u));}uvNorm();
    for(let j=0;j<3;j++){const yy=sy-30-j*6-((t*30)%6);uvLine(sx-4,yy+3,sx,yy,'#ffd35a',a);uvLine(sx,yy,sx+4,yy+3,'#ffd35a',a);}},
  rslash(e,t,px,py,sx,sy){const T=e.max,p=uvEase(t/0.1),al=t<0.1?1:1-(t-0.1)/(T-0.1);svSlash(sx,sy-6,e.a,e.r||56,13,2.4,'#ffd35a','#ffffff',al,p,0.6);svSlash(sx,sy-6,e.a,(e.r||56)*0.8,6,2.0,'#ff9a7a','#ffe9a8',al*0.7,p,0.6);
    uvOnce(e,'s',()=>svSpray(px+Math.cos(e.a)*30,py+Math.sin(e.a)*16,12,['#ffffff','#ffd35a'],30,90,{a:e.a,sp:1}));},
  // ---- 일륜검 ----
  sflare(e,t,px,py,sx,sy){const T=e.max,k=t/T,a=1-k,R0=e.r||50;uvGlow(sx,sy-8,R0*0.8,'#ffd35a',0.9*a,0.8);uvAdd();wx.globalAlpha=a;wx.fillStyle='#ffffff';wx.beginPath();wx.arc(sx,sy-8,R0*0.18*(1-k),0,Math.PI*2);wx.fill();
    for(let i=0;i<16;i++){const q=i/16*6.28+uvH(i)*0.2,L=R0*(0.6+uvH(i+3)*0.5)*uvEase(k*2);wx.globalAlpha=0.6*a;wx.fillStyle=i%2?'#ffd35a':'#ff8a3a';wx.beginPath();wx.moveTo(sx,sy-8);wx.lineTo(sx+Math.cos(q-0.04)*L,sy-8+Math.sin(q-0.04)*L*0.6);wx.lineTo(sx+Math.cos(q+0.04)*L,sy-8+Math.sin(q+0.04)*L*0.6);wx.fill();}uvNorm();
    uvWave(sx,sy,R0*uvEase(k*1.4),['#ffffff','#ffd35a','#ff6a1a'],a,0.5);uvOnce(e,'s',()=>svSpray(px,py-8,22,['#ffffff','#ffd35a','#ff8a3a'],40,140,{vz:rf(10,50)}));},
  spierce(e,t,px,py,sx,sy,icx,icy){const T=e.max,k=t/T,a=1-k,[x1,y1]=W2S(e.x1,e.y1,icx,icy),[x2,y2]=W2S(e.x2,e.y2,icx,icy);svBeam(x1,y1-8,x2,y2-8,12*Math.pow(a,0.7),'#ff8a3a','#ffffff',a);
    const L=Math.hypot(x2-x1,y2-y1);for(let d=6;d<L;d+=9){const u=d/L;uvFlame(x1+(x2-x1)*u,y1+(y2-y1)*u,(6+5*Math.sin(t*10+d))*a*(0.5+u*0.5),3,['#ffe08a','#ff6a1a','#8a1a10'],a,t,d);}
    uvOnce(e,'s',()=>svSpray(e.x2,e.y2-8,14,['#ffd35a','#ff8a3a','#ffffff'],30,110,{}));},
  corona(e,t,px,py,sx,sy){const T=e.max,R0=(e.r||46)*0.75,a=svFade(t,T,0.3,0.5);uvGlow(sx,sy,R0*1.3,'#ff8a3a',0.25*a,0.5);uvRing(sx,sy,R0,'#ffd35a',0.6*a,0.5,uvEase(t/0.4),t*0.8,1.5);
    const fl=[];for(let i=0;i<16;i++){const q=i/16*6.28+t*0.8;fl.push([sx+Math.cos(q)*R0,sy+Math.sin(q)*R0*0.5,i]);}fl.sort((p,q)=>p[1]-q[1]);for(const [x,y,i] of fl)uvFlame(x,y,(6+6*(0.5+0.5*Math.sin(t*9+i*2)))*a,3,['#fff2b0','#ffb03a','#ff4a1a'],a,t,i);},
  // ---- 공성 거포 궁극기 ----
  siege(e,t,px,py,sx,sy){const T=e.max,a=svFade(t,T,0.25,0.4);uvSigil(sx,sy,30,'#c8c0b0','#6a5a4a',0.6*a,0.5,uvEase(t/0.35),0,4);
    const mx=sx+Math.cos(e.a)*18,my=sy-10+Math.sin(e.a)*9;uvGlow(mx,my,10+3*Math.sin(t*20),'#ff8a3a',0.45*a,1);
    for(const s of [-1,1])if(a>0.3&&R()<0.5)part(px+s*12,py-2,s*rf(20,40),rf(-6,6),pick(['#e6e6e6','#b8b8b8']),rf(0.5,0.9),{z:2,vz:rf(10,30),glow:false});},
  siegeshot(e,t,px,py,sx,sy,icx,icy){const T=e.max,k=t/T,a=1-k,[x1,y1]=W2S(e.x1,e.y1,icx,icy),[x2,y2]=W2S(e.x2,e.y2,icx,icy);const an=Math.atan2(y2-y1,x2-x1);
    const ml=26*(1-k*0.7);uvAdd();wx.globalAlpha=a;wx.fillStyle='#ffb03a';wx.beginPath();wx.moveTo(x1,y1);wx.lineTo(x1+Math.cos(an-0.35)*ml,y1+Math.sin(an-0.35)*ml);wx.lineTo(x1+Math.cos(an)*ml*1.5,y1+Math.sin(an)*ml*1.5);wx.lineTo(x1+Math.cos(an+0.35)*ml,y1+Math.sin(an+0.35)*ml);wx.closePath();wx.fill();uvNorm();uvGlow(x1,y1,18,'#ffd35a',0.8*a,1);
    const p=uvEase(t/0.12);svBeam(x1,y1,x1+(x2-x1)*p,y1+(y2-y1)*p,6*a,'#ff8a3a','#fff2b0',a);
    uvOnce(e,'s',()=>{svSpray(e.x1,e.y1,10,['#ffd35a','#ff8a3a'],40,120,{a:Math.atan2(e.y2-e.y1,e.x2-e.x1),sp:0.4});for(let i=0;i<8;i++){const u=R();part(e.x1+(e.x2-e.x1)*u,e.y1+(e.y2-e.y1)*u,rf(-5,5),rf(-5,5),pick(['#9a9a9a','#7a7a7a','#c0c0c0']),rf(0.5,1),{z:rf(0,4),vz:rf(4,12),glow:false});}});},
  siegeboom(e,t,px,py,sx,sy){const T=e.max,k=t/T,a=1-k,R0=e.r||58;const fy=sy-10-26*uvEase(k);uvGlow(sx,fy,R0*0.6*(1-k*0.4),'#ff6a1a',0.9*a,0.9);uvGlow(sx,fy,R0*0.3*(1-k),'#fff2b0',a,0.9);
    uvWave(sx,sy,R0*1.3*uvEase(k*1.6),['#ffffff','#ffb03a','#8a3a10'],a,0.5);uvWave(sx,sy,R0*0.8*uvEase(k*2.4),['#ffd35a','#ff6a1a'],a*0.8,0.5);uvRing(sx,sy,R0*0.7,'#2a1a10',0.5*a,0.5,1,0,1.4,2);
    uvOnce(e,'s',()=>{shake=Math.max(shake,6);svSpray(px,py,26,['#ffffff','#ffd35a','#ff6a1a'],50,170,{vz:rf(20,90),g:-160});svSpray(px,py,16,['#5a4a3a','#3a2e24','#8a7a6a'],30,110,{vz:rf(40,100),g:-220,glow:false,l0:0.6,l1:1});for(let i=0;i<14;i++)part(px+rf(-20,20),py+rf(-8,8),rf(-10,10),rf(-4,4),pick(['#6a6a6a','#4a4a4a','#8a8a8a']),rf(1,1.8),{z:rf(4,20),vz:rf(12,26),glow:false});});},
  // ---- 백발귀 궁극기 ----
  ballet(e,t,px,py,sx,sy){const T=e.max,a=svFade(t,T,0.15,0.3);uvRing(sx,sy-8,24,'#fff2b0',0.45*a,0.6,1,t*6,3);uvRing(sx,sy,30,'#bfe3ff',0.35*a,0.5,1,-t*4,2.5);uvGlow(sx,sy-8,26,'#ffd35a',0.18*a,0.7);
    for(let j=0;j<2;j++){const q=t*11+j*Math.PI,x=sx+Math.cos(q)*11,y=sy-8+Math.sin(q)*6;if(Math.sin(t*40+j*2)>0.2)svStar(x,y,5,'#fff2b0',a);uvGlow(x,y,7,'#ffd35a',0.4*a,1);}
    if(a>0.3&&R()<0.6)part(px+rf(-6,6),py-8,rf(-50,50),rf(-20,20),pick(['#d4a43a','#ffd35a','#b08a2a']),rf(0.5,0.8),{z:8,vz:rf(30,60),g:-260,ground:true,glow:false});},
  tracer2(e,t,px,py,sx,sy,icx,icy){const T=e.max,k=t/T,a=1-k,[x1,y1]=W2S(e.x1,e.y1,icx,icy),[x2,y2]=W2S(e.x2,e.y2,icx,icy);svBeam(x1,y1,x2,y2,3*a,'#ffd35a','#ffffff',a);svStar(x2,y2,7*a+1,'#ffffff',a);svStar(x1,y1,5*a,'#fff2b0',a);},
  balletfin(e,t,px,py,sx,sy){const T=e.max,k=t/T,a=1-k;uvGlow(sx,sy-8,40,'#ffd35a',0.7*a,0.8);for(let i=0;i<24;i++){const q=i/24*6.28+uvH(i)*0.1,r1=12+90*uvEase(k*1.4),r2=r1+16;svBeam(sx+Math.cos(q)*r1,sy-8+Math.sin(q)*r1*0.55,sx+Math.cos(q)*r2,sy-8+Math.sin(q)*r2*0.55,2,'#ffd35a','#ffffff',a);}
    uvWave(sx,sy,96*uvEase(k*1.3),['#ffffff','#ffd35a','#b08a2a'],a,0.5);uvOnce(e,'s',()=>svSpray(px,py-8,30,['#ffffff','#ffd35a','#ff8a3a'],60,180,{}));},
};
// ===== 3차 각성 스킬 이펙트 (awkOp → sv) : 각성 색(e.c) + 스킬별(e.sid) 특화 =====
function svMix(h,t,f){const a=parseInt(h.slice(1,7),16),b=parseInt(t.slice(1,7),16);const m=(s)=>Math.round(((a>>s)&255)*(1-f)+((b>>s)&255)*f);return '#'+((1<<24)|(m(16)<<16)|(m(8)<<8)|m(0)).toString(16).slice(1);}
function svCs(c){return [svMix(c,'#ffffff',0.7),c,svMix(c,'#000000',0.55)];}
Object.assign(SV,{
  awcone(e,t,px,py,sx,sy){const T=e.max,c=e.c,L=svMix(c,'#ffffff',0.75),r=e.r||50;
    if(e.w){const p=uvEase(t/0.18),al=t<0.18?1:1-(t-0.18)/(T-0.18);for(let j=0;j<2;j++)svSlash(sx,sy-6,j*Math.PI+t*7+(e.a||0),r,11,3.3,c,L,al,p,0.6);uvWave(sx,sy,r*1.1*uvEase(t/T*1.4),svCs(c),al,0.5);
      if(e.sid==='awSunWheel'){uvGlow(sx,sy-6,r*0.6,'#ffd35a',0.5*al,0.7);for(let i=0;i<12;i++){const q=i/12*6.28+t*5;uvFlame(sx+Math.cos(q)*r*0.75,sy+Math.sin(q)*r*0.38,8*al,3,['#fff2b0','#ffb03a','#ff4a1a'],al,t,i);}}return;}
    const arc=Math.min(3.2,(e.arc||1)*1.9),p=uvEase(t/0.1),al=t<0.1?1:1-(t-0.1)/(T-0.1);
    if(e.sid==='awBloodmoon'){const mr=16*uvEase(t/0.15);uvGlow(sx+Math.cos(e.a)*r*0.5,sy-24,mr*2.2,'#ff2a3a',0.6*al,1);uvAdd();wx.globalAlpha=al;wx.fillStyle='#ff5a5a';wx.beginPath();wx.arc(sx+Math.cos(e.a)*r*0.5,sy-24,mr,0,6.28);wx.fill();uvNorm();}
    svSlash(sx,sy-8,e.a,r,14,arc,c,L,al,p,0.6);svSlash(sx,sy-8,e.a,r*0.78,7,arc*0.85,svMix(c,'#000000',0.3),c,al*0.8,p,0.6);
    if(e.sid==='awBeastFang'){for(let j=-1;j<=1;j++){const q=e.a+j*0.25,x1=sx+Math.cos(q)*r*0.4,y1=sy-8+Math.sin(q)*r*0.25,x2=sx+Math.cos(q)*r*1.05,y2=sy-8+Math.sin(q)*r*0.6;svBeam(x1,y1,x1+(x2-x1)*p,y1+(y2-y1)*p,3,c,'#ffffff',al);}}
    uvOnce(e,'s',()=>svSpray(px+Math.cos(e.a)*r*0.6,py+Math.sin(e.a)*r*0.3,12,[c,L,'#ffffff'],40,120,{a:e.a,sp:0.9,g:-140,vz:rf(20,50)}));},
  awnova(e,t,px,py,sx,sy){const T=e.max,k=t/T,a=1-k,c=e.c,cs=svCs(c),r=e.r||50;
    if(e.f==='quake'){for(let i=0;i<10;i++){const q=i/10*6.28+uvH(i+e.sd)*0.4;svBolt(sx,sy,sx+Math.cos(q)*r*uvEase(k*3),sy+Math.sin(q)*r*0.5*uvEase(k*3),'#8a6a4a',a,i*11+e.sd,5,8);}uvWave(sx,sy,r*1.2*uvEase(k*1.5),['#ffffff',c,'#3a2a1a'],a,0.5);if(e.sid==='awShieldQuake')svHex(sx,sy-14,14*(1+k),'#ffffff',a,1.1,c);
      uvOnce(e,'s',()=>{svSpray(px,py,24,['#8a7a6a','#5a4a3a','#b0a080'],30,120,{glow:false,g:-200,vz:rf(40,90),l0:0.5,l1:0.9});svSpray(px,py,10,[c,'#ffffff'],30,90,{});});return;}
    if(e.f==='lpillar'){const D=0.25;if(t<D){const q=t/D,y=sy-160*(1-q*q);wx.globalAlpha=1;wx.fillStyle='#5a3a1a';wx.fillRect(sx-1,Math.round(y-30),2,30);wx.fillStyle='#ffd35a';wx.fillRect(sx-2,Math.round(y-33),4,3);for(let cc=0;cc<10;cc++)for(let rr=0;rr<7;rr++){wx.fillStyle=rr<3?'#ffd35a':'#ff9a7a';wx.fillRect(sx+1+cc,Math.round(y-30+rr+Math.sin(cc*0.6+t*20)),1,1);}svBeam(sx,y-60,sx,y-30,4,'#ffe9a8','#ffffff',0.7);return;}
      const k2=(t-D)/(T-D),a2=1-k2;uvPillar(sx,sy,18*a2,170,'#ffe9a8',a2);uvWave(sx,sy,r*1.2*uvEase(k2*1.5),['#ffffff','#ffd35a','#d49a2a'],a2,0.5);wx.globalAlpha=a2;wx.fillStyle='#5a3a1a';wx.fillRect(sx-1,sy-30,2,30);for(let cc=0;cc<10;cc++)for(let rr=0;rr<7;rr++){wx.fillStyle=rr<3?'#ffd35a':'#ff9a7a';wx.fillRect(sx+1+cc,Math.round(sy-30+rr+Math.sin(cc*0.6-t*6)*0.8),1,1);}
      uvOnce(e,'s',()=>{shake=Math.max(shake,4);svSpray(px,py,20,['#ffffff','#ffd35a'],40,130,{g:-150,vz:rf(20,70)});});return;}
    if(e.sid==='awAbyssBind'){const p=uvEase(t/0.25);uvGlow(sx,sy,r,'#3a1a5a',0.6*a,0.55);uvSigil(sx,sy,r*0.85,'#b05cff','#5a1a8a',a,0.55,p,-t*0.5,5);for(let i=0;i<6;i++){const q=i/6*6.28+0.3,x0=sx+Math.cos(q)*r*1.3,y0=sy+Math.sin(q)*r*0.7;const L=uvEase(t/0.3);for(let j=0;j<8;j++){const u=j/8*L;uvRing(x0+(sx-x0)*u,y0+(sy-y0)*u-4,2.2,'#c9a0e8',a,0.7,1,j,1);}}uvWave(sx,sy,r*uvEase(k*1.6),['#e6d0ff','#9a7ad8','#3a1a5a'],a,0.55);return;}
    if(e.sid==='awSolarPierce'){SV.sflare(e,t,px,py,sx,sy);return;}
    if(e.sid==='awBastion'){svHex(sx,sy-12,r*0.55*uvEase(k*2),'#ffffff',a,0.75,c);svHex(sx,sy-12,r*0.4*uvEase(k*2),c,a*0.7,0.75);}
    uvGlow(sx,sy-6,r*0.8,c,0.7*a*a,0.7);uvWave(sx,sy,r*1.15*uvEase(k*1.5),cs,a,0.55);uvWave(sx,sy,r*0.6*uvEase(k*2.2),[cs[0],c],a*0.7,0.55);
    uvOnce(e,'s',()=>svSpray(px,py-4,22,[cs[0],c,'#ffffff'],40,140,{vz:rf(10,50)}));},
  awzone(e,t,px,py,sx,sy){const T=e.max,r=e.r||46,c=e.c,a=svFade(t,T,0.25,0.5);
    if(e.sid==='awHuntField'){ULTV.killzone(e,t,px,py,sx,sy);return;}
    if(e.sid==='awCrimson'){uvGlow(sx,sy,r*1.1,'#7a0a14',0.4*a,0.6);uvBand(sx,sy,r*0.9,10,'#ff2a3a',0.45*a,0.5);for(let j=0;j<3;j++)svSlash(sx,sy-6,j*2.094+t*9,r*0.95,9,1.8,'#ff3a4a','#ffd0c0',0.9*a,1,0.55);
      if(a>0.3&&R()<0.8){const q=R()*6.28;part(px+Math.cos(q)*r*0.9,py+Math.sin(q)*r*0.45,-Math.sin(q)*60,Math.cos(q)*30,pick(['#ff3a4a','#b3282b','#ffd0c0']),rf(0.3,0.6),{z:rf(4,14),glow:true});}return;}
    uvSigil(sx,sy,r,c,svMix(c,'#000000',0.4),0.6*a,0.55,uvEase(t/0.4),t*0.1,6);uvGlow(sx,sy,r,c,0.25*a,0.55);},
  awpbuff(e,t,px,py,sx,sy){const T=e.max,k=t/T,a=1-k,c=e.c,r=e.r||90;uvBand(sx,sy,r*uvEase(k*1.4),10,c,0.6*a,0.5);uvRing(sx,sy,r*uvEase(k*1.4),'#ffffff',0.7*a,0.5,1,0,2);
    for(let j=0;j<3;j++){const yy=sy-26-j*7-((t*40)%7);uvAdd();uvLine(sx-5,yy+4,sx,yy,c,a);uvLine(sx,yy,sx+5,yy+4,c,a);uvNorm();}
    uvOnce(e,'s',()=>svSpray(px,py,16,[c,'#ffffff'],10,50,{vz:rf(25,50)}));},
  awshield(e,t,px,py,sx,sy){const T=e.max,a=svFade(t,T,0.08,0.5),k=uvEase(t/0.25),c=e.c;svHex(sx,sy-12,15*k,'#ffffff',a,1.1,c);svHex(sx,sy-12,11*k,c,a*0.7,1.1);uvGlow(sx,sy-12,18,c,0.35*a,1);for(let i=0;i<3;i++){const q=t*3+i*2.09;svStar(sx+Math.cos(q)*15,sy-12+Math.sin(q)*16,2.5,'#ffffff',a);}},
  awheal(e,t,px,py,sx,sy){const T=e.max,a=svFade(t,T,0.05,0.4),r=e.r||110;
    for(let i=0;i<26;i++){const st=uvH(i+e.sd)*0.6,kk=(t-st)/0.32;if(kk<0||kk>1)continue;const q=uvH(i*3+e.sd)*6.28,d=Math.sqrt(uvH(i*7+e.sd))*r*0.9,x=sx+Math.cos(q)*d,y=sy+Math.sin(q)*d*0.5;const fy=y-120*(1-kk);svBeam(x,fy-24,x,fy,3,'#fff2b0','#ffffff',0.9);if(kk>0.85){uvRing(x,y,5,'#ffffff',1,0.5,1,0,1.2);uvGlow(x,y,8,'#fff2b0',0.6,0.5);}}
    uvGlow(sx,sy,r*0.8,'#fff2b0',0.3*a,0.5);uvRing(sx,sy,r,'#ffe9a8',0.6*a,0.5,uvEase(t/0.4),0,2);SV.gheal(e,Math.min(t,e.max-0.01),px,py,sx,sy);},
  awhot(e,t,px,py,sx,sy){const T=e.max,a=svFade(t,T,0.05,0.4),r=(e.r||110)*0.6;uvBand(sx,sy,r*uvEase(t/0.5),8,'#fff2b0',0.45*a,0.5);for(let i=0;i<6;i++){const q=uvH(i+e.sd)*6.28,d=uvH(i*5+e.sd)*r,x=sx+Math.cos(q)*d,y=sy+Math.sin(q)*d*0.5-t*30;uvAdd();wx.globalAlpha=a;wx.fillStyle='#fff2b0';wx.fillRect(Math.round(x-2),Math.round(y),5,1);wx.fillRect(Math.round(x),Math.round(y-2),1,5);uvNorm();}},
  awdash(e,t,px,py,sx,sy,icx,icy){const T=e.max,k=t/T,a=1-k,c=e.c,[x1,y1]=W2S(e.x1,e.y1,icx,icy),[x2,y2]=W2S(e.x2,e.y2,icx,icy);svBeam(x1,y1-8,x2,y2-8,13*Math.pow(a,0.7),c,'#ffffff',a);
    const ghosts=e.sid==='awPhantomStep'?5:3;for(let i=1;i<=ghosts;i++){const u=i/(ghosts+1),gx=x1+(x2-x1)*u,gy=y1+(y2-y1)*u;uvAdd();wx.globalAlpha=0.5*a*u;wx.fillStyle=c;wx.beginPath();wx.ellipse(gx,gy-10,4,9,0,0,6.28);wx.fill();wx.beginPath();wx.arc(gx,gy-21,3,0,6.28);wx.fill();uvNorm();}
    uvWave(x2,y2,26*uvEase(k*1.8),svCs(c),a,0.5);
    if(e.sid==='awDawnCharge'){for(let i=0;i<5;i++){const u=i/5,gx=x1+(x2-x1)*u,gy=y1+(y2-y1)*u;uvPillar(gx,gy,4*a,30,'#ffe9a8',a*0.6);}}
    uvOnce(e,'s',()=>svSpray(e.x2,e.y2-6,14,[c,'#ffffff'],30,110,{a:e.a,sp:0.8}));},
  awbeam(e,t,px,py,sx,sy,icx,icy){const T=e.max,k=t/T,a=1-k,c=e.c,[x1,y1]=W2S(e.x1,e.y1,icx,icy),[x2,y2]=W2S(e.x2,e.y2,icx,icy),w=e.w||12,p=uvEase(t/0.08);const ex=x1+(x2-x1)*p,ey=y1+(y2-y1)*p;
    svBeam(x1,y1,ex,ey,w*1.4*Math.pow(a,0.6),c,'#ffffff',a);svBeam(x1,y1,ex,ey,w*0.5*a,'#ffffff','#ffffff',a);uvGlow(x1,y1,16,c,0.7*a,1);
    if(e.sid==='awStarBeam'){for(let i=1;i<7;i++){const u=i/7;if(u>p)break;svStar(x1+(x2-x1)*u,y1+(y2-y1)*u+Math.sin(i*2+t*12)*5,4*a+1,'#ffffff',a);}}
    else{const an=Math.atan2(y2-y1,x2-x1);for(let i=0;i<6;i++){const u=(i+0.5)/6;const cx=x1+(x2-x1)*u,cy=y1+(y2-y1)*u,s=8*(1+k);uvLine(cx-Math.sin(an)*s,cy+Math.cos(an)*s,cx+Math.sin(an)*s,cy-Math.cos(an)*s,'#ffffff',a*0.8);}}
    uvOnce(e,'s',()=>{for(let i=0;i<16;i++){const u=R();svSpray(e.x1+(e.x2-e.x1)*u,e.y1+(e.y2-e.y1)*u,1,[c,'#ffffff'],10,50,{});}});},
  awdrop(e,t,px,py,sx,sy){const T=e.max,F=e.fall||0,c=e.c,r=e.r||20,f=e.f;
    if(f==='kslash'){const p=uvEase(t/0.08),al=t<0.08?1:1-(t-0.08)/(T-0.08),q=uvH(e.sd)*3.14;svSlash(sx,sy-6,q,r*1.2,6,1.8,c,'#ffffff',al,p,0.6);svSlash(sx,sy-6,q+Math.PI,r*1.2,6,1.8,c,'#ffffff',al,p,0.6);svStar(sx,sy-6,8*al,'#ffffff',al);return;}
    if(t<F){const q=t/F;
      if(f==='smite'){uvSigil(sx,sy,r,'#ffd35a','#d49a2a',0.8,0.55,uvEase(q*1.4),q,4);svBeam(sx,sy-170*(1-q)-30,sx,sy-170*(1-q),6,'#ffe9a8','#ffffff',0.9);return;}
      if(f==='boomfire'){const big=e.sid==='awMeteorFall';const hx=sx+60*(1-q),hy=sy-160*(1-q*q);uvRing(sx,sy,r,'#ff6a1a',0.5*q,0.55,1,0,2);
        if(big){uvGlow(hx,hy,16,'#ff6a1a',0.9,1);svBeam(hx+30,hy-50,hx,hy,10,'#ff8a3a','#ffd35a',0.8);wx.globalAlpha=1;wx.fillStyle='#3a1a10';wx.beginPath();wx.arc(hx,hy,5,0,6.28);wx.fill();uvRing(hx,hy,5,'#ffd35a',1,1,1,0,1);if(R()<0.9)part(px+60*(1-q),py,rf(-10,10),0,pick(['#ff6a1a','#ffd35a','#8a3a1a']),0.4,{z:160*(1-q*q),vz:10,glow:true});}
        else{wx.globalAlpha=1;wx.fillStyle='#2a2a2a';wx.fillRect(Math.round(hx-2),Math.round(hy-3),4,6);uvGlow(hx,hy+3,5,'#ffb03a',0.8,1);if(R()<0.7)part(px+60*(1-q),py,rf(-4,4),0,pick(['#8a8a8a','#6a6a6a']),0.5,{z:160*(1-q*q),vz:5,glow:false});}return;}
      if(e.sid==='awConstellation'){const hx=sx+50*(1-q),hy=sy-8-150*(1-q);svBeam(hx+20,hy-50,hx,hy,4,'#c9a0e8','#ffffff',0.8);svStar(hx,hy,5,'#ffffff',1);return;}
      if(e.sid==='awEagleRain'){const hx=sx-40*(1-q),hy=sy-8-140*(1-q*q);svBeam(hx-14,hy-46,hx,hy,4,'#ffe9a8','#ffffff',0.8);const fl=Math.sin(t*30);wx.globalAlpha=1;wx.fillStyle='#e6dcc3';wx.fillRect(Math.round(hx-1),Math.round(hy-2),3,4);wx.fillStyle='#ffd35a';for(let j=1;j<5;j++){wx.fillRect(Math.round(hx-1-j),Math.round(hy-2-j-fl),1,1);wx.fillRect(Math.round(hx+1+j),Math.round(hy-2-j-fl),1,1);}return;}
      return;}
    const k=(t-F)/(T-F),a=1-k;
    if(f==='smite'){uvPillar(sx,sy,12*a,150,'#ffd35a',a);uvSigil(sx,sy,r,'#ffd35a','#d49a2a',0.8*a,0.55,1,0.5,4);uvWave(sx,sy,r*1.4*uvEase(k*1.6),['#ffffff','#ffd35a','#d49a2a'],a,0.55);uvOnce(e,'s',()=>svSpray(px,py,14,['#ffffff','#ffd35a'],30,110,{g:-140,vz:rf(20,60)}));return;}
    if(f==='boomfire'){const big=e.sid==='awMeteorFall';e._o=e._o||{};SV.siegeboom(Object.assign({},e,{max:T-F,r:r*(big?1.4:1)}),t-F,px,py,sx,sy);if(big)for(let i=0;i<8;i++){const q=i/8*6.28;uvFlame(sx+Math.cos(q)*r*0.6,sy+Math.sin(q)*r*0.3,10*a,3,['#ffe08a','#ff6a1a','#8a1a10'],a,t,i);}return;}
    if(e.sid==='awConstellation'){e._o=e._o||{};SV.starburst(Object.assign({},e,{max:T-F,r:r*1.4}),t-F,px,py,sx,sy);return;}
    svStar(sx,sy-6,14*a+2,'#ffffff',a);uvGlow(sx,sy-6,r,c,0.6*a,0.8);uvWave(sx,sy,r*1.4*uvEase(k*1.6),svCs(c),a,0.55);uvOnce(e,'s',()=>svSpray(px,py-6,12,[c,'#ffffff'],30,110,{}));},
  awchain(e,t,px,py,sx,sy,icx,icy){const T=e.max,a=svFade(t,T,0.05,0.35),P=e.pts||[],p=uvEase(t/0.2)*(P.length-1);const c=e.c;
    for(let i=0;i<P.length-1;i++){const lp=Math.max(0,Math.min(1,p-i));if(lp<=0)break;const [x1,y1]=W2S(P[i][0],P[i][1],icx,icy),[x2,y2]=W2S(P[i+1][0],P[i+1][1],icx,icy);const ex=x1+(x2-x1)*lp,ey=y1+(y2-y1)*lp;const L=Math.hypot(ex-x1,ey-y1),an=Math.atan2(ey-y1,ex-x1);
      for(let d=0;d<L;d+=5){const x=x1+Math.cos(an)*d,y=y1+Math.sin(an)*d+Math.sin(d*0.2+t*8)*1.2;uvAdd();wx.globalAlpha=a;wx.strokeStyle=(d/5)%2?c:'#ffffff';wx.lineWidth=1;wx.beginPath();wx.ellipse(x,y,3,1.6,an+((d/5)%2?Math.PI/2:0)*0,0,6.28);wx.stroke();uvNorm();}
      if(lp>=1){uvGlow(x2,y2,12,c,0.7*a,1);uvSigil(x2,y2+6,10,c,'#ffffff',a,0.55,1,t,4);}}},
  awmuzzle(e,t,px,py,sx,sy){const T=e.max,k=t/T,a=1-k,c=e.c,hx=sx+Math.cos(e.a)*10,hy=sy-10+Math.sin(e.a)*6;
    if(e.sid==='awPierceShot'){svBeam(hx,hy,hx+Math.cos(e.a)*320,hy+Math.sin(e.a)*320*0.9,7*Math.pow(a,0.6),'#ffe9a8','#ffffff',a);uvRing(hx,hy,6+18*k,'#ffffff',a,1,1,0,1.5);uvRing(hx+Math.cos(e.a)*30,hy+Math.sin(e.a)*27,4+12*k,'#ffe9a8',a,1,1,0,1.5);return;}
    if(e.sid==='awTriElement'){const C=['#ff6a1a','#8fd0ff','#c9a0ff'][(e.i|0)%3];uvGlow(hx,hy,14,C,0.8*a,1);svStar(hx,hy,8*a,'#ffffff',a);return;}
    if(e.sid==='awSoulBurst'){uvGlow(hx,hy,16,'#7a3a8c',0.9*a,1);for(let i=0;i<6;i++){const q=i/6*6.28+t*10;uvPx(hx+Math.cos(q)*8*(1-k),hy+Math.sin(q)*8*(1-k),'#e6d0ff',a,2);}return;}
    if(e.sid==='awSiegeShell'){const ml=30*(1-k*0.6);uvAdd();wx.globalAlpha=a;wx.fillStyle='#ffb03a';wx.beginPath();wx.moveTo(hx,hy);wx.lineTo(hx+Math.cos(e.a-0.4)*ml,hy+Math.sin(e.a-0.4)*ml);wx.lineTo(hx+Math.cos(e.a)*ml*1.5,hy+Math.sin(e.a)*ml*1.5);wx.lineTo(hx+Math.cos(e.a+0.4)*ml,hy+Math.sin(e.a+0.4)*ml);wx.closePath();wx.fill();uvNorm();uvGlow(hx,hy,20,'#ffd35a',0.8*a,1);uvOnce(e,'s',()=>{shake=Math.max(shake,4);svSpray(px,py-10,10,['#9a9a9a','#7a7a7a'],20,60,{a:e.a+Math.PI,sp:0.8,glow:false,l0:0.5,l1:0.9});});return;}
    svStar(hx,hy,6*a+1,'#ffffff',a);uvGlow(hx,hy,8,c,0.6*a,1);svBeam(hx,hy,hx+Math.cos(e.a)*60,hy+Math.sin(e.a)*54,2*a,c,'#ffffff',a*0.7);},
});
// ===== 1차 스킬 시그니처 이펙트 =====
Object.assign(SV,{
  selfbuff(e,t,px,py,sx,sy){const T=e.max,k=t/T,a=1-k,c=e.c||'#ffd35a',cs=svCs(c);uvBand(sx,sy,(e.r?Math.min(e.r,70):34)*uvEase(k*1.6),8,c,0.55*a,0.5);uvGlow(sx,sy-12,26,c,0.45*a,0.9);
    for(let i=0;i<10;i++){const q=i/10*6.28;uvFlame(sx+Math.cos(q)*11,sy+Math.sin(q)*5,(9+7*Math.sin(t*12+i))*a,3,cs,a*0.85,t,i);}
    for(let j=0;j<3;j++){const yy=sy-30-j*7-((t*44)%7);uvAdd();uvLine(sx-5,yy+4,sx,yy,cs[0],a);uvLine(sx,yy,sx+5,yy+4,cs[0],a);uvNorm();}
    uvOnce(e,'s',()=>svSpray(px,py,16,[c,cs[0],'#ffffff'],10,60,{vz:rf(30,60)}));},
  arrowrain(e,t,px,py,sx,sy){const T=e.max,r=e.r||34,a=svFade(t,T,0.15,0.3);uvRing(sx,sy,r,'#e6dcc3',0.5*a,0.55,uvEase(t/0.3),0,2);uvGlow(sx,sy,r,'#ffe9a8',0.15*a,0.55);
    for(let i=0;i<14;i++){const ph=(t*3.2+uvH(i+e.sd))%1;const q=uvH(i*3+Math.floor(t*3.2+uvH(i+e.sd))+e.sd)*6.28,d=Math.sqrt(uvH(i*7+Math.floor(t*3.2+uvH(i+e.sd))))*r,x=sx+Math.cos(q)*d,y=sy+Math.sin(q)*d*0.55;
      if(ph<0.7){const u=ph/0.7,hy=y-90*(1-u);uvLine(x+10*(1-u)+3,hy-8,x+10*(1-u),hy,'#e6dcc3',a);uvPx(x+10*(1-u),hy,'#ffffff',a);}else{const u=(ph-0.7)/0.3;uvLine(x,y,x+1,y-5,'#9e937a',a*(1-u));uvRing(x,y,2+u*4,'#e6dcc3',a*(1-u),0.5,1,0,1);}}},
  frostnova(e,t,px,py,sx,sy){const T=e.max,k=t/T,a=1-k,r=e.r||60;uvWave(sx,sy,r*uvEase(k*1.5),['#ffffff','#8fd0ff','#3a6fb8'],a,0.55);uvGlow(sx,sy-6,r*0.6,'#bfe3ff',0.5*a,0.6);
    for(let i=0;i<16;i++){const q=i/16*6.28+uvH(i)*0.2,rr=r*uvEase(k*1.5)*(0.7+uvH(i+3)*0.25),x=sx+Math.cos(q)*rr,y=sy+Math.sin(q)*rr*0.55,h=(6+uvH(i+9)*8)*a;svBeam(x,y,x,y-h,4,'#8fd0ff','#ffffff',a);}
    uvOnce(e,'s',()=>svSpray(px,py,24,['#ffffff','#bfe3ff','#8fd0ff'],40,140,{vz:rf(10,40)}));},
  frostzone(e,t,px,py,sx,sy){const T=e.max,r=e.r||60,a=svFade(t,T,0.3,0.5);uvGlow(sx,sy,r,'#8fd0ff',0.25*a,0.55);uvRing(sx,sy,r,'#bfe3ff',0.6*a,0.55,uvEase(t/0.4),t*0.3,2);uvSigil(sx,sy,r*0.6,'#bfe3ff','#3a6fb8',0.4*a,0.55,uvEase(t/0.6),-t*0.2,6);
    for(let i=0;i<22;i++){const ph=(t*0.9+uvH(i+e.sd))%1,q=uvH(i*5+e.sd)*6.28,d=Math.sqrt(uvH(i*3+e.sd))*r,x=sx+Math.cos(q)*d+Math.sin(t*2+i)*6,y=sy+Math.sin(q)*d*0.55-60*(1-ph);uvPx(x,y,i%3?'#ffffff':'#bfe3ff',a*Math.sin(ph*Math.PI),i%4?1:2);}
    if(a>0.3&&R()<0.25){const q=R()*6.28,d=R()*r;part(px+Math.cos(q)*d,py+Math.sin(q)*d*0.55,rf(-20,20),0,'#ffffff',0.6,{z:rf(10,30),vz:-10,glow:true});}},
  vortex(e,t,px,py,sx,sy){const T=e.max,r=e.r||46,a=svFade(t,T,0.3,0.4);const g=wx.createRadialGradient(sx,sy-6,0,sx,sy-6,r*0.6);g.addColorStop(0,'rgba(0,0,0,0.95)');g.addColorStop(0.6,'rgba(30,10,50,0.7)');g.addColorStop(1,'rgba(60,20,100,0)');wx.globalAlpha=a;wx.fillStyle=g;wx.beginPath();wx.ellipse(sx,sy-6,r*0.6,r*0.42,0,0,6.28);wx.fill();
    for(let j=0;j<3;j++)uvRing(sx,sy-6,r*(0.35+j*0.22),j%2?'#c9a0ff':'#7a3a8c',0.7*a,0.6,0.8,t*(3-j)*(j%2?-1:1),2);
    for(let i=0;i<30;i++){const u=((t*0.8+uvH(i+e.sd))%1),q=uvH(i*3+e.sd)*6.28+u*8,rr=r*1.1*(1-u);uvPx(sx+Math.cos(q)*rr,sy-6+Math.sin(q)*rr*0.6,i%3?'#c9a0ff':'#ffffff',a*u,1);}
    uvGlow(sx,sy-6,10,'#ffffff',0.4*a,1);},
  blinkfx(e,t,px,py,sx,sy,icx,icy){const T=e.max,k=t/T,a=1-k,c=e.c||'#c9a0ff',[x1,y1]=W2S(e.x1,e.y1,icx,icy),[x2,y2]=W2S(e.x2,e.y2,icx,icy);for(const [x,y] of [[x1,y1],[x2,y2]]){uvRing(x,y-10,6+16*k,c,a,1,1,0,1.5);uvGlow(x,y-10,14,c,0.6*a,1);}
    for(let i=1;i<6;i++){const u=i/6;uvPx(x1+(x2-x1)*u+Math.sin(i*3+t*20)*2,y1-10+(y2-y1)*u,'#ffffff',a,2);}uvOnce(e,'s',()=>{svSpray(e.x1,e.y1-10,12,[c,'#ffffff'],20,70,{});svSpray(e.x2,e.y2-10,12,[c,'#ffffff'],20,70,{});});},
  healspot(e,t,px,py,sx,sy){const T=e.max,k=t/T,a=svFade(t,T,0.05,0.5);uvPillar(sx,sy,10*(1-k*0.5),70,'#d8ffb0',a);uvRing(sx,sy,30*uvEase(t/0.3),'#c8ffb0',0.8*a,0.55,1,0,1.5);
    for(let i=0;i<5;i++){const st=i*0.08,kk=(t-st)/0.6;if(kk<0||kk>1)continue;const x=sx+(uvH(i+e.sd)-0.5)*30,y=sy-6-kk*28,al=Math.sin(kk*Math.PI);uvAdd();wx.globalAlpha=al;wx.fillStyle='#c8ffb0';wx.fillRect(Math.round(x-3),Math.round(y),7,2);wx.fillRect(Math.round(x),Math.round(y-3),2,8);uvNorm();}},
  lpzone(e,t,px,py,sx,sy){const T=e.max,r=e.r||30,a=svFade(t,T,0.25,0.6),br=0.8+0.2*Math.sin(t*3);uvPillar(sx,sy,r*0.7*br,130,'#fff2c0',0.55*a);uvSigil(sx,sy,r,'#ffe9a8','#d49a2a',0.7*a,0.55,uvEase(t/0.4),t*0.2,6);uvGlow(sx,sy,r,'#ffd35a',0.3*a,0.55);
    if(a>0.3&&R()<0.5)part(px+rf(-r,r)*0.6,py+rf(-r,r)*0.3,0,0,pick(['#ffffff','#fff2c0']),rf(0.6,1),{z:1,vz:rf(30,60),glow:true});},
  gale(e,t,px,py,sx,sy){const T=e.max,a=svFade(t,T,0.1,0.4),cx=sx+(e.vx||0)*t,cy=sy+(e.vy||0)*t,r=e.r||26;uvGlow(cx,cy-8,r,'#bfe3ff',0.3*a,0.8);
    for(let j=0;j<4;j++)svSlash(cx,cy-8,t*10+j*1.57,r*(0.6+j*0.13),3,2.2,'#e6f4ff','#ffffff',0.7*a,1,0.6);for(let i=0;i<8;i++){const q=t*9+i*0.78,rr=r*(1-((t*2+i/8)%1));uvPx(cx+Math.cos(q)*rr,cy-8+Math.sin(q)*rr*0.6,'#ffffff',a,1);}},
});
{const _z=SV.awzone;SV.awzone=function(e,t,px,py,sx,sy){if(e.st==='blades'){const T=e.max,r=e.r||36,c=e.c,a=svFade(t,T,0.2,0.4);uvBand(sx,sy,r*0.9,8,c,0.35*a,0.5);for(let j=0;j<3;j++)svSlash(sx,sy-6,j*2.094+t*10,r,7,1.6,c,'#ffffff',0.85*a,1,0.55);
  if(a>0.3&&R()<0.5){const q=R()*6.28;part(px+Math.cos(q)*r,py+Math.sin(q)*r*0.5,-Math.sin(q)*50,Math.cos(q)*25,pick([c,'#ffffff']),rf(0.2,0.4),{z:rf(4,12),glow:true});}return;}return _z(e,t,px,py,sx,sy);};}
{const _c=SV.awchain;SV.awchain=function(e,t,px,py,sx,sy,icx,icy){if(!e.bolt)return _c(e,t,px,py,sx,sy,icx,icy);const T=e.max,a=1-t/T,P=e.pts||[];for(let i=0;i<P.length-1;i++){const [x1,y1]=W2S(P[i][0],P[i][1],icx,icy),[x2,y2]=W2S(P[i+1][0],P[i+1][1],icx,icy);svBolt(x1,y1,x2,y2,e.c||'#bfe3ff',a,i*17+Math.floor(t*30),6,10);uvGlow(x2,y2,10,'#bfe3ff',0.6*a,1);}};}
Object.assign(SV,{arrowfan(e,t,px,py,sx,sy){const T=e.max,n=e.n||1,sp=e.sp||0,c=e.c||'#ffe9a8',hx=sx+Math.cos(e.a)*6,hy=sy-8+Math.sin(e.a)*4,p=uvEase(t/0.12),a=t<0.12?1:1-(t-0.12)/(T-0.12);
  for(let i=0;i<n;i++){const q=e.a+(i-(n-1)/2)*sp,L=110*p;svBeam(hx+Math.cos(q)*L*0.35,hy+Math.sin(q)*L*0.35*0.9,hx+Math.cos(q)*L,hy+Math.sin(q)*L*0.9,2.5,c,'#ffffff',a);}
  uvGlow(hx,hy,10,c,0.6*a,1);svStar(hx,hy,5*a,'#ffffff',a);if(c==='#7fd05a'&&R()<0.6)part(px+Math.cos(e.a)*rf(10,90),py-8+Math.sin(e.a)*rf(10,90)*0.9,rf(-8,8),rf(-8,8),pick(['#7fd05a','#3f7a2c','#c8f08a']),rf(0.4,0.8),{z:rf(2,8),vz:rf(4,12),glow:true});}});
function drawUltWorld(icx,icy){for(let i=UFX.length-1;i>=0;i--){const e=UFX[i];const t=time-e.t0;if(t>e.max){UFX.splice(i,1);continue;}const k=t/e.max;const sx=Math.round((e.x||0))-icx,sy=Math.round((e.y||0))-icy;
  if(e.type==='tgt'){const r=e.r;wx.globalAlpha=0.5+0.4*Math.sin(time*20);for(let n=0;n<80;n++){const a=n/80*Math.PI*2;wx.fillStyle=e.c;wx.fillRect(Math.round(sx+Math.cos(a)*r),Math.round(sy+Math.sin(a)*r*0.6),1,1);}wglow(sx,sy,r*k,e.c,0.12);wx.globalAlpha=1;}
  else if(e.type==='ragsword'){let y;if(t<0.55)continue;if(t<0.95){const kk=(t-0.55)/0.4;y=sy-170+kk*kk*170;}else y=sy;const a=t>1.6?Math.max(0,1-(t-1.6)/0.6):1;wx.globalAlpha=a;wglow(sx,sy-30,40,'#ff8a3a',0.18*a);wx.globalAlpha=a;wx.drawImage(RAG_SWORD,sx-11,Math.round(y)-118+(t>=0.95?24:0),22,118);wx.globalAlpha=1;
    if(R()<0.9)part(e.x+rf(-5,5),e.y-rf(10,60),rf(-10,10),0,pick(['o','y','e']),rf(.3,.7),{z:0,vz:rf(20,50),glow:true});if(t>=0.95&&t<1.05){for(let n=0;n<8;n++){const q=R()*Math.PI*2;part(e.x,e.y,Math.cos(q)*200,Math.sin(q)*120,pick(['w','y','o']),0.4,{z:2,glow:true});}}}
  else if(e.type==='fissure'){const rr=SH.mulberry(e.seed|0);const L=44;wx.globalAlpha=Math.min(1,(1-k)*2);for(let n=0;n<3;n++){let x=sx-Math.cos(e.a)*L/2,y=sy-Math.sin(e.a)*L/2*0.6;for(let s=0;s<L;s+=3){const aa=e.a+(rr()-0.5)*0.9;const nx=x+Math.cos(aa)*3,ny=y+Math.sin(aa)*1.8;wline(x,y+n-1,nx,ny+n-1,n===1?'#ffffff':'#ff8a3a');x=nx;y=ny;}}
    const h=Math.round(50*(1-k));for(let j=0;j<h;j+=2){wx.fillStyle=j<h*0.4?'#ffd35a':'#ff8a3a';wx.fillRect(sx-2+Math.round(Math.sin(j+time*30)),sy-j,4,2);}wglow(sx,sy,30,'#ff8a3a',0.25*(1-k));wx.globalAlpha=1;}
  else if(e.type==='dome'){const r=e.r,h=r*0.85;const fin=Math.min(1,t/0.4),fo=e.max-t<0.5?(e.max-t)/0.5:1;const a=fin*fo;wx.globalAlpha=0.13*a;wx.fillStyle='#ffe9a8';wx.beginPath();wx.ellipse(sx,sy,r,h,0,Math.PI,0);wx.ellipse(sx,sy,r,r*0.45,0,0,Math.PI);wx.fill();
    wx.globalAlpha=0.9*a;for(let n=0;n<140;n++){const q=Math.PI+n/140*Math.PI;wpx(Math.round(sx+Math.cos(q)*r),Math.round(sy+Math.sin(q)*h),n%3?'y':'w');}for(let n=0;n<120;n++){const q=n/120*Math.PI*2;wpx(Math.round(sx+Math.cos(q)*r),Math.round(sy+Math.sin(q)*r*0.45),'g');}
    for(let m2=0;m2<4;m2++){const lv=((m2/4)+time*0.3)%1;const rr2=r*Math.sqrt(1-lv*lv),yy=sy-h*lv;wx.globalAlpha=0.5*a*(1-lv);for(let n=0;n<60;n++){const q=n/60*Math.PI*2;wpx(Math.round(sx+Math.cos(q)*rr2),Math.round(yy+Math.sin(q)*rr2*0.35),'w');}}
    wx.globalAlpha=1;if(R()<0.6)part(e.x+rf(-r,r),e.y+rf(-r*0.4,r*0.4),0,0,pick(['y','w']),rf(.5,1),{z:0,vz:rf(15,35),glow:true});}
  else if(e.type==='burst'){const r=e.r*Math.min(1,k*1.6);wx.globalAlpha=1-k;for(let q=0;q<3;q++){const rr=r-q*6;if(rr<2)continue;for(let n=0;n<160;n++){const a=n/160*Math.PI*2;wx.fillStyle=e.cs[q];wx.fillRect(Math.round(sx+Math.cos(a)*rr),Math.round(sy-6+Math.sin(a)*rr*0.6),2,2);}}wglow(sx,sy-6,r,'#ffe9a8',0.35*(1-k));wx.globalAlpha=1;}
  else if(e.type==='hammer'){if(t<e.d){const kk=t/e.d;const y=sy-190+kk*kk*190;const sc=e.big?1.3:1;wx.globalAlpha=0.35;wglow(sx,sy,18*kk*sc,'#ffe9a8',0.4);wx.globalAlpha=1;drawRot(HAMMER,sx,Math.round(y),0,17,43,sc);}
    else{const kk=(t-e.d)/0.45;wx.globalAlpha=1-kk;drawRot(HAMMER,sx,sy,0,17,43,e.big?1.3:1);wx.globalAlpha=1;wglow(sx,sy,60*(0.5+kk),'#ffe9a8',0.35*(1-kk));for(let j=0;j<200;j+=2){wx.globalAlpha=(1-kk)*0.6;wx.fillStyle='#ffffff';wx.fillRect(sx-2,sy-j,4,2);}wx.globalAlpha=1;if(t-e.d<0.05)screenFlash=Math.max(screenFlash,e.big?0.22:0.12);}}
  else if(e.type==='dcharge'){const p=e.pid===myId?me:G.players.get(e.pid);if(!p)continue;const px=(e.pid===myId?me.x:p.dx)-icx,py=(e.pid===myId?me.y:p.dy)-icy-8;wglow(px,py,10+k*16,'#b8e070',0.3+0.3*k);for(let n=0;n<4;n++){const a=R()*Math.PI*2,d2=rf(20,40);part(px+icx+Math.cos(a)*d2,py+icy+Math.sin(a)*d2,-Math.cos(a)*d2*3,-Math.sin(a)*d2*3,pick(['z','y','w']),0.3,{z:0,glow:true});}}
  else if(e.type==='sv'){let px=e.x,py=e.y;if(e.id!=null){const pp=svPos(e.id);if(!pp)continue;[px,py]=pp;}if(px==null){px=e.x1||0;py=e.y1||0;}const f=SV[e.s];if(f){wx.save();try{f(e,t,px,py,Math.round(px)-icx,Math.round(py)-icy,icx,icy);}finally{wx.restore();wx.globalAlpha=1;}}}
  else if(e.type==='ultart'){let px=e.x,py=e.y;if(e.pid!=null){const pp=e.pid===myId?[me.x,me.y]:(G.players.get(e.pid)?[G.players.get(e.pid).dx,G.players.get(e.pid).dy]:null);if(!pp)continue;[px,py]=pp;}else if(e.mid!=null){const m=G.monsters.get(e.mid);if(!m)continue;px=m.dx;py=m.dy-12;}
    const f=ULTV[e.s];if(f){wx.save();try{f(e,t,px,py,Math.round(px)-icx,Math.round(py)-icy);}finally{wx.restore();wx.globalAlpha=1;}}}
  else if(e.type==='dragon'){{const src=`art/dragon${window.__dskin!=null?window.__dskin:DRAGON_SKIN}.png`;const DIMG=artOf(src);if(DIMG){drawDragonImg(e,DIMG,t,icx,icy);continue;}if(BIMG[src]!==false)continue;/* 아직 불러오는 중이면 예전 용을 그리지 않음 */}const dist=t*e.sp;const fade=t>e.len/e.sp?1-(t-e.len/e.sp)/0.35:1;if(fade<=0)continue;const ca=Math.cos(e.a),sa=Math.sin(e.a);const L=Math.min(dist,190);const s0=dist-L;
    const P=u=>{const s1=s0+u*L;const w=Math.sin(s1*0.045-t*9)*14*(1-u*0.55);return[e.x+ca*s1-sa*w-icx,e.y+sa*s1+ca*w-icy];};const N=40;const pts=[],nrm=[];for(let n=0;n<=N;n++){const u=n/N;pts.push(P(u));}
    for(let n=0;n<=N;n++){const a=pts[Math.max(0,n-1)],b=pts[Math.min(N,n+1)];const dx=b[0]-a[0],dy=b[1]-a[1],d=Math.hypot(dx,dy)||1;nrm.push([-dy/d,dx/d]);}
    const wid=u=>2+11*Math.pow(u,0.65);wx.globalAlpha=fade;
    for(let n=0;n<=N;n+=2){const u=n/N;wglow(pts[n][0],pts[n][1],wid(u)*2.2,'#6fd08a',0.12*fade);}
    const strip=(f0,f1,c)=>{wx.fillStyle=c;wx.beginPath();for(let n=0;n<=N;n++){const w=wid(n/N);wx.lineTo(pts[n][0]+nrm[n][0]*w*f0,pts[n][1]+nrm[n][1]*w*f0);}for(let n=N;n>=0;n--){const w=wid(n/N);wx.lineTo(pts[n][0]+nrm[n][0]*w*f1,pts[n][1]+nrm[n][1]*w*f1);}wx.closePath();wx.fill();};
    strip(-1.12,1.12,'#123a26');strip(-1,1,'#2f8a5a');strip(-1,-0.2,'#4fb878');strip(-0.95,-0.62,'#8fe0a8');strip(0.45,0.95,'#f2e0a0');
    for(let n=2;n<N;n+=2){const u=n/N,w=wid(u);const[x,y]=pts[n],[nx,ny]=nrm[n];wx.fillStyle=n%4?'#1f5a3a':'#3fa86a';wx.fillRect(Math.round(x-nx*w*0.3),Math.round(y-ny*w*0.3),2,1);
      const fl=4+Math.sin(time*25+n)*2+w*0.5;const bx=x-nx*w,by=y-ny*w;wx.fillStyle=n%4?'#ffd35a':'#ff8a3a';wx.beginPath();wx.moveTo(bx-ca*2,by-sa*2);wx.lineTo(bx-nx*fl-ca*4,by-ny*fl-sa*4);wx.lineTo(bx+ca*2,by+sa*2);wx.fill();}
    for(const u of[0.38,0.72]){const n=Math.round(u*N),w=wid(u);const[x,y]=pts[n],[nx,ny]=nrm[n];const lx=x+nx*w*1.1,ly=y+ny*w*1.1;const sw=Math.sin(time*14+u*9)*3;wx.strokeStyle='#2f8a5a';wx.lineWidth=2;wx.beginPath();wx.moveTo(x+nx*w*0.6,y+ny*w*0.6);wx.lineTo(lx+nx*4-ca*sw,ly+ny*4-sa*sw);wx.stroke();
      wx.fillStyle='#ffe9a8';for(const o of[-2,0,2])wx.fillRect(Math.round(lx+nx*5-ca*sw+ca*o),Math.round(ly+ny*5-sa*sw+sa*o),1,2);}
    {const[x,y]=pts[0];for(let k=0;k<6;k++){wx.fillStyle=k%2?'#ffd35a':'#ff8a3a';wx.fillRect(Math.round(x-ca*(3+k*2)+Math.sin(time*30+k)*2),Math.round(y-sa*(3+k*2)+Math.cos(time*30+k)*2),3,2);}}
    const[hx,hy]=pts[N];const ha=Math.atan2(pts[N][1]-pts[N-3][1],pts[N][0]-pts[N-3][0]);wglow(hx,hy,58,'#b8f0a0',0.45*fade);wx.globalAlpha=fade;drawRot(DRAGON_HEAD,hx+Math.cos(ha)*14,hy+Math.sin(ha)*14,ha,20,16,1.15);wx.globalAlpha=1;
    if(R()<0.95)part(hx+icx,hy+icy,rf(-40,40)-ca*60,rf(-40,40)-sa*60,pick(['z','y','w','o']),rf(.3,.7),{z:0,glow:true});}
  else if(e.type==='bigmeteor'){const kk=t/e.max;const x=sx-140*(1-kk),y=sy-200*(1-kk);wglow(sx,sy,40*kk,'#ff4a3a',0.25);for(let i=1;i<24;i++){const r2=Math.max(1,12-i*0.45);wx.globalAlpha=1-i/24;wx.fillStyle=i<6?'#ffd35a':i<14?'#ff8a3a':'#b3282b';wx.beginPath();wx.arc(x-i*3.5*0.7,y-i*3.5,r2,0,Math.PI*2);wx.fill();}wx.globalAlpha=1;
    wx.fillStyle='#5e1519';wx.beginPath();wx.arc(x,y,13,0,Math.PI*2);wx.fill();wx.fillStyle='#ff8a3a';wx.beginPath();wx.arc(x-2,y-2,10,0,Math.PI*2);wx.fill();wx.fillStyle='#ffd35a';wx.beginPath();wx.arc(x-3,y-3,5,0,Math.PI*2);wx.fill();}
  else if(e.type==='freeze'){const rr=SH.mulberry(e.seed|0);const a=Math.min(1,t/0.3);wglow(sx,sy,e.r,'#8fd0ff',0.16*a);for(let n=0;n<160;n++){const q=n/160*Math.PI*2;wpx(Math.round(sx+Math.cos(q)*e.r),Math.round(sy+Math.sin(q)*e.r*0.6),n%2?'c':'w');}
    for(let n=0;n<22;n++){const q=rr()*Math.PI*2,d2=Math.sqrt(rr())*e.r*0.95;const x=Math.round(sx+Math.cos(q)*d2),y=Math.round(sy+Math.sin(q)*d2*0.6);const h=Math.round((6+rr()*12)*a);for(let j=0;j<h;j++){const w=Math.max(0,Math.round((h-j)/h*3));wx.fillStyle=j>h-3?'#ffffff':'#8fd0ff';wx.fillRect(x-w,y-j,w*2+1,1);wx.fillStyle='#3a6fb8';wx.fillRect(x+w,y-j,1,1);}}
    for(const id of e.ids){const m=G.monsters.get(id);if(!m)continue;const mx=Math.round(m.dx)-icx,my=Math.round(m.dy)-icy;const big=isBossTc(m.tc);const w=big?30:12,h=big?40:18;wx.globalAlpha=0.45*a;wx.fillStyle='#8fd0ff';wx.fillRect(mx-w,my-h*2+2,w*2,h*2);wx.globalAlpha=0.9*a;wx.fillStyle='#ffffff';wx.fillRect(mx-w,my-h*2+2,w*2,1);wx.fillRect(mx-w,my-h*2+2,1,h*2);wx.globalAlpha=1;}}
  else if(e.type==='godburst'){const w=Math.round(14*(1-k))+2;wx.globalAlpha=1-k;wx.fillStyle='#ff4a3a';wx.fillRect(sx-w,0,w*2,sy);wx.fillStyle='#ffd35a';wx.fillRect(sx-Math.max(1,w>>1),0,Math.max(2,w),sy);wx.globalAlpha=1;wglow(sx,sy,50*(1-k)+10,'#ff4a3a',0.4*(1-k));}
  else if(e.type==='shard'){wx.globalAlpha=1-k;wx.fillStyle='#ffffff';const r=Math.round(4+k*10);for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]])wx.fillRect(sx+dx*r,sy-6+dy*r,2,2);wx.globalAlpha=1;}
  else if(e.type==='angel'){const p=e.pid===myId?me:G.players.get(e.pid);if(!p)continue;const px=Math.round(e.pid===myId?me.x:p.dx)-icx,py=Math.round(e.pid===myId?me.y:p.dy)-icy;const a=Math.min(1,t/0.6)*(e.max-t<0.8?(e.max-t)/0.8:1);const bob=Math.round(Math.sin(time*2.5)*3);
    {const g=wx.createLinearGradient(0,py-60,0,py+8);g.addColorStop(0,`rgba(255,246,208,${0.3*a})`);g.addColorStop(1,'rgba(255,246,208,0)');wx.fillStyle=g;wx.beginPath();wx.moveTo(px-8,py-60+bob);wx.lineTo(px+8,py-60+bob);wx.lineTo(px+44,py+8);wx.lineTo(px-44,py+8);wx.fill();}wglow(px,py-70+bob,40,'#ffe9a8',0.28*a);for(let n=0;n<60;n++){const q=n/60*Math.PI*2+time;wx.globalAlpha=0.6*a;wpx(Math.round(px+Math.cos(q)*26),Math.round(py+2+Math.sin(q)*9),n%2?'y':'w');}wx.globalAlpha=a;wx.drawImage(ANGEL_F[((time*3)|0)%2],px-36,py-108+bob);wx.globalAlpha=1;
    if(R()<0.5)part(p===me?me.x+rf(-30,30):p.dx+rf(-30,30),(p===me?me.y:p.dy)-rf(40,80),rf(-6,6),0,pick(['w','y']),rf(.8,1.4),{z:0,vz:-rf(8,16),glow:true});}
  else if(e.type==='dpillar'){const kk=Math.min(1,t/e.d);const a=t<e.d?kk:1-(t-e.d)/0.5;wx.globalAlpha=Math.max(0,a);const w=t<e.d?2+kk*3:6*(1-(t-e.d)/0.5)+1;for(let j=0;j<sy+10;j+=1){wx.fillStyle='#ffd35a';wx.fillRect(sx-w-1,sy-j,1,1);wx.fillRect(sx+w,sy-j,1,1);}wx.fillStyle='#ffffff';wx.fillRect(Math.round(sx-w/2),0,Math.max(1,Math.round(w)),sy);
    for(let n=0;n<40;n++){const q=n/40*Math.PI*2+time*3;wpx(Math.round(sx+Math.cos(q)*14),Math.round(sy+Math.sin(q)*8),n%2?'y':'w');}wglow(sx,sy,24,'#ffe9a8',0.3*Math.max(0,a));wx.globalAlpha=1;}
}}
function drawUltZone(z,icx,icy){const sx=Math.round(z.x)-icx,sy=Math.round(z.y)-icy;
  if(z.vis===10){const r=z.r;wglow(sx,sy,r,'#3a0a4a',0.35);wx.fillStyle='#0e0b12';wx.beginPath();wx.ellipse(sx,sy-4,r*0.32,r*0.32*0.8,0,0,Math.PI*2);wx.fill();for(let n=0;n<3;n++)for(let s=0;s<40;s++){const q=time*4+n/3*Math.PI*2+s*0.12,rr=r*0.3+s*0.9;wpx(Math.round(sx+Math.cos(q)*rr),Math.round(sy-4+Math.sin(q)*rr*0.6),s<8?'w':s%2?'P':'p');}
    for(let n=0;n<3;n++){const q=R()*Math.PI*2;part(z.x+Math.cos(q)*r,z.y+Math.sin(q)*r*0.6,-Math.cos(q)*r*1.8,-Math.sin(q)*r*1.1,pick(['p','P','w']),0.5,{z:4,glow:true});}}
  else if(z.vis===12){const r=z.r;for(let n=0;n<120;n++){const q=n/120*Math.PI*2;if(n%2)wpx(Math.round(sx+Math.cos(q)*r),Math.round(sy+Math.sin(q)*r*0.6),'y');}wglow(sx,sy,r,'#ffe9a8',0.08);
    for(let n=0;n<5;n++){const q=R()*Math.PI*2,d=Math.sqrt(R())*r;ufx({type:'streak',x:z.x+Math.cos(q)*d,y:z.y+Math.sin(q)*d*0.6,max:0.22});}}
  else if(z.vis===14){for(let n=0;n<3;n++)part(z.x+rf(-z.r,z.r)*0.8,z.y+rf(-z.r,z.r)*0.4,0,0,pick(['o','y','e','r']),rf(.3,.6),{z:0,vz:rf(20,45),glow:true});wglow(sx,sy,z.r,'#ff8a3a',0.12);}
  else if(z.vis===15){for(let n=0;n<120;n++){const q=n/120*Math.PI*2+time*0.5;if(n%3===0)wpx(Math.round(sx+Math.cos(q)*z.r),Math.round(sy+Math.sin(q)*z.r*0.6),'y');}}
  else if(z.vis===16){for(let l=0;l<5;l++){const rr=6+l*3,yy=sy-4-l*5;for(let n=0;n<24;n++){const q=n/24*Math.PI*2+time*(12+l*2);wpx(Math.round(sx+Math.cos(q)*rr),Math.round(yy+Math.sin(q)*rr*0.35),n%3?'w':'c');}}if(R()<0.8)part(z.x+rf(-14,14),z.y,rf(-40,40),0,pick(['W','S','w']),0.4,{z:rf(0,20),vz:rf(10,40)});}}
function drawUltStreaks(icx,icy){for(const e of UFX){if(e.type!=='streak')continue;const k=(time-e.t0)/e.max;if(k>1)continue;const sx=Math.round(e.x)-icx,sy=Math.round(e.y)-icy;const y0=sy-60*(1-k);wline(sx-20*(1-k),y0,sx-20*(1-k)+6,y0+12,'#ffffff');wline(sx-20*(1-k)+1,y0,sx-20*(1-k)+7,y0+12,'#ffd35a');if(k>0.85){wx.fillStyle='#ffffff';wx.fillRect(sx-1,sy-1,3,2);}}}
function ultLights(L,icx,icy){for(const e of UFX){const t=time-e.t0;if(t>e.max)continue;if(e.type==='ragsword'&&t>0.5)L.push({x:e.x-icx,y:e.y-30-icy,r:90,i:1});else if(e.type==='dome')L.push({x:e.x-icx,y:e.y-20-icy,r:e.r+30,i:0.9});else if(e.type==='hammer'||e.type==='dpillar')L.push({x:e.x-icx,y:e.y-icy,r:80,i:1});
  else if(e.type==='dragon'){const d=Math.min(e.len,t*e.sp);L.push({x:e.x+Math.cos(e.a)*d-icx,y:e.y+Math.sin(e.a)*d-icy,r:90,i:1});}else if(e.type==='angel'){const p=e.pid===myId?me:G.players.get(e.pid);if(p)L.push({x:(p===me?me.x:p.dx)-icx,y:(p===me?me.y:p.dy)-50-icy,r:140,i:1});}
  else if(e.type==='freeze'||e.type==='bigmeteor'||e.type==='fissure')L.push({x:e.x-icx,y:e.y-icy,r:e.r||70,i:0.9});}}
function drawUltScreen(){for(const e of UFX){const t=time-e.t0;if(t>e.max)continue;if(e.type==='redsky'){const a=Math.min(1,t/0.6)*(e.max-t<0.8?(e.max-t)/0.8:1);const g=ctx.createLinearGradient(0,0,0,H*SC);g.addColorStop(0,`rgba(160,20,10,${0.5*a})`);g.addColorStop(0.6,`rgba(120,20,10,${0.18*a})`);g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(0,0,W*SC,H*SC);}
  else if(e.type==='freeze'){const a=Math.min(1,t/0.3)*0.12;pr(0,0,W,H,`rgba(140,200,255,${a})`);}}
  const U=UCUT;if(!U)return;const t=time-U.t0;if(t>1.35){UCUT=null;return;}const cc=CLS_UC[U.cls]||'#ffd35a';const inA=Math.min(1,t/0.12),outA=t>1.05?1-(t-1.05)/0.3:1;
  const dimA=t<0.55?1:Math.max(0,1-(t-0.55)/0.3);pr(0,0,W,H,`rgba(5,4,8,${(U.mine?0.3:0.12)*inA*dimA})`);const off=Math.round((1-inA)*-480+(t>1.05?(t-1.05)/0.3*480:0));const y=U.mine?36:30,h=U.mine?26:18;
  ctx.globalAlpha=outA;pr(off,y-h/2,W,h,'rgba(10,6,14,0.85)');pr(off,y-h/2,W,2,cc);pr(off,y+h/2-2,W,2,cc);for(let i=0;i<14;i++){const x=((i*37+t*300)%(W+60))-30+off;pr(x,y-h/2+3,20,1,cc);}
  if(U.mine)bigTxt(U.n,240+off,y-1,16,'#ffffff',1.5);else txt(`${U.name} · ${U.n}`,240+off,y,13,'#ffffff','center');if(U.mine)txt('궁극기',240+off,y+h/2+7,10,cc,'center');ctx.globalAlpha=1;}
// 플레이어 연출 (전쟁신 거대화 · 라그나로크 도약)
function drawPlayer(p,icx,icy,isMe){const src=isMe?me:p;const pp=isMe?G.players.get(myId)||p:p;const god=(pp&&pp.god)||(src.godEnd&&time<src.godEnd);const rag=src.rag&&time-src.rag.t0<0.95?src.rag:null;
  const bx=Math.round(isMe?me.x:p.dx)-icx,by=Math.round(isMe?me.y:p.dy)-icy;
  if(!god&&!rag){drawPlayer0(p,icx,icy,isMe);return;}
  wx.save();if(rag){const kk=(time-rag.t0)/0.95;const cx=rag.ox+(rag.tx-rag.ox)*kk-icx,cy=rag.oy+(rag.ty-rag.oy)*kk-icy;const hgt=Math.sin(kk*Math.PI)*110;wx.translate(cx-bx,cy-by-hgt);if(R()<0.8)part(cx+icx,cy+icy-hgt-8,rf(-10,10),rf(10,30),pick(['o','y','w']),0.4,{z:0,glow:true});}
  if(god){for(let n=0;n<48;n++){const q=n/48*Math.PI*2+time*2;if((n+((time*8)|0))%4<2)continue;wpx(Math.round(bx+Math.cos(q)*20),Math.round(by+Math.sin(q)*8),n%3?'e':'y');}wglow(bx,by-18,26+Math.sin(time*10)*3,'#ff4a3a',0.28);const s=1.5;wx.translate(bx,by);wx.scale(s,s);wx.translate(-bx,-by);for(let n=0;n<2;n++)part((isMe?me.x:p.dx)+rf(-12,12),(isMe?me.y:p.dy)-rf(0,30),0,0,pick(['e','o','r','y']),rf(.3,.7),{z:0,vz:rf(25,55),glow:true});}
  drawPlayer0(p,icx,icy,isMe);wx.restore();}

// ================= 레이드 30·40·50 연출 =================
const PHASE_NM=['그믐달','초승달','반달','보름달'];
function moonIcon(x,y,ph,lit){wx.fillStyle='#0e0b12';wx.beginPath();wx.arc(x,y,6,0,Math.PI*2);wx.fill();const c=lit?'#fff6d0':'#c9a0e8';
  if(ph===0){wx.strokeStyle=c;wx.lineWidth=1;wx.beginPath();wx.arc(x,y,5,0,Math.PI*2);wx.stroke();return;}
  wx.fillStyle=c;wx.beginPath();wx.arc(x,y,5,0,Math.PI*2);wx.fill();if(ph===3)return;wx.fillStyle='#0e0b12';wx.beginPath();if(ph===1)wx.arc(x-2.5,y,5,0,Math.PI*2);else wx.rect(x-6,y-6,6,12);wx.fill();}
function pedestal(bx,by,w){wx.drawImage(SH_S,bx-6,by-1);wx.fillStyle='#1a1620';wx.fillRect(bx-w,by-5,w*2,6);wx.fillStyle='#4a4152';wx.fillRect(bx-w,by-5,w*2,1);wx.fillStyle='#2e2838';wx.fillRect(bx-w+1,by-4,w*2-2,4);}
function drawRaidObjs2(icx,icy,ents){const map=G.map,rs=G.raid;if(!rs||!rs.x)return;const X=rs.x;const vis=(x,y)=>x-icx>-40&&x-icx<W+40&&y-icy>-60&&y-icy<H+40;
  if(map.raid==='mirror'){
    for(let i=0;i<X.mir.length;i++){const [x,y,t]=X.mir[i];if(!vis(x,y))continue;const bx=x-icx,by=y-icy;ents.push({y,f:()=>{pedestal(bx,by,7);const hit=X.hit;for(let k=-7;k<=7;k++){const yy=by-9+(t?k:-k)*0.9;wx.fillStyle=Math.abs(k)<2?'#ffffff':'#8fd0ff';wx.fillRect(bx+k,Math.round(yy),1,2);wx.fillStyle='#3a6fb8';wx.fillRect(bx+k,Math.round(yy)+2,1,1);}wglow(bx,by-9,10,'#8fd0ff',0.15);}});}
    if(X.src){const [x,y]=X.src;ents.push({y,f:()=>{const bx=x-icx,by=y-icy;pedestal(bx,by,6);wx.fillStyle='#ffd35a';wx.fillRect(bx-3,by-14,6,8);wx.fillStyle='#ffffff';wx.fillRect(bx-1,by-12,2,4);wglow(bx,by-10,16,'#ffe9a8',0.4);}});}
    if(X.rcv){const [x,y]=X.rcv;ents.push({y,f:()=>{const bx=x-icx,by=y-icy;pedestal(bx,by,6);const c=X.hit?'#ffffff':'#7a9ab8';for(let j=0;j<12;j++){const w=Math.max(0,4-Math.abs(j-6)*0.7);wx.fillStyle=j<6?c:(X.hit?'#8fd0ff':'#3a6fb8');wx.fillRect(Math.round(bx-w),by-6-j,Math.round(w*2)+1,1);}if(X.hit)wglow(bx,by-12,30,'#ffffff',0.6);}});}
  }
  if(map.raid==='clock'){
    for(let i=0;i<(X.lev||[]).length;i++){const [x,y]=X.lev[i];if(!vis(x,y))continue;ents.push({y,f:()=>{const bx=x-icx,by=y-icy;pedestal(bx,by,6);wx.fillStyle='#7d5418';wx.fillRect(bx-4,by-8,8,3);wx.strokeStyle='#cdc6d2';wx.lineWidth=2;wx.beginPath();wx.moveTo(bx,by-7);wx.lineTo(bx+(i%2?5:-5),by-17);wx.stroke();wx.fillStyle='#e0574a';wx.fillRect(bx+(i%2?4:-6),by-19,3,3);}});}
    for(const [x,y,on] of X.lamp||[]){if(!vis(x,y))continue;ents.push({y:y+20,f:()=>{const bx=x-icx,by=y-icy;wx.fillStyle='#2a2430';wx.fillRect(bx-4,by-2,8,10);wx.fillStyle=on?'#ffd35a':'#3a3144';wx.fillRect(bx-3,by-1,6,6);if(on){wx.fillStyle='#fff6d0';wx.fillRect(bx-1,by,2,2);wglow(bx,by+2,18,'#ffd35a',0.45);}}});}
    if(rs.stage==='boss'||rs.door)for(const [x,y] of X.plates||[]){const bx=x-icx,by=y-icy;const on=livingNear(x,y,18);const act=!!X.pl;wx.globalAlpha=act?0.9:0.45;wx.fillStyle=on?'#7fd05a':act?'#ffd35a':'#6b6275';for(let n=0;n<48;n++){const q=n/48*Math.PI*2;wx.fillRect(Math.round(bx+Math.cos(q)*14),Math.round(by+Math.sin(q)*8),1,1);}wx.fillStyle='#3a3144';wx.fillRect(bx-8,by-3,16,6);wx.fillStyle=on?'#7fd05a':'#7b7486';wx.fillRect(bx-7,by-2,14,1);wx.globalAlpha=1;if(act&&on)wglow(bx,by,22,'#7fd05a',0.3);else if(act)wglow(bx,by,18,'#ffd35a',0.18+0.12*Math.sin(time*8));}
  }
  if(map.raid==='moon'){
    for(let i=0;i<(X.alt||[]).length;i++){const [x,y,ph,lit]=X.alt[i];if(!vis(x,y))continue;ents.push({y,f:()=>{const bx=x-icx,by=y-icy;pedestal(bx,by,8);wx.fillStyle='#2e2838';wx.fillRect(bx-5,by-14,10,9);moonIcon(bx,by-20,ph,lit);if(lit)wglow(bx,by-20,20,'#fff6d0',0.5);else wglow(bx,by-20,12,'#c9a0e8',0.15);}});}
  }}
function livingNear(x,y,r){if(!meDowned()&&Math.hypot(me.x-x,me.y-y)<r)return true;for(const p of G.players.values())if(p.id!==myId&&!p.downed&&Math.hypot(p.dx-x,p.dy-y)<r)return true;return false;}
function raidObjList(){const rs=G.raid;if(!rs||!rs.x||rs.door||rs.stage!=='gate')return[];const X=rs.x;
  if(G.map.raid==='mirror')return(X.mir||[]).map((m,i)=>({i,x:m[0],y:m[1],lab:'거울 돌리기'}));if(G.map.raid==='clock')return(X.lev||[]).map((l,i)=>({i,x:l[0],y:l[1],lab:'레버 당기기'}));
  if(G.map.raid==='moon')return(X.alt||[]).map((a,i)=>({i,x:a[0],y:a[1],lab:`${PHASE_NM[a[2]]} 제단 활성화`}));return[];}
function drawRaidX(rs,y2){const X=rs.x;if(!X)return y2;const line=(s,c)=>{txt(s,240,y2+5,10,c||'#e6dcc3','center');y2+=11;};
  if(G.map.raid==='mirror'){if(rs.stage==='gate'&&!rs.door)line(`거울 퍼즐 ${Math.min(X.stage+1,X.total)}/${X.total} · 빛이 수정에 닿게 거울을 돌리세요`,'#ffe9a8');
    const mk=X.marks&&X.marks[myId];if(mk)line(mk==='L'?'내 표식: 빛 → 그림자 마녀 노라를 공격 · 금빛 원으로':'내 표식: 그림자 → 빛의 마녀 리라를 공격 · 보랏빛 원으로',mk==='L'?'#ffd35a':'#c9a0e8');
    if(X.split)line(`거울벽 ${X.split}초 · 두 마녀의 체력 차이를 20% 안으로!`,'#8fd0ff');if(X.twin)line(`${X.twin}초 안에 남은 마녀를 쓰러뜨리세요!`,'#ffb03a');}
  if(G.map.raid==='clock'){if(rs.stage==='gate'&&!rs.door)line(`태엽 장치 ${X.round+1}/${X.total} · 등불을 모두 켜세요 · 남은 ${X.t}초`,'#ffd35a');
    if(X.pl){const b2=((time*6)|0)%2;txt(`압력판 ${X.pl.on}/${X.pl.need} 밟기 · 남은 ${X.pl.t}초`,240,y2+7,13,b2?'#8fd0ff':'#ffffff','center');y2+=13;pr(190,y2,100,4,PAL.k);pr(190,y2,Math.round(100*Math.min(1,X.pl.hold/1.5)),4,'#7fd05a');y2+=7;}}
  if(G.map.raid==='moon'){if(rs.stage==='gate'&&!rs.door)line(`달의 제단 ${X.round+1}/${X.total} · ${X.rev?'보름달 → 그믐달':'그믐달 → 보름달'} 순서 (${X.n}/4)`,'#c9a0e8');}
  return y2;}
// 타일 6: 거울벽
function drawMirrorWall(sx,sy,tx,ty){const k=(Math.sin(time*3+ty*0.7)+1)/2;wx.fillStyle='rgba(143,208,255,0.35)';wx.fillRect(sx,sy-16,16,32);wx.fillStyle=`rgba(255,255,255,${0.25+0.4*k})`;wx.fillRect(sx+((ty*5+(time*20|0))%16),sy-16,1,32);wx.fillStyle='#3a6fb8';wx.fillRect(sx,sy+15,16,1);}
// ---- 격돌 · 반월 · 역격돌 · 엘라 ----
G.clash=null;G.half=null;G.beats=null;G.clashRes=null;G.clashFx=[];G.clashW=null;G.clashSpec=null;
function onRaid2Msg(d){if(d.t==='clashw'){G.clashW={bid:d.bid,t0:time,d:d.d,n:d.n,fin:d.fin};G.clashSpec=null;sfx('boss');return;}
  if(d.t==='clashr'){const S=G.clashSpec;if(S&&!G.clash&&S.i===d.i&&!S.pressed){S.pressed=true;S.ok=!!d.ok;S.perf=!!d.perf;if(S.ok){S.strikeT=time;const b=cscnBoss(),D=cscnDuel();sfx(S.perf?'clashP':'clashG');shake=Math.max(shake,S.perf?4:2);if(b&&D){const f=D.x>=b.dx?1:-1,qx=b.dx+f*Math.min(30,Math.abs(D.x-b.dx)*0.62);for(let k=0;k<(S.perf?30:16);k++){const q=R()*6.28,sp=rf(60,200);part(qx,D.y,Math.cos(q)*sp,Math.sin(q)*sp*0.6,pick(['y','w']),rf(0.15,0.4),{z:rf(10,22),vz:rf(20,110),g:-260,glow:true});}}}}return;}
  if(d.t==='clash'){G.clashW=null;if(d.end){if(G.cscn){G.cscn.end=time;G.cscn.win=!!d.win;}G.clash=null;G.clashSpec=null;G.clashRes={win:d.win,t0:time};sfx(d.win?'legend':'boss');if(d.win){shake=Math.max(shake,8);screenFlash=0.3;}return;}const N0={n:d.n,i:d.i,dur:d.dur,zone:d.zone,k:d.k|0,dl:d.delay||0,t0:time,fin:d.fin,pressed:false,who:d.who,wn:d.wn||''};const mine=d.who===myId;if(mine){G.clash=N0;G.clashSpec=null;}else{G.clash=null;G.clashSpec=N0;}
    if(!G.cscn||G.cscn.end)G.cscn={t0:time,end:0,mine};if(mine){const b=cscnBoss();if(b)me.face=b.dx<me.x?-1:1;me.path=null;}sfx(d.i?'hit':'shout');return;}
  if(d.t==='half'){G.halfN=(G.halfN||0)+1;G.half={a:d.a,x:d.x,y:d.y,t0:time,d:d.d};sfx('boss');return;}
  if(d.t==='beats'){if(d.end){G.beats=null;G.beatRes={win:d.win,rate:d.rate,t0:time};sfx(d.win?'legend':'boss');return;}G.beats={beats:d.beats,win:d.win,t0:time,hit:new Set(),miss:0,sent:false};return;}}
function clashNeedle(){const c=G.clash;if(!c)return 0;return (time-c.t0-c.dl)/c.dur;}
function clashPress(ki){const c=G.clash;if(!c||c.pressed||ki==null)return true;if(time-c.t0<c.dl)return true;c.pressed=true;const v=clashNeedle();c.pv=v;c.pk=ki;if(!c.local)net({t:'clashp',v:Math.round(v*1000)/1000,ki});
  const tol=(c.zone[1]-1)*c.dur,err=(v-1)*c.dur;c.ok=ki===c.k&&v>=c.zone[0]&&v<=c.zone[1];c.perf=c.ok&&Math.abs(err)<=tol*0.45;c.err=err;c.lab=ki!==c.k?'다른 키!':!c.ok?(v<c.zone[0]?'빨라!':'늦음'):c.perf?'완벽!':'좋아!';if(c.ok){c.strikeT=time;cscnSwing();}clashJuice(c);if(c.local)cprResult(c);return true;}
function clashJuice(c){G.clashFx.push({t0:time,ok:c.ok,perf:c.perf,lab:c.lab,local:!!c.local});
  if(c.perf){sfx('clashP');HSTOP=Math.max(HSTOP,0.11);shake=Math.max(shake,7);screenFlash=Math.max(screenFlash,0.22);}
  else if(c.ok){sfx('clashG');HSTOP=Math.max(HSTOP,0.06);shake=Math.max(shake,4);screenFlash=Math.max(screenFlash,0.1);}
  else{sfx('clashX');shake=Math.max(shake,2);}
  if(c.ok){let mx=me.x+me.face*16,my=me.y;const b=cscnBoss();if(b&&!c.local){const f=me.x>=b.dx?1:-1;mx=b.dx+f*Math.min(30,Math.abs(me.x-b.dx)*0.62);my=me.y;}const n=c.perf?40:20;
    for(let k=0;k<n;k++){const q=R()*6.28,sp=rf(60,c.perf?240:150);part(mx+rf(-3,3),my,Math.cos(q)*sp,Math.sin(q)*sp*0.6,pick(c.perf?['y','w','w']:['w','y']),rf(0.15,0.4),{z:rf(10,22),vz:rf(20,110),g:-260,glow:true});}}}
function beatPress(){const B=G.beats;if(!B)return false;const t=time-B.t0;let bi=-1,bd=9;B.beats.forEach((b,i)=>{if(B.hit.has(i))return;const d=Math.abs(t-b);if(d<bd){bd=d;bi=i;}});if(bi>=0&&bd<=B.win){B.hit.add(bi);sfx('hit');}else{B.miss++;sfx('no');}return true;}
// ================= 단체 기믹 화면 =================
function gmObjs(){const g=G.raid&&G.raid.gm;if(!g||meDowned())return[];const out=[];
  if(g.k==='prison'&&!(g.jail||[]).includes(myId))g.mir.forEach((q,i)=>{if(!q[4])out.push({i:100+i,x:q[0],y:q[1],lab:'거울 깨기'});});
  if(g.k==='core')g.valves.forEach((v,i)=>{if(!v[2])out.push({i:100+i,x:v[0],y:v[1],lab:'밸브 돌리기'});});
  if(g.k==='moonfall'){const carry=(g.carry||[]).includes(myId);if(!carry)out.push({i:100,x:g.br[0],y:g.br[1],lab:'불씨 들기'});else g.pil.forEach((q,i)=>{if(!q[2])out.push({i:101+i,x:q[0],y:q[1],lab:'기둥에 점화'});});}
  return out;}
function gmNear(){let best=null,bd=32;for(const o of gmObjs()){const d=Math.hypot(me.x-o.x,me.y-o.y);if(d<bd){bd=d;best={i:o.i,b:{x:o.x,y:o.y},lab:o.lab};}}return best;}
function gmPosOf(id){const p=playerPos(id);if(!p)return null;return id===myId?[me.x,me.y]:[p.dx,p.dy];}
function gmRing(x,y,r,c,a,w){wx.save();wx.globalAlpha=a;wx.strokeStyle=c;wx.lineWidth=w||2;wx.beginPath();wx.ellipse(x,y,r,r*0.62,0,0,Math.PI*2);wx.stroke();wx.restore();}
function drawGMWorld(icx,icy){try{drawGMWorld0(icx,icy);}catch(e){errOnce('gmWorld',e);wx.globalAlpha=1;}}
function drawGMWorld0(icx,icy){const L=G.gmLab=[];const g=G.raid&&G.raid.gm;if(!g)return;
  if(g.k==='eclipse'){wx.save();wx.globalAlpha=0.38;wx.fillStyle='#05030a';wx.fillRect(0,0,W,H);wx.restore();for(const l of g.lights){const [x,y,r,have]=l;const cx=x-icx,cy=y-icy;const pul=0.75+0.25*Math.sin(time*6);wx.save();wx.globalAlpha=0.32*pul;wx.fillStyle='#ffe9a8';wx.beginPath();wx.ellipse(cx,cy,r,r*0.72,0,0,Math.PI*2);wx.fill();wx.globalAlpha=0.9;wx.strokeStyle='#ffd35a';wx.lineWidth=1;wx.beginPath();wx.ellipse(cx,cy,r,r*0.72,0,0,Math.PI*2);wx.stroke();wx.restore();if(R()<0.3)part(x+rf(-r,r),y+rf(-r*0.6,r*0.6),0,rf(-20,-8),R()<0.5?'y':'w',0.6,{glow:true});}}
  if(g.k==='absorb'){const b=[...G.monsters.values()].find(m=>m.boss);if(b){const cx=b.dx-icx,cy=b.dy-icy-14;const k=g.sh/100;wx.save();wx.globalAlpha=0.25+0.35*k;wx.strokeStyle='#c9a0e8';wx.lineWidth=2;wx.beginPath();wx.arc(cx,cy,18+6*Math.sin(time*5),0,Math.PI*2);wx.stroke();wx.restore();if(R()<0.6){const t=R()*Math.PI*2;part(b.dx+Math.cos(t)*60,b.dy+Math.sin(t)*36,-Math.cos(t)*80,-Math.sin(t)*48,R()<0.5?'p':'w',0.6,{glow:true});}}}const txt=(s2,x,y,sz,c,al,f)=>L.push([s2,x,y,sz,c,al,f]);const bigTxt=(s2,x,y,sz,c)=>L.push([s2,x,y,sz,c,'center',null,1]);const pulse=0.5+0.5*Math.sin(time*6);
  if(g.k==='funeral')for(const c of g.circles){const [x,y,r,need,have]=c;const ok=have===need;const cx=x-icx,cy=y-icy;wx.save();wx.globalAlpha=0.22;wx.fillStyle=ok?'#7fd05a':have>need?'#e0473a':'#9a7ad8';wx.beginPath();wx.ellipse(cx,cy,r,r*0.62,0,0,Math.PI*2);wx.fill();wx.restore();
    gmRing(cx,cy,r,ok?'#bff5a0':have>need?'#ff8a7a':'#d8c0ff',0.6+0.4*pulse,2);bigTxt(String(need),cx,cy-2,16,ok?'#bff5a0':'#fff2d8',1.4);txt(`${have}/${need}`,cx,cy+12,9,ok?'#7fd05a':'#e6dcc3','center','px');}
  if(g.k==='silence'&&g.toll){wx.save();wx.fillStyle='rgba(120,190,255,0.10)';wx.fillRect(0,0,W,H);wx.restore();}
  if(g.k==='prison'){const lv=hintLvC('prison');g.mir.forEach(q=>{const [x,y,cls,name,br]=q;const cx=x-icx,cy=y-icy;if(br){for(let k=0;k<5;k++){wx.fillStyle='#bfe3ff';wx.fillRect(cx-8+k*4,cy+4+(k%2)*3,2,2);}return;}
      wx.fillStyle='#1b1622';wx.fillRect(cx-9,cy-22,18,26);wx.fillStyle='#bfe3ff';wx.fillRect(cx-8,cy-21,16,24);wx.fillStyle='rgba(20,30,50,0.85)';wx.fillRect(cx-6,cy-19,12,20);
      const col=CLASS_COL[cls]||'#e6dcc3';wx.fillStyle=col;wx.fillRect(cx-2,cy-16,4,4);wx.fillRect(cx-3,cy-12,6,8);wx.fillRect(cx-3,cy-4,2,4);wx.fillRect(cx+1,cy-4,2,4);wglow(cx,cy-9,14,'#bfe3ff',0.15+0.1*pulse);
      txt(lv>=1?name:[...name].reverse().join(''),cx,cy-28,9,col,'center');});/* 처음엔 거울처럼 뒤집힌 이름 */
    for(const id of g.jail||[]){const pp=gmPosOf(id);if(!pp)continue;const cx=pp[0]-icx,cy=pp[1]-icy-10;wx.save();wx.globalAlpha=0.55;wx.fillStyle='#bfe3ff';wx.beginPath();wx.moveTo(cx,cy-18);wx.lineTo(cx+10,cy-6);wx.lineTo(cx+8,cy+12);wx.lineTo(cx-8,cy+12);wx.lineTo(cx-10,cy-6);wx.closePath();wx.fill();wx.restore();wglow(cx,cy,18,'#bfe3ff',0.25);}}
  if(g.k==='chorus')for(const [id,f,b] of g.chant){const m=G.monsters.get(id);if(!m)continue;const cx=m.dx-icx,cy=m.dy-icy-46;pr(cx-20,cy,40,5,PAL.k);pr(cx-19,cy+1,Math.round(38*f),3,b?'#7fd05a':'#c9a0e8');txt(b?'끊김!':'영창',cx,cy-5,9,b?'#7fd05a':'#e6c8ff','center');if(!b)for(let k=0;k<2;k++)part(m.dx+rf(-10,10),m.dy-20,rf(-10,10),-30,pick(['p','P','w']),0.6,{z:10,glow:true});}
  if(g.k==='core')g.valves.forEach(v=>{const [x,y,done,by]=v;const cx=x-icx,cy=y-icy;wx.fillStyle='#1b1622';wx.fillRect(cx-8,cy-8,16,16);wx.fillStyle=done?'#3a6a8a':'#8a3a2a';wx.fillRect(cx-7,cy-7,14,14);wx.strokeStyle=done?'#8fd0ff':'#ffb03a';wx.lineWidth=2;wx.beginPath();wx.arc(cx,cy,5,time*(done?0:4),time*(done?0:4)+Math.PI*1.6);wx.stroke();
    if(!done){wglow(cx,cy,16,'#ff8a3a',0.2+0.2*pulse);if(R()<0.3)part(x+rf(-4,4),y,rf(-10,10),-20,pick(['w','W']),0.6,{z:8});}else if(by)txt(by,cx,cy-14,8,'#8fd0ff','center','px');});
  if(g.k==='gears'){const [l0,l1,l2]=g.lanes;const ys=[l0,l1,l2];const x=g.wx-icx;ys.forEach((l,i)=>{const y0=l[0]-icy,y1=l[1]-icy;wx.fillStyle=i===g.gap?'rgba(127,208,90,0.08)':'rgba(255,211,90,0.04)';wx.fillRect(0,y0,W,y1-y0);wx.fillStyle='rgba(255,211,90,0.35)';wx.fillRect(0,y0,W,1);
      if(i!==g.gap){wx.fillStyle='#3a3144';wx.fillRect(x-5,y0,10,y1-y0);wx.fillStyle='#ffd35a';for(let yy=y0;yy<y1;yy+=6){wx.fillRect(x-7+((yy/6|0)%2)*12,yy,2,3);}}});
    wglow(x,(ys[0][0]+ys[2][1])/2-icy,40,'#ffb03a',0.2);}
  if(g.k==='moonfall'){const bx=g.br[0]-icx,by=g.br[1]-icy;wx.fillStyle='#3a2a1a';wx.fillRect(bx-7,by-4,14,8);wglow(bx,by-6,20,'#ffd35a',0.5+0.2*pulse);if(R()<0.6)part(g.br[0]+rf(-3,3),g.br[1]-6,rf(-6,6),-30,pick(['y','o','w']),0.5,{z:6,glow:true});
    g.pil.forEach(q=>{const [x,y,lit]=q;const cx=x-icx,cy=y-icy;wx.fillStyle='#2a2330';wx.fillRect(cx-4,cy-26,8,26);wx.fillStyle='#5a4a3a';wx.fillRect(cx-6,cy-28,12,3);if(lit){wglow(cx,cy-32,26,'#fff2b0',0.7);wx.fillStyle='#fff6c8';wx.fillRect(cx-2,cy-35,4,6);}else{wx.fillStyle='#6b6275';wx.fillRect(cx-2,cy-31,4,3);}});
    for(const id of g.carry||[]){const pp=gmPosOf(id);if(!pp)continue;const cx=pp[0]-icx,cy=pp[1]-icy-32;wglow(cx,cy,14,'#ffd35a',0.6);wx.fillStyle='#fff2b0';wx.fillRect(cx-1,cy-3,3,5);}}
  if(g.k==='shadow'){const lv=hintLvC('shadow');for(const [x,y,cls,name,ok,pid] of g.sh){if(ok)continue;const cx=x-icx,cy=y-icy;const col=CLASS_COL[cls]||'#e6dcc3';const mine=pid===myId;wx.save();wx.globalAlpha=0.75;wx.fillStyle='#0a0710';wx.beginPath();wx.ellipse(cx,cy,9,4,0,0,Math.PI*2);wx.fill();wx.fillRect(cx-3,cy-16,6,14);wx.fillRect(cx-2,cy-20,4,4);wx.restore();
      gmRing(cx,cy,11,col,0.5+0.5*pulse,mine&&lv>=2?3:1);if(lv>=1||mine&&lv>=2)txt(lv>=1?name:'',cx,cy-26,9,col,'center');}}}
function drawGMLabels(){for(const l of G.gmLab||[]){if(l[7])bigTxt(l[0],l[1],l[2],l[3],l[4],1.4);else txt(l[0],l[1],l[2],l[3],l[4],l[5],l[6]);}}
function drawGMUI(rs,y2){const g=rs.gm;if(!g)return y2;const w=200,x=240-w/2;const k=Math.max(0,g.t/(g.T||1));const urgent=g.t<3;const b2=((time*6)|0)%2;
  pr(x,y2,w,20,'rgba(30,6,10,0.85)');pr(x,y2,w,1,urgent&&b2?'#ff4a3a':'#ff8a5a');txt(`⚠ ${g.n}`,x+6,y2+6,11,urgent&&b2?'#ffffff':'#ffb03a');txt(`${g.t.toFixed(1)}초`,x+w-6,y2+6,11,urgent?'#ff6a5a':'#e6dcc3','right');
  pr(x+4,y2+13,w-8,4,PAL.k);pr(x+5,y2+14,Math.round((w-10)*k),2,urgent?'#ff4a3a':'#ffb03a');y2+=22;
  let s=null;if(g.k==='funeral')s=`원 ${g.circles.filter(c=>c[3]===c[4]).length}/${g.circles.length} 맞음`;if(g.k==='silence')s=g.toll?'지금 움직이지 마세요!':`종소리 ${g.cnt}/${g.tot}`;if(g.k==='prison')s=`갇힌 사람 ${(g.jail||[]).length}명`+((g.jail||[]).includes(myId)?' · 당신이 갇혔어요!':'');
  if(g.k==='chorus')s=g.gap!=null?`다른 마녀도 ${Math.max(0,g.gap).toFixed(1)}초 안에!`:'두 마녀를 함께 공격!';if(g.k==='core')s=`밸브 ${g.valves.filter(v=>v[2]).length}/${g.valves.length}`;if(g.k==='gears')s=g.gap>=0?'모두 한 줄! 버티세요':'흩어져 있어요 — 한 줄로!';
  if(g.k==='moonfall')s=`등불 기둥 ${g.pil.filter(q=>q[2]).length}/${g.pil.length}`+((g.carry||[]).includes(myId)?' · 불씨를 들고 있어요':'');if(g.k==='shadow')s=`그림자 ${g.sh.filter(q=>q[4]).length}/${g.sh.length}`;if(g.k==='eclipse'){const n=g.lights.reduce((a,l)=>a+l[3],0);s=`빛 속 ${n}/${g.tot}명`+(n<g.tot?' — 금색 원 안으로!':' · 버티세요!');}if(g.k==='absorb')s=`흑월 보호막 ${g.sh}% — 집중 공격!`;
  if(s){txt(s,240,y2+4,11,g.k==='silence'&&g.toll?(b2?'#8fd0ff':'#ffffff'):'#ffe9a8','center');y2+=12;}return y2;}
// 기믹 컷인: 레이드에서 기믹이 처음 나올 때 1.9초 동안 위쪽 띠에 그림·이름·한 줄 설명
const GCUT={gunner:['히든 직업 해금 · 증기총사','탕탕 쏘고 펑펑 터뜨리는 태엽 기사단의 증기총'],bellseq:['종의 순서','울린 순서를 기억하라'],bb:['종 뒤의 그림자','모서리의 종을 함께 울려라'],march:['망자의 행렬','행렬의 빈틈을 찾아라'],funeral:['장례의 종','원마다 정해진 인원만큼 서라'],silence:['침묵의 종소리','종이 울리면 멈춰라'],
 mirror:['빛의 거울','빛을 수정으로 이끌어라'],marks:['빛과 그림자의 표식','표식과 반대인 마녀를 노려라'],split:['갈라진 거울벽','두 마녀의 상처를 맞춰라'],prison:['거울 감옥','갇힌 동료가 비친 거울만 깨라'],chorus:['자매의 합창','두 목소리를 함께 끊어라'],
 clockpz:['태엽 등불','레버는 양옆 등불도 뒤집는다'],plates:['증기 보호막','압력판을 함께 밟아라'],core:['과열 코어','한 사람당 밸브 하나'],gears:['톱니 행진','모두 한 줄에 모여라'],
 moonpz:['달의 제단','달이 흐르는 순서대로'],clash:['격돌','흑왕 곁에서 상호작용 키로 맞서라'],clones:['흑왕의 분신','푸르게 빛나는 칼날을 막아라'],chain:['쇠사슬','묶인 자는 멀리 떨어져라'],moonfall:['흑월 강림','불씨를 기둥으로 옮겨라'],shadow:['그림자 대역','자기 그림자만 밟아라'],beats:['역격돌','박동이 선에 닿을 때']};
function gcutPre(){if(G._gcPre)return;G._gcPre=1;for(const k in GCUT)artOf(`art/gm_${k}.webp`);}
function drawGCut(){const c=G.gcut;if(!c)return;const D=c.g==='gunner'?3.4:1.9,t=time-c.t0;if(t>D||!GCUT[c.g]){G.gcut=null;return;}
  const e=Math.min(1,t/0.22),ee=1-Math.pow(1-e,3),a=t>D-0.4?Math.max(0,(D-t)/0.4):1,y0=20,h=78,bw=Math.ceil(W*ee),p=Math.min(1,t/D);
  const img=artOf(`art/gm_${c.g}.webp`),[ti,sub]=GCUT[c.g];ctx.save();ctx.globalAlpha=a;ctx.beginPath();ctx.rect(0,y0*SC,bw*SC,h*SC);ctx.clip();pr(0,y0,W,h,'#07040a');
  if(img){const z=1.07-0.07*p,sw=img.width/z,sx=(img.width-sw)/2,sh=h*sw/W,sy=Math.max(0,(img.height-sh)*(0.3+0.35*p));artDraw(img,sx,sy,sw,Math.min(sh,img.height-sy),0,y0,W,h);}
  const g=ctx.createLinearGradient(0,(y0+h-44)*SC,0,(y0+h)*SC);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,0.82)');ctx.fillStyle=g;ctx.fillRect(0,(y0+h-44)*SC,W*SC,44*SC);
  pr(0,y0,W,1,'#ffd35a');pr(0,y0+h-1,W,1,'#ffd35a');const dx=(1-ee)*-24;
  bigTxt(ti,240+dx,y0+h-27,15,'#ffe9a8',1.7);bigTxt(sub,240-dx,y0+h-10,11,'#e8dcc0',1.25);
  if(e<1)pr(bw-3,y0,3,h,'rgba(255,240,200,0.85)');ctx.restore();}
function onGMFx(o){if(o.k==='gcut'){gcutPre();const gm=G.gmBanner&&time-G.gmBanner.t0<0.3;G.gcut={g:o.g,t0:time};if(gm)G.gmBanner=null;else sfx('boss');screenFlash=Math.max(screenFlash,0.1);return true;}
  if(o.k==='gmstart'){G.gmBanner={n:o.n,t0:time};screenFlash=Math.max(screenFlash,0.12);sfx('boss');return true;}
  if(o.k==='gmtoll'){G.gmToll=time;try{if(AC&&soundMode!==2){tone('sine',130,128,1.4,0.16);tone('triangle',260,258,0.8,0.05);}}catch(e){}return true;}
  if(o.k==='gmwipe'){G.gmWipe=time;shake=Math.max(shake,10);return true;}return false;}
function drawCombo(){const c=G.combo;if(!c||!c.n||time-c.t0>c.d)return;const x=240,y=214;txt('연격',x-34,y,10,'#bfe3ff','right');for(let i=0;i<5;i++){const on=i<c.n;pr(x-30+i*12,y-4,9,8,PAL.k);pr(x-29+i*12,y-3,7,6,on?'#bfe3ff':'#2a2330');}const k=1-(time-c.t0)/c.d;pr(x-30,y+6,58,1,'#2a2330');pr(x-30,y+6,Math.round(58*k),1,'#8fd0ff');}
function drawGMScreen(){drawCombo();if(G.raid)gcutPre();drawGCut();if(G.raid&&G.raid.gm&&inDungeon())drawGMUI(G.raid,180);if(G.gmBanner){const t=time-G.gmBanner.t0;if(t>2.4)G.gmBanner=null;else{const a=t<0.2?t/0.2:t>1.9?Math.max(0,(2.4-t)/0.5):1;ctx.globalAlpha=a;pr(0,100,W,30,'rgba(40,4,8,0.7)');pr(0,100,W,1,'#ff4a3a');pr(0,129,W,1,'#ff4a3a');bigTxt(G.gmBanner.fame||`단체 기믹 · ${G.gmBanner.n}`,240,114,G.gmBanner.fame?12:15,G.gmBanner.fame?'#ffe9a8':'#ffd35a',1.6);ctx.globalAlpha=1;}}
  if(G.gmWipe&&time-G.gmWipe<1.6){const a=1-(time-G.gmWipe)/1.6;pr(0,0,W,H,`rgba(160,10,20,${0.45*a})`);bigTxt('전멸',240,120,26,'#ffffff',2);}}
// ===== 격돌 수련석: 혼자 하는 격돌 연습 (서버 없이 화면에서만) =====
const CPR_MODES={n:{n:'일반',d:'Q W E R · 실제 흑왕 격돌과 같은 속도',dur:0.72,tol:0.16,nk:4},h:{n:'하드',d:'Q W E R A S D F · 판정 좁음',dur:0.62,tol:0.11,nk:8},
  fn:{n:'최후의 격돌',d:'4연속 노트 · 일반',dur:0.55,tol:0.16,nk:4,set:4},fh:{n:'최후의 격돌 (하드)',d:'5연속 노트 · 하드',dur:0.48,tol:0.11,nk:8,set:5},
  inf:{n:'무한 연습 (랭킹)',d:'점수 랭킹 도전 · 빨라질수록 고득점 · 3번 놓치면 끝',dur:0.75,tol:0.16,nk:4,lives:3}};
function drawCprStone(icx,icy,ents){const p=G.map&&G.map.clashpr;if(!p||G.kind!=='hub')return;const bx=Math.round(p.x)-icx,by=Math.round(p.y)-icy;if(bx<-40||bx>W+40||by<-60||by>H+30)return;
  ents.push({y:p.y,f:()=>{wx.drawImage(SH_S,bx-6,by-1);wx.fillStyle='#0e0b12';wx.fillRect(bx-11,by-5,22,6);wx.fillStyle='#3a3144';wx.fillRect(bx-10,by-4,20,3);
    for(let j=0;j<20;j++){const hw=Math.round(7-j*0.12);wx.fillStyle='#0e0b12';wx.fillRect(bx-hw-1,by-5-j,hw*2+2,1);wx.fillStyle=j%7===0?'#4a4152':'#2e2838';wx.fillRect(bx-hw,by-5-j,hw*2,1);wx.fillStyle='#5a5066';wx.fillRect(bx-hw,by-5-j,1,1);}
    wx.fillStyle='#0e0b12';wx.fillRect(bx-5,by-27,10,2);const cy=by-15,ph=(time*0.7)%1,act=!!G.cpr;
    wx.globalAlpha=act?1:0.85;wx.strokeStyle='#c9a0e8';wx.lineWidth=1;wx.beginPath();wx.arc(bx+0.5,cy+0.5,3,0,6.28);wx.stroke();
    wx.globalAlpha=(1-ph)*(act?1:0.7);wx.strokeStyle=ph>0.8?'#ffd35a':'#ffffff';wx.beginPath();wx.arc(bx+0.5,cy+0.5,3+9*(1-ph),0,6.28);wx.stroke();wx.globalAlpha=1;
    if(R()<0.08)part(p.x+rf(-4,4),p.y-rf(8,22),0,0,pick(['p','w']),0.6,{z:0,vz:12,glow:true});
  }});}
function drawCprPanel(){const x=6,y=38,w=200,h=168;panel(x,y,w,h,'격돌 수련석');const st=G.cprLast;
  txt('바깥 원이 안쪽 원에 겹치는 순간 표시된 키!',x+w/2,y+20,10,'#9e937a','center');let yy=y+30;
  for(const k in CPR_MODES){const M=CPR_MODES[k];button(x+8,yy,w-16,20,'',()=>cprStart(k),{tip:[[M.n,'#ffd35a',12],[M.d,'#e6dcc3',11]]});txt(M.n,x+14,yy+7,11,'#ffe9a8');txt(M.d,x+14,yy+15,9,'#9e937a');yy+=23;}
  if(st)txt(`지난 기록 · 완벽 ${st.p} · 좋음 ${st.g} · 실패 ${st.m} · 최고 연속 ${st.best}`,x+w/2,yy+6,9,'#c9a0e8','center');
  txt('ESC 또는 멀어지면 연습 종료',x+w/2,y+h-8,9,'#6b6275','center');}
function cprStart(k){const M=CPR_MODES[k];closeFac();G.cpr={k,M,p:0,g:0,m:0,str:0,best:0,errs:[],score:0,lives:M.lives||0,speed:1,setI:0,next:time+0.6};G.clash=null;msg(`격돌 연습 · ${M.n}`,'#c9a0e8');sfx('shout');}
function cprStop(){const c=G.cpr;if(!c)return;if(c.k==='inf'&&c.score>0)net({t:'cprsc',s:c.score,p:c.p,g:c.g,best:c.best});G.cprLast={p:c.p,g:c.g,m:c.m,best:c.best};const avg=c.errs.length?Math.round(c.errs.reduce((a,b)=>a+Math.abs(b),0)/c.errs.length*1000):0;
  msg(`격돌 연습 끝 · 완벽 ${c.p} · 좋음 ${c.g} · 실패 ${c.m} · 최고 연속 ${c.best}${avg?` · 평균 오차 ${avg}ms`:''}`,'#ffe9a8');if(G.clash&&G.clash.local)G.clash=null;G.cpr=null;}
function cprNote(){const c=G.cpr,M=c.M;let nk=M.nk;if(c.k==='inf'&&c.str>=10)nk=8;const fin=!!M.set,dur=M.dur*(c.k==='inf'?c.speed:1),tol=M.tol;let k=(Math.random()*nk)|0;if(G.clash&&G.clash.k===k)k=(k+1)%nk;
  G.clash={local:1,n:fin?M.set:1,i:fin?c.setI:0,dur,zone:[1-tol/dur,1+tol/dur],k,dl:fin&&c.setI>0?0.12:0.3,t0:time,fin:fin?1:0,pressed:false};}
function cprResult(C){const c=G.cpr;if(!c)return;if(C.ok){if(C.perf)c.p++;else c.g++;c.str++;c.best=Math.max(c.best,c.str);c.errs.push(C.err);if(c.k==='inf'){const add=Math.round((C.perf?300:100)*(1+Math.min(c.str,50)*0.02)/c.speed);c.score+=add;c.addT=time;c.add=add;}if(c.k==='inf')c.speed=Math.max(0.55,c.speed*0.97);}
  else{c.m++;c.str=0;if(c.k==='inf'){c.lives--;}}
  C.doneT=time;}
function cprTick(){const c=G.cpr;if(!c)return;const p=G.map&&G.map.clashpr;if(G.kind!=='hub'||!p||Math.hypot(me.x-p.x,me.y-p.y)>110){cprStop();return;}
  const C=G.clash;if(C&&C.local){if(!C.pressed&&clashNeedle()>C.zone[1]+0.04){C.pressed=true;C.ok=false;C.lab='놓침';clashJuice(C);cprResult(C);}
    if(C.pressed&&time-C.doneT>(C.fin&&C.ok&&C.i<C.n-1?0.12:0.4)){const M=c.M;G.clash=null;
      if(c.k==='inf'&&c.lives<=0){cprStop();return;}
      if(M.set){if(C.ok&&c.setI<M.set-1){c.setI++;cprNote();return;}const won=C.ok;c.setI=0;G.clashRes={win:won,t0:time};sfx(won?'legend':'boss');c.next=time+1.4;return;}
      c.next=time+0.25;}
    return;}
  if(!C&&time>=c.next)cprNote();}
function drawCprHud(){const c=G.cpr;if(!c)return;const x=240,y=52;const t=`${c.M.n} · 완벽 ${c.p} · 좋음 ${c.g} · 실패 ${c.m}`+(c.k==='inf'?` · 목숨 ${'♥'.repeat(Math.max(0,c.lives))}`:'');
  txt(t,x,y-8,10,'#c9a0e8','center');if(c.str>=2){const pop=1+0.5*Math.max(0,1-(time-(G.clash&&G.clash.doneT||0))/0.15);bigTxt(`${c.str} 연속`,x+128,166,12,c.str>=10?'#ffd35a':'#ffffff',pop);}
  if(c.k==='inf'){bigTxt(c.score.toLocaleString(),x,y+14,12,'#ffe9a8',1.5);if(time-(c.addT||-9)<0.6)txt(`+${c.add}`,x+50,y+12-(time-c.addT)*14,10,'#ffd35a');}
  txt('ESC: 연습 종료',x,y+(c.k==='inf'?26:2),9,'#6b6275','center');}
function drawRankPanel(){const x=6,y=38,w=232,h=196;panel(x,y,w,h,'마을 랭킹 게시판');const R0=G.ranks,tab=G.rankTab||'cpr';
  [['cpr','격돌 무한 연습'],['fish','낚시 대어']].forEach(([k,l],i)=>button(x+8+i*110,y+4,106,14,l,()=>{G.rankTab=k;},{size:10,main:tab===k}));
  if(!R0){txt('불러오는 중…',x+w/2,y+60,10,'#9e937a','center');return;}const L=R0[tab]||[];
  txt(tab==='cpr'?'수련석의 무한 연습 점수 · 캐릭터마다 최고 기록':'낚은 물고기 크기 · 캐릭터마다 최고 기록',x+w/2,y+26,9,'#9e937a','center');
  if(!L.length)txt('아직 기록이 없어요. 첫 1위의 주인공이 되어 보세요!',x+w/2,y+70,10,'#e6dcc3','center');
  const MED=['#ffd35a','#d8d8e0','#d0905a'];
  for(let i=0;i<Math.min(L.length,12);i++){const e=L[i],yy=y+38+i*12.5,mine=e.id===R0.me;if(mine)pr(x+6,yy-5,w-12,11,'rgba(201,160,232,0.18)');
    txt(`${i+1}`,x+16,yy,10,MED[i]||'#9e937a','center');txt(e.n,x+26,yy,10,mine?'#ffffff':'#e6dcc3');txt((SH.CLASSES[e.cls]||{}).n||'',x+92,yy,9,'#6b6275');
    if(tab==='cpr'){txt(e.s.toLocaleString()+'점',x+w-60,yy,10,MED[i]||'#ffe9a8','right');txt(`${e.best|0}연속`,x+w-10,yy,9,'#9e937a','right');}
    else{const f=SH.FISH.find(q=>q.id===e.f)||{n:'?',r:0};txt(`${SH.FISH_GN[e.g|0]}`,x+132,yy,9,SH.FISH_GC[e.g|0]);txt(f.n,x+160,yy,9,SH.FISH_RC[f.r]);txt(`${e.s}cm`,x+w-10,yy,10,MED[i]||'#ffe9a8','right');}}
  const mi=L.findIndex(e=>e.id===R0.me);txt(mi>=0?`내 순위 ${mi+1}위`:(tab==='cpr'?'격돌 수련석에서 무한 연습으로 도전!':'연못에서 대어를 낚아 도전!'),x+w/2,y+h-9,9,mi>=0?'#c9a0e8':'#6b6275','center');}
// ===== 격돌 연출: 흑왕과 맞대면 · 노트마다 흑왕이 검을 끌어올렸다 내려치고, 성공하면 맞받아쳐 튕겨냄 =====
function cscnBoss(){for(const m of G.monsters.values())if(isBossTc(m.tc)&&!m.dead)return m;return null;}
function cscnA(){const c=G.cscn;if(!c)return 0;const a=Math.min(1,(time-c.t0)/0.35);return c.end?a*Math.max(0,1-(time-c.end-0.9)/0.6):a;}
function cscnDuel(){const c=G.cscn;let D=null;if(G.clash&&!G.clash.local)D={x:me.x,y:me.y,me:1};else if(G.clashSpec){const p=G.players.get(G.clashSpec.who);if(p)D={x:p.dx,y:p.dy,me:0};}if(D&&c)c.dp=D;return D||(c&&c.dp)||null;}
function cscnNote(){const C=G.clash&&!G.clash.local?G.clash:G.clashSpec;if(!C)return null;const t1=C.t0+C.dl,th=t1+C.dur;return{C,t1,th,ts:C.ok&&C.strikeT?C.strikeT:th};}
function cscnPose(m){const f=m.face<0?-1:1;if(G.clashW&&!G.clash&&!G.clashSpec){const tr=((time*24)|0)%2;return{fr:'wind',dx:-f*2+(time-G.clashW.t0>G.clashW.d-1.5?tr:0),dy:0,glow:0.55+0.35*Math.sin(time*6)};}const c=G.cscn;if(!c)return null;
  if(c.end){const u=time-c.end;if(u>1.5){G.cscn=null;return null;}if(c.win){const k=Math.min(1,u/0.25);return{fr:'idle',dx:-f*Math.round(14*k),dy:Math.round(3*k),wf:u<0.02,glow:0};}const k=Math.min(1,u/0.12);return{fr:'idle',dx:f*Math.round(8*(1-Math.max(0,u-0.4))*k),dy:0,glow:0};}
  const N=cscnNote();if(!N){const lp=c.last;if(lp&&time-lp.ts<0.6)return cscnAfter(lp,f);return{fr:'idle',dx:0,dy:0,glow:0};}
  if(time<N.t1)return{fr:'idle',dx:0,dy:1,glow:0};
  if(time<N.ts){const k=Math.min(1,(time-N.t1)/Math.max(0.05,N.ts-N.t1));const tr=k>0.7&&((time*40)|0)%2?1:0;return{fr:'wind',dx:-f*Math.round(1+3*k)+tr,dy:0,glow:k};}
  c.last={ts:N.ts,ok:!!N.C.ok,perf:!!N.C.perf};return cscnAfter(c.last,f);}
function cscnAfter(l,f){const u=time-l.ts;if(l.ok){const k=Math.min(1,u/0.3);return{fr:'idle',dx:f*Math.round(5-13*(1-Math.pow(1-k,2))),dy:0,wf:u<0.012,glow:0};}const k=Math.min(1,u/0.45);return{fr:'idle',dx:f*Math.round(7*(1-k)),dy:0,glow:0};}
function cscnSwing(){const b=cscnBoss();if(!b||!G.cscn)return;const a=Math.atan2((b.dy-14)-(me.y-6),b.dx-me.x);me.atkKind='swing';me.atkAngle=a;me.atkDur=0.2;me.atkAnim=0.2;me.face=Math.cos(a)<0?-1:1;effects.push({type:'slash',pid:myId,a,t:0,d:0.2,max:0.28});}
function cscnCam(){const a=cscnA();if(a<=0)return;const b=cscnBoss();if(!b)return;const D=cscnDuel();if(!D)return;if(!G.cscn.mine&&Math.hypot(me.x-b.dx,me.y-b.dy)>260)return;const e=a*a*(3-2*a);const tx=(D.x+b.dx)/2-W/2,ty=(D.y+b.dy)/2-105;camX+=(tx-camX)*e;camY+=(ty-camY)*e;}
function drawClashScene(icx,icy){const c=G.cscn;if(!c)return;const a=cscnA();const b=cscnBoss();if(!b){if(c.end&&time-c.end>1.5)G.cscn=null;return;}
  const D=cscnDuel()||{x:me.x,y:me.y,me:1};const f=b.face<0?-1:1,bx=b.dx-icx,by=b.dy-icy,mx=D.x-icx,my=D.y-icy,cx=(bx+mx)/2,cy=(by+my)/2-16;c.cpx=bx+f*Math.min(30,Math.abs(mx-bx)*0.62);c.cpy=my-14;
  if(a>0){ctx.save();const g=ctx.createRadialGradient(cx*SC,cy*SC,46*SC,cx*SC,cy*SC,230*SC);g.addColorStop(0,'rgba(4,2,10,0)');g.addColorStop(1,`rgba(4,2,10,${0.78*a})`);ctx.fillStyle=g;ctx.fillRect(0,0,W*SC,H*SC);
    ctx.globalCompositeOperation='lighter';const g2=ctx.createLinearGradient(0,(cy-90)*SC,0,(cy+24)*SC);g2.addColorStop(0,'rgba(150,120,200,0)');g2.addColorStop(1,`rgba(150,120,200,${0.12*a})`);ctx.fillStyle=g2;ctx.beginPath();ctx.moveTo((cx-20)*SC,(cy-120)*SC);ctx.lineTo((cx+20)*SC,(cy-120)*SC);ctx.lineTo((cx+70)*SC,(cy+26)*SC);ctx.lineTo((cx-70)*SC,(cy+26)*SC);ctx.fill();ctx.restore();
    const lb=Math.round(18*Math.min(1,a*1.2));pr(0,0,W,lb,'#000000');pr(0,lb,W,1,'rgba(201,160,232,0.35)');
    if(R()<0.35*a)part(D.x+rf(-110,110),D.y+rf(-40,20),rf(-6,6),0,pick(['p','w']),1.4,{z:rf(0,40),vz:rf(6,16),glow:true});}
  // 흑왕 내려치기 궤적
  const N=cscnNote(),L=c.last;const st=N&&time>=N.ts?N.ts:(L&&time-L.ts<0.3?L.ts:null);
  if(st!=null){const u=time-st,ok=N&&time>=N.ts?!!N.C.ok:!!(L&&L.ok);if(u<0.24){const k=Math.min(1,u/0.08),al=1-Math.max(0,(u-0.08)/0.16);const px=bx+f*8,py=by-24,rr=36;const a0=f>0?-1.9:Math.PI+1.9,sw=(ok?2.0:2.6)*k*(f>0?1:-1);
    ctx.save();ctx.globalCompositeOperation='lighter';ctx.lineCap='round';for(const [w,col,o] of [[7,'rgba(140,60,200,',0.55],[4,'rgba(230,120,255,',0.8],[1.6,'rgba(255,255,255,',1]]){ctx.strokeStyle=col+(o*al)+')';ctx.lineWidth=w*SC;ctx.beginPath();ctx.ellipse(px*SC,py*SC,rr*SC,rr*0.8*SC,0,f>0?a0:a0+sw,f>0?a0+sw:a0,false);ctx.stroke();}ctx.restore();}
    if(!ok){if(!c.hurt||c.hurt<st){c.hurt=st;if(D.me){sfx('hurt');G.flash=Math.max(G.flash||0,0.08);}sfx('clashX');shake=Math.max(shake,D.me?6:3);for(let k2=0;k2<14;k2++)part(D.x+rf(-4,4),D.y,rf(-90,90)*(-f)+(-f)*40,rf(-40,40),pick(['r','r','w']),rf(0.2,0.45),{z:rf(6,20),vz:rf(20,90),g:-240,glow:true});}
      const u2=time-c.hurt;if(u2<0.3){const al2=1-u2/0.3;ctx.save();ctx.globalCompositeOperation='lighter';ctx.strokeStyle=`rgba(255,70,60,${al2})`;ctx.lineWidth=2.5*SC;ctx.beginPath();ctx.moveTo((mx-14)*SC,(my-26)*SC);ctx.lineTo((mx+12)*SC,(my+2)*SC);ctx.stroke();ctx.strokeStyle=`rgba(255,240,230,${al2})`;ctx.lineWidth=1*SC;ctx.stroke();ctx.restore();}}
    else{const u3=time-st;if(u3<0.22){const qx=bx+f*Math.min(30,Math.abs(mx-bx)*0.62),qy=my-14,al3=1-u3/0.22;ctx.save();ctx.globalCompositeOperation='lighter';const gg=ctx.createRadialGradient(qx*SC,qy*SC,0,qx*SC,qy*SC,(14+u3*90)*SC);gg.addColorStop(0,`rgba(255,250,230,${al3})`);gg.addColorStop(0.35,`rgba(255,210,120,${0.7*al3})`);gg.addColorStop(1,'rgba(255,180,80,0)');ctx.fillStyle=gg;ctx.fillRect((qx-110)*SC,(qy-110)*SC,220*SC,220*SC);
      ctx.strokeStyle=`rgba(255,255,255,${al3})`;ctx.lineWidth=1.5*SC;for(let q=0;q<8;q++){const an=q/8*6.28+st*7,r0=4+u3*60,r1=r0+8+u3*40;ctx.beginPath();ctx.moveTo((qx+Math.cos(an)*r0)*SC,(qy+Math.sin(an)*r0*0.7)*SC);ctx.lineTo((qx+Math.cos(an)*r1)*SC,(qy+Math.sin(an)*r1*0.7)*SC);ctx.stroke();}ctx.restore();}}}
  if(c.end&&c.win){const u=time-c.end;if(u<0.5){const al=1-u/0.5;ctx.save();ctx.globalCompositeOperation='lighter';ctx.strokeStyle=`rgba(255,230,160,${al})`;ctx.lineWidth=3*SC;ctx.beginPath();ctx.ellipse(bx*SC,(by-16)*SC,(20+u*160)*SC,(14+u*110)*SC,0,0,6.28);ctx.stroke();ctx.restore();}}}
function clashWNear(){const b=cscnBoss();return !!(b&&G.clashW&&!meDowned()&&Math.hypot(me.x-b.dx,me.y-b.dy)<80);}
function drawClashWait(icx,icy){const W0=G.clashW;if(!W0)return;const b=cscnBoss();if(!b)return;const bx=b.dx-icx,by=b.dy-icy,left=Math.max(0,W0.d-(time-W0.t0)),near=clashWNear(),pul=0.5+0.5*Math.sin(time*6);
  ctx.save();ctx.globalCompositeOperation='lighter';ctx.strokeStyle=`rgba(201,160,232,${0.35+0.35*pul})`;ctx.lineWidth=1.5*SC;ctx.setLineDash([6*SC,4*SC]);ctx.lineDashOffset=-time*30*SC;ctx.beginPath();ctx.arc(bx*SC,by*SC,80*SC,0,6.2832);ctx.stroke();ctx.setLineDash([]);
  const g=ctx.createRadialGradient(bx*SC,by*SC,10*SC,bx*SC,by*SC,80*SC);g.addColorStop(0,'rgba(120,60,180,0.18)');g.addColorStop(1,'rgba(120,60,180,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(bx*SC,by*SC,80*SC,0,6.2832);ctx.fill();
  const k=1-left/W0.d;ctx.strokeStyle=left<2?'rgba(255,90,70,0.9)':'rgba(255,233,168,0.85)';ctx.lineWidth=2*SC;ctx.beginPath();ctx.arc(bx*SC,(by-62)*SC,9*SC,-Math.PI/2,-Math.PI/2+6.2832*(1-k));ctx.stroke();ctx.restore();
  bigTxt(String(Math.ceil(left)),bx,by-62,11,left<2?'#ff6a5a':'#ffe9a8',1.2);
  const K=keyLabel(kbCode('act'));txt(W0.fin?'최후의 격돌 · 누가 맞설 것인가':'흑왕이 격돌 자세를 취했다',240,64,12,W0.fin?'#ffd35a':'#c9a0e8','center');
  txt(near?`[ ${K} ] 를 눌러 흑왕과 격돌!`:`흑왕 곁(보라 원 안)에서 [ ${K} ] — 한 사람만 맞설 수 있어요`,240,76,11,near?'#ffffff':'#9e937a','center');
  if(near){const mx=me.x-icx,my=me.y-icy;const w=txt(`${K}: 격돌`,-999,-999,11,'#fff');pr(mx-w/2-4,my-44,w+8,12,'rgba(40,20,60,0.85)');txt(`${K}: 격돌`,mx,my-38,11,pul>0.5?'#ffe9a8':'#ffffff','center');}}
function clashCirc(x,y,r,c,lw,fill){ctx.beginPath();ctx.arc(x*SC,y*SC,Math.max(0.5,r)*SC,0,6.2832);if(fill){ctx.fillStyle=fill;ctx.fill();}if(c){ctx.strokeStyle=c;ctx.lineWidth=lw*SC;ctx.stroke();}}
function drawClashUI(C){const cx=240,cy=172,R=16,AR=42;
  for(let j=G.clashFx.length-1;j>=0;j--){const f=G.clashFx[j],t=time-f.t0,D=f.perf?0.7:0.5;if(t>D){G.clashFx.splice(j,1);continue;}const a=1-t/D;
    if(f.perf&&t<0.05){const sc=!f.local&&G.cscn&&G.cscn.cpx!=null;const cx=sc?G.cscn.cpx:240,cy=sc?G.cscn.cpy:172;ctx.save();ctx.globalAlpha=0.3;pr(0,0,W,H,'#000000');ctx.globalAlpha=0.7;ctx.globalCompositeOperation='lighter';ctx.strokeStyle='#ffe9a8';for(let q=0;q<20;q++){const an=q/20*6.28+f.t0,r0=R+8+(q%3)*6;ctx.lineWidth=(q%2?1:2)*SC;ctx.beginPath();ctx.moveTo((cx+Math.cos(an)*r0)*SC,(cy+Math.sin(an)*r0)*SC);ctx.lineTo((cx+Math.cos(an)*(90+(q%4)*25))*SC,(cy+Math.sin(an)*(90+(q%4)*25))*SC);ctx.stroke();}ctx.restore();}
    ctx.save();ctx.globalAlpha=a;const e1=1-Math.pow(1-Math.min(1,t/D),3);clashCirc(cx,cy,R+e1*(f.perf?60:36),f.ok?(f.perf?'#ffe9a8':'#ffffff'):'#e0574a',f.perf?3:2);
    if(f.perf){clashCirc(cx,cy,R+e1*30,'#ffd35a',1.5);ctx.globalCompositeOperation='lighter';clashCirc(cx,cy,R*(1+e1*0.6),null,0,'rgba(255,230,160,'+(0.55*a*a)+')');
      for(let q=0;q<12;q++){const an=q/12*6.28+0.26,r0=R+4+e1*26,r1=r0+10*(1-e1)+2;ctx.strokeStyle='#ffffff';ctx.lineWidth=2*SC;ctx.beginPath();ctx.moveTo((cx+Math.cos(an)*r0)*SC,(cy+Math.sin(an)*r0)*SC);ctx.lineTo((cx+Math.cos(an)*r1)*SC,(cy+Math.sin(an)*r1)*SC);ctx.stroke();}}
    else if(f.ok){ctx.globalCompositeOperation='lighter';clashCirc(cx,cy,R+e1*16,null,0,'rgba(255,220,140,'+(0.35*a)+')');}ctx.restore();
    const pop=f.ok?1+(f.perf?1.4:0.7)*Math.max(0,1-t/0.12):1;bigTxt(f.lab||'',cx,cy-R-14-t*10,12,f.perf?'#ffe9a8':f.ok?'#ffffff':'#e0574a',pop*(f.perf?1.25:1));}
  if(!C){const S=G.clashSpec;if(S){txt(`${S.wn}님이 흑왕과 격돌 중`,240,150,12,'#ffe9a8','center');if(S.fin)for(let j=0;j<S.n;j++)pr(240-(S.n*8)/2+j*8+1,158,6,3,j<S.i?'#ffd35a':j===S.i?'#ffffff':'#4a3f55');}return;}const v=clashNeedle(),ok1=C.zone[1];const lab=keyLabel(kbCode('sk'+C.k));
  ctx.save();ctx.globalCompositeOperation='multiply';clashCirc(cx,cy,R+12,null,0,'rgba(60,50,70,0.9)');ctx.restore();
  if(C.fin){txt(`최후의 격돌 ${C.i+1}/${C.n}`,cx,cy+R+10,11,'#ffd35a','center');for(let j=0;j<C.n;j++)pr(cx-(C.n*8)/2+j*8+1,cy+R+17,6,3,j<C.i?'#ffd35a':j===C.i?'#ffffff':'#4a3f55');}
  const pulse=v>=C.zone[0]&&v<=ok1&&!C.pressed;
  clashCirc(cx,cy,R,pulse?'#ffd35a':'#c9a0e8',2,pulse?'rgba(90,60,20,0.9)':'rgba(30,20,40,0.92)');
  clashCirc(cx,cy,R-4,'rgba(201,160,232,0.35)',1);
  bigTxt(lab,cx,cy+1,lab.length>2?10:16,C.pressed?(C.ok?'#7fd05a':'#e0574a'):'#ffffff',lab.length>2?1:1.6);
  if(!C.pressed){if(v<0){const a=Math.min(1,(time-C.t0)/0.2);ctx.save();ctx.globalAlpha=a*0.5;clashCirc(cx,cy,R+AR*1,'#ffffff',1);ctx.restore();}
    else if(v<=ok1+0.05){const rr=R+(AR)*Math.max(0,1-v);const near=Math.abs(1-v)*C.dur<0.25;ctx.save();ctx.globalAlpha=v>1?Math.max(0,1-(v-1)*6):1;clashCirc(cx,cy,rr,near?'#ffd35a':'#ffffff',near?3:2);ctx.restore();}}
  if(!C.pressed&&hintLvC('clash')<2)txt('바깥 원이 겹칠 때 원 안의 키!',cx,cy+R+(C.fin?27:12),11,'#ffffff','center');}
function hintLvC(k){const h=G.raid&&G.raid.hl;return Math.min(2,h?h[k]|0:0);}
const ELLA_LINES=['제가 곁에 있을게요!','등불을 꺼뜨리지 마세요!','오빠… 보고 있어? 거의 다 왔어.','카르나스 경, 이제 그만 멈춰요!','새벽은 반드시 와요!','다치면 제 빛 곁으로 오세요!'];
function drawRaid2Screen(){{const E=G.ella,P=G.ellaPos;if(E&&P&&E.say&&time-E.sayS<3.6&&G.raid&&G.raid.x&&G.raid.x.ella){const w=txt(E.say,-999,-999,11,'#2a1e14');pr(P.x-w/2-4,P.y-50,w+8,12,'rgba(255,246,208,0.9)');txt(E.say,P.x,P.y-44,11,'#3a2a14','center');}}const rsx=G.raid&&G.raid.x;if(rsx&&rsx.cz)for(const [x,y,c] of rsx.cz)txt(c==='L'?'빛':'그림자',x-camX,y-camY-30,11,c==='L'?'#ffd35a':'#c9a0e8','center');
  if(G.half){const t=time-G.half.t0;if(t<G.half.d)txt(`${['반월 베기!','반월 베기! 달빛이 닿지 않는 곳으로','반월 베기! 빛나는 반대편으로'][Math.min(2,(G.halfN||1)-1)]} · ${Math.max(0,G.half.d-t).toFixed(1)}`,240,212,12,'#c9a0e8','center');}
  const C=G.clash;drawClashUI(C);drawCprHud();
  if(G.clashRes&&time-G.clashRes.t0<1.6&&(G.clashRes.win||G.cpr)){bigTxt(G.clashRes.win?'격돌 성공':'격돌 실패',240,120,16,G.clashRes.win?'#ffd35a':'#e0473a',2);}
  const B=G.beats;if(B){const t=time-B.t0;const x=90,y=180,w=300,hx=x+40;pr(x,y-10,w,22,'rgba(10,6,14,0.82)');pr(hx-1,y-10,2,22,'#ffd35a');txt('역격돌',x+4,y-16,11,'#c9a0e8');
    B.beats.forEach((b,i)=>{const px=hx+(b-t)*120;if(px<x-4||px>x+w)return;const hit=B.hit.has(i);pr(Math.round(px)-3,y-4,7,10,hit?'#7fd05a':(t-b>B.win?'#e0574a':'#fff6d0'));});
    txt(hintLvC('beats')?`${keyLabel(kbCode('act'))} 를 선에서!  ${B.hit.size}/${B.beats.length}`:`( ${keyLabel(kbCode('act'))} )  ${B.hit.size}/${B.beats.length}`,x+w-4,y-16,10,'#e6dcc3','right');
    if(!B.sent&&t>B.beats[B.beats.length-1]+B.win+0.05){B.sent=true;B.sentT=time;net({t:'beatres',hit:B.hit.size});}if(B.sent&&time-B.sentT>2.5)G.beats=null;}
  if(G.beatRes&&time-G.beatRes.t0<1.8)bigTxt(G.beatRes.win?`역격돌 성공 ${G.beatRes.rate}%`:`역격돌 실패 ${G.beatRes.rate}%`,240,120,16,G.beatRes.win?'#ffd35a':'#e0473a',2);}
function drawRaid2World(icx,icy){{const X=G.raid&&G.raid.x;if(X&&X.beam&&X.beam.length>1&&G.map.raid==='mirror'){for(let i=0;i<X.beam.length-1;i++){const [ax,ay]=X.beam[i],[bx,by]=X.beam[i+1];const x1=ax-icx,y1=ay-icy-10,x2=bx-icx,y2=by-icy-10;wx.save();wx.globalCompositeOperation='lighter';wx.strokeStyle='rgba(255,233,168,0.35)';wx.lineWidth=5;wx.beginPath();wx.moveTo(x1,y1);wx.lineTo(x2,y2);wx.stroke();wx.restore();lineP(wpx,x1,y1,x2,y2,'w');}
    const e=X.beam[X.beam.length-1];if(R()<0.6)part(e[0]+rf(-3,3),e[1]-10,rf(-20,20),rf(-20,20),pick(['w','y']),0.3,{z:0,glow:true});}}
  const Hm=G.half;if(Hm){const t=time-Hm.t0;if(t>Hm.d+0.4){G.half=null;}else{const sx=Hm.x-icx,sy=Hm.y-icy;const ca=Math.cos(Hm.a),sa=Math.sin(Hm.a);const big=900;
    wx.save();wx.globalAlpha=t<Hm.d?0.18+0.14*Math.sin(time*16):0.55*(1-(t-Hm.d)/0.4);wx.fillStyle=t<Hm.d?'#6a2a9a':'#e6dcc3';wx.beginPath();wx.moveTo(sx-sa*big-ca*6,sy+ca*big-sa*6);wx.lineTo(sx+sa*big-ca*6,sy-ca*big-sa*6);wx.lineTo(sx+sa*big+ca*big,sy-ca*big+sa*big);wx.lineTo(sx-sa*big+ca*big,sy+ca*big+sa*big);wx.closePath();wx.fill();wx.restore();
    for(let s=-300;s<300;s+=2){const px=sx-sa*s-ca*6,py=sy+ca*s-sa*6;wx.fillStyle=(s/2|0)%3?'#c9a0e8':'#ffffff';wx.fillRect(Math.round(px),Math.round(py),1,1);}
}}
  const rs=G.raid;if(rs&&rs.x&&rs.x.ella&&G.map.raid==='moon'){const E=G.ella||(G.ella={x:me.x-30,y:me.y-10});const tx=me.x-26,ty=me.y-14;E.x+=(tx-E.x)*0.04;E.y+=(ty-E.y)*0.04;const bx=Math.round(E.x)-icx,by=Math.round(E.y+Math.sin(time*2)*3)-icy;
    G.ellaPos={x:bx,y:by};if(!E.sayN||time>E.sayN){E.say=pick(ELLA_LINES);E.sayS=time;E.sayN=time+rf(11,16);}
    const fr=raidFrames('r_ella',G.floor);wglow(bx,by-18,30,'#fff6d0',0.45);if(fr&&fr.idle){const f=fr.idle[0];const im=f.r;if(im&&im.c){wx.drawImage(im.c,bx-Math.round(im.c.width/2),by-im.c.height);}}if(R()<0.4)part(E.x+rf(-8,8),E.y-rf(4,30),0,0,pick(['w','y']),0.8,{z:0,vz:12,glow:true});}}
function drawRaid2Marks(icx,icy){const rs=G.raid;if(!rs||!rs.x||!rs.x.marks)return;for(const id in rs.x.marks){const p=id===myId?me:G.players.get(id);if(!p)continue;const x=Math.round(id===myId?me.x:p.dx)-icx,y=Math.round(id===myId?me.y:p.dy)-icy-34;const L=rs.x.marks[id]==='L';
  wglow(x,y,8,L?'#ffd35a':'#b86ad0',0.5);wx.fillStyle=L?'#ffd35a':'#b86ad0';wx.beginPath();wx.arc(x,y,3,0,Math.PI*2);wx.fill();if(L){for(let n=0;n<8;n++){const q=n/8*Math.PI*2;wx.fillRect(Math.round(x+Math.cos(q)*5),Math.round(y+Math.sin(q)*5),1,1);}}else{wx.fillStyle='#0e0b12';wx.beginPath();wx.arc(x+1.5,y-1,2.6,0,Math.PI*2);wx.fill();}}
  if(rs.x.cz)for(const [x,y,c] of rs.x.cz){const sx=x-icx,sy=y-icy;wx.fillStyle=c==='L'?'#ffd35a':'#b86ad0';for(let n=0;n<90;n++){const q=n/90*Math.PI*2+time;if(n%2)wx.fillRect(Math.round(sx+Math.cos(q)*44),Math.round(sy+Math.sin(q)*26),1,1);}}}

// ================= 루프 =================
let last=performance.now();
const FPSC={n:0,t:0,v:0};
function frame(ts){let dt=Math.min(0.05,(ts-last)/1000)||0;last=ts;FPSC.n++;if(ts-FPSC.t>=1000){FPSC.v=Math.round(FPSC.n*1000/(ts-FPSC.t));FPSC.n=0;FPSC.t=ts;}if(window.__tscale)dt*=window.__tscale;
  if(HSTOP>0){HSTOP-=dt;dt*=0.06;}
  try{if(scene==='game'&&G.map){update(dt);tutUpdate(dt);}else{time+=dt;if(scene==='select'&&SLOTPV.length)drawSlotPreviews();}render();}catch(err){console.error(err);}
  requestAnimationFrame(frame);}
function fit(){const vw=window.innerWidth,vh=window.innerHeight;let s=Math.min(vw/W,vh/H);if(s>=1&&Math.floor(s)/s>=0.8)s=Math.floor(s);cv.style.width=Math.floor(W*s)+'px';cv.style.height=Math.floor(H*s)+'px';
  const ns=Math.max(2,Math.min(4,Math.round(s*(window.devicePixelRatio||1))));if(ns!==SC||cv.width!==W*ns){SC=ns;cv.width=W*SC;cv.height=H*SC;ctx.imageSmoothingEnabled=false;TXT.clear();}}
window.addEventListener('resize',fit);fit();
// ================= 이야기 장면 (인트로·엔딩) =================
const CINE_INTRO=[
  {img:'art/intro1.jpg',t:'하렌 왕국에는 매일 아침 새벽의 종이 울렸다.\n새벽 기사단이 성문을 나서면, 사람들은 그 빛을 믿고 하루를 시작했다.'},
  {img:'art/intro2.jpg',t:'그러던 어느 날, 검은 달이 해를 삼켰다.\n흑월이 뜬 뒤로 아침은 다시 오지 않았고,\n사람들은 작은 등불에 기대어 끝나지 않는 밤을 버텼다.'},
  {img:'art/intro3.jpg',t:'밤을 끝내겠다던 새벽 기사단장 카르나스는\n가장 아끼던 기사 엘라를 제단에 바쳤다.\n그 희생으로 빚어진 것은 새벽이 아닌, 심연의 심장이었다.'},
  {img:'art/intro4.jpg',t:'카르나스는 흑왕이 되었고, 왕국을 지키던 이들도 차례로 무너졌다.\n경고의 종을 끝내 울리지 않은 종지기 그레고르,\n별을 읽던 쌍둥이 마녀 리라와 노라, 태엽이 되어 버린 기사 발렌.'},
  {img:'art/intro5.jpg',t:'엘라의 오빠 알드릭은 동생을 찾아 지하묘지로 내려갔다.\n돌아온 것은 그가 남긴 일지뿐.\n마지막 장에는 한 줄이 적혀 있었다. "등불을 꺼뜨리지 마라."'},
  {img:'art/intro6.jpg',t:'이제 그 일지를 주운 당신이 등불을 든다.\n심장이 뛰는 가장 깊은 곳까지,\n달 없는 밤을 지나.'}];
const CINE={on:false};
function cineEl(id){return document.getElementById(id);}
function playCine(list,opt){opt=opt||{};const root=cineEl('cine');if(!root)return;cineStop(true);
  for(const sc of list){const im=new Image();im.src=sc.img;}
  Object.assign(CINE,{on:true,list,opt,i:-1,typing:null,auto:null,lay:0,end:false});root.classList.add('on');cineEl('cineTitle').classList.remove('show');
  const dots=cineEl('cineDots');dots.innerHTML=list.map(()=>'<span></span>').join('');cineNext();}
function cineShow(i){const sc=CINE.list[i];const A=cineEl(CINE.lay?'cineB':'cineA'),B=cineEl(CINE.lay?'cineA':'cineB');CINE.lay^=1;
  A.style.backgroundImage=`url("${sc.img}")`;A.classList.remove('kb');void A.offsetWidth;A.classList.add('show','kb');B.classList.remove('show');
  [...cineEl('cineDots').children].forEach((d,k)=>d.classList.toggle('on',k<=i));
  const T=cineEl('cineTxt');T.textContent='';cineEl('cineHint').classList.remove('on');let n=0;clearInterval(CINE.typing);clearTimeout(CINE.auto);
  CINE.typing=setInterval(()=>{n++;T.textContent=sc.t.slice(0,n);if(n>=sc.t.length)cineTyped();},45);}
function cineTyped(){clearInterval(CINE.typing);CINE.typing=null;const sc=CINE.list[CINE.i];cineEl('cineTxt').textContent=sc.t;cineEl('cineHint').classList.add('on');clearTimeout(CINE.auto);CINE.auto=setTimeout(cineNext,4500);}
function cineNext(){if(!CINE.on)return;if(CINE.typing){cineTyped();return;}if(CINE.end){cineStop();return;}
  CINE.i++;if(CINE.i<CINE.list.length){cineShow(CINE.i);return;}
  // 마지막: 제목 카드
  CINE.end=true;clearTimeout(CINE.auto);cineEl('cineA').classList.remove('show');cineEl('cineB').classList.remove('show');cineEl('cineTxt').textContent='';cineEl('cineHint').classList.remove('on');
  const tt=cineEl('cineTitle');if(CINE.opt.title!==false){if(CINE.opt.title){tt.querySelector('b').textContent=CINE.opt.title[0];tt.querySelector('i').textContent=CINE.opt.title[1];}else{tt.querySelector('b').textContent='달 없는 밤';tt.querySelector('i').textContent='등불을 든 자';}tt.classList.add('show');CINE.auto=setTimeout(cineStop,4200);}else cineStop();}
function cineStop(silent){const was=CINE.on;CINE.on=false;clearInterval(CINE.typing);clearTimeout(CINE.auto);const root=cineEl('cine');if(root)root.classList.remove('on');
  ['cineA','cineB'].forEach(k=>{const e=cineEl(k);if(e)e.classList.remove('show','kb');});const tt=cineEl('cineTitle');if(tt)tt.classList.remove('show');
  if(was&&!silent){if(CINE.opt&&CINE.opt.key)try{localStorage.setItem(CINE.opt.key,'1');}catch(e){}if(CINE.opt&&CINE.opt.done)CINE.opt.done();}}
function playIntro(){playCine(CINE_INTRO,{key:'bc_intro'});}
(()=>{const root=cineEl('cine');if(!root)return;root.addEventListener('click',e=>{if(e.target.id==='cineSkip'){cineStop();return;}cineNext();});
  window.addEventListener('keydown',e=>{if(!CINE.on)return;if(e.code==='Escape'){cineStop();}else if(e.code==='Space'||e.code==='Enter'||e.code==='ArrowRight'){cineNext();}e.preventDefault();e.stopImmediatePropagation();},true);
  const b=cineEl('introBtn');if(b)b.addEventListener('click',playIntro);
  let seen=false;try{seen=!!localStorage.getItem('bc_intro');}catch(e){}if(!seen)setTimeout(()=>{if(scene==='select')playIntro();},300);})();
// ===== 캐릭터 옮기기: 이 기기의 캐릭터·창고·설정을 파일 하나로 내보내고 가져오기 (브라우저 ↔ PC 실행기) =====
function exportAll(){const data={};try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.startsWith('bc_'))data[k]=localStorage.getItem(k);}}catch(e){}
  const n=loadChars().length;if(!n){toast('내보낼 캐릭터가 없습니다');return;}const d=new Date(),pad=x=>String(x).padStart(2,'0');
  const blob=new Blob([JSON.stringify({app:'dalnight',v:1,ts:Date.now(),data})],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`달없는밤_캐릭터_${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}.json`;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);toast(`캐릭터 ${n}명을 파일로 내보냈어요`);}
function importAllFile(file){const r=new FileReader();r.onload=()=>{let o;try{o=JSON.parse(r.result);}catch(e){o=null;}const err=document.getElementById('importErr');if(!o||o.app!=='dalnight'||!o.data||typeof o.data!=='object'){if(err)err.textContent='달 없는 밤 캐릭터 파일이 아닙니다';return;}
    let inc=[];try{inc=JSON.parse(o.data[SAVE_KEY]||'[]').filter(SH.validChar);}catch(e){}const fresh=loadChars().length===0;
    try{for(const k in o.data){if(!k.startsWith('bc_')||k===SAVE_KEY)continue;if(fresh||localStorage.getItem(k)==null)localStorage.setItem(k,String(o.data[k]));}}catch(e){}
    const a=loadChars();for(const ch of inc){const i=a.findIndex(c=>c.id===ch.id);if(i>=0)a[i]=ch;else a.push(ch);}saveChars(a);if(err)err.textContent='';toast(`캐릭터 ${inc.length}명을 가져왔어요`);setTimeout(()=>location.reload(),900);};r.readAsText(file);}
(()=>{const ex=document.getElementById('exportAllBtn'),im=document.getElementById('importFileBtn'),fi=document.getElementById('importFile'),pc=document.getElementById('pcDl');
  if(ex)ex.onclick=exportAll;if(im&&fi){im.onclick=()=>fi.click();fi.onchange=()=>{if(fi.files&&fi.files[0])importAllFile(fi.files[0]);fi.value='';};}
  if(pc&&IS_DESKTOP)pc.hidden=true;})();
renderSelect();
try{const rj=JSON.parse(sessionStorage.getItem('bc_rejoin')||'null');if(rj&&rj.id){sessionStorage.removeItem('bc_rejoin');setTimeout(()=>{if(scene!=='select')return;startGame(rj.id);if(rj.pp)conn.prevParty=rj.pp;toast('새 버전으로 업데이트되었어요');},500);}}catch(e){}
loadImg('art/adv_portraits.jpg').then(im=>{if(im)SPR.advPort=im;});loadImg('sprites/costumes.png').then(im=>{if(!im)return;SPR.cost=sliceBare(im,40,24);for(const k in PF_CACHE)delete PF_CACHE[k];});loadImg('sprites/skins.png').then(im=>{if(!im)return;SPR.skins=im;SKSPR.clear();});loadImg('sprites/guns.png').then(im=>{if(!im)return;SPR.guns=im;GSPR.clear();for(const k of [...ICONS.keys()])if(k.startsWith('gi|'))ICONS.delete(k);});loadImg('sprites/heroes_adv.png').then(im=>{if(!im)return;SPR.heroAdv=sliceBare(im,40,24);for(const k in PF_CACHE)delete PF_CACHE[k];});
Promise.all([loadImg('sprites/heroes_anim.png'),loadImg('sprites/bosses_anim.png'),loadImg('sprites/heroes_bare.png'),loadImg('sprites/weapons.png'),loadImg('sprites/mons_anim.png')]).then(([h,b,hb,wp,ma])=>{if(h)SPR.heroAnim=sliceAnim(h,40,24);if(ma)SPR.monAnim=sliceAnim(ma,36,24);if(hb&&wp){SPR.heroBare=sliceBare(hb,40,24);SPR.weap=wp;ICONS.clear();}if(b)SPR.bossAnim=sliceAnim(b,72,48);for(const k in THEME_CACHE)THEME_CACHE[k].mon={};for(const k in PF_CACHE)delete PF_CACHE[k];if(scene==='select')renderSelect();});
Promise.all([loadImg('sprites/lobby.png'),loadImg('sprites/hubtiles.png'),loadImg('sprites/npcs.png'),loadImg('sprites/pets.png')]).then(([a,b,c,d])=>{LOB.img=a;LOB.tiles=b;LOB.npc=c;LOB.pets=d;LOB.ftex=null;NPC_FR=null;PET_FR=null;});
loadImg('sprites/tiles.png').then(t=>{if(!t)return;SPR.tiles=t;for(const k in THEME_CACHE)delete THEME_CACHE[k];});
Promise.all([loadImg('sprites/heroes.png'),loadImg('sprites/mons.png'),loadImg('sprites/bosses.png')]).then(([h,m,b])=>{if(!h||!m||!b)return;SPR.heroes=sliceAtlas(h,24);SPR.mons=sliceAtlas(m,24);SPR.bosses=sliceAtlas(b,48);SPR.ready=true;for(const k in THEME_CACHE)THEME_CACHE[k].mon={};for(const k in PF_CACHE)delete PF_CACHE[k];if(scene==='select')renderSelect();});
requestAnimationFrame(frame);
window.__BC={cprStart:k=>cprStart(k),set showInv(v){showInv=!!v;},set showShop(v){showShop=!!v;},G,me,net,onFx,gunAudioTest,shadowStage,musOut:()=>AC&&MUS?{AC,out:MUS.out}:null,initAudio,pf:playerFrames,playCine,playIntro,cineStop,get time(){return time;},get myId(){return myId;},startGame,loadChars,saveChars,get scene(){return scene;},get mus(){return MUS?{mode:MUS.mode,prof:MUS.prof,err:!!MUS.err,state:AC&&AC.state}:null;}};
})();
