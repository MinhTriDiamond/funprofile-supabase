import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Wallet, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useQueryClient } from '@tanstack/react-query';
import { useAccount, useSignMessage, useDisconnect } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';

interface LinkWalletDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LinkWalletDialog({ open, onOpenChange }: LinkWalletDialogProps) {
  const { userId } = useCurrentUser();
  const queryClient = useQueryClient();
  const [walletAddress, setWalletAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const autoSignRef = useRef(false);

  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { signMessageAsync, isPending: isSigning } = useSignMessage();
  const { disconnect } = useDisconnect();

  const isValidAddress = /^0x[a-fA-F0-9]{40}$/.test(walletAddress);

  // Auto-sign when wallet connects and matches pasted address
  useEffect(() => {
    if (
      isConnected &&
      address &&
      walletAddress &&
      address.toLowerCase() === walletAddress.toLowerCase() &&
      autoSignRef.current
    ) {
      autoSignRef.current = false;
      handleSignAndLink();
    }
  }, [isConnected, address]);

  const handleSignAndLink = async () => {
    if (!userId || !walletAddress) return;
    setLoading(true);
    try {
      // Log start (client-safe)
      await supabase.from('account_activity_logs').insert({
        user_id: userId,
        action: 'wallet_link_started',
        details: { wallet_address: walletAddress },
      });

      // Create message and sign
      const nonce = Math.random().toString(36).substring(2, 15);
      const timestamp = new Date().toISOString();
      const message = `Link wallet to FUN Profile\n\nWallet: ${walletAddress}\nNonce: ${nonce}\nTimestamp: ${timestamp}`;

      const signature = await signMessageAsync({
        message,
        account: walletAddress as `0x${string}`,
      });

      // Call edge function with signature
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Chưa đăng nhập');

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/connect-external-wallet`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ wallet_address: walletAddress, signature, message }),
        }
      );

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Không thể liên kết ví');

      // Invalidate cache
      queryClient.invalidateQueries({ queryKey: ['profile-security', userId] });

      setSuccess(true);
      toast.success('Liên kết ví thành công!');
    } catch (err: any) {
      const errName = (err as { name?: string })?.name;
      if (errName === 'UserRejectedRequestError' || err?.message?.includes('rejected')) {
        toast.error('Bạn đã từ chối ký xác thực');
      } else {
        toast.error(err.message || 'Có lỗi xảy ra');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !isValidAddress) return;

    autoSignRef.current = true;

    // If already connected with matching address, sign immediately
    if (isConnected && address?.toLowerCase() === walletAddress.toLowerCase()) {
      autoSignRef.current = false;
      handleSignAndLink();
    } else {
      // Disconnect any existing connection, then open modal
      if (isConnected) disconnect();
      if (openConnectModal) openConnectModal();
    }
  };

  const handleClose = () => {
    setWalletAddress('');
    setSuccess(false);
    onOpenChange(false);
  };

  if (success) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
              <ShieldCheck className="w-8 h-8 text-emerald-600" />
            </div>
            <h3 className="text-lg font-bold text-foreground">Liên kết ví thành công!</h3>
            <p className="text-sm text-muted-foreground text-center">
              Bạn đã có thể đăng nhập bằng ví Web3.
            </p>
            <Button variant="ghost" onClick={handleClose}>
              Đóng
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5" />
            Liên kết ví
          </DialogTitle>
          <DialogDescription>
            Dán địa chỉ ví Web3, sau đó ký xác thực để liên kết
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Địa chỉ ví (EVM)</Label>
            <Input
              type="text"
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value.trim())}
              placeholder="0x..."
              className="font-mono text-sm"
              required
            />
            {walletAddress && !isValidAddress && (
              <p className="text-xs text-destructive">
                Địa chỉ ví không hợp lệ. Định dạng: 0x... (42 ký tự)
              </p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={!isValidAddress || loading || isSigning}>
            {loading || isSigning ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {isSigning ? 'Đang ký xác thực...' : 'Đang liên kết...'}
              </>
            ) : (
              'Kết nối ví & Ký xác thực'
            )}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Bạn sẽ cần kết nối ví và ký một tin nhắn để xác thực quyền sở hữu.
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
