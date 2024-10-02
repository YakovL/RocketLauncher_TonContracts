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
    jettonTotalSupply:   bigint
    jettonAuthorAddress: Address
};
export type PoolConfig = PoolConfigAddressDefining & PoolInitConfig;

export class Pool implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new Pool(address);
    }

    // must be aligned with load_data, save_data in pool.rc, and build_pool_init_data in factory.rc
    static poolConfigToCell(config: PoolConfigAddressDefining): Cell {
        return beginCell()
            .storeRef(config.poolJettonContent)
            .storeCoins(0)     // placeholder: INITIAL_JETTON_BALANCE
            .storeCoins(0)     // placeholder: jetton_balance
            .storeCoins(0)     // initial ton balance is 0
            .storeCoins(0)     // placeholder: T0
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
                .storeUint(Pool.ops.init, 32)
                .storeUint(0, 64)  // empty query_id

                // must be aligned with parsing ops.init in pool.rc
                .storeCoins(initConfig.poolJettonBalance)
                .storeCoins(initConfig.poolJettonBalance * initConfig.minimalPrice) // T0
                .storeUint(initConfig.feePerMille, 10)
                .storeAddress(initConfig.factoryAddress)
                .storeAddress(initConfig.jettonWalletAddress)
                .storeAddress(initConfig.adminAddress || via.address)
                // just for sending back to factory
                .storeRef(beginCell()
                    .storeCoins(initConfig.jettonTotalSupply)
                    .storeAddress(initConfig.jettonAuthorAddress)
                .endCell())
            .endCell(),
        });
    }

    static ops = {
        // these must be aligned with pool.rc
        init: 101,
        collectFunds: 102,
        buyJetton: 1,
    } as const;

    async sendBuyJetton(provider: ContractProvider, via: Sender,
        value: bigint
    ) {
        const query_id = 0;

        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Pool.ops.buyJetton, 32)
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

    async getVirtualJettonBalance(provider: ContractProvider): Promise<bigint> {
        const { stack } = await provider.get("jetton_balance", []);
        return stack.readBigNumber();
    }

    async getSoldJettonsAmount(provider: ContractProvider): Promise<bigint> {
        const { stack } = await provider.get("sold_jettons_amount", []);
        return stack.readBigNumber();
    }

    async getBuyJettonFixedFee(provider: ContractProvider): Promise<bigint> {
        const { stack } = await provider.get("buy_jetton_fixed_fee", []);
        return stack.readBigNumber();
    }

    async getEstimatedJettonForTon(provider: ContractProvider, tonAmount: bigint): Promise<bigint> {
        const { stack } = await provider.get("estimated_jetton_for_ton", [{
            type: 'int',
            value: tonAmount
        }]);
        return stack.readBigNumber();
    }

    async getEstimatedTonForJetton(provider: ContractProvider, jettonAmount: bigint): Promise<bigint> {
        const { stack } = await provider.get("estimated_ton_for_jetton", [{
            type: 'int',
            value: jettonAmount
        }]);
        return stack.readBigNumber();
    }

    // we can hardcode this value until we change it once on the contracts side
    async getFeePerMille(provider: ContractProvider): Promise<bigint> {
        const { stack } = await provider.get("fee_per_mille", []);
        return stack.readBigNumber();
    }

    readonly errorAmountNotAvailable = 'amount_not_available';
    readonly contractErrorAmountNotAvailable = 0xfff3;

    async getEstimatedRequiredTonForJetton(provider: ContractProvider, jettonAmount: bigint) {
        const feePerMille = await this.getFeePerMille(provider);
        try {
            const amount = -(await this.getEstimatedTonForJetton(provider, -jettonAmount));

            // getEstimatedTonForJetton returns amount = AMM_amount * (1 - fee)
            // while we have to compensate further fees by dividing AMM_amount by (1 - fee),
            // i.e. we need amount/(1 - fee)^2, which we estimate as amount*(1 + 2*fee)
            return amount + amount * 2n * feePerMille / 1000n;
        } catch (error: any) {
            if('exitCode' in error && error.exitCode == this.contractErrorAmountNotAvailable
             || 'message' in error && error.message.includes(`exit_code: ${this.contractErrorAmountNotAvailable}`)
            ) {
                return this.errorAmountNotAvailable
            }
            throw error
        }
    }

    async getEstimatedRequiredJettonForTon(provider: ContractProvider, tonAmount: bigint) {
        const feePerMille = await this.getFeePerMille(provider);
        try {
            // similarly to getEstimatedRequiredTonForJetton,
            // we compensate the (1 - fee)^2 factor of the tonAmount
            const compensatedTonAmount = tonAmount + tonAmount * 2n * feePerMille / 1000n;
            return -(await this.getEstimatedJettonForTon(provider, -compensatedTonAmount))
        } catch (error: any) {
            if('exitCode' in error && error.exitCode == this.contractErrorAmountNotAvailable
             || 'message' in error && error.message.includes(`exit_code: ${this.contractErrorAmountNotAvailable}`)
            ) {
                return this.errorAmountNotAvailable
            }
            throw error
        }
    }

    // must be aligned with fee_sell_jetton_pool_tx;
    // estimated as totalFees on pool when selling
    static readonly estimatedFixedFee_sendJettonExceptForward = 42_000_000n;
    static readonly estimatedFixedFee_sellJetton = 2_400_000n;
    // Estimated from the 'should allow to ... send jettons' and
    // 'should get its balance changed by no less than its ton_balance' tests.
    // For some reason, this is much greater than sendJetton_estimatedForwardAmount and can't be lowered;
    // however, a part of it is returned to the user with excesses.
    static readonly estimatedMinimalValueToSend_sellJetton =
        this.estimatedFixedFee_sendJettonExceptForward + this.estimatedFixedFee_sellJetton;

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
                .storeUint(Pool.ops.collectFunds, 32)
                .storeUint(query_id, 64)
                .storeCoins(amountToCollect)
            .endCell(),
        });
    }

    async getCollectableFundsAmount(provider: ContractProvider): Promise<bigint> {
        const { stack } = await provider.get("collectable_funds_amount", []);
        return stack.readBigNumber();
    }

    /**
     * This method is intended solely for autotests of upgrading
     */
    getProvider(provider: ContractProvider): ContractProvider {
        return provider;
    }
}
