import { JettonFactory } from '../wrappers/JettonFactory';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const jettonFactory = provider.open(JettonFactory.createFromConfig({}, await compile('JettonFactory')));

    await jettonFactory.sendDeploy(provider.sender(), jettonFactory.estimatedDeployGasPrice);

    await provider.waitForDeploy(jettonFactory.address);
}
