import { DocSection, DocSubSection, DocParagraph, DocList, DocAlert, DocTable } from '@/components/docs/DocSection';
import { useLanguage } from '@/i18n/LanguageContext';

const ScoringApiAndVersioningDocs = () => {
  const { t } = useLanguage();
  return (
    <>
      {/* ====== SCORING RULE VERSIONING ====== */}
      <DocSection id="scoring-versioning" title="🔄 Scoring Rule Versioning">
        <DocParagraph>{t('savVerPara')}</DocParagraph>

        <DocSubSection title={t('savHistoryTitle')}>
          <DocTable
            headers={['Version', t('savColApplyDate'), t('savColMainChange')]}
            rows={[
              ['v1.0', 'Launch', t('savV1')],
              ['v1.1', 'TBD', t('savV11')],
              ['v2.0', 'TBD', 'AI-assisted pillar scoring, cross-platform weight normalization'],
            ]}
          />
        </DocSubSection>

        <DocSubSection title={t('savMigrationTitle')}>
          <DocParagraph>{t('savMigrationPara')}</DocParagraph>
          <DocList ordered items={[
            t('savMig1'),
            t('savMig2'),
            t('savMig3'),
            t('savMig4'),
          ]} />
          <DocAlert type="info">
            {t('savMigAlert')}
          </DocAlert>
        </DocSubSection>

        <DocSubSection title="Rollback Strategy">
          <DocAlert type="info">
            {t('savRollbackA')}<code>light_score_ledger</code>{t('savRollbackB')}<code>scoring_version</code>{t('savRollbackC')}
          </DocAlert>
          <DocList items={[
            t('savRb1'),
            t('savRb2'),
            t('savRb3'),
          ]} />
        </DocSubSection>

        <DocSubSection title="Schema: scoring_rule_versions">
          <DocTable
            headers={['Field', 'Type', t('pdocColDesc')]}
            rows={[
              ['version_id', 'string (pk)', t('savSch1')],
              ['formula_config_json', 'jsonb', t('savSch2')],
              ['activated_at', 'timestamp', t('savSch3')],
              ['deactivated_at', 'timestamp?', t('savSch4')],
              ['status', 'enum', 'draft | shadow | active | archived'],
              ['changelog', 'text', t('savSch6')],
              ['created_by', 'string', t('savSch7')],
              ['created_at', 'timestamp', t('savSch8')],
            ]}
          />
        </DocSubSection>
      </DocSection>

      {/* ====== API ENDPOINTS ====== */}
      <DocSection id="api-endpoints" title="🔌 API Endpoints (Dev Reference)">
        <DocParagraph>{t('savApiPara')}</DocParagraph>

        <DocSubSection title="1. Event Ingest">
          <DocTable
            headers={[t('savColAttr'), t('adocColDetail')]}
            rows={[
              ['Method', 'POST'],
              ['Path', '/api/v1/events'],
              ['Auth', 'Bearer Token (required)'],
              [t('pdocColDesc'), t('savEp1Desc')],
            ]}
          />
          <DocSubSection title="Request Body">
            <pre className="bg-muted rounded-lg p-4 text-xs sm:text-sm overflow-x-auto my-2 text-foreground font-mono">
{`{
  "actor_user_id": "u123",
  "event_type": "POST_CREATED",
  "target_id": "content_456",
  "context_id": "thread_789",
  "payload": {
    "length": 842,
    "language": "vi"
  }
}`}
            </pre>
          </DocSubSection>
          <DocSubSection title="Response (200)">
            <pre className="bg-muted rounded-lg p-4 text-xs sm:text-sm overflow-x-auto my-2 text-foreground font-mono">
{`{
  "status": "accepted",
  "event_id": "evt_abc123"
}`}
            </pre>
          </DocSubSection>
        </DocSubSection>

        <DocSubSection title="2. Submit PPLP Rating">
          <DocTable
            headers={[t('savColAttr'), t('adocColDetail')]}
            rows={[
              ['Method', 'POST'],
              ['Path', '/api/v1/pplp/rate'],
              ['Auth', 'Bearer Token (required)'],
              [t('pdocColDesc'), t('savEp2Desc')],
            ]}
          />
          <DocSubSection title="Request Body">
            <pre className="bg-muted rounded-lg p-4 text-xs sm:text-sm overflow-x-auto my-2 text-foreground font-mono">
{`{
  "content_id": "content_456",
  "pillar_truth": 2,
  "pillar_sustain": 1,
  "pillar_heal_love": 2,
  "pillar_life_service": 1,
  "pillar_unity_source": 2,
  "comment": "Rất rõ và có trách nhiệm"
}`}
            </pre>
          </DocSubSection>
        </DocSubSection>

        <DocSubSection title="3. Get Light Summary (Public-safe)">
          <DocTable
            headers={[t('savColAttr'), t('adocColDetail')]}
            rows={[
              ['Method', 'GET'],
              ['Path', '/api/v1/light/profile/{user_id}'],
              ['Auth', 'Bearer Token (required)'],
              [t('pdocColDesc'), t('savEp3Desc')],
            ]}
          />
          <DocSubSection title="Response (200)">
            <pre className="bg-muted rounded-lg p-4 text-xs sm:text-sm overflow-x-auto my-2 text-foreground font-mono">
{`{
  "level": "Light Builder",
  "trend": "Growing",
  "consistency_streak": 42,
  "sequence_active": 2
}`}
            </pre>
          </DocSubSection>
          <DocAlert type="warning">
            {t('savEp3Alert')}
          </DocAlert>
        </DocSubSection>

        <DocSubSection title="4. Get Private Score Detail (Self-only)">
          <DocTable
            headers={[t('savColAttr'), t('adocColDetail')]}
            rows={[
              ['Method', 'GET'],
              ['Path', '/api/v1/light/me'],
              ['Auth', t('savEp4Auth')],
              [t('pdocColDesc'), t('savEp4Desc')],
            ]}
          />
          <DocSubSection title="Response (200)">
            <pre className="bg-muted rounded-lg p-4 text-xs sm:text-sm overflow-x-auto my-2 text-foreground font-mono">
{`{
  "period": "2026-W09",
  "final_light_score": 87.4,
  "reputation_weight": 1.3,
  "sequence_multiplier": 1.2,
  "integrity_penalty": 0.05,
  "reason_codes": [
    "CONSISTENCY_STRONG",
    "MENTOR_CHAIN_COMPLETED"
  ]
}`}
            </pre>
          </DocSubSection>
        </DocSubSection>

        <DocSubSection title="5. Mint Epoch Summary">
          <DocTable
            headers={[t('savColAttr'), t('adocColDetail')]}
            rows={[
              ['Method', 'GET'],
              ['Path', '/api/v1/mint/epoch/current'],
              ['Auth', 'Bearer Token (required)'],
              [t('pdocColDesc'), t('savEp5Desc')],
            ]}
          />
          <DocSubSection title="Response (200)">
            <pre className="bg-muted rounded-lg p-4 text-xs sm:text-sm overflow-x-auto my-2 text-foreground font-mono">
{`{
  "epoch_id": "2026-M02",
  "mint_pool": 125000,
  "total_light": 847230,
  "rule_version": "V1.2"
}`}
            </pre>
          </DocSubSection>
        </DocSubSection>

        <DocSubSection title={t('savErrTitle')}>
          <DocTable
            headers={['Code', 'HTTP', t('pdocColDesc')]}
            rows={[
              ['AUTH_REQUIRED', '401', t('savErr1')],
              ['FORBIDDEN', '403', t('savErr2')],
              ['RATE_LIMITED', '429', t('savErr3')],
              ['INVALID_INPUT', '400', t('savErr4')],
              ['NOT_ELIGIBLE', '403', t('savErr5')],
              ['EPOCH_NOT_ACTIVE', '409', t('savErr6')],
            ]}
          />
        </DocSubSection>
      </DocSection>

      {/* ====== REASON CODES MICROCOPY ====== */}
      <DocSection id="reason-codes" title="💬 Reason Codes & Microcopy">
        <DocParagraph>
          {t('savReasonParaA')}<strong>{t('savReasonParaStrong')}</strong>.
        </DocParagraph>

        <DocAlert type="info">
          {t('savReasonAlert')}
        </DocAlert>

        <DocSubSection title={t('savReasonPosTitle')}>
          <DocTable
            headers={['Code', t('savColMicrocopy'), t('pmdColNote')]}
            rows={[
              ['QUALITY_HIGH', t('savRcPos1'), t('savRcPos1Note')],
              ['SEQUENCE_COMPLETE', t('savRcPos2'), t('savRcPos2Note')],
              ['CONSISTENCY_BONUS', t('savRcPos3'), t('savRcPos3Note')],
              ['MENTOR_IMPACT', t('savRcPos4'), t('savRcPos4Note')],
              ['COMMUNITY_BUILDER', t('savRcPos5'), t('savRcPos5Note')],
              ['HEALING_CONTRIBUTION', t('savRcPos6'), t('savRcPos6Note')],
              ['GOVERNANCE_ACTIVE', t('savRcPos7'), t('savRcPos7Note')],
              ['ONCHAIN_VERIFIED', t('savRcPos8'), 'Staking, mint NFT…'],
              ['FIRST_CONTRIBUTION', t('savRcPos9'), t('savRcPos9Note')],
              ['CROSS_PLATFORM', t('savRcPos10'), t('savRcPos10Note')],
            ]}
          />
        </DocSubSection>

        <DocSubSection title={t('savReasonAdjTitle')}>
          <DocTable
            headers={['Code', t('savColMicrocopy'), t('savColInternalNote')]}
            rows={[
              ['INTEGRITY_ADJUSTMENT', t('savRcAdj1'), t('savRcAdj1Note')],
              ['COOLDOWN_ACTIVE', t('savRcAdj2'), t('savRcAdj2Note')],
              ['REVIEW_PENDING', t('savRcAdj3'), t('savRcAdj3Note')],
              ['ENERGY_BALANCE', t('savRcAdj4'), 'Time decay applied'],
              ['GROWTH_OPPORTUNITY', t('savRcAdj5'), t('savRcAdj5Note')],
              ['DIVERSITY_NEEDED', t('savRcAdj6'), t('savRcAdj6Note')],
              ['VERIFICATION_NEEDED', t('savRcAdj7'), t('savRcAdj7Note')],
              ['PATTERN_LEARNING', t('savRcAdj8'), t('savRcAdj8Note')],
            ]}
          />
        </DocSubSection>

        <DocSubSection title={t('savMicroTitle')}>
          <DocList ordered items={[
            t('savMicro1'),
            t('savMicro2'),
            t('savMicro3'),
            t('savMicro4'),
            t('savMicro5'),
            t('savMicro6'),
            t('savMicro7'),
          ]} />
        </DocSubSection>

        <DocSubSection title={t('savCompareTitle')}>
          <DocTable
            headers={[t('savColOldWay'), t('savColNewWay')]}
            rows={[
              [t('savCmpOld1'), t('savRcAdj1')],
              [t('savCmpOld2'), t('savRcAdj5')],
              [t('savCmpOld3'), t('savCmpNew3')],
              [t('savCmpOld4'), t('savCmpNew4')],
              [t('savCmpOld5'), t('savRcAdj4')],
            ]}
          />
        </DocSubSection>
      </DocSection>

      {/* ====== LEVEL SYSTEM ====== */}
      <DocSection id="level-system" title={t('savLevelSectionTitle')}>
        <DocParagraph>{t('savLevelPara')}</DocParagraph>

        <DocSubSection title="Light Level Mapping">
          <DocTable
            headers={['Light Score Range', 'Level Name', t('pdocColMeaning')]}
            rows={[
              ['0 – 20', '🌱 Light Seed', t('savLvl1')],
              ['21 – 40', '🌿 Light Sprout', t('savLvl2')],
              ['41 – 60', '🏗 Light Builder', t('savLvl3')],
              ['61 – 80', '🛡 Light Guardian', t('savLvl4')],
              ['81+', '🏛 Light Architect', t('savLvl5')],
            ]}
          />
        </DocSubSection>

        <DocSubSection title={t('savTrendTitle')}>
          <DocTable
            headers={['Trend', t('savColDisplay'), t('pdocColMeaning')]}
            rows={[
              ['Stable', '☀️ Stable', t('savTrend1')],
              ['Growing', '📈 Growing', t('savTrend2')],
              ['Reflecting', '🌙 Reflecting', t('savTrend3')],
              ['Rebalancing', '☯ Rebalancing', t('savTrend4')],
            ]}
          />
        </DocSubSection>

        <DocAlert type="warning">
          {t('savLevelAlert')}
        </DocAlert>
      </DocSection>

      {/* ====== MINT ENGINE CHI TIẾT ====== */}
      <DocSection id="mint-engine" title={t('savMintTitle')}>
        <DocParagraph>{t('savMintPara')}</DocParagraph>

        <DocSubSection title={t('savEpochTitle')}>
          <pre className="bg-muted rounded-lg p-4 text-xs sm:text-sm overflow-x-auto my-4 text-foreground font-mono leading-relaxed">
{`1. Freeze Score Snapshot
        ↓
2. Remove Flagged Allocations
        ↓
3. Calculate Proportional Share
        ↓
4. Apply Anti-Whale Cap (max 3% / user)
        ↓
5. Finalize Mint Pool
        ↓
6. Execute On-chain Batch Mint
        ↓
7. Publish Transparency Summary`}
          </pre>
          <DocList ordered items={[
            t('savEpoch1'),
            t('savEpoch2'),
            t('savEpoch3'),
            t('savEpoch4'),
            t('savEpoch5'),
            t('savEpoch6'),
            t('savEpoch7'),
          ]} />
        </DocSubSection>

        <DocSubSection title="Anti-Whale Protection">
          <div className="bg-muted rounded-lg p-4 my-4 border-l-4 border-primary">
            <p className="font-mono text-sm sm:text-base text-foreground font-semibold">
              max_share_per_user = 3% of epoch_pool
            </p>
          </div>
          <DocParagraph>{t('savWhalePara')}</DocParagraph>
        </DocSubSection>

        <DocSubSection title="Slow Mint Curve">
          <DocList items={[
            t('savSlow1'),
            t('savSlow2'),
            t('savSlow3'),
          ]} />
        </DocSubSection>
      </DocSection>

      {/* ====== TRANSPARENCY DASHBOARD ====== */}
      <DocSection id="transparency-dashboard" title={t('savTransSectionTitle')}>
        <DocParagraph>{t('savTransPara')}</DocParagraph>

        <DocSubSection title={t('savPublicTitle')}>
          <DocList items={[
            t('savPub1'),
            t('savPub2'),
            t('savPub3'),
            t('savPub4'),
            t('savPub5'),
            t('savPub6'),
          ]} />
        </DocSubSection>

        <DocSubSection title={t('savHiddenTitle')}>
          <DocAlert type="warning">
          {t('savHiddenAlert')}
          </DocAlert>
        </DocSubSection>
      </DocSection>

      {/* ====== BẢO VỆ DÀI HẠN ====== */}
      <DocSection id="long-term-protection" title={t('savLongTitle')}>
        <DocParagraph>{t('savLongPara')}</DocParagraph>

        <DocSubSection title="1️⃣ Model Drift Monitor">
          <DocParagraph>{t('savDriftPara')}</DocParagraph>
          <DocList items={[
            t('savDrift1'),
            t('savDrift2'),
            t('savDrift3'),
          ]} />
        </DocSubSection>

        <DocSubSection title="2️⃣ Community Council Review">
          <DocList items={[
            t('savCouncil1'),
            t('savCouncil2'),
            t('savCouncil3'),
            t('savCouncil4'),
          ]} />
        </DocSubSection>

        <DocSubSection title="3️⃣ Slow Mint Curve Protection">
          <DocList items={[
            t('savSlowProt1'),
            t('savSlowProt2'),
            t('savSlowProt3'),
          ]} />
        </DocSubSection>

        <DocAlert type="success">
          {t('savFinalAlert')}
        </DocAlert>
      </DocSection>
    </>
  );
};

export default ScoringApiAndVersioningDocs;
