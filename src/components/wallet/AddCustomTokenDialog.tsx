import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Plus } from 'lucide-react';
import { isAddress } from 'viem';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCustomTokenActions, type CustomTokenMetadata } from '@/hooks/useCustomTokens';

interface AddCustomTokenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded?: () => void;
}

export function AddCustomTokenDialog({ open, onOpenChange, onAdded }: AddCustomTokenDialogProps) {
  const { readMetadata, addToken } = useCustomTokenActions();
  const [address, setAddress] = useState('');
  const [metadata, setMetadata] = useState<CustomTokenMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const canCheck = useMemo(() => isAddress(address.trim()), [address]);

  useEffect(() => {
    if (!open) {
      setAddress('');
      setMetadata(null);
      setError(null);
      setIsChecking(false);
    }
  }, [open]);

  useEffect(() => {
    setMetadata(null);
    setError(null);
  }, [address]);

  const handlePreview = async () => {
    setIsChecking(true);
    setError(null);
    setMetadata(null);
    try {
      const result = await readMetadata(address);
      setMetadata(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Token không hợp lệ trên BNB Smart Chain.');
    } finally {
      setIsChecking(false);
    }
  };

  const handleAdd = async () => {
    if (!metadata) return;
    await addToken.mutateAsync(metadata);
    onAdded?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>Thêm token BEP-20</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Chỉ thêm token trên BNB Smart Chain Mainnet. Hãy kiểm tra đúng contract để tránh token giả mạo.
          </div>

          <div className="space-y-2">
            <Label htmlFor="custom-token-address">Contract token</Label>
            <Input
              id="custom-token-address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="0x..."
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="font-mono text-sm"
            />
          </div>

          {error && (
            <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {metadata && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <div className="min-w-0">
                  <p className="font-semibold text-emerald-900">{metadata.symbol}</p>
                  <p className="truncate text-sm text-emerald-800">{metadata.name}</p>
                  <p className="mt-1 text-xs text-emerald-700">Decimals: {metadata.decimals}</p>
                  <p className="mt-1 break-all font-mono text-[11px] text-emerald-700">{metadata.address}</p>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            {!metadata ? (
              <Button onClick={handlePreview} disabled={!canCheck || isChecking}>
                {isChecking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Kiểm tra token
              </Button>
            ) : (
              <Button onClick={handleAdd} disabled={addToken.isPending}>
                {addToken.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Thêm token
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
