import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";
require("@nomicfoundation/hardhat-chai-matchers");
import "@nomicfoundation/hardhat-toolbox-viem";
const config: HardhatUserConfig = {
  solidity:{
    version: "0.8.22",
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
      url: "http://192.168.1.51:8545/",
      accounts: [`0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`],
      chainId: 31337
    },
   base: {
      url: "https://base-mainnet.infura.io/v3/91f9b679e13441bfb45630d71e380a3b",
      accounts: ["f3fff43b41367eed2e0be45c974f7731f596b70363f0142beeb16ba63a051179"],
      chainId: 8453
    },
    dazlabs: {
      url: "http://192.168.1.12:8545",
      accounts: [`ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`],
      chainId: 31337
    },
  },
};

export default config;