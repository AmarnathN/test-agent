module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    moduleNameMapper: {
        '^@ai-test/framework$': '<rootDir>/src/index.ts',
    },
    transform: {
        '^.+\\.tsx?$': 'ts-jest',
    },
};
