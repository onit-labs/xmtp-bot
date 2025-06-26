import { fallbackMessage } from '../../constants/commands';
import { getBets } from '#helpers/onit.ts';
import { basenameToAddress } from '../../utils/basename-to-address';

import { stripIndents } from 'common-tags';
import { Client } from 'onit-markets';

import type { Client as XmtpClient } from '@xmtp/node-sdk';
import { isAddress } from 'viem';

type ConversationType = NonNullable<Awaited<ReturnType<XmtpClient['conversations']['getConversationById']>>>;

export async function handleBetsCommand(onit: Client, conversation: ConversationType, client: XmtpClient, senderInboxId: string, args: string[] = []) {
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

                ${fallbackMessage}
                `,
                );
            }

            // Resolve the basename to an address
            const resolvedAddress = await basenameToAddress(basename);

            if (!resolvedAddress) {
                return await conversation.send(
                    stripIndents`
                Sorry, I couldn't find a user with that Basename.

                ${fallbackMessage}
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

            ${fallbackMessage}
            `,
        );
    }

    const predictionsResponse = await getBets(onit, targetAddress as `0x${string}`);

    if (!predictionsResponse.success) {
        return await conversation.send(
            stripIndents`
            Sorry, I encountered an error processing your command. ${predictionsResponse.error ?? 'Unknown error'}

            ${fallbackMessage}
            `,
        );
    }

    const predictions = predictionsResponse.data.predictions;

    if (predictions.length === 0) {
        return await conversation.send(
            stripIndents`
            No bets found for ${targetAddress}.

            ${fallbackMessage}
            `,
        );
    }

    await conversation.send(`Check out these Onit bets!`);
    await conversation.send(`https://onit.fun/u/${targetAddress}`);
} 