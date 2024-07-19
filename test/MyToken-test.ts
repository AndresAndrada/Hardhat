import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { getAddress, parseUnits } from "viem";
import { byteCode } from "../config/byteCode"

describe("MyToken", function () {
  async function deployMyTokenFixture() {
    const [owner, defaultAdmin, pauser, minter, otherAccount] = await hre.viem.getWalletClients();

    // console.log('DEFAULTADMINNNN', defaultAdmin.account.address);
    // console.log('PAUSER', pauser.account.address);
    // console.log('MINTER', minter.account.address);

    const DEFAULTADMINNNN = defaultAdmin.account.address;
    const PAUSER = pauser.account.address;
    const MINTER = minter.account.address;
    
    // PASA 1 TEST
    // const myToken = await hre.viem.deployContract("MyToken", [DEFAULTADMINNNN, PAUSER, MINTER], {
    //   from: owner.account.address,
    // });
    // console.log('myTokennn', myToken);

    const myToken = await hre.viem.deployContract("MyToken", [DEFAULTADMINNNN, PAUSER, MINTER], {
      abi: [
        {
          "inputs": [
            { "internalType": "address", "name": "defaultAdmin", "type": "address" },
            { "internalType": "address", "name": "pauser", "type": "address" },
            { "internalType": "address", "name": "minter", "type": "address" }
          ],
          "stateMutability": "nonpayable",
          "type": "constructor"
        },
        {
          "inputs": [],
          "name": "DEFAULT_ADMIN_ROLE",
          "outputs": [{ "internalType": "bytes32", "name": "", "type": "bytes32" }],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [],
          "name": "PAUSER_ROLE",
          "outputs": [{ "internalType": "bytes32", "name": "", "type": "bytes32" }],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [],
          "name": "MINTER_ROLE",
          "outputs": [{ "internalType": "bytes32", "name": "", "type": "bytes32" }],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [{ "internalType": "address", "name": "account", "type": "address" }],
          "name": "hasRole",
          "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [{ "internalType": "address", "name": "account", "type": "address" }],
          "name": "balanceOf",
          "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [{ "internalType": "address", "name": "to", "type": "address" }, { "internalType": "uint256", "name": "amount", "type": "uint256" }],
          "name": "mint",
          "outputs": [],
          "stateMutability": "nonpayable",
          "type": "function"
        },
        {
          "inputs": [],
          "name": "pause",
          "outputs": [],
          "stateMutability": "nonpayable",
          "type": "function"
        },
        {
          "inputs": [],
          "name": "unpause",
          "outputs": [],
          "stateMutability": "nonpayable",
          "type": "function"
        },
        {
          "inputs": [],
          "name": "paused",
          "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [{ "internalType": "address", "name": "to", "type": "address" }, { "internalType": "uint256", "name": "amount", "type": "uint256" }],
          "name": "transfer",
          "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
          "stateMutability": "nonpayable",
          "type": "function"
        }
      ],
      bytecode: `0x${byteCode}`,
      args: [defaultAdmin.account.address, pauser.account.address, minter.account.address],
      account: owner.account.address,
    });

    const publicClient = await hre.viem.getPublicClient();

    return {
      myToken,
      owner,
      defaultAdmin,
      pauser,
      minter,
      otherAccount,
      publicClient,
    };
  }

  describe("Deployment", function () {
    it("Debería asignar correctamente los roles de admin, pauser y minter", async function () {
      const { myToken, defaultAdmin, pauser, minter } = await loadFixture(deployMyTokenFixture);

      // console.log('DEFAULTADMINNNN', defaultAdmin.account.address);
      // console.log('MINTER', minter.account.address);
      // console.log('PAUSER', pauser.account.address);

      const defaultAdminRole = await myToken.read.DEFAULT_ADMIN_ROLE();
      const pauserRole = await myToken.read.PAUSER_ROLE();
      const minterRole = await myToken.read.MINTER_ROLE();
      console.log(defaultAdminRole, 'ADMIN', pauserRole, 'PAUSA', minterRole, 'MINTER');
      

      expect(await myToken.read.hasRole(defaultAdminRole, defaultAdmin.account.address)).to.be.true;
      expect(await myToken.read.hasRole(pauserRole, pauser.account.address)).to.be.true;
      expect(await myToken.read.hasRole(minterRole, minter.account.address)).to.be.true;
    });

    it("Debería tener el saldo inicial correcto en la cuenta del owner", async function () {
      const { myToken, owner } = await loadFixture(deployMyTokenFixture);

      const ownerBalance = await myToken.read.balanceOf([owner.account.address]);      
      expect(ownerBalance).to.equal(parseUnits("1000000", 18));
    });
  });

  describe("Minting", function () {
    xit("Debería permitir acuñar tokens si tienes el rol de minter", async function () {
      const { myToken, minter, otherAccount } = await loadFixture(deployMyTokenFixture);

      await myToken.write.mint(otherAccount.account.address, parseUnits("1000", 18), { from: minter.account.address });
      const otherAccountBalance = await myToken.read.balanceOf([otherAccount.account.address]);
      expect(otherAccountBalance).to.equal(parseUnits("1000", 18));
    });

    xit("Debería revertir la acuñación de tokens si no tienes el rol de minter", async function () {
      const { myToken, owner, otherAccount } = await loadFixture(deployMyTokenFixture);

      const minterRole = await myToken.read.MINTER_ROLE();
      await expect(myToken.write.mint(otherAccount.account.address, parseUnits("1000", 18), { from: owner.account.address })).to.be.rejectedWith("AccessControl: account " + owner.account.address.toLowerCase() + " is missing role " + minterRole);
    });
  });

  describe("Pausing", function () {
    xit("Debería permitir pausar y despausar las transferencias si tienes el rol de pauser", async function () {
      const { myToken, pauser, owner, otherAccount } = await loadFixture(deployMyTokenFixture);

      await myToken.write.pause({ from: pauser.account.address });
      expect(await myToken.read.paused()).to.be.true;

      await expect(myToken.write.transfer(otherAccount.account.address, parseUnits("100", 18), { from: owner.account.address })).to.be.rejectedWith("Pausable: paused");

      await myToken.write.unpause({ from: pauser.account.address });
      expect(await myToken.read.paused()).to.be.false;

      await myToken.write.transfer(otherAccount.account.address, parseUnits("100", 18), { from: owner.account.address });
      const ownerBalance = await myToken.read.balanceOf([owner.account.address]);
      const otherAccountBalance = await myToken.read.balanceOf([otherAccount.account.address]);
      expect(ownerBalance).to.equal(parseUnits("999900", 18));
      expect(otherAccountBalance).to.equal(parseUnits("100", 18));
    });
  });
});
