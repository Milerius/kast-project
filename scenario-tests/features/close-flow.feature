Feature: Close the position by bridging back, repaying, and withdrawing

  Scenario: Full close
    Given the position is ACTIVE_ON_BASE
    When I bridge 5 USDC from Base to Solana with order hash "0xB"
    Then the position should be BRIDGING_BACK
    When the bridge order "0xB" settles
    Then the position should be BORROWED
    When I repay all debt
    Then the position should be DEPOSITED
    When I withdraw all collateral
    Then the position should be IDLE
