import { onitClient } from '#clients/onit.ts';
import { commands, fallbackMessage } from '#constants/commands.ts';
import { ONIT_TRIGGERS } from '#constants.ts';
import { handleListCommand } from '#handlers/commands/list.ts';
import { callBot } from '#helpers/onit.ts';

import type { DecodedMessage } from '@xmtp/node-sdk';
import type { XmtpClient, XmtpConversation, XmtpMessage } from '#clients/xmtp.ts';

function isFormattedMessage(message: XmtpMessage): message is XmtpMessage<true> {
	return message.formattedContent !== undefined;
}

/**
 * Handle incoming XMTP messages.
 *
 * @param message - The decoded XMTP message
 * @param client - The XMTP client instance
 */
export async function handleMessage(message: XmtpMessage, client: XmtpClient) {
	let conversation: XmtpConversation | null = null;
	try {
		const senderInboxId = message.senderInboxId;
		const botInboxId = client.inboxId.toLowerCase();

		// Ignore messages from the bot itself
		if (senderInboxId.toLowerCase() === botInboxId) return;

		// Extract the message content from the message & store it in the message object
		message.formattedContent = extractMessageContent(message);

		if (!isFormattedMessage(message)) {
			throw new Error(`Unable to extract message content, skipping`);
		}

		console.log(`MESSAGE RECEIVED: ${message.formattedContent} from ${senderInboxId}`);

		// Get the conversation first
		conversation = (await client.conversations.getConversationById(message.conversationId)) as XmtpConversation | null;
		if (!conversation) {
			throw new Error(`Could not find conversation for ID: ${message.conversationId}`);
		}

		const shouldRespond = await shouldRespondToMessage(message, botInboxId, client);
		console.log('[handleMessage] shouldRespond', shouldRespond);

		// Check if message should trigger the Onit agent
		if (!shouldRespond) {
			// Check if they mentioned the bot but didn't use proper triggers
			if (shouldSendHelpHint(message.formattedContent)) {
				const helpMessage =
					"👋 Hi! I'm the Onit agent. You asked for help! Try to invoke the agent with @onit or just @onit.base.eth\n";
				await conversation.send(helpMessage);
				console.log(`NEW MESSAGE SENT: ${helpMessage} to ${senderInboxId}`);
			}
			return;
		}

		// Get the sender's wallet address
		const senderInboxState = await client.preferences.inboxStateFromInboxIds([senderInboxId]);
		const senderWalletAddress = senderInboxState?.[0]?.recoveryIdentifier?.identifier;

		if (!senderWalletAddress) throw new Error(`Unable to find sender wallet address, skipping`);

		const response = await processMessage(message, conversation, client);

		console.log('[processMessage] response', response);

		// Don't send "TOOL_HANDLED" responses - these indicate tools have already sent direct messages
		if (response.trim() === 'TOOL_HANDLED') return;

		// Separate Onit links from the response
		const { cleanedMessage, extractedLinks } = separateOnitLinks(response);

		// Send the cleaned message if it's not empty
		if (cleanedMessage.trim()) {
			await conversation.send(cleanedMessage);
			console.log(`NEW MESSAGE SENT: ${cleanedMessage} to ${senderInboxId}`);
		}

		// Send each extracted Onit link as a separate message
		for (const link of extractedLinks) {
			await conversation.send(link);
			console.log(`NEW ONIT LINK SENT: ${link} to ${senderInboxId}`);
		}
	} catch (error) {
		if (conversation) {
			const errorMessage = 'I encountered an error while processing your request. Please try again later.';
			await conversation.send(errorMessage);
			console.log(`MESSAGE SENT: ${errorMessage} to ${message.senderInboxId}`);
		}
	}
}

/**
 * Separate Onit links from a message
 * @param message - The message to separate links from
 * @returns An object containing the cleaned message and the extracted links
 * @dev - required as links with other text in xmtp don't show the OG properly
 */
function separateOnitLinks(message: string): { cleanedMessage: string; extractedLinks: string[] } {
	try {
		// Input validation
		if (!message || typeof message !== 'string') {
			return { cleanedMessage: message || '', extractedLinks: [] };
		}

		// Standard URL regex pattern that handles query params, fragments, and stops at sentence punctuation
		const onitUrlRegex = /https:\/\/onit\.fun\/[^\s<>"{}|\\^`\[\]]*[^\s<>"{}|\\^`\[\].,!?;:)]/g;

		const matches = message.match(onitUrlRegex);

		if (!matches || matches.length === 0) {
			return { cleanedMessage: message, extractedLinks: [] };
		}

		// Extract the full URLs
		const extractedLinks = matches;

		// Remove the links from the original message
		let cleanedMessage = message;
		matches.forEach((match) => {
			cleanedMessage = cleanedMessage.replace(match, '').trim();
		});

		// Clean up any extra whitespace
		cleanedMessage = cleanedMessage.replace(/\s+/g, ' ').trim();

		return { cleanedMessage, extractedLinks };
	} catch (error) {
		// If anything goes wrong, return the original message unchanged
		console.error('Error in separateOnitLinks:', error);
		return { cleanedMessage: message, extractedLinks: [] };
	}
}

/**
 * Process a message with the agent.
 *
 * @param message - The message to process
 * @param conversation - The XMTP conversation
 * @param client - The XMTP client
 * @returns The processed response as a string
 */
async function processMessage(
	message: XmtpMessage<true>,
	conversation: XmtpConversation,
	client: XmtpClient,
): Promise<string> {
	console.log('Processing message:', message);

	const words = message.formattedContent.split(' ');
	const [firstWord, ...rest] = words;

	// If no command found and a trigger is found, call the bot
	if (
		(!checkForCommand(message.formattedContent) && checkForTrigger(message.formattedContent)) ||
		(await isDirectMessage(message, client))
	) {
		console.log('calling bot', message.id, conversation.id);
		const response = await callBot(message, conversation, client);
		return response.data.message;
	}

	let command: string | null = null;
	const args: string[] = [];

	const sanitizedFirstWord = firstWord?.toLowerCase().trim();
	console.log('[processMessage] sanitizedFirstWord', sanitizedFirstWord);
	switch (true) {
		case sanitizedFirstWord === '@onit': {
			const sanitizedSecondWord = rest.at(0)?.toLowerCase().trim() ?? null;
			command = sanitizedSecondWord;
			args.push(...rest.slice(1));
			break;
		}
		case sanitizedFirstWord?.startsWith('/'): {
			command = sanitizedFirstWord?.replace('/', '') ?? null;
			args.push(...rest);
			break;
		}
	}

	console.log('command:', command);
	console.log('args:', args);

	// Handle the command
	try {
		switch (command) {
			case commands.list.command:
			case `/${commands.list.command}`: {
				await handleListCommand(onitClient, conversation, args);
				return 'TOOL_HANDLED';
			}
			case commands.help.command:
			case `/${commands.help.command}`: {
				await conversation.send(fallbackMessage);
				return 'TOOL_HANDLED';
			}
			// case commands.bets.command:
			// case `/${commands.bets.command}`: {
			// 	const senderInboxState = await client.preferences.inboxStateFromInboxIds([conversation.id]);
			// 	const senderWalletAddress = senderInboxState?.[0]?.recoveryIdentifier?.identifier;
			// 	if (!senderWalletAddress) return "Sorry, I couldn't find your wallet address.";

			// 	await handleBetsCommand(onitClient, conversation, client, conversation.id, args);
			// 	return 'TOOL_HANDLED';
			// }
			// case commands.copy.command:
			// case `/${commands.copy.command}`: {
			// 	if (!args[0]) return 'Please specify a market number to copy. Example: /copy 1';

			// 	const senderInboxState = await client.preferences.inboxStateFromInboxIds([conversation.id]);
			// 	const senderWalletAddress = senderInboxState?.[0]?.recoveryIdentifier?.identifier;
			// 	if (!senderWalletAddress) return "Sorry, I couldn't find your wallet address.";

			// 	await handleCopyCommand(onitClient, conversation, args[0], senderWalletAddress);
			// 	return 'TOOL_HANDLED';
			// }
			default: {
				// If command not recognized, try the bot
				await callBot(message, conversation, client);
				return 'TOOL_HANDLED';
			}
		}
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.error('Error processing command:', errorMessage);
		return 'Sorry, I encountered an error processing your command.\n\n' + fallbackMessage;
	}
}

/**
 * Check if a message should trigger the agent
 * @param message - The decoded XMTP message
 * @param agentInboxId - The agent's inbox ID
 * @param client - The XMTP client instance
 * @returns Promise<boolean> - Whether the agent should respond
 */
async function shouldRespondToMessage(
	message: XmtpMessage<true>,
	agentInboxId: string,
	client: XmtpClient,
): Promise<boolean> {
	// Safety check for empty content
	if (!message.formattedContent || message.formattedContent.trim() === '') return false;

	const lowerMessage = message.formattedContent.toLowerCase().trim();

	if (await isDirectMessage(message, client)) return true;
	if (await isReplyToAgent(message, agentInboxId, client)) return true;
	if (checkForTrigger(lowerMessage)) return true;
	if (checkForCommand(lowerMessage)) return true;

	return false;
}

async function isDirectMessage(message: XmtpMessage<true>, client: XmtpClient): Promise<boolean> {
	const conversation = await client.conversations.getConversationById(message.conversationId);
	if (!conversation) return false;
	const metadata = await conversation.metadata();
	return metadata?.conversationType === 'dm';
}

/**
 * Check if a message is a reply to the agent
 * @param message - The decoded XMTP message
 * @param agentInboxId - The agent's inbox ID
 * @param client - The XMTP client instance
 * @returns Promise<boolean> - Whether the message is a reply to the agent
 */
async function isReplyToAgent(message: DecodedMessage, agentInboxId: string, client: XmtpClient): Promise<boolean> {
	// Check if the message is a reply type
	if (message.contentType?.typeId === 'reply') {
		try {
			// Check the parameters for the reference message ID
			const messageAny = message as unknown as { parameters: { reference: string } };
			const parameters = messageAny?.parameters;

			if (!parameters || !parameters.reference) {
				return false;
			}

			const referenceMessageId = parameters.reference;

			// Get the conversation to find the referenced message
			const conversation = await client.conversations.getConversationById(message.conversationId);

			if (!conversation) return false;

			// Get recent messages to find the referenced one
			const messages = await conversation.messages({ limit: 100 });
			const referencedMessage = messages.find((msg) => msg.id === referenceMessageId);

			if (!referencedMessage) return false;

			// Check if the referenced message was sent by the agent
			const isReplyToAgent = referencedMessage.senderInboxId.toLowerCase() === agentInboxId.toLowerCase();

			return isReplyToAgent;
		} catch (error) {
			return false;
		}
	}
	return false;
}

function shouldSendHelpHint(message: string): boolean {
	const lowerMessage = message.toLowerCase().trim();
	const botMentions = ['/bot', '/agent', '/ai', '/help'];

	return (
		botMentions.some((mention) => lowerMessage.includes(mention)) &&
		!ONIT_TRIGGERS.some((trigger) => lowerMessage.includes(trigger.toLowerCase()))
	);
}

/**
 * Extract message content from different message types
 * @param message - The decoded XMTP message
 * @returns The message content as a string
 */
function extractMessageContent(message: XmtpMessage<false>): string {
	// Handle reply messages
	// TODO: parse content types properly with type-safety
	if (message.contentType?.typeId === 'reply') {
		// biome-ignore lint/suspicious/noExplicitAny: TODO: parse content types properly with type-safety
		const messageAny = message as any;
		// biome-ignore lint/suspicious/noExplicitAny: TODO: parse content types properly with type-safety
		const replyContent = message.content as any;
		console.log(`🔍 Reply content debug:`, replyContent);

		// Check if content is in the main content field
		if (replyContent && typeof replyContent === 'object') {
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
		if (messageAny.fallback && typeof messageAny.fallback === 'string') {
			console.log(`🔍 Found content in fallback field: "${messageAny.fallback}"`);

			// Extract the actual user message from the fallback format
			// Format: 'Replied with "actual message" to an earlier message'
			const fallbackText = messageAny.fallback;
			const match = fallbackText.match(/Replied with "(.+)" to an earlier message/);
			if (match?.[1]) {
				const actualMessage = match[1];
				console.log(`🔍 Extracted actual reply content: "${actualMessage}"`);
				return actualMessage;
			}

			// If pattern doesn't match, return the full fallback text
			return fallbackText;
		}

		// Check parameters field (might contain reply data)
		if (messageAny.parameters && typeof messageAny.parameters === 'object') {
			const params = messageAny.parameters;
			if (params.content) {
				console.log(`🔍 Found content in parameters.content: "${params.content}"`);
				return String(params.content);
			}
			if (params.text) {
				console.log(`🔍 Found content in parameters.text: "${params.text}"`);
				return String(params.text);
			}
		}

		// If content is null/undefined, return empty string to avoid errors
		if (replyContent === null || replyContent === undefined) {
			console.log(`⚠️ Reply content is null/undefined, checking other fields failed`);
			return '';
		}

		// Fallback to stringifying the whole content if structure is different
		return JSON.stringify(replyContent);
	}

	// Handle regular text messages
	const content = message.content;
	if (content === null || content === undefined) {
		return '';
	}
	return String(content);
}

const checkForCommand = (message: string) => {
	const lowerMessage = message.toLowerCase().trim();
	return Object.values(commands).some((cmd) => {
		const cmdStr = cmd.command.toLowerCase();
		// If the message starts with the command
		return (
			lowerMessage.startsWith(`/${cmdStr}`)
		);
	});
};

const checkForTrigger = (message: string) => {
	const lowerMessage = message.toLowerCase().trim();
	return ONIT_TRIGGERS.some((trigger) => lowerMessage.includes(trigger.toLowerCase()));
};
