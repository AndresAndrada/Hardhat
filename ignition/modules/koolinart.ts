import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const KoolinartModule = buildModule("KoolinartModule", (m) => {
//   const defaultAdmin = m.getParameter("defaultAdmin");
//   const pauser = m.getParameter("pauser");
//   const minter = m.getParameter("minter");
const nftSellerAddress = "0xf7BEE672c8152fc86A9EA01080FBAc07831d13d3";


const defaultAdmin = nftSellerAddress
const pauser = nftSellerAddress
const minter = nftSellerAddress

  const Koolinart = m.contract("Koolinart", [defaultAdmin]);

  return { Koolinart };
});

export default KoolinartModule;