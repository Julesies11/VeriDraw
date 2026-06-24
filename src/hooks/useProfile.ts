import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { TABLES } from '@/config/db-tables';

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export function useProfile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const profileQuery = useQuery<Profile | null>({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const { data, error } = await supabase
        .from(TABLES.PROFILES)
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        console.error('[useProfile] Error fetching profile:', error);
        throw error;
      }

      // If profile doesn't exist, we lazily create it in the database
      if (!data) {
        const defaultProfile = {
          id: user.id,
          display_name: user.user_metadata?.display_name || user.email?.split('@')[0] || 'User',
          avatar_url: user.user_metadata?.avatar_url || null,
        };

        const { data: upsertedData, error: upsertError } = await supabase
          .from(TABLES.PROFILES)
          .upsert(defaultProfile)
          .select()
          .maybeSingle();

        if (upsertError) {
          console.warn('[useProfile] Error lazily creating profile (falling back to memory):', upsertError);
          return {
            ...defaultProfile,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
        }

        return upsertedData as Profile;
      }

      return data as Profile;
    },
    enabled: !!user?.id,
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (updates: Partial<Pick<Profile, 'display_name' | 'avatar_url'>>) => {
      if (!user?.id) throw new Error('You must be logged in to update your profile.');

      const payload = {
        id: user.id,
        ...updates,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from(TABLES.PROFILES)
        .upsert(payload);

      if (error) {
        console.error('[useProfile] Error updating profile:', error);
        throw error;
      }

      // Also update auth user metadata for local session consistency if desired
      await supabase.auth.updateUser({
        data: {
          display_name: updates.display_name !== undefined ? updates.display_name : user.user_metadata?.display_name,
          avatar_url: updates.avatar_url !== undefined ? updates.avatar_url : user.user_metadata?.avatar_url,
        }
      });
    },
    onSuccess: () => {
      // Invalidate the cache to trigger a reload of the profile
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
    },
  });

  return {
    profile: profileQuery.data,
    isLoading: profileQuery.isLoading,
    error: profileQuery.error,
    updateProfile: updateProfileMutation.mutateAsync,
    isUpdating: updateProfileMutation.isPending,
    updateError: updateProfileMutation.error,
  };
}
