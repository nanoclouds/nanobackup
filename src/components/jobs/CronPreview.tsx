import { useMemo } from 'react';
import { validateCronExpression, formatNextExecution, formatNextExecutionShort, CRON_EXAMPLES } from '@/lib/cron';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AlertCircle, Calendar, CheckCircle2, ChevronDown, Clock } from 'lucide-react';

interface CronPreviewProps {
  expression: string;
  onSelectPreset?: (expression: string) => void;
}

export function CronPreview({ expression, onSelectPreset }: CronPreviewProps) {
  const validation = useMemo(() => validateCronExpression(expression), [expression]);

  if (!expression) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>Digite uma expressão cron para ver o preview</span>
        </div>
      </div>
    );
  }

  if (!validation.isValid) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-destructive">Expressão inválida</p>
            <p className="text-xs text-destructive/80">{validation.error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-success/50 bg-success/10 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-success">Expressão válida</p>
              <p className="text-xs text-success/80">{validation.humanReadable}</p>
            </div>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 text-xs">
                Presets <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="end">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground px-2 py-1">
                  Expressões comuns
                </p>
                {CRON_EXAMPLES.map((preset) => (
                  <Button
                    key={preset.expression}
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start h-auto py-2 px-2"
                    onClick={() => onSelectPreset?.(preset.expression)}
                  >
                    <div className="text-left">
                      <p className="text-sm">{preset.label}</p>
                      <code className="text-xs text-muted-foreground font-mono">
                        {preset.expression}
                      </code>
                    </div>
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {validation.nextExecutions && validation.nextExecutions.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Próximas execuções</span>
          </div>
          <div className="space-y-1.5">
            {validation.nextExecutions.slice(0, 5).map((date, index) => (
              <div key={index} className="flex items-center gap-2 text-sm">
                <Badge variant="muted" className="text-xs font-mono w-14 justify-center">
                  {index + 1}ª
                </Badge>
                <span className="text-muted-foreground">
                  {index === 0 ? (
                    <span className="text-foreground font-medium">
                      {formatNextExecution(date)}
                    </span>
                  ) : (
                    formatNextExecutionShort(date)
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
