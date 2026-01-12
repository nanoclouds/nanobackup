import cronParser from 'cron-parser';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export interface CronValidationResult {
  isValid: boolean;
  error?: string;
  nextExecutions?: Date[];
  humanReadable?: string;
}

const CRON_PRESETS: Record<string, string> = {
  '0 * * * *': 'A cada hora',
  '0 0 * * *': 'Diariamente à meia-noite',
  '0 2 * * *': 'Diariamente às 02:00',
  '0 3 * * *': 'Diariamente às 03:00',
  '0 0 * * 0': 'Semanalmente aos domingos',
  '0 0 * * 1': 'Semanalmente às segundas',
  '0 0 1 * *': 'Mensalmente no dia 1',
  '0 0 1 1 *': 'Anualmente em 1 de janeiro',
  '*/5 * * * *': 'A cada 5 minutos',
  '*/15 * * * *': 'A cada 15 minutos',
  '*/30 * * * *': 'A cada 30 minutos',
  '0 */2 * * *': 'A cada 2 horas',
  '0 */6 * * *': 'A cada 6 horas',
  '0 */12 * * *': 'A cada 12 horas',
};

function generateHumanReadable(expression: string): string {
  // Check presets first
  if (CRON_PRESETS[expression]) {
    return CRON_PRESETS[expression];
  }

  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    return 'Expressão personalizada';
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const descriptions: string[] = [];

  // Handle common patterns
  if (minute.startsWith('*/')) {
    const interval = parseInt(minute.slice(2));
    descriptions.push(`A cada ${interval} minuto${interval > 1 ? 's' : ''}`);
  } else if (hour.startsWith('*/')) {
    const interval = parseInt(hour.slice(2));
    if (minute === '0') {
      descriptions.push(`A cada ${interval} hora${interval > 1 ? 's' : ''}`);
    }
  } else if (minute !== '*' && hour !== '*') {
    const h = hour.padStart(2, '0');
    const m = minute.padStart(2, '0');
    descriptions.push(`Às ${h}:${m}`);
  }

  // Day of week
  const dayOfWeekNames: Record<string, string> = {
    '0': 'domingos', '7': 'domingos',
    '1': 'segundas', '2': 'terças', '3': 'quartas',
    '4': 'quintas', '5': 'sextas', '6': 'sábados',
  };
  
  if (dayOfWeek !== '*') {
    if (dayOfWeek.includes(',')) {
      const days = dayOfWeek.split(',').map(d => dayOfWeekNames[d] || d).join(', ');
      descriptions.push(`às ${days}`);
    } else if (dayOfWeek.includes('-')) {
      const [start, end] = dayOfWeek.split('-');
      descriptions.push(`de ${dayOfWeekNames[start]} a ${dayOfWeekNames[end]}`);
    } else if (dayOfWeekNames[dayOfWeek]) {
      descriptions.push(`às ${dayOfWeekNames[dayOfWeek]}`);
    }
  }

  // Day of month
  if (dayOfMonth !== '*' && !dayOfMonth.includes('/')) {
    if (dayOfMonth.includes(',')) {
      descriptions.push(`nos dias ${dayOfMonth}`);
    } else {
      descriptions.push(`no dia ${dayOfMonth}`);
    }
  }

  // Month
  const monthNames: Record<string, string> = {
    '1': 'janeiro', '2': 'fevereiro', '3': 'março', '4': 'abril',
    '5': 'maio', '6': 'junho', '7': 'julho', '8': 'agosto',
    '9': 'setembro', '10': 'outubro', '11': 'novembro', '12': 'dezembro',
  };
  
  if (month !== '*') {
    if (month.includes(',')) {
      const months = month.split(',').map(m => monthNames[m] || m).join(', ');
      descriptions.push(`em ${months}`);
    } else if (monthNames[month]) {
      descriptions.push(`em ${monthNames[month]}`);
    }
  }

  return descriptions.length > 0 ? descriptions.join(' ') : 'Expressão personalizada';
}

export function validateCronExpression(expression: string, count: number = 5): CronValidationResult {
  if (!expression || expression.trim() === '') {
    return {
      isValid: false,
      error: 'Expressão cron é obrigatória',
    };
  }

  const trimmed = expression.trim();
  const parts = trimmed.split(/\s+/);
  
  if (parts.length !== 5) {
    return {
      isValid: false,
      error: `Expressão deve ter 5 campos (minuto, hora, dia, mês, dia_semana). Encontrado: ${parts.length}`,
    };
  }

  try {
    const interval = cronParser.parse(trimmed, {
      currentDate: new Date(),
    });

    const nextExecutions: Date[] = [];
    for (let i = 0; i < count; i++) {
      nextExecutions.push(interval.next().toDate());
    }

    return {
      isValid: true,
      nextExecutions,
      humanReadable: generateHumanReadable(trimmed),
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Expressão cron inválida';
    return {
      isValid: false,
      error: errorMessage,
    };
  }
}

export function formatNextExecution(date: Date): string {
  return format(date, "EEEE, d 'de' MMMM 'às' HH:mm", { locale: ptBR });
}

export function formatNextExecutionShort(date: Date): string {
  return format(date, "dd/MM/yyyy HH:mm", { locale: ptBR });
}

export const CRON_EXAMPLES = [
  { expression: '0 2 * * *', label: 'Diário às 02:00' },
  { expression: '0 3 * * *', label: 'Diário às 03:00' },
  { expression: '0 0 * * *', label: 'Diário à meia-noite' },
  { expression: '0 */6 * * *', label: 'A cada 6 horas' },
  { expression: '0 */12 * * *', label: 'A cada 12 horas' },
  { expression: '0 2 * * 0', label: 'Domingos às 02:00' },
  { expression: '0 2 * * 1-5', label: 'Dias úteis às 02:00' },
  { expression: '0 2 1 * *', label: 'Dia 1 de cada mês às 02:00' },
];
