import { Connection, PublicKey, Keypair, Transaction } from "@solana/web3.js";
import { getAssociatedTokenAddress, createTransferInstruction, getAccount, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import bs58 from "bs58";

const rpc = "https://api.mainnet-beta.solana.com";
const connection = new Connection(rpc, "confirmed");

async function test() {
    const depositAddress = "sPocJ5CPxVCPivdEjTxGXbFDrNwLGHve3mnG9rbvyNn";
    const usdcMint = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    const poolKeypair = Keypair.fromSecretKey(bs58.decode("4XMrdKXKdRcYjVowwVLqvmotaW6N2BMHT26YEfDpGsvQrgX8MuiwKFYyGS5srKmUERVfWRgNCysdzbBkuebVYMsw"));
    
    console.log("Pool wallet:", poolKeypair.publicKey.toBase58());
    
    const depositPubkey = new PublicKey(depositAddress);
    const depositTokenAccount = await getAssociatedTokenAddress(usdcMint, depositPubkey);
    
    const sigs = await connection.getSignaturesForAddress(depositTokenAccount, { limit: 5 });
    console.log("Sigs:", sigs.map(s => s.signature));
    
    for (const sigInfo of sigs) {
        if (sigInfo.err) continue;
        const sig = sigInfo.signature;
        const txDetail = await connection.getTransaction(sig, { maxSupportedTransactionVersion: 0 });
        if (!txDetail) continue;

        const preBalances = txDetail.meta?.preTokenBalances ?? [];
        const postBalances = txDetail.meta?.postTokenBalances ?? [];
        const pre = preBalances.find(b => b.mint === usdcMint.toBase58() && b.owner === depositAddress);
        const post = postBalances.find(b => b.mint === usdcMint.toBase58() && b.owner === depositAddress);
        if (!post) continue;

        const preAmt = BigInt(pre?.uiTokenAmount?.amount ?? "0");
        const postAmt = BigInt(post.uiTokenAmount?.amount ?? "0");
        const inflow = postAmt - preAmt;
        if (inflow <= 0n) continue;
        
        console.log("Found inflow:", inflow.toString());
        
        // Let's dry run the transaction
        const poolTokenAccount = await getAssociatedTokenAddress(usdcMint, poolKeypair.publicKey);
        const sweepTx = new Transaction().add(
            createTransferInstruction(depositTokenAccount, poolTokenAccount, depositPubkey, inflow, [], TOKEN_PROGRAM_ID)
        );
        sweepTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        sweepTx.feePayer = poolKeypair.publicKey;
        
        console.log("Transaction created successfully.");
    }
}
test().catch(console.error);
