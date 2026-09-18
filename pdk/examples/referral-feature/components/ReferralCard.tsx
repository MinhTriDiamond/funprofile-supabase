import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/pdk/core/components/ui/card";
import { Button } from "@/pdk/core/components/ui/button";
import { Badge } from "@/pdk/core/components/ui/badge";
import { useToast } from "@/pdk/core/hooks/use-toast";
import { Copy, Check, Share2, Users } from "lucide-react";

interface ReferralCardProps {
  code: string;
  totalUses: number;
  isActive: boolean;
  onShare?: () => void;
}

export function ReferralCard({ code, totalUses, isActive, onShare }: ReferralCardProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast({
        title: "Đã sao chép!",
        description: "Mã giới thiệu đã được sao chép vào clipboard.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({
        title: "Lỗi",
        description: "Không thể sao chép mã.",
        variant: "destructive",
      });
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Mã Giới Thiệu Fun Profile",
          text: `Sử dụng mã ${code} để đăng ký Fun Profile và nhận thưởng!`,
          url: `https://funprofile.app/register?ref=${code}`,
        });
      } catch (error) {
        // User cancelled share
      }
    } else {
      onShare?.();
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg font-semibold">Mã Giới Thiệu</CardTitle>
        <Badge variant={isActive ? "default" : "secondary"}>
          {isActive ? "Đang hoạt động" : "Tạm dừng"}
        </Badge>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Code Display */}
        <div className="flex items-center justify-center p-4 bg-muted rounded-lg">
          <span className="text-3xl font-mono font-bold tracking-wider text-foreground">
            {code}
          </span>
        </div>

        {/* Stats */}
        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <Users className="h-4 w-4" />
          <span>{totalUses} người đã sử dụng</span>
        </div>
      </CardContent>

      <CardFooter className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={handleCopy}
        >
          {copied ? (
            <>
              <Check className="h-4 w-4 mr-2" />
              Đã sao chép
            </>
          ) : (
            <>
              <Copy className="h-4 w-4 mr-2" />
              Sao chép
            </>
          )}
        </Button>
        
        <Button className="flex-1" onClick={handleShare}>
          <Share2 className="h-4 w-4 mr-2" />
          Chia sẻ
        </Button>
      </CardFooter>
    </Card>
  );
}
