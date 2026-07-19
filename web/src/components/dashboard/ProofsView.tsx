"use client";

/**
 * Match verification receipt — real TxLINE Merkle proof → on-chain roots PDA
 * → validate_fixture simulate. Evidence stack inspired by ProofXI VAR review;
 * all status comes from the worker (never invented).
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

type LayerStatus = "idle" | "pending" | "ok" | "fail" | "skip";

function shortAddr(a?: string, n = 4): string {
  if (!a) return "—";
  if (a.length <= n * 2 + 2) return a;
  return `${a.slice(0, n)}…${a.slice(-n)}`;
}

function layerStatuses(v: MatchVerification | null, loading: boolean): {
  id: string;
  title: string;
  detail: string;
  status: LayerStatus;
}[] {
  if (loading) {
    return [
      { id: "proof", title: "TxLINE fixture proof", detail: "Fetching Merkle proof…", status: "pending" },
      { id: "pda", title: "Roots PDA on Solana", detail: "Waiting…", status: "idle" },
      { id: "sim", title: "validate_fixture", detail: "Waiting…", status: "idle" },
    ];
  }
  if (!v) {
    return [
      { id: "proof", title: "TxLINE fixture proof", detail: "GET /api/fixtures/validation", status: "idle" },
      { id: "pda", title: "Roots PDA on Solana", detail: "ten_daily_fixtures_roots", status: "idle" },
      { id: "sim", title: "validate_fixture", detail: "On-chain Merkle check (simulate)", status: "idle" },
    ];
  }

  const stage = v.stage;
  const proofOk = stage === "proof" || stage === "pda" || stage === "simulate";
  // If we got past proof fetch into pda/simulate, proof succeeded
  const gotProof = Boolean(v.proofTs) || stage !== "proof" || v.ok;
  const gotPda = stage === "pda" || stage === "simulate" || Boolean(v.rootsPda && (v.ok || stage !== "proof"));
  const simDone = stage === "simulate";

  let proofStatus: LayerStatus = "idle";
  let pdaStatus: LayerStatus = "idle";
  let simStatus: LayerStatus = "idle";

  if (stage === "proof" && !v.ok) {
    proofStatus = "fail";
  } else if (gotProof || v.proofTs) {
    proofStatus = v.ok || stage === "pda" || stage === "simulate" ? "ok" : proofOk ? "ok" : "fail";
  }

  if (stage === "proof" && !v.ok) {
    pdaStatus = "skip";
    simStatus = "skip";
  } else if (stage === "pda") {
    proofStatus = "ok";
    pdaStatus = v.ok ? "ok" : "fail";
    simStatus = v.ok ? "skip" : "skip";
    // ok at pda means PDA confirmed without full sim
    if (v.ok) simStatus = "skip";
  } else if (stage === "simulate") {
    proofStatus = "ok";
    pdaStatus = "ok";
    simStatus = v.ok ? "ok" : "fail";
  }

  // Refine: if we have rootsPda and reason mentions confirmed, PDA is ok
  if (v.rootsPda && /confirmed|fetched/i.test(v.reason) && proofStatus !== "fail") {
    proofStatus = "ok";
  }
  if (v.rootsPda && (stage === "pda" || stage === "simulate")) {
    if (!/not published|owner mismatch|unavailable|missing/i.test(v.reason) || v.ok) {
      if (proofStatus !== "fail") pdaStatus = v.ok || stage === "simulate" ? "ok" : pdaStatus;
    }
  }
  if (stage === "pda" && v.ok) {
    proofStatus = "ok";
    pdaStatus = "ok";
    simStatus = "skip";
  }
  if (stage === "pda" && !v.ok) {
    proofStatus = "ok";
    pdaStatus = "fail";
    simStatus = "skip";
  }
  if (stage === "proof" && !v.ok) {
    proofStatus = "fail";
    pdaStatus = "skip";
    simStatus = "skip";
  }
  if (stage === "simulate") {
    proofStatus = "ok";
    pdaStatus = "ok";
    simStatus = v.ok ? "ok" : "fail";
  }

  return [
    {
      id: "proof",
      title: "TxLINE fixture proof",
      detail: v.proofTs
        ? `snapshot Ts ${v.proofTs} · Merkle path from /api/fixtures/validation`
        : v.reason.slice(0, 80),
      status: proofStatus,
    },
    {
      id: "pda",
      title: "Roots PDA on Solana",
      detail: v.rootsPda
        ? `${shortAddr(v.rootsPda, 6)} · ${v.cluster}`
        : "ten_daily_fixtures_roots PDA",
      status: pdaStatus,
    },
    {
      id: "sim",
      title: "validate_fixture",
      detail:
        simStatus === "skip"
          ? "Simulate skipped — PDA gate only (or fee-payer SOL)"
          : "txoracle simulateTransaction · Merkle check",
      status: simStatus,
    },
  ];
}

function StatusIcon({ status }: { status: LayerStatus }) {
  if (status === "pending") return <Spinner size="sm" color="primary" />;
  if (status === "ok")
    return <Icon className="text-success-600" icon="solar:check-circle-bold" width={22} />;
  if (status === "fail")
    return <Icon className="text-danger-500" icon="solar:close-circle-bold" width={22} />;
  if (status === "skip")
    return <Icon className="text-default-300" icon="solar:minus-circle-linear" width={22} />;
  return <Icon className="text-primary-200" icon="solar:record-circle-linear" width={22} />;
}

function VerificationReceipt({
  verification,
  loading,
  matchLabel,
  onClose,
}: {
  verification: MatchVerification | null;
  loading: boolean;
  matchLabel?: string;
  onClose?: () => void;
}) {
  const layers = layerStatuses(verification, loading);
  const verdict = loading
    ? null
    : verification
      ? verification.ok
        ? "confirm"
        : "overturn"
      : null;

  return (
    <div className="overflow-hidden rounded-large border border-primary-100 bg-content1 shadow-md shadow-primary-100/40">
      {/* Broadcast strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary-100 bg-gradient-to-r from-primary-600 to-secondary-600 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-300 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success-400" />
          </span>
          <span className="text-[0.65rem] font-bold uppercase tracking-widest text-white">
            Going to VAR
          </span>
          <span className="hidden text-[0.65rem] text-primary-100 sm:inline">
            on-chain review · validate_fixture
          </span>
        </div>
        <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-primary-100">
          Powered by TxLINE
        </span>
      </div>

      {/* Match header */}
      <div className="border-b border-primary-50 bg-primary-50/50 px-4 py-4">
        <p className="text-tiny font-medium uppercase tracking-wide text-primary-600">Reviewing</p>
        <p className="mt-1 font-display text-large font-bold text-foreground">
          {matchLabel ||
            verification?.participants ||
            verification?.fixtureId ||
            "Select a fixture"}
        </p>
        {verification?.fixtureId && (
          <p className="mt-1 font-mono text-[0.65rem] text-primary-500">
            fixture {verification.fixtureId}
            {verification.cluster ? ` · ${verification.cluster}` : ""}
          </p>
        )}
      </div>

      {/* Evidence stack */}
      <div className="divide-y divide-primary-50">
        {layers.map((layer, i) => (
          <div
            key={layer.id}
            className={`flex items-start gap-3 px-4 py-3.5 transition-colors ${
              layer.status === "ok"
                ? "bg-success-50/40"
                : layer.status === "fail"
                  ? "bg-danger-50/50"
                  : layer.status === "pending"
                    ? "bg-primary-50/50"
                    : "bg-content1"
            }`}
          >
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-default-100">
              <StatusIcon status={layer.status} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[0.65rem] font-bold tabular-nums text-primary-400">
                  0{i + 1}
                </span>
                <p className="text-small font-semibold text-foreground">{layer.title}</p>
                {layer.status === "ok" && (
                  <Chip color="success" size="sm" variant="flat" classNames={{ content: "text-[0.6rem] font-bold" }}>
                    PASS
                  </Chip>
                )}
                {layer.status === "fail" && (
                  <Chip color="danger" size="sm" variant="flat" classNames={{ content: "text-[0.6rem] font-bold" }}>
                    FAIL
                  </Chip>
                )}
                {layer.status === "skip" && (
                  <Chip size="sm" variant="flat" classNames={{ content: "text-[0.6rem]" }}>
                    SKIP
                  </Chip>
                )}
              </div>
              <p className="mt-0.5 truncate font-mono text-[0.7rem] text-default-500">
                {layer.detail}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Verdict */}
      {verdict && verification && (
        <div
          className={`border-t px-4 py-4 ${
            verdict === "confirm"
              ? "border-success-200 bg-gradient-to-r from-success-50 to-success-100/80"
              : "border-danger-200 bg-gradient-to-r from-danger-50 to-warning-50"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p
                className={`font-display text-xl font-bold tracking-tight ${
                  verdict === "confirm" ? "text-success-700" : "text-danger-600"
                }`}
              >
                {verdict === "confirm" ? "CONFIRMED" : "NOT VERIFIED"}
              </p>
              <p className="mt-1 max-w-xl text-tiny leading-5 text-default-600">
                {verification.reason}
              </p>
            </div>
            <Chip
              color={verdict === "confirm" ? "success" : "danger"}
              size="sm"
              variant="solid"
              classNames={{ content: "font-bold text-[0.65rem]" }}
            >
              {verification.stage.toUpperCase()}
            </Chip>
          </div>

          <dl className="mt-3 grid gap-2 text-tiny sm:grid-cols-2">
            <div className="rounded-medium bg-white/70 px-3 py-2 ring-1 ring-default-100">
              <dt className="text-default-400">Fixture</dt>
              <dd className="font-mono text-default-800">{verification.fixtureId}</dd>
            </div>
            {verification.rootsPda && (
              <div className="rounded-medium bg-white/70 px-3 py-2 ring-1 ring-default-100">
                <dt className="text-default-400">Roots PDA</dt>
                <dd className="truncate font-mono text-default-800">{verification.rootsPda}</dd>
              </div>
            )}
            {verification.programId && (
              <div className="rounded-medium bg-white/70 px-3 py-2 ring-1 ring-default-100 sm:col-span-2">
                <dt className="text-default-400">txoracle program</dt>
                <dd className="truncate font-mono text-default-800">{verification.programId}</dd>
              </div>
            )}
          </dl>

          <div className="mt-3 flex flex-wrap gap-3">
            {verification.explorerUrl && (
              <Link
                className="text-tiny font-semibold text-primary"
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
                className="text-tiny font-semibold text-secondary"
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
            {onClose && (
              <button
                type="button"
                className="text-tiny text-default-400 underline-offset-2 hover:text-default-600 hover:underline"
                onClick={onClose}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {!verification && !loading && (
        <div className="border-t border-dashed border-primary-100 px-4 py-8 text-center">
          <Icon className="mx-auto text-primary-300" icon="solar:shield-check-bold" width={32} />
          <p className="mt-2 text-small font-medium text-default-600">
            Waiting for autonomous verify…
          </p>
          <p className="mt-1 text-tiny text-default-400">
            Agent + this panel self-run: TxLINE proof → roots PDA → validate_fixture
          </p>
        </div>
      )}
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

  const list = React.useMemo(
    () =>
      (fixtures ?? [])
        .slice()
        .sort((a, b) => Number(b.live) - Number(a.live) || a.start - b.start)
        .slice(0, 12),
    [fixtures],
  );

  const selectedFixture = list.find((f) => f.fixtureId === selectedId);
  const matchLabel = selectedFixture
    ? `${selectedFixture.p1} vs ${selectedFixture.p2}`
    : active?.participants;

  const runVerify = React.useCallback(async (fixtureId: string, quiet = false) => {
    setSelectedId(fixtureId);
    setLoadingId(fixtureId);
    if (!quiet) setError(null);
    if (!quiet) setActive(null);
    try {
      const result = await verifyFixture(fixtureId);
      setActive(result);
      setError(null);
    } catch (e) {
      if (!quiet) setActive(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingId(null);
    }
  }, []);

  // Load markets; no human click required
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

  // Self-verify nearest fixture as soon as feed is ready (autonomous demo path)
  const autoVerified = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (list.length === 0) return;
    const target = list.find((f) => f.live) ?? list[0]!;
    if (autoVerified.current === target.fixtureId) return;
    autoVerified.current = target.fixtureId;
    void runVerify(target.fixtureId, true);
  }, [list, runVerify]);

  // Re-verify selected match every 60s while this view is open (no human in loop)
  React.useEffect(() => {
    if (!selectedId) return;
    const t = window.setInterval(() => {
      void runVerify(selectedId, true);
    }, 60_000);
    return () => window.clearInterval(t);
  }, [selectedId, runVerify]);

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-5 lg:gap-4">
      <Card className="border border-primary-100 bg-content1 shadow-sm shadow-primary-100/40 lg:col-span-2">
        <CardBody className="gap-3 p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <div className="flex rounded-medium border border-primary-100 bg-primary-50 p-1.5">
              <Icon className="text-primary" icon="solar:cup-bold" width={18} />
            </div>
            <div>
              <h2 className="font-display text-medium font-semibold text-foreground">
                Markets
              </h2>
              <p className="text-tiny text-primary-600/70">
                Auto-verifies on load · same path as the agent cron
              </p>
            </div>
          </div>

          {fixtures === null ? (
            <div className="flex items-center justify-center gap-2 py-8 text-primary-400">
              <Spinner size="sm" color="primary" />
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
                      className={`t-row-press flex w-full items-center justify-between gap-3 rounded-medium border px-3 py-2.5 text-left transition-colors ${
                        selected
                          ? "border-primary-300 bg-primary-50 shadow-sm shadow-primary-100"
                          : "border-transparent bg-primary-50/40 hover:border-primary-100 hover:bg-primary-50"
                      } disabled:cursor-wait disabled:opacity-70`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-small font-medium text-foreground">
                          {f.p1} vs {f.p2}
                        </p>
                        <p className="mt-0.5 font-mono text-[0.65rem] text-primary-500/80">
                          {f.fixtureId}
                          {f.live ? " · live" : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {busy ? (
                          <Spinner size="sm" color="primary" />
                        ) : (
                          <span className="text-tiny font-bold text-primary">Verify</span>
                        )}
                        {f.bettable && (
                          <Chip
                            classNames={{ content: "text-[0.6rem]" }}
                            color="secondary"
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

          {fromTicks.length > 0 && (
            <div className="mt-2 flex flex-col gap-1.5 border-t border-primary-50 pt-3">
              <p className="text-tiny font-semibold text-primary-600">From agent ticks</p>
              {fromTicks.slice(0, 6).map((t) => {
                const v = t.verification!;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(v.fixtureId);
                      setActive(v);
                      setError(null);
                    }}
                    className="t-row-press flex w-full items-center justify-between gap-2 rounded-medium border border-transparent bg-content2 px-3 py-2 text-left hover:border-primary-100 hover:bg-primary-50/50"
                  >
                    <span className="truncate text-tiny font-medium">
                      {v.participants ?? v.fixtureId}
                    </span>
                    <Chip
                      color={v.ok ? "success" : "warning"}
                      size="sm"
                      variant="flat"
                      classNames={{ content: "text-[0.6rem] font-bold" }}
                    >
                      {v.ok ? "OK" : "NO"}
                    </Chip>
                  </button>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>

      <div className="flex flex-col gap-3 lg:col-span-3">
        {error && (
          <div className="rounded-medium border border-danger-200 bg-danger-50 px-4 py-3">
            <p className="text-small font-medium text-danger-600">{error}</p>
          </div>
        )}

        <VerificationReceipt
          loading={Boolean(loadingId)}
          matchLabel={matchLabel}
          verification={active}
          onClose={() => {
            setActive(null);
            setSelectedId(null);
          }}
        />

        {selectedId && !loadingId && (
          <Button
            className="self-start font-semibold"
            color="primary"
            radius="full"
            size="sm"
            startContent={<Icon icon="solar:refresh-bold" width={14} />}
            variant="flat"
            onPress={() => runVerify(selectedId)}
          >
            Re-run verify
          </Button>
        )}
      </div>
    </div>
  );
}
