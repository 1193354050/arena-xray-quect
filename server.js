// Fetches official Xray release at runtime (sha256 verified), runs VLESS on 127.0.0.1,
// fronts it on $PORT: GET / -> 200, upgrade/XHTTP on secret path -> raw TCP pipe to xray.
const http=require('http'),net=require('net'),fs=require('fs'),path=require('path'),crypto=require('crypto'),{execFileSync,spawn}=require('child_process'),https=require('https');
const PORT=+process.env.PORT||3000, UUID=process.env.UUID, WSPATH=process.env.WSPATH||'/ws', MODE=process.env.TRANSPORT||'ws';
const VER=process.env.XRAY_VER||'v26.10.31', SHA=process.env.XRAY_SHA256||'e4bd9119f50ae7c41658b1abd0679ae06f98bd864a2907ff33f2f2cf7081b214';
const DIR=process.env.XRAY_DIR||'/tmp/xr', IN=8081;
if(!UUID){console.error('UUID env missing');process.exit(1)}
function get(u,f){return new Promise((ok,no)=>https.get(u,r=>{if(r.statusCode>=300&&r.headers.location)return get(r.headers.location,f).then(ok,no);if(r.statusCode!==200)return no(new Error('HTTP '+r.statusCode));const w=fs.createWriteStream(f);r.pipe(w);w.on('finish',ok)}).on('error',no))}
async function ensure(){fs.mkdirSync(DIR,{recursive:true});const bin=path.join(DIR,'xray');if(fs.existsSync(bin))return bin;
 const z=path.join(DIR,'x.zip');await get(`https://github.com/XTLS/Xray-core/releases/download/${VER}/Xray-linux-64.zip`,z);
 const h=crypto.createHash('sha256').update(fs.readFileSync(z)).digest('hex');if(h!==SHA)throw new Error('xray sha256 mismatch');
 try{execFileSync('unzip',['-o',z,'xray','-d',DIR])}catch(e){execFileSync('python3',['-c',`import zipfile;zipfile.ZipFile('${z}').extract('xray','${DIR}')`])}
 fs.chmodSync(bin,0o755);fs.unlinkSync(z);return bin}
function cfg(){const ss=MODE==='xhttp'?{network:'xhttp',xhttpSettings:{path:WSPATH,mode:'packet-up'}}:{network:'ws',wsSettings:{path:WSPATH}};
 return {log:{loglevel:process.env.XLOG||'warning'},inbounds:[{listen:'127.0.0.1',port:IN,protocol:'vless',settings:{clients:[{id:UUID}],decryption:'none'},streamSettings:ss}],outbounds:[{protocol:'freedom',settings:{domainStrategy:process.env.DS||'UseIPv4'}}]}}
(async()=>{let bin;try{bin=await ensure()}catch(e){console.error('xray fetch failed:',e.message)}
 if(bin){const c=path.join(DIR,'c.json');fs.writeFileSync(c,JSON.stringify(cfg()),{mode:0o600});
  const run=()=>{const p=spawn(bin,['run','-c',c],{stdio:'inherit'});p.on('exit',x=>{console.error('xray exit',x);setTimeout(run,3000)})};run()}
 const fwd=(req,sock,head)=>{const u=net.connect(IN,'127.0.0.1',()=>{let h=`${req.method} ${req.url} HTTP/1.1\r\n`;for(let i=0;i<req.rawHeaders.length;i+=2)h+=`${req.rawHeaders[i]}: ${req.rawHeaders[i+1]}\r\n`;u.write(h+'\r\n');if(head&&head.length)u.write(head);sock.pipe(u).pipe(sock)});u.on('error',()=>sock.destroy());sock.on('error',()=>u.destroy())};
 const SUBP=process.env.SUBPATH,FRONT=process.env.FRONT;
 const s=http.createServer((req,res)=>{if(SUBP&&FRONT&&req.url===SUBP){const q=new URLSearchParams({encryption:'none',security:'tls',sni:FRONT,alpn:'http/1.1',fp:'chrome',type:MODE,host:FRONT,path:WSPATH});if(MODE==='xhttp')q.set('mode','packet-up');const l=`vless://${UUID}@${FRONT}:443?${q}#bonto-de-ws`;res.writeHead(200,{'content-type':'text/plain','cache-control':'no-store','profile-update-interval':'24'});res.end(Buffer.from(l+'\n').toString('base64'));return}if(req.url.startsWith(WSPATH)){const p=http.request({host:'127.0.0.1',port:IN,method:req.method,path:req.url,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res)});p.on('error',()=>{res.writeHead(502);res.end()});req.pipe(p);return}res.writeHead(200,{'content-type':'text/html'});res.end('<h1>ok</h1>')});
 s.on('upgrade',(req,sock,head)=>{if(!req.url.startsWith(WSPATH))return sock.destroy();fwd(req,sock,head)});
 s.keepAliveTimeout=650000;s.headersTimeout=660000;s.requestTimeout=0;s.timeout=0;
 s.listen(PORT,'0.0.0.0',()=>console.log('listening',PORT,MODE))})();
