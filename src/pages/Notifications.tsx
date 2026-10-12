import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bell, Heart, MessageCircle, Share2, Gift, UserPlus, UserX, UserCheck, Filter, Check, CheckCheck, Shield, Radio, Wallet, ChevronDown, ChevronUp, Sparkles, Tags } from "lucide-react";
import funLogo from '@/assets/fun-profile-logo.png';

import {
  SYSTEM_NOTIF_TEXT,
  notificationRoute,
  SYSTEM_TYPES,
  FRAUD_TYPES as FRAUD_NOTIF_TYPES,
  PET_NOTIFICATION_TYPES as PET_NOTIF_TYPES,
} from "@/components/layout/notifications/systemNotifications";

const SYSTEM_NOTIFICATION_TYPES: readonly string[] = SYSTEM_TYPES;
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDistanceToNow } from "date-fns";
import { useDateLocale } from '@/hooks/useDateLocale';
import { cn } from "@/lib/utils";
import { useLanguage } from "@/i18n/LanguageContext";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { PullToRefreshContainer } from "@/components/common/PullToRefreshContainer";

type NotificationFilter = "all" | "reactions" | "comments" | "shares" | "friends" | "donations" | "pet" | "system";

const PET_NOTIFICATION_TYPES: readonly string[] = PET_NOTIF_TYPES;

interface NotificationWithActor {
  id: string;
  type: string;
  read: boolean;
  created_at: string;
  post_id: string | null;
  metadata: Record<string, any> | null;
  actor: {
    id: string;
    username: string;
    avatar_url: string | null;
    full_name: string | null;
  };
}

const FraudDetails = ({ type, metadata: m, formatWithEmails }: { type: string; metadata: Record<string, any>; formatWithEmails: (u: string[] | undefined, e: Record<string, string> | undefined, l?: number) => string }) => {
  const { t } = useLanguage();
  const items: string[] = [];
  if (type === "admin_shared_device") {
    const userList = formatWithEmails(m?.usernames, m?.flagged_emails, 10);
    if (userList) items.push(`${t('notFraudAccounts')}${userList}`);
  } else if (type === "admin_email_farm") {
    const userList = formatWithEmails(m?.usernames, m?.flagged_emails, 10);
    const emails = m?.emails?.slice(0, 10)?.join(', ');
    if (userList) items.push(`${t('notFraudAccounts')}${userList}`);
    else if (emails) items.push(`Emails: ${emails}`);
  } else if (type === "admin_blacklisted_ip") {
    const userList = formatWithEmails(m?.known_usernames, m?.flagged_emails, 10);
    if (userList) items.push(`${t('notFraudRelated')}${userList}`);
  } else if (type === "admin_fraud_daily" && m?.alerts?.length) {
    m.alerts.forEach((a: string) => items.push(a));
  }
  if (!items.length) return null;
  return (
    <div className="mt-1.5 space-y-1 text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
      {items.map((item, i) => (
        <p key={i} className="break-words">• {item}</p>
      ))}
    </div>
  );
};

const Notifications = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const dateLocale = useDateLocale();
  const { userId, isLoading: authLoading } = useCurrentUser();
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [expandedNotifications, setExpandedNotifications] = useState<Set<string>>(new Set());

  const toggleExpand = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNotifications(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!authLoading && !userId) navigate("/auth");
  }, [userId, authLoading, navigate]);

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["notifications-page", userId],
    queryFn: async () => {
      if (!userId) return [];
      
      const { data, error } = await supabase
        .from("notifications")
        .select(`
          id,
          type,
          read,
          created_at,
          post_id,
          metadata,
          actor:profiles!notifications_actor_id_fkey(id, username, avatar_url, full_name)
        `)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      return (data || []) as unknown as NotificationWithActor[];
    },
    enabled: !!userId,
  });

  // Real-time subscription
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`notifications-page-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["notifications-page", userId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  const filterNotifications = (notifs: NotificationWithActor[]) => {
    switch (filter) {
      case "reactions":
        return notifs.filter(n => 
          ["like", "love", "haha", "wow", "sad", "angry", "comment_like"].includes(n.type)
        );
      case "comments":
        return notifs.filter(n => ["comment", "comment_reply", "post_tagged"].includes(n.type));
      case "shares":
        return notifs.filter(n => n.type === "share");
      case "friends":
        return notifs.filter(n => 
          ["friend_request", "friend_accepted", "friend_removed"].includes(n.type)
        );
      case "donations":
        return notifs.filter(n => 
          ["donation", "claim_reward"].includes(n.type)
        );
      case "pet":
        return notifs.filter(n => PET_NOTIFICATION_TYPES.includes(n.type));
      case "system":
        return notifs.filter(n => 
          ["reward_approved", "reward_rejected", "account_banned", "system", "admin_shared_device", "admin_email_farm", "admin_blacklisted_ip", "admin_fraud_daily"].includes(n.type)
        );
      default:
        return notifs;
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "like":
      case "love":
      case "care":
      case "comment_like":
        return <Heart className="h-4 w-4 text-red-500 fill-red-500" />;
      case "haha":
      case "wow":
      case "sad":
      case "angry":
      case "pray":
        return <Heart className="h-4 w-4 text-yellow-500 fill-yellow-500" />;
      case "comment":
      case "comment_reply":
        return <MessageCircle className="h-4 w-4 text-blue-500" />;
      case "share":
        return <Share2 className="h-4 w-4 text-green-500" />;
      case "post_tagged":
        return <Tags className="h-4 w-4 text-primary" />;
      case "donation":
        return <Gift className="h-4 w-4 text-green-500" />;
      case "friend_request":
      case "friend_accepted":
        return <UserPlus className="h-4 w-4 text-purple-500" />;
      case "friend_removed":
        return <UserX className="h-4 w-4 text-destructive" />;
      case "reward_approved":
      case "reward_rejected":
      case "claim_reward":
        return <Wallet className="h-4 w-4 text-amber-500" />;
      case "account_banned":
        return <Shield className="h-4 w-4 text-destructive" />;
      case "admin_shared_device":
      case "admin_email_farm":
      case "admin_blacklisted_ip":
      case "admin_fraud_daily":
        return <Shield className="h-4 w-4 text-orange-500" />;
      case "live_started":
        return <Radio className="h-4 w-4 text-destructive" />;
      case "pet_cheer_received":
      case "pet_evolved":
      case "pet_cosmetic_received":
      case "pet_xp_granted":
        return <Sparkles className="h-4 w-4 text-pink-500" />;
      default:
        return <Bell className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const formatWithEmails = (usernames: string[] | undefined, emailsMap: Record<string, string> | undefined, limit: number = 5): string => {
    if (!usernames?.length) return '';
    return usernames.slice(0, limit).map(name => {
      const email = emailsMap?.[name];
      return email ? `${name} (${email})` : name;
    }).join(', ');
  };

  const fmtNum = (v: unknown) => (Number(v) || 0).toLocaleString(dateLocale?.code ?? 'vi-VN');

  const getNotificationText = (notification: NotificationWithActor) => {
    const actorName = notification.actor?.username || t('anonymous');
    const m = notification.metadata;
    if (notification.type === "post_tagged") {
      return `${actorName}${t('notTagged')}`;
    }
    
    switch (notification.type) {
      case "like":
        return `${actorName}${t('notLiked')}`;
      case "love":
        return `${actorName}${t('notLoved')}`;
      case "care":
        return `${actorName}${t('notCared')}`;
      case "haha":
        return `${actorName}${t('notHaha')}`;
      case "wow":
        return `${actorName}${t('notWow')}`;
      case "sad":
        return `${actorName}${t('notSad')}`;
      case "angry":
        return `${actorName}${t('notAngry')}`;
      case "pray":
        return `${actorName}${t('notGrateful')}`;
      case "comment":
        return `${actorName}${t('notCommented')}`;
      case "comment_like":
        return `${actorName}${t('notLikedComment')}`;
      case "comment_reply":
        return `${actorName}${t('notRepliedComment')}`;
      case "share":
        return `${actorName}${t('notShared')}`;
      case "donation":
        return `${actorName}${t('notGifted')}`;
      case "friend_request":
        return `${actorName}${t('notFriendRequest')}`;
      case "friend_accepted":
        return `${actorName}${t('notFriendAccepted')}`;
      case "friend_removed":
        return `${actorName}${t('notUnfriended')}`;
      case "reward_approved":
        return t("notRewardApproved");
      case "reward_rejected":
        return t("notRewardReview");
      case "claim_reward":
        return t("notRewardSent");
      case "account_banned":
        return t("notRestricted");
      case "live_started":
        return `🔴 ${actorName}${t('notLiveSuffix')}`;
      case "admin_shared_device": {
        const summary = m?.device_hash
          ? `${t('notFraudDeviceA')}${(m.device_hash as string).slice(0, 8)}${t('notFraudDeviceB')}${m.user_count || '?'}${t('notFraudAccountsSuffix')}`
          : t('notFraudDevice');
        return summary;
      }
      case "admin_email_farm": {
        const summary = m?.email_base
          ? `${t('notFraudEmailA')}${m.email_base}${t('notFraudEmailB')}${m.count || '?'}${t('notFraudAccountsSuffix')}`
          : t('notFraudEmail');
        return summary;
      }
      case "admin_blacklisted_ip": {
        const summary = m?.ip_address
          ? `${t('notFraudIpA')}${m.ip_address}`
          : t('notFraudIp');
        return summary;
      }
      case "admin_fraud_daily": {
        const summary = m?.alerts_count
          ? `${t('notFraudReportA')}${m.alerts_count}${t('notFraudReportB')}`
          : t('notFraudReport');
        return summary;
      }
      case "pet_cheer_received":
        return `${actorName}${t('notPetCheered')}`;
      case "pet_evolved":
        return `${t('notPetEvolvedA')}${m?.to_stage ? `${t('notPetEvolvedB')}${m.to_stage}` : ''}!`;
      case "pet_cosmetic_received":
        return `${t('notPetCosmetic')}${m?.cosmetic_name ? `: ${m.cosmetic_name}` : ''}`;
      case "pet_xp_granted":
        return `${t('notPetXpA')}${m?.xp ?? ''} XP`;
      default: {
        const build = SYSTEM_NOTIF_TEXT[notification.type];
        if (build) {
          const { title, desc } = build(m as Record<string, unknown> | null, t, fmtNum);
          return `${title} — ${desc}`;
        }
        return t("notSystemNew");
      }
    }

  };

  const markAsRead = async (notificationId: string) => {
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", notificationId);
    
    queryClient.invalidateQueries({ queryKey: ["notifications-page", userId] });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  const markAllAsRead = async () => {
    if (!userId) return;
    
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", userId)
      .eq("read", false);
    
    queryClient.invalidateQueries({ queryKey: ["notifications-page", userId] });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  const handleNotificationClick = async (notification: NotificationWithActor) => {
    if (!notification.read) {
      await markAsRead(notification.id);
    }

    const route = notificationRoute(notification);
    if (route) navigate(route);
  };

  const FRAUD_TYPES: readonly string[] = FRAUD_NOTIF_TYPES;
  const allFiltered = filterNotifications(notifications);
  const fraudNotifications = allFiltered.filter(n => FRAUD_TYPES.includes(n.type));
  const filteredNotifications = allFiltered.filter(n => !FRAUD_TYPES.includes(n.type));
  const unreadCount = notifications.filter(n => !n.read).length;

  const filterOptions = [
    { value: "all", label: t("benAll"), icon: Bell },
    { value: "reactions", label: "Reactions", icon: Heart },
    { value: "comments", label: t("notTabComments"), icon: MessageCircle },
    { value: "shares", label: t("notTabShares"), icon: Share2 },
    { value: "donations", label: t("notTabDonations"), icon: Gift },
    { value: "friends", label: t("friTitle"), icon: UserPlus },
    { value: "pet", label: t("notTabPet"), icon: Sparkles },
    { value: "system", label: t("notTabSystem"), icon: Shield },
  ];

  const handlePullRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["notifications-page", userId] });
  }, [queryClient, userId]);

  return (
    <div className="min-h-screen overflow-hidden">
      {/* Header - sub-header sticky bar dưới navbar chính */}
      <div className="fixed left-0 right-0 z-40 bg-card/80 border-b border-border" style={{ top: 'calc(var(--header-h) + var(--safe-top))' }}>
        <div className="max-w-3xl mx-auto flex items-center justify-between px-4 sm:px-6 py-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(-1)}
              className="shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold">{t('setTabNotifications')}</h1>
              {unreadCount > 0 && (
                <Badge 
                  variant="secondary" 
                  className="bg-green-500 text-white hover:bg-green-600 animate-pulse"
                >
                  {unreadCount}
                </Badge>
              )}
            </div>
          </div>
          
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={markAllAsRead}
              className="text-primary text-sm"
            >
              <CheckCheck className="h-4 w-4 mr-1" />
              {t('notMarkAll')}
            </Button>
          )}
        </div>

        {/* Filter Tabs */}
        <div className="px-2 pb-2 overflow-x-auto scrollbar-hide">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as NotificationFilter)}>
            <TabsList className="bg-muted/50 p-1 h-auto flex-nowrap w-max">
              {filterOptions.map((option) => (
                <TabsTrigger
                  key={option.value}
                  value={option.value}
                  className={cn(
                    "px-3 py-1.5 text-xs rounded-full whitespace-nowrap border-[0.5px] transition-all duration-300",
                    "border-transparent hover:border-[#C9A84C]/40",
                    "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-[#C9A84C]"
                  )}
                >
                  <option.icon className="h-3 w-3 mr-1.5" />
                  {option.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Notifications List */}
      <div data-app-scroll className="fixed inset-x-0 overflow-y-auto" style={{ top: 'calc(var(--header-h) + var(--safe-top) + 100px)', bottom: 0, paddingBottom: 'calc(var(--mbn-h) + var(--safe-bottom) + 8px)' }}>
        <div className="max-w-3xl mx-auto">
        <PullToRefreshContainer onRefresh={handlePullRefresh}>
          <div className="divide-y divide-border">
            {isLoading ? (
              <div className="p-3 space-y-3" aria-label={t("notLoadingLabel")}>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-start gap-3 py-2">
                    <div className="skeleton-shimmer w-10 h-10 rounded-full shrink-0" />
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="skeleton-shimmer h-3 w-3/4 rounded" />
                      <div className="skeleton-shimmer h-3 w-1/3 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Bell className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground">
                  {filter === "all" 
                    ? t("notEmptyAll") 
                    : t("notEmptyFilter")}
                </p>
              </div>
            ) : (
              <>
              {/* Pinned Fraud Alerts */}
              {fraudNotifications.length > 0 && (
                <div className="border-b-2 border-destructive/30 bg-destructive/5">
                  <div className="px-4 py-2 flex items-center gap-2 bg-destructive/10 border-b border-destructive/20">
                    <Shield className="h-4 w-4 text-destructive" />
                    <span className="text-sm font-semibold text-destructive">{t('notSecurityAlert')}</span>
                    <Badge variant="secondary" className="bg-destructive text-destructive-foreground text-xs ml-auto">
                      {fraudNotifications.length}
                    </Badge>
                  </div>
                  {fraudNotifications.map((notification) => (
                    <div
                      key={notification.id}
                      onClick={() => handleNotificationClick(notification)}
                      className={cn(
                        "flex items-start gap-3 p-4 cursor-pointer transition-all duration-300",
                        "hover:bg-destructive/10 active:bg-destructive/15 border-b border-destructive/10",
                        !notification.read && "bg-destructive/5 relative",
                        !notification.read && "before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-destructive before:animate-pulse"
                      )}
                    >
                      <div className="relative shrink-0">
                        <div className={cn(
                          "h-12 w-12 rounded-full flex items-center justify-center",
                          "bg-gradient-to-br from-destructive to-destructive/80 border-2 border-destructive/60",
                          !notification.read && "animate-pulse shadow-[0_0_12px_hsl(0_84%_60%/0.5)]"
                        )}>
                          <Shield className="h-6 w-6 text-white" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          "text-sm leading-relaxed",
                          !notification.read ? "font-medium text-foreground" : "text-muted-foreground"
                        )}>
                          {getNotificationText(notification)}
                        </p>
                        {notification.metadata && (
                          <>
                            <button
                              onClick={(e) => toggleExpand(notification.id, e)}
                              className="text-xs text-destructive hover:underline mt-1 flex items-center gap-1"
                            >
                              {expandedNotifications.has(notification.id) ? (
                                <>{t('notCollapse')}<ChevronUp className="h-3 w-3" /></>
                              ) : (
                                <>{t('notExpand')}<ChevronDown className="h-3 w-3" /></>
                              )}
                            </button>
                            {expandedNotifications.has(notification.id) && (
                              <FraudDetails type={notification.type} metadata={notification.metadata as Record<string, any>} formatWithEmails={formatWithEmails} />
                            )}
                          </>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true, locale: dateLocale })}
                        </p>
                      </div>
                      {!notification.read && (
                        <div className="shrink-0 mt-1">
                          <div className="w-3 h-3 rounded-full bg-destructive animate-pulse shadow-lg shadow-destructive/50" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Normal Notifications */}
              {filteredNotifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={cn(
                    "flex items-start gap-3 p-4 cursor-pointer transition-all duration-300",
                    "hover:bg-muted/50 active:bg-muted",
                    !notification.read && "bg-primary/5 relative",
                    !notification.read && "before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-gradient-to-b before:from-yellow-400 before:via-amber-500 before:to-yellow-400 before:animate-pulse"
                  )}
                >
                  {/* Avatar with Icon Badge */}
                  <div className="relative shrink-0">
                    <Avatar className={cn(
                      "h-12 w-12 ring-2",
                      !notification.read 
                        ? "ring-amber-400/50 shadow-lg shadow-amber-400/20" 
                        : "ring-transparent"
                    )}>
                      {(() => {
                        const isSysNotif = SYSTEM_NOTIFICATION_TYPES.includes(notification.type);
                        return (
                          <>
                            <AvatarImage src={isSysNotif ? funLogo : notification.actor?.avatar_url || ""} skipTransform={isSysNotif} />
                            <AvatarFallback className="bg-gradient-to-br from-primary to-primary/60 text-primary-foreground">
                              {isSysNotif ? 'FR' : notification.actor?.username?.charAt(0)?.toUpperCase() || "?"}
                            </AvatarFallback>
                          </>
                        );
                      })()}
                    </Avatar>
                    <div className="absolute -bottom-1 -right-1 bg-background rounded-full p-1 shadow-md">
                      {getNotificationIcon(notification.type)}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-sm leading-relaxed",
                      !notification.read ? "font-medium text-foreground" : "text-muted-foreground"
                    )}>
                      {getNotificationText(notification)}
                    </p>
                    {/* Expandable details for fraud notifications */}
                    {["admin_fraud_daily", "admin_shared_device", "admin_email_farm", "admin_blacklisted_ip"].includes(notification.type) && notification.metadata && (
                      <>
                        <button
                          onClick={(e) => toggleExpand(notification.id, e)}
                          className="text-xs text-primary hover:underline mt-1 flex items-center gap-1"
                        >
                          {expandedNotifications.has(notification.id) ? (
                            <>{t('notCollapse')}<ChevronUp className="h-3 w-3" /></>
                          ) : (
                            <>{t('notExpand')}<ChevronDown className="h-3 w-3" /></>
                          )}
                        </button>
                        {expandedNotifications.has(notification.id) && (
                          <FraudDetails type={notification.type} metadata={notification.metadata as Record<string, any>} formatWithEmails={formatWithEmails} />
                        )}
                      </>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(notification.created_at), { 
                        addSuffix: true,
                        locale: dateLocale 
                      })}
                    </p>
                  </div>

                  {/* Unread Indicator */}
                  {!notification.read && (
                    <div className="shrink-0 mt-1">
                      <div className="w-3 h-3 rounded-full bg-gradient-to-r from-green-400 to-emerald-500 animate-pulse shadow-lg shadow-green-400/50" />
                    </div>
                  )}
                </div>
              ))}
              </>
            )}
          </div>
        </PullToRefreshContainer>
        </div>
      </div>
      
      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />
    </div>
  );
};

export default Notifications;
