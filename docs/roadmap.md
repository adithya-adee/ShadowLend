# ShadowLend V1 - 3-Week Roadmap

> **Target**: Solana Privacy Hackathon 2026 Submission  
> **Start Date**: January 13, 2026  
> **End Date**: February 2, 2026

---

## Week 1: Foundation (Jan 13-19)

### Day 1-2: Project Setup & Core Scaffolding

- [x] Initialize Anchor project structure
- [ ] Set up development environment (Solana CLI, Anchor, Arcium SDK)
- [ ] Create `Pool` PDA account structure
- [ ] Create `UserObligation` PDA account structure
- [ ] Create `ArciumConfig` PDA account structure
- [ ] Implement basic pool initialization instruction

### Day 3-4: Arcium Integration

- [ ] Integrate Arcium SDK into Anchor program
- [ ] Implement CPI calls to Arcium MXE
- [ ] Set up Ed25519 attestation verification
- [ ] Create encrypted state blob handling utilities
- [ ] Test attestation flow with mock data

### Day 5-7: Deposit Flow (End-to-End)

- [ ] Implement `deposit` instruction in Solana program
- [ ] Client-side encryption (AES-256-GCM)
- [ ] MXE computation for deposit (balance update)
- [ ] Attestation verification on-chain
- [ ] Token transfer from user to pool vault
- [ ] **Milestone**: ✅ Private deposit working E2E

---

## Week 2: Core Features (Jan 20-26)

### Day 1-3: Borrow Flow

- [ ] Implement `borrow` instruction
- [ ] Private health factor calculation in MXE
- [ ] Integrate Pyth oracle for price feeds
- [ ] Approve/deny decision based on HF
- [ ] Token transfer from pool to borrower
- [ ] **Milestone**: ✅ Private borrow with HF check

### Day 4-5: Interest Accrual

- [ ] Implement `update_interest` instruction
- [ ] Private interest calculation in MXE
- [ ] Automated keeper/cron setup concept
- [ ] Update pool aggregates
- [ ] **Milestone**: ✅ Interest accrual working

### Day 6-7: Liquidation Flow

- [ ] Implement `liquidate` instruction
- [ ] Private HF check for liquidation eligibility
- [ ] Calculate collateral seizure with bonus
- [ ] Atomic execution (repay + seize)
- [ ] Emit liquidation events
- [ ] **Milestone**: ✅ Liquidation flow complete

---

## Week 3: Demo & Polish (Jan 27 - Feb 2)

### Day 1-2: Frontend Foundation

- [ ] Set up Next.js project with TailwindCSS
- [ ] Integrate Solana wallet adapter
- [ ] Create landing page with protocol overview
- [ ] Implement wallet connection UI

### Day 3-4: Core UI Components

- [ ] Pool dashboard (TVL, utilization, rates)
- [ ] Deposit modal with amount input
- [ ] Borrow modal with collateral display
- [ ] User position card (encrypted indicator)
- [ ] Transaction history (from indexer)

### Day 5: Indexer Integration

- [ ] Set up Helius webhooks
- [ ] Parse protocol events
- [ ] Display transaction history in UI
- [ ] Pool statistics API

### Day 6: Testing & Bug Fixes

- [ ] End-to-end testing (deposit → borrow → liquidate)
- [ ] Edge case testing (0 balance, max borrow)
- [ ] Performance optimization
- [ ] Security review

### Day 7: Submission Prep

- [ ] Record demo video (3-5 min)
- [ ] Finalize documentation
- [ ] Deploy to devnet
- [ ] Submit to hackathon
- [ ] **Milestone**: 🚀 SHIPPED!

---

## Risk Mitigation

| Risk                        | Mitigation                                    |
| --------------------------- | --------------------------------------------- |
| Arcium SDK issues           | Start integration Day 3, buffer time Week 2  |
| Oracle integration delays   | Use mock prices initially, integrate Pyth later |
| Frontend time crunch        | Keep UI minimal, prioritize core flows        |
| Testing gaps                | Automated tests throughout, not just Week 3  |

---

## Success Criteria

1. **Privacy**: Individual balances/HF never visible on-chain ✅
2. **Functionality**: Deposit, Borrow, Liquidate all working ✅
3. **Demo**: Working UI that showcases privacy features ✅
4. **Documentation**: Clear architecture + flow diagrams ✅

---

## Team Allocation (If Applicable)

| Role              | Focus Area                           |
| ----------------- | ------------------------------------ |
| Smart Contract    | Anchor program + Arcium integration  |
| Frontend          | Next.js UI + wallet integration      |
| Integration       | Indexer + testing + DevOps           |

---

## Daily Standup Template

```
Yesterday: [What was completed]
Today: [What will be worked on]
Blockers: [Any issues]
```

---

**Let's build the future of private DeFi! 🔒💰**
