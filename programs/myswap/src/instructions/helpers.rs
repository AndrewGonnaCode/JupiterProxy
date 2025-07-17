use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};
use anchor_lang::AccountDeserialize;

pub fn transfer_tokens_with_signer<'info>(
    from: &InterfaceAccount<'info, TokenAccount>,
    to: &InterfaceAccount<'info, TokenAccount>,
    amount: &u64,
    mint: &InterfaceAccount<'info, Mint>,
    authority: &SystemAccount<'info>,
    token_program: &Interface<'info, TokenInterface>,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let transfer_accounts_options = TransferChecked {
        from: from.to_account_info(),
        mint: mint.to_account_info(),
        to: to.to_account_info(),
        authority: authority.to_account_info(),
    };

    let cpi_context = CpiContext::new_with_signer(token_program.to_account_info(), transfer_accounts_options, signer_seeds);

    transfer_checked(cpi_context, *amount, mint.decimals)
}

pub fn get_token_balance(account_info: &AccountInfo) -> Result<u64> {
        let account_data = &mut &account_info.data.borrow()[..];
        let token_account = TokenAccount::try_deserialize(account_data)?;
        msg!("Get token balance");
        Ok(token_account.amount)
}