import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, loadEnv, type ProxyOptions } from 'vite';

function jsonError(res: ServerResponse, status: number, message: string): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: message }));
}

function guardedProxy(
  prefix: string,
  target: string,
  token: string | undefined,
  missingMessage: string,
): ProxyOptions {
  return {
    target,
    changeOrigin: true,
    rewrite: (path) => path.replace(new RegExp(`^${prefix}`), ''),
    configure: (proxy) => {
      proxy.on('proxyReq', (proxyReq) => {
        proxyReq.removeHeader('cookie');
        proxyReq.removeHeader('authorization');
        if (token) proxyReq.setHeader('Authorization', `Bearer ${token}`);
      });
    },
    bypass: (req: IncomingMessage, res?: ServerResponse): string | undefined | false => {
      if (!res) return undefined;
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        jsonError(res, 405, 'Only POST is allowed on this endpoint.');
        return false;
      }
      if (!token) {
        jsonError(res, 503, missingMessage);
        return false;
      }
      return undefined;
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    server: {
      proxy: {
        '/api/openai': guardedProxy(
          '/api/openai',
          'https://api.openai.com',
          env.OPENAI_API_KEY,
          'OPENAI_API_KEY is not set. Add it to .env and restart the dev server to enable voice transcription.',
        ),
        '/api/jev': guardedProxy(
          '/api/jev',
          env.JEV_BASE_URL || 'https://api.typesafe.ai',
          env.TYPESAFE_API_KEY,
          'TYPESAFE_API_KEY is not set. Add it to .env and restart the dev server to enable Jev commands.',
        ),
      },
    },
    build: {
      target: 'es2022',
      sourcemap: true,
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks: (id: string) => (id.includes('node_modules/three') ? 'three' : undefined),
        },
      },
    },
    define: {
      __JEV_MODEL__: JSON.stringify(env.JEV_MODEL || 'jev-latest'),
      __OPENAI_STT_AVAILABLE__: JSON.stringify(Boolean(env.OPENAI_API_KEY)),
      __OPENAI_STT_MODEL__: JSON.stringify(env.OPENAI_STT_MODEL || 'gpt-4o-transcribe'),
      __JEV_MIN_CONFIDENCE__: JSON.stringify(Number(env.JEV_MIN_CONFIDENCE || 0.5)),
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  };
});
