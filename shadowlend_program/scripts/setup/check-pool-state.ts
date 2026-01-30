
import { PublicKey } from "@solana/web3.js";
import {
  createProvider,
  getNetworkConfig,
  loadProgram,
  logHeader,
  logEntry,
  icons
} from "../utils/config";
import {
  getWalletKeypair,
  loadDeployment,
} from "../utils/deployment";
import * as idl from "../../target/idl/shadowlend_program.json";

async function checkPoolState() {
    const config = getNetworkConfig();
    const wallet = getWalletKeypair();

    const { Wallet } = require("@coral-xyz/anchor");
    const providerWallet = new Wallet(wallet);
    const p2 = createProvider(providerWallet as any, config);

    const deployment = loadDeployment();
    if (!deployment?.poolAddress) {
        console.log("No pool address in deployment.");
        return;
    }

    const programId = new PublicKey(deployment.programId);
    const poolPda = new PublicKey(deployment.poolAddress);
    
    // Load program
    const program = await loadProgram(p2, programId, idl);

    const pool = await (program.account as any).pool.fetch(poolPda);
    
    console.log("Pool State:");
    console.log("LTV BPS:", pool.ltvBps.toString());
    console.log("Liquidation Threshold:", pool.liquidationThreshold.toString());
    console.log("Total Deposits:", pool.totalDeposits.toString());
    console.log("Total Borrows:", pool.totalBorrows.toString());
}

checkPoolState();
