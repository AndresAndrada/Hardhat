// scripts/fundAccount.ts
import { ethers } from "hardhat";

async function main() {
  const [sender] = await ethers.getSigners();
  const tx = await sender.sendTransaction({
    to: "0x634C9885b1B5896D75d3591b41Ea3164c1048a92",
    value: ethers.parseEther("10") // Envía 10 ETH
  });
  await tx.wait();
  console.log("Cuenta fondeada:", tx.hash);
}

main().catch(console.error);