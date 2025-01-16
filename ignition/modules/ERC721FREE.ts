import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const ERC721FreeModule = buildModule("ERC721Free", (m) => {
  const nftSellerAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

  const defaultAdmin = nftSellerAddress;

  console.log("defaultAdmin", defaultAdmin);

  const nftERC721 = m.contract("ERC721Free", [defaultAdmin]);

  return { nftERC721 };
});

export default ERC721FreeModule;
