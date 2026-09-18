import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/pdk/core/hooks/use-toast";

interface ReferralCode {
  id: string;
  code: string;
  total_uses: number;
  is_active: boolean;
  created_at: string;
}

interface ReferralUse {
  id: string;
  referredUser: {
    username: string;
    avatarUrl?: string;
  };
  rewardAmount: number;
  createdAt: string;
}

interface ReferralStats {
  totalReferrals: number;
  totalRewards: number;
  recentReferrals: ReferralUse[];
}

interface UseReferralReturn {
  referralCode: ReferralCode | null;
  stats: ReferralStats;
  loading: boolean;
  error: string | null;
  generateCode: () => Promise<void>;
  applyCode: (code: string) => Promise<boolean>;
  refreshData: () => Promise<void>;
}

// Generate random 8-character code
function generateRandomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Removed confusing chars: I, O, 0, 1
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function useReferral(): UseReferralReturn {
  const [referralCode, setReferralCode] = useState<ReferralCode | null>(null);
  const [stats, setStats] = useState<ReferralStats>({
    totalReferrals: 0,
    totalRewards: 0,
    recentReferrals: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Fetch user's referral code
  const fetchReferralCode = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error: fetchError } = await supabase
        .from("referral_codes")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (fetchError && fetchError.code !== "PGRST116") {
        throw fetchError;
      }

      setReferralCode(data);
    } catch (err) {
      console.error("Error fetching referral code:", err);
      setError("Không thể tải mã giới thiệu");
    }
  }, []);

  // Fetch referral stats
  const fetchStats = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get referral uses where current user is the referrer
      const { data: uses, error: usesError } = await supabase
        .from("referral_uses")
        .select(`
          id,
          reward_amount,
          created_at,
          referred_id
        `)
        .eq("referrer_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5);

      if (usesError) throw usesError;

      // Calculate totals
      const totalReferrals = uses?.length || 0;
      const totalRewards = uses?.reduce((sum, use) => sum + (use.reward_amount || 0), 0) || 0;

      // Map to ReferralUse format (would need to fetch profile data in real implementation)
      const recentReferrals: ReferralUse[] = (uses || []).map((use) => ({
        id: use.id,
        referredUser: {
          username: "User" + use.referred_id.slice(0, 4),
          avatarUrl: undefined,
        },
        rewardAmount: use.reward_amount || 0,
        createdAt: use.created_at,
      }));

      setStats({
        totalReferrals,
        totalRewards,
        recentReferrals,
      });
    } catch (err) {
      console.error("Error fetching stats:", err);
    }
  }, []);

  // Generate new referral code
  const generateCode = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("Bạn cần đăng nhập để tạo mã giới thiệu");
      }

      // Check if user already has a code
      const { data: existing } = await supabase
        .from("referral_codes")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (existing) {
        throw new Error("Bạn đã có mã giới thiệu");
      }

      // Generate unique code
      let newCode = generateRandomCode();
      let attempts = 0;
      const maxAttempts = 5;

      while (attempts < maxAttempts) {
        const { data: existingCode } = await supabase
          .from("referral_codes")
          .select("id")
          .eq("code", newCode)
          .single();

        if (!existingCode) break;
        newCode = generateRandomCode();
        attempts++;
      }

      // Insert new code
      const { data, error: insertError } = await supabase
        .from("referral_codes")
        .insert({
          user_id: user.id,
          code: newCode,
          is_active: true,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      setReferralCode(data);
      toast({
        title: "Thành công!",
        description: `Mã giới thiệu ${newCode} đã được tạo.`,
      });
    } catch (err: any) {
      const message = err.message || "Không thể tạo mã giới thiệu";
      setError(message);
      toast({
        title: "Lỗi",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Apply a referral code (for new users)
  const applyCode = useCallback(async (code: string): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("Bạn cần đăng nhập để sử dụng mã giới thiệu");
      }

      // Find the referral code
      const { data: codeData, error: codeError } = await supabase
        .from("referral_codes")
        .select("id, user_id, is_active")
        .eq("code", code.toUpperCase())
        .single();

      if (codeError || !codeData) {
        throw new Error("Mã giới thiệu không hợp lệ");
      }

      if (!codeData.is_active) {
        throw new Error("Mã giới thiệu đã hết hiệu lực");
      }

      if (codeData.user_id === user.id) {
        throw new Error("Bạn không thể sử dụng mã của chính mình");
      }

      // Check if user already used a referral code
      const { data: existingUse } = await supabase
        .from("referral_uses")
        .select("id")
        .eq("referred_id", user.id)
        .single();

      if (existingUse) {
        throw new Error("Bạn đã sử dụng mã giới thiệu trước đó");
      }

      // Create referral use record
      const rewardAmount = 10; // Could be configurable

      const { error: useError } = await supabase
        .from("referral_uses")
        .insert({
          code_id: codeData.id,
          referrer_id: codeData.user_id,
          referred_id: user.id,
          reward_amount: rewardAmount,
        });

      if (useError) throw useError;

      // Update total uses count
      await supabase
        .from("referral_codes")
        .update({ total_uses: supabase.rpc("increment_referral_count") })
        .eq("id", codeData.id);

      toast({
        title: "Thành công!",
        description: `Mã giới thiệu đã được áp dụng. Bạn nhận được ${rewardAmount} FUN!`,
      });

      return true;
    } catch (err: any) {
      const message = err.message || "Không thể áp dụng mã giới thiệu";
      setError(message);
      toast({
        title: "Lỗi",
        description: message,
        variant: "destructive",
      });
      return false;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Refresh all data
  const refreshData = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchReferralCode(), fetchStats()]);
    setLoading(false);
  }, [fetchReferralCode, fetchStats]);

  // Initial data fetch
  useEffect(() => {
    refreshData();
  }, [refreshData]);

  return {
    referralCode,
    stats,
    loading,
    error,
    generateCode,
    applyCode,
    refreshData,
  };
}
