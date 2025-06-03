import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Wallex } from "../target/types/wallex";
import AggregatorsService from "../services/aggregator.service";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { requestAirdrop } from "../utils/request-airdrop";
import { logWsolBalance, transferWrappedSol, wrapSol } from "../utils/wrap-sol";


export const USDC_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const USDT_ADDRESS = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
export const WSOL_ADDRESS = 'So11111111111111111111111111111111111111112';

const USER_PUBLIC_KEY = '6DT9hC7ShmZ3zXpTvPUDPyLAREzmhMiXU2A11dZzpQfH';

// TRY CLONE WIHT CONFIG FILE - https://www.anchor-lang.com/docs/references/anchor-toml#test-validator

describe.skip("wallex", () => {

  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.wallex as Program<Wallex>;
  const aggregatorService = new AggregatorsService();
  const amountIn = '1000000000';

  const connection = new Connection("http://127.0.0.1:8899", "confirmed");
  const wallet1 = Keypair.generate();
  const wallet2 = Keypair.generate();

  // before(async () => {
  //   const { process } = await startForkedValidator();
  //   validatorProcess = process;
  // });
  it("Is initialized!", async () => {

    // const { process } = await startForkedValidator();
    // validatorProcess = process;

    // await requestAirdrop(connection, wallet1);

    // const wallet1Balance = await connection.getBalance(wallet1.publicKey);
    //   console.log(`Wallet 1 SOL balance: ${wallet1Balance / LAMPORTS_PER_SOL}`);
  
    //   const tokenAccount1 = await wrapSol(connection, wallet1);

    //   await logWsolBalance(connection, wallet1.publicKey);

    // Add your test here.
    // const tx = await program.methods.initialize().rpc();
    // console.log("Your transaction signature", tx);
    const quote = await aggregatorService.getQuote(WSOL_ADDRESS, USDC_ADDRESS, amountIn);
    console.log("Quote", quote);
    console.log("Quote route Plan", quote.routePlan[0].swapInfo);
    const swapData = await aggregatorService.generateSwapData(wallet1.publicKey.toBase58(), quote);
    console.log("Swap Data", swapData);
  });
  it("Wrap SOL test", async () => {
  
      await requestAirdrop(connection, wallet1.publicKey);

      const wallet1Balance = await connection.getBalance(wallet1.publicKey);
      console.log(`Wallet 1 SOL balance: ${wallet1Balance / LAMPORTS_PER_SOL}`);
  
      const tokenAccount1 = await wrapSol(connection, wallet1);

      await logWsolBalance(connection, wallet1.publicKey);

      await transferWrappedSol(connection, wallet1, wallet2.publicKey, tokenAccount1);

      await logWsolBalance(connection, wallet2.publicKey);
      
  
  });
});
