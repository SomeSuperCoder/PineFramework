## 1. Fix Balance Persistence

- [x] 1.1 Update WalletImportPanel to pass previewBalance via onWalletChange
- [x] 1.2 Update SetupWizard to receive and store usdcBalance from wallet info
- [x] 1.3 Remove redundant useEffect fetch in SetupWizard

## 2. Add Manual Override

- [x] 2.1 Add manualOverride state toggle in BotConfigPanel
- [x] 2.2 Show input field when override enabled, calculated value when disabled
- [x] 2.3 Use override value when enabled, calculated value when disabled

## 3. Verify

- [x] 3.1 Test: Balance persists from import to config step
- [x] 3.2 Test: Manual override toggle works
