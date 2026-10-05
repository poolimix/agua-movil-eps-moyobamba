/**
 * Constantes y Parámetros Operativos - EPS Moyobamba
 * Proyecto Agua Móvil
 */

// Dotación diaria reglamentaria por habitante/miembro de familia (Litros/persona/día - Norma SUNASS / MVCS)
export const DOTACION_POR_HABITANTE = 50;

// Ciclo de entrega periódica semanal (7 días hábiles/calendario de abastecimiento continuo)
export const DIAS_ENTREGA_SEMANAL = 7;

// Dotación semanal asignada por habitante por cada vale de consumo (50 L/día × 7 días = 350 Litros)
export const DOTACION_SEMANAL_POR_HABITANTE = DOTACION_POR_HABITANTE * DIAS_ENTREGA_SEMANAL; // 350 L

// Equivalencias
export const LITROS_POR_M3 = 1000;

/**
 * Función oficial de cálculo de dotación familiar EPS Moyobamba:
 * @param numMiembros Total de personas en la vivienda (Titular beneficiario + familiares)
 * @returns Objeto con personas, dotación diaria y dotación semanal por vale
 */
export const calcularDotacionFamiliar = (numMiembros: number = 1) => {
  const personas = Math.max(1, parseInt(String(numMiembros), 10) || 1);
  const dotacionDiariaLitros = personas * DOTACION_POR_HABITANTE; // Ej: 5 * 50 = 250 L/día
  const dotacionSemanalLitros = dotacionDiariaLitros * DIAS_ENTREGA_SEMANAL; // Ej: 250 * 7 = 1750 L/semana
  return {
    personas,
    dotacionDiariaLitros,
    diasSemana: DIAS_ENTREGA_SEMANAL,
    dotacionSemanalLitros,
    dotacionSemanalM3: parseFloat((dotacionSemanalLitros / LITROS_POR_M3).toFixed(2))
  };
};
