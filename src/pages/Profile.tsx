import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { ROUTES } from '@/config/routes.config';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, Save, Upload, User as UserIcon, CheckCircle, AlertCircle, Loader2, Camera } from 'lucide-react';
import { getFriendlyErrorMessage, logErrorToDb } from '@/lib/error-helpers';

export function Profile() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: loadingAuth } = useAuth();
  const { profile, isLoading: loadingProfile, updateProfile, isUpdating } = useProfile();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const fromPath = location.state?.from || ROUTES.DASHBOARD;

  const [displayName, setDisplayName] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [previewError, setPreviewError] = useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [uploading, setUploading] = useState(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (!loadingAuth && !user) {
      navigate(ROUTES.LOGIN);
    }
  }, [user, loadingAuth, navigate]);

  // Sync profile data once loaded
  useEffect(() => {
    if (profile) {
      const timer = setTimeout(() => {
        setDisplayName(profile.display_name || '');
        setAvatarPreview(profile.avatar_url || null);
        setPreviewError(false);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [profile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError('');
    setSuccess('');
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (PNG, JPG, WebP).');
      return;
    }

    // Validate size (2MB limit)
    const MAX_SIZE = 2 * 1024 * 1024; // 2MB in bytes
    if (file.size > MAX_SIZE) {
      setError('Image file is too large. Max limit is 2MB.');
      return;
    }

    setAvatarFile(file);

    // Create a local preview URL
    const previewUrl = URL.createObjectURL(file);
    setAvatarPreview(previewUrl);
    setPreviewError(false);
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setError('');
    setSuccess('');

    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setError('Display name is required.');
      return;
    }

    try {
      let finalAvatarUrl = profile?.avatar_url || null;

      // 1. If there's a new avatar file to upload
      if (avatarFile) {
        setUploading(true);
        const fileExt = avatarFile.name.split('.').pop() || 'png';
        const filePath = `${user.id}/avatar-${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('vd-avatars')
          .upload(filePath, avatarFile, {
            cacheControl: '3600',
            upsert: true,
          });

        if (uploadError) {
          throw uploadError;
        }

        const { data: publicUrlData } = supabase.storage
          .from('vd-avatars')
          .getPublicUrl(filePath);

        finalAvatarUrl = publicUrlData.publicUrl;
      }

      // 2. Update profile table row
      await updateProfile({
        display_name: trimmedName,
        avatar_url: finalAvatarUrl,
      });

      setAvatarFile(null);
      setSuccess('Your profile settings have been updated successfully.');

      // Return to the previous page
      navigate(fromPath);

    } catch (err: unknown) {
      console.error(err);
      setError(getFriendlyErrorMessage(err, 'Failed to update profile settings.'));
      void logErrorToDb(err, { context: 'Profile.handleSave' });
    } finally {
      setUploading(false);
    }
  };

  if (loadingAuth || loadingProfile || !user) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <span className="text-sm text-muted-foreground font-semibold">Loading profile settings...</span>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(fromPath)}
          className="p-2.5 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-all cursor-pointer border border-border/10"
          title="Back to previous page"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold font-heading">My Profile</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage your host identity and profile presentation.
          </p>
        </div>
      </div>

      {/* Success Notification */}
      {success && (
        <div className="p-4 rounded-xl bg-green-500/10 text-green-600 text-2sm font-medium border border-green-500/20 flex items-center gap-2.5 shadow-sm animate-fade-in">
          <CheckCircle className="w-5 h-5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Error Notification */}
      {error && (
        <div className="p-4 rounded-xl bg-destructive/10 text-destructive text-2sm font-medium border border-destructive/20 flex items-center gap-2.5 shadow-sm animate-fade-in">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Profile Form Card */}
      <form onSubmit={handleSave} className="p-6 glass border border-border/40 rounded-3xl space-y-6 shadow-xl relative overflow-hidden bg-gradient-to-br from-secondary/15 via-background to-secondary/5">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(128,128,128,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(128,128,128,0.02)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center gap-6 py-4">
          {/* Avatar Picture Section */}
          <div className="relative group shrink-0">
            <div 
              onClick={triggerFileInput}
              className="w-28 h-28 rounded-full border-4 border-primary/20 hover:border-primary/50 overflow-hidden bg-secondary/80 flex items-center justify-center text-muted-foreground shadow-inner cursor-pointer relative transition-all"
            >
              {avatarPreview && !previewError ? (
                <img
                  src={avatarPreview}
                  alt="Avatar Preview"
                  className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-350"
                  onError={() => setPreviewError(true)}
                />
              ) : (
                <UserIcon className="w-12 h-12 text-muted-foreground/50" />
              )}

              {/* Upload Hover Overlay */}
              <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="w-6 h-6 animate-pulse" />
                <span className="text-[10px] font-bold mt-1 uppercase tracking-wider">Change</span>
              </div>
            </div>

            <button
              type="button"
              onClick={triggerFileInput}
              className="absolute bottom-0 right-0 p-2 rounded-full bg-primary text-primary-foreground shadow-md hover:opacity-90 transition-all cursor-pointer"
              title="Upload avatar image"
            >
              <Upload className="w-3.5 h-3.5" />
            </button>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              className="hidden"
            />
          </div>

          <div className="text-center">
            <h3 className="font-heading font-extrabold text-foreground text-md">
              {profile?.display_name || user.email?.split('@')[0]}
            </h3>
            <p className="text-2xs text-muted-foreground font-mono mt-0.5">{user.email}</p>
          </div>
        </div>

        {/* Inputs */}
        <div className="relative z-10 space-y-4">
          <div className="space-y-1.5">
            <label className="text-2sm font-semibold tracking-wide" htmlFor="displayName">
              Display Name *
            </label>
            <input
              id="displayName"
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Julian Gibbings"
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all"
            />
            <p className="text-3xs text-muted-foreground font-medium">
              This name is shown as the event creator/host inside draw rooms.
            </p>
          </div>
        </div>

        {/* Form Actions */}
        <div className="relative z-10 pt-4 border-t border-border/20 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate(fromPath)}
            className="px-5 py-2.5 rounded-xl hover:bg-secondary text-sm font-semibold text-secondary-foreground transition-all cursor-pointer border border-border/10"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isUpdating || uploading || !displayName.trim()}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold shadow-md shadow-primary/20 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            {isUpdating || uploading ? (
              <>
                <Loader2 className="w-4.5 h-4.5 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="w-4.5 h-4.5" />
                <span>Save Settings</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export default Profile;
