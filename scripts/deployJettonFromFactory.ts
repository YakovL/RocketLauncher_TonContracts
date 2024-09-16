import { JettonFactory } from '../wrappers/JettonFactory';
import { NetworkProvider } from '@ton/blueprint';
import { Address } from '@ton/core';

export async function run(provider: NetworkProvider) {
    // TODO: ask for metadataUri, totalSupply, minimalPrice, and deployerSupplyPercent (and maybe factoryAddress) interactively instead
    throw 'update metadataUri, totalSupply, minimalPrice, and deployerSupplyPercent first'
    const factoryAddress = "UQAKpTPWh6VT2raY3OCWgHPwI7HxyjF5Yc81NdlTVl8kOES0"; // upgradable
    const totalSupply = 0n;
    const deployerSupplyPercent = 0n;
    const minimalPrice = 1n;
    const metadataUri = '';

    const jettonFactory = provider.open(JettonFactory.createFromAddress(Address.parse(factoryAddress)));

    await jettonFactory.sendInitiateNew(provider.sender(), 150_000_000n, {
        totalSupply,
        metadataUri,
        deployerSupplyPercent,
        minimalPrice,
    });
}
