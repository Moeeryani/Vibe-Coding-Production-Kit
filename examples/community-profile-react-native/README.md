# Community profile fixture — React Native readiness

This example demonstrates the Stage 10 **plugin model**, not native mobile support.

The project-owned declaration is:

`docs/plugins/PLUGINS.json`

It selects and pins the local bundle:

`community-plugins/react-native-readiness/`

The bundle contributes additive planning/implementation/review guidance and one verification proposal:

`E2E_COMMAND=npm run test:e2e`

Even though the project grants the `verification-proposals` capability, VCP does **not** write that command into `AGENTS.md` or execute it. Applying a proposal to the project's verification contract remains a human decision.

The digest covers every text file in the bundle after LF normalization. Editing either `plugin.json` or the guidance file invalidates the declared pin until a human deliberately reviews the change and updates the digest.

This fixture intentionally does not make `--stack auto` detect React Native because it contains no built-in React Native runtime/application evidence. Stage 11 now provides first-party React Native support separately in `examples/mobile-react-native/`; this directory remains Stage 10 plugin dogfood only.
