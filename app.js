import sheetsAPI from './sheetsAPI.js';

let currentUser = null;
let currentReportId = null;
let activeFilter = 'all';
let gpsWatchId = null;

// --- ELEMENTOS DOM ---
const views = {
  auth:   document.getElementById('view-auth'),
  feed:   document.getElementById('view-feed'),
  detail: document.getElementById('view-detail'),
  admin:  document.getElementById('view-admin')
};

const navBtns = {
  feed:  document.getElementById('nav-feed-btn'),
  admin: document.getElementById('nav-admin-btn'),
  logo:  document.getElementById('nav-logo-btn')
};

// --- INICIALIZACIÓN ---
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

function initApp() {
  registerServiceWorker();
  checkPersistedSession();
  setupEventListeners();

  if (currentUser) navigate('feed');
  else navigate('auth');
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('Service Worker registrado', reg))
      .catch(err => console.warn('Fallo SW', err));
  }
}

function checkPersistedSession() {
  const savedUser = localStorage.getItem('app_session_user');
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    updateUserWidget();
  }
}

function setupEventListeners() {
  // Navegación
  navBtns.feed.addEventListener('click', () => navigate('feed'));
  navBtns.admin.addEventListener('click', () => navigate('admin'));
  navBtns.logo.addEventListener('click', () => {
    if (currentUser) navigate('feed');
    else navigate('auth');
  });

  // Auth switchers
  document.getElementById('btn-switch-to-register').addEventListener('click', () => {
    document.getElementById('auth-card-login').style.display = 'none';
    document.getElementById('auth-card-register').style.display = 'block';
  });
  document.getElementById('btn-switch-to-login').addEventListener('click', () => {
    document.getElementById('auth-card-register').style.display = 'none';
    document.getElementById('auth-card-login').style.display = 'block';
  });

  // Formularios de autenticación
  document.getElementById('form-login').addEventListener('submit', handleLogin);
  document.getElementById('form-register').addEventListener('submit', handleRegister);
  document.getElementById('btn-google-login').addEventListener('click', handleGoogleSSO);

  // Filtros del feed
  document.querySelectorAll('.filter-badge').forEach(badge => {
    badge.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-badge').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      activeFilter = e.target.dataset.filter;
      renderFeed();
    });
  });

  // Volver al feed
  document.getElementById('btn-back-to-feed').addEventListener('click', () => navigate('feed'));

  // Modal nuevo reporte
  const modalNewReport = document.getElementById('modal-new-report');
  document.getElementById('btn-floating-report').addEventListener('click', () => {
    modalNewReport.classList.add('active');
    startGpsCapture();
  });
  document.getElementById('btn-modal-close').addEventListener('click', () => {
    modalNewReport.classList.remove('active');
    stopGpsCapture();
  });

  // Subida de foto
  const fileInput = document.getElementById('new-report-photo');
  const dropzone  = document.getElementById('photo-dropzone');
  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', handlePhotoSelection);
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--accent)';
  });
  dropzone.addEventListener('dragleave', () => {
    dropzone.style.borderColor = 'var(--border-color)';
  });
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--border-color)';
    if (e.dataTransfer.files.length > 0) {
      fileInput.files = e.dataTransfer.files;
      handlePhotoSelection();
    }
  });

  // Envío de nuevo reporte
  document.getElementById('form-new-report').addEventListener('submit', handleNewReportSubmit);

  // Admin tabs
  const tabReportes = document.getElementById('tab-admin-reportes');
  const tabUsuarios = document.getElementById('tab-admin-usuarios');
  tabReportes.addEventListener('click', () => {
    tabReportes.classList.add('active');
    tabUsuarios.classList.remove('active');
    document.getElementById('admin-table-reportes').style.display = 'block';
    document.getElementById('admin-table-usuarios').style.display = 'none';
    renderAdminReportes();
  });
  tabUsuarios.addEventListener('click', () => {
    tabUsuarios.classList.add('active');
    tabReportes.classList.remove('active');
    document.getElementById('admin-table-usuarios').style.display = 'block';
    document.getElementById('admin-table-reportes').style.display = 'none';
    renderAdminUsuarios();
  });

  // Exportar CSV
  document.getElementById('btn-export-csv').addEventListener('click', handleExportCSV);

  // Modal perfil
  document.getElementById('btn-profile-close').addEventListener('click', () => {
    document.getElementById('modal-profile').classList.remove('active');
  });
  document.getElementById('profile-photo-container').addEventListener('click', () => {
    document.getElementById('profile-photo-input').click();
  });
  document.getElementById('profile-photo-input').addEventListener('change', handleProfilePhotoSelection);
  document.getElementById('form-profile').addEventListener('submit', handleProfileSave);

  // Modal editar reporte (admin)
  document.getElementById('btn-edit-modal-close').addEventListener('click', () => {
    document.getElementById('modal-edit-report').classList.remove('active');
  });
  document.getElementById('form-edit-report').addEventListener('submit', handleEditReportSubmit);
  document.getElementById('btn-edit-delete').addEventListener('click', handleDeleteReport);
}

// --- NAVEGACIÓN ---

function navigate(viewName) {
  Object.keys(views).forEach(key => views[key].classList.remove('active'));
  if (views[viewName]) views[viewName].classList.add('active');

  if (currentUser) {
    document.getElementById('btn-floating-report').style.display = 'flex';
    navBtns.feed.style.display = 'inline-block';
    navBtns.admin.style.display = currentUser.rol === 'Administrador' ? 'inline-block' : 'none';
    navBtns.feed.classList.toggle('active', viewName === 'feed');
    navBtns.admin.classList.toggle('active', viewName === 'admin');
  } else {
    document.getElementById('btn-floating-report').style.display = 'none';
    navBtns.feed.style.display = 'none';
    navBtns.admin.style.display = 'none';
  }

  if (viewName === 'feed') {
    renderFeed();
  } else if (viewName === 'admin') {
    if (!currentUser || currentUser.rol !== 'Administrador') {
      showToast('Acceso restringido. Solo administradores.', 'error');
      navigate('feed');
      return;
    }
    renderAdminReportes();
  }

  window.scrollTo(0, 0);
}

function updateUserWidget() {
  const container = document.getElementById('user-session-widget');
  if (currentUser) {
    const photoUrl    = currentUser.foto_perfil_url || currentUser.avatar_url;
    const displayName = currentUser.alias || currentUser.nombre_completo.split(' ')[0];
    container.innerHTML = `
      <span id="btn-open-profile" style="font-size:0.85rem;font-weight:600;color:var(--text-muted);display:flex;align-items:center;gap:8px;cursor:pointer;" title="Mi Perfil">
        <img src="${photoUrl}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;background:var(--bg-input);">
        ${displayName}
        ${currentUser.rol === 'Administrador' ? '<span style="font-size:0.7rem;background:var(--accent);color:var(--text-main);padding:2px 6px;border-radius:4px;">Admin</span>' : ''}
      </span>
      <button id="btn-logout" class="btn btn-secondary btn-icon" title="Cerrar Sesión">🚪</button>
    `;
    document.getElementById('btn-open-profile').addEventListener('click', openProfileModal);
    document.getElementById('btn-logout').addEventListener('click', handleLogout);
  } else {
    container.innerHTML = '';
  }
}

// --- AUTENTICACIÓN ---

async function handleLogin(e) {
  e.preventDefault();
  const email    = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const btn      = e.target.querySelector('button[type="submit"]');

  btn.disabled    = true;
  btn.textContent = 'Ingresando...';

  try {
    const user = await sheetsAPI.loginUsuario(email, password);
    setCurrentUserSession(user);
    showToast(`¡Bienvenido de nuevo, ${user.nombre_completo}!`, 'success');
    navigate('feed');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Ingresar con Cuenta';
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const nombre   = document.getElementById('reg-name').value;
  const alias    = document.getElementById('reg-alias').value;
  const telefono = document.getElementById('reg-phone').value;
  const email    = document.getElementById('reg-email').value;
  const password = document.getElementById('reg-password').value;
  const btn      = e.target.querySelector('button[type="submit"]');

  btn.disabled    = true;
  btn.textContent = 'Creando cuenta...';

  try {
    const user = await sheetsAPI.registrarUsuario(nombre, alias, telefono, email, password);
    setCurrentUserSession(user);
    showToast('¡Registro exitoso! Sesión iniciada.', 'success');
    navigate('feed');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Crear Cuenta Nueva';
  }
}

async function handleGoogleSSO() {
  showToast('Iniciando sesión con Google...', 'success');

  try {
    const { GoogleAuthProvider, signInWithPopup } = await import(
      'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js'
    );
    const provider = new GoogleAuthProvider();
    const result   = await signInWithPopup(window.auth, provider);
    const gUser    = result.user;

    // Buscar si ya existe en Sheets
    let usuarios;
    try {
      usuarios = await sheetsAPI.getUsuarios();
    } catch {
      usuarios = [];
    }

    const existe = usuarios.find(u => u.email.toLowerCase() === gUser.email.toLowerCase());

    if (existe) {
      if (existe.estado === 'Suspendido') {
        showToast('Esta cuenta de Google está suspendida.', 'error');
        return;
      }
      setCurrentUserSession(existe);
    } else {
      const newUser = await sheetsAPI.registrarUsuario(
        gUser.displayName || 'Usuario Google',
        '',
        gUser.phoneNumber || '',
        gUser.email,
        'google_sso_' + gUser.uid
      );
      setCurrentUserSession({ ...newUser, avatar_url: gUser.photoURL || newUser.avatar_url });
    }

    showToast('Sesión iniciada con Google', 'success');
    navigate('feed');
  } catch (err) {
    console.error(err);
    showToast('Error al iniciar sesión con Google: ' + err.message, 'error');
  }
}

function setCurrentUserSession(user) {
  currentUser = user;
  localStorage.setItem('app_session_user', JSON.stringify(user));
  updateUserWidget();
}

function handleLogout() {
  currentUser = null;
  localStorage.removeItem('app_session_user');
  updateUserWidget();
  navigate('auth');
  showToast('Sesión cerrada con éxito', 'success');
}

// --- FEED DE REPORTES ---

async function renderFeed() {
  const container = document.getElementById('feed-grid-container');
  container.innerHTML = loadingHTML('Cargando reportes...');

  let reportes;
  try {
    reportes = await sheetsAPI.getReportes();
  } catch (err) {
    container.innerHTML = errorHTML('No se pudo conectar con la base de datos. Verifica tu conexión.');
    return;
  }

  let filtrados;
  if (activeFilter === 'all') {
    filtrados = reportes.filter(r => r.estado_caso === 'Reportado' || r.estado_caso === 'En Rescate');
  } else if (activeFilter === 'high') {
    filtrados = reportes.filter(r => r.nivel_vulnerabilidad === 'Alto' && r.estado_caso !== 'Resuelto');
  } else if (activeFilter === 'active') {
    filtrados = reportes.filter(r => r.estado_caso === 'Reportado' || r.estado_caso === 'En Rescate');
  } else if (activeFilter === 'resolved') {
    filtrados = reportes.filter(r => r.estado_caso === 'Resuelto');
  }

  container.innerHTML = '';

  if (!filtrados || filtrados.length === 0) {
    container.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted);">
        <p style="font-size:1.2rem;font-weight:600;margin-bottom:8px;">No se encontraron reportes</p>
        <p style="font-size:0.9rem;">Prueba a cambiar el filtro o reporta un caso nuevo.</p>
      </div>`;
    return;
  }

  filtrados.forEach(reporte => {
    const card = document.createElement('article');
    card.className = 'reporte-card';
    card.dataset.id = reporte.reporte_id;

    let vulClass = 'bajo', vulEmoji = '🟢';
    if (reporte.nivel_vulnerabilidad === 'Alto')  { vulClass = 'alto';  vulEmoji = '🔴'; }
    if (reporte.nivel_vulnerabilidad === 'Medio') { vulClass = 'medio'; vulEmoji = '🟡'; }

    let estClass = 'reportado', estNombre = '🔴 Reportado';
    if (reporte.estado_caso === 'En Rescate') { estClass = 'en-rescate'; estNombre = '🔵 En Rescate'; }
    if (reporte.estado_caso === 'Resuelto')   { estClass = 'resuelto';   estNombre = '🟢 Resuelto';   }

    const especieEmoji = { Perro: '🐶', Gato: '🐱', Ave: '🐦' }[reporte.especie] || '🐾';
    const fechaFmt = new Date(reporte.fecha_reporte).toLocaleDateString('es-ES', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    });

    card.innerHTML = `
      <div class="reporte-media-container">
        <img class="reporte-img" src="${reporte.fotografia_url}" alt="Foto de ${reporte.especie} reportado">
        <div class="card-badges">
          <span class="badge-vulnerabilidad ${vulClass}">${vulEmoji} ${reporte.nivel_vulnerabilidad}</span>
          <span class="badge-estado ${estClass}">${estNombre}</span>
        </div>
      </div>
      <div class="reporte-card-body">
        <div class="reporte-card-header">
          <span class="especie-tag">${especieEmoji} ${reporte.especie}</span>
          <span class="reporte-card-date">${fechaFmt}</span>
        </div>
        <p class="reporte-card-notes">${reporte.notas}</p>
        <div class="reporte-card-footer">
          <span class="location-marker">📍</span>
          <span class="reporte-card-location" title="${reporte.ubicacion_texto}">${reporte.ubicacion_texto}</span>
        </div>
      </div>`;

    card.addEventListener('click', () => openReportDetail(reporte.reporte_id));
    container.appendChild(card);
  });
}

async function openReportDetail(reporteId) {
  currentReportId = reporteId;
  navigate('detail');

  const container = document.getElementById('detalle-content-container');
  container.innerHTML = loadingHTML('Cargando detalle...');

  let reporte;
  try {
    reporte = await sheetsAPI.getReporteById(reporteId);
  } catch (err) {
    container.innerHTML = errorHTML('No se pudo cargar el reporte.');
    return;
  }

  if (!reporte) {
    showToast('El reporte seleccionado no existe.', 'error');
    navigate('feed');
    return;
  }

  let autor = { nombre_completo: 'Usuario Anónimo', avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=anon' };
  try {
    const u = await sheetsAPI.getUsuarioById(reporte.usuario_id);
    if (u) autor = u;
  } catch {}

  let vulColor = 'var(--color-low)';
  if (reporte.nivel_vulnerabilidad === 'Alto')  vulColor = 'var(--color-high)';
  if (reporte.nivel_vulnerabilidad === 'Medio') vulColor = 'var(--color-medium)';

  let estTexto = 'Reportado', estColor = 'var(--color-reportado)';
  if (reporte.estado_caso === 'En Rescate') { estTexto = 'En Rescate'; estColor = 'var(--color-en-rescate)'; }
  if (reporte.estado_caso === 'Resuelto')   { estTexto = 'Resuelto';   estColor = 'var(--color-resuelto)'; }

  const fechaFmt = new Date(reporte.fecha_reporte).toLocaleDateString('es-ES', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  container.innerHTML = `
    <div class="detalle-info-card">
      <img class="detalle-media" src="${reporte.fotografia_url}" alt="Animal vulnerable">
      <div class="detalle-info-body">
        <div class="detalle-header-flex">
          <h2 class="detalle-main-title">
            <span>Caso: ${reporte.especie}</span>
            <span style="font-size:0.75rem;background:${estColor};color:var(--text-main);padding:4px 10px;border-radius:100px;">${estTexto}</span>
          </h2>
          <div style="font-size:0.9rem;font-weight:bold;color:${vulColor};display:flex;align-items:center;gap:6px;">
            ⚠️ Vulnerabilidad ${reporte.nivel_vulnerabilidad}
          </div>
        </div>
        <div class="detalle-meta-row">
          <div class="author-badge">
            <img class="author-avatar" src="${autor.foto_perfil_url || autor.avatar_url}">
            <span>Reportado por <strong>${autor.alias || autor.nombre_completo}</strong></span>
          </div>
          <span>•</span>
          <span>Fecha: ${fechaFmt}</span>
        </div>
        <div>
          <h3 class="detalle-seccion-titulo">Notas del Caso</h3>
          <p class="detalle-descripcion">${reporte.notas}</p>
        </div>
        <div>
          <h3 class="detalle-seccion-titulo">📍 Ubicación del Caso</h3>
          <div class="map-placeholder">
            <div><strong>${reporte.ubicacion_texto}</strong></div>
            <div class="map-lat-lon">GPS: ${parseFloat(reporte.latitud).toFixed(6)}, ${parseFloat(reporte.longitud).toFixed(6)}</div>
            <a href="https://www.google.com/maps/search/?api=1&query=${reporte.latitud},${reporte.longitud}"
               target="_blank" class="btn btn-secondary"
               style="margin-top:12px;font-size:0.8rem;text-decoration:none;padding:8px 12px;display:inline-flex;width:fit-content;">
              🗺️ Ver Ruta de Rescate en Google Maps
            </a>
          </div>
        </div>
      </div>
    </div>

    <div class="chat-container">
      <div class="chat-header">
        <h3 class="chat-title">Actualizaciones y Rescate</h3>
        <span style="font-size:0.75rem;color:var(--text-muted);" id="chat-counter">Cargando comentarios...</span>
      </div>
      <div class="chat-messages" id="chat-messages-container"></div>
      <form class="chat-input-area" id="form-chat-send" onsubmit="return false;">
        <input type="text" id="chat-message-input" placeholder="Escribe una actualización o información del rescate..." required>
        <button type="submit" class="btn btn-primary" style="padding:10px 16px;">Enviar</button>
      </form>
    </div>`;

  document.getElementById('form-chat-send').addEventListener('submit', handleSendComment);
  renderComments();
}

async function renderComments() {
  const container = document.getElementById('chat-messages-container');
  const counter   = document.getElementById('chat-counter');
  if (!container) return;

  container.innerHTML = loadingHTML('');

  let comentarios = [];
  try {
    comentarios = await sheetsAPI.getComentariosByReporte(currentReportId);
  } catch {}

  counter.textContent = `${comentarios.length} comentarios`;
  container.innerHTML = '';

  if (comentarios.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:40px 20px;color:var(--text-muted);font-size:0.85rem;">
        No hay actualizaciones todavía.<br>Escribe un mensaje para coordinar la ayuda.
      </div>`;
    return;
  }

  comentarios.forEach(c => {
    const isOwn = currentUser && String(c.usuario_id) === String(currentUser.usuario_id);
    const isAdm = c.autor_rol === 'Administrador';
    const msgEl = document.createElement('div');
    msgEl.className = `message-bubble ${isOwn ? 'own' : ''}`;
    const hora = new Date(c.fecha_comentario).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    msgEl.innerHTML = `
      <img class="message-avatar" src="${c.autor_avatar}" alt="Avatar">
      <div class="message-content-wrapper">
        <div class="message-header-info">
          <span class="message-author ${isAdm ? 'admin-role' : ''}">${c.autor_nombre} ${isAdm ? '⭐' : ''}</span>
          <span>${hora}</span>
        </div>
        <div class="message-text">${c.mensaje}</div>
      </div>`;
    container.appendChild(msgEl);
  });

  container.scrollTop = container.scrollHeight;
}

async function handleSendComment(e) {
  if (e && e.preventDefault) e.preventDefault();
  const input = document.getElementById('chat-message-input');
  const msg   = input.value.trim();
  if (!msg || !currentUser) return;

  try {
    await sheetsAPI.agregarComentario(currentReportId, currentUser, msg);
    input.value = '';
    renderComments();
    showToast('Actualización publicada', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// --- GPS ---

function startGpsCapture() {
  const indicator = document.getElementById('gps-indicator');
  const latInput  = document.getElementById('report-lat');
  const lonInput  = document.getElementById('report-lon');

  indicator.className   = 'gps-status';
  indicator.textContent = '🔄 Capturando coordenadas...';

  if (!('geolocation' in navigator)) {
    gpsFallback();
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      latInput.value = pos.coords.latitude;
      lonInput.value = pos.coords.longitude;
      indicator.className   = 'gps-status success';
      indicator.textContent = `🟢 Ubicación fijada: ${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`;
    },
    () => gpsFallback(),
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
  );
}

function gpsFallback() {
  const latInput  = document.getElementById('report-lat');
  const lonInput  = document.getElementById('report-lon');
  const indicator = document.getElementById('gps-indicator');
  latInput.value = 40.416775 + (Math.random() - 0.5) * 0.02;
  lonInput.value = -3.703790 + (Math.random() - 0.5) * 0.02;
  indicator.className   = 'gps-status error';
  indicator.textContent = `🟡 Simulación GPS activa: ${parseFloat(latInput.value).toFixed(6)}, ${parseFloat(lonInput.value).toFixed(6)}`;
}

function stopGpsCapture() {
  if (gpsWatchId) {
    navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
  }
}

// --- COMPRESIÓN DE IMAGEN ---

function handlePhotoSelection() {
  const fileInput = document.getElementById('new-report-photo');
  const preview   = document.getElementById('new-report-preview');
  const label     = document.getElementById('photo-upload-label');
  const file      = fileInput.files[0];
  if (!file) return;

  compressImage(file, 800, 600)
    .then(base64 => {
      fileInput.dataset.compressed = base64;
      preview.src = base64;
      preview.style.display = 'block';
      label.style.display   = 'none';
      showToast('Imagen lista para subir.', 'success');
    })
    .catch(() => showToast('Error al procesar la imagen.', 'error'));
}

function compressImage(file, maxWidth, maxHeight) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > h) { if (w > maxWidth)  { h = Math.round(h * maxWidth / w);  w = maxWidth; } }
        else       { if (h > maxHeight) { w = Math.round(w * maxHeight / h); h = maxHeight; } }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
}

// --- NUEVO REPORTE (con Firebase Storage) ---

async function handleNewReportSubmit(e) {
  e.preventDefault();

  const fileInput      = document.getElementById('new-report-photo');
  const especie        = document.getElementById('report-especie').value;
  const vulnerabilidad = document.getElementById('report-vulnerabilidad').value;
  const lat            = document.getElementById('report-lat').value;
  const lon            = document.getElementById('report-lon').value;
  const ubicacionTexto = document.getElementById('report-ubicacion-texto').value;
  const notas          = document.getElementById('report-notas').value;
  const fotoBase64     = fileInput.dataset.compressed;
  const submitBtn      = e.target.querySelector('button[type="submit"]');

  if (!fotoBase64) {
    showToast('Debes subir una fotografía del caso.', 'error');
    return;
  }
  if (!lat || !lon) {
    showToast('Esperando ubicación GPS. Intenta de nuevo en un momento.', 'error');
    return;
  }

  submitBtn.disabled    = true;
  submitBtn.textContent = '⏳ Subiendo foto...';

  const reporteId = 'REP_' + Date.now();
  let fotografiaUrl = fotoBase64; // Fallback: usar base64 si falla Storage

  // ── 1. Subir foto a Firebase Storage ──────────────────────────────────────
  // Usamos signInAnonymously para que las Storage rules (request.auth != null) se cumplan.
  // El usuario ya tiene sesión en Sheets — esto es solo para Firebase Storage.
  try {
    const { getAuth, signInAnonymously } = await import(
      'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js'
    );
    const { getStorage, ref, uploadString, getDownloadURL } = await import(
      'https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js'
    );

    // Autenticar de forma anónima si todavía no hay sesión Firebase
    const auth = getAuth(window.firebaseApp);
    if (!auth.currentUser) {
      await signInAnonymously(auth);
    }

    const storage    = getStorage(window.firebaseApp);
    const storageRef = ref(storage, `reportes/${reporteId}.jpg`);
    await uploadString(storageRef, fotoBase64, 'data_url');
    fotografiaUrl = await getDownloadURL(storageRef);
    showToast('Foto subida a Firebase Storage ✓', 'success');
  } catch (storageErr) {
    // Si Storage falla definitivamente, bloqueamos el envío para evitar
    // guardar base64 en Sheets (excedería el límite de 50.000 chars por celda).
    console.error('Error subiendo foto a Firebase Storage:', storageErr.message);
    showToast('Error al subir la foto. Verifica las reglas de Firebase Storage.', 'error');
    submitBtn.disabled    = false;
    submitBtn.textContent = 'Publicar Reporte (🔴 Reportado)';
    return;
  }

  submitBtn.textContent = '⏳ Guardando reporte...';

  // ── 2. Guardar reporte en Google Sheets ───────────────────────────────────
  const datosReporte = {
    reporte_id:           reporteId,
    usuario_id:           currentUser ? currentUser.usuario_id : 'anonimo',
    fecha_reporte:        new Date().toISOString(),
    especie:              especie,
    fotografia_url:       fotografiaUrl,
    latitud:              parseFloat(lat),
    longitud:             parseFloat(lon),
    ubicacion_texto:      ubicacionTexto,
    nivel_vulnerabilidad: vulnerabilidad,
    notas:                notas,
    estado_caso:          'Reportado'
  };

  try {
    await sheetsAPI.crearReporte(datosReporte);

    // Limpiar formulario
    e.target.reset();
    fileInput.dataset.compressed = '';
    document.getElementById('new-report-preview').style.display = 'none';
    document.getElementById('photo-upload-label').style.display = 'block';
    document.getElementById('modal-new-report').classList.remove('active');

    showToast('¡Reporte publicado con éxito!', 'success');
    navigate('feed');
  } catch (err) {
    showToast('Error al guardar el reporte: ' + err.message, 'error');
  } finally {
    submitBtn.disabled    = false;
    submitBtn.textContent = 'Publicar Reporte (🔴 Reportado)';
  }
}

// --- ADMIN: REPORTES ---

async function renderAdminReportes() {
  const tbody = document.getElementById('admin-tbody-reportes');
  tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:20px;">${loadingHTML('Cargando reportes...')}</td></tr>`;

  let reportes;
  try {
    reportes = await sheetsAPI.getReportes();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--color-high);">Error al cargar reportes: ${err.message}</td></tr>`;
    return;
  }

  tbody.innerHTML = '';
  if (reportes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;">No hay reportes creados.</td></tr>`;
    return;
  }

  reportes.forEach(r => {
    const tr    = document.createElement('tr');
    const fecha = new Date(r.fecha_reporte).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    let vulClass = 'low';
    if (r.nivel_vulnerabilidad === 'Alto')  vulClass = 'high';
    if (r.nivel_vulnerabilidad === 'Medio') vulClass = 'medium';

    tr.innerHTML = `
      <td><img src="${r.fotografia_url}" class="cell-photo" alt="Miniatura"></td>
      <td><small style="font-family:monospace;">${r.reporte_id}</small></td>
      <td><strong>${r.especie}</strong></td>
      <td title="${r.ubicacion_texto}"><div style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.ubicacion_texto}</div></td>
      <td><span class="badge-vulnerabilidad ${vulClass}" style="padding:2px 6px;font-size:0.7rem;">${r.nivel_vulnerabilidad}</span></td>
      <td><small>${fecha}</small></td>
      <td>
        <select class="grid-select" data-id="${r.reporte_id}">
          <option value="Reportado"  ${r.estado_caso === 'Reportado'  ? 'selected' : ''}>🔴 Reportado</option>
          <option value="En Rescate" ${r.estado_caso === 'En Rescate' ? 'selected' : ''}>🔵 En Rescate</option>
          <option value="Resuelto"   ${r.estado_caso === 'Resuelto'   ? 'selected' : ''}>🟢 Resuelto</option>
        </select>
      </td>
      <td class="cell-actions">
        <button class="btn btn-secondary btn-icon btn-edit-case" data-id="${r.reporte_id}" style="padding:5px;height:32px;width:32px;font-size:0.8rem;" title="Editar">✏️</button>
      </td>`;

    tr.querySelector('.grid-select').addEventListener('change', async (e) => {
      try {
        await sheetsAPI.actualizarEstadoReporte(r.reporte_id, e.target.value);
        showToast(`Estado actualizado a "${e.target.value}"`, 'success');
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      }
    });

    tr.querySelector('.btn-edit-case').addEventListener('click', () => openAdminEditReportModal(r));
    tbody.appendChild(tr);
  });
}

// --- ADMIN: USUARIOS ---

async function renderAdminUsuarios() {
  const tbody = document.getElementById('admin-tbody-usuarios');
  tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;">${loadingHTML('Cargando usuarios...')}</td></tr>`;

  let usuarios;
  try {
    usuarios = await sheetsAPI.getUsuarios();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--color-high);">Error: ${err.message}</td></tr>`;
    return;
  }

  tbody.innerHTML = '';
  usuarios.forEach(u => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><img src="${u.avatar_url}" style="width:36px;height:36px;border-radius:50%;background:var(--bg-input);"></td>
      <td><strong>${u.nombre_completo}</strong></td>
      <td><small>${u.email}</small></td>
      <td><small>${u.telefono}</small></td>
      <td>
        <select class="grid-select select-rol" data-id="${u.usuario_id}">
          <option value="Usuario"        ${u.rol === 'Usuario'        ? 'selected' : ''}>Voluntario / Usuario</option>
          <option value="Administrador"  ${u.rol === 'Administrador'  ? 'selected' : ''}>Administrador</option>
        </select>
      </td>
      <td>
        <select class="grid-select select-estado" data-id="${u.usuario_id}">
          <option value="Activo"     ${u.estado === 'Activo'     ? 'selected' : ''}>🟢 Activo</option>
          <option value="Suspendido" ${u.estado === 'Suspendido' ? 'selected' : ''}>🔴 Suspendido</option>
        </select>
      </td>
      <td><small style="color:var(--text-muted)">—</small></td>`;

    tr.querySelector('.select-rol').addEventListener('change', async (e) => {
      try {
        await sheetsAPI.actualizarRolUsuario(u.usuario_id, e.target.value);
        showToast(`Rol de ${u.nombre_completo} → ${e.target.value}`, 'success');
      } catch (err) {
        showToast(err.message, 'error');
        renderAdminUsuarios();
      }
    });

    tr.querySelector('.select-estado').addEventListener('change', async (e) => {
      try {
        await sheetsAPI.actualizarEstadoUsuario(u.usuario_id, e.target.value);
        showToast(`Cuenta de ${u.nombre_completo} → ${e.target.value}`, 'success');
      } catch (err) {
        showToast(err.message, 'error');
        renderAdminUsuarios();
      }
    });

    tbody.appendChild(tr);
  });
}

function openAdminEditReportModal(r) {
  document.getElementById('edit-report-id').value              = r.reporte_id;
  document.getElementById('edit-report-especie').value         = r.especie;
  document.getElementById('edit-report-vulnerabilidad').value  = r.nivel_vulnerabilidad;
  document.getElementById('edit-report-estado').value          = r.estado_caso;
  document.getElementById('edit-report-lat').value             = r.latitud;
  document.getElementById('edit-report-lon').value             = r.longitud;
  document.getElementById('edit-report-ubicacion-texto').value = r.ubicacion_texto;
  document.getElementById('edit-report-notas').value           = r.notas || '';
  document.getElementById('modal-edit-report').classList.add('active');
}

async function handleEditReportSubmit(e) {
  e.preventDefault();
  const id    = document.getElementById('edit-report-id').value;
  const datos = {
    especie:              document.getElementById('edit-report-especie').value,
    nivel_vulnerabilidad: document.getElementById('edit-report-vulnerabilidad').value,
    estado_caso:          document.getElementById('edit-report-estado').value,
    latitud:              parseFloat(document.getElementById('edit-report-lat').value),
    longitud:             parseFloat(document.getElementById('edit-report-lon').value),
    ubicacion_texto:      document.getElementById('edit-report-ubicacion-texto').value,
    notas:                document.getElementById('edit-report-notas').value
  };

  try {
    await sheetsAPI.editarReporte(id, datos);
    document.getElementById('modal-edit-report').classList.remove('active');
    showToast('Reporte modificado con éxito.', 'success');
    renderAdminReportes();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleDeleteReport() {
  const id = document.getElementById('edit-report-id').value;
  if (!confirm(`¿Eliminar permanentemente el reporte ${id}? Esta acción no se puede deshacer.`)) return;

  try {
    await sheetsAPI.eliminarReporte(id);
    document.getElementById('modal-edit-report').classList.remove('active');
    showToast('Reporte eliminado.', 'success');
    renderAdminReportes();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleExportCSV() {
  try {
    const csv = await sheetsAPI.exportarTablaACSV('Reportes');
    if (!csv) { showToast('No hay datos para exportar.', 'error'); return; }
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `reportes_${new Date().toISOString().split('T')[0]}.csv`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('CSV descargado.', 'success');
  } catch (err) {
    showToast('Error al exportar: ' + err.message, 'error');
  }
}

// --- PERFIL DE USUARIO ---

function openProfileModal() {
  if (!currentUser) return;
  const photoUrl = currentUser.foto_perfil_url || currentUser.avatar_url;
  document.getElementById('profile-photo-preview').src = photoUrl;
  document.getElementById('profile-alias').value       = currentUser.alias    || '';
  document.getElementById('profile-phone').value       = currentUser.telefono || '';
  document.getElementById('profile-photo-input').dataset.compressed = '';
  document.getElementById('modal-profile').classList.add('active');
}

function handleProfilePhotoSelection() {
  const fileInput = document.getElementById('profile-photo-input');
  const preview   = document.getElementById('profile-photo-preview');
  const file      = fileInput.files[0];
  if (!file) return;

  compressImage(file, 400, 400)
    .then(base64 => {
      fileInput.dataset.compressed = base64;
      preview.src = base64;
      showToast('Foto lista para subir.', 'success');
    })
    .catch(() => showToast('Error al procesar la imagen.', 'error'));
}

async function handleProfileSave(e) {
  e.preventDefault();
  const alias      = document.getElementById('profile-alias').value.trim();
  const telefono   = document.getElementById('profile-phone').value.trim();
  const fileInput  = document.getElementById('profile-photo-input');
  const fotoBase64 = fileInput.dataset.compressed;
  const btn        = e.target.querySelector('button[type="submit"]');

  btn.disabled    = true;
  btn.textContent = '⏳ Guardando...';

  let fotoPerfil = currentUser.foto_perfil_url || '';

  // Subir nueva foto de perfil a Firebase Storage si el usuario eligió una
  if (fotoBase64) {
    btn.textContent = '⏳ Subiendo foto...';
    try {
      const { getAuth, signInAnonymously } = await import(
        'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js'
      );
      const { getStorage, ref, uploadString, getDownloadURL } = await import(
        'https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js'
      );
      const auth = getAuth(window.firebaseApp);
      if (!auth.currentUser) await signInAnonymously(auth);
      const storage    = getStorage(window.firebaseApp);
      const storageRef = ref(storage, `perfiles/${currentUser.usuario_id}.jpg`);
      await uploadString(storageRef, fotoBase64, 'data_url');
      fotoPerfil = await getDownloadURL(storageRef);
    } catch (err) {
      showToast('Error al subir foto: ' + err.message, 'error');
      btn.disabled    = false;
      btn.textContent = 'Guardar Cambios';
      return;
    }
    btn.textContent = '⏳ Guardando...';
  }

  try {
    await sheetsAPI.actualizarPerfil(currentUser.usuario_id, {
      alias,
      telefono,
      foto_perfil_url: fotoPerfil
    });

    // Actualizar sesión local
    currentUser = { ...currentUser, alias, telefono, foto_perfil_url: fotoPerfil };
    localStorage.setItem('app_session_user', JSON.stringify(currentUser));
    updateUserWidget();

    document.getElementById('modal-profile').classList.remove('active');
    showToast('¡Perfil actualizado con éxito!', 'success');
  } catch (err) {
    showToast('Error al guardar: ' + err.message, 'error');
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Guardar Cambios';
  }
}

// --- TOAST ---

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  const msgEl = document.getElementById('toast-message');
  msgEl.textContent = message;
  toast.className = '';
  toast.classList.add('show', type === 'success' ? 'success-toast' : 'error-toast');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

// --- HELPERS DE UI ---

function loadingHTML(text = 'Cargando...') {
  return `<div style="display:flex;align-items:center;gap:8px;justify-content:center;padding:20px;color:var(--text-muted);font-size:0.9rem;">
    <div style="width:16px;height:16px;border:2px solid var(--accent);border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
    ${text}
  </div>`;
}

function errorHTML(text) {
  return `<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--color-high);">⚠️ ${text}</div>`;
}
