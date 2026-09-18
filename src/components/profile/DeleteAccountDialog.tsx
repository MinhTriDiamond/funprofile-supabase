import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Trash2, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/i18n/LanguageContext";

interface DeleteAccountDialogProps {
  username: string;
}

export function DeleteAccountDialog({ username }: DeleteAccountDialogProps) {
  const [open, setOpen] = useState(false);
  const [confirmUsername, setConfirmUsername] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { t } = useLanguage();

  const canDelete = confirmUsername === username && confirmed;

  const handleDelete = async () => {
    if (!canDelete) return;

    setIsDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({
          title: "Error",
          description: "You must be logged in to delete your account",
          variant: "destructive",
        });
        return;
      }

      const { data, error } = await supabase.functions.invoke('delete-user-account', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        console.error('Delete account error:', error);
        toast({
          title: "Error",
          description: error.message || "Failed to delete account",
          variant: "destructive",
        });
        return;
      }

      if (data?.success) {
        toast({
          title: t('accountDeleted'),
          description: t('accountDeletedDesc'),
        });

        // Sign out and redirect
        await supabase.auth.signOut();
        navigate('/auth');
      } else {
        toast({
          title: "Error",
          description: data?.error || "Failed to delete account",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Delete account error:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      // Reset state when closing
      setConfirmUsername("");
      setConfirmed(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" className="gap-2">
          <Trash2 className="w-4 h-4" />
          {t('deleteAccount')}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="border-destructive/50">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            {t('deleteAccountConfirm')}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-4">
            <p className="text-destructive font-medium">
              {t('deleteAccountWarning')}
            </p>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li>{t('deleteAccountItem1')}</li>
              <li>{t('deleteAccountItem2')}</li>
              <li>{t('deleteAccountItem3')}</li>
              <li>{t('deleteAccountItem4')}</li>
            </ul>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="confirm-username">
              {t('typeUsernameToConfirm')} <span className="font-mono font-bold text-foreground">{username}</span>
            </Label>
            <Input
              id="confirm-username"
              value={confirmUsername}
              onChange={(e) => setConfirmUsername(e.target.value)}
              placeholder={username}
              className="border-destructive/30 focus:border-destructive"
            />
          </div>

          <div className="flex items-start space-x-2">
            <Checkbox
              id="confirm-delete"
              checked={confirmed}
              onCheckedChange={(checked) => setConfirmed(checked === true)}
              className="mt-1"
            />
            <Label htmlFor="confirm-delete" className="text-sm text-muted-foreground cursor-pointer">
              {t('deleteAccountCheckbox')}
            </Label>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>
            {t('cancel')}
          </AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!canDelete || isDeleting}
            className="gap-2"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('deleting')}
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                {t('deleteAccountButton')}
              </>
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
