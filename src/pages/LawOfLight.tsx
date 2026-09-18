import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Sparkles, Eye, Home } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import logger from '@/lib/logger';


const ANGEL_LOGO = '/angel-ai-logo-128.png';

const LawOfLight = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();
  const { userId, isAuthenticated } = useCurrentUser();
  const [checklist, setChecklist] = useState([false, false, false, false, false]);
  const [loading, setLoading] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const viewMode = params.get('view') === 'true';
    setIsReadOnly(viewMode);
    
    // If in view mode, don't redirect - allow viewing the content
    if (viewMode) return;
    
    // Check if user is already logged in and has accepted
    if (!isAuthenticated || !userId) return;
    
    const checkAccepted = async () => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('law_of_light_accepted')
        .eq('id', userId)
        .single();
      
      if (profile?.law_of_light_accepted) {
        navigate('/');
      }
    };
    checkAccepted();
  }, [location, navigate, userId, isAuthenticated]);

  const allChecked = checklist.every(Boolean);

  const handleCheckboxChange = (index: number) => {
    const newChecklist = [...checklist];
    newChecklist[index] = !newChecklist[index];
    setChecklist(newChecklist);
  };

  const handleAccept = async () => {
    if (!allChecked) return;
    setLoading(true);
    
    try {
      if (isAuthenticated && userId) {
        // User already logged in - update profile directly
        await supabase.from('profiles').update({
          law_of_light_accepted: true,
          law_of_light_accepted_at: new Date().toISOString()
        }).eq('id', userId);
        
        toast.success('🌟 Con đã sẵn sàng bước vào Ánh Sáng!');
        navigate('/');
      } else {
        // User not logged in - save pending and redirect to auth
        localStorage.setItem('law_of_light_accepted_pending', 'true');
        toast.success('🌟 Con đã sẵn sàng bước vào Ánh Sáng!');
        navigate('/auth');
      }
    } catch (error) {
      logger.error('[LawOfLight] Error accepting:', error);
      toast.error('Có lỗi xảy ra, vui lòng thử lại');
    } finally {
      setLoading(false);
    }
  };

  // Luồng RIÊNG cho người ĐÃ có tài khoản nhưng chủ động KHÔNG ký:
  // phải signOut() thật (xoá session) rồi về Home với vai trò khách,
  // tránh vòng lặp bị đẩy lại trang Luật Ánh Sáng mỗi lần vào app.
  // Người CHƯA từng có tài khoản (luồng "Xem với tư cách Khách" cũ) giữ nguyên.
  const handleSkip = async () => {
    if (!isAuthenticated) {
      navigate('/');
      return;
    }

    setLoading(true);
    try {
      localStorage.removeItem('law_of_light_accepted_pending');
      await supabase.auth.signOut();
      // Chờ session bị xoá thật trước khi điều hướng
      for (let i = 0; i < 10; i++) {
        const { data } = await supabase.auth.getSession();
        if (!data.session) break;
        await new Promise((r) => setTimeout(r, 150));
      }
      toast.info('Bạn đang xem với tư cách khách. Đăng nhập lại bất cứ lúc nào để ký Luật Ánh Sáng.');
      // Hard replace để mọi state/cache trong app được dựng lại ở chế độ khách
      window.location.replace('/');
    } catch (error) {
      logger.error('[LawOfLight] Sign out on skip failed:', error);
      toast.error('Không thể đăng xuất, vui lòng thử lại');
      setLoading(false);
    }
  };


  const checklistItems = [
    'Sống Chân Thật',
    'Nói Lời Tử tế',
    'Giúp ích cho cộng đồng',
    'Nói Sám hối (Xin lỗi) và Biết ơn (Cảm ơn)',
    'Gởi về cho Cha Vũ Trụ tất cả'
  ];

  const divineMantras = [
    { emoji: '💖', text: 'Con là Ánh Sáng Yêu Thương Thuần Khiết của Cha Vũ Trụ.' },
    { emoji: '💎', text: 'Con là Ý Chí của Cha Vũ Trụ.' },
    { emoji: '🌞', text: 'Con là Trí Tuệ của Cha Vũ Trụ.' },
    { emoji: '🌸', text: 'Con là Hạnh Phúc.' },
    { emoji: '🍎', text: 'Con là Tình Yêu.' },
    { emoji: '💰', text: 'Con là Tiền của Cha.' },
    { emoji: '🙏', text: 'Con xin Sám Hối Sám Hối Sám Hối.' },
    { emoji: '🌈', text: 'Con xin Biết Ơn Biết Ơn Biết Ơn, trong Ánh Sáng Yêu Thương Thuần Khiết của Cha Vũ Trụ.' }
  ];

  const fivePillars = [
    {
      emoji: '🔎',
      title: 'Chân thật & minh bạch',
      subtitle: 'Bạn là Người Thật • Nói viết sự thật • Chia sẻ đúng',
      description: 'Chúng ta tôn trọng sự thật.\nBạn được phép chưa hoàn hảo — chỉ cần bạn sống thật.'
    },
    {
      emoji: '💎',
      title: 'Đóng góp bền vững',
      subtitle: 'Có trách nhiệm • Có chất lượng • Có giá trị',
      description: 'Chúng ta cùng nhau tạo cộng đồng ánh sáng.\nChúng ta không chỉ nhận — chúng ta cùng xây.'
    },
    {
      emoji: '💚',
      title: 'Chữa lành & yêu thương',
      subtitle: 'Truyền cảm hứng • Khích lệ • Nâng đỡ',
      description: 'Chúng ta chọn sự ấm áp, dịu dàng, và tích cực.\nSự có mặt của chúng ta làm cộng đồng văn minh hơn.'
    },
    {
      emoji: '🌿',
      title: 'Phụng sự sự sống',
      subtitle: 'Hướng thượng • Đi lên • Mang lợi ích',
      description: 'Mỗi bài đăng, mỗi bình luận đều hướng tới một điều:\ngiúp sự sống đi lên — cho mình và cho cộng đồng.'
    },
    {
      emoji: '🌟',
      title: 'Hợp Nhất với Nguồn',
      subtitle: 'Tất cả chúng ta là Một',
      description: 'Nơi đây để kết nối và hỗ trợ trong yêu thương thuần khiết.\nChúng ta cùng nhau vui, cùng nhau lớn, cùng nhau giàu và cùng nhau thắng.'
    }
  ];

  // Typography styles - elegant serif fonts with 20% larger sizes
  const fontStyles = {
    heading: "'Cormorant Garamond', Georgia, serif",
    body: "'Lora', Georgia, serif",
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Pearl White to Soft Yellow Gradient Background - STATIC */}
      <div className="fixed inset-0 z-0" style={{
        background: 'linear-gradient(180deg, #FFFEF7 0%, #FFF9E6 30%, #FFF5D6 60%, #FFFDF5 100%)'
      }} />
      
      {/* Divine Light Rays from Top - White & Gold (static) */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[200%] h-[50vh] md:h-[70vh] z-0 pointer-events-none" style={{
        background: 'conic-gradient(from 180deg at 50% 0%, transparent 25%, rgba(212,175,55,0.15) 30%, rgba(255,255,255,0.4) 35%, rgba(212,175,55,0.15) 40%, transparent 45%, transparent 55%, rgba(212,175,55,0.12) 60%, rgba(255,255,255,0.35) 65%, rgba(212,175,55,0.12) 70%, transparent 75%)',
        filter: 'blur(3px)'
      }} />

      {/* Central Halo Effect - STATIC (no animation) */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[300px] md:w-[500px] h-[300px] md:h-[500px] z-0 pointer-events-none" style={{
        background: 'radial-gradient(circle, rgba(212,175,55,0.25) 0%, rgba(255,215,0,0.15) 40%, transparent 70%)',
        filter: 'blur(50px)'
      }} />

      {/* Side Light Beams - STATIC */}
      <div className="fixed top-0 left-0 w-1/3 h-full z-0 pointer-events-none opacity-40" style={{
        background: 'linear-gradient(135deg, rgba(255,255,255,0.6) 0%, transparent 50%)'
      }} />
      <div className="fixed top-0 right-0 w-1/3 h-full z-0 pointer-events-none opacity-40" style={{
        background: 'linear-gradient(-135deg, rgba(255,255,255,0.6) 0%, transparent 50%)'
      }} />

      {/* Main Content */}
      <div className="relative z-10 min-h-screen py-6 md:py-12 px-3 md:px-4">
        <div className="max-w-4xl mx-auto">
          {/* Top Navigation for read-only mode */}
          {isReadOnly && (
            <div className="flex items-center justify-center mb-6">
              <Button
                variant="ghost"
                onClick={() => navigate('/')}
                className="text-[#B8860B] hover:text-[#D4AF37] hover:bg-[#D4AF37]/10"
              >
                <Home className="w-4 h-4 mr-2" />
                Về Trang Chủ
              </Button>
            </div>
          )}

          {/* Header with Angel Avatar */}
          <div className="text-center mb-8 md:mb-12">
            <div className="inline-flex items-center justify-center w-24 h-24 md:w-32 md:h-32 rounded-full mb-4 md:mb-6 overflow-hidden" style={{
              background: 'radial-gradient(circle, rgba(212,175,55,0.3) 0%, rgba(255,255,255,0.9) 60%, transparent 80%)',
              boxShadow: '0 0 80px rgba(212,175,55,0.4), 0 0 120px rgba(255,255,255,0.6)',
              border: '3px solid rgba(212,175,55,0.5)'
            }}>
              <img 
                src={ANGEL_LOGO} 
                alt="Angel" 
                className="w-full h-full object-cover object-[center_25%]" 
                style={{ filter: 'drop-shadow(0 0 15px rgba(212,175,55,0.8))' }} 
              />
            </div>
            
            <h1 style={{
              fontFamily: fontStyles.heading,
              fontSize: 'clamp(1.8rem, 8vw, 3.6rem)',
              fontWeight: 600,
              letterSpacing: '0.02em',
              background: 'linear-gradient(135deg, #D4AF37 0%, #FFD700 30%, #D4AF37 50%, #B8860B 70%, #D4AF37 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 4px 8px rgba(212,175,55,0.3))',
              marginBottom: '0.5rem'
            }}>
              🌈 LUẬT ÁNH SÁNG CỦA CỘNG ĐỒNG FUN
            </h1>
            <p style={{
              fontFamily: fontStyles.heading,
              fontSize: 'clamp(1rem, 2.5vw, 1.3rem)',
              fontWeight: 500,
              letterSpacing: '0.1em',
              color: '#B8860B',
              marginBottom: '0.5rem'
            }}>
              (PPLP – Proof of Pure Love Protocol)
            </p>
            
            {/* Golden Divider */}
            <div className="w-32 md:w-48 h-1 mx-auto mt-4 md:mt-6 rounded-full" style={{
              background: 'linear-gradient(90deg, transparent, #D4AF37, #FFD700, #D4AF37, transparent)',
              boxShadow: '0 0 10px rgba(212,175,55,0.5)'
            }} />
          </div>

          {/* Main Content Card */}
          <div className="relative rounded-2xl md:rounded-3xl p-4 sm:p-6 md:p-8 lg:p-12 mb-6 md:mb-8" style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(255,250,240,0.9) 100%)',
            border: '2px solid rgba(212,175,55,0.5)',
            boxShadow: '0 10px 60px rgba(212,175,55,0.15), 0 0 0 1px rgba(255,255,255,0.8), inset 0 0 60px rgba(255,255,255,0.5)'
          }}>
            
            {/* Section: Welcome */}
            <div className="mb-8 md:mb-10 text-center">
              <p className="mb-4" style={{
                fontFamily: fontStyles.heading,
                fontSize: 'clamp(1.3rem, 3vw, 1.6rem)',
                fontWeight: 600,
                color: '#5D4E37'
              }}>
                Chào mừng bạn đến với Cộng đồng FUN 💚
              </p>
              <p className="mb-4" style={{
                fontFamily: fontStyles.body,
                fontSize: 'clamp(1.05rem, 2vw, 1.2rem)',
                lineHeight: '2',
                color: '#5D4E37'
              }}>
                Nơi chúng ta cùng nhau xây dựng một <strong style={{ color: '#B8860B' }}>Nền Kinh Tế Ánh Sáng</strong> —
              </p>
              
              <div className="p-4 rounded-xl mb-6" style={{
                background: 'rgba(212,175,55,0.1)'
              }}>
                <p style={{
                  fontFamily: fontStyles.heading,
                  fontSize: 'clamp(1.2rem, 2.5vw, 1.4rem)',
                  fontWeight: 600,
                  color: '#D4AF37'
                }}>
                  Free to Join ✨ Free to Use ✨ Earn Together
                </p>
                <p style={{
                  fontFamily: fontStyles.body,
                  fontSize: 'clamp(0.95rem, 2vw, 1.1rem)',
                  color: '#8B7355'
                }}>
                  Miễn phí tham gia ✨ Miễn phí sử dụng ✨ Cùng có thu nhập
                </p>
              </div>
              
              <p style={{
                fontFamily: fontStyles.body,
                fontSize: 'clamp(1.05rem, 2vw, 1.2rem)',
                lineHeight: '2',
                color: '#5D4E37'
              }}>
                Là nơi để:<br />
                🌸 kết nối  🌸 nâng đỡ  🌸 chia sẻ giá trị<br />
                🌸 và cùng nhau thịnh vượng trong tình yêu thuần khiết.
              </p>
            </div>

            {/* Golden Divider */}
            <div className="w-full h-px my-8" style={{
              background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)'
            }} />

            {/* Section: PPLP Protocol */}
            <div className="mb-10">
              <h3 className="text-center mb-4" style={{
                fontFamily: fontStyles.heading,
                fontSize: 'clamp(1.32rem, 3vw, 1.5rem)',
                fontWeight: 600,
                color: '#D4AF37'
              }}>
                💎 PPLP – Proof of Pure Love Protocol
              </h3>
              <p className="text-center mb-4" style={{
                fontFamily: fontStyles.heading,
                fontSize: 'clamp(1.05rem, 2vw, 1.15rem)',
                fontStyle: 'italic',
                color: '#8B7355'
              }}>
                (Giao Thức Bằng Chứng Tình Yêu Thuần Khiết)
              </p>
              
              <div className="space-y-4" style={{
                fontFamily: fontStyles.body,
                fontSize: 'clamp(1.05rem, 2vw, 1.2rem)',
                lineHeight: '2',
                color: '#5D4E37'
              }}>
                <p>
                  PPLP là "giao thức năng lượng" của FUN Ecosystem.<br />
                  Đây là nền tảng giúp cộng đồng:
                </p>
                <ul className="space-y-1 ml-4">
                  <li className="flex gap-2"><span className="text-yellow-600">•</span> sống văn minh, lịch sự</li>
                  <li className="flex gap-2"><span className="text-yellow-600">•</span> yêu đời yêu người</li>
                  <li className="flex gap-2"><span className="text-yellow-600">•</span> được đúc (mint) FUN Money một cách công bằng</li>
                  <li className="flex gap-2"><span className="text-yellow-600">•</span> và nhận thưởng Camly Coin trong niềm hạnh phúc</li>
                </ul>
              </div>
              
              <div className="mt-6 p-4 rounded-xl text-center" style={{
                background: 'rgba(212,175,55,0.08)'
              }}>
                <p style={{
                  fontFamily: fontStyles.heading,
                  fontSize: 'clamp(1.1rem, 2.5vw, 1.25rem)',
                  lineHeight: '2',
                  color: '#6B5B47'
                }}>
                  ✨ <strong>FUN Money</strong> là năng lượng Ánh Sáng,<br />
                  ✨ <strong>Camly Coin</strong> là linh hồn Thuần Khiết,<br />
                  <span style={{ color: '#B8860B', fontWeight: 600 }}>Chỉ chảy mạnh khi chúng ta sống đúng PPLP.</span>
                </p>
              </div>
            </div>

            {/* Golden Divider */}
            <div className="w-full h-px my-8" style={{
              background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)'
            }} />

            {/* Section: 5 Pillars of Light */}
            <div className="mb-10">
              <h3 className="text-center mb-6" style={{
                fontFamily: fontStyles.heading,
                fontSize: 'clamp(1.32rem, 3vw, 1.5rem)',
                fontWeight: 600,
                color: '#D4AF37'
              }}>
                🌟 5 CỘT TRỤ ÁNH SÁNG (Luật cốt lõi)
              </h3>
              
              <div className="space-y-6">
                {fivePillars.map((pillar, index) => (
                  <div key={index} className="p-4 md:p-6 rounded-xl" style={{
                    background: 'rgba(255,255,255,0.8)',
                    border: '1px solid rgba(212,175,55,0.3)'
                  }}>
                    <div className="flex items-start gap-3 mb-2">
                      <span className="text-2xl md:text-3xl">{pillar.emoji}</span>
                      <div>
                        <h4 style={{
                          fontFamily: fontStyles.heading,
                          fontSize: 'clamp(1.15rem, 2.5vw, 1.3rem)',
                          fontWeight: 600,
                          color: '#D4AF37'
                        }}>
                          {index + 1}) {pillar.title}
                        </h4>
                        <p style={{
                          fontFamily: fontStyles.body,
                          fontSize: 'clamp(0.95rem, 2vw, 1.05rem)',
                          color: '#8B7355',
                          fontWeight: 500
                        }}>
                          {pillar.subtitle}
                        </p>
                      </div>
                    </div>
                    <p className="ml-10 md:ml-12" style={{
                      fontFamily: fontStyles.body,
                      fontSize: 'clamp(1rem, 2vw, 1.1rem)',
                      lineHeight: '1.8',
                      color: '#5D4E37',
                      whiteSpace: 'pre-line'
                    }}>
                      {pillar.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Golden Divider */}
            <div className="w-full h-px my-8" style={{
              background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)'
            }} />

            {/* Section: Gentle Reminder */}
            <div className="mb-10 p-6 rounded-2xl" style={{
              background: 'radial-gradient(ellipse at center, rgba(144,238,144,0.15) 0%, rgba(255,255,255,0.5) 70%)',
              border: '1px solid rgba(144,238,144,0.4)'
            }}>
              <h3 className="text-center mb-4" style={{
                fontFamily: fontStyles.heading,
                fontSize: 'clamp(1.2rem, 3vw, 1.4rem)',
                fontWeight: 600,
                color: '#228B22'
              }}>
                🌈 Một lời nhắc nhẹ nhàng
              </h3>
              
              <div className="text-center space-y-4" style={{
                fontFamily: fontStyles.body,
                fontSize: 'clamp(1.05rem, 2vw, 1.15rem)',
                lineHeight: '2',
                color: '#5D4E37'
              }}>
                <p>
                  Nếu bạn đang mệt, đang buồn, đang tổn thương…<br />
                  <strong style={{ color: '#228B22' }}>bạn vẫn được chào đón ở đây.</strong>
                </p>
                <p style={{ fontWeight: 600, color: '#8B7355' }}>
                  Chỉ cần bạn giữ một điều:
                </p>
                <p style={{
                  fontFamily: fontStyles.heading,
                  fontSize: 'clamp(1.1rem, 2.5vw, 1.25rem)',
                  fontWeight: 600,
                  color: '#228B22'
                }}>
                  💚 Không được dùng cộng đồng để xả đau.
                </p>
                <p style={{ fontStyle: 'italic' }}>
                  Hãy để cộng đồng truyền năng lượng, ôm ấp và xoa dịu cho bạn.<br />
                  Rồi bạn nhẹ nhàng gởi về cho Cha. Cha sẽ chữa lành tất cả.
                </p>
              </div>
            </div>

            {/* Golden Divider */}
            <div className="w-full h-px my-8" style={{
              background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)'
            }} />

            {/* Section: FUN Community Message */}
            <div className="mb-10 text-center p-6 rounded-2xl" style={{
              background: 'radial-gradient(ellipse at center, rgba(212,175,55,0.12) 0%, rgba(255,255,255,0.5) 70%)'
            }}>
              <h3 className="mb-4" style={{
                fontFamily: fontStyles.heading,
                fontSize: 'clamp(1.2rem, 3vw, 1.4rem)',
                fontWeight: 600,
                color: '#D4AF37'
              }}>
                ✨ Thông điệp của FUN Community
              </h3>
              <div style={{
                fontFamily: fontStyles.heading,
                fontSize: 'clamp(1.15rem, 2.5vw, 1.35rem)',
                fontStyle: 'italic',
                lineHeight: '2.2',
                color: '#5D4E37'
              }}>
                <p>
                  Bạn không cần giỏi. <strong style={{ color: '#B8860B' }}>Bạn chỉ cần thật.</strong><br />
                  Bạn không cần hoàn hảo. <strong style={{ color: '#B8860B' }}>Bạn chỉ cần tử tế.</strong><br />
                  Bạn không cần đi một mình.<br />
                  <span style={{ fontWeight: 700, color: '#D4AF37' }}>Vì ở đây… chúng ta đi cùng nhau.</span>
                </p>
              </div>
            </div>

            {/* Golden Divider */}
            <div className="w-full h-px my-8" style={{
              background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)'
            }} />

            {/* 🌟 8 Divine Mantras - Special Container */}
            <div className="mb-10">
              <h3 className="text-center mb-6" style={{
                fontFamily: fontStyles.heading,
                fontSize: 'clamp(1.32rem, 3vw, 1.5rem)',
                fontWeight: 600,
                color: '#D4AF37'
              }}>
                ✨ 8 THẦN CHÚ ÁNH SÁNG
              </h3>
              
              <div className="relative p-6 md:p-8 rounded-2xl" style={{
                background: 'linear-gradient(180deg, #FFFFFF 0%, #FFFEF5 100%)',
                border: '3px solid #D4AF37',
                boxShadow: '0 8px 40px rgba(212,175,55,0.25), 0 0 0 1px rgba(255,215,0,0.3), inset 0 2px 20px rgba(255,255,255,0.8)',
                transform: 'perspective(1000px) rotateX(2deg)'
              }}>
                {/* Corner decorations */}
                <div className="absolute top-2 left-2 w-6 h-6" style={{
                  borderTop: '3px solid #D4AF37',
                  borderLeft: '3px solid #D4AF37'
                }} />
                <div className="absolute top-2 right-2 w-6 h-6" style={{
                  borderTop: '3px solid #D4AF37',
                  borderRight: '3px solid #D4AF37'
                }} />
                <div className="absolute bottom-2 left-2 w-6 h-6" style={{
                  borderBottom: '3px solid #D4AF37',
                  borderLeft: '3px solid #D4AF37'
                }} />
                <div className="absolute bottom-2 right-2 w-6 h-6" style={{
                  borderBottom: '3px solid #D4AF37',
                  borderRight: '3px solid #D4AF37'
                }} />
                
                <div className="space-y-4">
                  {divineMantras.map((mantra, index) => (
                    <div key={index} className="flex gap-3 items-start">
                      <span className="text-xl md:text-2xl flex-shrink-0">{mantra.emoji}</span>
                      <p style={{
                        fontFamily: fontStyles.body,
                        fontSize: 'clamp(1.05rem, 2vw, 1.2rem)',
                        fontWeight: 500,
                        color: '#5D4E37',
                        lineHeight: '1.8'
                      }}>
                        {mantra.text}
                      </p>
                    </div>
                  ))}
                </div>
                
                <p className="text-center mt-6 text-2xl">💫✨⚡️🌟</p>
              </div>
            </div>

            {/* Golden Divider */}
            <div className="w-full h-px my-8" style={{
              background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)'
            }} />

            {/* 🕊️ Checklist Section */}
            <div className="mb-10">
              <h3 className="text-center mb-6" style={{
                fontFamily: fontStyles.heading,
                fontSize: 'clamp(1.32rem, 3vw, 1.5rem)',
                fontWeight: 600,
                color: '#D4AF37'
              }}>
                💛 5 Điều tôi cam kết để bước vào cộng đồng
              </h3>
              
              {!isReadOnly ? (
                <div className="space-y-4 max-w-xl mx-auto">
                  {checklistItems.map((item, index) => (
                    <label
                      key={index}
                      className="flex items-center gap-4 p-4 rounded-xl cursor-pointer transition-all duration-300"
                      style={{
                        border: checklist[index] ? '2px solid #D4AF37' : '2px solid rgba(212,175,55,0.3)',
                        background: checklist[index] ? 'rgba(212,175,55,0.12)' : 'rgba(255,255,255,0.8)',
                        boxShadow: checklist[index] ? '0 4px 20px rgba(212,175,55,0.2)' : 'none'
                      }}
                    >
                      <Checkbox
                        checked={checklist[index]}
                        onCheckedChange={() => handleCheckboxChange(index)}
                        className="w-6 h-6 border-2 data-[state=checked]:bg-yellow-500 data-[state=checked]:border-yellow-500"
                        style={{ borderColor: '#D4AF37' }}
                      />
                      <span style={{
                        fontFamily: fontStyles.body,
                        fontSize: 'clamp(1.05rem, 2vw, 1.2rem)',
                        fontWeight: 500,
                        color: '#5D4E37'
                      }}>
                        ✅ {item}
                      </span>
                    </label>
                  ))}
                  <p className="text-center mt-4" style={{
                    fontFamily: fontStyles.body,
                    fontSize: 'clamp(0.95rem, 2vw, 1.1rem)',
                    fontWeight: 700,
                    color: '#5D4E37'
                  }}>
                    (Click vào 5 cam kết trên để được Đăng ký)
                  </p>
                </div>
              ) : (
                <ul className="space-y-3 max-w-xl mx-auto" style={{
                  fontFamily: fontStyles.body,
                  fontSize: 'clamp(1.05rem, 2vw, 1.2rem)',
                  color: '#5D4E37'
                }}>
                  {checklistItems.map((item, index) => (
                    <li key={index} className="flex gap-2">
                      <span className="text-yellow-600">✅</span> {item}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Accept Button (only show if not read-only) */}
            {!isReadOnly && (
              <div className="mt-10 text-center space-y-4">
                <Button
                  onClick={handleAccept}
                  disabled={!allChecked || loading}
                  className="relative px-12 py-6 text-lg font-bold rounded-2xl transition-all duration-500 disabled:opacity-50 disabled:cursor-not-allowed border-0"
                  style={{
                    fontFamily: fontStyles.heading,
                    fontSize: 'clamp(1.08rem, 2vw, 1.2rem)',
                    background: allChecked
                      ? 'linear-gradient(135deg, #D4AF37 0%, #FFD700 40%, #F0C000 60%, #D4AF37 100%)'
                      : 'linear-gradient(135deg, #9CA3AF 0%, #6B7280 100%)',
                    boxShadow: allChecked
                      ? '0 0 30px rgba(212,175,55,0.5), 0 0 60px rgba(255,215,0,0.3), 0 0 90px rgba(212,175,55,0.2)'
                      : 'none',
                    color: allChecked ? '#FFFFFF' : '#9CA3AF',
                    animation: allChecked ? 'buttonGlow 2s ease-in-out infinite' : 'none'
                  }}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Đang xử lý...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5" />
                      CON ĐỒNG Ý & BƯỚC VÀO ÁNH SÁNG
                      <Sparkles className="w-5 h-5" />
                    </span>
                  )}
                </Button>

                {/* Skip Button - Guest Mode */}
                <div>
                  <Button
                    onClick={handleSkip}
                    disabled={loading}
                    variant="ghost"

                    className="px-6 py-3 rounded-xl hover:bg-yellow-50/50"
                    style={{
                      fontFamily: fontStyles.body,
                      color: '#8B7355',
                      fontSize: 'clamp(0.95rem, 2vw, 1.05rem)'
                    }}
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    {t('lawSkip')}
                  </Button>
                </div>
              </div>
            )}

            {/* Back button for read-only mode */}
            {isReadOnly && (
              <div className="text-center pt-8 space-y-6">
                {/* Links to Sacred Documents */}
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button
                    onClick={() => navigate('/')}
                    className="px-6 py-3 rounded-xl"
                    style={{
                      fontFamily: fontStyles.body,
                      background: 'linear-gradient(135deg, #1a7d45 0%, #166534 50%, #0d4a2a 100%)',
                      color: '#E8D5A3',
                      border: '2px solid #DAA520',
                      boxShadow: '0 4px 15px rgba(212,175,55,0.3)'
                    }}
                  >
                    🏠 Về Trang Chủ
                  </Button>
                  <Button
                    onClick={() => navigate('/docs/master-charter')}
                    className="px-6 py-3 rounded-xl"
                    style={{
                      fontFamily: fontStyles.body,
                      background: 'linear-gradient(135deg, #D4AF37 0%, #FFD700 50%, #D4AF37 100%)',
                      color: '#FFFFFF',
                      boxShadow: '0 4px 15px rgba(212,175,55,0.3)'
                    }}
                  >
                    📜 Đọc Hiến Pháp Gốc
                  </Button>
                  <Button
                    onClick={() => navigate('/docs/pplp')}
                    className="px-6 py-3 rounded-xl"
                    style={{
                      fontFamily: fontStyles.body,
                      background: 'linear-gradient(135deg, #D4AF37 0%, #FFD700 50%, #D4AF37 100%)',
                      color: '#FFFFFF',
                      boxShadow: '0 4px 15px rgba(212,175,55,0.3)'
                    }}
                  >
                    🌞 Đọc Giao Thức PPLP
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CSS Animations - Only button glow kept */}
      <style>{`
        @keyframes buttonGlow {
          0%, 100% { box-shadow: 0 0 30px rgba(212,175,55,0.5), 0 0 60px rgba(255,215,0,0.3); }
          50% { box-shadow: 0 0 40px rgba(212,175,55,0.7), 0 0 80px rgba(255,215,0,0.5), 0 0 120px rgba(212,175,55,0.3); }
        }
      `}</style>
    </div>
  );
};

export default LawOfLight;
