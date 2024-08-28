import { JettonFactory } from '../wrappers/JettonFactory';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const minterCode = await compile('JettonMinter');
    const walletCode = await compile('JettonWallet');
    const poolCode = await compile('Pool');
    // TODO: ask interactively instead
    const feePerMille = 10n;
    const maxDeployerSupplyPercent = 5n;
    console.log(`feePerMille = ${feePerMille}`);
    console.log(`maxDeployerSupplyPercent = ${maxDeployerSupplyPercent}`);

    const sender = provider.sender()
    if(!sender.address) {
        throw new Error('deployJettonFactory: deployer address is undefined');
    }
    const jettonFactory = provider.open(JettonFactory.createFromConfig({
        minterCode,
        walletCode,
        poolCode,
        adminAddress: sender.address,
        feePerMille,
        maxDeployerSupplyPercent,
    }, await compile('JettonFactory')));

    await jettonFactory.sendDeploy(provider.sender(), jettonFactory.estimatedDeployGasPrice);

    await provider.waitForDeploy(jettonFactory.address);
}
