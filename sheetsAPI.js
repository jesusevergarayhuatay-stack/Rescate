/**
 * sheetsAPI.js
 * Cliente async para el backend de Google Apps Script.
 * Reemplaza a mockSheetsService.js con datos reales de Google Sheets.
 *
 * ─── CONFIGURACIÓN ───────────────────────────────────────────────────────────
 * Reemplaza APPS_SCRIPT_URL con la URL que obtienes al desplegar apps-script.gs
 * como aplicación web en Google Apps Script.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxBDLMt5tIF8z7cBtv7Hf8C6JBnFTvvajGLB-MiXZe8mSlyu6uYybxlVotoxdtlG9tSnw/exec";

// ─── HELPERS DE FETCH ────────────────────────────────────────────────────────

/**
 * GET request al Apps Script.
 * Los parámetros se pasan como query params en la URL.
 */
async function apiGet(params = {}) {
  const url = new URL(APPS_SCRIPT_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  const response = await fetch(url.toString());
  if (!response.ok) throw new Error('Error de red: ' + response.status);
  return response.json();
}

/**
 * POST request al Apps Script.
 * Se omite Content-Type a propósito para evitar el preflight de CORS
 * (el navegador lo trata como "simple request" y Apps Script lo lee igual).
 */
async function apiPost(data = {}) {
  const response = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error('Error de red: ' + response.status);
  const result = await response.json();
  if (result.error) throw new Error(result.error);
  return result;
}

// ─── SERVICIO PRINCIPAL ──────────────────────────────────────────────────────

const sheetsAPI = {

  // ── AUTENTICACIÓN ──────────────────────────────────────────────────────────

  async loginUsuario(email, password) {
    const result = await apiPost({ action: 'login', email, password });
    return result.user;
  },

  async registrarUsuario(nombre, telefono, email, password) {
    const newUser = {
      usuario_id:     'usr_' + Date.now(),
      nombre_completo: nombre,
      telefono:        telefono,
      email:           email,
      password:        password,
      rol:             'Usuario',
      estado:          'Activo',
      avatar_url:      `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(nombre)}`
    };
    await apiPost({ action: 'createUsuario', usuario: newUser });
    // Devolver usuario sin contraseña
    const { password: _pwd, ...safeUser } = newUser;
    return safeUser;
  },

  // ── REPORTES ───────────────────────────────────────────────────────────────

  async getReportes() {
    return apiGet({ action: 'getReportes' });
  },

  async getReporteById(id) {
    const reportes = await apiGet({ action: 'getReportes' });
    return reportes.find(r => String(r.reporte_id) === String(id)) || null;
  },

  async crearReporte(reporte) {
    // El Apps Script espera los campos con los nombres reales de tu hoja
    // (id_reporte → se traduce dentro del Apps Script en createReporte)
    return apiPost({ action: 'createReporte', reporte });
  },

  async actualizarEstadoReporte(id, nuevoEstado) {
    return apiPost({ action: 'updateReporte', id, updates: { estado_caso: nuevoEstado } });
  },

  async editarReporte(id, datos) {
    return apiPost({ action: 'updateReporte', id, updates: datos });
  },

  async eliminarReporte(id) {
    return apiPost({ action: 'deleteReporte', id });
  },

  // ── USUARIOS ───────────────────────────────────────────────────────────────

  async getUsuarios() {
    return apiGet({ action: 'getUsuarios' });
  },

  async getUsuarioById(id) {
    const usuarios = await apiGet({ action: 'getUsuarios' });
    return usuarios.find(u => String(u.usuario_id) === String(id)) || null;
  },

  async actualizarRolUsuario(id, nuevoRol) {
    if (id === 'usr_admin' && nuevoRol !== 'Administrador') {
      throw new Error('No puedes cambiar el rol del administrador principal.');
    }
    return apiPost({ action: 'updateUsuario', id, updates: { rol: nuevoRol } });
  },

  async actualizarEstadoUsuario(id, nuevoEstado) {
    return apiPost({ action: 'updateUsuario', id, updates: { estado: nuevoEstado } });
  },

  // ── COMENTARIOS ────────────────────────────────────────────────────────────

  async getComentariosByReporte(reporteId) {
    return apiGet({ action: 'getComentarios', reporteId });
  },

  /**
   * @param {string} reporteId
   * @param {object} currentUser - El usuario autenticado (ya lo tiene app.js en memoria)
   * @param {string} mensaje
   */
  async agregarComentario(reporteId, currentUser, mensaje) {
    const comentario = {
      comentario_id:     'com_' + Date.now(),
      reporte_id:        reporteId,
      usuario_id:        currentUser.usuario_id,
      mensaje:           mensaje,
      fecha_comentario:  new Date().toISOString(),
      autor_nombre:      currentUser.nombre_completo,
      autor_avatar:      currentUser.avatar_url,
      autor_rol:         currentUser.rol
    };
    return apiPost({ action: 'createComentario', comentario });
  },

  // ── EXPORTAR CSV ───────────────────────────────────────────────────────────

  async exportarTablaACSV(tableName) {
    const action = tableName === 'Reportes' ? 'getReportes' : 'getUsuarios';
    const data = await apiGet({ action });
    if (!data || data.length === 0) return null;

    const headers = Object.keys(data[0]);
    const escape  = val => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const rows    = data.map(row => headers.map(h => escape(row[h])).join(','));
    return [headers.join(','), ...rows].join('\n');
  }
};

export default sheetsAPI;
