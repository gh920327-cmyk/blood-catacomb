// 외부 패키지 없이 쓰는 최소 WebSocket 서버 (RFC 6455)
'use strict';
const crypto=require('crypto');
const {EventEmitter}=require('events');
const GUID='258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

class Socket extends EventEmitter{
  constructor(sock,maxPayload){super();this.sock=sock;this.readyState=1;this.max=maxPayload;this.buf=Buffer.alloc(0);this.frag=null;this.fragOp=0;
    sock.setNoDelay(true);
    sock.on('data',d=>this._data(d));
    const end=()=>{if(this.readyState===3)return;this.readyState=3;this.emit('close');};
    sock.on('close',end);sock.on('end',end);sock.on('error',()=>{end();try{sock.destroy();}catch(e){}});}
  _data(d){this.buf=this.buf.length?Buffer.concat([this.buf,d]):d;
    for(;;){const b=this.buf;if(b.length<2)return;const fin=(b[0]&0x80)!==0,op=b[0]&0x0f,masked=(b[1]&0x80)!==0;let len=b[1]&0x7f,off=2;
      if(len===126){if(b.length<4)return;len=b.readUInt16BE(2);off=4;}else if(len===127){if(b.length<10)return;const hi=b.readUInt32BE(2);len=hi*4294967296+b.readUInt32BE(6);off=10;}
      if(len>this.max){this.terminate();return;}
      const mo=masked?4:0;if(b.length<off+mo+len)return;
      let payload=b.subarray(off+mo,off+mo+len);
      if(masked){const mask=b.subarray(off,off+4);const out=Buffer.allocUnsafe(len);for(let i=0;i<len;i++)out[i]=payload[i]^mask[i&3];payload=out;}
      this.buf=b.subarray(off+mo+len);
      if(op===0x8){this._send(0x8,Buffer.alloc(0));this.terminate();return;}
      if(op===0x9){this._send(0xA,payload);continue;}
      if(op===0xA){this.emit('pong');continue;}
      if(op===0x0){if(!this.frag)continue;this.frag.push(payload);if(fin){const all=Buffer.concat(this.frag);this.frag=null;if(this.fragOp===1)this.emit('message',all.toString('utf8'));}continue;}
      if(op===0x1||op===0x2){if(!fin){this.frag=[payload];this.fragOp=op;continue;}if(op===0x1)this.emit('message',payload.toString('utf8'));continue;}
    }}
  _send(op,data){if(this.readyState!==1)return;const len=data.length;let head;
    if(len<126){head=Buffer.alloc(2);head[1]=len;}else if(len<65536){head=Buffer.alloc(4);head[1]=126;head.writeUInt16BE(len,2);}else{head=Buffer.alloc(10);head[1]=127;head.writeUInt32BE(Math.floor(len/4294967296),2);head.writeUInt32BE(len>>>0,6);}
    head[0]=0x80|op;try{this.sock.write(Buffer.concat([head,data]));}catch(e){}}
  send(str){this._send(0x1,Buffer.from(String(str),'utf8'));}
  ping(){this._send(0x9,Buffer.alloc(0));}
  close(){this._send(0x8,Buffer.alloc(0));this.terminate();}
  terminate(){if(this.readyState===3)return;this.readyState=3;try{this.sock.destroy();}catch(e){}this.emit('close');}
}

class WebSocketServer extends EventEmitter{
  constructor({server,path,maxPayload}){super();this.clients=new Set();this.max=maxPayload||1<<20;
    server.on('upgrade',(req,sock)=>{
      const u=(req.url||'').split('?')[0];const key=req.headers['sec-websocket-key'];
      if((path&&u!==path)||!key||String(req.headers.upgrade||'').toLowerCase()!=='websocket'){sock.write('HTTP/1.1 400 Bad Request\r\n\r\n');sock.destroy();return;}
      const accept=crypto.createHash('sha1').update(key+GUID).digest('base64');
      sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
      const ws=new Socket(sock,this.max);this.clients.add(ws);ws.on('close',()=>this.clients.delete(ws));this.emit('connection',ws,req);});}
}
module.exports={WebSocketServer};
