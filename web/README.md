# NairaShield Web

Marketing site + public activity demo for NairaShield.

## Commands

| Command | Action |
| --- | --- |
| `npm install` | Install deps |
| `npm run dev` | Dev server at `localhost:4321` |
| `npm run build` | Production build → `./dist/` |
| `npm run preview` | Preview production build |

## Environment

Create `.env` in this folder if needed:

```bash
# Optional: live Cloudflare Worker URL for the activity demo
PUBLIC_AGENT_URL=https://your-worker.example.workers.dev

# Optional: external form endpoint (Formspree / Basin / Getform)
# Waitlist always saves to localStorage; remote is best-effort
PUBLIC_WAITLIST_URL=https://formspree.io/f/your-id
```

## User flows

1. **Primary:** Join waitlist (`#waitlist`) - no login
2. **Secondary:** How it works / activity preview on the landing page
3. **Tertiary:** `/dashboard` - public live activity demo (not an account)

## Stack

Astro + React + HeroUI + Tailwind + Framer Motion + Recharts
