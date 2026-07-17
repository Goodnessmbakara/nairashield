import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { KaminoAction, KaminoMarket, VanillaObligation, PROGRAM_ID } from "@kamino-finance/klend-sdk";
import BN from "bn.js";

async function test() {
  const connection = new Connection("http://localhost");
  const market = await KaminoMarket.load(connection as any, new PublicKey("11111111111111111111111111111111"), 400);
  if (!market) return;
  const signer = {} as any;
  const reserve = market.getReserveByMint(new PublicKey("11111111111111111111111111111111"));
  if (!reserve) return;

  const depositAction = await KaminoAction.buildDepositTxns({
    kaminoMarket: market,
    amount: new BN(100),
    reserveAddress: reserve.address,
    owner: signer,
    obligation: new VanillaObligation(PROGRAM_ID),
    useV2Ixs: false,
    scopeRefreshConfig: undefined,
    currentSlot: 0,
  });

  const withdrawAction = await KaminoAction.buildWithdrawTxns({
    kaminoMarket: market,
    amount: new BN(100),
    reserveAddress: reserve.address,
    owner: signer,
    obligation: new VanillaObligation(PROGRAM_ID),
    useV2Ixs: false,
    scopeRefreshConfig: undefined,
    currentSlot: 0,
  });
}
