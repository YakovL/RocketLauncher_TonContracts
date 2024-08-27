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
    adminAddress:        Address | null
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
            .storeUint(0, 2)   // placeholder: admin_address
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
                .storeAddress(initConfig.adminAddress || via.address)
            .endCell(),
        });
    }

    ops = {
        // these must be aligned with pool.rc
        init: 101,
        collectFunds: 102,
        buyJetton: 1,
    };

    async sendBuyJetton(provider: ContractProvider, via: Sender,
        value: bigint
    ) {
        const query_id = 0;

        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(this.ops.buyJetton, 32)
                .storeUint(query_id, 64)
            .endCell(),
        });
    }

    async getBalance(provider: ContractProvider) {
        const state = await provider.getState();
        return state.balance;
    }

    async getVirtualTonBalance(provider: ContractProvider): Promise<bigint> {
        const { stack } = await provider.get("ton_balance", []);
        return stack.readBigNumber();
    }

    async getBuyJettonFixedFee(provider: ContractProvider): Promise<bigint> {
        const { stack } = await provider.get("buy_jetton_fixed_fee", []);
        return stack.readBigNumber();
    }

    async getCollectFeeUpperEstimation(provider: ContractProvider): Promise<bigint> {
        const { stack } = await provider.get("collect_fee_upper_estimation", []);
        return stack.readBigNumber();
    }

    async sendCollectFunds(provider: ContractProvider, via: Sender, amountToCollect: bigint) {
        const query_id = 0;
        const valueToEnsureSend = 10_000_000n; // arbitrary (is sent back to collector), but not too small (the tx shouldn't fail)

        await provider.internal(via, {
            value: valueToEnsureSend,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(this.ops.collectFunds, 32)
                .storeUint(query_id, 64)
                .storeCoins(amountToCollect)
            .endCell(),
        });
    }

    async getCollectableFundsAmount(provider: ContractProvider): Promise<bigint> {
        const { stack } = await provider.get("collectable_funds_amount", []);
        return stack.readBigNumber();
    }
}
