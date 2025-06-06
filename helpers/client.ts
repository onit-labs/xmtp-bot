import type { Client, Signer } from "@xmtp/node-sdk";
import { IdentifierKind } from "@xmtp/node-sdk";
import { createWalletClient, http, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

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
	const sanitizedKey = key.startsWith("0x") ? key : `0x${key}`;
	const user = createUser(sanitizedKey);
	return {
		type: "EOA",
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

export const logAgentDetails = async (
	clients: Client | Client[],
): Promise<void> => {
	const clientArray = Array.isArray(clients) ? clients : [clients];
	const clientsByAddress = clientArray.reduce<Record<string, Client[]>>(
		(acc, client) => {
			const address = client.accountIdentifier?.identifier as string;
			acc[address] = acc[address] ?? [];
			acc[address].push(client);
			return acc;
		},
		{},
	);

	for (const [address, clientGroup] of Object.entries(clientsByAddress)) {
		const firstClient = clientGroup[0]!;
		const inboxId = firstClient.inboxId;
		const environments = clientGroup
			.map((c: Client) => c.options?.env ?? "dev")
			.join(", ");
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
    ${urls.map((url) => `• URL: ${url}`).join("\n")}`);
	}
};
