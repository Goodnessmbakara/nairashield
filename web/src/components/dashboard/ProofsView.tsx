"use client";

/**
 * Markets, on-chain proofs, and plain-language decision meanings.
 * Real verification payloads only — never invents a verified state.
 */

import React from "react";
import { Card, CardBody, Chip, Link } from "@heroui/react";
import { Icon } from "@iconify/react";
import type { Tick } from "../../lib/agent";
import { fetchFixtures, type WatchedFixture } from "../../lib/agent";
import { dedupeTicksForFeed } from "../../lib/ticks";

type Props = {
  ticks: Tick[];
};

const DECISION_MEANINGS = [
  {
    label: "Keep earning",
    code: "HOLD",
    body: "Capital stays in Kamino yield. The agent saw no live edge worth leaving yield for — or the match is not in play yet.",
  },
  {
    label: "Take opportunity",
    code: "TRADE",
    body: "Edge cleared the bar: withdraw from Kamino → place a Jupiter Predict maker order. Only after the match passes on-chain verification.",
  },
  {
    label: "Settled",
    code: "SETTLE",
    body: "An open book finished. Proceeds go back to Kamino. PnL only from resolved Jupiter positions — never invented.",
  },
] as const;

export default function ProofsView({ ticks }: Props) {
  const [fixtures, setFixtures] = React.useState<WatchedFixture[] | null>(null);
  const feed = React.useMemo(() => dedupeTicksForFeed(ticks), [ticks]);
  const latest = feed[0];
  const verification = latest?.verification;
  const verifiedTicks = feed.filter((t) => t.verification);

  React.useEffect(() => {
    const ctrl = new AbortController();
    fetchFixtures(ctrl.signal)
      .then(setFixtures)
      .catch(() => setFixtures([]));
    const t = window.setInterval(() => {
      fetchFixtures(ctrl.signal)
        .then(setFixtures)
        .catch(() => {});
    }, 15_000);
    return () => {
      ctrl.abort();
      window.clearInterval(t);
    };
  }, []);

  const list = (fixtures ?? [])
    .slice()
    .sort((a, b) => Number(b.live) - Number(a.live) || a.start - b.start)
    .slice(0, 6);

  return (
    <div className="flex flex-col gap-4">
      <Card className="border border-transparent bg-content1 dark:border-default-100">
        <CardBody className="gap-3 p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <div className="flex rounded-medium border border-default-100 bg-default-50 p-1.5">
              <Icon className="text-default-500" icon="solar:shield-check-linear" width={18} />
            </div>
            <div>
              <h2 className="font-display text-medium font-semibold text-foreground">
                On-chain proof
              </h2>
              <p className="text-tiny text-default-400">
                TxLINE Merkle proof → txoracle validate_fixture on Solana
              </p>
            </div>
          </div>

          {!verification ? (
            <div className="rounded-medium border border-dashed border-default-200 px-4 py-6 text-center">
              <p className="text-small text-default-500">No verification on the latest tick yet</p>
              <p className="mt-1 text-tiny text-default-400">
                Run a check when a fixture is live — the agent attaches the proof result to that tick.
              </p>
            </div>
          ) : (
            <div
              className={`rounded-medium border px-4 py-4 ${
                verification.ok
                  ? "border-success-200 bg-success-50/50"
                  : "border-default-200 bg-content2"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Chip
                  color={verification.ok ? "success" : "warning"}
                  radius="sm"
                  size="sm"
                  variant="flat"
                >
                  {verification.ok ? "Verified" : "Not verified"}
                </Chip>
                <Chip radius="sm" size="sm" variant="flat">
                  {verification.stage}
                </Chip>
                <span className="text-tiny text-default-400">{verification.cluster}</span>
              </div>
              {verification.participants && (
                <p className="mt-3 text-small font-medium text-foreground">
                  {verification.participants}
                </p>
              )}
              <p className="mt-2 text-tiny leading-5 text-default-600">{verification.reason}</p>
              <dl className="mt-3 grid gap-2 text-tiny sm:grid-cols-2">
                <div>
                  <dt className="text-default-400">Fixture ID</dt>
                  <dd className="font-mono text-default-700">{verification.fixtureId}</dd>
                </div>
                {verification.rootsPda && (
                  <div>
                    <dt className="text-default-400">Roots PDA</dt>
                    <dd className="truncate font-mono text-default-700">{verification.rootsPda}</dd>
                  </div>
                )}
              </dl>
              {verification.explorerUrl && (
                <Link
                  className="mt-3 text-tiny"
                  href={verification.explorerUrl}
                  isExternal
                  size="sm"
                  showAnchorIcon
                >
                  Open on Solana Explorer
                </Link>
              )}
            </div>
          )}

          {verifiedTicks.length > 1 && (
            <div className="flex flex-col gap-2">
              <p className="text-tiny font-medium text-default-500">Recent proof results</p>
              {verifiedTicks.slice(0, 5).map((t) => (
                <div
                  key={t.id}
                  className="flex items-start justify-between gap-3 rounded-medium bg-content2 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-tiny font-medium text-foreground">
                      {t.verification?.participants ?? t.verification?.fixtureId}
                    </p>
                    <p className="mt-0.5 truncate text-[0.65rem] text-default-500">
                      {t.verification?.reason}
                    </p>
                  </div>
                  <Chip
                    classNames={{ content: "text-[0.6rem]" }}
                    color={t.verification?.ok ? "success" : "default"}
                    radius="sm"
                    size="sm"
                    variant="flat"
                  >
                    {t.verification?.ok ? "ok" : "no"}
                  </Chip>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Card className="border border-transparent bg-content1 dark:border-default-100">
        <CardBody className="gap-3 p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <div className="flex rounded-medium border border-default-100 bg-default-50 p-1.5">
              <Icon className="text-default-500" icon="solar:cup-linear" width={18} />
            </div>
            <div>
              <h2 className="font-display text-medium font-semibold text-foreground">Markets</h2>
              <p className="text-tiny text-default-400">Fixtures from the live TxLINE feed</p>
            </div>
          </div>

          {fixtures === null ? (
            <p className="py-6 text-center text-small text-default-400">Loading markets…</p>
          ) : list.length === 0 ? (
            <p className="py-6 text-center text-small text-default-400">No fixtures in feed right now.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {list.map((f) => (
                <li
                  key={f.fixtureId}
                  className="flex items-center justify-between gap-3 rounded-medium border border-default-100 bg-content2/60 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-small font-medium text-foreground">
                      {f.p1} vs {f.p2}
                    </p>
                    <p className="mt-0.5 font-mono text-[0.65rem] text-default-400">
                      {f.fixtureId}
                      {f.live ? " · live" : ""}
                    </p>
                  </div>
                  {f.bettable && (
                    <Chip classNames={{ content: "text-[0.6rem]" }} radius="sm" size="sm" variant="flat">
                      tradeable
                    </Chip>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card className="border border-transparent bg-content1 dark:border-default-100">
        <CardBody className="gap-3 p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <div className="flex rounded-medium border border-default-100 bg-default-50 p-1.5">
              <Icon className="text-default-500" icon="solar:question-circle-linear" width={18} />
            </div>
            <div>
              <h2 className="font-display text-medium font-semibold text-foreground">
                What decisions mean
              </h2>
              <p className="text-tiny text-default-400">Labels you see in Agent activity</p>
            </div>
          </div>
          <ul className="flex flex-col gap-3">
            {DECISION_MEANINGS.map((d) => (
              <li key={d.code} className="rounded-medium bg-content2 px-3 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-small font-medium text-foreground">{d.label}</span>
                  <Chip classNames={{ content: "text-[0.6rem] font-mono" }} radius="sm" size="sm" variant="flat">
                    {d.code}
                  </Chip>
                </div>
                <p className="mt-1.5 text-tiny leading-5 text-default-500">{d.body}</p>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
