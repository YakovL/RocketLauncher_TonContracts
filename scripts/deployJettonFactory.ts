import { toNano } from '@ton/core';
import { JettonFactory } from '../wrappers/JettonFactory';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const jettonFactory = provider.open(JettonFactory.createFromConfig({}, await compile('JettonFactory')));

    // TODO: make sure the amount is sufficient (maybe via autotests)
    await jettonFactory.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(jettonFactory.address);
}
