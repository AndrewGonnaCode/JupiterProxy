use anchor_lang::{
    prelude::*,
};
use anchor_lang::AccountDeserialize;
use instructions::*;

use std::{str::FromStr};
mod error;
mod constants;
mod state;
mod instructions;

// use crate::state::{ExecutorList, Config};
use crate::error::WallexSwapError;

declare_id!("DvNur6pprGPLZHobyxoLxAoKvj8E1YjR83m94HperYwz");

const OWNER_PUBKEY: &str = "YourOneTimeInitializer111111111111111111111111111";


pub fn jupiter_program_id() -> Pubkey {
    Pubkey::from_str("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4").unwrap()
}

#[program]
pub mod wallex {
    use super::*;

    pub fn initialize_acl(ctx: Context<InitAccessControl>, owner: Pubkey) -> Result<()> {
        require_keys_eq!(ctx.accounts.payer.key(), Pubkey::from_str(OWNER_PUBKEY).unwrap(), WallexSwapError::Unauthorized);
        return process_init_access_control(ctx, owner);
    }
    pub fn set_role(ctx: Context<SetRole>, user: Pubkey, role: u8, add: bool) -> Result<()> {
        return process_set_role(ctx, user, role, add);
    }

    pub fn swap(ctx: Context<Swap>, amount_in: u64, min_amount_out: u64, deadline: i64, data: Vec<u8>) -> Result<()> {
        return process_swap(ctx, amount_in, min_amount_out, deadline, data);
    }
    
    pub fn withdraw_fees(ctx: Context<WithdrawFees>, amount: u64) -> Result<()> {
       return process_withdraw(ctx, amount);
    }
}