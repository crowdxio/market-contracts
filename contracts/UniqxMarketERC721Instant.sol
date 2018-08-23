pragma solidity ^0.4.24;

import {SafeMath} from "../zeppelin/contracts/math/SafeMath.sol";
import {ERC721Token} from "../zeppelin/contracts/token/ERC721/ERC721Token.sol";
import {UniqxMarketBase} from "./UniqxMarketBase.sol";

contract UniqxMarketERC721Instant is UniqxMarketBase {

	using SafeMath for uint;

	struct OrderInfo {
		OrderStatus status;
		address owner; 				// the user who owns the token sold via this order
		uint buyPrice;				// holds the 'buy it now' price
		address buyer;				// holds the address of the buyer or the address of the highest bidder
	}

	struct TokenContract {
		bool registered;
		bool ordersEnabled;
		mapping(uint => OrderInfo) orders;
	}

	mapping(address => TokenContract) tokenContracts;

	constructor(
		address admin,
		address marketFeeCollector
	) public {

		MARKET_FEE_COLLECTOR = marketFeeCollector;
		transferOwnership(admin);
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

	function getOrderStatus(address token, uint tokenId)
		public
		view
		returns (OrderStatus status)
	{
		TokenContract storage tokenContract = tokenContracts[token];

		require(tokenContract.registered, "Token must be registered");

		return tokenContract.orders[tokenId].status;
	}

	function getOrderInfo(address token, uint tokenId)
		public
		view
		returns (
			OrderStatus status,
			address owner,
			uint buyPrice,
			address buyer
		)
	{
		TokenContract storage tokenContract = tokenContracts[token];

		require(tokenContract.registered, "Token must be registered");

		OrderInfo storage order = tokenContract.orders[tokenId];

		status          = order.status;
		owner           = order.owner;
		buyPrice 	    = order.buyPrice;
		buyer 		    = order.buyer;
	}

	function listTokensFixedPrice(
		address token, // MC: rename to tokenContract
		uint[] tokenIds,
		uint[] buyPrices
	)
		whenNotPaused
		whenOrdersEnabled
		nonReentrant
		public
	{
		TokenContract storage tokenContract = tokenContracts[token];
		ERC721Token tokenInstance = ERC721Token(token);
		address[] memory owners = new address[](buyPrices.length);

		require(tokenContract.registered, "Token must be registered");
		require(tokenContract.ordersEnabled, "Orders must be enabled for this token");
		require(tokenIds.length > 0, "Array must have at least one entry");
		require(tokenIds.length == buyPrices.length, "Array lengths must match");

		for(uint i = 0; i < tokenIds.length; i++) {

			OrderInfo storage order = tokenContract.orders[tokenIds[i]];

			require(order.status != OrderStatus.Listed, "Token must not be listed already");
			require(isSpenderApproved(msg.sender, token , tokenIds[i]), "The seller must be allowed to sell the token");

			// market will now escrow the token (owner or seller must approve unix market before listing)
			address owner = tokenInstance.ownerOf(tokenIds[i]);
			tokenInstance.transferFrom(owner, address(this), tokenIds[i]);
			owners[i] = owner;

			OrderInfo memory newOrder = OrderInfo(
				{
					status: OrderStatus.Listed,
					owner: owner,
					buyPrice: buyPrices[i],
					buyer: address(0)
				}
			);

			tokenContracts[token].orders[tokenIds[i]] = newOrder;
		}

		emit LogTokensListedFixedPrice(
			token,
			tokenIds,
			owners,
			msg.sender,
			buyPrices
		);
	}

	function buyTokens(
		address token,
		uint [] tokenIds
	)
		whenNotPaused
		nonReentrant
		public
		payable
	{
		TokenContract storage tokenContract = tokenContracts[token];
		ERC721Token tokenInstance = ERC721Token(token);

		require(tokenContract.registered, "Token must be registered");
		require(tokenIds.length > 0, "Array must have at least one entry");

		uint ordersAmount = 0;
		for(uint i = 0; i < tokenIds.length; i++) {

			OrderInfo storage order = tokenContract.orders[tokenIds[i]];

			require(order.status == OrderStatus.Listed, "Token must be listed");
			require(msg.value >= ordersAmount + order.buyPrice, "The amount passed must cover the value of the tokens as listed");

			// update the orders amount
			ordersAmount += order.buyPrice;

			// transfer fee to market
			uint marketFee = order.buyPrice.mul(marketFeeNum).div(marketFeeDen);
			MARKET_FEE_COLLECTOR.transfer(marketFee);

			// transfer the rest to owner
			uint ownerDue = order.buyPrice.sub(marketFee);
			order.owner.transfer(ownerDue);

			// transfer token to buyer
			tokenInstance.transferFrom(address(this), msg.sender, tokenIds[i]);

			emit LogTokenSold(token, tokenIds[i], msg.sender, order.buyPrice);

			delete tokenContract.orders[tokenIds[i]];
		}

		// the bundled value should match the price of all orders
		require(ordersAmount == msg.value);
	}

	// MC: isn't this better called cancelOrders ?
	// Can we do a separate branch for renaming and involve Solo as well?
	function cancelTokens(
		address token,
		uint[] tokenIds
	)
	whenNotPaused
	nonReentrant
	public
	{
		TokenContract storage tokenContract = tokenContracts[token];
		ERC721Token tokenInstance = ERC721Token(token);

		require(tokenContract.registered, "Token must be registered");
		require(tokenIds.length > 0, "Array must have at least one entry");

		for(uint i = 0; i < tokenIds.length; i++) {

			OrderInfo storage order = tokenContract.orders[tokenIds[i]];

			require(order.status == OrderStatus.Listed, "Token must be listed");

			require(
				msg.sender == order.owner
				|| tokenInstance.getApproved(tokenIds[i]) == msg.sender
				|| tokenInstance.isApprovedForAll(order.owner, msg.sender),
				"Only the owner or the seller can cancel a token"
			);

			// transfer the token back to the owner
			tokenInstance.transferFrom(address(this), order.owner, tokenIds[i]);

			delete tokenContract.orders[tokenIds[i]];
		}

		emit LogTokensCancelled(token, tokenIds);
	}
}
