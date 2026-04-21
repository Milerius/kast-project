Feature: Partial repayment (bonus #2)

  Scenario: Partial repay keeps the position in BORROWED
    Given the position is BORROWED
    When I repay 1 USDC
    Then the position is BORROWED

  Scenario: Final repay of remaining debt closes to DEPOSITED
    Given the position is BORROWED
    When I repay 1 USDC
    And I repay all debt
    Then the position is DEPOSITED
