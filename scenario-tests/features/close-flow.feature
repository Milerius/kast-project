Feature: Close the position by bridging back, repaying, and withdrawing

  Scenario: Full close
    Given the position is ACTIVE_ON_BASE
    When I bridge 5 USDC from Base to Solana with order hash "0xB"
    Then the position is BRIDGING_BACK
    When the bridge order "0xB" settles
    Then the position is BORROWED
    When I repay all debt
    Then the position is DEPOSITED
    When I withdraw all collateral
    Then the position is IDLE
