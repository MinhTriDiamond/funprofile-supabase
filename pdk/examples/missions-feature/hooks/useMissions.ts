import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/pdk/core/hooks/use-toast";

interface Mission {
  id: string;
  name: string;
  description: string;
  reward_amount: number;
  reward_type: string;
  target_value: number;
  mission_type: string;
  is_active: boolean;
}

interface MissionProgress {
  id: string;
  user_id: string;
  mission_id: string;
  current_value: number;
  is_completed: boolean;
  completed_at: string | null;
  is_claimed: boolean;
  claimed_at: string | null;
  reset_at: string | null;
}

interface UseMissionsReturn {
  missions: Mission[];
  progresses: MissionProgress[];
  loading: boolean;
  error: string | null;
  claimReward: (missionId: string) => Promise<boolean>;
  updateProgress: (missionId: string, value: number) => Promise<void>;
  refreshMissions: () => Promise<void>;
}

export function useMissions(): UseMissionsReturn {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [progresses, setProgresses] = useState<MissionProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Fetch active missions
  const fetchMissions = useCallback(async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from("mission_definitions")
        .select("*")
        .eq("is_active", true)
        .order("mission_type", { ascending: true });

      if (fetchError) throw fetchError;
      setMissions(data || []);
    } catch (err) {
      console.error("Error fetching missions:", err);
      setError("Không thể tải danh sách nhiệm vụ");
    }
  }, []);

  // Fetch user's progress
  const fetchProgresses = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error: fetchError } = await supabase
        .from("mission_progress")
        .select("*")
        .eq("user_id", user.id);

      if (fetchError) throw fetchError;
      setProgresses(data || []);
    } catch (err) {
      console.error("Error fetching progress:", err);
    }
  }, []);

  // Claim reward for completed mission
  const claimReward = useCallback(async (missionId: string): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("Bạn cần đăng nhập để nhận thưởng");
      }

      // Find the progress
      const progress = progresses.find(p => p.mission_id === missionId);
      if (!progress) {
        throw new Error("Không tìm thấy tiến độ nhiệm vụ");
      }

      if (!progress.is_completed) {
        throw new Error("Nhiệm vụ chưa hoàn thành");
      }

      if (progress.is_claimed) {
        throw new Error("Phần thưởng đã được nhận");
      }

      // Update progress to claimed
      const { error: updateError } = await supabase
        .from("mission_progress")
        .update({
          is_claimed: true,
          claimed_at: new Date().toISOString(),
        })
        .eq("id", progress.id);

      if (updateError) throw updateError;

      // Find mission for reward info
      const mission = missions.find(m => m.id === missionId);

      // Update local state
      setProgresses(prev =>
        prev.map(p =>
          p.id === progress.id
            ? { ...p, is_claimed: true, claimed_at: new Date().toISOString() }
            : p
        )
      );

      toast({
        title: "Nhận thưởng thành công!",
        description: `Bạn nhận được ${mission?.reward_amount || 0} ${mission?.reward_type || "FUN"}`,
      });

      return true;
    } catch (err: any) {
      const message = err.message || "Không thể nhận thưởng";
      toast({
        title: "Lỗi",
        description: message,
        variant: "destructive",
      });
      return false;
    }
  }, [progresses, missions, toast]);

  // Update progress for a mission (called when user performs action)
  const updateProgress = useCallback(async (missionId: string, value: number) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const mission = missions.find(m => m.id === missionId);
      if (!mission) return;

      const existingProgress = progresses.find(p => p.mission_id === missionId);
      const newValue = (existingProgress?.current_value || 0) + value;
      const isCompleted = newValue >= mission.target_value;

      if (existingProgress) {
        // Update existing progress
        const { error: updateError } = await supabase
          .from("mission_progress")
          .update({
            current_value: newValue,
            is_completed: isCompleted,
            completed_at: isCompleted && !existingProgress.is_completed
              ? new Date().toISOString()
              : existingProgress.completed_at,
          })
          .eq("id", existingProgress.id);

        if (updateError) throw updateError;
      } else {
        // Create new progress
        const { error: insertError } = await supabase
          .from("mission_progress")
          .insert({
            user_id: user.id,
            mission_id: missionId,
            current_value: newValue,
            is_completed: isCompleted,
            completed_at: isCompleted ? new Date().toISOString() : null,
          });

        if (insertError) throw insertError;
      }

      // Refresh progress data
      await fetchProgresses();

      // Show toast if mission completed
      if (isCompleted && !existingProgress?.is_completed) {
        toast({
          title: "Nhiệm vụ hoàn thành!",
          description: `${mission.name} - Nhận thưởng ngay!`,
        });
      }
    } catch (err) {
      console.error("Error updating progress:", err);
    }
  }, [missions, progresses, fetchProgresses, toast]);

  // Refresh all data
  const refreshMissions = useCallback(async () => {
    setLoading(true);
    setError(null);
    await Promise.all([fetchMissions(), fetchProgresses()]);
    setLoading(false);
  }, [fetchMissions, fetchProgresses]);

  // Initial fetch
  useEffect(() => {
    refreshMissions();
  }, [refreshMissions]);

  return {
    missions,
    progresses,
    loading,
    error,
    claimReward,
    updateProgress,
    refreshMissions,
  };
}
