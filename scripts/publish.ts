import * as HDWalletProvider from 'truffle-hdwallet-provider';
import * as Contract from 'truffle-contract';
import * as fs from "fs";
import * as path from "path";
import * as Vars from './common';
import * as BigNumber from 'bignumber.js';


async function publish() {

	// TODO: set provider
	let provider;

	const UniqxMarketAdaptJson = require('../build/contracts/UniqxMarketAdapt.json');
	let UniqxMarketAdapt = Contract(UniqxMarketAdaptJson);
	UniqxMarketAdapt.setProvider(provider);

	let market = await UniqxMarketAdapt.at(Vars.MARKET_TOKEN_ADDRESS);

	let tokens = [new BigNumber('d02fd48d7070895525edc1a91394cc9b1498d88aad76dc2ab4a4166b479c947', 16)];
	let prices = [10000];
	let reservations = [0x0];

	let rec = await market.publish(
		tokens,
		prices,
		reservations,
		{ from: Vars.ac.ADAPT_ADMIN , gas: 7000000 }
	);

	console.log('Publish Complete!\n', JSON.stringify(rec.logs, null, '\t'));
}