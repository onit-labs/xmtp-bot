import { encodeAbiParameters, getContractAddress, keccak256, parseAbiParameters } from "viem";

import type { Address, Hex } from "viem";

// const ONIT_FACTORY_ADDRESS =  0x0ad810a4EEd4e5155535DcDCdee488294649B367 // prod
const ONIT_FACTORY_ADDRESS = "0x1146888211833ebf3a9a50248ec9d617ae0ae72d"; // local
const ONIT_IMPLEMENTATION_ADDRESS = "0x97AE7793E64e036c004087C5Cfd50C32FFD043F7";

export function getMarketSalt({
  bettingCutoff,
  question,
  initiator,
  factoryAddress = ONIT_FACTORY_ADDRESS,
}: {
  bettingCutoff: bigint;
  question: string;
  initiator: Address;
  factoryAddress?: Address;
}) {
  return keccak256(
    encodeAbiParameters(parseAbiParameters("address,address,uint256,string"), [
      factoryAddress,
      initiator,
      bettingCutoff,
      question,
    ])
  );
}

function getSoladyCloneInitCodeHash(implementation: Address) {
  return keccak256(
    ("0x602c3d8160093d39f33d3d3d3d363d3d37363d73" +
      implementation.replace(/^0x/, "") +
      "5af43d3d93803e602a57fd5bf3") as Hex
  );
}

/**
 * Predicts the address of a market contract using the Solady clone init code hash.
 * @param implementation - The address of the implementation contract.
 * @param salt - The salt value for the CREATE2 operation.
 * @param deployer - The address of the deployer.
 * @returns The predicted market address.
 */
export function _predictMarketAddress({
  implementation,
  salt,
  deployer,
}: {
  implementation: Address;
  salt: Hex;
  deployer: Address;
}) {
  return getContractAddress({
    from: deployer,
    salt: salt,
    opcode: "CREATE2",
    bytecodeHash: getSoladyCloneInitCodeHash(implementation),
  });
}

export function predictMarketAddress({
  initiator,
  bettingCutoff,
  question,
  implementation = ONIT_IMPLEMENTATION_ADDRESS,
  factoryAddress = ONIT_FACTORY_ADDRESS,
  deployer = factoryAddress,
}: {
  initiator: Address;
  bettingCutoff: bigint;
  question: string;
  deployer?: Address;
  factoryAddress?: Address;
  implementation?: Address;
}) {
  return _predictMarketAddress({
    implementation,
    salt: getMarketSalt({ factoryAddress, initiator, bettingCutoff, question }),
    deployer,
  });
}
