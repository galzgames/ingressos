
// ===== CAMERA QR SCANNER =====
let camStream = null;
let camInterval = null;
let scanCount = 0;
let lastScanned = '';
let lastScannedTime = 0;

async function startCamera(facing) {
  stopCamera();
  const wrap = document.getElementById('cam-wrap');
  const video = document.getElementById('cam-video');
  const errEl = document.getElementById('cam-error');
  const stopBtn = document.getElementById('btn-cam-stop');

  errEl.style.display = 'none';

  try {
    const constraints = {
      video: {
        facingMode: facing || 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    };
    camStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = camStream;
    await video.play();
    wrap.classList.add('active');
    stopBtn.style.display = 'flex';

    // Highlight active button
    document.getElementById('btn-cam-back').classList.toggle('active-cam', facing === 'user');
    document.getElementById('btn-cam-env').classList.toggle('active-cam', facing === 'environment');

    // Start QR scanning loop
    camInterval = setInterval(() => scanFrame(), 250);
    document.getElementById('cam-status').textContent = '🔍 Aponte para o QR Code';
    SFX.nav();
  } catch(err) {
    errEl.textContent = '❌ Câmera não disponível: ' + err.message;
    errEl.style.display = 'block';
    console.error('Camera error:', err);
  }
}

function stopCamera() {
  if (camStream) {
    camStream.getTracks().forEach(t => t.stop());
    camStream = null;
  }
  if (camInterval) { clearInterval(camInterval); camInterval = null; }
  const wrap = document.getElementById('cam-wrap');
  wrap.classList.remove('active');
  document.getElementById('btn-cam-stop').style.display = 'none';
  document.getElementById('btn-cam-back').classList.remove('active-cam');
  document.getElementById('btn-cam-env').classList.remove('active-cam');
}

function scanFrame() {
  const video = document.getElementById('cam-video');
  const canvas = document.getElementById('cam-canvas');
  if (!video || !camStream || video.readyState < 2) return;

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0);

  try {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert'
    });

    if (code && code.data) {
      const now = Date.now();
      // Evita escanear o mesmo código repetidamente em 3 segundos
      if (code.data === lastScanned && now - lastScannedTime < 3000) return;
      lastScanned = code.data;
      lastScannedTime = now;

      document.getElementById('cam-status').textContent = '✅ QR Code detectado!';

      // Extrai número do QR Code (pode ser só o número ou URL com número)
      let number = code.data.trim();
      // Se for URL, pega o último segmento
      if (number.includes('/')) number = number.split('/').pop();
      // Se for só dígitos ou começa com #, limpa
      number = number.replace('#','').replace(/\D/g,'');

      if (number) {
        document.getElementById('code-input').value = number;
        document.getElementById('cam-status').textContent = '⚡ Validando #' + number + '...';
        validarIngresso(true);
      }
    }
  } catch(e) {}
}

// Atualiza contador
function updateScanCount(valid) {
  if (valid) {
    scanCount++;
    document.getElementById('scan-count').textContent = scanCount;
    document.getElementById('scan-count').style.animation = 'none';
    setTimeout(() => document.getElementById('scan-count').style.animation = '', 10);
  }
}

// Para câmera quando muda de página
const _origShowPage = window.showPage;
window.showPage = function(id) {
  if (id !== 'validar') stopCamera();
  return _origShowPage(id);
};

// Auto-start câmera traseira quando entra em Validar
const __origShowPage = window.showPage;
window.showPage = function(id) {
  const result = __origShowPage(id);
  if (id === 'validar' && !camStream) {
    setTimeout(() => startCamera('environment'), 300);
  }
  return result;
};
