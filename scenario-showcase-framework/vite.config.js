// Standalone dev config — `npm run dev` renders the plugin shell without the Portal.
// base './' keeps asset URLs relative so the standalone dist can be deployed under
// a sub-path (e.g. :9010/scenario-showcase/) without clashing with the host site.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    base: './',
    plugins: [react()],
});
