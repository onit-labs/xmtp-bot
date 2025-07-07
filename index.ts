import { createSigner, logAgentDetails } from '#clients/xmtp.ts';
import { ENCRYPTION_KEY, WALLET_KEY, XMTP_ENV } from '#constants.ts';
import { handleMessage } from '#handlers/handleMessage.ts';

import { Client, type XmtpEnv } from '@xmtp/node-sdk';
import { toBytes } from 'viem/utils';

/**
* Initialize the XMTP client.
*
* @returns An initialized XMTP Client instance
*/
async function initializeXmtpClient() {
	/* Create the signer using viem and parse the encryption key for the local db */
	const signer = createSigner(WALLET_KEY);
	const dbEncryptionKey = toBytes(ENCRYPTION_KEY);

	/* Initialize the xmtp client */
	const client = await Client.create(signer, {
		dbEncryptionKey,
		env: XMTP_ENV as XmtpEnv,
		// codecs: [],
	});

	const identifier = await signer.getIdentifier();
	const agentAddress = identifier.identifier;
	void logAgentDetails(client as Client);

	/* Sync the conversations from the network to update the local db */
	console.log("✓ Syncing conversations...");
	console.log(`📝 Agent Inbox ID:`, client.inboxId);

	await client.conversations.sync();

	return client;
}

/**
 * Start listening for XMTP messages.
 *
 * @param client - The XMTP client instance
 */
async function startMessageListener(client: Client) {
	const messageStream = await client.conversations.streamAllMessages();

	for await (const message of messageStream) {
		if (message) {
			await handleMessage(message, client);
		}
	}
}

async function main() {
	console.log('Initializing Onit XMTP Agent');

	const client = await initializeXmtpClient();

	console.log('Waiting for messages...');

	await startMessageListener(client);
}

main().catch(console.error);
