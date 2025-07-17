use anchor_lang::{
    prelude::*,
};
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface, TransferChecked, transfer_checked};

use crate::constants::{
    FEE_AUTHORITY_SEED,
};

#[derive(Accounts)]
pub struct WithdrawFees<'info> {
    #[account(
        seeds = [FEE_AUTHORITY_SEED],
        bump
    )]
    /// CHECK: Just used for PDA signer
    pub fee_authority: UncheckedAccount<'info>,

    pub fee_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = fee_mint,
        associated_token::authority = fee_authority,
    )]
    pub fee_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub recipient_token_account: InterfaceAccount<'info, TokenAccount>,

    /// The owner or upgrade authority of the program
    #[account(signer)]
    pub signer: Signer<'info>,

    pub token_program: Interface<'info, TokenInterface>,
}

 pub fn process_withdraw(
    ctx: Context<WithdrawFees>,
    amount: u64
) -> Result<()> {
    // require_keys_eq!(ctx.accounts.owner.key(), OWNER_PUBKEY);
    // Check that caller has COLLECTOR role

    let signer_seeds: &[&[&[u8]]] = &[&[
        FEE_AUTHORITY_SEED,
        &[ctx.bumps.fee_authority],
    ]];

    let cpi_accounts = TransferChecked {
        mint: ctx.accounts.fee_mint.to_account_info(),
        from: ctx.accounts.fee_vault.to_account_info(),
        to: ctx.accounts.recipient_token_account.to_account_info(),
        authority: ctx.accounts.fee_authority.to_account_info(),
    };

    let cpi_context = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
        signer_seeds
    );

    transfer_checked(cpi_context, amount, ctx.accounts.fee_mint.decimals)?;

    Ok(())
}

