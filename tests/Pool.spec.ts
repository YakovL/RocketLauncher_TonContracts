import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell } from '@ton/core';
import { Pool } from '../wrappers/Pool';
import { JettonMinter } from '../wrappers/JettonMinter';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('Pool', () => {
    const initPoolJettonBalance = 1000_000n;
    const jettonMinPrice = 1000_000n;
    const feePerMille = 5;
    const jettonMinterContent = {
        type: 1,
        uri: '',
    } as Parameters<typeof JettonMinter.jettonContentToCell>[0];

    let code: Cell;
    let minterCode: Cell;
    let walletCode: Cell;
    beforeAll(async () => {
        code = await compile('Pool');
        minterCode = await compile('JettonMinter');
        walletCode = await compile('JettonWallet');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let poolContract: SandboxContract<Pool>;
    let minterContract: SandboxContract<JettonMinter>;
    let poolJettonWalletAddress: Address;
    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');

        const minter = JettonMinter.createFromConfig({
            admin: deployer.address,
            content: JettonMinter.jettonContentToCell(jettonMinterContent),
            wallet_code: walletCode,
        }, minterCode);
        minterContract = blockchain.openContract(minter);

        const deployMinterResult = await minterContract.sendDeploy(
            deployer.getSender(),
            minter.estimatedDeployGasPrice
        );
        const pool = Pool.createFromConfig({
            poolJettonContent: JettonMinter.jettonContentToCell(jettonMinterContent)
        }, code);
        poolContract = blockchain.openContract(pool);

        const mintResult = await minterContract.sendMint(
            deployer.getSender(),
            poolContract.address, initPoolJettonBalance,
            50_000_000n, // TODO: estimate and set correct forward_ton_amount
            60_000_000n  // TODO: estimate and set correct total_ton_amount
        );
        const walletCreatedEvent = mintResult.events.find(e => e.type === 'account_created');
        expect(walletCreatedEvent).toBeTruthy();
        poolJettonWalletAddress = (walletCreatedEvent as { account: Address }).account;
        expect(Address.isAddress(poolJettonWalletAddress)).toBeTruthy();

        const deployResult = await poolContract.sendDeploy(
            deployer.getSender(),
            pool.estimatedDeployGasPrice,
            {
                poolJettonBalance: initPoolJettonBalance,
                minimalPrice: jettonMinPrice,
                feePerMille,
                factoryAddress: deployer.address,      // should be factory address in case of deployment by factory
                jettonWalletAddress: poolJettonWalletAddress,
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
