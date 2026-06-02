import { mount } from 'svelte';
import { waitLocale } from 'svelte-i18n';
import './styles/app.css';
import { appMode } from './lib/config.js';
import { setupI18n } from './lib/i18n.js';
import StandaloneApp from './standalone/StandaloneApp.svelte';
import HubApp from './hub/HubApp.svelte';

const target = document.getElementById('app');

async function main() {
    await setupI18n();
    await waitLocale();

    if (appMode === 'hub') {
        mount(HubApp, { target });
    } else {
        mount(StandaloneApp, { target });
    }
}

main();
