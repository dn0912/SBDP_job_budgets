module.exports = {
  extends: 'airbnb-base',
  rules: {
    semi: ['error', 'never'],
    'comma-dangle': 0,
    'consistent-return': 0,
    'dot-notation': 0,
    'implicit-arrow-linebreak': [
      'off',
    ],
    'no-param-reassign': 0,
    'no-underscore-dangle': 0,
    'no-shadow': 0,
    'no-console': 0,
    'no-plusplus': 0,
    'no-unused-expressions': 0,
    'no-unused-vars': [
      'error',
      {
        argsIgnorePattern: 'next',
      },
    ],
    'import/no-extraneous-dependencies': [
      'error',
      {
        devDependencies: true,
      },
    ],
  },
}
