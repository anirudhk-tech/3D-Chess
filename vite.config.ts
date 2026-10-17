import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    server: {
      proxy: {
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
      __JEV_MIN_CONFIDENCE__: JSON.stringify(Number(env.JEV_MIN_CONFIDENCE || 0.5)),
    },
  };
});
