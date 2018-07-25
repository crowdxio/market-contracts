import {
	accounts, assert, should, BigNumber, Bluebird, OrderStatus
} from '../common/common';
import ether from "../helpers/ether";
import expectEvent from "../helpers/expectEvent";
//import * as moment from 'moment';
const moment = require('moment');

const ERC721Token = artifacts.require("../../../adapt/contracts/AdaptCollectibles.sol");
const UniqxMarketERC721Auction = artifacts.require('../../contracts/UniqxMarketERC721Auction.sol');


contract('Testing UniqxMarketERC721Instant', async function (rpc_accounts) {

	const ac = accounts(rpc_accounts);
	let erc721Token, auctionMarket;
	let tokesCount = 10;
	let tokens = [];
	let prices = [];

	const pGetBalance = Bluebird.promisify(web3.eth.getBalance);
	const pSendTransaction = Bluebird.promisify(web3.eth.sendTransaction);

	it('should be able to deploy the auction market contract', async () => {

		auctionMarket = await UniqxMarketERC721Auction.new(
			ac.MARKET_ADMIN_MSIG,
			ac.MARKET_FEES_MSIG,
			{ from: ac.OPERATOR, gas: 7000000 }
		).should.be.fulfilled;

	});

	it('should be able to register an ERC721 token contract', async () => {

		erc721Token = await ERC721Token.new(
			ac.ADAPT_OWNER,
			ac.ADAPT_ADMIN,
			{ from: ac.OPERATOR, gas: 7000000 }
		).should.be.fulfilled;

		const rec = await auctionMarket.registerContract(
			erc721Token.address,
			{ from: ac.MARKET_ADMIN_MSIG , gas: 7000000 }
		).should.be.fulfilled;

		expectEvent.inLogs(rec.logs, 'RegisterContract');

		console.log('registerContract() - Gas Used = ' + rec.receipt.gasUsed);
	});

    it('should be able to mass mint new tokens', async function () {
		await erc721Token.massMint(
			ac.ADAPT_ADMIN,
			'123',			// json hash
			0,				// start
			tokesCount,		// count
			{ from: ac.ADAPT_ADMIN }
		).should.be.fulfilled;
	});

	it('should be able to enable the market to transfer tokens', async function () {
		for (let i = 0; i < tokesCount; i++) {
			tokens[i] = await erc721Token.tokenByIndex(i);
			prices[i] = ether(1);
		}

		// approve market to transfer all erc721 tokens hold by admin
		await erc721Token.setApprovalForAll(
			auctionMarket.address,
			true,
			{ from: ac.ADAPT_ADMIN }
		).should.be.fulfilled;
	});

	it('should be able to make a single auction', async () => {
		const threeDaysLater = moment().add(3, 'days').unix();

		const rec = await auctionMarket.makeAuctions(
			erc721Token.address,
			[ tokens[0] ],
			[ ether(1) ],
			[ ether(2) ],
			[ threeDaysLater ],
			{ from: ac.ADAPT_ADMIN , gas: 7000000 }
		).should.be.fulfilled;

		expectEvent.inLogs(rec.logs, 'LogAuctionsCreated');
		const orderStatus = await auctionMarket.getOrderStatus(erc721Token.address, tokens[0]);
		assert.equal(orderStatus, OrderStatus.Published);

		console.log('makeOrders() with 1 order - Gas Used = ' + rec.receipt.gasUsed);
	});
});


