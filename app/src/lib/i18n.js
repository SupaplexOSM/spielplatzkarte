import { register, init, getLocaleFromNavigator, locale } from 'svelte-i18n';
import { defaultLocale as configuredLocale } from './config.js';

const SUPPORTED = ['de', 'en'];

register('de', () => import('../../../locales/de.json'));
register('en', () => import('../../../locales/en.json'));

// Resolve the locale to use:
// 1. Deployment-configured default (APP_CONFIG.defaultLocale)
// 2. Browser language (navigator.language, stripped to base tag)
// 3. Fallback to 'en'
function resolveLocale() {
    if (configuredLocale && SUPPORTED.includes(configuredLocale)) {
        return configuredLocale;
    }
    const browser = getLocaleFromNavigator()?.split('-')[0];
    if (browser && SUPPORTED.includes(browser)) {
        return browser;
    }
    return 'en';
}

export async function setupI18n() {
    await init({
        fallbackLocale: 'en',
        initialLocale: resolveLocale(),
    });
}

export { locale };
