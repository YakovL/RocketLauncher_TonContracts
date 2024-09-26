import fs from 'fs/promises'
import path from 'path'
import { Blockchain } from '@ton/sandbox';
import { flattenTransaction } from '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { JettonFactory } from '../wrappers/JettonFactory';
import { JettonMinter } from '../wrappers/JettonMinter';
import { Pool } from '../wrappers/Pool';
import '@ton/test-utils';

const config = {
    upgrade_estimatedValue: 1000_000n, // fails for 500_000n
    upgradeWithNewPool_estimatedValue: 1500_000n, // fails for 1_000_000n

    // normal values, far from edge cases
    totalSupply: 100_000_000_000n,
    minimalPrice: 1000_000n,
};
const metadataUri = 'https://github.com/YakovL/ton-example-jetton/raw/master/jetton-metadata.json';

// === compile helpers ===
const getCompiledContracts = async () => {
    return {
        factoryCode: await compile('JettonFactory'),
        minterCode: await compile('JettonMinter'),
        walletCode: await compile('JettonWallet'),
        poolCode: await compile('Pool'),
    };
};
type CompiledContracts = Awaited<ReturnType<typeof getCompiledContracts>>;
let compiledContractsCache: CompiledContracts | null = null;
const getCompiledContractsWithCache = async () => {
    compiledContractsCache = compiledContractsCache || await getCompiledContracts();
    return compiledContractsCache;
}

const getModifiedContractCode = async (filePath: 'jetton_factory.fc' | 'pool.fc') => {
    const expectedValue = 12345n;
    const methodId = 'additional_getter';

    const codePath = path.join(__dirname, `../contracts/${filePath}`);
    const originalFactoryCode = await fs.readFile(codePath, 'utf8');

    const modifiedFactoryCode = originalFactoryCode + `
    
    int ${methodId}() method_id {
        return ${expectedValue};
    }`;
    await fs.writeFile(codePath, modifiedFactoryCode);

    const wrapperName = filePath == 'jetton_factory.fc' ? 'JettonFactory'
        : 'Pool'
    const compiledCode = await compile(wrapperName);

    await fs.writeFile(codePath, originalFactoryCode);

    return {
        expectedValue,
        methodId,
        compiledCode,
    };
}

// === setup helper (beforeEach) ===
const prepareTestEntities = async ({
    factoryCode,
    minterCode,
    walletCode,
    poolCode,
}: CompiledContracts) => {
    const blockchain = await Blockchain.create();
    const deployer = await blockchain.treasury('deployer');
    const nonDeployer = await blockchain.treasury('nonDeployer');

    const jettonFactory = JettonFactory.createFromConfig({
        minterCode,
        walletCode,
        poolCode,
        adminAddress: deployer.address,
        feePerMille: 10n,
        maxDeployerSupplyPercent: 5n,
    }, factoryCode);
    const jettonFactoryContract = blockchain.openContract(jettonFactory);

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

    return {
        blockchain,
        deployer,
        nonDeployer,
        jettonFactoryContract,
    }
}
type TestContext = Awaited<ReturnType<typeof prepareTestEntities>>;

// === main tests ===
const testFactoryFeatures = async (context : CompiledContracts & TestContext) => {
    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and jettonFactoryContract are ready to use
        expect(context.jettonFactoryContract).toBeTruthy();
    });

    it('should deploy Pool, Jetton, and mint it', async () => {
        const deployerSupplyPercent = await context.jettonFactoryContract.getMaxDeployerSupplyPercent();
        const { totalSupply, minimalPrice } = config;

        const result = await context.jettonFactoryContract.sendInitiateNew(context.deployer.getSender(),
            JettonFactory.sendInitiateNew_estimatedValue, {
                metadataUri,
                totalSupply,
                deployerSupplyPercent,
                minimalPrice,
            }
        );

        expect(result.transactions).not.toHaveTransaction({ success: false });

        // pool deployed and initiated
        expect(result.transactions).toHaveTransaction({ op: Pool.ops.init, deploy: true });

        // 2-in-1: deploy + mint to pool
        expect(result.transactions).toHaveTransaction({ op: JettonOp.mint, deploy: true });

        const internalTransfers = result.transactions.filter(
            t => flattenTransaction(t).op === JettonOp.internal_transfer);
        expect(internalTransfers.length).toBe(2);

        const transferToPoolWallet = internalTransfers[0];
        const poolWalletAddress = flattenTransaction(transferToPoolWallet).to!;
        const poolJettonWalletContract = context.blockchain.openContract(
            JettonWallet.createFromAddress(poolWalletAddress)
        );
        const poolJettonBalance = await poolJettonWalletContract.getJettonBalance();
        expect(poolJettonBalance).toEqual(totalSupply - totalSupply * deployerSupplyPercent / 100n);

        const transferToDeployerWallet = internalTransfers[1];
        const deployerWalletAddress = flattenTransaction(transferToDeployerWallet).to!;
        const deployerJettonWalletContract = context.blockchain.openContract(
            JettonWallet.createFromAddress(deployerWalletAddress)
        );
        const deployerJettonBalance = await deployerJettonWalletContract.getJettonBalance();
        expect(deployerJettonBalance).toEqual(totalSupply * deployerSupplyPercent / 100n);
    });

    it('should not deploy Pool when deployer requests too much supply share', async () => {
        const deployerSupplyPercent = await context.jettonFactoryContract.getMaxDeployerSupplyPercent() + 1n;

        const result = await context.jettonFactoryContract.sendInitiateNew(context.deployer.getSender(),
            JettonFactory.sendInitiateNew_estimatedValue, {
                metadataUri,
                totalSupply: config.totalSupply,
                deployerSupplyPercent,
                minimalPrice: config.minimalPrice,
            }
        );

        // see error_too_much_deployer_supply_share_requested
        expect(result.transactions).toHaveTransaction({ success: false, exitCode: 0xffa1 });
    });

    // === upgrading, part 1 ===
    it('should be upgradable by admin (deployer)', async () => {
        const result = await context.jettonFactoryContract.sendUpgrade(context.deployer.getSender(),
            config.upgrade_estimatedValue,
            context.factoryCode, {});
        expect(result.transactions).not.toHaveTransaction({ success: false });
    });
    it('should not be upgradable by non-admin', async () => {
        const result = await context.jettonFactoryContract.sendUpgrade(context.nonDeployer.getSender(),
            config.upgrade_estimatedValue,
            context.factoryCode, {});
        expect(result.transactions).toHaveTransaction({ success: false });
    });
    // checks that the functionality is preserved are below (JettonFactory after upgrade)
};

describe('JettonFactory', () => {
    const context = {} as CompiledContracts & TestContext;

    beforeAll(async () => Object.assign(context, await getCompiledContractsWithCache()));

    beforeEach(async () => Object.assign(context, await prepareTestEntities(context)));

    testFactoryFeatures(context);
});

// === upgrading, part 2 ===
describe('JettonFactory after upgrade', () => {
    const context = {} as CompiledContracts & TestContext;

    beforeAll(async () => Object.assign(context, await getCompiledContractsWithCache()));

    beforeEach(async () => {
        Object.assign(context, await prepareTestEntities(context))

        await context.jettonFactoryContract.sendUpgrade(context.deployer.getSender(),
            config.upgrade_estimatedValue,
            context.factoryCode, {} // i.e. the same as before
        );
    });

    testFactoryFeatures(context);

    it('upgraded contract should have extended functionality', async () => {
        const {
            compiledCode: modifiedFactoryCode,
            expectedValue, methodId
        } = await getModifiedContractCode('jetton_factory.fc');

        const result = await context.jettonFactoryContract.sendUpgrade(context.deployer.getSender(),
            config.upgrade_estimatedValue,
            modifiedFactoryCode, {});
        expect(result.transactions).not.toHaveTransaction({ success: false });

        // getModifiedFactoryCode adds a new getter, which we test here
        const provider = context.jettonFactoryContract.getProvider();
        const { stack } = await provider.get(methodId, []); 
        const value = stack.readBigNumber();
        expect(value).toEqual(expectedValue);
    });

    it('can upgrade pool code and it has to have extended functionality in that case', async () => {
        const {
            compiledCode: newPoolCode,
            expectedValue, methodId
        } = await getModifiedContractCode('pool.fc');

        const upgradeResult = await context.jettonFactoryContract.sendUpgrade(context.deployer.getSender(),
            config.upgradeWithNewPool_estimatedValue,
            context.factoryCode, {
                newPoolCode
            });
        expect(upgradeResult.transactions).not.toHaveTransaction({ success: false });

        const initiateNewResult = await context.jettonFactoryContract.sendInitiateNew(context.deployer.getSender(),
            JettonFactory.sendInitiateNew_estimatedValue, {
                ...config,
                metadataUri,
                deployerSupplyPercent: 0n,
            }
        );
        expect(initiateNewResult.transactions).not.toHaveTransaction({ success: false });
        expect(initiateNewResult.transactions).toHaveTransaction({
            op: Pool.ops.init,
            deploy: true,
        });

        const txPoolDeploy = initiateNewResult.transactions.find(t => flattenTransaction(t).op === Pool.ops.init);
        const poolWalletAddress = flattenTransaction(txPoolDeploy!).to!;
        const poolContract = context.blockchain.openContract(Pool.createFromAddress(poolWalletAddress));

        // getModifiedFactoryCode adds a new getter, which we test here
        const provider = poolContract.getProvider();
        const { stack } = await provider.get(methodId, []); 
        const value = stack.readBigNumber();
        expect(value).toEqual(expectedValue);
    });
});
