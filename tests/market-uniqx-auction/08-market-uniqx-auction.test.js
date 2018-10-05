import {
	accounts,
	assert,
	BigNumber,
	OrderStatus,
} from '../common/common';
import ether from "../helpers/ether";
import expectEvent from "../helpers/expectEvent";
const moment = require('moment');
import EVMRevert from "../../zeppelin/test/helpers/EVMRevert";
import { duration, increaseTimeTo } from '../../zeppelin/test/helpers/increaseTime';
import latestTime from '../helpers/latestTime';

const TokenErc721 = artifacts.require("../../contracts/ERC721TokenMock.sol");
const MarketUniqxAuction = artifacts.require('../../contracts/MarketUniqxAuction.sol');

contract('Testing auction - bid - buy - single', async function (rpc_accounts) {

	const ac = accounts(rpc_accounts);
	let market;
	let tokenErc721;

	const tokensCount = 3;
	let tokens = [];
	let buyPrices = [];
	let startPrices = [];
	let endTimes = [];

	it('should successfully deploy the market contract and the erc721 token', async function () {

		console.log('Deploying the market contract...');

		market = await MarketUniqxAuction.new(
			ac.MARKET_ADMIN_MSIG,
			ac.MARKET_FEES_MSIG,
			{
				from: ac.OPERATOR,
				gas: 7000000
			}
		).should.be.fulfilled;

		console.log(`The market contract has been successfully deployed at ${market.address}`);

		tokenErc721 = await TokenErc721.new(
			ac.ADAPT_OWNER,
			ac.ADAPT_ADMIN,
			{from: ac.OPERATOR, gas: 7000000}
		).should.be.fulfilled;

		console.log(`The erc721 token has been successfully deployed at ${tokenErc721.address}`);
	});

	it('ADAPT_ADMIN should mint some test tokens', async function () {

		for (let i = 0; i < tokensCount; i++) {
			await tokenErc721.mint(ac.ADAPT_ADMIN, i, {
				from: ac.ADAPT_ADMIN
			}).should.be.fulfilled;
		}

		const threeDaysLater = moment().add(3, 'days').unix();
		for (let i = 0; i < tokensCount; i++) {
			tokens[i] = await tokenErc721.tokenByIndex(i);
			buyPrices[i] = ether(2);
			startPrices[i] = ether(1);
			endTimes[i] = threeDaysLater;
		}
	});

	it('MARKET_ADMIN should register the erc721 token', async function () {
		const ret = await market.registerToken(
			tokenErc721.address,
			{
				from: ac.MARKET_ADMIN_MSIG,
				gas: 7000000
			}
		).should.be.fulfilled;
	});

	it('ADAPT_ADMIN should allow the market to escrow his tokens', async function () {
		await tokenErc721.setApprovalForAll(
			market.address,
			true,
			{
				from: ac.ADAPT_ADMIN,
				gas: 7000000
			}
		).should.be.fulfilled;
	});

	it('ADAPT_ADMIN should be able to list the tokens', async () => {
		await market.createMany(
			tokenErc721.address,
			tokens,
			buyPrices,
			startPrices,
			endTimes,
			{
				from: ac.ADAPT_ADMIN,
				gas: 7000000
			}
		).should.be.fulfilled;
	});

	it('BUYER1 should not be able to place a bid - not enough ether', async function () {
		const bid = new BigNumber(ether(0.1));

		const ret = await market.bid(
			tokenErc721.address,
			tokens[0],
			{
				from: ac.BUYER1,
				value: bid,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('BUYER1 should not be able to place a bid - too much ether', async function () {
		const bid = new BigNumber(ether(3));

		const ret = await market.bid(
			tokenErc721.address,
			tokens[0],
			{
				from: ac.BUYER1,
				value: bid,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('BUYER1 should be able to place a bid', async function () {
		const bid = new BigNumber(ether(1.2));

		const ret = await market.bid(
			tokenErc721.address,
			tokens[0],
			{
				from: ac.BUYER1,
				value: bid,
				gas: 7000000
			}
		).should.be.fulfilled;

		ret.logs.length.should.be.equal(1);
		await expectEvent.inLog(ret.logs[0], 'LogBid', {
			token: tokenErc721.address,
			tokenId: tokens[0],
			bidder: ac.BUYER1,
			bid:bid
		});

		const info = await market.getOrderInfo(tokenErc721.address, tokens[0]);
		console.log(`order info: ${JSON.stringify(info, null, '\t')}`);

		const highestBid = new BigNumber(info[5]);
		highestBid.should.be.bignumber.equal(bid);
	});

	it('BUYER2 should not be able to place a bid which is less than the highest bid', async function () {
		const bid = new BigNumber(ether(1.1));

		await market.bid(
			tokenErc721.address,
			tokens[0],
			{
				from: ac.BUYER2,
				value: bid,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('BUYER2 should not be able to place a bid which is equal to the highest bid', async function () {
		const bid = new BigNumber(ether(1.2));

		await market.bid(
			tokenErc721.address,
			tokens[0],
			{
				from: ac.BUYER2,
				value: bid,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('BUYER2 should be able to outbid BUYER1', async function () {
		const bid = new BigNumber(ether(1.3));

		const ret = await market.bid(
			tokenErc721.address,
			tokens[0],
			{
				from: ac.BUYER2,
				value: bid,
				gas: 7000000
			}
		).should.be.fulfilled;

		ret.logs.length.should.be.equal(1);
		await expectEvent.inLog(ret.logs[0], 'LogBid', {
			token: tokenErc721.address,
			tokenId: tokens[0],
			bidder: ac.BUYER2,
			bid:bid
		});


		const info = await market.getOrderInfo(tokenErc721.address, tokens[0]);
		console.log(`order info: ${JSON.stringify(info, null, '\t')}`);

		const highestBid = new BigNumber(info[5]);
		highestBid.should.be.bignumber.equal(bid);
	});

	it('BUYER2 should be able to outbid himself', async function () {
		const bid = new BigNumber(ether(1.4));

		const ret = await market.bid(
			tokenErc721.address,
			tokens[0],
			{
				from: ac.BUYER2,
				value: bid,
				gas: 7000000
			}
		).should.be.fulfilled;

		ret.logs.length.should.be.equal(1);
		await expectEvent.inLog(ret.logs[0], 'LogBid', {
			token: tokenErc721.address,
			tokenId: tokens[0],
			bidder: ac.BUYER2,
			bid:bid
		});

		const info = await market.getOrderInfo(tokenErc721.address, tokens[0]);
		console.log(`order info: ${JSON.stringify(info, null, '\t')}`);

		const highestBid = new BigNumber(info[5]);
		highestBid.should.be.bignumber.equal(bid);
	});

	it('BUYER3 should be able to place a bid to buy the token', async function () {

		const bid = new BigNumber(ether(2));

		const ret = await market.bid(
			tokenErc721.address,
			tokens[1],
			{
				from: ac.BUYER3,
				value: bid,
				gas: 7000000
			}
		).should.be.fulfilled;

		ret.logs.length.should.be.equal(2);
		await expectEvent.inLog(ret.logs[0], 'LogBid', {
			token: tokenErc721.address,
			tokenId: tokens[1],
			bidder: ac.BUYER3,
			bid: bid
		});
		await expectEvent.inLog(ret.logs[1], 'LogBuy', {
			token: tokenErc721.address,
			tokenId: tokens[1],
			buyer: ac.BUYER3
		});

		const owner = await tokenErc721.ownerOf(tokens[1]);
		assert.equal(owner, ac.BUYER3, 'unexpected owner');

		const info = await market.getOrderInfo(tokenErc721.address, tokens[1]);
		//console.log(`order info: ${JSON.stringify(info, null, '\t')}`);
		assert.equal(info[0], OrderStatus.Unknown, 'unexpected status - should be unknwon');
	});

	it('BUYER2 should not be able to place a bid on a sold token', async function () {
		const bid = new BigNumber(ether(2));

		await market.bid(
			tokenErc721.address,
			tokens[1],
			{
				from: ac.BUYER2,
				value: bid,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});


	it('BUYER1 should not be able to place a bid on an ended auction', async function () {

		const threeDaysLater = latestTime() + duration.days(3);
		await increaseTimeTo(threeDaysLater + duration.minutes(1));

		const bid = new BigNumber(ether(1.6));

		await market.bid(
			tokenErc721.address,
			tokens[0],
			{
				from: ac.BUYER1,
				value: bid,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('BUYER2 can take the tokens he won', async function () {

		const ret = await market.completeMany(
			tokenErc721.address,
			[tokens[0]],
			{
				from: ac.BUYER2,
				gas: 7000000
			}
		).should.be.fulfilled;

		ret.logs.length.should.be.equal(1);
		await expectEvent.inLog(ret.logs[0], 'LogBuy', {
			token: tokenErc721.address,
			tokenId: tokens[0],
			buyer: ac.BUYER2
		});

		let owner = await tokenErc721.ownerOf(tokens[0]);
		assert.equal(owner, ac.BUYER2, 'unexpected owner');
	});

	it('ADAPT_ADMIN can take his unsold tokens back', async function () {

		const ret = await market.completeMany(
			tokenErc721.address,
			[tokens[2]],
			{
				from: ac.ADAPT_ADMIN,
				gas: 7000000
			}
		).should.be.fulfilled;

		ret.logs.length.should.be.equal(1);
		await expectEvent.inLog(ret.logs[0], 'LogRetake', {
			token: tokenErc721.address,
			tokenId: tokens[2]
		});

		for(let i = 4; i < tokensCount; i++) {
			let owner = await tokenErc721.ownerOf(tokens[i]);
			assert.equal(owner, ac.ADAPT_ADMIN, 'unexpected owner');
		}
	});
});
