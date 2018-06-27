pragma solidity ^0.4.24;

import "../zeppelin/contracts/ownership/NoOwner.sol";
import "../zeppelin/contracts/lifecycle/Pausable.sol";
import {SafeMath} from "../zeppelin/contracts/math/SafeMath.sol";
import {ERC721Token} from '../zeppelin/contracts/token/ERC721/ERC721Token.sol';

contract UniqxMarketERC721Instant is NoOwner, Pausable {

	using SafeMath for uint;

	address public MARKET_ADMIN_MSIG;
	address public MARKET_FEES_MSIG;

	uint public marketFeeNum = 1;
	uint public marketFeeDen = 100;

	enum OrderStatus {
		Unknown,
		Created
	}

	struct OrderInfo {
		uint makePrice;
		uint makeTime;
		OrderStatus status;
		address maker;
	}

	struct UniqxMarketContract {
		bool registered;
		ERC721Token TOKEN;
		mapping(uint => OrderInfo) orders;
	}

	mapping(address => UniqxMarketContract) contracts;

	event AllowOrders();
  	event DisallowOrders();

	event RegisterContract(address _contract);
  	event UnregisterContract(address _contract);

	event SetPercentageFee(
		address indexed _contract,
		uint _marketFeeNum,
		uint _marketFeeDen
	);

	event LogOrdersCreated(address _contract, uint[] _tokens);
	event LogOrdersCancelled(address _contract, uint[] _tokens);
	event LogOrdersChanged(address _contract, uint[] _tokens);
	event LogOrderSettled(
		address _contract,
		uint _tokenId,
		uint _price,
		address _maker,
		address _taker
	);

 	bool public ordersAllowed = true;

	modifier onlyAdmin() {
		require(msg.sender == MARKET_ADMIN_MSIG);
		_;
	}

	modifier whenOrdersNotAllowed() {
		require(!ordersAllowed);
		_;
	}

	modifier whenOrdersAllowed() {
		require(ordersAllowed);
		_;
	}

	function allowOrders() onlyAdmin whenOrdersNotAllowed public {
		ordersAllowed = true;
		emit AllowOrders();
	}

	function disallowOrders() onlyAdmin whenOrdersAllowed public {
		ordersAllowed = false;
		emit DisallowOrders();
	}

	constructor(address _marketAdmin, address _marketFees) public {

		MARKET_ADMIN_MSIG = _marketAdmin;
		MARKET_FEES_MSIG = _marketFees;

		transferOwnership(_marketAdmin);
	}

	function registerContract(address _contract) public onlyAdmin {

		require(!contracts[_contract].registered);

		UniqxMarketContract memory newMarketContract = UniqxMarketContract({
			registered: true,
			TOKEN: ERC721Token(_contract)
		});

		contracts[_contract] = newMarketContract;

		emit RegisterContract(_contract);
	}

	function unregisterContract(address _contract) public onlyAdmin {

		require(contracts[_contract].registered);
		delete contracts[_contract];

		emit UnregisterContract(_contract);
	}

	function setPercentageFee(address _contract, uint _marketFeeNum, uint _marketFeeDen) public onlyAdmin {

		marketFeeNum = _marketFeeNum;
		marketFeeDen = _marketFeeDen;

		emit SetPercentageFee(_contract, _marketFeeNum, _marketFeeDen);
	}

	function isSpenderApproved(address _contract, address _spender, uint256 _tokenId) internal view returns (bool) {

		require(contracts[_contract].registered);
		UniqxMarketContract storage marketContract = contracts[_contract];

		address tokenOwner = marketContract.TOKEN.ownerOf(_tokenId);

		return (_spender == tokenOwner ||
				marketContract.TOKEN.getApproved(_tokenId) == _spender ||
				marketContract.TOKEN.isApprovedForAll(tokenOwner, _spender));
	}

	function getOrderStatus(address _contract, uint _tokenId) public view
		returns (OrderStatus _status) {

		require(contracts[_contract].registered);
		UniqxMarketContract storage marketContract = contracts[_contract];

		return marketContract.orders[_tokenId].status;
	}

	function getOrderInfo(address _contract, uint _tokenId) public view
		returns (
			OrderStatus _status,
			uint _makePrice,
			uint _makeTime,
			address _maker
		) {

		require(contracts[_contract].registered);
		OrderInfo storage order = contracts[_contract].orders[_tokenId];

		_status = order.status;
		_makePrice = order.makePrice;
		_makeTime = order.makeTime;
		_maker = order.maker;
	}

	function makeOrder(
			address _contract,
			uint [] _tokenIds,
			uint [] _prices)
		public whenNotPaused whenOrdersAllowed {

		require(_tokenIds.length == _prices.length);

		require(contracts[_contract].registered);
		UniqxMarketContract storage marketContract = contracts[_contract];

		for(uint index=0; index<_tokenIds.length; index++) {
			// token must not be published on the market
			OrderInfo storage existingOrder = marketContract.orders[_tokenIds[index]];
			require(existingOrder.status != OrderStatus.Created);

			// make sure the maker is approved to sell this item
			require(isSpenderApproved(_contract, msg.sender, _tokenIds[index]));

			// take temporary custody of the token
			address tokenOwner = marketContract.TOKEN.ownerOf(_tokenIds[index]);
			marketContract.TOKEN.transferFrom(tokenOwner, address(this), _tokenIds[index]);

			OrderInfo memory order = OrderInfo({
					makePrice: _prices[index],
					makeTime: now,
					status: OrderStatus.Created,
					maker: msg.sender
				});

			marketContract.orders[_tokenIds[index]] = order;
		}

		emit LogOrdersCreated(_contract, _tokenIds);
	}

	function cancelOrder(address _contract, uint [] _tokenIds) public whenNotPaused {

		require(contracts[_contract].registered);
		UniqxMarketContract storage marketContract = contracts[_contract];

		for(uint index=0; index<_tokenIds.length; index++) {
			OrderInfo storage order = marketContract.orders[_tokenIds[index]];

			// only the original maker can cancel
			require(msg.sender == order.maker);

			// token must still be published on the market
			require(order.status == OrderStatus.Created);

			// token must still be in temporary custody of the market
			require(marketContract.TOKEN.ownerOf(_tokenIds[index]) == address(this));

			marketContract.TOKEN.transferFrom(address(this), order.maker, _tokenIds[index]);

			delete marketContract.orders[_tokenIds[index]];
		}

		emit LogOrdersCancelled(_contract, _tokenIds);
	}

	function changeOrder(address _contract, uint [] _tokenIds, uint [] _prices) public whenNotPaused {

		require(_tokenIds.length == _prices.length);

		require(contracts[_contract].registered);
		UniqxMarketContract storage marketContract = contracts[_contract];

		for(uint index=0; index<_tokenIds.length; index++) {
			OrderInfo storage order = marketContract.orders[_tokenIds[index]];

			// only the original maker can cancel
			require(msg.sender == order.maker);

			// token must still be published on the market
			require(order.status == OrderStatus.Created);

			// token must still be in temporary custody of the market
			require(marketContract.TOKEN.ownerOf(_tokenIds[index]) == address(this));

			order.makePrice = _prices[index];
		}
		
		emit LogOrdersChanged(_contract, _tokenIds);
	}

	function takeOrder(address _contract, uint _tokenId) public payable whenNotPaused {
		
		require(contracts[_contract].registered);
		UniqxMarketContract storage marketContract = contracts[_contract];
		
		OrderInfo storage order = marketContract.orders[_tokenId];

		// token must still be published on the market
		require(order.status == OrderStatus.Created);

		// the amount of ETH forwarded is higher than make price
		require(msg.value >= order.makePrice);

		uint marketFee = msg.value.mul(marketFeeNum).div(marketFeeDen);
		uint makerDue = msg.value.sub(marketFee);

		marketContract.TOKEN.transferFrom(address(this), msg.sender, _tokenId);

		MARKET_FEES_MSIG.transfer(marketFee);
		order.maker.transfer(makerDue);

		emit LogOrderSettled(_contract, _tokenId, order.makePrice, order.maker, msg.sender);

		delete marketContract.orders[_tokenId];
	}
}