import { DocSection, DocSubSection, DocParagraph, DocList, DocAlert, DocTable } from './DocSection';
import { useLanguage } from '@/i18n/LanguageContext';

const PplpMintAndDbDocs = () => {
  const { t } = useLanguage();
  return (
    <>
      {/* ===== PHẦN A: CƠ CHẾ TÍNH THƯỞNG & MINT FUN MONEY ===== */}
      <DocSection id="pplp-mint-mechanism" title={t('pmdMintTitle')}>
        <DocParagraph>{t('pmdMintIntro')}</DocParagraph>

        <DocSubSection title={t('pmdLayersTitle')}>
          <DocTable
            headers={[t('pmdColLayer'), t('pdocColRole'), t('pdocColDesc')]}
            rows={[
              ['Light Score', t('pmdLayer1Role'), t('pmdLayer1Desc')],
              ['Mint Eligibility', t('pmdLayer2Role'), t('pmdLayer2Desc')],
              ['FUN Money Mint Flow', t('pmdLayer3Role'), t('pmdLayer3Desc')],
            ]}
          />
        </DocSubSection>

        <DocSubSection title={t('pmdFormulaTitle')}>
          <div className="bg-muted rounded-lg p-4 my-4 border-l-4 border-primary">
            <p className="font-mono text-sm sm:text-base text-foreground font-semibold leading-relaxed">
              {t('pmdFormulaScoreL1')}<br />
              &nbsp;&nbsp;× Reputation Weight<br />
              &nbsp;&nbsp;× Consistency Multiplier<br />
              &nbsp;&nbsp;× Sequence Multiplier<br />
              &nbsp;&nbsp;− Integrity Penalty
            </p>
          </div>
        </DocSubSection>

        <DocSubSection title="1️⃣ Reputation Weight">
          <DocParagraph>{t('pmdRepPara')}</DocParagraph>
          <DocList items={[
            t('pmdRep1'),
            t('pmdRep2'),
            t('pmdRep3'),
            'Cross-platform contribution',
          ]} />
          <DocAlert type="warning">
            {t('pmdRepAlert')}
          </DocAlert>
        </DocSubSection>

        <DocSubSection title="2️⃣ Consistency Multiplier">
          <DocParagraph>{t('pmdConsPara')}</DocParagraph>
          <DocTable
            headers={[t('pmdColLevel'), t('pmdColFactor')]}
            rows={[
              [t('pmdConsR1'), '×1.0'],
              [t('pmdConsR2'), '×1.3'],
              [t('pmdConsR3'), '×1.6'],
            ]}
          />
        </DocSubSection>

        <DocSubSection title="3️⃣ Sequence Multiplier">
          <DocParagraph>{t('pmdSeqPara')}</DocParagraph>
          <pre className="bg-muted rounded-lg p-4 text-xs sm:text-sm overflow-x-auto my-4 text-foreground font-mono leading-relaxed">
{t('pmdSeqChain')}
          </pre>
        </DocSubSection>

        <DocSubSection title="4️⃣ Integrity Penalty">
          <DocParagraph>{t('pmdIntPara')}</DocParagraph>
          <DocAlert type="info">
            {t('pmdIntAlert')}
          </DocAlert>
        </DocSubSection>

        <DocSubSection title={t('pmdMintEpochTitle')}>
          <DocParagraph>{t('pmdMintEpochPara')}</DocParagraph>
          <DocList ordered items={[
            t('pmdMintEpoch1'),
            t('pmdMintEpoch2'),
            t('pmdMintEpoch3'),
          ]} />

          <div className="bg-muted rounded-lg p-4 my-4 border-l-4 border-primary">
            <p className="font-mono text-sm sm:text-base text-foreground font-semibold">
              {t('pmdFormulaMinted')}
            </p>
          </div>

          <DocAlert type="success">
            {t('pmdMintEpochAlert')}
          </DocAlert>
        </DocSubSection>

        <DocSubSection title={t('pmdCompareTitle')}>
          <DocTable
            headers={['', 'Light Score', 'FUN Money']}
            rows={[
              [t('pmdNature'), t('pmdNatureLs'), t('pmdNatureFm')],
              [t('pdocColPurpose'), t('pmdPurposeLs'), t('pmdPurposeFm')],
              [t('pmdDisplay'), t('pmdDisplayLs'), t('pmdDisplayFm')],
            ]}
          />
        </DocSubSection>
      </DocSection>

      {/* ===== BẢO VỆ CHỐNG EGO ===== */}
      <DocSection id="pplp-ego-protection" title={t('pmdEgoTitle')}>
        <DocSubSection title={t('pmdEgo1Title')}>
          <DocParagraph>{t('pmdEgo1Para')}</DocParagraph>
        </DocSubSection>

        <DocSubSection title={t('pmdEgo2Title')}>
          <DocParagraph>{t('pmdEgo2Para')}</DocParagraph>
          <DocList items={[
            t('pmdEgo2Item1'),
            t('pmdEgo2Item2'),
            t('pmdEgo2Item3'),
            t('pmdEgo2Item4'),
          ]} />
        </DocSubSection>

        <DocSubSection title={t('pmdEgo3Title')}>
          <DocParagraph>{t('pmdEgo3Para')}</DocParagraph>
        </DocSubSection>

        <DocSubSection title={t('pmdTokenTitle')}>
          <DocTable
            headers={['Token', t('pmdColMetaphor'), t('pdocColRole')]}
            rows={[
              ['FUN Money', t('pmdSun'), t('pmdSunRole')],
              ['Camly Coin', t('pmdWater'), t('pmdWaterRole')],
            ]}
          />
          <DocAlert type="info">
            {t('pmdTokenAlert')}
          </DocAlert>
        </DocSubSection>
      </DocSection>

      {/* ===== 8 CÂU THẦN CHÚ ===== */}
      <DocSection id="pplp-mantras" title={t('pmdMantrasTitle')}>
        <DocList ordered items={[
          t('lawMantra1'),
          t('lawMantra2'),
          t('lawMantra3'),
          t('lawMantra4'),
          t('lawMantra5'),
          t('lawMantra6'),
          t('lawMantra7'),
          t('lawMantra8'),
        ]} />
        <DocAlert type="success">
          {t('pmdMantrasAlert')}
        </DocAlert>
      </DocSection>

      {/* ===== PHẦN B: THIẾT KẾ LOGIC DB ===== */}
      <DocSection id="db-logic-design" title={t('pmdDbTitle')}>
        <DocSubSection title={t('pmdDbPrinTitle')}>
          <DocList items={[
            t('pmdDbPrin1'),
            'Pipeline — Ingest → Validate → Feature → Score → Mint Eligibility',
            t('pmdDbPrin3'),
            t('pmdDbPrin4'),
          ]} />
        </DocSubSection>

        <DocSubSection title={t('pmdDbTablesTitle')}>
          <DocTable
            headers={['#', t('edocColTable'), t('pdocColDesc'), t('pmdColNote')]}
            rows={[
              ['1', 'users', t('pmdDbT1'), 'wallet_address, kyc_status, status'],
              ['2', 'profiles', t('pmdDbT2'), 'completion_pct, pplp_accepted_at, reputation_level'],
              ['3', 'content', t('pmdDbT3'), 'type, root_content_id, metadata_json'],
              ['4', 'events ★', t('pmdDbT4'), 'event_type, actor, target, payload_json, ingest_hash'],
              ['5', 'pplp_ratings', t('pmdDbT5'), 'pillar scores 0-2, weight_applied snapshot'],
              ['6', 'signals_anti_farm', t('pmdDbT6'), 'signal_type, severity, evidence_json'],
              ['7', 'features_user_day', t('pmdDbT7'), 'count_posts, consistency_streak, anti_farm_risk'],
              ['8', 'light_score_ledger', t('pmdDbT8'), 'base_score, multipliers, final_light_score, level'],
              ['9', 'score_explanations', t('pmdDbT9'), 'top_contributors_json, penalties_json, version'],
              ['10', 'mint_epochs', t('pmdDbT10'), 'mint_pool_amount, rules_version, status'],
              ['11', 'mint_allocations', t('pmdDbT11'), 'eligible, allocation_amount, onchain_tx_hash'],
            ]}
          />
        </DocSubSection>

        <DocSubSection title={t('pmdDbEventsTitle')}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 my-4">
            {[
              'LOGIN', 'LIGHT_CHECKIN',
              'PROFILE_COMPLETED', 'PPLP_ACCEPTED', 'MANTRA_ACK',
              'POST_CREATED', 'COMMENT_CREATED', 'VIDEO_UPLOADED', 'COURSE_PUBLISHED',
              'LIKE_GIVEN', 'SHARE_GIVEN', 'BOOKMARK_GIVEN',
              'HELP_NEWBIE', 'ANSWER_QUESTION', 'MENTOR_SESSION',
              'REPORT_SUBMITTED', 'MEDIATION_JOINED', 'RESOLUTION_ACCEPTED',
              'DONATION_MADE', 'REWARD_SENT',
              'GOV_VOTE_CAST',
              'BUG_REPORTED', 'PR_MERGED', 'PROPOSAL_SUBMITTED',
              'ONCHAIN_TX_VERIFIED',
              'PPLP_RATING_SUBMITTED',
            ].map((type) => (
              <code key={type} className="bg-muted px-2 py-1 rounded text-xs font-mono text-foreground">
                {type}
              </code>
            ))}
          </div>
        </DocSubSection>

        <DocSubSection title={t('pmdDbRatingsTitle')}>
          <DocTable
            headers={[t('pmdColColumn'), t('pmdColType'), t('pdocColDesc')]}
            rows={[
              ['rating_id', 'UUID (PK)', t('pmdDbR1')],
              ['content_id', 'FK', t('pmdDbR2')],
              ['rater_user_id', 'FK', t('pmdDbR3')],
              ['pillar_truth', '0/1/2', t('pmdDbR4')],
              ['pillar_sustain', '0/1/2', t('pmdDbR5')],
              ['pillar_heal_love', '0/1/2', t('pmdDbR6')],
              ['pillar_life_service', '0/1/2', t('pmdDbR7')],
              ['pillar_unity_source', '0/1/2', t('pmdDbR8')],
              ['weight_applied', 'Float', t('pmdDbR9')],
            ]}
          />
        </DocSubSection>

        <DocSubSection title={t('pmdDbSeqTitle')}>
          <DocTable
            headers={[t('pmdColColumn'), t('pdocColDesc')]}
            rows={[
              ['sequence_id', t('pmdDbS1')],
              ['user_id', t('pmdDbS2')],
              ['sequence_type', 'mentor_chain / value_loop / conflict_harmony...'],
              ['state', 'active / complete / invalid'],
              ['evidence_event_ids', t('pmdDbS5')],
              ['score_bonus', t('pmdDbS6')],
            ]}
          />
          <DocAlert type="info">
            {t('pmdDbSeqAlert')}
          </DocAlert>
        </DocSubSection>
      </DocSection>

      {/* ===== PIPELINE ===== */}
      <DocSection id="db-pipeline" title={t('pmdPipelineTitle')}>
        <pre className="bg-muted rounded-lg p-4 text-xs sm:text-sm overflow-x-auto my-4 text-foreground font-mono leading-relaxed">
{`1. Ingest Events
   → Ghi vao events (append-only)
        ↓
2. Validate
   → Dedupe, signature, policy
   → Flag vao signals_anti_farm neu can
        ↓
3. Feature Builder
   → Cap nhat features_user_day
   → Batch hoac stream processing
        ↓
4. Scoring Engine
   → Ap cong thuc PPLP
   → Ghi light_score_ledger + score_explanations
        ↓
5. Mint Engine (Epoch)
   → Tao mint_epochs + mint_allocations
   → Phan bo theo ty le dong gop
        ↓
6. On-chain Execution
   → Ghi tx hash, finalize
   → Luu onchain_tx_hash vao mint_allocations`}
        </pre>
      </DocSection>

      {/* ===== PHẦN C: KIẾN TRÚC AI ===== */}
      <DocSection id="ai-scoring-arch" title={t('pmdAiTitle')}>
        <DocSubSection title={t('pmdAiOverviewTitle')}>
          <pre className="bg-muted rounded-lg p-4 text-xs sm:text-sm overflow-x-auto my-4 text-foreground font-mono leading-relaxed">
{`Client (Web/Mobile)
      ↓
Event API Gateway
      ↓
Event Store (events, ratings)
      ↓
Stream/Queue (Kafka/PubSub)
      ↓
┌─────────────────────────────────────────────┐
│           4 DICH VU CHINH                   │
├─────────────┬───────────────────────────────┤
│ 1. Policy   │ 2. Content & Pillar          │
│ & Integrity │    Analyzer (A.I.)           │
│             │                               │
│ spam detect │ phan tich 5 tru cot          │
│ ring detect │ phat hien Ego risk           │
│ bot pattern │                               │
│ sybil       │ Output: ai_pillar_scores,    │
│             │ ai_ego_risk, ai_explanations │
│ Output:     │                               │
│ signals_    │                               │
│ anti_farm   │                               │
├─────────────┼───────────────────────────────┤
│ 3. Reputa-  │ 4. Scoring Engine            │
│ tion &      │    (Deterministic) ★         │
│ Weight      │                               │
│             │ feature + weight + penalty    │
│ trust graph │ ap cong thuc PPLP            │
│ contribution│                               │
│ history     │ Output: light_score_ledger,  │
│             │ score_explanations           │
│ Output:     │                               │
│ reputation_ │                               │
│ score,      │                               │
│ weight      │                               │
└─────────────┴───────────────────────────────┘
      ↓
Mint Engine (epoch-based)
      ↓
On-chain Mint Executor
      ↓
Transparency Dashboard
(Level/Trend only — khong khoe diem)`}
          </pre>
        </DocSubSection>

        <DocSubSection title={t('pmdAiKeyTitle')}>
          <DocList items={[
            t('pmdAiKey1'),
            t('pmdAiKey2'),
            t('pmdAiKey3'),
            t('pmdAiKey4'),
          ]} />
        </DocSubSection>

        <DocSubSection title="4 AI Models/Heuristics">
          <DocTable
            headers={['Model', t('pdocColFunc'), 'Output']}
            rows={[
              ['Ego Risk Classifier', t('pmdAiM1'), t('pmdAiM1Out')],
              ['Pillar Support Scorer', t('pmdAiM2'), t('pmdAiM2Out')],
              ['Spam & Fraud Detector', 'Burst pattern, reciprocal rings, temporal anomalies', 'signals_anti_farm records'],
              ['Sybil / Duplicate Signals', 'Device fingerprint + graph + behavior similarity', 'Sybil risk flags'],
            ]}
          />
        </DocSubSection>

        <DocSubSection title={t('pmdAiSchemaTitle')}>
          <DocTable
            headers={[t('pmdColField'), t('pdocColDesc')]}
            rows={[
              ['actor_user_id', t('pmdAiF1')],
              ['action', t('pmdAiF2')],
              ['object', t('pmdAiF3')],
              ['context', 'Session / thread / group ID'],
              ['proof', 'Tx hash / link / attachment / signature'],
              ['timestamp', t('pmdAiF6')],
              ['risk_flags', t('pmdAiF7')],
              ['scoring_tags', 'pplp_pillar_candidate, sequence_candidate...'],
            ]}
          />
        </DocSubSection>
      </DocSection>
    </>
  );
};

export default PplpMintAndDbDocs;
