import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { 
  RefreshCw, Play, Pause, Check, X, Image, Video, 
  Database, CloudUpload, AlertTriangle, Trash2
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface MigrationStats {
  images: number;
  videos: number;
  total: number;
}

interface MigrationResult {
  url: string;
  type: 'image' | 'video';
  status: 'success' | 'failed' | 'skipped';
  newUrl?: string;
  error?: string;
}

interface MigrationProgress {
  total: number;
  processed: number;
  success: number;
  failed: number;
}

const MediaMigrationTab = () => {
  const [stats, setStats] = useState<MigrationStats | null>(null);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [videoUrls, setVideoUrls] = useState<string[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isMigratingImages, setIsMigratingImages] = useState(false);
  const [isMigratingVideos, setIsMigratingVideos] = useState(false);
  const [isUpdatingUrls, setIsUpdatingUrls] = useState(false);
  const [imageProgress, setImageProgress] = useState<MigrationProgress | null>(null);
  const [videoProgress, setVideoProgress] = useState<MigrationProgress | null>(null);
  const [imageResults, setImageResults] = useState<MigrationResult[]>([]);
  const [videoResults, setVideoResults] = useState<MigrationResult[]>([]);

  const scanMedia = async () => {
    setIsScanning(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Vui lòng đăng nhập');
        return;
      }

      const response = await supabase.functions.invoke('cloudflare-migrate', {
        body: { action: 'list-media' },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      // Parse response - invoke returns {data, error}
      const result = response.data;
      
      if (result && result.success) {
        setStats(result.stats);
        setImageUrls(result.images || []);
        setVideoUrls(result.videos || []);
        toast.success(`Tìm thấy ${result.stats.total} media cần migrate`);
      } else {
        toast.error(result?.error || 'Không thể quét media');
      }
    } catch (error: unknown) {
      console.error('Scan error:', error);
      toast.error('Lỗi khi quét media');
    } finally {
      setIsScanning(false);
    }
  };

  const migrateImages = async () => {
    if (imageUrls.length === 0) {
      toast.info('Không có ảnh cần migrate');
      return;
    }

    setIsMigratingImages(true);
    setImageProgress({ total: imageUrls.length, processed: 0, success: 0, failed: 0 });
    setImageResults([]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Process in smaller batches with progress updates
      const batchSize = 10;
      const allResults: MigrationResult[] = [];
      
      for (let i = 0; i < imageUrls.length; i += batchSize) {
        const batch = imageUrls.slice(i, i + batchSize);
        
        const response = await supabase.functions.invoke('cloudflare-migrate', {
          body: { action: 'migrate-images', urls: batch, batchSize: 5 },
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        const result = response.data;
        
        if (result && result.success) {
          allResults.push(...result.results);
          setImageProgress(prev => prev ? {
            ...prev,
            processed: Math.min(i + batchSize, imageUrls.length),
            success: allResults.filter(r => r.status === 'success').length,
            failed: allResults.filter(r => r.status === 'failed').length,
          } : null);
          setImageResults([...allResults]);
        }
      }

      toast.success(`Migrate hoàn thành: ${allResults.filter(r => r.status === 'success').length} thành công`);
    } catch (error: unknown) {
      console.error('Migration error:', error);
      toast.error('Lỗi khi migrate ảnh');
    } finally {
      setIsMigratingImages(false);
    }
  };

  const migrateVideos = async () => {
    if (videoUrls.length === 0) {
      toast.info('Không có video cần migrate');
      return;
    }

    setIsMigratingVideos(true);
    setVideoProgress({ total: videoUrls.length, processed: 0, success: 0, failed: 0 });
    setVideoResults([]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Process videos one at a time
      const allResults: MigrationResult[] = [];
      
      for (let i = 0; i < videoUrls.length; i++) {
        const batch = [videoUrls[i]];
        
        const response = await supabase.functions.invoke('cloudflare-migrate', {
          body: { action: 'migrate-videos', urls: batch, batchSize: 1 },
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        const result = response.data;
        
        if (result && result.success) {
          allResults.push(...result.results);
          setVideoProgress({
            total: videoUrls.length,
            processed: i + 1,
            success: allResults.filter(r => r.status === 'success').length,
            failed: allResults.filter(r => r.status === 'failed').length,
          });
          setVideoResults([...allResults]);
        }
      }

      toast.success(`Migrate hoàn thành: ${allResults.filter(r => r.status === 'success').length} thành công`);
    } catch (error: unknown) {
      console.error('Migration error:', error);
      toast.error('Lỗi khi migrate video');
    } finally {
      setIsMigratingVideos(false);
    }
  };

  const updateDatabaseUrls = async () => {
    const successfulResults = [...imageResults, ...videoResults].filter(r => r.status === 'success' && r.newUrl);
    
    if (successfulResults.length === 0) {
      toast.info('Không có URL nào cần cập nhật');
      return;
    }

    setIsUpdatingUrls(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const mappings = successfulResults.map(r => ({
        oldUrl: r.url,
        newUrl: r.newUrl!,
        type: r.type,
      }));

      const response = await supabase.functions.invoke('cloudflare-migrate', {
        body: { action: 'update-urls', mappings },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      const result = response.data;
      
      if (result?.success) {
        toast.success(`Đã cập nhật ${result.stats.updated} URLs trong database`);
      } else {
        toast.error(result?.error || 'Lỗi khi cập nhật database');
      }
    } catch (error: unknown) {
      console.error('Update URLs error:', error);
      toast.error('Lỗi khi cập nhật database URLs');
    } finally {
      setIsUpdatingUrls(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Chiến dịch "Quét sạch R2"
          </CardTitle>
          <CardDescription>
            Migrate tất cả ảnh và video từ R2 sang Cloudflare Images/Stream
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Scan Button */}
          <Button 
            onClick={scanMedia} 
            disabled={isScanning}
            className="gap-2"
          >
            {isScanning ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Database className="w-4 h-4" />
            )}
            Quét toàn bộ Media trong Database
          </Button>

          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-center">
                <Image className="w-6 h-6 mx-auto mb-2 text-blue-600" />
                <p className="text-2xl font-bold text-blue-600">{stats.images}</p>
                <p className="text-sm text-muted-foreground">Ảnh R2</p>
              </div>
              <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg text-center">
                <Video className="w-6 h-6 mx-auto mb-2 text-purple-600" />
                <p className="text-2xl font-bold text-purple-600">{stats.videos}</p>
                <p className="text-sm text-muted-foreground">Video R2</p>
              </div>
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg text-center">
                <CloudUpload className="w-6 h-6 mx-auto mb-2 text-green-600" />
                <p className="text-2xl font-bold text-green-600">{stats.total}</p>
                <p className="text-sm text-muted-foreground">Tổng cộng</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Image Migration */}
      {stats && stats.images > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Image className="w-5 h-5 text-blue-600" />
              Migrate Ảnh → Cloudflare Images
            </CardTitle>
            <CardDescription>
              {imageUrls.length} ảnh sẽ được chuyển sang Cloudflare Images để tối ưu
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  disabled={isMigratingImages || imageUrls.length === 0}
                  className="gap-2"
                >
                  {isMigratingImages ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  Bắt đầu Migrate Ảnh
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Xác nhận Migrate Ảnh</AlertDialogTitle>
                  <AlertDialogDescription>
                    Bạn sắp migrate {imageUrls.length} ảnh từ R2 sang Cloudflare Images.
                    Quá trình này có thể mất vài phút và sử dụng API quota.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Hủy</AlertDialogCancel>
                  <AlertDialogAction onClick={migrateImages}>
                    Tiếp tục
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Progress */}
            {imageProgress && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Tiến độ: {imageProgress.processed}/{imageProgress.total}</span>
                  <span className="text-green-600">✓ {imageProgress.success}</span>
                  <span className="text-red-600">✗ {imageProgress.failed}</span>
                </div>
                <Progress 
                  value={(imageProgress.processed / imageProgress.total) * 100} 
                  className="h-2"
                />
              </div>
            )}

            {/* Results */}
            {imageResults.length > 0 && (
              <div className="max-h-48 overflow-y-auto space-y-1 text-sm">
                {imageResults.slice(-10).map((result, i) => (
                  <div 
                    key={i}
                    className={`flex items-center gap-2 p-2 rounded ${
                      result.status === 'success' ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'
                    }`}
                  >
                    {result.status === 'success' ? (
                      <Check className="w-4 h-4 text-green-600" />
                    ) : (
                      <X className="w-4 h-4 text-red-600" />
                    )}
                    <span className="truncate flex-1">{result.url.split('/').pop()}</span>
                    {result.error && (
                      <span className="text-red-600 text-xs">{result.error}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Video Migration */}
      {stats && stats.videos > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Video className="w-5 h-5 text-purple-600" />
              Migrate Video → Cloudflare Stream
            </CardTitle>
            <CardDescription>
              {videoUrls.length} video sẽ được chuyển sang Cloudflare Stream để adaptive bitrate
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg text-sm">
              <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-yellow-800 dark:text-yellow-200">Lưu ý quan trọng</p>
                <p className="text-yellow-700 dark:text-yellow-300">
                  Video sẽ được encode đa độ phân giải sau khi migrate. 
                  Quá trình này có thể mất 5-30 phút tùy dung lượng video.
                </p>
              </div>
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="secondary"
                  disabled={isMigratingVideos || videoUrls.length === 0}
                  className="gap-2"
                >
                  {isMigratingVideos ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  Bắt đầu Migrate Video
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Xác nhận Migrate Video</AlertDialogTitle>
                  <AlertDialogDescription>
                    Bạn sắp migrate {videoUrls.length} video từ R2 sang Cloudflare Stream.
                    Video sẽ được encode đa độ phân giải (có thể mất thời gian).
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Hủy</AlertDialogCancel>
                  <AlertDialogAction onClick={migrateVideos}>
                    Tiếp tục
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Progress */}
            {videoProgress && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Tiến độ: {videoProgress.processed}/{videoProgress.total}</span>
                  <span className="text-green-600">✓ {videoProgress.success}</span>
                  <span className="text-red-600">✗ {videoProgress.failed}</span>
                </div>
                <Progress 
                  value={(videoProgress.processed / videoProgress.total) * 100} 
                  className="h-2"
                />
              </div>
            )}

            {/* Results */}
            {videoResults.length > 0 && (
              <div className="max-h-48 overflow-y-auto space-y-1 text-sm">
                {videoResults.map((result, i) => (
                  <div 
                    key={i}
                    className={`flex items-center gap-2 p-2 rounded ${
                      result.status === 'success' ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'
                    }`}
                  >
                    {result.status === 'success' ? (
                      <Check className="w-4 h-4 text-green-600" />
                    ) : (
                      <X className="w-4 h-4 text-red-600" />
                    )}
                    <span className="truncate flex-1">{result.url.split('/').pop()}</span>
                    {result.error && (
                      <span className="text-red-600 text-xs">{result.error}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Update Database URLs */}
      {(imageResults.filter(r => r.status === 'success').length > 0 || 
        videoResults.filter(r => r.status === 'success').length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5 text-green-600" />
              Cập nhật Database URLs
            </CardTitle>
            <CardDescription>
              Thay thế các URL R2 cũ bằng URL Cloudflare mới trong database
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm mb-4">
              <Check className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-blue-800 dark:text-blue-200">
                  Sẵn sàng cập nhật {imageResults.filter(r => r.status === 'success').length + videoResults.filter(r => r.status === 'success').length} URLs
                </p>
                <p className="text-blue-700 dark:text-blue-300">
                  Hệ thống sẽ tự động thay thế các URL cũ trong posts, profiles, comments.
                </p>
              </div>
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  disabled={isUpdatingUrls}
                  className="gap-2 bg-green-600 hover:bg-green-700"
                >
                  {isUpdatingUrls ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Database className="w-4 h-4" />
                  )}
                  Cập nhật Database
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Xác nhận cập nhật Database</AlertDialogTitle>
                  <AlertDialogDescription>
                    Bạn sắp thay thế {imageResults.filter(r => r.status === 'success').length + videoResults.filter(r => r.status === 'success').length} URLs cũ bằng URLs Cloudflare mới.
                    Hành động này không thể hoàn tác.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Hủy</AlertDialogCancel>
                  <AlertDialogAction onClick={updateDatabaseUrls} className="bg-green-600 hover:bg-green-700">
                    Cập nhật ngay
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      )}

      {/* No Media Found */}
      {stats && stats.total === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <Check className="w-12 h-12 mx-auto text-green-600 mb-4" />
            <h3 className="text-lg font-medium">Không có media cần migrate</h3>
            <p className="text-muted-foreground">
              Tất cả media đã được tối ưu hoặc không có URL R2 nào trong database.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default MediaMigrationTab;
