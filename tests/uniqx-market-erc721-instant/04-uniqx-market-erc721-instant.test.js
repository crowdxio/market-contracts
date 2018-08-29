import {
	accounts, assert, OrderStatus, BigNumber
} from '../common/common';
import ether from "../helpers/ether";
import expectEvent from "../helpers/expectEvent";
import EVMRevert from "../../zeppelin/test/helpers/EVMRevert";
const moment = require('moment');

const AdaptCollectibles = artifacts.require("../../../adapt/contracts/AdaptCollectibles.sol");
const UniqxMarketERC721Instant = artifacts.require('../../contracts/UniqxMarketERC721Instant.sol');

contract('Testing token listing and updating - single', async function (rpc_accounts) {

	const ac = accounts(rpc_accounts);
	let uniqxMarketInstant;
	let adaptCollectibles;

	let token;
	let buyPrice;

	it('should successfully deploy the market contract and the adapt token', async function () {

		console.log('Deploying the market contract...');

		uniqxMarketInstant = await UniqxMarketERC721Instant.new(
			ac.MARKET_ADMIN_MSIG,
			ac.MARKET_FEES_MSIG,
			{
				from: ac.OPERATOR,
				gas: 7000000
			}
		).should.be.fulfilled;

		console.log(`The market contract has been successfully deployed at ${uniqxMarketInstant.address}`);

		adaptCollectibles = await AdaptCollectibles.new(
			ac.ADAPT_OWNER,
			ac.ADAPT_ADMIN,
			{from: ac.OPERATOR, gas: 7000000}
		).should.be.fulfilled;

		console.log(`The adapt token has been successfully deployed at ${adaptCollectibles.address}`);
	});

	it('should mint some test tokens', async function () {

		const ret = await adaptCollectibles.massMint(
			ac.ADAPT_ADMIN,
			'json hash',			// json hash
			1,				        // start
			1,		                // count
			{from: ac.ADAPT_ADMIN}
		).should.be.fulfilled;
		token = await adaptCollectibles.tokenByIndex(0);
		buyPrice = ether(1);
	});

	it('should register the adapt token', async function () {

		const ret = await uniqxMarketInstant.registerToken(
			adaptCollectibles.address,
			{
				from: ac.MARKET_ADMIN_MSIG,
				gas: 7000000
			}
		).should.be.fulfilled;

		expectEvent.inLogs(ret.logs, 'LogRegisterToken');

		console.log(`GAS - Register Token: ${ret.receipt.gasUsed}`);
	});

	it('ADAPT_ADMIN should be able to transfer his token to ACCOUNT1', async function () {

		const ret = await adaptCollectibles.transferFrom(
			ac.ADAPT_ADMIN,
			ac.ACCOUNT1,
			token,
			{
				from: ac.ADAPT_ADMIN,
				gas: 7000000
			}
		).should.be.fulfilled;

		expectEvent.inLogs(ret.logs, 'Transfer');
		const owner = await adaptCollectibles.ownerOf(token);
		assert.equal(owner, ac.ACCOUNT1, 'unexpected owner - ACCOUNT1 should own the token');
	});

	it('the SELLER should NOT be able to list a token for sale unless he gets approval', async () => {
		await uniqxMarketInstant.create(
			adaptCollectibles.address,
			token,
			buyPrice,
			{
				from: ac.SELLER,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('ACCOUNT1 should be able to approve the SELLER to list his tokens', async function () {
		await adaptCollectibles.setApprovalForAll(
			ac.SELLER,
			true,
			{
				from: ac.ACCOUNT1,
				gas: 7000000
			}
		).should.be.fulfilled;
	});

	it('ADAPT_ADMIN should be able to approve the SELLER to list his tokens', async function () {
		await adaptCollectibles.setApprovalForAll(
			ac.SELLER,
			true,
			{
				from: ac.ADAPT_ADMIN,
				gas: 7000000
			}
		).should.be.fulfilled;
	});

	it('ACCOUNT1 should be able to approve the MARKET escrow his tokens', async function () {
		// approve market to transfer all erc721 tokens hold by admin
		await adaptCollectibles.setApprovalForAll(
			uniqxMarketInstant.address,
			true,
			{
				from: ac.ACCOUNT1,
				gas: 7000000
			}
		).should.be.fulfilled;
	});

	it('ADAPT_ADMIN should be able to approve the MARKET escrow his tokens', async function () {
		// approve market to transfer all erc721 tokens hold by admin
		await adaptCollectibles.setApprovalForAll(
			uniqxMarketInstant.address,
			true,
			{
				from: ac.ADAPT_ADMIN,
				gas: 7000000
			}
		).should.be.fulfilled;
	});

	it('the SELLER should not be able to list a zero value token', async function () {
		await uniqxMarketInstant.create(
			adaptCollectibles.address,
			token,
			0,
			{
				from: ac.SELLER,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('the SELLER should be able to list an adapt token for sale', async () => {

		const ret = await uniqxMarketInstant.create(
			adaptCollectibles.address,
			token,
			buyPrice,
			{
				from: ac.SELLER,
				gas: 7000000
			}
		).should.be.fulfilled;

		console.log(`GAS - List 1 token: ${ret.receipt.gasUsed}`);

		expectEvent.inLogs(ret.logs, 'LogCreate');

		const owner = await adaptCollectibles.ownerOf(token);
		assert.equal(owner, uniqxMarketInstant.address, 'unexpected owner - market should own the token');

		const info = await uniqxMarketInstant.getOrderInfo(adaptCollectibles.address, token);
		//console.log(`order info: ${JSON.stringify(info, null, '\t')}`);

		assert.equal(info[0], ac.ACCOUNT1, 'unexpected owner');

		const price = new BigNumber(info[1]);
		price.should.be.bignumber.equal(buyPrice);
	});

	it('ADAPT_ADMIN should not be able to update an adapt token listed by the SELLER', async function () {

		const ret = await uniqxMarketInstant.update(
			adaptCollectibles.address,
			token,
			ether(2),
			{
				from: ac.ADAPT_ADMIN,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('the SELLER should be able to update an adapt token listed by him', async function () {

		const ret = await uniqxMarketInstant.update(
			adaptCollectibles.address,
			token,
			ether(2),
			{
				from: ac.SELLER,
				gas: 7000000
			}
		).should.be.fulfilled;

		const info = await uniqxMarketInstant.getOrderInfo(adaptCollectibles.address, token);
		assert.equal(info[0], ac.ACCOUNT1, 'unexpected owner');
		const price = new BigNumber(info[1]);
		price.should.be.bignumber.equal(ether(2));
	});

	it('ACCOUNT1 should be able to update an adapt token listed by the SELLER', async function () {

		const ret = await uniqxMarketInstant.update(
			adaptCollectibles.address,
			token,
			ether(3),
			{
				from: ac.ACCOUNT1,
				gas: 7000000
			}
		).should.be.fulfilled;

		const info = await uniqxMarketInstant.getOrderInfo(adaptCollectibles.address, token);
		assert.equal(info[0], ac.ACCOUNT1, 'unexpected owner');
		const price = new BigNumber(info[1]);
		price.should.be.bignumber.equal(ether(3));
	});
});
