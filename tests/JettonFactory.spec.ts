import { Cell, toNano } from '@ton/core';
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { compile } from '@ton/blueprint';
import { JettonFactory } from '../wrappers/JettonFactory';
import '@ton/test-utils';

describe('JettonFactory', () => {
    let factoryCode: Cell;
    let minterCode: Cell;
    let walletCode: Cell;
    beforeAll(async () => {
        factoryCode = await compile('JettonFactory');
        minterCode = await compile('JettonMinter');
        walletCode = await compile('JettonWallet');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let jettonFactoryContract: SandboxContract<JettonFactory>;
    beforeEach(async () => {
        blockchain = await Blockchain.create();
        const jettonFactory = JettonFactory.createFromConfig({
            minterCode,
            walletCode,
        }, factoryCode);
        jettonFactoryContract = blockchain.openContract(jettonFactory);

        deployer = await blockchain.treasury('deployer');

        const deployResult = await jettonFactoryContract.sendDeploy(
            deployer.getSender(),
            jettonFactoryContract.estimatedDeployGasPrice
        );

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonFactoryContract.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and jettonFactoryContract are ready to use
    });
});
