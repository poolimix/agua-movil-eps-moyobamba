import { useState, useEffect, useRef } from 'react';
import Layout from '../components/Layout';
import Pagination from '../components/Pagination';
import api, { API_BASE_URL } from '../config/api';
import { dialogConfirm, dialogAlert } from '../context/DialogContext';
import { imprimirValeSectorUnico } from '../utils/printVouchers';
import './Modules.css';

interface Entrega {
  id: number;
  local_id?: string;
  lote_deposito_id?: string | null;
  beneficiario_id: number;
  programacion_id: number;
  nombres_apellidos: string;
  dni: string;
  direccion: string;
  sector: string;
  zona: string;
  cisterna_placa?: string;
  cuota_programada?: number | string | null;
  litros_entregados: number | string;
  saldo_pendiente?: number | string | null;
  estado_entrega?: string | null;
  observaciones_entrega?: string | null;
  firma_base64: string;
  foto_url?: string | null;
  latitud: number | string | null;
  longitud: number | string | null;
  precision_gps?: number | string | null;
  altitud?: number | string | null;
  fecha_captura?: string;
  fecha_hora: string;
}

export default function EntregasPage() {
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSignature, setSelectedSignature] = useState<string | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<{ url: string | null; entrega: Entrega; cacheBust?: number } | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [estamparMembrete, setEstamparMembrete] = useState(true);
  const [targetEntregaForUpload, setTargetEntregaForUpload] = useState<Entrega | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Estado para Entrega en Depósito Único por Sector
  const [depositoModalOpen, setDepositoModalOpen] = useState(false);
  const [beneficiariosList, setBeneficiariosList] = useState<any[]>([]);
  const [programacionesList, setProgramacionesList] = useState<any[]>([]);
  const [sectorDeposito, setSectorDeposito] = useState('');
  const [programacionIdDeposito, setProgramacionIdDeposito] = useState<string>('');
  const [litrosTotalesDeposito, setLitrosTotalesDeposito] = useState('19000');
  const [fechaDeposito, setFechaDeposito] = useState(() => new Date().toISOString().slice(0, 10));
  const [observacionesDeposito, setObservacionesDeposito] = useState('');
  const [selectedBenefIdsDeposito, setSelectedBenefIdsDeposito] = useState<number[]>([]);
  const [searchBenefDeposito, setSearchBenefDeposito] = useState('');
  const [fotoDepositoFile, setFotoDepositoFile] = useState<File | null>(null);
  const [savingDeposito, setSavingDeposito] = useState(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  useEffect(() => {
    fetchEntregas();
  }, []);

  const fetchEntregas = async () => {
    try {
      setLoading(true);
      const res = await api.get('/entregas');
      const rawRows: any[] = Array.isArray(res.data) ? res.data : res.data?.data || [];

      // Limpiar silenciosamente cualquier registro huérfano sin beneficiario generado por pruebas
      const orphans = rawRows.filter(
        (r) => !r.beneficiario_id && String(r.local_id || '').startsWith('gen-')
      );
      if (orphans.length > 0) {
        for (const o of orphans) {
          api.delete(`/entregas/${o.id}`).catch(() => {});
        }
      }

      const validRows = rawRows
        .filter((r) => !(!r.beneficiario_id && String(r.local_id || '').startsWith('gen-')))
        .map((r) => {
          // Inferir lote_deposito_id desde local_id (ej. dep-sec-<benId>-<batchStamp>-<i>) si la columna aún no venía poblada
          let inferredLote = r.lote_deposito_id;
          if (!inferredLote && typeof r.local_id === 'string' && r.local_id.startsWith('dep-sec-')) {
            const parts = r.local_id.split('-');
            if (parts.length >= 4) {
              inferredLote = `LOTE-${parts[3]}`;
            }
          }
          return {
            ...r,
            lote_deposito_id: inferredLote || null,
          };
        });

      setEntregas(validRows);
    } catch (error) {
      console.error('Error fetching entregas:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEntrega = async (id: number) => {
    const ok = await dialogConfirm({
      title: '¿Eliminar entrega?',
      message: '¿Estás seguro de eliminar este registro de entrega? Esta acción no se puede deshacer.',
      type: 'danger',
      confirmText: 'Sí, eliminar',
      cancelText: 'Cancelar',
    });
    if (!ok) return;

    try {
      await api.delete(`/entregas/${id}`);
      fetchEntregas();
    } catch (error: any) {
      await dialogAlert({
        title: 'Error al eliminar',
        message: 'No se pudo eliminar el registro de entrega.',
        type: 'danger',
      });
    }
  };

  const triggerPhotoSelector = (entrega: Entrega) => {
    setTargetEntregaForUpload(entrega);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handlePhotoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const entregaTarget = targetEntregaForUpload || selectedPhoto?.entrega;
    if (!file || !entregaTarget) return;

    try {
      setUploadingPhoto(true);
      const formData = new FormData();
      formData.append('foto', file);
      formData.append('localId', entregaTarget.local_id || `web-${entregaTarget.id}`);
      formData.append('estampar_membrete', String(estamparMembrete));

      let newFotoUrl = '';
      let updatedEntregaId = entregaTarget.id;

      try {
        const res = await api.post(`/entregas/${entregaTarget.id}/foto`, formData);
        newFotoUrl = res.data.foto_url;
      } catch (primaryErr: any) {
        if (primaryErr.response?.status === 404) {
          // Fallback automático vía /sync/upload-delivery si el backend remoto aún no recargó /:id/foto
          const fallbackFd = new FormData();
          fallbackFd.append('foto', file);
          fallbackFd.append('localId', `web-foto-${entregaTarget.id}-${Date.now()}`);
          if ((entregaTarget as any).beneficiario_id) {
            fallbackFd.append('beneficiarioId', String((entregaTarget as any).beneficiario_id));
          }
          if ((entregaTarget as any).programacion_id) {
            fallbackFd.append('programacionId', String((entregaTarget as any).programacion_id));
          }
          if ((entregaTarget as any).cisterna_id) {
            fallbackFd.append('cisternaId', String((entregaTarget as any).cisterna_id));
          }
          fallbackFd.append('litrosEntregados', String(entregaTarget.litros_entregados || 0));
          fallbackFd.append('cuotaProgramada', String(entregaTarget.cuota_programada || entregaTarget.litros_entregados || 0));
          fallbackFd.append('saldoPendiente', String(entregaTarget.saldo_pendiente || 0));
          fallbackFd.append('estadoEntrega', String(entregaTarget.estado_entrega || 'COMPLETA'));
          if (entregaTarget.observaciones_entrega) {
            fallbackFd.append('observacionesEntrega', entregaTarget.observaciones_entrega);
          }
          if (entregaTarget.firma_base64) {
            fallbackFd.append('firmaBase64', entregaTarget.firma_base64);
          }
          if (entregaTarget.latitud) fallbackFd.append('latitud', String(entregaTarget.latitud));
          if (entregaTarget.longitud) fallbackFd.append('longitud', String(entregaTarget.longitud));
          if (entregaTarget.precision_gps) fallbackFd.append('precisionGps', String(entregaTarget.precision_gps));
          if (entregaTarget.fecha_captura || entregaTarget.fecha_hora) {
            fallbackFd.append('fechaCaptura', entregaTarget.fecha_captura || entregaTarget.fecha_hora);
          }

          const syncRes = await api.post('/sync/upload-delivery', fallbackFd);
          newFotoUrl = syncRes.data?.entrega?.foto_url || '';
          if (syncRes.data?.entrega?.id) {
            updatedEntregaId = syncRes.data.entrega.id;
            await api.delete(`/entregas/${entregaTarget.id}`).catch(() => {});
          }
        } else {
          throw primaryErr;
        }
      }

      const nowBust = Date.now();
      await fetchEntregas();

      setSelectedPhoto({
        url: `${API_BASE_URL}${newFotoUrl}`,
        entrega: { ...entregaTarget, id: updatedEntregaId, foto_url: newFotoUrl },
        cacheBust: nowBust,
      });

      await dialogAlert({
        title: 'Fotografía actualizada',
        message: '✅ La fotografía de evidencia se guardó correctamente.',
        type: 'success',
      });
    } catch (error: any) {
      await dialogAlert({
        title: 'Error al subir fotografía',
        message: error.response?.data?.message || 'No se pudo subir la imagen seleccionada.',
        type: 'danger',
      });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const [selectedFecha, setSelectedFecha] = useState('');

  const getRangoSemanaIso = (fechaBaseStr: string) => {
    const base = fechaBaseStr ? new Date(`${fechaBaseStr.slice(0, 10)}T12:00:00`) : new Date();
    const day = base.getDay(); // 0 Dom, 1 Lun ... 6 Sab
    const diffToMonday = (day + 6) % 7;
    const monday = new Date(base);
    monday.setDate(base.getDate() - diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return {
      lunesIso: monday.toISOString().slice(0, 10),
      domingoIso: sunday.toISOString().slice(0, 10),
      etiquetaSemana: `${monday.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })} al ${sunday.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })}`,
    };
  };

  const calcularEstimadoSemanalParaIds = (
    benefsSource: any[],
    idsMarcados: number[],
    fechaBaseStr: string
  ) => {
    const { lunesIso, domingoIso } = getRangoSemanaIso(fechaBaseStr);
    const marcadosSet = new Set(idsMarcados.map(Number));
    let cuotaSemanalTotal = 0;
    let cuotaDiariaTotal = 0;
    let habitantesTotal = 0;

    for (const b of benefsSource) {
      if (marcadosSet.has(Number(b.id))) {
        const miembros = Number(b.num_miembros || 1);
        habitantesTotal += miembros;
        cuotaSemanalTotal += Number(b.dotacion_semanal_litros || b.litros_sugeridos || miembros * 350);
        cuotaDiariaTotal += Number(b.dotacion_diaria_litros || miembros * 50);
      }
    }

    let entregadoSemanaActual = 0;
    for (const e of entregas) {
      if (marcadosSet.has(Number(e.beneficiario_id))) {
        const fStr = (e.fecha_captura || e.fecha_hora || '').slice(0, 10);
        if (fStr >= lunesIso && fStr <= domingoIso) {
          entregadoSemanaActual += Number(e.litros_entregados || 0);
        }
      }
    }

    const restanteAntesDeHoy = Math.max(0, Math.round((cuotaSemanalTotal - entregadoSemanaActual) * 100) / 100);
    return {
      cuotaSemanalTotal,
      cuotaDiariaTotal,
      habitantesTotal,
      entregadoSemanaActual: Math.round(entregadoSemanaActual * 100) / 100,
      restanteAntesDeHoy,
    };
  };

  const handleOpenDepositoModal = async () => {
    try {
      const [benefRes, progRes] = await Promise.all([
        api.get('/beneficiarios?limit=5000'),
        api.get('/programaciones'),
      ]);
      const benefs = Array.isArray(benefRes.data) ? benefRes.data : benefRes.data?.data || [];
      const progs = Array.isArray(progRes.data) ? progRes.data : [];
      setBeneficiariosList(benefs);
      setProgramacionesList(progs);

      const sectoresUnicos = Array.from(
        new Set(benefs.map((b: any) => (b.sector || '').trim()).filter(Boolean))
      ) as string[];
      const initialSector = sectoresUnicos[0] || '';
      setSectorDeposito(initialSector);

      const idsSector = benefs
        .filter((b: any) => (b.sector || '').trim().toUpperCase() === initialSector.toUpperCase())
        .map((b: any) => Number(b.id));
      setSelectedBenefIdsDeposito(idsSector);

      const calc = calcularEstimadoSemanalParaIds(benefs, idsSector, fechaDeposito);
      const sugeridoInicial = calc.restanteAntesDeHoy > 0 ? calc.restanteAntesDeHoy : calc.cuotaSemanalTotal;
      setLitrosTotalesDeposito(String(sugeridoInicial || 19000));

      if (progs.length > 0 && !programacionIdDeposito) {
        setProgramacionIdDeposito(String(progs[0].id));
      }
      setSearchBenefDeposito('');
      setFotoDepositoFile(null);
      setDepositoModalOpen(true);
    } catch (err) {
      await dialogAlert({
        title: 'Error al cargar padrón',
        message: 'No se pudo cargar la lista de beneficiarios y sectores.',
        type: 'danger',
      });
    }
  };

  const handleChangeSectorDepositoWeb = (nuevoSector: string) => {
    setSectorDeposito(nuevoSector);
    const idsSector = beneficiariosList
      .filter((b: any) => (b.sector || '').trim().toUpperCase() === nuevoSector.toUpperCase())
      .map((b: any) => Number(b.id));
    setSelectedBenefIdsDeposito(idsSector);

    const calc = calcularEstimadoSemanalParaIds(beneficiariosList, idsSector, fechaDeposito);
    const sugerido = calc.restanteAntesDeHoy > 0 ? calc.restanteAntesDeHoy : calc.cuotaSemanalTotal;
    if (sugerido > 0) {
      setLitrosTotalesDeposito(String(sugerido));
    }
  };

  const handleToggleBenefDepositoWeb = (id: number) => {
    setSelectedBenefIdsDeposito((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSubmitDepositoSector = async (e: React.FormEvent) => {
    e.preventDefault();
    const litrosNum = Number(litrosTotalesDeposito);
    if (!sectorDeposito) {
      await dialogAlert({ title: 'Sector requerido', message: 'Selecciona el sector de entrega.', type: 'warning' });
      return;
    }
    if (!litrosNum || litrosNum <= 0) {
      await dialogAlert({ title: 'Volumen inválido', message: 'Ingresa la cantidad total de litros entregados en el depósito.', type: 'warning' });
      return;
    }
    if (selectedBenefIdsDeposito.length === 0) {
      await dialogAlert({ title: 'Sin beneficiarios', message: 'Debes mantener al menos un beneficiario marcado.', type: 'warning' });
      return;
    }

    const totalSector = beneficiariosList.filter(
      (b: any) => (b.sector || '').trim().toUpperCase() === sectorDeposito.toUpperCase()
    ).length;
    const excluidos = totalSector - selectedBenefIdsDeposito.length;
    const litrosPorBenef = Math.round((litrosNum / selectedBenefIdsDeposito.length) * 100) / 100;
    const calcSem = calcularEstimadoSemanalParaIds(beneficiariosList, selectedBenefIdsDeposito, fechaDeposito);
    const restanteSemDespues = Math.max(0, Math.round((calcSem.restanteAntesDeHoy - litrosNum) * 100) / 100);

    // Validación anti-duplicado local para mismo sector y misma fecha
    const entregasMismoDiaSector = entregas.filter((item) => {
      const fStr = (item.fecha_captura || item.fecha_hora || '').slice(0, 10);
      const secMatch = (item.sector || '').trim().toUpperCase() === sectorDeposito.trim().toUpperCase();
      const isDep =
        Boolean(item.lote_deposito_id) ||
        String(item.local_id || '').startsWith('dep-') ||
        String(item.observaciones_entrega || '').toLowerCase().includes('depósito único');
      return fStr === fechaDeposito && secMatch && isDep;
    });

    if (entregasMismoDiaSector.length > 0) {
      const sumPrevDia = entregasMismoDiaSector.reduce((acc, it) => acc + Number(it.litros_entregados || 0), 0);
      const confirmDupLocal = await dialogConfirm({
        title: '⚠️ Entrega ya registrada en esta fecha para este sector',
        message: `Ya existe una entrega en depósito único registrada para el sector "${sectorDeposito}" en la fecha ${fechaDeposito} (${Math.round(sumPrevDia).toLocaleString('es-PE')} Lts entre ${entregasMismoDiaSector.length} beneficiarios).\n\n¿Se trata de un 2.º viaje de cisterna en el mismo día o deseas cancelar para evitar duplicados?`,
        type: 'warning',
        confirmText: 'Sí, es un 2.º viaje (Registrar)',
        cancelText: 'No, cancelar para no duplicar',
      });
      if (!confirmDupLocal) return;
    } else {
      const ok = await dialogConfirm({
        title: '¿Confirmar Entrega en Depósito Único por Sector?',
        message: `Sector: ${sectorDeposito}\nEstimado Semanal del Sector: ${calcSem.cuotaSemanalTotal.toLocaleString('es-PE')} Lts (${calcSem.habitantesTotal} hab. × 350 L/sem)\nEntregado previo en la semana: ${calcSem.entregadoSemanaActual.toLocaleString('es-PE')} Lts\nEntrega del Día (Depósito): ${litrosNum.toLocaleString('es-PE')} Lts (${(litrosNum / 1000).toFixed(2)} m³)\nRestante por Entregar en la Semana: ${restanteSemDespues.toLocaleString('es-PE')} Lts\nBeneficiarios marcados: ${selectedBenefIdsDeposito.length} de ${totalSector}${excluidos > 0 ? ` (${excluidos} desmarcados para otro depósito)` : ''}\nDivisión del día: ${litrosPorBenef} Lts por beneficiario.`,
        type: 'info',
        confirmText: 'Sí, Registrar Entrega del Día',
        cancelText: 'Cancelar',
      });
      if (!ok) return;
    }

    const registrarDepositoViaSyncFallback = async () => {
      const { lunesIso, domingoIso } = getRangoSemanaIso(fechaDeposito);
      const benefMap = new Map<number, any>();
      for (const b of beneficiariosList) {
        benefMap.set(Number(b.id), b);
      }
      const prevSemMap = new Map<number, number>();
      for (const item of entregas) {
        const fStr = (item.fecha_captura || item.fecha_hora || '').slice(0, 10);
        if (fStr >= lunesIso && fStr <= domingoIso) {
          const bId = Number((item as any).beneficiario_id);
          prevSemMap.set(bId, (prevSemMap.get(bId) || 0) + Number(item.litros_entregados || 0));
        }
      }

      const batchStamp = Date.now();
      const totalBenefs = selectedBenefIdsDeposito.length;
      let acumulado = 0;
      const fechaCapturaIso = `${fechaDeposito}T${new Date().toTimeString().slice(0, 8)}`;

      // Construir payloads individuales divididos exactamente
      const payloads = selectedBenefIdsDeposito.map((benId, idx) => {
        const litrosIndividual =
          idx === totalBenefs - 1
            ? Number((litrosNum - acumulado).toFixed(2))
            : litrosPorBenef;
        acumulado += litrosIndividual;

        const bObj = benefMap.get(Number(benId));
        const miembros = Number(bObj?.num_miembros || 1);
        const cuotaSemanalBenef = Number(bObj?.dotacion_semanal_litros || bObj?.litros_sugeridos || miembros * 350);
        const entregadoPrev = prevSemMap.get(Number(benId)) || 0;
        const saldoSemanalRestante = Math.max(
          0,
          Number((cuotaSemanalBenef - (entregadoPrev + litrosIndividual)).toFixed(2))
        );
        const estadoSemanal = saldoSemanalRestante > 0 ? 'PARCIAL' : 'COMPLETA';
        const localId = `dep-sec-${benId}-${batchStamp}-${idx}`;
        const obsTexto =
          observacionesDeposito ||
          `Depósito Único (${sectorDeposito}): +${litrosIndividual} L hoy (${litrosNum} L ÷ ${totalBenefs} benef.) • Meta Sem: ${cuotaSemanalBenef} L • Restante Sem: ${saldoSemanalRestante} L`;

        return {
          benId,
          litrosIndividual,
          cuotaSemanalBenef,
          saldoSemanalRestante,
          estadoSemanal,
          localId,
          obsTexto,
        };
      });

      // Enviar en lotes paralelos de 6 a /sync/upload-delivery para máxima velocidad y compatibilidad total
      const CHUNK_SIZE = 6;
      for (let i = 0; i < payloads.length; i += CHUNK_SIZE) {
        const chunk = payloads.slice(i, i + CHUNK_SIZE);
        await Promise.all(
          chunk.map((p) => {
            const fd = new FormData();
            fd.append('localId', p.localId);
            fd.append('beneficiarioId', String(p.benId));
            if (programacionIdDeposito) fd.append('programacionId', String(programacionIdDeposito));
            fd.append('litrosEntregados', String(p.litrosIndividual));
            fd.append('cuotaProgramada', String(p.cuotaSemanalBenef));
            fd.append('saldoPendiente', String(p.saldoSemanalRestante));
            fd.append('estadoEntrega', p.estadoSemanal);
            fd.append('observacionesEntrega', p.obsTexto);
            fd.append('fechaCaptura', fechaCapturaIso);
            fd.append('fechaAsignada', fechaDeposito);
            if (fotoDepositoFile) {
              fd.append('foto', fotoDepositoFile);
            }
            return api.post('/sync/upload-delivery', fd);
          })
        );
      }

      return {
        data: {
          message: `✅ Se registró la entrega en depósito único para ${totalBenefs} beneficiarios del sector ${sectorDeposito}: ${litrosNum.toLocaleString('es-PE')} L hoy (${litrosPorBenef.toLocaleString('es-PE')} L c/u).\n\nEstimado semanal del sector: ${calcSem.cuotaSemanalTotal.toLocaleString('es-PE')} L • Restante por entregar en la semana: ${restanteSemDespues.toLocaleString('es-PE')} L.`,
        },
      };
    };

    try {
      setSavingDeposito(true);
      const buildFormData = (forceSecondTrip = false) => {
        const fd = new FormData();
        fd.append('sector', sectorDeposito);
        if (programacionIdDeposito) fd.append('programacion_id', programacionIdDeposito);
        fd.append('litros_totales_deposito', String(litrosNum));
        fd.append('beneficiario_ids', JSON.stringify(selectedBenefIdsDeposito));
        fd.append('fecha_entrega', fechaDeposito);
        fd.append(
          'observaciones',
          observacionesDeposito ||
            `ENTREGA COMPLETA EN DEPÓSITO ÚNICO (${sectorDeposito}): ${litrosNum} Lts ÷ ${selectedBenefIdsDeposito.length} benef. = ${litrosPorBenef} Lts/benef.`
        );
        if (forceSecondTrip) {
          fd.append('forzar_segundo_viaje', 'true');
        }
        if (fotoDepositoFile) {
          fd.append('foto', fotoDepositoFile);
        }
        return fd;
      };

      let res;
      try {
        res = await api.post('/entregas/entrega-grupal-sector', buildFormData(entregasMismoDiaSector.length > 0));
      } catch (firstErr: any) {
        if (firstErr.response?.status === 409 && firstErr.response?.data?.code === 'DUPLICATE_SECTOR_DAY') {
          const confirmDup = await dialogConfirm({
            title: '⚠️ Entrega ya registrada hoy en este sector',
            message:
              firstErr.response.data.message ||
              'Ya existe una entrega de depósito único para este sector en la fecha seleccionada. ¿Se trata de un segundo viaje de cisterna en el mismo día?',
            type: 'warning',
            confirmText: 'Sí, es un 2.º viaje (Registrar)',
            cancelText: 'No, cancelar para no duplicar',
          });
          if (!confirmDup) {
            setSavingDeposito(false);
            return;
          }
          res = await api.post('/entregas/entrega-grupal-sector', buildFormData(true));
        } else if (
          firstErr.response?.status === 404 ||
          firstErr.response?.status === 500 ||
          !firstErr.response?.data?.message
        ) {
          // Fallback automático vía /sync/upload-delivery para funcionar inmediatamente en producción
          res = await registrarDepositoViaSyncFallback();
        } else {
          throw firstErr;
        }
      }

      setDepositoModalOpen(false);
      await fetchEntregas();
      await dialogAlert({
        title: 'Entrega en Depósito Único Registrada',
        message: res.data?.message || `Se registró la entrega completa para ${selectedBenefIdsDeposito.length} beneficiarios (${litrosPorBenef} Lts c/u).`,
        type: 'success',
      });
    } catch (error: any) {
      await dialogAlert({
        title: 'Error al registrar entrega grupal',
        message: error.response?.data?.message || error.message || 'No se pudo completar el registro.',
        type: 'danger',
      });
    } finally {
      setSavingDeposito(false);
    }
  };

  const handleDeleteLoteDeposito = async (loteId: string, sectorName: string) => {
    const ok = await dialogConfirm({
      title: '¿Eliminar lote completo de Depósito Único?',
      message: `Se eliminarán simultáneamente TODAS las entregas individuales generadas por el lote "${loteId}" del sector ${sectorName}. Esta acción es ideal si hubo un error al registrar el depósito.`,
      type: 'danger',
      confirmText: 'Sí, eliminar todo el lote',
      cancelText: 'Cancelar',
    });
    if (!ok) return;

    try {
      let deletedMsg = 'Se eliminaron todos los registros del lote correctamente.';
      try {
        const res = await api.delete(`/entregas/lote/${encodeURIComponent(loteId)}`);
        if (res.data?.message) deletedMsg = res.data.message;
      } catch (delErr: any) {
        if (delErr.response?.status === 404) {
          const itemsDelLote = entregas.filter((item) => item.lote_deposito_id === loteId);
          await Promise.all(itemsDelLote.map((item) => api.delete(`/entregas/${item.id}`).catch(() => {})));
          deletedMsg = `Se eliminaron los ${itemsDelLote.length} registros del lote de depósito único correctamente.`;
        } else {
          throw delErr;
        }
      }
      await fetchEntregas();
      await dialogAlert({
        title: 'Lote eliminado',
        message: deletedMsg,
        type: 'success',
      });
    } catch (error: any) {
      await dialogAlert({
        title: 'Error al eliminar lote',
        message: error.response?.data?.message || 'No se pudo eliminar el lote.',
        type: 'danger',
      });
    }
  };

  const handleEditLoteDeposito = async (loteId: string, sectorName: string) => {
    const input = window.prompt(
      `Ingrese el nuevo volumen total (en Litros) entregado en el depósito único del sector ${sectorName} (Lote: ${loteId}):`,
      '19000'
    );
    if (!input) return;
    const nuevoTotal = parseFloat(input);
    if (isNaN(nuevoTotal) || nuevoTotal <= 0) {
      await dialogAlert({
        title: 'Valor inválido',
        message: 'Debe ingresar un número de litros mayor a 0.',
        type: 'warning',
      });
      return;
    }

    try {
      const res = await api.put(`/entregas/lote/${encodeURIComponent(loteId)}`, {
        litros_totales_deposito: nuevoTotal,
      });
      await fetchEntregas();
      await dialogAlert({
        title: 'Lote actualizado',
        message: res.data?.message || 'Se recalcularon los litros de todos los beneficiarios del lote.',
        type: 'success',
      });
    } catch (error: any) {
      await dialogAlert({
        title: 'Error al actualizar lote',
        message: error.response?.data?.message || 'No se pudo actualizar el lote.',
        type: 'danger',
      });
    }
  };

  const filtered = entregas.filter((e) => {
    const matchesSearch =
      !searchTerm ||
      e.nombres_apellidos?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.dni?.includes(searchTerm) ||
      e.sector?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.local_id?.toLowerCase().includes(searchTerm.toLowerCase());

    const deliveryDateStr = (e.fecha_captura || e.fecha_hora || '').slice(0, 10);
    const matchesFecha = !selectedFecha || deliveryDateStr === selectedFecha;

    return matchesSearch && matchesFecha;
  });

  const paginatedData = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const queryParams = new URLSearchParams();
  if (searchTerm) queryParams.append('search', searchTerm);
  if (selectedFecha) queryParams.append('fecha', selectedFecha);
  const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';

  return (
    <Layout>
      <div className="module-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #dbeafe', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
            <span>📋 FORMATO OFICIAL DE ENTREGA DE AGUA</span>
            <span>•</span>
            <span>EPS MOYOBAMBA S.A.</span>
          </div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>Planilla de Entregas y Evidencia en Campo</h1>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>
            Trazabilidad con firma digital, geolocalización satelital y formato oficial normativo de reparto en cisternas
          </p>
        </div>
        <div className="module-actions" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-primary"
            onClick={handleOpenDepositoModal}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: '#0d9488',
              borderColor: '#0d9488',
              fontWeight: 700,
            }}
          >
            🚰 Depósito por Sector
          </button>
          <button className="btn-secondary" onClick={fetchEntregas} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            🔄 Actualizar
          </button>
        </div>
      </div>

      <div className="filters-card" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, background: '#ffffff', padding: '14px 18px', borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 18 }}>
        <input
          type="text"
          placeholder="🔍 Buscar por Beneficiario, DNI, Sector o Local ID..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentPage(1);
          }}
          className="search-input"
          style={{ minWidth: 260, flex: '1 1 260px' }}
        />

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Fecha:</span>
          <input
            type="date"
            value={selectedFecha}
            onChange={(e) => {
              setSelectedFecha(e.target.value);
              setCurrentPage(1);
            }}
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              fontSize: 12,
              color: '#1e293b',
              fontWeight: 600,
              background: '#f8fafc'
            }}
          />
          {selectedFecha ? (
            <button
              type="button"
              onClick={() => setSelectedFecha('')}
              style={{
                background: '#fee2e2',
                border: '1px solid #fca5a5',
                color: '#b91c1c',
                borderRadius: 6,
                padding: '4px 8px',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer'
              }}
              title="Limpiar fecha"
            >
              ✕
            </button>
          ) : null}
        </div>

        <span className="badge-count" style={{ background: '#f1f5f9', color: '#334155', fontWeight: 700, padding: '6px 12px', borderRadius: 8, fontSize: 12 }}>
          Total: {filtered.length} entregas
        </span>

        {/* Botones Oficiales Formato PDF y Formato Excel */}
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
          <a
            href={`${API_BASE_URL}/api/v1/entregas/export-pdf${queryString}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-action-compact"
            style={{
              padding: '8px 14px',
              fontSize: 12.5,
              borderRadius: 8,
              fontWeight: 700,
              textDecoration: 'none',
              color: '#0369a1',
              background: '#f0f9ff',
              border: '1px solid #bae6fd',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
            }}
            title="Descargar FORMATO DE ENTREGA DE AGUA Oficial en PDF (Hoja membretada con firmas y cuadrícula reglamentaria)"
          >
            <span>📄</span> Formato Oficial PDF
          </a>

          <a
            href={`${API_BASE_URL}/api/v1/entregas/export-excel${queryString}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-action-compact"
            style={{
              padding: '8px 14px',
              fontSize: 12.5,
              borderRadius: 8,
              fontWeight: 700,
              textDecoration: 'none',
              color: '#15803d',
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
            }}
            title="Descargar FORMATO DE ENTREGA DE AGUA Oficial en Excel (Estructura idéntica al documento físico)"
          >
            <span>📊</span> Formato Oficial Excel
          </a>
        </div>
      </div>

      <div className="table-card">
        <table className="custom-table">
          <thead>
            <tr>
              <th>ID / Local ID</th>
              <th>Fecha y Hora</th>
              <th>Beneficiario</th>
              <th>Sector / Zona</th>
              <th>Volumen y Saldo</th>
              <th>Ubicación GPS Satelital</th>
              <th>Foto</th>
              <th>Firma Digital</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="empty-state">
                  <span>⏳</span> Cargando planilla de entregas...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="empty-state">
                  <span>💧</span> No hay entregas registradas en campo aún.
                </td>
              </tr>
            ) : (
              paginatedData.map((e) => {
                const saldo = Number(e.saldo_pendiente || 0);
                const esParcial = e.estado_entrega === 'PARCIAL' || saldo > 0;

                return (
                  <tr key={e.id}>
                    <td>
                      <strong>#{e.id}</strong>
                      {e.local_id ? (
                        <div style={{ fontSize: 10, color: '#64748b', fontFamily: 'monospace' }}>
                          {e.local_id.slice(0, 14)}...
                        </div>
                      ) : null}
                    </td>
                    <td>
                      {new Date(e.fecha_captura || e.fecha_hora).toLocaleDateString('es-PE')}
                      <div style={{ fontSize: 11, color: '#64748b' }}>
                        {new Date(e.fecha_captura || e.fecha_hora).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td>
                      <strong>{e.nombres_apellidos || 'Beneficiario'}</strong>
                      <div style={{ fontSize: 11, color: '#64748b' }}>DNI: {e.dni}</div>
                    </td>
                    <td>
                      <span className="badge-count" style={{ background: '#e0f2fe', color: '#0369a1' }}>
                        {e.sector || e.zona || 'Moyobamba'}
                      </span>
                    </td>
                    <td>
                      {esParcial ? (
                        <div>
                          <span className="badge-count" style={{ background: '#fef3c7', color: '#b45309', fontWeight: 800 }}>
                            🟡 {e.litros_entregados} Lts (Parcial)
                          </span>
                          <div style={{ fontSize: 11, color: '#b45309', fontWeight: 700, marginTop: 3 }}>
                            Quedan: {saldo} Lts pendientes
                          </div>
                          <div style={{ fontSize: 10, color: '#64748b' }}>
                            Cuota: {e.cuota_programada || e.litros_entregados} Lts
                          </div>
                        </div>
                      ) : (
                        <div>
                          <span className="badge-count" style={{ background: '#dcfce7', color: '#15803d', fontWeight: 800 }}>
                            🟢 {e.litros_entregados} Lts (100%)
                          </span>
                          <div style={{ fontSize: 10.5, color: '#16a34a', marginTop: 2 }}>
                            Completa • Sin saldo
                          </div>
                          {e.lote_deposito_id && (
                            <div
                              style={{
                                marginTop: 4,
                                display: 'inline-block',
                                background: '#ccfbf1',
                                color: '#0f766e',
                                border: '1px solid #99f6e4',
                                borderRadius: 6,
                                padding: '2px 6px',
                                fontSize: 10,
                                fontWeight: 800,
                              }}
                              title={`Lote de Depósito Único: ${e.lote_deposito_id}`}
                            >
                              🚰 Depósito Único
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td>
                      {e.latitud && e.longitud ? (
                        <div>
                          <a
                            href={`https://www.google.com/maps?q=${e.latitud},${e.longitud}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              color: '#0284c7',
                              fontWeight: 600,
                              fontSize: 12,
                              textDecoration: 'none',
                            }}
                          >
                            📍 {parseFloat(String(e.latitud)).toFixed(5)}, {parseFloat(String(e.longitud)).toFixed(5)}
                          </a>
                          {e.precision_gps ? (
                            <div style={{ fontSize: 10.5, color: '#16a34a', fontWeight: 600 }}>
                              Precisión: ±{Math.round(Number(e.precision_gps))}m
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <span style={{ color: '#94a3b8', fontSize: 12 }}>Sin coordenadas</span>
                      )}
                    </td>
                    <td>
                      {e.foto_url ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <img
                            src={`${API_BASE_URL}${e.foto_url}?t=${new Date(e.fecha_hora).getTime() || 1}`}
                            alt="Evidencia"
                            style={{
                              width: 44,
                              height: 44,
                              borderRadius: 8,
                              objectFit: 'cover',
                              border: '1px solid #cbd5e1',
                              cursor: 'pointer',
                            }}
                            onClick={() => setSelectedPhoto({ url: `${API_BASE_URL}${e.foto_url}`, entrega: e, cacheBust: Date.now() })}
                            title="Clic para ampliar o cambiar foto"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPhoto({ url: `${API_BASE_URL}${e.foto_url}`, entrega: e, cacheBust: Date.now() });
                              triggerPhotoSelector(e);
                            }}
                            style={{
                              background: '#eff6ff',
                              border: '1px solid #bfdbfe',
                              color: '#1d4ed8',
                              borderRadius: 6,
                              padding: '4px 7px',
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                            title="Cambiar fotografía de evidencia"
                          >
                            📷 Cambiar
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPhoto({ url: null, entrega: e, cacheBust: Date.now() });
                            triggerPhotoSelector(e);
                          }}
                          style={{
                            background: '#fef2f2',
                            border: '1px dashed #f87171',
                            color: '#dc2626',
                            borderRadius: 6,
                            padding: '5px 9px',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                          title="Subir nueva fotografía de evidencia"
                        >
                          📷 Subir foto
                        </button>
                      )}
                    </td>
                    <td>
                      {e.firma_base64 && e.firma_base64.startsWith('data:image') ? (
                        <img
                          src={e.firma_base64}
                          alt="Firma"
                          style={{
                            height: 32,
                            maxWidth: 70,
                            cursor: 'pointer',
                            border: '1px solid #e2e8f0',
                            borderRadius: 4,
                            background: '#fff',
                          }}
                          onClick={() => setSelectedSignature(e.firma_base64)}
                          title="Clic para ver firma completa"
                        />
                      ) : (
                        <span style={{ color: '#64748b', fontSize: 11, fontStyle: 'italic' }}>Sin firma (Opcional)</span>
                      )}
                    </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <a
                        href={`${API_BASE_URL}/api/v1/entregas/${e.id}/pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-secondary"
                        style={{
                          textDecoration: 'none',
                          padding: '4px 8px',
                          fontSize: 12,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          color: '#0284c7',
                          fontWeight: 600
                        }}
                        title="Ver / Descargar Acta Oficial de Conformidad en PDF"
                      >
                        📄 Acta PDF
                      </a>
                      {e.lote_deposito_id && (
                        <>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => handleEditLoteDeposito(e.lote_deposito_id!, e.sector || 'Sector')}
                            title="Editar litros totales del Lote de Depósito Único (recalcula todos los beneficiarios del lote)"
                            style={{ padding: '4px 8px', fontSize: 11, color: '#0f766e', borderColor: '#99f6e4', background: '#f0fdfa', fontWeight: 700 }}
                          >
                            ✏️ Lote
                          </button>
                          <button
                            type="button"
                            className="btn-danger"
                            onClick={() => handleDeleteLoteDeposito(e.lote_deposito_id!, e.sector || 'Sector')}
                            title="Eliminar todo el Lote de Depósito Único en un solo clic"
                            style={{ padding: '4px 8px', fontSize: 11 }}
                          >
                            🗑️ Lote
                          </button>
                        </>
                      )}
                      <button
                        className="btn-danger"
                        onClick={() => handleDeleteEntrega(e.id)}
                        title="Eliminar esta entrega individual"
                        style={{ padding: '4px 8px' }}
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

        {/* PAGINATION */}
        <Pagination
          currentPage={currentPage}
          totalItems={filtered.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[5, 10, 20, 50]}
        />
      </div>

      {/* INPUT OCULTO PARA SUBIR / CAMBIAR FOTO */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/jpg"
        style={{ display: 'none' }}
        onChange={handlePhotoFileChange}
      />

      {/* MODAL VER / CAMBIAR FOTO DE EVIDENCIA */}
      {selectedPhoto && (
        <div className="modal-overlay" onClick={() => !uploadingPhoto && setSelectedPhoto(null)}>
          <div className="modal-content" style={{ maxWidth: 640, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📸 Fotografía de Evidencia en Campo (Membretada)</h2>
              <button className="close-btn" onClick={() => !uploadingPhoto && setSelectedPhoto(null)}>✕</button>
            </div>
            
            {selectedPhoto.entrega && (
              <div style={{
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                padding: '8px 14px',
                marginBottom: 12,
                fontSize: 12,
                textAlign: 'left',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '4px 12px'
              }}>
                <div><strong>👤 Beneficiario:</strong> {selectedPhoto.entrega.nombres_apellidos} (DNI: {selectedPhoto.entrega.dni})</div>
                <div><strong>🚛 Cisterna:</strong> {selectedPhoto.entrega.cisterna_placa || 'CAT-849'}</div>
                <div><strong>📍 Sector:</strong> {selectedPhoto.entrega.sector} - {selectedPhoto.entrega.direccion}</div>
                <div><strong>🌐 Coordenadas:</strong> Lat {selectedPhoto.entrega.latitud}, Long {selectedPhoto.entrega.longitud}</div>
              </div>
            )}

            <div style={{ background: '#0f172a', padding: 10, borderRadius: 12, overflow: 'hidden', minHeight: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {selectedPhoto.url ? (
                <img 
                  src={`${selectedPhoto.url}?t=${selectedPhoto.cacheBust || Date.now()}`} 
                  alt="Evidencia en campo membretada" 
                  style={{ maxWidth: '100%', maxHeight: 480, borderRadius: 8, display: 'block', margin: '0 auto' }} 
                />
              ) : (
                <div style={{ color: '#94a3b8', padding: 32, fontSize: 13 }}>
                  📷 Esta entrega aún no tiene fotografía registrada. Haz clic en <strong>"Subir Nueva Foto"</strong> para agregarla.
                </div>
              )}
            </div>

            <div style={{ marginTop: 10, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#334155', fontWeight: 600, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={estamparMembrete}
                  onChange={(e) => setEstamparMembrete(e.target.checked)}
                />
                Estampar membrete oficial GPS / EPS Moyobamba en la nueva foto
              </label>
            </div>

            <div className="modal-footer" style={{ justifyContent: 'center', flexWrap: 'wrap', gap: 10 }}>
              <button
                type="button"
                className="btn-primary"
                disabled={uploadingPhoto}
                onClick={() => triggerPhotoSelector(selectedPhoto.entrega)}
                style={{ background: '#0284c7', borderColor: '#0284c7' }}
              >
                {uploadingPhoto
                  ? '⏳ Subiendo foto...'
                  : selectedPhoto.url
                    ? '📷 Cambiar Foto'
                    : '📷 Subir Nueva Foto'}
              </button>

              {selectedPhoto.url && (
                <a
                  href={`${selectedPhoto.url}?t=${selectedPhoto.cacheBust || Date.now()}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary"
                  style={{ textDecoration: 'none', color: '#0369a1', borderColor: '#bae6fd', background: '#f0f9ff', fontWeight: 700 }}
                >
                  🔍 Ver en tamaño original
                </a>
              )}

              <button className="btn-secondary" disabled={uploadingPhoto} onClick={() => setSelectedPhoto(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL VER FIRMA COMPLETA */}
      {selectedSignature && (
        <div className="modal-overlay" onClick={() => setSelectedSignature(null)}>
          <div className="modal-content" style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>✍️ Firma Digital Capturada</h2>
              <button className="close-btn" onClick={() => setSelectedSignature(null)}>✕</button>
            </div>
            <div style={{ background: '#f8fafc', padding: 20, borderRadius: 12, border: '1px dashed #cbd5e1' }}>
              <img src={selectedSignature} alt="Firma completa" style={{ maxWidth: '100%', maxHeight: 200 }} />
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setSelectedSignature(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ENTREGA COMPLETA EN UN SOLO DEPÓSITO DIARIO POR SECTOR */}
      {depositoModalOpen && (() => {
        const sectoresDisponibles = Array.from(
          new Set(beneficiariosList.map((b: any) => (b.sector || '').trim()).filter(Boolean))
        ) as string[];

        const benefsDelSector = beneficiariosList.filter(
          (b: any) => (b.sector || '').trim().toUpperCase() === sectorDeposito.toUpperCase()
        );

        const benefsFiltrados = benefsDelSector.filter((b: any) => {
          if (!searchBenefDeposito.trim()) return true;
          const q = searchBenefDeposito.toLowerCase();
          return (
            (b.nombres_apellidos || '').toLowerCase().includes(q) ||
            (b.dni || '').includes(q) ||
            (b.direccion || '').toLowerCase().includes(q)
          );
        });

        const totalMarcados = selectedBenefIdsDeposito.length;
        const litrosNum = Number(litrosTotalesDeposito || 0);
        const litrosPorBenef = totalMarcados > 0 ? Math.round((litrosNum / totalMarcados) * 100) / 100 : 0;

        // Cálculos semanales basados en los beneficiarios marcados y la fecha de entrega seleccionada
        const { lunesIso, domingoIso, etiquetaSemana } = getRangoSemanaIso(fechaDeposito);
        const {
          cuotaSemanalTotal,
          cuotaDiariaTotal,
          habitantesTotal,
          entregadoSemanaActual,
          restanteAntesDeHoy,
        } = calcularEstimadoSemanalParaIds(beneficiariosList, selectedBenefIdsDeposito, fechaDeposito);

        const totalSemanaConHoy = Math.round((entregadoSemanaActual + litrosNum) * 100) / 100;
        const restanteDespuesDeHoy = Math.max(0, Math.round((cuotaSemanalTotal - totalSemanaConHoy) * 100) / 100);
        const excedenteSemanal = Math.max(0, Math.round((totalSemanaConHoy - cuotaSemanalTotal) * 100) / 100);
        const porcentajeAvanceSemanal =
          cuotaSemanalTotal > 0 ? Math.min(100, Math.round((totalSemanaConHoy / cuotaSemanalTotal) * 1000) / 10) : 0;

        // Mapa de lo ya entregado en la semana por cada beneficiario individual
        const entregadoSemanaPorBenefMap = new Map<number, number>();
        for (const e of entregas) {
          const fStr = (e.fecha_captura || e.fecha_hora || '').slice(0, 10);
          if (fStr >= lunesIso && fStr <= domingoIso) {
            const bId = Number(e.beneficiario_id);
            entregadoSemanaPorBenefMap.set(
              bId,
              (entregadoSemanaPorBenefMap.get(bId) || 0) + Number(e.litros_entregados || 0)
            );
          }
        }

        return (
          <div className="modal-overlay" onClick={() => !savingDeposito && setDepositoModalOpen(false)}>
            <div
              className="modal-content"
              style={{ maxWidth: 780, maxHeight: '94vh', overflowY: 'auto' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <h2 style={{ margin: 0 }}>🚰 Entrega en Depósito Único por Sector</h2>
                    {sectorDeposito && benefsDelSector.length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          imprimirValeSectorUnico(
                            sectorDeposito,
                            benefsDelSector.map((b: any) => ({
                              codigo_unico: `VALE-ANUAL-2026-${b.dni}`,
                              beneficiario_dni: b.dni,
                              beneficiario_nombre: b.nombres_apellidos || b.nombres,
                              sector: b.sector_aahh || b.sector || sectorDeposito,
                              direccion: b.calle_direccion || b.direccion || '-',
                              num_miembros: b.num_miembros || 1,
                              litros_sugeridos: Number(b.num_miembros || 1) * 350,
                            }))
                          )
                        }
                        style={{
                          background: '#16a34a',
                          color: '#ffffff',
                          border: '1px solid #15803d',
                          borderRadius: 8,
                          padding: '6px 12px',
                          fontSize: 12,
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                        title="Imprimir un solo QR colectivo para todo este sector (al escanearlo en la app móvil se entregan todos los beneficiarios del sector)"
                      >
                        📲 QR Único Sector
                      </button>
                    )}
                  </div>
                </div>
                <button className="close-btn" onClick={() => !savingDeposito && setDepositoModalOpen(false)}>✕</button>
              </div>

              <form onSubmit={handleSubmitDepositoSector}>
                <div className="responsive-grid-2col" style={{ marginBottom: 12 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontWeight: 700, fontSize: 12 }}>1. Sector de Entrega *</label>
                    <select
                      value={sectorDeposito}
                      onChange={(e) => handleChangeSectorDepositoWeb(e.target.value)}
                      required
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontWeight: 700 }}
                    >
                      {sectoresDisponibles.map((sec) => (
                        <option key={sec} value={sec}>
                          📍 {sec}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontWeight: 700, fontSize: 12 }}>Programación Mensual</label>
                    <select
                      value={programacionIdDeposito}
                      onChange={(e) => setProgramacionIdDeposito(e.target.value)}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}
                    >
                      {programacionesList.map((p: any) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre_programa || `${p.mes_nombre || ''} ${p.anio || ''}`} (#{p.id})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* PANEL DE CONTROL SEMANAL DEL SECTOR (META SEMANAL VS. ENTREGAS DIARIAS Y RESTANTE) */}
                <div
                  style={{
                    background: 'linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%)',
                    border: '1.5px solid #93c5fd',
                    borderRadius: 12,
                    padding: '12px 14px',
                    marginBottom: 14,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 800, color: '#1e3a8a', textTransform: 'uppercase' }}>
                      📅 Control Semanal del Sector ({etiquetaSemana})
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        background: '#dbeafe',
                        color: '#1d4ed8',
                        padding: '2px 9px',
                        borderRadius: 999,
                      }}
                    >
                      {totalMarcados} familias ({habitantesTotal} hab. × 350 L/sem)
                    </span>
                  </div>

                  <div className="responsive-grid-4col">
                    <div style={{ background: '#ffffff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                        Estimado de la Semana
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 900, color: '#1e40af', marginTop: 2 }}>
                        {cuotaSemanalTotal.toLocaleString('es-PE')} Lts
                      </div>
                      <div style={{ fontSize: 10, color: '#64748b' }}>
                        ({(cuotaSemanalTotal / 1000).toFixed(2)} m³ • ~{cuotaDiariaTotal.toLocaleString('es-PE')} L/día)
                      </div>
                    </div>

                    <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                        Entregado Previo (Sem.)
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 900, color: '#0f766e', marginTop: 2 }}>
                        {entregadoSemanaActual.toLocaleString('es-PE')} Lts
                      </div>
                      <div style={{ fontSize: 10, color: '#64748b' }}>
                        Faltaban: {restanteAntesDeHoy.toLocaleString('es-PE')} Lts
                      </div>
                    </div>

                    <div style={{ background: '#f0fdfa', border: '1px solid #5eead4', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#0f766e', textTransform: 'uppercase' }}>
                        Entrega Hoy (Depósito)
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 900, color: '#0d9488', marginTop: 2 }}>
                        +{litrosNum.toLocaleString('es-PE')} Lts
                      </div>
                      <div style={{ fontSize: 10, color: '#0f766e' }}>
                        Acumulado: {totalSemanaConHoy.toLocaleString('es-PE')} Lts
                      </div>
                    </div>

                    <div
                      style={{
                        background: restanteDespuesDeHoy > 0 ? '#fffbeb' : '#dcfce7',
                        border: restanteDespuesDeHoy > 0 ? '1.5px solid #fcd34d' : '1.5px solid #86efac',
                        borderRadius: 8,
                        padding: '8px 10px',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          color: restanteDespuesDeHoy > 0 ? '#b45309' : '#166534',
                          textTransform: 'uppercase',
                        }}
                      >
                        Restante Semana (Tras Hoy)
                      </div>
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 900,
                          color: restanteDespuesDeHoy > 0 ? '#d97706' : '#15803d',
                          marginTop: 2,
                        }}
                      >
                        {restanteDespuesDeHoy.toLocaleString('es-PE')} Lts
                      </div>
                      <div style={{ fontSize: 10, color: restanteDespuesDeHoy > 0 ? '#92400e' : '#166534', fontWeight: 600 }}>
                        {restanteDespuesDeHoy > 0
                          ? `Queda ${(restanteDespuesDeHoy / 1000).toFixed(2)} m³ por entregar`
                          : excedenteSemanal > 0
                          ? `Meta cubierta (+${excedenteSemanal.toLocaleString('es-PE')} L extra)`
                          : '✅ Meta semanal completada'}
                      </div>
                    </div>
                  </div>

                  {/* Barra de progreso semanal */}
                  <div style={{ marginTop: 9 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                      <span>Avance de la programación semanal del sector (incluyendo entrega de hoy)</span>
                      <span style={{ color: porcentajeAvanceSemanal >= 100 ? '#15803d' : '#1d4ed8' }}>
                        {porcentajeAvanceSemanal}% ({totalSemanaConHoy.toLocaleString('es-PE')} / {cuotaSemanalTotal.toLocaleString('es-PE')} Lts)
                      </span>
                    </div>
                    <div style={{ width: '100%', height: 8, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${porcentajeAvanceSemanal}%`,
                          height: '100%',
                          background: porcentajeAvanceSemanal >= 100 ? '#16a34a' : 'linear-gradient(90deg, #2563eb, #0d9488)',
                          transition: 'width 0.25s ease',
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="responsive-grid-2col" style={{ marginBottom: 14 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontWeight: 700, fontSize: 12 }}>
                      2. Agua Entregada en Depósito (Litros) *
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="1"
                      value={litrosTotalesDeposito}
                      onChange={(e) => setLitrosTotalesDeposito(e.target.value)}
                      required
                      placeholder={`Ej. ${restanteAntesDeHoy || cuotaSemanalTotal}`}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #0d9488', fontWeight: 800, fontSize: 15, color: '#0f766e' }}
                    />
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                      {restanteAntesDeHoy > 0 && restanteAntesDeHoy !== cuotaSemanalTotal && (
                        <button
                          type="button"
                          onClick={() => setLitrosTotalesDeposito(String(restanteAntesDeHoy))}
                          style={{
                            padding: '3px 8px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 800,
                            cursor: 'pointer',
                            border: Number(litrosTotalesDeposito) === restanteAntesDeHoy ? '1.5px solid #d97706' : '1px solid #fcd34d',
                            background: Number(litrosTotalesDeposito) === restanteAntesDeHoy ? '#fef3c7' : '#fffbeb',
                            color: '#b45309',
                          }}
                        >
                          ⏳ Restante Semana ({restanteAntesDeHoy.toLocaleString('es-PE')} L)
                        </button>
                      )}
                      {cuotaSemanalTotal > 0 && (
                        <button
                          type="button"
                          onClick={() => setLitrosTotalesDeposito(String(cuotaSemanalTotal))}
                          style={{
                            padding: '3px 8px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 800,
                            cursor: 'pointer',
                            border: Number(litrosTotalesDeposito) === cuotaSemanalTotal ? '1.5px solid #1d4ed8' : '1px solid #93c5fd',
                            background: Number(litrosTotalesDeposito) === cuotaSemanalTotal ? '#dbeafe' : '#eff6ff',
                            color: '#1e40af',
                          }}
                        >
                          📅 Estimado Semana ({cuotaSemanalTotal.toLocaleString('es-PE')} L)
                        </button>
                      )}
                      {cuotaDiariaTotal > 0 && (
                        <button
                          type="button"
                          onClick={() => setLitrosTotalesDeposito(String(cuotaDiariaTotal))}
                          style={{
                            padding: '3px 8px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            border: Number(litrosTotalesDeposito) === cuotaDiariaTotal ? '1.5px solid #0d9488' : '1px solid #99f6e4',
                            background: Number(litrosTotalesDeposito) === cuotaDiariaTotal ? '#ccfbf1' : '#f0fdfa',
                            color: '#0f766e',
                          }}
                        >
                          ☀️ Estimado Día 1/7 ({cuotaDiariaTotal.toLocaleString('es-PE')} L)
                        </button>
                      )}
                      {['10000', '19000', '34000'].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setLitrosTotalesDeposito(preset)}
                          style={{
                            padding: '3px 8px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            border: litrosTotalesDeposito === preset ? '1px solid #0d9488' : '1px solid #cbd5e1',
                            background: litrosTotalesDeposito === preset ? '#ccfbf1' : '#f8fafc',
                            color: litrosTotalesDeposito === preset ? '#0f766e' : '#475569',
                          }}
                        >
                          {Number(preset) / 1000} m³ ({Number(preset).toLocaleString('es-PE')} L)
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontWeight: 700, fontSize: 12 }}>Fecha de Entrega del Día *</label>
                    <input
                      type="date"
                      value={fechaDeposito}
                      onChange={(e) => {
                        const nuevaFecha = e.target.value;
                        setFechaDeposito(nuevaFecha);
                        const calc = calcularEstimadoSemanalParaIds(beneficiariosList, selectedBenefIdsDeposito, nuevaFecha);
                        const sug = calc.restanteAntesDeHoy > 0 ? calc.restanteAntesDeHoy : calc.cuotaSemanalTotal;
                        if (sug > 0) setLitrosTotalesDeposito(String(sug));
                      }}
                      required
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontWeight: 600 }}
                    />
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
                      Descuenta automáticamente del saldo semanal ({etiquetaSemana}).
                    </div>
                  </div>
                </div>

                {/* RESUMEN DE DIVISIÓN AUTOMÁTICA */}
                <div
                  style={{
                    background: '#f0fdfa',
                    border: '1.5px solid #5eead4',
                    borderRadius: 12,
                    padding: '12px 16px',
                    marginBottom: 14,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#0f766e', textTransform: 'uppercase' }}>
                      📊 División Automática por Beneficiario (Entrega del Día)
                    </div>
                    <div style={{ fontSize: 13, color: '#134e4a', marginTop: 2 }}>
                      <strong>{litrosNum.toLocaleString('es-PE')} Lts</strong> ÷ <strong>{totalMarcados} beneficiarios marcados</strong>
                      {benefsDelSector.length - totalMarcados > 0 && (
                        <span style={{ color: '#b45309', fontWeight: 700, marginLeft: 8 }}>
                          ({benefsDelSector.length - totalMarcados} desmarcado(s) para otro depósito)
                        </span>
                      )}
                    </div>
                  </div>
                  <div
                    style={{
                      background: '#0d9488',
                      color: '#ffffff',
                      padding: '8px 14px',
                      borderRadius: 10,
                      fontWeight: 900,
                      fontSize: 16,
                    }}
                  >
                    {litrosPorBenef.toLocaleString('es-PE')} Lts / benef.
                  </div>
                </div>

                {/* LISTA DE BENEFICIARIOS CON OPCIÓN DE DESMARCAR CASOS ESPECIALES */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                    <label style={{ fontWeight: 800, fontSize: 12.5, color: '#1e293b' }}>
                      3. Beneficiarios del Sector ({totalMarcados} de {benefsDelSector.length} marcados)
                    </label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => {
                          const allIds = benefsDelSector.map((b: any) => Number(b.id));
                          setSelectedBenefIdsDeposito(allIds);
                          const calc = calcularEstimadoSemanalParaIds(beneficiariosList, allIds, fechaDeposito);
                          const sug = calc.restanteAntesDeHoy > 0 ? calc.restanteAntesDeHoy : calc.cuotaSemanalTotal;
                          if (sug > 0) setLitrosTotalesDeposito(String(sug));
                        }}
                        style={{
                          background: '#dcfce7',
                          border: '1px solid #86efac',
                          color: '#166534',
                          padding: '4px 10px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        ☑ Marcar Todos ({benefsDelSector.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedBenefIdsDeposito([])}
                        style={{
                          background: '#fee2e2',
                          border: '1px solid #fca5a5',
                          color: '#991b1b',
                          padding: '4px 10px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        ☐ Desmarcar Todos
                      </button>
                    </div>
                  </div>

                  <input
                    type="text"
                    placeholder="🔍 Buscar beneficiario para desmarcar en caso especial (recibe en otro depósito)..."
                    value={searchBenefDeposito}
                    onChange={(e) => setSearchBenefDeposito(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      fontSize: 12,
                      marginBottom: 8,
                    }}
                  />

                  <div
                    style={{
                      maxHeight: 220,
                      overflowY: 'auto',
                      border: '1px solid #cbd5e1',
                      borderRadius: 10,
                      background: '#f8fafc',
                      padding: 6,
                    }}
                  >
                    {benefsFiltrados.length === 0 ? (
                      <div style={{ padding: 16, textAlign: 'center', color: '#64748b', fontSize: 12 }}>
                        No se encontraron beneficiarios con ese criterio en este sector.
                      </div>
                    ) : (
                      benefsFiltrados.map((b: any) => {
                        const bId = Number(b.id);
                        const isChecked = selectedBenefIdsDeposito.includes(bId);
                        const miembrosFam = Number(b.num_miembros || 1);
                        const cuotaSemFam = Number(b.dotacion_semanal_litros || b.litros_sugeridos || miembrosFam * 350);
                        const entregadoPrevioFam = Math.round((entregadoSemanaPorBenefMap.get(bId) || 0) * 100) / 100;
                        const restanteFamTrasHoy = Math.max(
                          0,
                          Math.round((cuotaSemFam - entregadoPrevioFam - (isChecked ? litrosPorBenef : 0)) * 100) / 100
                        );

                        return (
                          <label
                            key={bId}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '7px 10px',
                              borderRadius: 8,
                              marginBottom: 4,
                              cursor: 'pointer',
                              background: isChecked ? '#ffffff' : '#fef3c7',
                              border: isChecked ? '1px solid #e2e8f0' : '1px solid #fcd34d',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleBenefDepositoWeb(bId)}
                                style={{ width: 16, height: 16, accentColor: '#0d9488', cursor: 'pointer' }}
                              />
                              <div>
                                <div style={{ fontSize: 12.5, fontWeight: 700, color: isChecked ? '#0f172a' : '#92400e', textDecoration: isChecked ? 'none' : 'line-through' }}>
                                  {b.nombres_apellidos}
                                </div>
                                <div style={{ fontSize: 11, color: '#64748b' }}>
                                  DNI: {b.dni || 'S/N'} • 👥 {miembrosFam} hab. (Sem: <strong>{cuotaSemFam} L</strong>
                                  {entregadoPrevioFam > 0 ? ` • Previo: ${entregadoPrevioFam} L` : ''}) • {b.direccion || b.sector}
                                </div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 800,
                                  padding: '2px 8px',
                                  borderRadius: 6,
                                  background: isChecked ? '#ccfbf1' : '#fde68a',
                                  color: isChecked ? '#0f766e' : '#b45309',
                                }}
                              >
                                {isChecked ? `+${litrosPorBenef} Lts hoy` : 'Otro depósito'}
                              </span>
                              {isChecked && (
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    color: restanteFamTrasHoy > 0 ? '#b45309' : '#15803d',
                                  }}
                                >
                                  {restanteFamTrasHoy > 0 ? `Resta sem: ${restanteFamTrasHoy} L` : '✅ Sem. cubierta'}
                                </span>
                              )}
                            </div>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontWeight: 700, fontSize: 12 }}>Fotografía del Depósito (Opcional)</label>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/jpg"
                      onChange={(e) => setFotoDepositoFile(e.target.files?.[0] || null)}
                      style={{ width: '100%', fontSize: 12 }}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontWeight: 700, fontSize: 12 }}>Observación (Opcional)</label>
                    <input
                      type="text"
                      value={observacionesDeposito}
                      onChange={(e) => setObservacionesDeposito(e.target.value)}
                      placeholder="Ej. Entrega en reservorio comunal del sector"
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }}
                    />
                  </div>
                </div>

                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={savingDeposito}
                    onClick={() => setDepositoModalOpen(false)}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={savingDeposito || totalMarcados === 0}
                    style={{ background: '#0d9488', borderColor: '#0d9488', fontWeight: 800 }}
                  >
                    {savingDeposito
                      ? '⏳ Registrando entregas...'
                      : `✅ Registrar Entrega (${totalMarcados} benef. • ${litrosPorBenef} Lts c/u)`}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}
    </Layout>
  );
}
