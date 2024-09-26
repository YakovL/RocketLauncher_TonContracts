import { confirm } from '@inquirer/prompts'
import { Address } from '@ton/core';
import { NetworkProvider, compile } from '@ton/blueprint';
import { JettonFactory } from '../wrappers/JettonFactory';
import { mainnetConfig } from './mainnetConfig';

export async function run(provider: NetworkProvider) {
    const factory = provider.open(JettonFactory.createFromAddress(Address.parse(mainnetConfig.factoryAddress)));
    const newFactoryCode = await compile('JettonFactory');
    const shouldUpdatePool = await confirm({ message: 'Should update pool code as well?' });

    const upgrade_estimatedValue = JettonFactory.get_sendUpgrade_estimatedValue(shouldUpdatePool);
    await factory.sendUpgrade(provider.sender(), upgrade_estimatedValue, newFactoryCode, {
        newPoolCode: shouldUpdatePool ? await compile('Pool') : undefined,
    });
}
