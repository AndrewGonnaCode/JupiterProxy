use anchor_lang::{
    prelude::*,
    solana_program::{instruction::Instruction, program::invoke_signed},
};
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface, TransferChecked, transfer_checked};
use anchor_spl::associated_token::AssociatedToken;
use jupiter_aggregator::program::Jupiter;
use std::{str::FromStr};

declare_program!(jupiter_aggregator);

use crate::error::WallexSwapError;
use crate::constants::{
    VAULT_SEED,
    FEE_DENOMINATOR,
    FEE,
    FEE_AUTHORITY_SEED,
};
use crate::helpers::{transfer_tokens_with_signer, get_token_balance};

pub fn jupiter_program_id() -> Pubkey {
    Pubkey::from_str("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4").unwrap()
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

    /// CHECK: This is a signer account, we just need the public key
    #[account(mut, signer)]
    pub signer: AccountInfo<'info>,

    #[account(
        init_if_needed,
        payer = signer,
        associated_token::mint = output_mint,
        associated_token::authority = fee_authority,
        associated_token::token_program = output_mint_program
    )]
    pub fee_recipient_token_account: InterfaceAccount<'info, TokenAccount>,

    // #[account(
    //     mut,
    //     associated_token::mint = output_mint,
    //     associated_token::authority = fee_authority,
    //     associated_token::token_program = output_mint_program
    // )]
    // pub fee_recipient_token_account: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: PDA derived by program
    #[account(
        seeds = [FEE_AUTHORITY_SEED],
        bump
    )]
    pub fee_authority: UncheckedAccount<'info>,
    // required for auto-init
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,

    pub jupiter_program: Program<'info, Jupiter>,  
}


pub fn process_swap(ctx: Context<Swap>, amount_in: u64, min_amount_out: u64, deadline: i64, data: Vec<u8>) -> Result<()> {
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

        msg!("DAMN");

        msg!("Hello: {}", token_out_balance_after);

        let token_out_got = token_out_balance_after - token_out_balance_before;
        
        msg!("Token out got: {}", token_out_got);

        let fee = (token_out_got * FEE) / FEE_DENOMINATOR;

        let user_amount = token_out_got - fee;


        require!(user_amount >= min_amount_out, WallexSwapError::InsufficientOutputAmount);
        
        // Step - 3 transfer output token to recipient from vault
        transfer_tokens_with_signer(
            &ctx.accounts.vault_output_token_account,
            &ctx.accounts.recipient_token_account,
            &user_amount,
            &ctx.accounts.output_mint,
            &ctx.accounts.vault,
            &ctx.accounts.output_mint_program,
            signer_seeds,
        )?;

        // Step 4 - transfer fee to fee recipient

        transfer_tokens_with_signer(
            &ctx.accounts.vault_output_token_account,
            &ctx.accounts.fee_recipient_token_account,
            &fee,
            &ctx.accounts.output_mint,
            &ctx.accounts.vault,
            &ctx.accounts.output_mint_program,
            signer_seeds,
        )?;

        Ok(())
}   
