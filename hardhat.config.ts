import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-viem";
const { ALCHEMY_API_KEY, PRIVATE_KEY } = process.env;

const config: HardhatUserConfig = {
  solidity: "0.8.24",
  // networks: {
  //   sepolia: {
  //     url: `https://base-sepolia.infura.io/v3/${ALCHEMY_API_KEY}`,
  //     accounts: [`0x${PRIVATE_KEY}`]
  //   }
  // },
};

export default config;
