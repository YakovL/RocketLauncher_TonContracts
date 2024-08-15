import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell } from '@ton/core';
import { Pool } from '../wrappers/Pool';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('Pool', () => {
    const initPoolJettonBalance = 1000_000n;
    const jettonMinterContent = {
        type: 1,
        uri: '',
    } as Parameters<typeof JettonMinter.jettonContentToCell>[0];

    let code: Cell;
    beforeAll(async () => {
        code = await compile('Pool');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let poolContract: SandboxContract<Pool>;
    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
        const pool = Pool.createFromConfig({
            poolJettonContent: JettonMinter.jettonContentToCell(jettonMinterContent)
        }, code);
        poolContract = blockchain.openContract(pool);

        const deployResult = await poolContract.sendDeploy(
            deployer.getSender(),
            pool.estimatedDeployGasPrice,
            {
                poolJettonBalance: initPoolJettonBalance,
                minimalPrice: 1000_000n,
                feePerMille: 5,
                factoryAddress: deployer.address,      // should be factory address in case of deployment by factory
                jettonWalletAddress: deployer.address, // should be wallet address in case of deployment by factory
            }
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

    it('should allow to buy jettons', async () => {
        throw 'todo: implement'
    })
});
