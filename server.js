// GalzGames Ingressos - Backend com MongoDB Atlas
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://galzgames:Suenia81%40@cluster0.dygaehl.mongodb.net/galzgames?appName=Cluster0';
const UPLOADS_DIR = path.join(__dirname, 'public', 'images', 'uploads');
const ADMIN_SENHA = process.env.ADMIN_SENHA || 'Suenia81@';

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

let db = null;

async function connectMongo() {
  const { MongoClient } = require('mongodb');
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db('galzgames');
  console.log('MongoDB conectado!');
  const config = await db.collection('config').findOne({ _id: 'main' });
  if (!config) {
    await db.collection('config').insertOne({
      _id: 'main',
      eventName: 'Retro Gamer Day',
      eventDate: 'Sabado, 10 Mai 2025 - 18h',
      eventLocal: 'Arena GalzGames, Sao Paulo - SP',
      bgImage: '/images/banner.jpeg',
      precos: {
        normal: { nome: 'Normal', valor: 60, qtd: 200 },
        vip:    { nome: 'VIP', valor: 150, qtd: 60 },
        meia:   { nome: 'Meia-Entrada', valor: 30, qtd: 100 }
      },
      pagamento: { pixChave: '+5583981663576', pixTipo: 'Telefone', pixNome: 'GalzGames', outros: [] }
    });
  }
}

function getNextNumber(tickets) {
  if (!tickets || tickets.length === 0) return '100001';
  const nums = tickets.map(t => parseInt(t.number) || 100000);
  return String(Math.max(...nums) + 1);
}

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json'
};

function serveStatic(res, filePath) {
  const ext = path.extname(filePath);
  const mime = MIME[ext] || 'application/octet-stream';
  if (fs.existsSync(filePath)) {
    res.writeHead(200, { 'Content-Type': mime });
    fs.createReadStream(filePath).pipe(res);
  } else { res.writeHead(404); res.end('Not found'); }
}

function jsonRes(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
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
    if (!boundary) return cb(null, null);
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

const server = http.createServer(async (req, res) => {
  const { pathname } = url.parse(req.url, true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (!db) return jsonRes(res, 503, { error: 'Conectando ao banco... tente em instantes.' });

  try {
    // GET config
    if (pathname === '/api/config' && req.method === 'GET') {
      const c = await db.collection('config').findOne({ _id: 'main' });
      const { _id, ...rest } = c || {};
      return jsonRes(res, 200, rest);
    }
    // POST config
    if (pathname === '/api/config' && req.method === 'POST') {
      return parseBody(req, async body => {
        const { _id, ...upd } = body;
        await db.collection('config').updateOne({ _id: 'main' }, { $set: upd }, { upsert: true });
        jsonRes(res, 200, { ok: true });
      });
    }
    // GET tickets
    if (pathname === '/api/tickets' && req.method === 'GET') {
      const tickets = await db.collection('tickets').find({}).sort({ createdAt: 1 }).toArray();
      return jsonRes(res, 200, tickets.map(({ _id, ...t }) => t));
    }
    // POST ticket
    if (pathname === '/api/tickets' && req.method === 'POST') {
      return parseBody(req, async body => {
        const all = await db.collection('tickets').find({}, { projection: { number: 1 } }).toArray();
        const ticket = {
          id: crypto.randomUUID(),
          number: getNextNumber(all),
          name: body.name, email: body.email, cpf: body.cpf,
          type: body.type, typeKey: body.typeKey, price: body.price,
          qty: body.qty || 1, pagamento: body.pagamento || 'pix',
          used: false, createdAt: new Date().toISOString()
        };
        await db.collection('tickets').insertOne(ticket);
        const { _id, ...clean } = ticket;
        jsonRes(res, 201, clean);
      });
    }
    // POST validate
    if (pathname.startsWith('/api/validate/') && req.method === 'POST') {
      const number = pathname.split('/')[3];
      const ticket = await db.collection('tickets').findOne({ number });
      if (!ticket) return jsonRes(res, 404, { valid: false, message: 'Ingresso nao encontrado.' });
      if (ticket.used) return jsonRes(res, 200, { valid: false, used: true, message: 'Ingresso ja utilizado.', ticket });
      await db.collection('tickets').updateOne({ number }, { $set: { used: true, usedAt: new Date().toISOString() } });
      return jsonRes(res, 200, { valid: true, message: 'Ingresso valido! Entrada liberada.', ticket: { ...ticket, used: true } });
    }
    // POST reset
    if (pathname === '/api/reset' && req.method === 'POST') {
      return parseBody(req, async body => {
        if (body.senha !== ADMIN_SENHA) return jsonRes(res, 401, { ok: false, error: 'Senha incorreta.' });
        await db.collection('tickets').deleteMany({});
        jsonRes(res, 200, { ok: true });
      });
    }
    // POST upload-bg
    if (pathname === '/api/upload-bg' && req.method === 'POST') {
      return parseMultipart(req, async (fields, file) => {
        if (!file) return jsonRes(res, 400, { error: 'Nenhum arquivo.' });
        const ext = path.extname(file.filename) || '.jpg';
        const filename = 'bg_' + Date.now() + ext;
        fs.writeFileSync(path.join(UPLOADS_DIR, filename), file.data);
        const bgPath = '/images/uploads/' + filename;
        await db.collection('config').updateOne({ _id: 'main' }, { $set: { bgImage: bgPath } }, { upsert: true });
        jsonRes(res, 200, { ok: true, path: bgPath });
      });
    }
    // Static files
    if (pathname === '/') return serveStatic(res, path.join(__dirname, 'public', 'index.html'));
    if (pathname.startsWith('/images/uploads/')) return serveStatic(res, path.join(UPLOADS_DIR, path.basename(pathname)));
    if (pathname.startsWith('/images/')) return serveStatic(res, path.join(__dirname, 'public', 'images', path.basename(pathname)));
    serveStatic(res, path.join(__dirname, 'public', pathname.slice(1)));
  } catch (err) {
    console.error('Erro:', err.message);
    jsonRes(res, 500, { error: 'Erro interno: ' + err.message });
  }
});

connectMongo().then(() => {
  server.listen(PORT, () => console.log(`\nGalzGames Ingressos rodando em http://localhost:${PORT}\n`));
}).catch(err => {
  console.error('Erro MongoDB:', err.message);
  process.exit(1);
});
