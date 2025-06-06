import { getRandomValues } from "node:crypto";
import { join } from "node:path";
import type { Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { bytesToHex } from "viem/utils";

// Check Bun version (Bun automatically provides modern JS features)
console.log(`Running on Bun ${Bun.version}`);

console.log("Generating keys for example...");

function generateEncryptionKey(): Hex {
	const uint8Array = getRandomValues(new Uint8Array(32));
	return bytesToHex(uint8Array);
}

const walletKey = generatePrivateKey();
const account = privateKeyToAccount(walletKey);
const encryptionKeyHex = generateEncryptionKey();
const publicKey = account.address;

// Get the current working directory (should be the example directory)
const exampleDir = process.cwd();
const exampleName = exampleDir.split("/").pop() || "example";
const filePath = join(exampleDir, ".env");

console.log(`Creating .env file in: ${exampleDir}`);

// Read existing .env file if it exists
let existingEnv = "";
try {
	const file = Bun.file(filePath);
	existingEnv = await file.text();
	console.log("Found existing .env file");
} catch {
	// File doesn't exist, that's fine
	console.log("No existing .env file found, creating new one");
}

// Check if XMTP_ENV is already set
const xmtpEnvExists = existingEnv.includes("XMTP_ENV=");

const envContent = `# XMTP keys for ${exampleName}
WALLET_KEY=${walletKey}
ENCRYPTION_KEY=${encryptionKeyHex}
${!xmtpEnvExists ? "XMTP_ENV=dev\n" : ""}# Wallet address: ${publicKey}
`;

// Write the .env file to the example directory
await Bun.write(filePath, existingEnv + envContent);
console.log(`Keys written to ${filePath}`);
console.log(`Wallet address: ${publicKey}`);
