# Catalogue link checks

Checked 2026-11-11 with HTTPS GET requests. All existing catalogue destinations
returned HTTP 200; this verifies availability, not each external tool's behavior.
The initial collection uses these curated records and does not import old projects.

| Entry                 | Main destination                                   | Result |
| --------------------- | -------------------------------------------------- | ------ |
| Mining Game           | https://bitpolito-mining-game.vercel.app           | 200    |
| Silent Payments       | https://silent-payments.vercel.app                 | 200    |
| BitPolito Academy     | https://github.com/BitPolito/bitcoin-academy       | 200    |
| SeedSigner            | https://github.com/BitPolito/seedsigner            | 200    |
| Bitcoin Data Analysis | https://github.com/BitPolito/bitcoin-data-analysis | 200    |
| Schnorr Signatures    | https://github.com/BitPolito/schnorr-sig           | 200    |
| Bitcoin Testing Tools | https://github.com/BitPolito/bitcoin-testing-tools | 200    |

The MiningGame and silent-payments GitHub repository links were also checked
and returned 200. Recheck external destinations periodically; administrators can
edit/archive collection entries independently of the seed catalogue.
