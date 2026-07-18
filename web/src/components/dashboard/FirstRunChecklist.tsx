"use client";

import React from "react";
import { Button, Card, CardBody, Chip } from "@heroui/react";
import { Icon } from "@iconify/react";
import { getBalance, getWallet } from "../../lib/account";
import type { DashboardView } from "./sidebar-items";

type Props = {
  hasTicks: boolean;
  onNavigate: (view: DashboardView) => void;
};

type Item = {
  key: string;
  title: string;
  body: string;
  done: boolean;
  view?: DashboardView;
  actionLabel?: string;
};

export default function FirstRunChecklist({ hasTicks, onNavigate }: Props) {
  const [hasDeposit, setHasDeposit] = React.useState<boolean | null>(null);
  const [hasBalance, setHasBalance] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const [wallet, balance] = await Promise.all([getWallet(), getBalance()]);
      if (cancelled) return;
      setHasDeposit(Boolean(wallet?.depositAddress));
      setHasBalance(Boolean(balance && Number(balance.netUsdc) > 0));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const items: Item[] = [
    {
      key: "deposit",
      title: "Get your deposit address",
      body: "Open Portfolio and create your Solana USDC address.",
      done: hasDeposit === true,
      view: "portfolio",
      actionLabel: "Portfolio",
    },
    {
      key: "fund",
      title: "Send USDC",
      body: "Fund the pool so capital can earn in Kamino.",
      done: hasBalance,
      view: "portfolio",
      actionLabel: "Portfolio",
    },
    {
      key: "watch",
      title: "Watch the agent check markets",
      body: "Run a check or wait for cron — status shows Keep earning until a play is live.",
      done: hasTicks,
      view: "decisions",
      actionLabel: "Activity",
    },
    {
      key: "read",
      title: "Read HOLD vs opportunity",
      body: "Idle checks collapse into one status. Trades show as Take opportunity.",
      done: hasTicks,
      view: "decisions",
      actionLabel: "Activity",
    },
  ];

  const allDone = items.every((i) => i.done);
  if (allDone) return null;
  if (hasDeposit === null) return null;

  const next = items.find((i) => !i.done);

  return (
    <Card className="border border-default-200 bg-content1" shadow="none">
      <CardBody className="gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-medium font-semibold text-foreground">
            Your first agent run
          </h2>
          <Chip
            classNames={{ content: "font-medium text-[0.65rem]" }}
            radius="sm"
            size="sm"
            variant="flat"
          >
            {items.filter((i) => i.done).length}/{items.length}
          </Chip>
        </div>
        <ol className="flex flex-col gap-2">
          {items.map((item, i) => (
            <li
              key={item.key}
              className="flex items-start gap-3 rounded-medium bg-content2 px-3 py-2.5"
            >
              <Icon
                className={
                  item.done ? "mt-0.5 shrink-0 text-success" : "mt-0.5 shrink-0 text-default-400"
                }
                icon={item.done ? "solar:check-circle-bold" : "solar:record-circle-linear"}
                width={18}
              />
              <div className="min-w-0 flex-1">
                <p className="text-small font-medium text-foreground">
                  <span className="mr-1.5 tabular-nums text-default-400">0{i + 1}</span>
                  {item.title}
                </p>
                <p className="mt-0.5 text-tiny leading-5 text-default-500">{item.body}</p>
              </div>
              {!item.done && item.view && next?.key === item.key && (
                <Button
                  className="shrink-0"
                  radius="full"
                  size="sm"
                  variant="flat"
                  onPress={() => onNavigate(item.view!)}
                >
                  {item.actionLabel}
                </Button>
              )}
            </li>
          ))}
        </ol>
      </CardBody>
    </Card>
  );
}
