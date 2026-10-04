# Vibe Coding Production Kit — الدليل العربي

> ابنِ بالذكاء الاصطناعي كفريق هندسي، لا كمحادثة طويلة.

**Vibe Coding Production Kit (VCP)** هو نظام تشغيل هندسي وCLI خفيف لبناء البرمجيات بالـAI من الفكرة إلى الإنتاج، ثم الاستمرار في تطوير المشروع وترقية نظام VCP نفسه بأمان.

بدلاً من أن يكون الـPrompt هو مصدر الحقيقة، يجعل VCP المستودع نفسه هو مصدر الحقيقة: مواصفات، معمارية، Tasks محددة، قواعد للوكلاء، بوابات جاهزية، أمن، Verification Evidence، مراجعة مستقلة، CI، ثم lifecycle updates قابلة للمراجعة والاسترجاع.

يعمل مع Codex وClaude Code وCursor وGitHub Copilot وأدوات البرمجة الوكيلة الأخرى، بدون ربط المنهج بموديل واحد.

## تشغيل خلال دقيقة

الحزمة الرسمية منشورة على npm، وهذا هو المسار الأساسي:

```bash
npx vibe-coding-production init . --agent all --stack auto --yes
```

أو لمشروع آخر:

```bash
npx vibe-coding-production init ./my-app --agent claude --stack auto --yes
```

للمعاينة بدون كتابة أي ملف:

```bash
npx vibe-coding-production init . --agent all --stack auto --dry-run
```

إذا أردت تشغيل المصدر الحالي من GitHub بدلاً من الحزمة المنشورة:

```bash
npx --yes github:Moeeryani/Vibe-Coding-Production-Kit \
  init . --agent all --stack auto --yes
```

المتطلبات: **Node.js 22+**. الـCLI لا يملك runtime dependencies خارجية، ويستطيع اكتشاف JavaScript/Node.js وTypeScript وPython وGo من أدلة المستودع.

إذا كانت هذه أول مرة تستخدم المشروع، ابدأ من [`docs/QUICKSTART.md`](docs/QUICKSTART.md).

## استخدم VCP من خلال الـAI Agent

VCP ليس مصمماً ليحوّل المطور إلى شخص يملأ عشرات ملفات Markdown. الاستخدام الأفضل هو أن تجعل Claude Code أو Codex أو Cursor أو أي Coding Agent متوافق يقود VCP نيابة عنك.

بعد التهيئة قل للوكيل مثلاً:

```text
جهّز هذا المستودع للعمل باستخدام VCP. افحص الكود الحالي وpackage scripts
والاختبارات والمعمارية والتوثيق. اكتب مسودات Source of Truth من أدلة المستودع.
فرّق بين الحقائق المكتشفة والقرارات المقترحة والقرارات التي تحتاج نية بشرية.
اسألني فقط عن القرارات التي لا يمكن استنتاجها بأمان. ثم شغّل VCP Doctor.
```

وعند طلب Feature:

```text
استخدم VCP وأضف تغيير البريد بعد التحقق منه. أنشئ الـTask وحدد القبول والنطاق
والمخاطر والاختبارات، شغّل readiness، واسألني فقط عن قرارات المنتج غير المحسومة،
ثم خطط ونفّذ وتحقق وراجع النتيجة.
```

التقسيم المطلوب هو:

```text
الـAI يفحص ويكتب المسودات ويشغّل أوامر VCP.
الإنسان يحدد نية المنتج والقرارات والمفاضلات المهمة.
VCP يحفظ هذه القرارات ويمنع التنفيذ غير الجاهز ويوثق التحقق.
```

## لماذا هذا مختلف عن Vibe Coding العادي؟

الـVibe Coding العادي غالباً ينجح في أول Demo، لكنه يبدأ بالتدهور عندما يصل المشروع إلى عشرات Features، أكثر من مطور، migrations، production incidents، security reviews، refactors، وترقيات مستمرة.

| Vibe Coding عادي | Vibe Coding Production Kit |
| --- | --- |
| الـPrompt هو المرجع | ملفات المستودع هي Source of Truth |
| “ابنِ التطبيق” | Tasks صغيرة ومحددة |
| يبدأ الوكيل بالكود فوراً | Readiness + plan-before-code |
| “الاختبارات يجب أن تعمل” | Verification Evidence منفذة فعلياً |
| نفس الوكيل يبني ويراجع | Independent Review |
| نسخ Templates مرة واحدة | Lifecycle state وإصدارات قابلة للترقية |
| إعادة نسخ الملفات عند التحديث | Baselines + merge + migrations + rollback |
| Production بعد التفكير في النهاية | Security/observability/recovery من البداية |

## المسار اليومي

ما يفترض أن يراه المطور:

```text
يصف المطلوب
  ↓
يجيب فقط عن القرارات البشرية غير المحسومة
  ↓
يراجع ويوافق على الخطة
  ↓
يراجع النتيجة وVerification Evidence
```

أما الوكيل فينفذ خلف ذلك:

```text
inspect / init
  ↓
task
  ↓
ready --stage plan
  ↓
context --mode plan
  ↓
plan
  ↓
ready --stage implement
  ↓
context --mode implement
  ↓
implement
  ↓
verify
  ↓
independent review
  ↓
doctor
  ↓
release / observe
```

وعند صدور VCP أحدث:

```text
update --check
  ↓
update --dry-run
  ↓
حل أي conflict
  ↓
update
  ↓
doctor
```

## التحديثات الآمنة — v0.9

ابتداءً من v0.9، ينشئ `vcp init` حالة lifecycle داخل:

```text
.vcp/
├── manifest.json
└── baselines/
```

يسجل الـmanifest إصدار VCP المثبت، إعدادات التهيئة، الملفات التي يديرها VCP، سياسة كل ملف، والبصمة والـbaseline الأصلية.

بعد ذلك لا يسمح VCP بإعادة تهيئة المشروع فوق هذه الحالة حتى مع `init --force`. الترقية تمر عبر update engine:

```bash
vcp update . --check
vcp update . --dry-run
vcp update .
```

الـdry-run يصنف الملفات إلى حالات واضحة مثل:

```text
NOOP
ADD
UPDATE
MERGE
RENAME
DELETE
ADOPT
DETACH
PRESERVE
IGNORED
CONFLICT
```

إذا وجد أي `CONFLICT`، يتوقف التطبيق قبل تعديل ملفات المشروع.

### كيف يحمي تعديلاتك؟

VCP يقارن ثلاث نسخ:

```text
baseline = النسخة التي ثبتها VCP سابقاً
local    = نسخة المشروع الحالية
target   = Template الإصدار الجديد
```

إذا كانت التعديلات مستقلة يمكن دمجها تلقائياً. إذا تداخلت، تصبح `CONFLICT` بدلاً من اختيار نسخة عشوائياً.

كما أن الملفات ليست كلها متساوية:

- `managed`: يمكن تحديثها ودمجها عندما يكون ذلك آمناً.
- `generated`: ملفات adapters مولدة؛ التعديل المحلي + upstream يصبح conflict.
- `preserve`: ملفات قرارات المشروع مثل PRD/Architecture؛ بعد تخصيصها لا يستبدلها VCP بقالب جديد.
- `ignored`: ملفات أخرجها المستخدم صراحة من إدارة VCP.

### الاسترجاع

كل update فعلي يستخدم lock وtransaction state وbackup قبل التطبيق، ثم يتحقق من النتيجة بعد الكتابة.

```bash
vcp rollback .
```

v0.9 يتعمد دعم أحدث recovery point الآمن فقط، أو الـbackup المرتبط بمعاملة update متوقفة. لا يدّعي أن backup قديم جزئي يمثل Snapshot كاملة للمشروع.

### إدارة ملف واحد

```bash
vcp manage ignore AGENTS.md
vcp manage track AGENTS.md
```

`ignore` يفصل الملف عن إدارة VCP بدون حذف محتواه المحلي. `track` يعيده للإدارة. أوامر manage وupdate وrollback تستخدم نفس lifecycle lock حتى لا تتسابق على manifest والباسلاين.

التفاصيل الكاملة في [`docs/UPDATES.md`](docs/UPDATES.md) و[`docs/CLI.md`](docs/CLI.md).

## فحص المشروع بـDoctor

```bash
vcp doctor .
```

لا يعطي Doctor “درجة سحرية”، بل يعرض `PASS / WARN / FAIL` مع سبب وطريقة إصلاح.

يفحص مثلاً:

- `AGENTS.md` وأوامر التحقق؛
- Source of Truth؛
- القوالب التي ما زالت غير مخصصة؛
- CI والـplan/review loop؛
- VCP manifest؛
- توافق الإصدار؛
- baseline integrity؛
- interrupted/corrupt update transaction.

استخدم `--json` للأتمتة و`--strict` لجعل التحذيرات تعطي exit code غير صفري.

## أنشئ Task محددة قبل الكود

```bash
vcp task accept-invite --title "Accept invitation"
```

ينشئ `docs/tasks/accept-invite.md` ويضع فيه:

- Source of Truth؛
- Acceptance Criteria؛
- In Scope / Out of Scope؛
- Architecture/Data/Integration boundaries؛
- Security/Privacy؛
- Edge cases وفشل متوقع؛
- Observability؛
- Test plan؛
- Rollout/Recovery؛
- Implementation plan؛
- Independent review checklist؛
- أوامر التحقق الفعلية من `AGENTS.md`.

لكن المقصود ليس أن يفتح المطور الملف ويملأه يدوياً. الـAI Agent هو الذي يكتب المسودة من أدلة المشروع، ثم يعرض فقط القرارات التي تحتاج موافقة بشرية.

كما أن القيم مثل:

```text
E2E_COMMAND=n/a — لا توجد واجهة E2E في هذا المشروع
```

تُعامل كقرار non-applicable ولا تتحول إلى shell command داخل الـTask.

## افصل الجاهزية للتخطيط عن الجاهزية للتنفيذ

```bash
vcp ready accept-invite --stage plan
vcp ready accept-invite --stage implement
```

`plan` يتأكد أن المشكلة والنطاق ومعايير القبول ومصادر الحقيقة جاهزة، ويرفض أيضاً تكرار أقسام الـTask بشكل يجعل parsing غامضاً.

إذا كانت ملفات Source of Truth المشار إليها ما زالت Starter Templates، يظهر ذلك كـ`WARN` حتى لا يتعامل النظام مع وجود ملف فارغ كأنه قرار مشروع حقيقي.

`implement` أكثر صرامة، ويشترط أيضاً حسم الحدود المعمارية، invariants، الأمن والخصوصية، الحالات السلبية، observability، الاختبارات، rollout/recovery، وخطة تنفيذ فعلية، بالإضافة إلى Verification Plan قابلة للتنفيذ.

هذا يمنع الحالة التي يكون فيها:

```text
ready --stage implement = PASS
```

ثم يفشل `vcp verify` لأنه لا يملك أي أوامر تحقق فعلية.

## أعطِ الـAI أقل Context كافٍ

```bash
vcp context accept-invite --mode plan
```

ثم استخدم:

```text
implement
review
security
release
```

كـmodes حسب المرحلة.

بدلاً من إرسال المستودع كله إلى الوكيل، يجمع VCP الـTask و`AGENTS.md` وPrompt المرحلة وSource of Truth فقط، ويمكن إضافة ملفات التنفيذ صراحة عبر `--include`.

## حوّل “شغلت الاختبارات” إلى Evidence

اعرض ما سيتم تشغيله أولاً:

```bash
vcp verify accept-invite
```

التنفيذ يحتاج موافقة صريحة:

```bash
vcp verify accept-invite --run \
  --output .vcp/evidence/accept-invite.json
```

يرفض التنفيذ إذا لم تجتز الـTask `ready --stage implement`.

الأوامر تعمل بالتسلسل وتتوقف عند أول فشل. الـEvidence يسجل الأمر والحالة وexit code والـsignal والـtimeout والمدة، لكنه لا يحفظ stdout/stderr افتراضياً لتقليل خطر تسريب secrets أو PII.

## مثال تطبيقي مكتمل

راجع:

[`examples/reference-saas-invite/`](examples/reference-saas-invite/)

وهو Vertical Slice لدعوة أعضاء في SaaS متعدد المستأجرين، ويحتوي Product Brief وPRD وUser Flows وDomain/Data/Architecture وADR وThreat Model وTest Strategy وTask محددة وكود واختبارات للحالات السلبية مثل:

- cross-tenant access؛
- replay؛
- expired tokens؛
- email mismatch؛
- authorization boundaries.

```bash
cd examples/reference-saas-invite
npm test
npm run check
```

المثال يذكر صراحة ما لم يتم إثباته على مستوى البنية التحتية الحقيقية، بدلاً من وصف Demo بأنه Production-ready.

## المبدأ الأساسي

**لا تطلب من الـAI أن يبني المشروع؛ ابنِ نظاماً يجعل من الصعب عليه أن يبنيه بطريقة خاطئة.**

الإنسان يملك النية والقرارات والمفاضلات والمخاطر. والـAI يتولى ما يمكنه اكتشافه وصياغته بأمان: فحص المشروع، كتابة المسودات، التخطيط، التنفيذ، الاختبار، المراجعة، التوثيق والأتمتة داخل حدود واضحة.

القاعدة العملية:

> لا تطلب من المطور كتابة معلومة يستطيع الوكيل اكتشافها أو صياغة مسودة موثوقة لها. اسأل المطور فقط عندما تكون الإجابة قرار منتج أو هندسة يحتاج نية بشرية.

## دورة المشروع الكاملة

```text
الفكرة
  -> Product Brief
  -> PRD + Acceptance Criteria
  -> User Flows
  -> Domain Model
  -> Architecture + ADRs
  -> Data Model
  -> Threat Model
  -> Test Strategy
  -> Epics / Stories / Bounded Tasks
  -> Readiness Gate
  -> Plan Before Code
  -> Implementation
  -> Verification Evidence
  -> Independent Review
  -> CI Gates
  -> Release + Observability
  -> Safe VCP Updates
  -> تحديث Source of Truth
```

## أهم ما يوفره المشروع

- `AGENTS.md`: قواعد المستودع وبروتوكول AI-first لوكلاء البرمجة.
- Product/PRD/User Flow templates.
- Domain/Architecture/Data/ADR templates.
- Threat Model وTest Strategy.
- Definition of Ready / Definition of Done.
- `vcp task` لإنشاء مهام محددة.
- `vcp ready` لبوابات الجاهزية.
- `vcp context` لبناء سياق محدود.
- `vcp verify` لإثبات التحقق.
- `vcp doctor` لفحص النظام.
- `vcp update` للترقيات الآمنة.
- Prompts مستقلة للتخطيط والتنفيذ والمراجعة والأمن والإطلاق.
- GitHub Issue/PR templates وvalidation workflow.

## أنشئ Source of Truth بمساعدة الوكيل

هذه هي الملفات الأساسية التي يديرها VCP:

1. `docs/product/PRODUCT-BRIEF.md`
2. `docs/product/PRD.md`
3. `docs/product/USER-FLOWS.md`
4. `docs/architecture/DOMAIN.md`
5. `docs/architecture/ARCHITECTURE.md`
6. `docs/architecture/DATA-MODEL.md`
7. `docs/security/THREAT-MODEL.md`
8. `docs/testing/TEST-STRATEGY.md`

**هذه ليست قائمة Form يجب على المطور تعبئتها يدوياً.** دع الـAI Agent يفحص المشروع ويكتب المسودات من الأدلة الموجودة، ثم راجع القرارات التي تحتاج نيتك البشرية فقط. كذلك يجب أن يستخرج `AGENTS.md` أوامر install/lint/check/typecheck/tests/build/E2E من المشروع عندما تكون موجودة، ويترك ما لا يستطيع إثباته واضحاً بدلاً من اختراعه.

## قواعد لا نتنازل عنها

- لا Feature بدون Acceptance Criteria واضحة.
- لا قرار معماري مهم يبقى داخل Chat فقط.
- لا Task ضخمة وغير محددة للـAI.
- لا تبدأ implementation قبل readiness والخطة.
- لا تثق بعبارة “Everything should work”؛ التحقق المنفذ هو الحكم.
- لا Authorization في الواجهة فقط.
- لا Migration إنتاجية بدون مراجعة وrollback thinking.
- لا Refactor غير مرتبط داخل Feature PR.
- لا تعتمد على الوكيل الذي كتب الكود كمراجع وحيد.
- لا Upgrade عبر نسخ Templates فوق تعديلات المشروع.
- أي نظام Production يجب أن يكون قابلاً للمراقبة والتشخيص والاسترجاع.
- لا تجعل المطور يكتب يدوياً ما يستطيع الوكيل اكتشافه أو صياغة مسودته بأمان.

## Roadmap

- [x] CLI bootstrap
- [x] JavaScript/TypeScript/Python/Go stack profiles
- [x] Task Packs
- [x] Readiness Gates
- [x] Context Packs
- [x] Verification Evidence
- [x] Doctor
- [x] Reference vertical slice
- [x] Versioned lifecycle state
- [x] Safe `vcp update`
- [x] Three-way merge + migrations + backup/rollback + manage
- [ ] Mobile stack profiles
- [x] Monorepo/project evidence semantics
- [x] Project-sensitive security profiles
- [ ] Git-aware review/release automation
- [ ] Prompt evaluation suite
- [ ] Architecture fitness functions
- [ ] Community profile/plugin system

## الترخيص

MIT — يمكنك استخدامه في المشاريع الشخصية والتجارية ومشاريع المصادر المفتوحة.
