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
import { FtpDestination, useDeleteDestination } from '@/hooks/useDestinations';

interface DeleteDestinationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  destination: FtpDestination | null;
}

export function DeleteDestinationDialog({ open, onOpenChange, destination }: DeleteDestinationDialogProps) {
  const deleteMutation = useDeleteDestination();

  const handleDelete = async () => {
    if (!destination) return;
    
    try {
      await deleteMutation.mutateAsync(destination.id);
      onOpenChange(false);
    } catch (error) {
      // Error handled by mutation
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir Destino</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja excluir o destino{' '}
            <strong>{destination?.name}</strong>? Esta ação não pode ser desfeita.
            Jobs de backup associados a este destino também serão afetados.
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
