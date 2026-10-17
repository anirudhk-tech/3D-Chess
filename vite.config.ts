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
      },
    },
    define: {
      __OPENAI_MODEL__: JSON.stringify(env.OPENAI_MODEL || 'gpt-4o-mini'),
    },
  };
});
