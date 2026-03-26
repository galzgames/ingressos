const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const UPLOADS_DIR = path.join(__dirname, 'public', 'images', 'uploads');
const ADMIN_SENHA = process.env.ADMIN_SENHA || 'Suenia81@';
const DATA_FILE = path.join(__dirname, 'data', 'tickets.json');
const CONFIG_FILE = path.join(__dirname, 'data', 'config.json');

// Garante diretorios
[UPLOADS_DIR, path.join(__dirname, 'data')].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// Fallback JSON (se MongoDB nao disponivel)
function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
if (!fs.existsSync(DATA_FILE)) writeJSON(DATA_FILE, []);
if (!fs.existsSync(CONFIG_FILE)) writeJSON(CONFIG_FILE, {
  eventName: 'Retro Gamer Day',
  eventDate: 'Sabado, 10 Mai 2025 - 18h',
  eventLocal: 'Arena GalzGames, Sao Paulo - SP',
  bgImage: '/images/banner.jpeg',
  precos: { normal:{nome:'Normal',valor:60,qtd:200}, vip:{nome:'VIP',valor:150,qtd:60}, meia:{nome:'Meia-Entrada',valor:30,qtd:100} },
  pagamento: { pixChave:'+5583981663576', pixTipo:'Telefone', pixNome:'GalzGames', outros:[] }
});

// MongoDB
let db = null;
let usingMongo = false;

async function connectMongo() {
  if (!MONGO_URI) { console.log('MONGO_URI nao definido, usando JSON local'); return; }
  try {
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 15000, tls: true, tlsAllowInvalidCertificates: false, connectTimeoutMS: 15000, socketTimeoutMS: 45000 });
    await client.connect();
    db = client.db('galzgames');
    usingMongo = true;
    console.log('MongoDB conectado!');
    // Config padrao
    const cfg = await db.collection('config').findOne({ _id: 'main' });
    if (!cfg) {
      const localCfg = readJSON(CONFIG_FILE) || {};
      await db.collection('config').insertOne({ _id: 'main', ...localCfg });
    }
  } catch(e) {
    console.log('MongoDB falhou, usando JSON local:', e.message);
    db = null; usingMongo = false;
  }
}

// DB helpers
async function getConfig() {
  if (usingMongo && db) {
    const c = await db.collection('config').findOne({ _id: 'main' });
    if (c) { const { _id, ...r } = c; return r; }
  }
  return readJSON(CONFIG_FILE) || {};
}
async function setConfig(update) {
  if (usingMongo && db) {
    const { _id, ...upd } = update;
    await db.collection('config').updateOne({ _id:'main' }, { $set: upd }, { upsert:true });
  } else {
    const cur = readJSON(CONFIG_FILE) || {};
    writeJSON(CONFIG_FILE, { ...cur, ...update });
  }
}
async function getTickets() {
  if (usingMongo && db) {
    const t = await db.collection('tickets').find({}).sort({ createdAt:1 }).toArray();
    return t.map(({ _id, ...r }) => r);
  }
  return readJSON(DATA_FILE) || [];
}
async function addTicket(ticket) {
  if (usingMongo && db) {
    await db.collection('tickets').insertOne(ticket);
  } else {
    const t = readJSON(DATA_FILE) || [];
    t.push(ticket);
    writeJSON(DATA_FILE, t);
  }
}
async function validateTicket(number) {
  if (usingMongo && db) {
    const t = await db.collection('tickets').findOne({ number });
    if (!t) return { found: false };
    if (t.used) return { found: true, used: true, ticket: t };
    await db.collection('tickets').updateOne({ number }, { $set: { used:true, usedAt: new Date().toISOString() } });
    return { found: true, used: false, ticket: { ...t, used:true } };
  } else {
    const tickets = readJSON(DATA_FILE) || [];
    const idx = tickets.findIndex(t => t.number === number);
    if (idx === -1) return { found: false };
    if (tickets[idx].used) return { found: true, used: true, ticket: tickets[idx] };
    tickets[idx].used = true;
    tickets[idx].usedAt = new Date().toISOString();
    writeJSON(DATA_FILE, tickets);
    return { found: true, used: false, ticket: tickets[idx] };
  }
}
async function resetTickets() {
  if (usingMongo && db) {
    await db.collection('tickets').deleteMany({});
  } else {
    writeJSON(DATA_FILE, []);
  }
}

// ===== PEDIDOS =====
const PEDIDOS_FILE = path.join(__dirname, 'data', 'pedidos.json');
if (!fs.existsSync(PEDIDOS_FILE)) writeJSON(PEDIDOS_FILE, []);

async function getPedidos() {
  if (usingMongo && db) {
    const p = await db.collection('pedidos').find({}).sort({ createdAt: -1 }).toArray();
    return p.map(({ _id, ...r }) => r);
  }
  return readJSON(PEDIDOS_FILE) || [];
}
async function addPedido(pedido) {
  if (usingMongo && db) { await db.collection('pedidos').insertOne(pedido); }
  else { const p = readJSON(PEDIDOS_FILE)||[]; p.push(pedido); writeJSON(PEDIDOS_FILE, p); }
}
async function getPedido(number) {
  if (usingMongo && db) { const p = await db.collection('pedidos').findOne({ number }); if(p){const{_id,...r}=p;return r;} return null; }
  const p = readJSON(PEDIDOS_FILE)||[]; return p.find(x=>x.number===number)||null;
}
async function updatePedido(number, update) {
  if (usingMongo && db) { await db.collection('pedidos').updateOne({ number }, { $set: update }); }
  else { const p = readJSON(PEDIDOS_FILE)||[]; const i=p.findIndex(x=>x.number===number); if(i>=0){p[i]={...p[i],...update};writeJSON(PEDIDOS_FILE,p);} }
}
async function getNextPedidoNumber() {
  const all = await getPedidos();
  if(!all.length) return 'P10001';
  const nums = all.map(p=>parseInt(p.number.replace('P',''))||10000);
  return 'P' + (Math.max(...nums)+1);
}
function getNextNumberSync(all) {
  if (!all || !all.length) return '100001';
  return String(Math.max(...all.map(t => parseInt(t.number)||100000)) + 1);
}

// ===== VALIDACAO CPF REAL =====
function validarCPF(cpf) {
  cpf = cpf.replace(/[^\d]/g, '');
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false; // todos iguais
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cpf[i]) * (10 - i);
  let rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(cpf[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cpf[i]) * (11 - i);
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  return rev === parseInt(cpf[10]);
}

// ===== QR CODE SEGURO COM HASH =====
function gerarQRHash(number, cpf, secret) {
  const data = number + ':' + cpf + ':' + secret;
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const chr = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(36).toUpperCase().padStart(8, '0');
}

const QR_SECRET = process.env.QR_SECRET || 'galzgames2025retrogamerday';

// ===== VERIFICAR CPF DUPLICADO =====
async function cpfJaCadastrado(cpf, typeKey) {
  const cpfLimpo = cpf.replace(/[^\d]/g, '');
  // Verifica em pedidos
  const pedidos = await getPedidos();
  const pedidoDup = pedidos.find(p => 
    p.cpf && p.cpf.replace(/[^\d]/g, '') === cpfLimpo && 
    p.typeKey === typeKey && 
    (p.status === 'pendente' || p.status === 'aprovado')
  );
  if (pedidoDup) return { duplicado: true, tipo: 'pedido', numero: pedidoDup.number };
  // Verifica em tickets
  const tickets = await getTickets();
  const ticketDup = tickets.find(t => 
    t.cpf && t.cpf.replace(/[^\d]/g, '') === cpfLimpo && 
    t.typeKey === typeKey
  );
  if (ticketDup) return { duplicado: true, tipo: 'ingresso', numero: ticketDup.number };
  return { duplicado: false };
}

async function getNextNumber() {
  const all = await getTickets();
  if (!all.length) return '100001';
  return String(Math.max(...all.map(t => parseInt(t.number)||100000)) + 1);
}

// HTTP helpers
const MIME = { '.html':'text/html','.css':'text/css','.js':'application/javascript','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.json':'application/json' };

function serveStatic(res, filePath) {
  const ext = path.extname(filePath);
  if (fs.existsSync(filePath)) {
    res.writeHead(200, { 'Content-Type': MIME[ext]||'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } else { res.writeHead(404); res.end('Not found'); }
}
function jsonRes(res, status, data) {
  res.writeHead(status, { 'Content-Type':'application/json', 'Access-Control-Allow-Origin':'*' });
  res.end(JSON.stringify(data));
}
function parseBody(req, cb) {
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => { try { cb(JSON.parse(body)); } catch { cb({}); } });
}
function parseMultipart(req, cb) {
  let chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    const buffer = Buffer.concat(chunks);
    const boundary = req.headers['content-type'].split('boundary=')[1];
    if (!boundary) return cb({}, null);
    const bBuf = Buffer.from('--' + boundary);
    let parts = [], start = buffer.indexOf(bBuf) + bBuf.length + 2;
    while (start < buffer.length) {
      let end = buffer.indexOf(bBuf, start);
      if (end === -1) break;
      const part = buffer.slice(start, end - 2);
      const hEnd = part.indexOf('\r\n\r\n');
      const headers = part.slice(0, hEnd).toString();
      const data = part.slice(hEnd + 4);
      const nm = headers.match(/name="([^"]+)"/);
      const fn = headers.match(/filename="([^"]+)"/);
      if (nm) parts.push({ name: nm[1], filename: fn?.[1], data });
      start = end + bBuf.length + 2;
    }
    cb({}, parts.find(p => p.filename));
  });
}

// SERVER
const server = http.createServer(async (req, res) => {
  const { pathname } = url.parse(req.url, true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  try {
    if (pathname === '/api/config' && req.method === 'GET') {
      return jsonRes(res, 200, await getConfig());
    }
    if (pathname === '/api/config' && req.method === 'POST') {
      return parseBody(req, async body => {
        await setConfig(body);
        jsonRes(res, 200, { ok: true });
      });
    }
    if (pathname === '/api/tickets' && req.method === 'GET') {
      return jsonRes(res, 200, await getTickets());
    }
    if (pathname === '/api/tickets' && req.method === 'POST') {
      return parseBody(req, async body => {
        // 1. Validar CPF
        const cpfLimpo = (body.cpf||'').replace(/[^\d]/g, '');
        if (!validarCPF(cpfLimpo)) {
          return jsonRes(res, 400, { error: 'CPF inválido. Verifique e tente novamente.' });
        }
        // 2. Verificar duplicidade de CPF por tipo
        const dup = await cpfJaCadastrado(cpfLimpo, body.typeKey);
        if (dup.duplicado) {
          return jsonRes(res, 409, { error: `Este CPF já possui um ingresso ${body.type} cadastrado (Pedido #${dup.numero}).` });
        }
        // 3. Gerar ingresso com QR Code seguro
        const number = await getNextNumber();
        const qrHash = gerarQRHash(number, cpfLimpo, QR_SECRET);
        const ticket = {
          id: crypto.randomUUID(),
          number,
          qrHash,
          qrCode: number + ':' + qrHash, // conteúdo do QR Code
          name: body.name, email: body.email,
          cpf: cpfLimpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'),
          type: body.type, typeKey: body.typeKey, price: body.price,
          qty: body.qty||1, pagamento: body.pagamento||'pix',
          used: false, createdAt: new Date().toISOString()
        };
        await addTicket(ticket);
        jsonRes(res, 201, ticket);
      });
    }
    if (pathname.startsWith('/api/validate/') && req.method === 'POST') {
      const parts = pathname.split('/');
      const number = parts[3];
      // Aceita formato numero:hash ou só número
      const [numPart, hashPart] = number.split(':');
      const result = await validateTicket(numPart);
      if (!result.found) return jsonRes(res, 404, { valid:false, message:'Ingresso não encontrado.' });
      if (result.used) return jsonRes(res, 200, { valid:false, used:true, message:'Ingresso já utilizado.', ticket:result.ticket });
      // Se QR Code enviou hash, valida autenticidade
      if (hashPart && result.ticket.qrHash && hashPart !== result.ticket.qrHash) {
        return jsonRes(res, 200, { valid:false, message:'QR Code inválido ou falsificado.', ticket:result.ticket });
      }
      return jsonRes(res, 200, { valid:true, message:'Ingresso válido! Entrada liberada.', ticket:result.ticket });
    }
    // GET /api/pedidos
    if (pathname === '/api/pedidos' && req.method === 'GET') {
      return jsonRes(res, 200, await getPedidos());
    }
    // GET /api/pedidos/:number
    if (pathname.startsWith('/api/pedidos/') && !pathname.includes('/aprovar') && !pathname.includes('/rejeitar') && req.method === 'GET') {
      const number = pathname.split('/')[3];
      const pedido = await getPedido(number);
      if (!pedido) return jsonRes(res, 404, { error: 'Pedido não encontrado.' });
      return jsonRes(res, 200, pedido);
    }
    // POST /api/pedidos
    if (pathname === '/api/pedidos' && req.method === 'POST') {
      return parseBody(req, async body => {
        // 1. Validar CPF
        const cpfLimpo = (body.cpf||'').replace(/[^\d]/g, '');
        if (!validarCPF(cpfLimpo)) {
          return jsonRes(res, 400, { error: 'CPF inválido. Verifique e tente novamente.' });
        }
        // 2. Verificar duplicidade
        const dup = await cpfJaCadastrado(cpfLimpo, body.typeKey);
        if (dup.duplicado) {
          return jsonRes(res, 409, { error: `Este CPF já possui um ingresso ${body.type} cadastrado (Pedido #${dup.numero}).` });
        }
        const pedido = {
          number: await getNextPedidoNumber(),
          name: body.name, email: body.email,
          cpf: cpfLimpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'),
          type: body.type, typeKey: body.typeKey, price: body.price,
          qty: body.qty || 1, status: 'pendente',
          createdAt: new Date().toISOString()
        };
        await addPedido(pedido);
        jsonRes(res, 201, pedido);
      });
    }
    // POST /api/pedidos/:number/aprovar
    if (pathname.includes('/aprovar') && pathname.startsWith('/api/pedidos/') && req.method === 'POST') {
      const number = pathname.split('/')[3];
      const pedido = await getPedido(number);
      if (!pedido) return jsonRes(res, 404, { error: 'Pedido não encontrado.' });
      // Gerar ingresso
      const all = await getTickets();
      const ticket = {
        id: require('crypto').randomUUID(),
        number: getNextNumberSync(all),
        name: pedido.name, email: pedido.email, cpf: pedido.cpf,
        type: pedido.type, typeKey: pedido.typeKey, price: pedido.price,
        qty: pedido.qty, pagamento: 'pix',
        used: false, createdAt: new Date().toISOString()
      };
      await addTicket(ticket);
      await updatePedido(number, { status: 'aprovado', ticketNumber: ticket.number, approvedAt: new Date().toISOString() });
      return jsonRes(res, 200, { ok: true, ticket });
    }
    // POST /api/pedidos/:number/rejeitar
    if (pathname.includes('/rejeitar') && pathname.startsWith('/api/pedidos/') && req.method === 'POST') {
      const number = pathname.split('/')[3];
      await updatePedido(number, { status: 'rejeitado', rejectedAt: new Date().toISOString() });
      return jsonRes(res, 200, { ok: true });
    }

    // POST /api/webhook/infinitepay — confirmação automática de pagamento
    if (pathname === '/api/webhook/infinitepay' && req.method === 'POST') {
      return parseBody(req, async body => {
        try {
          // InfinitePay envia status do pagamento
          const status = body.status || body.payment_status || '';
          const orderId = body.order_id || body.reference || body.metadata?.pedido || '';
          
          if ((status === 'approved' || status === 'paid' || status === 'succeeded') && orderId) {
            const pedido = await getPedido(orderId);
            if (pedido && pedido.status === 'pendente') {
              const all = await getTickets();
              const wNumber = getNextNumberSync(all);
              const wCpf = (pedido.cpf||'').replace(/[^\d]/g,'');
              const wHash = gerarQRHash(wNumber, wCpf, QR_SECRET);
              const ticket = {
                id: require('crypto').randomUUID(),
                number: wNumber,
                qrHash: wHash,
                qrCode: wNumber + ':' + wHash,
                name: pedido.name, email: pedido.email, cpf: pedido.cpf,
                type: pedido.type, typeKey: pedido.typeKey, price: pedido.price,
                qty: pedido.qty, pagamento: pedido.pagamento || 'infinitepay',
                used: false, createdAt: new Date().toISOString()
              };
              await addTicket(ticket);
              await updatePedido(orderId, { status: 'aprovado', ticketNumber: ticket.number, approvedAt: new Date().toISOString() });
              console.log('Pagamento aprovado via webhook:', orderId, '-> Ingresso:', ticket.number);
            }
          }
          jsonRes(res, 200, { ok: true });
        } catch(e) {
          console.error('Webhook error:', e.message);
          jsonRes(res, 200, { ok: true });
        }
      });
    }

    if (pathname === '/api/reset' && req.method === 'POST') {
      return parseBody(req, async body => {
        if (body.senha !== ADMIN_SENHA) return jsonRes(res, 401, { ok:false, error:'Senha incorreta.' });
        await resetTickets();
        jsonRes(res, 200, { ok:true });
      });
    }
    if (pathname === '/api/upload-bg' && req.method === 'POST') {
      return parseMultipart(req, async (fields, file) => {
        if (!file) return jsonRes(res, 400, { error:'Nenhum arquivo.' });
        const ext = path.extname(file.filename)||'.jpg';
        const filename = 'bg_' + Date.now() + ext;
        fs.writeFileSync(path.join(UPLOADS_DIR, filename), file.data);
        const bgPath = '/images/uploads/' + filename;
        await setConfig({ bgImage: bgPath });
        jsonRes(res, 200, { ok:true, path:bgPath });
      });
    }
    if (pathname === '/') return serveStatic(res, path.join(__dirname, 'public', 'index.html'));
    if (pathname.startsWith('/images/uploads/')) return serveStatic(res, path.join(UPLOADS_DIR, path.basename(pathname)));
    if (pathname.startsWith('/images/')) return serveStatic(res, path.join(__dirname, 'public', 'images', path.basename(pathname)));
    serveStatic(res, path.join(__dirname, 'public', pathname.slice(1)));
  } catch(err) {
    console.error('Erro:', err.message);
    jsonRes(res, 500, { error: err.message });
  }
});

// START - servidor inicia imediatamente, MongoDB conecta em paralelo
server.listen(PORT, () => {
  console.log(`GalzGames Ingressos rodando em http://localhost:${PORT}`);
  console.log(`Modo: ${MONGO_URI ? 'MongoDB' : 'JSON local'}`);
});

// Conecta MongoDB depois de subir (nao bloqueia o start)
connectMongo().catch(e => console.log('MongoDB:', e.message));
