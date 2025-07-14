// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/**
 * @title ICrossDomainMessenger
 * @notice Minimal interface to check xDomainMessageSender.
 */
interface ICrossDomainMessenger {
    function xDomainMessageSender() external view returns (address);
}

/**
 * @title IOptimismMintableERC20
 * @notice Interface for Optimism Mintable ERC20 tokens.
 */
interface IOptimismMintableERC20 {
    function remoteToken() external view returns (address);
    function bridge() external returns (address);
    function mint(address _to, uint256 _amount) external;
    function burn(address _from, uint256 _amount) external;
}

/**
 * @title ILegacyMintableERC20
 * @notice Legacy interface for Mintable ERC20 tokens.
 */
interface ILegacyMintableERC20 {
    function l1Token() external view returns (address);
    function mint(address _to, uint256 _amount) external;
    function burn(address _from, uint256 _amount) external;
}

/**
 * @title WrappedVerdiktaToken
 * @notice Wrapped version of VerdiktaToken for Base, compatible with Base Standard Bridge.
 * Implements IOptimismMintableERC20 and ILegacyMintableERC20.
 */
contract WrappedVerdiktaToken is ERC20Permit, ERC165, IOptimismMintableERC20, ILegacyMintableERC20 {
    address public immutable l1_Token;
    address public immutable l1Bridge;

    // Base’s L2CrossDomainMessenger address.
    address public constant L2_CROSS_DOMAIN_MESSENGER =
        0x4200000000000000000000000000000000000007;

    // Base L2 Standard Bridge address.
    address public constant L2_STANDARD_BRIDGE =
        0x4200000000000000000000000000000000000010;

    /**
     * @dev Modifier to restrict access to the L2 bridge.
     * Allows either a direct call from the L2 Standard Bridge or conditional from the messenger.
     */
    modifier onlyBridge() {
        require(
            msg.sender == L2_STANDARD_BRIDGE || 
            (msg.sender == L2_CROSS_DOMAIN_MESSENGER && 
             ICrossDomainMessenger(L2_CROSS_DOMAIN_MESSENGER).xDomainMessageSender() == l1Bridge),
            "Caller is not authorized"
        );
        _;
    }

    /**
     * @notice Constructor for WrappedVerdiktaToken.
     * @param _l1Token Address of the VerdiktaToken.
     * @param _l1Bridge Address of the L1 Standard Bridge.
     */
    constructor(
        address _l1Token,
        address _l1Bridge
    )
        ERC20("Wrapped Verdikta", "wVDKA")
        ERC20Permit("Wrapped Verdikta")
    {
        require(_l1Token != address(0), "Invalid L1 token address");
        require(_l1Bridge != address(0), "Invalid L1 bridge address");

        l1_Token = _l1Token;
        l1Bridge = _l1Bridge;
    }

    /**
     * @notice Returns the L1 token address.
     * Required for compatibility with ILegacyMintableERC20.
     */
    function l1Token() external view override returns (address) {
        return l1_Token;
    }

    /**
     * @notice Implements IOptimismMintableERC20.
     * @return The remote token address (L1 token address).
     */
    function remoteToken() external view override returns (address) {
        return l1_Token;
    }

    /**
     * @notice Implements IOptimismMintableERC20.
     * @return The bridge address (L2 Standard Bridge).
     */
    function bridge() external pure override returns (address) {
        return L2_STANDARD_BRIDGE;
    }

    /**
     * @notice ERC165 support.
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165) returns (bool) {
        return
            interfaceId == type(IOptimismMintableERC20).interfaceId ||
            interfaceId == type(ILegacyMintableERC20).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    /**
     * @notice Mint tokens when bridged from L1.
     * Can be called by L2StandardBridge or via the messenger.
     * @param to Address to mint tokens to.
     * @param amount Amount of tokens to mint.
     */
    function mint(address to, uint256 amount)
        external
        override(ILegacyMintableERC20, IOptimismMintableERC20)
        onlyBridge
    {
        _mint(to, amount);
    }

    /**
     * @notice Burn tokens from a specific address (used by the bridge).
     * Can be called either directly by L2StandardBridge or via the messenger.
     * @param from Address to burn tokens from.
     * @param amount Amount of tokens to burn.
     */
    function burn(address from, uint256 amount)
        external
        override(ILegacyMintableERC20, IOptimismMintableERC20)
        onlyBridge
    {
        _burn(from, amount);
    }
}

