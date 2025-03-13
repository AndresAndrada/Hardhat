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
contract SubscriptionOld1 is
    ERC721,
    ERC721Enumerable,
    ERC721URIStorage,
    ERC721Pausable,
    Ownable,
    ERC721Burnable
{
    // Estructura básica para definir el monto de suscripción y la frecuencia de cobro
    struct LenderParams {
        uint256 amount; // Costo de cada período de suscripción
        uint256 billingInterval; // Intervalo de tiempo entre pagos (en segundos, por ejemplo)
    }

    // Estructura para manejar la información de suscripción de un prestatario específico
    struct SubscriptionInfo {
        uint256 nextDueDate; // Siguiente fecha en la que el prestatario debe pagar
        // (si es 0 significa que no hay suscripción activa para ese borrower)
    }

    // Contador para IDs de token
    uint256 private _nextTokenId;

    // Almacena los parámetros de préstamo (costo e intervalo) para cada token
    mapping(uint256 => LenderParams) private _tokenLenderParams;

    // Mapea (tokenId => (borrower => info de suscripción))
    // Esto permite múltiples suscripciones por cada token.
    mapping(uint256 => mapping(address => SubscriptionInfo))
        private _subscriptions;

    constructor(
        address initialOwner
    ) ERC721("Subscription", "MTK") Ownable(initialOwner) {}

    /**
     * @dev Sobrescritura opcional del baseURI, aquí no retornamos nada en particular.
     */
    function _baseURI() internal pure override returns (string memory) {
        return "";
    }

    /**
     * @dev Pausa global del contrato (pausa transferencias y algunas operaciones).
     */
    function pause() public onlyOwner {
        _pause();
    }

    /**
     * @dev Despausa el contrato.
     */
    function unpause() public onlyOwner {
        _unpause();
    }

    /**
     * @dev Crea un nuevo token y lo asigna a la dirección `to`.
     */
    function safeMint(address to, string memory uri) public {
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
    }

    /**
     * @dev Configura los parámetros de préstamo (costo e intervalo) para un token específico.
     * Solo el propietario del token puede establecerlos.
     */
    function setLenderParams(
        uint256 tokenId,
        uint256 amount,
        uint256 billingInterval
    ) external {
        require(ownerOf(tokenId) == msg.sender, "Not the token owner");
        _tokenLenderParams[tokenId] = LenderParams(amount, billingInterval);
    }

    /**
     * @dev Inicia (o renueva) una suscripción para un prestatario específico.
     * El prestatario recibe una suscripción cuyo `nextDueDate` se establece al bloque actual + billingInterval.
     * - Si el prestatario ya tenía una suscripción activa, se requiere que haya expirado para poder re-lend.
     */
    function lendToBorrower(uint256 tokenId, address borrower) external {
        require(ownerOf(tokenId) == msg.sender, "Not the token owner");

        LenderParams memory params = _tokenLenderParams[tokenId];
        require(
            params.amount > 0 && params.billingInterval > 0,
            "Lender parameters not set"
        );

        SubscriptionInfo storage sub = _subscriptions[tokenId][borrower];

        // Si nextDueDate > bloque actual, es que la suscripción sigue activa.
        // Se podría cambiar la lógica según se desee (p.e. renovar inmediatamente).
        require(
            sub.nextDueDate == 0 || block.timestamp > sub.nextDueDate,
            "Borrower already has an active subscription"
        );

        // Comienza (o renueva) la suscripción
        sub.nextDueDate = block.timestamp + params.billingInterval;
    }

    /**
     * @dev El prestatario (`msg.sender`) paga su suscripción para extenderla.
     * El pago debe coincidir con `params.amount`.
     */
    function paySubscription(uint256 tokenId) external payable {
        SubscriptionInfo storage sub = _subscriptions[tokenId][msg.sender];
        require(
            sub.nextDueDate > block.timestamp,
            "Not an active subscriber or subscription expired"
        );

        LenderParams memory params = _tokenLenderParams[tokenId];
        require(msg.value == params.amount, "Incorrect payment amount");

        // Transfiere el pago al propietario actual del token
        address tokenOwner = ownerOf(tokenId);
        payable(tokenOwner).transfer(msg.value);

        // Extiende la suscripción un intervalo más
        sub.nextDueDate += params.billingInterval;
    }

    /**
     * @dev El propietario de un token puede revocar la suscripción de un prestatario
     * si ha expirado. Si aún está activa, se requiere que esté vencida para poder revocar.
     */
    function revokeSubscription(uint256 tokenId, address borrower) external {
        require(ownerOf(tokenId) == msg.sender, "Not the token owner");

        SubscriptionInfo storage sub = _subscriptions[tokenId][borrower];
        require(sub.nextDueDate > 0, "No subscription found for borrower");
        require(
            block.timestamp > sub.nextDueDate,
            "Subscription is still active"
        );

        // Elimina la suscripción (equivalente a revocarla)
        delete _subscriptions[tokenId][borrower];
    }

    /**
     * @dev Permite la transferencia incluso si hay suscriptores activos,
     * eliminando la restricción previa.
     */
    function _update(
        address to,
        uint256 tokenId,
        address auth
    )
        internal
        override(ERC721, ERC721Enumerable, ERC721Pausable)
        returns (address)
    {
        // Ya no revertimos si hay suscripciones activas
        return super._update(to, tokenId, auth);
    }

    /**
     * @dev Control de acceso al tokenURI.
     * Solo los suscriptores activos (con `nextDueDate > block.timestamp`) pueden ver el URI.
     * Si no se requiere este control estricto, podrías omitir este check.
     */
    function tokenURI(
        uint256 tokenId
    ) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        SubscriptionInfo storage sub = _subscriptions[tokenId][msg.sender];
        if (sub.nextDueDate == 0 || block.timestamp > sub.nextDueDate) {
            revert("Subscription required to access token URI");
        }
        return super.tokenURI(tokenId);
    }

    /**
     * @dev Overrides necesarios para la compatibilidad con ERC721Enumerable y ERC721URIStorage.
     */
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

    /**
     * @dev Función de ayuda para consultar los parámetros de préstamo de un token.
     */
    function getLenderParams(
        uint256 tokenId
    ) external view returns (uint256 amount, uint256 billingInterval) {
        LenderParams memory params = _tokenLenderParams[tokenId];
        return (params.amount, params.billingInterval);
    }

    /**
     * @dev Consulta el `nextDueDate` de un prestatario específico. Retorna 0 si no hay suscripción activa.
     */
    function getSubscription(
        uint256 tokenId,
        address borrower
    ) external view returns (uint256 nextDueDate) {
        return _subscriptions[tokenId][borrower].nextDueDate;
    }
}
