import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    server: {
      proxy: {
        '/api/openai': {
          target: 'https://api.openai.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/openai/, ''),
          headers: { Authorization: `Bearer ${env.OPENAI_API_KEY ?? ''}` },
        },
        '/api/jev': {
          target: env.JEV_BASE_URL || 'https://api.typesafe.ai',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/jev/, ''),
          headers: { Authorization: `Bearer ${env.TYPESAFE_API_KEY ?? ''}` },
        },
      },
    },
    define: {
      __JEV_MODEL__: JSON.stringify(env.JEV_MODEL || 'jev-latest'),
      __OPENAI_STT_AVAILABLE__: JSON.stringify(Boolean(env.OPENAI_API_KEY)),
      __OPENAI_STT_MODEL__: JSON.stringify(env.OPENAI_STT_MODEL || 'gpt-4o-transcribe'),
      __JEV_MIN_CONFIDENCE__: JSON.stringify(Number(env.JEV_MIN_CONFIDENCE || 0.5)),
    },
  };
});
