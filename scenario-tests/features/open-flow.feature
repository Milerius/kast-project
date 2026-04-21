Feature: Open a leveraged SOL→USDC→Base position
  As a Privy-authenticated user
  I want to deposit SOL, borrow USDC, and bridge it to Base
  So that I hold USDC on Base backed by Kamino collateral

  Scenario: Happy path from IDLE to ACTIVE_ON_BASE
    Given the position is IDLE
    When I deposit 0.12 SOL as collateral
    Then the position is DEPOSITED
    When I borrow 5 USDC
    Then the position is BORROWED
    When I bridge 5 USDC from Solana to Base with order hash "0xA"
    Then the position is BRIDGING_OUT
    When the bridge order "0xA" settles
    Then the position is ACTIVE_ON_BASE
