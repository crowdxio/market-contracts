pragma solidity ^0.4.24;

import "../zeppelin/contracts/ownership/NoOwner.sol";
import "../zeppelin/contracts/lifecycle/Pausable.sol";
import "../zeppelin/contracts/ReentrancyGuard.sol";
import {SafeMath} from "../zeppelin/contracts/math/SafeMath.sol";
import {ERC721Token} from "../zeppelin/contracts/token/ERC721/ERC721Token.sol";

contract UniqxMarketBase is NoOwner, Pausable, ReentrancyGuard {

	using SafeMath for uint;

	/////////////////////////////////////// CONSTANTS ///////////////////////////////////////
	/////////////////////////////////////// TYPES ///////////////////////////////////////////
	enum OrderStatus {
		Unknown,
		Listed,			// token listed by owner or seller
		Reserved,		// not used in this contract
		Cancelled,		// order canceled by owner or seller (some restrictions are applied on auction orders)
		Sold,			// token sold, the item goes to the buyer or to the highest bidder on auction orders
		Unsold			// auction ended with zero bids, token goes back to owner
	}

	struct TokenContract {
		bool registered;
		bool ordersEnabled;
	}

	event LogOrdersEnabled();
	event LogOrdersDisabled();
	event LogTokenRegistered(address token);
	event LogTokenOrdersEnabled(address token);
	event LogTokenOrdersDisabled(address token);
	event LogTokensListedAuction(
		// lookup
		address token,
		uint[] tokenIds,

		// common
		address[] owners,
		address seller,
		uint[] buyPrices,

		// auction
		uint[] startPrices,
		uint[] endTimes
	);
	event LogBidPlaced(address token, uint tokenId, address bidder, uint bid);
	event LogTokenSold(address token, uint tokenId, address buyer, uint price);
	event LogTokenCancelled(address token, uint tokenIds);
	event LogTokensCancelled(address token, uint[] tokenIds);
	event LogTokenUnsold(address token, uint tokenId);

	/////////////////////////////////////// VARIABLES ///////////////////////////////////////
	address public MARKET_FEE_COLLECTOR;
	bool public ORDERS_ENABLED = true;
	uint public marketFeeNum = 1;
	uint public marketFeeDen = 100;
	mapping(address => TokenContract) tokenContracts;


	/////////////////////////////////////// MODIFIERS ///////////////////////////////////////
	modifier whenOrdersEnabled() {
		require(ORDERS_ENABLED, "Orders must be enabled");
		_;
	}

	modifier whenOrdersDisabled() {
		require(!ORDERS_ENABLED, "Orders must be disabled");
		_;
	}

	/////////////////////////////////////// PUBLIC //////////////////////////////////////////

	function setMarketFee(uint _marketFeeNum, uint _marketFeeDen)
		onlyOwner
		public
	{
		marketFeeNum = _marketFeeNum;
		marketFeeDen = _marketFeeDen;
	}

	function setMarketFeeCollector(address _marketFeeCollector)
		onlyOwner
		public
	{
		MARKET_FEE_COLLECTOR = _marketFeeCollector;
	}

	function enableOrders()
		onlyOwner
		whenOrdersDisabled
		public
	{
		ORDERS_ENABLED = true;
		emit LogOrdersEnabled();
	}

	function disableOrders()
		onlyOwner
		whenOrdersEnabled
		public
	{
		ORDERS_ENABLED = false;
		emit LogOrdersDisabled();
	}

	function registerToken(address token)
		onlyOwner
		public
	{
		require(!tokenContracts[token].registered, "Token should not be registered already");

		TokenContract memory tokenContract = TokenContract(
			{
			registered: true,
			ordersEnabled: true
			}
		);

		tokenContracts[token] = tokenContract;
		emit LogTokenRegistered(token);
	}

	function getTokenContractStatus(address token)
		public
		view
		returns(bool registered, bool ordersEnabled)
	{
		TokenContract storage tokenContract = tokenContracts[token];
		registered = tokenContract.registered;
		ordersEnabled = tokenContract.ordersEnabled;
	}

	function enableTokenOrders(address token)
		onlyOwner
		public
	{
		TokenContract storage tokenContract = tokenContracts[token];

		require(tokenContract.registered, "Token must be registered");
		require(!tokenContract.ordersEnabled, "Orders must be disabled for this token");
		tokenContract.ordersEnabled = true;

		emit LogTokenOrdersEnabled(token);
	}

	function disableTokenOrders(address token)
		onlyOwner
		public
	{
		TokenContract storage tokenContract = tokenContracts[token];

		require(tokenContract.registered, "Token must be registered");
		require(tokenContract.ordersEnabled, "Orders must be enabled for this token");
		tokenContract.ordersEnabled = false;

		emit LogTokenOrdersDisabled(token);
	}

	/////////////////////////////////////// INTERNAL ////////////////////////////////////////

	function isSpenderApproved(address spender, address token, uint256 tokenId)
		internal
		view
		returns (bool)
	{
		TokenContract storage tokenContract = tokenContracts[token];
		require(tokenContract.registered, "Token must be registered");

		ERC721Token tokenInstance = ERC721Token(token);
		address owner = tokenInstance.ownerOf(tokenId);

		return (spender == owner
				|| tokenInstance.getApproved(tokenId) == spender
				|| tokenInstance.isApprovedForAll(owner, spender));
	}
}
