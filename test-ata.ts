import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";

async function run() {
    const usdcMint = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    const depositPubkey = new PublicKey("sPocJ5CPxVCPivdEjTxGXbFDrNwLGHve3mnG9rbvyNn");
    const ata = await getAssociatedTokenAddress(usdcMint, depositPubkey);
    console.log("ATA is:", ata.toBase58());
}
run().catch(console.error);
