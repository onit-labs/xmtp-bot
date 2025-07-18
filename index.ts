import { createSigner, logAgentDetails, type XmtpClient } from '#clients/xmtp.ts';
import { ENCRYPTION_KEY, WALLET_KEY, XMTP_ENV } from '#constants.ts';
import { sendWelcomeMessage } from '#handlers/handleConversation.ts';
import { handleMessage } from '#handlers/handleMessage.ts';

import { ReactionCodec } from '@xmtp/content-type-reaction';
import { Client, ConsentState, type DecodedMessage, type XmtpEnv } from '@xmtp/node-sdk';
import { toBytes } from 'viem/utils';

const MAX_RETRIES = 5;
// Base delay for exponential backoff (in milliseconds)
const BASE_RETRY_DELAY = 1000;
// Maximum delay cap (30 seconds)
const MAX_RETRY_DELAY = 30000;

let retries = MAX_RETRIES;
let conversationRetries = MAX_RETRIES;

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
	console.log('✓ Syncing client...');

	await client.conversations.syncAll([ConsentState.Allowed]).catch((error) => {
		console.error('Error syncing client:', error);
	});

	console.log(`📝 Agent Inbox ID: ${client.inboxId}`);

	return client;
}

/**
 * Start streaming new conversations and send welcome messages
 * @param client - The XMTP client instance
 */
export async function createConversationStream(client: XmtpClient): Promise<void> {
	console.log('📞 Starting conversation listener for welcome messages...');

	// Stream new conversations
	client.conversations.stream((err, conversation) => {
		if (err) {
			console.error('Error in conversation stream:', err);

			// make sure we sync before retrying
			client.conversations.syncAll([ConsentState.Allowed]).catch((error) => {
				console.error('Error syncing client:', error);
			});

			retryStream(client, createConversationStream);
			return;
		}

		console.log(`New conversation detected: ${conversation?.id}`);
		if (conversation) {
			// Reset retry counter on successful conversation detection
			conversationRetries = MAX_RETRIES;
			try {
				void sendWelcomeMessage(conversation, client);
			} catch (error) {
				console.error('Error in conversation listener:', { conversation, error });
			}
		}
	}, onConversationStreamFail(client));
}

/**
 * Start listening for XMTP messages.
 *
 * @param client - The XMTP client instance
 */
async function createMessageStream(client: XmtpClient) {
	console.log('📡 Creating message stream...');

	await client.conversations.streamAllMessages(
		(err, message) => onMessage(err, client, message),
		undefined,
		undefined,
		onMessageStreamFail(client),
	);
}

function onMessage(err: Error | null, client: XmtpClient, message?: DecodedMessage) {
	if (err) {
		console.error('Error in message stream:', err);
		retryStream(client, createMessageStream);
		return;
	}

	if (!message) return;

	// reset count when we successfully process a message
	retries = MAX_RETRIES;
	handleMessage(message, client).catch((error) => {
		console.error('Error in message listener:', { message, error });
	});
}

/**
 * Calculate exponential backoff delay with jitter
 * @param attempt - The current attempt number (1-based)
 * @returns Delay in milliseconds
 */
function calculateBackoffDelay(attempt: number): number {
	const exponentialDelay = BASE_RETRY_DELAY * Math.pow(2, attempt - 1);

	// Apply maximum delay cap
	const cappedDelay = Math.min(exponentialDelay, MAX_RETRY_DELAY);

	// Add jitter (±25% randomization) to prevent thundering herd
	const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);

	return Math.max(100, cappedDelay + jitter); // Minimum 100ms delay
}

/**
 * Retry the stream with exponential backoff
 * @param client - The XMTP client instance
 * @param stream - The stream function to retry
 */
function retryStream(client: XmtpClient, stream: (client: XmtpClient) => Promise<void>) {
	if (retries > 0) {
		const currentAttempt = MAX_RETRIES - retries + 1;
		const delayMs = calculateBackoffDelay(currentAttempt);

		console.log(`🔄 Exponential backoff retry:`);
		console.log(`   • Attempt: ${currentAttempt}/${MAX_RETRIES}`);
		console.log(`   • Delay: ${(delayMs / 1000).toFixed(1)}s`);
		console.log(`   • Retries left: ${retries}`);

		retries--;
		setTimeout(async () => {
			console.log(`⏰ Message retry timeout expired, attempting to reconnect...`);

			// we may have missed some messages, so we need to sync the client again
			await client.conversations.syncAll([ConsentState.Allowed]).catch((error) => {
				console.error('Error syncing client:', error);
			});

			await stream(client);
		}, delayMs);
	} else {
		console.log('❌ Max retries reached, ending process');
		process.exit(1);
	}
}

function onMessageStreamFail(client: XmtpClient) {
	return () => {
		console.log('Message stream failed');
		retryStream(client, createMessageStream);
	};
}

function onConversationStreamFail(client: XmtpClient) {
	return () => {
		console.log('Conversation stream failed');

		// sync before starting the stream
		client.conversations
			.syncAll([ConsentState.Allowed])
			.then(() => retryStream(client, createConversationStream))
			.catch((error) => console.error('Error syncing client:', error));
	};
}

async function main() {
	console.log('Initializing Onit XMTP Agent');

	const client = await initializeXmtpClient();

	// Start both message listener and conversation listener in parallel
	console.log('Starting listeners...');
	await Promise.all([
		createMessageStream(client).catch((error) => {
			console.error('Error in message stream:', error);
		}),
		createConversationStream(client).catch((error) => {
			console.error('Error in conversation listener:', error);
		}),
	]);
}

// Start the bot
main().catch((error) => {
	console.error('Failed to start bot:', error);
	process.exit(1);
});
