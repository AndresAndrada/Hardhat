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
    base: {
      url: "https://base-mainnet.infura.io/v3/91f9b679e13441bfb45630d71e380a3b",
      accounts: [`60d6ed3ecd20abb2a54ff4519717c6ddfab1ad1f46cddb0f6dd6cf98a3a1afa4`],
      chainId: 8453
    },
  },
};

export default config;