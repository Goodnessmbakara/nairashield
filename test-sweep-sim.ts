import { Connection, PublicKey, Keypair, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { getAssociatedTokenAddress, createTransferInstruction, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import bs58 from "bs58";

const rpc = "https://api.mainnet-beta.solana.com";
const connection = new Connection(rpc, "confirmed");

async function test() {
    const depositAddress = "sPocJ5CPxVCPivdEjTxGXbFDrNwLGHve3mnG9rbvyNn";
    const usdcMint = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    const poolKeypair = Keypair.fromSecretKey(bs58.decode("4XMrdKXKdRcYjVowwVLqvmotaW6N2BMHT26YEfDpGsvQrgX8MuiwKFYyGS5srKmUERVfWRgNCysdzbBkuebVYMsw"));
    
    // We don't have the real depositKeypair, so simulation might fail signature verification if we don't have it.
    // BUT we can use connection.simulateTransaction with just the fee payer to see if the instruction itself fails!
    
    const depositPubkey = new PublicKey(depositAddress);
    const depositTokenAccount = await getAssociatedTokenAddress(usdcMint, depositPubkey);
    const poolTokenAccount = await getAssociatedTokenAddress(usdcMint, poolKeypair.publicKey);
    
    const sweepTx = new Transaction().add(
        createTransferInstruction(depositTokenAccount, poolTokenAccount, depositPubkey, 2000000n, [], TOKEN_PROGRAM_ID)
    );
    sweepTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    sweepTx.feePayer = poolKeypair.publicKey;
    
    const sim = await connection.simulateTransaction(sweepTx);
    console.log("Simulation Result:", sim.value);
}
test().catch(console.error);
