// test/Lottery.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Lottery Contract with VRF", function () {
    let Lottery, lottery, VRFCoordinatorMock, vrfCoordinatorMock;
    let owner, addr1, addr2;

    const initialBaseURI = "https://example.com/metadata";
    const ticketPrice = ethers.utils.parseEther("0.1"); // 0.1 ETH
    const maxTickets = 10;

    beforeEach(async function () {
        // Deployar el mock del coordinador VRF
        VRFCoordinatorMock = await ethers.getContractFactory("MyVRFCoordinatorMock");
        vrfCoordinatorMock = await VRFCoordinatorMock.deploy(100000000000000000, 1000000000, 1000000000000000000); // Base fee, gas price, LINK/ETH price

        // Desplegar el contrato de lotería
        Lottery = await ethers.getContractFactory("Lottery");
        lottery = await Lottery.deploy(initialBaseURI, vrfCoordinatorMock.address, ticketPrice, maxTickets);

        [owner, addr1, addr2] = await ethers.getSigners();
    });

    describe("Deployment", function () {
        it("Should set the right owner", async function () {
            expect(await lottery.hasRole(await lottery.DEFAULT_ADMIN_ROLE(), owner.address)).to.be.true;
        });

        it("Should set the initial state correctly", async function () {
            expect(await lottery.lotteryState()).to.equal(0); // OPEN
            expect(await lottery.ticketPrice()).to.equal(ticketPrice);
            expect(await lottery.maxTickets()).to.equal(maxTickets);
        });
    });

    describe("Buying Tickets", function () {
        it("Should allow users to buy tickets", async function () {
            await lottery.connect(addr1).buyTicket(2, { value: ticketPrice.mul(2) });
            expect(await lottery.playerTickets(addr1.address)).to.equal(2);
            expect(await lottery.nextTokenId()).to.equal(2);
        });

        it("Should revert if lottery is not open", async function () {
            await lottery.connect(addr1).buyTicket(10, { value: ticketPrice.mul(10) });
            await lottery.fulfillRandomWords(1, [0]); // Simular la respuesta de VRF
            await expect(lottery.connect(addr1).buyTicket(1, { value: ticketPrice })).to.be.revertedWith("Lottery is not open");
        });

        it("Should revert if ticket limit is reached", async function () {
            await lottery.connect(addr1).buyTicket(3, { value: ticketPrice.mul(3) });
            await expect(lottery.connect(addr1).buyTicket(1, { value: ticketPrice })).to.be.revertedWith("Player reached maximum ticket limit");
        });
    });

    describe("Randomness", function () {
        it("Should request randomness when max tickets are sold", async function () {
            await lottery.connect(addr1).buyTicket(10, { value: ticketPrice.mul(10) });
            expect(await lottery.lotteryState()).to.equal(1); // CALCULATING_WINNER
        });

        it("Should fulfill randomness and select a winner", async function () {
            await lottery.connect(addr1).buyTicket(10, { value: ticketPrice.mul(10) });
            await vrfCoordinatorMock.fulfillRandomWords(1, [0], lottery.address); // Simular la respuesta de VRF
            expect(await lottery.winnerAddress()).to.equal(addr1.address);
        });
    });
});