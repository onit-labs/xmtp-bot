import { FALLBACK_MESSAGE } from '#constants/messages.ts';
import { getMarket, PRIVATE_MARKET_TAG, postMarket, XMTP_MARKET_TAG } from '#helpers/onit.ts';
import { checkAddressExists } from '#utils/check-address-exists.ts';
import { generateInitialBet } from '#utils/dummy-bets.ts';
import { predictMarketAddress } from '#utils/predict-market-address.ts';
import { validateMarket } from '#utils/validate-market.ts';

import { stripIndents } from 'common-tags';
import SuperJSON from 'superjson';
import { isAddress } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

import type { Client } from 'onit-markets';
import type { XmtpConversation } from '#clients/xmtp.ts';

export async function handleCopyCommand(
	onit: Client,
	conversation: XmtpConversation,
	marketNumber: string,
	initiator: string,
) {
	// Get the last message from the conversation
	const messages = await conversation.messages();
	const lastMessage = messages[messages.length - 3]; // Most recent message

	if (!lastMessage || typeof lastMessage.content !== 'string') {
		return await conversation.send(
			stripIndents`
import type { Client as XmtpClient } from '@xmtp/node-sdk';
import type { Client } from 'onit-markets';
            No previous message found. Please use /list first to see available markets.

            ${FALLBACK_MESSAGE}
            `,
		);
	}

	// Extract addresses from the last message
	const addressMatch = lastMessage.content.match(/Market Addresses:\[(.*?)\]/);
	if (!addressMatch || !addressMatch[1]) {
		return await conversation.send(
			stripIndents`
            Could not find market addresses in the previous message. Please use /list first.

            ${FALLBACK_MESSAGE}
            `,
		);
	}

	const addresses = addressMatch[1].split(',').map((addr: string) => addr.trim());
	const index = Number.parseInt(marketNumber) - 1;

	if (Number.isNaN(index) || index < 0 || index >= addresses.length) {
		return await conversation.send(
			stripIndents`
            Invalid market number. Please select a number from the list.

            ${FALLBACK_MESSAGE}
            `,
		);
	}

	// const marketAddress = '0xaD61e491564D76a41DC823Ca95acd3Db5B3b4dBc' //addresses[index];
	const marketAddress = addresses[index];
	console.log({ marketAddress });

	if (!marketAddress || !isAddress(marketAddress)) {
		return await conversation.send(
			stripIndents`
            Invalid market address. Please use /list first.

            ${FALLBACK_MESSAGE}
            `,
		);
	}

	// Get the market details
	const marketResponse = await getMarket(onit, marketAddress);
	console.log({ marketResponse });

	if (!marketResponse.success) {
		return await conversation.send(
			stripIndents`
            Sorry, I encountered an error fetching the market. ${marketResponse.error ?? 'Unknown error'}

            ${FALLBACK_MESSAGE}
            `,
		);
	}

	// biome-ignore lint/suspicious/noExplicitAny: TODO: fix this
	const marketToCopy = marketResponse.data as any;
	console.log({ marketToCopy });

	// Create a copy of the market
	const marketData = {
		...marketToCopy,
		question: marketToCopy.questionTitle,
		metadata: {
			...marketToCopy.metadata,
			tags: [
				// Never make the private market trending
				...(marketToCopy.metadata?.tags ?? []).filter((tag: string) => tag !== 'Trending'),
				PRIVATE_MARKET_TAG,
				`${XMTP_MARKET_TAG}_${conversation.id.toString()}`,
			],
		},
		bettingCutoff: 0n, // marketToCopy.betCutoff, TODO better logic here to avoid deploying markets that ended in the past
		initialBet: generateInitialBet(marketToCopy),
	};
	console.log({ marketData });

	const predictedCopiedMarketAddress = predictMarketAddress({
		initiator: initiator as `0x${string}`,
		bettingCutoff: 0n, // marketToCopy.bettingCutoff, TODO better logic here to avoid deploying markets that ended in the past
		question: marketToCopy.questionTitle,
	});

	const addressExists = await checkAddressExists(predictedCopiedMarketAddress);

	/**
	 * The salt used by the factory uses the question, betting cutoff, and initiator address.
	 * If this initiator has already deployed a market with this question and betting cutoff,
	 * then we need to use some other random address for the bet
	 *
	 * This is not ideal, but an acceptable step to ensure we can always deploy a copy
	 */
	if (addressExists) {
		const privateKey = generatePrivateKey();
		const randomAccount = privateKeyToAccount(privateKey);
		marketData.initiator = randomAccount.address;
	} else {
		marketData.initiator = initiator as `0x${string}`;
	}

	// Validate the market data based on its type
	const validatedMarket = validateMarket(marketData);
	console.log({ validatedMarket });
	if (!validatedMarket) {
		return await conversation.send(
			stripIndents`
                Invalid market type: ${marketToCopy.marketType}

                ${FALLBACK_MESSAGE}
                `,
		);
	}

	const data = await postMarket(onit, JSON.parse(SuperJSON.stringify(validatedMarket)));

	if (!data.success) {
		console.log({ data: JSON.stringify(data.error) });
		return await conversation.send(
			stripIndents`
            Sorry, I encountered an error copying the market.'}

            ${FALLBACK_MESSAGE}
            `,
		);
	}

	const newMarket = data.data.marketAddress;
	await conversation.send(`We're deploying your groups private prediction market! View it here:`);
	await conversation.send(`https://onit.fun/m/${newMarket}`);
}
