# FUN Ecosystem - Backend Pseudocode

## Purpose
This backend flow is the source of truth for:
- PPLP = Proof of Pure Love Protocol
- Light Score calculation
- validation rules
- anti-fake checks
- mint amount calculation

The smart contract should **not** compute Light Score. It should only enforce:
- authorized minting
- one-time action processing
- 99% user / 1% platform split

---

## 1. Constants

```pseudo
PPLP_DEFINITION = "Proof of Pure Love Protocol"
MINT_SPLIT_USER = 0.99
MINT_SPLIT_PLATFORM = 0.01
MAX_SCORED_ACTIONS_PER_DAY = 10
MAX_HIGH_IMPACT_ACTIONS_PER_DAY = 3
MIN_TRUTH_FOR_AUTO_APPROVAL = 3.0
BASE_MINT_RATE = 10.0
```

---

## 2. Action submission flow

```pseudo
function submitAction(userId, actionPayload):
    assert user exists
    assert actionPayload.actionType is allowed

    action = create user_action record
    action.status = "proof_pending"

    return action
```

```pseudo
function attachProof(actionId, proofPayload):
    action = get action by actionId
    assert action exists
    assert action.status in ["submitted", "proof_pending"]

    proof = create proof record

    if hasMinimumProof(actionId):
        action.status = "under_review"
        enqueue("validation.requested", actionId)
    else:
        action.status = "proof_pending"

    return proof
```

---

## 3. Validation pipeline

```pseudo
worker on validation.requested(actionId):
    action = loadAction(actionId)
    proofs = loadProofs(actionId)
    user = loadUser(action.userId)

    if not proofs or proofs.count == 0:
        reject(actionId, reason="No Proof -> No Score")
        return

    if isDuplicateProof(proofs):
        flagManualReview(actionId, reason="duplicate proof")
        return

    if exceedsVelocityLimits(user.id, action):
        flagManualReview(actionId, reason="velocity limit exceeded")
        return

    aiResult = runAIValidation(action, proofs)
    trustSignals = computeTrustSignals(user, action, proofs)
    communitySignals = fetchCommunitySignals(actionId)

    pplpScores = combineSignals(aiResult, trustSignals, communitySignals)

    if pplpScores.transparentTruth < MIN_TRUTH_FOR_AUTO_APPROVAL:
        flagManualReview(actionId, reason="low truth score")
        return

    if pplpScores.servingLife <= 0:
        reject(actionId, reason="Serving Life = 0")
        return

    if pplpScores.healingLove <= 0:
        reject(actionId, reason="Healing & Love = 0")
        return

    rawLightScore = computeRawLightScore(pplpScores)
    finalLightScore = applyMultipliers(rawLightScore, action, user, trustSignals)

    saveValidation(actionId, pplpScores, aiResult, trustSignals, communitySignals, finalLightScore)

    if finalLightScore <= 0:
        reject(actionId, reason="Final score <= 0")
        return

    action.status = "validated"
    enqueue("mint.requested", actionId)
```

---

## 4. PPLP score combination

```pseudo
function combineSignals(aiResult, trustSignals, communitySignals):
    weights = {
        ai: 0.60,
        community: 0.20,
        trust: 0.20
    }

    return {
        servingLife:
            aiResult.servingLife * weights.ai +
            communitySignals.servingLife * weights.community +
            trustSignals.servingLife * weights.trust,

        transparentTruth:
            aiResult.transparentTruth * weights.ai +
            communitySignals.transparentTruth * weights.community +
            trustSignals.transparentTruth * weights.trust,

        healingLove:
            aiResult.healingLove * weights.ai +
            communitySignals.healingLove * weights.community +
            trustSignals.healingLove * weights.trust,

        longTermValue:
            aiResult.longTermValue * weights.ai +
            communitySignals.longTermValue * weights.community +
            trustSignals.longTermValue * weights.trust,

        unityOverSeparation:
            aiResult.unityOverSeparation * weights.ai +
            communitySignals.unityOverSeparation * weights.community +
            trustSignals.unityOverSeparation * weights.trust
    }
```

---

## 5. Light Score formula

Light Score is unbounded upward as a lifetime cumulative number.
Each action score can be finite, but the user's accumulated total can grow without limit.

```pseudo
function computeRawLightScore(scores):
    S = clamp(scores.servingLife, 0, 10)
    T = clamp(scores.transparentTruth, 0, 10)
    L = clamp(scores.healingLove, 0, 10)
    V = clamp(scores.longTermValue, 0, 10)
    U = clamp(scores.unityOverSeparation, 0, 10)

    return (S * T * L * V * U) / 10000
```

```pseudo
function applyMultipliers(rawLightScore, action, user, trustSignals):
    impactWeight = getImpactWeight(action.actionType)
    trustMultiplier = getTrustMultiplier(user, trustSignals)
    consistencyMultiplier = getConsistencyMultiplier(user.id)

    return rawLightScore * impactWeight * trustMultiplier * consistencyMultiplier
```

```pseudo
function addToLifetimeLightScore(userId, finalLightScore):
    user.totalLightScore = user.totalLightScore + finalLightScore
    save user
```

---

## 6. Mint calculation

```pseudo
function calculateMintAmount(finalLightScore):
    return BASE_MINT_RATE * finalLightScore
```

```pseudo
function splitMint(totalMint):
    userMint = totalMint * MINT_SPLIT_USER
    platformMint = totalMint * MINT_SPLIT_PLATFORM
    return userMint, platformMint
```

---

## 7. Mint worker

```pseudo
worker on mint.requested(actionId):
    action = loadAction(actionId)
    validation = loadValidation(actionId)
    user = loadUser(action.userId)

    assert action.status == "validated"
    assert validation.finalLightScore > 0
    assert not mintRecordExists(actionId)

    totalMint = calculateMintAmount(validation.finalLightScore)
    userMint, platformMint = splitMint(totalMint)

    validationDigest = hash({
        actionId,
        userId: user.id,
        finalLightScore: validation.finalLightScore,
        totalMint,
        pplp: validation.pplpScores,
        definition: PPLP_DEFINITION
    })

    tx = contract.mintValidatedAction(
        actionIdHash(actionId),
        user.walletAddress,
        toTokenUnits(totalMint),
        validationDigest
    )

    saveMintRecord(
        actionId = actionId,
        userId = user.id,
        lightScore = validation.finalLightScore,
        mintAmountTotal = totalMint,
        mintAmountUser = userMint,
        mintAmountPlatform = platformMint,
        mintTxHash = tx.hash,
        status = "minted"
    )

    addLedgerEntry(user.id, "mint_user", userMint, actionId)
    addLedgerEntry(PLATFORM_USER_ID, "mint_platform", platformMint, actionId)
    addToLifetimeLightScore(user.id, validation.finalLightScore)

    action.status = "minted"
    save action
```

---

## 8. Zoom / Love House / Livestream flow

Important rule:
A livestream link proves the **event happened**.
It does **not** prove that every individual truly participated.

### Data model

```pseudo
Event
  -> Group (Love House)
      -> User participation records
```

### Step A: validate event

```pseudo
function validateMeditationEvent(event):
    assert event.zoomLink or event.meetingId exists
    assert event.livestreamLink exists
    assert event.host exists
    assert event.durationMinutes > 0

    return eventProofScore
```

### Step B: validate group

```pseudo
function validateLoveHouseGroup(group):
    require group.leaderConfirmation
    require group.participantEstimate > 0

    groupConfidence = 1.0
    if group.photoProof exists:
        groupConfidence += 0.1
    if group.videoProof exists:
        groupConfidence += 0.1

    return groupConfidence
```

### Step C: validate user participation

```pseudo
function validateUserParticipation(userId, eventId, groupId):
    signals = {
        appCheckIn: hasCheckIn(userId, eventId),
        appCheckOut: hasCheckOut(userId, eventId),
        hostConfirmed: hostConfirmed(userId, groupId),
        responseSubmitted: hasPostSessionReflection(userId, eventId),
        durationEstimate: getParticipationDuration(userId, eventId),
        optionalPresenceSignal: getOptionalPresenceSignal(userId, eventId)
    }

    participationFactor = 0

    if signals.appCheckIn: participationFactor += 0.25
    if signals.appCheckOut: participationFactor += 0.20
    if signals.hostConfirmed: participationFactor += 0.25
    if signals.responseSubmitted: participationFactor += 0.15
    if signals.durationEstimate >= 0.8: participationFactor += 0.10
    if signals.optionalPresenceSignal: participationFactor += 0.05

    return min(participationFactor, 1.0)
```

### Step D: user action score

```pseudo
function computeMeditationUserScore(eventScore, participationFactor, userTrustMultiplier):
    return eventScore * participationFactor * userTrustMultiplier
```

Notes:
- Face recognition should be optional and low-weight.
- Face scan must never be the only proof.
- One group livestream link must never auto-credit every user equally.

---

## 9. Anti-fake rules

```pseudo
function isDuplicateProof(proofs):
    return any proof hash or URL already used in conflicting actions
```

```pseudo
function exceedsVelocityLimits(userId, action):
    dailyCount = countScoredActionsToday(userId)
    highImpactCount = countHighImpactActionsToday(userId)

    if dailyCount >= MAX_SCORED_ACTIONS_PER_DAY:
        return true

    if isHighImpact(action) and highImpactCount >= MAX_HIGH_IMPACT_ACTIONS_PER_DAY:
        return true

    return false
```

```pseudo
function decayTrustForSpam(userId):
    user.trustLevel = max(1.0, user.trustLevel - 0.05)
```

```pseudo
function increaseTrustForVerifiedConsistency(userId):
    user.trustLevel = min(1.25, user.trustLevel + 0.01)
```

---

## 10. Manual review path

```pseudo
function flagManualReview(actionId, reason):
    action.status = "flagged"
    createReviewQueueItem(actionId, reason)
```

```pseudo
function reject(actionId, reason):
    action.status = "rejected"
    save rejection reason
```

---

## 11. Recommended production notes

- Backend should be event-driven.
- Use idempotency keys for mint requests.
- Every contract mint should map back to exactly one actionId.
- Store validationDigest for audit.
- Maintain an immutable rules table so the backend always references:
  - PPLP = Proof of Pure Love Protocol
  - 99% user / 1% platform
  - No Proof -> No Score
  - No Score -> No Mint

---

## 12. Final principle

```pseudo
This is not a social engagement reward engine.
This is a truth validation engine grounded in PPLP.
```
