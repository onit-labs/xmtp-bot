import { WELCOME_MESSAGES } from '#constants/messages.ts';

import type { XmtpConversation } from '#clients/xmtp.ts';

/**
 * Send a welcome message to a conversation
 * @param conversation - The conversation to send the welcome message to
 * @param client - The XMTP client instance
 */
export async function sendWelcomeMessage(conversation: XmtpConversation): Promise<void> {
	// Get conversation metadata to determine if it's a DM or group
	const metadata = await conversation.metadata();
	const isDirectMessage = metadata?.conversationType === 'dm';

	switch (metadata?.conversationType) {
		case 'dm':
			await conversation.send(WELCOME_MESSAGES.DM);
			break;
		case 'group':
			await conversation.send(WELCOME_MESSAGES.GROUP);
			break;
	}

	console.log(`Welcome message sent to ${isDirectMessage ? 'DM' : 'group'} conversation: ${conversation.id}`);
}
