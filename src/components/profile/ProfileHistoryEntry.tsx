/**
 * ProfileHistoryEntry — nút "Lịch sử giao dịch" trên ProfileHeader.
 * Luôn điều hướng full page /profile/:username/history (Unified).
 */
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { History } from 'lucide-react';

interface Props {
  userId: string;
  walletAddress?: string;
  userDisplayName?: string | null;
  userAvatarUrl?: string | null;
  username?: string | null;
  userCreatedAt?: string;
}

export function ProfileHistoryEntry({ username }: Props) {
  if (!username) {
    return (
      <Button variant="outline" className="h-10 px-4 font-semibold" disabled title="Không xác định username">
        <History className="mr-2 h-4 w-4" />
        Lịch sử giao dịch
      </Button>
    );
  }

  return (
    <Button variant="outline" className="h-10 px-4 font-semibold" asChild>
      <Link to={`/profile/${username}/history`}>
        <History className="mr-2 h-4 w-4" />
        Lịch sử giao dịch
      </Link>
    </Button>
  );
}
