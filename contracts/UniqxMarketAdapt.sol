pragma solidity ^0.4.24;

import "../zeppelin/contracts/ownership/NoOwner.sol";
import "../zeppelin/contracts/lifecycle/Pausable.sol";
import "../zeppelin/contracts/ReentrancyGuard.sol";
import "../zeppelin/contracts/token/ERC721/ERC721BasicToken.sol";
import { SafeMath } from "../zeppelin/contracts/math/SafeMath.sol";
import { AdaptCollectibles } from "../adapt/contracts/AdaptCollectibles.sol";

contract UniqxMarketAdapt is NoOwner, Pausable, ReentrancyGuard {

	using SafeMath for uint;

	// constants
	uint public constant RESERVATION_TIME 	= 3 days;
	uint public constant MIN_DONATION 		= 10000000000000 wei;
	uint public constant MARKET_FEE_NUM 	= 4;
	uint public constant MARKET_FEE_DEN 	= 100;

	// declarations
	enum OrderStatus {
		Unknown,
		Listed,
		Reserved,
		Cancelled,
		Sold
	}

	struct OrderInfo {
		uint makePrice;
		uint makeTime;
		uint acquirePrice;
		OrderStatus status;
		address maker;
		address owner;
	}

	// attributes
	address public MARKET_FEES_MSIG;
	AdaptCollectibles public ADAPT_TOKEN;
	mapping(uint => OrderInfo) orders;
	mapping(uint => address) reservations;

	// events
	event LogTokensListed(
		uint[] tokenIds,
		uint[] buyPrices,
		address[] reservations,
		address[] owners,
		address seller,
		uint listedAt
	);
	event LogTokenSold(uint tokenId, address buyer, uint price, uint soldAt);
	event LogTokensCancelled(uint[] tokens, uint cancelledAt);

	// entry point
	constructor(
		address marketAdmin,
		address marketFees,
		address adaptContract
	) public {

		MARKET_FEES_MSIG 	= marketFees;
		ADAPT_TOKEN 		= AdaptCollectibles(adaptContract);

		transferOwnership(marketAdmin);
	}

	function getOrderStatus(uint tokenId) public view
		returns (OrderStatus _status) {

		return orders[tokenId].status;
	}

	function getOrderInfo(uint _tokenId) public view
		returns (
			OrderStatus _status,
			uint _makePrice,
			uint _makeTime,
			uint _acquirePrice,
			address _maker
		)
	{
		OrderInfo storage order = orders[_tokenId];
		_status = order.status;
		_makePrice = order.makePrice;
		_makeTime = order.makeTime;
		_acquirePrice = order.acquirePrice;
		_maker = order.maker;
	}

	function getReservation(uint _tokenId) public view
		returns (address beneficiary) {

		return reservations[_tokenId];
	}

	function isSpenderApproved(
		address _spender,
		uint256 _tokenId
	)
		internal
		view
		returns (bool)
	{
		address tokenOwner = ADAPT_TOKEN.ownerOf(_tokenId);

		return (
			_spender == tokenOwner
			|| ADAPT_TOKEN.getApproved(_tokenId) == _spender
			|| ADAPT_TOKEN.isApprovedForAll(tokenOwner, _spender)
		);
	}

	function listTokens(
		uint [] tokenIds,
		uint [] buyPrices,
		address[] _reservations
	)
		public
		whenNotPaused
		nonReentrant
	{
		require(tokenIds.length == buyPrices.length);
		require(tokenIds.length == _reservations.length);

		address[] memory owners = new address[](buyPrices.length);

		for(uint i = 0; i < tokenIds.length; i++) {

			require(buyPrices[i] >= MIN_DONATION);

			// token must not be listed on the market
			OrderInfo storage existingOrder = orders[tokenIds[i]];
			require(
				existingOrder.status == OrderStatus.Unknown ||
				existingOrder.status == OrderStatus.Cancelled
			);

			// make sure the maker is approved to sell this item
			require(isSpenderApproved(msg.sender, tokenIds[i]));

			// market will now escrow the token (owner or seller must approve unix market before listing)
			address tokenOwner = ADAPT_TOKEN.ownerOf(tokenIds[i]);
			ADAPT_TOKEN.transferFrom(tokenOwner, address(this), tokenIds[i]);
			owners[i] = tokenOwner;

			OrderInfo memory order = OrderInfo(
				{
					makePrice: buyPrices[i],
					makeTime: now,
					acquirePrice: 0,
					status: OrderStatus.Listed,
					maker: msg.sender,
					owner: tokenOwner
				}
			);

			if(_reservations[i] != address(0x0)) {
				reservations[tokenIds[i]] = _reservations[i];
				order.status = OrderStatus.Reserved;
			}

			orders[tokenIds[i]] = order;
		}

		emit LogTokensListed(tokenIds, buyPrices, _reservations, owners, msg.sender, now);
	}

	function cancelTokens(uint[] tokenIds)
		public
		whenNotPaused
		nonReentrant
	{
		for(uint i=0; i < tokenIds.length; i++) {
			OrderInfo storage order = orders[tokenIds[i]];
			// only the original maker can cancel
			require(msg.sender == order.maker);

			// token must still be published on the market
			require(
				order.status == OrderStatus.Listed ||
				order.status == OrderStatus.Reserved
			);
			// token must still be in temporary custody of the market
			require(ADAPT_TOKEN.ownerOf(tokenIds[i]) == address(this));

			// transfer back to the original
			ADAPT_TOKEN.transferFrom(address(this), order.owner, tokenIds[i]);

			order.status = OrderStatus.Cancelled;
		}

		emit LogTokensCancelled(tokenIds, now);
	}

	function buyTokens(uint[] tokenIds)
		public
		payable
		whenNotPaused
		nonReentrant
	{
		uint amountLeft = msg.value;

		for(uint i = 0; i < tokenIds.length; i++) {
			uint amount = orders[tokenIds[i]].makePrice;
			buyTokenInternal(tokenIds[i], amount);
			amountLeft = amountLeft.sub(amount);
		}

		// the bundled value should match the price of all orders
		require(amountLeft == 0);
	}

	function buyToken(uint tokenId)
		public
		payable
		whenNotPaused
		nonReentrant
	{
		buyTokenInternal(tokenId, msg.value);
	}

	function buyTokenInternal(uint tokenId, uint _amount) private {

		OrderInfo storage order = orders[tokenId];

		require(
			order.status == OrderStatus.Listed ||
			order.status == OrderStatus.Reserved
		);

		// the amount of ETH forwarded is higher than the make price
		require(_amount >= order.makePrice);

		// mark the order as acquired
		order.status 		= OrderStatus.Sold;
		order.acquirePrice 	= _amount;

		// update metadata before transfer
		ADAPT_TOKEN.setTokenMetadata(tokenId, now, order.makePrice);

		// really transfer the token to the buyer
		ADAPT_TOKEN.transferFrom(address(this), msg.sender, tokenId);

		// transfer fee to the market
		uint marketFee = _amount.mul(MARKET_FEE_NUM).div(MARKET_FEE_DEN);
		MARKET_FEES_MSIG.transfer(marketFee);

		// transfer the amount due to the maker
		uint makerDue = order.makePrice.sub(marketFee);
		order.maker.transfer(makerDue);

		emit LogTokenSold(tokenId, msg.sender, _amount, now);
	}
}
