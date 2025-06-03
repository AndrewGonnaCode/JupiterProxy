import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
export function getAssociatedTokenAccounts(
    vault: PublicKey,
    inputMint: PublicKey,
    outputMint: PublicKey
  ): { vaultInputTokenAccount: PublicKey; vaultOutputTokenAccount: PublicKey } {
    const vaultInputTokenAccount = getAssociatedTokenAddressSync(
      inputMint,
      vault,
      true  // allowOwnerOffCurve = true for PDAs
    );
    
    const vaultOutputTokenAccount = getAssociatedTokenAddressSync(
      outputMint,
      vault,
      true  // allowOwnerOffCurve = true for PDAs
    );
  
    return { vaultInputTokenAccount, vaultOutputTokenAccount };
  }
  