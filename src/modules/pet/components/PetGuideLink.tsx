import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface PetGuideLinkProps {
  className?: string;
}

/**
 * Nút "​" dùng chung cho mọi trang Pet (/pet, /pet/shop,
 * /pet/arena, /pet/appeal) và PetSettingsDialog.
 *
 * Nhãn cố định tiếng Việt để đồng bộ với toàn bộ module Pet (PetRiskBanner,
 * PetAppealPage… đều hard-code vi). Không dùng i18n để tránh lệch ngôn ngữ.
 */
export function PetGuideLink({ className }: PetGuideLinkProps) {
  return (
    <Link
      to="/docs/pet-game-guide"
      className={cn(
        'text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1',
        className,
      )}
    >
      ​
    </Link>
  );
}
