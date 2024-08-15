import {
    Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode,
    toNano,
} from '@ton/core';

export type PoolConfigAddressDefining = {
    poolJettonContent: Cell // JETTON_METADATA in pool.rc
};
export type PoolInitConfig = {
    poolJettonBalance:   bigint // (J0)
    minimalPrice:        bigint
    feePerMille:         number
    factoryAddress:      Address
    jettonWalletAddress: Address
};
export type PoolConfig = PoolConfigAddressDefining & PoolInitConfig;

export class Pool implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new Pool(address);
    }

    // must be aligned with load_data, save_data in pool.rc
    static poolConfigToCell(config: PoolConfigAddressDefining): Cell {
        return beginCell()
            .storeRef(config.poolJettonContent)
            .storeUint(0, 100) // placeholder: jetton_balance
            .storeUint(0, 100) // initial ton balance is 0
            .storeUint(0, 100) // placeholder: T0
            .storeUint(0, 10)  // placeholder: FEE_PER_MILLE
            .storeUint(0, 2)   // placeholder: FACTORY_ADDRESS
            .storeUint(0, 2)   // placeholder: POOL_JETTON_WALLET_ADDRESS
            .storeUint(0, 1)   // IS_INITED: false
        .endCell();
    }

    static createFromConfig(config: PoolConfigAddressDefining, code: Cell, workchain = 0) {
        const data = this.poolConfigToCell(config);
        const init = { code, data };
        return new Pool(contractAddress(workchain, init), init);
    }

    estimatedDeployGasPrice = toNano('0.05');
    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint, initConfig: PoolInitConfig) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(this.ops.init, 32)
                .storeUint(0, 64)  // empty query_id

                // must be aligned with parsing ops.init in pool.rc
                .storeUint(initConfig.poolJettonBalance, 100)
                .storeUint(initConfig.poolJettonBalance * initConfig.minimalPrice, 100) // T0
                .storeUint(initConfig.feePerMille, 10)
                .storeAddress(initConfig.factoryAddress)
                .storeAddress(initConfig.jettonWalletAddress)
            .endCell(),
        });
    }

    ops = {
        // these must be aligned with pool.rc
        init: 101,
    };
}
