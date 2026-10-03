// 달 없는 밤 외전 · 거대 사냥 — 멀티 중계 서버 (로비 · 파티 · 사냥터)
// 몬스터 계산은 파티장 브라우저가 하고, 서버는 같은 방 사람끼리 신호만 전달한다 (서버 부담이 아주 작음)
'use strict';
module.exports=function attachHunt(server,WebSocketServer){
  const wss=new WebSocketServer({server,path:'/hunt-ws',maxPayload:64*1024});
  let nextId=1,nextParty=1,nextRoom=1;
  const users=new Map(),parties=new Map(),rooms=new Map();
  const MAXP=4;
  const send=(u,o)=>{if(u&&u.ws.readyState===1)u.ws.send(typeof o==='string'?o:JSON.stringify(o));};
  const clean=(s,n)=>String(s==null?'':s).replace(/[<>&"'`\u0000-\u001f]/g,'').trim().slice(0,n);
  const pub=u=>({id:u.id,name:u.name,sex:u.sex});
  function partyInfo(p){return {id:p.id,name:p.name,leader:p.leader,open:p.open,hunting:!!p.room,members:p.members.map(id=>pub(users.get(id)))};}
  function lobbyUsers(){return [...users.values()].filter(u=>!u.room);}
  function pushParties(){const s=JSON.stringify({t:'parties',list:[...parties.values()].map(partyInfo)});for(const u of lobbyUsers())send(u,s);}
  function partyUpdate(p){const s=JSON.stringify({t:'party',party:partyInfo(p)});for(const id of p.members)send(users.get(id),s);pushParties();}
  function leaveParty(u){const p=parties.get(u.party);u.party=null;send(u,{t:'party',party:null});if(!p)return;
    p.members=p.members.filter(id=>id!==u.id);
    if(!p.members.length){parties.delete(p.id);pushParties();return;}
    if(p.leader===u.id){p.leader=p.members[0];p.name=users.get(p.leader).name+'의 파티';}
    partyUpdate(p);}
  function roomSend(r,o,except){const s=typeof o==='string'?o:JSON.stringify(o);for(const id of r.members)if(id!==except)send(users.get(id),s);}
  function leaveRoom(u){const r=rooms.get(u.room);u.room=null;if(!r)return;
    r.members=r.members.filter(id=>id!==u.id);
    if(!r.members.length){rooms.delete(r.id);const p=parties.get(r.party);if(p&&p.room===r.id){p.room=null;pushParties();}return;}
    roomSend(r,{t:'leave',id:u.id});
    if(r.host===u.id){r.host=r.members[0];roomSend(r,{t:'host',id:r.host});}}
  function endRoom(r,result){for(const id of r.members){const u=users.get(id);if(u){u.room=null;send(u,{t:'end',result});}}rooms.delete(r.id);
    const p=parties.get(r.party);if(p){p.room=null;partyUpdate(p);}else pushParties();}
  function handle(u,o,raw){
    const r=u.room?rooms.get(u.room):null;
    switch(o.t){
      case 'hi':u.name=clean(o.name,12)||('사냥꾼'+u.id);u.sex=o.sex==='f'?'f':'m';send(u,{t:'parties',list:[...parties.values()].map(partyInfo)});break;
      case 'pcreate':{if(u.room)return;if(u.party)leaveParty(u);const p={id:nextParty++,name:u.name+'의 파티',leader:u.id,members:[u.id],open:o.open!==false,room:null};parties.set(p.id,p);u.party=p.id;partyUpdate(p);break;}
      case 'pjoin':{if(u.room)return;const p=parties.get(+o.id);if(!p||p.room||!p.open||p.members.length>=MAXP||p.members.includes(u.id)){send(u,{t:'err',m:'들어갈 수 없는 파티예요'});return;}
        if(u.party)leaveParty(u);p.members.push(u.id);u.party=p.id;partyUpdate(p);break;}
      case 'pleave':if(!u.room)leaveParty(u);break;
      case 'pstart':{const p=parties.get(u.party);if(!p||p.leader!==u.id||p.room)return;
        const room={id:nextRoom++,party:p.id,host:u.id,quest:clean(o.quest,20)||'soot',members:[...p.members]};rooms.set(room.id,room);p.room=room.id;
        for(const id of room.members){const m=users.get(id);m.room=room.id;}
        for(const id of room.members)send(users.get(id),{t:'start',room:room.id,host:room.host,quest:room.quest,me:id,peers:room.members.filter(x=>x!==id).map(x=>pub(users.get(x)))});
        pushParties();break;}
      case 'solo':break;
      // 사냥터 중계
      case 'st':case 'ev':if(!r)return;o.f=u.id;roomSend(r,o,u.id);break;
      case 'mon':if(!r||r.host!==u.id)return;roomSend(r,raw,u.id);break;
      case 'hit':if(!r||r.host===u.id)return;o.f=u.id;send(users.get(r.host),o);break;
      case 'end':if(!r||r.host!==u.id)return;endRoom(r,clean(o.result,8));break;
      case 'back':if(r){leaveRoom(u);const p=parties.get(u.party);if(p)partyUpdate(p);else pushParties();}break;
      // 로비(마을) 위치 공유 — 3단계에서 사용
      case 'lst':if(u.room)return;o.f=u.id;{const s=JSON.stringify(o);for(const v of lobbyUsers())if(v!==u)send(v,s);}break;
    }}
  wss.on('connection',ws=>{
    const u={id:nextId++,ws,name:'사냥꾼',sex:'m',party:null,room:null,alive:true,n:0,t0:Date.now()};users.set(u.id,u);
    ws.on('message',m=>{const now=Date.now();if(now-u.t0>1000){u.t0=now;u.n=0;}if(++u.n>90)return; // 초당 90개 넘으면 무시
      let o;try{o=JSON.parse(m);}catch(e){return;}if(!o||typeof o.t!=='string')return;try{handle(u,o,m);}catch(e){console.error('hunt',e);}});
    ws.on('pong',()=>{u.alive=true;});
    ws.on('close',()=>{leaveRoom(u);if(u.party)leaveParty(u);users.delete(u.id);pushParties();});
    send(u,{t:'hello',id:u.id});});
  setInterval(()=>{for(const u of users.values()){if(!u.alive){try{u.ws.terminate();}catch(e){}continue;}u.alive=false;try{u.ws.ping();}catch(e){}}},25000);
  console.log('거대 사냥 중계 서버 준비 · /hunt-ws');
  return {users,parties,rooms};
};
