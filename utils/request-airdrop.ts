import {
    Connection,
    LAMPORTS_PER_SOL,
    PublicKey,
} from "@solana/web3.js";

export async function requestAirdrop(connection: Connection, publicKey: PublicKey): Promise<void> {
    const airdropSignature = await connection.requestAirdrop(
        publicKey,
        100 * LAMPORTS_PER_SOL
    );

    await connection.confirmTransaction(airdropSignature);
   
  console.log("✅  Airdrop completed");
}