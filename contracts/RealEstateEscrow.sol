// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

contract RealEstateEscrow is AccessControl, ReentrancyGuardUpgradeable {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant ARBITRATOR_ROLE = keccak256("ARBITRATOR_ROLE");
    
    IERC20 public paymentToken;
    IERC721 public propertyToken;
    
    enum TransactionStatus { Created, Funded, Completed, Cancelled, Disputed, Resolved }
    enum TransactionType { Sale, Rental }
    
    struct Transaction {
        uint256 propertyId;
        address seller;
        address buyer;
        uint256 amount;
        uint256 startDate;
        uint256 endDate;
        TransactionStatus status;
        TransactionType transactionType;
        string terms;
    }
    
    mapping(uint256 => Transaction) public transactions;
    uint256 private _nextTransactionId;
    
    // Eventos para seguimiento de transacciones
    event TransactionCreated(uint256 transactionId, uint256 propertyId, address seller, address buyer, TransactionType transactionType);
    event TransactionFunded(uint256 transactionId, uint256 amount);
    event TransactionCompleted(uint256 transactionId);
    event TransactionCancelled(uint256 transactionId);
    event DisputeRaised(uint256 transactionId, address disputeInitiator);
    event DisputeResolved(uint256 transactionId, address arbitrator, address beneficiary);
    event RentalPaymentReleased(uint256 transactionId, uint256 amount, uint256 timestamp);
    
    constructor(address admin, address arbitrator, address _paymentToken, address _propertyToken) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(ARBITRATOR_ROLE, arbitrator);
        
        paymentToken = IERC20(_paymentToken);
        propertyToken = IERC721(_propertyToken);
    }
    
    // Crear una transacción de venta
    function createSaleTransaction(
        uint256 propertyId,
        address buyer,
        uint256 amount,
        string memory terms
    ) external returns (uint256) {
        require(propertyToken.ownerOf(propertyId) == msg.sender, "Only property owner can create sale");
        
        uint256 transactionId = _nextTransactionId++;
        transactions[transactionId] = Transaction({
            propertyId: propertyId,
            seller: msg.sender,
            buyer: buyer,
            amount: amount,
            startDate: block.timestamp,
            endDate: 0, // No end date for sales
            status: TransactionStatus.Created,
            transactionType: TransactionType.Sale,
            terms: terms
        });
        
        emit TransactionCreated(transactionId, propertyId, msg.sender, buyer, TransactionType.Sale);
        return transactionId;
    }
    
    // Crear una transacción de alquiler
    function createRentalTransaction(
        uint256 propertyId,
        address renter,
        uint256 amount,
        uint256 durationDays,
        string memory terms
    ) external returns (uint256) {
        require(propertyToken.ownerOf(propertyId) == msg.sender, "Only property owner can create rental");
        
        uint256 transactionId = _nextTransactionId++;
        transactions[transactionId] = Transaction({
            propertyId: propertyId,
            seller: msg.sender, // landlord
            buyer: renter, // tenant
            amount: amount,
            startDate: block.timestamp,
            endDate: block.timestamp + (durationDays * 1 days),
            status: TransactionStatus.Created,
            transactionType: TransactionType.Rental,
            terms: terms
        });
        
        emit TransactionCreated(transactionId, propertyId, msg.sender, renter, TransactionType.Rental);
        return transactionId;
    }
    
    // Financiar una transacción (comprador/inquilino)
    function fundTransaction(uint256 transactionId) external nonReentrant {
        Transaction storage transaction = transactions[transactionId];
        
        require(transaction.buyer == msg.sender, "Only buyer can fund transaction");
        require(transaction.status == TransactionStatus.Created, "Transaction not in created state");
        
        // Transferir tokens al contrato de escrow
        require(
            paymentToken.transferFrom(msg.sender, address(this), transaction.amount),
            "Token transfer failed"
        );
        
        transaction.status = TransactionStatus.Funded;
        emit TransactionFunded(transactionId, transaction.amount);
    }
    
    // Completar una transacción de venta (transfiere NFT y libera fondos)
    function completeSaleTransaction(uint256 transactionId) external nonReentrant {
        Transaction storage transaction = transactions[transactionId];
        
        require(transaction.transactionType == TransactionType.Sale, "Not a sale transaction");
        require(transaction.status == TransactionStatus.Funded, "Transaction not funded");
        require(
            transaction.seller == msg.sender || hasRole(ADMIN_ROLE, msg.sender),
            "Only seller or admin can complete"
        );
        
        // Transferir NFT al comprador
        propertyToken.safeTransferFrom(transaction.seller, transaction.buyer, transaction.propertyId);
        
        // Liberar fondos al vendedor
        require(
            paymentToken.transfer(transaction.seller, transaction.amount),
            "Token transfer failed"
        );
        
        transaction.status = TransactionStatus.Completed;
        emit TransactionCompleted(transactionId);
    }
    
    // Liberar pago de alquiler (para contratos de alquiler)
    function releaseRentalPayment(uint256 transactionId) external nonReentrant {
        Transaction storage transaction = transactions[transactionId];
        
        require(transaction.transactionType == TransactionType.Rental, "Not a rental transaction");
        require(transaction.status == TransactionStatus.Funded, "Transaction not funded");
        require(block.timestamp <= transaction.endDate, "Rental period ended");
        
        // Calcular pago proporcional
        uint256 totalDuration = transaction.endDate - transaction.startDate;
        uint256 elapsedTime = block.timestamp - transaction.startDate;
        uint256 paymentAmount = (transaction.amount * elapsedTime) / totalDuration;
        
        // Liberar pago al propietario
        require(
            paymentToken.transfer(transaction.seller, paymentAmount),
            "Token transfer failed"
        );
        
        emit RentalPaymentReleased(transactionId, paymentAmount, block.timestamp);
        
        // Si es el último pago, marcar como completado
        if (block.timestamp >= transaction.endDate) {
            transaction.status = TransactionStatus.Completed;
            emit TransactionCompleted(transactionId);
        }
    }
    
    // Iniciar disputa
    function raiseDispute(uint256 transactionId) external {
        Transaction storage transaction = transactions[transactionId];
        
        require(
            msg.sender == transaction.buyer || msg.sender == transaction.seller,
            "Only transaction parties can raise dispute"
        );
        require(
            transaction.status == TransactionStatus.Funded,
            "Transaction must be in funded state"
        );
        
        transaction.status = TransactionStatus.Disputed;
        emit DisputeRaised(transactionId, msg.sender);
    }
    
    // Resolver disputa (solo árbitro)
    function resolveDispute(
        uint256 transactionId,
        address beneficiary,
        uint256 amount
    ) external onlyRole(ARBITRATOR_ROLE) {
        Transaction storage transaction = transactions[transactionId];
        
        require(transaction.status == TransactionStatus.Disputed, "Transaction not disputed");
        require(amount <= transaction.amount, "Amount exceeds transaction value");
        
        // Transferir la cantidad especificada al beneficiario
        require(
            paymentToken.transfer(beneficiary, amount),
            "Token transfer failed"
        );
        
        // Si queda saldo, devolverlo a la otra parte
        if (amount < transaction.amount) {
            address otherParty = (beneficiary == transaction.seller) ? transaction.buyer : transaction.seller;
            require(
                paymentToken.transfer(otherParty, transaction.amount - amount),
                "Token transfer failed"
            );
        }
        
        transaction.status = TransactionStatus.Resolved;
        emit DisputeResolved(transactionId, msg.sender, beneficiary);
    }
    
    // Cancelar transacción (solo admin o ambas partes deben estar de acuerdo)
    function cancelTransaction(uint256 transactionId) external {
        Transaction storage transaction = transactions[transactionId];
        
        require(
            hasRole(ADMIN_ROLE, msg.sender) || 
            (msg.sender == transaction.seller && transaction.status == TransactionStatus.Created),
            "Not authorized to cancel"
        );
        
        // Si está financiada, devolver fondos al comprador
        if (transaction.status == TransactionStatus.Funded) {
            require(
                paymentToken.transfer(transaction.buyer, transaction.amount),
                "Token transfer failed"
            );
        }
        
        transaction.status = TransactionStatus.Cancelled;
        emit TransactionCancelled(transactionId);
    }
        // Verificar estado de una transacción
    function getTransactionStatus(uint256 transactionId) external view returns (
        TransactionStatus status,
        uint256 propertyId,
        address seller,
        address buyer,
        uint256 amount,
        uint256 startDate,
        uint256 endDate,
        TransactionType transactionType
    ) {
        Transaction storage transaction = transactions[transactionId];
        return (
            transaction.status,
            transaction.propertyId,
            transaction.seller,
            transaction.buyer,
            transaction.amount,
            transaction.startDate,
            transaction.endDate,
            transaction.transactionType
        );
    }
    
    // Función para recuperar tokens enviados por error (solo admin)
    function recoverTokens(address tokenAddress, uint256 amount) external onlyRole(ADMIN_ROLE) {
        IERC20(tokenAddress).transfer(msg.sender, amount);
    }
}