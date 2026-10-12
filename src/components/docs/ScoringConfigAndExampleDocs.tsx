import React from 'react';
import { DocSection, DocSubSection, DocParagraph, DocTable, DocList, DocAlert } from '@/components/docs/DocSection';
import { useLanguage } from '@/i18n/LanguageContext';

const ScoringConfigAndExampleDocs: React.FC = () => {
  const { t } = useLanguage();
  return (
    <>
      {/* ===== PHẦN A: Scoring Config V1 ===== */}
      <DocSection id="scoring-config" title={t('sceConfigTitle')}>
        <DocParagraph>{t('sceConfigPara')}</DocParagraph>

        <pre className="bg-slate-950 text-slate-50 rounded-lg p-4 text-xs sm:text-sm overflow-x-auto my-4 font-mono leading-relaxed">
{`rule_version: "LS-Math-v1.0"

weights:
  base_action_weight: 0.4
  content_weight: 0.6

reputation:
  alpha: 0.25
  w_min: 0.5
  w_max: 2.0

content:
  gamma: 1.3
  type_multiplier:
    post: 1.0
    comment: 0.6
    video: 1.2
    course: 1.5
    bug_report: 1.1
    proposal: 1.3

consistency:
  beta: 0.6
  lambda: 30

sequence:
  eta: 0.5
  kappa: 5

penalty:
  theta: 0.8
  max_penalty: 0.5

mint:
  epoch_type: "monthly"
  anti_whale_cap: 0.03
  min_light_threshold: 10`}
        </pre>

        <DocSubSection title={t('sceParamsTitle')}>
          <DocTable
            headers={[t('sceColGroup'), t('sceColParam'), t('idocColValue'), t('pdocColMeaning')]}
            rows={[
              ['weights', 'base_action_weight', '0.4', t('sceParam1')],
              ['weights', 'content_weight', '0.6', t('sceParam2')],
              ['reputation', 'alpha', '0.25', t('sceParam3')],
              ['reputation', 'w_min / w_max', '0.5 / 2.0', t('sceParam4')],
              ['content', 'gamma', '1.3', t('sceParam5')],
              ['consistency', 'beta', '0.6', t('sceParam6')],
              ['consistency', 'lambda', '30', t('sceParam7')],
              ['sequence', 'eta', '0.5', t('sceParam8')],
              ['sequence', 'kappa', '5', t('sceParam9')],
              ['penalty', 'theta', '0.8', t('sceParam10')],
              ['penalty', 'max_penalty', '0.5', t('sceParam11')],
              ['mint', 'anti_whale_cap', '0.03', t('sceParam12')],
              ['mint', 'min_light_threshold', '10', t('sceParam13')],
            ]}
          />
        </DocSubSection>
      </DocSection>

      {/* ===== PHẦN B: End-to-End Example ===== */}
      <DocSection id="e2e-example" title={t('sceE2eTitle')}>
        <DocAlert type="info">
          {t('sceE2eAlertA')}<strong>u_ly</strong>{t('sceE2eAlertB')}
        </DocAlert>

        <DocSubSection title={t('sceActivityTitle')}>
          <DocList items={[
            t('sceAct1'),
            t('sceAct2'),
            t('sceAct3'),
            t('sceAct4'),
          ]} />
        </DocSubSection>

        {/* Bước 1: Content Score */}
        <DocSubSection title={t('sceStep1')}>
          <DocParagraph>
            {t('sceFormulaIntro')}<code className="bg-muted px-2 py-1 rounded text-sm font-mono">h(P_c) = (P_c / 10)^γ</code>{t('sceFormulaWith')}
          </DocParagraph>
          <DocTable
            headers={[t('sceColPost'), t('sceColRatingTotal'), t('sceColNormalized'), 'h(P_c) = x^1.3', t('sceColResult')]}
            rows={[
              ['Post 1', '8.5', '0.85', '(0.85)^1.3', '≈ 0.80'],
              ['Post 2', '7.2', '0.72', '(0.72)^1.3', '≈ 0.65'],
              ['Post 3', '9.0', '0.90', '(0.90)^1.3', '≈ 0.88'],
            ]}
          />
          <div className="bg-muted rounded-lg p-4 my-4 border-l-4 border-primary">
            <p className="font-mono text-sm text-foreground font-semibold">
              C = 0.80 + 0.65 + 0.88 = 2.33
            </p>
          </div>
        </DocSubSection>

        {/* Bước 2: Base Action Score */}
        <DocSubSection title={t('sceStep2')}>
          <DocTable
            headers={[t('sceColAction'), t('sceColPoints')]}
            rows={[
              [t('sceB1'), '3.0'],
              [t('sceB2'), '5.0'],
              [t('sceB3'), '2.0'],
            ]}
          />
          <div className="bg-muted rounded-lg p-4 my-4 border-l-4 border-primary">
            <p className="font-mono text-sm text-foreground font-semibold">
              B = 3.0 + 5.0 + 2.0 = 10
            </p>
          </div>
        </DocSubSection>

        {/* Bước 3: Raw Score */}
        <DocSubSection title={t('sceStep3')}>
          <div className="bg-muted rounded-lg p-4 my-4 border-l-4 border-primary">
            <p className="font-mono text-sm text-foreground font-semibold">
              L_raw = 0.4 × B + 0.6 × C = 0.4 × 10 + 0.6 × 2.33 = 4 + 1.398 = 5.398
            </p>
          </div>
        </DocSubSection>

        {/* Bước 4: Consistency Multiplier */}
        <DocSubSection title={t('sceStep4')}>
          <DocParagraph>
            {t('sceFormulaIntro')}<code className="bg-muted px-2 py-1 rounded text-sm font-mono">M_cons = 1 + β(1 − e^(−streak/λ))</code>
          </DocParagraph>
          <DocTable
            headers={[t('sceColParam'), t('idocColValue'), t('sceColCalcWork')]}
            rows={[
              ['β (beta)', '0.6', ''],
              ['λ (lambda)', '30', ''],
              ['streak', t('sceStreakVal'), ''],
              ['e^(−30/30)', '', 'e^(−1) ≈ 0.367'],
              ['1 − 0.367', '', '0.633'],
              ['0.6 × 0.633', '', '0.379'],
            ]}
          />
          <div className="bg-muted rounded-lg p-4 my-4 border-l-4 border-primary">
            <p className="font-mono text-sm text-foreground font-semibold">
              M_cons = 1 + 0.379 = 1.379
            </p>
          </div>
        </DocSubSection>

        {/* Bước 5: Sequence Multiplier */}
        <DocSubSection title={t('sceStep5')}>
          <DocParagraph>
            {t('sceFormulaIntro')}<code className="bg-muted px-2 py-1 rounded text-sm font-mono">M_seq = 1 + η × tanh(bonus/κ)</code>
          </DocParagraph>
          <DocTable
            headers={[t('sceColParam'), t('idocColValue'), t('sceColCalcWork')]}
            rows={[
              ['η (eta)', '0.5', ''],
              ['κ (kappa)', '5', ''],
              ['Mentor chain bonus', '3', ''],
              ['tanh(3/5)', '', 'tanh(0.6) ≈ 0.537'],
              ['0.5 × 0.537', '', '0.268'],
            ]}
          />
          <div className="bg-muted rounded-lg p-4 my-4 border-l-4 border-primary">
            <p className="font-mono text-sm text-foreground font-semibold">
              M_seq = 1 + 0.268 = 1.268
            </p>
          </div>
        </DocSubSection>

        {/* Bước 6: Integrity Penalty */}
        <DocSubSection title={t('sceStep6')}>
          <DocParagraph>
            {t('sceFormulaIntro')}<code className="bg-muted px-2 py-1 rounded text-sm font-mono">Penalty = 1 − min(max_penalty, θ × risk)</code>
          </DocParagraph>
          <DocTable
            headers={[t('sceColParam'), t('idocColValue'), t('sceColCalcWork')]}
            rows={[
              ['θ (theta)', '0.8', ''],
              ['max_penalty', '0.5', ''],
              ['risk', '0.1', ''],
              ['θ × risk', '', '0.8 × 0.1 = 0.08'],
              ['min(0.5, 0.08)', '', '0.08'],
            ]}
          />
          <div className="bg-muted rounded-lg p-4 my-4 border-l-4 border-primary">
            <p className="font-mono text-sm text-foreground font-semibold">
              Integrity Factor = 1 − 0.08 = 0.92
            </p>
          </div>
        </DocSubSection>

        {/* Bước 7: Final Light Score */}
        <DocSubSection title={t('sceStep7')}>
          <DocTable
            headers={[t('sceColStep'), t('sceColCalc'), t('sceColResult')]}
            rows={[
              ['L_raw × M_cons', '5.398 × 1.379', '≈ 7.44'],
              ['× M_seq', '7.44 × 1.268', '≈ 9.43'],
              ['× Integrity', '9.43 × 0.92', '≈ 8.67'],
            ]}
          />
          <div className="bg-muted rounded-lg p-4 my-4 border-l-4 border-primary">
            <p className="font-mono text-base text-foreground font-bold">
              {t('sceFinalResult')}
            </p>
          </div>
        </DocSubSection>

        {/* Phần C: Mint Calculation */}
        <DocSubSection title="Mint Calculation">
          <DocTable
            headers={[t('sceColMetric'), t('idocColValue'), t('pmdColNote')]}
            rows={[
              ['User Light Score', '8.67', ''],
              [t('sceMintTotal'), '10,000', ''],
              ['Share', '8.67 / 10,000 = 0.000867', ''],
              ['Mint Pool', '100,000 FUN', t('sceMintNote1')],
              ['Allocation', '100,000 × 0.000867', '= 86.7 FUN'],
              ['Anti-Whale Cap (3%)', '3,000 FUN', '86.7 < 3,000 → ✅ OK'],
            ]}
          />
          <DocAlert type="success">
            {t('sceMintAlertA')}<strong>86.7 FUN</strong>{t('sceMintAlertB')}
          </DocAlert>
        </DocSubSection>
      </DocSection>

      {/* ===== PHẦN D: Unit Test Cases ===== */}
      <DocSection id="unit-test-cases" title={t('sceTestsTitle')}>
        <DocParagraph>{t('sceTestsPara')}</DocParagraph>

        <DocSubSection title="Test 1 — Spam Burst">
          <DocTable
            headers={[t('sceColItem'), t('adocColDetail')]}
            rows={[
              [t('sceLblScenario'), t('sceT1Scenario')],
              [t('sceLblFormula'), t('sceT1Formula')],
              [t('sceLblExpected'), t('sceT1Expected')],
              [t('idocColReason'), t('sceT1Reason')],
            ]}
          />
        </DocSubSection>

        <DocSubSection title="Test 2 — Viral Drama">
          <DocTable
            headers={[t('sceColItem'), t('adocColDetail')]}
            rows={[
              [t('sceLblScenario'), t('sceT2Scenario')],
              [t('sceLblFormula'), t('sceT2Formula')],
              [t('sceLblExpected'), t('sceT2Expected')],
              [t('idocColReason'), t('sceT2Reason')],
            ]}
          />
        </DocSubSection>

        <DocSubSection title="Test 3 — Silent Consistent Contributor">
          <DocTable
            headers={[t('sceColItem'), t('adocColDetail')]}
            rows={[
              [t('sceLblScenario'), t('sceT3Scenario')],
              ['Consistency', 'M_cons = 1 + 0.6(1 − e^(−60/30)) = 1 + 0.6(0.865) ≈ 1.519'],
              [t('sceLblExpected'), t('sceT3Expected')],
              [t('idocColReason'), t('sceT3Reason')],
            ]}
          />
        </DocSubSection>

        <DocSubSection title="Test 4 — Rating Ring">
          <DocTable
            headers={[t('sceColItem'), t('adocColDetail')]}
            rows={[
              [t('sceLblScenario'), t('sceT4Scenario')],
              [t('sceLblDetection'), t('sceT4Detection')],
              [t('sceLblExpected'), t('sceT4Expected')],
              [t('idocColReason'), t('sceT4Reason')],
            ]}
          />
        </DocSubSection>
      </DocSection>

      {/* ===== PHẦN E: System Guarantees ===== */}
      <DocSection id="system-guarantees" title={t('sceGuaranteesTitle')}>
        <DocList items={[
          t('sceG1'),
          t('sceG2'),
          t('sceG3'),
          t('sceG4'),
          t('sceG5'),
          t('sceG6'),
        ]} />
        <DocAlert type="success">
          {t('sceGAlert')}
        </DocAlert>
      </DocSection>
    </>
  );
};

export default ScoringConfigAndExampleDocs;
