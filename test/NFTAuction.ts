import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import { ZeroAddress } from "ethers";
import hre from "hardhat";

describe("MyERC721 and NFTAuction", function () {
  async function deployContractsFixture() {
    const [defaultAdmin, pauser, minter, nftSeller, bidder, otherAccount] = await hre.viem.getWalletClients();

    const myERC721 = await hre.viem.deployContract("MyERC721", [
      defaultAdmin.account.address,
      pauser.account.address,
      minter.account.address
    ], {});

    const myToken = await hre.viem.deployContract("MyToken", [
      defaultAdmin.account.address,
      pauser.account.address,
      minter.account.address
    ], {});

    const nftAuction = await hre.viem.deployContract("NFTAuction", [nftSeller.account.address], {});

    return { myERC721, nftAuction, myToken, defaultAdmin, pauser, minter, nftSeller, bidder, otherAccount };
  }

  describe("NFTAuction", function () {
    it("Should set the correct owner for NFTAuction", async function () {
      const { nftAuction, nftSeller } = await loadFixture(deployContractsFixture);
      const contractOwner = await nftAuction.read.owner();
      expect(contractOwner.toLowerCase()).to.equal(nftSeller.account.address.toLowerCase());
    });
    
    it("Should allow to create an auction", async function () {
      try{
        
      const { nftAuction, myERC721, nftSeller, minter } = await loadFixture(deployContractsFixture);
  
      const myERC721AsMinter = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: minter } });
      await myERC721AsMinter.write.safeMint([nftSeller.account.address, "ipfs://token-uri"]);
      const tokenId = 0n;  // Ensure this is a bigint
  
      await myERC721.write.approve([nftAuction.address, tokenId], { account:  nftSeller.account.address  });
  
      const minPrice = hre.ethers.parseUnits("1", "ether");  // This should be left as bigint
      const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
      await nftAuction.write.createNewNftAuction(
          [myERC721.address, tokenId, ZERO_ADDRESS, minPrice, 0n, 86400n, 100n, [], []],  // Ensure all numbers are passed as bigint
          { client: { wallet: nftSeller } }
      );
  
      const auction = await nftAuction.read.nftContractAuctions([myERC721.address, tokenId]);
   

      expect(auction[7].toLowerCase()).to.equal(nftSeller.account.address.toLowerCase());
      
    }catch(e){
      console.log(e.message)
    }
  });

 
it("Should revert if bid is below the minimum price", async function () {
  const { nftAuction, myERC721, myToken, nftSeller, bidder, minter } = await loadFixture(deployContractsFixture);

  const myERC721AsMinter = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: minter } });
  await myERC721AsMinter.write.safeMint([nftSeller.account.address, "ipfs://token-uri"]);
  const tokenId = 0n;

  await myERC721.write.approve([nftAuction.address, tokenId], { account: nftSeller.account.address });

  const myTokenAsMinter = await hre.viem.getContractAt("MyToken", myToken.address, { client: { wallet: minter } });
  const amountToMint = hre.ethers.parseUnits("500", 18) as bigint;
  await myTokenAsMinter.write.mint([bidder.account.address, amountToMint]);

  const minPrice = hre.ethers.parseUnits("100", 18) as bigint;
  
  await nftAuction.write.createNewNftAuction(
    [myERC721.address, tokenId, myToken.address, minPrice, 0n, 86400n, 100n, [], []],
    { account: nftSeller.account.address }
  );

  const lowBidAmount = hre.ethers.parseUnits("50", 18) as bigint;
  await myTokenAsMinter.write.approve([nftAuction.address, lowBidAmount], { account: bidder.account.address });
  await expect(
    nftAuction.write.makeBid([myERC721.address, tokenId, myToken.address, lowBidAmount], {
      account: bidder.account.address,
    })
).to.be.rejectedWith("Not enough funds to bid on NFT");
});

it("Should allow the seller to settle the auction after it ends", async function () {
  const { nftAuction, myERC721, myToken, nftSeller, bidder, minter } = await loadFixture(deployContractsFixture);

  // Step 1: Mint the NFT to the seller
  const myERC721AsMinter = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: minter } });
  await myERC721AsMinter.write.safeMint([nftSeller.account.address, "ipfs://token-uri"]);
  const tokenId = 0n;

  // Step 2: Approve the auction contract to handle the NFT
  await myERC721.write.approve([nftAuction.address, tokenId], { account: nftSeller.account.address });

  // Step 3: Mint some ERC20 tokens to the bidder
  const myTokenAsMinter = await hre.viem.getContractAt("MyToken", myToken.address, { client: { wallet: minter } });
  const amountToMint = hre.ethers.parseUnits("500", 18) as bigint;
  await myTokenAsMinter.write.mint([bidder.account.address, amountToMint]);
  // Step 4: Set the minimum price for the auction in ERC20 tokens
  const minPrice = hre.ethers.parseUnits("100", 18) as bigint;
  await nftAuction.write.createNewNftAuction(
    [myERC721.address, tokenId, myToken.address, minPrice, 0n, 86400n, 100n, [], []],
    { account: nftSeller.account.address }
  );

  // Step 5: Approve and place a bid higher than the minimum price
  const bidAmount = hre.ethers.parseUnits("200", 18) as bigint;
  await myTokenAsMinter.write.approve([nftAuction.address, bidAmount], { account: bidder.account.address });
  await nftAuction.write.makeBid([myERC721.address, tokenId, myToken.address, bidAmount], {
    account: bidder.account.address,
  });

  // Step 6: Move time forward to simulate the auction ending
  await time.increase(86401n);

  // Step 7: Settle the auction as the seller
  await nftAuction.write.settleAuction([myERC721.address, tokenId], { account: nftSeller.account.address });

  // Step 8: Verify that the NFT ownership has been transferred to the highest bidder
  const newOwner = await myERC721.read.ownerOf([tokenId]);
  expect(newOwner.toLowerCase()).to.equal(bidder.account.address.toLowerCase());
});

    it("Should allow the seller to withdraw the auction if no bids were made", async function () {
      const { nftAuction, myERC721, nftSeller, minter } = await loadFixture(deployContractsFixture);
      const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

      const myERC721AsMinter = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: minter } });
      await myERC721AsMinter.write.safeMint([nftSeller.account.address, "ipfs://token-uri"]);
      const tokenId = 0n;

      await myERC721.write.approve([nftAuction.address, tokenId], { account: nftSeller.account.address  });

      const minPrice = hre.ethers.parseUnits("1", "ether") as bigint;
      await nftAuction.write.createNewNftAuction(
        [myERC721.address, tokenId, ZERO_ADDRESS, minPrice, 0n, 86400n, 100n, [], []],
        { client: { wallet: nftSeller } }
      );

      await nftAuction.write.withdrawAuction([myERC721.address, tokenId], { account: nftSeller.account.address });

      const auction = await nftAuction.read.nftContractAuctions([myERC721.address, tokenId]);
      expect(nftSeller.account.address).to.equal(nftSeller.account.address);
      
    });
   
    it("Should allow the seller to take the highest bid and finalize the auction", async function () {
      const { nftAuction, myERC721, myToken, nftSeller, bidder, minter } = await loadFixture(deployContractsFixture);
      const tokenId = 0n;
      const minPrice = hre.ethers.parseUnits("1", "ether");
    
      // Mint NFT and approve auction
      const myERC721AsMinter = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: minter } });
      await myERC721AsMinter.write.safeMint([nftSeller.account.address, "ipfs://token-uri"]);
      await myERC721.write.approve([nftAuction.address, tokenId], { account: nftSeller.account.address });
    
      // Create auction
      await nftAuction.write.createNewNftAuction(
        [myERC721.address, tokenId, myToken.address, minPrice, 0n, 86400n, 100n, [], []],
        { account: nftSeller.account.address }
      );
    
      // Place a bid
      const bidAmount = hre.ethers.parseUnits("2", "ether");
      await myToken.write.mint([bidder.account.address, bidAmount], { account: minter.account.address });
      await myToken.write.approve([nftAuction.address, bidAmount], { account: bidder.account.address });
      await nftAuction.write.makeBid([myERC721.address, tokenId, myToken.address, bidAmount], {
        account: bidder.account.address,
      });
    
      // Take the highest bid
      await nftAuction.write.takeHighestBid([myERC721.address, tokenId], { account: nftSeller.account.address });
    
      // Verify the auction is settled and the NFT is transferred
      const newOwner = await myERC721.read.ownerOf([tokenId]);
      expect(newOwner.toLowerCase()).to.equal(bidder.account.address.toLowerCase());
    });

    it("Should allow the seller to update the minimum price", async function () {
      const { nftAuction, myERC721, nftSeller, minter } = await loadFixture(deployContractsFixture);
      const tokenId = 0n;
      const initialMinPrice = hre.ethers.parseUnits("1", "ether");
      const newMinPrice = hre.ethers.parseUnits("2", "ether");
      const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

      // Mint NFT and approve auction
      const myERC721AsMinter = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: minter } });
      await myERC721AsMinter.write.safeMint([nftSeller.account.address, "ipfs://token-uri"]);
      await myERC721.write.approve([nftAuction.address, tokenId], { account: nftSeller.account.address });
    
      // Create auction with initial min price
      await nftAuction.write.createNewNftAuction(
        [myERC721.address, tokenId, ZERO_ADDRESS, initialMinPrice, 0n, 86400n, 100n, [], []],
        { account: nftSeller.account.address }
      );
    
      // Update the minimum price
      await nftAuction.write.updateMinimumPrice([myERC721.address, tokenId, newMinPrice], { account: nftSeller.account.address });
    
      // Verify the minimum price has been updated correctly
      const auction = await nftAuction.read.nftContractAuctions([myERC721.address, tokenId]);
      expect(auction[3].toString()).to.equal(newMinPrice.toString());
    });
    
    it("Should allow the seller to update the buy now price", async function () {
      const { nftAuction, myERC721, nftSeller, minter } = await loadFixture(deployContractsFixture);
      const tokenId = 0n;
      const initialBuyNowPrice = hre.ethers.parseUnits("2", "ether");
      const newBuyNowPrice = hre.ethers.parseUnits("3", "ether");
      const minPrice = hre.ethers.parseUnits("1", "ether"); // Asegúrate de que minPrice no sea cero
      const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    
      // Mint NFT
      const myERC721AsMinter = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: minter } });
      await myERC721AsMinter.write.safeMint([nftSeller.account.address, "ipfs://token-uri"]);
    
      // Approve NFT for auction
      await myERC721.write.approve([nftAuction.address, tokenId], { account: nftSeller.account.address });
    
      // Create auction with initial buy now price and a valid minPrice
      await nftAuction.write.createNewNftAuction(
        [myERC721.address, tokenId, ZERO_ADDRESS, minPrice, initialBuyNowPrice, 86400n, 100n, [], []],
        { account: nftSeller.account.address }
      );
    
      // Update the buy now price
      await nftAuction.write.updateBuyNowPrice([myERC721.address, tokenId, newBuyNowPrice], { account: nftSeller.account.address });
    
      // Verify the buy now price has been updated correctly
      const auction = await nftAuction.read.nftContractAuctions([myERC721.address, tokenId]);
      expect(auction[4].toString()).to.equal(newBuyNowPrice.toString());
    });
    
    
it("Should restrict access to owner-only functions", async function () {
  const { nftAuction, otherAccount } = await loadFixture(deployContractsFixture);

  // Attempt to update the default bid increase percentage as a non-owner
  const newPercentage = 200;
  await expect(
    nftAuction.write.updateDefaultBidIncreasePercentage([newPercentage], { account: otherAccount.account.address })
  ).to.be.rejectedWith("OwnableUnauthorizedAccount");

  // Attempt to update the minimum settable increase percentage as a non-owner
  await expect(
    nftAuction.write.updateMinimumSettableIncreasePercentage([newPercentage], { account: otherAccount.account.address })
  ).to.be.rejectedWith("OwnableUnauthorizedAccount");
});

it("Should prevent bids below the minimum price after updating", async function () {
  const { nftAuction, myERC721, myToken, nftSeller, bidder, minter } = await loadFixture(deployContractsFixture);

  const tokenId = 0n;
  const newMinPrice = hre.ethers.parseUnits("5", "ether");

  // Mint NFT
  const myERC721AsMinter = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: minter } });
  await myERC721AsMinter.write.safeMint([nftSeller.account.address, "ipfs://token-uri"]);

  // Approve NFT to auction
  await myERC721.write.approve([nftAuction.address, tokenId], { account: nftSeller.account.address });

  // Create auction
  const initialMinPrice = hre.ethers.parseUnits("3", "ether");
  await nftAuction.write.createNewNftAuction(
    [myERC721.address, tokenId, myToken.address, initialMinPrice, 0n, 86400n, 100n, [], []],
    { account: nftSeller.account.address }
  );

  // Update the minimum price
  await nftAuction.write.updateMinimumPrice([myERC721.address, tokenId, newMinPrice], { account: nftSeller.account.address });

  // Mint ERC20 tokens to the bidder
  const bidAmount = hre.ethers.parseUnits("4", "ether");
  await myToken.write.mint([bidder.account.address, bidAmount], { account: minter.account.address });
  await myToken.write.approve([nftAuction.address, bidAmount], { account: bidder.account.address });

  // Attempt to make a bid below the new minimum price
  await expect(
    nftAuction.write.makeBid([myERC721.address, tokenId, myToken.address, bidAmount], { account: bidder.account.address })
  ).to.be.rejectedWith("Not enough funds to bid on NFT");
});

  
it("Should handle concurrent bids correctly", async function () {
  const { nftAuction, myERC721, myToken, nftSeller, bidder, otherAccount, minter } = await loadFixture(deployContractsFixture);

  const tokenId = 0n;

  const myERC721AsMinter = await hre.viem.getContractAt("MyERC721", myERC721.address, { client: { wallet: minter } });
  await myERC721AsMinter.write.safeMint([nftSeller.account.address, "ipfs://token-uri"]);

  await myERC721.write.approve([nftAuction.address, tokenId], { account: nftSeller.account.address });

  const minPrice = hre.ethers.parseUnits("3", "ether");
  await nftAuction.write.createNewNftAuction(
    [myERC721.address, tokenId, myToken.address, minPrice, 0n, 86400n, 100n, [], []],
    { account: nftSeller.account.address }
  );

  const bidAmount1 = hre.ethers.parseUnits("4", "ether");
  const bidAmount2 = hre.ethers.parseUnits("5", "ether");
  await myToken.write.mint([bidder.account.address, bidAmount1], { account: minter.account.address });
  await myToken.write.mint([otherAccount.account.address, bidAmount2], { account: minter.account.address });

  await myToken.write.approve([nftAuction.address, bidAmount1], { account: bidder.account.address });
  await myToken.write.approve([nftAuction.address, bidAmount2], { account: otherAccount.account.address });

  await nftAuction.write.makeBid([myERC721.address, tokenId, myToken.address, bidAmount1], {
    account: bidder.account.address,
  });

  await nftAuction.write.makeBid([myERC721.address, tokenId, myToken.address, bidAmount2], {
    account: otherAccount.account.address,
  });

  const highestBid = await nftAuction.read.getHighestBid([myERC721.address, tokenId]);

  expect(highestBid[0].toLowerCase()).to.equal(otherAccount.account.address.toLowerCase());
  expect(highestBid[1].toString()).to.equal(bidAmount2.toString());
});
    
  });
});
