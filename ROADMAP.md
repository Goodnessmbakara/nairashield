# NairaShield Roadmap — Per-User Agents Without Custody

Today NairaShield runs as a single-operator agent: one wallet, funded by the
operator, and the dashboard is a read-only window into that agent. This
document is the researched plan for the next stage: **every user gets their
own agent — without NairaShield ever holding anyone's private key.**

## The problem

An autonomous agent must sign transactions while the user is offline. Both of
our venues hard-require the funds' owner as transaction signer (verified
against klend-sdk v9.1.5 instruction metadata and the Jupiter Predict API,
which accepts only `ownerPubkey` and returns a transaction the owner must
sign). Solana-native delegation cannot bridge this:

| Native mechanism | Why it falls short |
|---|---|
| SPL token `approveChecked` (delegate up to N USDC) | Delegate can transfer, but cannot sign Kamino obligation ops or Jupiter orders *as the owner*; no destination restriction |
| Squads v4 spending limits | Only SOL/SPL transfers — cannot invoke Kamino/Jupiter; vault-transaction path either requires user approval per trade (kills autonomy) or unbounded agent authority |
| Session keys (MagicBlock) | Target program must integrate the check; Kamino and Jupiter do not |
| Kamino operator role | Does not exist — only full obligation ownership transfer |

So the fix is not a different signature — it is signing **with the user's own
key, without anyone holding it**.

## V2 architecture: Privy session signers (selected)

[Privy](https://www.privy.io) (Stripe-owned; a reference wallet integration in
Solana Agent Kit v2) provides embedded wallets where the key lives in secure
enclaves with Shamir secret-sharing — the user controls it, neither Privy nor
the app can extract it.

The flow:

1. **Sign in with Google** (existing NairaShield auth) → the same OAuth
   identity mints the user a self-custodied Solana wallet. No seed phrase.
2. **One-time consent** adds the NairaShield agent as a **session signer** —
   a named, revocable grant. The user can remove it at any time.
3. **The agent trades as the user**: the Cloudflare Worker calls Privy's REST
   API; the enclave signs with the user's key. Kamino obligations and Jupiter
   Predict positions are owned by the user's wallet — `owner.is_signer` is
   satisfied natively, and withdrawals go only to the user.
4. **Policies bound the agent** (enforced in the enclave, not by our code):
   - Program-ID allowlist: Kamino Lend + Jupiter Predict only
   - Per-transaction USDC amount caps
   - Time-window rules; key export blocked
5. **Per-user state**: KV namespaced by Google `sub`
   (`user:{sub}:history`, `user:{sub}:position`); the cron fans the tick out
   across funded users; the dashboard scopes to the session's user.

Known engineering caveats (accepted):
- Policy engines cannot resolve addresses inside Address Lookup Tables, so
  policies are built on **program IDs + amounts**, not recipient addresses.
- Cumulative daily caps are not native — enforced by a counter in the Worker
  on top of per-transaction policy caps.
- Pricing: free to 50K signatures/month and 10K users; usage-based beyond.

Estimated effort: days, not weeks — auth already matches, agent logic is
per-keypair-agnostic, and signing moves from local keypair to a REST call.

## Fallback: Squads v4 bounded funding

If enclave-based signing is unacceptable, the audited-native alternative:
each user gets a [Squads v4](https://squads.xyz) vault (immutable program;
Neodyme / OtterSec / Trail of Bits audits) with a **spending limit** granting
the agent X USDC per period, destination-whitelisted to a per-user agent
trading wallet. The at-risk slice is agent-held but capped and instantly
revocable (one config action). Simpler trust math; weaker custody story than
V2.

## V3: on-chain enforced vault program

A custom Anchor vault where users deposit into a program PDA and the agent
key can only execute whitelisted strategy instructions (klend CPI + venue
orders) — withdrawal to anywhere but the depositor is impossible *by program
logic*, not policy. Precedent: `drift-labs/drift-vaults` (Apache-2.0,
Neodyme-audited). Requires a custom program + audit; this is the long-term
trust ceiling.

## Why this ordering

The 2023–24 wave of custodial Telegram bots (Unibot, Maestro, Banana Gun)
lost ~$4M+ to server-side key compromises. The products that endured
(e.g. Axiom, via Turnkey) moved signing into enclaves under policy. V2
adopts that proven pattern with the provider whose onboarding (Google
login) matches NairaShield's existing auth one-to-one.
