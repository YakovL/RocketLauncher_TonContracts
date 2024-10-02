import {
    Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode,
    toNano,
} from '@ton/core';
import { PoolInitConfig } from './Pool';
import { JettonMinter } from './JettonMinter';

export type JettonFactoryConfig = {
    minterCode: Cell;
    walletCode: Cell;
    poolCode: Cell;
    adminAddress: Address;
    // bigint is used instead of number to remind these are int-s
    feePerMille: bigint;
    maxDeployerSupplyPercent: bigint;
};

// Current implementation only supports off-chain format:
// https://github.com/ton-blockchain/TEPs/blob/master/text/0064-token-data-standard.md#jetton-metadata-example-offchain
export type JettonMinterConfig = {
    totalSupply: bigint
    // metadata, also known as 'content'
    metadataType: 0 | 1 // ?? on-chain vs off-chain?
    metadataUri: string
};

type PoolFromFactoryConfig = JettonMinterConfig & {
    deployerSupplyPercent: bigint // not big, but int
} & Pick<PoolInitConfig, 'minimalPrice'>

export function jettonFactoryConfigToCell(config: JettonFactoryConfig): Cell {
    return beginCell()
        .storeRef(config.minterCode)
        .storeRef(config.walletCode)
        .storeRef(config.poolCode)
        .storeAddress(config.adminAddress)
        .storeCoins(config.feePerMille)
        .storeUint(config.maxDeployerSupplyPercent, 4) // 32% is definitely a red flag, 4 bits is enough
    .endCell();
}

export class JettonFactory implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new JettonFactory(address);
    }

    static createFromConfig(config: JettonFactoryConfig, code: Cell, workchain = 0) {
        const data = jettonFactoryConfigToCell(config);
        const init = { code, data };
        const address = contractAddress(workchain, init);
        return new JettonFactory(address, init);
    }

    // TODO: make sure the amount is sufficient (maybe via autotests)
    estimatedDeployGasPrice = toNano('0.05');

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    // must be aligned with ops_and_errors.rc
    static ops = {
        initiateNew: 1,
        onPoolDeployProceedToMinter: 2,
        upgrade: 111,
    } as const;

    // public methods
    // Based on https://github.com/ton-blockchain/token-contract/blob/main/wrappers/JettonMinter.ts
    // In our case, admin is the factory contract and wallet code is stored inside it, so JettonMinterConfig is simpler
    async sendDeployNewJetton(provider: ContractProvider, via: Sender, config: JettonMinterConfig) {
        await provider.internal(via, {
            value: toNano('0.12'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(JettonFactory.ops.onPoolDeployProceedToMinter, 32)
                .storeUint(0, 64)
                .storeCoins(config.totalSupply)
                .storeRef(JettonMinter.jettonContentToCell({
                    type: config.metadataType,
                    uri: config.metadataUri, // presumably, .storeStringTail in jettonContentToCell implements snake data encoding (https://docs.ton.org/develop/dapps/asset-processing/metadata)
                }))
                .storeCoins(config.totalSupply * 95n / 100n)
                .storeAddress(via.address)
            .endCell(),
        });
    }

    // 0.1 is enough for wallet → factory → pool → factory; 0.15 for + deploy and mint to pool; 0.22 for + mint to deployer
    static sendInitiateNew_estimatedValue = toNano('0.22')
    async sendInitiateNew(provider: ContractProvider, via: Sender, value: bigint, config: Omit<PoolFromFactoryConfig, 'metadataType'>) {
        const content = JettonMinter.jettonContentToCell({
            type: 1,
            uri: config.metadataUri,
        });

        const query_id = 0;
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(JettonFactory.ops.initiateNew, 32)
                .storeUint(query_id, 64)
                .storeCoins(config.totalSupply)
                .storeCoins(config.minimalPrice)
                .storeCoins(config.deployerSupplyPercent)
                .storeRef(content)
            .endCell(),
        });
    }

    // rough estimations from the tests; fails for 500_000n (shouldUpdatePool: false) and for 1_000_000n (true)
    static get_sendUpgrade_estimatedValue = (shouldUpdatePool: boolean) => shouldUpdatePool ? 1_500_000n : 1_000_000n;
    async sendUpgrade(provider: ContractProvider, via: Sender, value: bigint, newCode: Cell, options: {
        newPoolCode?: Cell
    }) {
        const query_id = 0;
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(JettonFactory.ops.upgrade, 32)
                .storeUint(query_id, 64)
                .storeRef(newCode)
                .storeMaybeRef(options.newPoolCode)
            .endCell(),
        });
    }

    async getMaxDeployerSupplyPercent(provider: ContractProvider): Promise<bigint> {
        const { stack } = await provider.get("max_deployer_supply_percent", []);
        return stack.readBigNumber();
    }

    /**
     * This method is intended solely for autotests of upgrading
     */
    getProvider(provider: ContractProvider): ContractProvider {
        return provider;
    }
}
