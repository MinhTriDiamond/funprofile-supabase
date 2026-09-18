import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Smartphone, Monitor, Apple, Chrome, Share, Plus, MoreVertical } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { BackToHomeCTA } from "@/components/layout/BackToHome";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const Install = () => {
  const navigate = useNavigate();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | "desktop">("desktop");

  useEffect(() => {
    // Detect platform
    const userAgent = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(userAgent)) {
      setPlatform("ios");
    } else if (/android/.test(userAgent)) {
      setPlatform("android");
    } else {
      setPlatform("desktop");
    }

    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    // Listen for install prompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === "accepted") {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  if (isInstalled) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center">
          <CardHeader>
            <div className="mx-auto w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <Download className="w-10 h-10 text-green-600" />
            </div>
            <CardTitle className="text-2xl text-green-600">Đã cài đặt!</CardTitle>
            <CardDescription>
              FUN Profile đã được thêm vào màn hình chính của bạn
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/")} className="w-full">
              Mở FUN Profile
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-background">
      {/* Header */}
      <div className="bg-primary text-primary-foreground py-8 px-4 text-center">
        <img 
          src="/pwa-192.png" 
          alt="FUN Profile" 
          className="w-24 h-24 mx-auto rounded-2xl shadow-lg mb-4"
        />
        <h1 className="text-3xl font-bold mb-2">Cài đặt FUN Profile</h1>
        <p className="text-primary-foreground/80">
          Thêm vào màn hình chính để trải nghiệm như app thật
        </p>
      </div>

      {/* Benefits */}
      <div className="max-w-2xl mx-auto p-4 space-y-4 -mt-4">
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-2">
                  <Smartphone className="w-6 h-6 text-green-600" />
                </div>
                <p className="text-sm font-medium">Mở nhanh</p>
                <p className="text-xs text-muted-foreground">Từ màn hình chính</p>
              </div>
              <div>
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-2">
                  <Monitor className="w-6 h-6 text-blue-600" />
                </div>
                <p className="text-sm font-medium">Full screen</p>
                <p className="text-xs text-muted-foreground">Không thanh địa chỉ</p>
              </div>
              <div>
                <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center mx-auto mb-2">
                  <Download className="w-6 h-6 text-purple-600" />
                </div>
                <p className="text-sm font-medium">Offline</p>
                <p className="text-xs text-muted-foreground">Xem khi mất mạng</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Install Button (Android/Desktop) */}
        {deferredPrompt && (platform === "android" || platform === "desktop") && (
          <Button 
            onClick={handleInstall} 
            size="lg" 
            className="w-full text-lg py-6"
          >
            <Download className="w-5 h-5 mr-2" />
            Cài đặt ngay
          </Button>
        )}

        {/* iOS Instructions */}
        {platform === "ios" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Apple className="w-5 h-5" />
                Hướng dẫn cho iPhone/iPad
              </CardTitle>
              <CardDescription>
                Làm theo các bước sau để cài đặt
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center flex-shrink-0">
                  1
                </div>
                <div>
                  <p className="font-medium">Nhấn nút Chia sẻ</p>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    Tìm biểu tượng <Share className="w-4 h-4" /> ở thanh công cụ Safari
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center flex-shrink-0">
                  2
                </div>
                <div>
                  <p className="font-medium">Cuộn xuống và chọn "Thêm vào MH chính"</p>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    Tìm biểu tượng <Plus className="w-4 h-4" /> Add to Home Screen
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center flex-shrink-0">
                  3
                </div>
                <div>
                  <p className="font-medium">Nhấn "Thêm"</p>
                  <p className="text-sm text-muted-foreground">
                    FUN Profile sẽ xuất hiện trên màn hình chính
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Android Instructions (fallback) */}
        {platform === "android" && !deferredPrompt && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Chrome className="w-5 h-5" />
                Hướng dẫn cho Android
              </CardTitle>
              <CardDescription>
                Làm theo các bước sau để cài đặt
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center flex-shrink-0">
                  1
                </div>
                <div>
                  <p className="font-medium">Nhấn menu 3 chấm</p>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    Biểu tượng <MoreVertical className="w-4 h-4" /> ở góc phải trên
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center flex-shrink-0">
                  2
                </div>
                <div>
                  <p className="font-medium">Chọn "Cài đặt ứng dụng" hoặc "Thêm vào MH chính"</p>
                  <p className="text-sm text-muted-foreground">
                    Install app / Add to Home screen
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center flex-shrink-0">
                  3
                </div>
                <div>
                  <p className="font-medium">Nhấn "Cài đặt"</p>
                  <p className="text-sm text-muted-foreground">
                    App sẽ được thêm vào màn hình chính
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Desktop Instructions */}
        {platform === "desktop" && !deferredPrompt && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Monitor className="w-5 h-5" />
                Hướng dẫn cho Desktop
              </CardTitle>
              <CardDescription>
                Cài đặt trên Chrome, Edge hoặc Brave
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center flex-shrink-0">
                  1
                </div>
                <div>
                  <p className="font-medium">Tìm biểu tượng cài đặt</p>
                  <p className="text-sm text-muted-foreground">
                    Biểu tượng ⊕ hoặc 📥 ở thanh địa chỉ (bên phải)
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center flex-shrink-0">
                  2
                </div>
                <div>
                  <p className="font-medium">Nhấn "Install" hoặc "Cài đặt"</p>
                  <p className="text-sm text-muted-foreground">
                    App sẽ được cài đặt như ứng dụng desktop
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <BackToHomeCTA />
      </div>
    </div>
  );
};

export default Install;
