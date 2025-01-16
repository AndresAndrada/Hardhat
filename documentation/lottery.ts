import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import { parseEther } from "viem";
import hre from "hardhat";
const helpers = require("@nomicfoundation/hardhat-network-helpers");

describe("Lottery", function () {
  async function deployContractsFixture() {
    const accounts = await hre.viem.getWalletClients();
    const publicClient = await hre.viem.getPublicClient();
    const maxTickets = 3n; // Definimos explícitamente maxTickets = 3

    const lottery = await hre.viem.deployContract("Lottery", [
      "https://example.com/metadata",
      parseEther("0.1"),
      maxTickets,
    ]);

    return { 
      lottery, 
      defaultAdmin: accounts[0], 
      player1: accounts[1], 
      player2: accounts[2],
      publicClient
    };
  }

  describe("Deployment", function () {
    it("Should set the correct initial state", async function () {
      const { lottery } = await loadFixture(deployContractsFixture);
      expect(await lottery.read.lotteryState()).to.equal(0);
    });

    it("Should set the correct ticket price", async function () {
      const { lottery } = await loadFixture(deployContractsFixture);
      expect(await lottery.read.ticketPrice()).to.equal(parseEther("0.1"));
    });

    it("Should set the correct fee recipient", async function () {
      const { lottery, defaultAdmin } = await loadFixture(deployContractsFixture);
      const feeRecipient = await lottery.read.feeRecipient();
      expect(feeRecipient.toLowerCase()).to.equal(
        defaultAdmin.account.address.toLowerCase()
      );
    });
  });

  describe("Buying Tickets", function () {
    it("Should allow players to buy tickets", async function () {
      const { lottery, player1 } = await loadFixture(deployContractsFixture);
      
      await lottery.write.buyTicket(
        [1],
        { 
          value: parseEther("0.1"),
          account: player1.account.address
        }
      );

      const tickets = await lottery.read.playerTickets([player1.account.address]);
      expect(tickets).to.equal(1n);
    });

    it("Should emit TicketPurchased event", async function () {
      const { lottery, player1, publicClient } = await loadFixture(deployContractsFixture);
      
      const hash = await lottery.write.buyTicket(
        [1],
        { 
          value: parseEther("0.1"),
          account: player1.account.address
        }
      );

      await publicClient.waitForTransactionReceipt({ hash });
      
      const events = await lottery.getEvents.TicketPurchased();
      expect(events[0].args.buyer.toLowerCase()).to.equal(
        player1.account.address.toLowerCase()
      );
    });

    it("Should not allow buying more than the max tickets per player", async function () {
      const { lottery, player1, publicClient } = await loadFixture(deployContractsFixture);
      
      // Intentar comprar más del máximo permitido por jugador (MAX_TICKETS_PER_PLAYER = 3)
      await expect(
        lottery.write.buyTicket(
          [4], // Intentar comprar 4 tickets cuando el máximo es 3
          { 
            value: parseEther("0.4"),
            account: player1.account.address
          }
        )
      ).to.be.rejectedWith("MaxTicketsPerPlayerExceeded");

      // Verificar que el estado no cambió
      const tickets = await lottery.read.playerTickets([player1.account.address]);
      expect(tickets).to.equal(0n);
    });

    it("Should automatically select winner when max tickets are sold", async function () {
      const { lottery, player1, player2, publicClient } = await loadFixture(deployContractsFixture);
      
      await lottery.write.buyTicket(
        [2],
        { 
          value: parseEther("0.2"),
          account: player1.account.address
        }
      );
      
      const hash = await lottery.write.buyTicket(
        [1],
        { 
          value: parseEther("0.1"),
          account: player2.account.address
        }
      );

      await publicClient.waitForTransactionReceipt({ hash });
      
      // Verificar que hubo un ganador
      const winner = await lottery.read.winnerAddress();
      expect(winner).to.not.equal("0x0000000000000000000000000000000000000000");
      
      // Verificar que la lotería se reseteó
      const state = await lottery.read.lotteryState();
      expect(state).to.equal(0n); // OPEN
    });

    it("Should revert if trying to buy tickets when max is reached", async function () {
      const { lottery, player1, player2, publicClient } = await loadFixture(deployContractsFixture);
      
      // Definimos explícitamente los valores como BigInt
      const maxTickets = 3n;
      const player1Amount = 2n;
      const player2Amount = 1n;
      
      // Primero compramos tickets hasta llegar al máximo
      await lottery.write.buyTicket(
          [Number(player1Amount)], // Convertimos a Number para la llamada
          { 
              value: parseEther("0.2"),
              account: player1.account.address
          }
      );
      
      await lottery.write.buyTicket(
          [Number(player2Amount)], // Convertimos a Number para la llamada
          { 
              value: parseEther("0.1"),
              account: player2.account.address
          }
      );

      // Verificamos que estamos en el límite
      const ticketsSold = await lottery.read.getTicketsSold();
      expect(ticketsSold).to.equal(maxTickets);

      // Ahora intentamos comprar un ticket más
      try {
          await lottery.write.buyTicket(
              [1n],
              { 
                  value: parseEther("0.1"),
                  account: player1.account.address
              }
          );
          expect.fail("La transacción debería haber fallado");
      } catch (error: any) {
          expect(error.message).to.include("MaximumTicketsReached");
      }

      // Verificamos que el estado no cambió
      const finalTicketsSold = await lottery.read.getTicketsSold();
      expect(finalTicketsSold).to.equal(maxTickets);
      
      // Verificamos que los tickets por jugador no cambiaron
      const player1Tickets = await lottery.read.playerTickets([player1.account.address]);
      expect(player1Tickets).to.equal(player1Amount);
      
      const player2Tickets = await lottery.read.playerTickets([player2.account.address]);
      expect(player2Tickets).to.equal(player2Amount);
  });
    it("Should not allow buying more tickets than MAX_TICKETS_PER_TX", async function () {
      const { lottery, player1 } = await loadFixture(deployContractsFixture);
      
      await expect(
        lottery.write.buyTicket(
          [6], // MAX_TICKETS_PER_TX = 5
          { 
            value: parseEther("0.6"),
            account: player1.account.address
          }
        )
      ).to.be.rejectedWith("ExceedsMaxTicketsPerTx");
    });

    it("Should not allow invalid quantity", async function () {
      const { lottery, player1 } = await loadFixture(deployContractsFixture);
      
      await expect(
        lottery.write.buyTicket(
          [0],
          { 
            value: parseEther("0.1"),
            account: player1.account.address
          }
        )
      ).to.be.rejectedWith("InvalidQuantityZeroOrTooLarge");

      // Intentar con un número muy grande
      const hugeNumber = BigInt(2 ** 8 + 1); // Más grande que uint8.max
      await expect(
        lottery.write.buyTicket(
          [hugeNumber],
          { 
            value: parseEther("1000"),
            account: player1.account.address
          }
        )
      ).to.be.rejectedWith("InvalidQuantityZeroOrTooLarge");
    });

    it("Should refund excess ETH sent", async function () {
      const { lottery, player1, publicClient } = await loadFixture(deployContractsFixture);
      
      const initialBalance = await publicClient.getBalance({ 
        address: player1.account.address 
      });
      
      const hash = await lottery.write.buyTicket(
        [1],
        { 
          value: parseEther("0.2"),
          account: player1.account.address
        }
      );

      const receipt = await publicClient.getTransactionReceipt({ hash });
      
      const finalBalance = await publicClient.getBalance({ 
        address: player1.account.address 
      });
      
      const gasCost = receipt.gasUsed * receipt.effectiveGasPrice;
      const expectedBalance = initialBalance - parseEther("0.1") - gasCost;
      expect(finalBalance).to.be.gte(expectedBalance);
    });

    it("Should automatically reset after winner selection", async function () {
      const { lottery, player1, player2, publicClient } = await loadFixture(deployContractsFixture);
      
      // Comprar tickets hasta llenar la lotería
      await lottery.write.buyTicket(
        [2],
        { 
          value: parseEther("0.2"),
          account: player1.account.address
        }
      );
      
      const hash = await lottery.write.buyTicket(
        [1],
        { 
          value: parseEther("0.1"),
          account: player2.account.address
        }
      );

      await publicClient.waitForTransactionReceipt({ hash });
      
      // Verificar que la lotería se ha reseteado automáticamente
      const state = await lottery.read.lotteryState();
      expect(state).to.equal(0n); // OPEN
      
      const ticketsSold = await lottery.read.getTicketsSold();
      expect(ticketsSold).to.equal(0n);
      
      // Verificar que se pueden comprar tickets nuevamente
      await lottery.write.buyTicket(
        [1],
        { 
          value: parseEther("0.1"),
          account: player1.account.address
        }
      );
      
      const newTickets = await lottery.read.playerTickets([player1.account.address]);
      expect(newTickets).to.equal(1n);
    });
  });

  describe("Lottery State", function () {
    it("Should emit LotteryEnded event when winner is selected", async function () {
      const { lottery, player1, player2, publicClient } = await loadFixture(deployContractsFixture);
      
      await lottery.write.buyTicket(
        [2],
        { 
          value: parseEther("0.2"),
          account: player1.account.address
        }
      );
      
      const hash = await lottery.write.buyTicket(
        [1],
        { 
          value: parseEther("0.1"),
          account: player2.account.address
        }
      );

      await publicClient.waitForTransactionReceipt({ hash });
      
      const events = await lottery.getEvents.LotteryEnded();
      expect(events.length).to.be.gt(0);
      
      const winner = events[0].args.winner.toLowerCase();
      expect([
        player1.account.address.toLowerCase(), 
        player2.account.address.toLowerCase()
      ]).to.include(winner);
    });
  });
  it("Should not allow non-admin to reset lottery state", async function () {
    const { lottery, player1, player2 } = await loadFixture(deployContractsFixture);
    
    let errorOccurred = false;
    try {
      await lottery.write.resetLotteryState({ account: player1.account.address });
    } catch (error) {
      errorOccurred = true;
    }
    expect(errorOccurred, "Non-admin should not be able to reset lottery").to.be.true;
  });

  it("Should not allow buying tickets with insufficient funds", async function () {
    const { lottery, player1 } = await loadFixture(deployContractsFixture);
    
    let errorOccurred = false;
    try {
      await lottery.write.buyTicket(
        [1],
        { 
          value: parseEther("0.05"), // Menos del precio requerido
          account: player1.account.address
        }
      );
    } catch (error) {
      errorOccurred = true;
    }
    expect(errorOccurred, "Should not allow buying with insufficient funds").to.be.true;
  });

  it("Should not allow buying tickets with quantity zero", async function () {
    const { lottery, player1 } = await loadFixture(deployContractsFixture);
    
    let errorOccurred = false;
    try {
      await lottery.write.buyTicket(
        [0],
        { 
          value: parseEther("0.1"),
          account: player1.account.address
        }
      );
    } catch (error) {
      errorOccurred = true;
    }
    expect(errorOccurred, "Should not allow buying zero tickets").to.be.true;
  });

  it("Should protect against reentrancy attacks", async function () {
    const { lottery, player1 } = await loadFixture(deployContractsFixture);
    
    // Simular múltiples llamadas simultáneas
    const promises = Array(3).fill(0).map(() => 
      lottery.write.buyTicket(
        [1],
        { 
          value: parseEther("0.1"),
          account: player1.account.address
        }
      )
    );

    await Promise.all(promises);
    
    // Verificar que no se excedió el límite de tickets
    const tickets = await lottery.read.playerTickets([player1.account.address]);
    expect(tickets).to.be.lte(3n);
  });

  it("Should verify winner selection is fair", async function () {
    const { lottery } = await loadFixture(deployContractsFixture);
    const accounts = await hre.viem.getWalletClients();
    
    const players = accounts.slice(3, 8);
    const winners = new Set();
    
    for(let i = 0; i < 5; i++) {
      const currentPlayer1 = players[i];
      const currentPlayer2 = players[(i + 1) % players.length];

      // Comprar tickets para completar la lotería
      await lottery.write.buyTicket(
        [2],
        { 
          value: parseEther("0.2"),
          account: currentPlayer1.account.address
        }
      );
      
      await lottery.write.buyTicket(
        [1],
        { 
          value: parseEther("0.1"),
          account: currentPlayer2.account.address
        }
      );

      // Obtener el ganador después de que se complete la lotería
      const winner = await lottery.read.winnerAddress();
      if (winner !== "0x0000000000000000000000000000000000000000") {
        winners.add(winner.toLowerCase());
      }

      await helpers.mine(1);
    }

    expect(winners.size, "Should have multiple different winners").to.be.gt(1);
  });

  it("Should handle contract balance correctly", async function () {
    const { lottery, player1, publicClient } = await loadFixture(deployContractsFixture);
    
    const initialBalance = await publicClient.getBalance({
      address: lottery.address
    });

    await lottery.write.buyTicket(
      [1],
      { 
        value: parseEther("0.1"),
        account: player1.account.address
      }
    );

    const finalBalance = await publicClient.getBalance({
      address: lottery.address
    });

    expect(finalBalance - initialBalance).to.equal(parseEther("0.1"));
  });
});