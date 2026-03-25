import React from 'react';

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

interface UserProfileDisplayProps {
  profile: UserProfile;
}

const languageNames: Record<string, string> = {
  'en': 'English',
  'es': 'Español',
  'fr': 'Français',
  'de': 'Deutsch',
  'zh': '中文',
  'ja': '日本語'
};

const currencySymbols: Record<string, string> = {
  'USD': '$',
  'EUR': '€',
  'GBP': '£',
  'JPY': '¥',
  'CNY': '¥'
};

const themeNames: Record<string, string> = {
  'light': 'Light',
  'dark': 'Dark',
  'system': 'System'
};

const layoutNames: Record<string, string> = {
  'compact': 'Compact',
  'comfortable': 'Comfortable',
  'spacious': 'Spacious'
};

export const UserProfileDisplay: React.FC<UserProfileDisplayProps> = ({ profile }) => {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <div className="space-y-6">
      {/* Profile Header */}
      <div className="flex items-center space-x-4">
        <div className="h-20 w-20 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center">
          <span className="text-2xl font-bold text-white">
            {profile.userId.charAt(0).toUpperCase()}
          </span>
        </div>
        <div>
          <h2 className="text-2xl font-bold text-foreground">
            User Profile
          </h2>
          <p className="text-muted-foreground">
            Member since {formatDate(profile.createdAt)}
          </p>
        </div>
      </div>

      {/* Personal Information Section */}
      <div className="bg-muted rounded-lg p-6">
        <h3 className="text-lg font-medium text-foreground mb-4">
          Personal Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Bio</dt>
            <dd className="mt-1 text-sm text-foreground">
              {profile.bio || 'No bio provided'}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Location</dt>
            <dd className="mt-1 text-sm text-foreground">
              {profile.location || 'No location provided'}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Website</dt>
            <dd className="mt-1 text-sm text-foreground">
              {profile.website ? (
                <a
                  href={profile.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80"
                >
                  {profile.website}
                </a>
              ) : (
                'No website provided'
              )}
            </dd>
          </div>
        </div>
      </div>

      {/* Preferences Section */}
      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
          Preferences
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Theme</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
              {themeNames[profile.theme] || profile.theme}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Layout</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
              {layoutNames[profile.preferences?.layout] || profile.preferences?.layout || 'Comfortable'}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Sidebar</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
              {profile.preferences?.sidebarCollapsed ? 'Collapsed' : 'Expanded'}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Notifications</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
              {profile.preferences?.notificationsEnabled !== false ? 'Enabled' : 'Disabled'}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Auto-save</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
              {profile.preferences?.autoSave !== false ? 'Enabled' : 'Disabled'}
            </dd>
          </div>
        </div>
      </div>

      {/* Regional Settings Section */}
      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
          Regional Settings
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Timezone</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
              {profile.timezone}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Language</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
              {languageNames[profile.language] || profile.language}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Currency</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
              {currencySymbols[profile.currency]} {profile.currency}
            </dd>
          </div>
        </div>
      </div>

      {/* Profile Statistics */}
      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
          Profile Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Profile ID</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100 font-mono">
              {profile.id}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">User ID</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100 font-mono">
              {profile.userId}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Last Updated</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
              {formatDate(profile.updatedAt)}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Member Since</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
              {formatDate(profile.createdAt)}
            </dd>
          </div>
        </div>
      </div>
    </div>
  );
};
