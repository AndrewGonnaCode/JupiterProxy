use anchor_lang::{
    prelude::*,
    solana_program::{instruction::Instruction, program::invoke_signed},
};
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface, TransferChecked, transfer_checked};
use jupiter_aggregator::program::Jupiter;
use anchor_lang::AccountDeserialize;
use std::{str::FromStr};

declare_program!(jupiter_aggregator);
declare_id!("DvNur6pprGPLZHobyxoLxAoKvj8E1YjR83m94HperYwz");

const OWNER_PUBKEY: &str = "YourOneTimeInitializer111111111111111111111111111";

const VAULT_SEED: &[u8] = b"vault";
const EXECUTOR_LIST_SEED: &[u8] = b"executor_list";
const CONFIG_SEED: &[u8] = b"config";


pub fn jupiter_program_id() -> Pubkey {
    Pubkey::from_str("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4").unwrap()
}

pub fn get_token_balance(account_info: &AccountInfo) -> Result<u64> {
        let account_data = &mut &account_info.data.borrow()[..];
        let token_account = TokenAccount::try_deserialize(account_data)?;
        Ok(token_account.amount)
}

// Create SwapError enum
#[error_code]
pub enum WallexSwapError {
    #[msg("Order is expired")]
    OrderExpired,
    #[msg("Insufficient output amount")]
    InsufficientOutputAmount,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Executor already exists.")]
    AlreadyExists,
    #[msg("Executor not found.")]
    NotFound,
    #[msg("Maximum number of executors reached.")]
    ExecutorLimit,
}

#[program]
pub mod wallex {
    use super::*;

    pub fn initialize_config(ctx: Context<InitializeConfig>, admin: Pubkey) -> Result<()> {
        require_keys_eq!(ctx.accounts.payer.key(), Pubkey::from_str(OWNER_PUBKEY).unwrap(), WallexSwapError::Unauthorized);
        ctx.accounts.config.admin = admin;
        Ok(())
    }

    pub fn initialize_executors(ctx: Context<InitializeExecutors>) -> Result<()> {
        require_keys_eq!(ctx.accounts.admin.key(), ctx.accounts.config.admin, WallexSwapError::Unauthorized);
        let executors = &mut ctx.accounts.executors;
        executors.admin = ctx.accounts.admin.key();
        executors.executors = Vec::new();
        Ok(())
    }

    pub fn add_executor(ctx: Context<ModifyExecutors>, new_executor: Pubkey) -> Result<()> {
        let executors = &mut ctx.accounts.executors;
        require!(executors.executors.len() < 64, WallexSwapError::ExecutorLimit);
        require!(!executors.executors.contains(&new_executor), WallexSwapError::AlreadyExists);
        executors.executors.push(new_executor);
        Ok(())
    }

    pub fn remove_executor(ctx: Context<ModifyExecutors>, executor_to_remove: Pubkey) -> Result<()> {
        let executors = &mut ctx.accounts.executors;
        if let Some(pos) = executors.executors.iter().position(|x| *x == executor_to_remove) {
            executors.executors.swap_remove(pos);
            Ok(())
        } else {
            Err(WallexSwapError::NotFound.into())
        }
    }

    pub fn swap(ctx: Context<Swap>, amount_in: u64, min_amount_out: u64, deadline: i64, data: Vec<u8>) -> Result<()> {
        require_keys_eq!(*ctx.accounts.jupiter_program.key, jupiter_program_id());

        // Check that deadline is in the future
        require!(deadline > Clock::get()?.unix_timestamp, WallexSwapError::OrderExpired);

        let input_mint_key = ctx.accounts.input_mint.key();
        let output_mint_key = ctx.accounts.output_mint.key();
        let user_key = ctx.accounts.user.key();
        let signer_seeds: &[&[&[u8]]] = &[&[
            VAULT_SEED,
            input_mint_key.as_ref(),
            output_mint_key.as_ref(),
            user_key.as_ref(),
            &amount_in.to_le_bytes(),
            &min_amount_out.to_le_bytes(),
            &deadline.to_le_bytes(),
            &[ctx.bumps.vault
        ]]];

        // Step - 1 transfer input token to vault from user
        let cpi_accounts = TransferChecked {
            mint: ctx.accounts.input_mint.to_account_info(),
            from: ctx.accounts.user_input_token_account.to_account_info(),
            to: ctx.accounts.vault_input_token_account.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };

        let cpi_program = ctx.accounts.input_mint_program.to_account_info();

        let cpi_context = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);

        transfer_checked(cpi_context, amount_in, ctx.accounts.input_mint.decimals)?;


        let token_out_balance_before = get_token_balance(&ctx.accounts.vault_output_token_account.to_account_info())?;

        // Step - 2 call jupiter router

        let accounts: Vec<AccountMeta> = ctx
            .remaining_accounts
            .iter()
            .map(|acc| {
                let is_signer = acc.key == &ctx.accounts.vault.key();
                AccountMeta {
                    pubkey: *acc.key,
                    is_signer,
                    is_writable: acc.is_writable,
                }
            })
            .collect();

        let accounts_infos: Vec<AccountInfo> = ctx
            .remaining_accounts
            .iter()
            .map(|acc| AccountInfo { ..acc.clone() })
            .collect();

        invoke_signed(
            &Instruction {
                program_id: ctx.accounts.jupiter_program.key(),
                accounts,
                data,
            },
            &accounts_infos,
            signer_seeds,
        )?;

        msg!("Router call successful");

        let token_out_balance_after = get_token_balance(&ctx.accounts.vault_output_token_account.to_account_info())?;

        let token_out_got = token_out_balance_after - token_out_balance_before;

        msg!("Token out got: {}", token_out_got);

        require!(token_out_got >= min_amount_out, WallexSwapError::InsufficientOutputAmount);

        // Step - 3 transfer output token to recipient from vault

        let cpi_accounts = TransferChecked { 
                mint:ctx.accounts.output_mint.to_account_info(),
                from: ctx.accounts.vault_output_token_account.to_account_info(),
                to: ctx.accounts.recipient_token_account.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
        };
        let cpi_program =  ctx.accounts.output_mint_program.to_account_info();
        let cpi_context = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
        transfer_checked(cpi_context, token_out_got, ctx.accounts.output_mint.decimals)?;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(amount_in: u64, min_amount_out: u64, deadline: u64)]
pub struct Swap<'info> {
    pub input_mint: InterfaceAccount<'info, Mint>,
    pub input_mint_program: Interface<'info, TokenInterface>,
    pub output_mint: InterfaceAccount<'info, Mint>,
    pub output_mint_program: Interface<'info, TokenInterface>,

    #[account(mut)]
    pub user: SystemAccount<'info>,

    #[account(
      mut,
      seeds=[
        VAULT_SEED,
        input_mint.key().as_ref(),
        output_mint.key().as_ref(),
        user.key().as_ref(),
        &amount_in.to_le_bytes(),
        &min_amount_out.to_le_bytes(),
        &deadline.to_le_bytes(),
      ],
      bump
    )]
    pub vault: SystemAccount<'info>,

    #[account(
      mut,
      associated_token::mint=input_mint,
      associated_token::authority=vault,
      associated_token::token_program=input_mint_program,
    )]
    pub vault_input_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
      mut,
      associated_token::mint=output_mint,
      associated_token::authority=vault,
      associated_token::token_program=output_mint_program,
    )]
    pub vault_output_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint=input_mint,
        associated_token::authority=user,
        associated_token::token_program=input_mint_program,
    )]
    pub user_input_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint=output_mint,
        associated_token::authority=user,
        associated_token::token_program=output_mint_program,
    )]
    pub recipient_token_account: InterfaceAccount<'info, TokenAccount>, 

    pub jupiter_program: Program<'info, Jupiter>,
}

#[account]
pub struct Config {
    pub admin: Pubkey,
}

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(
        init,
        payer = payer,
        seeds = [CONFIG_SEED],
        bump,
        space = 8 + 32,
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeExecutors<'info> {
    #[account(
        init,
        payer = admin,
        seeds = [EXECUTOR_LIST_SEED],
        bump,
        space = 8 + 32 + 4 + 32 * 4,
    )]
    pub executors: Account<'info, ExecutorList>,

    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,

    pub system_program: Program<'info, System>,
}


#[derive(Accounts)]
pub struct ModifyExecutors<'info> {
    #[account(mut, seeds = [EXECUTOR_LIST_SEED], bump, has_one = admin)]
    pub executors: Account<'info, ExecutorList>,

    pub admin: Signer<'info>,
}

#[account]
pub struct ExecutorList {
    pub admin: Pubkey,
    pub executors: Vec<Pubkey>,
}