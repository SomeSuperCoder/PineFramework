## 1. Remove Start Bot Button from Header

- [x] 1.1 Remove the "Start Bot" button from the Idle/Stopped view header (lines 1840-1855)
- [x] 1.2 Verify the setup wizard's Review step Start button still works

## 2. Remove Pin Toggle Button

- [x] 2.1 Remove the pin toggle button from the Idle/Stopped view header (lines 1856-1865)
- [x] 2.2 Remove the pin toggle button from the Running view header (lines 1984-1993)
- [x] 2.3 Remove the `pinnedToBottom` state and `togglePin` function (dead code)
- [x] 2.4 Remove the `pinnedToBottom` logic from `rootStyle` calculation (simplify to always use full-screen style)

## 3. Verify

- [x] 3.1 Verify: Idle/Stopped view shows only state badge, wallet status, and close button
- [x] 3.2 Verify: Running view shows Stop, Emergency Stop, and close buttons
- [x] 3.3 Verify: Error view shows Reset and close buttons
- [x] 3.4 Run typecheck to ensure no errors
