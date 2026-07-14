
const API = '';
let selType = 'normal', selTypeName = 'Normal', selPrice = 'R$ 60,00';
let qty = 1;
let currentTicket = null;
let allTickets = [];
let config = {};

// ===== INIT =====
async function init() {
  await loadConfig();
  await loadTickets();
}

async function loadConfig() {
  try {
    const r = await fetch(API + '/api/config');
    config = await r.json();
    applyConfig();
  } catch {
    config = { eventName:'Retro Gamer Day', eventDate:'Sábado, 10 Mai 2025 • 18h', eventLocal:'Arena GalzGames, São Paulo - SP', bgImage:'/images/banner.jpeg' };
    applyConfig();
  }
}

function fmtPreco(v) { return 'R$ ' + parseFloat(v).toFixed(2).replace('.',','); }

function applyConfig() {
  document.getElementById('disp-name').textContent = config.eventName || '';
  const tn = document.getElementById('topbar-event-name');
  if (tn) tn.textContent = config.eventName || 'Retro Gamer Day';
  document.getElementById('disp-date').textContent = config.eventDate || '';
  document.getElementById('disp-local').textContent = config.eventLocal || '';
  const img = config.bgImage || '/images/banner.jpeg';
  document.getElementById('hero-img').src = img;
  document.getElementById('ticket-bg').src = img;
  document.getElementById('adm-preview').src = img;
  document.getElementById('adm-name').value = config.eventName || '';
  document.getElementById('adm-date').value = config.eventDate || '';
  document.getElementById('adm-local').value = config.eventLocal || '';
  document.getElementById('tk-ev-name').textContent = config.eventName || '';
  document.getElementById('tk-ev-date').textContent = config.eventDate || '';

  // Aplica preços
  const p = config.precos || {};
  const normal = p.normal || { nome:'Normal', valor:60, qtd:200 };
  const vip    = p.vip    || { nome:'VIP', valor:150, qtd:60 };
  const meia   = p.meia   || { nome:'Meia-Entrada', valor:30, qtd:100 };

  function updateCard(id, key, info) {
    const el = document.getElementById('to-'+id);
    if(!el) return;
    el.querySelector('.opt-name').textContent = info.nome;
    el.querySelector('.opt-price').textContent = fmtPreco(info.valor);
    el.querySelector('.opt-avail').textContent = info.qtd + ' disponíveis';
    el.onclick = () => selectType(key, info.nome, fmtPreco(info.valor));
  }
  updateCard('normal','normal',normal);
  updateCard('vip','vip',vip);
  updateCard('meia','meia',meia);

  // Campos admin de preço
  ['normal','vip','meia'].forEach(k => {
    const data = k==='normal'?normal:k==='vip'?vip:meia;
    const n = document.getElementById('adm-'+k+'-nome');
    const v = document.getElementById('adm-'+k+'-valor');
    const q = document.getElementById('adm-'+k+'-qtd');
    if(n) { n.value=data.nome; v.value=data.valor; q.value=data.qtd; }
  });

  selPrice = fmtPreco(normal.valor);
  selTypeName = normal.nome;
  applyPagamento();
}

async function salvarPrecos() {
  const body = {
    precos: {
      normal: { nome: document.getElementById('adm-normal-nome').value, valor: parseFloat(document.getElementById('adm-normal-valor').value)||0, qtd: parseInt(document.getElementById('adm-normal-qtd').value)||0 },
      vip:    { nome: document.getElementById('adm-vip-nome').value,    valor: parseFloat(document.getElementById('adm-vip-valor').value)||0,    qtd: parseInt(document.getElementById('adm-vip-qtd').value)||0    },
      meia:   { nome: document.getElementById('adm-meia-nome').value,   valor: parseFloat(document.getElementById('adm-meia-valor').value)||0,   qtd: parseInt(document.getElementById('adm-meia-qtd').value)||0   }
    }
  };
  try {
    await fetch('/api/config', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    config = { ...config, ...body };
    applyConfig();
    showToast('Valores atualizados!');
  } catch { showToast('Erro ao salvar. Servidor offline?'); }
}

async function loadTickets() {
  try {
    const r = await fetch(API + '/api/tickets');
    allTickets = await r.json();
    updateAdminStats();
  } catch { allTickets = []; }
}

// ===== NAVIGATION =====
let adminLogado = false;
let validarLogado = false;
const ADMIN_SENHA = 'Suenia81@';
let currentPageId = 'home';

// ===== MENU LOGO =====
function toggleMenu(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById('logo-menu');
  const overlay = document.getElementById('menu-overlay');
  const isOpen = menu.classList.contains('open');
  if (isOpen) {
    fecharMenu();
  } else {
    menu.classList.add('open');
    overlay.classList.add('active');
    SFX.nav();
  }
}

function fecharMenu() {
  document.getElementById('logo-menu')?.classList.remove('open');
  document.getElementById('menu-overlay')?.classList.remove('active');
}

function navTo(id) {
  fecharMenu();
  showPage(id);
}

function syncMenu(id) {
  ['home','meu-ingresso','validar','gratuitos','admin'].forEach(p => {
    const el = document.getElementById('mi-' + p);
    if (el) el.classList.toggle('active-item', p === id);
  });
  // Atualiza nome do evento no topbar
  const tn = document.getElementById('topbar-event-name');
  if (tn && config.eventName) tn.textContent = config.eventName;
}

function showPage(id) {
  if ((id === 'admin' || id === 'validar' || id === 'gratuitos') && !adminLogado) {
    document.getElementById('admin-login-bg').dataset.target = id;
    document.getElementById('admin-senha-input').value = '';
    document.getElementById('admin-login-err').style.display = 'none';
    const sub = document.getElementById('admin-login-sub');
    if (sub) {
      sub.textContent = id === 'validar'
        ? 'Área restrita — Validação de Ingressos'
        : id === 'gratuitos'
          ? 'Área restrita — Emissão de Ingressos Gratuitos'
          : 'Digite a senha de administrador';
    }
    document.getElementById('admin-login-bg').style.display = 'flex';
    return;
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  currentPageId = id;
  syncMenu(id);
  if (id === 'admin') { loadTickets(); applyPagamento(); }
  if (id === 'gratuitos') { renderFreeTickets(); }
}

function tentarLoginAdmin() {
  const senha = document.getElementById('admin-senha-input').value;
  const box = document.getElementById('admin-login-box') || document.querySelector('.admin-login-box');
  if (senha === ADMIN_SENHA) {
    adminLogado = true;
    document.getElementById('admin-login-bg').style.display = 'none';
    const target = document.getElementById('admin-login-bg').dataset.target || 'admin';
    showPage(target);
  } else {
    const err = document.getElementById('admin-login-err');
    err.style.display = 'block';
    if(box) { box.classList.remove('admin-login-shake'); void box.offsetWidth; box.classList.add('admin-login-shake'); }
    document.getElementById('admin-senha-input').value = '';
    document.getElementById('admin-senha-input').focus();
  }
}

let resetTarget = 'all';

function abrirReset(target = 'all') {
  resetTarget = target;
  const title = document.querySelector('#reset-modal-bg h2');
  const text = document.querySelector('#reset-modal-bg .reset-warn');
  const btn = document.querySelector('#reset-modal-bg .reset-confirm-btn');
  if (title) {
    title.textContent = target === 'free' ? 'Resetar Ingressos Gratuitos' : target === 'pedidos' ? 'Resetar Pedidos' : 'Resetar Ingressos';
  }
  if (text) {
    text.innerHTML = target === 'free'
      ? '<strong>Atenção!</strong> Apenas os ingressos marcados como <strong>gratuitos</strong> serão <strong>apagados</strong>. Os demais ingressos continuarão intactos.'
      : target === 'pedidos'
        ? '<strong>Atenção!</strong> Todos os <strong>pedidos pendentes/aprovados/rejeitados</strong> serão <strong>removidos</strong> para deixar o sistema limpo para o próximo evento.'
        : '<strong>Atenção!</strong> Todos os ingressos emitidos serão <strong>permanentemente apagados</strong>. O contador voltará ao início. Essa ação é irreversível.';
  }
  if (btn) {
    btn.textContent = target === 'free' ? '🎁 SIM, APAGAR GRATUITOS' : target === 'pedidos' ? '🧹 SIM, LIMPAR PEDIDOS' : '🗑 SIM, APAGAR TUDO';
  }
  document.getElementById('reset-senha-input').value = '';
  document.getElementById('reset-err').style.display = 'none';
  document.getElementById('reset-modal-bg').style.display = 'flex';
}

function fecharReset() {
  document.getElementById('reset-modal-bg').style.display = 'none';
}

async function confirmarReset() {
  const senha = document.getElementById('reset-senha-input').value;
  if (senha !== ADMIN_SENHA) {
    document.getElementById('reset-err').style.display = 'block';
    document.getElementById('reset-senha-input').value = '';
    document.getElementById('reset-senha-input').focus();
    return;
  }
  try {
    const endpoint = resetTarget === 'free' ? '/api/reset-free' : resetTarget === 'pedidos' ? '/api/reset-pedidos' : '/api/reset';
    const r = await fetch(endpoint, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ senha }) });
    const d = await r.json();
    if (d.ok) {
      if (resetTarget === 'all') {
        allTickets = [];
        currentTicket = null;
        document.getElementById('no-ticket').style.display = 'block';
        document.getElementById('ticket-display').style.display = 'none';
      }
      if (resetTarget === 'free') {
        await loadTickets();
        renderFreeTickets();
      }
      if (resetTarget === 'pedidos') {
        await loadPendentes();
      }
      fecharReset();
      updateAdminStats();
      showToast(resetTarget === 'free' ? 'Ingressos gratuitos removidos!' : resetTarget === 'pedidos' ? 'Pedidos limpos!' : 'Todos os ingressos foram apagados!');
    } else {
      document.getElementById('reset-err').textContent = '❌ ' + (d.error || 'Erro no servidor.');
      document.getElementById('reset-err').style.display = 'block';
    }
  } catch {
    showToast('Erro de conexão com o servidor.');
  }
}

// ===== TICKET SELECTION =====
function selectType(key, name, price) {
  selType = key; selTypeName = name; selPrice = price;
  ['normal','vip','meia'].forEach(k => document.getElementById('to-'+k).classList.remove('sel'));
  document.getElementById('to-'+key).classList.add('sel');
}

function changeQty(d) {
  qty = Math.max(1, Math.min(10, qty + d));
  document.getElementById('qty-num').textContent = qty;
}

let freeQty = 1;
function changeFreeQty(d) {
  freeQty = Math.max(1, Math.min(10, freeQty + d));
  document.getElementById('free-qty-num').textContent = freeQty;
}

function renderFreeTickets() {
  const list = document.getElementById('free-ticket-list');
  if (!list) return;
  const gratuitos = (allTickets || []).filter(t => t.typeKey === 'gratuito' || t.pagamento === 'gratuito' || t.price === 'R$ 0,00');
  if (!gratuitos.length) {
    list.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:10px 0">Nenhum ingresso gratuito emitido.</div>';
    return;
  }
  list.innerHTML = gratuitos.slice(-6).reverse().map(t => `
    <div class="tl-row">
      <span class="tl-num">#${t.number}</span>
      <span class="tl-name">${t.name}</span>
      <span class="tl-type">${t.type || 'Gratuito'}</span>
      <span class="badge valid">${t.price || 'R$ 0,00'}</span>
    </div>
  `).join('');
}

async function emitirIngressoGratuito() {
  const name = document.getElementById('free-name').value.trim();
  const email = document.getElementById('free-email').value.trim();
  const cpf = document.getElementById('free-cpf').value.trim();
  if (!name || !email || !cpf) {
    showToast('Preencha nome, e-mail e CPF.');
    return;
  }
  try {
    const payload = {
      name,
      email,
      cpf,
      type: 'Ingresso Gratuito',
      typeKey: 'gratuito',
      price: 'R$ 0,00',
      qty: 1,
      pagamento: 'gratuito'
    };

    for (let i = 0; i < freeQty; i++) {
      const r = await fetch(API + '/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await r.json();
      if (!r.ok) {
        showToast(data.error || 'Não foi possível emitir o ingresso.');
        return;
      }
    }

    await loadTickets();
    renderFreeTickets();
    document.getElementById('free-name').value = '';
    document.getElementById('free-email').value = '';
    document.getElementById('free-cpf').value = '';
    freeQty = 1;
    document.getElementById('free-qty-num').textContent = freeQty;
    showToast('Ingresso gratuito emitido com sucesso!');
  } catch {
    showToast('Erro ao emitir ingresso gratuito.');
  }
}

// CPF mask
document.getElementById('f-cpf').addEventListener('input', function() {
  let v = this.value.replace(/\D/g,'').slice(0,11);
  v = v.replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2');
  this.value = v;
  // Validação visual em tempo real
  const cpfLimpo = v.replace(/\D/g,'');
  if (cpfLimpo.length === 11) {
    const valido = validarCPFfrontend(cpfLimpo);
    this.style.borderColor = valido ? 'var(--success)' : '#e94560';
  } else {
    this.style.borderColor = '';
  }
});

document.getElementById('free-cpf').addEventListener('input', function() {
  let v = this.value.replace(/\D/g,'').slice(0,11);
  v = v.replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2');
  this.value = v;
  const cpfLimpo = v.replace(/\D/g,'');
  if (cpfLimpo.length === 11) {
    const valido = validarCPFfrontend(cpfLimpo);
    this.style.borderColor = valido ? 'var(--success)' : '#e94560';
  } else {
    this.style.borderColor = '';
  }
});

function validarCPFfrontend(cpf) {
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(cpf[i]) * (10 - i);
  let r = 11 - (s % 11); if (r >= 10) r = 0;
  if (r !== parseInt(cpf[9])) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(cpf[i]) * (11 - i);
  r = 11 - (s % 11); if (r >= 10) r = 0;
  return r === parseInt(cpf[10]);
}

// ===== GERAR INGRESSO =====
// ===== PAGAMENTO =====
// ===== INFINITEPAY CHECKOUT =====
const IP_TAG = 'de-glaucio-02m'; // InfiniteTag da conta
let ipMetodoSel = 'pix';
let ipPedidoAtual = null;

function abrirPagamento() {
  const name = document.getElementById('f-name').value.trim();
  const email = document.getElementById('f-email').value.trim();
  const cpf = document.getElementById('f-cpf').value.trim();
  if (!name || !email || !cpf) { showToast('Preencha todos os campos!'); return; }
  if (!email.includes('@')) { showToast('E-mail inválido!'); return; }

  const p2 = config.precos || {};
  const valorUnit = parseFloat(
    selType === 'normal' ? (p2.normal?.valor || 60) :
    selType === 'vip'    ? (p2.vip?.valor    || 150) :
                           (p2.meia?.valor   || 30)
  );
  const total = valorUnit * qty;
  const totalFmt = 'R$ ' + total.toFixed(2).replace('.',',');

  document.getElementById('ip-header-sub').textContent = selTypeName + ' • ' + qty + 'x ' + selPrice;
  document.getElementById('ip-total').textContent = totalFmt;

  ipMetodoSel = 'pix';
  selecionarMetodo('pix');

  document.getElementById('ip-screen-metodo').style.display = 'block';
  document.getElementById('ip-screen-aguard').style.display = 'none';
  document.getElementById('ip-modal-bg').style.display = 'flex';
}

function selecionarMetodo(met) {
  ipMetodoSel = met;
  ['pix','credito','debito'].forEach(m => {
    document.getElementById('ip-met-' + m).classList.toggle('sel', m === met);
  });
  const nomes = { pix:'PIX', credito:'CARTÃO DE CRÉDITO', debito:'CARTÃO DE DÉBITO' };
  document.getElementById('btn-ip-txt').textContent = 'PAGAR COM ' + nomes[met];
}

async function irParaCheckout() {
  const name = document.getElementById('f-name').value.trim();
  const email = document.getElementById('f-email').value.trim();
  const cpf = document.getElementById('f-cpf').value.trim();

  const p2 = config.precos || {};
  const valorUnit = parseFloat(
    selType === 'normal' ? (p2.normal?.valor || 60) :
    selType === 'vip'    ? (p2.vip?.valor    || 150) :
                           (p2.meia?.valor   || 30)
  );
  const total = valorUnit * qty;
  const totalCentavos = Math.round(total * 100);

  // Valida CPF antes de ir para checkout
  const cpfLimpo = cpf.replace(/\D/g, '');
  if (!validarCPFfrontend(cpfLimpo)) {
    fecharIPModal();
    showToast('❌ CPF inválido! Verifique o número.');
    document.getElementById('f-cpf').style.borderColor = '#e94560';
    document.getElementById('f-cpf').focus();
    SFX.error();
    return;
  }

  // Registra pedido no servidor
  try {
    const r = await fetch('/api/pedidos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, email, cpf,
        type: selTypeName, typeKey: selType,
        price: 'R$ ' + total.toFixed(2).replace('.', ','),
        qty, pagamento: ipMetodoSel
      })
    });
    const pedido = await r.json();
    if (!r.ok) {
      fecharIPModal();
      showToast('❌ ' + (pedido.error || 'Erro ao registrar pedido.'));
      SFX.error();
      return;
    }
    ipPedidoAtual = pedido;
    document.getElementById('ip-pedido-num').textContent = '#' + pedido.number;
  } catch(e) {
    showToast('Erro ao registrar pedido.');
    return;
  }

  // Links fixos de checkout InfinitePay por tipo
  const IP_LINKS = {
    normal:  'https://checkout.infinitepay.io/de-glaucio-02m/khwg1hT5P',
    vip:     'https://checkout.infinitepay.io/de-glaucio-02m/3lXlG5sejx',
    meia:    'https://checkout.infinitepay.io/de-glaucio-02m/7X5YO4nEOz'
  };

  // Adiciona referência do pedido na URL de retorno
  const baseLink = IP_LINKS[selType] || IP_LINKS.normal;
  const checkoutUrl = baseLink + '?ref=' + ipPedidoAtual.number;

  // Abre checkout em nova aba
  window.open(checkoutUrl, '_blank');

  // Mostra tela de aguardando
  document.getElementById('ip-screen-metodo').style.display = 'none';
  document.getElementById('ip-screen-aguard').style.display = 'block';
  SFX.sendPix();
}

async function verificarPagamentoIP() {
  if (!ipPedidoAtual) return;
  try {
    const r = await fetch('/api/pedidos/' + ipPedidoAtual.number + '?status=all');
    const pedido = await r.json();
    if (pedido.status === 'aprovado' && pedido.ticketNumber) {
      const tickets = await fetch('/api/tickets').then(r => r.json());
      const ticket = tickets.find(t => t.number === pedido.ticketNumber);
      if (ticket) {
        currentTicket = ticket;
        renderTicket(ticket);
        fecharIPModal();
        showPage('meu-ingresso');
        SFX.approved();
        showToast('🎉 Pagamento confirmado! Ingresso gerado!');
        return;
      }
    }
    showToast('⏳ Pagamento ainda não confirmado. Tente novamente em instantes.');
  } catch {
    showToast('Erro ao verificar pagamento.');
  }
}

function fecharIPModal() {
  document.getElementById('ip-modal-bg').style.display = 'none';
  SFX.closePix();
}

// Verifica se voltou do checkout (URL tem ?pedido=...)
window.addEventListener('load', () => {
  const params = new URLSearchParams(window.location.search);
  const numPedido = params.get('pedido');
  if (numPedido) {
    history.replaceState({}, '', window.location.pathname);
    setTimeout(async () => {
      try {
        const r = await fetch('/api/pedidos/' + numPedido);
        const pedido = await r.json();
        if (pedido.status === 'aprovado' && pedido.ticketNumber) {
          const tickets = await fetch('/api/tickets').then(r => r.json());
          const ticket = tickets.find(t => t.number === pedido.ticketNumber);
          if (ticket) {
            currentTicket = ticket;
            renderTicket(ticket);
            showPage('meu-ingresso');
            SFX.approved();
            showToast('🎉 Ingresso gerado com sucesso!');
          }
        } else {
          // Ainda pendente — abre modal de verificação
          ipPedidoAtual = pedido;
          document.getElementById('ip-pedido-num').textContent = '#' + pedido.number;
          document.getElementById('ip-screen-metodo').style.display = 'none';
          document.getElementById('ip-screen-aguard').style.display = 'block';
          document.getElementById('ip-modal-bg').style.display = 'flex';
        }
      } catch(e) { console.log('Erro ao verificar pedido de retorno'); }
    }, 1500);
  }
});

// pixTab removido - novo sistema de telas

function fecharPix() {
  document.getElementById('pix-modal-bg').style.display = 'none';
}

function copiarPix() {
  const val = document.getElementById('pix-copiaecola').textContent;
  navigator.clipboard.writeText(val).then(() => showToast('Código PIX copiado!'));
}

function copiarChave() {
  const val = document.getElementById('pix-chave-disp').textContent;
  navigator.clipboard.writeText(val).then(() => showToast('Chave PIX copiada!'));
}

// ===== PIX BRCode EMV (padrão Banco Central) =====
function pixCRC16(data) {
  let crc = 0xFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function pixField(id, value) {
  return id + value.length.toString().padStart(2, '0') + value;
}

function gerarBRCode(chave, nome, cidade, valor) {
  const merchantInfo = pixField('26',
    pixField('00', 'BR.GOV.BCB.PIX') +
    pixField('01', chave)
  );
  const additional = pixField('62', pixField('05', '***'));
  const valorStr = valor.toFixed(2);
  const nomeClean = nome.substring(0, 25).normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const cidadeClean = cidade.substring(0, 15).normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  
  const payload =
    pixField('00', '01') +
    pixField('01', '12') +
    merchantInfo +
    pixField('52', '0000') +
    pixField('53', '986') +
    pixField('54', valorStr) +
    pixField('58', 'BR') +
    pixField('59', nomeClean) +
    pixField('60', cidadeClean) +
    additional +
    '6304';
  
  return payload + pixCRC16(payload);
}

function drawQRPix(text, canvasId) {
  // text aqui é o BRCode completo
  renderQRCode(text, canvasId, 180, '#00a07a', '#ffffff');
}

// Renderiza QR Code real usando algoritmo Reed-Solomon simplificado
// (usa qrcode-generator via CDN carregado no HTML)
function renderQRCode(text, canvasId, size, darkColor, lightColor) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  try {
    // Usa qrcode global se disponível
    if (typeof qrcode !== 'undefined') {
      const qr = qrcode(0, 'M');
      qr.addData(text);
      qr.make();
      const modules = qr.getModuleCount();
      const ctx = canvas.getContext('2d');
      canvas.width = size; canvas.height = size;
      const cellSize = size / modules;
      ctx.fillStyle = lightColor; ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = darkColor;
      for (let r = 0; r < modules; r++) {
        for (let c = 0; c < modules; c++) {
          if (qr.isDark(r, c)) {
            ctx.fillRect(
              Math.floor(c * cellSize), Math.floor(r * cellSize),
              Math.ceil(cellSize), Math.ceil(cellSize)
            );
          }
        }
      }
    } else {
      // fallback: desenha QR visual enquanto lib carrega
      drawQRFallback(text, canvasId, size, darkColor);
    }
  } catch(e) {
    drawQRFallback(text, canvasId, size, darkColor);
  }
}

function drawQRFallback(text, canvasId, size, color) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const cells = 29, cell = Math.floor(size / cells);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = color || '#00a07a';
  const seed = text.split('').reduce((a,c,i) => a + c.charCodeAt(0)*(i+11), 0);
  function bit(r,c) { const v=(seed^(r*31337+c*7919))*2654435761; return (v>>>16)%3!==0; }
  for(let r=0;r<cells;r++) for(let c=0;c<cells;c++) {
    const inFP=(r<8&&c<8)||(r<8&&c>cells-9)||(r>cells-9&&c<8);
    if(!inFP && bit(r,c)) ctx.fillRect(c*cell+1,r*cell+1,cell-1,cell-1);
  }
  const fp=(ox,oy)=>{
    ctx.fillRect(ox*cell,oy*cell,7*cell,7*cell);
    ctx.fillStyle='#fff'; ctx.fillRect((ox+1)*cell,(oy+1)*cell,5*cell,5*cell);
    ctx.fillStyle=color||'#00a07a'; ctx.fillRect((ox+2)*cell,(oy+2)*cell,3*cell,3*cell);
  };
  fp(0,0); fp(cells-7,0); fp(0,cells-7);
}

let pedidoPendente = null;

async function enviarPedido() {
  const name = document.getElementById('f-name').value.trim();
  const email = document.getElementById('f-email').value.trim();
  const cpf = document.getElementById('f-cpf').value.trim();

  const p2 = config.precos || {};
  const valorUnit = parseFloat(
    selType === 'normal' ? (p2.normal?.valor || 60) :
    selType === 'vip'    ? (p2.vip?.valor    || 150) :
                           (p2.meia?.valor   || 30)
  );
  const total = valorUnit * qty;
  const price = 'R$ ' + total.toFixed(2).replace('.',',');

  try {
    const r = await fetch(API + '/api/pedidos', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ name, email, cpf, type: selTypeName, typeKey: selType, price, qty })
    });
    const pedido = await r.json();
    pedidoPendente = pedido;
    document.getElementById('pix-pedido-num').textContent = '#' + pedido.number;
    document.getElementById('pix-screen-qr').style.display = 'none';
    document.getElementById('pix-screen-aguardando').style.display = 'block';
    showToast('Pedido registrado! Aguarde aprovação.');
  } catch {
    showToast('Erro ao registrar pedido.');
  }
}

async function verificarPedido() {
  if (!pedidoPendente) return;
  try {
    const r = await fetch(API + '/api/pedidos/' + pedidoPendente.number);
    const pedido = await r.json();
    if (pedido.status === 'aprovado' && pedido.ticketNumber) {
      // Buscar ingresso gerado
      const tickets = await fetch(API + '/api/tickets').then(r=>r.json());
      const ticket = tickets.find(t => t.number === pedido.ticketNumber);
      if (ticket) {
        currentTicket = ticket;
        renderTicket(ticket);
        fecharPix();
        showPage('meu-ingresso');
        showToast('🎉 Pagamento confirmado! Ingresso gerado!');
      }
    } else if (pedido.status === 'rejeitado') {
      showToast('❌ Pedido rejeitado pelo admin.');
      fecharPix();
    } else {
      showToast('⏳ Ainda aguardando confirmação...');
    }
  } catch {
    showToast('Erro ao verificar pedido.');
  }
}

async function confirmarPagamento(metodo) { enviarPedido(); }

async function comprarIngresso() { abrirPagamento(); }

function renderTicket(t) {
  document.getElementById('no-ticket').style.display = 'none';
  document.getElementById('ticket-display').style.display = 'block';
  document.getElementById('tk-name').textContent = t.name;
  document.getElementById('tk-type').textContent = t.type;
  document.getElementById('tk-local').textContent = config.eventLocal || '';
  document.getElementById('tk-price').textContent = t.price;
  document.getElementById('tk-num').textContent = '#' + t.number;
  // Usa qrCode seguro (numero:hash) se disponível
  const qrContent = t.qrCode || t.number;
  drawQR(qrContent, 'qr-canvas');
}

// ===== QR CODE =====
function drawQR(code, canvasId) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext('2d');
  const sz = 80, cells = 21, cell = Math.floor(sz / cells);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, sz, sz);
  ctx.fillStyle = '#111';
  const seed = code.split('').reduce((a, c, i) => a + c.charCodeAt(0) * (i + 7), 0);
  function pseudo(r, c) { return ((seed * 6364136223846793005n + 1442695040888963407n) % (2n ** 64n)) > 0n; }
  function bit(r, c) {
    const v = (seed ^ (r * 31337 + c * 7919)) * 2654435761;
    return (v >>> 16) % 3 !== 0;
  }
  // finder pattern TL
  const fp = (ox, oy) => {
    ctx.fillRect(ox*cell, oy*cell, 7*cell, 7*cell);
    ctx.fillStyle='#fff'; ctx.fillRect((ox+1)*cell, (oy+1)*cell, 5*cell, 5*cell);
    ctx.fillStyle='#111'; ctx.fillRect((ox+2)*cell, (oy+2)*cell, 3*cell, 3*cell);
  };
  // data
  for (let r=0;r<cells;r++) for (let c=0;c<cells;c++) {
    const inFP = (r<8&&c<8)||(r<8&&c>cells-9)||(r>cells-9&&c<8);
    if (!inFP && bit(r,c)) ctx.fillRect(c*cell+1,r*cell+1,cell-1,cell-1);
  }
  ctx.fillStyle='#111';
  fp(0,0); fp(cells-7, 0); fp(0, cells-7);
}

// ===== VALIDAR =====
async function validarIngresso(fromCamera) {
  const code = document.getElementById('code-input').value.trim();
  if (!code) { if(!fromCamera) showToast('Digite o número do ingresso!'); return; }
  const box = document.getElementById('result-box');
  const camStatus = document.getElementById('cam-status');

  try {
    const r = await fetch(API + '/api/validate/' + code, { method:'POST' });
    const data = await r.json();
    if (data.valid) {
      SFX.validateOk();
      box.className = 'result-box ok result-flash';
      document.getElementById('res-icon').textContent = '✅';
      document.getElementById('res-title').textContent = 'Ingresso Válido! Entrada Liberada!';
      document.getElementById('res-detail').textContent = `👤 ${data.ticket.name} • 🎟 ${data.ticket.type} • 💰 ${data.ticket.price}`;
      if(camStatus) camStatus.textContent = '✅ VÁLIDO — ' + data.ticket.name;
      if(typeof updateScanCount === 'function') updateScanCount(true);
      // Limpa o input após 2s para próxima leitura
      setTimeout(() => {
        document.getElementById('code-input').value = '';
        if(camStatus) camStatus.textContent = '🔍 Aponte para o QR Code';
      }, 2500);
    } else if (data.used) {
      SFX.validateErr();
      box.className = 'result-box err';
      document.getElementById('res-icon').textContent = '⚠️';
      document.getElementById('res-title').textContent = 'Ingresso Já Utilizado!';
      document.getElementById('res-detail').textContent = `👤 ${data.ticket.name} • ${data.ticket.type} • Entrada negada.`;
      if(camStatus) camStatus.textContent = '⚠️ JÁ USADO — ' + data.ticket.name;
      setTimeout(() => {
        document.getElementById('code-input').value = '';
        if(camStatus) camStatus.textContent = '🔍 Aponte para o QR Code';
      }, 2500);
    } else {
      SFX.validateErr();
      box.className = 'result-box err';
      document.getElementById('res-icon').textContent = '❌';
      document.getElementById('res-title').textContent = 'Ingresso Inválido!';
      document.getElementById('res-detail').textContent = data.message || 'Número não encontrado.';
      if(camStatus) camStatus.textContent = '❌ INVÁLIDO';
      setTimeout(() => {
        document.getElementById('code-input').value = '';
        if(camStatus) camStatus.textContent = '🔍 Aponte para o QR Code';
      }, 2000);
    }
  } catch {
    SFX.error();
    box.className = 'result-box err';
    document.getElementById('res-icon').textContent = '❌';
    document.getElementById('res-title').textContent = 'Erro de conexão';
    document.getElementById('res-detail').textContent = 'Verifique a conexão com o servidor.';
  }
  box.style.display = 'block';
}

// ===== ADMIN =====
async function salvarConfig() {
  const body = {
    eventName: document.getElementById('adm-name').value,
    eventDate: document.getElementById('adm-date').value,
    eventLocal: document.getElementById('adm-local').value
  };
  try {
    await fetch(API + '/api/config', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    config = { ...config, ...body };
    applyConfig();
    showToast('Configurações salvas!');
  } catch { showToast('Erro ao salvar. Servidor offline?'); }
}

async function uploadBanner(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    const dataUrl = e.target.result;
    document.getElementById('adm-preview').src = dataUrl;
    document.getElementById('adm-preview').style.display = 'block';
    document.getElementById('hero-img').src = dataUrl;
    document.getElementById('ticket-bg').src = dataUrl;

    const fd = new FormData(); fd.append('image', file);
    try {
      const r = await fetch(API + '/api/upload-bg', { method:'POST', body: fd });
      const d = await r.json();
      if (d.ok) { config.bgImage = d.path; showToast('Imagem atualizada!'); }
    } catch {
      showToast('Servidor offline - imagem aplicada localmente');
    }
  };
  reader.readAsDataURL(file);
}

function updateAdminStats() {
  document.getElementById('st-total').textContent = allTickets.length;
  document.getElementById('st-used').textContent = allTickets.filter(t=>t.used).length;
  document.getElementById('st-normal').textContent = allTickets.filter(t=>t.typeKey==='normal').length;
  document.getElementById('st-vip').textContent = allTickets.filter(t=>t.typeKey==='vip').length;
  document.getElementById('st-meia').textContent = allTickets.filter(t=>t.typeKey==='meia').length;
  const list = document.getElementById('ticket-list');
  if (!allTickets.length) {
    list.innerHTML = '<div style="text-align:center;padding:24px;color:var(--muted);font-size:13px">Nenhum ingresso</div>';
    return;
  }
  list.innerHTML = [...allTickets].reverse().map(t =>
    `<div class="tl-row">
      <span class="tl-num">#${t.number}</span>
      <span class="tl-name">${t.name}</span>
      <span class="tl-type">${t.type}</span>
      <span class="badge ${t.used?'used':'valid'}">${t.used?'Usado':'Válido'}</span>
    </div>`
  ).join('');
}

// ===== UTILS =====
function copiarCodigo() {
  if (!currentTicket) return;
  navigator.clipboard.writeText(currentTicket.number).then(() => showToast('Código copiado: ' + currentTicket.number));
}

// ===== ADMIN PAGAMENTO =====


function applyPagamento() {
  const qr = config.qrCodes || {};
  const p2 = config.precos || {};
  ['normal','vip','meia'].forEach(tipo => {
    const d = qr[tipo] || {};
    const img = document.getElementById('qr-img-' + tipo);
    const prev = document.getElementById('qr-prev-' + tipo);
    const placeholder = prev?.querySelector('.qr-img-placeholder');
    const codeEl = document.getElementById('qr-code-' + tipo);
    if (img && d.img) {
      img.src = d.img; img.style.display = 'block';
      if(placeholder) placeholder.style.display = 'none';
    }
    if (codeEl && d.codigo) codeEl.value = d.codigo;
    // Update price display
    const priceEl = document.getElementById('qr-price-' + tipo);
    if (priceEl) {
      const val = tipo==='normal'?(p2.normal?.valor||60):tipo==='vip'?(p2.vip?.valor||150):(p2.meia?.valor||30);
      priceEl.textContent = 'R$ ' + parseFloat(val).toFixed(2).replace('.',',');
    }
  });
  // Load pendentes
  loadPendentes();
}

function uploadQRImg(tipo, input) {
  const file = input.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = document.getElementById('qr-img-' + tipo);
    const placeholder = document.getElementById('qr-prev-' + tipo)?.querySelector('.qr-img-placeholder');
    img.src = e.target.result; img.style.display = 'block';
    if(placeholder) placeholder.style.display = 'none';
    if(!config.qrCodes) config.qrCodes = {};
    if(!config.qrCodes[tipo]) config.qrCodes[tipo] = {};
    config.qrCodes[tipo].img = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function salvarQRCodes() {
  if(!config.qrCodes) config.qrCodes = {};
  ['normal','vip','meia'].forEach(tipo => {
    const codigo = document.getElementById('qr-code-' + tipo)?.value.trim();
    if(!config.qrCodes[tipo]) config.qrCodes[tipo] = {};
    if(codigo) config.qrCodes[tipo].codigo = codigo;
  });
  try {
    await fetch('/api/config', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ qrCodes: config.qrCodes }) });
    showToast('QR Codes salvos!');
  } catch { showToast('Erro ao salvar.'); }
}

async function loadPendentes() {
  try {
    const r = await fetch(API + '/api/pedidos?status=pendente');
    const pedidos = await r.json();
    const pendentes = pedidos.filter(p => p.status === 'pendente');
    const badge = document.getElementById('badge-pendentes');
    if(badge) badge.textContent = pendentes.length;
    const menuBadge = document.getElementById('badge-menu-pend');
    if(menuBadge) { menuBadge.textContent = pendentes.length; menuBadge.style.display = pendentes.length > 0 ? 'inline-block' : 'none'; }
    const lista = document.getElementById('lista-pendentes');
    if(!lista) return;
    if(!pendentes.length) {
      lista.innerHTML = '<div style="text-align:center;padding:24px;color:var(--muted);font-size:13px">Nenhum pedido pendente</div>';
      return;
    }
    // Formata data
    const fmtDate = (d) => {
      if (!d) return '';
      const dt = new Date(d);
      return dt.toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
    };
    lista.innerHTML = pendentes.map(p => `
      <div class="pendente-card" id="pend-${p.number}">
        <div class="pendente-header">
          <span class="pendente-num">#${p.number}</span>
          <span class="pendente-tipo">${p.type}</span>
        </div>
        <div class="pendente-nome">👤 ${p.name}</div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:2px">📧 ${p.email}</div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:6px">🪪 ${p.cpf || '—'}</div>
        <div class="pendente-valor">💰 ${p.price} • Qtd: ${p.qty} • ${p.pagamento || 'pix'}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:4px">🕐 ${fmtDate(p.createdAt)}</div>
        <div class="pendente-btns">
          <button class="btn-aprovar" onclick="aprovarPedido('${p.number}')">✅ APROVAR</button>
          <button class="btn-rejeitar" onclick="rejeitarPedido('${p.number}')">❌ REJEITAR</button>
        </div>
      </div>
    `).join('');
  } catch { console.log('Erro ao carregar pendentes'); }
}

async function aprovarPedido(number) {
  const card = document.getElementById('pend-' + number);
  const btn = document.querySelector(`button[onclick="aprovarPedido('${number}')"]`);
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Aprovando...'; }
  try {
    const r = await fetch(API + '/api/pedidos/' + number + '/aprovar', { method:'POST' });
    const data = await r.json();
    if (!r.ok || data.error) {
      showToast('⚠️ ' + (data.error || 'Erro ao aprovar.'));
      SFX.error();
      if (btn) { btn.disabled = false; btn.textContent = '✅ APROVAR'; }
    } else {
      SFX.approve();
      showToast('✅ Pedido #' + number + ' aprovado! Ingresso #' + data.ticket?.number + ' gerado.');
      // Remove o card imediatamente
      if (card) {
        card.style.transition = 'all 0.3s ease';
        card.style.opacity = '0';
        card.style.transform = 'translateX(20px)';
        setTimeout(() => { card.remove(); updateBadgeCount(); }, 300);
      } else {
        await loadPendentes();
      }
      await loadTickets();
      updateAdminStats();
    }
  } catch(e) {
    showToast('❌ Erro de conexão ao aprovar.');
    SFX.error();
    if (btn) { btn.disabled = false; btn.textContent = '✅ APROVAR'; }
  }
}

async function rejeitarPedido(number) {
  if (!confirm('Rejeitar o pedido #' + number + '? O cliente não receberá ingresso.')) return;
  const card = document.getElementById('pend-' + number);
  const btn = document.querySelector(`button[onclick="rejeitarPedido('${number}')"]`);
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Rejeitando...'; }
  try {
    const r = await fetch(API + '/api/pedidos/' + number + '/rejeitar', { method:'POST' });
    if (r.ok) {
      SFX.rejected();
      showToast('❌ Pedido #' + number + ' rejeitado.');
      // Remove o card imediatamente da tela
      if (card) {
        card.style.transition = 'all 0.3s ease';
        card.style.opacity = '0';
        card.style.transform = 'translateX(-20px)';
        setTimeout(() => { card.remove(); updateBadgeCount(); }, 300);
      } else {
        await loadPendentes();
      }
    } else {
      showToast('Erro ao rejeitar pedido.');
      if (btn) { btn.disabled = false; btn.textContent = '❌ REJEITAR'; }
    }
  } catch {
    showToast('❌ Erro de conexão ao rejeitar.');
    SFX.error();
    if (btn) { btn.disabled = false; btn.textContent = '❌ REJEITAR'; }
  }
}

function updateBadgeCount() {
  const cards = document.querySelectorAll('.pendente-card');
  const badge = document.getElementById('badge-pendentes');
  if (badge) badge.textContent = cards.length;
  if (cards.length === 0) {
    const lista = document.getElementById('lista-pendentes');
    if (lista) lista.innerHTML = '<div style="text-align:center;padding:24px;color:var(--muted);font-size:13px">Nenhum pedido pendente</div>';
  }
}

async function salvarPagamento() { salvarQRCodes(); }
async function salvarMetodos() { salvarQRCodes(); }

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

init();
