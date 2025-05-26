import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const KoolinartModule = buildModule("KoolinartModule", (m) => {
//   const defaultAdmin = m.getParameter("defaultAdmin");
//   const pauser = m.getParameter("pauser");
//   const minter = m.getParameter("minter");
const nftSellerAddress = "0x634C9885b1B5896D75d3591b41Ea3164c1048a92";


const defaultAdmin = nftSellerAddress
const pauser = nftSellerAddress
const minter = nftSellerAddress

  const Koolinart = m.contract("Koolinart", [defaultAdmin]);

  return { Koolinart };
});

export default KoolinartModule;