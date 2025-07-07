import { type Address, createPublicClient, http, namehash } from 'viem';
import { base } from 'viem/chains';

const BASENAME_L2_RESOLVER_ADDRESS = '0xC6d566A56A1aFf6508b41f6c90ff131615583BCD' as const;

const L2_RESOLVER_ABI = [
    {
        inputs: [{ name: 'node', type: 'bytes32' }],
        name: 'addr',
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
] as const;

const publicClient = createPublicClient({
    chain: base,
    transport: http(),
});

/**
 * Resolves a Basename to an Ethereum address
 * @param basename The Basename to resolve (e.g. "jamco1.base.eth")
 * @returns The resolved Ethereum address or null if not found
 */
export async function basenameToAddress(basename: string): Promise<Address | null> {
    try {
        const normalizedBasename = basename.toLowerCase().endsWith('.base.eth')
            ? basename.toLowerCase()
            : `${basename.toLowerCase()}.base.eth`;

        const address = await publicClient.readContract({
            address: BASENAME_L2_RESOLVER_ADDRESS,
            abi: L2_RESOLVER_ABI,
            functionName: 'addr',
            args: [namehash(normalizedBasename)],
        });

        return address as Address;
    } catch (error) {
        console.error('Error resolving Basename:', error);
        return null;
    }
} 