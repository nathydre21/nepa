import React from 'react';
import { useTranslation } from 'react-i18next';

const LanguageSwitcher: React.FC = () => {
  const { i18n, t } = useTranslation();

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  return (
    <div className="language-switcher">
      <label htmlFor="language-select" style={{ marginRight: '8px' }}>
        {t('select_language')}:
      </label>
      <select
        id="language-select"
        onChange={(e) => changeLanguage(e.target.value)}
        value={i18n.language}
      >
        <option value="en">English</option>
        <option value="fr">Français</option>
        <option value="ar">العربية (Arabic)</option>
      </select>
    </div>
  );
};

export default LanguageSwitcher;