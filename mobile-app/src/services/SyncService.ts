import NetInfo from '@react-native-community/netinfo';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { getDatabase } from '../database/schema';

import { BACKEND_URL } from '../config/api';

/**
 * Fetch con timeout de seguridad integrado para evitar que la app quede congelada indefinidamente
 */
const fetchWithTimeout = async (url: string, options: RequestInit, timeoutMs = 14000): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Auto-recuperación al iniciar la App o al abrir sincronización:
 * Ejecuta GET /api/v1/sync/verificar-pendientes enviando los localIds de SQLite.
 * Si el backend responde que esos registros ya existen en PostgreSQL,
 * actualiza automáticamente SQLite local a sync_status = 'SYNCED' y sincronizado = 1.
 */
export const autoRecoverPendingSync = async (): Promise<{ recoveredCount: number; message: string }> => {
  try {
    const netInfo = await NetInfo.fetch();
    if (netInfo.isConnected === false) {
      return { recoveredCount: 0, message: 'Sin conexión a internet' };
    }

    const db = await getDatabase();
    const pendingRows = await db.getAllAsync(
      `SELECT local_id FROM entregas_agua 
       WHERE (sincronizado = 0 OR sync_status != 'SYNCED')
         AND local_id IS NOT NULL AND local_id != ''
       LIMIT 100`
    ) as { local_id: string }[];

    if (pendingRows.length === 0) {
      return { recoveredCount: 0, message: 'No hay entregas pendientes' };
    }

    const localIds = pendingRows.map((r) => r.local_id).filter(Boolean);
    if (localIds.length === 0) {
      return { recoveredCount: 0, message: 'Sin localIds válidos' };
    }

    // Consulta POST /api/v1/sync/verificar-pendientes (evita error 414 URI Too Long cuando hay muchos IDs)
    const response = await fetchWithTimeout(`${BACKEND_URL}/sync/verificar-pendientes`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ localIds }),
    }, 12000);

    if (!response.ok) {
      return { recoveredCount: 0, message: 'Error en respuesta de verificación' };
    }

    const json = await response.json();
    const syncedLocalIds: string[] = Array.isArray(json.syncedLocalIds) ? json.syncedLocalIds : [];

    if (syncedLocalIds.length > 0) {
      for (const id of syncedLocalIds) {
        await db.runAsync(
          `UPDATE entregas_agua SET sincronizado = 1, sync_status = 'SYNCED', retry_count = 0 WHERE local_id = ?`,
          [id]
        );
      }
      return {
        recoveredCount: syncedLocalIds.length,
        message: `Se recuperaron y confirmaron ${syncedLocalIds.length} entregas ya existentes en el servidor.`,
      };
    }

    return { recoveredCount: 0, message: 'Ninguna entrega figuraba aún en el servidor' };
  } catch (error: any) {
    console.warn('Error en autoRecoverPendingSync:', error?.message || error);
    return { recoveredCount: 0, message: error?.message || 'Error de verificación' };
  }
};

/**
 * Reconciliación Bidireccional Servidor -> Celular (SQLite):
 * 1. Purgar de SQLite las entregas locales que estaban marcadas como sincronizadas pero que fueron eliminadas en la Web.
 * 2. Si se eliminó algo en la web, se borra de SQLite para que el total del celular coincida 100% con la web.
 */
export const reconcileServerEntregas = async (
  targetFecha?: string
): Promise<{ deletedCount: number; message: string }> => {
  try {
    const netInfo = await NetInfo.fetch();
    if (netInfo.isConnected === false) {
      return { deletedCount: 0, message: 'Sin conexión para reconciliar' };
    }

    const fIso = targetFecha || new Date().toISOString().slice(0, 10);
    const db = await getDatabase();

    const res = await fetchWithTimeout(`${BACKEND_URL}/entregas?fecha=${fIso}&limit=1000`, {}, 12000);
    if (!res.ok) return { deletedCount: 0, message: 'Error de respuesta del servidor' };

    const json = await res.json();
    const serverRows: any[] = Array.isArray(json) ? json : (json.data || []);
    if (!Array.isArray(serverRows)) return { deletedCount: 0, message: 'Formato inválido de servidor' };

    const serverLocalIds = new Set(serverRows.map((s: any) => s.local_id).filter(Boolean));
    const serverBenefDateKeys = new Set(
      serverRows.map((s: any) => `b-${s.beneficiario_id}-${String(s.fecha_asignada || s.fecha_hora || '').slice(0, 10)}`)
    );
    const serverIds = new Set(serverRows.map((s: any) => Number(s.id)).filter(Boolean));

    const localRows: any[] = await db.getAllAsync(
      `SELECT id, local_id, beneficiario_id, fecha_asignada, fecha_captura, fecha_hora, foto_local_uri, sincronizado, sync_status
       FROM entregas_agua
       WHERE (fecha_asignada = ? OR substr(COALESCE(fecha_captura, fecha_hora), 1, 10) = ?)`,
      [fIso, fIso]
    );

    let deletedCount = 0;
    for (const item of localRows) {
      const isSynced = Number(item.sincronizado) === 1 || item.sync_status === 'SYNCED';
      const localKey = item.local_id;
      const sFecha = String(item.fecha_asignada || item.fecha_captura || item.fecha_hora || '').slice(0, 10);
      const benefDateKey = `b-${item.beneficiario_id}-${sFecha}`;

      const existsOnServer =
        (localKey && serverLocalIds.has(localKey)) ||
        serverBenefDateKeys.has(benefDateKey) ||
        (item.id && serverIds.has(Number(item.id)));

      // Si estaba sincronizada pero ya NO existe en el servidor -> fue eliminada en la Web
      if (isSynced && !existsOnServer) {
        await db.runAsync('DELETE FROM entregas_agua WHERE id = ?', [item.id]);
        if (item.foto_local_uri && Platform.OS !== 'web' && !String(item.foto_local_uri).startsWith('http')) {
          await FileSystem.deleteAsync(item.foto_local_uri, { idempotent: true }).catch(() => {});
        }
        deletedCount++;
      }
    }

    return {
      deletedCount,
      message: deletedCount > 0
        ? `Se purgaron ${deletedCount} entregas eliminadas en la Web.`
        : 'Datos sincronizados y conciliados con la Web.',
    };
  } catch (error: any) {
    console.warn('Error en reconcileServerEntregas:', error?.message || error);
    return { deletedCount: 0, message: error?.message || 'Error de reconciliación' };
  }
};

let isSyncInProgress = false;

export const syncData = async (manualRetry = false): Promise<{ success: boolean; syncedCount: number; message: string }> => {
  if (isSyncInProgress && !manualRetry) {
    return { success: true, syncedCount: 0, message: 'Sincronización en curso en segundo plano.' };
  }
  isSyncInProgress = true;
  try {
    const netInfo = await NetInfo.fetch();
    
    // En ciertos celulares Android, netInfo.isConnected puede dar falso negativo con datos móviles 4G.
    // Solo abortar si explícitamente netInfo.isConnected === false y NO es un reintento manual.
    if (netInfo.isConnected === false && !manualRetry) {
      isSyncInProgress = false;
      return { success: false, syncedCount: 0, message: 'Sin conexión a internet. Los datos se guardan de forma segura en tu celular.' };
    }

    // 0. Auto-recuperación previa: si la conexión parpadeó en un intento anterior,
    // verifica cuáles registros ya existen en PostgreSQL para no re-enviarlos
    try {
      await autoRecoverPendingSync();
    } catch (_) {}

    const db = await getDatabase();

    // Recuperar registros que quedaron en FAILED o atascados en SYNCING para que NUNCA se pierda una entrega
    try {
      await db.runAsync(
        `UPDATE entregas_agua SET sync_status = 'PENDING', retry_count = 0 WHERE (sync_status = 'FAILED' OR sync_status = 'SYNCING') AND sincronizado = 0`
      );
    } catch (_) {}
    
    // Consultar TODAS las entregas pendientes de sincronización (sin bloquear por retry_count)
    const pendingEntregas = await db.getAllAsync(
      `SELECT * FROM entregas_agua 
       WHERE (sincronizado = 0 OR sync_status != 'SYNCED') 
       ORDER BY id ASC
       LIMIT 60`
    ) as any[];

    // Consultar controles de calidad pendientes
    let pendingCalidad: any[] = [];
    try {
      pendingCalidad = await db.getAllAsync(
        `SELECT * FROM control_calidad WHERE sincronizado = 0 ORDER BY id ASC LIMIT 20`
      ) as any[];
    } catch (_) {}

    if (pendingEntregas.length === 0 && pendingCalidad.length === 0) {
      // Reconciliar con la nube para verificar si se eliminó alguna entrega desde la Web
      let recDeleted = 0;
      try {
        const rec = await reconcileServerEntregas();
        recDeleted = rec.deletedCount;
      } catch (_) {}

      if (recDeleted > 0) {
        return {
          success: true,
          syncedCount: 0,
          message: `Sincronización completada: Se actualizaron y purgaron ${recDeleted} entrega(s) eliminadas desde la Web.`,
        };
      }

      return { success: true, syncedCount: 0, message: 'Todo está al día. La información del celular coincide con la nube.' };
    }

    let successCount = 0;
    let syncedCalidadCount = 0;

    // 1. Sincronizar controles de calidad pendientes (Offline -> Online)
    for (const cal of pendingCalidad) {
      try {
        const resCal = await fetchWithTimeout(`${BACKEND_URL}/calidad/calidad`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            local_id: `cal-movil-${cal.id}-${cal.fecha_hora || ''}`,
            programacion_id: cal.programacion_id || 1,
            cisterna_id: cal.cisterna_id || 1,
            conductor_nombre: 'Operador Móvil',
            cloro_residual_ppm: cal.cloro_residual_ppm,
            turbiedad_ntu: cal.turbiedad_ntu,
            aspecto_organoleptico: cal.aspecto_organoleptico || 'Límpido / Incoloro',
            etapa_control: cal.etapa_control || 'CARGA',
            punto_muestreo: cal.punto_muestreo || 'Control en Campo',
            sector: cal.sector || 'Moyobamba',
            observaciones: cal.observaciones || null,
            latitud: cal.latitud || null,
            longitud: cal.longitud || null,
            registrado_por: 'Operador Móvil (Sync Offline)',
          }),
        }, 10000);

        if (resCal.ok) {
          await db.runAsync(`UPDATE control_calidad SET sincronizado = 1 WHERE id = ?`, [cal.id]);
          syncedCalidadCount++;
        }
      } catch (calErr) {
        console.warn(`Error sincronizando control_calidad #${cal.id}:`, calErr);
      }
    }

    // 2. Sincronizar entregas en lotes concurrentes de 2 para máxima velocidad sin saturar el ancho de banda móvil
    const syncSingleEntrega = async (entrega: any): Promise<boolean> => {
      try {
        await db.runAsync(
          `UPDATE entregas_agua SET sync_status = 'SYNCING' WHERE id = ?`,
          [entrega.id]
        );

        const formData = new FormData();
        formData.append('localId', entrega.local_id || `loc-${entrega.id}-${Date.now()}`);
        formData.append('beneficiarioId', String(entrega.beneficiario_id));
        formData.append('programacionId', String(entrega.programacion_id || 1));
        if (entrega.cisterna_id) formData.append('cisternaId', String(entrega.cisterna_id));
        if (entrega.conductor_id) formData.append('conductorId', String(entrega.conductor_id));
        formData.append('litrosEntregados', String(entrega.litros_entregados));
        if (entrega.cuota_programada !== undefined && entrega.cuota_programada !== null) {
          formData.append('cuotaProgramada', String(entrega.cuota_programada));
        }
        if (entrega.saldo_pendiente !== undefined && entrega.saldo_pendiente !== null) {
          formData.append('saldoPendiente', String(entrega.saldo_pendiente));
        }
        if (entrega.estado_entrega) {
          formData.append('estadoEntrega', String(entrega.estado_entrega));
        }
        if (entrega.observaciones_entrega) {
          formData.append('observacionesEntrega', String(entrega.observaciones_entrega));
        }
        formData.append('firmaBase64', entrega.firma_base64 || '');
        if (entrega.latitud) formData.append('latitud', String(entrega.latitud));
        if (entrega.longitud) formData.append('longitud', String(entrega.longitud));
        if (entrega.precision_gps) formData.append('precisionGps', String(entrega.precision_gps));
        if (entrega.altitud) formData.append('altitud', String(entrega.altitud));
        if (entrega.dia_entrega) {
          formData.append('diaEntrega', String(entrega.dia_entrega));
        }
        if (entrega.fecha_asignada) {
          formData.append('fechaAsignada', String(entrega.fecha_asignada));
        }
        formData.append('fechaCaptura', String(entrega.fecha_captura || entrega.fecha_hora || new Date().toISOString()));

        // Empaquetado ultra-seguro de fotografía (Multipart + Fallback Base64 / Sin foto si falla red)
        let hasPhotoAttached = false;
        if (entrega.foto_local_uri) {
          let fileExists = true;
          if (Platform.OS !== 'web') {
            try {
              const info = await FileSystem.getInfoAsync(entrega.foto_local_uri);
              fileExists = info.exists;
            } catch {
              fileExists = false;
            }
          }

          if (fileExists) {
            const isPng = String(entrega.foto_local_uri).endsWith('.png');
            const isJpg = String(entrega.foto_local_uri).endsWith('.jpg') || String(entrega.foto_local_uri).endsWith('.jpeg');
            const ext = isPng ? 'png' : isJpg ? 'jpg' : 'webp';
            const filename = `evidencia_${entrega.id || Date.now()}.${ext}`;
            const mimeType = isPng ? 'image/png' : isJpg ? 'image/jpeg' : 'image/webp';

            if (Platform.OS === 'web') {
              try {
                const res = await fetch(entrega.foto_local_uri);
                const blob = await res.blob();
                (formData as any).append('foto', blob, filename);
                hasPhotoAttached = true;
              } catch (_) {}
            } else {
              // En React Native nativo, pasar el objeto con uri para que OkHttp lo transmita directamente por stream
              formData.append('foto', {
                uri: entrega.foto_local_uri,
                name: filename,
                type: mimeType,
              } as any);
              hasPhotoAttached = true;
            }
          }
        }

        let response = await fetchWithTimeout(`${BACKEND_URL}/sync/upload-delivery`, {
          method: 'POST',
          body: formData,
          headers: {
            'Accept': 'application/json',
          },
        }, 28000).catch(() => null);

        // FALLBACK DE SEGURIDAD: Si falló con foto adjunta (ej. URI caché borrada por Android o red 3G muy lenta),
        // reintentar enviando la foto en Base64 o garantizando que los datos de la entrega suban sí o sí.
        if ((!response || !response.ok) && hasPhotoAttached) {
          const fallbackForm = new FormData();
          fallbackForm.append('localId', entrega.local_id || `loc-${entrega.id}-${Date.now()}`);
          fallbackForm.append('beneficiarioId', String(entrega.beneficiario_id));
          fallbackForm.append('programacionId', String(entrega.programacion_id || 1));
          if (entrega.cisterna_id) fallbackForm.append('cisternaId', String(entrega.cisterna_id));
          if (entrega.conductor_id) fallbackForm.append('conductorId', String(entrega.conductor_id));
          fallbackForm.append('litrosEntregados', String(entrega.litros_entregados));
          if (entrega.cuota_programada !== undefined && entrega.cuota_programada !== null) {
            fallbackForm.append('cuotaProgramada', String(entrega.cuota_programada));
          }
          if (entrega.saldo_pendiente !== undefined && entrega.saldo_pendiente !== null) {
            fallbackForm.append('saldoPendiente', String(entrega.saldo_pendiente));
          }
          if (entrega.estado_entrega) fallbackForm.append('estadoEntrega', String(entrega.estado_entrega));
          if (entrega.observaciones_entrega) fallbackForm.append('observacionesEntrega', String(entrega.observaciones_entrega));
          fallbackForm.append('firmaBase64', entrega.firma_base64 || '');
          if (entrega.latitud) fallbackForm.append('latitud', String(entrega.latitud));
          if (entrega.longitud) fallbackForm.append('longitud', String(entrega.longitud));
          if (entrega.precision_gps) fallbackForm.append('precisionGps', String(entrega.precision_gps));
          if (entrega.altitud) fallbackForm.append('altitud', String(entrega.altitud));
          if (entrega.dia_entrega) fallbackForm.append('diaEntrega', String(entrega.dia_entrega));
          if (entrega.fecha_asignada) fallbackForm.append('fechaAsignada', String(entrega.fecha_asignada));
          fallbackForm.append('fechaCaptura', String(entrega.fecha_captura || entrega.fecha_hora || new Date().toISOString()));

          if (Platform.OS !== 'web' && entrega.foto_local_uri) {
            try {
              const b64 = await FileSystem.readAsStringAsync(entrega.foto_local_uri, {
                encoding: FileSystem.EncodingType.Base64,
              });
              if (b64) fallbackForm.append('fotoBase64', b64);
            } catch (_) {
              // El archivo temporal ya no existe en el teléfono; se sube el registro de agua sin foto para no perder la entrega
            }
          }

          response = await fetchWithTimeout(`${BACKEND_URL}/sync/upload-delivery`, {
            method: 'POST',
            body: fallbackForm,
            headers: { 'Accept': 'application/json' },
          }, 25000).catch(() => null);
        }

        if (response && response.ok) {
          await db.runAsync(
            `UPDATE entregas_agua SET sincronizado = 1, sync_status = 'SYNCED', retry_count = 0 WHERE id = ?`,
            [entrega.id]
          );
          return true;
        } else {
          const currentRetries = (entrega.retry_count || 0) + 1;
          await db.runAsync(
            `UPDATE entregas_agua SET sync_status = 'PENDING', retry_count = ? WHERE id = ?`,
            [currentRetries, entrega.id]
          );
          return false;
        }
      } catch (itemErr: any) {
        console.warn(`Error uploading entrega #${entrega.id}:`, itemErr?.message || itemErr);
        const currentRetries = (entrega.retry_count || 0) + 1;
        await db.runAsync(
          `UPDATE entregas_agua SET sync_status = 'PENDING', retry_count = ? WHERE id = ?`,
          [currentRetries, entrega.id]
        );
        return false;
      }
    };

    // Procesar en chunks de 2 en paralelo
    const CHUNK_SIZE = 2;
    for (let i = 0; i < pendingEntregas.length; i += CHUNK_SIZE) {
      const chunk = pendingEntregas.slice(i, i + CHUNK_SIZE);
      const results = await Promise.allSettled(chunk.map((e) => syncSingleEntrega(e)));
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          successCount++;
        }
      }
    }

    // 3. Limpieza de fotos antiguas ya sincronizadas (>3 días) para liberar espacio en el almacenamiento del celular
    if (Platform.OS !== 'web') {
      try {
        const oldSyncedWithPhotos = await db.getAllAsync(
          `SELECT id, foto_local_uri FROM entregas_agua
           WHERE sincronizado = 1 AND sync_status = 'SYNCED'
             AND foto_local_uri IS NOT NULL AND foto_local_uri != ''
             AND datetime(COALESCE(fecha_captura, fecha_hora)) < datetime('now', '-3 days')
           LIMIT 40`
        ) as any[];

        for (const item of oldSyncedWithPhotos) {
          if (item.foto_local_uri && !String(item.foto_local_uri).startsWith('http')) {
            await FileSystem.deleteAsync(item.foto_local_uri, { idempotent: true }).catch(() => {});
          }
          await db.runAsync(`UPDATE entregas_agua SET foto_local_uri = NULL WHERE id = ?`, [item.id]).catch(() => {});
        }
      } catch (_) {}
    }

    // 4. Reconciliación con la nube: purgar de SQLite registros que fueron eliminados en la plataforma web
    let purgedCount = 0;
    try {
      const rec = await reconcileServerEntregas();
      purgedCount = rec.deletedCount;
    } catch (_) {}

    const totalSynced = successCount + syncedCalidadCount;
    const msg =
      purgedCount > 0
        ? `Sincronización completada: ${successCount} subidas y ${purgedCount} purgadas según cambios en la Web.`
        : `Sincronización completada: ${successCount} entrega(s) y ${syncedCalidadCount} control(es) subidos a la nube.`;

    return {
      success: totalSynced > 0 || purgedCount > 0,
      syncedCount: totalSynced,
      message: msg,
    };
  } catch (error: any) {
    console.error('Error general de sincronización:', error);
    return { success: false, syncedCount: 0, message: `Aviso de sincronización: ${error.message || 'Error de conexión'}` };
  } finally {
    isSyncInProgress = false;
  }
};
