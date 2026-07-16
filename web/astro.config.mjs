// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// https://astro.build/config
// Bind IPv4 127.0.0.1 so OAuth redirects to http://127.0.0.1:4321 work
// (default can listen on ::1 only, which makes 127.0.0.1 unreachable).
export default defineConfig({
  integrations: [react()],
  server: {
    host: "127.0.0.1",
    port: 4321,
  },
});
