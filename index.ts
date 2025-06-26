import { commands, fallbackMessage } from '#constants.ts';
import { handleListCommand } from '#handlers/commands/list.ts';
import { handleBetsCommand } from '#handlers/commands/bets.ts';
import { handleCopyCommand } from '#handlers/commands/copy.ts';
import { createSigner, logAgentDetails } from '#helpers/client.ts';

import { Client, type XmtpEnv, type DecodedMessage, type Conversation } from '@xmtp/node-sdk';
import { getClient } from 'onit-markets';
import { toBytes } from 'viem/utils';
import { z } from 'zod';

// Initialize the client with your API endpoint
const onit = getClient('https://markets.onit-labs.workers.dev', {
	headers: {
		Authorization: `Bearer ${process.env.ONIT_API_KEY}`,
	},
});

/* Get the wallet key associated to the public key of
 * the agent and the encryption key for the local db
 * that stores your agent's messages */
const { WALLET_KEY, ENCRYPTION_KEY, XMTP_ENV } = z
	.object({
		WALLET_KEY: z.string(),
		ENCRYPTION_KEY: z.string(),
		XMTP_ENV: z.enum(['dev', 'production']),
	})
	.parse(process.env);

const ONIT_TEST_TRIGGERS = ['@onit-test', '@onit-test.base.eth'];
const ONIT_TRIGGERS = ["@onit", "@onit.base.eth", ...(process.env.NODE_ENV !== 'production' ? ONIT_TEST_TRIGGERS : [])];

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

/**
 * Handle incoming XMTP messages.
 *
 * @param message - The decoded XMTP message
 * @param client - The XMTP client instance
 */
async function handleMessage(message: DecodedMessage, client: Client) {
	let conversation: Conversation | null = null;
	try {
		const senderAddress = message.senderInboxId;
		const botAddress = client.inboxId.toLowerCase();

		// Ignore messages from the bot itself
		if (senderAddress.toLowerCase() === botAddress) {
			return;
		}

		const messageContent = extractMessageContent(message);
		console.log(
			`MESSAGE RECEIVED: ${messageContent} from ${senderAddress}`,
		);

		// Get the conversation first
		conversation = (await client.conversations.getConversationById(
			message.conversationId,
		)) as Conversation | null;
		if (!conversation) {
			throw new Error(
				`Could not find conversation for ID: ${message.conversationId}`,
			);
		}

		// Check if message should trigger the Onit agent
		if (!(await shouldRespondToMessage(message, client.inboxId, client))) {
			// Check if they mentioned the bot but didn't use proper triggers
			if (shouldSendHelpHint(messageContent)) {
				const helpMessage =
					"👋 Hi! I'm the Onit agent. You asked for help! Try to invoke the agent with @onit or just @onit.base.eth\n";
				await conversation.send(helpMessage);
				console.log(`NEW MESSAGE SENT: ${helpMessage} to ${senderAddress}`);
			}
			return;
		}

		// Get the sender's wallet address
		const senderInboxState = await client.preferences.inboxStateFromInboxIds([
			senderAddress,
		]);
		const senderWalletAddress =
			senderInboxState?.[0]?.recoveryIdentifier?.identifier;

		if (!senderWalletAddress) {
			throw new Error(`Unable to find sender wallet address, skipping`);
		}

		const response = await processMessage(messageContent, conversation);

		// Don't send "TOOL_HANDLED" responses - these indicate tools have already sent direct messages
		if (response.trim() === "TOOL_HANDLED") {
			return;
		}

		const sentMessageId = await conversation.send(response);
		console.log(`NEW MESSAGE SENT: ${response} to ${senderAddress}`);
	} catch (error) {
		if (conversation) {
			const errorMessage =
				"I encountered an error while processing your request. Please try again later.";
			await conversation.send(errorMessage);
			console.log(
				`MESSAGE SENT: ${errorMessage} to ${message.senderInboxId}`,
			);
		}
	}
}

/**
 * Process a message with the agent.
 *
 * @param message - The message to process
 * @returns The processed response as a string
 */
async function processMessage(
	message: string,
	conversation: Conversation,
): Promise<string> {
	let response = "";

	console.log('Processing message:', message);

	// TMP WHILE CONVERTING
	const messageContent = message
	const words = messageContent.split(' ');
	const [firstWord, ...rest] = words;

	// Extract command and args based on format
	const { command, args } = (() => {
		if (firstWord?.toLowerCase() === '@onit') {
			return {
				command: rest[0]?.toLowerCase(),
				args: rest.slice(1)
			};
		}
		if (firstWord?.toLowerCase().startsWith('/')) {
			return {
				command: firstWord.toLowerCase().replace('/', ''),
				args: rest
			};
		}
		return { command: null, args: [] };
	})();

	// If no command found, ignore the message
	if (!command) return '';

	// Handle the command
	try {
		switch (command) {
			case commands.list.command:
			case `/${commands.list.command}`: {
				await handleListCommand(onit, conversation, args);
				break;
			}
			case commands.bets.command:
			case `/${commands.bets.command}`: {
				await handleBetsCommand(onit, conversation, client, message.senderInboxId, args);
				break;
			}
			case 'copy':
			case '/copy': {
				if (!args[0]) {
					await conversation.send('Please specify a market number to copy. Example: /copy 1');
					break;
				}
				await handleCopyCommand(onit, conversation, args[0], memberAddress);
				break;
			}
			default: {
				await conversation.send(fallbackMessage);
				break;
			}
		}
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.error('Error processing command:', errorMessage);
		await conversation.send('Sorry, I encountered an error processing your command.\n\n' + fallbackMessage);
	}

	try {
		// Call bot DO with message
		// TODO build full agent into the bot DO

		return response.trim();
	} catch (error) {
		return "Sorry, I encountered an error while processing your request. Please try again later.";
	}
}

/**
 * Check if a message should trigger the Squabble agent
 * @param message - The decoded XMTP message
 * @param agentInboxId - The agent's inbox ID
 * @param client - The XMTP client instance
 * @returns Promise<boolean> - Whether the agent should respond
 */
async function shouldRespondToMessage(
	message: DecodedMessage,
	agentInboxId: string,
	client: Client,
): Promise<boolean> {
	const messageContent = extractMessageContent(message);

	// Safety check for empty content
	if (!messageContent || messageContent.trim() === "") {
		return false;
	}

	const lowerMessage = messageContent.toLowerCase().trim();

	// If this is a reply to the agent, always process it
	if (await isReplyToAgent(message, agentInboxId, client)) {
		return true;
	}

	// Check if message contains any trigger words/phrases
	const hasTrigger = ONIT_TRIGGERS.some((trigger) =>
		lowerMessage.includes(trigger.toLowerCase()),
	);

	return hasTrigger;
}

/**
* Extract message content from different message types
* @param message - The decoded XMTP message
* @returns The message content as a string
*/
function extractMessageContent(message: DecodedMessage): string {
	// Handle reply messages
	if (message.contentType?.typeId === "reply") {
		const messageAny = message as any;
		const replyContent = message.content as any;
		console.log(`🔍 Reply content debug:`, replyContent);

		// Check if content is in the main content field
		if (replyContent && typeof replyContent === "object") {
			// Try different possible property names for the actual content
			if (replyContent.content) {
				return String(replyContent.content);
			}
			if (replyContent.text) {
				return String(replyContent.text);
			}
			if (replyContent.message) {
				return String(replyContent.message);
			}
		}

		// Check fallback field (might contain the actual user message)
		if (messageAny.fallback && typeof messageAny.fallback === "string") {
			console.log(
				`🔍 Found content in fallback field: "${messageAny.fallback}"`,
			);

			// Extract the actual user message from the fallback format
			// Format: 'Replied with "actual message" to an earlier message'
			const fallbackText = messageAny.fallback;
			const match = fallbackText.match(
				/Replied with "(.+)" to an earlier message/,
			);
			if (match && match[1]) {
				const actualMessage = match[1];
				console.log(`🔍 Extracted actual reply content: "${actualMessage}"`);
				return actualMessage;
			}

			// If pattern doesn't match, return the full fallback text
			return fallbackText;
		}

		// Check parameters field (might contain reply data)
		if (messageAny.parameters && typeof messageAny.parameters === "object") {
			const params = messageAny.parameters;
			if (params.content) {
				console.log(
					`🔍 Found content in parameters.content: "${params.content}"`,
				);
				return String(params.content);
			}
			if (params.text) {
				console.log(`🔍 Found content in parameters.text: "${params.text}"`);
				return String(params.text);
			}
		}

		// If content is null/undefined, return empty string to avoid errors
		if (replyContent === null || replyContent === undefined) {
			console.log(
				`⚠️ Reply content is null/undefined, checking other fields failed`,
			);
			return "";
		}

		// Fallback to stringifying the whole content if structure is different
		return JSON.stringify(replyContent);
	}

	// Handle regular text messages
	const content = message.content;
	if (content === null || content === undefined) {
		return "";
	}
	return String(content);
}

/**
 * Check if a message is a reply to the agent
 * @param message - The decoded XMTP message
 * @param agentInboxId - The agent's inbox ID
 * @param client - The XMTP client instance
 * @returns Promise<boolean> - Whether the message is a reply to the agent
 */
async function isReplyToAgent(
	message: DecodedMessage,
	agentInboxId: string,
	client: Client,
): Promise<boolean> {
	// Check if the message is a reply type
	if (message.contentType?.typeId === "reply") {
		try {
			// Check the parameters for the reference message ID
			const messageAny = message as any;
			const parameters = messageAny.parameters;

			if (!parameters || !parameters.reference) {
				return false;
			}

			const referenceMessageId = parameters.reference;

			// Get the conversation to find the referenced message
			const conversation = await client.conversations.getConversationById(
				message.conversationId,
			);

			if (!conversation) {
				return false;
			}

			// Get recent messages to find the referenced one
			const messages = await conversation.messages({ limit: 100 });
			const referencedMessage = messages.find(
				(msg) => msg.id === referenceMessageId,
			);

			if (!referencedMessage) {
				return false;
			}

			// Check if the referenced message was sent by the agent
			const isReplyToAgent =
				referencedMessage.senderInboxId.toLowerCase() ===
				agentInboxId.toLowerCase();

			return isReplyToAgent;
		} catch (error) {
			return false;
		}
	}
	return false;
}

function shouldSendHelpHint(message: string): boolean {
	const lowerMessage = message.toLowerCase().trim();
	const botMentions = ["/bot", "/agent", "/ai", "/help"];

	return (
		botMentions.some((mention) => lowerMessage.includes(mention)) &&
		!ONIT_TRIGGERS.some((trigger) =>
			lowerMessage.includes(trigger.toLowerCase()),
		)
	);
}

async function main() {
	console.log('Initializing Onit XMTP Agent');

	const client = await initializeXmtpClient();

	console.log('Waiting for messages...');

	await startMessageListener(client);

}

main().catch(console.error);
