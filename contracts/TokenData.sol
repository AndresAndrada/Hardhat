// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract TokenData {
    struct GraphPoint {
        string date;
        string priceUsd;
    }

    struct TokenInfo {
        string imageUrl;
        string name;
        string symbol;
        string[][]  graphClone;        
        string changePercent24Hr;
        string supply;
        string volumeUsd24Hr;
        string vwap24Hr;
        string marketCapUsd;
    }

    address public owner;
    string constant KNRT_TOKEN_ID = "KNRT";
    mapping(string => TokenInfo) private tokenData;

    event TokenDataUpdated(string tokenId, TokenInfo info);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function setTokenData(TokenInfo memory info) public onlyOwner {
        tokenData[KNRT_TOKEN_ID] = info;
        emit TokenDataUpdated(KNRT_TOKEN_ID, info);
    }



    function getTokenData() public view returns (TokenInfo memory) {
        return tokenData[KNRT_TOKEN_ID];
    }
}
