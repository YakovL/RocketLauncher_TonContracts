import { CompilerConfig } from '@ton/blueprint';

export const compile: CompilerConfig = {
    lang: 'func',
    targets: [
        'contracts/jetton/op-codes.fc',
        'contracts/jetton_factory.fc'
    ],
};
