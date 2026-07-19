// Landing copy: plain language. No em dashes. No eng-jargon walls.

export const nav = [
  { label: "How it works", href: "#how" },
  { label: "FAQ", href: "#faq" },
  { label: "Need help", href: "#help" },
];

export const problem = {
  title: "Your capital earns while the agent watches live odds",
  body: "Sports money usually sits idle between matches. Retegol keeps it earning by default, reads live TxLINE odds, and only moves when the expected edge beats what you would earn by staying put. If the feed is empty or the numbers do not clear, it holds. No fake odds. No fake fills.",
};

export const agitation = {
  title: "Idle money loses twice",
  points: [
    {
      title: "You miss yield",
      body: "Cash sitting in a plain wallet earns nothing while you wait for the next match.",
    },
    {
      title: "You babysit the market",
      body: "Someone has to watch odds, decide, and execute. That is slow and easy to miss.",
    },
    {
      title: "Bad demos invent numbers",
      body: "Many tools show fake balances and fills. If the data is not real, you cannot trust the decision.",
    },
  ],
};

export const solution = {
  title: "Earn by default. Trade only when it is worth leaving yield.",
  body: "Fund once. Capital stays in yield. The agent runs on its own and pulls live TxLINE World Cup odds. It only acts when the edge is worth more than staying in yield. After a position settles, funds go back to earning. Empty feed or bad data means an honest hold with a clear reason.",
};

export type Step = {
  step: string;
  title: string;
  body: string;
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
    body: "While nothing is worth trading, balance stays in yield and keeps accruing.",
    uiCaption: "Idle capital shows as kept earning with live APY.",
    panel: "yield",
  },
  {
    step: "03",
    title: "Watch live markets",
    body: "The agent reads live TxLINE consensus odds for World Cup fixtures. No babysitting.",
    uiCaption: "Watching lists fixtures from TxLINE.",
    panel: "watching",
  },
  {
    step: "04",
    title: "Decide with a hard bar",
    body: "It only trades when expected edge beats the cost of leaving yield. Odds moved is not enough. Otherwise it holds and keeps earning.",
    uiCaption: "Agent activity shows keep earning or take opportunity.",
    panel: "decision",
  },
  {
    step: "05",
    title: "Return to earning",
    body: "When a position settles, funds route back to yield without manual work.",
    uiCaption: "After a trade settles, capital goes back to yield automatically.",
    panel: "settle",
  },
];

export type Faq = { title: string; content: string };

export const faqs: Faq[] = [
  {
    title: "What problem does this solve?",
    content:
      "Sports capital often earns nothing between plays. Retegol keeps it in yield and only deploys when live TxLINE odds say the edge is worth leaving that yield.",
  },
  {
    title: "Is this arbitrage?",
    content:
      "No. It does not need two venues with different prices. TxLINE is the fair value feed. The agent only acts when the edge beats staying in yield.",
  },
  {
    title: "When does it place a trade?",
    content:
      "Only when expected edge is higher than the yield you would miss by pulling money out. Odds ticking alone is not a green light. If the bar does not clear, it holds.",
  },
  {
    title: "What if the odds feed is empty?",
    content:
      "Honest hold with a specific reason on the dashboard. No invented fixtures, odds, or fills.",
  },
  {
    title: "What if a move fails mid-way?",
    content:
      "It stops cleanly. If capital cannot leave yield safely, it does not open a trade. If funds already left and the order fails, it tries to put them back.",
  },
  {
    title: "Do I need to manage it daily?",
    content:
      "Once funded, the loop is built to run without constant approvals: watch, decide, act only when the bar clears, return funds to yield.",
  },
];

export const builtOn = [
  { name: "Solana", src: "/brands/solana.svg" },
  { name: "USDC", src: "/brands/usdc.svg" },
  { name: "Kamino", src: "/brands/kamino.svg" },
  { name: "TxLINE", src: "/brands/solana.svg" },
];
