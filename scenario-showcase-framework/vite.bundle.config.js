/**
 * OpenAN Portal plugin bundle build for the Scenario Showcase (场景演示).
 *
 * Output (dist-plugin/):
 *   index.js              ← UMD, sets window.__OPENAN_PLUGIN__scenario_showcase
 *   index.css             ← compiled Tailwind styles (preflight disabled)
 *   plugin.manifest.json  ← runtime metadata consumed by the Portal bundle-loader
 *   cases.json            ← case index (edit to add cases, no rebuild)
 *   cases/*.json          ← case definitions (scripted storyline, agents, panels)
 *
 * EXTERNAL (provided by the Portal host): react, react-dom
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, existsSync, readdirSync } from 'fs';
import path from 'path';

const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const globalName = '__OPENAN_PLUGIN__scenario_showcase';

function file(p) {
    return readFileSync(path.join(root, p), 'utf-8');
}

function caseAssets() {
    const dir = path.join(root, 'cases');
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => ({ fileName: `cases/${f}`, source: file(`cases/${f}`) }));
}

export default defineConfig({
    define: {
        'process.env.NODE_ENV': JSON.stringify('production'),
    },
    plugins: [
        react(),
        {
            name: 'emit-plugin-static-assets',
            generateBundle() {
                this.emitFile({ type: 'asset', fileName: 'plugin.manifest.json', source: file('plugin.manifest.json') });
                this.emitFile({ type: 'asset', fileName: 'cases.json', source: file('cases.json') });
                for (const c of caseAssets()) {
                    this.emitFile({ type: 'asset', fileName: c.fileName, source: c.source });
                }
            },
        },
    ],
    build: {
        outDir: 'dist-plugin',
        emptyOutDir: true,
        lib: {
            entry: path.join(root, 'src/index.jsx'),
            name: globalName,
            formats: ['umd'],
            fileName: () => 'index.js',
        },
        rollupOptions: {
            external: ['react', 'react-dom'],
            output: {
                globals: {
                    react: 'React',
                    'react-dom': 'ReactDOM',
                },
                assetFileNames: 'index.css',
            },
        },
        cssCodeSplit: false,
    },
});
