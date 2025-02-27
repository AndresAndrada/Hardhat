// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Burnable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {ERC721Pausable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Pausable.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract SubscriptionWithoutTransfer is
    ERC721,
    ERC721Enumerable,
    ERC721URIStorage,
    ERC721Pausable,
    Ownable,
    ERC721Burnable
{
    uint256 private _nextTokenId;

    struct LenderParams {
        uint256 amount;
        uint256 billingInterval;
    }

    struct ActiveSubscription {
        address borrower;
        uint256 nextDueDate;
    }

    mapping(uint256 => LenderParams) private _tokenLenderParams;
    mapping(uint256 => ActiveSubscription) private _activeSubscriptions;

    constructor(
        address initialOwner
    ) ERC721("Subscription", "MTK") Ownable(initialOwner) {}

    function _baseURI() internal pure override returns (string memory) {
        return "";
    }

    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    function safeMint(address to, string memory uri) public {
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
    }

    // Configura los parámetros de préstamo para un token
    function setLenderParams(
        uint256 tokenId,
        uint256 amount,
        uint256 billingInterval
    ) external {
        require(ownerOf(tokenId) == msg.sender, "Not the token owner");
        _tokenLenderParams[tokenId] = LenderParams(amount, billingInterval);
    }

    // Inicia una suscripción asignando un prestatario
    function lendToBorrower(uint256 tokenId, address borrower) external {
        require(ownerOf(tokenId) == msg.sender, "Not the token owner");
        require(
            _activeSubscriptions[tokenId].borrower == address(0),
            "Already lent"
        );
        LenderParams memory params = _tokenLenderParams[tokenId];
        require(
            params.amount > 0 && params.billingInterval > 0,
            "Lender parameters not set"
        );
        _activeSubscriptions[tokenId] = ActiveSubscription(
            borrower,
            block.timestamp + params.billingInterval
        );
    }

    // Realiza el pago de la suscripción
    function paySubscription(uint256 tokenId) external payable {
        ActiveSubscription storage sub = _activeSubscriptions[tokenId];
        require(sub.borrower == msg.sender, "Not the borrower");
        LenderParams memory params = _tokenLenderParams[tokenId];
        require(msg.value == params.amount, "Incorrect payment amount");
        require(block.timestamp <= sub.nextDueDate, "Payment is late");

        address owner = ownerOf(tokenId);
        payable(owner).transfer(msg.value);

        sub.nextDueDate += params.billingInterval;
    }

    // Revoca una suscripción inactiva
    function revokeSubscription(uint256 tokenId) external {
        require(ownerOf(tokenId) == msg.sender, "Not the token owner");
        ActiveSubscription storage sub = _activeSubscriptions[tokenId];
        require(sub.borrower != address(0), "No active subscription");
        require(block.timestamp > sub.nextDueDate, "Subscription still active");
        delete _activeSubscriptions[tokenId];
    }

    // Verifica si la suscripción está activa antes de transferir
    function _update(
        address to,
        uint256 tokenId,
        address auth
    )
        internal
        override(ERC721, ERC721Enumerable, ERC721Pausable)
        returns (address)
    {
        if (to != address(0)) {
            ActiveSubscription memory sub = _activeSubscriptions[tokenId];
            if (sub.nextDueDate > block.timestamp) {
                revert("Subscription active: cannot transfer");
            }
        }
        return super._update(to, tokenId, auth);
    }

    // Funciones de soporte para interfaces y overrides
    function _increaseBalance(
        address account,
        uint128 value
    ) internal override(ERC721, ERC721Enumerable) {
        super._increaseBalance(account, value);
    }

    function tokenURI(
        uint256 tokenId
    ) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        ActiveSubscription memory sub = _activeSubscriptions[tokenId];
        if (sub.borrower != msg.sender || sub.nextDueDate <= block.timestamp) {
            revert("Subscription required to access token URI");
        }
        return super.tokenURI(tokenId);
    }

    function supportsInterface(
        bytes4 interfaceId
    )
        public
        view
        override(ERC721, ERC721Enumerable, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    // Funciones de consulta
    function getLenderParams(
        uint256 tokenId
    ) external view returns (uint256 amount, uint256 billingInterval) {
        LenderParams memory params = _tokenLenderParams[tokenId];
        return (params.amount, params.billingInterval);
    }

    function getActiveSubscription(
        uint256 tokenId
    ) external view returns (address borrower, uint256 nextDueDate) {
        ActiveSubscription memory sub = _activeSubscriptions[tokenId];
        return (sub.borrower, sub.nextDueDate);
    }
}
