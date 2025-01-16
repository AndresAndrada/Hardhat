// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";  
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";  
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";  
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";  
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// Custom errors
error MaxTicketsPerPlayerExceeded();
error MaximumTicketsReached();
error InsufficientPayment();
error LotteryNotOpen();
error InvalidQuantity();
error RefundFailed();
error ExceedsMaxTicketsPerTx();
error InvalidQuantityZeroOrTooLarge();

contract Lottery is ERC721, ERC721Enumerable, ERC721URIStorage, AccessControl, ReentrancyGuard {

    uint256 public constant MAX_TICKETS_PER_PLAYER = 3;
    uint256 public constant MAX_TICKETS_PER_TX = 5;

    enum LOTTERY_STATE { OPEN, CALCULATING_WINNER, CLOSED }
    LOTTERY_STATE public lotteryState;

    string public baseURI;
    uint256 public nextTokenId;

    mapping(address => uint256) public playerTickets;
    mapping(uint256 => address) public ticketOwners;

    uint256 public ticketPrice;
    uint256 public maxTickets;

    address public feeRecipient;

    address public winnerAddress;
    uint256 public winningTicketId;

    event LotteryStarted(address indexed starter);
    event TicketPurchased(address indexed buyer, uint256 indexed ticketId);
    event LotteryEnded(address indexed winner, uint256 winningTicketId);
    event Withdrawal(address indexed recipient, uint256 amount);
    event BaseURIUpdated(string newBaseURI);

    constructor(
        string memory initialBaseURI,
        uint256 _ticketPrice,
        uint256 _maxTickets
    ) ERC721("LotteryNFT", "LTNFT") {
        require(_maxTickets > 0, "Maximum tickets must be greater than zero");

        baseURI = initialBaseURI;
        ticketPrice = _ticketPrice;
        maxTickets = _maxTickets;
        lotteryState = LOTTERY_STATE.OPEN;
        nextTokenId = 0;
        winnerAddress = address(0);
        winningTicketId = 0;

        feeRecipient = msg.sender;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        emit LotteryStarted(msg.sender);
    }

    function setBaseURI(string memory newBaseURI) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(bytes(newBaseURI).length > 0, "Base URI cannot be empty");
        baseURI = newBaseURI;
        emit BaseURIUpdated(newBaseURI);
    }

    function setFeeRecipient(address _feeRecipient) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_feeRecipient != address(0), "Fee recipient cannot be zero address");
        require(_feeRecipient != feeRecipient, "Fee recipient is already set to this address");
        feeRecipient = _feeRecipient;
    }

    function buyTicket(uint256 quantity) external payable nonReentrant {
        if (lotteryState != LOTTERY_STATE.OPEN) {
            revert LotteryNotOpen();
        }
        if (quantity == 0 || quantity > type(uint8).max) {
            revert InvalidQuantityZeroOrTooLarge();
        }
        unchecked {
            uint256 totalCost = quantity * ticketPrice;
            if (totalCost / quantity != ticketPrice) {
                revert InvalidQuantityZeroOrTooLarge();
            }
            if (msg.value < totalCost) {
                revert InsufficientPayment();
            }
        }
        if (quantity > MAX_TICKETS_PER_TX) {
            revert ExceedsMaxTicketsPerTx();
        }
        uint256 newPlayerTotal = playerTickets[msg.sender] + quantity;
        if (newPlayerTotal < playerTickets[msg.sender]) {
            revert InvalidQuantityZeroOrTooLarge();
        }
        if (newPlayerTotal > MAX_TICKETS_PER_PLAYER) {
            revert MaxTicketsPerPlayerExceeded();
        }

        // Calcular y validar el nuevo total antes de cualquier operación
        uint256 newTotal = nextTokenId + quantity;
        if (newTotal > maxTickets) {
            revert MaximumTicketsReached();
        }

        // Reservar los IDs antes de mint
        uint256 startId = nextTokenId;
        nextTokenId = newTotal;

        // Procesar reembolso si es necesario
        uint256 cost = quantity * ticketPrice;
        uint256 excess = msg.value - cost;
        if (excess > 0) {
            (bool success, ) = payable(msg.sender).call{value: excess}("");
            if (!success) {
                revert RefundFailed();
            }
        }

        // Actualizar estado
        playerTickets[msg.sender] += quantity;
        
        // Mint usando los IDs reservados
        for (uint256 i = 0; i < quantity; i++) {
            _safeMint(msg.sender, startId + i);
            ticketOwners[startId + i] = msg.sender;
            emit TicketPurchased(msg.sender, startId + i);
        }

        // Verificar si la lotería está completa
        if (newTotal == maxTickets) {
            lotteryState = LOTTERY_STATE.CALCULATING_WINNER;
            _selectWinnerAndReset();
        }
    }

    function _selectWinnerAndReset() private {
        require(lotteryState == LOTTERY_STATE.CALCULATING_WINNER, "Invalid state");
        require(nextTokenId == maxTickets, "Lottery not full");

        // Seleccionar ganador
        uint256 randomSeed = uint256(keccak256(abi.encodePacked(
            block.timestamp,
            block.prevrandao,
            blockhash(block.number - 1),
            msg.sender,
            address(this),
            gasleft()
        )));
        
        uint256 winnerIndex = randomSeed % maxTickets;
        address winner = ticketOwners[winnerIndex];
        require(winner != address(0), "Invalid winner");

        // Actualizar estado
        lotteryState = LOTTERY_STATE.CLOSED;
        winnerAddress = winner;
        winningTicketId = winnerIndex;

        // Distribuir premios
        uint256 totalPrize = address(this).balance;
        uint256 fee = (totalPrize * 2) / 100;
        uint256 winnerPrize = totalPrize - fee;

        // Emitir evento
        emit LotteryEnded(winner, winnerIndex);

        // Transferir premios
        (bool feeSuccess, ) = payable(feeRecipient).call{value: fee}("");
        require(feeSuccess, "Fee transfer failed");
        
        (bool prizeSuccess, ) = payable(winner).call{value: winnerPrize}("");
        require(prizeSuccess, "Prize transfer failed");

        // Reset
        _resetLotteryState();
    }

    function _resetLotteryState() private {
        uint256 batchSize = 50;
        uint256 totalTokens = nextTokenId;
        
        for (uint256 i = 0; i < totalTokens; i += batchSize) {
            uint256 end = (i + batchSize > totalTokens) ? totalTokens : i + batchSize;
            for (uint256 j = i; j < end; j++) {
                address owner = ticketOwners[j];
                if (owner != address(0)) {
                    playerTickets[owner] = 0;
                    delete ticketOwners[j];
                    _burn(j);
                }
            }
        }
        
        nextTokenId = 0;
        lotteryState = LOTTERY_STATE.OPEN;
        emit LotteryStarted(msg.sender);
    }

    function uint256ToString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC721, ERC721Enumerable, ERC721URIStorage, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function tokenURI(uint256 tokenId)
        public
        view
        virtual
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function getTicketsSold() external view returns (uint256) {
        return nextTokenId;
    }

    function _increaseBalance(address account, uint128 value) internal virtual override(ERC721, ERC721Enumerable) {
        super._increaseBalance(account, value);
    }

    function _update(address to, uint256 tokenId, address auth) internal virtual override(ERC721, ERC721Enumerable) returns (address) {
        return super._update(to, tokenId, auth);
    }

    // Añadir función helper para verificar existencia de token
    function _exists(uint256 tokenId) internal view returns (bool) {
        try this.ownerOf(tokenId) returns (address) {
            return true;
        } catch {
            return false;
        }
    }
}