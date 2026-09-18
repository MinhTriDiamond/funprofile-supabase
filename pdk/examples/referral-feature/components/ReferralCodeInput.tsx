import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/pdk/core/components/ui/card";
import { Button } from "@/pdk/core/components/ui/button";
import { Input } from "@/pdk/core/components/ui/input";
import { Label } from "@/pdk/core/components/ui/label";
import { Gift, Loader2 } from "lucide-react";

interface ReferralCodeInputProps {
  onSubmit: (code: string) => Promise<void>;
  loading?: boolean;
  error?: string;
}

export function ReferralCodeInput({ onSubmit, loading, error }: ReferralCodeInputProps) {
  const [code, setCode] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim()) {
      await onSubmit(code.trim().toUpperCase());
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Convert to uppercase and remove spaces
    const value = e.target.value.toUpperCase().replace(/\s/g, "");
    // Limit to 8 characters
    setCode(value.slice(0, 8));
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Gift className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Có Mã Giới Thiệu?</CardTitle>
        </div>
        <CardDescription>
          Nhập mã giới thiệu từ bạn bè để nhận thưởng khi đăng ký.
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="referral-code">Mã Giới Thiệu</Label>
            <Input
              id="referral-code"
              value={code}
              onChange={handleChange}
              placeholder="ABCD1234"
              className="font-mono text-lg tracking-wider uppercase"
              maxLength={8}
              disabled={loading}
            />
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
          
          <Button 
            type="submit" 
            className="w-full"
            disabled={!code.trim() || loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Đang xác nhận...
              </>
            ) : (
              "Áp Dụng Mã"
            )}
          </Button>
        </form>

        <p className="text-xs text-muted-foreground text-center mt-4">
          Mã giới thiệu có 8 ký tự, bao gồm chữ và số.
        </p>
      </CardContent>
    </Card>
  );
}
