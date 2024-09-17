import { JettonFactory } from '../wrappers/JettonFactory';
import { NetworkProvider } from '@ton/blueprint';
import { Address } from '@ton/core';
import { mainnetConfig } from './mainnetConfig';

export async function run(provider: NetworkProvider) {
    // TODO: ask for metadataUri, totalSupply, minimalPrice, and deployerSupplyPercent (and maybe factoryAddress) interactively instead
    throw 'update metadataUri, totalSupply, minimalPrice, and deployerSupplyPercent first'
    const totalSupply = 0n;
    const deployerSupplyPercent = 0n;
    const minimalPrice = 1n;
    const metadataUri = '';

    const jettonFactory = provider.open(JettonFactory.createFromAddress(Address.parse(mainnetConfig.factoryAddress)));

    await jettonFactory.sendInitiateNew(provider.sender(), 150_000_000n, {
        totalSupply,
        metadataUri,
        deployerSupplyPercent,
        minimalPrice,
    });
}
