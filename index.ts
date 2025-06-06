import { commands, fallbackMessage } from '#constants.ts';
import { handleListCommand } from '#handlers/commands/list.ts';
import { handleTrendingCommand } from '#handlers/commands/trending.ts';
import { createSigner, logAgentDetails } from '#helpers/client.ts';

import { Client, type XmtpEnv } from '@xmtp/node-sdk';
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

async function main() {
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
	console.log('✓ Syncing conversations...');
	await client.conversations.sync();

	console.log('Waiting for messages...');
	/* Stream all messages from the network */
	const stream = await client.conversations.streamAllMessages();

	for await (const message of stream) {
		/* Ignore messages from the same agent or non-text messages */
		if (
			message?.senderInboxId.toLowerCase() === client.inboxId.toLowerCase() ||
			message?.contentType?.typeId !== 'text'
		) {
			continue;
		}

		console.log(`Received message: ${message.content as string} by ${message.senderInboxId}`);

		/* Get the conversation by id */
		const conversation = await client.conversations.getConversationById(message.conversationId);

		if (!conversation) {
			console.log('Unable to find conversation, skipping');
			continue;
		}

		const inboxState = await client.preferences.inboxStateFromInboxIds([message.senderInboxId]);

		const memberAddress = inboxState[0]?.identifiers[0]?.identifier;

		if (!memberAddress) {
			console.log('Unable to find member address, skipping');
			continue;
		}

		const messageContent = message.content as string;
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
		if (!command) continue;

		// Handle the command
		try {
			switch (command) {
				case commands.list.command:
				case `/${commands.list.command}`: {
					await handleListCommand(onit, conversation, args);
					break;
				}
				case commands.trending.command:
				case `/${commands.trending.command}`: {
					await handleTrendingCommand(onit, conversation);
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
	}
}

main().catch(console.error);
