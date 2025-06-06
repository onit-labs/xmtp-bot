import type { Client as XmtpClient } from "@xmtp/node-sdk";
import { Client } from "onit-markets";
import { getMarkets } from "#helpers/onit.ts";

type Conversation = NonNullable<
	Awaited<ReturnType<XmtpClient["conversations"]["getConversationById"]>>
>;

export async function handleListCommand(
	onit: Client,
	conversation: Conversation,
	tags: string[] = [],
) {
	const marketsResponse = await getMarkets(
		onit,
		tags.length > 0
			? // TODO: sanitize tags
				{ tags: tags.map((tag) => tag.toLowerCase()) }
			: undefined,
	);

	if (!marketsResponse.success) {
		return await conversation.send(
			`Sorry, I encountered an error processing your command. ${marketsResponse.error}

              You can find all markets at https://onit.fun/
              `,
		);
	}

	const markets = marketsResponse.data.markets;

	if (markets.length === 0) {
		return await conversation.send(
			`No markets found. You can find all our markets at https://onit.fun/`,
		);
	}

	const isSingleTag = tags.length === 1;

	return await conversation.send(
		`Recent Onit Markets:\n\n${markets.map((market) => market.question).join("\n")}
            ${
							isSingleTag
								? `\nYou can find all ${tags.at(0)} markets at https://onit.fun/${tags.at(0)}`
								: `\nYou can find all markets at https://onit.fun/`
						}`,
	);
}
