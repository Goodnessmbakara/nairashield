"use client";

/**
 * Click a live TxLINE fixture → run real on-chain verify (txoracle).
 * Proof results only come from the worker — never invented.
 *
 * Interaction polish (Emil design-eng): instant press feedback, calm selection,
 * proof enters with opacity + slight Y (not scale-from-0), spinner-only loading.
 */

import React from "react";
import { Button, Card, CardBody, Chip, Link, Spinner } from "@heroui/react";
import { Icon } from "@iconify/react";
import type { MatchVerification, Tick } from "../../lib/agent";
import { fetchFixtures, verifyFixture, type WatchedFixture } from "../../lib/agent";
import { dedupeTicksForFeed } from "../../lib/ticks";

type Props = {
  ticks: Tick[];
};

function ProofDetail({
  verification,
  onClose,
}: {
  verification: MatchVerification;
  onClose?: () => void;
}) {
  return (
    <div
      className={`t-proof-enter rounded-medium border px-4 py-4 ${
        verification.ok
          ? "border-success-200 bg-success-50/50"
          : "border-default-200 bg-content2"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Chip
            color={verification.ok ? "success" : "warning"}
            radius="sm"
            size="sm"
            variant="flat"
          >
            {verification.ok ? "Verified" : "Not verified"}
          </Chip>
          <span className="text-tiny text-default-400">
            {verification.stage} · {verification.cluster}
          </span>
        </div>
        {onClose && (
          <button
            type="button"
            className="t-row-press text-tiny text-default-400 underline-offset-2 hover:text-default-600 hover:underline"
            onClick={onClose}
          >
            Clear
          </button>
        )}
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
        {verification.programId && (
          <div className="sm:col-span-2">
            <dt className="text-default-400">txoracle program</dt>
            <dd className="truncate font-mono text-default-700">{verification.programId}</dd>
          </div>
        )}
      </dl>
      <div className="mt-3 flex flex-wrap gap-3">
        {verification.explorerUrl && (
          <Link
            className="text-tiny"
            href={verification.explorerUrl}
            isExternal
            size="sm"
            showAnchorIcon
          >
            Roots PDA on Explorer
          </Link>
        )}
        {verification.programId && (
          <Link
            className="text-tiny"
            href={`https://explorer.solana.com/address/${verification.programId}${
              verification.cluster === "devnet" ? "?cluster=devnet" : ""
            }`}
            isExternal
            size="sm"
            showAnchorIcon
          >
            Program on Explorer
          </Link>
        )}
      </div>
    </div>
  );
}

export default function ProofsView({ ticks }: Props) {
  const [fixtures, setFixtures] = React.useState<WatchedFixture[] | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [active, setActive] = React.useState<MatchVerification | null>(null);
  const [loadingId, setLoadingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const feed = React.useMemo(() => dedupeTicksForFeed(ticks), [ticks]);
  const fromTicks = React.useMemo(
    () => feed.filter((t) => t.verification),
    [feed],
  );

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
    .slice(0, 12);

  async function runVerify(fixtureId: string) {
    setSelectedId(fixtureId);
    setLoadingId(fixtureId);
    setError(null);
    try {
      const result = await verifyFixture(fixtureId);
      setActive(result);
    } catch (e) {
      setActive(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="border border-transparent bg-content1 dark:border-default-100">
        <CardBody className="gap-3 p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <div className="flex rounded-medium border border-default-100 bg-default-50 p-1.5">
              <Icon className="text-default-500" icon="solar:cup-linear" width={18} />
            </div>
            <div>
              <h2 className="font-display text-medium font-semibold text-foreground">
                Markets
              </h2>
              <p className="text-tiny text-default-400">
                Tap a fixture to verify on-chain
              </p>
            </div>
          </div>

          {fixtures === null ? (
            <div className="flex items-center justify-center gap-2 py-8 text-default-400">
              <Spinner size="sm" />
              <span className="text-small">Loading markets…</span>
            </div>
          ) : list.length === 0 ? (
            <p className="py-6 text-center text-small text-default-400">
              No fixtures in feed right now.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {list.map((f) => {
                const selected = selectedId === f.fixtureId;
                const busy = loadingId === f.fixtureId;
                return (
                  <li key={f.fixtureId}>
                    <button
                      type="button"
                      disabled={loadingId !== null}
                      onClick={() => runVerify(f.fixtureId)}
                      className={`t-row-press flex w-full items-center justify-between gap-3 rounded-medium border px-3 py-2.5 text-left ${
                        selected
                          ? "border-foreground/15 bg-foreground/[0.04] shadow-sm"
                          : "border-transparent bg-content2/70 hover:bg-content2"
                      } disabled:cursor-wait disabled:opacity-70`}
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
                      <div className="flex shrink-0 items-center gap-2">
                        {busy ? (
                          <Spinner size="sm" color="current" />
                        ) : (
                          <span
                            className={`text-tiny font-semibold ${
                              selected ? "text-foreground" : "text-primary"
                            }`}
                          >
                            Verify
                          </span>
                        )}
                        {f.bettable && (
                          <Chip
                            classNames={{ content: "text-[0.6rem]" }}
                            radius="sm"
                            size="sm"
                            variant="flat"
                          >
                            tradeable
                          </Chip>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

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
                TxLINE Merkle → txoracle validate_fixture
              </p>
            </div>
          </div>

          {error && (
            <div className="rounded-medium border border-danger-200 bg-danger-50/40 px-4 py-3">
              <p className="text-small text-danger-600">{error}</p>
            </div>
          )}

          {loadingId && !active ? (
            <div className="flex flex-col items-center gap-2 py-8 text-default-400">
              <Spinner size="sm" />
              <p className="text-small">Checking {loadingId}…</p>
            </div>
          ) : active ? (
            <ProofDetail verification={active} onClose={() => setActive(null)} />
          ) : (
            <div className="rounded-medium border border-dashed border-default-200 px-4 py-6 text-center">
              <p className="text-small text-default-500">Pick a market to verify</p>
            </div>
          )}

          {fromTicks.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-tiny font-medium text-default-500">From recent ticks</p>
              {fromTicks.slice(0, 8).map((t) => {
                const v = t.verification!;
                const selected = active?.fixtureId === v.fixtureId && selectedId === v.fixtureId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(v.fixtureId);
                      setActive(v);
                      setError(null);
                    }}
                    className={`t-row-press flex w-full items-start justify-between gap-3 rounded-medium border px-3 py-2.5 text-left ${
                      selected
                        ? "border-foreground/15 bg-foreground/[0.04]"
                        : "border-transparent bg-content2 hover:bg-content2/80"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-tiny font-medium text-foreground">
                        {v.participants ?? v.fixtureId}
                      </p>
                      <p className="mt-0.5 truncate text-[0.65rem] text-default-500">
                        {v.reason}
                      </p>
                    </div>
                    <Chip
                      classNames={{ content: "text-[0.6rem]" }}
                      color={v.ok ? "success" : "default"}
                      radius="sm"
                      size="sm"
                      variant="flat"
                    >
                      {v.ok ? "ok" : "no"}
                    </Chip>
                  </button>
                );
              })}
            </div>
          )}

          {selectedId && !loadingId && (
            <Button
              size="sm"
              variant="flat"
              className="t-btn-press"
              startContent={<Icon icon="solar:refresh-linear" width={14} />}
              onPress={() => runVerify(selectedId)}
            >
              Re-run verify
            </Button>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
