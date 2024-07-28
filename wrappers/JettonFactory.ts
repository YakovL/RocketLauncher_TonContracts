import {
    Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode,
} from '@ton/core';

export type JettonFactoryConfig = {
};

export function jettonFactoryConfigToCell(config: JettonFactoryConfig): Cell {
    return beginCell().endCell();
}

export class JettonFactory implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new JettonFactory(address);
    }

    static createFromConfig(config: JettonFactoryConfig, code: Cell, workchain = 0) {
        const data = jettonFactoryConfigToCell(config);
        const init = { code, data };
        return new JettonFactory(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }
}
