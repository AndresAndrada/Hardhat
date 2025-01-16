// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {VRFV2PlusWrapperConsumerBase} from "@chainlink/contracts/src/v0.8/vrf/dev/VRFV2PlusWrapperConsumerBase.sol";
import {VRFV2PlusClient} from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";

contract Lottery is ERC721, ERC721Enumerable, ERC721URIStorage, AccessControl, VRFV2PlusWrapperConsumerBase {
    uint256 public constant MAX_TICKETS_PER_PLAYER = 3;

    enum LOTTERY_STATE { OPEN, CALCULATING_WINNER, CLOSED }
    LOTTERY_STATE public lotteryState;

    string public baseURI;
    uint256 public nextTokenId;
    address[] public players;
    mapping(address => uint256) public playerTickets;

    uint256 public ticketPrice;
    uint256 public maxTickets;

    uint32 public callbackGasLimit = 100000;
    uint16 public requestConfirmations = 3;
    uint32 public numWords = 1;
    address public feeRecipient;

    uint256 public lastRequestId;
    address public winnerAddress;
    uint256 public winningTicketId;

    event LotteryStarted(address indexed starter);
    event TicketPurchased(address indexed buyer, uint256 indexed ticketId);
    event LotteryEnded(address indexed winner, uint256 winningTicketId);
    event RandomnessRequested(uint256 requestId);
    event RandomnessFulfilled(uint256 requestId, uint256 randomWord);
    event DebugLog(address indexed user, string message);

    constructor(
        string memory initialBaseURI,
        address vrfWrapperAddress,
        uint256 _ticketPrice,
        uint256 _maxTickets
    ) ERC721("LotteryNFT", "LTNFT") VRFV2PlusWrapperConsumerBase(vrfWrapperAddress) {
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
        baseURI = newBaseURI;
    }

    function setFeeRecipient(address _feeRecipient) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_feeRecipient != address(0), "Fee recipient cannot be zero address");
        feeRecipient = _feeRecipient;
    }

    function buyTicket() external payable {
        emit DebugLog(msg.sender, "Starting buyTicket");
        require(lotteryState == LOTTERY_STATE.OPEN, "Lottery is not open");
        emit DebugLog(msg.sender, "Lottery is open");
        require(nextTokenId < maxTickets, "Maximum ticket limit reached");
        emit DebugLog(msg.sender, "Tickets available");
        require(playerTickets[msg.sender] < MAX_TICKETS_PER_PLAYER, "Player reached maximum ticket limit");
        emit DebugLog(msg.sender, "Player under max tickets");
        require(msg.value == ticketPrice, "Incorrect ETH value sent");
        emit DebugLog(msg.sender, "Correct ETH value sent");

        uint256 tokenId = nextTokenId++;
        _safeMint(msg.sender, tokenId);
        emit DebugLog(msg.sender, "Ticket minted");

        string memory tokenSpecificURI = string(abi.encodePacked(baseURI, "/", uint256ToString(tokenId)));
        _setTokenURI(tokenId, tokenSpecificURI);
        emit DebugLog(msg.sender, "Token URI set");

        players.push(msg.sender);
        playerTickets[msg.sender]++;
        emit DebugLog(msg.sender, "Player ticket count updated");

        emit TicketPurchased(msg.sender, tokenId);

        if (nextTokenId == maxTickets) {
            lotteryState = LOTTERY_STATE.CALCULATING_WINNER;
            emit DebugLog(msg.sender, "All tickets sold, calculating winner");
            requestRandomWords();
        }
    }

    function requestRandomWords() internal {
        emit DebugLog(msg.sender, "Requesting random words");
        bytes memory extraArgs = VRFV2PlusClient._argsToBytes(
            VRFV2PlusClient.ExtraArgsV1({nativePayment: true})
        );
        (uint256 requestId, ) = requestRandomnessPayInNative(
            callbackGasLimit,
            requestConfirmations,
            numWords,
            extraArgs
        );

        lastRequestId = requestId;
        emit RandomnessRequested(requestId);
    }

    function fulfillRandomWords(uint256 _requestId, uint256[] memory _randomWords) internal override {
        emit DebugLog(msg.sender, "Fulfilling random words");
        require(lotteryState == LOTTERY_STATE.CALCULATING_WINNER, "Not ready for winner selection");
        require(_randomWords.length > 0, "No random words provided");

        uint256 winnerIndex = _randomWords[0] % players.length;
        address winner = players[winnerIndex];

        uint256 rewardAmount = address(this).balance;
        uint256 feeAmount = (rewardAmount * 2) / 100;
        uint256 netReward = rewardAmount - feeAmount;

        payable(feeRecipient).transfer(feeAmount);
        payable(winner).transfer(netReward);

        winnerAddress = winner;
        winningTicketId = winnerIndex;

        lotteryState = LOTTERY_STATE.CLOSED;

        emit RandomnessFulfilled(_requestId, _randomWords[0]);
        emit LotteryEnded(winner, winnerIndex);
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

    function _increaseBalance(address account, uint128 value)
        internal
        virtual
        override(ERC721, ERC721Enumerable)
    {
        super._increaseBalance(account, value);
    }

    function _update(address to, uint256 tokenId, address auth)
        internal
        virtual
        override(ERC721, ERC721Enumerable)
        returns (address)
    {
        return super._update(to, tokenId, auth);
    }
}
