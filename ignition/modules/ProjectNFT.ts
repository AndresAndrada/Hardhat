import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const ProjectNFTModule = buildModule("ProjectNFT", (m) => {
  const nftSellerAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

  const defaultAdmin = nftSellerAddress;

  console.log("defaultAdmin", defaultAdmin);

  const nftERC721 = m.contract("ProjectNFT", [defaultAdmin]);

  return { nftERC721 };
});

export default ProjectNFTModule;
