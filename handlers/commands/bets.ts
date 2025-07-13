import { FALLBACK_MESSAGE } from '#constants/messages.ts';
import { getBets } from '#helpers/onit.ts';
import { basenameToAddress } from '#utils/basename-to-address.ts';

import { stripIndents } from 'common-tags';
import { isAddress } from 'viem';

import type { Client } from 'onit-markets';
import type { XmtpClient, XmtpConversation } from '#clients/xmtp.ts';

export async function handleBetsCommand(
	onit: Client,
	conversation: XmtpConversation,
	client: XmtpClient,
	senderInboxId: string,
	args: string[] = [],
) {
	let targetAddress: string | undefined;

	if (args.length > 0) {
		if (isAddress(args[0] ?? '')) {
			targetAddress = args[0] ?? '';
		} else {
			// If a basename is provided, we need to look up their address
			const basename = args[0]?.toLowerCase();

			if (!basename) {
				return await conversation.send(
					stripIndents`
                Please provide a valid Basename.

                ${FALLBACK_MESSAGE}
                `,
				);
			}

			// Resolve the basename to an address
			const resolvedAddress = await basenameToAddress(basename);

			if (!resolvedAddress) {
				return await conversation.send(
					stripIndents`
                Sorry, I couldn't find a user with that Basename.

                ${FALLBACK_MESSAGE}
                `,
				);
			}

			targetAddress = resolvedAddress;
		}
	} else {
		// Get the sender's address
		const inboxState = await client.preferences.inboxStateFromInboxIds([senderInboxId]);
		targetAddress = inboxState[0]?.identifiers[0]?.identifier;
	}

	console.log({ targetAddress });

	if (!targetAddress) {
		return await conversation.send(
			stripIndents`
            Sorry, I couldn't find the wallet address.

            ${FALLBACK_MESSAGE}
            `,
		);
	}

	const predictionsResponse = await getBets(onit, targetAddress as `0x${string}`);

	if (!predictionsResponse.success) {
		return await conversation.send(
			stripIndents`
            Sorry, I encountered an error processing your command. ${predictionsResponse.error ?? 'Unknown error'}

            ${FALLBACK_MESSAGE}
            `,
		);
	}

	const predictions = predictionsResponse.data.predictions;

	if (predictions.length === 0) {
		return await conversation.send(
			stripIndents`
            No bets found for ${targetAddress}.

            ${FALLBACK_MESSAGE}
            `,
		);
	}

	await conversation.send(`Check out these Onit bets!`);
	await conversation.send(`https://onit.fun/u/${targetAddress}`);
}
