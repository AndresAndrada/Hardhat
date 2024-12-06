// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Burnable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {VRFConsumerBaseV2Plus} from "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {VRFCoordinatorV2Interface} from "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";

contract Lottery is ERC721, ERC721Enumerable, ERC721URIStorage, ERC721Burnable, ReentrancyGuard, VRFConsumerBaseV2Plus {
    uint256 public constant MAX_TICKETS_PER_PLAYER = 3;

    enum LOTTERY_STATE { OPEN, CALCULATING_WINNER, CLOSED }
    LOTTERY_STATE public lotteryState;

    string public baseURI;
    uint256 public nextTokenId;

    address[] public players;
    mapping(address => uint256) public playerTickets;
    mapping(address => uint256) private pendingPayments;

    IERC20 public rewardToken;
    uint256 public ticketPrice;
    uint256 public maxTickets;

    uint256 public subscriptionId;
    bytes32 public keyHash;
    uint32 public callbackGasLimit = 100000;
    uint16 public requestConfirmations = 3;
    address public feeRecipient;

    VRFCoordinatorV2Interface private COORDINATOR;

    // Variables para registrar al ganador
    address public winnerAddress;
    uint256 public winningTicketId;

    event LotteryStarted(address indexed starter);
    event TicketPurchased(address indexed buyer, uint256 indexed ticketId);
    event LotteryEnded(address indexed winner, uint256 winningTicketId);
    event PaymentPending(address indexed payee, uint256 amount);
    event PaymentWithdrawn(address indexed payee, uint256 amount);

    constructor(
        string memory initialBaseURI,
        address vrfCoordinator,
        bytes32 _keyHash,
        uint256 _subscriptionId,
        address _rewardToken,
        uint256 _ticketPrice,
        uint256 _maxTickets
    ) ERC721("LotteryNFT", "LTNFT") VRFConsumerBaseV2Plus(vrfCoordinator) {
        require(_maxTickets > 0, "Maximum tickets must be greater than zero");

        baseURI = initialBaseURI;
        keyHash = _keyHash;
        subscriptionId = _subscriptionId;

        rewardToken = IERC20(_rewardToken);
        ticketPrice = _ticketPrice;
        maxTickets = _maxTickets;

        COORDINATOR = VRFCoordinatorV2Interface(vrfCoordinator);

        lotteryState = LOTTERY_STATE.OPEN;
        nextTokenId = 0;
        winnerAddress = address(0);
        winningTicketId = 0;

        feeRecipient = msg.sender;

        emit LotteryStarted(msg.sender);
    }

    function buyTicket() external {
        require(lotteryState == LOTTERY_STATE.OPEN, "Lottery is not open");
        require(nextTokenId < maxTickets, "Maximum ticket limit reached");
        require(playerTickets[msg.sender] < MAX_TICKETS_PER_PLAYER, "Player reached maximum ticket limit");

        uint256 allowance = rewardToken.allowance(msg.sender, address(this));
        require(allowance >= ticketPrice, "Insufficient allowance for ticket purchase");

        require(rewardToken.transferFrom(msg.sender, address(this), ticketPrice), "Token transfer failed");

        uint256 tokenId = nextTokenId++;
        _safeMint(msg.sender, tokenId);

        string memory tokenSpecificURI = string(abi.encodePacked(baseURI, "/", uint256ToString(tokenId)));
        _setTokenURI(tokenId, tokenSpecificURI);

        players.push(msg.sender);
        playerTickets[msg.sender]++;

        emit TicketPurchased(msg.sender, tokenId);

        if (nextTokenId == maxTickets) {
            lotteryState = LOTTERY_STATE.CALCULATING_WINNER;
            requestRandomWords();
        }
    }

    function fulfillRandomWords(uint256, uint256[] calldata randomWords) internal override nonReentrant {
        require(lotteryState == LOTTERY_STATE.CALCULATING_WINNER, "Not ready for winner selection");

        uint256 winnerIndex = randomWords[0] % players.length;
        address winner = players[winnerIndex];

        uint256 rewardAmount = rewardToken.balanceOf(address(this));
        require(rewardAmount > 0, "No rewards available");

        uint256 feeAmount = (rewardAmount * 2) / 100;
        uint256 netReward = rewardAmount - feeAmount;

        require(rewardToken.transfer(feeRecipient, feeAmount), "Fee transfer failed");

        // Registrar el pago pendiente
        pendingPayments[winner] += netReward;
        emit PaymentPending(winner, netReward);

        winnerAddress = winner;
        winningTicketId = winnerIndex;

        lotteryState = LOTTERY_STATE.CLOSED;

        emit LotteryEnded(winner, winnerIndex);
    }

    function withdrawPayment() external nonReentrant {
        uint256 payment = pendingPayments[msg.sender];
        require(payment > 0, "No pending payments");

        pendingPayments[msg.sender] = 0;

        require(rewardToken.transfer(msg.sender, payment), "Token transfer failed");

        emit PaymentWithdrawn(msg.sender, payment);
    }

    function getPendingPayment(address payee) external view returns (uint256) {
        return pendingPayments[payee];
    }

    function requestRandomWords() internal {
        require(subscriptionId <= type(uint64).max, "Subscription ID exceeds uint64 limit");
        COORDINATOR.requestRandomWords(
            keyHash,
            uint64(subscriptionId),
            requestConfirmations,
            callbackGasLimit,
            1
        );
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

    // Sobrescribir funciones conflictivas
    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC721, ERC721Enumerable, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
// Sobrescribir funciones conflictivas
function _increaseBalance(address account, uint128 value) internal virtual override(ERC721, ERC721Enumerable) {
    ERC721Enumerable._increaseBalance(account, value);
}

function _update(address to, uint256 tokenId, address auth) internal virtual override(ERC721, ERC721Enumerable) returns (address) {
    return ERC721Enumerable._update(to, tokenId, auth);
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
}
