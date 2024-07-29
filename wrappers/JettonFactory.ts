import {
    Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode,
    toNano,
} from '@ton/core';

export type JettonFactoryConfig = {
    minterCode: Cell;
    walletCode: Cell;
};

export function jettonFactoryConfigToCell(config: JettonFactoryConfig): Cell {
    return beginCell()
        .storeRef(config.minterCode)
        .storeRef(config.walletCode)
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
}
