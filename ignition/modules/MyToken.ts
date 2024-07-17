import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const MyTokenModule = buildModule("MyTokenModule", (m) => {
  const defaultAdmin = m.getParameter("defaultAdmin");
  const pauser = m.getParameter("pauser");
  const minter = m.getParameter("minter");

  const myToken = m.contract("MyToken", [defaultAdmin, pauser, minter]);

  return { myToken };
});

export default MyTokenModule;
