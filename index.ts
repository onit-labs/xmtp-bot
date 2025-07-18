import { createSigner, logAgentDetails, type XmtpClient } from '#clients/xmtp.ts';
import { ENCRYPTION_KEY, WALLET_KEY, XMTP_ENV } from '#constants.ts';
import { sendWelcomeMessage } from '#handlers/handleConversation.ts';
import { handleMessage } from '#handlers/handleMessage.ts';

import { ReactionCodec } from '@xmtp/content-type-reaction';
import { Client, type XmtpEnv } from '@xmtp/node-sdk';
import { toBytes } from 'viem/utils';

// Circuit breaker configuration
const MAX_STREAM_RESTARTS_PER_HOUR = 5;
const BACKOFF_BASE_MS = 5000;
const MAX_RETRY_DELAY = 30000;
const EXTENDED_BACKOFF_CAP = 60 * 60 * 1000; // 1 hour max

// Stream failure tracking
interface StreamFailureTracker {
	restartCount: number;
	lastRestart: number;
	isInExtendedBackoff: boolean;
}

const messageStreamTracker: StreamFailureTracker = {
	restartCount: 0,
	lastRestart: 0,
	isInExtendedBackoff: false,
};

const conversationStreamTracker: StreamFailureTracker = {
	restartCount: 0,
	lastRestart: 0,
	isInExtendedBackoff: false,
};

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

	await client.conversations.sync().catch((error) => {
		console.error('Error syncing client:', error);
	});

	console.log(`📝 Agent Inbox ID: ${client.inboxId}`);

	return client;
}

/**
 * Start streaming new conversations and send welcome messages using async iterator pattern
 * @param client - The XMTP client instance
 */
export async function createConversationStream(client: XmtpClient): Promise<void> {
	console.log('📞 Starting conversation listener...');

	try {
		const stream = await client.conversations.stream();
		console.log('✅ XMTP conversation stream active - waiting for new conversations...');

		for await (const conversation of stream) {
			if (!conversation) continue;

			try {
				console.log(`New conversation detected: ${conversation.id}`);

				// Reset restart counter on successful conversation detection
				conversationStreamTracker.restartCount = Math.max(0, conversationStreamTracker.restartCount - 1);

				await sendWelcomeMessage(conversation, client);
			} catch (error: unknown) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				console.error('❌ Error processing new conversation:', errorMessage);

				if (errorMessage.includes('group with welcome id')) {
					console.warn('⚠️ Group welcome message error - continuing stream');
					continue;
				}

				if (errorMessage.includes('conversation not found') || errorMessage.includes('invalid conversation')) {
					console.warn('⚠️ Invalid conversation error - continuing stream');
					continue;
				}

				// For unknown errors, log more details but continue processing
				console.error('❌ Unknown conversation error type - continuing stream:', {
					conversationId: conversation.id,
					error: errorMessage,
				});
			}
		}

		// If we reach here, the stream ended unexpectedly
		console.warn('⚠️ XMTP conversation stream ended unexpectedly - triggering recovery');
		throw new Error('XMTP conversation stream ended unexpectedly');
	} catch (streamError) {
		const errorMessage = streamError instanceof Error ? streamError.message : String(streamError);
		console.error('❌ Conversation stream error:', errorMessage);

		// Trigger circuit breaker recovery
		await handleStreamFailureWithBackoff(client, createConversationStream, conversationStreamTracker);
	}
}

/**
 * Start listening for XMTP messages
 *
 * @param client - The XMTP client instance
 */
async function createMessageStream(client: XmtpClient) {
	console.log('📡 Creating message stream...');

	try {
		// Get the async iterator stream
		const stream = await client.conversations.streamAllMessages();
		console.log('✅ XMTP message stream active - waiting for messages...');

		for await (const message of stream) {
			if (!message) continue;

			try {
				// Reset restart counter on successful message processing
				messageStreamTracker.restartCount = Math.max(0, messageStreamTracker.restartCount - 1);

				await handleMessage(message, client);
			} catch (error: unknown) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				console.error('❌ Error processing message:', errorMessage);

				if (errorMessage.includes('group with welcome id')) {
					console.warn('⚠️ Group welcome message error - continuing stream');
					continue;
				}

				if (errorMessage.includes('sqlcipher') || errorMessage.includes('encryption')) {
					console.warn('⚠️ Database encryption error - continuing stream');
					continue;
				}

				// For unknown errors, log more details but continue processing
				console.error('❌ Unknown error type - continuing stream:', {
					messageId: message.id,
					senderInboxId: message.senderInboxId,
					conversationId: message.conversationId,
					error: errorMessage,
				});
			}
		}

		// If we reach here, the stream ended unexpectedly
		console.warn('⚠️ XMTP message stream ended unexpectedly - triggering recovery');
		throw new Error('XMTP message stream ended unexpectedly');
	} catch (streamError) {
		const errorMessage = streamError instanceof Error ? streamError.message : String(streamError);
		console.error('❌ Message stream error:', errorMessage);

		// Trigger circuit breaker recovery
		await handleStreamFailureWithBackoff(client, createMessageStream, messageStreamTracker);
	}
}

/**
 * Enhanced stream failure handling with circuit breaker pattern
 * Implements rate limiting and extended backoff instead of process death
 */
async function handleStreamFailureWithBackoff(
	client: XmtpClient,
	streamFunction: (client: XmtpClient) => Promise<void>,
	tracker: StreamFailureTracker,
): Promise<void> {
	const now = Date.now();
	const timeSinceLastRestart = now - tracker.lastRestart;

	// Reset counter if more than 1 hour has passed
	if (timeSinceLastRestart > 60 * 60 * 1000) {
		tracker.restartCount = 0;
		tracker.isInExtendedBackoff = false;
	}

	// Circuit breaker: Too many restarts in the last hour
	if (tracker.restartCount >= MAX_STREAM_RESTARTS_PER_HOUR) {
		if (!tracker.isInExtendedBackoff) {
			console.log('🚨 Circuit breaker: Too many stream restarts - entering extended backoff mode');
			tracker.isInExtendedBackoff = true;
		}

		// Extended backoff with progressive delay - never give up!
		const backoffTime = Math.min(
			EXTENDED_BACKOFF_CAP,
			BACKOFF_BASE_MS * Math.pow(2, tracker.restartCount - MAX_STREAM_RESTARTS_PER_HOUR),
		);

		console.log(`⏳ Extended backoff for ${(backoffTime / 1000).toFixed(1)}s (attempt ${tracker.restartCount + 1})`);

		setTimeout(async () => {
			console.log('🔄 Extended backoff complete - attempting restart');
			tracker.restartCount = 0; // Reset for fresh start
			tracker.isInExtendedBackoff = false;
			await handleStreamRestart(client, streamFunction, tracker);
		}, backoffTime);
		return;
	}

	// Normal exponential backoff with jitter
	tracker.restartCount++;
	tracker.lastRestart = now;

	const baseDelay = BACKOFF_BASE_MS * Math.pow(2, tracker.restartCount - 1);
	const jitter = Math.random() * 1000;
	const delay = Math.min(baseDelay + jitter, MAX_RETRY_DELAY);

	console.log(
		`🔄 Stream restart ${tracker.restartCount}/${MAX_STREAM_RESTARTS_PER_HOUR} in ${(delay / 1000).toFixed(1)}s`,
	);

	setTimeout(async () => {
		await handleStreamRestart(client, streamFunction, tracker);
	}, delay);
}

/**
 * Handle the actual stream restart with proper error handling
 */
async function handleStreamRestart(
	client: XmtpClient,
	streamFunction: (client: XmtpClient) => Promise<void>,
	tracker: StreamFailureTracker,
): Promise<void> {
	try {
		console.log('🔄 Attempting stream restart...');

		// Sync client before restarting stream
		await client.conversations.sync().catch((error) => {
			console.error('Error syncing client during restart:', error);
		});

		await streamFunction(client);
		console.log('✅ Stream restarted successfully');

		// Reset counter on successful restart
		if (tracker.restartCount > 0) {
			tracker.restartCount = Math.max(0, tracker.restartCount - 1);
		}
	} catch (restartError) {
		console.error('❌ Failed to restart stream:', restartError);
		// Trigger another backoff cycle instead of dying
		await handleStreamFailureWithBackoff(client, streamFunction, tracker);
	}
}

async function main() {
	console.log('Initializing Onit XMTP Agent');

	const client = await initializeXmtpClient();

	// Start both message listener and conversation listener in parallel
	console.log('Starting listeners...');
	await Promise.all([createMessageStream(client), createConversationStream(client)]);
}

// Start the bot with graceful error handling
main().catch(async (error) => {
	console.error('❌ Failed to start bot:', error);
	console.log('🔄 Attempting to restart bot in 10 seconds...');

	// Wait 10 seconds then try to restart the entire bot
	setTimeout(() => {
		console.log('🚀 Restarting bot...');
		main().catch((restartError) => {
			console.error('❌ Failed to restart bot:', restartError);
			console.log('🔄 Will retry again in 30 seconds...');

			// Exponentially increase restart delay for main process failures
			setTimeout(() => {
				console.log('🚀 Final restart attempt...');
				main().catch((finalError) => {
					console.error('💀 Critical failure - bot cannot start:', finalError);
					console.log('🆘 Manual intervention required');
					// Still don't exit - let the process manager handle it
				});
			}, 30000);
		});
	}, 10000);
});
