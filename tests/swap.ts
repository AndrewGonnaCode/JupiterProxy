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
  AddressLookupTableAccount,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createApproveInstruction,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  getAccount
} from "@solana/spl-token";
import { requestAirdrop } from "../utils/request-airdrop";
import { myswap } from "../target/types/myswap";
import { readSwapCache } from "../utils/hooks/swap-cache";
import { transferWrappedSol, wrapSol } from "../utils/wrap-sol";
import { getAssociatedTokenAccounts } from "../utils/getAssociatedTokenAccounts";
import { getAddressesLookupAccounts, getAddressLookupTableAccounts, getAddressLookupTableAccountsV2 } from "../utils/getAddressLookUpAccounts";
import { get } from "http";


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

const deserializeInstruction = (instruction) => {
  return new TransactionInstruction({
    programId: new PublicKey(instruction.programId),
    keys: instruction.accounts.map((key) => ({
      pubkey: new PublicKey(key.pubkey),
      isSigner: key.isSigner,
      isWritable: key.isWritable,
    })),
    data: Buffer.from(instruction.data, "base64"),
  });
}

describe.only("Jupiter Swap Tests", () => {
  // Constants for the test
  const INPUT_MINT = new PublicKey(WSOL_ADDRESS);
  const OUTPUT_MINT = new PublicKey(USDC_ADDRESS);

  let program: anchor.Program<myswap>;
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
    
    program = anchor.workspace.myswap as anchor.Program<myswap>;
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

    // Create fee_authority PDA
    const [fee_authority] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("fee-authority"),
      ],
      CPI_SWAP_PROGRAM_ID
    );

    await transferWrappedSol(connection, payer, vault, payerWrappedSolAccount, true);

    const { vaultInputTokenAccount, vaultOutputTokenAccount } = 
      getAssociatedTokenAccounts(vault, INPUT_MINT, OUTPUT_MINT);

    // Create  user's token account
    const userOutputTokenAccount = await getAssociatedTokenAddress(
      OUTPUT_MINT,
      user.publicKey,
      false
    );

    const feeRecipientOutputTokenAccount = await getAssociatedTokenAddress(
      OUTPUT_MINT,
      fee_authority,
      true
    )

    // const createFeeRecipientOutputTokenAccountIx = createAssociatedTokenAccountInstruction(
    //   payer.publicKey,
    //   feeRecipientOutputTokenAccount,
    //   fee_authority,
    //   OUTPUT_MINT
    // );

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
    //  // Build approve instruction
     const approveIx = createApproveInstruction(
       userWrappedSolAccount, // source account
       vault,              // delegate PDA
       user.publicKey,        // user is the authority
       BigInt(cachedQuote.inAmount)     // approved amount
     );
     const lookupTablesAccounts = await getAddressesLookupAccounts(mainnetConnection, cachedSwapData.addressLookupTableAddresses);
    //  const lookupTablesAccounts = await getAddressLookupTableAccountsV2(mainnetConnection, cachedSwapData.addressLookupTableAddresses))(mainnetConnection, cachedSwapData.addressLookupTableAddresses);

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
        signer:payer.publicKey,
        feeRecipientTokenAccount: feeRecipientOutputTokenAccount,
        feeAuthority: fee_authority,
        systemProgram: anchor.web3.SystemProgram.programId,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
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

      console.log("lookupTablesAccounts", lookupTablesAccounts);

      // Build versioned transaction
      const messageV0 = new TransactionMessage({
        payerKey: payer.publicKey,
        recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
        instructions: [computeIx, swapIx], 
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
      const vaultOutputBalance = await connection.getTokenAccountBalance(vaultOutputTokenAccount);
      const recipientBalance = await connection.getTokenAccountBalance(userOutputTokenAccount);
      const feeRecipientBalance = await connection.getTokenAccountBalance(feeRecipientOutputTokenAccount);

      console.log("\nBalances after swap:", {
        vaultInputBalance: vaultInputBalance.value.uiAmount,
        vaultOutputBalance: vaultOutputBalance.value.uiAmount,
        recipientBalance: recipientBalance.value.uiAmount,
        feeRecipientBalance: feeRecipientBalance.value.uiAmount,
      });


      const recipientTokenAccount = await getAssociatedTokenAddress(
        OUTPUT_MINT,
        payer.publicKey,
        false
      );

      const createRecipientToeknAccountIx = createAssociatedTokenAccountInstruction(
        payer.publicKey,
        recipientTokenAccount,
        payer.publicKey,
        OUTPUT_MINT
      )


      const withdrawIx = await program.methods.withdrawFees(
        new anchor.BN(feeRecipientBalance.value.amount), // Withdraw the fee amount
      )
      .accounts({
        feeAuthority: fee_authority,
        feeMint: OUTPUT_MINT,
        feeVault: feeRecipientOutputTokenAccount,
        recipientTokenAccount,
        signer: payer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();


      const withdrawTx = new Transaction().add(createRecipientToeknAccountIx, withdrawIx);
      const withdrawSig = await sendAndConfirmTransaction(connection, withdrawTx, [payer]);

      const feeRecipientBalanceAfter = await connection.getTokenAccountBalance(feeRecipientOutputTokenAccount);
      const recipientBalanceAfter = await connection.getTokenAccountBalance(recipientTokenAccount);

      console.log("✅ Withdraw transaction successful:", withdrawSig);

      console.log("Balances after withdrawal:", {
        feeRecipientBalance: feeRecipientBalanceAfter.value.uiAmount,
        recipientBalance: recipientBalanceAfter.value.uiAmount,
      });

    } catch (error) {
      console.error("Swap transaction failed:", error);
      throw error;
    }
  });
});
