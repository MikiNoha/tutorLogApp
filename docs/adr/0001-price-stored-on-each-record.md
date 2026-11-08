# Price is stored on each lesson and top-up, not only on the student

A student has a default hourly rate, but every lesson copies that rate when it is logged, and every credit top-up records the amount actually paid in Kč. We chose this over a single rate on the student because rates change over time and packages are sold at a discount — with only a student rate, raising it would silently rewrite past months' income, and a "10 h for 4 500 Kč" package would show as 5 000 Kč. The duplication is deliberate; don't "normalise" it away.

## Consequences

- Records created before this change have no stored price and are valued at the old flat rate of 500 Kč/h (`DEFAULT_HOURLY_RATE`). Don't change that constant — it describes history, not the default for new students.
- Changing a student's rate affects only lessons logged afterwards.
