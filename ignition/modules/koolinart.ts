import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const KoolinartModule = buildModule("KoolinartModule", (m) => {
//   const defaultAdmin = m.getParameter("defaultAdmin");
//   const pauser = m.getParameter("pauser");
//   const minter = m.getParameter("minter");
const nftSellerAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";


const defaultAdmin = nftSellerAddress
const pauser = nftSellerAddress
const minter = nftSellerAddress

  console.log('defaultAdmin', defaultAdmin, 'pauser', pauser, 'minter', minter);
  

  const Koolinart = m.contract("Koolinart", [defaultAdmin]);

  return { Koolinart };
});

export default KoolinartModule;