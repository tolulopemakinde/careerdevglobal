# Local reconstruction and recovery runbook

Run from the #36 continuation repository root, with Python 3 and Docker. Never link this fixture to a hosted project. The scripts accept no production connection URL. The pinned image must already exist (CI explicitly pulls it). The database uses tmpfs: stopping/removing its container destroys the fixture.

```sh
python -m unittest discover -s tests/database -v
python scripts/database/render-baseline.py supabase/baseline/current-state-2026-11-16.json /tmp/current-state.sql
cmp /tmp/current-state.sql supabase/baseline/current-state-2026-11-16.sql
bash scripts/database/start-local.sh
bash scripts/database/rehearse-local.sh > /tmp/baseline.log
python scripts/database/extract-snapshot.py /tmp/baseline.log /tmp/local-schema.json
python scripts/database/compare-baseline.py supabase/baseline/current-state-2026-11-16.json /tmp/local-schema.json /tmp/reconstruction-result.json
docker exec -i careerdev-phase1-db psql -Xq -U postgres -d careerdev_acceptance -v ON_ERROR_STOP=1 < tests/database/synthetic-seed.sql
python tests/database/acceptance.py --stage baseline
bash scripts/database/apply-local-candidates.sh
python tests/database/acceptance.py --stage candidate
bash scripts/database/restore-local.sh
python tests/database/acceptance.py --stage restored --database careerdev_restore
```

The acceptance commands currently exit nonzero: baseline 8 failures, candidate/restored 1 known coach-edit failure. Preserve those failures as evidence. Do not suppress them in release automation. The semantic catalog comparison is separate from acceptance.

To exercise the existing #48 booking correction without duplicating it, obtain its reviewed `docs/scheduling/rehearsal/booking-request.sql`, verify the expected commit, and pass that file explicitly:

```sh
python tests/database/booking-compatibility.py /path/to/reviewed/pr48/docs/scheduling/rehearsal/booking-request.sql
```

Run once against the restored baseline before applying that candidate: a second run cannot reproduce the original failure. All booking attempts roll back; the local function definition change remains in the disposable restore database.

The local backup `/tmp/careerdev-fixture-backup.sql` contains only reconstructed schema and synthetic records. `restore-local.sh` refuses an existing restore database rather than deleting it. Check `restore-result.json` and then rerun role tests. A backup file without a successful restore comparison is not recovery proof.

For a clean rerun, inspect the container label `careerdev.acceptance=phase1-disposable` and network `none`, then remove **only that named fixture** and restart the sequence. Never substitute a shared or hosted database. Local rollback means discard/rebuild this fixture or restore its synthetic backup; it does not define a production down migration.

Production recovery remains a separate approved procedure: obtain a native schema-only export and suitable backup/PITR capability, test a new change in real managed Supabase, record pre-change fingerprints and reversible application behavior, then approve a concrete forward/rollback plan. No historical rollback bodies were present in the recovered ledger. Do not invent them or replay all recovered SQL into production.
