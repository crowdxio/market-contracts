
import {
	accounts, assert, should, BigNumber
} from './common/common';


const UniqxMarketAdapt = artifacts.require("../contracts/UniqxMarketAdapt.sol");
const AdaptToken = artifacts.require("../adapt/contracts/Collectibles.sol");

contract('Market - testing the constructor', function (rpc_accounts) {

	let ac = accounts(rpc_accounts);

	it('should be able to deploy the smart contracts', async function () {

		let adapt = await AdaptToken.new(
			ac.ADAPT_OWNER,
			ac.ADAPT_ADMIN,
			{from: ac.OPERATOR, gas: 7000000}
		).should.be.fulfilled;

		console.log("ADAPT successfully deployed at address " + adapt.address);

		let market = await UniqxMarketAdapt.new(
			ac.MARKET_ADMIN_MSIG,
			ac.MARKET_FEES_MSIG,
			adapt.address,
			{from: ac.OPERATOR, gas: 7000000}
		).should.be.fulfilled;

		console.log("UNIQX successfully deployed at address " + market.address);
	});
});


