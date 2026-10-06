# First-party React Native mobile fixture

This is the Stage 11 **built-in mobile-profile** conformance fixture.

It is intentionally separate from `examples/community-profile-react-native/`, which remains Stage 10 community-plugin dogfood.

The fixture provides deterministic selected-root evidence:

- `dependencies["react-native"]`;
- `app.json`;
- `tsconfig.json`;
- local package scripts for format, lint, general check, unit, integration, build, and E2E verification. The general check also validates the fixture's TypeScript configuration flags.

The scripts use only Node.js and local fixture files so VCP conformance stays network-independent. The declared React Native dependency is detection evidence; Stage 11 dogfood does not install or execute the React Native runtime.

No plugin selection is required. VCP must detect this root as `react-native`, generate the first-party React Native `AGENTS.md` appendix, discover only configured verification scripts, and keep signing/deployment/device/store actions outside general verification.
