const http=require('http'),fs=require('fs'),crypto=require('crypto');
const TTL=(+process.env.ROOM_TTL_MIN||10)*60000, PORT=process.env.PORT||3000;
const page=fs.readFileSync(__dirname+'/public/index.html');
const rooms=new Map();
const sse=(r,ev,d)=>r.clients.forEach(c=>c.write(`event: ${ev}\ndata: ${JSON.stringify(d)}\n\n`));
function destroy(id,reason){
  const r=rooms.get(id); if(!r) return;
  clearTimeout(r.timer); sse(r,'destroyed',{reason});
  const cs=[...r.clients]; r.clients.clear(); rooms.delete(id); cs.forEach(c=>c.end());
}
http.createServer((req,res)=>{
  const p=new URL(req.url,'http://x').pathname.split('/').filter(Boolean);
  const json=(c,o)=>{res.writeHead(c,{'Content-Type':'application/json'});res.end(JSON.stringify(o))};
  const body=cb=>{let b='';req.on('data',d=>{b+=d;if(b.length>5000)req.destroy()});
    req.on('end',()=>{try{cb(JSON.parse(b||'{}'))}catch{json(400,{})}})};
  if(p[0]!=='api'){res.writeHead(200,{'Content-Type':'text/html'});return res.end(page)}
  if(req.method==='POST'&&p.length===2){
    if(rooms.size>=5000) return json(503,{});
    const id=crypto.randomBytes(8).toString('base64url');
    rooms.set(id,{messages:[],clients:new Set(),exp:Date.now()+TTL,timer:setTimeout(()=>destroy(id,'expired'),TTL)});
    return json(200,{id});
  }
  const r=rooms.get(p[2]); if(!r) return json(404,{});
  if(p[3]==='stream'){
    res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});
    res.write(`event: init\ndata: ${JSON.stringify({ttl:r.exp-Date.now(),messages:r.messages})}\n\n`);
    r.clients.add(res); sse(r,'online',{n:r.clients.size});
    req.on('close',()=>{r.clients.delete(res);sse(r,'online',{n:r.clients.size})});
    return;
  }
  if(req.method!=='POST') return json(405,{});
  if(p[3]==='destroy'){destroy(p[2],'destroyed');return json(200,{})}
  if(p[3]==='messages') return body(b=>{
    const text=String(b.text||'').trim().slice(0,1000), name=String(b.name||'anonymous').slice(0,24);
    if(!text) return json(400,{});
    const m={name,text,ts:Date.now()}; r.messages.push(m); if(r.messages.length>500) r.messages.shift();
    sse(r,'message',m); json(200,{});
  });
  json(404,{});
}).listen(PORT,()=>console.log('GhostChat running on port '+PORT));
setInterval(()=>rooms.forEach(r=>sse(r,'ping',{})),20000);
