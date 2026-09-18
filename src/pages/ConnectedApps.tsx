import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { FacebookNavbar } from '@/components/layout/FacebookNavbar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { 
  Sprout, 
  Gamepad2, 
  Globe, 
  Unlink, 
  Clock, 
  Database,
  Shield,
  RefreshCw
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useDateLocale } from '@/hooks/useDateLocale';
import { useLanguage } from '@/i18n/LanguageContext';
import { DOMAINS } from '@/config/sso-constants';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ConnectedApp {
  id: string;
  client_id: string;
  client_name: string;
  scope: string[];
  created_at: string;
  last_used_at: string | null;
  is_revoked: boolean;
}

interface CrossPlatformData {
  [clientId: string]: {
    data: Record<string, unknown>;
    synced_at: string;
    sync_count: number;
    last_sync_mode: string;
  };
}

const platformConfig: Record<string, { 
  icon: React.ReactNode; 
  color: string; 
  domain: string;
  description: string;
}> = {
  fun_farm_client: {
    icon: <Sprout className="h-6 w-6" />,
    color: 'text-green-500',
    domain: DOMAINS.funFarm,
    description: 'Nông trại ảo trong hệ sinh thái Fun'
  },
  fun_play_client: {
    icon: <Gamepad2 className="h-6 w-6" />,
    color: 'text-blue-500',
    domain: DOMAINS.funPlay,
    description: 'Nền tảng gaming và giải trí'
  },
  fun_planet_client: {
    icon: <Globe className="h-6 w-6" />,
    color: 'text-purple-500',
    domain: DOMAINS.funPlanet,
    description: 'Mạng xã hội phi tập trung'
  }
};

const ConnectedApps = () => {
  const navigate = useNavigate();
  const { userId, isLoading: authLoading } = useCurrentUser();
  const [loading, setLoading] = useState(true);
  const dateLocale = useDateLocale();
  const [connectedApps, setConnectedApps] = useState<ConnectedApp[]>([]);
  const [crossPlatformData, setCrossPlatformData] = useState<CrossPlatformData | null>(null);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [selectedApp, setSelectedApp] = useState<ConnectedApp | null>(null);
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    if (!authLoading && !userId) { navigate('/auth'); return; }
    if (userId) fetchConnectedApps();
  }, [userId, authLoading]);

  const fetchConnectedApps = async () => {
    if (!userId) return;
    try {
      // Fetch tokens (connected apps)
      const { data: tokens, error: tokensError } = await supabase
        .from('cross_platform_tokens')
        .select('id, client_id, scope, created_at, last_used_at, is_revoked')
        .eq('user_id', userId)
        .eq('is_revoked', false);

      if (tokensError) throw tokensError;

      // Get client names from oauth_clients (for admins) or use default names
      const appsWithNames: ConnectedApp[] = (tokens || []).map(token => ({
        ...token,
        client_name: getClientDisplayName(token.client_id)
      }));

      setConnectedApps(appsWithNames);

      // Fetch cross_platform_data from profile
      const { data: privateRows, error: profileError } = await supabase
        .rpc('get_my_profile_private');

      if (profileError) throw profileError;

      const privateRow = Array.isArray(privateRows) ? privateRows[0] : privateRows;
      setCrossPlatformData((privateRow?.cross_platform_data as CrossPlatformData) || null);
    } catch (error) {
      console.error('Error fetching connected apps:', error);
      toast.error('Không thể tải danh sách ứng dụng');
    } finally {
      setLoading(false);
    }
  };

  const getClientDisplayName = (clientId: string): string => {
    const names: Record<string, string> = {
      fun_farm_client: 'Fun Farm',
      fun_play_client: 'Fun Play',
      fun_planet_client: 'Fun Planet'
    };
    return names[clientId] || clientId;
  };

  const handleRevokeAccess = async () => {
    if (!selectedApp) return;
    
    setRevoking(true);
    try {
      const { error } = await supabase
        .from('cross_platform_tokens')
        .update({ is_revoked: true })
        .eq('id', selectedApp.id);

      if (error) throw error;

      toast.success(`Đã thu hồi quyền truy cập của ${selectedApp.client_name}`);
      setConnectedApps(prev => prev.filter(app => app.id !== selectedApp.id));
      setRevokeDialogOpen(false);
    } catch (error) {
      console.error('Error revoking access:', error);
      toast.error('Không thể thu hồi quyền truy cập');
    } finally {
      setRevoking(false);
      setSelectedApp(null);
    }
  };

  const getSyncStats = (clientId: string) => {
    if (!crossPlatformData || !crossPlatformData[clientId]) {
      return null;
    }
    return crossPlatformData[clientId];
  };

  const formatDataSize = (data: Record<string, unknown>): string => {
    const size = new Blob([JSON.stringify(data)]).size;
    if (size < 1024) return `${size} B`;
    return `${(size / 1024).toFixed(1)} KB`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background overflow-hidden">
        <FacebookNavbar />
        <main data-app-scroll className="app-main app-pb-nav">
          <div className="container max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <Skeleton className="h-8 w-64 mb-6" />
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-48 w-full rounded-xl" />
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      <FacebookNavbar />
      
      <main data-app-scroll className="app-main app-pb-nav">
        <div className="container max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="text-2xl font-bold text-foreground mb-2">
            Ứng dụng đã kết nối
          </h1>
          <p className="text-muted-foreground">
            Quản lý các platform đã liên kết với tài khoản Fun Profile của bạn
          </p>
        </div>

        {connectedApps.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Shield className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                Chưa có ứng dụng nào được kết nối
              </h3>
              <p className="text-muted-foreground text-center max-w-md">
                Khi bạn đăng nhập vào các platform trong hệ sinh thái Fun bằng Fun Profile, 
                chúng sẽ xuất hiện ở đây.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {connectedApps.map(app => {
              const config = platformConfig[app.client_id];
              const syncStats = getSyncStats(app.client_id);
              
              return (
                <Card key={app.id} className="overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg bg-muted ${config?.color || 'text-foreground'}`}>
                          {config?.icon || <Globe className="h-6 w-6" />}
                        </div>
                        <div>
                          <CardTitle className="text-lg">{app.client_name}</CardTitle>
                          <CardDescription>
                            {config?.description || config?.domain}
                          </CardDescription>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          setSelectedApp(app);
                          setRevokeDialogOpen(true);
                        }}
                      >
                        <Unlink className="h-4 w-4 mr-1" />
                        Ngắt kết nối
                      </Button>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="space-y-4">
                    {/* Scopes */}
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">Quyền truy cập:</p>
                      <div className="flex flex-wrap gap-2">
                        {app.scope.map(s => (
                          <Badge key={s} variant="secondary" className="capitalize">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {/* Connection Info */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span>
                          {formatDistanceToNow(new Date(app.created_at), { 
                            addSuffix: true, 
                            locale: dateLocale 
                          })}
                        </span>
                      </div>
                      
                      {app.last_used_at && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <RefreshCw className="h-4 w-4" />
                          <span>
                            {formatDistanceToNow(new Date(app.last_used_at), { 
                              addSuffix: true, 
                              locale: dateLocale 
                            })}
                          </span>
                        </div>
                      )}

                      {syncStats && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Database className="h-4 w-4" />
                          <span>
                            {syncStats.sync_count} lần đồng bộ • {formatDataSize(syncStats.data)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Synced Data Preview */}
                    {syncStats && Object.keys(syncStats.data).length > 0 && (
                      <div className="bg-muted/50 rounded-lg p-3">
                        <p className="text-sm font-medium text-foreground mb-2">
                          Dữ liệu đã đồng bộ:
                        </p>
                        <div className="text-xs font-mono text-muted-foreground max-h-32 overflow-auto">
                          <pre className="whitespace-pre-wrap">
                            {JSON.stringify(syncStats.data, null, 2)}
                          </pre>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          {formatDistanceToNow(new Date(syncStats.synced_at), { 
                            addSuffix: true, 
                            locale: dateLocale 
                          })}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      {/* Revoke Confirmation Dialog */}
      <AlertDialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ngắt kết nối {selectedApp?.client_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Ứng dụng này sẽ không còn quyền truy cập vào tài khoản Fun Profile của bạn. 
              Bạn có thể kết nối lại bất cứ lúc nào bằng cách đăng nhập lại.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevokeAccess}
              disabled={revoking}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {revoking ? 'Đang xử lý...' : 'Ngắt kết nối'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MobileBottomNav />
    </div>
  );
};

export default ConnectedApps;
