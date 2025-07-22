import { join } from 'node:path';
import process from 'node:process';
import {
	createClient as createNodeClient,
	LogLevel,
	type LogOptions,
	type Identifier as NodeIdentifier,
	SyncWorkerMode,
} from '@xmtp/node-bindings';
import {
	ApiUrls,
	generateInboxId,
	getInboxIdForIdentifier,
	HistorySyncUrls,
	type Identifier,
	IdentifierKind,
} from '@xmtp/node-sdk';
import { createWalletClient, http, toBytes } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

import type { Reaction } from '@xmtp/content-type-reaction';
import type { Client, ClientOptions, DecodedMessage, Signer } from '@xmtp/node-sdk';
import type { mlsTranscriptMessages } from '@xmtp/proto';

type GroupUpdated = mlsTranscriptMessages.GroupUpdated;

export type XmtpClient = Client<string | Reaction | GroupUpdated>;
export type XmtpConversation = NonNullable<Awaited<ReturnType<XmtpClient['conversations']['getConversationById']>>>;
export type XmtpMessage<HasFormattedContent extends boolean = false> = HasFormattedContent extends true
	? DecodedMessage & { formattedContent: string }
	: DecodedMessage & { formattedContent?: string };

interface User {
	key: `0x${string}`;
	account: ReturnType<typeof privateKeyToAccount>;
	wallet: ReturnType<typeof createWalletClient>;
}

export const createUser = (key: string): User => {
	const account = privateKeyToAccount(key as `0x${string}`);
	return {
		key: key as `0x${string}`,
		account,
		wallet: createWalletClient({
			account,
			chain: sepolia,
			transport: http(),
		}),
	};
};

export const createSigner = (key: string): Signer => {
	const sanitizedKey = key.startsWith('0x') ? key : `0x${key}`;
	const user = createUser(sanitizedKey);
	return {
		type: 'EOA',
		getIdentifier: () => ({
			identifierKind: IdentifierKind.Ethereum,
			identifier: user.account.address.toLowerCase(),
		}),
		signMessage: async (message: string) => {
			const signature = await user.wallet.signMessage({
				message,
				account: user.account,
			});
			return toBytes(signature);
		},
	};
};

// biome-ignore lint/suspicious/noExplicitAny: the content type doesn't matter
export const logAgentDetails = async (clients: Client<any> | Client<any>[]): Promise<void> => {
	const clientArray = Array.isArray(clients) ? clients : [clients];
	// biome-ignore lint/suspicious/noExplicitAny: the content type doesn't matter
	const clientsByAddress = clientArray.reduce<Record<string, Client<any>[]>>((acc, client) => {
		const address = client.accountIdentifier?.identifier as string;
		acc[address] = acc[address] ?? [];
		acc[address].push(client);
		return acc;
	}, {});

	for (const [address, clientGroup] of Object.entries(clientsByAddress)) {
		const firstClient = clientGroup[0]!;
		const inboxId = firstClient.inboxId;
		const environments = clientGroup.map((c) => c.options?.env ?? 'dev').join(', ');
		console.log(`\x1b[38;2;252;76;52m
        ██╗  ██╗███╗   ███╗████████╗██████╗ 
        ╚██╗██╔╝████╗ ████║╚══██╔══╝██╔══██╗
         ╚███╔╝ ██╔████╔██║   ██║   ██████╔╝
         ██╔██╗ ██║╚██╔╝██║   ██║   ██╔═══╝ 
        ██╔╝ ██╗██║ ╚═╝ ██║   ██║   ██║     
        ╚═╝  ╚═╝╚═╝     ╚═╝   ╚═╝   ╚═╝     
      \x1b[0m`);

		const urls = [`http://xmtp.chat/dm/${address}`];

		const conversations = await firstClient.conversations.list();
		const installations = await firstClient.preferences.inboxState();

		console.log(`
    ✓ XMTP Client:
    • Address: ${address}
    • Installations: ${installations.installations.length}
    • Conversations: ${conversations.length}
    • InboxId: ${inboxId}
    • Networks: ${environments}
    ${urls.map((url) => `• URL: ${url}`).join('\n')}`);
	}
};

export const createClient = async (identifier: Identifier, options?: ClientOptions) => {
	const env = options?.env || 'dev';
	const host = options?.apiUrl || ApiUrls[env];
	const isSecure = host.startsWith('https');
	const inboxId = (await getInboxIdForIdentifier(identifier, env)) || generateInboxId(identifier);
	const dbPath = options?.dbPath === undefined ? join(process.cwd(), `xmtp-${env}-${inboxId}.db3`) : options.dbPath;
	const logOptions: LogOptions = {
		structured: options?.structuredLogging ?? false,
		// @ts-expect-error - LogLevel.off is fine
		level: options?.loggingLevel ?? LogLevel.off,
	};
	const historySyncUrl = options?.historySyncUrl === undefined ? HistorySyncUrls[env] : options.historySyncUrl;

	const deviceSyncWorkerMode = options?.disableDeviceSync ? SyncWorkerMode.disabled : SyncWorkerMode.enabled;

	return createNodeClient(
		host,
		isSecure,
		dbPath,
		inboxId,
		identifier as unknown as NodeIdentifier,
		options?.dbEncryptionKey,
		historySyncUrl,
		deviceSyncWorkerMode,
		logOptions,
	);
};
