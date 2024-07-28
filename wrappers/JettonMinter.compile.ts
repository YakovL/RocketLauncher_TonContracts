import { CompilerConfig } from '@ton/blueprint';

export const compile: CompilerConfig = {
    targets: [
        'contracts/imports/stdlib.fc',
        'contracts/jetton/params.fc',
        'contracts/jetton/op-codes.fc',
        'contracts/jetton/discovery-params.fc',
        'contracts/jetton/jetton-utils.fc',
        'contracts/jetton/jetton-minter-discoverable.fc',
    ],
};
