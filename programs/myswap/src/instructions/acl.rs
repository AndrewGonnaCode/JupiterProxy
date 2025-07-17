use anchor_lang::prelude::*;
use crate::error::myswapSwapError;

const ACCESS_CONTROL_SEED: &[u8] = b"access-control";

const ROLE_EXECUTOR: u8 = 1 << 0;
const ROLE_COLLECTOR: u8 = 1 << 1;
const ROLE_ADMIN: u8 = 1 << 2;


pub fn process_init_access_control(ctx: Context<InitAccessControl>, owner: Pubkey) -> Result<()> {
        let access = &mut ctx.accounts.access_control;
        access.owner = owner;
        Ok(())
}

pub fn process_set_role(ctx: Context<SetRole>, user: Pubkey, role: u8, add: bool) -> Result<()> {
        let access = &mut ctx.accounts.access_control;

        if role == ROLE_ADMIN {
            require_keys_eq!(ctx.accounts.signer.key(), access.owner);
        } else {
            require!(has_role(&access.users, ctx.accounts.signer.key(), ROLE_ADMIN), myswapSwapError::Unauthorized);
        }

        if let Some(existing) = access.users.iter_mut().find(|u| u.user == user) {
            if add {
                existing.roles |= role;
            } else {
                existing.roles &= !role;
            }
        } else if add {
            access.users.push(User { user, roles: role });
        }

        Ok(())
}

pub fn has_role(users: &Vec<User>, user: Pubkey, role: u8) -> bool {
    users.iter().any(|u| u.user == user && (u.roles & role != 0))
}


#[derive(Accounts)]
pub struct InitAccessControl<'info> {
    #[account(
        init,
        payer = payer,
        seeds = [ACCESS_CONTROL_SEED],
        bump,
        space = 8 + AccessControl::MAX_SIZE
    )]
    pub access_control: Account<'info, AccessControl>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetRole<'info> {
    #[account(
        mut,
        seeds = [ACCESS_CONTROL_SEED],
        bump
    )]
    pub access_control: Account<'info, AccessControl>,
    
    /// CHECK: This is a signer account, we just need the public key
    #[account(signer)]
    pub signer: AccountInfo<'info>,
}

#[account]
pub struct AccessControl {
    pub owner: Pubkey,
    pub users: Vec<User>,
}

impl AccessControl {
    pub const MAX_USERS: usize = 64;
    pub const USER_SIZE: usize = 32 + 1; // pubkey + u8
    pub const MAX_SIZE: usize = 32 + 4 + Self::MAX_USERS * Self::USER_SIZE;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub struct User {
    pub user: Pubkey,
    pub roles: u8,
}
