import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-viem";
import "@nomicfoundation/hardhat-ethers";

const config: HardhatUserConfig = {
  solidity:{
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true

    },
  },
  networks: {
    sepolia: {
      url: "https://base-sepolia.infura.io/v3/91f9b679e13441bfb45630d71e380a3b",
      accounts: [`ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`],
      chainId: 84532
    },
    base: {
      url: "https://base-mainnet.infura.io/v3/91f9b679e13441bfb45630d71e380a3b",
      accounts: [`ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`],
      chainId: 8453
    },
  },
};

export default config;