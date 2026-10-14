import { Request, Response } from 'express';
import * as presupuestoService from '../services/presupuesto.service';

export const getPresupuestoHandler = async (req: Request, res: Response) => {
  try {
    const anio = req.query.anio ? parseInt(String(req.query.anio), 10) : 2026;
    const data = await presupuestoService.getEjecucionPresupuestal(anio);
    res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error('Error al obtener ejecución presupuestal:', error);
    res.status(500).json({ success: false, message: 'Error interno al consultar presupuesto', error: error.message });
  }
};

export const createMesHandler = async (req: Request, res: Response) => {
  try {
    const userEmail = (req as any).user?.email || 'ADMIN';
    const { anio, mes, mes_numero, programado, comprometido, girado, notas } = req.body;

    if (!mes || mes_numero === undefined || programado === undefined) {
      return res.status(400).json({ success: false, message: 'Mes, número de mes y monto programado son obligatorios.' });
    }

    const created = await presupuestoService.createMesPresupuesto({
      anio: anio ? parseInt(String(anio), 10) : 2026,
      mes,
      mes_numero: parseInt(String(mes_numero), 10),
      programado: parseFloat(String(programado)),
      comprometido: comprometido !== undefined ? parseFloat(String(comprometido)) : 0,
      girado: girado !== undefined ? parseFloat(String(girado)) : 0,
      notas,
    }, userEmail);

    res.status(201).json({
      success: true,
      message: '✅ Mes presupuestal registrado exitosamente.',
      data: created,
    });
  } catch (error: any) {
    console.error('Error creando mes presupuestal:', error);
    if (error.code === '23505') {
      return res.status(400).json({ success: false, message: 'Ya existe un registro para ese mes y año.' });
    }
    res.status(500).json({ success: false, message: 'Error al registrar mes presupuestal', error: error.message });
  }
};

export const updateMesHandler = async (req: Request, res: Response) => {
  try {
    const userEmail = (req as any).user?.email || 'ADMIN';
    const id = parseInt(String(req.params.id), 10);
    const { programado, comprometido, girado, notas, mes } = req.body;

    const updated = await presupuestoService.updateMesPresupuesto(id, {
      programado: programado !== undefined ? parseFloat(String(programado)) : undefined,
      comprometido: comprometido !== undefined ? parseFloat(String(comprometido)) : undefined,
      girado: girado !== undefined ? parseFloat(String(girado)) : undefined,
      notas,
      mes,
    }, userEmail);

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Mes presupuestal no encontrado.' });
    }

    res.json({
      success: true,
      message: '✅ Montos presupuestales actualizados exitosamente.',
      data: updated,
    });
  } catch (error: any) {
    console.error('Error actualizando mes presupuestal:', error);
    res.status(500).json({ success: false, message: 'Error al actualizar mes presupuestal', error: error.message });
  }
};

export const deleteMesHandler = async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const deleted = await presupuestoService.deleteMesPresupuesto(id);

    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Mes presupuestal no encontrado.' });
    }

    res.json({
      success: true,
      message: '✅ Mes presupuestal eliminado exitosamente.',
      data: deleted,
    });
  } catch (error: any) {
    console.error('Error eliminando mes presupuestal:', error);
    res.status(500).json({ success: false, message: 'Error al eliminar mes presupuestal', error: error.message });
  }
};

export const createPartidaHandler = async (req: Request, res: Response) => {
  try {
    const userEmail = (req as any).user?.email || 'ADMIN';
    const { anio, codigo_partida, partida, unidad, cantidad, costo_unitario, programado, devengado, girado, estado } = req.body;

    if (!partida || programado === undefined) {
      return res.status(400).json({ success: false, message: 'El nombre de la partida y el monto programado son obligatorios.' });
    }

    const created = await presupuestoService.createPartidaPresupuesto({
      anio: anio ? parseInt(String(anio), 10) : 2026,
      codigo_partida,
      partida,
      unidad,
      cantidad: cantidad !== undefined ? parseFloat(String(cantidad)) : 1,
      costo_unitario: costo_unitario !== undefined ? parseFloat(String(costo_unitario)) : 0,
      programado: parseFloat(String(programado)),
      devengado: devengado !== undefined ? parseFloat(String(devengado)) : 0,
      girado: girado !== undefined ? parseFloat(String(girado)) : 0,
      estado,
    }, userEmail);

    res.status(201).json({
      success: true,
      message: '✅ Partida presupuestal registrada exitosamente.',
      data: created,
    });
  } catch (error: any) {
    console.error('Error creando partida presupuestal:', error);
    res.status(500).json({ success: false, message: 'Error al registrar partida presupuestal', error: error.message });
  }
};

export const updatePartidaHandler = async (req: Request, res: Response) => {
  try {
    const userEmail = (req as any).user?.email || 'ADMIN';
    const id = parseInt(String(req.params.id), 10);
    const { codigo_partida, partida, unidad, cantidad, costo_unitario, programado, devengado, girado, estado } = req.body;

    const updated = await presupuestoService.updatePartidaPresupuesto(id, {
      codigo_partida,
      partida,
      unidad,
      cantidad: cantidad !== undefined ? parseFloat(String(cantidad)) : undefined,
      costo_unitario: costo_unitario !== undefined ? parseFloat(String(costo_unitario)) : undefined,
      programado: programado !== undefined ? parseFloat(String(programado)) : undefined,
      devengado: devengado !== undefined ? parseFloat(String(devengado)) : undefined,
      girado: girado !== undefined ? parseFloat(String(girado)) : undefined,
      estado,
    }, userEmail);

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Partida presupuestal no encontrada.' });
    }

    res.json({
      success: true,
      message: '✅ Partida presupuestal actualizada exitosamente.',
      data: updated,
    });
  } catch (error: any) {
    console.error('Error actualizando partida presupuestal:', error);
    res.status(500).json({ success: false, message: 'Error al actualizar partida presupuestal', error: error.message });
  }
};

export const deletePartidaHandler = async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const deleted = await presupuestoService.deletePartidaPresupuesto(id);

    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Partida presupuestal no encontrada.' });
    }

    res.json({
      success: true,
      message: '✅ Partida presupuestal eliminada exitosamente.',
      data: deleted,
    });
  } catch (error: any) {
    console.error('Error eliminando partida presupuestal:', error);
    res.status(500).json({ success: false, message: 'Error al eliminar partida presupuestal', error: error.message });
  }
};

export const restablecerDefaultsHandler = async (req: Request, res: Response) => {
  try {
    const userEmail = (req as any).user?.email || 'ADMIN';
    const anio = req.body.anio ? parseInt(String(req.body.anio), 10) : 2026;
    const data = await presupuestoService.restablecerDefaultsPresupuesto(anio, userEmail);

    res.json({
      success: true,
      message: '✅ Se han restablecido los valores normativos de referencia del Convenio PNSU.',
      data,
    });
  } catch (error: any) {
    console.error('Error restableciendo presupuesto:', error);
    res.status(500).json({ success: false, message: 'Error al restablecer presupuesto', error: error.message });
  }
};
