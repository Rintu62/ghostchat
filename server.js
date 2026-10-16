const http=require('http'),fs=require('fs'),crypto=require('crypto');
const TTL=(+process.env.ROOM_TTL_MIN||60)*60000, PORT=process.env.PORT||3000;
const KEEP=24*60*60*1000; // an expired room's link stays reusable for 24 hours
const page=fs.readFileSync(__dirname+'/public/index.html');
const types={'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.gif':'image/gif','.mp3':'audio/mpeg'};
const rooms=new Map();
const sse=(r,ev,d)=>r.clients.forEach(c=>c.write(`event: ${ev}\ndata: ${JSON.stringify(d)}\n\n`));

// Start a fresh chat session (new timer) in a room
function start(id,r){
  clearTimeout(r.idle);
  r.exp=Date.now()+TTL;
  r.timer=setTimeout(()=>expire(id),TTL);
}

// Timer ended (or Destroy Now): wipe the chat but keep the room link alive
function expire(id){
  const r=rooms.get(id); if(!r) return;
  sse(r,'destroyed',{reason:'expired'});
  const cs=[...r.clients]; r.clients.clear(); r.messages=[]; r.exp=0; r.timer=null;
  r.idle=setTimeout(()=>rooms.delete(id),KEEP);
  cs.forEach(c=>c.end());
}

http.createServer((req,res)=>{
  const p=new URL(req.url,'http://x').pathname.split('/').filter(Boolean);
  const json=(c,o)=>{res.writeHead(c,{'Content-Type':'application/json'});res.end(JSON.stringify(o))};
  const body=cb=>{let b='';req.on('data',d=>{b+=d;if(b.length>5000)req.destroy()});
    req.on('end',()=>{try{cb(JSON.parse(b||'{}'))}catch{json(400,{})}})};

  // Serve images and music from the public folder
  const ext=(p[0]||'').match(/^[\w-]+(\.(?:jpg|jpeg|png|webp|gif|mp3))$/i);
  if(ext){
    const file=__dirname+'/public/'+p[0], type=types[ext[1].toLowerCase()];
    fs.stat(file,(err,st)=>{
      if(err){res.writeHead(404);return res.end()}
      const h={'Content-Type':type,'Accept-Ranges':'bytes','Cache-Control':'public, max-age=86400'};
      const m=(req.headers.range||'').match(/bytes=(\d*)-(\d*)/);
      if(m){
        let s=m[1]?+m[1]:0, e=m[2]?+m[2]:st.size-1;
        if(!m[1]&&m[2]){s=Math.max(0,st.size-(+m[2]));e=st.size-1}
        e=Math.min(e,st.size-1);
        if(s>e||s>=st.size){res.writeHead(416,{'Content-Range':'bytes */'+st.size});return res.end()}
        res.writeHead(206,{...h,'Content-Range':`bytes ${s}-${e}/${st.size}`,'Content-Length':e-s+1});
        return fs.createReadStream(file,{start:s,end:e}).pipe(res);
      }
      res.writeHead(200,{...h,'Content-Length':st.size});
      fs.createReadStream(file).pipe(res);
    });
    return;
  }

  if(p[0]!=='api'){res.writeHead(200,{'Content-Type':'text/html'});return res.end(page)}
  if(req.method==='POST'&&p.length===2){
    if(rooms.size>=5000) return json(503,{});
    const id=crypto.randomBytes(8).toString('base64url');
    const room={messages:[],clients:new Set(),exp:0,timer:null,idle:null};
    rooms.set(id,room); start(id,room);
    return json(200,{id});
  }
  const r=rooms.get(p[2]); if(!r) return json(404,{});
  if(p[3]==='stream'){
    if(!r.exp) start(p[2],r); // room had expired: joining starts a new chat
    res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});
    res.write(`event: init\ndata: ${JSON.stringify({ttl:r.exp-Date.now(),messages:r.messages})}\n\n`);
    r.clients.add(res); sse(r,'online',{n:r.clients.size});
    req.on('close',()=>{r.clients.delete(res);sse(r,'online',{n:r.clients.size})});
    return;
  }
  if(req.method!=='POST') return json(405,{});
  if(p[3]==='destroy'){expire(p[2]);return json(200,{})}
  if(p[3]==='messages') return body(b=>{
    if(!r.exp) return json(410,{});
    const text=String(b.text||'').trim().slice(0,1000), name=String(b.name||'anonymous').slice(0,24);
    if(!text) return json(400,{});
    const m={name,text,ts:Date.now()}; r.messages.push(m); if(r.messages.length>500) r.messages.shift();
    sse(r,'message',m); json(200,{});
  });
  json(404,{});
}).listen(PORT,()=>console.log('GhostChat running on port '+PORT));
setInterval(()=>rooms.forEach(r=>sse(r,'ping',{})),20000);