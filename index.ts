import { createClient, createSigner, logAgentDetails } from '#clients/xmtp.ts';
import { ENCRYPTION_KEY, WALLET_KEY, XMTP_ENV } from '#constants.ts';
import { sendWelcomeMessage } from '#handlers/handleConversation.ts';
import { handleMessage } from '#handlers/handleMessage.ts';

import { ReactionCodec } from '@xmtp/content-type-reaction';
import { Client } from '@xmtp/node-sdk';
import { toBytes } from 'viem/utils';

import type { XmtpEnv } from '@xmtp/node-sdk';
import type { XmtpClient } from '#clients/xmtp.ts';

type XmtpNodeClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Initialize the XMTP client.
 *
 * @returns An initialized XMTP Client instance and Node Client
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

	/* Initialize both the xmtp client and node client */
	const client = await Client.create(signer, clientOptions);
	const nodeClient = await createClient(identifier, clientOptions);

	void logAgentDetails(client);

	console.log(`📝 Agent Inbox ID: ${client.inboxId}`);

	return { client, nodeClient };
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
 * @param nodeClient - The node client instance
 */
async function createConversationStream(
	client: XmtpClient,
	nodeClient: XmtpNodeClient,
) {
	console.log('📞 Creating conversation stream with v4.0.0 API...');

	// Sync conversations first
	const conversations = nodeClient.conversations();
	await conversations.sync();
	console.log('✅ Conversations synced');

	// Create the conversation stream with v4.0.0 StreamOptions
	const stream = conversations.stream(
		async (err, conversation) => {
			if (err) {
				console.error('⚠️ Conversation stream error (will continue):', err.message || err);
				return;
			}

			if (!conversation) {
				console.log('📭 Received null conversation - ignoring');
				return;
			}

			try {
				const id = conversation.id();

				console.log('📥 New conversation received:', {
					conversationId: id,
				});

				const xmtpConversation = await client.conversations.getConversationById(id).catch((error) => {
					console.error('Error getting conversation by id:', error);
					return null;
				});

				if (!xmtpConversation) {
					console.warn('⚠️ Conversation not found - continuing stream');
					return;
				}

				await sendWelcomeMessage(xmtpConversation);
			} catch (error: unknown) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				console.error('❌ Error processing new conversation:', errorMessage);

				if (errorMessage.includes('group with welcome id')) {
					console.warn('⚠️ Group welcome message error - continuing stream');
					return;
				}

				if (errorMessage.includes('conversation not found') || errorMessage.includes('invalid conversation')) {
					console.warn('⚠️ Invalid conversation error - continuing stream');
					return;
				}

				// For unknown errors, log more details but continue processing
				console.error('❌ Unknown conversation error type - continuing stream:', {
					conversationId: conversation.id(),
					error: errorMessage,
				});
			}
		},
		() => {
			console.log('🏁 Conversation stream ended');
		}
	);

	console.log('✅ XMTP conversation stream active - waiting for new conversations...');

	return stream;
}

async function main() {
	console.log('Initializing Onit XMTP Agent');

	const { client, nodeClient } = await initializeXmtpClient();

	// Start both message and conversation streams
	console.log('Starting streams...');

	// Sync conversations before starting the streams
	await client.conversations.list();

	// Start both streams in parallel with v4.0.0 built-in retry functionality
	await Promise.all([
		createMessageStream(client),
		createConversationStream(client, nodeClient)
	]);
}

// Start the bot with basic error handling
main().catch((error) => {
	console.error('❌ Failed to start bot:', error);
	console.log('🆘 Manual intervention required - check logs for details');
	// Let the process manager handle restarts
	process.exit(1);
});
