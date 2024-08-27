import { Cell } from '@ton/core';
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { compile } from '@ton/blueprint';
import { JettonFactory } from '../wrappers/JettonFactory';
import { JettonMinter } from '../wrappers/JettonMinter';
import { Pool } from '../wrappers/Pool';
import '@ton/test-utils';

describe('JettonFactory', () => {
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
    let jettonFactoryContract: SandboxContract<JettonFactory>;
    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');

        const jettonFactory = JettonFactory.createFromConfig({
            minterCode,
            walletCode,
            poolCode,
            adminAddress: deployer.address,
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

    it('should deploy Jetton', async () => {
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
});
