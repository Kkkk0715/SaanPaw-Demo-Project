import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const sharedSrc = path.resolve(__dirname, '../shared/src');

/** A package's "version" field, read at build time so System Management shows the real release. */
function versionOf(file: string, pick: (json: any) => unknown): string {
  try {
    const value = pick(JSON.parse(fs.readFileSync(path.resolve(__dirname, file), 'utf8')));
    return typeof value === 'string' && value ? value : 'unknown';
  } catch {
    return 'unknown';
  }
}

export default defineConfig(({ command, mode }) => {
  // The console is served from the domain root by default. A subpath host such as GitHub Pages
  // (https://user.github.io/<repo>/console/) sets VITE_BASE_PATH so every asset URL gets that prefix.
  // Only the production build uses it: local dev (`npm run dev`) always runs at "/".
  const env = loadEnv(mode, __dirname, 'VITE_');
  const base = command === 'build' ? env.VITE_BASE_PATH || '/' : '/';

  return {
    base,
    plugins: [react()],
    define: {
      __APP_VERSIONS__: JSON.stringify({
        console: versionOf('package.json', (j) => j.version),
        mobile: versionOf('../mobile/app.json', (j) => j.expo?.version),
      }),
    },
    resolve: {
      alias: {
        '@saanpaw/shared': path.join(sharedSrc, 'index.ts'),
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      open: true,
      // The shared workspace is consumed as TypeScript source with no build step,
      // so Vite has to be allowed to serve files from outside this package root.
      fs: { allow: [path.resolve(__dirname, '..')] },
    },
    preview: {
      host: '0.0.0.0',
      port: 4173,
    },
    optimizeDeps: {
      // Same reason: let esbuild compile the shared sources rather than trying to
      // pre-bundle them as an external dependency.
      exclude: ['@saanpaw/shared'],
    },
  };
});
