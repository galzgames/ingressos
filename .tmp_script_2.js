
// ===== RETRO SOUND ENGINE (Web Audio API - sem arquivos externos) =====
const SFX = (() => {
  let ctx = null;
  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function beep(opts) {
    try {
      const c = getCtx();
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.connect(gain);
      gain.connect(c.destination);
      osc.type = opts.type || 'square';
      osc.frequency.setValueAtTime(opts.freq || 440, c.currentTime);
      if (opts.freq2) osc.frequency.linearRampToValueAtTime(opts.freq2, c.currentTime + (opts.dur || 0.1));
      gain.gain.setValueAtTime(opts.vol || 0.15, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + (opts.dur || 0.1));
      osc.start(c.currentTime);
      osc.stop(c.currentTime + (opts.dur || 0.1));
    } catch(e) {}
  }

  function seq(notes, bpm) {
    const beat = 60 / (bpm || 180);
    notes.forEach(([freq, dur, type, vol], i) => {
      setTimeout(() => beep({ freq, freq2: freq, dur: beat * dur * 0.9, type: type||'square', vol: vol||0.12 }), i * beat * 1000);
    });
  }

  return {
    // Selecionar ingresso — coin collect
    select: () => seq([[523,0.5],[659,0.5],[784,0.5],[1047,1]], 400),

    // Mudar quantidade — blip
    qty: (up) => beep({ freq: up ? 440 : 330, freq2: up ? 660 : 220, dur: 0.08, type: 'square', vol: 0.1 }),

    // Abrir modal PIX — level up
    openPix: () => seq([[262,0.3],[330,0.3],[392,0.3],[523,0.3],[659,0.3],[784,0.5],[1047,1]], 350),

    // Fechar modal — cancel sound
    closePix: () => seq([[440,0.3],[330,0.5]], 300),

    // Enviar pedido PIX — power up
    sendPix: () => seq([[392,0.2],[523,0.2],[659,0.2],[784,0.2],[1047,0.2],[1319,1]], 350),

    // Ingresso aprovado — 1-UP jingle
    approved: () => seq([
      [784,0.5],[988,0.5],[1175,0.5],[1568,0.5],
      [1397,0.5],[1175,0.5],[784,0.5],[988,1.5]
    ], 320),

    // Ingresso rejeitado — game over
    rejected: () => seq([[392,0.5],[330,0.5],[262,1.5]], 200),

    // Login admin — cheat code
    login: () => seq([
      [1047,0.3],[784,0.3],[523,0.3],[659,0.5],[988,1]
    ], 400),

    // Erro / senha errada — error buzz
    error: () => { 
      beep({freq:180, freq2:120, dur:0.3, type:'sawtooth', vol:0.15});
      setTimeout(() => beep({freq:180, freq2:120, dur:0.2, type:'sawtooth', vol:0.1}), 200);
    },

    // Salvar configurações — save jingle
    save: () => seq([[523,0.3],[659,0.3],[784,0.5]], 400),

    // Reset ingressos — explosion
    reset: () => {
      beep({freq:200, freq2:50, dur:0.4, type:'sawtooth', vol:0.2});
      setTimeout(()=>beep({freq:150, freq2:30, dur:0.5, type:'sawtooth', vol:0.15}), 200);
    },

    // Validar ingresso OK — success chime
    validateOk: () => seq([[659,0.3],[784,0.3],[1047,0.5],[1319,1]], 380),

    // Validar ingresso inválido
    validateErr: () => seq([[330,0.5],[220,1]], 250),

    // Navegar entre abas — menu blip
    nav: () => beep({ freq: 698, freq2: 880, dur: 0.06, type: 'square', vol: 0.08 }),

    // Hover botão — tick leve
    hover: () => beep({ freq: 1200, dur: 0.03, type: 'square', vol: 0.05 }),

    // Copiar código PIX
    copy: () => seq([[880,0.2],[1047,0.4]], 500),

    // Upload imagem
    upload: () => seq([[523,0.2],[784,0.2],[1047,0.4],[1568,0.6]], 400),

    // Aprovar pedido
    approve: () => seq([
      [523,0.2],[659,0.2],[784,0.2],[1047,0.4],[1319,0.8]
    ], 380),
  };
})();

// ===== ADICIONAR SONS NOS BOTÕES AUTOMATICAMENTE =====
document.addEventListener('DOMContentLoaded', () => {
  // Hover em botões principais
  document.querySelectorAll('.btn-generate, .btn-admin, .btn-validate, .pix-confirm-btn, .btn-aprovar').forEach(btn => {
    btn.addEventListener('mouseenter', () => SFX.hover());
  });

  // Hover nas abas de navegação
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('mouseenter', () => SFX.hover());
  });

  // Hover nos cards de ingresso
  document.querySelectorAll('.ticket-opt').forEach(card => {
    card.addEventListener('mouseenter', () => SFX.hover());
  });
});

// ===== PATCHES NAS FUNÇÕES EXISTENTES =====
// Aguarda as funções carregarem e faz patch
window.addEventListener('load', () => {

  // Patch selectType
  const _selectType = window.selectType;
  window.selectType = function(key, name, price) {
    SFX.select();
    return _selectType(key, name, price);
  };

  // Patch changeQty
  const _changeQty = window.changeQty;
  window.changeQty = function(d) {
    SFX.qty(d > 0);
    return _changeQty(d);
  };

  // Patch showPage (nav)
  const _showPage = window.showPage;
  window.showPage = function(id) {
    SFX.nav();
    return _showPage(id);
  };

  // Patch abrirPagamento
  const _abrirPagamento = window.abrirPagamento;
  window.abrirPagamento = function() {
    SFX.openPix();
    return _abrirPagamento();
  };

  // Patch fecharPix
  const _fecharPix = window.fecharPix;
  window.fecharPix = function() {
    SFX.closePix();
    return _fecharPix();
  };

  // Patch enviarPedido
  const _enviarPedido = window.enviarPedido;
  window.enviarPedido = async function() {
    SFX.sendPix();
    return _enviarPedido();
  };

  // Patch tentarLoginAdmin
  const _tentarLoginAdmin = window.tentarLoginAdmin;
  window.tentarLoginAdmin = function() {
    const senha = document.getElementById('admin-senha-input').value;
    if (senha === 'Suenia81@') SFX.login();
    else SFX.error();
    return _tentarLoginAdmin();
  };

  // Patch confirmarReset
  const _confirmarReset = window.confirmarReset;
  window.confirmarReset = async function() {
    SFX.reset();
    return _confirmarReset();
  };

  // Patch validarIngresso
  const _validarIngresso = window.validarIngresso;
  window.validarIngresso = async function() {
    return _validarIngresso();
  };

  // Patch aprovarPedido
  const _aprovarPedido = window.aprovarPedido;
  window.aprovarPedido = async function(number) {
    SFX.approve();
    return _aprovarPedido(number);
  };

  // Patch rejeitarPedido
  const _rejeitarPedido = window.rejeitarPedido;
  window.rejeitarPedido = async function(number) {
    SFX.rejected();
    return _rejeitarPedido(number);
  };

  // Patch salvarConfig
  const _salvarConfig = window.salvarConfig;
  window.salvarConfig = async function() {
    SFX.save();
    return _salvarConfig();
  };

  // Patch salvarPrecos
  const _salvarPrecos = window.salvarPrecos;
  window.salvarPrecos = async function() {
    SFX.save();
    return _salvarPrecos();
  };

  // Patch salvarQRCodes
  const _salvarQRCodes = window.salvarQRCodes;
  window.salvarQRCodes = async function() {
    SFX.save();
    return _salvarQRCodes();
  };

  // Patch copiarPix
  const _copiarPix = window.copiarPix;
  window.copiarPix = function() {
    SFX.copy();
    return _copiarPix();
  };

  // Patch copiarCodigo
  const _copiarCodigo = window.copiarCodigo;
  window.copiarCodigo = function() {
    SFX.copy();
    return _copiarCodigo();
  };

  // Patch uploadQRImg
  const _uploadQRImg = window.uploadQRImg;
  window.uploadQRImg = function(tipo, input) {
    SFX.upload();
    return _uploadQRImg(tipo, input);
  };

  // ===== SOM DE ABERTURA DO SITE =====
  setTimeout(() => {
    SFX.select();
  }, 800);

});

// Patch showToast para sons de erro/sucesso
const _showToast = window.showToast;
// Adiciona sons ao validar (intercepta resultado)
const _origValidar = window.validarIngresso;
