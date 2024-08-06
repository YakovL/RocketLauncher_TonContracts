import { JettonFactory } from '../wrappers/JettonFactory';
import { NetworkProvider } from '@ton/blueprint';
import { Address } from '@ton/core';

export async function run(provider: NetworkProvider) {
    // TODO: ask for metadataUri and totalSupply (and maybe factoryAddress) interactively
    throw 'update factory address if changed, metadataUri, and totalSupply first'
    const factoryAddress = "EQBcHosKYSwnwNzLw5IUTvuf35tp7i71RgMX7aGPIBe5hlZ7";
    const totalSupply = 0n;
    const metadataUri = '';

    const jettonFactory = provider.open(JettonFactory.createFromAddress(Address.parse(factoryAddress)));

    await jettonFactory.sendDeployNewJetton(provider.sender(), {
        totalSupply,
        metadataType: 1,
        metadataUri,
    })
}
