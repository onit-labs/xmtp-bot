#!/usr/bin/env -S node --experimental-strip-types

import { createSigner } from '#clients/xmtp.ts';
import { ENCRYPTION_KEY, WALLET_KEY } from '#constants.ts';

import { Client } from '@xmtp/node-sdk';
import { toBytes } from 'viem/utils';

// Get environment from command line argument, default to 'production'
const environment = process.argv[2] || 'dev';

if (!['dev', 'production'].includes(environment)) {
	console.error("Invalid environment. Must be 'dev' or 'production'");
	process.exit(1);
}

console.log(`Using environment: ${environment}`);

async function staticRevokeInstallations() {
	// This function is a placeholder for the static revoke installations functionality.
	// It currently does not perform any operations.

	/* Create the signer using viem and parse the encryption key for the local db */
	const signer = createSigner(WALLET_KEY);
	const dbEncryptionKey = toBytes(ENCRYPTION_KEY);

	/* Initialize the xmtp client */
	const client = await Client.create(signer, {
		dbEncryptionKey,
		env: environment as 'dev' | 'production',
	});

	const inboxStates = await Client.inboxStateFromInboxIds([client.inboxId], environment as 'dev' | 'production');

	console.log('✓ Fetched inbox states:', inboxStates);

	const toRevokeInstallationBytes = inboxStates[0]?.installations.map((i) => i.bytes);

	if (!toRevokeInstallationBytes || toRevokeInstallationBytes.length === 0) {
		console.log('No installations to revoke.');
		return;
	}

	await Client.revokeInstallations(
		signer,
		client.inboxId,
		toRevokeInstallationBytes,
		environment as 'dev' | 'production',
	).catch((error) => {
		console.error('Error revoking installations:', error);
	});
}

staticRevokeInstallations()
	.then(() => {
		console.log('✓ Static revoke installations completed successfully.');
	})
	.catch((error) => {
		console.error('Error during static revoke installations:', error);
		process.exit(1);
	});
