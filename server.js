// GalzGames Ingressos - Backend completo com MongoDB
const http = require('http');
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const url  = require('url');

const PORT        = process.env.PORT || 3000;
const MONGO_URI   = process.env.MONGO_URI;
const ADMIN_SENHA = process.env.ADMIN_SENHA || 'Suenia81@';
const QR_SECRET   = process.env.QR_SECRET   || 'galzgames2025retrogamerday';
const UPLOADS_DIR = path.join(__dirname, 'public', 'images', 'uploads');

[UPLOADS_DIR, path.join(__dirname,'data')].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ===== JSON FALLBACK =====
const DATA_FILE    = path.join(__dirname,'data','tickets.json');
const PEDIDOS_FILE = path.join(__dirname,'data','pedidos.json');
const CONFIG_FILE  = path.join(__dirname,'data','config.json');
const DEFAULT_CFG  = {
  eventName:'Retro Gamer Day', eventDate:'Sabado, 10 Mai 2025 - 18h',
  eventLocal:'Arena GalzGames, Sao Paulo - SP', bgImage:'/images/banner.jpeg',
  precos:{ normal:{nome:'Normal',valor:60,qtd:200}, vip:{nome:'VIP',valor:150,qtd:60}, meia:{nome:'Meia-Entrada',valor:30,qtd:100} },
  pagamento:{ pixChave:'+5583981663576', pixTipo:'Telefone', pixNome:'GalzGames', outros:[] }
};
[{f:DATA_FILE,d:[]},{f:PEDIDOS_FILE,d:[]},{f:CONFIG_FILE,d:DEFAULT_CFG}].forEach(({f,d})=>{
  if (!fs.existsSync(f)) fs.writeFileSync(f, JSON.stringify(d,null,2));
});
function rj(f){ try{ return JSON.parse(fs.readFileSync(f,'utf8')); }catch{ return null; } }
function wj(f,d){ fs.writeFileSync(f,JSON.stringify(d,null,2)); }

// ===== MONGODB =====
let db = null, usingMongo = false;
async function connectMongo() {
  if (!MONGO_URI) { console.log('Sem MONGO_URI - usando JSON'); return; }
  try {
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS:15000 });
    await client.connect();
    db = client.db('galzgames');
    usingMongo = true;
    console.log('MongoDB conectado!');
    const cfg = await db.collection('config').findOne({ _id:'main' });
    if (!cfg) await db.collection('config').insertOne({ _id:'main', ...DEFAULT_CFG });
  } catch(e) {
    console.log('MongoDB falhou, usando JSON:', e.message);
  }
}

// ===== DB HELPERS =====
async function getConfig() {
  if (usingMongo) { const c=await db.collection('config').findOne({_id:'main'}); if(c){const{_id,...r}=c;return r;} }
  return rj(CONFIG_FILE) || DEFAULT_CFG;
}
async function setConfig(upd) {
  const {_id,...u}=upd;
  if (usingMongo) await db.collection('config').updateOne({_id:'main'},{$set:u},{upsert:true});
  else { const c=rj(CONFIG_FILE)||{}; wj(CONFIG_FILE,{...c,...u}); }
}
async function getTickets() {
  if (usingMongo) { const t=await db.collection('tickets').find({}).sort({createdAt:1}).toArray(); return t.map(({_id,...r})=>r); }
  return rj(DATA_FILE)||[];
}
async function addTicket(t) {
  if (usingMongo) await db.collection('tickets').insertOne(t);
  else { const a=rj(DATA_FILE)||[]; a.push(t); wj(DATA_FILE,a); }
}
async function findTicketByNumber(num) {
  if (usingMongo) { const t=await db.collection('tickets').findOne({number:num}); if(t){const{_id,...r}=t;return r;} return null; }
  return (rj(DATA_FILE)||[]).find(t=>t.number===num)||null;
}
async function markTicketUsed(num) {
  const usedAt = new Date().toISOString();
  if (usingMongo) await db.collection('tickets').updateOne({number:num},{$set:{used:true,usedAt}});
  else { const a=rj(DATA_FILE)||[]; const i=a.findIndex(t=>t.number===num); if(i>=0){a[i].used=true;a[i].usedAt=usedAt;wj(DATA_FILE,a);} }
}
async function getPedidos(status) {
  let all;
  if (usingMongo) { const p=await db.collection('pedidos').find({}).sort({createdAt:-1}).toArray(); all=p.map(({_id,...r})=>r); }
  else all=rj(PEDIDOS_FILE)||[];
  return status && status!=='all' ? all.filter(p=>p.status===status) : all;
}
async function getPedido(num) {
  if (usingMongo) { const p=await db.collection('pedidos').findOne({number:num}); if(p){const{_id,...r}=p;return r;} return null; }
  return (rj(PEDIDOS_FILE)||[]).find(p=>p.number===num)||null;
}
async function addPedido(p) {
  if (usingMongo) await db.collection('pedidos').insertOne(p);
  else { const a=rj(PEDIDOS_FILE)||[]; a.push(p); wj(PEDIDOS_FILE,a); }
}
async function updatePedido(num, upd) {
  if (usingMongo) await db.collection('pedidos').updateOne({number:num},{$set:upd});
  else { const a=rj(PEDIDOS_FILE)||[]; const i=a.findIndex(p=>p.number===num); if(i>=0){a[i]={...a[i],...upd};wj(PEDIDOS_FILE,a);} }
}
async function resetTickets() {
  if (usingMongo) await db.collection('tickets').deleteMany({});
  else wj(DATA_FILE,[]);
}
async function getNextTicketNumber() {
  const all = await getTickets();
  if (!all.length) return '100001';
  return String(Math.max(...all.map(t=>parseInt(t.number)||100000))+1);
}
async function getNextPedidoNumber() {
  const all = await getPedidos('all');
  if (!all.length) return 'P10001';
  return 'P'+String(Math.max(...all.map(p=>parseInt(p.number.replace('P',''))||10000))+1);
}

// ===== CPF VALIDATION =====
function validarCPF(cpf) {
  cpf = cpf.replace(/[^\d]/g,'');
  if (cpf.length!==11||/^(\d)\1{10}$/.test(cpf)) return false;
  let s=0; for(let i=0;i<9;i++) s+=parseInt(cpf[i])*(10-i);
  let r=11-(s%11); if(r>=10)r=0; if(r!==parseInt(cpf[9])) return false;
  s=0; for(let i=0;i<10;i++) s+=parseInt(cpf[i])*(11-i);
  r=11-(s%11); if(r>=10)r=0; return r===parseInt(cpf[10]);
}

// ===== QR HASH =====
function gerarQRHash(number, cpf) {
  const data = number+':'+cpf+':'+QR_SECRET;
  let h=0; for(let i=0;i<data.length;i++){const c=data.charCodeAt(i);h=((h<<5)-h)+c;h|=0;}
  return Math.abs(h).toString(36).toUpperCase().padStart(8,'0');
}

// ===== GERAR TICKET (usado em todos os fluxos) =====
async function gerarTicket(pedido) {
  const number = await getNextTicketNumber();
  const cpfLimpo = (pedido.cpf||'').replace(/[^\d]/g,'');
  const qrHash = gerarQRHash(number, cpfLimpo);
  const ticket = {
    id: crypto.randomUUID(),
    number, qrHash,
    qrCode: number+':'+qrHash,
    name: pedido.name, email: pedido.email, cpf: pedido.cpf,
    type: pedido.type, typeKey: pedido.typeKey, price: pedido.price,
    qty: pedido.qty||1,
    pagamento: pedido.pagamento||'infinitepay',
    used: false,
    createdAt: new Date().toISOString()
  };
  await addTicket(ticket);
  await updatePedido(pedido.number, {
    status:'aprovado',
    ticketNumber: ticket.number,
    approvedAt: new Date().toISOString()
  });
  console.log(`[TICKET] Gerado #${ticket.number} para ${ticket.email} (pedido ${pedido.number})`);
  return ticket;
}

// ===== HTTP HELPERS =====
const MIME = {
  '.html':'text/html','.css':'text/css','.js':'application/javascript',
  '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg',
  '.webp':'image/webp','.ico':'image/x-icon','.json':'application/json'
};
function serveStatic(res, filePath) {
  const ext = path.extname(filePath);
  if (fs.existsSync(filePath)) {
    res.writeHead(200,{'Content-Type':MIME[ext]||'application/octet-stream'});
    fs.createReadStream(filePath).pipe(res);
  } else { res.writeHead(404); res.end('Not found'); }
}
function jsonRes(res, status, data) {
  res.writeHead(status,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
  res.end(JSON.stringify(data));
}
function parseBody(req, cb) {
  let body=''; req.on('data',c=>body+=c); req.on('end',()=>{try{cb(JSON.parse(body));}catch{cb({});}});
}
function parseMultipart(req, cb) {
  let chunks=[]; req.on('data',c=>chunks.push(c)); req.on('end',()=>{
    const buf=Buffer.concat(chunks);
    const boundary=req.headers['content-type'].split('boundary=')[1];
    if(!boundary) return cb({},null);
    const bBuf=Buffer.from('--'+boundary);
    let parts=[],start=buf.indexOf(bBuf)+bBuf.length+2;
    while(start<buf.length){
      let end=buf.indexOf(bBuf,start); if(end===-1)break;
      const part=buf.slice(start,end-2); const hEnd=part.indexOf('\r\n\r\n');
      const headers=part.slice(0,hEnd).toString(); const data=part.slice(hEnd+4);
      const nm=headers.match(/name="([^"]+)"/); const fn=headers.match(/filename="([^"]+)"/);
      if(nm) parts.push({name:nm[1],filename:fn?.[1],data});
      start=end+bBuf.length+2;
    }
    cb({}, parts.find(p=>p.filename));
  });
}

// ===== SERVER =====
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if (req.method==='OPTIONS'){res.writeHead(204);return res.end();}

  try {
    // ===== STATUS =====
    if (pathname==='/api/status') {
      const tickets = await getTickets();
      const pedidos = await getPedidos('all');
      return jsonRes(res,200,{
        ok:true, db:usingMongo?'mongodb':'json',
        tickets:tickets.length,
        pedidos:{
          total:pedidos.length,
          pendentes:pedidos.filter(p=>p.status==='pendente').length,
          aprovados:pedidos.filter(p=>p.status==='aprovado').length,
          rejeitados:pedidos.filter(p=>p.status==='rejeitado').length,
        },
        uptime:Math.round(process.uptime())+'s'
      });
    }

    // ===== CONFIG =====
    if (pathname==='/api/config' && req.method==='GET') {
      return jsonRes(res,200,await getConfig());
    }
    if (pathname==='/api/config' && req.method==='POST') {
      return parseBody(req, async body=>{
        const {_id,...upd}=body;
        await setConfig(upd);
        jsonRes(res,200,{ok:true});
      });
    }

    // ===== TICKETS =====
    if (pathname==='/api/tickets' && req.method==='GET') {
      return jsonRes(res,200,await getTickets());
    }
    if (pathname==='/api/tickets/buscar' && req.method==='GET') {
      const {cpf,number,email}=parsed.query;
      const todos=await getTickets();
      let r=[];
      if (number) r=todos.filter(t=>t.number===number.replace('#','').trim());
      else if (cpf){const c=cpf.replace(/[^\d]/g,'');r=todos.filter(t=>t.cpf&&t.cpf.replace(/[^\d]/g,'')===c);}
      else if (email) r=todos.filter(t=>t.email&&t.email.toLowerCase()===email.toLowerCase().trim());
      return jsonRes(res,200,r);
    }
    if (pathname==='/api/tickets' && req.method==='POST') {
      return parseBody(req, async body=>{
        const cpfLimpo=(body.cpf||'').replace(/[^\d]/g,'');
        if (!validarCPF(cpfLimpo)) return jsonRes(res,400,{error:'CPF inválido.'});
        const number = await getNextTicketNumber();
        const qrHash = gerarQRHash(number, cpfLimpo);
        const ticket = {
          id:crypto.randomUUID(), number, qrHash, qrCode:number+':'+qrHash,
          name:body.name, email:body.email, cpf:cpfLimpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4'),
          type:body.type, typeKey:body.typeKey, price:body.price,
          qty:body.qty||1, pagamento:body.pagamento||'pix',
          used:false, createdAt:new Date().toISOString()
        };
        await addTicket(ticket);
        jsonRes(res,201,ticket);
      });
    }
    if (pathname.startsWith('/api/validate/') && req.method==='POST') {
      const parts = pathname.split('/')[3].split(':');
      const number = parts[0];
      const hashSent = parts[1];
      const ticket = await findTicketByNumber(number);
      if (!ticket) return jsonRes(res,404,{valid:false,message:'Ingresso não encontrado.'});
      if (ticket.used) return jsonRes(res,200,{valid:false,used:true,message:'Ingresso já utilizado.',ticket});
      if (hashSent && ticket.qrHash && hashSent!==ticket.qrHash)
        return jsonRes(res,200,{valid:false,message:'QR Code inválido.',ticket});
      await markTicketUsed(number);
      return jsonRes(res,200,{valid:true,message:'Válido! Entrada liberada.',ticket:{...ticket,used:true}});
    }
    if (pathname==='/api/reset' && req.method==='POST') {
      return parseBody(req, async body=>{
        if (body.senha!==ADMIN_SENHA) return jsonRes(res,401,{ok:false,error:'Senha incorreta.'});
        await resetTickets();
        jsonRes(res,200,{ok:true});
      });
    }

    // ===== PEDIDOS =====
    if (pathname==='/api/pedidos' && req.method==='GET') {
      const status = parsed.query.status||'pendente';
      return jsonRes(res,200,await getPedidos(status));
    }
    if (pathname==='/api/pedidos' && req.method==='POST') {
      return parseBody(req, async body=>{
        const cpfLimpo=(body.cpf||'').replace(/[^\d]/g,'');
        if (!validarCPF(cpfLimpo)) return jsonRes(res,400,{error:'CPF inválido.'});
        const pedido = {
          number: await getNextPedidoNumber(),
          name:body.name, email:body.email,
          cpf:cpfLimpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4'),
          type:body.type, typeKey:body.typeKey, price:body.price,
          qty:body.qty||1, pagamento:body.pagamento||'pix',
          status:'pendente', createdAt:new Date().toISOString()
        };
        await addPedido(pedido);
        jsonRes(res,201,pedido);
      });
    }
    if (pathname.match(/\/api\/pedidos\/[^/]+$/) && req.method==='GET') {
      const number = pathname.split('/')[3];
      const pedido = await getPedido(number);
      if (!pedido) return jsonRes(res,404,{error:'Pedido não encontrado.'});
      return jsonRes(res,200,pedido);
    }
    if (pathname.includes('/aprovar') && pathname.startsWith('/api/pedidos/') && req.method==='POST') {
      const number = pathname.split('/')[3];
      const pedido = await getPedido(number);
      if (!pedido) return jsonRes(res,404,{error:'Pedido não encontrado: '+number});
      if (pedido.status==='aprovado') {
        const t=await findTicketByNumber(pedido.ticketNumber);
        return jsonRes(res,200,{ok:false,error:'Já aprovado. Ingresso #'+pedido.ticketNumber,ticket:t});
      }
      const ticket = await gerarTicket({...pedido,pagamento:pedido.pagamento||'manual'});
      return jsonRes(res,200,{ok:true,ticket});
    }
    if (pathname.includes('/rejeitar') && pathname.startsWith('/api/pedidos/') && req.method==='POST') {
      const number = pathname.split('/')[3];
      await updatePedido(number,{status:'rejeitado',rejectedAt:new Date().toISOString()});
      return jsonRes(res,200,{ok:true});
    }

    // ===== WEBHOOK INFINITEPAY =====
    if (pathname==='/api/webhook/infinitepay' && req.method==='POST') {
      return parseBody(req, async body=>{
        try {
          console.log('[WEBHOOK] Recebido:', JSON.stringify(body).slice(0,500));
          const status = (
            body.status||body.payment_status||body.charge?.status||
            body.data?.status||body.event||body.type||''
          ).toLowerCase();
          const ref = (
            body.reference||body.external_id||body.order_id||
            body.metadata?.pedido||body.charge?.metadata?.pedido||
            body.data?.reference||body.data?.external_id||
            body.charge?.reference||''
          ).toString().trim();
          const aprovado = ['approved','paid','succeeded','active','captured',
            'complete','completed','charge.paid','payment_approved'].some(s=>status.includes(s));

          console.log(`[WEBHOOK] status="${status}" ref="${ref}" aprovado=${aprovado}`);

          if (aprovado && ref) {
            const pedido = await getPedido(ref);
            if (pedido && pedido.status==='pendente') {
              const ticket = await gerarTicket(pedido);
              console.log(`[WEBHOOK] Ingresso gerado automaticamente: #${ticket.number}`);
            } else {
              console.log(`[WEBHOOK] Pedido não encontrado ou já processado: ${ref}`);
            }
          }
          jsonRes(res,200,{ok:true,received:true});
        } catch(e) {
          console.error('[WEBHOOK] Erro:', e.message);
          jsonRes(res,200,{ok:true});
        }
      });
    }

    // ===== UPLOAD BANNER =====
    if (pathname==='/api/upload-bg' && req.method==='POST') {
      return parseMultipart(req, async (fields, file)=>{
        if (!file) return jsonRes(res,400,{error:'Nenhum arquivo.'});
        const ext=path.extname(file.filename)||'.jpg';
        const filename='bg_'+Date.now()+ext;
        fs.writeFileSync(path.join(UPLOADS_DIR,filename),file.data);
        const bgPath='/images/uploads/'+filename;
        await setConfig({bgImage:bgPath});
        jsonRes(res,200,{ok:true,path:bgPath});
      });
    }

    // ===== STATIC FILES =====
    if (pathname==='/') return serveStatic(res,path.join(__dirname,'public','index.html'));
    if (pathname.startsWith('/images/uploads/')) return serveStatic(res,path.join(UPLOADS_DIR,path.basename(pathname)));
    if (pathname.startsWith('/images/')) return serveStatic(res,path.join(__dirname,'public','images',path.basename(pathname)));
    serveStatic(res,path.join(__dirname,'public',pathname.slice(1)));

  } catch(err) {
    console.error('[SERVER] Erro:', err.message);
    jsonRes(res,500,{error:err.message});
  }
});

// ===== START =====
server.listen(PORT, ()=>console.log(`\nGalzGames Ingressos rodando em http://localhost:${PORT}\nModo: ${MONGO_URI?'MongoDB':'JSON local'}\n`));
connectMongo().catch(e=>console.log('MongoDB:', e.message));
