import { JettonFactory } from '../wrappers/JettonFactory';
import { NetworkProvider } from '@ton/blueprint';
import { Address } from '@ton/core';

export async function run(provider: NetworkProvider) {
    // TODO: ask for metadataUri, totalSupply, minimalPrice, and deployerSupplyPercent (and maybe factoryAddress) interactively instead
    throw 'update factory address if changed, metadataUri, and totalSupply first'
    const factoryAddress = "EQBcHosKYSwnwNzLw5IUTvuf35tp7i71RgMX7aGPIBe5hlZ7";
    const totalSupply = 0n;
    const deployerSupplyPercent = 0n;
    const minimalPrice = 1n;
    const metadataUri = '';

    const jettonFactory = provider.open(JettonFactory.createFromAddress(Address.parse(factoryAddress)));

    await jettonFactory.sendInitiateNew(provider.sender(), 150_000_000n, {
        totalSupply,
        metadataType: 1,
        metadataUri,
        deployerSupplyPercent,
        minimalPrice,
    });
}
