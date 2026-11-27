import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Globe, Lock, Users, Play, ImagePlus, ThumbsUp, MessageCircle, Share2 } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import type { DraftAttachment } from '@/modules/feed/types';

interface Props {
  name: string;
  avatar?: string | null;
  content: string;
  privacy: string;
  attachments: DraftAttachment[];
  context?: string;
}
/** Read-only local preview; never uploads, plays media, or creates a post. */
export function PostComposerPreview({ name, avatar, content, privacy, attachments, context }: Props) {
  const { t } = useLanguage();
  const Icon = privacy === 'private' ? Lock : privacy === 'friends' ? Users : Globe;
  const label = t(privacy === 'private' ? 'privacyOnlyMe' : privacy === 'friends' ? 'privacyFriends' : 'privacyPublic');
  const visible = [...attachments].sort((a, b) => a.sortOrder - b.sortOrder).slice(0, 5);
  return <section className="composer-preview" aria-label={t('fcpPostPreview')}>
    <div className="mx-auto w-full max-w-[640px]">
      <h2 className="mb-4 text-lg font-semibold text-foreground">{t('fcpPostPreview')}</h2>
      <article data-testid="composer-preview-card" className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex items-center gap-3 p-4">
          <Avatar className="h-10 w-10 shrink-0"><AvatarImage src={avatar || undefined} sizeHint="sm" alt="" /><AvatarFallback>{name[0]?.toUpperCase()}</AvatarFallback></Avatar>
          <div className="min-w-0"><p className="break-words font-semibold">{name}</p><p className="flex items-center gap-1.5 text-xs text-muted-foreground">{t('justNow')} · <Icon className="h-3.5 w-3.5" /><span>{label}</span></p></div>
        </div>
        {context && <p className="px-4 pb-2 text-sm text-muted-foreground">{context}</p>}
        <p data-testid="composer-preview-text" className="whitespace-pre-wrap break-words px-4 pb-4 text-[15px] leading-relaxed [overflow-wrap:anywhere]">{content || t('fcpPreviewEmpty')}</p>
        {visible.length > 0 && <div className={`grid gap-px bg-border ${visible.length === 1 ? 'grid-cols-1' : visible.length >= 5 ? 'grid-cols-6' : 'grid-cols-2'}`}>
          {visible.map((a, index) => {
            const lead = visible.length === 3 && index === 0;
            const src = a.kind === 'video' ? a.thumbnailUrl : a.previewUrl || a.fileUrl;
            return <div key={a.id} className={`relative flex min-w-0 items-center justify-center overflow-hidden bg-muted ${lead ? 'col-span-2 aspect-video' : visible.length === 1 ? 'aspect-video' : visible.length >= 5 ? index < 2 ? 'col-span-3 aspect-square' : 'col-span-2 aspect-square' : 'aspect-square'}`}>
              {src ? <img loading="lazy" decoding="async" src={src} alt={a.altText || t('fcpPreviewMedia', { index: index + 1 })} className="h-full w-full object-contain" /> : <ImagePlus className="h-10 w-10 text-muted-foreground" />}
              {a.kind === 'video' && <span className="absolute flex h-12 w-12 items-center justify-center rounded-full bg-media/75 text-media-foreground"><Play className="h-6 w-6 fill-current" /></span>}
              {index === 4 && attachments.length > 5 && <span className="absolute bottom-2 right-2 rounded-full bg-media/80 px-3 py-1 font-semibold text-media-foreground">+{attachments.length - 5}</span>}
            </div>;
          })}
        </div>}
        <div aria-hidden="true" className="flex justify-around gap-3 border-t border-border p-3 text-sm text-muted-foreground">
          {[{ Icon: ThumbsUp, key: 'like' }, { Icon: MessageCircle, key: 'comment' }, { Icon: Share2, key: 'share' }].map(({ Icon: ActionIcon, key }) => <span key={key} className="flex items-center gap-2"><ActionIcon className="h-4 w-4" />{t(key)}</span>)}
        </div>
      </article>
      <p className="mt-3 text-xs text-muted-foreground">{t('fcpPreviewHint')}</p>
    </div>
  </section>;
}
