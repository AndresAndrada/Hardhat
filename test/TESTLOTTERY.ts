import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import hre from "hardhat";

describe("Lottery", function () {
  async function deployLotteryFixture() {
    const [owner, player1, player2, player3] = await hre.ethers.getSigners();

    const subscriptionId = 1; // Replace with a valid Chainlink subscription ID
    const keyHash = "0x123456789abcdef"; // Replace with a valid key hash

    const Lottery = await hre.ethers.getContractFactory("Lottery");
    const lottery = await Lottery.deploy(subscriptionId, keyHash);

    await lottery.deployed();

    return { lottery, owner, player1, player2, player3, subscriptionId, keyHash };
  }

  describe("Deployment", function () {
    it("Should set the correct initial state", async function () {
      const { lottery } = await loadFixture(deployLotteryFixture);

      expect(await lottery.lotteryState()).to.equal(1); // CLOSED
      expect(await lottery.lotteryId()).to.equal(1);
    });
  });

  describe("startNewLottery", function () {
    it("Should start a new lottery", async function () {
      const { lottery } = await loadFixture(deployLotteryFixture);

      await lottery.startNewLottery();
      expect(await lottery.lotteryState()).to.equal(0); // OPEN
    });

    it("Should revert if the lottery is not closed", async function () {
      const { lottery } = await loadFixture(deployLotteryFixture);

      await lottery.startNewLottery();
      await expect(lottery.startNewLottery()).to.be.revertedWith("Lottery is already running.");
    });
  });

  describe("enter", function () {
    it("Should allow players to enter the lottery", async function () {
      const { lottery, player1, player2 } = await loadFixture(deployLotteryFixture);

      await lottery.startNewLottery();

      await lottery.connect(player1).enter({ value: hre.ethers.utils.parseEther("1") });
      await lottery.connect(player2).enter({ value: hre.ethers.utils.parseEther("1") });

      expect(await lottery.getPlayerCount()).to.equal(2);
    });

    it("Should revert if lottery is not open", async function () {
      const { lottery, player1 } = await loadFixture(deployLotteryFixture);

      await expect(
        lottery.connect(player1).enter({ value: hre.ethers.utils.parseEther("1") })
      ).to.be.revertedWith("Lottery is not open.");
    });

    it("Should revert if no ETH is sent", async function () {
      const { lottery, player1 } = await loadFixture(deployLotteryFixture);

      await lottery.startNewLottery();
      await expect(lottery.connect(player1).enter()).to.be.revertedWith("Must send ETH to enter.");
    });
  });

  describe("pickWinner", function () {
    it("Should pick a winner and reset the lottery", async function () {
      const { lottery, player1, player2 } = await loadFixture(deployLotteryFixture);

      await lottery.startNewLottery();

      await lottery.connect(player1).enter({ value: hre.ethers.utils.parseEther("1") });
      await lottery.connect(player2).enter({ value: hre.ethers.utils.parseEther("1") });

      const tx = await lottery.pickWinner();

      // Since randomness is handled by Chainlink, we'll only verify the emitted event
      await expect(tx).to.emit(lottery, "RequestSent");
    });

    it("Should revert if no players have entered", async function () {
      const { lottery } = await loadFixture(deployLotteryFixture);

      await lottery.startNewLottery();
      await expect(lottery.pickWinner()).to.be.revertedWith("No players in the lottery.");
    });

    it("Should revert if lottery is not open", async function () {
      const { lottery } = await loadFixture(deployLotteryFixture);

      await expect(lottery.pickWinner()).to.be.revertedWith("Lottery is not open.");
    });
  });

  describe("fulfillRandomWords (Mocked)", function () {
    it("Should distribute the prize to the winner", async function () {
      const { lottery, player1, player2 } = await loadFixture(deployLotteryFixture);

      await lottery.startNewLottery();

      await lottery.connect(player1).enter({ value: hre.ethers.utils.parseEther("1") });
      await lottery.connect(player2).enter({ value: hre.ethers.utils.parseEther("1") });

      const totalBalance = await hre.ethers.provider.getBalance(lottery.address);

      // Mock the VRF response
      const randomWinnerIndex = 1; // Let's assume player2 wins
      await lottery.fulfillRandomWords(1, [randomWinnerIndex]);

      const player2BalanceAfter = await hre.ethers.provider.getBalance(player2.address);

      expect(await hre.ethers.provider.getBalance(lottery.address)).to.equal(0); // Contract balance should be empty
      expect(player2BalanceAfter).to.be.above(totalBalance); // Player2 should have received the prize
    });

    it("Should revert if not called during winner calculation", async function () {
      const { lottery } = await loadFixture(deployLotteryFixture);

      await expect(lottery.fulfillRandomWords(1, [0])).to.be.revertedWith(
        "Not calculating winner."
      );
    });
  });
});
