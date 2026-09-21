import { parseISO, isValid, format } from 'date-fns';
import { es } from 'date-fns/locale';

const MIN_VALID_YEAR = 2023;
const MAX_VALID_YEAR = 2030;

export interface SanitizedTimestampResult {
  raw: string;
  formattedDisplay: string;
  isAnomaly: boolean;
}

/**
 * Normaliza y sanea cadenas de fechas evitando fechas anómalas (ej. '9/1/2001')
 */
export function sanitizeOperationalDate(
  rawDate: string | null | undefined,
  fallbackDateStr: string = '2026-09-21'
): SanitizedTimestampResult {
  if (!rawDate) {
    return {
      raw: fallbackDateStr,
      formattedDisplay: 'Fecha N/D',
      isAnomaly: true,
    };
  }

  // Intentar parsear ISO o fecha estándar
  let parsed = parseISO(rawDate);
  if (!isValid(parsed)) {
    const ts = Date.parse(rawDate);
    if (!isNaN(ts)) {
      parsed = new Date(ts);
    }
  }

  if (!isValid(parsed)) {
    return {
      raw: fallbackDateStr,
      formattedDisplay: rawDate,
      isAnomaly: true,
    };
  }

  const year = parsed.getFullYear();
  const isAnomaly = year < MIN_VALID_YEAR || year > MAX_VALID_YEAR;

  // Formato conciso para ejes (ej. '26 Ago', '01 Sep')
  const formattedDisplay = format(parsed, 'dd MMM', { locale: es });

  return {
    raw: rawDate,
    formattedDisplay: isAnomaly ? `${formattedDisplay} ⚠️` : formattedDisplay,
    isAnomaly,
  };
}

/**
 * Valida si en la flota activa un conductor aparece en más de una cisterna al mismo tiempo
 */
export function validateDriverAssignmentSanity(cisternas: Array<{
  id: number;
  placa: string;
  conductor_habitual_nombre?: string | null;
}>): string[] {
  const driverMap = new Map<string, string>();
  const alerts: string[] = [];

  for (const c of cisternas) {
    const driver = c.conductor_habitual_nombre?.trim();
    if (driver && driver.length > 2) {
      if (driverMap.has(driver)) {
        alerts.push(
          `Alerta Operativa: El chofer "${driver}" aparece asignado simultáneamente a las cisternas ${driverMap.get(driver)} y ${c.placa}.`
        );
      } else {
        driverMap.set(driver, c.placa);
      }
    }
  }

  return alerts;
}
