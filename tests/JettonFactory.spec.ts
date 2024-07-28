import { Cell, toNano } from '@ton/core';
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { compile } from '@ton/blueprint';
import { JettonFactory } from '../wrappers/JettonFactory';
import '@ton/test-utils';

describe('JettonFactory', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('JettonFactory');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let jettonFactory: SandboxContract<JettonFactory>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        jettonFactory = blockchain.openContract(JettonFactory.createFromConfig({}, code));

        deployer = await blockchain.treasury('deployer');

        const deployResult = await jettonFactory.sendDeploy(deployer.getSender(), jettonFactory.estimatedDeployGasPrice);

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonFactory.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and jettonFactory are ready to use
    });
});
