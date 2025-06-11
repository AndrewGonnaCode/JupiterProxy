use anchor_lang::prelude::*;

#[account]
pub struct ExecutorList {
    pub admin: Pubkey,
    pub executors: Vec<Pubkey>,
}

#[account]
pub struct Config {
    pub admin: Pubkey,
}

pub struct User {
    pub user: Pubkey,
    pub roles:u8
}