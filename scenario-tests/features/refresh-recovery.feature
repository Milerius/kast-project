Feature: State re-derives correctly after a page refresh

  Scenario: Pending out-bridge order survives refresh
    Given an obligation with 0.12 SOL collateral and 5 USDC debt
    And a pending "out" bridge order in localStorage
    When I derive the position from chain and storage
    Then the derived state is BRIDGING_OUT

  Scenario: Settled position on Base re-derives to ACTIVE_ON_BASE
    Given an obligation with 0.12 SOL collateral and 5 USDC debt
    And 5 USDC held on the Base wallet
    And no pending bridge orders
    When I derive the position from chain and storage
    Then the derived state is ACTIVE_ON_BASE
