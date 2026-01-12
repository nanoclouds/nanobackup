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
import { BackupJob, useDeleteJob } from '@/hooks/useJobs';

interface DeleteJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: BackupJob | null;
}

export function DeleteJobDialog({ open, onOpenChange, job }: DeleteJobDialogProps) {
  const deleteMutation = useDeleteJob();

  const handleDelete = async () => {
    if (!job) return;
    
    try {
      await deleteMutation.mutateAsync(job.id);
      onOpenChange(false);
    } catch (error) {
      // Error handled by mutation
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir Job de Backup</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja excluir o job{' '}
            <strong>{job?.name}</strong>? Esta ação não pode ser desfeita.
            O histórico de execuções será mantido.
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
