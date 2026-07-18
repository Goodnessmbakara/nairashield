"use client";

import React from "react";
import {
  Button,
  Card,
  CardBody,
  Chip,
  Spinner,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import {
  getFundBalance,
  getPendingWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
  type FundBalance,
  type PendingWithdrawal,
} from "../../lib/admin";
import { microToUsdc } from "../../lib/account";

export default function AdminView() {
  const [balance, setBalance] = React.useState<FundBalance | null>(null);
  const [withdrawals, setWithdrawals] = React.useState<PendingWithdrawal[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [actioning, setActioning] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<Record<string, string>>({});
  const [accessDenied, setAccessDenied] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    const [b, w] = await Promise.all([getFundBalance(), getPendingWithdrawals()]);
    setBalance(b);
    setWithdrawals(w);
    if (b === null && w.length === 0) {
      setAccessDenied(true);
    } else {
      setAccessDenied(false);
    }
    setLoading(false);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleApprove = async (id: string) => {
    setActioning(id);
    const result = await approveWithdrawal(id);
    setActioning(null);
    if ("error" in result) {
      setMessages((m) => ({ ...m, [id]: `Error: ${result.error}` }));
    } else {
      setMessages((m) => ({ ...m, [id]: `Sent ✓ ${result.txSignature.slice(0, 12)}…` }));
      load();
    }
  };

  const handleReject = async (id: string) => {
    setActioning(id);
    const result = await rejectWithdrawal(id);
    setActioning(null);
    if ("error" in result) {
      setMessages((m) => ({ ...m, [id]: `Error: ${result.error}` }));
    } else {
      setMessages((m) => ({ ...m, [id]: "Rejected" }));
      load();
    }
  };

  const poolUsdc = balance ? microToUsdc(balance.poolTotalUsdc) : "—";
  const kaminoUsdc = balance ? microToUsdc(balance.kaminoBalanceUsdc) : "—";

  if (!loading && accessDenied) {
    return (
      <div className="flex flex-col items-center rounded-medium border border-dashed border-default-200 py-12 text-center">
        <Icon className="mb-3 text-default-300" icon="solar:shield-keyhole-linear" width={32} />
        <p className="text-medium font-semibold text-default-500">Admin access required</p>
        <p className="mt-1 text-small text-default-400">
          Your account does not have admin privileges.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Pool summary */}
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        {[
          { label: "Total pool", value: `$${poolUsdc}`, hint: "confirmed deposits net withdrawals" },
          { label: "Kamino balance", value: `$${kaminoUsdc}`, hint: "deployed capital earning yield" },
          {
            label: "Users",
            value: loading ? "—" : String(balance?.users.length ?? 0),
            hint: "with confirmed deposits",
          },
        ].map((s) => (
          <Card key={s.label} className="border border-transparent bg-content1 dark:border-default-100">
            <CardBody className="gap-1 p-4">
              <p className="text-tiny text-default-400">{s.label}</p>
              <p className="font-display text-2xl font-semibold tabular-nums text-foreground">
                {s.value}
              </p>
              <p className="text-tiny text-default-400">{s.hint}</p>
            </CardBody>
          </Card>
        ))}
      </dl>

      {/* Pending withdrawals */}
      <Card className="border border-transparent bg-content1 dark:border-default-100">
        <CardBody className="gap-3 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex rounded-medium border border-default-100 bg-default-50 p-1.5">
                <Icon className="text-default-500" icon="solar:card-send-linear" width={16} />
              </div>
              <h2 className="font-display text-medium font-semibold text-foreground">
                Pending withdrawals
                {withdrawals.length > 0 && (
                  <Chip className="ml-2" color="warning" radius="sm" size="sm" variant="flat">
                    {withdrawals.length}
                  </Chip>
                )}
              </h2>
            </div>
            <Button isIconOnly radius="full" size="sm" variant="flat" onPress={load}>
              <Icon icon="solar:refresh-linear" width={16} />
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-6">
              <Spinner size="sm" />
            </div>
          ) : withdrawals.length === 0 ? (
            <div className="flex flex-col items-center rounded-medium border border-dashed border-default-200 py-6 text-center">
              <Icon className="mb-2 text-default-300" icon="solar:check-circle-linear" width={24} />
              <p className="text-small text-default-500">No pending withdrawals</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {withdrawals.map((w) => (
                <div
                  key={w.id}
                  className="flex flex-col gap-2 rounded-medium border border-default-200 bg-content2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="truncate font-mono text-tiny text-default-400">{w.userSub}</p>
                    <p className="font-display text-medium font-semibold tabular-nums text-foreground">
                      ${microToUsdc(w.amountUsdc)} USDC
                    </p>
                    {w.notes && (
                      <p className="truncate text-tiny text-default-400">{w.notes}</p>
                    )}
                    <p className="text-tiny text-default-400">
                      {new Date(w.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    {messages[w.id] && (
                      <p className="text-tiny text-default-500">{messages[w.id]}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      color="success"
                      isDisabled={actioning === w.id}
                      isLoading={actioning === w.id}
                      radius="full"
                      size="sm"
                      variant="flat"
                      onPress={() => handleApprove(w.id)}
                    >
                      Approve
                    </Button>
                    <Button
                      color="danger"
                      isDisabled={actioning === w.id}
                      radius="full"
                      size="sm"
                      variant="flat"
                      onPress={() => handleReject(w.id)}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* User breakdown */}
      <Card className="border border-transparent bg-content1 dark:border-default-100">
        <CardBody className="gap-3 p-4">
          <div className="flex items-center gap-2.5">
            <div className="flex rounded-medium border border-default-100 bg-default-50 p-1.5">
              <Icon
                className="text-default-500"
                icon="solar:users-group-rounded-linear"
                width={16}
              />
            </div>
            <h2 className="font-display text-medium font-semibold text-foreground">
              User balances
            </h2>
          </div>

          {loading ? (
            <div className="flex justify-center py-4">
              <Spinner size="sm" />
            </div>
          ) : !balance?.users.length ? (
            <div className="flex flex-col items-center rounded-medium border border-dashed border-default-200 py-6 text-center">
              <p className="text-small text-default-500">No users with deposits yet</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {balance.users.map((u) => (
                <div
                  key={u.userSub}
                  className="flex items-center justify-between rounded-medium border border-default-200 bg-content2 px-3 py-2.5"
                >
                  <p className="min-w-0 truncate font-mono text-tiny text-default-500">
                    {u.userSub}
                  </p>
                  <div className="flex shrink-0 items-center gap-3">
                    <p className="font-display text-small font-semibold tabular-nums text-foreground">
                      ${microToUsdc(u.netUsdc)}
                    </p>
                    <Chip color="default" radius="sm" size="sm" variant="flat">
                      {(u.sharePct * 100).toFixed(1)}%
                    </Chip>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
