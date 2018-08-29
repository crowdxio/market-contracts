import {
	accounts, assert, OrderStatus, BigNumber, getBalanceAsync
} from '../common/common';
import ether from "../helpers/ether";
import expectEvent from "../helpers/expectEvent";
import EVMRevert from "../../zeppelin/test/helpers/EVMRevert";
const moment = require('moment');

const AdaptCollectibles = artifacts.require("../../../adapt/contracts/AdaptCollectibles.sol");
const UniqxMarketERC721Instant = artifacts.require('../../contracts/UniqxMarketERC721Instant.sol');

contract('Testing cancel functionality - single', async function (rpc_accounts) {

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

	it('should mint a test token', async function () {

		const ret = await adaptCollectibles.massMint(
			ac.ADAPT_ADMIN,
			'json hash',			// json hash
			1,				        // start
			1,		                // count
			{from: ac.ADAPT_ADMIN}
		).should.be.fulfilled;
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

	it('ADAPT_ADMIN should allow the market to escrow his tokens', async function () {
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

	it('ADAPT_ADMIN should be able to list a token for sale', async () => {

		token = await adaptCollectibles.tokenByIndex(0);
		buyPrice = ether(10);

		const rec = await uniqxMarketInstant.create(
			adaptCollectibles.address,
			token,
			buyPrice,
			{
				from: ac.ADAPT_ADMIN ,
				gas: 7000000
			}
		).should.be.fulfilled;
	});

	it('ACCOUNT1 should not be able to cancel a token - ADAPT_ADMIN owns the token', async () => {

		const ret = await uniqxMarketInstant.cancel(
			adaptCollectibles.address,
			token,
			{
				from: ac.ACCOUNT1,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});

	it('ADAPT_ADMIN should be able to cancel a token', async () => {

		const ret = await uniqxMarketInstant.cancel(
			adaptCollectibles.address,
			token,
			{
				from: ac.ADAPT_ADMIN,
				gas: 7000000
			}
		).should.be.fulfilled;
	});

	it('ADAPT_ADMIN should be able to re-list a canceled token', async () => {

		token = await adaptCollectibles.tokenByIndex(0);
		buyPrice = ether(10);

		const rec = await uniqxMarketInstant.create(
			adaptCollectibles.address,
			token,
			buyPrice,
			{
				from: ac.ADAPT_ADMIN ,
				gas: 7000000
			}
		).should.be.fulfilled;
	});

	it('BUYER1 should be able to buy the token', async () => {
		const ret = await uniqxMarketInstant.buy(
			adaptCollectibles.address,
			token,
			{
				from: ac.BUYER1,
				value: ether(10),
				gas: 7000000
			}
		).should.be.fulfilled;
	});

	it('ADAPT_ADMIN should not be able to cancel a token - was sold already', async () => {
		const ret = await uniqxMarketInstant.cancel(
			adaptCollectibles.address,
			token,
			{
				from: ac.ADAPT_ADMIN,
				gas: 7000000
			}
		).should.be.rejectedWith(EVMRevert);
	});
});
