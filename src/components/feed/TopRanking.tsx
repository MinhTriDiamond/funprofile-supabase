import { useEffect, useState, memo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Landmark, Sparkles, Users } from "lucide-react";
import { useLanguage } from '@/i18n/LanguageContext';

interface LightCommunityMember {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  light_level: string;
  light_emoji: string;
  trend: string;
  trend_emoji: string;
}


const getLevelStyle = (level: string) => {
  switch (level) {
    case "Light Architect": return "border-yellow-400 text-yellow-600 bg-yellow-50/60";
    case "Light Guardian": return "border-rose-400 text-rose-600 bg-rose-50/50";
    case "Light Builder": return "border-emerald-400 text-emerald-600 bg-emerald-50/50";
    case "Light Sprout": return "border-sky-400 text-sky-600 bg-sky-50/50";
    default: return "border-stone-300 text-stone-500 bg-stone-50/50";
  }
};

export const TopRanking = memo(() => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [members, setMembers] = useState<LightCommunityMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLightCommunity();
  }, []);

  const fetchLightCommunity = async () => {
    try {
      const { data, error } = await supabase.rpc("get_light_community", { p_limit: 10 });
      if (error) throw error;
      if (data) {
        setMembers(data as LightCommunityMember[]);
      }
    } catch (error) {
      console.error("Error fetching light community:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUserClick = (userId: string) => {
    navigate(`/profile/${userId}`);
  };

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl overflow-hidden border bg-card shadow-sm">
      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="text-center space-y-1">
          <div className="flex items-center justify-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <h2
              className="text-[18px] font-black tracking-wider uppercase"
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                background: 'linear-gradient(90deg, #FF6B9D 0%, #C44FE2 15%, #7B68EE 30%, #00CED1 50%, #98FB98 70%, #FFFF00 85%, #FFB347 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              LIGHT COMMUNITY
            </h2>
            <Users className="w-4 h-4 text-emerald-500" />
          </div>
        </div>

        {/* Members list */}
        <div className="space-y-2">
          {members.map((member) => (
            <div
              key={member.user_id}
              onClick={() => handleUserClick(member.user_id)}
              className="flex items-center gap-2.5 p-3 bg-card rounded-xl border shadow-sm hover:shadow-md transition-all cursor-pointer"
            >
              {/* Light emoji */}
              <div className="w-8 h-8 flex items-center justify-center text-sm shrink-0">
                {member.light_level === "Light Architect" ? (
                  <Landmark className="w-4 h-4 text-emerald-600" />
                ) : (
                  member.light_emoji
                )}
              </div>

              {/* Avatar */}
              <Avatar className="w-8 h-8 shrink-0">
                <AvatarImage src={member.avatar_url} />
                <AvatarFallback className="text-xs bg-muted">
                  {member.username?.[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>

              {/* Name + username */}
              <div className="flex flex-col min-w-0 flex-1">
                <span className="font-semibold text-xs truncate">
                  {member.display_name || member.username}
                </span>
                <span className="text-[11px] text-muted-foreground truncate">
                  @{member.username}
                </span>
              </div>

              {/* Light Level badge */}
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap shrink-0 ${getLevelStyle(member.light_level)}`}>
                {member.light_level}
              </span>
              <span className="text-xs shrink-0" title={member.trend}>
                {member.trend_emoji}
              </span>
            </div>
          ))}
          {members.length === 0 && (
            <div className="text-center py-4 text-muted-foreground text-sm">
              {t('noCommunityData')}
            </div>
          )}
        </div>

        {/* CTA Button */}
        <Button
          onClick={() => navigate("/leaderboard")}
          variant="outline"
          className="w-full mt-1 font-semibold transition-all group"
        >
          Khám phá cộng đồng ánh sáng
          <ChevronRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
        </Button>
      </div>
    </div>
  );
});

TopRanking.displayName = "TopRanking";
