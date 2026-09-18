import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { FollowButton } from './FollowButton';
import { AvatarViewer } from '@/components/ui/AvatarViewer';
import { ShareReelDialog } from './ShareReelDialog';
import { PostContextMenu } from '@/components/feed/PostContextMenu';
import { useLongPress } from '@/hooks/useLongPress';
import type { Reel } from '@/hooks/useReels';

interface ReelInfoProps {
  reel: Reel;
}

const ReelInfo = ({ reel }: ReelInfoProps) => {
  const navigate = useNavigate();
  const profile = reel.profiles;
  const [showAvatarViewer, setShowAvatarViewer] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const canExpandCaption = (reel.caption?.length || 0) > 90;

  const shareUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/reels/${reel.id}`;
  const longPress = useLongPress(() => setMenuOpen(true), { delay: 350 });

  return (
    <div className="absolute bottom-[calc(var(--mbn-h)+var(--safe-bottom)+1rem)] left-4 right-24 z-10">
      {/* Creator info */}
      <div className="flex items-center gap-3 mb-3">
        <button onClick={() => setShowAvatarViewer(true)}>
          <Avatar className="w-10 h-10 border-2 border-white/50">
            <AvatarImage src={profile.avatar_url || ''} />
            <AvatarFallback className="text-xs bg-primary text-primary-foreground">
              {profile.username?.[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </button>
        <button
          onClick={() => navigate(`/profile/${profile.id}`)}
          className="text-white font-semibold text-sm drop-shadow-lg"
        >
          @{profile.username}
        </button>
        <FollowButton userId={profile.id} />
      </div>

      {/* Caption */}
      {reel.caption && (
        <div
          className="text-white text-sm drop-shadow-lg select-text"
          {...longPress}
        >
          <p className={captionExpanded ? '' : 'line-clamp-2'}>{reel.caption}</p>
          {canExpandCaption && (
            <button
              type="button"
              onClick={() => setCaptionExpanded((value) => !value)}
              className="mt-1 text-xs font-semibold text-white/80"
            >
              {captionExpanded ? 'Thu gọn' : 'Xem thêm'}
            </button>
          )}
        </div>
      )}

      {/* Audio info */}
      {reel.audio_name && (
        <div className="flex items-center gap-2 mt-2">
          <span className="text-white/70 text-xs">🎵 {reel.audio_name}{reel.audio_artist ? ` - ${reel.audio_artist}` : ''}</span>
        </div>
      )}
      <AvatarViewer
        imageUrl={profile.avatar_url}
        isOpen={showAvatarViewer}
        onClose={() => setShowAvatarViewer(false)}
        fallbackText={profile.username?.[0]?.toUpperCase()}
      />

      <PostContextMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        content={reel.caption || ''}
        shareUrl={shareUrl}
        onShare={() => setShareOpen(true)}
        title="Tùy chọn video"
      />

      <ShareReelDialog
        reelId={reel.id}
        reelSlug={reel.id}
        reelUsername={profile.username || ''}
        open={shareOpen}
        onOpenChange={setShareOpen}
      />
    </div>
  );
};

export default ReelInfo;
