"use client";

import React from "react";
import {
  Button,
  Card,
  CardBody,
  Chip,
  Input,
  Spinner,
  Tooltip,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import {
  getOrCreateWallet,
  getWallet,
  getBalance,
  getTransactions,
  getProfile,
  saveProfile,
  setWithdrawalAddress,
  requestWithdrawal,
  microToUsdc,
  type AccountWallet,
  type AccountBalance,
  type AccountProfile,
  type FundTransaction,
} from "../../lib/account";

const emptyProfile = (): AccountProfile => ({
  firstName: "",
  lastName: "",
  email: "",
  mobileNumber: "",
  dob: "",
  address: "",
  city: "",
  country: "",
});

export default function PortfolioView() {
  const [wallet, setWallet] = React.useState<AccountWallet | null>(null);
  const [balance, setBalance] = React.useState<AccountBalance | null>(null);
  const [transactions, setTransactions] = React.useState<FundTransaction[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [withdrawalAddr, setWithdrawalAddr] = React.useState("");
  const [withdrawalAmount, setWithdrawalAmount] = React.useState("");
  const [addrSaving, setAddrSaving] = React.useState(false);
  const [addrSaved, setAddrSaved] = React.useState(false);
  const [withdrawing, setWithdrawing] = React.useState(false);
  const [withdrawMsg, setWithdrawMsg] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [fossapayRequired, setFossapayRequired] = React.useState(false);
  const [hasProfile, setHasProfile] = React.useState(false);
  const [profileForm, setProfileForm] = React.useState<AccountProfile>(emptyProfile);
  const [profileSaving, setProfileSaving] = React.useState(false);
  const [profileError, setProfileError] = React.useState<string | null>(null);
  const [walletError, setWalletError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    const [w, b, txs, profileRes] = await Promise.all([
      getWallet(),
      getBalance(),
      getTransactions(20),
      getProfile(),
    ]);
    setWallet(w);
    setBalance(b);
    setTransactions(txs);
    if (w?.withdrawalAddress) setWithdrawalAddr(w.withdrawalAddress);

    const needsFossa = Boolean(profileRes?.fossapayRequired || w?.fossapayRequired);
    setFossapayRequired(needsFossa);
    if (profileRes?.profile) {
      setHasProfile(true);
      setProfileForm(profileRes.profile);
    } else {
      setHasProfile(false);
      const name = (profileRes?.sessionName || "").trim();
      const parts = name.split(/\s+/).filter(Boolean);
      setProfileForm({
        ...emptyProfile(),
        firstName: parts[0] || "",
        lastName: parts.slice(1).join(" ") || "",
        email: profileRes?.sessionEmail || "",
      });
    }
    setLoading(false);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleSaveProfile = async () => {
    setProfileSaving(true);
    setProfileError(null);
    const result = await saveProfile(profileForm);
    setProfileSaving(false);
    if ("error" in result) {
      setProfileError(result.error);
      return;
    }
    setHasProfile(true);
    setProfileForm(result.profile);
  };

  const handleCreateWallet = async () => {
    setLoading(true);
    setWalletError(null);
    const w = await getOrCreateWallet();
    setLoading(false);
    if (!w) {
      setWalletError("Could not reach agent");
      return;
    }
    if ("error" in w) {
      setWalletError(w.error);
      if (w.code === "PROFILE_REQUIRED") setHasProfile(false);
      return;
    }
    setWallet(w);
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveAddress = async () => {
    setAddrSaving(true);
    const ok = await setWithdrawalAddress(withdrawalAddr.trim());
    setAddrSaving(false);
    if (ok) {
      setAddrSaved(true);
      setTimeout(() => setAddrSaved(false), 2500);
      load();
    }
  };

  const handleWithdraw = async () => {
    setWithdrawing(true);
    setWithdrawMsg(null);
    const micro = String(Math.floor(Number(withdrawalAmount) * 1_000_000));
    const result = await requestWithdrawal(micro);
    setWithdrawing(false);
    if ("error" in result) {
      setWithdrawMsg(result.error);
    } else {
      setWithdrawMsg("Withdrawal requested — processed automatically after a short delay.");
      setWithdrawalAmount("");
      load();
    }
  };

  const netUsdc = balance ? microToUsdc(balance.netUsdc) : "—";
  const estValue = balance ? microToUsdc(balance.estimatedValueUsdc) : "—";
  const sharePct = balance ? (balance.sharePct * 100).toFixed(2) : "—";
  const needsProfileGate = fossapayRequired && !hasProfile && !wallet?.depositAddress;

  const setField = (key: keyof AccountProfile) => (value: string) =>
    setProfileForm((p) => ({ ...p, [key]: value }));

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        {[
          { label: "Your deposit", value: `$${netUsdc}`, hint: "confirmed USDC" },
          { label: "Pool share", value: `${sharePct}%`, hint: "of total pool" },
          { label: "Est. value", value: `$${estValue}`, hint: "incl. yield" },
        ].map((s) => (
          <Card key={s.label} className="border border-transparent bg-content1 dark:border-default-100">
            <CardBody className="gap-1 p-4">
              <p className="text-tiny text-default-400">{s.label}</p>
              <p className="font-display text-2xl font-semibold tabular-nums text-foreground">{s.value}</p>
              <p className="text-tiny text-default-400">{s.hint}</p>
            </CardBody>
          </Card>
        ))}
      </dl>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="border border-transparent bg-content1 dark:border-default-100">
          <CardBody className="gap-4 p-4">
            <div className="flex items-center gap-2.5">
              <div className="flex rounded-medium border border-default-100 bg-default-50 p-1.5">
                <Icon className="text-default-500" icon="solar:wallet-money-linear" width={16} />
              </div>
              <h2 className="font-display text-medium font-semibold text-foreground">Fund your account</h2>
            </div>

            {loading ? (
              <div className="flex justify-center py-6"><Spinner size="sm" /></div>
            ) : wallet?.depositAddress ? (
              <div className="flex flex-col gap-3">
                <p className="text-small text-default-500">
                  Send <span className="font-medium text-foreground">USDC on Solana</span> to your deposit address below. Funds are credited automatically.
                </p>
                <div className="flex items-center gap-2 rounded-medium border border-default-200 bg-content2 px-3 py-2.5">
                  <code className="min-w-0 flex-1 truncate font-mono text-tiny text-foreground">
                    {wallet.depositAddress}
                  </code>
                  <Tooltip content={copied ? "Copied!" : "Copy address"}>
                    <Button
                      isIconOnly
                      size="sm"
                      variant="flat"
                      onPress={() => handleCopy(wallet.depositAddress!)}
                    >
                      <Icon icon={copied ? "solar:check-circle-linear" : "solar:copy-linear"} width={16} />
                    </Button>
                  </Tooltip>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Chip color="warning" radius="sm" size="sm" variant="flat">
                    Solana mainnet · USDC only
                  </Chip>
                  {wallet.provider === "fossapay" && (
                    <Chip color="primary" radius="sm" size="sm" variant="flat">
                      FossaPay custody
                    </Chip>
                  )}
                </div>
              </div>
            ) : needsProfileGate ? (
              <div className="flex flex-col gap-3">
                <p className="text-small text-default-500">
                  Complete your profile once to open a FossaPay Solana deposit wallet.
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Input label="First name" size="sm" value={profileForm.firstName} onValueChange={setField("firstName")} />
                  <Input label="Last name" size="sm" value={profileForm.lastName} onValueChange={setField("lastName")} />
                  <Input label="Email" size="sm" type="email" value={profileForm.email} onValueChange={setField("email")} />
                  <Input label="Mobile" placeholder="+234…" size="sm" value={profileForm.mobileNumber} onValueChange={setField("mobileNumber")} />
                  <Input label="Date of birth" placeholder="YYYY-MM-DD" size="sm" value={profileForm.dob} onValueChange={setField("dob")} />
                  <Input label="Country" size="sm" value={profileForm.country} onValueChange={setField("country")} />
                  <Input className="sm:col-span-2" label="Address" size="sm" value={profileForm.address} onValueChange={setField("address")} />
                  <Input className="sm:col-span-2" label="City" size="sm" value={profileForm.city} onValueChange={setField("city")} />
                </div>
                {profileError && <p className="text-tiny text-danger">{profileError}</p>}
                <Button
                  className="self-start"
                  color="primary"
                  isLoading={profileSaving}
                  radius="full"
                  size="sm"
                  onPress={handleSaveProfile}
                >
                  Save profile
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-small text-default-500">
                  {fossapayRequired
                    ? "Step 1 of your first agent run: create a FossaPay Solana deposit address, then send USDC."
                    : "Step 1 of your first agent run: generate your deposit address, then send USDC."}
                </p>
                {walletError && <p className="text-tiny text-danger">{walletError}</p>}
                <Button
                  className="self-start"
                  color="primary"
                  radius="full"
                  size="sm"
                  onPress={handleCreateWallet}
                >
                  Generate deposit address
                </Button>
              </div>
            )}
          </CardBody>
        </Card>

        <Card className="border border-transparent bg-content1 dark:border-default-100">
          <CardBody className="gap-4 p-4">
            <div className="flex items-center gap-2.5">
              <div className="flex rounded-medium border border-default-100 bg-default-50 p-1.5">
                <Icon className="text-default-500" icon="solar:card-send-linear" width={16} />
              </div>
              <h2 className="font-display text-medium font-semibold text-foreground">Request withdrawal</h2>
            </div>

            <div className="flex flex-col gap-3">
              <Input
                description="Your Solana wallet to receive USDC"
                label="Withdrawal address"
                placeholder="Solana wallet address"
                size="sm"
                value={withdrawalAddr}
                onValueChange={setWithdrawalAddr}
              />
              <Button
                className="self-start"
                color={addrSaved ? "success" : "default"}
                isDisabled={!withdrawalAddr.trim() || addrSaving}
                isLoading={addrSaving}
                radius="full"
                size="sm"
                variant="flat"
                onPress={handleSaveAddress}
              >
                {addrSaved ? "Saved!" : "Save address"}
              </Button>

              <Input
                description={`Available: $${netUsdc} USDC`}
                label="Amount (USDC)"
                min="0"
                placeholder="0.00"
                size="sm"
                type="number"
                value={withdrawalAmount}
                onValueChange={setWithdrawalAmount}
              />
              <Button
                className="self-start"
                color="primary"
                isDisabled={!withdrawalAmount || Number(withdrawalAmount) <= 0 || !wallet?.withdrawalAddress}
                isLoading={withdrawing}
                radius="full"
                size="sm"
                onPress={handleWithdraw}
              >
                Request withdrawal
              </Button>
              {withdrawMsg && <p className="text-tiny text-default-500">{withdrawMsg}</p>}
              <p className="text-tiny text-default-400">
                Withdrawals are processed automatically on-chain after a short delay.
              </p>
            </div>
          </CardBody>
        </Card>
      </div>

      <Card className="border border-transparent bg-content1 dark:border-default-100">
        <CardBody className="gap-3 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex rounded-medium border border-default-100 bg-default-50 p-1.5">
                <Icon className="text-default-500" icon="solar:history-linear" width={16} />
              </div>
              <h2 className="font-display text-medium font-semibold text-foreground">Transaction history</h2>
            </div>
            <Button isIconOnly radius="full" size="sm" variant="flat" onPress={load}>
              <Icon icon="solar:refresh-linear" width={16} />
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-4"><Spinner size="sm" /></div>
          ) : transactions.length === 0 ? (
            <div className="flex flex-col items-center rounded-medium border border-dashed border-default-200 py-6 text-center">
              <Icon className="mb-2 text-default-300" icon="solar:history-linear" width={24} />
              <p className="text-small text-default-500">No transactions yet</p>
              <p className="text-tiny text-default-400">Deposits will appear here after confirmation.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between rounded-medium border border-default-200 bg-content2 px-3 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Icon
                      className={
                        tx.type === "deposit"
                          ? "text-success"
                          : tx.status === "rejected"
                            ? "text-danger"
                            : "text-default-400"
                      }
                      icon={
                        tx.type === "deposit"
                          ? "solar:arrow-right-down-linear"
                          : "solar:arrow-right-up-linear"
                      }
                      width={16}
                    />
                    <div className="min-w-0">
                      <p className="text-small font-medium capitalize text-foreground">
                        {tx.type === "deposit"
                          ? "Deposit"
                          : tx.type === "withdrawal_request"
                            ? "Withdrawal request"
                            : "Withdrawal"}
                      </p>
                      <p className="truncate text-tiny text-default-400">
                        {new Date(tx.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <p className="font-display text-small font-semibold tabular-nums text-foreground">
                      {tx.type === "deposit" ? "+" : "−"}${microToUsdc(tx.amountUsdc)}
                    </p>
                    <Chip
                      color={
                        tx.status === "confirmed" || tx.status === "completed"
                          ? "success"
                          : tx.status === "rejected" || tx.status === "failed"
                            ? "danger"
                            : "warning"
                      }
                      radius="sm"
                      size="sm"
                      variant="flat"
                    >
                      {tx.status}
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
