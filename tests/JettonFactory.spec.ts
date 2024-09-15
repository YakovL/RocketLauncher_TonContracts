import { Cell } from '@ton/core';
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { compile } from '@ton/blueprint';
import { JettonFactory } from '../wrappers/JettonFactory';
import { JettonMinter } from '../wrappers/JettonMinter';
import { Pool } from '../wrappers/Pool';
import '@ton/test-utils';

describe('JettonFactory', () => {
    const metadataUri = 'https://github.com/YakovL/ton-example-jetton/raw/master/jetton-metadata.json';

    let factoryCode: Cell;
    let minterCode: Cell;
    let walletCode: Cell;
    let poolCode: Cell;
    beforeAll(async () => {
        factoryCode = await compile('JettonFactory');
        minterCode = await compile('JettonMinter');
        walletCode = await compile('JettonWallet');
        poolCode = await compile('Pool');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let nonDeployer: SandboxContract<TreasuryContract>;
    let jettonFactoryContract: SandboxContract<JettonFactory>;
    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
        nonDeployer = await blockchain.treasury('nonDeployer');

        const jettonFactory = JettonFactory.createFromConfig({
            minterCode,
            walletCode,
            poolCode,
            adminAddress: deployer.address,
            feePerMille: 10n,
            maxDeployerSupplyPercent: 5n,
        }, factoryCode);
        jettonFactoryContract = blockchain.openContract(jettonFactory);

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

    it('should deploy Pool', async () => {
        const deployerSupplyPercent = await jettonFactoryContract.getMaxDeployerSupplyPercent();
    });

    it('should not deploy Pool when deployer requests too much supply share', async () => {
        const deployerSupplyPercent = await jettonFactoryContract.getMaxDeployerSupplyPercent() + 1n;;

        const result = await jettonFactoryContract.sendInitiateNew(deployer.getSender(), 10_000_000n, {
            metadataUri,
            metadataType: 1,
            totalSupply: 100_000_000_000n,
            deployerSupplyPercent,
            minimalPrice: 1000_000n,
        });
        // see error_too_much_deployer_supply_share_requested
        expect(result.transactions).toHaveTransaction({ success: false, exitCode: 0xffa1 });
    });

    // TODO: no longer valid, re-implement for the full chain
    it.skip('should deploy Jetton', async () => {
        const metadataUri = 'https://github.com/YakovL/ton-example-jetton/raw/master/jetton-metadata.json';
        const deployResult = await jettonFactoryContract.sendDeployNewJetton(deployer.getSender(), {
            totalSupply: 0n,
            metadataType: 1,
            metadataUri,
        });

        const minterAddress = JettonMinter.createFromConfig({
            admin: jettonFactoryContract.address, // not deployer.address!
            wallet_code: await compile('JettonWallet'),
            content: JettonMinter.jettonContentToCell({ type: 1, uri: metadataUri }),
        }, await compile('JettonMinter')).address;

        expect(deployResult.transactions).toHaveTransaction({
            from: jettonFactoryContract.address,
            to: minterAddress,
            oldStatus: 'uninitialized',
            endStatus: 'active',
        })
    })

    it('should be upgradable by admin (deployer)', async () => {
        const estimatedValue = 1000_000n; // fails for 500_000n
        const result = await jettonFactoryContract.sendUpgrade(deployer.getSender(),
            estimatedValue,
            await compile('JettonFactory'));
        expect(result.transactions).not.toHaveTransaction({ success: false });
    });
    it('should not be upgradable by non-admin', async () => {
        const estimatedValue = 1000_000n;
        const result = await jettonFactoryContract.sendUpgrade(nonDeployer.getSender(),
            estimatedValue,
            await compile('JettonFactory'));
        expect(result.transactions).toHaveTransaction({ success: false });
    });
});
