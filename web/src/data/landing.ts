// Landing narrative: Problem → Agitation → Solution → How.
// Plain product language. No "not X, it's Y" contrast slop.

export const nav = [
  { label: "How it works", href: "#how" },
  { label: "FAQ", href: "#faq" },
  { label: "Need help", href: "#help" },
];

export const problem = {
  title: "Sports capital sits dead between plays",
  body: "Between matches and bets, stablecoins often sit in a wallet. Time passes. Purchasing power thins. You still have to watch markets yourself.",
};

export const agitation = {
  title: "Idle money loses twice",
  points: [
    {
      title: "Yield left on the table",
      body: "While you wait for the next price, capital earns nothing in a plain wallet.",
    },
    {
      title: "Attention tax",
      body: "Someone has to watch odds, decide, and execute. That is slow and easy to miss.",
    },
    {
      title: "Half-done moves",
      body: "Pulling funds out and failing mid-trade can leave capital stuck in the wrong place.",
    },
  ],
};

export const solution = {
  title: "Edgeora keeps capital earning, then deploys only when the math clears",
  body: "Fund once. Idle balance sits in Kamino yield. An agent watches live TxLINE odds and only moves capital into Jupiter Predict markets when expected upside beats the yield you give up. After settlement, funds go back to earning.",
};

export type Step = {
  step: string;
  title: string;
  body: string;
  /** What the product UI shows at this stage (first-run depiction). */
  uiCaption: string;
  panel: "deposit" | "yield" | "watching" | "decision" | "settle";
};

export const steps: Step[] = [
  {
    step: "01",
    title: "Fund the agent",
    body: "Connect and deposit USDC so the agent can hold and move capital on Solana.",
    uiCaption: "Your Solana USDC deposit address appears in Portfolio.",
    panel: "deposit",
  },
  {
    step: "02",
    title: "Earn by default",
    body: "While nothing is worth trading, balance stays in Kamino and keeps accruing yield.",
    uiCaption: "Idle capital shows as Kept earning with live Kamino APY.",
    panel: "yield",
  },
  {
    step: "03",
    title: "Watch live markets",
    body: "The agent reads live sports market data and evaluates offers against idle yield.",
    uiCaption: "Watching lists upcoming fixtures from TxLINE — no babysitting required.",
    panel: "watching",
  },
  {
    step: "04",
    title: "Act only when worth it",
    body: "If expected upside does not beat the yield cost of leaving the vault, it holds.",
    uiCaption: "Agent activity shows one status: Keep earning or Take opportunity.",
    panel: "decision",
  },
  {
    step: "05",
    title: "Return to earning",
    body: "When a position settles, funds route back to yield without manual babysitting.",
    uiCaption: "After a trade settles, capital goes back to Kamino automatically.",
    panel: "settle",
  },
];

export type Faq = { title: string; content: string };

export const faqs: Faq[] = [
  {
    title: "What problem does this solve?",
    content:
      "Stablecoins parked between sports plays often earn nothing. Edgeora keeps that capital in yield and only deploys it when a live market opportunity clears the cost of leaving yield.",
  },
  {
    title: "Is this arbitrage?",
    content:
      "No. Arbitrage needs the same event priced differently on two venues. This agent takes positions on Jupiter Predict when the live TxLINE price says the upside beats continuing to earn yield.",
  },
  {
    title: "When does it place a bet?",
    content:
      "When expected upside is higher than the interest you would lose by pulling money out of yield. Otherwise it holds.",
  },
  {
    title: "What if a move fails mid-way?",
    content:
      "If capital cannot leave the yield position cleanly, the agent stops before placing an offer. You should not get stuck halfway through a trade.",
  },
  {
    title: "Do I need to manage it daily?",
    content:
      "Once funded, the loop is designed to run without constant approvals: watch, decide, act when worth it, return funds to yield.",
  },
];

export const builtOn = [
  { name: "Solana", src: "/brands/solana.svg" },
  { name: "USDC", src: "/brands/usdc.svg" },
  { name: "Kamino", src: "/brands/kamino.svg" },
  { name: "Cloudflare", src: "/brands/cloudflare.svg" },
];
