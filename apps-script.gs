// ==========================================
// RESCATE ANIMAL — Google Apps Script Backend
// Versión: 4.0 — Columnas confirmadas con el Sheet real
// ==========================================
//
// INSTRUCCIONES:
// 1. Reemplaza el código en Apps Script con este archivo
// 2. Implementar → Administrar implementaciones → edita → "Nueva versión" → Guardar
//    (misma URL, no cambias nada en la app)
// 3. Ejecuta setupAdminUser() UNA VEZ para crear el usuario administrador
// 4. Ejecuta configurarTriggerArchivado() UNA VEZ para activar la migración semanal
// ==========================================

// ─── CONFIGURACIÓN ──────────────────────────────────────────────────────────

const ID_CARPETA_DRIVE = "1BUTL4qkbgxUH17sGsUz4U051Vt4citAh";

// Mapa: nombre interno del app → nombre real de la columna en cada hoja
// Si algún día renombras una columna en Sheets, solo edita aquí.
const COL = {
  usuarios: {
    id:        'id_usuario',          // app usa: usuario_id
    nombre:    'nombre_completo',
    telefono:  'telefono',
    email:     'email',
    password:  'password',
    rol:       'rol',
    estado:    'estado',
    avatar:    'avatar_url',
    alias:     'alias',
    fotoPerfil:'foto_perfil_url',
    fecha:     'fecha_registro'
  },
  reportes: {
    id:            'id_reporte',         // app usa: reporte_id
    usuario:       'id_usuario_creador', // app usa: usuario_id
    especie:       'especie',
    lat:           'latitud',
    lon:           'longitud',
    foto:          'url_foto',           // app usa: fotografia_url
    vulnerabilidad:'nivel_vulnerabilidad',
    estado:        'estado_caso',
    fecha:         'fecha_creacion',     // app usa: fecha_reporte
    notas:         'notas',
    ubicacion:     'ubicacion_texto'
  },
  comentarios: {
    id:        'id_comentario',   // app usa: comentario_id
    reporte:   'id_reporte',
    usuario:   'id_usuario',
    mensaje:   'mensaje',
    fecha:     'fecha_envio',     // app usa: fecha_comentario
    autorNombre:'autor_nombre',
    autorAvatar:'autor_avatar',
    autorRol:   'autor_rol'
  }
};

// Estado que activa el archivado de la foto a Google Drive
const ESTADO_ARCHIVABLE = ['Resuelto', '🟢 A Salvo'];

// ─── MANEJADOR GET ───────────────────────────────────────────────────────────

function doGet(e) {
  try {
    const ss     = SpreadsheetApp.getActiveSpreadsheet();
    const action = e.parameter.action;
    let result;

    switch (action) {

      case 'getReportes':
        result = getSheetData(ss, 'Reportes').map(normalizarReporte);
        break;

      case 'getUsuarios':
        result = getSheetData(ss, 'Usuarios')
          .map(normalizarUsuario)
          .map(({ password, ...u }) => u); // nunca exponer contraseña
        break;

      case 'getComentarios': {
        const reporteId = e.parameter.reporteId;
        const todos = getSheetData(ss, 'Comentarios').map(normalizarComentario);
        result = reporteId
          ? todos.filter(c => String(c.reporte_id) === String(reporteId))
          : todos;
        break;
      }

      default:
        result = { error: 'Acción GET no reconocida: ' + action };
    }

    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ error: 'doGet: ' + err.message });
  }
}

// ─── MANEJADOR POST ──────────────────────────────────────────────────────────

function doPost(e) {
  try {
    const datos  = JSON.parse(e.postData.contents);
    const ss     = SpreadsheetApp.getActiveSpreadsheet();
    const action = datos.action;
    let result;

    switch (action) {

      // ── Autenticación ────────────────────────────────────────────────────
      case 'login': {
        const usuarios = getSheetData(ss, 'Usuarios').map(normalizarUsuario);
        const user = usuarios.find(u =>
          u.email && u.email.toLowerCase() === datos.email.toLowerCase()
        );
        if (!user)                        { result = { error: 'No existe ninguna cuenta con ese correo.' };          break; }
        if (user.estado === 'Suspendido') { result = { error: 'Esta cuenta está suspendida. Contacta al administrador.' }; break; }
        if (user.password !== datos.password) { result = { error: 'Contraseña incorrecta.' };                       break; }
        const { password, ...safeUser } = user;
        result = { success: true, user: safeUser };
        break;
      }

      // ── Crear usuario ────────────────────────────────────────────────────
      case 'createUsuario': {
        const usuarios = getSheetData(ss, 'Usuarios').map(normalizarUsuario);
        const existe = usuarios.find(u =>
          u.email && u.email.toLowerCase() === datos.usuario.email.toLowerCase()
        );
        if (existe) { result = { error: 'Ya existe una cuenta con ese correo electrónico.' }; break; }
        // Traduce nombres internos → nombres reales de la hoja
        const u = datos.usuario;
        const filaUsuario = {
          [COL.usuarios.id]:         u.usuario_id,
          [COL.usuarios.nombre]:     u.nombre_completo,
          [COL.usuarios.telefono]:   u.telefono,
          [COL.usuarios.email]:      u.email,
          [COL.usuarios.password]:   u.password,
          [COL.usuarios.rol]:        u.rol    || 'Usuario',
          [COL.usuarios.estado]:     u.estado || 'Activo',
          [COL.usuarios.avatar]:     u.avatar_url,
          [COL.usuarios.alias]:      u.alias           || '',
          [COL.usuarios.fotoPerfil]: u.foto_perfil_url || '',
          [COL.usuarios.fecha]:      new Date().toISOString()
        };
        result = appendRow(ss, 'Usuarios', filaUsuario);
        break;
      }

      // ── Crear reporte ────────────────────────────────────────────────────
      case 'createReporte': {
        const r = datos.reporte;
        const filaReporte = {
          [COL.reportes.id]:             r.reporte_id,
          [COL.reportes.usuario]:        r.usuario_id  || '',
          [COL.reportes.especie]:        r.especie,
          [COL.reportes.lat]:            r.latitud,
          [COL.reportes.lon]:            r.longitud,
          [COL.reportes.foto]:           r.fotografia_url,
          [COL.reportes.vulnerabilidad]: r.nivel_vulnerabilidad,
          [COL.reportes.estado]:         r.estado_caso,
          [COL.reportes.fecha]:          r.fecha_reporte,
          [COL.reportes.notas]:          r.notas,
          [COL.reportes.ubicacion]:      r.ubicacion_texto
        };
        result = appendRow(ss, 'Reportes', filaReporte);
        break;
      }

      // ── Crear comentario ─────────────────────────────────────────────────
      case 'createComentario': {
        const c = datos.comentario;
        const filaComentario = {
          [COL.comentarios.id]:          c.comentario_id,
          [COL.comentarios.reporte]:     c.reporte_id,
          [COL.comentarios.usuario]:     c.usuario_id,
          [COL.comentarios.mensaje]:     c.mensaje,
          [COL.comentarios.fecha]:       c.fecha_comentario,
          [COL.comentarios.autorNombre]: c.autor_nombre,
          [COL.comentarios.autorAvatar]: c.autor_avatar,
          [COL.comentarios.autorRol]:    c.autor_rol
        };
        result = appendRow(ss, 'Comentarios', filaComentario);
        break;
      }

      // ── Actualizar reporte ───────────────────────────────────────────────
      case 'updateReporte': {
        // Traduce campos internos del app a nombres reales de la hoja
        const mapa = {
          estado_caso:          COL.reportes.estado,
          nivel_vulnerabilidad: COL.reportes.vulnerabilidad,
          especie:              COL.reportes.especie,
          latitud:              COL.reportes.lat,
          longitud:             COL.reportes.lon,
          ubicacion_texto:      COL.reportes.ubicacion,
          notas:                COL.reportes.notas,
          fotografia_url:       COL.reportes.foto
        };
        const updates = {};
        Object.entries(datos.updates || {}).forEach(([k, v]) => {
          if (mapa[k]) updates[mapa[k]] = v;
        });
        result = updateRow(ss, 'Reportes', COL.reportes.id, datos.id, updates);
        break;
      }

      // ── Actualizar usuario ───────────────────────────────────────────────
      case 'updateUsuario': {
        const mapaU = {
          rol:             COL.usuarios.rol,
          estado:          COL.usuarios.estado,
          alias:           COL.usuarios.alias,
          telefono:        COL.usuarios.telefono,
          foto_perfil_url: COL.usuarios.fotoPerfil,
          avatar_url:      COL.usuarios.avatar
        };
        const updatesU = {};
        Object.entries(datos.updates || {}).forEach(([k, v]) => {
          if (mapaU[k]) updatesU[mapaU[k]] = v;
        });
        result = updateRow(ss, 'Usuarios', COL.usuarios.id, datos.id, updatesU);
        break;
      }

      // ── Eliminar reporte (y sus comentarios) ─────────────────────────────
      case 'deleteReporte':
        result = deleteRow(ss, 'Reportes', COL.reportes.id, datos.id);
        deleteRowsWhere(ss, 'Comentarios', COL.comentarios.reporte, datos.id);
        break;

      default:
        result = { error: 'Acción POST no reconocida: ' + action };
    }

    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ error: 'doPost: ' + err.message });
  }
}

// ─── NORMALIZACIÓN (Hoja → App) ──────────────────────────────────────────────
// Convierte los nombres de columna de la hoja a los nombres internos del app.

function normalizarReporte(r) {
  return {
    reporte_id:           r[COL.reportes.id],
    usuario_id:           r[COL.reportes.usuario]        || '',
    especie:              r[COL.reportes.especie],
    latitud:              r[COL.reportes.lat],
    longitud:             r[COL.reportes.lon],
    fotografia_url:       r[COL.reportes.foto],
    nivel_vulnerabilidad: r[COL.reportes.vulnerabilidad],
    estado_caso:          r[COL.reportes.estado],
    fecha_reporte:        r[COL.reportes.fecha],
    notas:                r[COL.reportes.notas],
    ubicacion_texto:      r[COL.reportes.ubicacion]
  };
}

function normalizarUsuario(u) {
  return {
    usuario_id:      u[COL.usuarios.id],
    nombre_completo: u[COL.usuarios.nombre],
    telefono:        u[COL.usuarios.telefono]  || '',
    email:           u[COL.usuarios.email],
    password:        u[COL.usuarios.password],
    rol:             u[COL.usuarios.rol],
    estado:          u[COL.usuarios.estado],
    avatar_url:      u[COL.usuarios.avatar],
    alias:           u[COL.usuarios.alias]     || '',
    foto_perfil_url: u[COL.usuarios.fotoPerfil]|| '',
    fecha_registro:  u[COL.usuarios.fecha]
  };
}

function normalizarComentario(c) {
  return {
    comentario_id:   c[COL.comentarios.id],
    reporte_id:      c[COL.comentarios.reporte],
    usuario_id:      c[COL.comentarios.usuario],
    mensaje:         c[COL.comentarios.mensaje],
    fecha_comentario:c[COL.comentarios.fecha],
    autor_nombre:    c[COL.comentarios.autorNombre],
    autor_avatar:    c[COL.comentarios.autorAvatar],
    autor_rol:       c[COL.comentarios.autorRol]
  };
}

// ─── ARCHIVADO DE FOTOS: FIREBASE STORAGE → GOOGLE DRIVE ────────────────────

function archivarFotosHistoricas() {
  const libro        = SpreadsheetApp.getActiveSpreadsheet();
  const hojaReportes = libro.getSheetByName('Reportes');

  if (!hojaReportes) { Logger.log('❌ No se encontró la hoja "Reportes".'); return; }

  const ultimaFila = hojaReportes.getLastRow();
  if (ultimaFila < 2) { Logger.log('No hay reportes para procesar.'); return; }

  const cabeceras = hojaReportes.getRange(1, 1, 1, hojaReportes.getLastColumn()).getValues()[0];
  const colId     = cabeceras.indexOf(COL.reportes.id)     + 1;
  const colFoto   = cabeceras.indexOf(COL.reportes.foto)   + 1;
  const colEstado = cabeceras.indexOf(COL.reportes.estado) + 1;
  const colEspecie= cabeceras.indexOf(COL.reportes.especie)+ 1;

  if (colFoto === 0 || colEstado === 0) {
    Logger.log('❌ Faltan columnas "' + COL.reportes.foto + '" o "' + COL.reportes.estado + '".');
    return;
  }

  const filas          = hojaReportes.getRange(2, 1, ultimaFila - 1, hojaReportes.getLastColumn()).getValues();
  const carpetaDestino = DriveApp.getFolderById(ID_CARPETA_DRIVE);
  let archivados = 0, saltados = 0, errores = 0;

  for (let i = 0; i < filas.length; i++) {
    const idReporte = String(filas[i][colId     - 1] || '');
    const urlFoto   = String(filas[i][colFoto   - 1] || '');
    const estado    = String(filas[i][colEstado - 1] || '');
    const especie   = String(filas[i][colEspecie- 1] || 'animal');

    const esArchivable = ESTADO_ARCHIVABLE.includes(estado);
    const esFirebase   = urlFoto.includes('firebasestorage.googleapis.com');

    if (!esArchivable || !esFirebase) { saltados++; continue; }

    try {
      Logger.log('Archivando: ' + idReporte);
      const respuesta = UrlFetchApp.fetch(urlFoto, { muteHttpExceptions: true });
      if (respuesta.getResponseCode() !== 200) {
        Logger.log('⚠️ HTTP ' + respuesta.getResponseCode() + ' — ' + idReporte);
        errores++;
        continue;
      }

      const blob = respuesta.getBlob();
      blob.setName('Rescate_' + idReporte + '_' + especie + '_' + new Date().toISOString().slice(0, 10));
      blob.setContentType('image/jpeg');

      const archivo = carpetaDestino.createFile(blob);
      archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

      // URL embeddable en <img src="...">
      const nuevaUrl = 'https://drive.google.com/uc?export=view&id=' + archivo.getId();
      hojaReportes.getRange(i + 2, colFoto).setValue(nuevaUrl);
      archivados++;

      Utilities.sleep(300);
    } catch (err) {
      Logger.log('❌ Error en fila ' + (i + 2) + ': ' + err.message);
      errores++;
    }
  }

  const resumen = '✅ Archivado: ' + archivados + ' migradas | ' + saltados + ' saltadas | ' + errores + ' errores';
  Logger.log(resumen);

  try {
    MailApp.sendEmail(
      Session.getActiveUser().getEmail(),
      '[RescateAnimal] Archivado de fotos completado',
      resumen + '\nCarpeta Drive: https://drive.google.com/drive/folders/' + ID_CARPETA_DRIVE
    );
  } catch (e) { Logger.log('Email no enviado: ' + e.message); }
}

// ─── CONFIGURAR TRIGGER SEMANAL ──────────────────────────────────────────────

function configurarTriggerArchivado() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'archivarFotosHistoricas') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('archivarFotosHistoricas')
    .timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(2).create();
  Logger.log('✅ Trigger configurado: todos los domingos a las 2am.');
}

// ─── SETUP: CREAR USUARIO ADMIN ──────────────────────────────────────────────
// Ejecuta esta función UNA VEZ para crear el usuario administrador.
// Si ya existe un usuario con ese email, no hace nada.

function setupAdminUser() {
  const ss     = SpreadsheetApp.getActiveSpreadsheet();
  const hoja   = ss.getSheetByName('Usuarios');
  if (!hoja) { Logger.log('❌ No existe la hoja "Usuarios".'); return; }

  const datos = getSheetData(ss, 'Usuarios').map(normalizarUsuario);
  if (datos.find(u => u.email === 'admin@rescate.org')) {
    Logger.log('ℹ️ El usuario admin ya existe.');
    return;
  }

  const fila = {
    [COL.usuarios.id]:       'usr_admin',
    [COL.usuarios.nombre]:   'Administrador Rescate',
    [COL.usuarios.telefono]: '',
    [COL.usuarios.email]:    'admin@rescate.org',
    [COL.usuarios.password]: 'admin123',   // ← Cambia esta contraseña después
    [COL.usuarios.rol]:      'Administrador',
    [COL.usuarios.estado]:   'Activo',
    [COL.usuarios.avatar]:   'https://api.dicebear.com/7.x/bottts/svg?seed=admin',
    [COL.usuarios.fecha]:    new Date().toISOString()
  };

  appendRow(ss, 'Usuarios', fila);
  Logger.log('✅ Usuario admin creado. Email: admin@rescate.org | Password: admin123');
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function getSheetData(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { if (h) obj[h] = row[i]; });
    return obj;
  });
}

function appendRow(ss, sheetName, obj) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { error: 'Hoja "' + sheetName + '" no encontrada.' };
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const fila    = headers.map(h => (obj[h] !== undefined ? obj[h] : ''));
  sheet.appendRow(fila);
  return { success: true };
}

function updateRow(ss, sheetName, keyCol, keyVal, updates) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { error: 'Hoja "' + sheetName + '" no encontrada.' };
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const keyIdx  = headers.indexOf(keyCol);

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][keyIdx]) === String(keyVal)) {
      Object.keys(updates).forEach(k => {
        const col = headers.indexOf(k);
        if (col >= 0) sheet.getRange(i + 1, col + 1).setValue(updates[k]);
      });
      return { success: true };
    }
  }
  return { error: 'Registro no encontrado: ' + keyVal };
}

function deleteRow(ss, sheetName, keyCol, keyVal) {
  const sheet  = ss.getSheetByName(sheetName);
  if (!sheet)  return { error: 'Hoja "' + sheetName + '" no encontrada.' };
  const data   = sheet.getDataRange().getValues();
  const keyIdx = data[0].indexOf(keyCol);
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][keyIdx]) === String(keyVal)) { sheet.deleteRow(i + 1); return { success: true }; }
  }
  return { error: 'No se encontró el registro.' };
}

function deleteRowsWhere(ss, sheetName, keyCol, keyVal) {
  const sheet  = ss.getSheetByName(sheetName);
  if (!sheet)  return;
  const data   = sheet.getDataRange().getValues();
  const keyIdx = data[0].indexOf(keyCol);
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][keyIdx]) === String(keyVal)) sheet.deleteRow(i + 1);
  }
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
