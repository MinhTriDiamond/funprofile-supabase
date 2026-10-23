import { useState } from 'react';
import { FacebookNavbar } from '@/components/layout/FacebookNavbar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { BackToHomeBar } from '@/components/layout/BackToHome';
import { Shield } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';

interface PolicySection {
  title: string;
  body: string[];
  bullets?: string[];
}

const EFFECTIVE_DATE = 'October 23, 2026';
const EFFECTIVE_DATE_VI = '23 tháng 10 năm 2026';
const CONTACT_EMAIL = 'leminhtri.diamond@gmail.com';

const SECTIONS_EN: PolicySection[] = [
  {
    title: '1. Who we are',
    body: [
      'FUN Profile (fun.rich) is a community platform of the FUN Ecosystem where members connect, share, learn together and support community activities. This Privacy Policy explains what information we collect, how we use it, and the choices you have. It applies to the FUN Profile website at fun.rich.',
      `If you have any questions about this policy, contact us at ${CONTACT_EMAIL}.`,
    ],
  },
  {
    title: '2. Information we collect',
    body: ['We collect the following kinds of information when you use FUN Profile:'],
    bullets: [
      'Account information: your name, email address, username, profile photo and other profile details you choose to provide. If you sign in with Google, we receive your name, email address and profile photo from Google.',
      'Content and activity: posts, comments, photos, videos and other content you share, the communities you join, and your interactions on the platform.',
      'Wallet and transaction information: the public blockchain wallet addresses you link to your profile, and the donations or transfers associated with those addresses. Blockchain transactions are public by nature and can be viewed by anyone on the blockchain.',
      'Technical and security information: device and browser information, IP address, sign-in sessions and their timestamps. We use this to operate the platform and to protect accounts.',
    ],
  },
  {
    title: '3. How we use information',
    body: ['We use the information we collect to:'],
    bullets: [
      'Provide and operate FUN Profile, including accounts, profiles, feeds and communities.',
      'Display donations and community honor boards, as part of the transparency design of the platform.',
      'Keep accounts and the community safe: preventing fraud, impersonation and abuse, and protecting the sign-in process.',
      'Send essential service emails, such as verification codes, password reset messages and security notices.',
      'Maintain and improve the platform.',
    ],
  },
  {
    title: '4. What is public on FUN Profile',
    body: [
      'FUN Profile is built for openness and transparency. Your profile, the content you post publicly, and your donation and gift history connected to your public wallet addresses are visible to other members and, in some areas, to visitors who are not signed in. Please do not share anything in public areas that you do not want others to see.',
    ],
  },
  {
    title: '5. Sharing with service providers',
    body: [
      'We do not sell your personal information. We rely on trusted service providers only to run the platform, and they process information only as needed to provide their services:',
    ],
    bullets: [
      'Supabase - database and sign-in infrastructure.',
      'Cloudflare - website hosting, security and abuse prevention.',
      'Resend - delivery of service emails.',
      'Blockchain data providers such as Alchemy - reading public blockchain data.',
      'Google - only when you choose to sign in with Google.',
    ],
  },
  {
    title: '6. Cookies and local storage',
    body: [
      'We use essential cookies and browser local storage to keep you signed in and to remember your preferences, such as language and display settings. We do not use advertising trackers.',
    ],
  },
  {
    title: '7. Data retention',
    body: [
      'We keep account information while your account is active. Security logs are kept for a limited period to protect the community. Records written to a public blockchain are permanent and cannot be changed or erased by anyone, including us.',
    ],
  },
  {
    title: '8. Your rights and choices',
    body: [
      `You can review and update most of your profile information in your account settings at any time. You may also ask us to access, correct or delete your personal information, or to delete your account, by emailing ${CONTACT_EMAIL}. We will respond within a reasonable time. Deleting your account does not remove records that exist on public blockchains.`,
    ],
  },
  {
    title: '9. Children',
    body: [
      'FUN Profile is not directed to children under 13, and we do not knowingly collect personal information from them.',
    ],
  },
  {
    title: '10. Changes to this policy',
    body: [
      'We may update this Privacy Policy from time to time. When we do, the updated version will be posted on this page with a new effective date.',
    ],
  },
];

const SECTIONS_VI: PolicySection[] = [
  {
    title: '1. Chúng tôi là ai',
    body: [
      'FUN Profile (fun.rich) là nền tảng cộng đồng của FUN Ecosystem, nơi các thành viên kết nối, chia sẻ, học tập cùng nhau và đồng hành trong các hoạt động cộng đồng. Chính sách bảo mật này giải thích chúng tôi thu thập những thông tin nào, sử dụng ra sao và bạn có những lựa chọn gì. Chính sách áp dụng cho website FUN Profile tại fun.rich.',
      `Nếu bạn có câu hỏi về chính sách này, hãy liên hệ chúng tôi qua ${CONTACT_EMAIL}.`,
    ],
  },
  {
    title: '2. Thông tin chúng tôi thu thập',
    body: ['Khi bạn sử dụng FUN Profile, chúng tôi thu thập các loại thông tin sau:'],
    bullets: [
      'Thông tin tài khoản: họ tên, địa chỉ email, tên người dùng, ảnh đại diện và các thông tin hồ sơ khác do bạn tự cung cấp. Nếu bạn đăng nhập bằng Google, chúng tôi nhận họ tên, địa chỉ email và ảnh đại diện của bạn từ Google.',
      'Nội dung và hoạt động: bài viết, bình luận, hình ảnh, video và các nội dung khác bạn chia sẻ, các cộng đồng bạn tham gia và tương tác của bạn trên nền tảng.',
      'Thông tin ví và giao dịch: các địa chỉ ví blockchain công khai mà bạn liên kết với hồ sơ của mình, cùng các khoản ủng hộ hoặc chuyển khoản gắn với những địa chỉ đó. Giao dịch trên blockchain vốn có tính công khai và bất kỳ ai cũng có thể xem trên blockchain.',
      'Thông tin kỹ thuật và bảo mật: thông tin thiết bị và trình duyệt, địa chỉ IP, các phiên đăng nhập và thời gian của chúng. Chúng tôi dùng các thông tin này để vận hành nền tảng và bảo vệ tài khoản.',
    ],
  },
  {
    title: '3. Cách chúng tôi sử dụng thông tin',
    body: ['Chúng tôi sử dụng thông tin thu thập được để:'],
    bullets: [
      'Cung cấp và vận hành FUN Profile, bao gồm tài khoản, hồ sơ, bảng tin và các cộng đồng.',
      'Hiển thị các khoản ủng hộ và bảng vinh danh cộng đồng, theo thiết kế minh bạch của nền tảng.',
      'Giữ an toàn cho tài khoản và cộng đồng: ngăn chặn gian lận, mạo danh và lạm dụng, đồng thời bảo vệ quá trình đăng nhập.',
      'Gửi các email dịch vụ cần thiết, như mã xác minh, thư đặt lại mật khẩu và thông báo bảo mật.',
      'Duy trì và cải thiện nền tảng.',
    ],
  },
  {
    title: '4. Những gì được công khai trên FUN Profile',
    body: [
      'FUN Profile được xây dựng theo hướng cởi mở và minh bạch. Hồ sơ của bạn, nội dung bạn đăng công khai, cùng lịch sử ủng hộ và tặng quà gắn với các địa chỉ ví công khai của bạn sẽ hiển thị cho các thành viên khác và, ở một số khu vực, cho cả khách chưa đăng nhập. Vì vậy, bạn không nên chia sẻ ở khu vực công khai những điều bạn không muốn người khác nhìn thấy.',
    ],
  },
  {
    title: '5. Chia sẻ với các nhà cung cấp dịch vụ',
    body: [
      'Chúng tôi không bán thông tin cá nhân của bạn. Chúng tôi chỉ sử dụng các nhà cung cấp dịch vụ đáng tin cậy để vận hành nền tảng, và họ chỉ xử lý thông tin trong phạm vi cần thiết cho dịch vụ của mình:',
    ],
    bullets: [
      'Supabase - hạ tầng cơ sở dữ liệu và đăng nhập.',
      'Cloudflare - lưu trữ website, bảo mật và chống lạm dụng.',
      'Resend - gửi các email dịch vụ.',
      'Các nhà cung cấp dữ liệu blockchain như Alchemy - đọc dữ liệu blockchain công khai.',
      'Google - chỉ khi bạn chọn đăng nhập bằng Google.',
    ],
  },
  {
    title: '6. Cookie và bộ nhớ trình duyệt',
    body: [
      'Chúng tôi sử dụng cookie cần thiết và bộ nhớ cục bộ của trình duyệt để giữ bạn luôn đăng nhập và ghi nhớ các tùy chọn như ngôn ngữ và giao diện hiển thị. Chúng tôi không sử dụng công cụ theo dõi quảng cáo.',
    ],
  },
  {
    title: '7. Thời gian lưu trữ dữ liệu',
    body: [
      'Chúng tôi lưu giữ thông tin tài khoản trong thời gian tài khoản của bạn còn hoạt động. Nhật ký bảo mật được giữ trong một khoảng thời gian giới hạn để bảo vệ cộng đồng. Các bản ghi đã viết lên blockchain công khai là vĩnh viễn và không ai, kể cả chúng tôi, có thể thay đổi hay xóa bỏ.',
    ],
  },
  {
    title: '8. Quyền và lựa chọn của bạn',
    body: [
      `Bạn có thể xem và cập nhật phần lớn thông tin hồ sơ trong phần cài đặt tài khoản bất cứ lúc nào. Bạn cũng có thể yêu cầu chúng tôi truy cập, chỉnh sửa hoặc xóa thông tin cá nhân của bạn, hoặc xóa tài khoản, bằng cách gửi email tới ${CONTACT_EMAIL}. Chúng tôi sẽ phản hồi trong thời gian hợp lý. Việc xóa tài khoản không xóa được các bản ghi đã tồn tại trên các blockchain công khai.`,
    ],
  },
  {
    title: '9. Trẻ em',
    body: [
      'FUN Profile không hướng tới trẻ em dưới 13 tuổi và chúng tôi không cố ý thu thập thông tin cá nhân của các em.',
    ],
  },
  {
    title: '10. Thay đổi chính sách này',
    body: [
      'Chúng tôi có thể cập nhật Chính sách bảo mật này theo thời gian. Khi có thay đổi, phiên bản mới sẽ được đăng trên chính trang này kèm ngày hiệu lực mới.',
    ],
  },
];

const PrivacyPolicy = () => {
  const { language } = useLanguage();
  const [lang, setLang] = useState<'en' | 'vi'>(language === 'vi' ? 'vi' : 'en');
  const isVi = lang === 'vi';
  const sections = isVi ? SECTIONS_VI : SECTIONS_EN;

  return (
    <div className="min-h-screen overflow-hidden">
      <FacebookNavbar />
      <main data-app-scroll className="app-main app-pb-nav">
        <div className="bg-gradient-to-r from-primary via-primary/90 to-gold py-14 px-4 sm:px-8 lg:px-16">
          <div className="max-w-3xl mx-auto text-center text-white">
            <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
              <Shield className="w-10 h-10" />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-3">
              {isVi ? 'Chính sách bảo mật' : 'Privacy Policy'}
            </h1>
            <p className="text-lg text-white/90">
              {isVi
                ? `Ngày hiệu lực: ${EFFECTIVE_DATE_VI}`
                : `Effective date: ${EFFECTIVE_DATE}`}
            </p>
            <div className="mt-6 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setLang('en')}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                  !isVi ? 'bg-white text-primary' : 'bg-white/20 text-white hover:bg-white/30'
                }`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => setLang('vi')}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                  isVi ? 'bg-white text-primary' : 'bg-white/20 text-white hover:bg-white/30'
                }`}
              >
                Tiếng Việt
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 sm:px-8 py-8">
          <div className="mb-6"><BackToHomeBar /></div>
          <div className="bg-white/80 rounded-xl shadow-sm p-6 sm:p-8">
            {sections.map((section) => (
              <section key={section.title} className="mb-8 last:mb-0">
                <h2 className="text-xl font-bold mb-3">{section.title}</h2>
                {section.body.map((paragraph, i) => (
                  <p key={i} className="text-muted-foreground leading-relaxed mb-3">
                    {paragraph}
                  </p>
                ))}
                {section.bullets && (
                  <ul className="list-disc pl-6 space-y-2 text-muted-foreground leading-relaxed">
                    {section.bullets.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </div>
      </main>
      <MobileBottomNav />
    </div>
  );
};

export default PrivacyPolicy;
