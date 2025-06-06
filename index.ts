import { Client, type XmtpEnv } from "@xmtp/node-sdk";
import { getClient } from "onit-markets";
import { toBytes } from "viem/utils";
import { z } from "zod";
import { createSigner, logAgentDetails } from "#helpers/client.ts";
import { getMarkets } from "#helpers/onit.ts";

// Initialize the client with your API endpoint
const onit = getClient("https://markets.onit-labs.workers.dev", {
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
		XMTP_ENV: z.enum(["dev", "prod"]),
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
	console.log("✓ Syncing conversations...");
	await client.conversations.sync();

	console.log("Waiting for messages...");
	/* Stream all messages from the network */
	const stream = await client.conversations.streamAllMessages();

	for await (const message of stream) {
		/* Ignore messages from the same agent or non-text messages */
		if (
			message?.senderInboxId.toLowerCase() === client.inboxId.toLowerCase() ||
			message?.contentType?.typeId !== "text"
		) {
			continue;
		}

		console.log(
			`Received message: ${message.content as string} by ${message.senderInboxId}`,
		);

		/* Get the conversation by id */
		const conversation = await client.conversations.getConversationById(
			message.conversationId,
		);

		if (!conversation) {
			console.log("Unable to find conversation, skipping");
			continue;
		}

		const inboxState = await client.preferences.inboxStateFromInboxIds([
			message.senderInboxId,
		]);

		const memberAddress = inboxState[0]?.identifiers[0]?.identifier;

		if (!memberAddress) {
			console.log("Unable to find member address, skipping");
			continue;
		}

		const messageContent = message.content as string;
		const command = messageContent.toLowerCase().trim();

		try {
			switch (command) {
				case "/list": {
					const marketsResponse = await getMarkets(onit, {
						tags: ["sports"],
					});

					if (!marketsResponse.success) {
						await conversation.send(
							`Sorry, I encountered an error processing your command. ${marketsResponse.error}

              You can find all markets at https://onit.fun/
              `,
						);
						break;
					}

					const markets = marketsResponse.data.markets;

					await conversation.send(
						`\n${markets.map((market) => market.question).join("\n")}`,
					);

					break;
				}
				// case "/watch": // get notifications for trades on market, choose frequency etc
				// 	break;
				// case "/trending":
				// 	break;
				default:
					await conversation.send(
						"I am the Onit Bot for interacting with the Onit Prediction Markets her are the available commands:\n" +
							// "Available commands:\n" +
							"/list - List all markets\n",
						//+ "/watch - Watch a market\n" +
						// "/trending - Trending markets\n",
					);
			}
		} catch (error: unknown) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			console.error("Error processing command:", errorMessage);
			await conversation.send(
				"Sorry, I encountered an error processing your command.",
			);
		}
	}
}

main().catch(console.error);
