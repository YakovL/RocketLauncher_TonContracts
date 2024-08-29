import { CompilerConfig } from '@ton/blueprint';

export const compile: CompilerConfig = {
    lang: 'func',
    targets: [
        'contracts/imports/stdlib.fc',
        'contracts/jetton/params.fc',
        'contracts/jetton/jetton-utils.fc',
        'contracts/jetton/op-codes.fc',
        'contracts/ops_and_errors.fc',
        'contracts/jetton_factory.fc'
    ],
};
