module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    moduleNameMapper: {
        '^web-agentic-ai$': '<rootDir>/src/index.ts',
    },
    transform: {
        '^.+\\.tsx?$': 'ts-jest',
    },
};
