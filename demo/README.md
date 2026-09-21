# Evidentia demonstration dataset

A fictional Belgian bank, **Northwind Bank SA**, with six sources of different authority levels, one of which is a deliberately poisoned sponsored blog post (it is quarantined at ingestion and never reaches retrieval or drafting).

No real organisations, people or figures are represented. Domains use the reserved `.example` TLD.

## Run the full flow offline (no API keys)

```bash
evidentia init --db ./.evidentia/demo.db --tenant demo
evidentia demo load --db ./.evidentia/demo.db --tenant demo
evidentia status --db ./.evidentia/demo.db --tenant demo
evidentia search "how long are support recordings kept" --db ./.evidentia/demo.db --tenant demo
evidentia draft generate --title "How Northwind reconciles corporate payments" --slug reconciliation-explained \
  --query "payment reconciliation controls and escalation" --brand "Northwind Bank" --db ./.evidentia/demo.db --tenant demo
evidentia draft gate <draftId> --db ./.evidentia/demo.db --tenant demo            # → awaiting_approval (AI-assisted)
evidentia draft approve <draftId> --actor editor@northwind.example --db ./.evidentia/demo.db --tenant demo
evidentia draft publish <draftId> --target static:./out --editor "Anna Peeters" --role "Head of Communications" --db ./.evidentia/demo.db --tenant demo
evidentia observe run <querySetId> --models demo/demo-eu --samples 8 --db ./.evidentia/demo.db --tenant demo
evidentia observe report <querySetId> --db ./.evidentia/demo.db --tenant demo
evidentia audit verify --db ./.evidentia/demo.db --tenant demo
```

The `demo/demo-eu` model is an in-process provider that drafts by copying evidence sentences (grounded by construction) and answers observatory prompts pseudo-randomly but deterministically. Replace it with a registered, approved provider for real use.
