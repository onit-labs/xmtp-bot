import { createSigner, logAgentDetails } from '#clients/xmtp.ts';
import { ENCRYPTION_KEY, WALLET_KEY, XMTP_ENV } from '#constants.ts';
import { sendWelcomeMessage } from '#handlers/handleConversation.ts';
import { handleMessage } from '#handlers/handleMessage.ts';

import { ReactionCodec } from '@xmtp/content-type-reaction';
import { Client } from '@xmtp/node-sdk';
import { toBytes } from 'viem/utils';

import type { XmtpEnv } from '@xmtp/node-sdk';
import type { XmtpClient } from '#clients/xmtp.ts';

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

	/* Initialize the xmtp client */
	const client = await Client.create(signer, clientOptions);

	void logAgentDetails(client);

	console.log(`📝 Agent Inbox ID: ${client.inboxId}`);

	return { client };
}

/**
 * Start listening for XMTP messages using v4.0.0 StreamOptions API
 *
 * @param client - The XMTP client instance
 */
async function createMessageStream(client: XmtpClient) {
	console.log('📡 Creating message stream with v4.0.0 API...');

	// Create the message stream with v4.0.0 StreamOptions
	const stream = await client.conversations.streamAllMessages({
		onValue: async (message) => {
			try {
				console.log('📥 New message received:', {
					messageId: message.id,
					senderInboxId: message.senderInboxId,
					conversationId: message.conversationId,
				});

				await handleMessage(message, client);
			} catch (error: unknown) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				console.error('❌ Error processing message:', errorMessage);

				if (errorMessage.includes('group with welcome id')) {
					console.warn('⚠️ Group welcome message error - continuing stream');
					return;
				}

				if (errorMessage.includes('sqlcipher') || errorMessage.includes('encryption')) {
					console.warn('⚠️ Database encryption error - continuing stream');
					return;
				}

				// For unknown errors, log more details but continue processing
				console.error('❌ Unknown error type - continuing stream:', {
					messageId: message.id,
					senderInboxId: message.senderInboxId,
					conversationId: message.conversationId,
					error: errorMessage,
				});
			}
		},
		onError: (error) => {
			console.error('⚠️ Stream error (will continue):', error.message || error);
		},
		onRestart: () => {
			console.log('🔄 Stream restarted automatically');
		},
		onEnd: () => {
			console.log('🏁 Stream ended');
		},
		onFail: () => {
			console.warn('❌ Stream failed completely');
		},
		// Configure retry behavior (v4.0.0 defaults: 6 retries, 10s delay)
		retryAttempts: 6,
		retryDelay: 10000,
		retryOnFail: true,
	});

	console.log('✅ XMTP message stream active with built-in retry - waiting for messages...');

	return stream;
}

/**
 * Start listening for new conversations using v4.0.0 StreamOptions API
 *
 * @param client - The XMTP client instance
 */
async function createConversationStream(client: XmtpClient) {
	console.log('📞 Creating conversation stream with v4.0.0 API...');

	// TODO update this tracking and use storage
	// For now, detect new conversations by monitoring streamAllMessages for new conversation IDs
	const seenConversations = new Set<string>();

	// Initialize with existing conversations
	const existingConversations = await client.conversations.list();
	existingConversations.forEach((conv) => seenConversations.add(conv.id));
	console.log(`✅ Initialized with ${existingConversations.length} existing conversations`);

	// Monitor for new conversations via message stream
	// This is a workaround until we confirm conversation streaming in main client
	const conversationDetectionStream = await client.conversations.stream({
		onValue: async (conversation) => {
			if (!conversation) return;

			const isNewConversation = !seenConversations.has(conversation.id);

			if (isNewConversation) {
				seenConversations.add(conversation.id);

				try {
					console.log('📥 New conversation detected via message:', { conversationId: conversation.id });
					await sendWelcomeMessage(conversation);
				} catch (error) {
					console.error('❌ Error processing detected conversation:', error);
				}
			}
		},
		onError: (error) => {
			console.error('⚠️ Conversation detection stream error:', error);
		},
		onRestart: () => {
			console.log('🔄 Conversation detection stream restarted');
		},
		retryAttempts: 6,
		retryDelay: 10000,
		retryOnFail: true,
	});

	console.log('✅ XMTP conversation detection active - monitoring message stream for new conversations...');

	return conversationDetectionStream;
}

async function main() {
	console.log('Initializing Onit XMTP Agent');

	const { client } = await initializeXmtpClient();

	// Start both message and conversation streams
	console.log('Starting streams...');

	// Sync conversations before starting the streams
	await client.conversations.list();

	// Start both streams in parallel with v4.0.0 built-in retry functionality
	await Promise.all([createMessageStream(client), createConversationStream(client)]);
}

// Start the bot with basic error handling
main().catch((error) => {
	console.error('❌ Failed to start bot:', error);
	console.log('🆘 Manual intervention required - check logs for details');
	// Let the process manager handle restarts
	process.exit(1);
});
