# React Native mobile boundaries

COMMUNITY-PROFILE-GUIDANCE: react-native-readiness-v1

This guidance is additive. It does not make VCP a native React Native stack detector and does not authorize changing project architecture.

When the project deliberately selects this profile:

- keep platform-specific code behind narrow interfaces rather than spreading iOS/Android conditionals through domain logic;
- distinguish JavaScript/TypeScript tests from device/simulator E2E evidence;
- treat native permissions, deep links, push notifications, secure storage, and platform lifecycle as trust/runtime boundaries;
- preserve offline/retry/idempotence behavior across app restarts and flaky networks where the feature depends on remote state;
- record any native build/signing/release requirements in project Source of Truth rather than inferring them from this plugin;
- do not accept the proposed `E2E_COMMAND` unless the repository actually defines and owns that command.
