# Phase 1 backend results

| id | status | failed / info checks |
|---|---|---|
| S2 | Pass |  |
| S3 | Pass |  |
| S4 | Pass |  |
| S5 | Pass |  |
| S6 | Pass |  |
| S7 | UI only |  |
| A1 | Pass |  |
| A2 | Pass |  |
| A3 | Pass |  |
| A3a | Pass |  |
| A4 | Pass |  |
| A5 | Pass |  |
| A6 | Pass |  |
| A6a | Pass |  |
| A6d | UI only |  |
| A6e | Pass |  |
| A6b | Pass |  |
| A6c | Pass |  |
| A7 | Pass |  |
| A8 | Pass |  |
| A9 | Pass |  |
| A10 | Pass |  |
| B1 | Pass |  |
| B2 | Pass |  |
| B3 | Pass |  |
| B4 | Pass |  |
| B5 | Pass |  |
| B6 | Pass |  |
| B7 | Pass |  |
| B8 | Pass |  |
| C1 | Pass | MATRIX: C1 expects 'The unit tag does not change' After the Moderate decision the untagged unit becomes Green (one tag-history row). Manual Table 3's Moderate row says nothing about tags (its 'closed and Green-Tagged' wording is only for a Critical reclassified to Moderate), but Manual 8.1 requires every item to show Green / Yellow / Red, and a Moderate-only unit is ready for service = Green. The Clarification (Table 3 summary agreed with K. Shahzad) gives the same picture: Minor 'Unit stays Green', Moderate 'Plan the repair and keep an eye on it until fixed' (no Red/Yellow), Critical lowered to Moderate 'the unit goes Green'. The app is consistent with the manual; the matrix should expect Green. |
| C2 | Pass |  |
| C3 | Pass |  |
| C4 | Pass |  |
| C5 | Pass |  |
| C6 | Pass |  |
| C7 | Pass |  |
| C8 | Pass |  |
| C9 | Pass |  |
| C10 | Pass |  |
| C10a | Pass |  |
| C11 | Pass |  |
| C12 | Pass |  |
| C13 | Pass |  |
| C14 | Pass |  |
| D1 | Pass |  |
| D2 | Pass |  |
| D3 | Pass |  |
| D3a | Pass |  |
| D4 | Pass |  |
| D5 | Pass |  |
| D6 | Pass |  |
| D7 | Pass |  |
| D8 | Pass |  |
| D9 | Pass |  |
| D10 | Pass | MATRIX: D10 expects Red, Yellow, Red, Yellow, Green the history starts with the Green status set by the C1 Moderate decision (Manual 8.1: a serviceable unit is Green / Ready for Service), so the matrix list is missing that first Green entry. |
| D11 | Pass |  |
| D12 | Pass |  |
| D13 | Pass | MATRIX: D13 step 2 says press Close & Approve Report 3 carries the Brass Bushing Fail (Moderate), as D5/D6 require. Manual Table 3, Moderate row: 'Review Authority: Operations Coordinator / Maintenance Supervisor'; Clarification (K. Shahzad, tier table): reports with moderate/major/critical faults cannot be closed independently and Tier 2 'review Moderate faults and confirm their classification', so the report must be endorsed, reviewed and then closed. The run did that: endorse to Disantha, Approve Brass Bushing, Close. |
| E1 | Pass |  |
| E2 | Pass |  |
| E3 | Pass |  |
| E4 | Pass |  |
| E5 | Pass |  |
| E6 | Pass |  |
| E7 | Pass |  |
| E8 | Pass |  |
| E9 | Pass |  |
| E10 | Pass |  |
| E11 | Pass | MATRIX: IT delete SQL fails as written "DELETE FROM mri_reports WHERE status='Draft' AND asset_id=(SELECT id FROM assets WHERE asset_code='ASSET2')" -> FOREIGN KEY constraint failed. The Draft has child rows (header values, checklist results...) and the app enables foreign keys, so the matrix SQL cannot delete it. The run deleted the child rows first, then the Draft. |
| E12 | Pass |  |
| E13 | Pass |  |
| F1 | Pass |  |
| F2 | Pass |  |
| F3 | Pass |  |
| F4 | Pass |  |
| F5 | Pass |  |
| F6 | Pass |  |
| F7 | Pass |  |
| F8 | Pass |  |
| F9 | Pass |  |
| G1 | Pass |  |
| G2 | Pass |  |
| G3 | Pass |  |
| G4 | Pass |  |
| G5 | Pass |  |
| G6 | Pass |  |
| G7 | Pass |  |
| H1 | Pass |  |
| H2 | Pass |  |
| H3 | Pass |  |
| H4 | Pass |  |
| H5 | Pass |  |
| H6 | Pass |  |
| H7 | UI only |  |
| H8 | Pass |  |
| J1 | UI only |  |
| J2 | Pass |  |
| J3 | UI only |  |
| J4 | UI only |  |
| J6 | Pass |  |
| J7 | Pass |  |
| J8 | UI only |  |
| J9 | Pass |  |
