import { createClient, createSigner, logAgentDetails } from '#clients/xmtp.ts';
import { ENCRYPTION_KEY, WALLET_KEY, XMTP_ENV } from '#constants.ts';
import { sendWelcomeMessage } from '#handlers/handleConversation.ts';
import { handleMessage } from '#handlers/handleMessage.ts';

import { ReactionCodec } from '@xmtp/content-type-reaction';
import { Conversation } from '@xmtp/node-bindings';
import { Client } from '@xmtp/node-sdk';
import { toBytes } from 'viem/utils';

import type { XmtpEnv } from '@xmtp/node-sdk';
import type { XmtpClient } from '#clients/xmtp.ts';

type XmtpNodeClient = Awaited<ReturnType<typeof createClient>>;

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

	const clientOptions = {
		dbEncryptionKey,
		env: XMTP_ENV as XmtpEnv,
		codecs: [new ReactionCodec()],
	};

	const identifier = await signer.getIdentifier();
	const agentAddress = identifier.identifier;

	/* Initialize the xmtp client */
	const client = await Client.create(signer, clientOptions);
	const nodeClient = await createClient(identifier, clientOptions);

	void logAgentDetails(client);

	console.log(`📝 Agent Inbox ID: ${client.inboxId}`);

	return { client, nodeClient };
}

/**
 * Create an async iterator for node conversation streams
 * @param nodeClient - The node client instance
 */
async function* getConversationStream(
	nodeClient: Awaited<ReturnType<typeof createClient>>,
): AsyncGenerator<Conversation, void, unknown> {
	console.log('🔧 Initializing node conversation stream...');
	const conversations = nodeClient.conversations();

	// Ensure conversations are synced
	console.log('🔄 Syncing conversations...');
	await conversations.sync();
	console.log('✅ Conversations synced');

	// Create a promise-based wrapper around the callback stream
	const conversationQueue: Conversation[] = [];
	let streamEnded = false;
	let resolveNext: ((value: IteratorResult<Conversation>) => void) | null = null;
	let conversationCount = 0;
	let errorCount = 0;

	console.log('📡 Setting up conversation stream callbacks...');

	// Set up the stream with error handling
	const streamCloser = conversations.stream(
		async (err, conversation) => {
			if (err) {
				errorCount++;
				// Log the error but don't end the stream - continue processing
				console.error(`⚠️ Node conversation stream error #${errorCount} (continuing):`, {
					error: err.message || err,
					queueLength: conversationQueue.length,
					streamEnded,
					hasResolver: !!resolveNext,
				});
				return;
			}

			if (conversation) {
				conversationCount++;
				console.log(`📥 New conversation received (#${conversationCount}):`, {
					id: conversation.id,
					queueLength: conversationQueue.length,
					hasResolver: !!resolveNext,
				});

				conversationQueue.push(conversation);

				if (resolveNext) {
					console.log('🔓 Resolving waiting iterator with queued conversation');
					const resolve = resolveNext;
					resolveNext = null;
					const nextConversation = conversationQueue.shift()!;
					resolve({ value: nextConversation, done: false });
				} else {
					console.log(`📦 Conversation queued (queue size: ${conversationQueue.length})`);
				}
			} else {
				console.log('📭 Received null conversation - ignoring');
			}
		},
		() => {
			// Only end the stream when the underlying stream actually closes
			console.warn('⚠️ Node conversation stream closed by provider');
			streamEnded = true;
			if (resolveNext) {
				console.log('🔓 Resolving waiting iterator with stream end');
				const resolve = resolveNext;
				resolveNext = null;
				resolve({ value: undefined as unknown as Conversation, done: true });
			}
		},
	);

	console.log('🎯 Starting conversation stream iterator loop...');
	let iterationCount = 0;

	try {
		while (!streamEnded) {
			iterationCount++;
			console.log(
				`🔄 Iterator loop #${iterationCount} - Queue: ${conversationQueue.length}, Errors: ${errorCount}, Total conversations: ${conversationCount}`,
			);

			// If we have conversations queued, yield the next one
			if (conversationQueue.length > 0) {
				const conversation = conversationQueue.shift()!;
				console.log(`✨ Yielding conversation ${conversation.id()} (${conversationQueue.length} remaining in queue)`);
				yield conversation;
				continue;
			}

			// Wait for the next conversation or stream end
			console.log('⏳ No conversations in queue - waiting for next...');
			const result = await new Promise<IteratorResult<Conversation>>((resolve) => {
				resolveNext = resolve;
				console.log('🔒 Iterator waiting for resolution...');
			});

			console.log('🔓 Iterator resolved - checking result...');

			// If the stream ended, break out
			if (result.done) {
				console.log('🏁 Stream ended via promise resolution');
				break;
			}

			// Yield the conversation that was resolved
			if (result.value) {
				console.log(`✨ Yielding resolved conversation ${result.value.id()}`);
				yield result.value;
			}

			// Also yield any additional conversations that arrived while waiting
			let yieldedCount = 0;
			while (conversationQueue.length > 0) {
				const conversation = conversationQueue.shift()!;
				yieldedCount++;
				console.log(
					`✨ Yielding conversation ${conversation.id()} from post-wait queue (${yieldedCount}/${yieldedCount + conversationQueue.length})`,
				);
				yield conversation;
			}

			if (yieldedCount > 0) {
				console.log(`📋 Yielded ${yieldedCount} additional conversations from queue`);
			}
		}

		console.log('🏁 Stream iterator ended normally');
	} finally {
		console.log('🧹 Cleaning up conversation stream...');
		streamCloser.end();
		console.log(
			`📊 Final stats - Iterations: ${iterationCount}, Conversations: ${conversationCount}, Errors: ${errorCount}`,
		);
	}
}

/**
 * Start streaming new conversations and send welcome messages using async iterator pattern
 * @param client - The XMTP client instance
 * @param nodeClient - The node client instance
 */
export async function createConversationStream(
	client: XmtpClient,
	nodeClient: Awaited<ReturnType<typeof createClient>>,
): Promise<void> {
	console.log('📞 Starting node conversation listener...');

	try {
		console.log('✅ Node conversation stream active - waiting for new conversations...');

		for await (const conversation of getConversationStream(nodeClient)) {
			if (!conversation) continue;

			try {
				const id = conversation.id();

				const xmtpConversation = await client.conversations.getConversationById(id).catch((error) => {
					console.error('Error getting conversation by id:', error);
					return null;
				});

				// Reset restart counter on successful conversation detection
				conversationStreamTracker.restartCount = Math.max(0, conversationStreamTracker.restartCount - 1);

				if (!xmtpConversation) {
					console.warn('⚠️ Conversation not found - continuing stream');
					continue;
				}

				await sendWelcomeMessage(xmtpConversation);
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
		console.warn('⚠️ Node conversation stream ended unexpectedly - triggering recovery');
		throw new Error('Node conversation stream ended unexpectedly');
	} catch (streamError) {
		const errorMessage = streamError instanceof Error ? streamError.message : String(streamError);
		console.error('❌ Node conversation stream error:', errorMessage);

		// curried function to pass in the xmtp client so we don't have to rewrite our retry handler
		const createConversationStreamWithClient = (nodeClient: XmtpNodeClient) =>
			createConversationStream(client, nodeClient);

		// Trigger circuit breaker recovery
		await handleStreamFailureWithBackoff(nodeClient, createConversationStreamWithClient, conversationStreamTracker);
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
async function handleStreamFailureWithBackoff<T extends XmtpClient | XmtpNodeClient>(
	client: T,
	streamFunction: (client: T) => Promise<void>,
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
async function handleStreamRestart<T extends XmtpClient | XmtpNodeClient>(
	client: T,
	streamFunction: (client: T) => Promise<void>,
	tracker: StreamFailureTracker,
): Promise<void> {
	try {
		console.log('🔄 Attempting stream restart...');

		const conversations = client.conversations instanceof Function ? client.conversations() : client.conversations;

		// Sync client before restarting stream
		await conversations.sync().catch((error) => {
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

	const { client, nodeClient } = await initializeXmtpClient();

	// Start both message listener and conversation listener in parallel
	console.log('Starting listeners...');

	// listing before starting the streams seems to be a good way to ensure that old conversations are synced
	await client.conversations.list();

	// Starting the message stream syncs the conversations from the network to update the local db so we don't need to do it here
	await Promise.all([createMessageStream(client), createConversationStream(client, nodeClient)]);
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
