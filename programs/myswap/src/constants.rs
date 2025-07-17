use anchor_lang::prelude::*;

#[constant]
pub const VAULT_SEED: &[u8] = b"vault";
pub const FEE_DENOMINATOR: u64 = 10000;
pub const FEE:u64 = 100; // 1% fee in basis points
pub const EXECUTOR_LIST_SEED: &[u8] = b"executor_list";
pub const CONFIG_SEED: &[u8] = b"config";
pub const FEE_AUTHORITY_SEED: &[u8] = b"fee-authority";