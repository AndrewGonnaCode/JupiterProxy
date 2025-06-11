use anchor_lang::prelude::*;
// / Create SwapError enum
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