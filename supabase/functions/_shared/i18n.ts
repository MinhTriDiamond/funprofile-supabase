// Shared i18n helper for Supabase Edge Functions (emails, notifications).
// Frontend has its own i18n in `src/i18n/translations.ts`. This file mirrors only
// the small set of strings used in server-side outputs.

export type EdgeLang = 'vi' | 'en';

type Dict = Record<string, string>;

const dictionaries: Record<EdgeLang, Dict> = {
  vi: {
    'email.verify.subject': 'Xác thực email FUN Profile',
    'email.verify.greeting': 'Chào {name},',
    'email.verify.body': 'Vui lòng nhấn nút bên dưới để xác thực địa chỉ email của bạn.',
    'email.verify.cta': 'Xác thực email',

    'email.reset.subject': 'Đặt lại mật khẩu FUN Profile',
    'email.reset.body': 'Bạn đã yêu cầu đặt lại mật khẩu. Liên kết có hiệu lực trong 30 phút.',
    'email.reset.cta': 'Đặt lại mật khẩu',

    'email.guardian.subject': '{inviter} mời bạn làm Guardian',
    'email.guardian.body': '{inviter} đã mời bạn trở thành Guardian trong hệ thống Identity của họ.',
    'email.guardian.cta': 'Xem lời mời',

    'email.claimReady.subject': 'Phần thưởng FUN của bạn đã sẵn sàng',
    'email.claimReady.body': 'Epoch {epoch}: Bạn có {amount} FUN có thể nhận ngay.',
    'email.claimReady.cta': 'Nhận thưởng',

    'email.footer': 'Bạn nhận email này vì đã đăng ký FUN Profile. Nếu không phải bạn, có thể bỏ qua email này.',
  },
  en: {
    'email.verify.subject': 'Verify your FUN Profile email',
    'email.verify.greeting': 'Hi {name},',
    'email.verify.body': 'Please click the button below to verify your email address.',
    'email.verify.cta': 'Verify email',

    'email.reset.subject': 'Reset your FUN Profile password',
    'email.reset.body': 'You requested a password reset. This link expires in 30 minutes.',
    'email.reset.cta': 'Reset password',

    'email.guardian.subject': '{inviter} invited you as a Guardian',
    'email.guardian.body': '{inviter} invited you to become a Guardian in their Identity setup.',
    'email.guardian.cta': 'View invitation',

    'email.claimReady.subject': 'Your FUN rewards are ready',
    'email.claimReady.body': 'Epoch {epoch}: You can claim {amount} FUN now.',
    'email.claimReady.cta': 'Claim rewards',

    'email.footer': 'You received this email because you signed up for FUN Profile. If this was not you, you may safely ignore it.',
  },
};

const interpolate = (template: string, params?: Record<string, string | number>) => {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => {
    const v = params[k];
    return v === undefined || v === null ? `{${k}}` : String(v);
  });
};

export function tEdge(
  lang: EdgeLang | string | null | undefined,
  key: string,
  params?: Record<string, string | number>,
): string {
  const safeLang: EdgeLang = lang === 'en' ? 'en' : 'vi';
  const dict = dictionaries[safeLang];
  const raw = dict[key] ?? dictionaries.en[key] ?? key;
  return interpolate(raw, params);
}

/** Resolve a user's preferred language from Supabase profile. */
export async function resolveUserLanguage(
  supabase: { from: (t: string) => any },
  userId: string,
): Promise<EdgeLang> {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('preferred_language')
      .eq('user_id', userId)
      .maybeSingle();
    const lang = data?.preferred_language;
    return lang === 'en' ? 'en' : 'vi';
  } catch {
    return 'vi';
  }
}
