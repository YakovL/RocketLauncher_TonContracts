import { JettonFactory } from '../wrappers/JettonFactory';
import { NetworkProvider } from '@ton/blueprint';
import { Address } from '@ton/core';
import { mainnetConfig } from './mainnetConfig';

type config = Parameters<InstanceType<typeof JettonFactory>['sendInitiateNew']>[3];
const defaults: config = {
    totalSupply: 1000_000_000n,
    minimalPrice: 1000n,
    deployerSupplyPercent: 0n,
    metadataUri: '',
};
type paramName = keyof config;
const paramNames = Object.keys(defaults) as Array<paramName>;

export async function run(provider: NetworkProvider) {
    const ui = provider.ui();
    const values = {} as config;
    for(const param of paramNames) {
        const defaultValue = defaults[param];
        const inputValue = await ui.input(`Please type ${param} (default: ${defaultValue})`);
        values[param] = !inputValue ? defaultValue
            : (param == 'metadataUri' ? inputValue : BigInt(inputValue!));
    };
    console.log(values);

    const jettonFactory = provider.open(JettonFactory.createFromAddress(Address.parse(mainnetConfig.factoryAddress)));

    await jettonFactory.sendInitiateNew(provider.sender(), 150_000_000n, values);
}
