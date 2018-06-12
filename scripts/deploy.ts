import * as HDWalletProvider from 'truffle-hdwallet-provider';
import * as Contract from 'truffle-contract';
import * as fs from "fs";
import * as path from "path";
import * as Vars from './common';


async function deploy() {


	// TODO: set provider
	let provider;

	const UniqxMarketAdaptJson = require('../build/contracts/UniqxMarketAdapt.json');
	let UniqxMarketAdapt = Contract(UniqxMarketAdaptJson);
	UniqxMarketAdapt.setProvider(provider);


	let market = await UniqxMarketAdapt.new(
		Vars.ac.MARKET_ADMIN,
		Vars.ac.MARKET_FEES,
		Vars.ADAPT_TOKEN_ADDRESS,
		{
			from: Vars.ac.DEPLOY_OPERATOR,
			gas: 7000000
		}
	);

	console.log("UNIQX successfully deployed at address " + market.address);
}

deploy().then();