import * as anchor from "@coral-xyz/anchor";
import { readFileSync } from 'fs';
import {
  PublicKey,
  Keypair,
  Connection,
  TransactionMessage,
  VersionedTransaction,
  Transaction,
  sendAndConfirmTransaction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createApproveInstruction,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  getAccount
} from "@solana/spl-token";
import { requestAirdrop } from "../utils/request-airdrop";
import { Wallex } from "../target/types/wallex";
import { readSwapCache } from "../utils/hooks/swap-cache";
import { transferWrappedSol, wrapSol } from "../utils/wrap-sol";
import { getAssociatedTokenAccounts } from "../utils/getAssociatedTokenAccounts";
import { getAddressesLookupAccounts, getAddressLookupTableAccounts } from "../utils/getAddressLookUpAccounts";


// Add to the cache interface
export const USDC_ADDRESS = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const USDT_ADDRESS = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
export const WSOL_ADDRESS = "So11111111111111111111111111111111111111112";

const CPI_SWAP_PROGRAM_ID = new PublicKey(
  "DvNur6pprGPLZHobyxoLxAoKvj8E1YjR83m94HperYwz"
);
const JUPITER_V6_AGG_PROGRAM_ID = new PublicKey(
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"
);

describe("Jupiter Swap Tests", () => {
  // Constants for the test
  const INPUT_MINT = new PublicKey(WSOL_ADDRESS);
  const OUTPUT_MINT = new PublicKey(USDC_ADDRESS);

  let program: anchor.Program<Wallex>;
  let payer: Keypair;
  let user: Keypair;
  let connection: Connection;
  let mainnetConnection:Connection;
  let cachedQuote: any;
  let cachedSwapData: any;
  let cachedDataLocal: any;

  const deadline = new anchor.BN(1779964906);
  const minAmountOut = new anchor.BN(0);

  before(async () => {
    console.log('Starting test setup...');
    
    program = anchor.workspace.wallex as anchor.Program<Wallex>;
    connection = new Connection("http://127.0.0.1:8899", "confirmed");
    mainnetConnection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    
    payer = new Keypair();
    // user = new Keypair();
    const walletData = JSON.parse(readFileSync('./test-wallet.json', 'utf-8'));
    user = Keypair.fromSecretKey(new Uint8Array(walletData));
    console.log("Created payer:", payer.publicKey.toBase58());
    console.log("Created user:", user.publicKey.toBase58());

    await requestAirdrop(connection, payer.publicKey);
    await requestAirdrop(connection, user.publicKey);

    // const [vault] = anchor.web3.PublicKey.findProgramAddressSync(
    //   [Buffer.from("vault")],
    //   CPI_SWAP_PROGRAM_ID
    // );
    // // Clone necessary accounts and get cached swap data
    // const { quote, swapData } = await cloneNecessaryAccounts(vault.toBase58());
    
    // cachedQuote = quote;
    // cachedSwapData = swapData;


    cachedDataLocal = readSwapCache();

    if (!cachedDataLocal) {
      throw new Error("No cached swap data found. Please run 'yarn test:with-cloned-accounts' first to generate cache.");
    }

    cachedQuote = cachedDataLocal.quote;
    cachedSwapData = cachedDataLocal.swapData;

    console.log("Using cached swap data from .cache folder");
  });

  it.only("should execute a swap from WSOL to USDC", async () => {
    console.log("Starting Jupiter Swap test...");

    // console.log("Using cached quote:", {
    //   inputAmount: cachedQuote.inAmount,
    //   outputAmount: cachedQuote.outAmount,
    //   priceImpact: cachedQuote.priceImpactPct,
    //   routePlan: cachedQuote.routePlan.map(plan => ({
    //     swapInfo: plan.swapInfo.label,
    //     percent: plan.percent
    //   })),
    //   swapData: cachedSwapData
    // });

    const payerWrappedSolAccount = await wrapSol(connection, payer);
    const userWrappedSolAccount = await wrapSol(connection, user);

    // Create and fund vault
    const [vault] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("vault"),
        INPUT_MINT.toBuffer(),
        OUTPUT_MINT.toBuffer(),
        user.publicKey.toBuffer(),
        new anchor.BN(cachedQuote.inAmount).toArrayLike(Buffer, "le", 8),
        minAmountOut.toArrayLike(Buffer, "le", 8),
        deadline.toArrayLike(Buffer, "le", 8)
      ],
      CPI_SWAP_PROGRAM_ID
    );

    console.log('Vault in swap address', vault.toBase58());

    await transferWrappedSol(connection, payer, vault, payerWrappedSolAccount, true);

    // Create token accounts
    console.log("Creating token accounts...");

    const { vaultInputTokenAccount, vaultOutputTokenAccount } = 
      getAssociatedTokenAccounts(vault, INPUT_MINT, OUTPUT_MINT);

    // Create  user's token account
    const userOutputTokenAccount = await getAssociatedTokenAddress(
      OUTPUT_MINT,
      user.publicKey,
      false
    );

    // Create output token accounts if needed
    const createOutputAtaIx = createAssociatedTokenAccountInstruction(
      user.publicKey,
      vaultOutputTokenAccount,
      vault,
      OUTPUT_MINT
    );

    const createRecipientAtaIx = createAssociatedTokenAccountInstruction(
      user.publicKey,
      userOutputTokenAccount,
      user.publicKey,
      OUTPUT_MINT
    );

    // // // Verify accounts before swap
    // console.log("\nVerifying accounts before swap...");
    // if(cachedSwapData.swapInstruction.accounts.length > 0) {
    //   for (const acc of cachedSwapData.swapInstruction.accounts) {
    //     const accountInfo = await connection.getAccountInfo(new PublicKey(acc.pubkey));
    //     console.log(`Account ${acc.pubkey}:`, {
    //       exists: accountInfo !== null,
    //       owner: accountInfo?.owner,
    //       executable: accountInfo?.executable,
    //       isSigner: acc.isSigner,
    //       isWritable: acc.isWritable
    //     });
    //   }
    // }

    //  // Build approve instruction
     const approveIx = createApproveInstruction(
       userWrappedSolAccount, // source account
       vault,              // delegate PDA
       user.publicKey,        // user is the authority
       BigInt(cachedQuote.inAmount)     // approved amount
     );

     const lookupTablesAccounts = await getAddressesLookupAccounts(mainnetConnection, cachedSwapData.addressLookupTableAddresses);
    //  const lookupTablesAccounts = await getAddressLookupTableAccounts(mainnetConnection, cachedSwapData.addressLookupTableAddresses);

     console.log('lookupTablesAccounts', lookupTablesAccounts);

     // Submit transaction
     const tx = new Transaction().add(approveIx, createOutputAtaIx, createRecipientAtaIx);
     const sig = await sendAndConfirmTransaction(connection, tx, [user]);
     
     console.log("✅ Approved vault PDA as delegate:", sig);

    // Execute swap using cached swap data
    console.log("\nExecuting swap...");
    try {
      if (!cachedDataLocal?.lookupTables) {
        throw new Error("No lookup tables found in cache");
      }

      const swapIx = await program.methods.swap(
        new anchor.BN(cachedQuote.inAmount),
        minAmountOut,
        deadline,
        typeof cachedSwapData.swapInstruction.data === 'string' 
          ? Buffer.from(cachedSwapData.swapInstruction.data, 'base64')
          : Buffer.from(cachedSwapData.swapInstruction.data)
      )
      .accounts({
        inputMint: INPUT_MINT,
        inputMintProgram: TOKEN_PROGRAM_ID,
        outputMint: OUTPUT_MINT,
        outputMintProgram: TOKEN_PROGRAM_ID,
        user: user.publicKey,
        vault: vault,
        vaultInputTokenAccount: vaultInputTokenAccount,
        vaultOutputTokenAccount: vaultOutputTokenAccount,
        userInputTokenAccount: userWrappedSolAccount,
        recipientTokenAccount: userOutputTokenAccount,
        jupiterProgram: JUPITER_V6_AGG_PROGRAM_ID
      })
      .remainingAccounts(
        cachedSwapData.swapInstruction.accounts.map((acc: any) => ({
          pubkey: new PublicKey(acc.pubkey),
          isSigner: false,
          isWritable: Boolean(acc.isWritable)
        }))
      )
      .instruction();

      // Request a higher CU limit (e.g. 400,000)
      const computeIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 });


      // Build versioned transaction
      const messageV0 = new TransactionMessage({
        payerKey: payer.publicKey,
        recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
        instructions: [computeIx, swapIx], 
        // addressTableLookups: cachedDataLocal.lookupTables
      }).compileToV0Message(lookupTablesAccounts);


      const transaction = new VersionedTransaction(messageV0);
      
      console.log('Before sending tx', transaction)
      // Only sign with payer - the vault PDA will be signed by the program
      transaction.sign([payer]);

      console.log('After signing tx')


      const response = await connection.sendTransaction(transaction);

      console.log("Before confirm tx")
      await connection.confirmTransaction(response);
      console.log("Swap transaction successful:", response);

       const txDetails = await program.provider.connection.getTransaction(response, {
           maxSupportedTransactionVersion: 0,
           commitment: "confirmed",
        });

        const logs = txDetails?.meta?.logMessages || null;
        if (!logs) {
          console.log("No logs found");
        } else {
          console.log("Logs:", logs);
        }


      // Verify balances after swap
      const vaultInputBalance = await connection.getTokenAccountBalance(vaultInputTokenAccount);
      // const vaultOutputBalance = await connection.getTokenAccountBalance(vaultOutputTokenAccount);
      // const recipientBalance = await connection.getTokenAccountBalance(userOutputTokenAccount);

      console.log("\nBalances after swap:", {
        vaultInputBalance: vaultInputBalance.value.uiAmount,
        // vaultOutputBalance: vaultOutputBalance.value.uiAmount,
        // recipientBalance: recipientBalance.value.uiAmount,
      });

    } catch (error) {
      console.error("Swap transaction failed:", error);
      throw error;
    }
  });
});
