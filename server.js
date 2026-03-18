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
    const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 10000 });
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
        const ticket = {
          id: crypto.randomUUID(),
          number: await getNextNumber(),
          name: body.name, email: body.email, cpf: body.cpf,
          type: body.type, typeKey: body.typeKey, price: body.price,
          qty: body.qty||1, pagamento: body.pagamento||'pix',
          used: false, createdAt: new Date().toISOString()
        };
        await addTicket(ticket);
        jsonRes(res, 201, ticket);
      });
    }
    if (pathname.startsWith('/api/validate/') && req.method === 'POST') {
      const number = pathname.split('/')[3];
      const result = await validateTicket(number);
      if (!result.found) return jsonRes(res, 404, { valid:false, message:'Ingresso nao encontrado.' });
      if (result.used) return jsonRes(res, 200, { valid:false, used:true, message:'Ingresso ja utilizado.', ticket:result.ticket });
      return jsonRes(res, 200, { valid:true, message:'Ingresso valido! Entrada liberada.', ticket:result.ticket });
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
