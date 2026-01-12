import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2 } from 'lucide-react';
import { PostgresInstance, useDeleteInstance } from '@/hooks/useInstances';

interface DeleteInstanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instance: PostgresInstance | null;
}

export function DeleteInstanceDialog({ open, onOpenChange, instance }: DeleteInstanceDialogProps) {
  const deleteMutation = useDeleteInstance();

  const handleDelete = async () => {
    if (!instance) return;
    
    try {
      await deleteMutation.mutateAsync(instance.id);
      onOpenChange(false);
    } catch (error) {
      // Error handled by mutation
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir Instância</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja excluir a instância{' '}
            <strong>{instance?.name}</strong>? Esta ação não pode ser desfeita.
            Jobs de backup associados a esta instância também serão afetados.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
