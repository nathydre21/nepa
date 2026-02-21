import { format } from 'date-fns';
import { enUS, fr, arSA } from 'date-fns/locale';
import i18n from '../i18n';

const locales: Record<string, any> = {
  en: enUS,
  fr: fr,
  ar: arSA,
};

// Format date based on current language
export const formatDate = (date: Date, formatStr: string = 'PP') => {
  const lang = i18n.language || 'en';
  // Fallback to enUS if locale not found
  const locale = locales[lang] || enUS;
  return format(date, formatStr, { locale });
};

// Format currency (e.g., USD, EUR, SAR)
export const formatCurrency = (amount: number, currency: string = 'USD') => {
  const lang = i18n.language || 'en';
  return new Intl.NumberFormat(lang, {
    style: 'currency',
    currency: currency,
  }).format(amount);
};

// Format numbers (decimals, separators)
export const formatNumber = (number: number, options?: Intl.NumberFormatOptions) => {
  const lang = i18n.language || 'en';
  return new Intl.NumberFormat(lang, options).format(number);
};