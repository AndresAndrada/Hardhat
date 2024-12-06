// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Burnable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {ERC721Pausable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Pausable.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";  
import {VRFV2PlusWrapperConsumerBase} from "@chainlink/contracts/src/v0.8/vrf/dev/VRFV2PlusWrapperConsumerBase.sol";  
import {VRFV2PlusClient} from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";  
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";  

contract Lottery is ERC721, ERC721Enumerable, ERC721URIStorage, AccessControl, VRFV2PlusWrapperConsumerBase, ReentrancyGuard {

    uint256 public constant MAX_TICKETS_PER_PLAYER = 3;
    uint256 public constant MAX_TICKETS = 100000;
    uint256 public constant TICKET_PRICE = 0.1 ether;
    uint256 public constant MAX_NUMBER = 25;
    uint256 public constant NUM_SELECTIONS = 15;

    enum LOTTERY_STATE { OPEN, CALCULATING_WINNER, CLOSED }
    LOTTERY_STATE public lotteryState;

    string public baseURI;
    uint256 public nextTokenId;

    mapping(address => uint256) public playerTickets;
    mapping(uint256 => address) public ticketOwners;
    mapping(address => uint256) public pendingWithdrawals;
    
    // Mapping for storing player number selections
    mapping(uint256 => uint256[]) public ticketSelections;

    uint32 public callbackGasLimit = 100000;
    uint16 public requestConfirmations = 3;
    uint32 public numWords = 15;

    address public feeRecipient;
    uint256 public lastRequestId;

    address public winnerAddress;
    uint256 public winningTicketId;

    uint256[] public winningNumbers;

    // Variables for categories and accumulated prizes
    uint256 public category1Prize;
    uint256 public category2Prize;
    uint256 public category3Prize;
    uint256 public category4Prize;

    mapping(address => uint256) public category1Winners;
    mapping(address => uint256) public category2Winners;
    mapping(address => uint256) public category3Winners;
    mapping(address => uint256) public category4Winners;

    event LotteryStarted(address indexed starter);
    event TicketPurchased(address indexed buyer, uint256 indexed ticketId);
    event LotteryEnded(address indexed winner, uint256 winningTicketId, uint256[] winningNumbers, uint256[] category1Winners, uint256[] category2Winners, uint256[] category3Winners, uint256[] category4Winners);
    event RandomnessRequested(uint256 requestId);
    event RandomnessFulfilled(uint256 requestId, uint256[] randomWords);
    event Withdrawal(address indexed recipient, uint256 amount);
    event BaseURIUpdated(string newBaseURI);

    constructor(
        string memory initialBaseURI,
        address vrfWrapperAddress
    ) ERC721("LotteryNFT", "LTNFT") VRFV2PlusWrapperConsumerBase(vrfWrapperAddress) {
        baseURI = initialBaseURI;
        lotteryState = LOTTERY_STATE.OPEN;
        nextTokenId = 0;
        winnerAddress = address(0);
        winningTicketId = 0;
        winningNumbers = new uint256[](NUM_SELECTIONS);

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

    function buyTicket(uint256 quantity, uint256[] memory selectedNumbers) external payable nonReentrant {
        require(lotteryState == LOTTERY_STATE.OPEN, "Lottery is not open");
        require(nextTokenId + quantity <= MAX_TICKETS, "Maximum ticket limit reached");
        require(playerTickets[msg.sender] + quantity <= MAX_TICKETS_PER_PLAYER, "Player reached maximum ticket limit");
        require(msg.value >= quantity * TICKET_PRICE, "Incorrect ETH value sent");
        require(selectedNumbers.length == NUM_SELECTIONS, "Player must select 15 numbers");
        require(areValidSelections(selectedNumbers), "Invalid number selection");

        uint256 excess = msg.value - quantity * TICKET_PRICE;
        if (excess > 0) {
            payable(msg.sender).transfer(excess);
        }

        for (uint256 i = 0; i < quantity; i++) {
            uint256 tokenId = nextTokenId++;
            _safeMint(msg.sender, tokenId);

            // Store the player's selected numbers for the ticket
            ticketSelections[tokenId] = selectedNumbers;

            string memory tokenSpecificURI = string(abi.encodePacked(baseURI, "/", uint256ToString(tokenId)));
            _setTokenURI(tokenId, tokenSpecificURI);

            ticketOwners[tokenId] = msg.sender;
            playerTickets[msg.sender]++;

            emit TicketPurchased(msg.sender, tokenId);
        }

        if (nextTokenId == MAX_TICKETS) {
            lotteryState = LOTTERY_STATE.CALCULATING_WINNER;
            requestRandomWords();
        }
    }

    function areValidSelections(uint256[] memory selectedNumbers) internal pure returns (bool) {
        for (uint256 i = 0; i < selectedNumbers.length; i++) {
            if (selectedNumbers[i] < 1 || selectedNumbers[i] > MAX_NUMBER) {
                return false;
            }
            for (uint256 j = i + 1; j < selectedNumbers.length; j++) {
                if (selectedNumbers[i] == selectedNumbers[j]) {
                    return false; // Duplicate numbers are not allowed
                }
            }
        }
        return true;
    }

    function requestRandomWords() internal {
        bytes memory extraArgs = VRFV2PlusClient._argsToBytes(VRFV2PlusClient.ExtraArgsV1({nativePayment: true}));
        (uint256 requestId, ) = requestRandomnessPayInNative(
            callbackGasLimit,
            requestConfirmations,
            numWords,
            extraArgs
        );

        lastRequestId = requestId;
        emit RandomnessRequested(requestId);
    }

    function fulfillRandomWords(uint256 _requestId, uint256[] memory _randomWords) internal override nonReentrant {
        require(_requestId == lastRequestId, "Invalid random request ID");
        require(lotteryState == LOTTERY_STATE.CALCULATING_WINNER, "Not ready for winner selection");
        require(_randomWords.length == NUM_SELECTIONS, "Incorrect number of random words");

        // Store the winning numbers
        for (uint256 i = 0; i < NUM_SELECTIONS; i++) {
            winningNumbers[i] = (_randomWords[i] % MAX_NUMBER) + 1; // Generate numbers between 1 and 25
        }

        // Determine winners based on match count
        uint256[] memory category1WinnersList = new uint256[](nextTokenId);
        uint256[] memory category2WinnersList = new uint256[](nextTokenId);
        uint256[] memory category3WinnersList = new uint256[](nextTokenId);
        uint256[] memory category4WinnersList = new uint256[](nextTokenId);

        uint256 category1Count = 0;
        uint256 category2Count = 0;
        uint256 category3Count = 0;
        uint256 category4Count = 0;

        for (uint256 i = 0; i < nextTokenId; i++) {
            uint256[] memory selectedNumbers = ticketSelections[i];
            uint256 matchCount = getMatchCount(selectedNumbers);

            if (matchCount == 15) {
                category1WinnersList[category1Count++] = i;
            } else if (matchCount == 14) {
                category2WinnersList[category2Count++] = i;
            } else if (matchCount == 13) {
                category3WinnersList[category3Count++] = i;
            } else if (matchCount == 12) {
                category4WinnersList[category4Count++] = i;
            }
        }

        category1Prize = address(this).balance / 4;
        category2Prize = address(this).balance / 4;
        category3Prize = address(this).balance / 4;
        category4Prize = address(this).balance / 4;

        if (category1Count > 0) {
            category1Prize = category1Prize / category1Count;
        }
        if (category2Count > 0) {
            category2Prize = category2Prize / category2Count;
        }
        if (category3Count > 0) {
            category3Prize = category3Prize / category3Count;
        }
        if (category4Count > 0) {
            category4Prize = category4Prize / category4Count;
        }

        // Distribute winnings
        for (uint256 i = 0; i < category1Count; i++) {
            category1Winners[ticketOwners[category1WinnersList[i]]] += category1Prize;
        }
        for (uint256 i = 0; i < category2Count; i++) {
            category2Winners[ticketOwners[category2WinnersList[i]]] += category2Prize;
        }
        for (uint256 i = 0; i < category3Count; i++) {
            category3Winners[ticketOwners[category3WinnersList[i]]] += category3Prize;
        }
        for (uint256 i = 0; i < category4Count; i++) {
            category4Winners[ticketOwners[category4WinnersList[i]]] += category4Prize;
        }

        lotteryState = LOTTERY_STATE.CLOSED;

        emit RandomnessFulfilled(_requestId, _randomWords);
        emit LotteryEnded(winnerAddress, winningTicketId, winningNumbers, category1WinnersList, category2WinnersList, category3WinnersList, category4WinnersList);
    }

    function getMatchCount(uint256[] memory selectedNumbers) internal view returns (uint256) {
        uint256 matchCount = 0;
        for (uint256 i = 0; i < selectedNumbers.length; i++) {
            for (uint256 j = 0; j < winningNumbers.length; j++) {
                if (selectedNumbers[i] == winningNumbers[j]) {
                    matchCount++;
                    break;
                }
            }
        }
        return matchCount;
    }

    function withdrawFee() external nonReentrant onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 feeAmount = pendingWithdrawals[feeRecipient];
        require(feeAmount > 0, "No funds to withdraw");

        pendingWithdrawals[feeRecipient] = 0;

        (bool success, ) = payable(feeRecipient).call{value: feeAmount}("");
        require(success, "Transfer failed");

        emit Withdrawal(feeRecipient, feeAmount);
    }

    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "No funds to withdraw");

        pendingWithdrawals[msg.sender] = 0;

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Transfer failed");

        emit Withdrawal(msg.sender, amount);
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
