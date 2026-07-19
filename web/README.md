# Retegol Web

Astro + React dashboard and marketing site for Retegol.

- **Production:** https://retegol.vercel.app  
- **Agent API:** set `PUBLIC_AGENT_URL` (build-time) to the Worker base URL  

```bash
pnpm install
echo 'PUBLIC_AGENT_URL=http://127.0.0.1:8787' > .env
pnpm dev    # http://127.0.0.1:4321
pnpm build
```
