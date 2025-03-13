import { expect } from "chai";
import { ethers } from "hardhat";
import { Bank } from "../typechain-types";

describe("Bank Contract", function () {
    let bank: Bank;
    let owner: any, addr1: any, addr2: any;

    beforeEach(async function () {
        [owner, addr1, addr2] = await ethers.getSigners();
        const BankFactory = await ethers.getContractFactory("Bank");
        bank = (await BankFactory.deploy()) as Bank;
    });

    it("Debe permitir a los usuarios agregar balance", async function () {
        await bank.connect(addr1).addBalance(100);
        expect(await bank.connect(addr1).getBalance()).to.equal(100);
    });

    it("Debe mostrar el balance correcto del usuario", async function () {
        await bank.connect(addr1).addBalance(200);
        expect(await bank.connect(addr1).getBalance()).to.equal(200);
    });

    it("Debe permitir transferencias entre cuentas", async function () {
        await bank.connect(addr1).addBalance(300);
        await bank.connect(addr1).transfer(addr2.address, 150);

        expect(await bank.connect(addr1).getBalance()).to.equal(150);
        expect(await bank.connect(addr2).getBalance()).to.equal(150);
    });

    it("Debe revertir si un usuario intenta transferir más balance del que tiene", async function () {
        await bank.connect(addr1).addBalance(100);
        await expect(
            bank.connect(addr1).transfer(addr2.address, 200)
        ).to.be.reverted;
    });

    it("Debe emitir un evento de transferencia", async function () {
        await bank.connect(addr1).addBalance(500);
        await expect(bank.connect(addr1).transfer(addr2.address, 200))
            .to.emit(bank, "Transfer")
            .withArgs(addr1.address, addr2.address, 200);
    });
});
