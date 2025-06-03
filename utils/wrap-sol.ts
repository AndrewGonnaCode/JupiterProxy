import {
    NATIVE_MINT,
    createAssociatedTokenAccountInstruction,
    getAssociatedTokenAddress,
    createSyncNativeInstruction,
    createTransferInstruction,
    createCloseAccountInstruction,
    getAccount,
} from "@solana/spl-token";
import {
    Connection,
    Keypair,
    LAMPORTS_PER_SOL,
    SystemProgram,
    Transaction,
    sendAndConfirmTransaction,
    PublicKey,
} from "@solana/web3.js";


export async function wrapSol(connection: Connection, wallet: Keypair): Promise<PublicKey> {
    const associatedTokenAccount = await getAssociatedTokenAddress(
        NATIVE_MINT,
        wallet.publicKey
    );

    const wrapTransaction = new Transaction().add(
        createAssociatedTokenAccountInstruction(
            wallet.publicKey,
            associatedTokenAccount,
            wallet.publicKey,
            NATIVE_MINT
        ),
        SystemProgram.transfer({
            fromPubkey: wallet.publicKey,
            toPubkey: associatedTokenAccount,
            lamports: LAMPORTS_PER_SOL * 10,
        }),
        createSyncNativeInstruction(associatedTokenAccount)
    );
    await sendAndConfirmTransaction(connection, wrapTransaction, [wallet]);

    console.log("✅ SOL wrapped");
    return associatedTokenAccount;
}

export async function transferWrappedSol(
    connection: Connection,
    fromWallet: Keypair,
    toWallet: PublicKey,
    fromTokenAccount: PublicKey,
    allowOwnerOffCurve:boolean = false,
): Promise<PublicKey> {
    const toTokenAccount = await getAssociatedTokenAddress(
        NATIVE_MINT,
        toWallet,
        allowOwnerOffCurve
    );

    const transferTransaction = new Transaction().add(
        createAssociatedTokenAccountInstruction(
            fromWallet.publicKey,
            toTokenAccount,
            toWallet,
            NATIVE_MINT
        ),
        createTransferInstruction(
            fromTokenAccount,
            toTokenAccount,
            fromWallet.publicKey,
            LAMPORTS_PER_SOL
        )
    );
    await sendAndConfirmTransaction(connection, transferTransaction, [fromWallet]);

    console.log("✅ - Transferred wrapped SOL");
    return toTokenAccount;
}

export async function unwrapSol(
    connection: Connection,
    wallet: Keypair,
    tokenAccount: PublicKey
): Promise<void> {
    const unwrapTransaction = new Transaction().add(
        createCloseAccountInstruction(
            tokenAccount,
            wallet.publicKey,
            wallet.publicKey
        )
    );
    await sendAndConfirmTransaction(connection, unwrapTransaction, [wallet]);
    console.log("✅ - Step 4: SOL unwrapped");
}


export async function printBalances(
    connection: Connection,
    wallet1: Keypair,
    wallet2: Keypair,
    tokenAccount2: PublicKey
): Promise<void> {
    const [wallet1Balance, wallet2Balance, tokenAccount2Info] = await Promise.all([
        connection.getBalance(wallet1.publicKey),
        connection.getBalance(wallet2.publicKey),
        connection.getTokenAccountBalance(tokenAccount2)
    ]);

    console.log(`   - Wallet 1 SOL balance: ${wallet1Balance / LAMPORTS_PER_SOL}`);
    console.log(`   - Wallet 2 SOL balance: ${wallet2Balance / LAMPORTS_PER_SOL}`);
    console.log(`   - Wallet 2 wrapped SOL: ${Number(tokenAccount2Info.value.amount) / LAMPORTS_PER_SOL}`);
}



export async function logWsolBalance(
  connection: Connection,
  userPublicKey: PublicKey
) {
    
  const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

  try {
    const ata = await getAssociatedTokenAddress(WSOL_MINT, userPublicKey);

    const accountInfo = await getAccount(connection, ata);
    const balance = Number(accountInfo.amount) / 1e9; // WSOL uses 9 decimals like SOL

    console.log(`WSOL Balance of ${userPublicKey.toBase58()}: ${balance} WSOL`);
  } catch (err: any) {
    if (err.message.includes("Failed to find account")) {
      console.log(`User ${userPublicKey.toBase58()} has no WSOL account.`);
    } else {
      console.error("Error fetching WSOL balance:", err);
    }
  }
}
