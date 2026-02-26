import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';

/**
 * Apollo Sandbox landing page (replaces deprecated GraphQL Playground).
 * In development, visiting /graphql shows the interactive Explorer.
 */
export const playgroundPlugin = ApolloServerPluginLandingPageLocalDefault({
  embed: true,
  includeCookies: true,
});
