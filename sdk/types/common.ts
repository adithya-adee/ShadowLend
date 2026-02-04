import { BN } from "@coral-xyz/anchor";

/**
 * Represents a raw byte array (Uint8Array).
 */
export type Bytes = Uint8Array;

/**
 * Byte array representing Little Endian format.
 */
export type LeBytes = Bytes & { _brand: "LeBytes" };

/**
 * Byte array representing Big Endian format.
 */
export type BeBytes = Bytes & { _brand: "BeBytes" };

// --- Unsigned Integers ---

/**
 * 8-bit unsigned integer.
 */
export type U8 = number & { _brand: "U8" };

/**
 * 16-bit unsigned integer.
 */
export type U16 = number & { _brand: "U16" };

/**
 * 32-bit unsigned integer.
 */
export type U32 = number & { _brand: "U32" };

/**
 * 64-bit unsigned integer (represented as BN).
 */
export type U64 = BN & { _brand: "U64" };

/**
 * 128-bit unsigned integer (represented as BN).
 */
export type U128 = BN & { _brand: "U128" };

/**
 * 256-bit unsigned integer (represented as BN).
 */
export type U256 = BN & { _brand: "U256" };

// --- Little Endian Bytes for Integers ---

export type U8LeBytes = Bytes & { _brand: "U8LeBytes" };
export type U16LeBytes = Bytes & { _brand: "U16LeBytes" };
export type U32LeBytes = Bytes & { _brand: "U32LeBytes" };
export type U64LeBytes = Bytes & { _brand: "U64LeBytes" };
export type U128LeBytes = Bytes & { _brand: "U128LeBytes" };
export type U256LeBytes = Bytes & { _brand: "U256LeBytes" };

// --- Big Endian Bytes for Integers ---

export type U8BeBytes = Bytes & { _brand: "U8BeBytes" };
export type U16BeBytes = Bytes & { _brand: "U16BeBytes" };
export type U32BeBytes = Bytes & { _brand: "U32BeBytes" };
export type U64BeBytes = Bytes & { _brand: "U64BeBytes" };
export type U128BeBytes = Bytes & { _brand: "U128BeBytes" };
export type U256BeBytes = Bytes & { _brand: "U256BeBytes" };

// --- Signed Integers ---

/**
 * 8-bit signed integer.
 */
export type I8 = number & { _brand: "I8" };

/**
 * 16-bit signed integer.
 */
export type I16 = number & { _brand: "I16" };

/**
 * 32-bit signed integer.
 */
export type I32 = number & { _brand: "I32" };

/**
 * 64-bit signed integer (represented as BN).
 */
export type I64 = BN & { _brand: "I64" };

/**
 * 128-bit signed integer (represented as BN).
 */
export type I128 = BN & { _brand: "I128" };

/**
 * 256-bit signed integer (represented as BN).
 */
export type I256 = BN & { _brand: "I256" };

// --- Helper Functions (Factories) ---

/**
 * Casts a number to U8.
 * @throws Error if value is out of range [0, 255].
 */
export const toU8 = (val: number): U8 => {
  if (val < 0 || val > 255) throw new Error(`Value ${val} out of range for U8`);
  return val as U8;
};

/**
 * Casts a number to U16.
 * @throws Error if value is out of range [0, 65535].
 */
export const toU16 = (val: number): U16 => {
  if (val < 0 || val > 65535)
    throw new Error(`Value ${val} out of range for U16`);
  return val as U16;
};

/**
 * Casts a number to U32.
 * @throws Error if value is out of range.
 */
export const toU32 = (val: number): U32 => {
  if (val < 0 || val > 4294967295)
    throw new Error(`Value ${val} out of range for U32`);
  return val as U32;
};

/**
 * Converts a number or BN to U64.
 */
export const toU64 = (val: number | BN): U64 => {
  return new BN(val) as U64;
};

/**
 * Converts a number or BN to U128.
 */
export const toU128 = (val: number | BN): U128 => {
  return new BN(val) as U128;
};

/**
 * Converts a number or BN to U256.
 */
export const toU256 = (val: number | BN): U256 => {
  return new BN(val) as U256;
};

export type I8BeBytes = Bytes & { _brand: "I8BeBytes" };
export type I16BeBytes = Bytes & { _brand: "I16BeBytes" };
export type I32BeBytes = Bytes & { _brand: "I32BeBytes" };
export type I64BeBytes = Bytes & { _brand: "I64BeBytes" };
export type I128BeBytes = Bytes & { _brand: "I128BeBytes" };
export type I256BeBytes = Bytes & { _brand: "I256BeBytes" };
