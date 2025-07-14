import { createSigner, logAgentDetails, type XmtpClient } from '#clients/xmtp.ts';
import { ENCRYPTION_KEY, WALLET_KEY, XMTP_ENV } from '#constants.ts';
import { handleMessage } from '#handlers/handleMessage.ts';
import { sendWelcomeMessage } from '#handlers/handleConversation.ts';

import { ReactionCodec } from '@xmtp/content-type-reaction';
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
		codecs: [new ReactionCodec()],
	});

	const identifier = await signer.getIdentifier();
	const agentAddress = identifier.identifier;
	void logAgentDetails(client as Client);

	/* Sync the conversations from the network to update the local db */
	console.log('✓ Syncing conversations...');
	console.log(`📝 Agent Inbox ID:`, client.inboxId);

	await client.conversations.sync();

	return client;
}

/**
 * Start streaming new conversations and send welcome messages
 * @param client - The XMTP client instance
 */
export async function startConversationListener(client: XmtpClient): Promise<void> {
	try {
		console.log('Starting conversation listener for welcome messages...');

		// Stream new conversations
		const conversationStream = client.conversations.stream();

		for await (const conversation of conversationStream) {
			console.log(`New conversation detected: ${conversation?.id}`);
			if (conversation) {
				await sendWelcomeMessage(conversation, client).catch((error) => {
					console.error('Error in conversation listener:', { conversation, error });
				});
			}
		}
	} catch (error) {
		console.error('Error in conversation listener:', error);
	}
}

/**
 * Start listening for XMTP messages.
 *
 * @param client - The XMTP client instance
 */
async function startMessageListener(client: XmtpClient) {
	const messageStream = await client.conversations.streamAllMessages();

	for await (const message of messageStream) {
		console.log(`New message detected: ${message?.id}`);
		if (message) {
			await handleMessage(message, client).catch((error) => {
				console.error('Error in message listener:', { message, error });
			});
		}
	}
}

async function main() {
	console.log('Initializing Onit XMTP Agent');

	const client = await initializeXmtpClient();

	// // Start the welcome message system (check existing conversations first)
	// console.log('Checking for existing conversations...');
	// await checkForNewConversations(client);

	// Start both message listener and conversation listener in parallel
	console.log('Starting listeners...');
	await Promise.all([
		startMessageListener(client),
		startConversationListener(client),
	]);
}

// Start the bot
main().catch((error) => {
	console.error('Failed to start bot:', error);
	process.exit(1);
});
