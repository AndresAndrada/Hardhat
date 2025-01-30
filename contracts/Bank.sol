// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

contract Bank {
    mapping(address => uint256) balance;

    event Transfer(address _from, address _to, uint256 _amount);

    function addBalance(uint256 _amount) external returns (uint256 _balance) {
        balance[msg.sender] += _amount;
        return balance[msg.sender];
    }

    function getBalance() external view returns (uint256 _balance) {
        return balance[msg.sender];
    }

    function _transfer(address _from, address _to, uint256 _amount) private {
        require(balance[_from] >= _amount, "Insufficient funds");
        balance[_from] -= _amount;
        balance[_to] += _amount;
        emit Transfer(_from, _to, _amount);
    }

    function transfer(address _to, uint256 _amount) external {
        _transfer(msg.sender, _to, _amount);
    }
}
