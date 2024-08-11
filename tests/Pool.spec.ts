import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell } from '@ton/core';
import { Pool } from '../wrappers/Pool';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('Pool', () => {
    let code: Cell;
    beforeAll(async () => {
        code = await compile('Pool');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let poolContract: SandboxContract<Pool>;
    beforeEach(async () => {
        blockchain = await Blockchain.create();
        const pool = Pool.createFromConfig({
            poolJettonBalance: 1000_000n,
        }, code);
        poolContract = blockchain.openContract(pool);

        deployer = await blockchain.treasury('deployer');

        const deployResult = await poolContract.sendDeploy(
            deployer.getSender(),
            pool.estimatedDeployGasPrice
        );

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: poolContract.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and pool are ready to use
    });
});
