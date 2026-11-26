// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Учебный токен. Все суммы выражены в минимальных единицах STC.
contract StudyToken {
    string public constant name = "StudyToken";
    string public constant symbol = "STC";
    uint8 public constant decimals = 18;
    uint256 public constant maxSupply = 100_000 * 10 ** decimals;

    address public immutable owner;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error ZeroAddress();
    error InsufficientBalance();
    error InsufficientAllowance();
    error OnlyOwner();
    error SupplyLimit();

    constructor() {
        owner = msg.sender;
        _mint(owner, 1_000 * 10 ** decimals);
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        if (spender == address(0)) revert ZeroAddress();
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 approved = allowance[from][msg.sender];
        if (approved < value) revert InsufficientAllowance();
        allowance[from][msg.sender] = approved - value;
        emit Approval(from, msg.sender, approved - value);
        _transfer(from, to, value);
        return true;
    }

    function mint(address to, uint256 value) external {
        if (msg.sender != owner) revert OnlyOwner();
        _mint(to, value);
    }

    function burn(uint256 value) external {
        if (balanceOf[msg.sender] < value) revert InsufficientBalance();
        balanceOf[msg.sender] -= value;
        totalSupply -= value;
        emit Transfer(msg.sender, address(0), value);
    }

    function _transfer(address from, address to, uint256 value) private {
        if (from == address(0) || to == address(0)) revert ZeroAddress();
        if (balanceOf[from] < value) revert InsufficientBalance();
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }

    function _mint(address to, uint256 value) private {
        if (to == address(0)) revert ZeroAddress();
        if (value > maxSupply - totalSupply) revert SupplyLimit();
        totalSupply += value;
        balanceOf[to] += value;
        emit Transfer(address(0), to, value);
    }
}
