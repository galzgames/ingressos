// GalzGames Ingressos - Backend Node.js (sem dependências externas)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'tickets.json');
const CONFIG_FILE = path.join(__dirname, 'data', 'config.json');
const UPLOADS_DIR = path.join(__dirname, 'public', 'images', 'uploads');

// Garante que os diretórios existam
[path.join(__dirname, 'data'), UPLOADS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Inicializa arquivos de dados
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify([]));
if (!fs.existsSync(CONFIG_FILE)) fs.writeFileSync(CONFIG_FILE, JSON.stringify({
  eventName: 'Retro Gamer Day',
  eventDate: 'Sábado, 10 Mai 2025 • 18h',
  eventLocal: 'Arena GalzGames, São Paulo - SP',
  bgImage: '/images/banner.jpeg'
}));

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function generateTicketNumber() {
  const tickets = readJSON(DATA_FILE) || [];
  return String(100001 + tickets.length);
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
  } else {
    res.writeHead(404); res.end('Not found');
  }
}

function jsonResponse(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

function parseBody(req, cb) {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try { cb(JSON.parse(body)); } catch { cb({}); }
  });
}

function parseMultipart(req, cb) {
  let chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    const buffer = Buffer.concat(chunks);
    const boundary = req.headers['content-type'].split('boundary=')[1];
    if (!boundary) return cb(null, null);
    const bBuf = Buffer.from('--' + boundary);
    let parts = [];
    let start = buffer.indexOf(bBuf) + bBuf.length + 2;
    while (start < buffer.length) {
      let end = buffer.indexOf(bBuf, start);
      if (end === -1) break;
      const part = buffer.slice(start, end - 2);
      const headerEnd = part.indexOf('\r\n\r\n');
      const headers = part.slice(0, headerEnd).toString();
      const data = part.slice(headerEnd + 4);
      const nameMatch = headers.match(/name="([^"]+)"/);
      const filenameMatch = headers.match(/filename="([^"]+)"/);
      if (nameMatch) parts.push({ name: nameMatch[1], filename: filenameMatch?.[1], data });
      start = end + bBuf.length + 2;
    }
    const filePart = parts.find(p => p.filename);
    const fields = {};
    parts.filter(p => !p.filename).forEach(p => fields[p.name] = p.data.toString().trim());
    cb(fields, filePart);
  });
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  // API ROUTES
  if (pathname === '/api/config' && req.method === 'GET') {
    return jsonResponse(res, 200, readJSON(CONFIG_FILE));
  }

  if (pathname === '/api/config' && req.method === 'POST') {
    return parseBody(req, body => {
      const config = readJSON(CONFIG_FILE);
      writeJSON(CONFIG_FILE, { ...config, ...body });
      jsonResponse(res, 200, { ok: true });
    });
  }

  if (pathname === '/api/tickets' && req.method === 'GET') {
    return jsonResponse(res, 200, readJSON(DATA_FILE) || []);
  }

  if (pathname === '/api/tickets' && req.method === 'POST') {
    return parseBody(req, body => {
      const tickets = readJSON(DATA_FILE) || [];
      const ticket = {
        id: crypto.randomUUID(),
        number: generateTicketNumber(),
        name: body.name,
        email: body.email,
        cpf: body.cpf,
        type: body.type,
        typeKey: body.typeKey,
        price: body.price,
        qty: body.qty || 1,
        used: false,
        createdAt: new Date().toISOString()
      };
      tickets.push(ticket);
      writeJSON(DATA_FILE, tickets);
      jsonResponse(res, 201, ticket);
    });
  }

  if (pathname.startsWith('/api/validate/') && req.method === 'POST') {
    const number = pathname.split('/')[3];
    const tickets = readJSON(DATA_FILE) || [];
    const idx = tickets.findIndex(t => t.number === number);
    if (idx === -1) return jsonResponse(res, 404, { valid: false, message: 'Ingresso não encontrado.' });
    if (tickets[idx].used) return jsonResponse(res, 200, { valid: false, used: true, message: 'Ingresso já utilizado.', ticket: tickets[idx] });
    tickets[idx].used = true;
    tickets[idx].usedAt = new Date().toISOString();
    writeJSON(DATA_FILE, tickets);
    jsonResponse(res, 200, { valid: true, message: 'Ingresso válido! Entrada liberada.', ticket: tickets[idx] });
    return;
  }

  if (pathname === '/api/reset' && req.method === 'POST') {
    return parseBody(req, body => {
      const ADMIN_SENHA = 'Suenia81@';
      if (body.senha !== ADMIN_SENHA) {
        return jsonResponse(res, 401, { ok: false, error: 'Senha incorreta.' });
      }
      writeJSON(DATA_FILE, []);
      jsonResponse(res, 200, { ok: true });
    });
  }

  if (pathname === '/api/upload-bg' && req.method === 'POST') {
    return parseMultipart(req, (fields, file) => {
      if (!file) return jsonResponse(res, 400, { error: 'Nenhum arquivo enviado.' });
      const ext = path.extname(file.filename) || '.jpg';
      const filename = 'bg_' + Date.now() + ext;
      const filePath = path.join(UPLOADS_DIR, filename);
      fs.writeFileSync(filePath, file.data);
      const config = readJSON(CONFIG_FILE);
      config.bgImage = '/images/uploads/' + filename;
      writeJSON(CONFIG_FILE, config);
      jsonResponse(res, 200, { ok: true, path: config.bgImage });
    });
  }

  // Servir arquivos estáticos
  if (pathname === '/') return serveStatic(res, path.join(__dirname, 'public', 'index.html'));
  if (pathname.startsWith('/images/uploads/')) {
    return serveStatic(res, path.join(UPLOADS_DIR, path.basename(pathname)));
  }
  if (pathname.startsWith('/images/')) {
    return serveStatic(res, path.join(__dirname, 'public', 'images', path.basename(pathname)));
  }
  serveStatic(res, path.join(__dirname, 'public', pathname.slice(1)));
});

server.listen(PORT, () => {
  console.log(`\n🎮 GalzGames Ingressos rodando em http://localhost:${PORT}\n`);
});
