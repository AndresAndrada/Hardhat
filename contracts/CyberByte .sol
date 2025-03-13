// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

contract CyberByte {
    address owner;
    string private name;
    string private symbol;
    uint256 totalSupply;

    mapping(address account => uint256) private _balance;
    mapping(address => bool) private registeredUsers;

    address[] private registeredUsersList;

    event TransferSuccessfull(address _from, uint256 _token);
    event UserRegistered(address indexed _user);

    error OwnableInvalidOwner(address account);
    error ERC20InvalidReceiver(address owner);
    error UserAllRegistered(address account);

    constructor(string memory _name, string memory _symbol) {
        if (msg.sender == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }
        owner = msg.sender;
        name = _name;
        symbol = _symbol;
        totalSupply = 999999999999999999 * 10 ** 18;
        _balance[msg.sender] = 999999999999999999 * 10 ** 18;
    }

    modifier onlyOwner(address initialOwner) {
        if (initialOwner == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }
        _;
    }

    function balanceOf(address _account) public virtual returns (uint256) {
        return _balance[_account];
    }

    function mint(uint256 _token) public onlyOwner(msg.sender) {
        emit TransferSuccessfull(msg.sender, _token);
    }

    function registerUser() public {
        if (registeredUsers[msg.sender]) {
            revert UserAllRegistered(msg.sender);
        }
        registeredUsers[msg.sender] = true;
        registeredUsersList.push(msg.sender);
        emit UserRegistered(msg.sender);
    }

    function isUserRegistered(address _user) public view returns (bool) {
        return registeredUsers[_user];
    }

    function getRegisteredUsers() public view returns (address[] memory) {
        return registeredUsersList;
    }
}
