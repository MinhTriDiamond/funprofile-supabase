import type { TParams } from '@/i18n/LanguageContext';

type Translate = (key: string, params?: TParams) => string;

export interface ComposerPlaceholderUser {
  display_name?: string | null;
  full_name?: string | null;
}

export function getComposerPlaceholder(user: ComposerPlaceholderUser | null | undefined, t: Translate) {
  const name = (user?.display_name || user?.full_name || '').trim();
  if (name) {
    return t('createPostPlaceholderUser', { name });
  }

  return t('createPostPlaceholder');
}
