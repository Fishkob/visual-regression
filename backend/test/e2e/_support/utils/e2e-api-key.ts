// E2E tests authenticate with a fixed api key created in the TestApp setup.
// The value lives in the seed fixtures so TestApp and seed-e2e cannot drift.
export { E2E_API_KEY } from '../../../../src/scripts/seeds/fixtures';
