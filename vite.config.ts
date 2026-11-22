import { defineConfig } from 'vite';
import appPackage from './package.json';

export default defineConfig({
  base: '/KEY-BULLET/',
  define: {
    __APP_VERSION__: JSON.stringify(appPackage.version),
  },
  server: { host: '0.0.0.0' },
});
