import { createPublicClient } from "viem";
import { http } from "viem";
import { base } from "viem/chains";

const publicClient = createPublicClient({
    chain: base,
    transport: http(),
});

export const checkAddressExists = async (address: string) => {
    const code = await publicClient.getCode({
        address: address as `0x${string}`,
    });
    return code !== '0x';
}