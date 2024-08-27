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
      url: `https://base-sepolia.infura.io/v3/5c17da17578a413195e387c9a5cdcfce`,
      accounts: [`b890d957ccd00d189e7e51173cd5a0cdbf6659f6a30e502d1a978e279fc64e4e`]
    }
  },
};

export default config;