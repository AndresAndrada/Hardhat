// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";

contract Marketplace is Ownable, ReentrancyGuard {
    using Counters for Counters.Counter;
    using Address for address payable;

    Counters.Counter private _listingIds;
    Counters.Counter private _numOfTxs;
    uint256 private _volume;

    event TokenListed(
        uint256 indexed listingId,
        address indexed contractAddress,
        address indexed seller,
        uint256 tokenId,
        uint256 amount,
        uint256 pricePerToken,
        bool privateSale
    );
    event TokenSold(
        uint256 indexed listingId,
        address indexed contractAddress,
        address indexed seller,
        address buyer,
        uint256 tokenId,
        uint256 amount,
        uint256 pricePerToken,
        bool privateSale
    );
    event ListingDeleted(
        uint256 indexed listingId,
        address indexed contractAddress
    );

    mapping(uint256 => Listing) private idToListing;

    struct Listing {
        uint256 listingId;
        address contractAddress;
        address seller;
        uint256 tokenId;
        uint256 amount;
        uint256 price;
        uint256 tokensAvailable;
        bool privateListing;
        bool completed;
        mapping(address => bool) allowedBuyers;
    }

    struct Stats {
        uint256 volume;
        uint256 itemsSold;
    }

    constructor() Ownable(msg.sender) {
        // Constructor que pasa msg.sender al constructor de Ownable
    }

    function listToken(
        address contractAddress,
        uint256 tokenId,
        uint256 amount,
        uint256 price,
        address[] memory allowedBuyers
    ) public nonReentrant returns (uint256) {
        require(amount > 0, "Amount must be greater than 0");
        require(price > 0, "Price must be greater than 0");

        IERC1155 token = IERC1155(contractAddress);

        require(
            token.balanceOf(msg.sender, tokenId) >= amount,
            "Caller must own given token"
        );
        require(
            token.isApprovedForAll(msg.sender, address(this)),
            "Contract must be approved"
        );

        bool privateListing = allowedBuyers.length > 0;

        _listingIds.increment();
        uint256 listingId = _listingIds.current();

        Listing storage listing = idToListing[listingId];
        listing.listingId = listingId;
        listing.contractAddress = contractAddress;
        listing.seller = msg.sender;
        listing.tokenId = tokenId;
        listing.amount = amount;
        listing.price = price;
        listing.tokensAvailable = amount;
        listing.privateListing = privateListing;
        listing.completed = false;

        if (privateListing) {
            require(allowedBuyers.length <= 100, "Too many allowed buyers");
            for (uint256 i = 0; i < allowedBuyers.length; i++) {
                listing.allowedBuyers[allowedBuyers[i]] = true;
            }
        }

        emit TokenListed(
            listingId,
            contractAddress,
            msg.sender,
            tokenId,
            amount,
            price,
            privateListing
        );

        return listingId;
    }

    function purchaseToken(uint256 listingId, uint256 amount)
        public
        payable
        nonReentrant
    {
        Listing storage listing = idToListing[listingId];

        require(!listing.completed, "Listing not available");
        require(amount > 0, "Amount must be greater than 0");
        require(
            listing.tokensAvailable >= amount,
            "Not enough tokens available"
        );
        require(
            msg.sender != listing.seller,
            "Cannot buy your own tokens"
        );

        uint256 totalPrice = listing.price * amount;
        require(msg.value == totalPrice, "Incorrect ETH amount sent");

        if (listing.privateListing) {
            require(
                listing.allowedBuyers[msg.sender],
                "Not allowed to purchase this listing"
            );
        }

        // Update listing
        listing.tokensAvailable -= amount;
        if (listing.tokensAvailable == 0) {
            listing.completed = true;
        }

        // Update stats
        _numOfTxs.increment();
        _volume += totalPrice;

        // Transfer tokens
        IERC1155 token = IERC1155(listing.contractAddress);
        token.safeTransferFrom(
            listing.seller,
            msg.sender,
            listing.tokenId,
            amount,
            ""
        );

        // Calculate fee and transfer funds
        uint256 fee = (totalPrice * 2) / 100; // 2% fee
        uint256 sellerAmount = totalPrice - fee;

        // Transfer Ether to seller
        payable(listing.seller).sendValue(sellerAmount);

        emit TokenSold(
            listingId,
            listing.contractAddress,
            listing.seller,
            msg.sender,
            listing.tokenId,
            amount,
            listing.price,
            listing.privateListing
        );
    }

    function deleteListing(uint256 listingId) public nonReentrant {
        Listing storage listing = idToListing[listingId];
        require(
            msg.sender == listing.seller,
            "Only seller can delete listing"
        );
        require(!listing.completed, "Listing already completed");

        listing.completed = true;
        delete idToListing[listingId]; // Eliminar el listado

        emit ListingDeleted(listingId, listing.contractAddress);
    }

    function viewListingById(uint256 listingId)
        public
        view
        returns (
            uint256,
            address,
            address,
            uint256,
            uint256,
            uint256,
            uint256,
            bool,
            bool
        )
    {
        Listing storage listing = idToListing[listingId];
        return (
            listing.listingId,
            listing.contractAddress,
            listing.seller,
            listing.tokenId,
            listing.amount,
            listing.price,
            listing.tokensAvailable,
            listing.privateListing,
            listing.completed
        );
    }

    function viewStats() public view returns (Stats memory) {
        return Stats(_volume, _numOfTxs.current());
    }

    function withdrawFees() public onlyOwner nonReentrant {
        uint256 balance = address(this).balance;
        require(balance > 0, "No fees to withdraw");
        payable(msg.sender).sendValue(balance);
    }
}
