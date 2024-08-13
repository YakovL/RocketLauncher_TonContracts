import {
    Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode,
    toNano,
} from '@ton/core';

export type PoolConfig = {
    poolJettonBalance: bigint // (J0)
};

// must be aligned with load_data, save_data in pool.rc
export function poolConfigToCell(config: PoolConfig): Cell {
    return beginCell()
        .storeUint(config.poolJettonBalance, 100)
        .storeUint(0, 100) // initial ton balance is 0
        .storeUint(0, 1)   // is_inited: false
    .endCell();
}

export class Pool implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new Pool(address);
    }

    static createFromConfig(config: PoolConfig, code: Cell, workchain = 0) {
        const data = poolConfigToCell(config);
        const init = { code, data };
        return new Pool(contractAddress(workchain, init), init);
    }

    estimatedDeployGasPrice = toNano('0.05');
    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(this.ops.init, 32)
            .endCell(),
        });
    }

    ops = {
        // these must be aligned with pool.rc
        init: 101,
    };
}
