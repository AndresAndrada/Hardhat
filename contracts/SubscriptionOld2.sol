// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Burnable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {ERC721Pausable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Pausable.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Subscription
 * @dev Contrato para manejar suscripciones múltiples por cada token.
 */
contract SubscriptionOld2 is
    ERC721,
    ERC721Enumerable,
    ERC721URIStorage,
    ERC721Pausable,
    Ownable,
    ERC721Burnable
{
    struct LenderParams {
        uint256 amount; // Costo de cada período de suscripción
        uint256 billingInterval; // Intervalo de tiempo entre pagos (en segundos, por ejemplo)
    }

    struct SubscriptionInfo {
        uint256 nextDueDate; // Siguiente fecha en la que el prestatario debe pagar
    }

    uint256 private _nextTokenId;

    // Parámetros del prestamista para cada token
    mapping(uint256 => LenderParams) private _tokenLenderParams;
    // Información de suscripción por token y prestatario
    mapping(uint256 => mapping(address => SubscriptionInfo))
        private _subscriptions;
    // Lista de direcciones que han suscrito (o suscrito por primera vez) cada token
    mapping(uint256 => address[]) private _tokenSubscribers;

    constructor(
        address initialOwner
    ) ERC721("Subscription", "MTK") Ownable(initialOwner) {
        // paymentToken = IERC20(_paymentToken); // Inicializar la dirección del token ERC20
    }

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

    function setLenderParams(
        uint256 tokenId,
        uint256 amount,
        uint256 billingInterval
    ) external {
        require(ownerOf(tokenId) == msg.sender, "Not the token owner");
        _tokenLenderParams[tokenId] = LenderParams(amount, billingInterval);
    }

    function paySubscription(uint256 tokenId) external payable {
        LenderParams memory params = _tokenLenderParams[tokenId];
        require(
            params.amount > 0 && params.billingInterval > 0,
            "Lender parameters not set"
        );

        address borrower = msg.sender; // El prestatario es quien llama a la función
        SubscriptionInfo storage sub = _subscriptions[tokenId][borrower];

        // Si es la primera suscripción, se agrega el prestatario a la lista
        bool isNewSubscription = (sub.nextDueDate == 0);
        require(
            isNewSubscription || block.timestamp > sub.nextDueDate,
            "Borrower already has an active subscription"
        );

        // Verifica que se haya enviado la cantidad correcta de ETH
        require(msg.value == params.amount, "Incorrect ETH amount sent");

        // Transfiere el ETH al propietario del token
        address tokenOwner = ownerOf(tokenId);
        payable(tokenOwner).transfer(msg.value);

        // Inicia o renueva la suscripción
        sub.nextDueDate = block.timestamp + params.billingInterval;
        if (isNewSubscription) {
            _tokenSubscribers[tokenId].push(borrower);
        }
    }

    function revokeSubscription(uint256 tokenId, address borrower) external {
        require(ownerOf(tokenId) == msg.sender, "Not the token owner");

        SubscriptionInfo storage sub = _subscriptions[tokenId][borrower];
        require(sub.nextDueDate > 0, "No subscription found for borrower");
        require(
            block.timestamp > sub.nextDueDate,
            "Subscription is still active"
        );

        delete _subscriptions[tokenId][borrower];
    }

    /**
     * @dev Función para obtener todas las suscripciones de un token.
     * Retorna un arreglo con las direcciones de los prestatarios y otro con sus respectivas fechas de vencimiento.
     * Desde el front-end se puede filtrar aquellas suscripciones que estén activas.
     */
    function getSubscriptions(
        uint256 tokenId
    )
        external
        view
        returns (address[] memory borrowers, uint256[] memory nextDueDates)
    {
        uint256 totalSubscribers = _tokenSubscribers[tokenId].length;
        borrowers = new address[](totalSubscribers);
        nextDueDates = new uint256[](totalSubscribers);

        for (uint256 i = 0; i < totalSubscribers; i++) {
            address subscriber = _tokenSubscribers[tokenId][i];
            borrowers[i] = subscriber;
            nextDueDates[i] = _subscriptions[tokenId][subscriber].nextDueDate;
        }
    }

    // Funciones _update y _increaseBalance se mantienen ya que en tu versión eran necesarias
    function _update(
        address to,
        uint256 tokenId,
        address auth
    )
        internal
        override(ERC721, ERC721Enumerable, ERC721Pausable)
        returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function tokenURI(
        uint256 tokenId
    ) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        SubscriptionInfo storage sub = _subscriptions[tokenId][msg.sender];
        if (sub.nextDueDate == 0 || block.timestamp > sub.nextDueDate) {
            revert("Subscription required to access token URI");
        }
        return super.tokenURI(tokenId);
    }

    function _increaseBalance(
        address account,
        uint128 value
    ) internal override(ERC721, ERC721Enumerable) {
        super._increaseBalance(account, value);
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

    function getLenderParams(
        uint256 tokenId
    ) external view returns (uint256 amount, uint256 billingInterval) {
        LenderParams memory params = _tokenLenderParams[tokenId];
        return (params.amount, params.billingInterval);
    }

    function getSubscription(
        uint256 tokenId,
        address borrower
    ) external view returns (uint256 nextDueDate) {
        return _subscriptions[tokenId][borrower].nextDueDate;
    }
}
