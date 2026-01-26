
import { execSync } from "child_process";
import { getNetworkConfig, logHeader, logSection, logInfo, logError, logSuccess } from "../utils/config";

async function runSetupAll() {
  try {
    const config = getNetworkConfig();
    logHeader("Setup All");
    logInfo(`Running setup for network: ${config.name}`);

    const runScript = (scriptName: string) => {
        logSection(`Running ${scriptName}`);
        try {
            execSync(`npm run setup:${scriptName}`, { stdio: 'inherit' });
            logSuccess(`${scriptName} completed.`);
        } catch (e) {
            logError(`${scriptName} failed.`);
            throw e;
        }
    };

    // 1. Check MXE
    runScript("check-mxe");

    // 2. Create User ATA (Localnet Only)
    // This creates mints if they don't exist and funds the user, which init-pool might need
    if (config.name === "localnet") {
        logInfo("Network is localnet: running create-user-ata to synthesize assets...");
        // We can't use npm run here if we haven't defined a script for it yet in package.json?
        // Wait, create-user-ata.ts is not in package.json scripts?
        // Let's check package.json from previous turn.
        // It is NOT in package.json scripts!
        
        // We should run it directly using ts-node
        logSection("Running create-user-ata");
        execSync(`ts-node scripts/setup/create-user-ata.ts`, { stdio: 'inherit' });
        logSuccess("create-user-ata completed.");
    }

    // 3. Initialize Pool
    runScript("init-pool");

    // 4. Initialize Comp Defs
    runScript("init-comp-defs");

    logHeader("Setup Complete");

  } catch (error) {
    logError("Setup failed", error);
    process.exit(1);
  }
}

runSetupAll();
