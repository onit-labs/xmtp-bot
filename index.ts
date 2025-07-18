import { createSigner, logAgentDetails, type XmtpClient } from '#clients/xmtp.ts';
import { ENCRYPTION_KEY, WALLET_KEY, XMTP_ENV } from '#constants.ts';
import { handleMessage } from '#handlers/handleMessage.ts';
import { sendWelcomeMessage } from '#handlers/handleConversation.ts';

import { ReactionCodec } from '@xmtp/content-type-reaction';
import { Client, type DecodedMessage, type XmtpEnv } from '@xmtp/node-sdk';
import { toBytes } from 'viem/utils';

const MAX_RETRIES = 5;
// wait 5 seconds before each retry
const RETRY_INTERVAL = 5000;

let retries = MAX_RETRIES;

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
const handleStream = async (client: XmtpClient) => {
	console.log('Syncing conversations...');
	await client.conversations.sync();

	await client.conversations.streamAllMessages(
		(err, message) => onMessage(err, client, message),
		undefined,
		undefined,
		() => onFail(client)(),
	);
};

const onMessage = (err: Error | null, client: XmtpClient, message?: DecodedMessage) => {
	if (err) {
		console.error('Error in message stream:', err);
		onFail(client)();
		return;
	}

	if (message) {
		console.log('New message received');
		//reset count
		retries = MAX_RETRIES;
		handleMessage(message, client).catch((error) => {
			console.error('Error in message listener:', { message, error });
		});
	}
};

const retry = (client: XmtpClient) => {
	console.log(`Retrying in ${RETRY_INTERVAL / 1000}s, ${retries} retries left`);
	if (retries > 0) {
		retries--;
		setTimeout(() => {
			handleStream(client);
		}, RETRY_INTERVAL);
	} else {
		console.log('Max retries reached, ending process');
		process.exit(1);
	}
};

const onFail = (client: XmtpClient) => {
	return () => {
		console.log('Stream failed');
		retry(client);
	};
};

async function main() {
	console.log('Initializing Onit XMTP Agent');

	const client = await initializeXmtpClient();

	// // Start the welcome message system (check existing conversations first)
	// console.log('Checking for existing conversations...');
	// await checkForNewConversations(client);

	// Start both message listener and conversation listener in parallel
	console.log('Starting listeners...');
	await Promise.all([handleStream(client), startConversationListener(client)]);
}

// Start the bot
main().catch((error) => {
	console.error('Failed to start bot:', error);
	process.exit(1);
});
