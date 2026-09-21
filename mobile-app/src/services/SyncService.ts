import NetInfo from '@react-native-community/netinfo';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { getDatabase } from '../database/schema';

import { BACKEND_URL } from '../config/api';

export const syncData = async (): Promise<{ success: boolean; syncedCount: number; message: string }> => {
  try {
    const netInfo = await NetInfo.fetch();
    
    if (!netInfo.isConnected) {
      return { success: false, syncedCount: 0, message: 'Sin conexión a internet. Los datos se guardan de forma segura en tu celular.' };
    }

    const db = await getDatabase();
    
    // Fetch deliveries pending synchronization
    const pendingEntregas = await db.getAllAsync(
      `SELECT * FROM entregas_agua WHERE sincronizado = 0 OR sync_status != 'SYNCED'`
    ) as any[];

    if (pendingEntregas.length === 0) {
      return { success: true, syncedCount: 0, message: 'Todo está sincronizado con la nube.' };
    }

    let successCount = 0;

    for (const entrega of pendingEntregas) {
      try {
        // Mark as SYNCING
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
        if (entrega.fecha_ubicacion) formData.append('fechaUbicacion', String(entrega.fecha_ubicacion));
        formData.append('fechaCaptura', String(entrega.fecha_captura || entrega.fecha_hora || new Date().toISOString()));

        // Attach Photo file (Compatible con Web y Expo Nativo moderno)
        if (entrega.foto_local_uri) {
          const filename = `evidencia_${entrega.id || Date.now()}.jpg`;

          // 1. Intentar adjuntar como Blob/File estándar para evitar 'Unsupported FormDataPart implementation'
          try {
            const res = await fetch(entrega.foto_local_uri);
            const blob = await res.blob();
            if (typeof File !== 'undefined') {
              const file = new File([blob], filename, { type: 'image/jpeg' });
              formData.append('foto', file);
            } else {
              (formData as any).append('foto', blob, filename);
            }
          } catch (blobErr) {
            console.warn('No se pudo empaquetar foto como Blob/File:', blobErr);
          }

          // 2. Si es nativo, enviar además fotoBase64 como respaldo
          if (Platform.OS !== 'web') {
            try {
              if (entrega.foto_local_uri.startsWith('data:image')) {
                formData.append('fotoBase64', entrega.foto_local_uri);
              } else {
                const base64 = await FileSystem.readAsStringAsync(entrega.foto_local_uri, {
                  encoding: FileSystem.EncodingType.Base64,
                });
                if (base64) {
                  formData.append('fotoBase64', base64);
                }
              }
            } catch (fsErr) {
              console.warn('No se pudo leer foto como base64:', fsErr);
            }
          }
        }

        const response = await fetch(`${BACKEND_URL}/sync/upload-delivery`, {
          method: 'POST',
          body: formData,
          headers: {
            'Accept': 'application/json',
          },
        });

        if (response.ok) {
          await db.runAsync(
            `UPDATE entregas_agua SET sincronizado = 1, sync_status = 'SYNCED' WHERE id = ?`,
            [entrega.id]
          );
          successCount++;
        } else {
          const errText = await response.text();
          console.warn(`Sync failed for entrega #${entrega.id}:`, errText);
          const currentRetries = (entrega.retry_count || 0) + 1;
          await db.runAsync(
            `UPDATE entregas_agua SET sync_status = ?, retry_count = ? WHERE id = ?`,
            [currentRetries >= 3 ? 'FAILED' : 'PENDING', currentRetries, entrega.id]
          );
        }
      } catch (itemErr: any) {
        console.error(`Error uploading entrega #${entrega.id}:`, itemErr);
        const currentRetries = (entrega.retry_count || 0) + 1;
        await db.runAsync(
          `UPDATE entregas_agua SET sync_status = ?, retry_count = ? WHERE id = ?`,
          [currentRetries >= 3 ? 'FAILED' : 'PENDING', currentRetries, entrega.id]
        );
      }
    }

    return {
      success: successCount > 0,
      syncedCount: successCount,
      message: `Sincronización finalizada: ${successCount} de ${pendingEntregas.length} entregas enviadas con éxito.`,
    };
  } catch (error: any) {
    console.error('Error general de sincronización:', error);
    return { success: false, syncedCount: 0, message: `Error de sincronización: ${error.message}` };
  }
};
