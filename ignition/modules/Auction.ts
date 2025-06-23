import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const NFTAuctionModule = buildModule("NFTAuction", (m) => {
  const nftSellerAddress = "0xc00764111e7fF015713766241A4B1dF9d98f102B";

  const defaultAdmin = nftSellerAddress;

  console.log("defaultAdmin", defaultAdmin);

  const nftERC721 = m.contract("NFTAuction", [defaultAdmin]);

  return { nftERC721 };
});

export default NFTAuctionModule;
