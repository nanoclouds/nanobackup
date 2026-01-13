import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar as CalendarIcon, X, ChevronDown, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useInstances } from '@/hooks/useInstances';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

export interface ExecutionFilters {
  status: string | null;
  instanceId: string | null;
  dateFrom: Date | null;
  dateTo: Date | null;
}

interface ExecutionFiltersProps {
  filters: ExecutionFilters;
  onFiltersChange: (filters: ExecutionFilters) => void;
}

const STATUS_OPTIONS = [
  { value: 'success', label: 'Sucesso', color: 'bg-emerald-500' },
  { value: 'failed', label: 'Falha', color: 'bg-destructive' },
  { value: 'running', label: 'Em execução', color: 'bg-amber-500' },
  { value: 'scheduled', label: 'Agendado', color: 'bg-blue-500' },
  { value: 'cancelled', label: 'Cancelado', color: 'bg-muted-foreground' },
];

export function ExecutionFiltersPanel({ filters, onFiltersChange }: ExecutionFiltersProps) {
  const { data: instances } = useInstances();
  const [isOpen, setIsOpen] = useState(false);
  const [localFilters, setLocalFilters] = useState<ExecutionFilters>(filters);

  const activeFiltersCount = [
    filters.status,
    filters.instanceId,
    filters.dateFrom,
    filters.dateTo,
  ].filter(Boolean).length;

  const handleApply = () => {
    onFiltersChange(localFilters);
    setIsOpen(false);
  };

  const handleClear = () => {
    const clearedFilters: ExecutionFilters = {
      status: null,
      instanceId: null,
      dateFrom: null,
      dateTo: null,
    };
    setLocalFilters(clearedFilters);
    onFiltersChange(clearedFilters);
  };

  const handleOpenChange = (open: boolean) => {
    if (open) {
      setLocalFilters(filters);
    }
    setIsOpen(open);
  };

  const removeFilter = (key: keyof ExecutionFilters) => {
    const newFilters = { ...filters, [key]: null };
    onFiltersChange(newFilters);
  };

  return (
    <div className="flex items-center gap-2">
      <Sheet open={isOpen} onOpenChange={handleOpenChange}>
        <SheetTrigger asChild>
          <Button variant="outline" className="relative">
            <Filter className="mr-2 h-4 w-4" />
            Filtros
            {activeFiltersCount > 0 && (
              <Badge 
                variant="secondary" 
                className="ml-2 h-5 w-5 rounded-full p-0 flex items-center justify-center bg-primary text-primary-foreground"
              >
                {activeFiltersCount}
              </Badge>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent className="w-[400px] sm:w-[450px]">
          <SheetHeader>
            <SheetTitle>Filtros Avançados</SheetTitle>
          </SheetHeader>
          
          <div className="mt-6 space-y-6">
            {/* Status Filter */}
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={localFilters.status || ''}
                onValueChange={(value) => 
                  setLocalFilters({ ...localFilters, status: value || null })
                }
              >
                <SelectTrigger className="bg-secondary">
                  <SelectValue placeholder="Todos os status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todos os status</SelectItem>
                  {STATUS_OPTIONS.map((status) => (
                    <SelectItem key={status.value} value={status.value}>
                      <div className="flex items-center gap-2">
                        <div className={cn("h-2 w-2 rounded-full", status.color)} />
                        {status.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Instance Filter */}
            <div className="space-y-2">
              <Label>Instância</Label>
              <Select
                value={localFilters.instanceId || ''}
                onValueChange={(value) => 
                  setLocalFilters({ ...localFilters, instanceId: value || null })
                }
              >
                <SelectTrigger className="bg-secondary">
                  <SelectValue placeholder="Todas as instâncias" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todas as instâncias</SelectItem>
                  {instances?.map((instance) => (
                    <SelectItem key={instance.id} value={instance.id}>
                      {instance.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Date Range Filter */}
            <div className="space-y-4">
              <Label>Período</Label>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Data inicial</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal bg-secondary",
                          !localFilters.dateFrom && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {localFilters.dateFrom ? (
                          format(localFilters.dateFrom, "dd/MM/yyyy", { locale: ptBR })
                        ) : (
                          <span>Selecionar</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={localFilters.dateFrom || undefined}
                        onSelect={(date) => 
                          setLocalFilters({ ...localFilters, dateFrom: date || null })
                        }
                        disabled={(date) => 
                          date > new Date() || 
                          (localFilters.dateTo ? date > localFilters.dateTo : false)
                        }
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Data final</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal bg-secondary",
                          !localFilters.dateTo && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {localFilters.dateTo ? (
                          format(localFilters.dateTo, "dd/MM/yyyy", { locale: ptBR })
                        ) : (
                          <span>Selecionar</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={localFilters.dateTo || undefined}
                        onSelect={(date) => 
                          setLocalFilters({ ...localFilters, dateTo: date || null })
                        }
                        disabled={(date) => 
                          date > new Date() || 
                          (localFilters.dateFrom ? date < localFilters.dateFrom : false)
                        }
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>

            {/* Quick Date Presets */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Atalhos</Label>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    setLocalFilters({ ...localFilters, dateFrom: today, dateTo: new Date() });
                  }}
                >
                  Hoje
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const today = new Date();
                    const weekAgo = new Date(today);
                    weekAgo.setDate(weekAgo.getDate() - 7);
                    setLocalFilters({ ...localFilters, dateFrom: weekAgo, dateTo: today });
                  }}
                >
                  Últimos 7 dias
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const today = new Date();
                    const monthAgo = new Date(today);
                    monthAgo.setDate(monthAgo.getDate() - 30);
                    setLocalFilters({ ...localFilters, dateFrom: monthAgo, dateTo: today });
                  }}
                >
                  Últimos 30 dias
                </Button>
              </div>
            </div>
          </div>

          <SheetFooter className="mt-8 gap-2">
            <Button variant="outline" onClick={handleClear}>
              Limpar filtros
            </Button>
            <Button onClick={handleApply}>
              Aplicar filtros
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Active Filters Tags */}
      {activeFiltersCount > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {filters.status && (
            <Badge variant="secondary" className="gap-1 pr-1">
              Status: {STATUS_OPTIONS.find(s => s.value === filters.status)?.label}
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 p-0 hover:bg-transparent"
                onClick={() => removeFilter('status')}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          )}
          {filters.instanceId && instances && (
            <Badge variant="secondary" className="gap-1 pr-1">
              Instância: {instances.find(i => i.id === filters.instanceId)?.name}
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 p-0 hover:bg-transparent"
                onClick={() => removeFilter('instanceId')}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          )}
          {filters.dateFrom && (
            <Badge variant="secondary" className="gap-1 pr-1">
              De: {format(filters.dateFrom, "dd/MM/yyyy")}
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 p-0 hover:bg-transparent"
                onClick={() => removeFilter('dateFrom')}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          )}
          {filters.dateTo && (
            <Badge variant="secondary" className="gap-1 pr-1">
              Até: {format(filters.dateTo, "dd/MM/yyyy")}
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 p-0 hover:bg-transparent"
                onClick={() => removeFilter('dateTo')}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs text-muted-foreground"
            onClick={handleClear}
          >
            Limpar todos
          </Button>
        </div>
      )}
    </div>
  );
}
