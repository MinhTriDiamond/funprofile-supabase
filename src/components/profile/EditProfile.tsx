import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { OWN_PROFILE_COLUMNS } from '@/lib/profileColumns';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { uploadToR2, deleteFromR2 } from '@/utils/r2Upload';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { Upload, AlertTriangle, Wallet, Bitcoin } from 'lucide-react';
import { AvatarCropper } from './AvatarCropper';
import { DeleteAccountDialog } from './DeleteAccountDialog';
import { z } from 'zod';
import { compressImage, FILE_LIMITS } from '@/utils/imageCompression';
import { useLanguage } from '@/i18n/LanguageContext';
import { SocialLinksEditor } from './SocialLinksEditor';
import type { SocialLink } from './AvatarOrbit';

import { validateUsername, normalizeUsername, USERNAME_MAX_LENGTH } from '@/lib/username-validation';

const makeProfileSchema = (t: (k: string, p?: Record<string, string | number>) => string) =>
  z.object({
    username: z.string()
      .min(3, t('usernameMin'))
      .max(USERNAME_MAX_LENGTH, t('usernameMax', { max: USERNAME_MAX_LENGTH }))
      .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/, t('usernameFormatErr'))
      .trim(),
    full_name: z.string()
      .max(100, t('nameMaxErr'))
      .trim()
      .optional(),
    bio: z.string()
      .max(200, t('bioMaxErr'))
      .trim()
      .optional(),
  });

/**
 * BTC_ADDRESS_LOCK — khoá tạm việc user tự đổi địa chỉ BTC (bảo vệ tài sản).
 * Mở lại: đặt false + bật app_settings.btc_address_updates_enabled = true.
 */
const BTC_ADDRESS_LOCKED = true;

export const EditProfile = ({ onSaved }: { onSaved?: () => void }) => {

  const { userId: authUserId } = useCurrentUser();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [publicWalletAddress, setPublicWalletAddress] = useState('');
  const [btcAddress, setBtcAddress] = useState('');
  const [location, setLocation] = useState('');
  const [workplace, setWorkplace] = useState('');
  const [education, setEducation] = useState('');
  const [relationshipStatus, setRelationshipStatus] = useState('');
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [socialLinksDirty, setSocialLinksDirty] = useState(false);
  const [cropImage, setCropImage] = useState<string | null>(null);
  const [userId, setUserId] = useState<string>('');
  const { t } = useLanguage();

  // Reset all form state immediately when switching accounts
  useEffect(() => {
    setSocialLinks([]);
    setSocialLinksDirty(false);
    setUsername('');
    setDisplayName('');
    setFullName('');
    setBio('');
    setAvatarUrl('');
    setCoverUrl('');
    setPublicWalletAddress('');
    setBtcAddress('');
    setLocation('');
    setWorkplace('');
    setEducation('');
    setRelationshipStatus('');
    setUserId('');
    if (authUserId) fetchProfile();
  }, [authUserId]);

  const fetchProfile = async () => {
    try {
      if (!authUserId) return;

      setUserId(authUserId);

      const { data, error } = await supabase
        .from('profiles')
        .select(OWN_PROFILE_COLUMNS)
        .eq('id', authUserId)
        .single();

      if (error) throw error;

      /* `select(OWN_PROFILE_COLUMNS)` là chuỗi động ⇒ kiểu suy diễn không đúng.
         Narrow một lần sang record rõ ràng. */
      const row = data as unknown as Record<string, unknown> & {
        username?: string;
        display_name?: string;
        full_name?: string;
        bio?: string;
        avatar_url?: string;
        cover_url?: string;
        public_wallet_address?: string;
      };

      setUsername(row.username || '');
      setDisplayName(row.display_name || '');
      setFullName(row.full_name || '');
      setBio(row.bio || '');
      setAvatarUrl(row.avatar_url || '');
      setCoverUrl(row.cover_url || '');
      setPublicWalletAddress(row.public_wallet_address || '');
      const profileWithBtc = row as typeof row & { btc_address?: string };
      setBtcAddress(profileWithBtc.btc_address || '');
      /* Fields exist in DB but may not be in generated types — narrow cast once */
      const profileData = row as typeof row & {
        location?: string;
        workplace?: string;
        education?: string;
        relationship_status?: string;
        social_links?: SocialLink[];
      };
      setLocation(profileData.location || '');
      setWorkplace(profileData.workplace || '');
      setEducation(profileData.education || '');
      setRelationshipStatus(profileData.relationship_status || '');
      setSocialLinks(Array.isArray(profileData.social_links) ? profileData.social_links : []);
    } catch (error) {
      // Error fetching profile - silent fail for security
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      if (!event.target.files || event.target.files.length === 0) {
        return;
      }

      const file = event.target.files[0];

      // Validate file size (max 100MB)
      const MAX_SIZE = 100 * 1024 * 1024;
      if (file.size > MAX_SIZE) {
        toast.error(t('fileTooLarge'));
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        setCropImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      toast.error(t('errorLoadingImage'));
    }
  };

  const handleCropComplete = async (croppedImageBlob: Blob) => {
    try {
      setUploading(true);
      setCropImage(null);

      if (!userId) throw new Error('No user found');

      // Get session for access token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error(t('loginToUpload'));
        setUploading(false);
        return;
      }

      const file = new File([croppedImageBlob], 'avatar.jpg', { type: 'image/jpeg' });
      const result = await uploadToR2(file, 'avatars', `${userId}/avatar-${Date.now()}.jpg`, session.access_token);

      // Delete old avatar from R2 if exists
      if (avatarUrl) {
        try {
          const oldKey = avatarUrl.split('/').slice(-2).join('/');
          await deleteFromR2(oldKey);
        } catch (error) {
          console.error('Error deleting old avatar:', error);
        }
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: result.url })
        .eq('id', userId);

      if (updateError) throw updateError;

      setAvatarUrl(result.url);
      toast.success(t('avatarUpdated'));
    } catch (error) {
      toast.error(t('avatarUploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  const handleCoverUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      if (!event.target.files || event.target.files.length === 0) {
        return;
      }

      const file = event.target.files[0];

      if (file.size > FILE_LIMITS.IMAGE_MAX_SIZE) {
        toast.error(t('fileTooLarge'));
        return;
      }

      setUploadingCover(true);

      if (!userId) throw new Error('No user found');

      // Get session for access token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error(t('loginToUpload'));
        setUploadingCover(false);
        return;
      }

      // Compress cover image
      toast.loading(t('compressing'));
      const compressed = await compressImage(file, {
        maxWidth: FILE_LIMITS.COVER_MAX_WIDTH,
        maxHeight: FILE_LIMITS.COVER_MAX_HEIGHT,
        quality: 0.85,
      });
      toast.dismiss();

      const coverFile = new File([compressed], 'cover.jpg', { type: 'image/jpeg' });
      const result = await uploadToR2(coverFile, 'avatars', `${userId}/cover-${Date.now()}.jpg`, session.access_token);

      // Delete old cover from R2 if exists
      if (coverUrl) {
        try {
          const oldKey = coverUrl.split('/').slice(-2).join('/');
          await deleteFromR2(oldKey);
        } catch (error) {
          console.error('Error deleting old cover:', error);
        }
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ cover_url: result.url })
        .eq('id', userId);

      if (updateError) throw updateError;

      setCoverUrl(result.url);
      toast.success(t('coverUpdated'));
    } catch (error) {
      toast.error(t('coverUploadFailed'));
    } finally {
      setUploadingCover(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const trimmedUsername = username.trim();
    
    // Validate profile fields
    const validation = makeProfileSchema(t).safeParse({ 
      username: trimmedUsername, 
      full_name: fullName || undefined,
      bio: bio || undefined 
    });
    if (!validation.success) {
      toast.error(validation.error.errors[0].message);
      return;
    }

    setLoading(true);

    try {
      if (!userId) throw new Error('No user found');

      // Validate wallet address if provided
      const isValidWallet = publicWalletAddress ? /^0x[a-fA-F0-9]{40}$/.test(publicWalletAddress) : false;
      if (publicWalletAddress && !isValidWallet) {
        toast.error(t('invalidWalletAddress'));
        setLoading(false);
        return;
      }

      // Validate BTC address if provided
      const isValidBtc = btcAddress ? /^(1[a-km-zA-HJ-NP-Z1-9]{25,34}|3[a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-zA-HJ-NP-Z0-9]{25,90})$/.test(btcAddress) : true;
      if (btcAddress && !isValidBtc) {
        toast.error(t('btcInvalid'));
        setLoading(false);
        return;
      }

      // Check username uniqueness via username_normalized
      const { data: existing, error: existingErr } = await supabase
        .from('profiles')
        .select('id')
        .eq('username_normalized', trimmedUsername)
        .neq('id', userId)
        .limit(1);

      if (existingErr) {
        console.error('[EditProfile] username check failed', existingErr);
        throw existingErr;
      }

      if (existing && existing.length > 0) {
        toast.error(t('usernameTakenErr'));
        setLoading(false);
        return;
      }

      const updateData: Record<string, unknown> = {
        username: trimmedUsername,
        display_name: displayName,
        full_name: fullName,
        bio,
        public_wallet_address: publicWalletAddress || null,
        location: location || null,
        workplace: workplace || null,
        education: education || null,
        relationship_status: relationshipStatus || null,
      };

      // BTC_ADDRESS_LOCK: tính năng tự đổi địa chỉ BTC đang tạm khoá để bảo vệ tài sản.
      // Không xoá code — chỉ ngừng gửi cột này lên server. Mở lại: bỏ cờ dưới đây
      // và bật app_settings.btc_address_updates_enabled = true.
      if (!BTC_ADDRESS_LOCKED) {
        updateData.btc_address = btcAddress || null;
      }


      // Only include social_links if user actually edited them
      if (socialLinksDirty) {
        updateData.social_links = socialLinks as unknown as import('@/integrations/supabase/types').Json;
      }

      // Auto-link wallet fields when valid address is provided
      if (isValidWallet) {
        const lowerWallet = publicWalletAddress.toLowerCase();
        updateData.external_wallet_address = lowerWallet;
        updateData.wallet_address = lowerWallet;
      }

      const { error } = await supabase
        .from('profiles')
        .update(updateData as any)
        .eq('id', userId);

      if (error) throw error;

      // Invalidate security query and profile to update immediately
      queryClient.invalidateQueries({ queryKey: ['profile-security'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast.success(t('profileUpdated'));
      onSaved?.();
    } catch (error) {
      const msg = (error as { message?: string })?.message || 'unknown';
      console.error('[EditProfile] update failed', error);
      toast.error(`${t('profileUpdateFailed')}: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {cropImage && (
        <AvatarCropper
          image={cropImage}
          onCropComplete={handleCropComplete}
          onCancel={() => setCropImage(null)}
        />
      )}
      <Card className="overflow-visible mx-3 sm:mx-0 rounded-xl shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg">{t('editProfileTitle')}</CardTitle>
        </CardHeader>
        <div className="relative">
          <div className="w-full aspect-[3/1] md:aspect-auto md:h-48 bg-gradient-to-r from-primary/20 to-primary-glow/20 overflow-hidden">
            {coverUrl && (
              <img
                src={coverUrl}
                alt="Cover"
                className="w-full h-full object-cover"
              />
            )}
          </div>
          <div className="absolute top-3 right-3">
            <Label htmlFor="cover" className="cursor-pointer">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={uploadingCover}
                asChild
                className="shadow-md"
              >
                <span>
                  <Upload className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">
                    {uploadingCover ? t('loadingShort') : t('editCoverBtn')}
                  </span>
                </span>
              </Button>
            </Label>
            <Input
              id="cover"
              type="file"
              accept="image/*"
              onChange={handleCoverUpload}
              className="hidden"
              disabled={uploadingCover}
            />
          </div>
        </div>
        <CardContent className="px-4 sm:px-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex flex-col items-center gap-4">
              <Avatar className="w-28 h-28 md:w-32 md:h-32 -mt-16 md:-mt-20 border-4 border-background">
                {avatarUrl && <AvatarImage src={avatarUrl} />}
                <AvatarFallback className="text-4xl">
                  {username?.[0]?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col items-center gap-2">
                <Label htmlFor="avatar" className="cursor-pointer">
                  <Button type="button" variant="outline" disabled={uploading} asChild>
                    <span>
                      <Upload className="w-4 h-4 mr-2" />
                      {uploading ? t('loadingShort') : t('uploadAvatarBtn')}
                    </span>
                  </Button>
                </Label>
                <Input
                  id="avatar"
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                  disabled={uploading}
                />
              </div>
              <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 w-full">
                <p className="text-sm font-medium text-foreground">@{username || 'username'}</p>
                <span className="text-muted-foreground">·</span>
                <a
                  href={`https://fun.rich/${username || 'username'}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-primary hover:underline transition-colors truncate max-w-[60vw]"
                >
                  fun.rich/{username || 'username'}
                </a>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(`http://fun.rich/${username || 'username'}`);
                    toast.success(t('copyProfileLinkSuccess'));
                  }}
                  className="p-1 rounded hover:bg-muted text-primary"
                  aria-label={t('copyProfileLinkAria')}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fullName">{t('fullNameLabel')}</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t('fullNamePlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="displayName">{t('displayNameLabel')}</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value.slice(0, 50))}
                placeholder={t('displayNamePlaceholder')}
              />
              <p className="text-xs text-muted-foreground">{t('displayNameMaxHint')}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bio">{t('bioLabel')}</Label>
              <Textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value.slice(0, 200))}
                placeholder={t('bioPlaceholder')}
                rows={4}
                maxLength={200}
              />
              <p className="text-xs text-muted-foreground">{t('bioCounter', { count: bio.length })}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="usernameHandle">{t('usernameHandleLabel')}</Label>
              <Input
                id="usernameHandle"
                value={username}
                onChange={(e) => setUsername(normalizeUsername(e.target.value).slice(0, USERNAME_MAX_LENGTH))}
                placeholder={t('usernameHandlePlaceholder')}
                className="font-mono text-sm"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <a href={`https://fun.rich/${username || 'username'}`} target="_blank" rel="noopener noreferrer" className="hover:text-primary hover:underline transition-colors cursor-pointer">{t('profileLinkPrefix', { name: username || 'username' })}</a>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(`http://fun.rich/${username || 'username'}`);
                    toast.success(t('copyProfileLinkSuccess'));
                  }}
                  className="p-1 rounded hover:bg-muted text-primary"
                  aria-label={t('copyProfileLinkAria')}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">{t('locationLabel')}</Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value.slice(0, 100))}
                placeholder={t('locationPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workplace">{t('workplaceLabel')}</Label>
              <Input
                id="workplace"
                value={workplace}
                onChange={(e) => setWorkplace(e.target.value.slice(0, 100))}
                placeholder={t('workplacePlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="education">{t('educationLabel')}</Label>
              <Input
                id="education"
                value={education}
                onChange={(e) => setEducation(e.target.value.slice(0, 100))}
                placeholder={t('educationPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="relationshipStatus">{t('relationshipLabel')}</Label>
              <Input
                id="relationshipStatus"
                value={relationshipStatus}
                onChange={(e) => setRelationshipStatus(e.target.value.slice(0, 50))}
                placeholder={t('relationshipPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="publicWallet" className="flex items-center gap-2">
                <Wallet className="w-4 h-4" />
                {t('publicWalletAddress')}
              </Label>
              <Input
                id="publicWallet"
                value={publicWalletAddress}
                onChange={(e) => setPublicWalletAddress(e.target.value)}
                placeholder="0x..."
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                {t('publicWalletHelp')}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="btcWallet" className="flex items-center gap-2">
                <Bitcoin className="w-4 h-4 text-orange-500" />
                {t('btcAddressLabel')}
              </Label>
              <Input
                id="btcWallet"
                value={btcAddress}
                onChange={(e) => setBtcAddress(e.target.value)}
                placeholder="bc1q..., 1..., 3..."
                className="font-mono text-sm"
                disabled={BTC_ADDRESS_LOCKED}
                readOnly={BTC_ADDRESS_LOCKED}
              />
              <p className="text-xs text-muted-foreground">
                {BTC_ADDRESS_LOCKED
                  ? 'Tính năng đổi địa chỉ BTC đang tạm khoá để bảo trì/bảo vệ tài sản. Nếu cần đổi ví khẩn cấp, vui lòng liên hệ admin.'
                  : t('btcAddressHelp')}
              </p>

            </div>
            <SocialLinksEditor value={socialLinks} onChange={(links) => { setSocialLinks(links); setSocialLinksDirty(true); }} />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t('updating') : t('updateProfile')}
            </Button>
          </form>
        </CardContent>
      </Card>

    </>
  );
};
