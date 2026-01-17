//! Protocol Constants
//!
//! Pyth oracle integration with manual account parsing for real-time pricing.
//! This implementation parses Pyth price accounts directly without the SDK
//! to avoid solana-program version conflicts.

use anchor_lang::prelude::*;

// ============================================================
// Pyth Oracle Feed IDs
// ============================================================

/// Pyth SOL/USD price feed ID (mainnet & devnet)
pub const SOL_USD_FEED_ID: [u8; 32] = hex_literal::hex!(
    "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d"
);

/// Pyth USDC/USD price feed ID (mainnet & devnet)
pub const USDC_USD_FEED_ID: [u8; 32] = hex_literal::hex!(
    "eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a"
);

/// Maximum age for price updates (30 seconds)
pub const MAX_PRICE_AGE_SECONDS: i64 = 30;

/// Pyth Pull Oracle program ID (mainnet)
pub const PYTH_RECEIVER_PROGRAM_ID: Pubkey = pubkey!("rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ");

// ============================================================
// Pyth Price Account Structure (Manual Parsing)
// ============================================================

/// Pyth price status values
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum PythPriceStatus {
    Unknown = 0,
    Trading = 1,
    Halted = 2,
    Auction = 3,
}

/// Parsed Pyth price data
#[derive(Clone, Copy, Debug)]
pub struct PythPrice {
    /// Price value (scaled by 10^exponent)
    pub price: i64,
    /// Confidence interval
    pub conf: u64,
    /// Price exponent (typically negative, e.g., -8)
    pub exponent: i32,
    /// Publish time (Unix timestamp)
    pub publish_time: i64,
}

impl PythPrice {
    /// Converts the price to cents (assuming USD prices)
    ///
    /// For example: price=15000000000, exponent=-8 means $150.00 = 15000 cents
    pub fn to_cents(&self) -> Result<u64> {
        require!(self.price > 0, PythError::NegativePrice);

        // Target: cents = price * 10^exponent * 100 = price * 10^(exponent + 2)
        let cents_exponent = self.exponent + 2;

        let cents = if cents_exponent >= 0 {
            (self.price as u64)
                .checked_mul(10u64.pow(cents_exponent as u32))
                .ok_or(error!(PythError::MathOverflow))?
        } else {
            let divisor = 10i64.pow((-cents_exponent) as u32);
            (self.price / divisor) as u64
        };

        Ok(cents)
    }
}

// ============================================================
// Pyth PriceUpdateV2 Account Parser
// ============================================================

/// Header size for PriceUpdateV2 accounts
const PRICE_UPDATE_V2_HEADER_SIZE: usize = 8 + 1 + 1; // discriminator + write_authority flag + feed option

/// Offset to price feed message within PriceUpdateV2
const PRICE_FEED_MESSAGE_OFFSET: usize = PRICE_UPDATE_V2_HEADER_SIZE + 32; // after feed_id

/// Parses a Pyth PriceUpdateV2 account and extracts the price data.
///
/// # Account Structure (PriceUpdateV2)
/// - 8 bytes: Anchor discriminator
/// - 1 byte: write_authority flag
/// - 1 byte: verification_level
/// - 32 bytes: feed_id
/// - 8 bytes: price (i64)
/// - 8 bytes: conf (u64)
/// - 4 bytes: exponent (i32)
/// - 8 bytes: publish_time (i64)
/// - ... (additional fields)
///
/// # Arguments
/// * `account_info` - The Pyth price update account
/// * `expected_feed_id` - The expected price feed ID to validate
/// * `clock` - The Solana clock for staleness check
///
/// # Returns
/// The parsed price in cents
pub fn get_price_from_pyth_account<'info>(
    account_info: &AccountInfo<'info>,
    expected_feed_id: &[u8; 32],
    clock: &Clock,
) -> Result<u64> {
    // Verify account is owned by Pyth program
    require!(
        *account_info.owner == PYTH_RECEIVER_PROGRAM_ID,
        PythError::InvalidOwner
    );

    let data = account_info.try_borrow_data()?;

    // Minimum size check
    require!(
        data.len() >= PRICE_FEED_MESSAGE_OFFSET + 28,
        PythError::InvalidAccountData
    );

    // Parse feed_id (offset 10)
    let feed_id_start = 10;
    let feed_id: [u8; 32] = data[feed_id_start..feed_id_start + 32]
        .try_into()
        .map_err(|_| error!(PythError::InvalidAccountData))?;

    require!(feed_id == *expected_feed_id, PythError::FeedIdMismatch);

    // Parse price data (after feed_id)
    let price_start = feed_id_start + 32;

    let price = i64::from_le_bytes(
        data[price_start..price_start + 8]
            .try_into()
            .map_err(|_| error!(PythError::InvalidAccountData))?,
    );

    let conf = u64::from_le_bytes(
        data[price_start + 8..price_start + 16]
            .try_into()
            .map_err(|_| error!(PythError::InvalidAccountData))?,
    );

    let exponent = i32::from_le_bytes(
        data[price_start + 16..price_start + 20]
            .try_into()
            .map_err(|_| error!(PythError::InvalidAccountData))?,
    );

    let publish_time = i64::from_le_bytes(
        data[price_start + 20..price_start + 28]
            .try_into()
            .map_err(|_| error!(PythError::InvalidAccountData))?,
    );

    // Validate price is not stale
    let current_time = clock.unix_timestamp;
    require!(
        current_time - publish_time <= MAX_PRICE_AGE_SECONDS,
        PythError::StalePrice
    );

    // Convert to cents
    let pyth_price = PythPrice {
        price,
        conf,
        exponent,
        publish_time,
    };

    pyth_price.to_cents()
}

// ============================================================
// Error Codes
// ============================================================

#[error_code]
pub enum PythError {
    #[msg("Pyth account not owned by Pyth receiver program")]
    InvalidOwner,
    #[msg("Invalid Pyth account data")]
    InvalidAccountData,
    #[msg("Price feed ID mismatch")]
    FeedIdMismatch,
    #[msg("Price is stale (older than 30 seconds)")]
    StalePrice,
    #[msg("Negative price value")]
    NegativePrice,
    #[msg("Math overflow in price conversion")]
    MathOverflow,
}
