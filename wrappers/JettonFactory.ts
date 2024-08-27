import {
    Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode,
    toNano,
} from '@ton/core';
import { PoolInitConfig } from './Pool'
import { JettonMinter } from './JettonMinter';

export type JettonFactoryConfig = {
    minterCode: Cell;
    walletCode: Cell;
    poolCode: Cell;
    adminAddress: Address;
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

    // must be aligned with jetton_factory.rc
    ops = {
        initiateNew: 1,
        deployJetton: 2,
    };

    // public methods
    // Based on https://github.com/ton-blockchain/token-contract/blob/main/wrappers/JettonMinter.ts
    // In our case, admin is the factory contract and wallet code is stored inside it, so JettonMinterConfig is simpler
    async sendDeployNewJetton(provider: ContractProvider, via: Sender, config: JettonMinterConfig) {
        // TODO: learn how to generate them, set a "correct" one (at least unique)
        const query_id = 0;
        // must be aligned with jetton-minter (more specifically: ?, see also https://docs.ton.org/develop/dapps/asset-processing/jettons#retrieving-jetton-data)
        const content = JettonMinter.jettonContentToCell({
            type: config.metadataType,
            uri: config.metadataUri, // presumably, .storeStringTail in jettonContentToCell implements snake data encoding (https://docs.ton.org/develop/dapps/asset-processing/metadata)
        });
        // less than 0.01 is needed for Jetton deploy, so 0.02 is more than enough
        // TODO: retest after adding other operations
        const value = toNano('0.02');

        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            // must be aligned with jetton_factory.rc (see operation_deploy_jetton)
            body: beginCell()
                .storeUint(this.ops.deployJetton, 32)
                .storeUint(query_id, 64)
                .storeCoins(config.totalSupply)
                .storeRef(content)
            .endCell(),
        });
    }

    async sendDeployPool(provider: ContractProvider, via: Sender, value: bigint, config: PoolFromFactoryConfig) {
        const content = JettonMinter.jettonContentToCell({
            type: config.metadataType,
            uri: config.metadataUri,
        });

        const query_id = 0;
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(this.ops.initiateNew, 32)
                .storeUint(query_id, 64)
                .storeCoins(config.totalSupply)
                .storeCoins(config.minimalPrice)
                .storeCoins(config.deployerSupplyPercent)
                .storeRef(content)
            .endCell(),
        });
    }
}
