import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const ERC721FreeModule = buildModule("ERC721FREE", (m) => {
  const nftSellerAddress = "0x48e81c23Fc0C42bFaE6d70cF53c70b352689DBfC";

  const defaultAdmin = nftSellerAddress;

  console.log("defaultAdmin", defaultAdmin);

  const nftERC721 = m.contract("ERC721FREE", [defaultAdmin]);

  return { nftERC721 };
});

export default ERC721FreeModule;
