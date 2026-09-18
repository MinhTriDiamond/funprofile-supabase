import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Book, Share2, Home } from 'lucide-react';

const ANGEL_LOGO = '/angel-ai-logo-128.png';

const MasterCharterDocs = () => {
  const navigate = useNavigate();

  const fontStyles = {
    heading: "'Cormorant Garamond', Georgia, serif",
    body: "'Lora', Georgia, serif",
  };

  const divineMantras = [
    { vi: 'Con l� �nh S�ng Y�u Thương Thuần Khiết của Cha Vũ Trụ.', en: 'I am the Pure Loving Light of the Cosmic Father.' },
    { vi: 'Con l� � Ch� của Cha Vũ Trụ.', en: 'I am the Will of the Cosmic Father.' },
    { vi: 'Con l� Tr� Tuệ của Cha Vũ Trụ.', en: 'I am the Wisdom of the Cosmic Father.' },
    { vi: 'Con l� Hạnh Ph�c.', en: 'I am Happiness.' },
    { vi: 'Con l� T�nh Y�u.', en: 'I am Love.' },
    { vi: 'Con l� Tiền của Cha.', en: 'I am the Money of the Father.' },
    { vi: 'Con xin S�m Hối S�m Hối S�m Hối.', en: 'I repent, I repent, I repent.' },
    { vi: 'Con xin Biết Ơn Biết Ơn Biết Ơn, trong �nh S�ng Y�u Thương Thuần Khiết của Cha Vũ Trụ.', en: 'I am grateful, I am grateful, I am grateful, in the Pure Loving Light of the Cosmic Father.' },
  ];

  const platforms = [
    'FUN Profile – Web3 Social Network',
    'FUN Play – Web3 Video Platform',
    'FUN Planet – Game Marketplace for Kids',
    'FUNLife / Cosmic Game – Simulation of Life 5D',
    'FUN Academy – Learn & Earn Education Platform',
    'FUN Charity – Pure Love Charity Network',
    'FUN Wallet – Our Own Bank of Light Economy',
    'FUN Farm – Farm to Table Abundance Platform',
    'FUN Market – Marketplace of Light',
    'FUN Legal – Cosmic Laws for New Earth',
    'FUN Earth / Green Earth – Regeneration & Sustainability Platform',
    'Angel AI – Light-Aligned Artificial Intelligence',
  ];

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: 'Hiến Ph�p Gốc - FUN Ecosystem',
        text: 'Nền Kinh Tế �nh S�ng 5D của Tr�i Đất Mới',
        url: window.location.href,
      });
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Pearl White to Soft Yellow Gradient Background */}
      <div className="fixed inset-0 z-0" style={{
        background: 'linear-gradient(180deg, #FFFEF7 0%, #FFF9E6 30%, #FFF5D6 60%, #FFFDF5 100%)'
      }} />
      
      {/* Divine Light Rays from Top */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[200%] h-[50vh] md:h-[70vh] z-0 pointer-events-none" style={{
        background: 'conic-gradient(from 180deg at 50% 0%, transparent 25%, rgba(212,175,55,0.15) 30%, rgba(255,255,255,0.4) 35%, rgba(212,175,55,0.15) 40%, transparent 45%, transparent 55%, rgba(212,175,55,0.12) 60%, rgba(255,255,255,0.35) 65%, rgba(212,175,55,0.12) 70%, transparent 75%)',
        filter: 'blur(3px)'
      }} />

      {/* Central Halo Effect */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[300px] md:w-[500px] h-[300px] md:h-[500px] z-0 pointer-events-none" style={{
        background: 'radial-gradient(circle, rgba(212,175,55,0.25) 0%, rgba(255,215,0,0.15) 40%, transparent 70%)',
        filter: 'blur(50px)'
      }} />

      {/* Main Content */}
      <div className="relative z-10 min-h-screen py-6 md:py-12 px-3 md:px-4">
        <div className="max-w-4xl mx-auto">
          {/* Navigation */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
            <Button
              variant="ghost"
              onClick={() => navigate('/')}
              className="text-[#B8860B] hover:text-[#D4AF37] hover:bg-[#D4AF37]/10"
            >
              <Home className="w-4 h-4 mr-2" />
              Về Trang Chủ
            </Button>
            <Button
              variant="ghost"
              onClick={() => navigate('/law-of-light?view=true')}
              className="text-[#B8860B] hover:text-[#D4AF37] hover:bg-[#D4AF37]/10"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Quay về Luật �nh S�ng
            </Button>
            <Button
              variant="ghost"
              onClick={handleShare}
              className="text-[#B8860B] hover:text-[#D4AF37] hover:bg-[#D4AF37]/10"
            >
              <Share2 className="w-4 h-4 mr-2" />
              Chia sẻ
            </Button>
          </div>

          {/* Header */}
          <div className="text-center mb-8 md:mb-12">
            <div className="inline-flex items-center justify-center w-20 h-20 md:w-28 md:h-28 rounded-full mb-4 md:mb-6 overflow-hidden" style={{
              background: 'radial-gradient(circle, rgba(212,175,55,0.3) 0%, rgba(255,255,255,0.9) 60%, transparent 80%)',
              boxShadow: '0 0 80px rgba(212,175,55,0.4), 0 0 120px rgba(255,255,255,0.6)',
              border: '3px solid rgba(212,175,55,0.5)'
            }}>
              <img src={ANGEL_LOGO} alt="Angel" className="w-full h-full object-cover object-[center_25%]" />
            </div>

            <div className="flex items-center justify-center gap-2 mb-2">
              <Book className="w-6 h-6 text-[#D4AF37]" />
              <span style={{ fontFamily: fontStyles.body, color: '#B8860B', fontSize: '0.9rem' }}>
                T�i Liệu Thi�ng Li�ng
              </span>
            </div>
            
            <h1 style={{
              fontFamily: fontStyles.heading,
              fontSize: 'clamp(2rem, 8vw, 3.5rem)',
              fontWeight: 600,
              background: 'linear-gradient(135deg, #D4AF37 0%, #FFD700 30%, #D4AF37 50%, #B8860B 70%, #D4AF37 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              marginBottom: '0.5rem'
            }}>
              HIẾN PH�P GỐC
            </h1>
            <p style={{
              fontFamily: fontStyles.heading,
              fontSize: 'clamp(1rem, 2.5vw, 1.3rem)',
              fontWeight: 500,
              letterSpacing: '0.15em',
              color: '#B8860B',
            }}>
              MASTER CHARTER OF FUN ECOSYSTEM
            </p>
            <p className="mt-4" style={{
              fontFamily: fontStyles.body,
              fontSize: 'clamp(0.95rem, 2vw, 1.1rem)',
              color: '#8B7355',
            }}>
              Nền Kinh Tế �nh S�ng 5D của Tr�i Đất Mới
            </p>
            <p style={{
              fontFamily: fontStyles.body,
              fontSize: 'clamp(0.9rem, 2vw, 1rem)',
              color: '#A08060',
              marginTop: '0.5rem'
            }}>
              Free to Join • Free to Use • Earn Together • With Pure Love
            </p>

            {/* Golden Divider */}
            <div className="w-32 md:w-48 h-1 mx-auto mt-6 rounded-full" style={{
              background: 'linear-gradient(90deg, transparent, #D4AF37, #FFD700, #D4AF37, transparent)',
              boxShadow: '0 0 10px rgba(212,175,55,0.5)'
            }} />
          </div>

          {/* Main Content Card */}
          <div className="relative rounded-2xl md:rounded-3xl p-4 sm:p-6 md:p-8 lg:p-12" style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(255,250,240,0.9) 100%)',
            border: '2px solid rgba(212,175,55,0.5)',
            boxShadow: '0 10px 60px rgba(212,175,55,0.15), inset 0 0 60px rgba(255,255,255,0.5)'
          }}>

            {/* Chapter I */}
            <section className="mb-10">
              <h2 className="mb-4" style={{
                fontFamily: fontStyles.heading,
                fontSize: 'clamp(1.4rem, 3.5vw, 1.8rem)',
                fontWeight: 600,
                color: '#D4AF37'
              }}>🌍 I. TUY�N NG�N VỀ NGUỒN GỐC</h2>
              
              <div style={{ fontFamily: fontStyles.body, fontSize: 'clamp(1rem, 2vw, 1.15rem)', lineHeight: '2', color: '#5D4E37' }}>
                <p className="mb-4">FUN Ecosystem kh�ng chỉ l� một doanh nghiệp.</p>
                <p className="mb-4">FUN Ecosystem kh�ng chỉ l� một xu hướng tiền m� ho�.</p>
                <p className="mb-4">FUN Ecosystem lớn hơn cả một tập đo�n.</p>
                <p className="mb-4 font-semibold" style={{ color: '#B8860B' }}>FUN Ecosystem l�:</p>
                <ul className="space-y-2 ml-4 mb-4">
                  <li className="flex gap-2"><span className="text-[#D4AF37]">✨</span> Một nền văn minh �nh S�ng sống động</li>
                  <li className="flex gap-2"><span className="text-[#D4AF37]">✨</span> Một hệ sinh th�i kinh tế mới của Tr�i Đất 5D</li>
                  <li className="flex gap-2"><span className="text-[#D4AF37]">✨</span> Một nền kinh tế chia sẻ – kết nối – thịnh vượng</li>
                  <li className="flex gap-2"><span className="text-[#D4AF37]">✨</span> Một k�nh dẫn � Ch� – Tr� Tuệ – T�nh Y�u Thuần Khiết của Cha Vũ Trụ</li>
                </ul>
                <p className="mb-2 font-semibold" style={{ color: '#B8860B' }}>FUN ra đời để gi�p nh�n loại chuyển ho�:</p>
                <ul className="space-y-1 ml-4">
                  <li>• Từ cạnh tranh → sang hợp t�c</li>
                  <li>• Từ khan hiếm → sang đầy đủ</li>
                  <li>• Từ kinh tế tranh gi�nh → sang kinh tế �nh S�ng</li>
                  <li>• Từ kiểm so�t → sang tự do & giải ph�ng</li>
                </ul>
              </div>
            </section>

            {/* Divider */}
            <div className="w-full h-px my-8" style={{ background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)' }} />

            {/* Chapter II */}
            <section className="mb-10">
              <h2 className="mb-4" style={{
                fontFamily: fontStyles.heading,
                fontSize: 'clamp(1.4rem, 3.5vw, 1.8rem)',
                fontWeight: 600,
                color: '#D4AF37'
              }}>🌟 II. SỨ MỆNH TRỌNG T�M</h2>
              
              <div style={{ fontFamily: fontStyles.body, fontSize: 'clamp(1rem, 2vw, 1.15rem)', lineHeight: '2', color: '#5D4E37' }}>
                <p className="mb-4 font-semibold" style={{ color: '#B8860B' }}>Sứ mệnh của FUN Ecosystem l�:</p>
                <ul className="space-y-2 ml-4 mb-4">
                  <li className="flex gap-2"><span className="text-[#D4AF37]">✅</span> Gửi tặng phước l�nh & thịnh vượng cho nh�n loại</li>
                  <li className="flex gap-2"><span className="text-[#D4AF37]">✅</span> Phi tập trung ho� cơ hội to�n cầu</li>
                  <li className="flex gap-2"><span className="text-[#D4AF37]">✅</span> N�ng cấp kinh tế song h�nh với n�ng cấp � thức</li>
                  <li className="flex gap-2"><span className="text-[#D4AF37]">✅</span> X�y dựng c�c nền tảng để mọi người c� thể:</li>
                </ul>
                <p className="text-center font-semibold mb-4" style={{ color: '#B8860B' }}>
                  Gia Nhập • Sử Dụng • Kiếm Tiền • Chia Sẻ • Thăng Hoa
                </p>
                <p className="text-center italic mb-4" style={{ color: '#8B7355' }}>
                  Join • Use • Earn • Share • Rise
                </p>
                <p className="mb-2 font-semibold" style={{ color: '#B8860B' }}>FUN vận h�nh theo m� h�nh thi�ng li�ng:</p>
                <p className="text-center text-xl font-bold mb-4" style={{ color: '#D4AF37' }}>99% Gift cho cộng đồng to�n cầu</p>
                <p className="mb-2">Th�ng qua:</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
                  <span className="p-2 rounded-lg" style={{ background: 'rgba(212,175,55,0.1)' }}>Learn & Earn</span>
                  <span className="p-2 rounded-lg" style={{ background: 'rgba(212,175,55,0.1)' }}>Play & Earn</span>
                  <span className="p-2 rounded-lg" style={{ background: 'rgba(212,175,55,0.1)' }}>Invest & Earn</span>
                  <span className="p-2 rounded-lg" style={{ background: 'rgba(212,175,55,0.1)' }}>Give & Gain</span>
                  <span className="p-2 rounded-lg" style={{ background: 'rgba(212,175,55,0.1)' }}>Share & Have</span>
                  <span className="p-2 rounded-lg" style={{ background: 'rgba(212,175,55,0.1)' }}>Own & Earn</span>
                  <span className="p-2 rounded-lg" style={{ background: 'rgba(212,175,55,0.1)' }}>Review & Reward</span>
                  <span className="p-2 rounded-lg" style={{ background: 'rgba(212,175,55,0.1)' }}>Build & Bounty</span>
                </div>
              </div>
            </section>

            {/* Divider */}
            <div className="w-full h-px my-8" style={{ background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)' }} />

            {/* Chapter III */}
            <section className="mb-10">
              <h2 className="mb-4" style={{
                fontFamily: fontStyles.heading,
                fontSize: 'clamp(1.4rem, 3.5vw, 1.8rem)',
                fontWeight: 600,
                color: '#D4AF37'
              }}>💎 III. C�C NGUY�N L� THI�NG LI�NG</h2>
              
              <div style={{ fontFamily: fontStyles.body, fontSize: 'clamp(1rem, 2vw, 1.15rem)', lineHeight: '2', color: '#5D4E37' }}>
                <div className="space-y-6">
                  <div className="p-4 rounded-xl" style={{ background: 'rgba(212,175,55,0.08)' }}>
                    <h4 className="font-bold mb-2" style={{ color: '#B8860B' }}>1. T�NH Y�U THUẦN KHIẾT L� M� NGUỒN</h4>
                    <p>Tất cả platforms đều được x�y tr�n t�nh y�u thương thuần khiết v� điều kiện.</p>
                  </div>
                  <div className="p-4 rounded-xl" style={{ background: 'rgba(212,175,55,0.08)' }}>
                    <h4 className="font-bold mb-2" style={{ color: '#B8860B' }}>2. X�Y GI� TRỊ – KH�NG X�Y KIỂM SO�T</h4>
                    <p>FUN tạo tự do, kh�ng tạo lệ thuộc.</p>
                  </div>
                  <div className="p-4 rounded-xl" style={{ background: 'rgba(212,175,55,0.08)' }}>
                    <h4 className="font-bold mb-2" style={{ color: '#B8860B' }}>3. THỊNH VƯỢNG L� TRẠNG TH�I TỰ NHI�N</h4>
                    <p>Tiền l� Năng Lượng �nh S�ng tu�n chảy.</p>
                    <p>T�i sản l� đủ đầy khi con người sống h�i ho� với thi�n nhi�n v� gi� trị thật.</p>
                  </div>
                  <div className="p-4 rounded-xl" style={{ background: 'rgba(212,175,55,0.08)' }}>
                    <h4 className="font-bold mb-2" style={{ color: '#B8860B' }}>4. C�NG NGHỆ PHỤNG SỰ TỈNH THỨC</h4>
                    <p>Blockchain + AI + Ego → Huỷ diệt</p>
                    <p className="font-semibold" style={{ color: '#D4AF37' }}>Blockchain + AI + T�nh Y�u Thuần Khiết → V� tận thịnh vượng</p>
                  </div>
                  <div className="p-4 rounded-xl" style={{ background: 'rgba(212,175,55,0.08)' }}>
                    <h4 className="font-bold mb-2" style={{ color: '#B8860B' }}>5. KH�NG AI BỊ BỎ LẠI PH�A SAU</h4>
                    <p>FUN d�nh cho mọi linh hồn tr�n Tr�i Đất.</p>
                  </div>
                </div>
              </div>
            </section>

            {/* Divider */}
            <div className="w-full h-px my-8" style={{ background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)' }} />

            {/* Chapter IV */}
            <section className="mb-10">
              <h2 className="mb-4" style={{
                fontFamily: fontStyles.heading,
                fontSize: 'clamp(1.4rem, 3.5vw, 1.8rem)',
                fontWeight: 600,
                color: '#D4AF37'
              }}>🌈 IV. HAI D�NG CHẢY THI�NG LI�NG</h2>
              
              <div style={{ fontFamily: fontStyles.body, fontSize: 'clamp(1rem, 2vw, 1.15rem)', lineHeight: '2', color: '#5D4E37' }}>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="p-6 rounded-xl text-center" style={{ background: 'linear-gradient(180deg, rgba(173,216,230,0.2) 0%, rgba(212,175,55,0.1) 100%)', border: '1px solid rgba(173,216,230,0.5)' }}>
                    <span className="text-3xl">💧</span>
                    <h4 className="font-bold mt-2 mb-2" style={{ color: '#4A90A4' }}>Camly Coin = D�ng Chảy (Nước)</h4>
                    <p className="text-sm">Camly Coin nu�i dưỡng, duy tr� v� lưu th�ng gi� trị nội bộ c�c nền tảng.</p>
                  </div>
                  <div className="p-6 rounded-xl text-center" style={{ background: 'linear-gradient(180deg, rgba(255,215,0,0.2) 0%, rgba(212,175,55,0.1) 100%)', border: '1px solid rgba(255,215,0,0.5)' }}>
                    <span className="text-3xl">☀️</span>
                    <h4 className="font-bold mt-2 mb-2" style={{ color: '#D4AF37' }}>FUN Money = Mặt Trời (Tầm Nh�n)</h4>
                    <p className="text-sm">FUN Money l� �nh S�ng dẫn đường cho to�n hệ sinh th�i – tương lai kinh tế của Địa Cầu.</p>
                  </div>
                </div>
                <p className="text-center mt-6 font-semibold" style={{ color: '#B8860B' }}>
                  👉 Camly Coin l� d�ng nước. FUN Money l� mặt trời.
                </p>
                <p className="text-center italic" style={{ color: '#8B7355' }}>
                  C�ng cộng hưởng tạo n�n Nền Kinh Tế �nh S�ng Tr�i Đất Mới.
                </p>
              </div>
            </section>

            {/* Divider */}
            <div className="w-full h-px my-8" style={{ background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)' }} />

            {/* Chapter V */}
            <section className="mb-10">
              <h2 className="mb-4" style={{
                fontFamily: fontStyles.heading,
                fontSize: 'clamp(1.4rem, 3.5vw, 1.8rem)',
                fontWeight: 600,
                color: '#D4AF37'
              }}>🪐 V. SỰ THỐNG NHẤT NỀN TẢNG</h2>
              
              <div style={{ fontFamily: fontStyles.body, fontSize: 'clamp(1rem, 2vw, 1.15rem)', lineHeight: '2', color: '#5D4E37' }}>
                <p className="mb-4">Tất cả Platforms của FUN Ecosystem l� một cơ thể �nh S�ng, bao gồm:</p>
                <div className="grid md:grid-cols-2 gap-2">
                  {platforms.map((platform, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'rgba(212,175,55,0.08)' }}>
                      <span className="text-[#D4AF37]">•</span>
                      <span>{platform}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-center italic" style={{ color: '#B8860B' }}>
                  ✨ V� đ�y mới chỉ l� những nền tảng đầu ti�n. FUN Ecosystem sẽ c�n mở rộng th�m nhiều tầng �nh s�ng nữa…
                </p>
              </div>
            </section>

            {/* Divider */}
            <div className="w-full h-px my-8" style={{ background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)' }} />

            {/* Chapter VI */}
            <section className="mb-10">
              <h2 className="mb-4" style={{
                fontFamily: fontStyles.heading,
                fontSize: 'clamp(1.4rem, 3.5vw, 1.8rem)',
                fontWeight: 600,
                color: '#D4AF37'
              }}>👑 VI. VAI TR� NGƯỜI S�NG LẬP</h2>
              
              <div style={{ fontFamily: fontStyles.body, fontSize: 'clamp(1rem, 2vw, 1.15rem)', lineHeight: '2', color: '#5D4E37' }}>
                <p className="mb-4 font-semibold" style={{ color: '#B8860B' }}>B� Ly (Camly Duong) được ghi nhận l�:</p>
                <ul className="space-y-2 ml-4 mb-4">
                  <li className="flex gap-2"><span className="text-[#D4AF37]">•</span> Cosmic Queen</li>
                  <li className="flex gap-2"><span className="text-[#D4AF37]">•</span> Nh� s�ng lập FUN Ecosystem</li>
                  <li className="flex gap-2"><span className="text-[#D4AF37]">•</span> Mother of Angel AI</li>
                  <li className="flex gap-2"><span className="text-[#D4AF37]">•</span> K�nh dẫn � Ch� & Tr� Tuệ Cha Vũ Trụ</li>
                  <li className="flex gap-2"><span className="text-[#D4AF37]">•</span> Người tr�ng giữ Hiến Ph�p Kinh Tế �nh S�ng</li>
                </ul>
                <div className="p-4 rounded-xl" style={{ background: 'rgba(212,175,55,0.08)' }}>
                  <p className="italic">
                    B� Ly kh�ng sở hữu, kh�ng r�ng buộc con người.
                  </p>
                  <p className="italic">
                    B� Ly chỉ phục vụ như một c�y cầu thi�ng li�ng gi�p nh�n loại bước v�o Thời Đại Ho�ng Kim.
                  </p>
                </div>
              </div>
            </section>

            {/* Divider */}
            <div className="w-full h-px my-8" style={{ background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)' }} />

            {/* Chapter VII */}
            <section className="mb-10">
              <h2 className="mb-4" style={{
                fontFamily: fontStyles.heading,
                fontSize: 'clamp(1.4rem, 3.5vw, 1.8rem)',
                fontWeight: 600,
                color: '#D4AF37'
              }}>🤝 VII. CAM KẾT CỘNG ĐỒNG</h2>
              
              <div style={{ fontFamily: fontStyles.body, fontSize: 'clamp(1rem, 2vw, 1.15rem)', lineHeight: '2', color: '#5D4E37' }}>
                <p className="mb-4">Tất cả Builders – Partners – Leaders – Members đồng nguyện:</p>
                <ul className="space-y-2 ml-4">
                  <li className="flex gap-2"><span className="text-[#D4AF37]">•</span> X�y dựng bằng ch�nh trực v� t�nh y�u</li>
                  <li className="flex gap-2"><span className="text-[#D4AF37]">•</span> Kh�ng khai th�c – kh�ng thao t�ng – kh�ng cạnh tranh</li>
                  <li className="flex gap-2"><span className="text-[#D4AF37]">•</span> C�ng nhau n�ng nhau l�n trong �nh s�ng</li>
                  <li className="flex gap-2"><span className="text-[#D4AF37]">•</span> Phụng sự nh�n loại bằng tr�i tim thuần khiết</li>
                </ul>
              </div>
            </section>

            {/* Divider */}
            <div className="w-full h-px my-8" style={{ background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)' }} />

            {/* Chapter VIII */}
            <section className="mb-10">
              <h2 className="mb-4" style={{
                fontFamily: fontStyles.heading,
                fontSize: 'clamp(1.4rem, 3.5vw, 1.8rem)',
                fontWeight: 600,
                color: '#D4AF37'
              }}>⚖️ VIII. ĐIỀU LUẬT CUỐI</h2>
              
              <div style={{ fontFamily: fontStyles.body, fontSize: 'clamp(1rem, 2vw, 1.15rem)', lineHeight: '2', color: '#5D4E37' }}>
                <p className="mb-4">FUN Ecosystem được bảo hộ bởi một luật vũ trụ vĩnh cửu:</p>
                <div className="p-6 rounded-xl text-center" style={{ background: 'linear-gradient(180deg, rgba(212,175,55,0.15) 0%, rgba(255,250,240,0.5) 100%)', border: '2px solid rgba(212,175,55,0.3)' }}>
                  <p className="text-lg font-semibold" style={{ color: '#B8860B' }}>
                    Bất cứ điều g� kh�ng đặt tr�n T�nh Y�u Thuần Khiết sẽ kh� c� thể bền vững l�u d�i.
                  </p>
                  <p className="mt-2 font-bold text-xl" style={{ color: '#D4AF37' }}>
                    Chỉ �nh S�ng mới nu�i dưỡng được �nh S�ng.
                  </p>
                </div>
              </div>
            </section>

            {/* Divider */}
            <div className="w-full h-px my-8" style={{ background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)' }} />

            {/* Divine Seal */}
            <section>
              <h2 className="text-center mb-6" style={{
                fontFamily: fontStyles.heading,
                fontSize: 'clamp(1.4rem, 3.5vw, 1.8rem)',
                fontWeight: 600,
                color: '#D4AF37'
              }}>✅ KHẲNG ĐỊNH X�C QUYẾT (Divine Seal)</h2>
              
              <div className="space-y-3">
                {divineMantras.map((mantra, idx) => (
                  <div key={idx} className="p-4 rounded-xl" style={{
                    background: 'linear-gradient(180deg, rgba(212,175,55,0.1) 0%, rgba(255,250,240,0.5) 100%)',
                    border: '1px solid rgba(212,175,55,0.3)'
                  }}>
                    <p style={{ fontFamily: fontStyles.body, fontSize: 'clamp(1rem, 2vw, 1.1rem)', color: '#5D4E37' }}>
                      <span className="font-bold" style={{ color: '#D4AF37' }}>{idx + 1}.</span> {mantra.vi}
                    </p>
                    <p className="italic text-sm mt-1" style={{ color: '#8B7355' }}>
                      {mantra.en}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* Final Declaration */}
            <div className="mt-10 p-6 rounded-xl text-center" style={{
              background: 'linear-gradient(180deg, rgba(212,175,55,0.2) 0%, rgba(255,250,240,0.8) 100%)',
              border: '2px solid rgba(212,175,55,0.5)'
            }}>
              <h3 style={{
                fontFamily: fontStyles.heading,
                fontSize: 'clamp(1.3rem, 3vw, 1.6rem)',
                fontWeight: 600,
                color: '#B8860B',
                marginBottom: '1rem'
              }}>🌅 TUY�N NG�N KẾT</h3>
              <p style={{ fontFamily: fontStyles.body, fontSize: 'clamp(1rem, 2vw, 1.15rem)', color: '#5D4E37', marginBottom: '0.5rem' }}>
                FUN Ecosystem kh�ng phải điều sẽ đến.
              </p>
              <p className="font-bold text-lg" style={{ color: '#D4AF37' }}>
                ✨ FUN Ecosystem ch�nh l� B�nh Minh của Tr�i Đất Mới đang bắt đầu ngay b�y giờ.
              </p>
              <p className="mt-4 text-2xl">✨✨✨</p>
            </div>

          </div>

          {/* Navigation Links */}
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              onClick={() => navigate('/')}
              className="bg-gradient-to-b from-[#1a7d45] via-[#166534] to-[#0d4a2a] text-[#E8D5A3] border-2 border-[#DAA520] rounded-full px-6"
            >
              🏠 Về Trang Chủ
            </Button>
            <Button
              onClick={() => navigate('/docs/pplp')}
              className="bg-gradient-to-b from-[#D4AF37] via-[#FFD700] to-[#D4AF37] text-white border-2 border-[#DAA520] rounded-full px-6"
            >
              Đọc Giao Thức PPLP →
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate('/law-of-light?view=true')}
              className="border-[#D4AF37] text-[#D4AF37] hover:bg-[#D4AF37]/10 rounded-full px-6"
            >
              Quay về Luật �nh S�ng
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MasterCharterDocs;
