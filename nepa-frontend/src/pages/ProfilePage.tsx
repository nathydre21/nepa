import React, { useState, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { ProfileCustomization } from '../components/ProfileCustomization';
import { UserProfileDisplay } from '../components/UserProfileDisplay';

interface UserProfile {
  id: string;
  userId: string;
  bio?: string;
  location?: string;
  website?: string;
  timezone: string;
  language: string;
  currency: string;
  theme: string;
  layout: string;
  sidebarCollapsed: boolean;
  notificationsEnabled: boolean;
  autoSave: boolean;
  preferences?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export const ProfilePage: React.FC = () => {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'view' | 'customize'>('view');

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await fetch('/api/v1/user/preferences', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch profile');
        }
        
        const profileData = await response.json();
        
        // Transform API response to match our interface
        const transformedProfile: UserProfile = {
          id: profileData.profile?.id || '1',
          userId: profileData.profile?.userId || 'user-1',
          bio: profileData.profile?.bio || '',
          location: profileData.profile?.location || '',
          website: profileData.profile?.website || '',
          timezone: profileData.profile?.timezone || 'UTC',
          language: profileData.profile?.language || 'en',
          currency: profileData.profile?.currency || 'USD',
          theme: profileData.profile?.theme || theme,
          layout: profileData.profile?.layout || 'comfortable',
          sidebarCollapsed: profileData.profile?.sidebarCollapsed || false,
          notificationsEnabled: profileData.profile?.notificationsEnabled !== false,
          autoSave: profileData.profile?.autoSave !== false,
          preferences: profileData.profile?.preferences || {},
          createdAt: profileData.profile?.createdAt || new Date().toISOString(),
          updatedAt: profileData.profile?.updatedAt || new Date().toISOString()
        };
        
        setProfile(transformedProfile);
      } catch (error) {
        console.error('Failed to fetch profile:', error);
        // Fallback to mock data if API fails
        const mockProfile: UserProfile = {
          id: '1',
          userId: 'user-1',
          bio: 'Utility payment enthusiast',
          location: 'New York, USA',
          website: 'https://example.com',
          timezone: 'America/New_York',
          language: 'en',
          currency: 'USD',
          theme: theme,
          layout: 'comfortable',
          sidebarCollapsed: false,
          notificationsEnabled: true,
          autoSave: true,
          preferences: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        setProfile(mockProfile);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [theme]);

  const handleProfileUpdate = (updatedProfile: Partial<UserProfile>) => {
    if (profile) {
      const newProfile = { ...profile, ...updatedProfile, updatedAt: new Date().toISOString() };
      setProfile(newProfile);
      
      // Update theme if changed
      if (updatedProfile.theme && updatedProfile.theme !== theme) {
        setTheme(updatedProfile.theme as any);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-foreground mb-2">
            Profile Not Found
          </h2>
          <p className="text-muted-foreground">
            Unable to load your profile information.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="bg-card rounded-lg shadow-lg">
        <div className="border-b border-border">
          <nav className="flex space-x-8 px-6" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('view')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'view'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              View Profile
            </button>
            <button
              onClick={() => setActiveTab('customize')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'customize'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              Customize
            </button>
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'view' ? (
            <UserProfileDisplay profile={profile} />
          ) : (
            <ProfileCustomization
              profile={profile}
              onUpdate={handleProfileUpdate}
              currentTheme={theme}
              resolvedTheme={resolvedTheme}
            />
          )}
        </div>
      </div>
    </div>
  );
};
