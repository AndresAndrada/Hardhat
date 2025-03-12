// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "./RealEstateEscrow.sol";
import "./RealEstateNFT.sol";

contract RealEstateMarketplace is AccessControl, ReentrancyGuardUpgradeable {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    
    IERC20 public paymentToken;
    RealEstateNFT public propertyToken;
    RealEstateEscrow public escrow;
    
    // Estructura para listados de propiedades
    struct PropertyListing {
        uint256 propertyId;
        address seller;
        uint256 salePrice;
        uint256 rentalPrice; // precio por día
        bool forSale;
        bool forRent;
        uint256 minRentalDays;
        uint256 maxRentalDays;
    }
    
    // Mapeo de propiedades listadas
    mapping(uint256 => PropertyListing) public propertyListings;
    
    // Comisión del marketplace (en porcentaje, ej: 250 = 2.5%)
    uint256 public marketplaceFee = 250; // 2.5% por defecto
    
    // Eventos
    event PropertyListed(uint256 indexed propertyId, address indexed seller, uint256 salePrice, uint256 rentalPrice);
    event PropertySold(uint256 indexed propertyId, address indexed seller, address indexed buyer, uint256 price);
    event PropertyRented(uint256 indexed propertyId, address indexed owner, address indexed renter, uint256 price, uint256 durationDays);
    event ListingUpdated(uint256 indexed propertyId, uint256 salePrice, uint256 rentalPrice, bool forSale, bool forRent);
    event ListingRemoved(uint256 indexed propertyId);
    
    constructor(
        address admin,
        address _paymentToken,
        address _propertyToken,
        address _escrow
    ) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        
        paymentToken = IERC20(_paymentToken);
        propertyToken = RealEstateNFT(_propertyToken);
        escrow = RealEstateEscrow(_escrow);
    }
    
    // Listar una propiedad para venta y/o alquiler
    function listProperty(
        uint256 propertyId,
        uint256 salePrice,
        uint256 rentalPrice,
        bool forSale,
        bool forRent,
        uint256 minRentalDays,
        uint256 maxRentalDays
    ) external {
        require(propertyToken.ownerOf(propertyId) == msg.sender, "Only owner can list property");
        require(propertyToken.isPropertyVerified(propertyId), "Property must be verified before listing");
        require(forSale || forRent, "Property must be listed for sale or rent");
        
        if (forRent) {
            require(rentalPrice > 0, "Rental price must be greater than zero");
            require(minRentalDays > 0, "Minimum rental days must be greater than zero");
            require(maxRentalDays >= minRentalDays, "Maximum rental days must be greater than minimum");
        }
        
        // Aprobar al escrow para transferir el NFT cuando se venda
        propertyToken.approve(address(escrow), propertyId);
        
        propertyListings[propertyId] = PropertyListing({
            propertyId: propertyId,
            seller: msg.sender,
            salePrice: salePrice,
            rentalPrice: rentalPrice,
            forSale: forSale,
            forRent: forRent,
            minRentalDays: minRentalDays,
            maxRentalDays: maxRentalDays
        });
        
        emit PropertyListed(propertyId, msg.sender, salePrice, rentalPrice);
    }
    
    // Actualizar listado de propiedad
    function updateListing(
        uint256 propertyId,
        uint256 salePrice,
        uint256 rentalPrice,
        bool forSale,
        bool forRent,
        uint256 minRentalDays,
        uint256 maxRentalDays
    ) external {
        PropertyListing storage listing = propertyListings[propertyId];
        
        require(listing.seller == msg.sender, "Only seller can update listing");
        require(forSale || forRent, "Property must be listed for sale or rent");
        
        if (forRent) {
            require(rentalPrice > 0, "Rental price must be greater than zero");
            require(minRentalDays > 0, "Minimum rental days must be greater than zero");
            require(maxRentalDays >= minRentalDays, "Maximum rental days must be greater than minimum");
        }
        
        listing.salePrice = salePrice;
        listing.rentalPrice = rentalPrice;
        listing.forSale = forSale;
        listing.forRent = forRent;
        listing.minRentalDays = minRentalDays;
        listing.maxRentalDays = maxRentalDays;
        
        emit ListingUpdated(propertyId, salePrice, rentalPrice, forSale, forRent);
    }
    
    // Eliminar listado
    function removeListing(uint256 propertyId) external {
        PropertyListing storage listing = propertyListings[propertyId];
        require(listing.seller == msg.sender, "Only seller can remove listing");
        
        delete propertyListings[propertyId];
        emit ListingRemoved(propertyId);
    }
    
    // Comprar una propiedad
    function buyProperty(uint256 propertyId) external nonReentrant {
        PropertyListing storage listing = propertyListings[propertyId];
        
        require(listing.forSale, "Property not for sale");
        require(listing.seller != msg.sender, "Cannot buy your own property");
        
        uint256 totalPrice = listing.salePrice;
        uint256 fee = (totalPrice * marketplaceFee) / 10000;
        uint256 sellerAmount = totalPrice - fee;
        
        // Transferir tokens del comprador al contrato
        require(
            paymentToken.transferFrom(msg.sender, address(this), totalPrice),
            "Payment transfer failed"
        );
        
        // Crear transacción de escrow
        uint256 transactionId = escrow.createSaleTransaction(
            propertyId,
            msg.sender,
            sellerAmount,
            "Property sale transaction"
        );
        
        // Financiar la transacción de escrow
        paymentToken.approve(address(escrow), sellerAmount);
        escrow.fundTransaction(transactionId);
        
        // Completar la transacción
        escrow.completeSaleTransaction(transactionId);
        
        // Transferir comisión al contrato
        // (se puede agregar lógica para distribuir a los administradores)
        
        // Eliminar listado
        delete propertyListings[propertyId];
        
        emit PropertySold(propertyId, listing.seller, msg.sender, totalPrice);
    }
    
    // Alquilar una propiedad
    function rentProperty(uint256 propertyId, uint256 durationDays) external nonReentrant {
        PropertyListing storage listing = propertyListings[propertyId];
        
        require(listing.forRent, "Property not for rent");
        require(listing.seller != msg.sender, "Cannot rent your own property");
        require(durationDays >= listing.minRentalDays, "Duration below minimum rental period");
        require(durationDays <= listing.maxRentalDays, "Duration exceeds maximum rental period");
        
        uint256 totalPrice = listing.rentalPrice * durationDays;
        uint256 fee = (totalPrice * marketplaceFee) / 10000;
        uint256 ownerAmount = totalPrice - fee;
        
        // Transferir tokens del inquilino al contrato
        require(
            paymentToken.transferFrom(msg.sender, address(this), totalPrice),
            "Payment transfer failed"
        );
        
        // Crear transacción de alquiler en escrow
        uint256 transactionId = escrow.createRentalTransaction(
            propertyId,
            msg.sender,
            ownerAmount,
            durationDays,
            "Property rental transaction"
        );
        
        // Financiar la transacción de escrow
        paymentToken.approve(address(escrow), ownerAmount);
        escrow.fundTransaction(transactionId);
        
        // La propiedad sigue listada para futuros alquileres
        
        emit PropertyRented(propertyId, listing.seller, msg.sender, totalPrice, durationDays);
    }
    
    // Establecer comisión del marketplace (solo admin)
    function setMarketplaceFee(uint256 newFee) external onlyRole(ADMIN_ROLE) {
        require(newFee <= 1000, "Fee cannot exceed 10%"); // Máximo 10%
        marketplaceFee = newFee;
    }
    
    // Retirar comisiones acumuladas (solo admin)
    function withdrawFees(address recipient, uint256 amount) external onlyRole(ADMIN_ROLE) {
        require(paymentToken.transfer(recipient, amount), "Transfer failed");
    }
}